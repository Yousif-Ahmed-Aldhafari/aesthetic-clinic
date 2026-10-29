-- Clinic MFA Policy Security Definer Helper for Authentication/Identity Boundary
CREATE FUNCTION lamssa_security.clinic_mfa_policy(target_clinic uuid)
RETURNS public."ClinicMfaPolicy"
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
  SELECT "mfaPolicy" FROM public."Clinic" WHERE id = target_clinic AND status = 'ACTIVE';
$$;

REVOKE ALL ON FUNCTION lamssa_security.clinic_mfa_policy(uuid) FROM PUBLIC;

DO $$
DECLARE
  runtime_name text;
BEGIN
  FOR runtime_name IN
    SELECT DISTINCT grantee FROM information_schema.role_table_grants
    WHERE table_schema='public' AND table_name='Session' AND privilege_type='SELECT'
      AND grantee NOT IN (current_user, 'PUBLIC')
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION lamssa_security.clinic_mfa_policy(uuid) TO %I', runtime_name);
  END LOOP;
END;
$$;
