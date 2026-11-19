# Obstetrics & Gynecology (OB_GYN) Architecture & Clinical Guide

## 1. Overview

The **Obstetrics & Gynecology** module (`OB_GYN`) is Lamssa's advanced medical specialty module delivered under Phase 8, Step 8.4. It extends Lamssa's shared clinical platform with longitudinal maternal-fetal pregnancy episodes, clinician-controlled gestational dating and estimated due-date (EDD) provenance, structured antenatal flowsheet observations with automated pre-eclampsia screening, prior obstetric delivery history with uterine rupture alerts, and confidential gynecological examination records with server-side data segregation and chaperone governance.

The module preserves Lamssa's core architectural invariants:
- **Shared Clinical Foundation:** Directly integrates with shared patients, clinical encounters, diagnostic orders, clinical documents, inventory, appointments, and billing without duplicated identities.
- **Strict Tenant Isolation:** Enforced via PostgreSQL FORCE Row-Level Security (`FORCE ROW LEVEL SECURITY`) on all four module tables: `PregnancyEpisode`, `AntenatalVisitRecord`, `ObstetricHistoryRecord`, and `GynecologicalExamination`.
- **Clinical Safety Immutability:** Finalized antenatal visits and gynecological examinations are protected by database trigger `lamssa_security.obgyn_record_immutability_guard()`, which rejects in-place mutations (error `42501`) and permits only auditable, reason-bearing `ENTERED_IN_ERROR` status transitions.
- **Biologically Appropriate Validation:** Obstetric pregnancy episodes reject registration for male patients with clean 400 Bad Request boundaries.
- **Server-Side Segregation of Confidential Intimate Findings:** Intimate gynecological exam fields (`externalGenitaliaFindings`, `speculumExaminationFindings`, `bimanualExaminationFindings`) are stripped server-side before response transmission for unauthorized or non-clinical roles.
- **Authentic Arabic-First RTL Workspace:** Accessible, responsive right-to-left user interfaces tailored to maternal care workflows.

---

## 2. Longitudinal Pregnancy Episode Records (`PregnancyEpisode`)

### 2.1 Clinical Lifecycle & Multi-Gestation Tracking
Pregnancy care spans extended time horizons that cannot be modeled as isolated single-day encounters. The `PregnancyEpisode` entity represents a continuous gestational lifecycle:
- **Episode Numbering:** Sequential per patient (`episodeNumber`), preserving complete maternal obstetric parity across admissions.
- **Lifecycle Statuses (`PregnancyEpisodeStatus`):**
  - `ACTIVE`: Current ongoing pregnancy receiving antenatal monitoring. Only one episode can be active per patient at any time (enforced via database unique partial indexing).
  - `COMPLETED`: Successful full-term or preterm delivery with documented outcome.
  - `TERMINATED`: Ectopic, molar, therapeutic, or spontaneous pregnancy termination.
  - `TRANSFERRED_OUT`: Care transferred to tertiary hospital or external maternal center.
  - `ENTERED_IN_ERROR`: Voided administrative entry with attributable reason.
- **Parity & Gravidity Accounting (GPA / TPAL):**
  - `gravidity`: Total number of pregnancies (including current).
  - `parity`: Total number of deliveries $\ge 20$ weeks.
  - `termDeliveries` ($T$): Deliveries $\ge 37$ completed weeks.
  - `pretermDeliveries` ($P$): Deliveries between 20w0d and 36w6d.
  - `abortions` ($A$): Spontaneous miscarriages or terminations $< 20$ weeks.
  - `livingChildren` ($L$): Currently living children.
- **Multiple Gestation:** Singleton, twins, triplets, or higher-order gestations (`multipleGestationCount`).
- **High-Risk Flags:** Maternal co-morbidities, gestational diabetes, hypertension, or advanced maternal age require explicit clinical justification (`highRiskJustification`).

---

## 3. Clinician-Controlled Gestational Dating & EDD Provenance

### 3.1 Mathematical Dating Rules & Ultrasound Biometrics
Accurate gestational dating is the cornerstone of obstetric safety, dictating timing for pre-eclampsia screening, aneuploidy screening, fetal growth assessment, and post-term induction:

