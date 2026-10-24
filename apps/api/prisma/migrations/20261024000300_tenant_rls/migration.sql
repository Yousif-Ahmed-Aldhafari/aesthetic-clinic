-- Additive security boundary. No records, old migrations or credentials are changed.
BEGIN;
CREATE SCHEMA lamssa_security;
REVOKE ALL ON SCHEMA lamssa_security FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA lamssa_security REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

CREATE FUNCTION lamssa_security.context_uuid(setting_name text) RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  RETURN NULLIF(current_setting(setting_name, true), '')::uuid;
EXCEPTION WHEN invalid_text_representation THEN RETURN NULL;
END;
$$;

-- Fixed, boolean-only policy helper. Owner SELECT policies below avoid membership
-- policy recursion. This does not authenticate caller-supplied GUCs cryptographically.
CREATE FUNCTION lamssa_security.context_allows(target_clinic uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
  SELECT COALESCE(target_clinic = lamssa_security.context_uuid('lamssa.clinic_id') AND EXISTS (
    SELECT 1 FROM public."Session" s
    JOIN public."User" u ON u.id = s."userId"
    JOIN public."ClinicMembership" m ON m."userId" = u.id AND m."clinicId" = target_clinic
    JOIN public."Clinic" c ON c.id = m."clinicId"
    WHERE s.id = lamssa_security.context_uuid('lamssa.session_id')
      AND s."userId" = lamssa_security.context_uuid('lamssa.user_id')
      AND s."selectedClinicId" = target_clinic AND s."revokedAt" IS NULL
      AND s."expiresAt" > statement_timestamp()
      AND u.status = 'ACTIVE' AND m.status = 'ACTIVE' AND c.status = 'ACTIVE'
  ), false);
$$;

-- Authentication bootstrap only: a fixed projection for ONE server-verified user.
-- Includes inactive memberships/statuses to invalidate old session fingerprints.
CREATE FUNCTION lamssa_security.identity_memberships(target_user uuid)
RETURNS TABLE (id uuid, "clinicId" uuid, role public."ClinicRole", status public."MembershipStatus",
  "clinicStatus" public."ClinicStatus", slug varchar, "displayName" varchar)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
  SELECT m.id, m."clinicId", m.role, m.status, c.status, c.slug, c."displayName"
  FROM public."ClinicMembership" m JOIN public."Clinic" c ON c.id = m."clinicId"
  WHERE m."userId" = target_user ORDER BY m.id;
$$;

-- Intentionally public lookup; no IDs, legal name, domain, users or settings.
CREATE FUNCTION lamssa_security.public_branding(target_slug text)
RETURNS TABLE (slug varchar, "displayName" varchar, "hasBranding" boolean,
  "logoUrl" varchar, "primaryColor" varchar, "secondaryColor" varchar, "accentColor" varchar)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
  SELECT c.slug, c."displayName", b."clinicId" IS NOT NULL,
    b."logoUrl", b."primaryColor", b."secondaryColor", b."accentColor"
  FROM public."Clinic" c LEFT JOIN public."ClinicBranding" b ON b."clinicId" = c.id
  WHERE c.slug = target_slug AND c.status = 'ACTIVE';
$$;

-- RLS WITH CHECK rejects changes outside the context; this trigger also forbids
-- reassignment if both clinics are otherwise authorized (including maintenance).
CREATE FUNCTION lamssa_security.reject_clinic_reassignment() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF NEW."clinicId" IS DISTINCT FROM OLD."clinicId" THEN
    RAISE EXCEPTION 'Clinic ownership is immutable' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DO $$
DECLARE table_name text; clinic_column text; owner_name text := current_user; predicate text; writable boolean;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['Clinic','ClinicBranding','ClinicDomain','ClinicMembership'] LOOP
    IF (SELECT pg_get_userbyid(relowner) <> owner_name FROM pg_class WHERE oid = format('public.%I',table_name)::regclass) THEN
      RAISE EXCEPTION 'Migration must run as the existing table owner';
    END IF;
    clinic_column := CASE WHEN table_name = 'Clinic' THEN 'id' ELSE 'clinicId' END;
    writable := table_name IN ('ClinicBranding','ClinicDomain');
    -- CASE short-circuiting is intentional: definer/maintenance reads never invoke
    -- context_allows recursively through Clinic/ClinicMembership policies.
    predicate := format('CASE WHEN current_user = %L THEN false ELSE lamssa_security.context_allows(%I) END', owner_name, clinic_column);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('CREATE POLICY maintenance_owner ON public.%I FOR ALL TO %I USING (true) WITH CHECK (true)', table_name, owner_name);
    EXECUTE format('CREATE POLICY tenant_select ON public.%I FOR SELECT USING (%s)', table_name, predicate);
    EXECUTE format('CREATE POLICY tenant_insert ON public.%I FOR INSERT WITH CHECK (%s)', table_name, CASE WHEN writable THEN predicate ELSE 'false' END);
    EXECUTE format('CREATE POLICY tenant_update ON public.%I FOR UPDATE USING (%s) WITH CHECK (%s)', table_name,
      CASE WHEN writable THEN predicate ELSE 'false' END, CASE WHEN writable THEN predicate ELSE 'false' END);
    EXECUTE format('CREATE POLICY tenant_delete ON public.%I FOR DELETE USING (%s)', table_name, CASE WHEN writable THEN predicate ELSE 'false' END);
    IF table_name <> 'Clinic' THEN
      EXECUTE format('CREATE TRIGGER immutable_clinic BEFORE UPDATE OF "clinicId" ON public.%I FOR EACH ROW EXECUTE FUNCTION lamssa_security.reject_clinic_reassignment()', table_name);
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA lamssa_security FROM PUBLIC;
REVOKE ALL ON public."Clinic",public."ClinicBranding",public."ClinicDomain",public."ClinicMembership",public."User",public."Session",public."LoginBucket" FROM PUBLIC;

-- Tighten existing grantees atomically, rather than leaving the previous broad
-- grants live until the separate idempotent grant script is run.
DO $$
DECLARE runtime_name text;
BEGIN
  FOR runtime_name IN
    SELECT DISTINCT grantee FROM information_schema.role_table_grants
    WHERE table_schema='public' AND table_name='Session' AND privilege_type='SELECT'
      AND grantee NOT IN (current_user, 'PUBLIC')
  LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=runtime_name AND (rolsuper OR rolbypassrls))
      OR pg_has_role(runtime_name, current_user, 'MEMBER') THEN
      RAISE EXCEPTION 'Unsafe runtime role; review credentials before enabling runtime access';
    END IF;
    EXECUTE format('REVOKE ALL ON public."Clinic",public."ClinicBranding",public."ClinicDomain",public."ClinicMembership",public."User",public."Session",public."LoginBucket" FROM %I', runtime_name);
    EXECUTE format('GRANT SELECT ON public."Clinic",public."ClinicMembership",public."User" TO %I', runtime_name);
    EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON public."ClinicBranding",public."ClinicDomain",public."Session",public."LoginBucket" TO %I', runtime_name);
    EXECUTE format('GRANT USAGE ON SCHEMA lamssa_security TO %I', runtime_name);
    EXECUTE format('GRANT EXECUTE ON FUNCTION lamssa_security.context_uuid(text),lamssa_security.context_allows(uuid),lamssa_security.identity_memberships(uuid),lamssa_security.public_branding(text) TO %I', runtime_name);
  END LOOP;
END;
$$;
COMMENT ON FUNCTION lamssa_security.identity_memberships(uuid) IS 'Internal identity bootstrap: fixed membership/status projection for one verified user; never expose userId input as an API lookup.';
COMMENT ON FUNCTION lamssa_security.public_branding(text) IS 'Intentionally public active-clinic branding projection only.';
COMMENT ON FUNCTION lamssa_security.context_allows(uuid) IS 'RLS defense in depth: selected live session and active membership; custom settings are not authentication.';
COMMIT;
