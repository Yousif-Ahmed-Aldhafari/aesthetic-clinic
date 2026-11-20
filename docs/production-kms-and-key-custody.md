# Lamssa — Production Cryptographic Key Custody & Cloud KMS Integration Architecture

**Document Version:** 1.0.0  
**Phase:** 9 (Enterprise Infrastructure & Production Readiness) — Step 9.3  
**Status:** Approved Architectural Specification  
**Classification:** Confidential — Healthcare Infrastructure & Cryptography  

---

## 1. Executive Summary

Lamssa handles highly sensitive Electronic Health Records (EHR), clinical consultation notes, diagnostic orders, and intimate medical photographs across multi-tenant aesthetic and healthcare clinics in the Kingdom of Saudi Arabia (KSA). To comply with the Saudi Personal Data Protection Law (PDPL), National Cybersecurity Authority (NCA) Essential Cybersecurity Controls (ECC-1:2018), and Ministry of Health (MoH) health data protection mandates, all sensitive data must be encrypted under strict cryptographic custody.

This specification documents the production cryptographic architecture utilizing **Google Cloud Key Management Service (Cloud KMS)** anchored in Google Cloud's in-country Saudi Arabia region (`me-central2` in Dammam) using FIPS 140-2/3 Level 3 Hardware Security Modules (Cloud HSM).

---

## 2. Cryptographic Custody Hierarchy

Lamssa employs a 3-tier envelope encryption hierarchy:

```
+--------------------------------------------------------------------------+
| Tier 1: Cloud HSM Key Encryption Key (KEK)                               |
| Google Cloud KMS (me-central2, Cloud HSM, FIPS 140-3 Level 3)           |
| Resource: projects/lamssa-prod/locations/me-central2/keyRings/.../cryptoKeys/dek-wrapper |
+--------------------------------------------------------------------------+
                                     |
                          Envelope Wrap / Unwrap (AES-256-GCM / Cloud KMS API)
                                     v
+--------------------------------------------------------------------------+
| Tier 2: Tenant-Specific Data Encryption Keys (DEKs)                      |
| Ephemeral 256-bit AES symmetric keys generated in-memory (crypto.randomBytes(32))|
| Stored wrapped alongside ciphertext in PostgreSQL / GCS object metadata  |
+--------------------------------------------------------------------------+
                                     |
                          In-Memory AES-256-GCM Symmetric Encryption
                                     v
+--------------------------------------------------------------------------+
| Tier 3: Sensitive Clinical Assets & Field Ciphertext                     |
| Field-level encrypted EHR records, clinical attachments, photographic evidence|
+--------------------------------------------------------------------------+
```

### 2.1 Separation of Duties & Anti-Custody Guarantees
- **No Application Custody of Root Keys:** Root KEKs never leave the Cloud HSM boundary. Plaintext KEK material cannot be exported, viewed, or extracted by Lamssa application pods, database administrators, or cloud platform engineers.
- **Envelope Key Wrapping:** When encrypting a clinical payload, the application generates a cryptographically strong 256-bit DEK in volatile memory, encrypts the payload via `aes-256-gcm`, and requests Cloud KMS to wrap the DEK using the HSM-backed KEK. The wrapped DEK is stored alongside the ciphertext; the plaintext DEK is immediately zeroized from memory.
- **Audit Trails:** Every wrap and unwrap cryptographic operation is logged in Google Cloud Cloud Audit Logs with immutable request metadata (caller identity, pod IP, time, key version).

---

## 3. GoogleCloudKmsProvider Implementation

The NestJS backend integrates with Cloud KMS via `GoogleCloudKmsProvider` (`apps/api/src/kms/google-cloud-kms.provider.ts`), implementing the `KmsProvider` contract:

