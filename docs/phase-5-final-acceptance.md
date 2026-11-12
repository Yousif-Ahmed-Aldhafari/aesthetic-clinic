# Lamssa — Phase 5 Final Security, Privacy, Financial Integrity & Acceptance Report

**Date:** 2026-11-12
**Branch:** `phase/5-patient-enterprise`
**Base Commit (Start of Step 5.6):** `9c922a1a64ffa5eff7538055541666b98cf85406`
**Target Integration Branch:** `main`
**Language:** English (Technical Documentation) | Arabic RTL (Application UI)
**System Classification:** Multi-Tenant Aesthetic Healthcare SaaS

---

## Executive Summary

Phase 5 introduces enterprise-grade multi-location clinic operations, direct patient-facing portals, clinical consent and recovery self-service, advanced inventory FIFO landed costing, payment gateway orchestration, and regulatory e-invoicing foundations to Lamssa.

Step 5.6 conducted a comprehensive, independent security, privacy, and financial integrity acceptance audit across all five Phase 5 implementation steps. A critical vulnerability involving a custom session variable bypass flag (`lamssa.internal_security_lookup`) was identified, completely eliminated, and replaced with standard PostgreSQL `maintenance_owner` policies. All 93 database tables now enforce strict `FORCE ROW LEVEL SECURITY`. Webhook ingestion was fortified against unauthorized invocation and replay attacks. Negative SQL injection and privilege escalation regression suites were implemented and verified. The browser acceptance suite was expanded to 43 comprehensive checks. Full regression test suites passed cleanly.

### Acceptance Verdicts

| Scope | Verdict | Rationale & Status |
| :--- | :--- | :--- |
| **Code Integration (`main`)** | **READY FOR CODE MERGE** | All automated tests pass (186 unit, 306 database integration, 43 browser smoke). Zero boundary violations. Migration sequence 001–032 validated on PostgreSQL 16. Working tree clean. Zero git whitespace defects. |
| **Production Deployment** | **NOT READY FOR PRODUCTION** | Gated on mandatory production prerequisites: formal clinical safety board sign-off on VAS thresholds, jurisdictional tax authority onboarding (ZATCA phase 2 / FTA), bank merchant acquirer underwriting, HSM/KMS external credential storage, and live disaster recovery restoration drills with elevated credentials. |

---

## 1. Baseline and Implementation Sequence

The Phase 5 implementation sequence was independently verified against the repository history:

```
* 9c922a1 feat(integrations): implement Phase 5 Step 5.5 payment and regulatory foundations
* 3548eec feat(accounting): implement Phase 5 Step 5.4 inventory costing and valuation
* 9f380ab docs(branch): accept Phase 5 Step 5.3 multi-branch management documentation
* f8dc541 feat(branch): implement Phase 5 Step 5.3 multi-branch clinic management
* 39d5ea7 feat(portal): implement Phase 5 Step 5.2 patient consent and recovery self-service
* d0e2b9f feat(portal): implement Phase 5 Step 5.1 patient portal and secure self-service booking
```

- **Step 5.1 (`d0e2b9f`)**: Patient portal foundation, clinic-scoped patient authentication, profile access, and secure self-service booking.
- **Step 5.2 (`39d5ea7`)**: Patient consent self-signing, cryptographic digests, recovery check-ins, VAS pain escalation, and follow-up self-service.
- **Step 5.3 (`f8dc541`, docs `9f380ab`)**: Multi-branch clinic organization hierarchy, staff assignments, cross-branch GiST exclusion scheduling, and controlled stock transfers.
- **Step 5.4 (`3548eec`)**: Advanced inventory costing, landed cost allocation (`BY_VALUE`, `BY_QUANTITY`), FIFO cost layers, FEFO clinical dispensing separation, and immutable valuation snapshots.
- **Step 5.5 (`9c922a1`)**: Provider-neutral payment orchestration, AES-256-GCM + HKDF credential encryption, HMAC-SHA256 webhook processing, external reconciliation, payout evidence, and regulatory e-invoicing simulation foundations.
- **Step 5.6 (This Work)**: Comprehensive security audit, elimination of `lamssa.internal_security_lookup`, webhook call hardening, negative SQL regression tests, expanded browser smoke tests, and final release acceptance.

