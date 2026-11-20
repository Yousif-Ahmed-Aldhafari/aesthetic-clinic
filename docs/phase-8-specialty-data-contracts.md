# Lamssa — Phase 8: Advanced Specialty Clinical Data Contracts

**Version:** 1.1.0
**Phase:** Phase 8 — Advanced Medical Specialty Modules
**Step:** Step 8.7 — Final Multi-Specialty Clinical Integrity, Security & Release Acceptance
**Status:** Canonical Data Specification & API Contracts (Implemented in Migrations 041–045 & Verified)
**Date:** 2026-11-20
**Language:** English (Technical Specification) with authentic Arabic clinical metadata

---

## 1. Overview & Data Contract Governance

This document establishes the canonical data contracts, Prisma models, DTO validations, REST API endpoints, and database integrity rules for the seven outpatient specialty modules in Lamssa Phase 8.

### Data Contract Rules
1. **Tenant Confinement:** Every model includes a non-nullable `clinicId String @db.Uuid` and enforces PostgreSQL `FORCE ROW LEVEL SECURITY`.
2. **Clinical Anchoring:** Every specialty record references `ClinicalEncounter` via composite foreign key `[clinicId, encounterId]` and `Patient` via `[clinicId, patientId]`.
3. **No Unstructured Data Substitution:** Anatomical observations, measurements, and clinical findings are modeled as typed relational columns with database-level checks. Unstructured JSON is reserved strictly for dynamic questionnaires via the versioned `ClinicalFormResponse` engine.
4. **Attributable Immutability:** Finalized records cannot be modified in place. Amendments create historical records with practitioner attribution, timestamp, and mandatory clinical justification ($\ge 20$ characters).
5. **Zero Financial Mutation:** Billable procedures link to `GeneralClinicalService` or `AestheticProcedureCatalog` and generate standard `InvoiceLine` records.

---

## 2. Dentistry Blueprint (`DENTISTRY`)

### 2.1 Domain Overview & Anatomical Classification
The Dentistry module manages comprehensive oral healthcare across permanent, primary (deciduous), and mixed dentitions. It supports multiple international tooth numbering systems, surface-level anatomical mapping, periodontal probing matrices, versioned odontograms, and staged multidisciplinary treatment plans.

#### Tooth Numbering Standards
- **FDI World Dental Federation (ISO 3950) — Primary Standard:** Two-digit system:
  - Permanent Quadrants: `1` (Upper Right), `2` (Upper Left), `3` (Lower Left), `4` (Lower Right). Teeth `1` to `8` per quadrant (e.g. `11` = Upper Right Central Incisor, `48` = Lower Right Wisdom Tooth).
  - Deciduous Quadrants: `5` (Upper Right), `6` (Upper Left), `7` (Lower Left), `8` (Lower Right). Teeth `1` to `5` per quadrant (e.g. `51` to `85`).
- **Universal Numbering System (American Standard):**
  - Permanent: `1` to `32` (1 = Upper Right 3rd Molar, 16 = Upper Left 3rd Molar, 17 = Lower Left 3rd Molar, 32 = Lower Right 3rd Molar).
  - Deciduous: `A` to `T`.
- **Palmer Notation:** Quadrant brackets with numbers 1–8 or letters A–E.

#### Tooth Surfaces
- **Mesial (`M`):** Surface towards the dental midline.
- **Distal (`D`):** Surface away from the dental midline.
- **Occlusal (`O`):** Biting surface of posterior teeth (premolars and molars).
- **Incisal (`I`):** Cutting edge of anterior teeth (incisors and canines).
- **Buccal / Facial (`B` / `F`):** Surface facing the cheek or lips.
- **Lingual / Palatal (`L` / `P`):** Surface facing the tongue (mandibular) or palate (maxillary).

### 2.2 Proposed Prisma Data Models

