-- Migration 28: Patient Consent & Recovery Self-Service
-- Adds PatientRecoveryCheckIn and PatientReportedOutcome models,
-- installs patient_row_allows helper function for patient-to-patient isolation,
-- enhances RLS policies on patient-facing tables to enforce patient isolation,
-- and grants necessary permissions to runtime role.

BEGIN;

-- 1. Create Enums
DO $$ BEGIN
  CREATE TYPE "CheckInStatus" AS ENUM ('PENDING_REVIEW', 'REVIEWED', 'ESCALATED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 2. Create PatientRecoveryCheckIn Table
CREATE TABLE IF NOT EXISTS public."PatientRecoveryCheckIn" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clinicId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "patientAccountId" UUID NOT NULL,
    "followUpId" UUID,
    "procedureExecutionId" UUID,
    "painScore" INTEGER NOT NULL,
    "symptoms" JSONB NOT NULL,
    "recoveryNotes" VARCHAR(1000),
    "status" "CheckInStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "isEscalated" BOOLEAN NOT NULL DEFAULT false,
    "escalationReason" VARCHAR(500),
    "reviewedAt" TIMESTAMPTZ(3),
    "reviewedByMembershipId" UUID,
    "clinicianNotes" VARCHAR(1000),
    "checkInDate" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PatientRecoveryCheckIn_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PatientRecoveryCheckIn_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES public."Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "PatientRecoveryCheckIn_patient_fkey" FOREIGN KEY ("clinicId", "patientId") REFERENCES public."Patient"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "PatientRecoveryCheckIn_patientAccount_fkey" FOREIGN KEY ("clinicId", "patientAccountId") REFERENCES public."PatientAccount"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "PatientRecoveryCheckIn_followUp_fkey" FOREIGN KEY ("clinicId", "followUpId") REFERENCES public."ClinicalFollowUp"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "PatientRecoveryCheckIn_procedureExecution_fkey" FOREIGN KEY ("clinicId", "procedureExecutionId") REFERENCES public."ProcedureExecution"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "PatientRecoveryCheckIn_reviewedBy_fkey" FOREIGN KEY ("clinicId", "reviewedByMembershipId") REFERENCES public."ClinicMembership"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "PatientRecoveryCheckIn_clinicId_id_key" UNIQUE ("clinicId", "id"),
    CONSTRAINT "checkin_values" CHECK ("version" > 0 AND "painScore" >= 0 AND "painScore" <= 10 AND (("status" = 'REVIEWED' AND "reviewedAt" IS NOT NULL AND "reviewedByMembershipId" IS NOT NULL) OR ("status" IN ('PENDING_REVIEW', 'ESCALATED'))))
);

CREATE INDEX IF NOT EXISTS "PatientRecoveryCheckIn_clinicId_patientId_checkInDate_idx" ON public."PatientRecoveryCheckIn"("clinicId", "patientId", "checkInDate");
CREATE INDEX IF NOT EXISTS "PatientRecoveryCheckIn_clinicId_status_checkInDate_idx" ON public."PatientRecoveryCheckIn"("clinicId", "status", "checkInDate");
CREATE INDEX IF NOT EXISTS "PatientRecoveryCheckIn_clinicId_isEscalated_checkInDate_idx" ON public."PatientRecoveryCheckIn"("clinicId", "isEscalated", "checkInDate");

-- 3. Create PatientReportedOutcome Table
CREATE TABLE IF NOT EXISTS public."PatientReportedOutcome" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clinicId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "patientAccountId" UUID NOT NULL,
    "checkInId" UUID,
    "followUpId" UUID,
    "procedureExecutionId" UUID,
    "treatmentOutcomeId" UUID,
    "measurementScale" "OutcomeMeasurementScale" NOT NULL,
    "score" DECIMAL(5, 2) NOT NULL,
    "notes" VARCHAR(1000),
    "submittedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PatientReportedOutcome_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PatientReportedOutcome_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES public."Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "PatientReportedOutcome_patient_fkey" FOREIGN KEY ("clinicId", "patientId") REFERENCES public."Patient"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "PatientReportedOutcome_patientAccount_fkey" FOREIGN KEY ("clinicId", "patientAccountId") REFERENCES public."PatientAccount"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "PatientReportedOutcome_checkIn_fkey" FOREIGN KEY ("clinicId", "checkInId") REFERENCES public."PatientRecoveryCheckIn"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "PatientReportedOutcome_followUp_fkey" FOREIGN KEY ("clinicId", "followUpId") REFERENCES public."ClinicalFollowUp"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "PatientReportedOutcome_procedureExecution_fkey" FOREIGN KEY ("clinicId", "procedureExecutionId") REFERENCES public."ProcedureExecution"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "PatientReportedOutcome_treatmentOutcome_fkey" FOREIGN KEY ("clinicId", "treatmentOutcomeId") REFERENCES public."TreatmentOutcome"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "PatientReportedOutcome_clinicId_id_key" UNIQUE ("clinicId", "id"),
    CONSTRAINT "patient_outcome_values" CHECK ("version" > 0)
);

