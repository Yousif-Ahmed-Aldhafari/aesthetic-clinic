# Lamssa — Phase 6, Step 6.1 Architectural Assessment & Readiness Report

**Version:** 1.0.0 (Phase 6, Step 6.1 Assessment)
**Date:** 2026-11-13
**Status:** Architecture Design Complete — Ready for Step 6.2 Implementation
**Language:** English (Technical Assessment)
**Repository:** `/mnt/samsungSSD/Downloads/aesthetic-clinic`
**Active Branch:** `phase/6-general-medical`
**Base Commit:** `fe87e2b247716263b25ea059ad9ec86660ea3ee3` (Merge commit of Phase 5 into `main`)

---

## 1. Executive Summary & Strategic Mission

Lamssa is transitioning from a specialized aesthetic clinic SaaS into a comprehensive, multi-tenant outpatient medical platform. The platform must support general medicine, dermatology, pediatrics, obstetrics and gynecology, ophthalmology, dentistry, orthopedics, ear, nose & throat (ENT), physiotherapy, and other outpatient disciplines, while maintaining 100% operational fidelity and zero data loss for existing aesthetic clinic clients.

Phase 6, Step 6.1 is an exhaustive **architectural assessment and design milestone**. In accordance with the governing charter, no code modifications, schema changes, migration executions, or test alterations were performed in this step. Instead, an implementation-ready architectural specification, additive migration blueprint, specialty evolution roadmap, and technical assessment have been established.

All deliverables confirm that Lamssa can expand cleanly into a general medical platform by introducing a shared clinical foundation alongside the existing operational core, while preserving existing aesthetic workflows through a dual-track architectural coexistence strategy.

---

## 2. Comprehensive Codebase Baseline Audit

An exhaustive audit of the Phase 5 codebase baseline (`fe87e2b`) was conducted to evaluate existing domain boundaries, security invariants, and database models:

### 2.1 Database Schema & Tenancy Metrics
- **Total Prisma Models:** 104 distinct database models defined in `apps/api/prisma/schema.prisma`.
- **PostgreSQL Tables with `FORCE ROW LEVEL SECURITY`:** 93 tenant-isolated operational and financial tables.
- **Applied Production Migrations:** 32 sequential, immutable migrations (`20261026000000_init_identity_schema` through `20261112000200_webhook_caller_hardening`).
- **PostgreSQL Database Extensions:** `uuid-ossp`, `pgcrypto`, `btree_gist` (enforcing temporal and resource GiST exclusion constraints).
- **Session Tenancy Pattern:** Session variable `lamssa.clinic_id` evaluated inside `lamssa_security.context_allows` with dual-session tenant/patient isolation.

### 2.2 Aesthetic-Specific vs Specialty-Neutral Inventory & Domain Audit

The table below catalogs existing clinical and operational domains, classifying their specialty dependence and assessing the architectural requirements for Phase 6 expansion:

