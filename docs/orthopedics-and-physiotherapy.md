# Orthopedics & Physiotherapy Clinical Informatics Architecture

## 1. Overview & Clinical Scope

Lamssa Phase 8 Step 8.6 extends the multi-tenant clinical medical platform with specialized modules for **Orthopedics & Traumatology** and **Physiotherapy & Physical Rehabilitation**.

The module adheres strictly to Lamssa's architectural principles:
- **Shared Clinical Foundation**: Reuses shared patient identities, encounters, clinical notes, document encryption, diagnostic orders, billing, and multi-tenant isolation.
- **Role & Privilege Enforcement**: Granular practitioner qualifications (`ORTHOPEDICS`, `PHYSIOTHERAPY`) and clinical privileges (`ORTHOPEDIC_EXAM_PERFORM`, `ORTHOPEDIC_RECORD_FINALIZE`, `JOINT_ROM_MEASURE`, `PHYSIOTHERAPY_PLAN_CREATE`, `PHYSIOTHERAPY_PLAN_APPROVE`, `PHYSIOTHERAPY_SESSION_DOCUMENT`).
- **PostgreSQL Row-Level Security & Tamper Resistance**: `FORCE ROW LEVEL SECURITY` on all specialty tables, immutable finalized records, optimistic concurrency control (`version`), and auditable `ENTERED_IN_ERROR` status transitions.
- **Arabic-First RTL Clinical Workspace**: Native RTL clinical layouts, responsive interactive SVG goniometer dial, accessible data tables (WCAG 2.1 AA compliant), and clinical decision support advisories in Arabic and English.

---

## 2. Clinical Data Architecture

```
                  ┌──────────────────────────────┐
                  │       ClinicalEncounter      │
                  └──────────────┬───────────────┘
                                 │ 1:N
        ┌────────────────────────┼────────────────────────┐
        │                        │                        │
        ▼                        ▼                        ▼
┌──────────────────┐   ┌──────────────────┐   ┌────────────────────────┐
│  Musculoskeletal │   │    JointRange    │   │      Physiotherapy     │
│   Examination    │◄──┤  OfMotionRecord  │   │     Rehabilitation     │
└──────────────────┘   └──────────────────┘   │        Episode         │
                                              └───────────┬────────────┘
                                                          │ 1:N
                                                          ▼
                                              ┌────────────────────────┐
                                              │      Physiotherapy     │
                                              │      SessionRecord     │
                                              └────────────────────────┘
```

### 2.1 Musculoskeletal Examination (`MusculoskeletalExamination`)
- **Anatomical Regions**: `CERVICAL_SPINE`, `THORACIC_SPINE`, `LUMBAR_SPINE`, `SACROILIAC_PELVIS`, `SHOULDER`, `ELBOW`, `WRIST_HAND`, `HIP`, `KNEE`, `ANKLE_FOOT`.
- **Inspection & Palpation**: Swelling grade (`NONE`, `MILD_1_PLUS`, `MODERATE_2_PLUS`, `SEVERE_3_PLUS`), deformity and alignment notes, tenderness locations array.
- **Neurological & Motor Function**: Neurovascular intact flag, Medical Research Council (MRC) 0–5 power scale, dermatomal sensation findings.
- **Special Provocative Maneuvers**: Clinician-documented special orthopedic tests (e.g., Lachman, McMurray, Hawkins-Kennedy, Spurling, Phalen, Straight Leg Raise) with structured results (`POSITIVE`, `NEGATIVE`, `EQUIVOCAL`).

### 2.2 Joint Range of Motion (ROM) Goniometry (`JointRangeOfMotionRecord`)
- **Joints & Movements**: Standard physiological joint movements (Flexion, Extension, Abduction, Adduction, Internal/External Rotation, Pronation, Supination, Inversion, Eversion, Dorsiflexion, Plantarflexion).
- **Measurement Precision**: Measured active degrees, passive degrees, starting degrees, contralateral comparison degrees, and pain onset angle.
- **Analytics Engine**: Automatic calculation of deficit from normal standard norms (AAOS reference values) and contralateral deficit percentage. Deficit severity classification:
  * `NORMAL`: 0% deficit
  * `MILD`: 1% to 20% deficit
  * `MODERATE`: 21% to 40% deficit
  * `SEVERE`: > 40% deficit

