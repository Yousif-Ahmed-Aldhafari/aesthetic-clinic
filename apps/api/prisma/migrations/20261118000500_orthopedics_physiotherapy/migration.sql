-- Migration 045: Orthopedics & Physiotherapy Modules (Step 8.6)
-- Introduces MusculoskeletalExamination, JointRangeOfMotionRecord,
-- PhysiotherapyRehabilitationEpisode, and PhysiotherapySessionRecord.
-- Enforces PostgreSQL FORCE ROW LEVEL SECURITY, same-clinic composite FKs, and clinical safety immutability.

-- 1. Additive Clinical Privilege Codes
ALTER TYPE public."ClinicalPrivilegeCode" ADD VALUE IF NOT EXISTS 'ORTHOPEDIC_EXAM_PERFORM';
ALTER TYPE public."ClinicalPrivilegeCode" ADD VALUE IF NOT EXISTS 'ORTHOPEDIC_RECORD_FINALIZE';
ALTER TYPE public."ClinicalPrivilegeCode" ADD VALUE IF NOT EXISTS 'JOINT_ROM_MEASURE';
ALTER TYPE public."ClinicalPrivilegeCode" ADD VALUE IF NOT EXISTS 'PHYSIOTHERAPY_PLAN_CREATE';
ALTER TYPE public."ClinicalPrivilegeCode" ADD VALUE IF NOT EXISTS 'PHYSIOTHERAPY_PLAN_APPROVE';
ALTER TYPE public."ClinicalPrivilegeCode" ADD VALUE IF NOT EXISTS 'PHYSIOTHERAPY_PLAN_EXECUTE';
ALTER TYPE public."ClinicalPrivilegeCode" ADD VALUE IF NOT EXISTS 'PHYSIOTHERAPY_SESSION_DOCUMENT';

