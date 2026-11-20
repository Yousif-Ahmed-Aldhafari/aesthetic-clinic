-- Migration 044: Ophthalmology & ENT Modules (Step 8.5)
-- Introduces OphthalmicRefractionRecord, OphthalmicExaminationRecord, EntExaminationRecord, and AudiometryAssessmentRecord
-- Enforces PostgreSQL FORCE ROW LEVEL SECURITY, same-clinic composite FKs, and clinical safety immutability

-- 1. Additive Clinical Privilege Codes
ALTER TYPE public."ClinicalPrivilegeCode" ADD VALUE IF NOT EXISTS 'REFRACTION_MEASURE';
ALTER TYPE public."ClinicalPrivilegeCode" ADD VALUE IF NOT EXISTS 'OPHTHALMIC_EXAM_DOCUMENT';
ALTER TYPE public."ClinicalPrivilegeCode" ADD VALUE IF NOT EXISTS 'OPHTHALMIC_RECORD_FINALIZE';
ALTER TYPE public."ClinicalPrivilegeCode" ADD VALUE IF NOT EXISTS 'ENT_EXAM_DOCUMENT';
ALTER TYPE public."ClinicalPrivilegeCode" ADD VALUE IF NOT EXISTS 'AUDIOMETRY_RECORD';
ALTER TYPE public."ClinicalPrivilegeCode" ADD VALUE IF NOT EXISTS 'ENT_PROCEDURE_PERFORM';

