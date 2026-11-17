-- Migration: 20261115000100_identity_isolation_and_kms
-- Phase 7, Step 7.1: Sensitive Identity Data Isolation, KMS Registry & Cryptographic Security Hardening

BEGIN;

-- 1. Create Enums for KMS Key Lifecycle
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'KmsKeyState') THEN
    CREATE TYPE public."KmsKeyState" AS ENUM ('ACTIVE', 'RETIRED', 'DISABLED', 'REVOKED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'KmsKeyAlgorithm') THEN
    CREATE TYPE public."KmsKeyAlgorithm" AS ENUM ('AES_256_GCM', 'AES_256_KW');
  END IF;
END $$;

-- 2. Create KmsKeyRegistry Table (Metadata Only — Raw Keys Never Stored in Database)
CREATE TABLE IF NOT EXISTS public."KmsKeyRegistry" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "keyId" VARCHAR(128) NOT NULL,
    "version" INTEGER NOT NULL,
    "state" public."KmsKeyState" NOT NULL DEFAULT 'ACTIVE',
    "algorithm" public."KmsKeyAlgorithm" NOT NULL DEFAULT 'AES_256_GCM',
    "description" VARCHAR(255),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rotatedAt" TIMESTAMPTZ(3),
    "revokedAt" TIMESTAMPTZ(3),

    CONSTRAINT "KmsKeyRegistry_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "KmsKeyRegistry_keyId_key" UNIQUE ("keyId"),
    CONSTRAINT "KmsKeyRegistry_version_key" UNIQUE ("version")
);

-- 3. Create KmsMigrationAudit Table (Audited Re-encryption Tracking)
CREATE TABLE IF NOT EXISTS public."KmsMigrationAudit" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clinicId" UUID,
    "resourceType" VARCHAR(64) NOT NULL,
    "recordId" VARCHAR(128) NOT NULL,
    "sourceKeyId" VARCHAR(128) NOT NULL,
    "targetKeyId" VARCHAR(128) NOT NULL,
    "status" VARCHAR(32) NOT NULL,
    "migratedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KmsMigrationAudit_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "KmsMigrationAudit_clinicId_resourceType_idx" ON public."KmsMigrationAudit"("clinicId", "resourceType");
CREATE INDEX IF NOT EXISTS "KmsMigrationAudit_migratedAt_idx" ON public."KmsMigrationAudit"("migratedAt");

-- 4. Seed Initial Active KEK Version in KmsKeyRegistry
INSERT INTO public."KmsKeyRegistry" ("keyId", "version", "state", "algorithm", "description")
VALUES ('lamssa/kek/2026-v1', 1, 'ACTIVE', 'AES_256_GCM', 'Initial primary Key Encryption Key (KEK) version 1')
ON CONFLICT ("keyId") DO NOTHING;