### 2.3 Physiotherapy Rehabilitation Episodes (`PhysiotherapyRehabilitationEpisode`)
- **Longitudinal Care Plan**: Tracks multi-week rehabilitation episodes, functional baseline, primary rehabilitation goals, visit frequency per week, target duration, and planned therapeutic modalities.
- **Episode Status Lifecycle**: `ACTIVE` → `COMPLETED` / `SUSPENDED` / `DISCHARGED` / `CANCELLED` with mandatory discharge summary upon completion or discharge.

### 2.4 Physiotherapy Treatment Sessions (`PhysiotherapySessionRecord`)
- **Session Execution**: Duration in minutes, modalities administered (e.g., Hot Pack, Cryotherapy, TENS/NMES, Therapeutic Ultrasound, Manual Therapy, Gait Training), and detailed exercise prescription (sets, reps, resistance in kg).
- **VAS Pain Delta Tracking**: Visual Analog Scale pain score before session (0–10) vs. post-session (0–10). Automatic computation of pain delta:
  * Positive Delta ($> 0$): Clinically meaningful pain reduction.
  * Zero Delta ($= 0$): Unchanged pain level.
  * Negative Delta ($< 0$): Pain exacerbation requiring clinical advisory alert.

---

## 3. AAOS Goniometric Reference Standards

The analytics engine implements normative joint ranges based on the **American Academy of Orthopaedic Surgeons (AAOS)** standards:

| Joint Region | Movement | Normal Reference Arc | Clinical Significance |
| :--- | :--- | :--- | :--- |
| **Knee** | Flexion | 0° – 140° | Required for squatting (> 120°) and stairs (> 90°) |
| | Extension | 0° | Extension lag indicates quadriceps inhibition |
| **Hip** | Flexion | 0° – 120° | Gait requires minimum 30° flexion |
| | Extension | 0° – 30° | Crucial for terminal stance in normal gait |
| | Abduction | 0° – 45° | Required for coronal pelvic stability |
| | Adduction | 0° – 30° | Assessment of adductor contracture |
| | Internal Rotation | 0° – 45° | Early indicator in femoral acetabular impingement |
| | External Rotation | 0° – 45° | Screened for retroversion / capsule tightness |
| **Shoulder** | Flexion | 0° – 180° | Complete overhead elevation |
| | Extension | 0° – 60° | Hyperextension behind coronal plane |
| | Abduction | 0° – 180° | Coronal overhead reach |
| | Adduction | 0° – 50° | Horizontal cross-body reach |
| | Internal Rotation | 0° – 70° | Measured at 90° abduction |
| | External Rotation | 0° – 90° | Measured at 90° abduction |
| **Elbow** | Flexion | 0° – 150° | Functional arc 30° – 130° for activities of daily living |
| | Extension | 0° | Loss of full extension indicates capsular contracture |
| | Pronation | 0° – 80° | Forearm rotation |
| | Supination | 0° – 80° | Forearm rotation |
| **Cervical Spine** | Flexion | 0° – 50° | Neck chin-to-chest flexion |
| | Extension | 0° – 60° | Overhead gaze extension |
| | Lateral Flexion | 0° – 45° | Lateral ear-to-shoulder inclination |
| | Rotation | 0° – 80° | Axial cervical rotation |
| **Lumbar Spine** | Flexion | 0° – 60° | Lumbar spinal sagittal forward bending |
| | Extension | 0° – 25° | Backward arching |
| | Lateral Flexion | 0° – 25° | Coronal side bending |

---