```prisma
enum DentitionType {
  PERMANENT
  PRIMARY
  MIXED
}

enum ToothNumberingSystem {
  FDI_ISO_3950
  UNIVERSAL_SYSTEM
  PALMER_NOTATION
}

enum OdontogramStatus {
  DRAFT
  FINALIZED
  SUPERSEDED
  ENTERED_IN_ERROR
}

enum ToothCondition {
  SOUND
  CARIES_INITIAL
  CARIES_MODERATE
  CARIES_EXTENSIVE
  RESTORATION_AMALGAM
  RESTORATION_COMPOSITE
  RESTORATION_TEMPORARY
  CROWN_CERAMIC
  CROWN_METAL
  CROWN_PORCELAIN_FUSED_METAL
  VENEER
  INLAY_ONLAY
  ROOT_CANAL_TREATED
  POST_AND_CORE
  PERIAPICAL_LESION
  FRACTURED
  IMPACTED
  PARTIALLY_ERUPTED
  MISSING_CARIES
  MISSING_OTHER
  MISSING_CONGENITAL
  IMPLANT
  PONTIC
  DECIDUOUS_RETAINED
}

enum PeriodontalFurcationGrade {
  CLASS_0
  CLASS_I
  CLASS_II
  CLASS_III
  CLASS_IV
}

enum ToothMobilityGrade {
  GRADE_0
  GRADE_1
  GRADE_2
  GRADE_3
}

model DentalOdontogram {
  id                      String               @id @default(uuid()) @db.Uuid
  clinicId                String               @db.Uuid
  patientId               String               @db.Uuid
  encounterId             String               @db.Uuid
  dentistMembershipId     String               @db.Uuid
  dentitionType           DentitionType        @default(PERMANENT)
  numberingSystem         ToothNumberingSystem @default(FDI_ISO_3950)
  status                  OdontogramStatus     @default(DRAFT)
  chartType               String               @default("BASELINE") @db.VarChar(32) // BASELINE, PROGRESS, TREATMENT_PLAN
  generalOralCondition    String?              @db.Text
  softTissueExamination   String?              @db.Text
  occlusionClassification String?              @db.VarChar(64) // Angle Class I, II Div 1, II Div 2, III
  temporomandibularJoint  String?              @db.VarChar(255)
  notes                   String?              @db.Text
  finalizedAt             DateTime?            @db.Timestamptz(3)
  contentDigest           String?              @db.VarChar(64) // SHA-256
  version                 Int                  @default(1)
  createdAt               DateTime             @default(now()) @db.Timestamptz(3)
  updatedAt               DateTime             @updatedAt @db.Timestamptz(3)

  clinic                  Clinic               @relation(fields: [clinicId], references: [id], onDelete: Restrict, onUpdate: Restrict)
  patient                 Patient              @relation(fields: [clinicId, patientId], references: [clinicId, id], onDelete: Restrict, onUpdate: Restrict)
  encounter               ClinicalEncounter    @relation(fields: [clinicId, encounterId], references: [clinicId, id], onDelete: Restrict, onUpdate: Restrict)
  dentist                 ClinicMembership     @relation("OdontogramDentist", fields: [clinicId, dentistMembershipId], references: [clinicId, id], onDelete: Restrict, onUpdate: Restrict)
  findings                DentalToothFinding[]
  periodontalChart        DentalPeriodontalRecord[]
  stagedProcedures        DentalTreatmentStage[]

  @@unique([clinicId, id])
  @@index([clinicId, patientId, status])
  @@index([clinicId, encounterId])
}

model DentalToothFinding {
  id                 String         @id @default(uuid()) @db.Uuid
  clinicId           String         @db.Uuid
  odontogramId       String         @db.Uuid
  patientId          String         @db.Uuid
  toothNumberFdi     Int            // e.g. 11..48, 51..85
  toothNumberAlt     String?        @db.VarChar(8) // e.g. "1".."32" or "A".."T"
  isDeciduous        Boolean        @default(false)
  condition          ToothCondition @default(SOUND)
  surfacesAffected   String[]       @default([]) // ["MESIAL", "OCCLUSAL", "DISTAL"]
  existingWork       String?        @db.VarChar(255)
  diagnosisCodeIcd10 String?        @db.VarChar(32) // e.g. "K02.1"
  notes              String?        @db.VarChar(500)
  version            Int            @default(1)
  createdAt          DateTime       @default(now()) @db.Timestamptz(3)
  updatedAt          DateTime       @updatedAt @db.Timestamptz(3)

  clinic             Clinic         @relation(fields: [clinicId], references: [id], onDelete: Restrict, onUpdate: Restrict)
  odontogram         DentalOdontogram @relation(fields: [clinicId, odontogramId], references: [clinicId, id], onDelete: Restrict, onUpdate: Restrict)
  patient            Patient        @relation(fields: [clinicId, patientId], references: [clinicId, id], onDelete: Restrict, onUpdate: Restrict)

  @@unique([clinicId, id])
  @@unique([clinicId, odontogramId, toothNumberFdi])
  @@index([clinicId, patientId, toothNumberFdi])
}

model DentalPeriodontalRecord {
  id                   String                    @id @default(uuid()) @db.Uuid
  clinicId             String                    @db.Uuid
  odontogramId         String                    @db.Uuid
  patientId            String                    @db.Uuid
  toothNumberFdi       Int                       // 11..48
  probingDepthsMm      Int[]                     // 6 sites: [DB, B, MB, DL, L, ML] in mm (0-15)
  gingivalMarginMm     Int[]                     // 6 sites: recession or hyperplasia (-10 to +10)
  clinicalAttachmentMm Int[]                     // Calculated: Probing Depth + Gingival Margin
  bleedingOnProbing    Boolean[]                 // 6 sites: true if bleeding present
  suppuration          Boolean[]                 // 6 sites: true if pus present
  furcationGrade       PeriodontalFurcationGrade @default(CLASS_0)
  mobilityGrade        ToothMobilityGrade        @default(GRADE_0)
  plaqueIndex          Boolean                   @default(false)
  version              Int                       @default(1)
  createdAt            DateTime                  @default(now()) @db.Timestamptz(3)
  updatedAt            DateTime                  @updatedAt @db.Timestamptz(3)

  clinic               Clinic                    @relation(fields: [clinicId], references: [id], onDelete: Restrict, onUpdate: Restrict)
  odontogram           DentalOdontogram          @relation(fields: [clinicId, odontogramId], references: [clinicId, id], onDelete: Restrict, onUpdate: Restrict)
  patient              Patient                   @relation(fields: [clinicId, patientId], references: [clinicId, id], onDelete: Restrict, onUpdate: Restrict)

  @@unique([clinicId, id])
  @@unique([clinicId, odontogramId, toothNumberFdi])
  @@index([clinicId, patientId, toothNumberFdi])
}

model DentalTreatmentStage {
  id                    String            @id @default(uuid()) @db.Uuid
  clinicId              String            @db.Uuid
  odontogramId          String            @db.Uuid
  patientId             String            @db.Uuid
  encounterId           String            @db.Uuid
  serviceId             String            @db.Uuid // Links to GeneralClinicalService
  toothNumberFdi        Int?              // Optional if whole-mouth or quadrant
  surfaces              String[]          @default([])
  stageOrder            Int               @default(1)
  status                String            @default("PLANNED") @db.VarChar(32) // PLANNED, IN_PROGRESS, COMPLETED, CANCELLED
  clinicalJustification String            @db.VarChar(500)
  estimatedCost         Decimal           @db.Decimal(12, 2)
  consentTemplateId     String?           @db.Uuid // Links to ConsentTemplate
  patientConsentId      String?           @db.Uuid // Links to PatientConsent
  completedAt           DateTime?         @db.Timestamptz(3)
  completedByMembershipId String?         @db.Uuid
  notes                 String?           @db.Text
  version               Int               @default(1)
  createdAt             DateTime          @default(now()) @db.Timestamptz(3)
  updatedAt             DateTime          @updatedAt @db.Timestamptz(3)

  clinic                Clinic            @relation(fields: [clinicId], references: [id], onDelete: Restrict, onUpdate: Restrict)
  odontogram            DentalOdontogram  @relation(fields: [clinicId, odontogramId], references: [clinicId, id], onDelete: Restrict, onUpdate: Restrict)
  patient               Patient           @relation(fields: [clinicId, patientId], references: [clinicId, id], onDelete: Restrict, onUpdate: Restrict)
  encounter             ClinicalEncounter @relation(fields: [clinicId, encounterId], references: [clinicId, id], onDelete: Restrict, onUpdate: Restrict)
  service               GeneralClinicalService @relation(fields: [clinicId, serviceId], references: [clinicId, id], onDelete: Restrict, onUpdate: Restrict)

  @@unique([clinicId, id])
  @@index([clinicId, patientId, status])
  @@index([clinicId, odontogramId, stageOrder])
}
```

### 2.3 REST API Endpoints
- `POST /api/v1/clinics/:clinicId/dentistry/encounters/:encounterId/odontograms`: Creates draft odontogram.
- `GET /api/v1/clinics/:clinicId/dentistry/patients/:patientId/odontograms/active`: Fetches patient's latest active odontogram.
- `PUT /api/v1/clinics/:clinicId/dentistry/odontograms/:id/findings`: Batch updates tooth conditions with surface details.
- `PUT /api/v1/clinics/:clinicId/dentistry/odontograms/:id/periodontal`: Updates 6-site probing and mobility record.
- `POST /api/v1/clinics/:clinicId/dentistry/odontograms/:id/finalize`: Seals odontogram, calculates SHA-256 digest.
- `POST /api/v1/clinics/:clinicId/dentistry/odontograms/:id/treatment-stages`: Adds staged restorative/surgical procedures.

---

## 3. Pediatrics Blueprint (`PEDIATRICS`)

