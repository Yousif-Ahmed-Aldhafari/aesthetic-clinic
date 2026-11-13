# Lamssa implementation roadmap

## Phase 6 — Specialty-Neutral Outpatient Medical Platform

1. **6.1 — Specialty-Neutral Architecture Contracts & Migration Blueprint (completed design milestone):** Comprehensive three-layer modular architecture blueprint (Operational Core, Clinical Foundation, Specialty Workspaces); dual-track migration strategy (**Approach B**) preserving all existing aesthetic models (`AestheticProcedureCatalog`, `TreatmentPlan`, `ProcedureExecution`, `ConsentTemplate`, `PatientConsent`, `TreatmentPackage`, `InventoryClinicalConsumption`, `PractitionerCommissionRule`) without in-place renames or database locks; formal specialty registry schema designs (`MedicalSpecialty`, `ClinicSpecialty`, `BranchSpecialty`, `PractitionerProfile`, `PractitionerSpecialty`, `PractitionerClinicalPrivilege`); shared clinical foundation domain models (`ClinicalObservation`, `EncounterDiagnosis`, `PatientAllergy`, `MedicationRecord`, `MedicationPrescription`, `ClinicalOrder`, `ClinicalOrderResult`, `ClinicalDocument`, `ClinicalFormDefinition`, `ClinicalFormResponse`); dynamic JSON Schema form engine; least privilege administrative isolation protecting clinical charts; terminology localization engine; and multi-phase roadmap. Zero code, schema, or test modifications executed. See [docs/general-medical-platform-architecture.md](general-medical-platform-architecture.md), [docs/general-medical-migration-blueprint.md](general-medical-migration-blueprint.md), [docs/medical-specialty-roadmap.md](medical-specialty-roadmap.md), and [docs/phase-6-step-6-1-assessment.md](phase-6-step-6-1-assessment.md).
2. **6.2 — Specialty Registry, Practitioner Qualifications & Clinical Privilege Engine (implemented):** Additive migration `20261113000100_medical_specialty_registry_privileges` introducing global reference catalog (`MedicalSpecialty`), tenant-scoped facility enablement (`ClinicSpecialty`, `BranchSpecialty`), practitioner profiles (`PractitionerProfile`), verified medical qualifications (`PractitionerSpecialty`), and granular clinical privileges (`PractitionerClinicalPrivilege`); idempotent seed for 10 reference specialties (`AESTHETICS`, `GENERAL_MEDICINE`, `DERMATOLOGY`, `DENTISTRY`, `PEDIATRICS`, `OB_GYN`, `OPHTHALMOLOGY`, `ORTHOPEDICS`, `ENT`, `PHYSIOTHERAPY`); non-destructive backward compatibility backfill linking existing clinics and branches to `AESTHETICS`; multi-tier clinical privilege authorization engine evaluating facility specialty, verified qualifications, active privileges, and treating team scope; Medical Director credentialing governance and anti-self-approval enforcement; `@RequireSpecialty` and `@RequireClinicalPrivilege` authorization guards; least privilege administrative isolation; PostgreSQL `FORCE ROW LEVEL SECURITY` across all tenant tables with composite foreign keys and database immutability triggers; and authentic Arabic-first RTL specialty settings and credentialing workspace. See [docs/medical-specialty-authorization.md](medical-specialty-authorization.md).
3. **6.3 — Shared Clinical Data Foundation: Observations, Diagnoses, Allergies & Prescriptions (implemented):** Additive migration `20261113000200_shared_clinical_foundation` introducing structured observations and vital signs (`ClinicalObservation`) with decimal precision, unit validation, physiological safety bounds, and deterministic BMI calculation; encounter diagnoses (`EncounterDiagnosis`) with ICD-10 coding, strict primary vs. secondary designation, and chronic problem list tracking; patient allergy register (`PatientAllergy`) with allergen categorization, severity scoring, clinician verification, and NKA declarations; pre-flight prescription safety warnings cross-checking active allergies; decoupled medication reconciliation (`MedicationRecord`) without automated inventory consumption; controlled outpatient prescriptions (`MedicationPrescription`, `MedicationPrescriptionItem`, `ClinicPrescriptionCounter`) with sequential numbering (`RX-000001`), state machine lifecycle (`DRAFT`, `PENDING_REVIEW`, `SIGNED`, `CANCELLED`, `SUPERSEDED`), mandatory `MEDICATION_PRESCRIBE` privilege check, cryptographic SHA-256 tamper-evident digest sealing, and database immutability triggers (`prescription_immutability_guard()`, `prescription_item_guard()`, `clinical_observation_guard()`); 105 FORCE RLS tables and 90 locked `lamssa_security` functions (`search_path = pg_catalog, pg_temp`); and authentic Arabic-first RTL clinical encounter workspace tabs. See [docs/shared-clinical-foundation.md](shared-clinical-foundation.md).
4. **6.4 — General Clinical Services, Clinical Orders & Diagnostic Results (planned):** Additive migration `035` introducing `GeneralClinicalService`, `ClinicalOrder`, `ClinicalOrderResult`, and AES-256-GCM encrypted `ClinicalDocument`; `ClinicalProcedureAdapterService` providing polymorphic billing integration with `ClinicService`; diagnostic ordering and report attachment workflows; and Arabic RTL orders and diagnostics workspace.
5. **6.5 — Structured Clinical Forms, Dynamic Templates & Specialty Workspaces (planned):** Additive migration `036` introducing versioned dynamic forms (`ClinicalFormDefinition`) validated via JSON Schema Draft 7 / 2020-12, immutable form responses (`ClinicalFormResponse`) with cryptographic signing; specialty workspace switching (General Medicine, Aesthetics, Dermatology); dynamic Arabic terminology tokenization (`useTerminology()`); and responsive RTL dynamic form renderer.
6. **6.6 — Comprehensive Medical Security, Multi-Specialty Compatibility & Acceptance (planned):** Additive migration `037` finalizing indexes and security policies; end-to-end multi-tenant isolation audit; negative authorization test suite verifying administrative lockout from confidential clinical records; backward-compatibility verification for all aesthetic workflows; automated unit, database, and browser smoke test suites; and final Phase 6 acceptance report.