| Domain / Model Group | Specialty Affinity | Existing Implementation Characteristics | Expansion Strategy in Phase 6 |
| :--- | :--- | :--- | :--- |
| **Identity & Tenancy** (`Clinic`, `ClinicBranch`, `User`, `ClinicMembership`, `BranchMembership`) | Specialty-Neutral | Foundation for multi-tenant isolation, branch scoping, and staff RBAC. | Extend via `MedicalSpecialty`, `ClinicSpecialty`, `BranchSpecialty`, and `PractitionerProfile`. |
| **Scheduling & Queues** (`Appointment`, `VisitQueue`, `BookableResource`, `ResourceAvailability`) | Specialty-Neutral | Temporal appointment slots, GiST doctor/room exclusion constraints, walk-in queues. | Fully retained; bind appointments to general medical consultation services. |
| **Billing & Invoicing** (`Invoice`, `InvoiceLine`, `Payment`, `PaymentSettlement`, `PaymentReversal`) | Specialty-Neutral | Minor-unit integer financial math, immutable issued invoice snapshots, ZATCA e-invoicing. | Retained intact; bill general medical consultations via `ClinicService`. |
| **Patient Demographics** (`Patient`, `PatientAccount`, `PatientSession`) | Specialty-Neutral | Clinic-isolated patient demographic records, portal authentication, and session management. | Retained intact; augment with longitudinal clinical summary projections. |
| **Inventory & FIFO Costing** (`InventoryProduct`, `InventoryBatch`, `InventoryCostLayer`, `InventoryStockMovement`) | Specialty-Neutral | Two-tier lot tracking (FEFO) and financial landed cost valuation (FIFO). | Retained intact; general medical supplies (vaccines, consumables, pharmaceuticals) utilize existing catalog without modification. |
| **Clinical Consumption** (`InventoryClinicalConsumption`) | Aesthetic-Bound | Binds lot consumption directly to `ProcedureExecution` foreign key. | Add polymorphic consumption adapter allowing inventory deduction from general clinical orders and outpatient dispensing. |
| **Clinical EMR Core** (`ClinicalEncounter`, `ClinicalNote`, `ClinicalNoteAmendment`, `PatientMedicalHistory`) | Semi-Neutral | Encounter containers, signed notes with SHA-256 digests, append-only amendments. | Reusable core; add child entities for vitals, diagnoses, allergies, and prescriptions. |
| **Treatment Plans & Procedures** (`AestheticProcedureCatalog`, `TreatmentPlan`, `TreatmentPlanRevision`, `TreatmentPlanItem`, `ProcedureExecution`) | Aesthetic-Specific | Multi-session staged cosmetic plans, session ordering, cosmetic aftercare. | Preserved completely for aesthetics under **Approach B**; general medical care bypasses treatment plans via direct encounter workflows. |
| **Informed Consent** (`ConsentTemplate`, `PatientConsent`, `ConsentSignatureEvidence`) | Aesthetic-Focused | Template versions, cryptographic evidence digests, procedure catalog binding. | Generalized to support medical procedure consents, general surgical consents, and sedation consents. |
| **Clinical Photography** (`ClinicalPhotoSession`, `ClinicalPhotoAsset`, `ComparisonGroup`) | Aesthetic-Focused | Private AES-256-GCM vault, WebP normalization, split comparisons. | Preserved for dermatology/aesthetics; general medical imaging files managed under `ClinicalDocument`. |
| **Commissions & Packages** (`TreatmentPackage`, `PackageRedemption`, `PractitionerCommissionRule`) | Aesthetic-Focused | Prepaid session redemptions, doctor procedural commission accruals. | Preserved intact for aesthetic revenue streams; general medical doctors compensated via flat consultation fees or standard commission plans. |

---

## 3. Three-Layer Modular Architecture Summary

To support outpatient medical expansion while safeguarding aesthetic operations, Lamssa implements a structured **Three-Layer Modular Monolith Architecture**:

```
+-----------------------------------------------------------------------------------+
|               LAYER C: SPECIALTY WORKSPACES (PLUGGABLE CAPABILITIES)              |
|  - Aesthetics: Photographic Split Comparisons, Botox/Filler Units, Packages       |
|  - General Medicine: SOAP Consultation, Preventive Screening, Chronic Reviews     |
|  - Pediatrics: WHO Growth Percentiles, Mandatory Childhood Immunization Schedules  |
|  - Ob/Gyn: Antenatal Flowcharts, Gestational Calculator, Gravida/Para Tracking    |
|  - Dentistry: Interactive Visual Odontogram, Tooth-Specific Periodontal Charting  |
|  - Ophthalmology: Visual Acuity (Snellen/LogMAR), Spectacle/Contact Refractions   |
|  - Physiotherapy: Joint Range of Motion (Goniometry), Functional Rehab Plans      |
+-----------------------------------------------------------------------------------+
                                         │
                                         ▼
+-----------------------------------------------------------------------------------+
|               LAYER B: SHARED CLINICAL FOUNDATION (NEUTRAL MEDICAL CORE)          |
|  - Clinical Encounters, Longitudinal Medical History, Attributable Notes          |
|  - Structured Observations & Vital Signs (BP, HR, RR, Temp, SpO2, Height, Weight) |
|  - Problem List & Encounter Diagnoses (ICD-10 Coded + Clinical Free-Text)         |
|  - Patient Allergies & Adverse Drug Reactions with Red-Flag Safety Banners       |
|  - Outpatient Medication Records & e-Prescriptions with Digital Signatures         |
|  - Clinical Diagnostic Orders (Laboratory & Diagnostic Imaging) & Result Ingestion |
|  - Dynamic Structured Clinical Forms (JSON Schema Engine & Versioned Templates)   |
|  - Informed Consents, Cryptographic Evidence Capture & Legal Withdrawals          |
+-----------------------------------------------------------------------------------+
                                         │
                                         ▼
+-----------------------------------------------------------------------------------+
|               LAYER A: SHARED OPERATIONAL CORE (TENANT INFRASTRUCTURE)            |
|  - Clinic Tenancy & Multi-Branch Hierarchy (FORCE ROW LEVEL SECURITY)            |
|  - User Identity, Argon2id Authentication, Granular RBAC, Session Management      |
|  - Specialty Registry & 3-Tier Clinical Privileging (State Machine Authorization)|
|  - Unified Scheduling Engine, GiST Exclusion Conflict Guards, Walk-in Queues      |
|  - Financial Invoicing, ZATCA / FTA Regulatory Integrations, Payment Webhooks     |
|  - Inventory Management, FEFO Lot Tracking, Landed Cost FIFO Valuation            |
|  - Immutable Audit Logging, AES-256-GCM Encryption Vault, Disaster Recovery       |
+-----------------------------------------------------------------------------------+
```

