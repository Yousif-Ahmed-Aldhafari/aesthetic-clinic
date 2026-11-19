# Pediatrics & Child Health Module Architecture & Clinical Guide

## 1. Overview

The **Pediatrics & Child Health** module (`PEDIATRICS`) is Lamssa's advanced medical specialty module delivered under Phase 8, Step 8.3. It extends Lamssa's modular monolith shared clinical foundation with domain-specific neonatal birth history records, caregiver legal custody and medical consent management, longitudinal pediatric growth analytics based on World Health Organization (WHO 2006) standards, and a deterministic pediatric medication safety preflight engine.

The module strictly preserves Lamssa's existing architectural invariants:
- Shared patient identity, encounters, diagnostic orders, billing, and document repositories.
- Strict PostgreSQL Row-Level Security (FORCE RLS) across all pediatric tables.
- Immutability guarantees for finalized growth measurements and birth histories, supported by attributable versioned amendments.
- Safe clinical decision support that flags critical contraindications and stale weight measurements without unvalidated dosage generation.
- Authentic Arabic-first right-to-left (RTL) clinical UX and WCAG 2.1 AA accessible tabular alternatives for growth charts.

---

## 2. Neonatal Birth History & Perinatal Records

### 2.1 Data Architecture (`PediatricBirthHistory`)
Neonatal and birth history data is modeled in the `PediatricBirthHistory` table, linked to the shared `Patient` record:
- **Gestational Age:** Validated in weeks (20–45) and additional days (0–6). Gestational age $< 37$ weeks triggers the `isPreterm` clinical flag.
- **Birth Anthropometrics:**
  - `birthWeightGrams`: 300 to 8,000 g.
  - `birthLengthCm`: 20.0 to 70.0 cm.
  - `birthHeadCircumferenceCm`: 15.0 to 50.0 cm.
- **APGAR Scoring:** 1-minute, 5-minute, and optional 10-minute scores (0–10 each).
- **Delivery Mode (`DeliveryMode`):**
  - `VAGINAL`: Spontaneous vaginal delivery.
  - `CESAREAN_PLANNED`: Elective / scheduled Cesarean section.
  - `CESAREAN_EMERGENCY`: Urgent / emergency Cesarean section.
  - `ASSISTED_VACUUM`: Vacuum-assisted vaginal extraction.
  - `ASSISTED_FORCEPS`: Forceps-assisted delivery.
  - `OTHER`: Other obstetric delivery mode.
- **Birth Type (`BirthType`):** `SINGLETON`, `TWIN`, `TRIPLET`, `HIGHER_ORDER_MULTIPLE`.
- **Perinatal Risk Factors & Complications:** Maternal complications, birth complications, NICU admission requirement and stay days, blood type, newborn hearing and metabolic screening notes, congenital anomalies, and consanguinity (parental kinship).
- **Information Provenance (`BirthHistorySource`):**
  - `HOSPITAL_DISCHARGE_SUMMARY`: Official hospital discharge report.
  - `BIRTH_CERTIFICATE`: Certified government birth record.
  - `IMMUNIZATION_CARD`: Official national vaccination card.
  - `EXTERNAL_EHR`: Verified electronic medical record exchange.
  - `PARENT_RECALL`: Verbal report from family/caregivers.

### 2.2 Attributable Versioned Amendments
To satisfy clinical governance standards, birth history records cannot be quietly modified. Once created, any correction (e.g., updating birth weight based on hospital records) requires:
1. `expectedVersion` optimistic locking check.
2. Mandatory `amendmentReason` (minimum 3 characters).
3. The previous state is archived into `amendmentHistory` (JSON array) with timestamp, practitioner membership ID, and clinical justification.
4. An immutable `CLINICAL` audit event is written to `AuditEvent`.

---

## 3. Caregiver Relationships & Legal Authorization