### 3.1 Domain Overview & Safety Boundaries
The Pediatrics module manages care from neonatal life through adolescence (0–18 years). Clinical integrity requires:
1. **Age-Aware Observations:** Chronological age in days and adjusted gestational age for premature infants (< 37 weeks).
2. **Standardized Growth References:** Exact Z-score and percentile calculations based on authoritative growth references (WHO Child Growth Standards 0–5 years, WHO Growth Reference 2007 5–19 years, and Saudi MOH guidelines).
3. **Weight-Based Dosing Safety:** Mandatory pre-flight validation preventing prescription signing unless the patient's current verified weight ($\le 30$ days old) is present, calculating maximum mg/kg/day limits.
4. **Legal Guardian & Caregiver Authorization:** Enforces parental custody, medical proxy consent, and portal proxy access limits.

### 3.2 Proposed Prisma Data Models

```prisma
enum DeliveryMode {
  SPONTANEOUS_VAGINAL
  ASSISTED_VAGINAL_VACUUM
  ASSISTED_VAGINAL_FORCEPS
  ELECTIVE_CESAREAN
  EMERGENCY_CESAREAN
}

enum CaregiverRelationshipType {
  MOTHER
  FATHER
  LEGAL_GUARDIAN
  GRANDPARENT
  FOSTER_CARER
  OTHER_RELATIVE
}

enum GrowthReferenceSource {
  WHO_2006_0_TO_5_YEARS
  WHO_2007_5_TO_19_YEARS
  CDC_2000
  SAUDI_MOH_REFERENCE
}

model PediatricBirthHistory {
  id                          String       @id @default(uuid()) @db.Uuid
  clinicId                    String       @db.Uuid
  patientId                   String       @unique @db.Uuid
  gestationalAgeWeeks         Decimal      @db.Decimal(4, 1) // e.g. 38.5
  birthWeightKg               Decimal      @db.Decimal(5, 3) // e.g. 3.250 kg
  birthLengthCm               Decimal?     @db.Decimal(4, 1) // e.g. 50.0 cm
  birthHeadCircumferenceCm    Decimal?     @db.Decimal(4, 1) // e.g. 34.5 cm
  deliveryMode                DeliveryMode @default(SPONTANEOUS_VAGINAL)
  apgarScore1Min              Int?         // 0 - 10
  apgarScore5Min              Int?         // 0 - 10
  apgarScore10Min             Int?         // 0 - 10
  resuscitationRequired       Boolean      @default(false)
  nicuAdmission               Boolean      @default(false)
  nicuStayDays                Int?         @default(0)
  maternalBloodGroup          String?      @db.VarChar(16)
  infantBloodGroup            String?      @db.VarChar(16)
  congenitalAnomalies         String?      @db.Text
  newbornScreeningNotes       String?      @db.Text
  hearingScreeningPassed      Boolean?
  recordedByMembershipId      String       @db.Uuid
  version                     Int          @default(1)
  createdAt                   DateTime     @default(now()) @db.Timestamptz(3)
  updatedAt                   DateTime     @updatedAt @db.Timestamptz(3)

  clinic                      Clinic       @relation(fields: [clinicId], references: [id], onDelete: Restrict, onUpdate: Restrict)
  patient                     Patient      @relation(fields: [clinicId, patientId], references: [clinicId, id], onDelete: Restrict, onUpdate: Restrict)
  recordedBy                  ClinicMembership @relation("PediatricBirthHistoryRecorder", fields: [clinicId, recordedByMembershipId], references: [clinicId, id], onDelete: Restrict, onUpdate: Restrict)

  @@unique([clinicId, id])
}

model PatientCaregiverRelationship {
  id                          String                    @id @default(uuid()) @db.Uuid
  clinicId                    String                    @db.Uuid
  patientId                   String                    @db.Uuid
  caregiverNameAr             String                    @db.VarChar(200)
  caregiverNameEn             String?                   @db.VarChar(200)
  relationshipType            CaregiverRelationshipType
  nationalIdNumber            String?                   @db.VarChar(64)
  phoneNumber                 String                    @db.VarChar(32)
  email                       String?                   @db.VarChar(255)
  isLegalGuardian             Boolean                   @default(true)
  hasMedicalDecisionAuthority Boolean                   @default(true)
  hasPortalProxyAccess        Boolean                   @default(false)
  legalCustodyEvidenceRef     String?                   @db.VarChar(255) // ClinicalDocument link
  verifiedByMembershipId      String?                   @db.Uuid
  notes                       String?                   @db.Text
  version                     Int                       @default(1)
  createdAt                   DateTime                  @default(now()) @db.Timestamptz(3)
  updatedAt                   DateTime                  @updatedAt @db.Timestamptz(3)

  clinic                      Clinic                    @relation(fields: [clinicId], references: [id], onDelete: Restrict, onUpdate: Restrict)
  patient                     Patient                   @relation(fields: [clinicId, patientId], references: [clinicId, id], onDelete: Restrict, onUpdate: Restrict)

  @@unique([clinicId, id])
  @@index([clinicId, patientId, isLegalGuardian])
}

model PediatricGrowthRecord {
  id                          String                @id @default(uuid()) @db.Uuid
  clinicId                    String                @db.Uuid
  patientId                   String                @db.Uuid
  encounterId                 String?               @db.Uuid
  measuredAt                  DateTime              @db.Timestamptz(3)
  chronologicalAgeDays        Int                   // Exact age in days at measurement
  adjustedAgeDays             Int?                  // Adjusted for premature birth if < 2 years
  weightKg                    Decimal               @db.Decimal(5, 3)
  heightLengthCm              Decimal               @db.Decimal(5, 2)
  headCircumferenceCm         Decimal?              @db.Decimal(4, 2)
  bodyMassIndex               Decimal?              @db.Decimal(5, 2)
  referenceSource             GrowthReferenceSource @default(WHO_2006_0_TO_5_YEARS)
  weightForAgeZScore          Decimal?              @db.Decimal(4, 2)
  weightForAgePercentile      Decimal?              @db.Decimal(5, 2)
  heightForAgeZScore          Decimal?              @db.Decimal(4, 2)
  heightForAgePercentile      Decimal?              @db.Decimal(5, 2)
  weightForHeightZScore       Decimal?              @db.Decimal(4, 2)
  weightForHeightPercentile   Decimal?              @db.Decimal(5, 2)
  headCircumferenceZScore     Decimal?              @db.Decimal(4, 2)
  headCircumferencePercentile Decimal?              @db.Decimal(5, 2)
  bmiForAgeZScore             Decimal?              @db.Decimal(4, 2)
  bmiForAgePercentile         Decimal?              @db.Decimal(5, 2)
  clinicalInterpretation      String?               @db.VarChar(255) // e.g. "Normal growth trajectory", "Stunting risk"
  recordedByMembershipId      String                @db.Uuid
  version                     Int                   @default(1)
  createdAt                   DateTime              @default(now()) @db.Timestamptz(3)
  updatedAt                   DateTime              @updatedAt @db.Timestamptz(3)

  clinic                      Clinic                @relation(fields: [clinicId], references: [id], onDelete: Restrict, onUpdate: Restrict)
  patient                     Patient               @relation(fields: [clinicId, patientId], references: [clinicId, id], onDelete: Restrict, onUpdate: Restrict)
  encounter                   ClinicalEncounter?    @relation(fields: [clinicId, encounterId], references: [clinicId, id], onDelete: Restrict, onUpdate: Restrict)

  @@unique([clinicId, id])
  @@index([clinicId, patientId, measuredAt])
}
```

