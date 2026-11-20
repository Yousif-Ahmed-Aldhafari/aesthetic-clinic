-- Migration 041: Dentistry & Oral Health Module (Step 8.2)
-- Introduces DentalOdontogram, DentalToothFinding, DentalPeriodontalRecord, and DentalTreatmentStage
-- Enforces PostgreSQL FORCE ROW LEVEL SECURITY, same-clinic composite FKs, and finalized chart immutability

-- 1. Additive Clinical Privilege Codes
ALTER TYPE public."ClinicalPrivilegeCode" ADD VALUE IF NOT EXISTS 'DENTAL_EXAMINATION_RECORD';
ALTER TYPE public."ClinicalPrivilegeCode" ADD VALUE IF NOT EXISTS 'DENTAL_PROCEDURE_PLAN';
ALTER TYPE public."ClinicalPrivilegeCode" ADD VALUE IF NOT EXISTS 'DENTAL_PROCEDURE_APPROVE';
ALTER TYPE public."ClinicalPrivilegeCode" ADD VALUE IF NOT EXISTS 'DENTAL_PROCEDURE_PERFORM';

-- 2. New Specialty Enums
DO $$ BEGIN
  CREATE TYPE public."DentitionType" AS ENUM ('PERMANENT', 'PRIMARY', 'MIXED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public."ToothNumberingSystem" AS ENUM ('FDI_ISO_3950', 'UNIVERSAL_SYSTEM', 'PALMER_NOTATION');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public."OdontogramStatus" AS ENUM ('DRAFT', 'FINALIZED', 'SUPERSEDED', 'ENTERED_IN_ERROR');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public."ToothCondition" AS ENUM (
    'SOUND', 'CARIES', 'RESTORATION', 'CROWN', 'ROOT_CANAL',
    'IMPLANT', 'FRACTURE', 'IMPACTION', 'MISSING_TOOTH',
    'EXTRACTION_HISTORY', 'UNERUPTED', 'SUPERNUMERARY', 'OTHER'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public."PeriodontalFurcationGrade" AS ENUM ('CLASS_0', 'CLASS_I', 'CLASS_II', 'CLASS_III', 'CLASS_IV');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public."ToothMobilityGrade" AS ENUM ('GRADE_0', 'GRADE_1', 'GRADE_2', 'GRADE_3');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public."DentalTreatmentStageStatus" AS ENUM (
    'DRAFT', 'PROPOSED', 'APPROVED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'SUPERSEDED'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 3. Create Tables
CREATE TABLE IF NOT EXISTS public."DentalOdontogram" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "clinicId" UUID NOT NULL,
  "patientId" UUID NOT NULL,
  "encounterId" UUID NOT NULL,
  "dentistMembershipId" UUID NOT NULL,
  "dentitionType" public."DentitionType" NOT NULL DEFAULT 'PERMANENT',
  "numberingSystem" public."ToothNumberingSystem" NOT NULL DEFAULT 'FDI_ISO_3950',
  "status" public."OdontogramStatus" NOT NULL DEFAULT 'DRAFT',
  "chartType" VARCHAR(32) NOT NULL DEFAULT 'BASELINE',
  "generalOralCondition" TEXT,
  "softTissueExamination" TEXT,
  "occlusionClassification" VARCHAR(64),
  "temporomandibularJoint" VARCHAR(255),
  "notes" TEXT,
  "contentDigest" VARCHAR(64),
  "finalizedAt" TIMESTAMPTZ(3),
  "finalizedByMembershipId" UUID,
  "supersededById" UUID,
  "amendmentReason" TEXT,
  "enteredInErrorReason" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "DentalOdontogram_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DentalOdontogram_clinicId_id_key" UNIQUE ("clinicId", "id"),
  CONSTRAINT "DentalOdontogram_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES public."Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "DentalOdontogram_patient_fkey" FOREIGN KEY ("clinicId", "patientId") REFERENCES public."Patient"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "DentalOdontogram_encounter_fkey" FOREIGN KEY ("clinicId", "encounterId") REFERENCES public."ClinicalEncounter"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "DentalOdontogram_dentist_fkey" FOREIGN KEY ("clinicId", "dentistMembershipId") REFERENCES public."ClinicMembership"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "DentalOdontogram_finalizedBy_fkey" FOREIGN KEY ("clinicId", "finalizedByMembershipId") REFERENCES public."ClinicMembership"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "DentalOdontogram_supersededBy_fkey" FOREIGN KEY ("clinicId", "supersededById") REFERENCES public."DentalOdontogram"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE INDEX IF NOT EXISTS "DentalOdontogram_clinicId_patientId_status_idx" ON public."DentalOdontogram"("clinicId", "patientId", "status");
CREATE INDEX IF NOT EXISTS "DentalOdontogram_clinicId_encounterId_idx" ON public."DentalOdontogram"("clinicId", "encounterId");
CREATE INDEX IF NOT EXISTS "DentalOdontogram_clinicId_dentistMembershipId_idx" ON public."DentalOdontogram"("clinicId", "dentistMembershipId");

CREATE TABLE IF NOT EXISTS public."DentalToothFinding" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "clinicId" UUID NOT NULL,
  "odontogramId" UUID NOT NULL,
  "patientId" UUID NOT NULL,
  "toothNumberFdi" INTEGER NOT NULL,
  "isSupernumerary" BOOLEAN NOT NULL DEFAULT false,
  "supernumeraryIdentifier" VARCHAR(32),
  "isDeciduous" BOOLEAN NOT NULL DEFAULT false,
  "condition" public."ToothCondition" NOT NULL DEFAULT 'SOUND',
  "surfacesAffected" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "existingWork" VARCHAR(255),
  "diagnosisCodeIcd10" VARCHAR(32),
  "clinicalDescription" VARCHAR(500),
  "severity" VARCHAR(32),
  "recordedByMembershipId" UUID NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "DentalToothFinding_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DentalToothFinding_clinicId_id_key" UNIQUE ("clinicId", "id"),
  CONSTRAINT "DentalToothFinding_clinic_odont_tooth_super_key" UNIQUE ("clinicId", "odontogramId", "toothNumberFdi", "isSupernumerary", "supernumeraryIdentifier"),
  CONSTRAINT "DentalToothFinding_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES public."Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "DentalToothFinding_odontogram_fkey" FOREIGN KEY ("clinicId", "odontogramId") REFERENCES public."DentalOdontogram"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "DentalToothFinding_patient_fkey" FOREIGN KEY ("clinicId", "patientId") REFERENCES public."Patient"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "DentalToothFinding_recordedBy_fkey" FOREIGN KEY ("clinicId", "recordedByMembershipId") REFERENCES public."ClinicMembership"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE INDEX IF NOT EXISTS "DentalToothFinding_clinicId_patientId_toothNumberFdi_idx" ON public."DentalToothFinding"("clinicId", "patientId", "toothNumberFdi");

CREATE TABLE IF NOT EXISTS public."DentalPeriodontalRecord" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "clinicId" UUID NOT NULL,
  "odontogramId" UUID NOT NULL,
  "patientId" UUID NOT NULL,
  "toothNumberFdi" INTEGER NOT NULL,
  "probingDepthsMm" INTEGER[] NOT NULL,
  "gingivalMarginMm" INTEGER[] NOT NULL,
  "clinicalAttachmentMm" INTEGER[] NOT NULL,
  "bleedingOnProbing" BOOLEAN[] NOT NULL,
  "suppuration" BOOLEAN[] NOT NULL,
  "furcationGrade" public."PeriodontalFurcationGrade" NOT NULL DEFAULT 'CLASS_0',
  "mobilityGrade" public."ToothMobilityGrade" NOT NULL DEFAULT 'GRADE_0',
  "plaquePresent" BOOLEAN NOT NULL DEFAULT false,
  "notes" VARCHAR(500),
  "measuredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "examinerMembershipId" UUID NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "DentalPeriodontalRecord_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DentalPeriodontalRecord_clinicId_id_key" UNIQUE ("clinicId", "id"),
  CONSTRAINT "DentalPeriodontalRecord_clinic_odont_tooth_key" UNIQUE ("clinicId", "odontogramId", "toothNumberFdi"),
  CONSTRAINT "DentalPeriodontalRecord_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES public."Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "DentalPeriodontalRecord_odontogram_fkey" FOREIGN KEY ("clinicId", "odontogramId") REFERENCES public."DentalOdontogram"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "DentalPeriodontalRecord_patient_fkey" FOREIGN KEY ("clinicId", "patientId") REFERENCES public."Patient"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "DentalPeriodontalRecord_examiner_fkey" FOREIGN KEY ("clinicId", "examinerMembershipId") REFERENCES public."ClinicMembership"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE INDEX IF NOT EXISTS "DentalPeriodontalRecord_clinicId_patientId_toothNumberFdi_idx" ON public."DentalPeriodontalRecord"("clinicId", "patientId", "toothNumberFdi");

CREATE TABLE IF NOT EXISTS public."DentalTreatmentStage" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "clinicId" UUID NOT NULL,
  "odontogramId" UUID NOT NULL,
  "patientId" UUID NOT NULL,
  "encounterId" UUID NOT NULL,
  "serviceId" UUID NOT NULL,
  "toothNumberFdi" INTEGER,
  "surfaces" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "stageOrder" INTEGER NOT NULL DEFAULT 1,
  "status" public."DentalTreatmentStageStatus" NOT NULL DEFAULT 'DRAFT',
  "clinicalIndication" VARCHAR(500) NOT NULL,
  "estimatedDurationMinutes" INTEGER NOT NULL DEFAULT 30,
  "estimatedCost" DECIMAL(12, 2) NOT NULL,
  "plannedDentistMembershipId" UUID NOT NULL,
  "approvedAt" TIMESTAMPTZ(3),
  "approvedByMembershipId" UUID,
  "consentTemplateId" UUID,
  "patientConsentId" UUID,
  "completedAt" TIMESTAMPTZ(3),
  "completedByMembershipId" UUID,
  "completionNotes" TEXT,
  "cancellationReason" TEXT,
  "cancelledAt" TIMESTAMPTZ(3),
  "invoiceLineId" UUID,
  "consumptionId" UUID,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "DentalTreatmentStage_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DentalTreatmentStage_clinicId_id_key" UNIQUE ("clinicId", "id"),
  CONSTRAINT "DentalTreatmentStage_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES public."Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "DentalTreatmentStage_odontogram_fkey" FOREIGN KEY ("clinicId", "odontogramId") REFERENCES public."DentalOdontogram"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "DentalTreatmentStage_patient_fkey" FOREIGN KEY ("clinicId", "patientId") REFERENCES public."Patient"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "DentalTreatmentStage_encounter_fkey" FOREIGN KEY ("clinicId", "encounterId") REFERENCES public."ClinicalEncounter"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "DentalTreatmentStage_service_fkey" FOREIGN KEY ("clinicId", "serviceId") REFERENCES public."GeneralClinicalService"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "DentalTreatmentStage_plannedDentist_fkey" FOREIGN KEY ("clinicId", "plannedDentistMembershipId") REFERENCES public."ClinicMembership"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "DentalTreatmentStage_approvedBy_fkey" FOREIGN KEY ("clinicId", "approvedByMembershipId") REFERENCES public."ClinicMembership"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "DentalTreatmentStage_completedBy_fkey" FOREIGN KEY ("clinicId", "completedByMembershipId") REFERENCES public."ClinicMembership"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "DentalTreatmentStage_consentTemplate_fkey" FOREIGN KEY ("clinicId", "consentTemplateId") REFERENCES public."ConsentTemplate"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "DentalTreatmentStage_patientConsent_fkey" FOREIGN KEY ("clinicId", "patientConsentId") REFERENCES public."PatientConsent"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE INDEX IF NOT EXISTS "DentalTreatmentStage_clinicId_patientId_status_idx" ON public."DentalTreatmentStage"("clinicId", "patientId", "status");
CREATE INDEX IF NOT EXISTS "DentalTreatmentStage_clinicId_odontogramId_stageOrder_idx" ON public."DentalTreatmentStage"("clinicId", "odontogramId", "stageOrder");

-- 4. Immutability Triggers on clinicId
DROP TRIGGER IF EXISTS immutable_clinic ON public."DentalOdontogram";
CREATE TRIGGER immutable_clinic BEFORE UPDATE OF "clinicId" ON public."DentalOdontogram"
  FOR EACH ROW EXECUTE FUNCTION lamssa_security.reject_clinic_reassignment();

DROP TRIGGER IF EXISTS immutable_clinic ON public."DentalToothFinding";
CREATE TRIGGER immutable_clinic BEFORE UPDATE OF "clinicId" ON public."DentalToothFinding"
  FOR EACH ROW EXECUTE FUNCTION lamssa_security.reject_clinic_reassignment();

DROP TRIGGER IF EXISTS immutable_clinic ON public."DentalPeriodontalRecord";
CREATE TRIGGER immutable_clinic BEFORE UPDATE OF "clinicId" ON public."DentalPeriodontalRecord"
  FOR EACH ROW EXECUTE FUNCTION lamssa_security.reject_clinic_reassignment();

DROP TRIGGER IF EXISTS immutable_clinic ON public."DentalTreatmentStage";
CREATE TRIGGER immutable_clinic BEFORE UPDATE OF "clinicId" ON public."DentalTreatmentStage"
  FOR EACH ROW EXECUTE FUNCTION lamssa_security.reject_clinic_reassignment();

-- 5. Finalized Dental Chart Immutability Guard Trigger
CREATE OR REPLACE FUNCTION lamssa_security.dental_record_immutability_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  parent_status public."OdontogramStatus";
BEGIN
  SELECT "status" INTO parent_status
  FROM public."DentalOdontogram"
  WHERE "clinicId" = COALESCE(NEW."clinicId", OLD."clinicId")
    AND "id" = COALESCE(NEW."odontogramId", OLD."odontogramId");

  IF parent_status IN ('FINALIZED', 'SUPERSEDED') THEN
    RAISE EXCEPTION 'Cannot modify findings or periodontal records of a finalized dental chart' USING ERRCODE = '42501';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;
REVOKE ALL ON FUNCTION lamssa_security.dental_record_immutability_guard() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_dental_finding_immutability ON public."DentalToothFinding";
CREATE TRIGGER trg_dental_finding_immutability
  BEFORE INSERT OR UPDATE OR DELETE ON public."DentalToothFinding"
  FOR EACH ROW EXECUTE FUNCTION lamssa_security.dental_record_immutability_guard();

DROP TRIGGER IF EXISTS trg_dental_periodontal_immutability ON public."DentalPeriodontalRecord";
CREATE TRIGGER trg_dental_periodontal_immutability
  BEFORE INSERT OR UPDATE OR DELETE ON public."DentalPeriodontalRecord"
  FOR EACH ROW EXECUTE FUNCTION lamssa_security.dental_record_immutability_guard();

CREATE OR REPLACE FUNCTION lamssa_security.dental_odontogram_status_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF OLD."status" IN ('FINALIZED', 'SUPERSEDED') THEN
    -- Only allow transition from FINALIZED to SUPERSEDED or ENTERED_IN_ERROR
    IF OLD."status" = 'FINALIZED' AND NEW."status" IN ('SUPERSEDED', 'ENTERED_IN_ERROR') THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Finalized dental odontogram records are immutable' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION lamssa_security.dental_odontogram_status_guard() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_dental_odontogram_status ON public."DentalOdontogram";
CREATE TRIGGER trg_dental_odontogram_status
  BEFORE UPDATE ON public."DentalOdontogram"
  FOR EACH ROW EXECUTE FUNCTION lamssa_security.dental_odontogram_status_guard();

-- 6. Enable & Force Row Level Security with Multi-Tenant Isolation Policies
DO $$ DECLARE t text; owner_name text:=current_user; pred text; BEGIN
  FOREACH t IN ARRAY ARRAY[
    'DentalOdontogram',
    'DentalToothFinding',
    'DentalPeriodontalRecord',
    'DentalTreatmentStage'
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
    EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON public."DentalOdontogram", public."DentalToothFinding", public."DentalPeriodontalRecord", public."DentalTreatmentStage" TO %I', r);
  END LOOP;
END $$;
