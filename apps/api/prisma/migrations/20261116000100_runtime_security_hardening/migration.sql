-- Migration: 20261116000100_runtime_security_hardening
-- Phase 7, Step 7.2: Production Database Isolation, Secret Vaulting & Runtime Security Hardening

BEGIN;

-- 1. Harden Patient Verification Token Policies (Strict Staff Session Requirement)
DO $$
DECLARE
  owner_name text;
BEGIN
  SELECT tableowner INTO owner_name FROM pg_tables WHERE schemaname = 'public' AND tablename = 'PatientVerificationToken';

  -- PatientVerificationToken Policies
  EXECUTE 'DROP POLICY IF EXISTS tenant_insert ON public."PatientVerificationToken"';
  EXECUTE format('CREATE POLICY tenant_insert ON public."PatientVerificationToken" FOR INSERT WITH CHECK (CASE WHEN current_user = %L THEN false ELSE "clinicId" = lamssa_security.context_uuid(''lamssa.clinic_id'') AND lamssa_security.context_uuid(''lamssa.session_id'') IS NOT NULL END)', owner_name);

  EXECUTE 'DROP POLICY IF EXISTS tenant_update ON public."PatientVerificationToken"';
  EXECUTE format('CREATE POLICY tenant_update ON public."PatientVerificationToken" FOR UPDATE USING (CASE WHEN current_user = %L THEN false ELSE "clinicId" = lamssa_security.context_uuid(''lamssa.clinic_id'') AND lamssa_security.context_uuid(''lamssa.session_id'') IS NOT NULL END) WITH CHECK (CASE WHEN current_user = %L THEN false ELSE "clinicId" = lamssa_security.context_uuid(''lamssa.clinic_id'') AND lamssa_security.context_uuid(''lamssa.session_id'') IS NOT NULL END)', owner_name, owner_name);

  EXECUTE 'DROP POLICY IF EXISTS tenant_delete ON public."PatientVerificationToken"';
  EXECUTE format('CREATE POLICY tenant_delete ON public."PatientVerificationToken" FOR DELETE USING (CASE WHEN current_user = %L THEN false ELSE "clinicId" = lamssa_security.context_uuid(''lamssa.clinic_id'') AND lamssa_security.context_uuid(''lamssa.session_id'') IS NOT NULL END)', owner_name);

  -- PatientSession Direct Insert Hardening (Session creation strictly through SECURITY DEFINER procedures)
  EXECUTE 'DROP POLICY IF EXISTS tenant_insert ON public."PatientSession"';
  EXECUTE format('CREATE POLICY tenant_insert ON public."PatientSession" FOR INSERT WITH CHECK (CASE WHEN current_user = %L THEN false ELSE "clinicId" = lamssa_security.context_uuid(''lamssa.clinic_id'') AND lamssa_security.context_uuid(''lamssa.session_id'') IS NOT NULL END)', owner_name);
END $$;

-- 2. Hardened Security Definer Procedures in lamssa_security

-- 2.1 portal_activation_lookup: Only return valid, unused, unexpired activation or reset tokens
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
  WHERE t."tokenHash" = target_token_hash
    AND t."usedAt" IS NULL
    AND t."expiresAt" > statement_timestamp()
    AND c.status = 'ACTIVE';
$$;

-- 2.2 portal_complete_activation: Anti-replay, expiration, account ownership & status verification
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
  -- Mark token as used, enforcing tokenType, accountId, unexpired and unused check
  UPDATE public."PatientVerificationToken"
  SET "usedAt" = v_now
  WHERE id = target_token_id
    AND "clinicId" = target_clinic_id
    AND "patientAccountId" = target_account_id
    AND "tokenType" = 'ACTIVATION'
    AND "usedAt" IS NULL
    AND "expiresAt" > v_now;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Verification token already used, expired, or invalid' USING ERRCODE = '23514';
  END IF;

  -- Update patient account, enforcing status is PENDING_ACTIVATION and patientId matches
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
  WHERE id = target_account_id
    AND "clinicId" = target_clinic_id
    AND "patientId" = target_patient_id
    AND status = 'PENDING_ACTIVATION';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Patient account not in pending activation state or patient ID mismatch' USING ERRCODE = '23514';
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