### 3.3 Pediatric Medication Dosing Boundary Engine
When prescribing via `POST /api/v1/clinics/:clinicId/clinical/prescriptions`, if patient age $< 12$ years:
1. `validatePediatricPrescriptionSafety`:
   - Checks presence of a verified `PediatricGrowthRecord.weightKg` recorded within the last 30 days. If absent, rejects with `400 Bad Request: Active pediatric weight measurement required for dosing`.
   - Computes `calculatedDosePerKg = prescribedDoseMg / patientWeightKg`.
   - Compares against maximum allowable pediatric dose limits from `ClinicalSafetyPolicy`.
   - Flags age-inappropriate formulations (e.g. adult solid tablets for infant $< 2$ years without crushing/suspension instructions).

---

## 4. Obstetrics and Gynecology Blueprint (`OB_GYN`)

### 4.1 Domain Overview & Clinical Safety
The Obstetrics and Gynecology module manages antenatal care, pregnancy episodes, labor risk assessment, postpartum monitoring, and sensitive gynecological examinations:
1. **Pregnancy Episode Structure:** Groups all antenatal encounters across trimesters. Tracks parity (Gravida, Para, Term, Preterm, Abortions, Living - TPAL/GTPAL).
2. **Gestational Age Provenance:** Explicitly tracks dating origin (LMP date, dating ultrasound Crown-Rump Length [CRL], or IVF embryo transfer date). When ultrasound dating disagrees with LMP by $> 7$ days in the first trimester, reconciled EDD is updated with attributed clinical sign-off.
3. **Sensitive Record Privacy:** Gynecological evaluations, cervical cytology, and pregnancy termination history are protected by confidentiality flags (`isConfidential = true`) preventing display on reception screens or general exports.

### 4.2 Proposed Prisma Data Models

```prisma
enum PregnancyStatus {
  ACTIVE_ANTENATAL
  DELIVERED_FULL_TERM
  DELIVERED_PRETERM
  MISCARRIAGE_SPONTANEOUS
  TERMINATION_MEDICAL
  ECTOPIC_PREGNANCY
  MOLAR_PREGNANCY
  TRANSFERRED_CARE
}

enum GestationalDatingMethod {
  CERTAIN_LMP
  UNCERTAIN_LMP
  FIRST_TRIMESTER_ULTRASOUND_CRL
  SECOND_TRIMESTER_ULTRASOUND_BPD
  IVF_EMBRYO_TRANSFER
}

enum FetalPresentation {
  CEPHALIC_VERTEX
  CEPHALIC_BREECH
  TRANSVERSE_LIE
  OBLIQUE_LIE
  UNSTABLE
}

enum UrineProteinGrade {
  NEGATIVE
  TRACE
  ONE_PLUS_30MG
  TWO_PLUS_100MG
  THREE_PLUS_300MG
  FOUR_PLUS_OVER_1000MG
}

model PregnancyEpisode {
  id                          String                  @id @default(uuid()) @db.Uuid
  clinicId                    String                  @db.Uuid
  patientId                   String                  @db.Uuid
  episodeNumber               Int                     @default(1)
  gravidity                   Int                     // Total pregnancies
  parity                      Int                     // Deliveries >= 20 weeks
  termDeliveries              Int                     @default(0)
  pretermDeliveries           Int                     @default(0)
  abortionsSpontaneous        Int                     @default(0)
  abortionsInduced            Int                     @default(0)
  livingChildren              Int                     @default(0)
  lastMenstrualPeriodDate     DateTime?               @db.Date
  eddByLmp                    DateTime?               @db.Date
  datingUltrasoundDate        DateTime?               @db.Date
  crownRumpLengthMm           Decimal?                @db.Decimal(5, 1)
  eddByUltrasound             DateTime?               @db.Date
  reconciledEdd               DateTime                @db.Date // Canonical clinical EDD
  datingMethod                GestationalDatingMethod @default(FIRST_TRIMESTER_ULTRASOUND_CRL)
  bloodGroupRh                String?                 @db.VarChar(16) // e.g. "O_NEGATIVE"
  rhAntibodyScreenPositive    Boolean                 @default(false)
  status                      PregnancyStatus         @default(ACTIVE_ANTENATAL)
  highRiskFlag                Boolean                 @default(false)
  highRiskJustification       String?                 @db.Text
  deliveryOutcomeDate         DateTime?               @db.Date
  deliveryOutcomeNotes        String?                 @db.Text
  attendingObGynMembershipId  String                  @db.Uuid
  version                     Int                     @default(1)
  createdAt                   DateTime                @default(now()) @db.Timestamptz(3)
  updatedAt                   DateTime                @updatedAt @db.Timestamptz(3)

  clinic                      Clinic                  @relation(fields: [clinicId], references: [id], onDelete: Restrict, onUpdate: Restrict)
  patient                     Patient                 @relation(fields: [clinicId, patientId], references: [clinicId, id], onDelete: Restrict, onUpdate: Restrict)
  attendingDoctor             ClinicMembership        @relation("PregnancyAttendingDoctor", fields: [clinicId, attendingObGynMembershipId], references: [clinicId, id], onDelete: Restrict, onUpdate: Restrict)
  antenatalVisits             AntenatalVisitRecord[]

  @@unique([clinicId, id])
  @@index([clinicId, patientId, status])
}

model AntenatalVisitRecord {
  id                          String            @id @default(uuid()) @db.Uuid
  clinicId                    String            @db.Uuid
  pregnancyEpisodeId          String            @db.Uuid
  patientId                   String            @db.Uuid
  encounterId                 String            @db.Uuid
  gestationalAgeWeeks         Int               // Calculated at visit date
  gestationalAgeDays          Int               // 0 - 6
  fundalHeightCm              Decimal?          @db.Decimal(4, 1)
  fetalHeartRateBpm           Int?              // e.g. 140 bpm
  fetalPresentation           FetalPresentation?
  fetalMovementReported       Boolean           @default(true)
  maternalSystolicBp          Int               // Vital sign cross-validation
  maternalDiastolicBp         Int
  maternalWeightKg            Decimal           @db.Decimal(5, 2)
  urineProtein                UrineProteinGrade @default(NEGATIVE)
  urineGlucose                String?           @db.VarChar(32) // NEGATIVE, TRACE, POSITIVE
  peripheralEdemaSeverity     String?           @db.VarChar(64) // NONE, MILD_PEDAL, MODERATE, SEVERE
  preeclampsiaScreenNotes     String?           @db.Text
  nextVisitRecommendedDays    Int               @default(28)
  clinicalNotes               String?           @db.Text
  recordedByMembershipId      String            @db.Uuid
  version                     Int               @default(1)
  createdAt                   DateTime          @default(now()) @db.Timestamptz(3)
  updatedAt                   DateTime          @updatedAt @db.Timestamptz(3)

  clinic                      Clinic            @relation(fields: [clinicId], references: [id], onDelete: Restrict, onUpdate: Restrict)
  pregnancyEpisode            PregnancyEpisode  @relation(fields: [clinicId, pregnancyEpisodeId], references: [clinicId, id], onDelete: Restrict, onUpdate: Restrict)
  patient                     Patient           @relation(fields: [clinicId, patientId], references: [clinicId, id], onDelete: Restrict, onUpdate: Restrict)
  encounter                   ClinicalEncounter @relation(fields: [clinicId, encounterId], references: [clinicId, id], onDelete: Restrict, onUpdate: Restrict)

  @@unique([clinicId, id])
  @@index([clinicId, pregnancyEpisodeId, gestationalAgeWeeks])
  @@index([clinicId, encounterId])
}

model GynecologicalExamination {
  id                          String            @id @default(uuid()) @db.Uuid
  clinicId                    String            @db.Uuid
  patientId                   String            @db.Uuid
  encounterId                 String            @db.Uuid
  examinationDate             DateTime          @default(now()) @db.Timestamptz(3)
  lastMenstrualPeriodDate     DateTime?         @db.Date
  menstrualCycleDays          Int?              @default(28)
  menstrualFlowDurationDays   Int?              @default(5)
  dysmenorrheaReported        Boolean           @default(false)
  abnormalBleedingPattern     String?           @db.VarChar(128) // POST_COITAL, INTERMENSTRUAL, MENORRHAGIA
  externalGenitaliaFindings   String?           @db.Text
  speculumCervicalVisual      String?           @db.Text
  bimanualUterineSizeWeeks    Int?              // Uterine enlargement in equivalent weeks
  adnexalTendernessOrMass     String?           @db.Text
  papSmearSampleCollected     Boolean           @default(false)
  hpvDnaSampleCollected       Boolean           @default(false)
  isConfidential              Boolean           @default(true) // Sensitive health record protection
  clinicalImpression          String?           @db.Text
  examinerMembershipId        String            @db.Uuid
  version                     Int               @default(1)
  createdAt                   DateTime          @default(now()) @db.Timestamptz(3)
  updatedAt                   DateTime          @updatedAt @db.Timestamptz(3)

  clinic                      Clinic            @relation(fields: [clinicId], references: [id], onDelete: Restrict, onUpdate: Restrict)
  patient                     Patient           @relation(fields: [clinicId, patientId], references: [clinicId, id], onDelete: Restrict, onUpdate: Restrict)
  encounter                   ClinicalEncounter @relation(fields: [clinicId, encounterId], references: [clinicId, id], onDelete: Restrict, onUpdate: Restrict)

  @@unique([clinicId, id])
  @@index([clinicId, patientId, examinationDate])
  @@index([clinicId, encounterId])
}
```