---

## 4. Architectural Decision Records (ADRs)

### ADR 1: Approach B (Dual-Track Coexistence) vs Approach A (In-Place Renaming)
- **Status:** APPROVED & ADOPTED
- **Context:** `AestheticProcedureCatalog` has 6 active foreign key constraints (`TreatmentPlanItem`, `ConsentTemplate`, `PatientConsent`, `TreatmentPackageItem`, `PatientPackageEntitlement`, `PractitionerCommissionRule`). Approach A proposed renaming this table to `ClinicalProcedureCatalog` and expanding it for all medical consultations.
- **Decision:** Adopt **Approach B (Dual-Track Coexistence)**. The existing aesthetic models remain completely unchanged. A new entity, `GeneralClinicalService`, is introduced for outpatient medical visits, laboratory tests, and imaging procedures. A unified abstraction service (`ClinicalProcedureAdapterService`) links billing `ClinicService` polymorphically to either catalog.
- **Consequences:**
  - Zero database locks or schema rewrites on active aesthetic tables.
  - 100% backward compatibility for existing aesthetic clinics, consent digests, and commission ledgers.
  - General medical workflows operate with minimal overhead, requiring zero synthetic treatment plans.

### ADR 2: Three-Tier Clinical Authorization and Administrative Least Privilege
- **Status:** APPROVED & ADOPTED
- **Context:** In multi-specialty practices, administrative roles (e.g., Clinic Owner, Accountant, Receptionist) must not access confidential clinical notes or diagnostic results, and clinicians must only operate within their verified specialty and credentialed privileges.
- **Decision:** Establish a Three-Tier Clinical Authorization Engine:
  1. *Tier 1 (Facility Scope):* `ClinicSpecialty` and `BranchSpecialty` govern which clinical specialties are enabled at the clinic and branch levels.
  2. *Tier 2 (Professional Scope):* `PractitionerSpecialty` verifies a practitioner's specialty qualifications, medical license numbers, and active dates.
  3. *Tier 3 (Operational Scope):* `PractitionerClinicalPrivilege` grants specific clinical capabilities (e.g., `PRESCRIBE_MEDICATIONS`, `ORDER_LABS`, `PERFORM_SURGICAL_PROCEDURES`) subject to Medical Director approval.
  Furthermore, enforce least privilege administrative isolation: `CLINIC_OWNER` and `CLINIC_ADMIN` roles have zero unconsented access to confidential clinical charts (`ClinicalNote`, `ClinicalObservation`, `EncounterDiagnosis`, `ClinicalOrderResult`) unless they hold a verified clinical role and are part of the direct care team.
- **Consequences:**
  - Robust patient privacy compliance (GDPR, Saudi MOH, UAE DOH standards).
  - Explicit delegation of medical authority through a formal credentialing workflow.

