# Lamssa — Production Cloud Secret Management Architecture

**Document Version:** 1.0.0  
**Phase:** 9 (Enterprise Infrastructure & Production Readiness) — Step 9.3  
**Status:** Approved Architectural Specification  
**Classification:** Confidential — Cloud Security & Configuration Governance  

---

## 1. Executive Summary

Lamssa enforces a zero-secrets-in-source, zero-plaintext-in-storage policy. Application containers, database migration jobs, and CI/CD runners must never consume plaintext secrets committed to Git, baked into container images, or exposed via unencrypted environment files.

This specification documents the production secret management architecture integrating **Google Cloud Secret Manager (GSM)** in region `me-central2` (Dammam, Saudi Arabia) with the NestJS application runtime via Workload Identity federation.

---

## 2. Secrets Management Architecture & Ingress Flow

```
+--------------------------------------------------------------------------+
| Google Cloud Secret Manager (me-central2 / Dammam, KSA)                  |
| Encrypted with Google-managed or CMEK keys; Access controlled via IAM   |
| Secrets: DATABASE_URL, REDIS_URL, JWT_SECRET, MFA_ENCRYPTION_KEY, etc.  |
+--------------------------------------------------------------------------+
                                     |
                         Workload Identity Federation
                   (Kubernetes ServiceAccount: lamssa-api-sa)
                                     v
+--------------------------------------------------------------------------+
| GoogleSecretManagerVaultProvider (NestJS / apps/api)                     |
| In-Memory Cache (TTL: 300s) | Fail-Closed Error Taxonomy                 |
| Transport Inversion for Testing | Automatic Version Resolution           |
+--------------------------------------------------------------------------+
                                     |
                       Direct Dependency Injection
                                     v
+--------------------------------------------------------------------------+
| Application Services (DatabasePool, AuthModule, KmsModule, etc.)         |
| Consumes secrets only in volatile RAM; Zero disk or log persistence      |
+--------------------------------------------------------------------------+
```

---

## 3. GoogleSecretManagerVaultProvider Implementation

Located at `apps/api/src/config/google-secret-manager.provider.ts`, `GoogleSecretManagerVaultProvider` implements the core `SecretVault` contract:

```typescript
export interface SecretVault {
  getSecret(key: string): string | null;
  loadSecretAsync?(key: string): Promise<string | null>;
  healthCheck(): Promise<boolean>;
}
```

### 3.1 Key Features & Architecture
1. **Workload Identity Federation:** In Google Kubernetes Engine (GKE), pods authenticate to Cloud Secret Manager via Workload Identity. The `lamssa-api-sa` Kubernetes ServiceAccount is bound to the `lamssa-api-gcp-sa` Google Service Account possessing `roles/secretmanager.secretAccessor` strictly scoped to the cluster's secret namespace.
2. **In-Memory TTL Caching:** To avoid excessive API calls and latency spikes on hot paths, secrets fetched via `loadSecretAsync` are cached in memory with a configurable 300-second (5-minute) TTL (`cacheTtlMs: 300_000`).
3. **Fail-Closed Typed Errors:**
   - `SecretManagerError`: Base class for Secret Manager communication failures.
   - `SecretNotFoundError`: Thrown when a required secret name or version cannot be located.
   - `SecretAccessDeniedError`: Thrown when IAM permissions or VPC Service Controls deny access.
4. **Local Emulation & Test Transport:** The provider supports dependency injection of a custom transport or local simulation dictionary, permitting offline verification and fault injection without connecting live cloud credentials.

---

## 4. Secret Lifecycle & Rotation Runbook

### 4.1 Rotation Without Pod Restarts
When a secret is rotated in Cloud Secret Manager:
1. A new version of the secret is created in GSM (`version = N + 1`).
2. The application's in-memory cache expires after the TTL (max 300s).
3. The next call to `loadSecretAsync(key)` retrieves the latest active version (`versions/latest`).
4. Services consuming the secret refresh their internal client pools gracefully without requiring a rolling restart of the Kubernetes Deployment.

### 4.2 Emergency Revocation & Rotation
If a secret (e.g., `DATABASE_URL` or `JWT_SECRET`) is suspected of compromise:
1. **Immediate Revocation in GSM:** Disable the compromised secret version via Cloud Console or Terraform/Tofu.
2. **Deploy New Secret Version:** Add the new secret value as the latest version.
3. **Evict Cache / Rolling Restart:** Execute `kubectl rollout restart deployment/lamssa-api -n lamssa-production` to immediately purge volatile cache across all pods and force immediate reconnection.
4. **Audit Log Inspection:** Inspect Google Cloud Audit Logs for all `accessSecretVersion` calls matching the compromised version to assess impact.

---

## 5. Security & Isolation Controls

| Security Control | Implementation Mechanism | Purpose |
| :--- | :--- | :--- |
| **No Secrets in ConfigMaps** | ConfigMaps contain only non-sensitive topology strings (hosts, ports, CORS). | Prevents secret leakage via `kubectl describe configmap` or CI exports. |
| **No Static Service Account Keys** | Workload Identity OIDC tokens with short lifetimes (< 1 hour). | Eliminates long-lived JSON service account key leaks. |
| **Process Environment Sanitization** | Sensitive secrets are not logged, exposed in `/proc`, or printed during crashes. | Prevents leakage via container dumps, error reporting, or telemetry. |
| **CMEK Encryption at Rest** | Secrets stored in GSM can be encrypted with Cloud KMS KEK. | Provides hardware-backed cryptographic custody over secrets at rest. |
| **In-Kingdom Storage** | Secret Manager resource replication set to `me-central2` (Dammam). | Complies with Saudi PDPL data residency requirements. |
