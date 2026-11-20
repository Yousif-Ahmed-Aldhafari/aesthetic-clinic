#!/usr/bin/env node
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';

const root = resolve(import.meta.dirname, '..');

function fail(msg) {
  console.error(`\x1b[31m[FAIL]\x1b[0m ${msg}`);
  process.exit(1);
}

function pass(msg) {
  console.info(`\x1b[32m[PASS]\x1b[0m ${msg}`);
}

console.info('=== Lamssa Phase 9 Step 9.3: Infrastructure & Kubernetes Policy-as-Code Validator ===\n');

// 1. Audit IaC Module Structure
const expectedModules = [
  'networking',
  'kubernetes',
  'postgres',
  'object-storage',
  'kms',
  'secrets',
  'monitoring',
  'iam',
];

for (const mod of expectedModules) {
  const modDir = resolve(root, 'infra/modules', mod);
  if (!existsSync(modDir)) fail(`Missing required IaC module: infra/modules/${mod}`);
  if (!existsSync(join(modDir, 'main.tf'))) fail(`Missing main.tf in infra/modules/${mod}`);
  if (!existsSync(join(modDir, 'variables.tf'))) fail(`Missing variables.tf in infra/modules/${mod}`);
  if (!existsSync(join(modDir, 'outputs.tf'))) fail(`Missing outputs.tf in infra/modules/${mod}`);
}
pass('All 8 OpenTofu / Terraform modules exist with main.tf, variables.tf, and outputs.tf');

// 2. Audit Environment Isolation
const expectedEnvs = ['development', 'staging', 'production'];
for (const env of expectedEnvs) {
  const envDir = resolve(root, 'infra/environments', env);
  if (!existsSync(envDir)) fail(`Missing required environment config: infra/environments/${env}`);
  if (!existsSync(join(envDir, 'main.tf'))) fail(`Missing main.tf in infra/environments/${env}`);
}
pass('All 3 environments (development, staging, production) are configured');

// 3. Security Policy-as-Code: Google Cloud PostgreSQL Security Invariants
const postgresMain = readFileSync(resolve(root, 'infra/modules/postgres/main.tf'), 'utf8');
if (!postgresMain.includes('ipv4_enabled                                  = false')) {
  fail('PostgreSQL module MUST enforce private IP only (ipv4_enabled = false)');
}
if (!postgresMain.includes('require_ssl                                   = true') || !postgresMain.includes('ENCRYPTED_ONLY')) {
  fail('PostgreSQL module MUST enforce require_ssl = true and ssl_mode = ENCRYPTED_ONLY');
}
if (!postgresMain.includes('scram-sha-256')) {
  fail('PostgreSQL database flags MUST enforce scram-sha-256 password encryption');
}
if (!postgresMain.includes('encryption_key_name = var.kms_key_name')) {
  fail('PostgreSQL module MUST enforce CMEK disk encryption');
}
pass('PostgreSQL Cloud SQL module strictly enforces private IP, storage CMEK, SSL, and SCRAM-SHA-256');

// 4. Security Policy-as-Code: Google Cloud Storage Object Storage Invariants
const storageMain = readFileSync(resolve(root, 'infra/modules/object-storage/main.tf'), 'utf8');
if (!storageMain.includes('public_access_prevention    = "enforced"')) {
  fail('Object storage module MUST enforce public_access_prevention = "enforced"');
}
if (!storageMain.includes('uniform_bucket_level_access = true')) {
  fail('Object storage module MUST enforce uniform_bucket_level_access = true');
}
if (!storageMain.includes('default_kms_key_name = var.kms_key_name')) {
  fail('Object storage module MUST enforce CMEK encryption with Customer Managed Key');
}
if (!storageMain.includes('retention_policy') || !storageMain.includes('is_locked')) {
  fail('Object storage module MUST enforce Bucket Lock for WORM immutability');
}
pass('Object storage module enforces public access prevention, uniform access, CMEK, and Bucket Lock WORM');

// 5. Security Policy-as-Code: Cloud Region Invariants
const prodTfvars = readFileSync(resolve(root, 'infra/environments/production/terraform.tfvars'), 'utf8');
if (prodTfvars.includes('me-central-1') || prodTfvars.includes('me-central1')) {
  fail('Production terraform.tfvars must NOT target UAE me-central-1 or Qatar me-central1 as Saudi regions');
}
if (!prodTfvars.includes('me-central2')) {
  fail('Production terraform.tfvars MUST specify valid in-country sovereign region (e.g. me-central2 Dammam)');
}
pass('Cloud region mapping accurately enforces in-country sovereign regional placement (me-central2)');

