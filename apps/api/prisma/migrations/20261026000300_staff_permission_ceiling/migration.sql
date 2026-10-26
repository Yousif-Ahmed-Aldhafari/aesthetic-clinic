BEGIN;
-- Reception includes invoices/payment recording, which CLINIC_ADMIN does not
-- possess. Admins may remove that access, but may not newly grant/reactivate it.
-- Kept additive: never rewrite the already-applied identity migration.
CREATE FUNCTION lamssa_security.membership_privilege_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE owner_name text;
BEGIN
 SELECT pg_get_userbyid(relowner) INTO owner_name FROM pg_class WHERE oid='public."Clinic"'::regclass;
 IF session_user=owner_name THEN RETURN NEW; END IF;
 IF NEW.role='RECEPTIONIST' AND NEW.status='ACTIVE' AND (OLD.role<>NEW.role OR OLD.status<>'ACTIVE') AND EXISTS (
   SELECT 1 FROM public."ClinicMembership" actor WHERE actor."clinicId"=NEW."clinicId"
   AND actor."userId"=lamssa_security.context_uuid('lamssa.user_id') AND actor.status='ACTIVE' AND actor.role='CLINIC_ADMIN'
 ) THEN RAISE EXCEPTION 'Cannot grant permissions beyond actor' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER identity_privilege_guard BEFORE UPDATE ON public."ClinicMembership" FOR EACH ROW EXECUTE FUNCTION lamssa_security.membership_privilege_guard();
REVOKE ALL ON FUNCTION lamssa_security.membership_privilege_guard() FROM PUBLIC;
COMMIT;
