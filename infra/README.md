# Lamssa Enterprise Infrastructure as Code (OpenTofu / Terraform)

## 1. Overview
This directory contains the modular, provider-aware Infrastructure as Code (IaC) specifications for the Lamssa multi-tenant healthcare platform.

Target engine: **OpenTofu v1.8+** (or compatible Terraform v1.8+).

All infrastructure is defined declaratively to ensure hermetic environment isolation, zero hardcoded credentials, and least-privilege security.

## 2. Directory Structure

```text
infra/
├── README.md                   # Infrastructure documentation and usage guide
├── modules/
│   ├── networking/             # Multi-AZ VPC, private/public subnets, NAT, VPC Endpoints
│   ├── kubernetes/             # Managed K8s cluster (GKE / EKS), node groups, OIDC
│   ├── postgres/               # PostgreSQL 16 HA primary/standby, PgBouncer pooler, SSL
│   ├── object-storage/         # S3/GCS private buckets, SSE-KMS, Object Lock WORM
│   ├── kms/                    # Cloud KMS / HSM customer-managed KEKs, rotation, IAM
│   ├── secrets/                # Secret management (Secrets Manager / Vault)
│   ├── monitoring/             # Telemetry pipelines, log sinks, alert notification topics
│   └── iam/                    # Workload Identity, IAM roles for service accounts (IRSA)
├── environments/
│   ├── development/            # Local/dev environment configuration
│   ├── staging/                # Isolated staging environment configuration
│   └── production/             # Dedicated production environment configuration
├── policies/                   # OPA / Conftest policy-as-code rules
└── tests/                      # Automated infrastructure validation tests
```

## 3. Environment Isolation Model

| Environment | Purpose | Network | Data Residency | Master Key |
| :--- | :--- | :--- | :--- | :--- |
| **Development** | Local testing & CI | Docker bridge / localhost | Local disk only | Ephemeral / Mock KMS |
| **Staging** | Pre-production testing, DR drills | Isolated VPC in dedicated cloud project | In-Country Staging Region (e.g., `me-central2`) | Dedicated Staging Cloud KMS Key |
| **Production** | Live clinical operations | Multi-AZ isolated VPC in dedicated cloud account | Sovereign In-Country Region (e.g., `me-central2`) | FIPS 140-2 Level 3 HSM Key |

## 4. Operational Guardrails
- **No Direct Cloud Deployment from CI**: CI workflows perform static analysis, formatting, and security policy checks only. CI runners do not possess production cloud provisioning credentials.
- **Strict In-Country Data Residency**: Cross-border replication of patient health data is disabled by default. All production and staging storage buckets and database nodes reside in authorized in-country regions.
- **Fail-Closed Execution**: Database connections require SSL verification (`verify-full`), runtime roles are strictly non-owner, and all tenant tables enforce `FORCE ROW LEVEL SECURITY`.