-- 5. Install SECURITY DEFINER Helper Functions for Patient Portal Bootstrap Authentication
DROP FUNCTION IF EXISTS lamssa_security.portal_validate_session(text);
CREATE OR REPLACE FUNCTION lamssa_security.portal_validate_session(target_session_token_hash text)
RETURNS TABLE (
  id uuid,
  "clinicId" uuid,
  "patientAccountId" uuid,
  "patientId" uuid,
  "csrfTokenHash" varchar,
  "lastSeenAt" timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT ps.id, ps."clinicId", ps."patientAccountId", pa."patientId", ps."csrfTokenHash", ps."lastSeenAt"
  FROM public."PatientSession" ps
  JOIN public."PatientAccount" pa ON pa.id = ps."patientAccountId" AND pa."clinicId" = ps."clinicId"
  JOIN public."Patient" p ON p.id = pa."patientId" AND p."clinicId" = ps."clinicId"
  JOIN public."Clinic" c ON c.id = ps."clinicId"
  WHERE ps."sessionTokenHash" = target_session_token_hash
    AND ps."revokedAt" IS NULL
    AND ps."expiresAt" > statement_timestamp()
    AND pa.status = 'ACTIVE'
    AND p.status = 'ACTIVE'
    AND c.status = 'ACTIVE';
$$;

DROP FUNCTION IF EXISTS lamssa_security.portal_touch_session(uuid);
CREATE OR REPLACE FUNCTION lamssa_security.portal_touch_session(target_session_id uuid)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  UPDATE public."PatientSession"
  SET "lastSeenAt" = clock_timestamp()
  WHERE id = target_session_id AND "revokedAt" IS NULL;
  RETURN true;
END;
$$;

DROP FUNCTION IF EXISTS lamssa_security.portal_record_login_failure(uuid, uuid, text, text);
CREATE OR REPLACE FUNCTION lamssa_security.portal_record_login_failure(
  target_clinic_id uuid,
  target_account_id uuid,
  target_ip text,
  target_user_agent text
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_failed int;
  v_locked timestamptz;
  v_now timestamptz := clock_timestamp();
BEGIN
  SELECT "failedLoginAttempts" + 1 INTO v_failed
  FROM public."PatientAccount"
  WHERE id = target_account_id AND "clinicId" = target_clinic_id;

  IF v_failed >= 5 THEN
    v_locked := v_now + interval '15 minutes';
  END IF;

  UPDATE public."PatientAccount"
  SET "failedLoginAttempts" = COALESCE(v_failed, 1),
      "lockedUntil" = v_locked,
      "updatedAt" = v_now
  WHERE id = target_account_id AND "clinicId" = target_clinic_id;

  INSERT INTO public."PatientPortalAuditEvent" (
    "clinicId", "patientAccountId", action, "targetType", "targetId", outcome, "ipAddress", "userAgent", metadata, "createdAt"
  ) VALUES (
    target_clinic_id, target_account_id, 'portal.login_failed', 'PatientAccount', target_account_id, 'FAILURE', target_ip, target_user_agent, jsonb_build_object('reason', 'INVALID_CREDENTIALS', 'attempts', COALESCE(v_failed, 1)), v_now
  );

  RETURN true;
END;
$$;

DROP FUNCTION IF EXISTS lamssa_security.portal_record_login_success(uuid, uuid, uuid, text, text, timestamptz, text, text);
CREATE OR REPLACE FUNCTION lamssa_security.portal_record_login_success(
  target_clinic_id uuid,
  target_account_id uuid,
  target_patient_id uuid,
  target_session_token_hash text,
  target_csrf_token_hash text,
  target_expires_at timestamptz,
  target_ip text,
  target_user_agent text
)
RETURNS TABLE (
  "sessionId" uuid
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_session_id uuid;
  v_now timestamptz := clock_timestamp();
BEGIN
  UPDATE public."PatientAccount"
  SET "failedLoginAttempts" = 0, "lockedUntil" = NULL, "lastLoginAt" = v_now, "updatedAt" = v_now
  WHERE id = target_account_id AND "clinicId" = target_clinic_id;

  v_session_id := gen_random_uuid();
  INSERT INTO public."PatientSession" (
    id, "clinicId", "patientAccountId", "sessionTokenHash", "csrfTokenHash",
    "ipAddress", "userAgent", "expiresAt", "lastSeenAt", "createdAt"
  ) VALUES (
    v_session_id, target_clinic_id, target_account_id, target_session_token_hash, target_csrf_token_hash,
    target_ip, target_user_agent, target_expires_at, v_now, v_now
  );

  INSERT INTO public."PatientPortalAuditEvent" (
    "clinicId", "patientAccountId", "patientId", action, "targetType", "targetId",
    outcome, "ipAddress", "userAgent", "createdAt"
  ) VALUES (
    target_clinic_id, target_account_id, target_patient_id, 'portal.login_success', 'PatientAccount',
    target_account_id, 'SUCCESS', target_ip, target_user_agent, v_now
  );

  RETURN QUERY SELECT v_session_id;
END;
$$;

DROP FUNCTION IF EXISTS lamssa_security.portal_complete_activation(uuid, uuid, uuid, uuid, text, text, text, timestamptz, text, text);
CREATE OR REPLACE FUNCTION lamssa_security.portal_complete_activation(
  target_token_id uuid,
  target_account_id uuid,
  target_clinic_id uuid,
  target_patient_id uuid,
  target_password_hash text,
  target_session_token_hash text,
  target_csrf_token_hash text,
  target_expires_at timestamptz,
  target_ip text,
  target_user_agent text
)
RETURNS TABLE (
  "sessionId" uuid
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_session_id uuid;
  v_now timestamptz := clock_timestamp();
BEGIN
  -- Mark token as used
  UPDATE public."PatientVerificationToken"
  SET "usedAt" = v_now
  WHERE id = target_token_id AND "clinicId" = target_clinic_id AND "usedAt" IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Verification token already used or invalid' USING ERRCODE = '23514';
  END IF;

  -- Update patient account
  UPDATE public."PatientAccount"
  SET
    "passwordHash" = target_password_hash,
    "status" = 'ACTIVE',
    "phoneVerifiedAt" = v_now,
    "failedLoginAttempts" = 0,
    "lockedUntil" = NULL,
    "lastLoginAt" = v_now,
    "version" = "version" + 1,
    "updatedAt" = v_now
  WHERE id = target_account_id AND "clinicId" = target_clinic_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Patient account not found' USING ERRCODE = '23514';
  END IF;

  -- Create session
  v_session_id := gen_random_uuid();
  INSERT INTO public."PatientSession" (
    id, "clinicId", "patientAccountId", "sessionTokenHash", "csrfTokenHash",
    "ipAddress", "userAgent", "expiresAt", "lastSeenAt", "createdAt"
  ) VALUES (
    v_session_id, target_clinic_id, target_account_id, target_session_token_hash, target_csrf_token_hash,
    target_ip, target_user_agent, target_expires_at, v_now, v_now
  );

  -- Record audit event
  INSERT INTO public."PatientPortalAuditEvent" (
    "clinicId", "patientAccountId", "patientId", action, "targetType", "targetId",
    outcome, "ipAddress", "userAgent", "createdAt"
  ) VALUES (
    target_clinic_id, target_account_id, target_patient_id, 'portal.account_activated', 'PatientAccount',
    target_account_id, 'SUCCESS', target_ip, target_user_agent, v_now
  );

  RETURN QUERY SELECT v_session_id;
END;
$$;

DROP FUNCTION IF EXISTS lamssa_security.portal_logout(uuid, uuid, uuid, uuid);
CREATE OR REPLACE FUNCTION lamssa_security.portal_logout(
  target_session_id uuid,
  target_clinic_id uuid,
  target_account_id uuid,
  target_patient_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
BEGIN
  UPDATE public."PatientSession"
  SET "revokedAt" = v_now
  WHERE id = target_session_id AND "clinicId" = target_clinic_id;

  INSERT INTO public."PatientPortalAuditEvent" (
    "clinicId", "patientAccountId", "patientId", action, "targetType", "targetId", outcome, "createdAt"
  ) VALUES (
    target_clinic_id, target_account_id, target_patient_id, 'portal.logout', 'PatientSession', target_session_id, 'SUCCESS', v_now
  );

  RETURN true;
END;
$$;

DROP FUNCTION IF EXISTS lamssa_security.portal_create_reset_token(uuid, uuid, text, timestamptz);
CREATE OR REPLACE FUNCTION lamssa_security.portal_create_reset_token(
  target_clinic_id uuid,
  target_account_id uuid,
  target_token_hash text,
  target_expires_at timestamptz
)
RETURNS TABLE (
  "tokenId" uuid
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_token_id uuid;
  v_now timestamptz := clock_timestamp();
BEGIN
  -- Invalidate prior unused reset tokens
  DELETE FROM public."PatientVerificationToken"
  WHERE "clinicId" = target_clinic_id
    AND "patientAccountId" = target_account_id
    AND "tokenType" = 'PASSWORD_RESET'
    AND "usedAt" IS NULL;

  v_token_id := gen_random_uuid();
  INSERT INTO public."PatientVerificationToken" (
    id, "clinicId", "patientAccountId", "tokenType", "tokenHash", "expiresAt", "createdAt"
  ) VALUES (
    v_token_id, target_clinic_id, target_account_id, 'PASSWORD_RESET', target_token_hash, target_expires_at, v_now
  );

  RETURN QUERY SELECT v_token_id;
END;
$$;

DROP FUNCTION IF EXISTS lamssa_security.portal_complete_password_reset(uuid, uuid, uuid, uuid, text);
CREATE OR REPLACE FUNCTION lamssa_security.portal_complete_password_reset(
  target_token_id uuid,
  target_account_id uuid,
  target_clinic_id uuid,
  target_patient_id uuid,
  target_password_hash text
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
BEGIN
  UPDATE public."PatientVerificationToken"
  SET "usedAt" = v_now
  WHERE id = target_token_id AND "clinicId" = target_clinic_id AND "usedAt" IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reset token already used or invalid' USING ERRCODE = '23514';
  END IF;

  UPDATE public."PatientAccount"
  SET
    "passwordHash" = target_password_hash,
    "failedLoginAttempts" = 0,
    "lockedUntil" = NULL,
    "version" = "version" + 1,
    "updatedAt" = v_now
  WHERE id = target_account_id AND "clinicId" = target_clinic_id;

  -- Invalidate all active sessions for this account upon password reset
  UPDATE public."PatientSession"
  SET "revokedAt" = v_now
  WHERE "clinicId" = target_clinic_id AND "patientAccountId" = target_account_id AND "revokedAt" IS NULL;

  INSERT INTO public."PatientPortalAuditEvent" (
    "clinicId", "patientAccountId", "patientId", action, "targetType", "targetId", outcome, "createdAt"
  ) VALUES (
    target_clinic_id, target_account_id, target_patient_id, 'portal.password_reset', 'PatientAccount', target_account_id, 'SUCCESS', v_now
  );

  RETURN true;
END;
$$;

-- 6. Enforce FORCE ROW LEVEL SECURITY & Define Strict Multi-Tenant Policies
DO $$
DECLARE
  owner_name text;
BEGIN
  SELECT tableowner INTO owner_name FROM pg_tables WHERE schemaname = 'public' AND tablename = 'PatientAccount';

  -- PatientAccount
  EXECUTE 'ALTER TABLE public."PatientAccount" ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE public."PatientAccount" FORCE ROW LEVEL SECURITY';
  EXECUTE 'DROP POLICY IF EXISTS maintenance_owner ON public."PatientAccount"';
  EXECUTE format('CREATE POLICY maintenance_owner ON public."PatientAccount" FOR ALL TO %I USING (true) WITH CHECK (true)', owner_name);
  EXECUTE 'DROP POLICY IF EXISTS tenant_select ON public."PatientAccount"';
  EXECUTE format('CREATE POLICY tenant_select ON public."PatientAccount" FOR SELECT USING (CASE WHEN current_user = %L THEN false ELSE "clinicId" = lamssa_security.context_uuid(''lamssa.clinic_id'') AND (lamssa_security.context_uuid(''lamssa.session_id'') IS NOT NULL OR id = lamssa_security.context_uuid(''lamssa.patient_account_id'')) END)', owner_name);
  EXECUTE 'DROP POLICY IF EXISTS tenant_insert ON public."PatientAccount"';
  EXECUTE format('CREATE POLICY tenant_insert ON public."PatientAccount" FOR INSERT WITH CHECK (CASE WHEN current_user = %L THEN false ELSE "clinicId" = lamssa_security.context_uuid(''lamssa.clinic_id'') AND lamssa_security.context_uuid(''lamssa.session_id'') IS NOT NULL END)', owner_name);
  EXECUTE 'DROP POLICY IF EXISTS tenant_update ON public."PatientAccount"';
  EXECUTE format('CREATE POLICY tenant_update ON public."PatientAccount" FOR UPDATE USING (CASE WHEN current_user = %L THEN false ELSE "clinicId" = lamssa_security.context_uuid(''lamssa.clinic_id'') AND (lamssa_security.context_uuid(''lamssa.session_id'') IS NOT NULL OR id = lamssa_security.context_uuid(''lamssa.patient_account_id'')) END) WITH CHECK (CASE WHEN current_user = %L THEN false ELSE "clinicId" = lamssa_security.context_uuid(''lamssa.clinic_id'') AND (lamssa_security.context_uuid(''lamssa.session_id'') IS NOT NULL OR id = lamssa_security.context_uuid(''lamssa.patient_account_id'')) END)', owner_name, owner_name);
  EXECUTE 'DROP POLICY IF EXISTS tenant_delete ON public."PatientAccount"';
  EXECUTE format('CREATE POLICY tenant_delete ON public."PatientAccount" FOR DELETE USING (false)', owner_name);

  -- PatientSession
  EXECUTE 'ALTER TABLE public."PatientSession" ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE public."PatientSession" FORCE ROW LEVEL SECURITY';
  EXECUTE 'DROP POLICY IF EXISTS maintenance_owner ON public."PatientSession"';
  EXECUTE format('CREATE POLICY maintenance_owner ON public."PatientSession" FOR ALL TO %I USING (true) WITH CHECK (true)', owner_name);
  EXECUTE 'DROP POLICY IF EXISTS tenant_select ON public."PatientSession"';
  EXECUTE format('CREATE POLICY tenant_select ON public."PatientSession" FOR SELECT USING (CASE WHEN current_user = %L THEN false ELSE "clinicId" = lamssa_security.context_uuid(''lamssa.clinic_id'') AND (lamssa_security.context_uuid(''lamssa.session_id'') IS NOT NULL OR id = lamssa_security.context_uuid(''lamssa.patient_session_id'')) END)', owner_name);
  EXECUTE 'DROP POLICY IF EXISTS tenant_insert ON public."PatientSession"';
  EXECUTE format('CREATE POLICY tenant_insert ON public."PatientSession" FOR INSERT WITH CHECK (CASE WHEN current_user = %L THEN false ELSE "clinicId" = lamssa_security.context_uuid(''lamssa.clinic_id'') END)', owner_name);
  EXECUTE 'DROP POLICY IF EXISTS tenant_update ON public."PatientSession"';
  EXECUTE format('CREATE POLICY tenant_update ON public."PatientSession" FOR UPDATE USING (CASE WHEN current_user = %L THEN false ELSE "clinicId" = lamssa_security.context_uuid(''lamssa.clinic_id'') AND (lamssa_security.context_uuid(''lamssa.session_id'') IS NOT NULL OR id = lamssa_security.context_uuid(''lamssa.patient_session_id'')) END) WITH CHECK (CASE WHEN current_user = %L THEN false ELSE "clinicId" = lamssa_security.context_uuid(''lamssa.clinic_id'') AND (lamssa_security.context_uuid(''lamssa.session_id'') IS NOT NULL OR id = lamssa_security.context_uuid(''lamssa.patient_session_id'')) END)', owner_name, owner_name);
  EXECUTE 'DROP POLICY IF EXISTS tenant_delete ON public."PatientSession"';
  EXECUTE format('CREATE POLICY tenant_delete ON public."PatientSession" FOR DELETE USING (false)', owner_name);

  -- PatientVerificationToken
  EXECUTE 'ALTER TABLE public."PatientVerificationToken" ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE public."PatientVerificationToken" FORCE ROW LEVEL SECURITY';
  EXECUTE 'DROP POLICY IF EXISTS maintenance_owner ON public."PatientVerificationToken"';
  EXECUTE format('CREATE POLICY maintenance_owner ON public."PatientVerificationToken" FOR ALL TO %I USING (true) WITH CHECK (true)', owner_name);
  EXECUTE 'DROP POLICY IF EXISTS tenant_select ON public."PatientVerificationToken"';
  EXECUTE format('CREATE POLICY tenant_select ON public."PatientVerificationToken" FOR SELECT USING (CASE WHEN current_user = %L THEN false ELSE "clinicId" = lamssa_security.context_uuid(''lamssa.clinic_id'') AND lamssa_security.context_uuid(''lamssa.session_id'') IS NOT NULL END)', owner_name);
  EXECUTE 'DROP POLICY IF EXISTS tenant_insert ON public."PatientVerificationToken"';
  EXECUTE format('CREATE POLICY tenant_insert ON public."PatientVerificationToken" FOR INSERT WITH CHECK (CASE WHEN current_user = %L THEN false ELSE "clinicId" = lamssa_security.context_uuid(''lamssa.clinic_id'') END)', owner_name);
  EXECUTE 'DROP POLICY IF EXISTS tenant_update ON public."PatientVerificationToken"';
  EXECUTE format('CREATE POLICY tenant_update ON public."PatientVerificationToken" FOR UPDATE USING (CASE WHEN current_user = %L THEN false ELSE "clinicId" = lamssa_security.context_uuid(''lamssa.clinic_id'') END) WITH CHECK (CASE WHEN current_user = %L THEN false ELSE "clinicId" = lamssa_security.context_uuid(''lamssa.clinic_id'') END)', owner_name, owner_name);
  EXECUTE 'DROP POLICY IF EXISTS tenant_delete ON public."PatientVerificationToken"';
  EXECUTE format('CREATE POLICY tenant_delete ON public."PatientVerificationToken" FOR DELETE USING (CASE WHEN current_user = %L THEN false ELSE "clinicId" = lamssa_security.context_uuid(''lamssa.clinic_id'') END)', owner_name);

  -- PatientPortalAuditEvent
  EXECUTE 'ALTER TABLE public."PatientPortalAuditEvent" ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE public."PatientPortalAuditEvent" FORCE ROW LEVEL SECURITY';
  EXECUTE 'DROP POLICY IF EXISTS maintenance_owner ON public."PatientPortalAuditEvent"';
  EXECUTE format('CREATE POLICY maintenance_owner ON public."PatientPortalAuditEvent" FOR ALL TO %I USING (true) WITH CHECK (true)', owner_name);
  EXECUTE 'DROP POLICY IF EXISTS tenant_select ON public."PatientPortalAuditEvent"';
  EXECUTE format('CREATE POLICY tenant_select ON public."PatientPortalAuditEvent" FOR SELECT USING (CASE WHEN current_user = %L THEN false ELSE "clinicId" = lamssa_security.context_uuid(''lamssa.clinic_id'') AND (lamssa_security.context_uuid(''lamssa.session_id'') IS NOT NULL OR (lamssa_security.context_uuid(''lamssa.patient_session_id'') IS NOT NULL AND "patientAccountId" = lamssa_security.context_uuid(''lamssa.patient_account_id''))) END)', owner_name);
  EXECUTE 'DROP POLICY IF EXISTS tenant_insert ON public."PatientPortalAuditEvent"';
  EXECUTE format('CREATE POLICY tenant_insert ON public."PatientPortalAuditEvent" FOR INSERT WITH CHECK (CASE WHEN current_user = %L THEN false ELSE "clinicId" = lamssa_security.context_uuid(''lamssa.clinic_id'') AND (lamssa_security.context_uuid(''lamssa.session_id'') IS NOT NULL OR lamssa_security.context_uuid(''lamssa.patient_session_id'') IS NOT NULL) END)', owner_name);
  EXECUTE 'DROP POLICY IF EXISTS tenant_update ON public."PatientPortalAuditEvent"';
  EXECUTE format('CREATE POLICY tenant_update ON public."PatientPortalAuditEvent" FOR UPDATE USING (false) WITH CHECK (false)');
  EXECUTE 'DROP POLICY IF EXISTS tenant_delete ON public."PatientPortalAuditEvent"';
  EXECUTE format('CREATE POLICY tenant_delete ON public."PatientPortalAuditEvent" FOR DELETE USING (false)');

  -- KmsKeyRegistry (Public Read for Active/Retired Keys, Maintenance Owner for Mutations)
  EXECUTE 'ALTER TABLE public."KmsKeyRegistry" ENABLE ROW LEVEL SECURITY';
  EXECUTE 'DROP POLICY IF EXISTS maintenance_owner ON public."KmsKeyRegistry"';
  EXECUTE format('CREATE POLICY maintenance_owner ON public."KmsKeyRegistry" FOR ALL TO %I USING (true) WITH CHECK (true)', owner_name);
  EXECUTE 'DROP POLICY IF EXISTS kms_registry_select ON public."KmsKeyRegistry"';
  EXECUTE 'CREATE POLICY kms_registry_select ON public."KmsKeyRegistry" FOR SELECT TO public USING (true)';

  -- KmsMigrationAudit (Administration-Scoped / Immutable Audit)
  EXECUTE 'ALTER TABLE public."KmsMigrationAudit" ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE public."KmsMigrationAudit" FORCE ROW LEVEL SECURITY';
  EXECUTE 'DROP POLICY IF EXISTS maintenance_owner ON public."KmsMigrationAudit"';
  EXECUTE format('CREATE POLICY maintenance_owner ON public."KmsMigrationAudit" FOR ALL TO %I USING (true) WITH CHECK (true)', owner_name);
  EXECUTE 'DROP POLICY IF EXISTS kms_migration_select ON public."KmsMigrationAudit"';
  EXECUTE format('CREATE POLICY kms_migration_select ON public."KmsMigrationAudit" FOR SELECT USING (CASE WHEN current_user = %L THEN false ELSE "clinicId" IS NULL OR "clinicId" = lamssa_security.context_uuid(''lamssa.clinic_id'') END)', owner_name);
  EXECUTE 'DROP POLICY IF EXISTS kms_migration_insert ON public."KmsMigrationAudit"';
  EXECUTE format('CREATE POLICY kms_migration_insert ON public."KmsMigrationAudit" FOR INSERT WITH CHECK (CASE WHEN current_user = %L THEN false ELSE "clinicId" IS NULL OR "clinicId" = lamssa_security.context_uuid(''lamssa.clinic_id'') END)', owner_name);
  EXECUTE 'DROP POLICY IF EXISTS kms_migration_update ON public."KmsMigrationAudit"';
  EXECUTE format('CREATE POLICY kms_migration_update ON public."KmsMigrationAudit" FOR UPDATE USING (false)');
  EXECUTE 'DROP POLICY IF EXISTS kms_migration_delete ON public."KmsMigrationAudit"';
  EXECUTE 'CREATE POLICY kms_migration_delete ON public."KmsMigrationAudit" FOR DELETE USING (false)';
END $$;

-- 7. Revoke All on New Functions from PUBLIC
REVOKE ALL ON FUNCTION
  lamssa_security.portal_validate_session(text),
  lamssa_security.portal_touch_session(uuid),
  lamssa_security.portal_record_login_failure(uuid, uuid, text, text),
  lamssa_security.portal_record_login_success(uuid, uuid, uuid, text, text, timestamptz, text, text),
  lamssa_security.portal_complete_activation(uuid, uuid, uuid, uuid, text, text, text, timestamptz, text, text),
  lamssa_security.portal_logout(uuid, uuid, uuid, uuid),
  lamssa_security.portal_create_reset_token(uuid, uuid, text, timestamptz),
  lamssa_security.portal_complete_password_reset(uuid, uuid, uuid, uuid, text)
FROM PUBLIC;

-- 8. Grant Restricted Runtime Role Privileges
DO $$
DECLARE r text;
BEGIN
  FOR r IN SELECT DISTINCT grantee FROM information_schema.role_table_grants WHERE table_schema = 'public' AND table_name = 'Session' AND privilege_type = 'SELECT' AND grantee NOT IN (current_user, 'PUBLIC') LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r AND (rolsuper OR rolbypassrls)) OR pg_has_role(r, current_user, 'MEMBER') THEN
      RAISE EXCEPTION 'Unsafe runtime role';
    END IF;
    -- Table grants
    EXECUTE format('GRANT SELECT ON public."KmsKeyRegistry" TO %I', r);
    EXECUTE format('GRANT SELECT, INSERT ON public."KmsMigrationAudit" TO %I', r);
    -- Function grants for patient portal authentication
    EXECUTE format('GRANT EXECUTE ON FUNCTION
      lamssa_security.portal_validate_session(text),
      lamssa_security.portal_touch_session(uuid),
      lamssa_security.portal_record_login_failure(uuid, uuid, text, text),
      lamssa_security.portal_record_login_success(uuid, uuid, uuid, text, text, timestamptz, text, text),
      lamssa_security.portal_complete_activation(uuid, uuid, uuid, uuid, text, text, text, timestamptz, text, text),
      lamssa_security.portal_logout(uuid, uuid, uuid, uuid),
      lamssa_security.portal_create_reset_token(uuid, uuid, text, timestamptz),
      lamssa_security.portal_complete_password_reset(uuid, uuid, uuid, uuid, text)
    TO %I', r);
  END LOOP;
END $$;

-- 9. Documentation Comments
COMMENT ON TABLE public."KmsKeyRegistry" IS 'Versioned metadata registry for cryptographic Key Encryption Keys (KEK). Never stores raw keys.';
COMMENT ON TABLE public."KmsMigrationAudit" IS 'Audited tracking for cryptographic envelope re-encryption and legacy migration.';
COMMENT ON FUNCTION lamssa_security.portal_validate_session(text) IS 'Secure patient portal session lookup enforcing account status and cryptographic token hash match under FORCE RLS.';
COMMENT ON FUNCTION lamssa_security.portal_complete_activation(uuid, uuid, uuid, uuid, text, text, text, timestamptz, text, text) IS 'Atomic patient account activation, password setup, session creation and audit event emission under FORCE RLS.';

COMMIT;