CREATE INDEX IF NOT EXISTS "PatientReportedOutcome_clinicId_patientId_submittedAt_idx" ON public."PatientReportedOutcome"("clinicId", "patientId", "submittedAt");
CREATE INDEX IF NOT EXISTS "PatientReportedOutcome_clinicId_checkInId_idx" ON public."PatientReportedOutcome"("clinicId", "checkInId");

-- 4. Immutability Triggers
DROP TRIGGER IF EXISTS trg_patient_recovery_checkin_clinic_immutable ON public."PatientRecoveryCheckIn";
CREATE TRIGGER trg_patient_recovery_checkin_clinic_immutable
  BEFORE UPDATE ON public."PatientRecoveryCheckIn"
  FOR EACH ROW EXECUTE FUNCTION lamssa_security.patient_clinic_immutable_guard();

DROP TRIGGER IF EXISTS trg_patient_reported_outcome_clinic_immutable ON public."PatientReportedOutcome";
CREATE TRIGGER trg_patient_reported_outcome_clinic_immutable
  BEFORE UPDATE ON public."PatientReportedOutcome"
  FOR EACH ROW EXECUTE FUNCTION lamssa_security.patient_clinic_immutable_guard();

-- 5. Install patient_row_allows Security Definer Function
CREATE OR REPLACE FUNCTION lamssa_security.patient_row_allows(target_clinic uuid, target_patient uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
  SELECT COALESCE(
    lamssa_security.context_allows(target_clinic) AND (
      lamssa_security.context_uuid('lamssa.session_id') IS NOT NULL
      OR
      (
        lamssa_security.context_uuid('lamssa.patient_session_id') IS NOT NULL
        AND target_patient = lamssa_security.context_uuid('lamssa.patient_id')
      )
    ), false);
$$;

-- 6. Definer Functions for Pre-Auth Patient Portal Lookups
DROP FUNCTION IF EXISTS lamssa_security.portal_activation_lookup(text);
CREATE OR REPLACE FUNCTION lamssa_security.portal_activation_lookup(target_token_hash text)
RETURNS TABLE (
  "tokenId" uuid, "clinicId" uuid, "patientAccountId" uuid, "patientId" uuid,
  "tokenType" public."PatientVerificationTokenType", "expiresAt" timestamptz, "usedAt" timestamptz,
  "accountStatus" public."PatientAccountStatus", "patientStatus" public."PatientStatus",
  "fullName" varchar, phone varchar, "dateOfBirth" date, email varchar, "patientNumber" varchar,
  "clinicSlug" varchar, "clinicDisplayName" varchar
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
  SELECT t.id, t."clinicId", t."patientAccountId", pa."patientId",
         t."tokenType", t."expiresAt", t."usedAt",
         pa.status, p.status, p."fullName", p.phone, p."dateOfBirth", p.email, p."patientNumber",
         c.slug, c."displayName"
  FROM public."PatientVerificationToken" t
  JOIN public."PatientAccount" pa ON pa.id = t."patientAccountId" AND pa."clinicId" = t."clinicId"
  JOIN public."Patient" p ON p.id = pa."patientId" AND p."clinicId" = t."clinicId"
  JOIN public."Clinic" c ON c.id = t."clinicId"
  WHERE t."tokenHash" = target_token_hash AND c.status = 'ACTIVE';
$$;

DROP FUNCTION IF EXISTS lamssa_security.portal_login_lookup(uuid, text);
CREATE OR REPLACE FUNCTION lamssa_security.portal_login_lookup(target_clinic_id uuid, target_phone text)
RETURNS TABLE (
  "accountId" uuid, "clinicId" uuid, "patientId" uuid, "passwordHash" varchar,
  status public."PatientAccountStatus", "failedLoginAttempts" int, "lockedUntil" timestamptz,
  "fullName" varchar, phone varchar, email varchar, "patientNumber" varchar,
  "clinicSlug" varchar, "clinicDisplayName" varchar
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
  SELECT pa.id, pa."clinicId", pa."patientId", pa."passwordHash", pa.status,
         pa."failedLoginAttempts", pa."lockedUntil",
         p."fullName", p.phone, p.email, p."patientNumber",
         c.slug, c."displayName"
  FROM public."PatientAccount" pa
  JOIN public."Patient" p ON p.id = pa."patientId" AND p."clinicId" = pa."clinicId"
  JOIN public."Clinic" c ON c.id = pa."clinicId"
  WHERE pa."clinicId" = target_clinic_id AND pa.phone = target_phone
    AND p.status = 'ACTIVE' AND c.status = 'ACTIVE';
$$;

DROP FUNCTION IF EXISTS lamssa_security.portal_reset_lookup(uuid, text);
CREATE OR REPLACE FUNCTION lamssa_security.portal_reset_lookup(target_clinic_id uuid, target_phone text)
RETURNS TABLE (
  "accountId" uuid, "clinicId" uuid, "patientId" uuid, "dateOfBirth" date,
  "accountStatus" public."PatientAccountStatus"
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
  SELECT pa.id, pa."clinicId", pa."patientId", p."dateOfBirth", pa.status
  FROM public."PatientAccount" pa
  JOIN public."Patient" p ON p.id = pa."patientId" AND p."clinicId" = pa."clinicId"
  JOIN public."Clinic" c ON c.id = pa."clinicId"
  WHERE pa."clinicId" = target_clinic_id AND pa.phone = target_phone
    AND p.status = 'ACTIVE' AND c.status = 'ACTIVE';
$$;

-- 7. RLS Configuration for New Tables
ALTER TABLE public."PatientRecoveryCheckIn" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."PatientRecoveryCheckIn" FORCE ROW LEVEL SECURITY;
ALTER TABLE public."PatientReportedOutcome" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."PatientReportedOutcome" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS maintenance_owner ON public."PatientRecoveryCheckIn";
CREATE POLICY maintenance_owner ON public."PatientRecoveryCheckIn" FOR ALL TO public USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS tenant_select ON public."PatientRecoveryCheckIn";
CREATE POLICY tenant_select ON public."PatientRecoveryCheckIn" FOR SELECT TO public USING (
  CASE WHEN CURRENT_USER = 'lamssa_test_migrator' THEN false ELSE lamssa_security.patient_row_allows("clinicId", "patientId") END
);
DROP POLICY IF EXISTS tenant_insert ON public."PatientRecoveryCheckIn";
CREATE POLICY tenant_insert ON public."PatientRecoveryCheckIn" FOR INSERT TO public WITH CHECK (
  CASE WHEN CURRENT_USER = 'lamssa_test_migrator' THEN false ELSE lamssa_security.patient_row_allows("clinicId", "patientId") END
);
DROP POLICY IF EXISTS tenant_update ON public."PatientRecoveryCheckIn";
CREATE POLICY tenant_update ON public."PatientRecoveryCheckIn" FOR UPDATE TO public USING (
  CASE WHEN CURRENT_USER = 'lamssa_test_migrator' THEN false ELSE lamssa_security.patient_row_allows("clinicId", "patientId") END
);
DROP POLICY IF EXISTS tenant_delete ON public."PatientRecoveryCheckIn";
CREATE POLICY tenant_delete ON public."PatientRecoveryCheckIn" FOR DELETE TO public USING (false);

DROP POLICY IF EXISTS maintenance_owner ON public."PatientReportedOutcome";
CREATE POLICY maintenance_owner ON public."PatientReportedOutcome" FOR ALL TO public USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS tenant_select ON public."PatientReportedOutcome";
CREATE POLICY tenant_select ON public."PatientReportedOutcome" FOR SELECT TO public USING (
  CASE WHEN CURRENT_USER = 'lamssa_test_migrator' THEN false ELSE lamssa_security.patient_row_allows("clinicId", "patientId") END
);
DROP POLICY IF EXISTS tenant_insert ON public."PatientReportedOutcome";
CREATE POLICY tenant_insert ON public."PatientReportedOutcome" FOR INSERT TO public WITH CHECK (
  CASE WHEN CURRENT_USER = 'lamssa_test_migrator' THEN false ELSE lamssa_security.patient_row_allows("clinicId", "patientId") END
);
DROP POLICY IF EXISTS tenant_update ON public."PatientReportedOutcome";
CREATE POLICY tenant_update ON public."PatientReportedOutcome" FOR UPDATE TO public USING (
  CASE WHEN CURRENT_USER = 'lamssa_test_migrator' THEN false ELSE lamssa_security.patient_row_allows("clinicId", "patientId") END
);
DROP POLICY IF EXISTS tenant_delete ON public."PatientReportedOutcome";
CREATE POLICY tenant_delete ON public."PatientReportedOutcome" FOR DELETE TO public USING (false);

-- 8. Enhance Tenant Select Policies on Patient-Sensitive Tables
DROP POLICY IF EXISTS tenant_select ON public."Appointment";
CREATE POLICY tenant_select ON public."Appointment" FOR SELECT TO public USING (
  CASE WHEN CURRENT_USER = 'lamssa_test_migrator' THEN false ELSE lamssa_security.patient_row_allows("clinicId", "patientId") END
);

DROP POLICY IF EXISTS tenant_select ON public."PatientConsent";
CREATE POLICY tenant_select ON public."PatientConsent" FOR SELECT TO public USING (
  CASE WHEN CURRENT_USER = 'lamssa_test_migrator' THEN false ELSE lamssa_security.patient_row_allows("clinicId", "patientId") END
);

DROP POLICY IF EXISTS tenant_select ON public."ClinicalFollowUp";
CREATE POLICY tenant_select ON public."ClinicalFollowUp" FOR SELECT TO public USING (
  CASE WHEN CURRENT_USER = 'lamssa_test_migrator' THEN false ELSE lamssa_security.patient_row_allows("clinicId", "patientId") END
);

DROP POLICY IF EXISTS tenant_select ON public."TreatmentPlan";
CREATE POLICY tenant_select ON public."TreatmentPlan" FOR SELECT TO public USING (
  CASE WHEN CURRENT_USER = 'lamssa_test_migrator' THEN false ELSE lamssa_security.patient_row_allows("clinicId", "patientId") END
);

DROP POLICY IF EXISTS tenant_select ON public."ClinicalPhotoSession";
CREATE POLICY tenant_select ON public."ClinicalPhotoSession" FOR SELECT TO public USING (
  CASE WHEN CURRENT_USER = 'lamssa_test_migrator' THEN false ELSE lamssa_security.patient_row_allows("clinicId", "patientId") END
);

DROP POLICY IF EXISTS tenant_select ON public."Patient";
CREATE POLICY tenant_select ON public."Patient" FOR SELECT TO public USING (
  CASE WHEN CURRENT_USER = 'lamssa_test_migrator' THEN false ELSE lamssa_security.patient_row_allows("clinicId", "id") END
);

-- 9. Revocations and Grants
REVOKE ALL ON public."PatientRecoveryCheckIn", public."PatientReportedOutcome" FROM PUBLIC;

REVOKE ALL ON FUNCTION
  lamssa_security.patient_row_allows(uuid, uuid),
  lamssa_security.portal_activation_lookup(text),
  lamssa_security.portal_login_lookup(uuid, text),
  lamssa_security.portal_reset_lookup(uuid, text)
FROM PUBLIC;

DO $$
DECLARE r text;
BEGIN
  FOR r IN SELECT DISTINCT grantee FROM information_schema.role_table_grants WHERE table_schema = 'public' AND table_name = 'Session' AND privilege_type = 'SELECT' AND grantee NOT IN (current_user, 'PUBLIC') LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r AND (rolsuper OR rolbypassrls)) OR pg_has_role(r, current_user, 'MEMBER') THEN
      RAISE EXCEPTION 'Unsafe runtime role';
    END IF;
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON public."PatientRecoveryCheckIn", public."PatientReportedOutcome" TO %I', r);
    EXECUTE format('GRANT EXECUTE ON FUNCTION lamssa_security.patient_row_allows(uuid, uuid) TO %I', r);
    EXECUTE format('GRANT EXECUTE ON FUNCTION lamssa_security.portal_activation_lookup(text) TO %I', r);
    EXECUTE format('GRANT EXECUTE ON FUNCTION lamssa_security.portal_login_lookup(uuid, text) TO %I', r);
    EXECUTE format('GRANT EXECUTE ON FUNCTION lamssa_security.portal_reset_lookup(uuid, text) TO %I', r);
  END LOOP;
END $$;

-- 10. Comments
COMMENT ON TABLE public."PatientRecoveryCheckIn" IS 'Patient-reported recovery check-ins with symptoms, pain score, and clinical review status.';
COMMENT ON TABLE public."PatientReportedOutcome" IS 'Patient-reported measurement scale responses linked to treatment outcomes and recovery check-ins.';
COMMENT ON FUNCTION lamssa_security.patient_row_allows(uuid, uuid) IS 'Row security predicate enforcing same-clinic patient isolation for portal sessions while allowing clinic staff.';

COMMIT;