### ADR 3: Hybrid Relational + JSON Schema Dynamic Forms Engine
- **Status:** APPROVED & ADOPTED
- **Context:** Different medical specialties require highly customized documentation forms (e.g., pediatric developmental milestones, obstetric prenatal checklists, ophthalmology refraction sheets). Hardcoding a database table for every clinical form causes schema sprawl and migration friction.
- **Decision:** Adopt a **Hybrid Storage Strategy**:
  - Core clinical facts (Vital Signs, ICD-10 Diagnoses, Allergies, Active Prescriptions, Clinical Orders) are stored in fully indexed, normalized relational tables (`Layer B`) to support deterministic querying, reporting, and safety validations.
  - Specialty-specific clinical templates are managed via `ClinicalFormDefinition` with JSON Schema (Draft 7 / 2020-12) validation and version immutability (`PUBLISHED`). Completed responses are stored in `ClinicalFormResponse` with immutable JSON data payloads and cryptographic signing.
- **Consequences:**
  - Maximum flexibility for adding new medical specialties without database schema migrations.
  - High-performance relational querying for critical medical alerts, problem lists, and cross-encounter longitudinal trends.

### ADR 4: Terminology Neutrality and Arabic-First Localization
- **Status:** APPROVED & ADOPTED
- **Context:** The existing user interface contains aesthetic-specific terminology (e.g., "Session", "Treatment Plan", "Touch-up") that is inappropriate for general medicine, pediatrics, or cardiology.
- **Decision:** Implement dynamic terminology tokenization (`useTerminology()`) keyed to the active consultation specialty context:
  - Aesthetics: "الجلسة العلاجية" (Treatment Session) | "خطة العلاج التجميلي" (Aesthetic Treatment Plan).
  - General Medicine: "الاستشارة الطبية" (Medical Consultation) | "التشخيص وخطة الرعاية" (Diagnosis & Care Plan).
  - Dentistry: "زيارة فحص الأسنان" (Dental Visit) | "مخطط الأسنان السريري" (Odontogram).
  - Pediatrics: "فحص طب الأطفال" (Pediatric Examination) | "سجل التطعيمات والنمو" (Growth & Vaccine Record).
- **Consequences:**
  - Intuitive, native RTL user experience tailored to each medical specialty without duplicating frontend codebases.

---

## 5. Technical Risks, Mitigations & Migration Invariants

| Risk Category | Identified Risk | Architectural Mitigation Strategy |
| :--- | :--- | :--- |
| **Database Performance** | Table locks during multi-table additive migrations. | Use PostgreSQL additive DDL with default values added safely; avoid heavy column rewrites. |
| **Data Integrity** | Existing aesthetic records corrupted by general medical features. | Zero modifications to existing aesthetic tables; separate new clinical tables with composite `(clinicId, id)` foreign keys. |
| **Tenant Isolation** | Cross-tenant medical chart data leakage. | Enforce PostgreSQL `FORCE ROW LEVEL SECURITY` across all new Phase 6 tables (`033`–`037`) using `lamssa_security.context_allows`. |
| **Clinical Safety** | Clinicians prescribing drugs to patients with severe documented allergies. | Mandatory server-side pre-flight allergy cross-checks during `MedicationPrescription` creation; non-bypassable warning flags. |
| **Administrative Privilege Abuse** | Clinic owners reading private psychiatric or medical consultation notes. | Default-deny access to clinical chart tables for non-clinical administrative roles enforced via RBAC and database security policies. |

---

## 6. Formal Readiness Verdict

### Assessment Checklist:
- [x] Baseline Git state inspected and verified on `phase/6-general-medical` at `fe87e2b`.
- [x] 104 Prisma models and 93 RLS tables thoroughly audited.
- [x] Zero-data-loss additive migration strategy formulated and documented.
- [x] Three-layer architectural model defined with full domain boundary specifications.
- [x] Minimal general medicine workflow decoupled from aesthetic catalog validated.
- [x] Multi-tier clinical authorization and administrative privacy boundaries specified.
- [x] Four key Architectural Decision Records established and ratified.
- [x] Production readiness deferred to Phase 7; deep specialty modules scheduled for Phase 8+.
- [x] Zero code, migration, or test modifications executed in this step.

### Formal Verdict:
**READY FOR PHASE 6, STEP 6.2 IMPLEMENTATION.**
The architectural blueprints, migration contracts, and specialty roadmaps provide an authoritative, implementation-ready foundation for implementing the Specialty Registry, Practitioner Qualifications, and Clinical Privilege Engine in Step 6.2.