### 3.1 Authorization Separation (`PatientCaregiverRelationship`)
Caregivers for pediatric patients carry distinct legal and operational roles. Lamssa separates these responsibilities into explicit boolean fields:
- **`hasLegalCustody`:** Legal parental custody or court-appointed guardianship. Required for fundamental legal decisions and long-term care management.
- **`hasMedicalConsentAuthority`:** Authorized to sign informed-consent documents for diagnostic, surgical, or therapeutic procedures.
- **`isEmergencyContact` & `emergencyPriority`:** Designated contact order (1, 2, 3...) during acute medical situations.
- **`portalProxyAccess`:** Granted proxy credentials to access the child's patient portal (view appointments, growth records, laboratory results).

### 3.2 Relationship Taxonomy (`CaregiverRelationshipType`)
- `MOTHER`: Biological or legal mother.
- `FATHER`: Biological or legal father.
- `LEGAL_GUARDIAN`: Court-appointed guardian.
- `GRANDPARENT`: Paternal or maternal grandparent.
- `SIBLING_ADULT`: Adult sibling ($\ge 18$ years).
- `FOSTER_PARENT`: Authorized foster parent.
- `CASE_WORKER`: Child protection or social care case worker.
- `OTHER`: Other legally documented representative.

### 3.3 Revocation & Auditability
When caregiver authorization is terminated (e.g., custody modification or proxy revocation):
- The relationship record is never deleted.
- `isRevoked` is set to `true`, stamping `revokedAt`, `revokedByMembershipId`, and mandatory `revocationReason`.
- The patient portal immediately denies proxy session authentication for revoked caregivers.

---

## 4. Longitudinal Growth Analytics & WHO Standards

### 4.1 Pediatric Growth Records (`PediatricGrowthRecord`)
Growth measurements are recorded longitudinally and linked to clinic encounters:
- `weightKg`: Decimal (0.300 to 250.000 kg).
- `statureCm`: Decimal (20.00 to 250.00 cm).
- `statureMethod`: `RECUMBENT_LENGTH` (lying down) vs `STANDING_HEIGHT` (standing up).
- `headCircumferenceCm`: Decimal (15.00 to 70.00 cm, primarily for ages 0–36 months).
- `bodyMassIndex`: Automatically calculated as $\text{weight (kg)} / \left(\frac{\text{stature (cm)}}{100}\right)^2$.
- `measurementSource`: `CLINICAL_ENCOUNTER`, `NURSE_TRIAGE`, `COMMUNITY_SCREENING`, `HISTORICAL_RECORD`.
- `deviceIdentifier`: Serial number or calibration ID of medical scale / stadiometer.

### 4.2 Mathematical Model: WHO 2006 Child Growth Standards
Lamssa incorporates the WHO Child Growth Standards (0–60 months / 5 years) utilizing the LMS (Box-Cox Power Exponential) mathematical framework:

#### 1. LMS Z-Score Formula
For a given measurement $X$, with reference parameters $L$ (power transformation), $M$ (median), and $S$ (coefficient of variation):
$$Z = \frac{\left(\frac{X}{M}\right)^L - 1}{L \times S} \quad (L \ne 0)$$
$$Z = \frac{\ln(X / M)}{S} \quad (L = 0)$$

#### 2. Percentile Calculation
Percentile $P$ is derived from the standard normal cumulative distribution function $\Phi(Z)$:
$$P = \Phi(Z) \times 100$$
Calculated using the high-precision error function approximation:
$$\Phi(Z) = \frac{1}{2} \left[1 + \text{erf}\left(\frac{Z}{\sqrt{2}}\right)\right]$$

#### 3. Prematurity Corrected Age Formula
For children born preterm ($< 37$ weeks gestation) evaluated under 24 months of age:
$$\text{DeficitDays} = (40 - \text{GestationalWeeks}) \times 7 - \text{GestationalDays}$$
$$\text{CorrectedAgeDays} = \text{ChronologicalAgeDays} - \text{DeficitDays}$$
The clinical practitioner can toggle between chronological age and corrected age in growth charts to evaluate development relative to biological maturity.

#### 4. Stature Method Selection & Clinical Correction
- **Recommended Method:**
  - Age $< 730$ days (2 years): `RECUMBENT_LENGTH` (infantometer).
  - Age $\ge 730$ days (2 years): `STANDING_HEIGHT` (stadiometer).