---

## 2. Independent Security & Architectural Audit by Domain

### 2.1 Phase 5.1: Patient Identity, Authentication & Booking

1. **Strict Principal Separation**: Patient accounts (`PatientAccount`, `PatientSession`) are completely segregated from employee accounts (`User`, `Session`). Staff credentials cannot authenticate patient endpoints, and patient sessions cannot authenticate any staff, clinical, or financial API.
2. **Clinic-Scoped Multi-Tenancy**: Patient identity is strictly isolated by `(clinicId, patientId)`. A patient receiving care at Clinic A and Clinic B possesses independent credentials with zero cross-tenant leakage.
3. **Invitation & Activation Tokens**: Activation tokens are cryptographically generated (32 bytes high-entropy random), short-lived, stored only as SHA-256 hashes, and invalidated immediately upon first use or account activation. Activation requires verifying the token in combination with the patient's registered identity.
4. **Brute-Force & Rate Limiting**: Exponential backoff and lockout thresholds (`failedLoginAttempts >= 5` triggers 15-minute lockout) prevent credential stuffing.
5. **No Exposure of Staff PHI / Financial Internals**: Patient portal endpoints project strictly allowlisted patient fields. Doctor internal clinical notes, staff remarks, internal cost layers, and staff audit logs are inaccessible.
6. **Self-Service Booking Invariants**: Self-service booking creates `SCHEDULED` appointments only. It cannot create visits, billing invoices, or procedure executions. Cross-booking is blocked via GiST exclusion constraints (`23P01`).

### 2.2 Phase 5.2: Patient Consent, Recovery & Intra-Clinic Isolation

1. **Digital Signature Cryptographic Binding**: Consent self-signing computes a deterministic SHA-256 digest of the legal form content combined with the signature artifact. The transition to `PENDING_VERIFICATION` requires explicit clinician review before procedure execution is permitted (`ConsentEligibilityService` fail-closed).
2. **VAS Pain Scoring & Clinical Escalation**:
   - Severe pain ($\ge 8$) or red-flag clinical symptoms (fever, uncontrolled bleeding, severe asymmetrical swelling) immediately trigger automatic escalation in the clinician follow-up queue.
   - Arabic-first emergency guidance is displayed prominently to the patient, advising immediate contact with emergency medical services.
   - *Clinical Notice*: All automated escalation rules are categorized as unapproved clinical rules pending formal review and sign-off by a qualified clinical director.
3. **Intra-Clinic Patient Isolation**:
   - Hardened PostgreSQL function `lamssa_security.patient_row_allows(target_clinic, target_patient)` strictly confines queries executed under patient sessions to records matching both the authenticated `lamssa.clinic_id` and `lamssa.patient_id`.
   - Positive and negative tests confirm that a patient cannot read or modify another patient's consent records, check-ins, or appointments within the same clinic.

### 2.3 Phase 5.3: Multi-Branch Organization Hierarchy & Controlled Operations

1. **Organization Hierarchy**: `ClinicBranch` represents a physical operating site under a clinic. Default branch `'MAIN'` is provisioned and backfilled automatically.
2. **Staff Assignments & RBAC**: Staff branch memberships (`BranchMembership`) assign employees to specific branches with primary branch designation. Clinic Owners and Clinic Admins retain organization-wide authority; doctors, receptionists, and inventory handlers are restricted to their assigned branches.
3. **Cross-Branch Scheduling Exclusion**: Doctor and treatment room GiST exclusion constraints enforce non-overlapping appointment intervals across all branch IDs within the clinic (`btree_gist` exclusion on `(clinic_id, practitioner_id, tstzrange(starts_at, ends_at))`). A practitioner cannot be double-booked across different branches.
4. **Controlled Inter-Branch Stock Transfers**:
   - Two-step custodial workflow: `DISPATCHED` (deducts source balance, puts stock into transit) ➔ `RECEIVED` (credits destination balance).
   - Any transit discrepancy requires auditable notes and approval. Stock cannot be duplicated or lost in transit.
   - All 5 branch-related tables enforce `FORCE ROW LEVEL SECURITY`.

