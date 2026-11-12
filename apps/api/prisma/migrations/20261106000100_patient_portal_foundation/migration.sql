-- Migration: 20261106000100_patient_portal_foundation
-- Step 5.1: Patient Portal Foundation, Authentication, Isolation & Self-Service Booking

BEGIN;

-- 1. Create Enums
CREATE TYPE public."PatientAccountStatus" AS ENUM ('PENDING_ACTIVATION', 'ACTIVE', 'SUSPENDED');
CREATE TYPE public."PatientVerificationTokenType" AS ENUM ('ACTIVATION', 'PASSWORD_RESET', 'CONTACT_CHANGE');

-- 2. Create PatientAccount
CREATE TABLE public."PatientAccount" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clinicId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "phone" VARCHAR(20) NOT NULL,
    "email" VARCHAR(254),
    "passwordHash" VARCHAR(255) NOT NULL,
    "status" public."PatientAccountStatus" NOT NULL DEFAULT 'PENDING_ACTIVATION',
    "phoneVerifiedAt" TIMESTAMPTZ(3),
    "emailVerifiedAt" TIMESTAMPTZ(3),
    "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMPTZ(3),
    "lastLoginAt" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PatientAccount_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PatientAccount_clinicId_id_key" UNIQUE ("clinicId", "id"),
    CONSTRAINT "PatientAccount_clinicId_patientId_key" UNIQUE ("clinicId", "patientId"),
    CONSTRAINT "PatientAccount_clinicId_phone_key" UNIQUE ("clinicId", "phone"),
    CONSTRAINT "PatientAccount_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES public."Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "PatientAccount_patient_fkey" FOREIGN KEY ("clinicId", "patientId") REFERENCES public."Patient"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE INDEX "PatientAccount_clinicId_status_idx" ON public."PatientAccount"("clinicId", "status");
CREATE INDEX "PatientAccount_clinicId_email_idx" ON public."PatientAccount"("clinicId", "email");
CREATE UNIQUE INDEX "PatientAccount_clinicId_email_lower_key" ON public."PatientAccount" ("clinicId", lower("email")) WHERE "email" IS NOT NULL;

-- 3. Create PatientSession
CREATE TABLE public."PatientSession" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clinicId" UUID NOT NULL,
    "patientAccountId" UUID NOT NULL,
    "sessionTokenHash" VARCHAR(64) NOT NULL,
    "csrfTokenHash" VARCHAR(64) NOT NULL,
    "ipAddress" VARCHAR(45),
    "userAgent" VARCHAR(512),
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),
    "lastSeenAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PatientSession_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PatientSession_clinicId_id_key" UNIQUE ("clinicId", "id"),
    CONSTRAINT "PatientSession_sessionTokenHash_key" UNIQUE ("sessionTokenHash"),
    CONSTRAINT "PatientSession_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES public."Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "PatientSession_patientAccount_fkey" FOREIGN KEY ("clinicId", "patientAccountId") REFERENCES public."PatientAccount"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE INDEX "PatientSession_clinicId_patientAccountId_expiresAt_idx" ON public."PatientSession"("clinicId", "patientAccountId", "expiresAt");
CREATE INDEX "PatientSession_clinicId_expiresAt_idx" ON public."PatientSession"("clinicId", "expiresAt");

-- 4. Create PatientVerificationToken
CREATE TABLE public."PatientVerificationToken" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clinicId" UUID NOT NULL,
    "patientAccountId" UUID NOT NULL,
    "tokenType" public."PatientVerificationTokenType" NOT NULL,
    "tokenHash" VARCHAR(64) NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "usedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PatientVerificationToken_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PatientVerificationToken_clinicId_id_key" UNIQUE ("clinicId", "id"),
    CONSTRAINT "PatientVerificationToken_tokenHash_key" UNIQUE ("tokenHash"),
    CONSTRAINT "PatientVerificationToken_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES public."Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "PatientVerificationToken_patientAccount_fkey" FOREIGN KEY ("clinicId", "patientAccountId") REFERENCES public."PatientAccount"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE INDEX "PatientVerificationToken_clinicId_patientAccountId_tokenType_idx" ON public."PatientVerificationToken"("clinicId", "patientAccountId", "tokenType");
CREATE INDEX "PatientVerificationToken_clinicId_expiresAt_idx" ON public."PatientVerificationToken"("clinicId", "expiresAt");

-- 5. Create PatientPortalAuditEvent
CREATE TABLE public."PatientPortalAuditEvent" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clinicId" UUID NOT NULL,
    "patientAccountId" UUID,
    "patientId" UUID,
    "action" VARCHAR(80) NOT NULL,
    "targetType" VARCHAR(50),
    "targetId" VARCHAR(100),
    "outcome" VARCHAR(20) NOT NULL DEFAULT 'SUCCESS',
    "metadata" JSONB,
    "ipAddress" VARCHAR(45),
    "userAgent" VARCHAR(512),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PatientPortalAuditEvent_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PatientPortalAuditEvent_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES public."Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "PatientPortalAuditEvent_patientAccount_fkey" FOREIGN KEY ("clinicId", "patientAccountId") REFERENCES public."PatientAccount"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE INDEX "PatientPortalAuditEvent_clinicId_createdAt_idx" ON public."PatientPortalAuditEvent"("clinicId", "createdAt");
CREATE INDEX "PatientPortalAuditEvent_clinicId_patientAccountId_createdAt_idx" ON public."PatientPortalAuditEvent"("clinicId", "patientAccountId", "createdAt");

