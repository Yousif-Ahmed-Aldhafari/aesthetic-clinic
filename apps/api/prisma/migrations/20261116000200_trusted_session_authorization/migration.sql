-- Migration: 20261116000200_trusted_session_authorization
-- Phase 7, Step 7.3: Trusted Session Authorization & Direct DML Elimination

BEGIN;

-- 1. Tighten RLS policies on PatientVerificationToken and PatientSession
-- Disallow direct INSERT, UPDATE, DELETE from unprivileged runtime roles.
DO $$
DECLARE
  owner_name text;
BEGIN
  SELECT tableowner INTO owner_name FROM pg_tables WHERE schemaname = 'public' AND tablename = 'PatientVerificationToken';

  -- PatientVerificationToken Policies
  EXECUTE 'DROP POLICY IF EXISTS tenant_insert ON public."PatientVerificationToken"';
  EXECUTE format('CREATE POLICY tenant_insert ON public."PatientVerificationToken" FOR INSERT WITH CHECK (CASE WHEN current_user = %L THEN true ELSE false END)', owner_name);

  EXECUTE 'DROP POLICY IF EXISTS tenant_update ON public."PatientVerificationToken"';
  EXECUTE format('CREATE POLICY tenant_update ON public."PatientVerificationToken" FOR UPDATE USING (CASE WHEN current_user = %L THEN true ELSE false END) WITH CHECK (CASE WHEN current_user = %L THEN true ELSE false END)', owner_name, owner_name);

  EXECUTE 'DROP POLICY IF EXISTS tenant_delete ON public."PatientVerificationToken"';
  EXECUTE format('CREATE POLICY tenant_delete ON public."PatientVerificationToken" FOR DELETE USING (CASE WHEN current_user = %L THEN true ELSE false END)', owner_name);

  -- PatientSession Policies
  EXECUTE 'DROP POLICY IF EXISTS tenant_insert ON public."PatientSession"';
  EXECUTE format('CREATE POLICY tenant_insert ON public."PatientSession" FOR INSERT WITH CHECK (CASE WHEN current_user = %L THEN true ELSE false END)', owner_name);

  EXECUTE 'DROP POLICY IF EXISTS tenant_update ON public."PatientSession"';
  EXECUTE format('CREATE POLICY tenant_update ON public."PatientSession" FOR UPDATE USING (CASE WHEN current_user = %L THEN true ELSE false END) WITH CHECK (CASE WHEN current_user = %L THEN true ELSE false END)', owner_name, owner_name);

  EXECUTE 'DROP POLICY IF EXISTS tenant_delete ON public."PatientSession"';
  EXECUTE format('CREATE POLICY tenant_delete ON public."PatientSession" FOR DELETE USING (CASE WHEN current_user = %L THEN true ELSE false END)', owner_name);
END $$;

-- 2. Create SECURITY DEFINER procedure for staff invitation token minting
-- Validates caller session against public."Session" and public."ClinicMembership"
DROP FUNCTION IF EXISTS lamssa_security.portal_create_invitation_token(uuid, uuid, text, timestamptz);
CREATE OR REPLACE FUNCTION lamssa_security.portal_create_invitation_token(
  target_clinic_id uuid,
  target_account_id uuid,
  target_token_hash text,
  target_expires_at timestamptz
)
RETURNS TABLE ("tokenId" uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  v_session_id uuid;
  v_token_id uuid;
  v_now timestamptz := clock_timestamp();
BEGIN
  -- Verify caller session context is populated
  v_session_id := lamssa_security.context_uuid('lamssa.session_id');
  IF v_session_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required: session context is not set' USING ERRCODE = '28000';
  END IF;

  -- Validate caller session in public."Session" and staff membership in target_clinic_id
  IF NOT EXISTS (
    SELECT 1 FROM public."Session" s
    JOIN public."ClinicMembership" cm ON cm."userId" = s."userId" AND cm."clinicId" = target_clinic_id AND cm.status = 'ACTIVE'
    WHERE s.id = v_session_id
      AND s."revokedAt" IS NULL
      AND s."expiresAt" > v_now
  ) THEN
    RAISE EXCEPTION 'Unauthorized: caller session is invalid, expired, revoked, or not active in the clinic' USING ERRCODE = '42501';
  END IF;

  -- Verify target patient account exists in target clinic
  IF NOT EXISTS (
    SELECT 1 FROM public."PatientAccount" pa
    WHERE pa.id = target_account_id AND pa."clinicId" = target_clinic_id
  ) THEN
    RAISE EXCEPTION 'Target patient account does not exist in the specified clinic' USING ERRCODE = '23503';
  END IF;

  -- Invalidate prior unused activation tokens for this account
  DELETE FROM public."PatientVerificationToken"
  WHERE "clinicId" = target_clinic_id
    AND "patientAccountId" = target_account_id
    AND "tokenType" = 'ACTIVATION'
    AND "usedAt" IS NULL;

  -- Mint single-use invitation token
  v_token_id := gen_random_uuid();
  INSERT INTO public."PatientVerificationToken" (
    id, "clinicId", "patientAccountId", "tokenType", "tokenHash", "expiresAt", "createdAt"
  ) VALUES (
    v_token_id, target_clinic_id, target_account_id, 'ACTIVATION', target_token_hash, target_expires_at, v_now
  );

  RETURN QUERY SELECT v_token_id;
END;
$$;

-- 3. Revoke from PUBLIC and grant to discovered application runtime roles
REVOKE ALL ON FUNCTION lamssa_security.portal_create_invitation_token(uuid, uuid, text, timestamptz) FROM PUBLIC;

DO $$
DECLARE r text;
BEGIN
  FOR r IN SELECT DISTINCT grantee FROM information_schema.role_table_grants WHERE table_schema = 'public' AND table_name = 'Session' AND privilege_type = 'SELECT' AND grantee NOT IN (current_user, 'PUBLIC') LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION lamssa_security.portal_create_invitation_token(uuid, uuid, text, timestamptz) TO %I', r);
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE ON public."PatientSession", public."PatientVerificationToken" FROM %I', r);
    EXECUTE format('GRANT SELECT ON public."PatientSession", public."PatientVerificationToken" TO %I', r);
  END LOOP;
END $$;

COMMIT;