### 2.4 Phase 5.4: Advanced Inventory Costing, Landed Cost & FIFO Valuation

1. **Separation of Concerns (FEFO Dispensing vs FIFO Valuation)**:
   - Physical clinical dispensing operates under First-Expired First-Out (`FEFO`) based on physical lot dates (`InventoryBatch`).
   - Financial accounting operates under strict First-In First-Out (`FIFO`) based on acquisition cost layers (`InventoryCostLayer`).
   - The physical lot dispensed to a patient in clinical records is never mutated or replaced by accounting cost layer attribution.
2. **Landed Cost Allocation Engine**:
   - Freight, customs, duties, and handling costs (`InventoryLandedCost`) are allocated across purchase order lines via `BY_VALUE` or `BY_QUANTITY`.
   - Calculations use exact integer minor units (halalas/cents) with remainder distribution attributed deterministically to the final line item, ensuring zero-sum rounding discrepancies:
     $$\sum \text{allocatedMinor} = \text{totalLandedCostMinor}$$
3. **Inter-Branch Transfer Costing**:
   - Stock transfers preserve historical unit landed cost while in transit.
   - Receiving branch inherits exact source unit cost layers. Cancellation restores stock to source layers without cost distortion.
4. **Clinical Consumption & Voiding**:
   - Consuming supplies for a procedure depletes FIFO cost layers and records immutable `InventoryCostMovement` records.
   - Voiding a procedure creates compensating positive movements at historical acquisition cost.
5. **Periodic Valuation Snapshots**:
   - Periodic inventory valuation snapshots (`InventoryValuationSnapshot`) freeze product, batch, and layer balances.
   - Immutability database triggers reject any `UPDATE` or `DELETE` on snapshot records.

### 2.5 Phase 5.5 & 5.6: Payment Gateway, Webhooks & Regulatory Foundations

1. **Provider-Neutral Payment Architecture**:
   - Supports `PaymentProviderConfiguration`, `PaymentIntent`, `PaymentProviderEvent`, `PaymentSettlement`, `ExternalRefund`, `ExternalPayout`, `ExternalReconciliationRun`, and `ExternalReconciliationFinding`.
   - Sandbox mock execution operates deterministically (`SANDBOX_MOCK`). Production provider adapters (`MOYASAR`, `CHECKOUT_COM`, `STRIPE`, `REGIONAL_BANK_GATEWAY`) are implemented as disabled-by-default stubs (`isExecutionSupported = false`).
2. **Encrypted Provider Credentials**:
   - Provider API keys and webhook signing secrets are encrypted at rest using AES-256-GCM with HKDF-SHA256 key derivation.
   - Ciphertext, IV, and authentication tag are stored in `encryptedCredentials`. Plaintext secrets never appear in logs or unauthenticated responses.
3. **Webhook Ingestion & Concurrency**:
   - Webhook signatures are verified using HMAC-SHA256.
   - Replay attacks are prevented via a 300-second timestamp window and idempotency checks on `PaymentProviderEvent(clinicId, provider, eventId)`.
   - Concurrent webhook processing utilizes PostgreSQL `FOR UPDATE` locking on the target `PaymentIntent`.
   - Upon confirmation, webhook processing executes `post_webhook_payment` to atomically create the `Payment`, update `Invoice.netPaidMinor`, and append to the immutable `FinancialAuditEvent` chain.
4. **Jurisdiction-Aware Regulatory Foundations**:
   - `ClinicRegulatoryProfile` models jurisdictional compliance rules (`SA_ZATCA`, `AE_FTA`, `GENERIC_TAX_INVOICE`).
   - Simulates e-invoice cryptographic signing, XML generation, and submission states (`MOCK_SUBMITTED`).
   - Explicitly gated from live governmental APIs; live transmission is disabled until official tax authority clearance.

---

## 3. Deep-Dive: Elimination of Custom GUC Bypass, Ticketed Webhook Authorization & RLS Hardening

### 3.1 Vulnerability Analysis: Webhook GUC Manipulation & Unauthorized Posting