## Phase 7 — Production Readiness, Regulatory Certification & Operational Deployment (Planned)

Following the completion of the general medical platform in Phase 6, Phase 7 focuses on pre-launch production hardening, regulatory onboarding, and infrastructure certification:
1. **Cloud KMS & Secret Management:** Transition from local filesystem encryption keys to managed Cloud KMS (AWS KMS / GCP Cloud KMS / HashiCorp Vault) with hardware security module (HSM) backing and automated key rotation.
2. **Production Regulatory E-Invoicing Onboarding:** Transition from sandbox mock modes to official ZATCA Phase 2 (Fatoora) onboarding with cryptographically signed production CSIDs and UAE FTA accredited e-invoicing endpoints.
3. **Live Payment Gateway Activation:** Verification of production merchant accounts, live webhooks with strict IP filtering, and high-availability settlement reconciliation.
4. **Production Disaster Recovery Drills:** Formal RTO/RPO validation in isolated secondary regions, off-site immutable backup synchronization, and automated failover verification.
5. **Penetration Testing & Independent Security Audit:** Third-party clinical data protection audit, OWASP ASVS verification, and regional compliance certifications (Saudi MOH / UAE DOH / GDPR).

## Phase 8+ — Deep Specialty Medical Modules (Future Roadmap)

Future phases will deliver deep, specialized clinical capabilities for specific outpatient medical disciplines:
- **Phase 8 — Dentistry & Periodontics:** Interactive visual odontogram (FDI / Universal numbering), tooth-specific periodontal probing depths, endodontic charting, restorative visual maps, and dental billing integration.
- **Phase 9 — Pediatrics & Adolescent Medicine:** WHO & CDC growth percentile curves (Height, Weight, Head Circumference, BMI-for-age), mandatory childhood immunization schedules with due-date alerts, developmental milestones tracking, and pediatric dosage calculators.
- **Phase 10 — Obstetrics & Gynecology:** Antenatal care flowcharts, gestational age calculators (LMP / EDD / Ultrasound biparietal diameter), Gravida/Para/Abortus (GPA) scoring, fetal heart rate monitoring logs, and delivery summaries.
- **Phase 11 — Ophthalmology & Optometry:** Standardized visual acuity charts (Snellen, LogMAR, decimal), subjective/objective refraction records (Sphere, Cylinder, Axis, Add, PD), intraocular pressure (tonometry) tracking, and anterior/posterior segment exam templates.
- **Phase 12 — Physiotherapy & Rehabilitation:** Interactive musculoskeletal joint range of motion (ROM) goniometric tracking, standardized functional assessment scales (Berg Balance, Oswestry), and multi-visit rehabilitation care plans.

## Phase 5 — Patient Experience, Multi-Location & Enterprise Capabilities