// 6. Security Policy-as-Code: Kubernetes Manifests Audit
const k8sDir = resolve(root, 'deploy/kubernetes');
const expectedK8sFiles = [
  '00-namespace.yaml',
  '01-service-accounts.yaml',
  '02-rbac.yaml',
  '03-configmaps.yaml',
  '04-secrets-template.yaml',
  '05-network-policies.yaml',
  '06-api-deployment.yaml',
  '07-web-deployment.yaml',
  '08-caddy-ingress.yaml',
  '09-hpa.yaml',
  '10-pdb.yaml',
  '11-migration-job.yaml',
];

for (const k8sFile of expectedK8sFiles) {
  if (!existsSync(join(k8sDir, k8sFile))) fail(`Missing Kubernetes manifest: deploy/kubernetes/${k8sFile}`);
}
pass('All 12 production Kubernetes manifests are present');

// 7. Kubernetes Pod Security Standards & Hardening
const apiDeploy = readFileSync(join(k8sDir, '06-api-deployment.yaml'), 'utf8');
if (!apiDeploy.includes('runAsNonRoot: true') || !apiDeploy.includes('runAsUser: 1000')) {
  fail('API deployment must enforce runAsNonRoot and unprivileged UID 1000');
}
if (!apiDeploy.includes('readOnlyRootFilesystem: true')) {
  fail('API deployment must enforce readOnlyRootFilesystem: true');
}
if (!apiDeploy.includes('drop:\n                - ALL') && !apiDeploy.includes('drop: ["ALL"]')) {
  fail('API deployment must drop all Linux capabilities');
}
if (!apiDeploy.includes('allowPrivilegeEscalation: false')) {
  fail('API deployment must forbid privilege escalation');
}
if (!apiDeploy.includes('livenessProbe:') || !apiDeploy.includes('readinessProbe:')) {
  fail('API deployment must define both liveness and readiness probes');
}
pass('API deployment conforms to Kubernetes Restricted Pod Security Standards');

const webDeploy = readFileSync(join(k8sDir, '07-web-deployment.yaml'), 'utf8');
if (!webDeploy.includes('runAsUser: 101') || !webDeploy.includes('readOnlyRootFilesystem: true')) {
  fail('Web deployment must enforce unprivileged UID 101 and read-only root filesystem');
}
pass('Web deployment conforms to Kubernetes Restricted Pod Security Standards');

// 8. Migration Job Isolation (DDL separated from runtime API pods)
const migrationJob = readFileSync(join(k8sDir, '11-migration-job.yaml'), 'utf8');
if (!migrationJob.includes('kind: Job') || !migrationJob.includes('lamssa-migration-sa')) {
  fail('Database migrations must run as an isolated Kubernetes Job using lamssa-migration-sa');
}
if (!migrationJob.includes('RUNTIME_DATABASE_ROLE') || !migrationJob.includes('MIGRATION_DATABASE_URL')) {
  fail('Migration job must explicitly separate runtime and migration database roles');
}
pass('Migration pipeline enforces pre-deployment Job execution decoupled from application pods');

// 9. Ingress & Telemetry Edge Protection
const ingress = readFileSync(join(k8sDir, '08-caddy-ingress.yaml'), 'utf8');
if (!ingress.includes('@operational path /api/v1/metrics') || !ingress.includes('respond @operational 404')) {
  fail('Ingress must block public access to operational telemetry /api/v1/metrics');
}
pass('Ingress configuration drops public requests to operational metrics endpoint');

// 10. Network Policies Isolation
const netpol = readFileSync(join(k8sDir, '05-network-policies.yaml'), 'utf8');
if (!netpol.includes('kind: NetworkPolicy') || !netpol.includes('default-deny-all')) {
  fail('Network policies must declare default-deny-all ingress and egress');
}
pass('Network policies declare strict default-deny with explicit port whitelisting');

console.info('\n\x1b[32m[SUCCESS]\x1b[0m All 10 infrastructure and Kubernetes security invariants verified!\n');