```typescript
export interface KmsKeyWrappingResult {
  wrappedKey: Buffer;
  keyVersion: string;
  algorithm: string;
}

export interface KmsProvider {
  wrapKey(plaintextKey: Buffer): Promise<KmsKeyWrappingResult>;
  unwrapKey(wrappedKey: Buffer, keyVersion?: string): Promise<Buffer>;
  healthCheck(): Promise<boolean>;
}
```

### 3.1 Error Taxonomy & Safe Failure Semantics
The provider introduces an explicit error taxonomy that prevents cryptographic ambiguity and guarantees fail-closed behavior:

| Error Class | Trigger Condition | Operational Response |
| :--- | :--- | :--- |
| `GoogleKmsError` | Base class for all Cloud KMS failures | Logged with correlation ID; request aborted. |
| `KmsKeyDisabledError` | Targeted CryptoKey or version is disabled (`DESTROY_SCHEDULED` / `DISABLED`) | Fails closed; halts decryption pipeline immediately; alerts on-call SRE. |
| `KmsKeyRevokedError` | Targeted CryptoKey version was destroyed | Critical security alert; triggers disaster recovery key escrow evaluation. |
| `KmsPermissionDeniedError` | IAM role lack `roles/cloudkms.cryptoKeyEncrypterDecrypter` | Security boundary alarm; pod workload identity failure. |
| `KmsNotFoundError` | Key ring, key, or version does not exist | Halts pod initialization during readiness probe. |

### 3.2 Transport Injection & Local Emulation
For local development, integration testing, and CI environments without billable GCP infrastructure:
- The provider accepts an optional `transport` parameter adhering to the Cloud KMS API contract.
- If no custom transport or GCP credentials are provided, `GoogleCloudKmsProvider` operates in safe local simulation mode using a dedicated local master key, enabling full functional testing without network or billing dependencies.

---

## 4. Key Lifecycle, Rotation & Deletion Governance

### 4.1 Key Rotation Policy
- **Automated Rotation Schedule:** Root KEKs in Cloud KMS are configured with automated 365-day rotation periods (`rotation_period = "31536000s"`).
- **Non-Destructive Versioning:** Rotating a KEK generates a new primary CryptoKeyVersion for subsequent `wrapKey` operations. Existing wrapped DEKs remain decryptable by their respective key versions.
- **Re-encryption Batches:** When migrating data across major key lifecycles, background maintenance jobs read wrapped DEKs, unwrap them with version $N$, re-wrap with version $N+1$, and update the stored key version metadata without modifying the underlying ciphertext DEK.

### 4.2 Deletion Safeguards
- **Scheduled Deletion Window:** CryptoKeys cannot be immediately deleted. Cloud KMS enforces a mandatory minimum 30-day destruction schedule (`destroy_scheduled_duration = "2592000s"`).
- **Multi-Party Authorization:** Destroying or scheduling destruction of any clinical CryptoKey requires two-person quorum authorization (Lead Security Architect + Chief Medical Informatics Officer).

---

## 5. Saudi Regulatory Compliance Alignment

| Regulatory Mandate | Requirement | Lamssa Step 9.3 Implementation |
| :--- | :--- | :--- |
| **Saudi PDPL (Art. 19)** | In-Kingdom data residency for sensitive health and personal data | Pinned exclusively to GCP region `me-central2` (Dammam). Zero cross-border data or key replication. |
| **NCA ECC-1:2018 (2-3-3)** | Cryptographic keys must be protected against unauthorized access, disclosure, and modification | FIPS 140-3 Level 3 Cloud HSM protection. Keys never stored or exposed in application memory. |
| **NCA ECC-1:2018 (2-3-4)** | Key management procedures for generation, storage, distribution, and destruction | Explicit 365-day rotation, 30-day scheduled destruction window, and immutable Cloud Audit logging. |
| **MoH Health Data Protection** | Strict patient confidentiality and tamper-evident audit trails | Envelope encryption for all attachments and sensitive notes; every unwrap operation tracked in tamper-resistant audit logs. |
