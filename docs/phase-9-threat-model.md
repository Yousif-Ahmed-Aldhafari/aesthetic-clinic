# Lamssa — Phase 9: Enterprise Infrastructure Threat Model

**Status:** Draft Security Architecture Specification (Step 9.1 Threat Model)  
**Date:** 2026-11-20  
**Methodology:** STRIDE (Spoofing, Tampering, Repudiation, Information Disclosure, Denial of Service, Elevation of Privilege) & Defense-in-Depth  
**Scope:** Lamssa Multi-Tenant Healthcare Cloud Infrastructure, Database Tier, Compute, KMS, Network, and CI/CD

---

## 1. Executive Summary & Security Posture

Lamssa processes highly sensitive electronic medical records, clinical before-and-after photography, specialized clinical charts (dentistry odontograms, pediatric growth percentiles, obstetric ultrasound records), and financial transactions.

The threat modeling process identifies architectural attack surfaces, potential threat actors, vulnerability vectors, existing mitigations, and residual risks to establish a prioritized security remediation plan for enterprise production readiness.

---

## 2. Threat Actors & Capabilities

| Threat Actor | Motivation | Capabilities & Access Level |
| :--- | :--- | :--- |
| **External Cybercriminal / Ransomware Group** | Financial extortion, data resale | Advanced external scanning, credential stuffing, exploiting zero-day edge vulnerabilities. |
| **Malicious or Compromised Clinic Insider** | Financial fraud, unauthorized curiosity, identity theft | Valid practitioner or receptionist credentials; physical access to clinic terminals; intent to exfiltrate other tenants' data or modify billing. |
| **Rogue Platform Administrator / Cloud Operator** | Unauthorized surveillance, sabotage | Potential access to infrastructure, cloud console, container runtimes, or database backups. |
| **Nation-State / Advanced Persistent Threat (APT)** | Espionage, critical infrastructure disruption | Deep reconnaissance, supply chain poisoning, sophisticated persistence techniques. |
| **Third-Party Vendor / Dependency Compromise** | Widespread compromise via dependencies | Infiltration via compromised npm packages, malicious container base images, or poisoned CI actions. |

---

## 3. STRIDE Threat Analysis Across 14 Critical Vectors

### Vector 1: External Intrusion at Edge / Network Perimeter
- **STRIDE Category:** Elevation of Privilege, Information Disclosure, Denial of Service.
- **Threat Scenario:** Attacker probes public load balancer, exploits unpatched HTTP/2 or TLS vulnerabilities, bypasses WAF, or launches volumetric DDoS attacks to disrupt clinic operations.
- **Current Mitigations:**
  - TLS 1.3 termination with strict SNI enforcement.
  - Caddy / Nginx reverse proxy dropping non-allowlisted host headers.
  - Rate limiting on public edge (`AUTH_LOGIN_IP_LIMIT`).
- **Residual Risk:** Distributed L7 application-layer DDoS or zero-day proxy vulnerabilities.
- **Target Architecture Mitigation:** Cloud-native WAF (AWS WAF / Cloudflare Magic Transit) with managed OWASP rules, automated IP reputation filtering, and DDoS protection shields.

---

### Vector 2: Compromised Application Identity (Container Compromise)
- **STRIDE Category:** Elevation of Privilege, Tampering.
- **Threat Scenario:** Remote code execution (RCE) in a NestJS dependency allows attacker to execute shell commands within the API container.
- **Current Mitigations:**
  - Containers run as unprivileged `node` user (UID 1000).
  - Root filesystem mounted strictly `read-only`.
  - Temporary storage restricted to isolated memory `tmpfs`.
  - Dropped Linux capabilities (`drop: ["ALL"]`), `allowPrivilegeEscalation: false`.
- **Residual Risk:** Attacker with RCE in the container inherits the container's environment variables and database credentials.
- **Target Architecture Mitigation:** External Secrets Operator with in-memory injection; seccomp default profiles; network policies preventing pod-to-pod lateral movement; container runtime security monitoring (Falco).

