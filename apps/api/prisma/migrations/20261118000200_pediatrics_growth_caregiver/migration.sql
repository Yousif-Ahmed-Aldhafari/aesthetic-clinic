-- Migration 042: Pediatrics & Child Health Module (Step 8.3)
-- Introduces PediatricBirthHistory, PatientCaregiverRelationship, PediatricGrowthRecord, and GrowthReference
-- Enforces PostgreSQL FORCE ROW LEVEL SECURITY, same-clinic composite FKs, and clinical safety immutability

-- 1. Additive Clinical Privilege Codes
ALTER TYPE public."ClinicalPrivilegeCode" ADD VALUE IF NOT EXISTS 'PEDIATRIC_CARE_DOCUMENT';
ALTER TYPE public."ClinicalPrivilegeCode" ADD VALUE IF NOT EXISTS 'PEDIATRIC_GROWTH_RECORD';
ALTER TYPE public."ClinicalPrivilegeCode" ADD VALUE IF NOT EXISTS 'PEDIATRIC_GROWTH_REVIEW';
ALTER TYPE public."ClinicalPrivilegeCode" ADD VALUE IF NOT EXISTS 'PEDIATRIC_BIRTH_HISTORY_VERIFY';

-- 2. New Specialty Enums
DO $$ BEGIN
  CREATE TYPE public."DeliveryMode" AS ENUM (
    'VAGINAL', 'CESAREAN_PLANNED', 'CESAREAN_EMERGENCY',
    'ASSISTED_VACUUM', 'ASSISTED_FORCEPS', 'OTHER'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public."BirthType" AS ENUM (
    'SINGLETON', 'TWIN', 'TRIPLET', 'MULTIPLE_HIGHER'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public."BirthHistorySource" AS ENUM (
    'MATERNAL_REPORT', 'HOSPITAL_DISCHARGE_SUMMARY',
    'BIRTH_CERTIFICATE', 'PHYSICIAN_DOCUMENTED', 'OTHER'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public."CaregiverRelationshipType" AS ENUM (
    'MOTHER', 'FATHER', 'LEGAL_GUARDIAN', 'GRANDPARENT',
    'SIBLING_ADULT', 'FOSTER_PARENT', 'CASE_WORKER', 'OTHER'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public."StatureMeasurementMethod" AS ENUM (
    'RECUMBENT_LENGTH', 'STANDING_HEIGHT'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public."MeasurementSource" AS ENUM (
    'CLINICAL_ENCOUNTER', 'NURSE_TRIAGE', 'COMMUNITY_SCREENING', 'HISTORICAL_RECORD'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public."GrowthRecordStatus" AS ENUM (
    'DRAFT', 'FINAL', 'ENTERED_IN_ERROR'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 3. Create Tables
CREATE TABLE IF NOT EXISTS public."PediatricBirthHistory" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "clinicId" UUID NOT NULL,
  "patientId" UUID NOT NULL,
  "gestationalAgeWeeks" INTEGER NOT NULL,
  "gestationalAgeDays" INTEGER NOT NULL DEFAULT 0,
  "birthWeightGrams" INTEGER,
  "birthLengthCm" DECIMAL(5, 2),
  "birthHeadCircumferenceCm" DECIMAL(5, 2),
  "apgar1Min" INTEGER,
  "apgar5Min" INTEGER,
  "apgar10Min" INTEGER,
  "deliveryMode" public."DeliveryMode" NOT NULL DEFAULT 'VAGINAL',
  "birthType" public."BirthType" NOT NULL DEFAULT 'SINGLETON',
  "birthComplications" TEXT,
  "maternalComplications" TEXT,
  "consanguinity" BOOLEAN NOT NULL DEFAULT false,
  "neonatalResuscitationRequired" BOOLEAN NOT NULL DEFAULT false,
  "nicAdmissionRequired" BOOLEAN NOT NULL DEFAULT false,
  "nicStayDays" INTEGER,
  "newbornScreeningNotes" TEXT,
  "source" public."BirthHistorySource" NOT NULL DEFAULT 'MATERNAL_REPORT',
  "verifiedByMembershipId" UUID,
  "verifiedAt" TIMESTAMPTZ(3),
  "version" INTEGER NOT NULL DEFAULT 1,
  "amendmentHistory" JSONB DEFAULT '[]'::jsonb,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "PediatricBirthHistory_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PediatricBirthHistory_clinicId_id_key" UNIQUE ("clinicId", "id"),
  CONSTRAINT "PediatricBirthHistory_clinicId_patientId_key" UNIQUE ("clinicId", "patientId"),
  CONSTRAINT "PediatricBirthHistory_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES public."Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "PediatricBirthHistory_patient_fkey" FOREIGN KEY ("clinicId", "patientId") REFERENCES public."Patient"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "PediatricBirthHistory_verifiedBy_fkey" FOREIGN KEY ("clinicId", "verifiedByMembershipId") REFERENCES public."ClinicMembership"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE INDEX IF NOT EXISTS "PediatricBirthHistory_clinicId_patientId_idx" ON public."PediatricBirthHistory"("clinicId", "patientId");

CREATE TABLE IF NOT EXISTS public."PatientCaregiverRelationship" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "clinicId" UUID NOT NULL,
  "patientId" UUID NOT NULL,
  "caregiverName" VARCHAR(150) NOT NULL,
  "caregiverNationalId" VARCHAR(50),
  "caregiverPhone" VARCHAR(20) NOT NULL,
  "relationshipType" public."CaregiverRelationshipType" NOT NULL,
  "hasLegalCustody" BOOLEAN NOT NULL DEFAULT false,
  "hasMedicalConsentAuthority" BOOLEAN NOT NULL DEFAULT false,
  "isEmergencyContact" BOOLEAN NOT NULL DEFAULT false,
  "emergencyPriority" INTEGER NOT NULL DEFAULT 1,
  "portalProxyAccess" BOOLEAN NOT NULL DEFAULT false,
  "portalAccountId" UUID,
  "isRevoked" BOOLEAN NOT NULL DEFAULT false,
  "revokedAt" TIMESTAMPTZ(3),
  "revokedByMembershipId" UUID,
  "revocationReason" TEXT,
  "legalDocumentationReference" VARCHAR(255),
  "notes" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "PatientCaregiverRelationship_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PatientCaregiverRelationship_clinicId_id_key" UNIQUE ("clinicId", "id"),
  CONSTRAINT "PatientCaregiverRelationship_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES public."Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "PatientCaregiverRelationship_patient_fkey" FOREIGN KEY ("clinicId", "patientId") REFERENCES public."Patient"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "PatientCaregiverRelationship_revokedBy_fkey" FOREIGN KEY ("clinicId", "revokedByMembershipId") REFERENCES public."ClinicMembership"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE INDEX IF NOT EXISTS "PatientCaregiverRelationship_clinicId_patientId_idx" ON public."PatientCaregiverRelationship"("clinicId", "patientId");
CREATE INDEX IF NOT EXISTS "PatientCaregiverRelationship_clinicId_caregiverPhone_idx" ON public."PatientCaregiverRelationship"("clinicId", "caregiverPhone");

CREATE TABLE IF NOT EXISTS public."PediatricGrowthRecord" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "clinicId" UUID NOT NULL,
  "patientId" UUID NOT NULL,
  "encounterId" UUID,
  "recordedByMembershipId" UUID NOT NULL,
  "measuredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "chronologicalAgeDays" INTEGER NOT NULL,
  "correctedAgeDays" INTEGER,
  "gestationalAgeAtBirthWeeks" INTEGER,
  "weightKg" DECIMAL(5, 3),
  "statureCm" DECIMAL(5, 2),
  "statureMethod" public."StatureMeasurementMethod" NOT NULL DEFAULT 'RECUMBENT_LENGTH',
  "headCircumferenceCm" DECIMAL(5, 2),
  "bmi" DECIMAL(5, 2),
  "weightForAgeZScore" DECIMAL(4, 2),
  "weightForAgePercentile" DECIMAL(5, 2),
  "lengthForAgeZScore" DECIMAL(4, 2),
  "lengthForAgePercentile" DECIMAL(5, 2),
  "headCircumferenceZScore" DECIMAL(4, 2),
  "headCircumferencePercentile" DECIMAL(5, 2),
  "bmiForAgeZScore" DECIMAL(4, 2),
  "bmiForAgePercentile" DECIMAL(5, 2),
  "growthReferenceStandard" VARCHAR(50) NOT NULL DEFAULT 'WHO_2006',
  "measurementSource" public."MeasurementSource" NOT NULL DEFAULT 'CLINICAL_ENCOUNTER',
  "status" public."GrowthRecordStatus" NOT NULL DEFAULT 'FINAL',
  "errorReason" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "PediatricGrowthRecord_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PediatricGrowthRecord_clinicId_id_key" UNIQUE ("clinicId", "id"),
  CONSTRAINT "PediatricGrowthRecord_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES public."Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "PediatricGrowthRecord_patient_fkey" FOREIGN KEY ("clinicId", "patientId") REFERENCES public."Patient"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "PediatricGrowthRecord_encounter_fkey" FOREIGN KEY ("clinicId", "encounterId") REFERENCES public."ClinicalEncounter"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "PediatricGrowthRecord_recordedBy_fkey" FOREIGN KEY ("clinicId", "recordedByMembershipId") REFERENCES public."ClinicMembership"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE INDEX IF NOT EXISTS "PediatricGrowthRecord_clinicId_patientId_measuredAt_idx" ON public."PediatricGrowthRecord"("clinicId", "patientId", "measuredAt");
CREATE INDEX IF NOT EXISTS "PediatricGrowthRecord_clinicId_encounterId_idx" ON public."PediatricGrowthRecord"("clinicId", "encounterId");

CREATE TABLE IF NOT EXISTS public."GrowthReference" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "standardName" VARCHAR(50) NOT NULL,
  "metric" VARCHAR(50) NOT NULL,
  "gender" public."PatientGender" NOT NULL,
  "ageMonths" INTEGER NOT NULL,
  "lValue" DECIMAL(8, 4) NOT NULL,
  "mValue" DECIMAL(8, 4) NOT NULL,
  "sValue" DECIMAL(8, 4) NOT NULL,
  "p3Value" DECIMAL(8, 3),
  "p15Value" DECIMAL(8, 3),
  "p50Value" DECIMAL(8, 3),
  "p85Value" DECIMAL(8, 3),
  "p97Value" DECIMAL(8, 3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "GrowthReference_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GrowthReference_standardName_metric_gender_ageMonths_key" UNIQUE ("standardName", "metric", "gender", "ageMonths")
);

CREATE INDEX IF NOT EXISTS "GrowthReference_standardName_metric_gender_idx" ON public."GrowthReference"("standardName", "metric", "gender");

-- 4. Clinic Reassignment Guards
DROP TRIGGER IF EXISTS immutable_clinic ON public."PediatricBirthHistory";
CREATE TRIGGER immutable_clinic BEFORE UPDATE OF "clinicId" ON public."PediatricBirthHistory"
  FOR EACH ROW EXECUTE FUNCTION lamssa_security.reject_clinic_reassignment();

DROP TRIGGER IF EXISTS immutable_clinic ON public."PatientCaregiverRelationship";
CREATE TRIGGER immutable_clinic BEFORE UPDATE OF "clinicId" ON public."PatientCaregiverRelationship"
  FOR EACH ROW EXECUTE FUNCTION lamssa_security.reject_clinic_reassignment();

DROP TRIGGER IF EXISTS immutable_clinic ON public."PediatricGrowthRecord";
CREATE TRIGGER immutable_clinic BEFORE UPDATE OF "clinicId" ON public."PediatricGrowthRecord"
  FOR EACH ROW EXECUTE FUNCTION lamssa_security.reject_clinic_reassignment();

-- 5. Immutability & Status Guards
CREATE OR REPLACE FUNCTION lamssa_security.pediatric_growth_immutability_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF OLD."status" IN ('FINAL', 'ENTERED_IN_ERROR') THEN
    -- Only allow transitioning from FINAL to ENTERED_IN_ERROR
    IF OLD."status" = 'FINAL' AND NEW."status" = 'ENTERED_IN_ERROR' AND NEW."errorReason" IS NOT NULL THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Final pediatric growth records cannot be altered' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION lamssa_security.pediatric_growth_immutability_guard() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_pediatric_growth_immutability ON public."PediatricGrowthRecord";
CREATE TRIGGER trg_pediatric_growth_immutability
  BEFORE UPDATE ON public."PediatricGrowthRecord"
  FOR EACH ROW EXECUTE FUNCTION lamssa_security.pediatric_growth_immutability_guard();

-- 6. Enable & Force Row Level Security with Multi-Tenant Isolation Policies
DO $$ DECLARE t text; owner_name text:=current_user; pred text; BEGIN
  FOREACH t IN ARRAY ARRAY[
    'PediatricBirthHistory',
    'PatientCaregiverRelationship',
    'PediatricGrowthRecord'
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
    EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON public."PediatricBirthHistory", public."PatientCaregiverRelationship", public."PediatricGrowthRecord" TO %I', r);
    EXECUTE format('GRANT SELECT ON public."GrowthReference" TO %I', r);
  END LOOP;
END $$;
