# Ophthalmology & ENT Specialty Architecture & Clinical Operations

## 1. Executive Summary

Phase 8 Step 8.5 extends Lamssa's multi-tenant healthcare platform with specialized capabilities for **Ophthalmology** (طب وجراحة العيون) and **Otorhinolaryngology / ENT** (طب وجراحة الأنف والأذن والحنجرة).

The module adheres to Lamssa's architectural principles:
- **Shared Clinical Spine:** All specialty assessments link directly to `ClinicalEncounter`, `Patient`, `Clinic`, and `ClinicMembership`. No duplicated patient identities or fragmented records.
- **Strict Role-Based and Clinical-Privilege Governance:** Refraction, slit-lamp/funduscopy examination, ENT examination, and pure-tone audiometry enforce explicit specialty registration and validated clinical privileges (`REFRACTION_MEASURE`, `OPHTHALMIC_EXAM_DOCUMENT`, `OPHTHALMIC_RECORD_FINALIZE`, `ENT_EXAM_DOCUMENT`, `AUDIOMETRY_RECORD`, `ENT_PROCEDURE_PERFORM`).
- **PostgreSQL Database Integrity & Security:** Additive migration 044 (`20261118000400_ophthalmology_ent`) adds 4 new tables under `FORCE ROW LEVEL SECURITY`, tenant isolation policies, composite same-clinic foreign keys, and immutability triggers (`ophthalmology_ent_record_immutability_guard`).
- **Validated Clinical Analytics:** Standardized mathematical models for Pure Tone Average (PTA-4), WHO 2021 hearing impairment grading, Air-Bone Gap (ABG) classification, intraocular pressure (IOP) alert triggers, cup-to-disc ratio (CDR) asymmetry warnings, and optical spherical equivalent derivation.
- **Arabic-First RTL Accessible Workspace:** Clean bilingual interface conforming to WCAG 2.1 AA with accessible pure-tone audiogram visualizer adhering to ISO 8253-1.

---

## 2. Ophthalmology Clinical Specifications

### 2.1 Refraction & Visual Acuity
- **Scales Supported:**
  - `SNELLEN_FEET_20_20` (e.g., 20/20, 20/40)
  - `SNELLEN_METERS_6_6` (e.g., 6/6, 6/12)
  - `LOGMAR` (e.g., 0.00, 0.30)
  - `DECIMAL` (e.g., 1.0, 0.5)
- **Refraction Parameters:**
  - Sphere: $-25.00\text{ to }+25.00\text{ DS}$ in standard $0.25\text{ D}$ steps.
  - Cylinder: $-10.00\text{ to }+10.00\text{ DC}$ in standard $0.25\text{ D}$ steps.
  - Axis: $1^\circ\text{ to }180^\circ$ (mandatory whenever cylinder is specified).
  - Reading Add: $+0.50\text{ to }+4.00\text{ DS}$ in $0.25\text{ D}$ steps.
  - Pupillary Distance: $20.0\text{ to }80.0\text{ mm}$.
- **Spherical Equivalent (SE):**
  $$\text{SE} = \text{Sphere} + \frac{\text{Cylinder}}{2}$$
  Calculated in real-time in both frontend and backend analytics.

### 2.2 Intraocular Pressure (Tonometry)
- **Tonometry Methods:**
  - `GOLDMANN_APPLANATION` (Gold Standard)
  - `NON_CONTACT_AIR_PUFF`
  - `TONOPEN`
  - `ICARE_REBOUND`
  - `PERKINS_PORTABLE`
- **Clinical Decision Support Alerts:**
  - Normal adult reference: $10–21\text{ mmHg}$.
  - Elevated IOP Alert: $> 21\text{ mmHg}$ (requires evaluation for ocular hypertension / glaucoma).
  - Ocular Hypotony Alert: $< 6\text{ mmHg}$ (requires immediate inspection for wound leak, detachment, or ciliary body shutdown).
  - Asymmetry Alert: $|\text{IOP}_{\text{OD}} - \text{IOP}_{\text{OS}}| \ge 4\text{ mmHg}$ (clinically suspicious for unilateral pathology or angle-closure risk).
  - All alerts display bilingual clinical disclaimers clarifying that tonometry readings are decision-support aids and require corneal pachymetry correlation.

### 2.3 Optic Nerve & Fundus Examination
- **Cup-to-Disc Ratio (CDR):**
  - Normal baseline: $0.1–0.4$.
  - Suspicious Disc Alert: $\text{CDR} \ge 0.60$.
  - Inter-Eye Asymmetry Alert: $|\text{CDR}_{\text{OD}} - \text{CDR}_{\text{OS}}| \ge 0.20$ (suspicious for glaucoma even if IOP is normal).

---

## 3. ENT Clinical Specifications