1. **5.1 — Patient Portal Foundation, Secure Patient Authentication, Profile Access & Self-Service Booking (implemented):** Clinic-scoped patient authentication (`PatientAccount`, `PatientSession`, `PatientVerificationToken`, `PatientPortalAuditEvent`), argon2id hashing, secure activation and password recovery workflows, CSRF protection, brute-force / account lockout limits, dedicated `PatientAuthGuard` and `@PortalRoute()` access control, dual-session FORCE RLS under `lamssa_security.context_allows` with zero exposure of staff notes/billing internals, branded Arabic-first RTL patient web portal (`/portal` and `/portal/:slug`), self-service slot locking and appointment booking using existing Temporal scheduling engine, GiST exclusion conflict handling (`23P01`), idempotency replay (`bookingKey`), cancellation/rescheduling within clinic rules, and complete audit trail. See [docs/patient-portal.md](patient-portal.md).
2. **5.2 — Patient Consent Review, Secure Recovery Check-ins, Follow-up Self-Service & Patient-Reported Outcomes (implemented):** Patient consent review and self-signing under strict `signerCapacity: 'PATIENT'`, SHA-256 cryptographic evidence digest calculation, `PENDING_VERIFICATION` status transition with clinician verification requirement (`ConsentEligibilityService` fail-closed), refusal/withdrawal workflows, VAS pain scoring (0–10) with automatic clinical escalation on high pain ($\ge 8$) or red-flag symptoms (fever, continuous bleeding), immediate Arabic emergency guidance banner, clinician recovery review queue (`clinical.follow-ups.read`/`update`) with guidance timeline, PROMs submission across standard aesthetic scales, and database-enforced intra-clinic patient isolation via `lamssa_security.patient_row_allows(target_clinic, target_patient)`. See [docs/patient-recovery-self-service.md](patient-recovery-self-service.md).
3. **5.3 — Multi-Branch Clinic Management, Staff Assignments, Scheduling Integration & Controlled Branch Operations (implemented):** Multi-branch organization hierarchy with `ClinicBranch` (physical operating unit per clinic), automated default branch provisioning (`'MAIN'`) and migration backfill, staff branch assignments via `BranchMembership` with primary branch designation, role-based multi-branch authorization (clinic owners/admins manage all branches, operational staff scoped to assigned branches), active operating branch switching (`selectedBranchId`), PostgreSQL GiST exclusion constraints preventing cross-branch practitioner double-booking (`23P01`), two-step controlled inter-branch inventory transfers (`InterBranchTransfer`: `DISPATCHED` ➔ `RECEIVED` with discrepancy audit notes), FORCE RLS across all branch models, and authentic Arabic-first RTL branch management workspace and branch switcher. See [docs/multi-branch-management.md](multi-branch-management.md).
4. **5.4 — Advanced Inventory Costing, Landed Cost Allocation, FIFO Valuation & Accounting Reconciliation (implemented):** Enterprise-grade clinic inventory costing domain models (`InventoryCostLayer`, `InventoryLandedCost`, `InventoryLandedCostAllocationLine`, `InventoryCostMovement`, `InventoryValuationSnapshot`, `InventoryCostAdjustment`, and sequential counters); separation of concerns between physical clinical lot dispensing (`InventoryBatch`, FEFO) and financial inventory valuation (`InventoryCostLayer`, FIFO); deterministic landed cost allocation engine (`BY_VALUE` and `BY_QUANTITY`) with exact integer minor-unit math and remainder attribution; inter-branch stock transfer costing preserving valuation in-transit and receiving at historical unit landed cost with cancelation restitution; clinical consumption and waste cost tracking; opening balance backfill with `UNVERIFIED_COST` and segregated approval (`VERIFIED`); cost revaluation adjustment workflows with dual-control approval; real-time valuation reports and immutable periodic snapshots (`FIFO_ACTUAL_LANDED_COST`); PostgreSQL `FORCE ROW LEVEL SECURITY` across all 10 costing tables with composite foreign keys and database immutability triggers; and comprehensive Arabic-first RTL inventory costing workspace. See [docs/inventory-cost-accounting.md](inventory-cost-accounting.md).
5. **5.5 — Payment Gateway, Banking & Regulatory Integration Foundations (implemented):** Provider-neutral payment orchestration (`PaymentProviderConfiguration`, `PaymentIntent`, `PaymentProviderEvent`, `PaymentSettlement`, `ExternalRefund`, `ExternalPayout`, `ExternalReconciliationRun`, `ExternalReconciliationFinding`) with deterministic `SANDBOX_MOCK` execution and disabled-by-default live stubs (`MOYASAR`, `CHECKOUT_COM`, `STRIPE`, `REGIONAL_BANK_GATEWAY`); AES-256-GCM + HKDF-SHA256 credential encryption at rest; HMAC-SHA256 webhook signature verification with 300-second replay window, `lamssa_security.resolve_payment_webhook_target` (`SECURITY DEFINER`), `FOR UPDATE` concurrency locking, and transactional posting into `Payment` / `Invoice.netPaidMinor` / `FinancialAuditEvent`; segregated external refunds and commission payouts; read-only external reconciliation engine; jurisdiction-aware regulatory e-invoicing foundation (`ClinicRegulatoryProfile`, `RegulatoryDocument`, `RegulatorySubmission`, `RegulatorySubmissionEvent`) supporting `SA_ZATCA` / `AE_FTA` / `GENERIC_TAX_INVOICE` with explicit `MOCK_SUBMITTED` / `NOT_CONFIGURED` boundaries; PostgreSQL `FORCE ROW LEVEL SECURITY` across all 15 new tables (93 total); and Arabic-first RTL integrations workspace. See [docs/payment-regulatory-integrations.md](payment-regulatory-integrations.md).
6. **5.6 — Final Security, Privacy, Financial Integrity & Acceptance (implemented):** Comprehensive independent security and privacy audit across all Phase 5 modules; complete elimination of custom GUC privilege flags (`lamssa.internal_security_lookup`) in PostgreSQL RLS policies replaced with standard `maintenance_owner` policy (`FOR ALL TO owner_name USING (true) WITH CHECK (true)`); authenticated caller hardening for `post_webhook_payment` requiring matching session context, active payable intent, and fresh authoritative `PaymentProviderEvent` (<5 min); negative SQL regression tests verifying runtime isolation; expanded browser smoke tests (43 checks passing) verifying multi-branch workspace, FIFO costing valuation workspace, and patient portal RTL landing; full regression suites passed (186 unit tests, 306 database tests, 1 intentional CREATEDB skip, 43 browser smoke checks, 31 migrations, 93 tables with FORCE RLS); comprehensive technical documentation and acceptance report (`docs/phase-5-final-acceptance.md`). Fully ready for code merge into `main` (production deployment gated on production operational prerequisites).

