-- Migration 043: Obstetrics & Gynecology Module (Step 8.4)
-- Introduces PregnancyEpisode, AntenatalVisitRecord, ObstetricHistoryRecord, and GynecologicalExamination
-- Enforces PostgreSQL FORCE ROW LEVEL SECURITY, same-clinic composite FKs, and clinical safety immutability

-- 1. Additive Clinical Privilege Codes
ALTER TYPE public."ClinicalPrivilegeCode" ADD VALUE IF NOT EXISTS 'ANTENATAL_CARE_DOCUMENT';
ALTER TYPE public."ClinicalPrivilegeCode" ADD VALUE IF NOT EXISTS 'OBSTETRIC_DATING_REVIEW';
ALTER TYPE public."ClinicalPrivilegeCode" ADD VALUE IF NOT EXISTS 'OBSTETRIC_EPISODE_FINALIZE';
ALTER TYPE public."ClinicalPrivilegeCode" ADD VALUE IF NOT EXISTS 'GYNECOLOGICAL_EXAM_PERFORM';
ALTER TYPE public."ClinicalPrivilegeCode" ADD VALUE IF NOT EXISTS 'GYNECOLOGICAL_RECORD_REVIEW';

-- 2. New Specialty Enums
DO $$ BEGIN
  CREATE TYPE public."PregnancyEpisodeStatus" AS ENUM (
    'ACTIVE', 'COMPLETED', 'TERMINATED', 'TRANSFERRED_OUT', 'ENTERED_IN_ERROR'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public."DatingMethod" AS ENUM (
    'LMP_CERTAIN', 'LMP_UNCERTAIN', 'ULTRASOUND_FIRST_TRIMESTER',
    'ULTRASOUND_SECOND_TRIMESTER', 'CLINICAL_ESTIMATE', 'ASSISTED_REPRODUCTION'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public."FetalPresentation" AS ENUM (
    'CEPHALIC', 'BREECH', 'TRANSVERSE', 'OBLIQUE', 'UNSTABLE'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public."DeliveryOutcome" AS ENUM (
    'LIVE_BIRTH_SPONTANEOUS_VAGINAL', 'LIVE_BIRTH_ASSISTED_VAGINAL',
    'LIVE_BIRTH_CESAREAN_PLANNED', 'LIVE_BIRTH_CESAREAN_EMERGENCY',
    'STILLBIRTH', 'MISCARRIAGE_EARLY', 'MISCARRIAGE_LATE',
    'ECTOPIC_PREGNANCY', 'MOLAR_PREGNANCY', 'MEDICAL_TERMINATION', 'OTHER'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public."GynecologicalExamType" AS ENUM (
    'GENERAL_PELVIC', 'CERVICAL_SCREENING', 'COLPOSCOPY',
    'VULVAR_EXAMINATION', 'ULTRASOUND_TRANSVAGINAL', 'POST_OPERATIVE', 'OTHER'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public."ObGynRecordStatus" AS ENUM (
    'DRAFT', 'FINALIZED', 'ENTERED_IN_ERROR'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 3. Create Tables
CREATE TABLE IF NOT EXISTS public."PregnancyEpisode" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "clinicId" UUID NOT NULL,
  "patientId" UUID NOT NULL,
  "episodeNumber" INTEGER NOT NULL DEFAULT 1,
  "status" public."PregnancyEpisodeStatus" NOT NULL DEFAULT 'ACTIVE',
  "gravidity" INTEGER NOT NULL,
  "parity" INTEGER NOT NULL,
  "termDeliveries" INTEGER NOT NULL DEFAULT 0,
  "pretermDeliveries" INTEGER NOT NULL DEFAULT 0,
  "abortions" INTEGER NOT NULL DEFAULT 0,
  "livingChildren" INTEGER NOT NULL DEFAULT 0,
  "multipleGestationCount" INTEGER NOT NULL DEFAULT 1,
  "lastMenstrualPeriodDate" DATE,
  "lmpCertainty" BOOLEAN NOT NULL DEFAULT true,
  "ultrasoundDatingDate" DATE,
  "crownRumpLengthMm" DECIMAL(5, 1),
  "biparietalDiameterMm" DECIMAL(5, 1),
  "ultrasoundEstimatedGestationalDays" INTEGER,
  "estimatedDueDate" DATE NOT NULL,
  "datingMethod" public."DatingMethod" NOT NULL DEFAULT 'LMP_CERTAIN',
  "datingRationale" VARCHAR(500),
  "datingReviewedByMembershipId" UUID,
  "datingReviewedAt" TIMESTAMPTZ(3),
  "isDatingFinalized" BOOLEAN NOT NULL DEFAULT false,
  "bloodGroupRh" VARCHAR(16),
  "rhAntibodyScreenPositive" BOOLEAN NOT NULL DEFAULT false,
  "highRiskFlag" BOOLEAN NOT NULL DEFAULT false,
  "highRiskJustification" TEXT,
  "outcomeDate" DATE,
  "outcomeSummary" TEXT,
  "finalizedByMembershipId" UUID,
  "finalizedAt" TIMESTAMPTZ(3),
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "PregnancyEpisode_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PregnancyEpisode_clinicId_id_key" UNIQUE ("clinicId", "id"),
  CONSTRAINT "PregnancyEpisode_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES public."Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "PregnancyEpisode_patient_fkey" FOREIGN KEY ("clinicId", "patientId") REFERENCES public."Patient"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "PregnancyEpisode_datingReviewedBy_fkey" FOREIGN KEY ("clinicId", "datingReviewedByMembershipId") REFERENCES public."ClinicMembership"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "PregnancyEpisode_finalizedBy_fkey" FOREIGN KEY ("clinicId", "finalizedByMembershipId") REFERENCES public."ClinicMembership"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE INDEX IF NOT EXISTS "PregnancyEpisode_clinicId_patientId_status_idx" ON public."PregnancyEpisode"("clinicId", "patientId", "status");

CREATE TABLE IF NOT EXISTS public."AntenatalVisitRecord" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "clinicId" UUID NOT NULL,
  "patientId" UUID NOT NULL,
  "pregnancyEpisodeId" UUID NOT NULL,
  "encounterId" UUID NOT NULL,
  "recordedByMembershipId" UUID NOT NULL,
  "visitDate" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "gestationalAgeWeeks" INTEGER NOT NULL,
  "gestationalAgeDays" INTEGER NOT NULL DEFAULT 0,
  "systolicBp" INTEGER NOT NULL,
  "diastolicBp" INTEGER NOT NULL,
  "weightKg" DECIMAL(5, 2),
  "fundalHeightCm" DECIMAL(4, 1),
  "fetalHeartRateBpm" INTEGER,
  "fetalPresentation" public."FetalPresentation",
  "fetalMovementPresent" BOOLEAN NOT NULL DEFAULT true,
  "urineProtein" VARCHAR(32),
  "urineGlucose" VARCHAR(32),
  "peripheralEdema" VARCHAR(64),
  "clinicalNotes" TEXT,
  "managementPlan" TEXT,
  "nextVisitRecommendedWeeks" INTEGER DEFAULT 4,
  "diagnosticOrderIds" TEXT[] NOT NULL DEFAULT '{}',
  "imagingDocumentIds" TEXT[] NOT NULL DEFAULT '{}',
  "status" public."ObGynRecordStatus" NOT NULL DEFAULT 'FINALIZED',
  "errorReason" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "AntenatalVisitRecord_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AntenatalVisitRecord_clinicId_id_key" UNIQUE ("clinicId", "id"),
  CONSTRAINT "AntenatalVisitRecord_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES public."Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "AntenatalVisitRecord_patient_fkey" FOREIGN KEY ("clinicId", "patientId") REFERENCES public."Patient"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "AntenatalVisitRecord_pregnancyEpisode_fkey" FOREIGN KEY ("clinicId", "pregnancyEpisodeId") REFERENCES public."PregnancyEpisode"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "AntenatalVisitRecord_encounter_fkey" FOREIGN KEY ("clinicId", "encounterId") REFERENCES public."ClinicalEncounter"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "AntenatalVisitRecord_recordedBy_fkey" FOREIGN KEY ("clinicId", "recordedByMembershipId") REFERENCES public."ClinicMembership"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE INDEX IF NOT EXISTS "AntenatalVisitRecord_clinicId_pregnancyEpisodeId_visitDate_idx" ON public."AntenatalVisitRecord"("clinicId", "pregnancyEpisodeId", "visitDate");
CREATE INDEX IF NOT EXISTS "AntenatalVisitRecord_clinicId_patientId_idx" ON public."AntenatalVisitRecord"("clinicId", "patientId");
CREATE INDEX IF NOT EXISTS "AntenatalVisitRecord_clinicId_encounterId_idx" ON public."AntenatalVisitRecord"("clinicId", "encounterId");

CREATE TABLE IF NOT EXISTS public."ObstetricHistoryRecord" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "clinicId" UUID NOT NULL,
  "patientId" UUID NOT NULL,
  "recordedByMembershipId" UUID NOT NULL,
  "pregnancyNumber" INTEGER NOT NULL,
  "yearOfDelivery" INTEGER,
  "gestationalAgeWeeks" INTEGER,
  "deliveryOutcome" public."DeliveryOutcome" NOT NULL DEFAULT 'LIVE_BIRTH_SPONTANEOUS_VAGINAL',
  "deliveryMode" public."DeliveryMode" NOT NULL DEFAULT 'VAGINAL',
  "birthWeightGrams" INTEGER,
  "babyGender" public."PatientGender",
  "anesthesiaType" VARCHAR(64),
  "previousUterineSurgery" BOOLEAN NOT NULL DEFAULT false,
  "uterineSurgeryDetails" VARCHAR(255),
  "complications" TEXT,
  "neonatalOutcome" TEXT,
  "notes" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "ObstetricHistoryRecord_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ObstetricHistoryRecord_clinicId_id_key" UNIQUE ("clinicId", "id"),
  CONSTRAINT "ObstetricHistoryRecord_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES public."Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "ObstetricHistoryRecord_patient_fkey" FOREIGN KEY ("clinicId", "patientId") REFERENCES public."Patient"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "ObstetricHistoryRecord_recordedBy_fkey" FOREIGN KEY ("clinicId", "recordedByMembershipId") REFERENCES public."ClinicMembership"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE INDEX IF NOT EXISTS "ObstetricHistoryRecord_clinicId_patientId_pregnancyNumber_idx" ON public."ObstetricHistoryRecord"("clinicId", "patientId", "pregnancyNumber");

CREATE TABLE IF NOT EXISTS public."GynecologicalExamination" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "clinicId" UUID NOT NULL,
  "patientId" UUID NOT NULL,
  "encounterId" UUID NOT NULL,
  "examinerMembershipId" UUID NOT NULL,
  "examinationDate" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "examinationType" public."GynecologicalExamType" NOT NULL DEFAULT 'GENERAL_PELVIC',
  "isConfidential" BOOLEAN NOT NULL DEFAULT true,
  "indicationsSymptoms" TEXT,
  "lastMenstrualPeriodDate" DATE,
  "menstrualCycleDays" INTEGER DEFAULT 28,
  "menstrualFlowDurationDays" INTEGER DEFAULT 5,
  "dysmenorrheaReported" BOOLEAN NOT NULL DEFAULT false,
  "abnormalBleedingPattern" VARCHAR(128),
  "externalGenitaliaFindings" TEXT,
  "speculumExaminationFindings" TEXT,
  "bimanualExaminationFindings" TEXT,
  "cervicalScreeningSampleCollected" BOOLEAN NOT NULL DEFAULT false,
  "cervicalScreeningTestType" VARCHAR(64),
  "chaperonePresent" BOOLEAN NOT NULL DEFAULT true,
  "chaperoneNameOrId" VARCHAR(128),
  "clinicalAssessment" TEXT,
  "managementPlan" TEXT,
  "consentEvidenceId" UUID,
  "linkedDocumentIds" TEXT[] NOT NULL DEFAULT '{}',
  "status" public."ObGynRecordStatus" NOT NULL DEFAULT 'FINALIZED',
  "errorReason" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "GynecologicalExamination_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GynecologicalExamination_clinicId_id_key" UNIQUE ("clinicId", "id"),
  CONSTRAINT "GynecologicalExamination_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES public."Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "GynecologicalExamination_patient_fkey" FOREIGN KEY ("clinicId", "patientId") REFERENCES public."Patient"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "GynecologicalExamination_encounter_fkey" FOREIGN KEY ("clinicId", "encounterId") REFERENCES public."ClinicalEncounter"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "GynecologicalExamination_examiner_fkey" FOREIGN KEY ("clinicId", "examinerMembershipId") REFERENCES public."ClinicMembership"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE INDEX IF NOT EXISTS "GynecologicalExamination_clinicId_patientId_examinationDate_idx" ON public."GynecologicalExamination"("clinicId", "patientId", "examinationDate");
CREATE INDEX IF NOT EXISTS "GynecologicalExamination_clinicId_encounterId_idx" ON public."GynecologicalExamination"("clinicId", "encounterId");
CREATE INDEX IF NOT EXISTS "GynecologicalExamination_clinicId_isConfidential_idx" ON public."GynecologicalExamination"("clinicId", "isConfidential");

-- 4. Clinic Reassignment Guards
DROP TRIGGER IF EXISTS immutable_clinic ON public."PregnancyEpisode";
CREATE TRIGGER immutable_clinic BEFORE UPDATE OF "clinicId" ON public."PregnancyEpisode"
  FOR EACH ROW EXECUTE FUNCTION lamssa_security.reject_clinic_reassignment();

DROP TRIGGER IF EXISTS immutable_clinic ON public."AntenatalVisitRecord";
CREATE TRIGGER immutable_clinic BEFORE UPDATE OF "clinicId" ON public."AntenatalVisitRecord"
  FOR EACH ROW EXECUTE FUNCTION lamssa_security.reject_clinic_reassignment();

DROP TRIGGER IF EXISTS immutable_clinic ON public."ObstetricHistoryRecord";
CREATE TRIGGER immutable_clinic BEFORE UPDATE OF "clinicId" ON public."ObstetricHistoryRecord"
  FOR EACH ROW EXECUTE FUNCTION lamssa_security.reject_clinic_reassignment();

DROP TRIGGER IF EXISTS immutable_clinic ON public."GynecologicalExamination";
CREATE TRIGGER immutable_clinic BEFORE UPDATE OF "clinicId" ON public."GynecologicalExamination"
  FOR EACH ROW EXECUTE FUNCTION lamssa_security.reject_clinic_reassignment();

-- 5. Immutability & Status Guards for Finalized Clinical Records
CREATE OR REPLACE FUNCTION lamssa_security.obgyn_record_immutability_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF OLD."status" IN ('FINALIZED', 'ENTERED_IN_ERROR') THEN
    -- Only allow transitioning from FINALIZED to ENTERED_IN_ERROR
    IF OLD."status" = 'FINALIZED' AND NEW."status" = 'ENTERED_IN_ERROR' AND NEW."errorReason" IS NOT NULL THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Finalized OB/GYN records cannot be altered' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION lamssa_security.obgyn_record_immutability_guard() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_antenatal_visit_immutability ON public."AntenatalVisitRecord";
CREATE TRIGGER trg_antenatal_visit_immutability
  BEFORE UPDATE ON public."AntenatalVisitRecord"
  FOR EACH ROW EXECUTE FUNCTION lamssa_security.obgyn_record_immutability_guard();

DROP TRIGGER IF EXISTS trg_gynecological_exam_immutability ON public."GynecologicalExamination";
CREATE TRIGGER trg_gynecological_exam_immutability
  BEFORE UPDATE ON public."GynecologicalExamination"
  FOR EACH ROW EXECUTE FUNCTION lamssa_security.obgyn_record_immutability_guard();

-- 6. Enable & Force Row Level Security with Multi-Tenant Isolation Policies
DO $$ DECLARE t text; owner_name text:=current_user; pred text; BEGIN
  FOREACH t IN ARRAY ARRAY[
    'PregnancyEpisode',
    'AntenatalVisitRecord',
    'ObstetricHistoryRecord',
    'GynecologicalExamination'
  ] LOOP
    pred:=format('CASE WHEN current_user=%L THEN false ELSE lamssa_security.context_allows("clinicId") END', owner_name);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS maintenance_owner ON public.%I', t);
    EXECUTE format('CREATE POLICY maintenance_owner ON public.%I FOR ALL TO %I USING (true) WITH CHECK (true)', t, owner_name);
    EXECUTE format('DROP POLICY IF EXISTS tenant_select ON public.%I', t);
    EXECUTE format('CREATE POLICY tenant_select ON public.%I FOR SELECT USING (%s)', t, pred);
    EXECUTE format('DROP POLICY IF EXISTS tenant_insert ON public.%I', t);
    EXECUTE format('CREATE POLICY tenant_insert ON public.%I FOR INSERT WITH CHECK (%s)', t, pred);
    EXECUTE format('DROP POLICY IF EXISTS tenant_update ON public.%I', t);
    EXECUTE format('CREATE POLICY tenant_update ON public.%I FOR UPDATE USING (%s) WITH CHECK (%s)', t, pred, pred);
    EXECUTE format('DROP POLICY IF EXISTS tenant_delete ON public.%I', t);
    EXECUTE format('CREATE POLICY tenant_delete ON public.%I FOR DELETE USING (false)', t);
  END LOOP;
END $$;

-- 7. Grant Privileges to Runtime Application Roles
DO $$ DECLARE r text; BEGIN
  FOR r IN SELECT rolname FROM pg_roles WHERE rolname IN ('lamssa_app', 'lamssa_runtime', 'lamssa_dev_app', 'lamssa_test_app') LOOP
    EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON public."PregnancyEpisode", public."AntenatalVisitRecord", public."ObstetricHistoryRecord", public."GynecologicalExamination" TO %I', r);
  END LOOP;
END $$;