During the Step 5.6 security acceptance review, a rigorous threat model audit evaluated whether a restricted database caller (`lamssa_app` / `lamssa_runtime`) could forge payment events, manipulate session variables, or invoke `post_webhook_payment` without authentic webhook verification:

#### Structural Defects Identified & Exploit Proof of Concept
1. **Webhook Intent Session Variable Forgery**: Previously, `lamssa_security.context_allows` allowed access when `target_clinic = lamssa.clinic_id AND webhook_intent_allows(lamssa.webhook_intent_id)`. Because PostgreSQL session variables can be set arbitrarily by any SQL session via `set_config('lamssa.webhook_intent_id', ...)`, a runtime attacker could set arbitrary intent UUIDs.
2. **Exposure of Payment Provider Configurations**: When `webhook_intent_allows` evaluated to true, `PaymentProviderConfiguration` records became selectable, exposing encrypted credentials and webhook signing secrets.
3. **Unauthorized Event Creation & Posting**: The runtime role had direct `INSERT` and `UPDATE` privileges on `PaymentProviderEvent`. A restricted database connection could insert a fake `RECEIVED` event with `signatureVerified = true` and call `post_webhook_payment` directly, crediting an invoice without any authentic webhook signature from the external provider.
4. **Migration History Modification Risk**: Modifying previously applied migration files in-place violates migration immutability. Historical migration `20261112000100_payment_regulatory_integrations` needed restoration to its exact commit `9c922a1` state, with all hardening isolated in an additive migration.

### 3.2 Implemented Remediation

1. **Restoration of Migration 031**:
   Historical migration `apps/api/prisma/migrations/20261112000100_payment_regulatory_integrations/migration.sql` was restored to exact byte-for-byte fidelity with git commit `9c922a1`.
2. **Additive Migration 032 (`20261112000200_webhook_security_hardening`)**:
   Created a clean, forward-only migration containing all security enhancements:
   - Added `"webhookTicketHash"` (VARCHAR(64)) and `"webhookTicketExpiresAt"` (TIMESTAMPTZ) to `PaymentIntent`.
   - Purged `webhook_intent_allows` from `lamssa_security.context_allows`, strictly requiring an active user or patient session for context establishment.
   - Introduced a cryptographically secure, single-use ticket model via `lamssa_security.resolve_payment_webhook_target`: generates 64 characters of random hex entropy, commits the SHA-256 hash to `PaymentIntent`, sets a 60-second expiration, and returns the plaintext ticket exclusively to the in-memory webhook ingestion handler.
   - Implemented dedicated, atomic `SECURITY DEFINER` routines: `ingest_payment_webhook_event`, `update_payment_webhook_event_status`, and `update_payment_intent_webhook_status`.
   - Hardened `lamssa_security.post_webhook_payment`: verifies the single-use ticket hash, checks validity window, checks that `postedPaymentId` is null and status is payable, atomically wipes `webhookTicketHash` to prevent replays, verifies a fresh (<5 min) authentic event with verified signature, records the `Payment`, updates `Invoice`, appends to `FinancialAuditEvent`, and sets the event to `PROCESSED`.
   - Denied direct write access on `PaymentProviderEvent`: added `FOR INSERT WITH CHECK (false)`, `FOR UPDATE USING (false)`, `FOR DELETE USING (false)`, restricting mutations exclusively to `maintenance_owner` (via security-definer routines).
   - Revoked `PUBLIC` execution rights on all webhook security functions (`REVOKE ALL ON FUNCTION ... FROM PUBLIC`).
3. **Negative SQL Regression Verification**:
   Negative SQL tests in `apps/api/test/integrations.integration.test.ts` prove:
   - Setting forged `lamssa.clinic_id`, `lamssa.webhook_intent_id`, or `lamssa.internal_security_lookup` yields **zero rows**.
   - Direct `INSERT` into `PaymentProviderEvent` by runtime SQL is rejected by RLS (code `42501`).
   - Direct `UPDATE` on `PaymentProviderEvent` by runtime SQL is rejected by RLS (code `42501`).
   - Calling `post_webhook_payment` without a ticket or with an invalid/forged ticket is rejected immediately.
   - Calling `ingest_payment_webhook_event` with a fake ticket is rejected immediately.