-- 6. Immutability Triggers
CREATE OR REPLACE FUNCTION lamssa_security.patient_clinic_immutable_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD."clinicId" <> NEW."clinicId" THEN
    RAISE EXCEPTION 'clinicId is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_patient_account_clinic_immutable
  BEFORE UPDATE ON public."PatientAccount"
  FOR EACH ROW EXECUTE FUNCTION lamssa_security.patient_clinic_immutable_guard();

CREATE TRIGGER trg_patient_session_clinic_immutable
  BEFORE UPDATE ON public."PatientSession"
  FOR EACH ROW EXECUTE FUNCTION lamssa_security.patient_clinic_immutable_guard();

CREATE TRIGGER trg_patient_verification_clinic_immutable
  BEFORE UPDATE ON public."PatientVerificationToken"
  FOR EACH ROW EXECUTE FUNCTION lamssa_security.patient_clinic_immutable_guard();

CREATE TRIGGER trg_patient_audit_clinic_immutable
  BEFORE UPDATE ON public."PatientPortalAuditEvent"
  FOR EACH ROW EXECUTE FUNCTION lamssa_security.patient_clinic_immutable_guard();

-- 7. Public Portal Clinic Lookup Definer Function
CREATE OR REPLACE FUNCTION lamssa_security.portal_clinic_by_slug(target_slug text)
RETURNS TABLE (id uuid, slug varchar, "displayName" varchar, timezone varchar, currency char(3), status public."ClinicStatus")
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
  SELECT c.id, c.slug, c."displayName", c.timezone, c.currency, c.status
  FROM public."Clinic" c
  WHERE c.slug = target_slug AND c.status = 'ACTIVE';
$$;

-- 8. Enhance context_allows to Recognize Patient Portal Sessions Under FORCE RLS
CREATE OR REPLACE FUNCTION lamssa_security.context_allows(target_clinic uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
  SELECT COALESCE(
    target_clinic = lamssa_security.context_uuid('lamssa.clinic_id') AND (
      EXISTS (
        SELECT 1 FROM public."Session" s
        JOIN public."User" u ON u.id = s."userId"
        JOIN public."ClinicMembership" m ON m."userId" = u.id AND m."clinicId" = target_clinic
        JOIN public."Clinic" c ON c.id = m."clinicId"
        WHERE s.id = lamssa_security.context_uuid('lamssa.session_id')
          AND s."userId" = lamssa_security.context_uuid('lamssa.user_id')
          AND s."selectedClinicId" = target_clinic AND s."revokedAt" IS NULL
          AND s."expiresAt" > statement_timestamp()
          AND u.status = 'ACTIVE' AND m.status = 'ACTIVE' AND c.status = 'ACTIVE'
      )
      OR
      EXISTS (
        SELECT 1 FROM public."PatientSession" ps
        JOIN public."PatientAccount" pa ON pa.id = ps."patientAccountId" AND pa."clinicId" = target_clinic
        JOIN public."Patient" p ON p.id = pa."patientId" AND p."clinicId" = target_clinic
        JOIN public."Clinic" c ON c.id = target_clinic
        WHERE ps.id = lamssa_security.context_uuid('lamssa.patient_session_id')
          AND pa.id = lamssa_security.context_uuid('lamssa.patient_account_id')
          AND p.id = lamssa_security.context_uuid('lamssa.patient_id')
          AND ps."clinicId" = target_clinic
          AND ps."revokedAt" IS NULL
          AND ps."expiresAt" > statement_timestamp()
          AND pa.status = 'ACTIVE' AND p.status = 'ACTIVE' AND c.status = 'ACTIVE'
      )
    ), false);
$$;

-- 9. Revocations and Grants
REVOKE ALL ON
  public."PatientAccount",
  public."PatientSession",
  public."PatientVerificationToken",
  public."PatientPortalAuditEvent"
FROM PUBLIC;

REVOKE ALL ON FUNCTION
  lamssa_security.patient_clinic_immutable_guard(),
  lamssa_security.portal_clinic_by_slug(text)
FROM PUBLIC;

DO $$
DECLARE r text;
BEGIN
  FOR r IN SELECT DISTINCT grantee FROM information_schema.role_table_grants WHERE table_schema = 'public' AND table_name = 'Session' AND privilege_type = 'SELECT' AND grantee NOT IN (current_user, 'PUBLIC') LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r AND (rolsuper OR rolbypassrls)) OR pg_has_role(r, current_user, 'MEMBER') THEN
      RAISE EXCEPTION 'Unsafe runtime role';
    END IF;
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public."PatientAccount", public."PatientSession", public."PatientVerificationToken", public."PatientPortalAuditEvent" TO %I', r);
    EXECUTE format('GRANT EXECUTE ON FUNCTION lamssa_security.portal_clinic_by_slug(text) TO %I', r);
  END LOOP;
END $$;

-- 10. Comments
COMMENT ON TABLE public."PatientAccount" IS 'Clinic-scoped patient accounts for portal access and self-service booking.';
COMMENT ON TABLE public."PatientSession" IS 'Cryptographically isolated, clinic-scoped patient portal sessions.';
COMMENT ON TABLE public."PatientVerificationToken" IS 'Hashed, single-use activation and recovery tokens for patient accounts.';
COMMENT ON TABLE public."PatientPortalAuditEvent" IS 'Immutable audit logs for patient self-service portal actions and security events.';
COMMENT ON FUNCTION lamssa_security.portal_clinic_by_slug(text) IS 'Secure clinic lookup for patient self-service portal branding and authentication.';

COMMIT;