-- 2. New Specialty Enums
DO $$ BEGIN
  CREATE TYPE public."AnatomicalLaterality" AS ENUM (
    'RIGHT_EYE_OD', 'LEFT_EYE_OS', 'BOTH_EYES_OU',
    'RIGHT_EAR_AD', 'LEFT_EAR_AS', 'BOTH_EARS_AU',
    'BILATERAL'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public."VisualAcuityScale" AS ENUM (
    'SNELLEN_FEET_20_20', 'SNELLEN_METERS_6_6', 'LOGMAR', 'DECIMAL'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public."TonometryMethod" AS ENUM (
    'GOLDMANN_APPLANATION', 'NON_CONTACT_AIR_PUFF', 'TONOPEN', 'ICARE_REBOUND', 'PERKINS_PORTABLE'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public."TonsilFriedmanGrade" AS ENUM (
    'GRADE_0_SURGICALLY_ABSENT', 'GRADE_1_WITHIN_PILLARS', 'GRADE_2_EXTENDING_TO_PILLARS',
    'GRADE_3_BEYOND_PILLARS', 'GRADE_4_KISSING_TONSILS'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public."TympanogramType" AS ENUM (
    'TYPE_A_NORMAL_COMPLIANCE', 'TYPE_AS_STIFF_SYSTEM', 'TYPE_AD_HIGH_COMPLIANCE_FLACCID',
    'TYPE_B_FLAT_EFFUSION', 'TYPE_C_NEGATIVE_PRESSURE'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public."OphthalmicRecordStatus" AS ENUM (
    'DRAFT', 'FINALIZED', 'ENTERED_IN_ERROR'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public."EntRecordStatus" AS ENUM (
    'DRAFT', 'FINALIZED', 'ENTERED_IN_ERROR'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 3. Create Tables
CREATE TABLE IF NOT EXISTS public."OphthalmicRefractionRecord" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "clinicId" UUID NOT NULL,
  "patientId" UUID NOT NULL,
  "encounterId" UUID NOT NULL,
  "acuityScale" public."VisualAcuityScale" NOT NULL DEFAULT 'SNELLEN_METERS_6_6',
  "pupillaryDistanceMm" DECIMAL(4, 1),
  "odSphereDiopters" DECIMAL(5, 2),
  "odCylinderDiopters" DECIMAL(5, 2),
  "odAxisDegrees" INTEGER,
  "odReadingAddDiopters" DECIMAL(4, 2),
  "odUncorrectedVisualAcuity" VARCHAR(32),
  "odCorrectedVisualAcuity" VARCHAR(32),
  "odPinholeVisualAcuity" VARCHAR(32),
  "osSphereDiopters" DECIMAL(5, 2),
  "osCylinderDiopters" DECIMAL(5, 2),
  "osAxisDegrees" INTEGER,
  "osReadingAddDiopters" DECIMAL(4, 2),
  "osUncorrectedVisualAcuity" VARCHAR(32),
  "osCorrectedVisualAcuity" VARCHAR(32),
  "osPinholeVisualAcuity" VARCHAR(32),
  "ouVisualAcuity" VARCHAR(32),
  "notes" TEXT,
  "optometristMembershipId" UUID NOT NULL,
  "status" public."OphthalmicRecordStatus" NOT NULL DEFAULT 'FINALIZED',
  "errorReason" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "pk_OphthalmicRefractionRecord" PRIMARY KEY ("id"),
  CONSTRAINT "uq_OphthalmicRefractionRecord_clinic_id" UNIQUE ("clinicId", "id"),
  CONSTRAINT "fk_OphthalmicRefractionRecord_clinic" FOREIGN KEY ("clinicId")
    REFERENCES public."Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "fk_OphthalmicRefractionRecord_patient" FOREIGN KEY ("clinicId", "patientId")
    REFERENCES public."Patient"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "fk_OphthalmicRefractionRecord_encounter" FOREIGN KEY ("clinicId", "encounterId")
    REFERENCES public."ClinicalEncounter"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "fk_OphthalmicRefractionRecord_optometrist" FOREIGN KEY ("clinicId", "optometristMembershipId")
    REFERENCES public."ClinicMembership"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE INDEX IF NOT EXISTS "ix_OphthalmicRefractionRecord_patient"
  ON public."OphthalmicRefractionRecord" ("clinicId", "patientId");
CREATE INDEX IF NOT EXISTS "ix_OphthalmicRefractionRecord_encounter"
  ON public."OphthalmicRefractionRecord" ("clinicId", "encounterId");

CREATE TABLE IF NOT EXISTS public."OphthalmicExaminationRecord" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "clinicId" UUID NOT NULL,
  "patientId" UUID NOT NULL,
  "encounterId" UUID NOT NULL,
  "tonometryMethod" public."TonometryMethod" NOT NULL DEFAULT 'GOLDMANN_APPLANATION',
  "odIntraocularPressureMmHg" DECIMAL(4, 1),
  "osIntraocularPressureMmHg" DECIMAL(4, 1),
  "tonometryTime" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "odCorneaFindings" VARCHAR(255),
  "osCorneaFindings" VARCHAR(255),
  "odAnteriorChamber" VARCHAR(255),
  "osAnteriorChamber" VARCHAR(255),
  "odLensCondition" VARCHAR(255),
  "osLensCondition" VARCHAR(255),
  "odCupToDiscRatio" DECIMAL(3, 2),
  "osCupToDiscRatio" DECIMAL(3, 2),
  "odMaculaFindings" VARCHAR(255),
  "osMaculaFindings" VARCHAR(255),
  "odRetinalPeriphery" VARCHAR(255),
  "osRetinalPeriphery" VARCHAR(255),
  "clinicalNotes" TEXT,
  "examinerMembershipId" UUID NOT NULL,
  "status" public."OphthalmicRecordStatus" NOT NULL DEFAULT 'FINALIZED',
  "errorReason" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "pk_OphthalmicExaminationRecord" PRIMARY KEY ("id"),
  CONSTRAINT "uq_OphthalmicExaminationRecord_clinic_id" UNIQUE ("clinicId", "id"),
  CONSTRAINT "fk_OphthalmicExaminationRecord_clinic" FOREIGN KEY ("clinicId")
    REFERENCES public."Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "fk_OphthalmicExaminationRecord_patient" FOREIGN KEY ("clinicId", "patientId")
    REFERENCES public."Patient"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "fk_OphthalmicExaminationRecord_encounter" FOREIGN KEY ("clinicId", "encounterId")
    REFERENCES public."ClinicalEncounter"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "fk_OphthalmicExaminationRecord_examiner" FOREIGN KEY ("clinicId", "examinerMembershipId")
    REFERENCES public."ClinicMembership"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE INDEX IF NOT EXISTS "ix_OphthalmicExaminationRecord_patient"
  ON public."OphthalmicExaminationRecord" ("clinicId", "patientId");
CREATE INDEX IF NOT EXISTS "ix_OphthalmicExaminationRecord_encounter"
  ON public."OphthalmicExaminationRecord" ("clinicId", "encounterId");

CREATE TABLE IF NOT EXISTS public."EntExaminationRecord" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "clinicId" UUID NOT NULL,
  "patientId" UUID NOT NULL,
  "encounterId" UUID NOT NULL,
  "rightEarCanal" VARCHAR(255),
  "rightTympanicMembrane" VARCHAR(255),
  "leftEarCanal" VARCHAR(255),
  "leftTympanicMembrane" VARCHAR(255),
  "nasalSeptumDeformity" VARCHAR(128),
  "turbinateHypertrophy" VARCHAR(128),
  "nasalPolypsPresent" BOOLEAN NOT NULL DEFAULT false,
  "nasalDischargeDescription" VARCHAR(255),
  "tonsilSizeGrade" public."TonsilFriedmanGrade" NOT NULL DEFAULT 'GRADE_1_WITHIN_PILLARS',
  "posteriorPharyngealWall" VARCHAR(255),
  "uvulaPalateSymmetry" VARCHAR(128),
  "vocalCordMobility" VARCHAR(255),
  "clinicalNotes" TEXT,
  "examinerMembershipId" UUID NOT NULL,
  "status" public."EntRecordStatus" NOT NULL DEFAULT 'FINALIZED',
  "errorReason" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "pk_EntExaminationRecord" PRIMARY KEY ("id"),
  CONSTRAINT "uq_EntExaminationRecord_clinic_id" UNIQUE ("clinicId", "id"),
  CONSTRAINT "fk_EntExaminationRecord_clinic" FOREIGN KEY ("clinicId")
    REFERENCES public."Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "fk_EntExaminationRecord_patient" FOREIGN KEY ("clinicId", "patientId")
    REFERENCES public."Patient"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "fk_EntExaminationRecord_encounter" FOREIGN KEY ("clinicId", "encounterId")
    REFERENCES public."ClinicalEncounter"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "fk_EntExaminationRecord_examiner" FOREIGN KEY ("clinicId", "examinerMembershipId")
    REFERENCES public."ClinicMembership"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE INDEX IF NOT EXISTS "ix_EntExaminationRecord_patient"
  ON public."EntExaminationRecord" ("clinicId", "patientId");
CREATE INDEX IF NOT EXISTS "ix_EntExaminationRecord_encounter"
  ON public."EntExaminationRecord" ("clinicId", "encounterId");

CREATE TABLE IF NOT EXISTS public."AudiometryAssessmentRecord" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "clinicId" UUID NOT NULL,
  "patientId" UUID NOT NULL,
  "encounterId" UUID NOT NULL,
  "orderId" UUID,
  "rightAirThresholdsDb" INTEGER[] NOT NULL DEFAULT '{}',
  "leftAirThresholdsDb" INTEGER[] NOT NULL DEFAULT '{}',
  "rightBoneThresholdsDb" INTEGER[] NOT NULL DEFAULT '{}',
  "leftBoneThresholdsDb" INTEGER[] NOT NULL DEFAULT '{}',
  "rightTympanogramType" public."TympanogramType" NOT NULL DEFAULT 'TYPE_A_NORMAL_COMPLIANCE',
  "leftTympanogramType" public."TympanogramType" NOT NULL DEFAULT 'TYPE_A_NORMAL_COMPLIANCE',
  "speechReceptionThresholdDbR" INTEGER,
  "speechReceptionThresholdDbL" INTEGER,
  "speechDiscriminationScoreR" DECIMAL(5, 2),
  "speechDiscriminationScoreL" DECIMAL(5, 2),
  "clinicalImpression" TEXT,
  "audiologistMembershipId" UUID NOT NULL,
  "status" public."EntRecordStatus" NOT NULL DEFAULT 'FINALIZED',
  "errorReason" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "pk_AudiometryAssessmentRecord" PRIMARY KEY ("id"),
  CONSTRAINT "uq_AudiometryAssessmentRecord_clinic_id" UNIQUE ("clinicId", "id"),
  CONSTRAINT "fk_AudiometryAssessmentRecord_clinic" FOREIGN KEY ("clinicId")
    REFERENCES public."Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "fk_AudiometryAssessmentRecord_patient" FOREIGN KEY ("clinicId", "patientId")
    REFERENCES public."Patient"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "fk_AudiometryAssessmentRecord_encounter" FOREIGN KEY ("clinicId", "encounterId")
    REFERENCES public."ClinicalEncounter"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "fk_AudiometryAssessmentRecord_audiologist" FOREIGN KEY ("clinicId", "audiologistMembershipId")
    REFERENCES public."ClinicMembership"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE INDEX IF NOT EXISTS "ix_AudiometryAssessmentRecord_patient"
  ON public."AudiometryAssessmentRecord" ("clinicId", "patientId");
CREATE INDEX IF NOT EXISTS "ix_AudiometryAssessmentRecord_encounter"
  ON public."AudiometryAssessmentRecord" ("clinicId", "encounterId");

-- 4. Reject Tenant Reassignment Triggers
DROP TRIGGER IF EXISTS trg_ophthalmic_refraction_reject_clinic_reassignment ON public."OphthalmicRefractionRecord";
CREATE TRIGGER trg_ophthalmic_refraction_reject_clinic_reassignment
  BEFORE UPDATE OF "clinicId" ON public."OphthalmicRefractionRecord"
  FOR EACH ROW EXECUTE FUNCTION lamssa_security.reject_clinic_reassignment();

DROP TRIGGER IF EXISTS trg_ophthalmic_exam_reject_clinic_reassignment ON public."OphthalmicExaminationRecord";
CREATE TRIGGER trg_ophthalmic_exam_reject_clinic_reassignment
  BEFORE UPDATE OF "clinicId" ON public."OphthalmicExaminationRecord"
  FOR EACH ROW EXECUTE FUNCTION lamssa_security.reject_clinic_reassignment();

DROP TRIGGER IF EXISTS trg_ent_exam_reject_clinic_reassignment ON public."EntExaminationRecord";
CREATE TRIGGER trg_ent_exam_reject_clinic_reassignment
  BEFORE UPDATE OF "clinicId" ON public."EntExaminationRecord"
  FOR EACH ROW EXECUTE FUNCTION lamssa_security.reject_clinic_reassignment();

DROP TRIGGER IF EXISTS trg_audiometry_reject_clinic_reassignment ON public."AudiometryAssessmentRecord";
CREATE TRIGGER trg_audiometry_reject_clinic_reassignment
  BEFORE UPDATE OF "clinicId" ON public."AudiometryAssessmentRecord"
  FOR EACH ROW EXECUTE FUNCTION lamssa_security.reject_clinic_reassignment();

-- 5. Immutability & Status Guards for Finalized Records
CREATE OR REPLACE FUNCTION lamssa_security.ophthalmology_ent_record_immutability_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF OLD."status" IN ('FINALIZED', 'ENTERED_IN_ERROR') THEN
    -- Only allow transitioning from FINALIZED to ENTERED_IN_ERROR with an errorReason
    IF OLD."status" = 'FINALIZED' AND NEW."status" = 'ENTERED_IN_ERROR' AND NEW."errorReason" IS NOT NULL THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Finalized specialty records cannot be altered' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION lamssa_security.ophthalmology_ent_record_immutability_guard() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_ophthalmic_refraction_immutability ON public."OphthalmicRefractionRecord";
CREATE TRIGGER trg_ophthalmic_refraction_immutability
  BEFORE UPDATE ON public."OphthalmicRefractionRecord"
  FOR EACH ROW EXECUTE FUNCTION lamssa_security.ophthalmology_ent_record_immutability_guard();

DROP TRIGGER IF EXISTS trg_ophthalmic_exam_immutability ON public."OphthalmicExaminationRecord";
CREATE TRIGGER trg_ophthalmic_exam_immutability
  BEFORE UPDATE ON public."OphthalmicExaminationRecord"
  FOR EACH ROW EXECUTE FUNCTION lamssa_security.ophthalmology_ent_record_immutability_guard();

DROP TRIGGER IF EXISTS trg_ent_exam_immutability ON public."EntExaminationRecord";
CREATE TRIGGER trg_ent_exam_immutability
  BEFORE UPDATE ON public."EntExaminationRecord"
  FOR EACH ROW EXECUTE FUNCTION lamssa_security.ophthalmology_ent_record_immutability_guard();

DROP TRIGGER IF EXISTS trg_audiometry_immutability ON public."AudiometryAssessmentRecord";
CREATE TRIGGER trg_audiometry_immutability
  BEFORE UPDATE ON public."AudiometryAssessmentRecord"
  FOR EACH ROW EXECUTE FUNCTION lamssa_security.ophthalmology_ent_record_immutability_guard();

-- 6. Enable & Force Row Level Security with Multi-Tenant Isolation Policies
DO $$ DECLARE t text; owner_name text:=current_user; pred text; BEGIN
  FOREACH t IN ARRAY ARRAY[
    'OphthalmicRefractionRecord',
    'OphthalmicExaminationRecord',
    'EntExaminationRecord',
    'AudiometryAssessmentRecord'
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
    EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON public."OphthalmicRefractionRecord", public."OphthalmicExaminationRecord", public."EntExaminationRecord", public."AudiometryAssessmentRecord" TO %I', r);
  END LOOP;
END $$;