### 3.3 Patient Account Activation Trust Boundaries (Task 3)

1. **Digital vs Demographic Knowledge**: Demographic matching (matching phone number + date of birth) serves as a secondary possession-confirmation layer, **never** an authentication factor alone. An attacker possessing a patient's phone and DOB cannot claim an account without holding the genuine cryptographic activation token.
2. **Token Generation & Delivery**: Activation tokens are generated via cryptographic CSPRNG (`secret()`), SHA-256 hashed at rest, delivered out-of-band directly to the patient's verified contact channel, and expire within a strict operational window.
3. **Anti-Brute-Force & Rate Limiting**: The activation endpoint enforces per-phone and per-IP rate limits (`checkPortalRateLimit`). Token lookups run via `lamssa_security.portal_activation_lookup(tokenHash)`, single-use consumption (`usedAt` timestamp) prevents token replay, and negative tests verify that forged tokens are rejected with HTTP 400.

### 3.4 Clinical Consent & Emergency Safeguards (Task 4)

1. **Clinician Counter-Verification Invariant**: `ConsentEligibilityService` enforces fail-closed logic: self-signed patient consents remain non-authorizing until counter-verified and approved by a licensed clinician (`consent.verifiedAt` and `consent.verifiedByMembershipId` required). Any attempt to schedule or execute a procedure without clinician-verified consent fails closed.
2. **Clinical Recovery Escalation Rules**: Recovery check-in heuristics (pain score $\ge 8$, red flag symptoms including fever, severe bleeding, vision loss) are explicitly flagged in code and documentation as provisional, non-diagnostic prioritization triggers awaiting medical director review.
3. **Decoupled Emergency Guidance Banner**: When severe pain or red flag symptoms are reported, an emergency warning banner is immediately presented to the patient in Arabic, directing them to urgent care/emergency services independently of clinician response latency.

---

## 4. Comprehensive Audit Findings by Severity

| ID | Domain | Severity | Finding Description | Status / Remediation |
| :--- | :--- | :--- | :--- | :--- |
| **SEC-501** | Integrations / RLS | **CRITICAL** | `lamssa.internal_security_lookup` session GUC allowed potential RLS bypass if injected or set by runtime session. | **RESOLVED**: GUC completely removed; standard `maintenance_owner` policy applied across all 15 integration tables. Negative tests verified. |
| **SEC-502** | Payments / Webhook | **HIGH** | `post_webhook_payment` lacked caller verification against authentic, unconsumed webhook events. | **RESOLVED**: Function hardened to require matching session GUCs, fresh (<5 min) `RECEIVED` webhook event, and valid intent status. |
| **SEC-503** | Webhooks / Enums | **MEDIUM** | Mismatch in webhook processing status enum (`PENDING` vs `RECEIVED`) caused raw query failure in webhook posting. | **RESOLVED**: Aligned function check to exact Prisma enum value `'RECEIVED'`. |
| **SEC-504** | Patient / Recovery | **MEDIUM** | VAS pain scoring escalation rules lacked formal clinical sign-off disclosure. | **RESOLVED**: Added explicit clinical warning and patient emergency guidance banner; documented rule status as unapproved until medical director review. |
| **SEC-505** | Inventory / Accounting | **LOW** | Potential rounding minor unit discrepancy in multi-line landed cost allocation. | **RESOLVED**: Landed cost allocation engine distributes remainder halalas/cents deterministically to the final line item. |
| **SEC-506** | Browser Smoke Suite | **LOW** | Browser smoke script lacked coverage for branch management, FIFO costing, and patient portal RTL landing. | **RESOLVED**: Expanded `patients-browser-smoke.mjs` to 43 comprehensive checks covering all Phase 5 workspaces. |

---

## 5. Verification Test Evidence & Metrics

### 5.1 Test Suite Results

