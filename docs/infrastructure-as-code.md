# Lamssa — Infrastructure as Code (IaC) Specification & Guide

**Status:** Official Platform Specification (Step 9.2 Deliverable)
**Date:** 2026-11-20
**Framework:** OpenTofu v1.8+ / Terraform v1.8+
**Target Environments:** Development, Staging, Production

---

## 1. Overview & Architectural Principles

Lamssa employs a modular, provider-aware Infrastructure as Code (IaC) architecture using OpenTofu. Every infrastructure asset—including Virtual Private Clouds (VPCs), subnets, Kubernetes clusters, PostgreSQL instances, S3 object storage buckets, Cloud KMS keys, and IAM roles—is defined declaratively in version control.

Key principles:
1. **Hermetic Environment Isolation**: Each environment (`development`, `staging`, `production`) has isolated state backends, independent cloud projects/accounts, and dedicated cryptographic master keys.
2. **Zero Hardcoded Secrets**: Secrets are never hardcoded in `.tf` or `.tfvars` files; credentials are managed dynamically via AWS Secrets Manager or HashiCorp Vault.
3. **In-Country Sovereign Residency**: Ingress, compute, database, and storage assets are pinned to certified in-country sovereign cloud regions (e.g. Google Cloud `me-central2` in Dammam, Saudi Arabia, or Oracle Cloud in Riyadh/Jeddah). Cross-border replication is disabled by default.
4. **Least-Privilege Workload Identity**: Application pods authenticate to cloud services using Kubernetes Service Account OIDC federation (IRSA), eliminating long-lived static API keys.

---

## 2. Directory & Module Structure

```text
infra/
├── README.md                   # Infrastructure documentation and usage guide
├── modules/
│   ├── networking/             # Multi-AZ VPC, public edge & private subnets, NAT, VPC Endpoints
│   ├── kubernetes/             # Managed K8s cluster, private node groups, OIDC provider
│   ├── postgres/               # Multi-AZ PostgreSQL 16 HA, parameter groups, storage encryption
│   ├── object-storage/         # Encrypted S3/GCS buckets, SSE-KMS, Object Lock WORM
│   ├── kms/                    # Customer-managed KEKs, automated rotation, deletion window
│   ├── secrets/                # Encrypted Secrets Manager containers
│   ├── monitoring/             # CloudWatch log groups, Prometheus SNS topics, metric alarms
│   └── iam/                    # IAM roles for service accounts (IRSA) with least-privilege policies
├── environments/
│   ├── development/            # Local Docker-native specification
│   ├── staging/                # Staging environment configuration (10.100.0.0/16 VPC)
│   └── production/             # Production environment configuration (10.200.0.0/16 VPC)
├── policies/                   # OPA / Conftest security rules
└── tests/                      # Automated IaC static validation scripts
```

---

## 3. Module Inventory & Specifications

### 3.1 Networking (`infra/modules/networking`)
- **VPC & Subnets**: Multi-AZ topology with public edge subnets (for ALB/Ingress), private application subnets (for compute), and isolated database subnets.
- **Strict Database Subnet Isolation**: Database subnets have **zero route to the Internet** (no NAT gateway route, no public IPs).
- **VPC Endpoints**: Direct private VPC endpoints for S3 and KMS to ensure cloud service API traffic never traverses public internet backbones.
- **Security Groups**:
  - `edge_alb`: Allows HTTPS 443 from Internet; forwards to application compute on ports 3000/8080.
  - `app_compute`: Accepts traffic only from `edge_alb`; allows egress to database subnets on 5432/6432 and HTTPS 443.
  - `database`: Accepts ingress exclusively from `app_compute` on 5432/6432; egress restricted to inter-node cluster replication.