-- 2.3 portal_complete_password_reset: Anti-replay, expiration, and account status check
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
  WHERE id = target_token_id
    AND "clinicId" = target_clinic_id
    AND "patientAccountId" = target_account_id
    AND "tokenType" = 'PASSWORD_RESET'
    AND "usedAt" IS NULL
    AND "expiresAt" > v_now;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reset token already used, expired, or invalid' USING ERRCODE = '23514';
  END IF;

  UPDATE public."PatientAccount"
  SET
    "passwordHash" = target_password_hash,
    "failedLoginAttempts" = 0,
    "lockedUntil" = NULL,
    "version" = "version" + 1,
    "updatedAt" = v_now
  WHERE id = target_account_id
    AND "clinicId" = target_clinic_id
    AND "patientId" = target_patient_id
    AND status = 'ACTIVE';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Patient account not active or patient ID mismatch' USING ERRCODE = '23514';
  END IF;

  -- Invalidate all active sessions for this account upon password reset
  UPDATE public."PatientSession"
  SET "revokedAt" = v_now
  WHERE "clinicId" = target_clinic_id
    AND "patientAccountId" = target_account_id
    AND "revokedAt" IS NULL;

  INSERT INTO public."PatientPortalAuditEvent" (
    "clinicId", "patientAccountId", "patientId", action, "targetType", "targetId", outcome, "createdAt"
  ) VALUES (
    target_clinic_id, target_account_id, target_patient_id, 'portal.password_reset', 'PatientAccount', target_account_id, 'SUCCESS', v_now
  );

  RETURN true;
END;
$$;

-- 2.4 portal_create_reset_token: Account verification check
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
  IF NOT EXISTS (
    SELECT 1 FROM public."PatientAccount"
    WHERE id = target_account_id AND "clinicId" = target_clinic_id AND status = 'ACTIVE'
  ) THEN
    RAISE EXCEPTION 'Target account invalid or inactive' USING ERRCODE = '23514';
  END IF;

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

-- 2.5 portal_record_login_success: Enforce account status is ACTIVE and lockedUntil is NULL or passed
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
  WHERE id = target_account_id
    AND "clinicId" = target_clinic_id
    AND "patientId" = target_patient_id
    AND status = 'ACTIVE'
    AND ("lockedUntil" IS NULL OR "lockedUntil" <= v_now);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Patient account locked, inactive, or not found' USING ERRCODE = '23514';
  END IF;

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

-- 2.6 portal_logout: Enforce account and session binding
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
  WHERE id = target_session_id
    AND "clinicId" = target_clinic_id
    AND "patientAccountId" = target_account_id
    AND "revokedAt" IS NULL;

  INSERT INTO public."PatientPortalAuditEvent" (
    "clinicId", "patientAccountId", "patientId", action, "targetType", "targetId", outcome, "createdAt"
  ) VALUES (
    target_clinic_id, target_account_id, target_patient_id, 'portal.logout', 'PatientSession', target_session_id, 'SUCCESS', v_now
  );

  RETURN true;
END;
$$;

-- 3. Revoke all from PUBLIC and re-grant to runtime roles
REVOKE ALL ON FUNCTION
  lamssa_security.portal_activation_lookup(text),
  lamssa_security.portal_complete_activation(uuid, uuid, uuid, uuid, text, text, text, timestamptz, text, text),
  lamssa_security.portal_complete_password_reset(uuid, uuid, uuid, uuid, text),
  lamssa_security.portal_create_reset_token(uuid, uuid, text, timestamptz),
  lamssa_security.portal_record_login_success(uuid, uuid, uuid, text, text, timestamptz, text, text),
  lamssa_security.portal_logout(uuid, uuid, uuid, uuid)
FROM PUBLIC;

DO $$
DECLARE r text;
BEGIN
  FOR r IN SELECT DISTINCT grantee FROM information_schema.role_table_grants WHERE table_schema = 'public' AND table_name = 'Session' AND privilege_type = 'SELECT' AND grantee NOT IN (current_user, 'PUBLIC') LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION
      lamssa_security.portal_activation_lookup(text),
      lamssa_security.portal_complete_activation(uuid, uuid, uuid, uuid, text, text, text, timestamptz, text, text),
      lamssa_security.portal_complete_password_reset(uuid, uuid, uuid, uuid, text),
      lamssa_security.portal_create_reset_token(uuid, uuid, text, timestamptz),
      lamssa_security.portal_record_login_success(uuid, uuid, uuid, text, text, timestamptz, text, text),
      lamssa_security.portal_logout(uuid, uuid, uuid, uuid)
    TO %I', r);
  END LOOP;
END $$;

COMMIT;