1. **Naegele's Rule (LMP-based Dating):**
   For patients with regular 28-day menstrual cycles:
   $$\text{EDD} = \text{LMP} + 280\text{ days (40 weeks 0 days)}$$
   $$\text{GA} = \text{Elapsed Days from LMP} = (\text{Current Date} - \text{LMP})$$

2. **First-Trimester Ultrasound Biometry (Robinson-Fleming Formula):**
   When Crown-Rump Length (CRL) is measured between 10 mm and 84 mm (approx. 7w0d to 14w0d):
   $$\text{GA (days)} = 8.052 \cdot \sqrt{\text{CRL (mm)}} + 23.73$$
   $$\text{EDD} = \text{US Scan Date} + (280 - \text{GA days})$$

3. **ACOG / SOGC Discrepancy Guidelines:**
   - **First Trimester ($\le 13\text{w}6\text{d}$, CRL $\le 84$ mm):** If the discrepancy between LMP dating and ultrasound dating exceeds **7 days**, ultrasound biometric dating takes precedence and redefines the confirmed EDD.
   - **Second Trimester ($14\text{w}0\text{d} - 21\text{w}6\text{d}$):** If the discrepancy exceeds **10 days**, ultrasound biometry redefines the confirmed EDD.
   - If the discrepancy is within tolerance, LMP dating is maintained.

### 3.2 Audit-Logged Dating Sign-off
Automated dating calculators are strictly advisory. The confirmed EDD cannot be updated by algorithmic calculation alone. A qualified clinician with the `OBSTETRIC_DATING_REVIEW` privilege must review the discrepancy, select the authoritative `DatingMethod`, provide clinical rationale (`datingRationale`), and digitally sign off.

---

## 4. Structured Antenatal Flowsheet Visits (`AntenatalVisitRecord`)

### 4.1 Flowsheet Parameters & Vital Signs
Every antenatal consultation records standardized maternal-fetal parameters:
- **Gestational Age at Visit:** Computed in weeks and days.
- **Maternal Hemodynamics:** Systolic and diastolic blood pressure (mmHg).
- **Maternal Anthropometrics:** Maternal weight (kg) and fundal height (cm, from 20 weeks onward).
- **Fetal Assessment:**
  - Fetal heart rate (FHR in beats/minute, physiological range 110–160 bpm).
  - Fetal presentation (`CEPHALIC`, `BREECH`, `TRANSVERSE`, `OBLIQUE`, `UNSTABLE`).
  - Active fetal movements reported (`fetalMovementPresent`).
- **Urinalysis Screening:** Dipstick proteinuria (`NEGATIVE`, `TRACE`, `PLUS_1`, `PLUS_2`, `PLUS_3`, `PLUS_4`) and glucosuria.
- **Obstetric Diagnostic Links:** Composite linkages to shared laboratory orders (`diagnosticOrderIds`) and ultrasound reports (`imagingDocumentIds`).

### 4.2 Automated Pre-Eclampsia Screening Protocol
Maternal hypertension combined with proteinuria is screened dynamically on visit recording:
- **High Blood Pressure Threshold:** Systolic $\ge 140\text{ mmHg}$ or Diastolic $\ge 90\text{ mmHg}$.
- **Severe Hypertension Threshold:** Systolic $\ge 160\text{ mmHg}$ or Diastolic $\ge 110\text{ mmHg}$.
- **Pre-Eclampsia Alert Criteria:** High blood pressure occurring at $\ge 20$ weeks gestation in conjunction with significant dipstick proteinuria ($\ge 1+$).
- **Clinical Display:** The flowsheet renders prominent visual alerts (`🚨 اشتباه ما قبل الإرجاج` / `⚠️ ارتفاع ضغط دم شديد`) to prompt immediate diagnostic evaluation and maternal-fetal surveillance.

---

## 5. Prior Obstetric History & Uterine Rupture Safety (`ObstetricHistoryRecord`)