## Phase 4 — Inventory Operations, Consumables & Point of Sale

1. **4.1 — Inventory Foundation, Product Catalog, Stock Locations & Auditable Movements (implemented):** clinic-scoped product catalog, multi-location hierarchy, append-only immutable stock ledger (`InventoryStockMovement`) with database trigger enforcement, transactional balances (`InventoryBalance`) with row-level locking, opening balance, receipts, issues, transfers, discrepancy adjustments, regulatory clinical consumption gate for injectables, ledger-to-balance mathematical reconciliation (`/stock/reconcile`), 11 granular permissions, FORCE RLS, and authentic Arabic-first RTL inventory workspace.
2. **4.2 — Batch & Lot Tracking, Expiry Management, Product Traceability & Clinical Procedure Consumption (implemented):** physical lot tracking (`InventoryBatch`), multi-location lot balances (`InventoryBatchBalance`), pure calendar date expiry semantics with clinic-local timezone evaluation, quarantine and recall workflows with immutable database trigger guards, First-Expired First-Out (FEFO) recommendation engine, direct clinical procedure consumption (`InventoryClinicalConsumption`) with clinician match validation, verified consent gate via `ConsentEligibilityService`, atomic stock deduction, partial dose & waste tracking, non-destructive voiding with compensating return movement, confidentiality projection for inventory-only roles, 6 granular RBAC permissions, FORCE RLS, and Arabic RTL lots/consumption workspaces.
3. **4.3 — Suppliers, Purchase Orders, Goods Receiving, Stock Corrections & Inventory Alerts (implemented):** clinic-scoped supplier directory with unique codes, commercial registers and tax IDs; multi-line purchase orders (`PO-000001`) with exact `numeric(12, 4)` Decimal financial math and lifecycle approval workflows (`DRAFT` ➔ `SUBMITTED` ➔ `APPROVED` ➔ `PARTIALLY_RECEIVED` ➔ `RECEIVED` / `CANCELLED` / `REJECTED`); delivery note goods receiving (`GR-000001`) with over-receipt prevention, quality disposition (`ACCEPTED`, `QUARANTINED`, `REJECTED`), and automatic batch/expiry registration; systematic physical stocktaking sessions (`SC-000001`) snapshotting balances, real-time variance calculation, and single-transaction compensating stock adjustments upon reconciliation approval; operational alert derivation (low-stock, stock-out, expiry horizons, recalled batches) with configurable snoozing and audit trail; 10 granular permissions, FORCE RLS across all 11 tables, and Arabic RTL procurement workspace.
4. **4.4 — Treatment Packages, Prepaid Session Redemptions, Installment Payment Plans, Refunds & Financial Integrity (implemented):** aesthetic treatment package catalog with published immutable versions (`TreatmentPackage`, `TreatmentPackageVersion`, `TreatmentPackageItem`), patient package purchases and session entitlement tracking (`PatientPackage`, `PatientPackageEntitlement`), append-only session redemptions (`PackageRedemption`) with procedure execution binding, non-destructive redemption reversals (`PackageRedemptionReversal`) restoring available balances, structured installment payment plans (`InstallmentPlan`, `InstallmentSchedule`, `InstallmentAllocation`) with due-date tracking and automated payment allocation, audited refund request governance (`RefundRequest`) with role-segregated approval/rejection and settlement linked directly to `PaymentReversal`, 11 granular permissions, database triggers with `SECURITY INVOKER`, FORCE RLS across all 11 tables, and authentic Arabic-first RTL billing workspace tabs.
5. **4.5 — Practitioner Commissions, Financial Reconciliation & Operational Reporting (implemented):** versioned practitioner commission plans and rule calculation engine (percentage bps with integer half-up rounding, flat amount, gross vs net collected basis), direct practitioner assignments, accrual generation, doctor own statement access, audited adjustments with segregation of duties blocking self-decision, batch settlement creation with monotonic numbering (`COMM-SETTLE-000001`), continuous financial integrity reconciliation across 6 critical domains (invoices, payments, installments, packages, commissions, inventory), 6 executive operational reports (revenue/collections, installment aging buckets, package liabilities, practitioner productivity, inventory valuation, appointment utilization), 11 granular permissions, FORCE RLS across all 7 tables, MFA Step-Up security, and authentic Arabic-first RTL billing workspace tabs.
6. **4.6 — Final Security, Financial Integrity & Acceptance (implemented):** comprehensive security audit across all 36 Phase 4 tables, clinical consumption stock restoration safety audit and fix (disallowing restocking when waste is present, batch quarantine/expiry checks), inventory valuation accounting limitations and audit disclosure banners, dual-custody settlement and refund external evidence distinction in UI, synthetic financial reconciliation discrepancy verification (test 9), regression testing across 149 unit tests, 262 database tests, and 39 browser checks, disaster recovery least-privilege analysis, and final acceptance report (`docs/phase-4-final-acceptance.md`). Ready for code merge into `main`.