---

### Vector 3: Tenant Isolation Bypass (Cross-Tenant Data Leakage)
- **STRIDE Category:** Information Disclosure, Elevation of Privilege.
- **Threat Scenario:** Clinic A practitioner manipulates URL parameters or GraphQL/REST IDs to query or modify Clinic B's medical encounters, patients, or invoices.
- **Current Mitigations:**
  - PostgreSQL Row Level Security (RLS) enabled on all 173 tenant-scoped tables with `FORCE ROW LEVEL SECURITY`.
  - Composite foreign keys `(clinicId, id)` enforced across relational schemas.
  - Application-level `TenantDatabaseService.withClinicContext` setting transactional GUC `lamssa_security.current_clinic_id`.
  - 486 database integration tests continuously verifying cross-tenant isolation and denial.
- **Residual Risk:** Flawed custom SQL queries bypassing Prisma or misconfigured database connections using an unconstrained database role.
- **Target Architecture Mitigation:** Runtime database role `lamssa_app` is strictly non-owner, `NOBYPASSRLS`, and denied all DDL. Automated boundary checks in CI verify that raw SQL strings never omit tenant scopes.

---

### Vector 4: Forged Database Session Context (GUC Manipulation)
- **STRIDE Category:** Elevation of Privilege, Spoofing.
- **Threat Scenario:** Attacker injects raw SQL commands (e.g., `SET LOCAL lamssa_security.current_clinic_id = 'victim-clinic-id'`) to spoof tenant identity within an active connection.
- **Current Mitigations:**
  - The security function `lamssa_security.context_allows` does not rely purely on GUCs; it cross-references the session token against `public."Session"` and `public."ClinicMembership"` tables in the database.
  - Runtime role `lamssa_app` lacks permissions to modify `Session` or `ClinicMembership` roles directly.
- **Residual Risk:** Complex transaction pooling edge cases if connection state is not reset between HTTP requests.
- **Target Architecture Mitigation:** PgBouncer configured in `transaction` pool mode with mandatory connection reset (`DISCARD ALL`) on release.

---

### Vector 5: Insider Threats (Privilege Escalation & Unauthorized Access)
- **STRIDE Category:** Elevation of Privilege, Repudiation, Information Disclosure.
- **Threat Scenario:** Receptionist attempts to read confidential gynecological exam notes; clinic owner attempts to alter signed medical notes; rogue doctor reads clinical notes of patients outside their assigned care team.
- **Current Mitigations:**
  - Fine-grained Role-Based Access Control (RBAC): `DOCTOR`, `RECEPTIONIST`, `ACCOUNTANT`, `CLINIC_ADMIN`, `CLINIC_OWNER`.
  - Doctor-only permission scopes (`clinical.notes.*`, `clinical.specialties.*`).
  - Clinic owners and platform admins have zero clinical record access.
  - Signed medical notes and treatment revisions are protected by PostgreSQL database triggers (`clinical_note_guard`, `treatment_revision_guard`) that reject updates at the engine level (SQLSTATE `42501`).
- **Residual Risk:** Stolen active doctor session tokens via physical workstation left unattended.
- **Target Architecture Mitigation:** Short idle session timeouts (30 minutes), mandatory hardware MFA, and IP-binding of staff sessions.

---

### Vector 6: KMS & Cryptographic Key Compromise
- **STRIDE Category:** Information Disclosure, Tampering.
- **Threat Scenario:** Compromise of master encryption keys allows an attacker to decrypt all historical clinical photography, documents, and tenant database fields.
- **Current Mitigations:**
  - Multi-tier envelope encryption: Root Key Encryption Keys (KEK) wrap ephemeral Data Encryption Keys (DEK).
  - In dev/test: Local KMS provider with AES-256-GCM.