### 3.2 Kubernetes (`infra/modules/kubernetes`)
- **Control Plane**: Private API server endpoint (`endpoint_private_access = true`). Public API endpoint disabled in production.
- **Node Groups**: Dedicated node groups deployed across private application subnets with encrypted EBS root volumes.
- **OIDC Federation**: Automatically creates and links an OIDC identity provider enabling Kubernetes Service Accounts to assume cloud IAM roles via STS.

### 3.3 PostgreSQL HA (`infra/modules/postgres`)
- **Engine**: PostgreSQL 16.3 on `gp3` storage with storage auto-scaling.
- **High Availability**: Multi-AZ synchronous standby replication enabled (`multi_az = true`).
- **Network Isolation**: `publicly_accessible = false` strictly enforced.
- **Storage Encryption**: Storage encrypted at rest using Customer Managed KMS Key (`storage_encrypted = true`).
- **Hardened Parameter Group**: Enforces `password_encryption = scram-sha-256`, `rds.force_ssl = 1`, and `statement_timeout = 30000`.

### 3.4 Object Storage (`infra/modules/object-storage`)
- **Private Buckets**: Strict public access prevention (`google_storage_bucket.public_access_prevention = "enforced"`).
- **Server-Side Encryption**: Default CMEK using Google Cloud KMS customer-managed key in `me-central2`.
- **Object Lock WORM**: Retention policies with Bucket Lock enabled in Compliance Mode for clinical documents and backups to guarantee non-erasable audit and backup integrity.
- **Stateless Runtime Integration**: Application layer consumes GCS via `GoogleCloudStorageAssetStore` and reverse-proxy streaming endpoint `/stream`. See [docs/cloud-clinical-asset-storage.md](file:///mnt/samsungSSD/Downloads/aesthetic-clinic/docs/cloud-clinical-asset-storage.md).

### 3.5 Cloud KMS (`infra/modules/kms`)
- **Key Hierarchy**: Dedicated Key Encryption Keys (KEKs) in Cloud HSM (FIPS 140-3 Level 3) for `database`, `clinical_media`, and `object_storage`.
- **Rotation**: Annual automated key rotation enabled (`rotation_period = "31536000s"`).
- **Deletion Window**: 30-day mandatory destruction schedule (`destroy_scheduled_duration = "2592000s"`) preventing immediate destruction.
- **Runtime Provider**: Integrated with NestJS via `GoogleCloudKmsProvider`. See [docs/production-kms-and-key-custody.md](file:///mnt/samsungSSD/Downloads/aesthetic-clinic/docs/production-kms-and-key-custody.md).

### 3.6 Secrets Management (`infra/modules/secrets`)
- Declarative secret containers in Google Cloud Secret Manager (`google_secret_manager_secret`) replicated in `me-central2`.
- Values are populated out-of-band or via secure CI pipelines; never committed in version control.
- **Runtime Provider**: Integrated with NestJS via `GoogleSecretManagerVaultProvider` with 300s in-memory TTL caching. See [docs/cloud-secret-management.md](file:///mnt/samsungSSD/Downloads/aesthetic-clinic/docs/cloud-secret-management.md).

### 3.7 IAM & Workload Identity (`infra/modules/iam`)
- **`lamssa-api-sa`**: Restricted to reading runtime secrets, putting/getting objects in the clinical assets bucket, and invoking KMS decrypt/encrypt on the media KEK via Google Service Account binding.
- **`lamssa-migration-sa`**: Restricted to reading migrator credentials for DDL execution.

### 3.8 Monitoring (`infra/modules/monitoring`)
- Encrypted CloudWatch log groups for application stdout and statutory audit logs (10-year retention).
- Metric alarms for 5xx error spikes with SNS topic routing.

---

## 4. Policy-as-Code & Automated Validation

Automated policy enforcement is executed via `scripts/check-infrastructure.mjs`:
- Rejects public PostgreSQL configurations.
- Rejects unencrypted persistent storage.
- Rejects non-sovereign cloud regions (e.g. rejects UAE or Qatar when Saudi sovereignty is mandated).
- Rejects privileged or root container definitions.