## Phase 3 — Clinical Management (Completed & Merged into Main)

1. **3.1 — Clinical consultations and EMR foundation (implemented):** doctor-assigned encounters, structured history, signed-note immutability, append-only amendments, RLS, audit/privacy controls, and Arabic RTL workflow.
2. **3.2 — Treatment plans and aesthetic procedures (implemented):** persistent clinic-owned treatment plans, immutable approved revisions, clinic-defined aesthetic procedure catalog, procedure execution drafting with metadata snapshotting, fail-closed consent gate (`VERIFIED_CONSENT_REQUIRED`), doctor-only RBAC, FORCE RLS, optimistic concurrency, and Arabic RTL treatment planning UI.
3. **3.3 — Informed Consent Forms, Signature Evidence & Procedure Consent Eligibility (implemented):** legal consent templates with immutable published versions, deterministic SHA-256 content digests, digital patient/guardian signature evidence (`DRAWN_BASE64` and `TYPED_CONFIRMATION`) with evidence hash binding, doctor verification workflow, mandatory-reason withdrawal with instant revocation, strict purpose separation (procedure vs clinical photo vs marketing), fail-closed procedure execution gate (`VERIFIED_CONSENT_REQUIRED`), doctor-only RBAC, FORCE RLS, and Arabic RTL UI with printable branded snapshot view.
4. **3.4 — Clinical Photography & Before/After Media Governance (implemented):** private encrypted-at-rest media storage (`AES-256-GCM`), strict `CLINICAL_PHOTOGRAPHY` consent enforcement and purpose separation, Sharp image processing with decompression bomb limits and EXIF stripping, canonical WebP masters and thumbnails, database trigger guards (`clinical_photo_guard`), doctor-only RBAC, FORCE RLS, non-destructive annotations, interactive split-slider comparisons, optimistic concurrency archival, and Arabic RTL UI.
5. **3.5 — Clinical Follow-ups, Recovery Monitoring & Treatment Outcomes (implemented):** structured follow-up assessments with digital doctor signatures, attributable amendments, standardized measurement scales (VAS, 5-point satisfaction, CGI, structured observation), adverse event tracking, terminal status immutability, and Arabic RTL care management.
6. **3.6 — Comprehensive Clinical Security Audit & Final Acceptance (implemented):** full regression verification across 130 unit tests, 226 DB integration tests, 36 browser checks, and clean merge into `main`.

Updated after Step 1.9, 2026-10-26. The user's current scope
supersedes the original separation of workspace/API/database foundation. All
production use remains gated on authentication, isolation and operational controls.

1. **1.1 — Inspect and establish architecture (completed).**
   Recorded the actual frontend state and risks, extracted existing definitions,
   preserved Arabic RTL behavior and demo storage. Committed as `dbb529c`.