---

## 5. Ophthalmology and ENT Blueprint (`OPHTHALMOLOGY`, `ENT`)

### 5.1 Domain Overview & Diagnostic Separation
In eye and ear-nose-throat medicine, physical instrumental measurements must be strictly isolated from clinical diagnostic interpretations:
1. **Ophthalmology:** Captures standardized visual acuity (OD: Oculus Dexter - Right Eye, OS: Oculus Sinister - Left Eye, OU: Oculus Uterque - Both Eyes), objective and subjective refraction (Sphere, Cylinder, Axis, Add, PD), intraocular pressure (IOP in mmHg) with tonometry method and timestamp, and slit-lamp / funduscopy findings.
2. **ENT:** Captures structured otoscopy (tympanic membrane integrity, perforation, effusion), rhinoscopy (septal deviation, turbinate hypertrophy), oropharynx evaluation (Friedman tonsil grade), and diagnostic pure-tone audiometry (PTA) decibel hearing threshold levels.

### 5.2 Proposed Prisma Data Models

```prisma
enum AnatomicalLaterality {
  RIGHT_EYE_OD
  LEFT_EYE_OS
  BOTH_EYES_OU
  RIGHT_EAR_AD
  LEFT_EAR_AS
  BOTH_EARS_AU
  BILATERAL
}

enum VisualAcuityScale {
  SNELLEN_FEET_20_20
  SNELLEN_METERS_6_6
  LOGMAR
  DECIMAL
}

enum TonometryMethod {
  GOLDMANN_APPLANATION
  NON_CONTACT_AIR_PUFF
  TONOPEN
  ICARE_REBOUND
  PERKINS_PORTABLE
}

enum TonsilFriedmanGrade {
  GRADE_0_SURGICALLY_ABSENT
  GRADE_1_WITHIN_PILLARS
  GRADE_2_EXTENDING_TO_PILLARS
  GRADE_3_BEYOND_PILLARS
  GRADE_4_KISSING_TONSILS
}

enum TympanogramType {
  TYPE_A_NORMAL_COMPLIANCE
  TYPE_AS_STIFF_SYSTEM
  TYPE_AD_HIGH_COMPLIANCE_FLACCID
  TYPE_B_FLAT_EFFUSION
  TYPE_C_NEGATIVE_PRESSURE
}

model OphthalmicRefractionRecord {
  id                          String            @id @default(uuid()) @db.Uuid
  clinicId                    String            @db.Uuid
  patientId                   String            @db.Uuid
  encounterId                 String            @db.Uuid
  acuityScale                 VisualAcuityScale @default(SNELLEN_METERS_6_6)
  pupillaryDistanceMm         Decimal?          @db.Decimal(4, 1)

  // Right Eye (OD) Refraction
  odSphereDiopters            Decimal?          @db.Decimal(5, 2) // e.g. -2.50
  odCylinderDiopters          Decimal?          @db.Decimal(5, 2) // e.g. -0.75
  odAxisDegrees               Int?              // 1 to 180
  odReadingAddDiopters        Decimal?          @db.Decimal(4, 2) // e.g. +1.75
  odUncorrectedVisualAcuity   String?           @db.VarChar(32)   // e.g. "6/18"
  odCorrectedVisualAcuity     String?           @db.VarChar(32)   // e.g. "6/6"
  odPinholeVisualAcuity       String?           @db.VarChar(32)

  // Left Eye (OS) Refraction
  osSphereDiopters            Decimal?          @db.Decimal(5, 2)
  osCylinderDiopters          Decimal?          @db.Decimal(5, 2)
  osAxisDegrees               Int?
  osReadingAddDiopters        Decimal?          @db.Decimal(4, 2)
  osUncorrectedVisualAcuity   String?           @db.VarChar(32)
  osCorrectedVisualAcuity     String?           @db.VarChar(32)
  osPinholeVisualAcuity       String?           @db.VarChar(32)

  // Binocular (OU)
  ouVisualAcuity              String?           @db.VarChar(32)
  notes                       String?           @db.Text
  optometristMembershipId     String            @db.Uuid
  version                     Int               @default(1)
  createdAt                   DateTime          @default(now()) @db.Timestamptz(3)
  updatedAt                   DateTime          @updatedAt @db.Timestamptz(3)

  clinic                      Clinic            @relation(fields: [clinicId], references: [id], onDelete: Restrict, onUpdate: Restrict)
  patient                     Patient           @relation(fields: [clinicId, patientId], references: [clinicId, id], onDelete: Restrict, onUpdate: Restrict)
  encounter                   ClinicalEncounter @relation(fields: [clinicId, encounterId], references: [clinicId, id], onDelete: Restrict, onUpdate: Restrict)

  @@unique([clinicId, id])
  @@index([clinicId, patientId])
  @@index([clinicId, encounterId])
}

model OphthalmicExaminationRecord {
  id                          String            @id @default(uuid()) @db.Uuid
  clinicId                    String            @db.Uuid
  patientId                   String            @db.Uuid
  encounterId                 String            @db.Uuid
  tonometryMethod             TonometryMethod   @default(GOLDMANN_APPLANATION)
  odIntraocularPressureMmHg   Decimal?          @db.Decimal(4, 1) // e.g. 15.5 mmHg
  osIntraocularPressureMmHg   Decimal?          @db.Decimal(4, 1)
  tonometryTime               DateTime          @default(now()) @db.Timestamptz(3)

  // Anterior Segment (OD / OS)
  odCorneaFindings            String?           @db.VarChar(255)
  osCorneaFindings            String?           @db.VarChar(255)
  odAnteriorChamber           String?           @db.VarChar(255)
  osAnteriorChamber           String?           @db.VarChar(255)
  odLensCondition             String?           @db.VarChar(255) // CLEAR, NUCLEAR_CATARACT, PSEUDOPHAKIC
  osLensCondition             String?           @db.VarChar(255)

  // Posterior Segment / Funduscopy (OD / OS)
  odCupToDiscRatio            Decimal?          @db.Decimal(3, 2) // e.g. 0.35
  osCupToDiscRatio            Decimal?          @db.Decimal(3, 2)
  odMaculaFindings            String?           @db.VarChar(255)
  osMaculaFindings            String?           @db.VarChar(255)
  odRetinalPeriphery          String?           @db.VarChar(255)
  osRetinalPeriphery          String?           @db.VarChar(255)

  examinerMembershipId        String            @db.Uuid
  version                     Int               @default(1)
  createdAt                   DateTime          @default(now()) @db.Timestamptz(3)
  updatedAt                   DateTime          @updatedAt @db.Timestamptz(3)

  clinic                      Clinic            @relation(fields: [clinicId], references: [id], onDelete: Restrict, onUpdate: Restrict)
  patient                     Patient           @relation(fields: [clinicId, patientId], references: [clinicId, id], onDelete: Restrict, onUpdate: Restrict)
  encounter                   ClinicalEncounter @relation(fields: [clinicId, encounterId], references: [clinicId, id], onDelete: Restrict, onUpdate: Restrict)

  @@unique([clinicId, id])
  @@index([clinicId, patientId])
  @@index([clinicId, encounterId])
}

model EntExaminationRecord {
  id                          String              @id @default(uuid()) @db.Uuid
  clinicId                    String              @db.Uuid
  patientId                   String              @db.Uuid
  encounterId                 String              @db.Uuid

  // Otoscopy
  rightEarCanal               String?             @db.VarChar(255)
  rightTympanicMembrane       String?             @db.VarChar(255) // INTACT, PERFORATION_CENTRAL, EFFUSION
  leftEarCanal                String?             @db.VarChar(255)
  leftTympanicMembrane        String?             @db.VarChar(255)

  // Rhinoscopy
  nasalSeptumDeformity        String?             @db.VarChar(128) // MIDLINE, DEVIATED_RIGHT, DEVIATED_LEFT
  turbinateHypertrophy        String?             @db.VarChar(128)
  nasalPolypsPresent          Boolean             @default(false)
  nasalDischargeDescription   String?             @db.VarChar(255)

  // Throat & Pharynx
  tonsilSizeGrade             TonsilFriedmanGrade @default(GRADE_1_WITHIN_PILLARS)
  posteriorPharyngealWall     String?             @db.VarChar(255)
  uvulaPalateSymmetry         String?             @db.VarChar(128)
  vocalCordMobility           String?             @db.VarChar(255)

  examinerMembershipId        String              @db.Uuid
  version                     Int                 @default(1)
  createdAt                   DateTime            @default(now()) @db.Timestamptz(3)
  updatedAt                   DateTime            @updatedAt @db.Timestamptz(3)

  clinic                      Clinic              @relation(fields: [clinicId], references: [id], onDelete: Restrict, onUpdate: Restrict)
  patient                     Patient             @relation(fields: [clinicId, patientId], references: [clinicId, id], onDelete: Restrict, onUpdate: Restrict)
  encounter                   ClinicalEncounter   @relation(fields: [clinicId, encounterId], references: [clinicId, id], onDelete: Restrict, onUpdate: Restrict)

  @@unique([clinicId, id])
  @@index([clinicId, patientId])
  @@index([clinicId, encounterId])
}

model AudiometryAssessmentRecord {
  id                          String          @id @default(uuid()) @db.Uuid
  clinicId                    String          @db.Uuid
  patientId                   String          @db.Uuid
  encounterId                 String          @db.Uuid
  orderId                     String?         @db.Uuid // Links to ClinicalOrder

  // Right Ear Air Conduction Thresholds (dB HL at 250, 500, 1000, 2000, 4000, 8000 Hz)
  rightAirThresholdsDb        Int[]           // Array of 6 integer values (-10 to 120 dB)
  leftAirThresholdsDb         Int[]           // Array of 6 integer values (-10 to 120 dB)

  // Bone Conduction Thresholds (dB HL at 500, 1000, 2000, 4000 Hz)
  rightBoneThresholdsDb       Int[]           // Array of 4 integer values (-10 to 80 dB)
  leftBoneThresholdsDb        Int[]           // Array of 4 integer values (-10 to 80 dB)

  rightTympanogramType        TympanogramType @default(TYPE_A_NORMAL_COMPLIANCE)
  leftTympanogramType         TympanogramType @default(TYPE_A_NORMAL_COMPLIANCE)
  speechReceptionThresholdDbR Int?
  speechReceptionThresholdDbL Int?
  speechDiscriminationScoreR  Decimal?        @db.Decimal(5, 2) // Percentage 0 - 100%
  speechDiscriminationScoreL  Decimal?        @db.Decimal(5, 2)

  clinicalImpression          String?         @db.Text // e.g. "Bilateral mild sensorineural hearing loss"
  audiologistMembershipId     String          @db.Uuid
  version                     Int             @default(1)
  createdAt                   DateTime        @default(now()) @db.Timestamptz(3)
  updatedAt                   DateTime        @updatedAt @db.Timestamptz(3)

  clinic                      Clinic          @relation(fields: [clinicId], references: [id], onDelete: Restrict, onUpdate: Restrict)
  patient                     Patient         @relation(fields: [clinicId, patientId], references: [clinicId, id], onDelete: Restrict, onUpdate: Restrict)
  encounter                   ClinicalEncounter @relation(fields: [clinicId, encounterId], references: [clinicId, id], onDelete: Restrict, onUpdate: Restrict)

  @@unique([clinicId, id])
  @@index([clinicId, patientId])
  @@index([clinicId, encounterId])
}
```