- **Recumbent vs Standing Correction:**
  - Recumbent length is systematically $0.7\text{ cm}$ greater than standing height.
  - If a child $< 2$ years is measured standing: $X_{\text{effective}} = X_{\text{measured}} + 0.7\text{ cm}$.
  - If a child $\ge 2$ years is measured recumbent: $X_{\text{effective}} = X_{\text{measured}} - 0.7\text{ cm}$.

### 4.3 Immutability & "Entered-in-Error" Lifecycle
Finalized growth measurements cannot be updated or destroyed:
- When an erroneous measurement is detected (e.g., incorrect scale transcription), the clinician executes an **Enter in Error** action.
- The record status transitions to `ENTERED_IN_ERROR`, requiring an `errorReason` and stamping the current practitioner ID.
- Erroneous records are excluded from active growth charts and analytics but remain permanently preserved in database audit logs and history views.
- Supported by the PostgreSQL trigger `lamssa_security.pediatric_growth_immutability_guard()`.

---

## 5. Pediatric Medication Safety Preflight Engine

### 5.1 Safety Philosophy: Gatekeeper without Auto-Dosing
To safeguard pediatric patients from adverse drug events and prevent automated dosage calculation errors:
- **No Automated Dosing Generation:** Lamssa never calculates or recommends unvalidated milligram doses. The licensed clinician retains full prescriptive authority and accountability.
- **Preflight Gatekeeping:** The engine performs preflight verification across three critical safety dimensions:
  1. Current weight recency and age cohort staleness thresholds.
  2. Severe age- and development-based pediatric contraindications.
  3. Known allergy and cross-reactivity conflicts.

### 5.2 Weight Recency Staleness Rules
Because children experience rapid growth and fluid redistribution, weight-based prescribing requires fresh clinical measurements:
| Age Cohort | Age Span | Max Allowed Weight Staleness |
| :--- | :--- | :--- |
| **Neonate & Infant** | 0 to 365 days (< 1 year) | **7 days** |
| **Child** | 1 to 12 years | **30 days** |
| **Adolescent** | 12 to 18 years | **90 days** |
| **Adult** | $\ge 18$ years | **180 days** |

- If no weight is recorded in the patient file: **`CRITICAL` Alert — Prescribing Blocked.**
- If the weight exceeds the staleness threshold: **`WARNING` Alert — Re-measurement Strongly Recommended.**

### 5.3 Evidence-Based Contraindication Rules
| Medication Class / Agent | Age Boundary | Severity | Clinical Rationale & Evidence |
| :--- | :--- | :--- | :--- |
| **Aspirin / Acetylsalicylic Acid** | Age $< 19$ years | `CRITICAL` | Severe risk of **Reye Syndrome** (acute hepatic failure and encephalopathy) following viral illness. |
| **Tetracyclines** (e.g. Doxycycline, Tetracycline) | Age $< 8$ years | `WARNING` | Permanent enamel hypoplasia and brown/yellow tooth discoloration; incorporates into growing bones. |
| **Fluoroquinolones** (e.g. Ciprofloxacin, Levofloxacin) | Age $< 18$ years | `WARNING` | Risk of cartilage damage, arthropathy, and tendon rupture in weight-bearing joints during growth phases. |
| **Codeine & Tramadol** | Age $< 12$ years | `CRITICAL` | Risk of ultra-rapid CYP2D6 metabolism leading to fatal respiratory depression and death. |
| **Promethazine** | Age $< 2$ years | `CRITICAL` | Severe, potentially fatal respiratory depression and neurological adverse effects in infants. |
| **Ceftriaxone** | Age $\le 28$ days (Neonate) | `CRITICAL` | Displaces bilirubin from albumin causing kernicterus; precipitates with calcium causing biliary and renal sludging. |

### 5.4 Allergy & Cross-Reactivity Verification
The engine verifies documented patient allergies against the proposed agent:
- Direct substance matches (e.g., patient allergic to Amoxicillin prescribed Amoxicillin).
- Beta-lactam / Penicillin cross-reactivity (patient allergic to Penicillin prescribed Augmentin, Ampicillin, or Cephalosporins).
- Sulfonamide cross-reactivity (patient allergic to Sulfa prescribed Trimethoprim-Sulfamethoxazole).