2. **1.2 — Workspace, backend, PostgreSQL and clinic identity (completed).**
   Move the frontend intact to `apps/web`; add `apps/api` using NestJS and a single
   npm workspace lockfile. Validate environment/input, constrain CORS, sanitize API
   errors and expose versioned liveness/readiness plus public branding by slug.
   Add development PostgreSQL Compose, Prisma 7 with its pg adapter, initial
   identity migration, optional idempotent fictional clinic seed and tests.
   Entities: Clinic, ClinicBranding, ClinicDomain, User and ClinicMembership.
   Global platform authority is separate from per-clinic roles. No frontend/API
   data integration, authentication, private clinic routes or medical models yet.
   Acceptance: unchanged frontend/storage, build and HTTP checks, Prisma validation
   and migration artifact. Report live migration/test status separately when the
   environment lacks PostgreSQL/Docker. See [development.md](development.md).

   **1.2.1 — Native PostgreSQL verification (completed).** PostgreSQL 16.15 is
   online locally. Development/test migrations are applied; restricted runtime
   permissions, seed idempotency, independent clinic branding, live constraints,
   API readiness and unchanged Arabic frontend flows were verified. Separate
   environment credentials remain private. See the verification record in
   [development.md](development.md). Authentication/RBAC is the next implementation
   step; current public endpoints do not grant private clinic access.

3. **1.3 — Authentication and role-based access control (implemented).**
   Argon2id, explicit local account provisioning, database-backed hashed session
   verifiers, idle/absolute expiry, revocation/rotation, signed/session-bound CSRF,
   exact origins and persistent login limits. Default-deny global guard checks
   active user/clinic/membership and centralized granular permissions on each
   clinic request. Platform authority has no bypass. Arabic RTL login/selection,
   active branding, expired/denied states and labeled unchanged local demos exist.
   Two-clinic HTTP/database tests cover forged context, lifecycle and CSRF. See
   architecture/development for the matrix, commands and executed evidence.
   Recovery/invitations, production identity administration, MFA, scheduled session
   retention and audited support access remain separately scoped follow-up work.

4. **1.4 — Mandatory tenant access and RLS (implemented).**
   Added verified process-local principals, selected-clinic/permission checks in
   interactive tenant transactions, local context settings, FORCE RLS on Clinic,
   ClinicBranding, ClinicDomain and ClinicMembership, immutable ownership and
   restricted runtime grants. Identity/public bootstrap functions have fixed
   projections and hardened ownership/search paths. Maintenance credentials are
   explicit for seed/provisioning; runtime owner misconfiguration fails closed.
   UTC connection configuration fixes the observed adapter expiry mismatch.
   Runtime-role isolation, concurrency, rollback/reuse, auth/public/browser and
   record-preservation checks are recorded in development.md. No patient API yet.

5. **1.5 — Administrative Patient Management (implemented).**
   Added tenant-owned Patient/PatientCounter, clinic-local transactional numbers,
   FORCE RLS, immutable identifiers, restricted runtime grants and explicit status
   changes. Administrative-only DTOs, literal Arabic-normalized prefix search,
   bounded cursor pagination, optimistic versions and safe projections use the
   existing verified tenant boundary. Arabic RTL directory/register/profile/edit
   now persist through the authenticated API; old demos remain separate and intact.
   Runtime database tests and isolated browser journeys cover permissions, CSRF,
   two clinics, concurrency/rollback, stale-response switching and legacy flows.
   No clinical/free-text notes/photos, hard deletion or automatic demo import.
   Change/access audit, durable create idempotency, retention and production
   operational/privacy review remain separate gates before real patient data.

6. **1.6 — Appointments and clinic resources (implemented).**
   Implemented ClinicService, BookableResource, ResourceAvailability, ResourceTimeOff,
   SchedulingState, and Appointment using compound `(clinicId, id)` keys referencing persisted
   active Patients and ClinicMemberships. Enforced doctor and room conflict prevention with
   native PostgreSQL GiST exclusion constraints (`btree_gist` extension), serialized clinic
   transaction locking, and optimistic concurrency versioning. Preserved idempotency keys and
   request hashes. Handled clinic-local time and DST gaps/disambiguation via Temporal. Terminal
   cancellations and no-shows release reservations, while completed and arrived records remain
   immutable. Added full Arabic RTL appointment calendar (day/week/list views), doctor lanes,
   resource settings, and advisory availability. Enforced FORCE RLS across all six tables with
   restricted runtime permissions. Verified through 81 live database tests, 32 unit tests, and
   browser regression. Zero regressions on existing patient management or authentication.

7. **1.7 — Persistent visits and live queues (implemented).**
   Five RLS-protected models, clinic/day transactional numbering and same-clinic FKs.
   Atomic scheduled check-in and idempotent explicit reconciliation of old ARRIVED
   appointments; active walk-ins, duplicate-visit prevention, FIFO call-next with durable
   replay keys and doctor/room partial unique claim indexes across date boundaries.
   Versioned recall/start/complete/absence/cancel/transfer actions synchronize linked
   appointments. Doctor access is limited to the membership-linked resource; receptionist
   service completion and accountant queue access are denied. Arabic reception/doctor
   screens, retained history and opt-in anonymous number-only board use reauthorized SSE
   invalidations plus REST resynchronization. Original local demo remains separate.
   Verification details and current constraints: [development](development.md), [queue](queue.md).

