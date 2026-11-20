# Lamssa — Stateless Clinical Asset Storage & Streaming Architecture

**Document Version:** 1.0.0  
**Phase:** 9 (Enterprise Infrastructure & Production Readiness) — Step 9.3  
**Status:** Approved Architectural Specification  
**Classification:** Confidential — Clinical Informatics & Storage Security  

---

## 1. Executive Summary

Lamssa's clinical workflows generate sensitive medical assets: diagnostic laboratory reports, ultrasound and radiographic imagery, pre- and post-operative clinical photographs, and digital consent forms with biometric signatures. 

In containerized, horizontally scaled production environments (Google Kubernetes Engine), local ephemeral disk storage (`/srv/lamssa/assets`) cannot support multi-replica state, pod auto-scaling, or rolling deployments without data loss.

This specification details the production **Google Cloud Storage (GCS)** stateless asset storage architecture, Customer-Managed Encryption Key (CMEK) enforcement, multi-tenant directory partitioning, WORM compliance retention, and the authorized authenticated streaming endpoint that supersedes raw presigned URLs.

---

## 2. Stateless Object Storage Architecture

```
+------------------------------------------------------------------------------------+
| Client Browser / Mobile Web (Clinician Session)                                    |
+------------------------------------------------------------------------------------+
                                     |
               HTTPS GET /api/v1/clinical-orders/documents/:id/stream
               (Bearer JWT + X-Clinic-Id + Strict Active Session Validation)
                                     v
+------------------------------------------------------------------------------------+
| NestJS API (apps/api) — ClinicalOrdersController & GoogleCloudStorageAssetStore    |
| - Verifies active clinician session and tenant boundary                            |
| - Verifies clinical privileges (DOCTOR / NURSE) & document ownership               |
| - Applies defensive headers: Cache-Control: no-store, private, CSP, nosniff       |
| - Streams binary buffer / chunked stream directly to authenticated response        |
+------------------------------------------------------------------------------------+
                                     |
                         Private Google Access (VPC)
                      Customer-Managed Encryption Keys (CMEK)
                                     v
+------------------------------------------------------------------------------------+
| Google Cloud Storage (Bucket: lamssa-clinical-assets-prod, Region: me-central2)    |
| - Public Access Prevention: ENFORCED                                               |
| - Uniform Bucket-Level Access: ENFORCED                                            |
| - Object Retention / Bucket Lock: WORM Compliance Mode (10 Years for Clinical)     |
| - Multi-Tenant Partitioning: tenants/<clinicId>/documents/<docId>/<filename>       |
+------------------------------------------------------------------------------------+
```

---

## 3. GoogleCloudStorageAssetStore Implementation

The asset store provider is implemented at `apps/api/src/identity/google-cloud-storage.asset-store.ts`, implementing the `AssetStore` interface:

```typescript
export interface AssetStore {
  put(storageKey: string, data: Buffer, mimeType: string): Promise<void>;
  read(storageKey: string): Promise<Buffer>;
  remove(storageKey: string): Promise<void>;
  exists(storageKey: string): Promise<boolean>;
  getMetadata(storageKey: string): Promise<AssetMetadata | null>;
  getStream?(storageKey: string): Promise<NodeJS.ReadableStream>;
}
```

### 3.1 Security & Tenancy Invariants
1. **Tenant Prefix Partitioning:** All objects are stored under explicit tenant prefixes: `tenants/<clinicId>/...`. The provider strictly validates that storage keys conform to tenant boundaries.
2. **Path Traversal Defense:** Storage keys containing directory traversal tokens (`..`, `//`, `\`, leading slashes) are rejected immediately with descriptive validation errors before any GCS API call.
3. **CMEK Encryption at Rest:** All objects written to GCS are automatically encrypted at rest using Cloud KMS keys located in `me-central2` (Dammam, KSA).
4. **Transport Inversion & Local Emulation:** The provider supports custom transport injection for unit and integration testing without cloud billing.

---

## 4. Presigned URLs vs. Authorized Reverse-Proxy Streaming

### 4.1 The Security Vulnerability of Presigned URLs
Presigned object storage URLs operate as **bearer capabilities**:
- Anyone possessing the URL can access and download the asset until the signature expires.
- If a clinician's session is revoked, or if their privileges are downgraded while an asset URL is active, the presigned URL remains valid until expiration.
- URLs may leak via browser history, proxy logs, or shoulder surfing.

### 4.2 The Solution: Authorized Reverse-Proxy Streaming
For high-sensitivity medical assets (intimate clinical photographs, diagnostic records, psychiatric/specialty notes), Lamssa implements an authenticated streaming endpoint:

`GET /api/v1/clinical-orders/documents/:documentId/stream`

**Security Enforcement Flow:**
1. Requires valid Bearer JWT and matching active session record in PostgreSQL (`revokedAt IS NULL`).
2. Validates user membership in the clinic owning the document.
3. Checks clinical privilege matrix (`DOCTOR`, `NURSE`, or authorized clinical role).
4. Emits defensive HTTP headers:
   ```http
   Cache-Control: no-store, no-cache, must-revalidate, private
   Pragma: no-cache
   Expires: 0
   X-Content-Type-Options: nosniff
   Content-Security-Policy: default-src 'none'; sandbox
   Content-Disposition: inline; filename="report.pdf"
   ```
5. Pipes the object stream from GCS directly to the client response, ensuring zero disk writing on the API container.

---

## 5. Storage Bucket Governance & Retention Policies

| Bucket Purpose | Bucket Name Pattern | Retention Policy | CMEK Protection |
| :--- | :--- | :--- | :--- |
| **Clinical Documents & Media** | `lamssa-clinical-assets-<env>` | 10-Year WORM Compliance Lock (MoH standard) | Cloud KMS (`me-central2`) |
| **Encrypted Database Backups** | `lamssa-db-backups-<env>` | 30-Day Automated Lifecycle Transition to Coldline | Cloud KMS (`me-central2`) |
| **Immutable Audit Archive** | `lamssa-audit-archive-<env>` | 10-Year Retention Lock (NCA / MoH audit compliance) | Cloud KMS (`me-central2`) |