| Test Suite | Scope | Target | Result | Status |
| :--- | :--- | :--- | :--- | :--- |
| **Boundary Checker** | Architectural imports & DB isolation | Monorepo | Clean | **PASSED** |
| **Prisma Validation** | Schema integrity & models | `prisma/schema.prisma` | Valid | **PASSED** |
| **Migration Status** | Applied migrations | `lamssa_dev` & `lamssa_test` | 32 migrations applied | **PASSED** |
| **TypeScript Build** | Clean compilation | Web & API workspaces | 0 errors | **PASSED** |
| **Unit Tests** | Policies, crypto, math, controllers | `npm test` | **186 passed**, 0 failed | **PASSED** |
| **Database Tests** | PostgreSQL RLS, GiST, transactions | `npm run test:db` | **306 passed**, 1 skip* | **PASSED** |
| **Browser Smoke** | Puppeteer RTL workflow checks | `npm run test:browser` | **43 passed**, 0 errors | **PASSED** |
| **Deployment Check** | Static container & env checks | `npm run check:deployment` | Invariants verified | **PASSED** |
| **Git Diff Check** | Whitespace & formatting | `git diff --check main` | 0 defects | **PASSED** |

*\*Note on Database Test Skip: Exactly 1 test in `backup-restore.test.ts` is intentionally skipped when running under the restricted test runtime role (`lamssa_test_runtime`), which correctly lacks `CREATEDB` privileges.*

### 5.2 Database Security & Schema Statistics

- **Total PostgreSQL Migrations**: 32 applied migrations (`20261024000100` through `20261112000200`).
- **Total Tables with FORCE ROW LEVEL SECURITY**: **93 tables** (100% of tenant-accessible tables).
- **Security Definer Functions**: 84 functions audited with fixed `SET search_path = pg_catalog, pg_temp` and no `PUBLIC` execute grants.
- **GiST Exclusion Constraints**: Active on `Appointment` (`no_practitioner_overlap`, `no_room_overlap`) across branch resources.

---

## 6. Backup, Restoration & Disaster Recovery Status

1. **Encrypted Backups**: Evaluated `npm run db:backup` using AES-256-GCM + scrypt key derivation.
2. **Restoration Drill**: Verified `npm run db:backup:drill` checks archive structural integrity, schema validation, and SHA-256 hash digests.
3. **Restricted Runtime Privileges**: Runtime database roles (`lamssa_runtime`, `lamssa_test_runtime`) correctly lack `SUPERUSER`, `CREATEDB`, `CREATEROLE`, `REPLICATION`, and `BYPASSRLS`. Real database restoration commands require maintenance/admin database credentials.

---

## 7. Production Release Gate & Governance Prerequisites

While the codebase is verified and ready for integration into the `main` development branch, **production deployment remains strictly blocked** until the following operational, legal, and clinical gates are completed:

1. **Clinical Safety Board Sign-Off**:
   - Clinical review and formal approval of recovery symptom escalation triggers (VAS $\ge 8$, fever, continuous bleeding) by the clinic's Medical Director.
   - Formal validation of patient-reported outcome measures (PROMs) scales for aesthetic procedures.
2. **Tax Authority Approval & Onboarding**:
   - Cryptographic compliance onboarding with ZATCA (Saudi Arabia Phase 2 clearance/reporting) or FTA (UAE).
   - Replacement of `MOCK_SUBMITTED` simulation adapters with certified e-invoicing transmission pipelines.
3. **Payment Processor Underwriting**:
   - Merchant acquiring contracts and production API credentials from licensed payment gateways (Moyasar, Checkout.com, etc.).
   - Migration of encryption keys from local environment variables to a cloud Key Management Service (AWS KMS, Google Cloud KMS, or HashiCorp Vault).
4. **Live Disaster Recovery Drill**:
   - Execution of a full out-of-band database restore against a dedicated staging environment using administrative credentials.
5. **Physical Branch Network Configuration**:
   - Review and confirmation of physical branch IP allowlisting or VPN requirements for operational terminals.

---

## 8. Final Conclusion & Recommendation

Phase 5 has successfully implemented enterprise patient engagement, multi-branch clinic operations, auditable FIFO inventory costing, payment processing foundations, and regulatory compliance structures while upholding Lamssa's architectural principles: strict tenant isolation, PostgreSQL FORCE RLS, Arabic-first RTL user experience, and financial immutability.

**Recommendation:** Proceed with the local merge of branch `phase/5-patient-enterprise` into `main`. Maintain production deployment hold until all Chapter 7 prerequisites are signed off.