---

## 6. Orthopedics and Physiotherapy Blueprint (`ORTHOPEDICS`, `PHYSIOTHERAPY`)

### 6.1 Domain Overview & Multi-Session Rehabilitation
Orthopedic medicine and physiotherapy require tracking longitudinal musculoskeletal functional restoration:
1. **Goniometric Range-of-Motion (ROM):** Captures active and passive joint angles in degrees across anatomical axes (flexion, extension, rotation) with pain thresholds and contralateral comparison.
2. **Rehabilitation Episodes:** Group multiple outpatient physical therapy sessions under a single clinical referral, tracking progress against standardized functional scales (Oswestry Disability Index for low back pain, DASH for upper extremity, Lysholm for knee).
3. **Role & Privilege Separation:** Distinguishes between orthopedic surgeons (authorized for surgical interventions, intra-articular injections, and prescription medications) and physiotherapists (authorized for functional goniometry, manual therapy, and therapeutic exercise execution).

### 6.2 Proposed Prisma Data Models

```prisma
enum JointAnatomicalRegion {
  CERVICAL_SPINE
  THORACIC_SPINE
  LUMBAR_SPINE
  SHOULDER_JOINT
  ELBOW_JOINT
  WRIST_AND_HAND
  HIP_JOINT
  KNEE_JOINT
  ANKLE_AND_FOOT
}

enum JointMovementAxis {
  FLEXION
  EXTENSION
  ABDUCTION
  ADDUCTION
  INTERNAL_ROTATION
  EXTERNAL_ROTATION
  PRONATION
  SUPINATION
  DORSIFLEXION
  PLANTARFLEXION
  LATERAL_FLEXION
}

enum RehabilitationStatus {
  ACTIVE_THERAPY
  GOAL_MET_DISCHARGED
  PATIENT_DISCONTINUED
  SURGICAL_RECONSULT_REQUIRED
}

enum FunctionalAssessmentScale {
  OSWESTRY_DISABILITY_INDEX // Low Back Pain (0 - 100%)
  DASH_UPPER_EXTREMITY      // Disabilities of Arm, Shoulder & Hand (0 - 100)
  LYSHOLM_KNEE_SCORE        // Knee Function (0 - 100)
  BERG_BALANCE_SCALE        // Fall Risk Balance (0 - 56)
  NUMERIC_PAIN_RATING_VAS   // Visual Analog Scale (0 - 10)
}

model MusculoskeletalExamination {
  id                          String                @id @default(uuid()) @db.Uuid
  clinicId                    String                @db.Uuid
  patientId                   String                @db.Uuid
  encounterId                 String                @db.Uuid
  region                      JointAnatomicalRegion
  laterality                  AnatomicalLaterality  @default(RIGHT_EYE_OD) // mapped laterality
  swellingPresent             Boolean               @default(false)
  erythemaPresent             Boolean               @default(false)
  jointDeformityDescription   String?               @db.VarChar(255)
  tendernessLocalized         String?               @db.VarChar(255)
  muscleStrengthMrcGrade      Int?                  // MRC Scale 0 to 5
  sensationIntact             Boolean               @default(true)
  peripheralPulsesPalpable    Boolean               @default(true)
  provocativeTests            Json?                 @db.JsonB // e.g. {"lachman": "NEGATIVE", "mcmurray": "POSITIVE"}
  clinicalImpression          String?               @db.Text
  examinerMembershipId        String                @db.Uuid
  version                     Int                   @default(1)
  createdAt                   DateTime              @default(now()) @db.Timestamptz(3)
  updatedAt                   DateTime              @updatedAt @db.Timestamptz(3)

  clinic                      Clinic                @relation(fields: [clinicId], references: [id], onDelete: Restrict, onUpdate: Restrict)
  patient                     Patient               @relation(fields: [clinicId, patientId], references: [clinicId, id], onDelete: Restrict, onUpdate: Restrict)
  encounter                   ClinicalEncounter     @relation(fields: [clinicId, encounterId], references: [clinicId, id], onDelete: Restrict, onUpdate: Restrict)

  @@unique([clinicId, id])
  @@index([clinicId, patientId, region])
  @@index([clinicId, encounterId])
}

model JointRangeOfMotionRecord {
  id                          String                @id @default(uuid()) @db.Uuid
  clinicId                    String                @db.Uuid
  patientId                   String                @db.Uuid
  encounterId                 String                @db.Uuid
  region                      JointAnatomicalRegion
  movementAxis                JointMovementAxis
  laterality                  AnatomicalLaterality
  activeDegrees               Int                   // Measured via goniometer (0 - 360)
  passiveDegrees              Int?                  // Measured with therapist assistance
  contralateralDegrees        Int?                  // Healthy side comparison
  painReportedAtDegrees       Int?                  // Arc of motion pain onset
  endFeelDescription          String?               @db.VarChar(64) // NORMAL_FIRM, HARD_BONY, EMPTY_PAIN
  measuredByMembershipId      String                @db.Uuid
  version                     Int                   @default(1)
  createdAt                   DateTime              @default(now()) @db.Timestamptz(3)
  updatedAt                   DateTime              @updatedAt @db.Timestamptz(3)

  clinic                      Clinic                @relation(fields: [clinicId], references: [id], onDelete: Restrict, onUpdate: Restrict)
  patient                     Patient               @relation(fields: [clinicId, patientId], references: [clinicId, id], onDelete: Restrict, onUpdate: Restrict)
  encounter                   ClinicalEncounter     @relation(fields: [clinicId, encounterId], references: [clinicId, id], onDelete: Restrict, onUpdate: Restrict)

  @@unique([clinicId, id])
  @@index([clinicId, patientId, region, movementAxis])
  @@index([clinicId, encounterId])
}

model PhysiotherapyRehabilitationEpisode {
  id                          String                    @id @default(uuid()) @db.Uuid
  clinicId                    String                    @db.Uuid
  patientId                   String                    @db.Uuid
  referringPhysicianMembershipId String?                @db.Uuid
  primaryDiagnosisCodeIcd10   String                    @db.VarChar(32)
  diagnosisNarrative          String                    @db.VarChar(255)
  prescribedSessionCount      Int                       @default(10)
  completedSessionCount       Int                       @default(0)
  functionalScale             FunctionalAssessmentScale @default(NUMERIC_PAIN_RATING_VAS)
  baselineFunctionalScore     Decimal                   @db.Decimal(5, 2)
  currentFunctionalScore      Decimal                   @db.Decimal(5, 2)
  rehabilitationGoal          String                    @db.Text
  status                      RehabilitationStatus      @default(ACTIVE_THERAPY)
  leadTherapistMembershipId   String                    @db.Uuid
  version                     Int                       @default(1)
  createdAt                   DateTime                  @default(now()) @db.Timestamptz(3)
  updatedAt                   DateTime                  @updatedAt @db.Timestamptz(3)

  clinic                      Clinic                    @relation(fields: [clinicId], references: [id], onDelete: Restrict, onUpdate: Restrict)
  patient                     Patient                   @relation(fields: [clinicId, patientId], references: [clinicId, id], onDelete: Restrict, onUpdate: Restrict)
  sessions                    PhysiotherapySessionRecord[]

  @@unique([clinicId, id])
  @@index([clinicId, patientId, status])
}

model PhysiotherapySessionRecord {
  id                          String                             @id @default(uuid()) @db.Uuid
  clinicId                    String                             @db.Uuid
  episodeId                   String                             @db.Uuid
  patientId                   String                             @db.Uuid
  encounterId                 String                             @db.Uuid
  sessionIndex                Int                                // Session #1, #2, etc.
  preSessionPainScoreVas      Int                                // 0 - 10
  postSessionPainScoreVas     Int                                // 0 - 10
  modalitiesAdministered      String[]                           @default([]) // ["MANUAL_THERAPY", "TENS", "CRYOTHERAPY"]
  exercisesPerformed          Json                               @db.JsonB    // Array of exercises: [{name, sets, reps, resistance}]
  patientTolerance            String                             @default("WELL_TOLERATED") @db.VarChar(64)
  homeExerciseProgramGiven    Boolean                            @default(false)
  therapistNotes              String?                            @db.Text
  therapistMembershipId       String                             @db.Uuid
  version                     Int                                @default(1)
  createdAt                   DateTime                           @default(now()) @db.Timestamptz(3)
  updatedAt                   DateTime                           @updatedAt @db.Timestamptz(3)

  clinic                      Clinic                             @relation(fields: [clinicId], references: [id], onDelete: Restrict, onUpdate: Restrict)
  episode                     PhysiotherapyRehabilitationEpisode @relation(fields: [clinicId, episodeId], references: [clinicId, id], onDelete: Restrict, onUpdate: Restrict)
  patient                     Patient                            @relation(fields: [clinicId, patientId], references: [clinicId, id], onDelete: Restrict, onUpdate: Restrict)
  encounter                   ClinicalEncounter                  @relation(fields: [clinicId, encounterId], references: [clinicId, id], onDelete: Restrict, onUpdate: Restrict)

  @@unique([clinicId, id])
  @@unique([clinicId, episodeId, sessionIndex])
  @@index([clinicId, encounterId])
}
```