- **Residual Risk:** In production, master keys stored in software or local configuration could be dumped from memory or environment variables.
- **Target Architecture Mitigation:** Hardware Security Modules (Cloud KMS / HSM) compliant with FIPS 140-2 Level 3. Master key material is non-exportable. Annual automated key rotation with retired key decryption-only policy.

---

### Vector 7: Bulk Data Exfiltration
- **STRIDE Category:** Information Disclosure.
- **Threat Scenario:** Attacker with compromised read credentials executes mass queries to dump the entire patient database or siphons all binary assets from object storage.
- **Current Mitigations:**
  - API pagination strictly enforced (maximum 100 records per page).
  - Bulk export endpoints require `PLATFORM_OPERATOR` role with dual-factor authorization and audit logging.
- **Residual Risk:** Slow, low-volume exfiltration over time via compromised practitioner credentials.
- **Target Architecture Mitigation:** Data Loss Prevention (DLP) monitoring, behavioral anomaly detection on API access patterns, and automated alerting on abnormal patient record retrieval volumes.

---

### Vector 8: Backup Theft & Offline Decryption
- **STRIDE Category:** Information Disclosure, Tampering.
- **Threat Scenario:** An attacker gains unauthorized access to off-site backup storage and attempts to restore the PostgreSQL dump or decrypt patient assets offline.
- **Current Mitigations:**
  - `backup-database.mjs` and `dr-backup.mjs` encrypt all database dumps and asset tarballs using AES-256-GCM prior to disk write.
  - Unified DR manifest signed with HMAC-SHA256.
- **Residual Risk:** Compromise of `BACKUP_ENCRYPTION_KEY` allows offline decryption of backup archives.
- **Target Architecture Mitigation:** Asymmetric envelope encryption for backups (public key encrypts backup in production; private key kept in offline, air-gapped vault). S3 Object Lock (WORM) preventing unauthorized deletion or tampering.

---

### Vector 9: Supply-Chain Compromise (Poisoned Dependencies)
- **STRIDE Category:** Elevation of Privilege, Tampering.
- **Threat Scenario:** An upstream npm package or container base image is compromised with a malicious backdoor or telemetry sniffer.
- **Current Mitigations:**
  - Exact version pinning in `package.json` and strict `package-lock.json`.
  - `npm ci` with `--ignore-scripts=false` and audit checks (`npm audit --omit=dev --audit-level=high`).
  - Base images pinned to specific digest/tag (`node:24.21.0-bookworm-slim`, `postgres:16.10-alpine`).
- **Residual Risk:** Compromised dependency in a patch release or transitive dependency.
- **Target Architecture Mitigation:** Automated Software Bill of Materials (SBOM) generation (Syft/CycloneDX), continuous vulnerability scanning (Trivy / Snyk), and dependency provenance verification (SLSA Level 3).

---

### Vector 10: CI/CD Pipeline & Credential Compromise
- **STRIDE Category:** Tampering, Elevation of Privilege.
- **Threat Scenario:** Attacker compromises GitHub Actions runner or steals long-lived cloud credentials to push malicious code directly into production.
- **Current Mitigations:**
  - GitHub Actions runs with read-only repository permissions (`permissions: contents: read`).
  - CI workflows have zero cloud deployment credentials or production secrets.
- **Residual Risk:** Malicious pull request merged without thorough review, injecting backdoors.
- **Target Architecture Mitigation:** OpenID Connect (OIDC) short-lived authentication for deployment pipelines (zero long-lived cloud keys in GitHub); mandatory branch protection with 2 senior approvals; signed Git commits.

---

### Vector 11: Sensitive Logging & Telemetry Leakage (PHI Exposure)
- **STRIDE Category:** Information Disclosure.
- **Threat Scenario:** Application exception handlers, database loggers, or reverse proxies inadvertently log patient names, national IDs, medical diagnoses, or auth tokens to centralized log servers.
- **Current Mitigations:**
  - `StructuredLoggerService` with recursive regex redaction for auth keys and tokens.
  - `redact.ts` sanitizing audit metadata and error reports.
  - IP addresses truncated (`127.0.0.0/24`).