8. **1.8 — Billing and payments — implemented.**
   Seven tenant-owned RLS tables, same-patient visit linkage, clinic-unique transactional
   numbers, exact minor-unit/quantity/discount/tax arithmetic and frozen issued identity
   and line snapshots. Versioned, idempotent manual payments/partial settlement/refunds
   and full erroneous-payment reversals retain an append-only hash-chained audit trail.
   Safe void policy forbids any payment history. Finance RBAC separates owner/accountant,
   reception and clinical/operational roles; SQL policies reinforce those boundaries.
   Arabic directory/editor/payment history, business identity settings, currency-separated
   totals and branded RTL A4 invoice/receipt printing use protected APIs. Legacy invoices
   stay separate. See [billing](billing.md) and actual [verification](development.md).
   Real-market statutory tax/e-invoice rules, credit notes, external gateways/webhooks,
   archival, reconciliation and privileged audit checkpoints remain separate work.

9. **1.9 — Clinic identity administration and white-label delivery — implemented.**
   Versioned private business profile, safe acknowledged/locked currency/timezone
   policy, validated/re-encoded private image drafts and explicit immutable public
   publication. Approved color/font preview, branded app/login/public board and
   preserved issued invoice/receipt snapshots. Four new RLS tables include retained
   subdomain reservations against takeover and trigger-owned configuration audit.
   Custom domain TXT challenges establish ownership only; routing/TLS are deferred.
   Scoped staff listing/role/status changes protect the last owner, prevent admin
   escalation (including receptionist finance grants) and revoke affected sessions without deleting other memberships.
   Platform administration is a distinct authorized read-only foundation. Invitation
   delivery/acceptance and lifecycle commands require additional secure architecture.
   See [identity contracts](clinic-identity.md) and [verification](development.md).

10. **1.10 — Testing, security and release gates.**
    Add tests throughout the steps above, not only here: domain unit tests, real
    PostgreSQL constraints, API contracts, role/tenant negative cases, concurrency
    and full Arabic RTL desktop/mobile browser journeys. Add lint/CI and privacy-
    aware observability. Before real data, demonstrate backup restore, restricted
    deployment roles, audit/redaction, retention, incident response and session/CSRF
    controls. Resolve jurisdiction/hosting/consent requirements with stakeholders.
    Prioritize backup/restore drills for both database and managed assets, audited
    operator provisioning/MFA, invitations/recovery, deployment/TLS/domain activation,
    safe retention/incident response and financial/clinical compliance review.
    Clinical records, consent and protected media need their own reviewed scope;
    they must not reuse the intentionally public clinic-asset channel.

11. **2.1 — Centralized Audit Logging, Secure Backups & Disaster Recovery (implemented).**
    Append-only immutable audit trail with `FORCE ROW LEVEL SECURITY`, tenant isolation,
    and PostgreSQL triggers rejecting mutation/deletion. Covers authentication (login/logout/failures),
    clinic identity/branding, staff administration and role assignments, patient records, appointments,
    queue/visits, and billing/invoicing. Automatic metadata redaction sanitizes PHI, credentials, tokens,
    and payment card numbers. Out-of-band security failure recording via hardened `SECURITY DEFINER`
    function. Dual-mode Arabic RTL audit management interface in clinic settings. Automated AES-256-GCM
    encrypted database backups (`pg_dump -Fc --enable-row-security`) with scrypt KDF, SHA-256 checksums,
    0600 file permissions, and systemd units (`deploy/systemd/`). Automated disaster recovery verification drills
    (`npm run db:backup:drill`) measure RTO and RPO in isolated temporary schemas, with fail-closed tamper
    detection and guards preventing accidental overwrite of active databases.
    See [audit logging](audit-logging.md), [backup and recovery](backup-recovery.md), and [verification](development.md).

12. **2.2 — Security Hardening, Multi-Factor Authentication (MFA) & Step-Up Authorization (implemented).**
    RFC 6238 TOTP engine, encrypted secrets at rest with AES-256-GCM, high-entropy single-use recovery
    codes hashed with salted PBKDF2 (10,000 iterations), 15-minute server-enforced step-up authorization
    (`@RequireStepUp`), active session device management, IP masking, and Arabic RTL security settings interface.
    See [development.md](development.md).

13. **2.3 — Privacy, Data Retention & Data Governance (implemented).**
    Formal 6-tier data inventory (`AUTH_SECRET`, `FINANCIAL`, `SENSITIVE_PERSONAL`, `PERSONAL`, `INTERNAL`, `PUBLIC`),
    data minimization, formula injection sanitization, versioned retention policies with dry-run simulation engine,
    privacy rights requests lifecycle (Access, Rectification, Restriction, Export, Erasure), bounded single-use patient
    data exports, and statutory precedence for immutable audit/financial chains.
    See [privacy-data-governance.md](privacy-data-governance.md).