-- 2. New Specialty Enums
DO $$ BEGIN
  CREATE TYPE public."AnatomicalRegion" AS ENUM (
    'CERVICAL_SPINE', 'THORACIC_SPINE', 'LUMBAR_SPINE', 'SACROILIAC_PELVIS',
    'SHOULDER', 'ELBOW', 'WRIST_HAND', 'HIP', 'KNEE', 'ANKLE_FOOT'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public."JointLaterality" AS ENUM (
    'LEFT', 'RIGHT', 'BILATERAL', 'AXIAL'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public."JointMovement" AS ENUM (
    'FLEXION', 'EXTENSION', 'ABDUCTION', 'ADDUCTION',
    'INTERNAL_ROTATION', 'EXTERNAL_ROTATION', 'PRONATION', 'SUPINATION',
    'INVERSION', 'EVERSION', 'DORSIFLEXION', 'PLANTARFLEXION',
    'LATERAL_FLEXION', 'ELEVATION', 'DEPRESSION'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public."RangeOfMotionType" AS ENUM (
    'ACTIVE', 'PASSIVE', 'ACTIVE_ASSISTED'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public."RehabilitationEpisodeStatus" AS ENUM (
    'ACTIVE', 'COMPLETED', 'SUSPENDED', 'DISCHARGED', 'CANCELLED'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public."PhysiotherapyRecordStatus" AS ENUM (
    'DRAFT', 'FINALIZED', 'ENTERED_IN_ERROR'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 3. Create Tables
CREATE TABLE IF NOT EXISTS public."MusculoskeletalExamination" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "clinicId" UUID NOT NULL,
  "patientId" UUID NOT NULL,
  "encounterId" UUID NOT NULL,
  "examinationDate" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "anatomicalRegion" public."AnatomicalRegion" NOT NULL,
  "joint" VARCHAR(100) NOT NULL,
  "laterality" public."JointLaterality" NOT NULL,
  "reasonForExam" VARCHAR(255) NOT NULL,
  "historyOfInjury" TEXT,
  "tendernessLocations" TEXT[] NOT NULL DEFAULT '{}',
  "swellingGrade" VARCHAR(32) NOT NULL DEFAULT 'NONE',
  "deformityNotes" TEXT,
  "neurovascularIntact" BOOLEAN NOT NULL DEFAULT true,
  "motorStrengthMrcScale" INTEGER,
  "sensationFindings" VARCHAR(255),
  "specialManeuvers" JSONB,
  "clinicalAssessment" TEXT,
  "examinerMembershipId" UUID NOT NULL,
  "status" public."PhysiotherapyRecordStatus" NOT NULL DEFAULT 'FINALIZED',
  "errorReason" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "pk_MusculoskeletalExamination" PRIMARY KEY ("id"),
  CONSTRAINT "uq_MusculoskeletalExamination_clinic_id" UNIQUE ("clinicId", "id"),
  CONSTRAINT "ck_MusculoskeletalExamination_mrc" CHECK (
    "motorStrengthMrcScale" IS NULL OR ("motorStrengthMrcScale" >= 0 AND "motorStrengthMrcScale" <= 5)
  ),
  CONSTRAINT "fk_MusculoskeletalExamination_clinic" FOREIGN KEY ("clinicId")
    REFERENCES public."Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "fk_MusculoskeletalExamination_patient" FOREIGN KEY ("clinicId", "patientId")
    REFERENCES public."Patient"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "fk_MusculoskeletalExamination_encounter" FOREIGN KEY ("clinicId", "encounterId")
    REFERENCES public."ClinicalEncounter"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "fk_MusculoskeletalExamination_examiner" FOREIGN KEY ("clinicId", "examinerMembershipId")
    REFERENCES public."ClinicMembership"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE INDEX IF NOT EXISTS "ix_MusculoskeletalExamination_patient"
  ON public."MusculoskeletalExamination" ("clinicId", "patientId");
CREATE INDEX IF NOT EXISTS "ix_MusculoskeletalExamination_encounter"
  ON public."MusculoskeletalExamination" ("clinicId", "encounterId");

CREATE TABLE IF NOT EXISTS public."JointRangeOfMotionRecord" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "clinicId" UUID NOT NULL,
  "patientId" UUID NOT NULL,
  "encounterId" UUID NOT NULL,
  "examId" UUID,
  "anatomicalJoint" VARCHAR(100) NOT NULL,
  "movement" public."JointMovement" NOT NULL,
  "laterality" public."JointLaterality" NOT NULL,
  "motionType" public."RangeOfMotionType" NOT NULL DEFAULT 'ACTIVE',
  "startingDegrees" DECIMAL(5, 1) NOT NULL DEFAULT 0.0,
  "endingDegrees" DECIMAL(5, 1) NOT NULL,
  "measurementMethod" VARCHAR(64) NOT NULL DEFAULT 'UNIVERSAL_GONIOMETER',
  "goniometerDevice" VARCHAR(100),
  "painOnsetDegrees" DECIMAL(5, 1),
  "painScaleVas" INTEGER,
  "contralateralDegrees" DECIMAL(5, 1),
  "notes" TEXT,
  "examinerMembershipId" UUID NOT NULL,
  "status" public."PhysiotherapyRecordStatus" NOT NULL DEFAULT 'FINALIZED',
  "errorReason" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "pk_JointRangeOfMotionRecord" PRIMARY KEY ("id"),
  CONSTRAINT "uq_JointRangeOfMotionRecord_clinic_id" UNIQUE ("clinicId", "id"),
  CONSTRAINT "ck_JointRangeOfMotionRecord_vas" CHECK (
    "painScaleVas" IS NULL OR ("painScaleVas" >= 0 AND "painScaleVas" <= 10)
  ),
  CONSTRAINT "fk_JointRangeOfMotionRecord_clinic" FOREIGN KEY ("clinicId")
    REFERENCES public."Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "fk_JointRangeOfMotionRecord_patient" FOREIGN KEY ("clinicId", "patientId")
    REFERENCES public."Patient"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "fk_JointRangeOfMotionRecord_encounter" FOREIGN KEY ("clinicId", "encounterId")
    REFERENCES public."ClinicalEncounter"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "fk_JointRangeOfMotionRecord_exam" FOREIGN KEY ("clinicId", "examId")
    REFERENCES public."MusculoskeletalExamination"("clinicId", "id") ON DELETE SET NULL ON UPDATE RESTRICT,
  CONSTRAINT "fk_JointRangeOfMotionRecord_examiner" FOREIGN KEY ("clinicId", "examinerMembershipId")
    REFERENCES public."ClinicMembership"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE INDEX IF NOT EXISTS "ix_JointRangeOfMotionRecord_patient"
  ON public."JointRangeOfMotionRecord" ("clinicId", "patientId");
CREATE INDEX IF NOT EXISTS "ix_JointRangeOfMotionRecord_encounter"
  ON public."JointRangeOfMotionRecord" ("clinicId", "encounterId");
CREATE INDEX IF NOT EXISTS "ix_JointRangeOfMotionRecord_exam"
  ON public."JointRangeOfMotionRecord" ("clinicId", "examId");

CREATE TABLE IF NOT EXISTS public."PhysiotherapyRehabilitationEpisode" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "clinicId" UUID NOT NULL,
  "patientId" UUID NOT NULL,
  "encounterId" UUID,
  "referringClinicianMembershipId" UUID,
  "rehabilitationGoal" TEXT NOT NULL,
  "functionalBaseline" TEXT NOT NULL,
  "startDate" DATE NOT NULL,
  "targetEndDate" DATE,
  "actualEndDate" DATE,
  "planVersion" INTEGER NOT NULL DEFAULT 1,
  "visitFrequencyPerWeek" INTEGER NOT NULL DEFAULT 2,
  "plannedInterventions" TEXT[] NOT NULL DEFAULT '{}',
  "status" public."RehabilitationEpisodeStatus" NOT NULL DEFAULT 'ACTIVE',
  "dischargeSummary" TEXT,
  "therapistMembershipId" UUID NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "pk_PhysiotherapyRehabilitationEpisode" PRIMARY KEY ("id"),
  CONSTRAINT "uq_PhysiotherapyRehabilitationEpisode_clinic_id" UNIQUE ("clinicId", "id"),
  CONSTRAINT "fk_PhysiotherapyRehabilitationEpisode_clinic" FOREIGN KEY ("clinicId")
    REFERENCES public."Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "fk_PhysiotherapyRehabilitationEpisode_patient" FOREIGN KEY ("clinicId", "patientId")
    REFERENCES public."Patient"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "fk_PhysiotherapyRehabilitationEpisode_encounter" FOREIGN KEY ("clinicId", "encounterId")
    REFERENCES public."ClinicalEncounter"("clinicId", "id") ON DELETE SET NULL ON UPDATE RESTRICT,
  CONSTRAINT "fk_PhysiotherapyRehabilitationEpisode_referring" FOREIGN KEY ("clinicId", "referringClinicianMembershipId")
    REFERENCES public."ClinicMembership"("clinicId", "id") ON DELETE SET NULL ON UPDATE RESTRICT,
  CONSTRAINT "fk_PhysiotherapyRehabilitationEpisode_therapist" FOREIGN KEY ("clinicId", "therapistMembershipId")
    REFERENCES public."ClinicMembership"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE INDEX IF NOT EXISTS "ix_PhysiotherapyRehabilitationEpisode_patient"
  ON public."PhysiotherapyRehabilitationEpisode" ("clinicId", "patientId");
CREATE INDEX IF NOT EXISTS "ix_PhysiotherapyRehabilitationEpisode_status"
  ON public."PhysiotherapyRehabilitationEpisode" ("clinicId", "status");

CREATE TABLE IF NOT EXISTS public."PhysiotherapySessionRecord" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "clinicId" UUID NOT NULL,
  "patientId" UUID NOT NULL,
  "episodeId" UUID,
  "encounterId" UUID NOT NULL,
  "sessionDate" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "therapistMembershipId" UUID NOT NULL,
  "treatmentModalities" TEXT[] NOT NULL DEFAULT '{}',
  "exerciseDetails" JSONB,
  "sessionDurationMinutes" INTEGER NOT NULL,
  "patientReportedTolerance" VARCHAR(64) NOT NULL DEFAULT 'WELL_TOLERATED',
  "preSessionPainVas" INTEGER NOT NULL DEFAULT 0,
  "postSessionPainVas" INTEGER NOT NULL DEFAULT 0,
  "functionalProgressNotes" TEXT NOT NULL,
  "adverseEvents" TEXT,
  "status" public."PhysiotherapyRecordStatus" NOT NULL DEFAULT 'FINALIZED',
  "errorReason" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "pk_PhysiotherapySessionRecord" PRIMARY KEY ("id"),
  CONSTRAINT "uq_PhysiotherapySessionRecord_clinic_id" UNIQUE ("clinicId", "id"),
  CONSTRAINT "ck_PhysiotherapySessionRecord_pre_vas" CHECK (
    "preSessionPainVas" >= 0 AND "preSessionPainVas" <= 10
  ),
  CONSTRAINT "ck_PhysiotherapySessionRecord_post_vas" CHECK (
    "postSessionPainVas" >= 0 AND "postSessionPainVas" <= 10
  ),
  CONSTRAINT "ck_PhysiotherapySessionRecord_duration" CHECK (
    "sessionDurationMinutes" > 0 AND "sessionDurationMinutes" <= 480
  ),
  CONSTRAINT "fk_PhysiotherapySessionRecord_clinic" FOREIGN KEY ("clinicId")
    REFERENCES public."Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "fk_PhysiotherapySessionRecord_patient" FOREIGN KEY ("clinicId", "patientId")
    REFERENCES public."Patient"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "fk_PhysiotherapySessionRecord_episode" FOREIGN KEY ("clinicId", "episodeId")
    REFERENCES public."PhysiotherapyRehabilitationEpisode"("clinicId", "id") ON DELETE SET NULL ON UPDATE RESTRICT,
  CONSTRAINT "fk_PhysiotherapySessionRecord_encounter" FOREIGN KEY ("clinicId", "encounterId")
    REFERENCES public."ClinicalEncounter"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "fk_PhysiotherapySessionRecord_therapist" FOREIGN KEY ("clinicId", "therapistMembershipId")
    REFERENCES public."ClinicMembership"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE INDEX IF NOT EXISTS "ix_PhysiotherapySessionRecord_patient"
  ON public."PhysiotherapySessionRecord" ("clinicId", "patientId");
CREATE INDEX IF NOT EXISTS "ix_PhysiotherapySessionRecord_encounter"
  ON public."PhysiotherapySessionRecord" ("clinicId", "encounterId");
CREATE INDEX IF NOT EXISTS "ix_PhysiotherapySessionRecord_episode"
  ON public."PhysiotherapySessionRecord" ("clinicId", "episodeId");

-- 4. Anti-Tampering Clinic Reassignment Triggers
DROP TRIGGER IF EXISTS trg_msk_exam_reject_clinic_reassignment ON public."MusculoskeletalExamination";
CREATE TRIGGER trg_msk_exam_reject_clinic_reassignment
  BEFORE UPDATE OF "clinicId" ON public."MusculoskeletalExamination"
  FOR EACH ROW EXECUTE FUNCTION lamssa_security.reject_clinic_reassignment();

DROP TRIGGER IF EXISTS trg_joint_rom_reject_clinic_reassignment ON public."JointRangeOfMotionRecord";
CREATE TRIGGER trg_joint_rom_reject_clinic_reassignment
  BEFORE UPDATE OF "clinicId" ON public."JointRangeOfMotionRecord"
  FOR EACH ROW EXECUTE FUNCTION lamssa_security.reject_clinic_reassignment();

DROP TRIGGER IF EXISTS trg_pt_episode_reject_clinic_reassignment ON public."PhysiotherapyRehabilitationEpisode";
CREATE TRIGGER trg_pt_episode_reject_clinic_reassignment
  BEFORE UPDATE OF "clinicId" ON public."PhysiotherapyRehabilitationEpisode"
  FOR EACH ROW EXECUTE FUNCTION lamssa_security.reject_clinic_reassignment();

DROP TRIGGER IF EXISTS trg_pt_session_reject_clinic_reassignment ON public."PhysiotherapySessionRecord";
CREATE TRIGGER trg_pt_session_reject_clinic_reassignment
  BEFORE UPDATE OF "clinicId" ON public."PhysiotherapySessionRecord"
  FOR EACH ROW EXECUTE FUNCTION lamssa_security.reject_clinic_reassignment();

-- 5. Immutability & Status Guards for Finalized Clinical Records
CREATE OR REPLACE FUNCTION lamssa_security.orthopedics_physiotherapy_record_immutability_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF OLD."status" IN ('FINALIZED', 'ENTERED_IN_ERROR') THEN
    -- Only allow transitioning from FINALIZED to ENTERED_IN_ERROR with an errorReason
    IF OLD."status" = 'FINALIZED' AND NEW."status" = 'ENTERED_IN_ERROR' AND NEW."errorReason" IS NOT NULL THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Finalized orthopedics and physiotherapy records cannot be altered' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION lamssa_security.orthopedics_physiotherapy_record_immutability_guard() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_msk_exam_immutability ON public."MusculoskeletalExamination";
CREATE TRIGGER trg_msk_exam_immutability
  BEFORE UPDATE ON public."MusculoskeletalExamination"
  FOR EACH ROW EXECUTE FUNCTION lamssa_security.orthopedics_physiotherapy_record_immutability_guard();

DROP TRIGGER IF EXISTS trg_joint_rom_immutability ON public."JointRangeOfMotionRecord";
CREATE TRIGGER trg_joint_rom_immutability
  BEFORE UPDATE ON public."JointRangeOfMotionRecord"
  FOR EACH ROW EXECUTE FUNCTION lamssa_security.orthopedics_physiotherapy_record_immutability_guard();

DROP TRIGGER IF EXISTS trg_pt_session_immutability ON public."PhysiotherapySessionRecord";
CREATE TRIGGER trg_pt_session_immutability
  BEFORE UPDATE ON public."PhysiotherapySessionRecord"
  FOR EACH ROW EXECUTE FUNCTION lamssa_security.orthopedics_physiotherapy_record_immutability_guard();

-- 6. Enable & Force Row Level Security with Multi-Tenant Isolation Policies
DO $$ DECLARE t text; owner_name text:=current_user; pred text; BEGIN
  FOREACH t IN ARRAY ARRAY[
    'MusculoskeletalExamination',
    'JointRangeOfMotionRecord',
    'PhysiotherapyRehabilitationEpisode',
    'PhysiotherapySessionRecord'
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
    EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON public."MusculoskeletalExamination", public."JointRangeOfMotionRecord", public."PhysiotherapyRehabilitationEpisode", public."PhysiotherapySessionRecord" TO %I', r);
  END LOOP;
END $$;