## 4. Medical Research Council (MRC) 0–5 Motor Strength Scale

The system validates motor strength entries according to the international Medical Research Council scale:

| Grade | Description (English) | الوصف السريري (العربية) |
| :---: | :--- | :--- |
| **0** | No contraction / complete paralysis | لا يوجد أي انقباض عضلي ملاحظ (شلل تام) |
| **1** | Flicker or trace of contraction | وميض أو أثر لانقباض عضلي طفيف دون حركة المفصل |
| **2** | Active movement with gravity eliminated | حركة إيجابية في المفصل مع إلغاء قوة الجاذبية الأرضية |
| **3** | Active movement against gravity | حركة إيجابية كاملة للمفصل ضد الجاذبية الأرضية ولكن دون مقاومة |
| **4** | Active movement against gravity and moderate resistance | حركة إيجابية ضد الجاذبية الأرضية مع مقاومة يدوية معتدلة |
| **5** | Normal power against maximal resistance | قوة عضلية طبيعية كاملة ضد المقاومة القصوى |

---

## 5. Validated Functional Outcome Instruments

The module includes client-side validated clinical score calculators with bilingual explanations:

### 5.1 Oswestry Disability Index (ODI 2.0)
- **Clinical Target**: Evaluation of functional impairment secondary to low back pain.
- **Structure**: 10 sections (Pain Intensity, Personal Care, Lifting, Walking, Sitting, Standing, Sleeping, Sex Life, Social Life, Traveling). Each scored 0–5.
- **Formula**:
  $$\text{ODI \%} = \frac{\text{Total Score}}{\text{Number of Answered Sections} \times 5} \times 100$$
- **Categorization**:
  * $0\% - 20\%$: Minimal disability
  * $21\% - 40\%$: Moderate disability
  * $41\% - 60\%$: Severe disability
  * $61\% - 80\%$: Crippled
  * $81\% - 100\%$: Bed-bound or exaggerating symptoms

### 5.2 QuickDASH (Disabilities of the Arm, Shoulder and Hand)
- **Clinical Target**: Physical function and symptoms in persons with musculoskeletal disorders of the upper extremity.
- **Structure**: 11 core items scored 1–5. Requires at least 10 answered items to calculate.
- **Formula**:
  $$\text{QuickDASH Score} = \left( \frac{\sum \text{answered item scores}}{n} - 1 \right) \times 25$$

### 5.3 Lysholm Knee Scoring Scale
- **Clinical Target**: Knee symptoms, stability, and functional outcomes following ligamentous (ACL/PCL/meniscal) knee injuries.
- **Structure**: 8 domains totaling 100 points:
  * Limp (5 pts)
  * Support / canes (5 pts)
  * Locking sensation (15 pts)
  * Instability / giving way (30 pts)
  * Pain severity (25 pts)
  * Swelling (10 pts)
  * Stair climbing (10 pts)
  * Squatting (5 pts)
- **Rating Bands**:
  * $95 - 100$: Excellent (ممتاز)
  * $84 - 94$: Good (جيد)
  * $65 - 83$: Fair (متوسط)
  * $< 65$: Poor (ضعيف)

---

## 6. Database Security & Concurrency Controls

1. **FORCE Row Level Security**: Enabled across all 4 tables (`MusculoskeletalExamination`, `JointRangeOfMotionRecord`, `PhysiotherapyRehabilitationEpisode`, `PhysiotherapySessionRecord`) ensuring strict isolation between clinic tenants.
2. **Anti-Tampering Immutability Trigger**: Database triggers prevent modification of finalized records. Once set to `FINALIZED`, records can only be updated to `ENTERED_IN_ERROR` with a mandatory audit reason and version increment.
3. **Optimistic Concurrency Control**: All modification endpoints mandate `expectedVersion` to prevent race conditions or overwriting concurrent clinician adjustments.
4. **Audit Trail**: Every creation, modification, status update, or error marking generates a structured audit log in `AuditLog` table.
