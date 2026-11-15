# Lamssa: Production Runtime Security & Database Isolation Architecture

## 1. Overview & Security Mission

Lamssa is an Arabic-first multi-tenant outpatient clinic and medical SaaS management platform. Phase 7 Step 7.2 establishes comprehensive defense-in-depth across the production runtime stack:
1. **PostgreSQL Database Isolation:** Strict segregation between database maintenance roles (`lamssa_migrator`) and runtime application roles (`lamssa_runtime` / `lamssa_app`), locked-down schema creation, table truncation prohibitions, and `FORCE ROW LEVEL SECURITY`.
2. **Patient Authentication Bootstrap Hardening:** Cryptographically bound unauthenticated procedures (`SECURITY DEFINER`) in `lamssa_security` with procedural ownership validation, expiration enforcement, and anti-replay protections.
3. **Secret Vaulting & Masking:** Provider-neutral secret retrieval (`SecretVaultService`) with fail-closed semantics, irreversible SHA-256 fingerprint masking (`****:<hash>`), and deep log sanitization.
4. **Centralized Production Security Configuration Validation:** Strict fail-closed startup validation (`validateProductionSecurity`) preventing insecure production deployments.
5. **KMS & Envelope Encryption Operational Safety:** Fail-closed external KMS handling, anti-tampering authenticated data (AAD) binding, and cryptographic lifecycle enforcement.

---

## 2. PostgreSQL Role & Privilege Architecture

### 2.1 Role Hierarchy & Privilege Separation

The PostgreSQL database enforces three discrete role tiers:

| Tier | Role Name (Production / Staging) | `rolsuper` | `rolbypassrls` | `rolcreaterole` | `rolcreatedb` | Allowed Operations |
| :--- | :--- | :---: | :---: | :---: | :---: | :--- |
| **System Admin** | `postgres` | `true` | `true` | `true` | `true` | Initial container bootstrap and role creation only. |
| **Migrator / Owner** | `lamssa_migrator` | `false` | `false` | `false` | `false` | Schema ownership, DDL, Prisma migrations, routine vacuuming. |
| **Runtime Role** | `lamssa_app` / `lamssa_runtime` | `false` | `false` | `false` | `false` | Controlled DML (`SELECT`, `INSERT`, `UPDATE`, `DELETE`) subject to `FORCE RLS`. |

### 2.2 Strict Invariants for the Runtime Role
- **No Schema Creation:** `has_schema_privilege('lamssa_runtime', 'public', 'CREATE') = false` and `has_schema_privilege('lamssa_runtime', 'lamssa_security', 'CREATE') = false`. The runtime role cannot alter schemas, create tables, or inject functions.
- **No Table Truncation:** `TRUNCATE` is granted on **0 tables**. Any attempt by application code to issue `TRUNCATE` fails with SQL state `42501` (permission denied).
- **No Migration Tampering:** All grants on `_prisma_migrations` are strictly denied to `lamssa_runtime`.
- **No Role Escalation:** `SET ROLE postgres` or `SET ROLE lamssa_migrator` immediately fails with `42501`.

---

## 3. Database Hardening: Migration 038

Additive migration `20261116000100_runtime_security_hardening` was deployed to resolve verified token lifecycle and RLS procedural boundaries:

### 3.1 Patient Verification Token & Session RLS Hardening
- **`PatientVerificationToken`:** Direct DML (`INSERT`, `UPDATE`, `DELETE`) is guarded by RLS policies strictly requiring `lamssa_security.context_uuid('lamssa.session_id') IS NOT NULL`. Unauthenticated creation is impossible through direct table writes.
- **`PatientSession`:** Direct `INSERT` is restricted to active authenticated sessions. Minting new patient sessions is restricted exclusively to authenticated bootstrap `SECURITY DEFINER` routines.

### 3.2 `SECURITY DEFINER` Procedure Hardening
All 36 procedures under `lamssa_security` enforce:
- Procedure ownership by the migration/owner role (`lamssa_migrator`).
- Fixed, locked search path: `SET search_path = pg_catalog, pg_temp`.
- Public execution revoked (`REVOKE ALL ON FUNCTION ... FROM PUBLIC`).
- Specific anti-tamper procedural validations:
  - `portal_activation_lookup`: Filters `usedAt IS NULL AND expiresAt > statement_timestamp()`, ensuring no patient PII is returned for expired or consumed tokens.
  - `portal_complete_activation`: Enforces `usedAt IS NULL`, `expiresAt > clock_timestamp()`, `tokenType = 'ACTIVATION'`, account status `PENDING_ACTIVATION`, and atomic patient ID ownership.
  - `portal_complete_password_reset`: Enforces `usedAt IS NULL`, `expiresAt > clock_timestamp()`, `tokenType = 'PASSWORD_RESET'`, account status `ACTIVE`, and atomic patient ID ownership.
  - `portal_record_login_success`: Requires `status = 'ACTIVE'` and `lockedUntil IS NULL OR lockedUntil <= clock_timestamp()`.
  - `portal_logout`: Validates session ownership matching both the target clinic and target account, ensuring an attacker cannot invalidate third-party sessions.

---

## 4. Secret Vault Architecture (`SecretVaultService`)

The platform implements a decoupled, provider-neutral secret management service (`apps/api/src/config/secret-vault.service.ts`):

```typescript
export interface SecretVaultProvider {
  name: string;
  getSecret(key: string): string | undefined;
}
```

