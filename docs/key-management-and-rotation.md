# Key Management Architecture, Envelope Encryption & Rotation Runbook

## 1. Architectural Overview

Lamssa implements a Defense-in-Depth cryptographic key management architecture utilizing a two-tier Envelope Encryption hierarchy designed to protect sensitive healthcare data, integration credentials, and medical artifacts while preserving zero-downtime operations and multi-tenant isolation.

```
                           +------------------------------+
                           |     KMS Provider (KEK)       |
                           | (Local / Cloud KMS / Vault)  |
                           +--------------+---------------+
                                          |
                        Key Wrapping (AES-256-KW / AES-256-GCM)
                                          |
                                          v
+------------------+         +----------------------------+
|  Plaintext Data  | ------> |    Data Encryption Key     | (Ephemeral 256-bit DEK,
|  (PHI / Secrets) |         |      (AES-256-GCM + AAD)   |  zeroed out immediately)
+------------------+         +--------------+-------------+
                                            |
                                            v
                             +-----------------------------+
                             | Encrypted Envelope Payload  |
                             |   v2:<keyId>:<wrappedDek>   |
                             |   :<iv>:<tag>:<ciphertext>  |
                             +-----------------------------+
```

### 1.1 Key Hierarchy
1. **Key Encryption Key (KEK):**
   - 256-bit master key managed by the Key Management Service (KMS).
   - Never stored in the database in plaintext.
   - Versioned in PostgreSQL catalog table `KmsKeyRegistry` with metadata only (`keyId`, `version`, `state`, `algorithm`, `description`, `createdAt`, `rotatedAt`, `revokedAt`).
   - Primary active key identifier: `lamssa/kek/2026-v1`.
2. **Data Encryption Key (DEK):**
   - Random 256-bit cryptographic key (`crypto.randomBytes(32)`) generated per encryption operation.
   - Used to encrypt the sensitive payload with `AES-256-GCM`.
   - Wrapped with the active KEK and appended to the serialized envelope.
   - Immediately zeroed out in volatile memory (`dek.fill(0)`) after encryption or decryption.

### 1.2 Cryptographic Context & Additional Authenticated Data (AAD)
Every envelope encryption operation binds cryptographic context to the ciphertext using AES-256-GCM AAD:
$$\text{AAD} = \text{clinicId} : \text{resourceType} : \text{recordId}$$

If a ciphertext is injected into another tenant's record, another resource type, or modified by an attacker, authentication tag verification fails immediately, aborting the operation and preventing cross-tenant cipher reuse.

---

## 2. Key Lifecycle State Machine

The key management engine enforces strict state-based access controls on every KEK:

| State | Wrapping / Encryption Allowed? | Unwrapping / Decryption Allowed? | Description |
| :--- | :---: | :---: | :--- |
| **`ACTIVE`** | **YES** | **YES** | The primary operational key. Used for all new encryption operations and decrypting existing data. |
| **`RETIRED`** | **NO** | **YES** | Key has been rotated. Prohibited for new encryptions; allowed for decrypting previously encrypted historical records. |
| **`DISABLED`** | **NO** | **NO** | Temporarily locked out (e.g. pending investigation). All operations rejected with `ForbiddenException`. |
| **`REVOKED`** | **NO** | **NO** | Permanently compromised or decommissioned. All operations rejected with `ForbiddenException`. |

---

## 3. KMS Providers & Fail-Closed Guarantee

1. **`LocalKmsProvider` (`local`):**
   - Derives versioned KEK material using HKDF-SHA256 from `KMS_LOCAL_MASTER_KEY` (minimum 32 characters in production) with the key identifier as salt and info context.
   - Uses AES-256-GCM authenticated wrapping for DEKs.
   - Built-in self-testing health check probe.
2. **`ExternalKmsProvider` (`external`):**
   - Integrates with external key services (AWS KMS, GCP Cloud KMS, HashiCorp Vault Transit Engine).
   - **Fail-Closed Policy:** If `KMS_PROVIDER=external` is configured, the system **never** silently falls back to local or development keys. If the external KMS is unreachable, times out, or returns an error, operations fail closed with logged error diagnostics.
3. **`TestKmsProvider` (`synthetic`):**
   - Injects controlled latency, simulated wrap/unwrap errors, and emergency revocation drills for CI/CD and security resilience testing.

---

## 4. Key Rotation & Re-encryption Runbook

### 4.1 Zero-Downtime Rotation
To rotate the active KEK:
1. Call `KeyManagementService.rotateKey(newKeyId, description)`.
2. The current `ACTIVE` key transitions to `RETIRED` with `rotatedAt` timestamp recorded.
3. The new key is registered with version $v+1$ and marked `ACTIVE`.
4. Subsequent writes automatically use the new key; existing data encrypted under the retired key remains readable without downtime.

### 4.2 Background Re-encryption & Migration
1. Run `KeyRotationMigrationService.migrateRecord(...)` or batch migration jobs to re-encrypt records from retired or legacy keys to the active key.
2. Each re-encryption is logged in `KmsMigrationAudit` table with:
   - `clinicId`, `resourceType`, `recordId`
   - `sourceKeyId`, `targetKeyId`
   - `status: SUCCESS | FAILED`
   - `migratedAt`
3. Monitored via the Clinic Settings Security Health dashboard (`GET /api/v1/clinics/:clinicId/security/health`).

---

## 5. Backward Compatibility (Legacy v1 Support)

Legacy ciphertexts produced during earlier phases (`v1:<iv>:<tag>:<ciphertext>`) are detected automatically by `EnvelopeEncryptionService`:
- Validated via legacy fallback HKDF keys.
- Decrypted seamlessly during read operations.
- Re-encrypted into modern `v2` envelopes upon next record update or migration run.

---

## 6. Runtime Secret Vaulting & Production Validation (Phase 7, Step 7.2)

In Phase 7 Step 7.2, the cryptographic infrastructure was fortified with runtime secret vaulting and configuration enforcement:
1. **`SecretVaultService`:** Provider-neutral secret retrieval with fail-closed semantics, irreversible SHA-256 fingerprint masking (`****:<hash>`), and deep log sanitization.
2. **`validateProductionSecurity`:** Enforces mandatory database TLS, rejects `synthetic` KMS in production, requires HTTPS external endpoints with key IDs, and validates local master keys (minimum 32 characters, template-free).
3. **Database Migrations 038 & 039:** Locked RLS policies and procedures ensuring verification tokens and session minting cannot be forged or replayed. See `docs/production-runtime-security.md` for full implementation details.

---

## 7. Disaster Recovery & Operational Key Material Lifecycle (Phase 7, Step 7.3)

In Phase 7 Step 7.3, disaster recovery procedures incorporate KMS Key Registry metadata into the unified DR bundle:
1. **Metadata Export in DR Manifest:** `scripts/dr-backup.mjs` exports sanitized key metadata (`kms_registry_<target>_<timestamp>.meta.json`) recording registered KEK IDs, versions, states, and algorithms without exposing raw key material.
2. **Fail-Closed Lifecycle Recovery:** During disaster recovery:
   - Data encrypted under `ACTIVE` and `RETIRED` KEKs is successfully recovered and decrypted.
   - `DISABLED` and `REVOKED` keys fail closed, throwing security exceptions upon decryption attempts to prevent unauthorized access or restoration of compromised keys.
3. **Cross-Region DR Key Synchronization:** External KMS keys must have replica aliases provisioned in the secondary disaster recovery region (e.g. AWS KMS multi-region keys or HashiCorp Vault replication between Riyadh and Jeddah). See `docs/disaster-recovery-and-resilience.md`.