- **Residual Risk:** Unhandled custom errors or third-party libraries logging un-redacted request bodies.
- **Target Architecture Mitigation:** Global NestJS exception filter stripping response bodies; automated log scanning for national ID and credit card patterns (AWS Macie / DLP) with real-time alerting.

---

### Vector 12: Ransomware & Destructive Data Corruption
- **STRIDE Category:** Tampering, Denial of Service.
- **Threat Scenario:** Attacker gains administrative access and drops PostgreSQL databases or encrypts storage volumes with ransomware.
- **Current Mitigations:**
  - Runtime database role lacks `DROP DATABASE`, `TRUNCATE`, or `DROP TABLE` permissions.
  - Point-in-time recovery (PITR) WAL archiving design.
- **Residual Risk:** Cloud account takeover destroying primary database and attached backup volumes simultaneously.
- **Target Architecture Mitigation:** Cross-account, cross-region immutable backup replication. Backup destination account has isolated IAM credentials that production administrators cannot modify or delete.

---

### Vector 13: Regional Cloud Outage & Availability Loss
- **STRIDE Category:** Denial of Service.
- **Threat Scenario:** A primary data center experiences a total power, network, or natural disaster outage.
- **Current Mitigations:**
  - Multi-AZ container deployment.
  - PostgreSQL synchronous replication across AZs.
- **Residual Risk:** Complete regional cloud failure (e.g., entire cloud region goes offline).
- **Target Architecture Mitigation:** Pilot-light disaster recovery site in a secondary geographic region (e.g., Primary in Riyadh, DR in Jeddah), with automated asynchronous WAL replication and off-site asset replication.

---

### Vector 14: Unauthorized Clinical Record Disclosure
- **STRIDE Category:** Information Disclosure, Repudiation.
- **Threat Scenario:** Compromised practitioner credentials used to browse high-profile patient medical records without a clinical care relationship.
- **Current Mitigations:**
  - Immutable audit logs recording every clinical note view, amendment, order creation, and photo access (`AuditRepository`).
  - Cryptographic hash chaining (`previousHash` -> `currentHash`) ensuring tamper detection.
- **Residual Risk:** Slow audit review where unauthorized access is detected only weeks later.
- **Target Architecture Mitigation:** Break-glass access alerts; VIP/high-profile patient access notification triggers; automated daily audit reconciliation jobs.

---

## 4. Prioritized Security Remediation Register

| Priority | Risk Category | Threat Vector | Remediation Control | Target Phase / Step |
| :---: | :--- | :--- | :--- | :---: |
| **P1** | Cryptography | Vector 6 (KMS Compromise) | Integrate Cloud HSM / Cloud KMS with FIPS 140-2 Level 3 backing; eliminate local master key fallback in production. | **Step 9.3** |
| **P1** | Data Resilience | Vector 12 (Ransomware) | Implement S3 Object Lock (WORM) and cross-account backup replication with immutable retention. | **Step 9.6** |
| **P1** | Identity & Access | Vector 2 (Container Compromise) | Transition secrets to AWS Secrets Manager / Vault with External Secrets Operator injection (zero disk persistence). | **Step 9.2 / 9.3** |
| **P2** | Network Security | Vector 1 (Edge Intrusion) | Deploy Cloud WAF with managed rule sets, automated rate limiting, and geo-restriction. | **Step 9.2** |
| **P2** | Observability | Vector 11 (PHI Leakage) | Deploy DLP log scanning and real-time alerting for anomalous patient record retrieval. | **Step 9.5** |
| **P2** | Access Control | Vector 14 (Unauthorized PHI) | Implement automated break-glass notification and VIP patient access monitoring. | **Step 9.5** |
| **P3** | CI/CD Security | Vector 10 (Pipeline Compromise) | Replace static CI credentials with GitHub Actions OIDC federation and signed container image provenance. | **Step 9.2** |