---

## 7. Specialty Privilege Matrix

The following matrix defines required clinical privilege codes and permissible practitioner roles across all Phase 8 operations:

| Clinical Operation | Required Privilege Code | Permitted Specialties | Permitted Roles | Negative Boundary (Strictly Denied) |
| :--- | :--- | :--- | :--- | :--- |
| **Odontogram Charting & Examination** | `DENTAL_EXAMINATION_RECORD` | `DENTISTRY` | `DOCTOR` (Dentist) | Clinic Owners, Receptionists, Nurses, General Doctors |
| **Dental Surgical & Restorative Procedures** | `DENTAL_PROCEDURE_PERFORM` | `DENTISTRY` | `DOCTOR` (Dental Surgeon) | Dental Hygienists, Administrators, Non-Dentists |
| **Pediatric Growth & Developmental Exam** | `PEDIATRIC_CARE_DOCUMENT` | `PEDIATRICS` | `DOCTOR` (Pediatrician) | Clinic Administrators, Dentists, Adult Practitioners |
| **Pediatric Dosing & Prescription Sign** | `MEDICATION_PRESCRIBE` | `PEDIATRICS`, `GENERAL_MEDICINE` | `DOCTOR` (Verified license) | Physiotherapists, Optometrists, Clinic Owners |
| **Antenatal Examination & Dating Signoff** | `ANTENATAL_CARE_DOCUMENT` | `OB_GYN` | `DOCTOR` (Obstetrician) | General Surgeons, Dentists, Allied Health |
| **Sensitive Gynecological Examination** | `GYNECOLOGICAL_EXAM_PERFORM` | `OB_GYN` | `DOCTOR` (Gynecologist) | Unconfidential staff, Administrative roles |
| **Subjective & Objective Refraction** | `REFRACTION_MEASURE` | `OPHTHALMOLOGY` | `DOCTOR`, `ALLIED_HEALTH` (Optometrist) | Dentists, Physiotherapists, Receptionists |
| **Ophthalmic Surgery & Injections** | `OPHTHALMIC_PROCEDURE_PERFORM`| `OPHTHALMOLOGY` | `DOCTOR` (Ophthalmologist) | Optometrists, General Practitioners, Nurses |
| **ENT Endoscopy & Hearing Assessment** | `ENT_PROCEDURE_PERFORM` | `ENT` | `DOCTOR` (ENT Specialist), `ALLIED_HEALTH` (Audiologist) | Non-ENT doctors, Clinic Administrators |
| **Orthopedic Physical & Surgical Exam** | `ORTHOPEDIC_EXAM_PERFORM` | `ORTHOPEDICS` | `DOCTOR` (Orthopedic Surgeon) | Physiotherapists, Dentists, Clinic Owners |
| **Physiotherapy Rehabilitation Execution** | `PHYSIOTHERAPY_PLAN_EXECUTE`| `PHYSIOTHERAPY` | `ALLIED_HEALTH` (Physiotherapist) | Non-clinical staff, Autonomous surgical intervention |
| **Confidential Record Access (Break-Glass)**| `EMERGENCY_BREAK_GLASS_EXECUTE`| All Medical Specialties | `DOCTOR` (Emergency Context) | Clinic Owners, Accountants, Self-Auditors |