14. **2.4 — Monitoring, Error Tracking & Reliability (implemented).**
    Zero-dependency, zero-cost observability: structured JSON logging with CIDR network IP masking (IPv4 `/24`, IPv6 `/48`)
    and automated PII/PHI redaction, in-memory rolling metrics buffer (status codes, latency percentiles $p50$, $p95$, $p99$,
    $max$, in-flight requests, failed logins), Prometheus text exposition (`GET /api/v1/metrics`), decoupled error tracking
    and SHA-256 fingerprinting (`ErrorTrackerService`), actionable alerting engine with 15-minute deduplication cooldown
    (`AlertingService`), protected health diagnostics (`GET /api/v1/health/diagnostics`), and native Arabic RTL frontend error
    boundary (`<ErrorBoundary>`) with support correlation IDs (`ERR-XXXXXX`).
    See [monitoring-reliability.md](monitoring-reliability.md).

15. **2.5 — Deployment Infrastructure & Production Verification (implemented locally; launch gated).**
    Multi-stage non-root API/web images, isolated staging Compose topology, PostgreSQL
    private networking, controlled one-shot migration identity, Caddy TLS/host/header/
    upload policy, production fail-closed configuration, private machine-only metrics,
    platform-operator-only diagnostics, encrypted clinic-asset backup/restore and CI
    validation workflow. Local production-mode smoke and security regressions are
    automated. Isolated Docker/TLS journeys and paired DB/assets recovery have been
    exercised locally; the read-only deployment verifier checks actual runtime secret
    boundaries and proxy controls. Recovery checks fail closed on missing evidence.
    Public deployment, DNS/certificate activation, cloud resources, off-site
    immutable copies and jurisdictional approval require explicit owner action.
    See [deployment.md](deployment.md) and
    [production-readiness-checklist.md](production-readiness-checklist.md).

16. **3.1 — Clinical Records, Consultations & Medical History (implemented).**
    Consultation encounters, signed clinical notes, attributable amendments, medical history,
    doctor-only RBAC, composite foreign keys `(clinicId, id)`, `FORCE ROW LEVEL SECURITY`, and database immutability triggers.
    See [clinical-records.md](clinical-records.md).

17. **3.2 — Treatment Plans & Aesthetic Procedures (implemented).**
    Clinic-specific procedure catalogs, versioned treatment plans, immutable approved revisions,
    procedure executions, and fail-closed consent eligibility gates.
    See [treatment-plans.md](treatment-plans.md).

18. **3.3 — Informed Consent Forms, Signature Evidence & Consent Eligibility (implemented).**
    Versioned consent templates with SHA-256 digests, cryptographic signature evidence capture,
    strict purpose separation (`PROCEDURE`, `CLINICAL_PHOTOGRAPHY`, `MARKETING_PHOTOGRAPHY`),
    and live transactional eligibility checks blocking unconsented procedure executions.
    See [informed-consent.md](informed-consent.md).

19. **3.4 — Secure Before-and-After Clinical Photography (implemented).**
    Private media vault with AES-256-GCM encryption at rest, Sharp normalization to WebP,
    EXIF metadata stripping, photo comparison groups, and doctor-only delivery under active consent.
    See [clinical-photography.md](clinical-photography.md).

20. **3.5 — Clinical Follow-ups, Recovery Monitoring & Treatment Outcomes (implemented).**
    Post-procedure follow-up lifecycle (`SCHEDULED`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`, `MISSED`) with
    terminal status immutability, digitally signed clinical assessments (deterministic SHA-256 signatures),
    attributable amendments preserving original records, objective outcome measurement scales
    (`VISUAL_ANALOG_SCALE_10`, `PATIENT_SATISFACTION_5_POINT`, `CLINICAL_GLOBAL_IMPRESSION`, `STRUCTURED_OBSERVATION`),
    adverse events tracking with severity and resolution lifecycles, doctor-only RBAC, composite FKs,
    and database guard triggers blocking deletions and modifications.
    See [clinical-follow-ups.md](clinical-follow-ups.md).

## Migration discipline

- Preserve root development commands and the browser origin used for demo storage.
- Use explicit demo/API modes and never merge local arrays into server records.
- Never reset, clear or auto-import localStorage as part of infrastructure work.
- Apply reviewed migrations; do not reset or force-push an existing database.
- Test with fictional records. Imports later require clinic authorization, validated
  mapping, provenance and rollback planning.
- Document what was actually run, including skipped database tests and deployment
  gates; a successful build does not establish production tenant security.