---

## 6. Security, Authorization & Clinical Privileges

### 6.1 Clinical Privilege Codes
Pediatric clinical documentation requires verified qualifications and explicit privilege approval:
- **`PEDIATRIC_CARE_DOCUMENT`:** Authority to create, sign, and amend general pediatric clinical consultation notes.
- **`PEDIATRIC_GROWTH_RECORD`:** Authority to record and enter-in-error pediatric anthropometric growth measurements.
- **`PEDIATRIC_GROWTH_REVIEW`:** Authority to review, evaluate, and sign off on longitudinal growth trajectories and nutritional plans.
- **`PEDIATRIC_BIRTH_HISTORY_VERIFY`:** Authority to verify, certify, and amend neonatal birth records.

### 6.2 PostgreSQL Row-Level Security
All pediatric tables (`PediatricBirthHistory`, `PatientCaregiverRelationship`, `PediatricGrowthRecord`) enforce PostgreSQL FORCE RLS:
- Tenant isolation enforced strictly by `clinicId = current_setting('lamssa.clinic_id', true)::uuid`.
- Cross-clinic reading and tampering fail closed at the database level.
- Non-clinical roles (e.g., receptionists, billing clerks) are blocked from creating or amending clinical birth histories and growth measurements.

---

## 7. RTL Clinical UX & Accessibility Standards

### 7.1 Arabic-First Interface
The Pediatric Clinical Workspace (`PediatricWorkspace.tsx`) is designed with native Arabic RTL typography (Cairo) and medical terminology:
- Clear tabbed layout:
  1. 📏 القياسات والنمو (Growth Records)
  2. 📈 مخططات النمو (WHO Growth Charts)
  3. 📊 جدول القياسات المتاح (Accessible WCAG Table View)
  4. 📋 التاريخ الولادي (Perinatal & Birth History)
  5. 🛡️ أولياء الأمور والمفوضون (Caregivers & Custody)
  6. 💊 تدقيق الأمان الدوائي (Medication Safety Preflight)

### 7.2 Interactive SVG Growth Charts
- Visualizes WHO curves for 3rd, 15th, 50th, 85th, and 97th percentiles across four views:
  - Weight-for-Age (WFA)
  - Length/Height-for-Age (LHFA)
  - Head Circumference-for-Age (HCFA)
  - BMI-for-Age (BMIFA)
- Preterm toggle allows immediate visual comparison between chronological age and corrected age.

### 7.3 WCAG 2.1 AA Tabular Alternative (`AccessibleGrowthTable.tsx`)
In accordance with accessibility guidelines for clinical data visualizations:
- Provides a semantic `<table>` alternative containing all longitudinal measurements, chronological and corrected ages, exact WHO Z-scores, and percentiles.
- Screen-reader accessible with `caption`, `scope="col"`, `scope="row"`, and high-contrast text.

---

## 8. Summary of Migration 042

Migration `20261118000200_pediatrics_growth_caregiver`:
- **New Tables:** `PediatricBirthHistory`, `PatientCaregiverRelationship`, `PediatricGrowthRecord`.
- **New Enums:** `DeliveryMode`, `BirthType`, `BirthHistorySource`, `CaregiverRelationshipType`, `StatureMeasurementMethod`, `MeasurementSource`, `GrowthRecordStatus`.
- **Privileges Added:** `PEDIATRIC_CARE_DOCUMENT`, `PEDIATRIC_GROWTH_RECORD`, `PEDIATRIC_GROWTH_REVIEW`, `PEDIATRIC_BIRTH_HISTORY_VERIFY`.
- **Database Functions & Triggers:** `lamssa_security.pediatric_growth_immutability_guard()` enforcing final record immutability.
- **FORCE RLS:** Enabled across all new tables with tenant policies for `SELECT`, `INSERT`, `UPDATE`, `DELETE`.
