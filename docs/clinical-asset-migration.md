# Lamssa — Clinical Asset Cloud Storage Migration & Runbook

**Document Version:** 1.0.0  
**Phase:** 9 (Enterprise Infrastructure & Production Readiness) — Step 9.3  
**Status:** Approved Operational Runbook  
**Classification:** Confidential — Clinical Infrastructure Migration  

---

## 1. Executive Summary

As Lamssa migrates its clinical asset foundation from local file system storage (`/srv/lamssa/assets`) to container-native, highly available Google Cloud Storage (GCS) in Saudi Arabia (`me-central2` in Dammam), asset integrity, tenant isolation, and zero-downtime dual-read accessibility must be guaranteed.

This document outlines the operational migration strategy, verification protocols, rollback procedures, and the automated migration engine implemented in `scripts/migrate-clinical-assets.mjs`.

---

## 2. Migration Architecture & Dual-Read Compatibility

During the phased cutover from local storage to Google Cloud Storage:

```
                                  Client Request
                                        |
                                        v
+------------------------------------------------------------------------------------+
| Application Asset Streaming / Retrieval Layer                                      |
+------------------------------------------------------------------------------------+
                                        |
                  +---------------------+---------------------+
                  |                                           |
       Primary Read (GCS)                            Fallback Read (Local FS)
                  |                                           |
                  v                                           v
+-----------------------------------+       +-----------------------------------+
| Google Cloud Storage              |       | Local Filesystem Storage          |
| Bucket: lamssa-clinical-assets    |       | Path: /srv/lamssa/assets          |
| CMEK Encrypted (me-central2)      |       | Ephemeral Persistent Volume       |
+-----------------------------------+       +-----------------------------------+
```

### 2.1 Zero-Downtime Migration Phases
1. **Phase 1: Pre-Migration Dry Run & Inventory Scan**
   - Execute the migration CLI in `--dry-run` mode.
   - Scan all tenant directories in `/srv/lamssa/assets`.
   - Calculate SHA-256 hashes of all clinical assets and cross-reference database metadata (`ClinicalOrderDocument`, `ClinicalPhotoAsset`).
2. **Phase 2: Bulk Sync with CMEK Encryption**
   - Stream assets from local disk to target GCS bucket under tenant prefixes `tenants/<clinicId>/...`.
   - Verify SHA-256 checksums post-upload.
   - Support resuming interrupted migrations (`--resume`) without duplicating uploaded files.
3. **Phase 3: Dual-Read & Parity Verification**
   - Enable GCS provider as primary asset store (`ASSET_STORE_PROVIDER=gcs`).
   - If an object is not found in GCS, fall back to local disk read.
   - Verify streaming and clinical note attachments in staging.
4. **Phase 4: Local Storage Deprecation & Archival**
   - Confirm 100% object parity.
   - Archive local disk contents to cold backup; decommission ephemeral volume mounts.

---

## 3. Migration CLI Tool Usage (`scripts/migrate-clinical-assets.mjs`)

The migration engine is an automated Node.js ESM script with comprehensive safety flags:

### 3.1 Command Line Syntax
```bash
node scripts/migrate-clinical-assets.mjs [options]
```

### 3.2 Supported CLI Flags
| Flag | Description | Default |
| :--- | :--- | :--- |
| `--source <path>` | Source directory containing local assets | `/srv/lamssa/assets` |
| `--target-bucket <name>`| Target Google Cloud Storage bucket | `lamssa-clinical-assets-prod` |
| `--dry-run` | Simulate migration; calculate hashes and generate report without uploading | `false` |
| `--resume` | Skip assets that already exist in target bucket with matching SHA-256 | `false` |
| `--report <file>` | Path to write migration audit JSON report | `migration-report-<timestamp>.json` |
| `--concurrency <num>` | Maximum parallel uploads | `5` |

### 3.3 Dry-Run Execution Example
```bash
node scripts/migrate-clinical-assets.mjs --dry-run --source ./assets --target-bucket lamssa-clinical-assets-staging
```

Sample JSON report structure:
```json
{
  "timestamp": "2026-11-20T21:30:00.000Z",
  "dryRun": true,
  "sourcePath": "/srv/lamssa/assets",
  "targetBucket": "lamssa-clinical-assets-staging",
  "totalAssetsScanned": 1420,
  "successfulMigrations": 1420,
  "failedMigrations": 0,
  "skippedAssets": 0,
  "totalBytesMigrated": 4829104812,
  "tenantsProcessed": ["clinic-a", "clinic-b"]
}
```

---

## 4. Integrity Verification & Failure Recovery

### 4.1 SHA-256 End-to-End Cryptographic Validation
- Every asset read from disk is hashed via `crypto.createHash('sha256')`.
- The hash is uploaded as custom object metadata (`x-goog-meta-sha256`).
- Post-upload, the script issues a metadata get request and verifies the checksum.

### 4.2 Rollback Runbook
If an anomalous failure occurs during migration:
1. Revert `ASSET_STORE_PROVIDER` back to `disk` in Kubernetes ConfigMap / ExternalSecret.
2. The local storage remains pristine throughout migration (read-only operations on source files).
3. Pods automatically resume reading from `/srv/lamssa/assets`.
4. Inspect migration failure logs in `migration-report-<timestamp>.json`.