### 3.1 Examination Protocol
- **Otoscopy:** External auditory canal (edema, cerumen, discharge) and tympanic membrane condition (translucent, retracted, perforation, effusion, erythema).
- **Anterior Rhinoscopy:** Nasal septum deviation/spur, inferior turbinate hypertrophy, nasal polyposis, and discharge character.
- **Oropharynx & Larynx:**
  - **Friedman Tonsil Size Grading:**
    - `GRADE_0_SURGICALLY_ABSENT`: Tonsils surgically removed.
    - `GRADE_1_WITHIN_PILLARS`: Tonsils hidden within anterior/posterior pillars ($< 25\%$).
    - `GRADE_2_EXTENDING_TO_PILLARS`: Tonsils extend to the faucial pillars ($25–50\%$).
    - `GRADE_3_BEYOND_PILLARS`: Tonsils extend beyond the pillars toward midline ($50–75\%$).
    - `GRADE_4_KISSING_TONSILS`: Tonsils meet in the midline ($> 75\%$).
  - Posterior pharyngeal wall (cobblestoning, post-nasal drip).
  - Uvula and soft palate elevation symmetry.
  - Vocal cord mobility on phonation.

### 3.2 Audiometry & Hearing Assessment
- **Frequencies Tested:**
  - Air Conduction: $125, 250, 500, 1000, 2000, 4000, 8000\text{ Hz}$.
  - Bone Conduction: $250, 500, 1000, 2000, 4000\text{ Hz}$.
  - Threshold range: $-10\text{ to }120\text{ dB HL}$.
- **Pure Tone Average (PTA-4):**
  $$\text{PTA-4} = \frac{\text{Threshold}_{500} + \text{Threshold}_{1000} + \text{Threshold}_{2000} + \text{Threshold}_{4000}}{4}$$
- **WHO 2021 Hearing Impairment Classification:**
  - $\le 20.0\text{ dB}$: Normal hearing (طبيعي)
  - $20.1–34.9\text{ dB}$: Mild hearing loss (ضعف سمع طفيف)
  - $35.0–49.9\text{ dB}$: Moderate hearing loss (ضعف سمع متوسط)
  - $50.0–64.9\text{ dB}$: Moderately severe hearing loss (ضعف سمع شديد باعتدال)
  - $65.0–79.9\text{ dB}$: Severe hearing loss (ضعف سمع شديد)
  - $80.0–94.9\text{ dB}$: Profound hearing loss (ضعف سمع عميق)
  - $\ge 95.0\text{ dB}$: Complete hearing loss / Deafness (صمم تام)
- **Air-Bone Gap (ABG) & Impairment Typing:**
  - $\text{ABG} = \text{Air Threshold} - \text{Bone Threshold}$
  - Sensorineural (حسي عصبي): $\text{ABG}_{\max} < 10\text{ dB}$ with elevated thresholds.
  - Conductive (توصيلي): $\text{ABG}_{\max} \ge 15\text{ dB}$ with normal bone thresholds ($\le 20\text{ dB}$).
  - Mixed (مختلط): $\text{ABG}_{\max} \ge 15\text{ dB}$ with elevated bone thresholds ($> 20\text{ dB}$).
- **Tympanometry Integration:**
  - Standard Jerger classification (`TYPE_A_NORMAL_COMPLIANCE`, `TYPE_AS_STIFF_SYSTEM`, `TYPE_AD_HIGH_COMPLIANCE_FLACCID`, `TYPE_B_FLAT_EFFUSION`, `TYPE_C_NEGATIVE_PRESSURE`).

---

## 4. Database Architecture & Security Controls

### 4.1 Schema Migration 044 (`20261118000400_ophthalmology_ent`)
```sql
CREATE TABLE public."OphthalmicRefractionRecord" ( ... );
CREATE TABLE public."OphthalmicExaminationRecord" ( ... );
CREATE TABLE public."EntExaminationRecord" ( ... );
CREATE TABLE public."AudiometryAssessmentRecord" ( ... );
```
- **RLS Policy:**
  ```sql
  ALTER TABLE public."<Table>" ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public."<Table>" FORCE ROW LEVEL SECURITY;
  CREATE POLICY "<Table>_tenant_isolation" ON public."<Table>"
    FOR ALL USING (clinic_id = current_setting('lamssa.clinic_id', true));
  ```
- **Audit Immutability Guard:**
  Triggers reject in-place updates once a record is marked `FINALIZED` or `ENTERED_IN_ERROR`. Clinical errors are corrected strictly via explicit `ENTERED_IN_ERROR` state transitions with audit reason logging.
- **Composite Foreign Keys:**
  Foreign keys `(clinic_id, encounter_id)` and `(clinic_id, patient_id)` enforce cross-tenant integrity.

---

## 5. Frontend User Experience (Arabic-First RTL)

1. **Refraction Section:** Side-by-side OD/OS ocular refraction card with instant spherical equivalent indicator and historical refraction review.
2. **Ophthalmic Exam Section:** Visual tonometry inputs with live alert badges for ocular hypertension or asymmetry, and slit lamp/funduscopy fields.
3. **ENT Exam Section:** Categorized otoscopy, rhinoscopy, and Friedman tonsil grading options.
4. **Audiometry Section:** ISO 8253-1 compliant SVG chart (red circles/brackets for Right Ear, blue crosses/brackets for Left Ear) coupled with an accessible WCAG 2.1 AA threshold data table and real-time WHO 2021 classifications.