### 4.1 Key Capabilities
1. **Fail-Closed Retrieval:** Calling `getSecret(key)` throws `SecretVaultError` if the secret is undefined or whitespace-only. It never silently returns an empty string or falls back to an insecure default.
2. **Irreversible Masking:** `SecretVaultService.maskSecret(val)` produces deterministic, non-reversible SHA-256 fingerprints formatted as `****:<hash>` (e.g. `****:1bb09f48`).
3. **Deep Log & Payload Sanitization:** `SecretVaultService.sanitizeForLog(data)` recursively traverses objects and arrays, identifying sensitive keys (`secret`, `password`, `key`, `token`, `credential`, `auth`, `cookie`) and replacing string values with masked representations while redacting complex structures.
4. **Zero Secret Leakage via Health Probes:** Security health endpoints (`/api/v1/clinics/:id/security/health` and `/api/v1/admin/security/health`) return only operational state, provider names, active key identifiers, and migration metrics. No key material or plaintext tokens are exposed.

---

## 5. Centralized Production Security Configuration Validator

The startup configuration validator (`apps/api/src/config/production-security-validator.ts`) executes at API bootstrap before listening on network ports. In `NODE_ENV === 'production'`, it enforces the following non-negotiable invariants:

| Category | Policy Rule | Violation Thrown |
| :--- | :--- | :--- |
| **Database Encryption** | Mandatory TLS encryption on non-loopback endpoints (`sslmode=require`, `verify-full`, `verify-ca`) | `DATABASE_URL_REQUIRES_TLS_ENCRYPTION` |
| **KMS Provider** | `synthetic` provider is completely forbidden in production | `SYNTHETIC_KMS_FORBIDDEN_IN_PRODUCTION` |
| **External KMS** | Requires valid `https://` endpoint and non-empty key ID | `KMS_EXTERNAL_ENDPOINT_MUST_BE_HTTPS`, `KMS_EXTERNAL_KEY_ID_REQUIRED` |
| **Local KMS** | Minimum 32-character master key; rejects template values containing `dev-`, `test-`, or `fallback` | `KMS_LOCAL_MASTER_KEY_REQUIRES_MIN_32_CHARS_IN_PRODUCTION`, `KMS_LOCAL_MASTER_KEY_USES_INSECURE_TEMPLATE` |
| **Reverse Proxy** | `TRUST_PROXY_HOPS` must be exactly 1 behind reverse proxy (Caddy/Nginx) | `TRUST_PROXY_HOPS_MUST_BE_EXACTLY_ONE_BEHIND_REVERSE_PROXY` |
| **Host Headers** | Wildcards (`*`) and empty host header lists are strictly forbidden | `API_ALLOWED_HOSTS_WILDCARD_OR_EMPTY_FORBIDDEN` |
| **CORS Policy** | All CORS origins must use `https://` protocol | `CORS_ORIGIN_MUST_BE_HTTPS_<origin>` |
| **Session Bounds** | `AUTH_SESSION_HOURS <= 12` and `AUTH_IDLE_MINUTES <= 60` for outpatient clinical safety | `AUTH_SESSION_HOURS_EXCEEDS_12_HOUR_MAXIMUM`, `AUTH_IDLE_MINUTES_EXCEEDS_60_MINUTE_MAXIMUM` |
| **Secret Strengths** | Minimum lengths: MFA >= 32, Clinical Media >= 32, Metrics >= 43, CSRF >= 43 | `<SECRET>_MIN_<N>_CHARS_REQUIRED` |
| **Asset Storage** | `ASSET_STORAGE_DIR` must be configured as an absolute path | `ASSET_STORAGE_DIR_MUST_BE_CONFIGURED_ABSOLUTE_PATH` |

If any violation occurs, API startup halts immediately with `ProductionSecurityValidationError` reporting variable names without echoing raw values.

---

## 6. Container & Runtime Hardening

The staging/production container infrastructure (`apps/api/Dockerfile`, `compose.staging.yaml`) enforces:
1. **Non-Root Execution:** All application and migration processes run under unprivileged system user `node` (UID/GID 1000).
2. **Read-Only Root Filesystem:** API containers run with `read_only: true` and temporary scratch storage restricted to in-memory `tmpfs: [/tmp]`.
3. **Static Asset Isolation:** Patient documents and clinical photos are mounted at dedicated persistent volume `/srv/lamssa/assets` with strict Unix permissions.
4. **Internal Network Segmentation:** PostgreSQL runs on an isolated internal network (`data`) without exposed host ports; only the reverse proxy (Caddy) communicates with the public internet.

---

## 7. External KMS Status & Cloud Verification Readiness

- **Current Implementation:** `ExternalKmsProvider` is implemented as a production-oriented, cloud-ready adapter with tested fail-closed behavior. When configured, it connects to standard cloud KMS REST endpoints (AWS KMS, GCP Cloud KMS, HashiCorp Vault) using HTTPS.
- **Fail-Closed Verification:** Unit and integration tests verify that if the external KMS endpoint is unreachable or misconfigured, all encryption/decryption operations immediately fail closed rather than falling back to unencrypted or synthetic defaults.
- **Operational Reality:** In local testing and development environments, live AWS ARNs or Google Cloud KMS instances are not active. Cloud key wrapping must be activated by supplying valid production KMS credentials in the staging/production environment.