Detailed past obstetric history documents all prior pregnancies:
- **Chronological Parity:** Year of delivery, gestational age at delivery, delivery outcome (`LIVE_BIRTH`, `STILLBIRTH_ANTEPARTUM`, `STILLBIRTH_INTRAPARTUM`, `NEONATAL_DEATH`, `MISCARRIAGE`, `ECTOPIC`).
- **Mode of Delivery:** Spontaneous vaginal, vacuum, forceps, elective Cesarean, or emergency Cesarean.
- **Previous Uterine Surgery Safeguards:**
  - `previousUterineSurgery`: Boolean indicator documenting previous classical C-section, myomectomy, or hysterotomy.
  - `uterineSurgeryDetails`: Surgical documentation of uterine incision location.
  - **Clinical Safety Warning:** Patients with previous classical uterine incisions or extensive transmural myomectomy are automatically flagged with uterine rupture risk alerts, warning clinicians against unmonitored vaginal birth after Cesarean (VBAC) or prostaglandin induction.

---

## 6. Confidential Gynecological Examinations (`GynecologicalExamination`)

### 6.1 Server-Side Data Segregation
Gynecological examinations often document intimate anatomical findings that must be safeguarded against unauthorized clinical and administrative browsing:
- **Intimate Fields:** `externalGenitaliaFindings`, `speculumExaminationFindings`, `bimanualExaminationFindings`, `cervicalScreeningTestType`, `cervicalScreeningResults`, `clinicalAssessment`, and `managementPlan`.
- **Segregation Rule:** Unless the requesting clinician possesses the verified `GYNECOLOGICAL_RECORD_REVIEW` or `GYNECOLOGICAL_EXAM_PERFORM` privilege, all intimate fields are redacted to `null` server-side before serialization, and `indicationsSymptoms` is replaced with an audit token: `[محتوى محمي - فحص نسائي سري / CONFIDENTIAL INTIMATE RECORD]`.

### 6.2 Chaperone Presence & Patient Safety Governance
In accordance with international clinical practice standards (ACOG, RCOG), intimate physical examinations require documented chaperone presence:
- `chaperonePresent`: Boolean recording whether an independent chaperone (e.g., registered nurse) was present in the room during the examination.
- `chaperoneNameOrId`: Attributable identity or staff number of the chaperone.
- Chaperone details remain visible on compliance audits even when intimate anatomical findings are segregated.

---

## 7. Medical Specialty Authorization & Clinical Privileges

Obstetric and gynecological clinical workflows are governed by 5 granular privileges registered under the `OB_GYN` medical specialty:

| Privilege Code | Category | Purpose | Scope |
| :--- | :--- | :--- | :--- |
| `ANTENATAL_CARE_DOCUMENT` | Clinical | Register pregnancy episodes, document flowsheet visits, and update maternal observations | `CLINIC_WIDE` / `BRANCH_SCOPED` |
| `OBSTETRIC_DATING_REVIEW` | Governance | Review gestational dating discrepancies, approve authoritative EDD, and sign dating reviews | `CLINIC_WIDE` |
| `OBSTETRIC_EPISODE_FINALIZE` | Governance | Finalize pregnancy episodes upon delivery or termination | `CLINIC_WIDE` |
| `GYNECOLOGICAL_EXAM_PERFORM` | Clinical | Perform and document confidential intimate gynecological examinations | `CLINIC_WIDE` / `BRANCH_SCOPED` |
| `GYNECOLOGICAL_RECORD_REVIEW` | Governance | Access unredacted confidential gynecological records for clinical continuity or audit | `CLINIC_WIDE` |

---

## 8. Database Schema & Migration Invariants (Migration 043)

Database Migration `20261118000300_obgyn_antenatal_care` introduces:
- **4 Relational Tables:** `PregnancyEpisode`, `AntenatalVisitRecord`, `ObstetricHistoryRecord`, `GynecologicalExamination`.
- **Row-Level Security:** `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY` applied across all 4 tables with multi-tenant predicate:
  ```sql
  CASE WHEN current_user = 'owner' THEN false ELSE lamssa_security.context_allows("clinicId") END
  ```
- **Same-Clinic Composite Foreign Keys:** `("clinicId", "patientId")`, `("clinicId", "pregnancyEpisodeId")`, and `("clinicId", "encounterId")` strictly prevent cross-tenant record linking.
- **Trigger-Enforced Immutability:** Finalized antenatal visits and gynecological examinations cannot be updated in-place (error `42501`); only status transition to `ENTERED_IN_ERROR` with a non-empty `errorReason` is permitted.
- **Application Role Grants:** `SELECT, INSERT, UPDATE, DELETE` explicitly granted to `lamssa_app`, `lamssa_runtime`, `lamssa_dev_app`, and `lamssa_test_app`.
