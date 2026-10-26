BEGIN;
-- Retain current and previous reservations. No identity value is changed.
CREATE TABLE public."ClinicSlugReservation" (
  slug varchar(63) PRIMARY KEY,
  "clinicId" uuid NOT NULL REFERENCES public."Clinic"(id) ON DELETE CASCADE ON UPDATE RESTRICT,
  "createdAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "ClinicSlugReservation_clinicId_createdAt_idx" ON public."ClinicSlugReservation"("clinicId","createdAt");
INSERT INTO public."ClinicSlugReservation"(slug,"clinicId") SELECT slug,id FROM public."Clinic";
ALTER TABLE public."ClinicSlugReservation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ClinicSlugReservation" FORCE ROW LEVEL SECURITY;
DO $$ DECLARE owner_name text:=current_user; BEGIN
 EXECUTE format('CREATE POLICY maintenance_owner ON public."ClinicSlugReservation" FOR ALL TO %I USING(true) WITH CHECK(true)',owner_name);
 EXECUTE format('CREATE POLICY tenant_select ON public."ClinicSlugReservation" FOR SELECT USING(CASE WHEN current_user=%L THEN false ELSE lamssa_security.administration_allows("clinicId",false) END)',owner_name);
END; $$;
CREATE POLICY tenant_insert ON public."ClinicSlugReservation" FOR INSERT WITH CHECK(false);
CREATE POLICY tenant_update ON public."ClinicSlugReservation" FOR UPDATE USING(false) WITH CHECK(false);
CREATE POLICY tenant_delete ON public."ClinicSlugReservation" FOR DELETE USING(false);
CREATE TRIGGER immutable_clinic BEFORE UPDATE OF "clinicId" ON public."ClinicSlugReservation" FOR EACH ROW EXECUTE FUNCTION lamssa_security.reject_clinic_reassignment();
CREATE FUNCTION lamssa_security.reserve_clinic_slug() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE holder uuid;
BEGIN
 SELECT "clinicId" INTO holder FROM public."ClinicSlugReservation" WHERE slug=NEW.slug;
 IF holder IS NOT NULL AND holder<>NEW.id THEN RAISE EXCEPTION 'Reservation unavailable' USING ERRCODE='23505'; END IF;
 IF holder IS NULL THEN
  IF (SELECT count(*) FROM public."ClinicSlugReservation" WHERE "clinicId"=NEW.id)>=20 THEN RAISE EXCEPTION 'Reservation limit' USING ERRCODE='23514'; END IF;
  INSERT INTO public."ClinicSlugReservation"(slug,"clinicId") VALUES(NEW.slug,NEW.id);
 END IF;
 RETURN NULL;
END;
$$;
CREATE TRIGGER identity_slug_reservation AFTER INSERT OR UPDATE OF slug ON public."Clinic" FOR EACH ROW EXECUTE FUNCTION lamssa_security.reserve_clinic_slug();
REVOKE ALL ON FUNCTION lamssa_security.reserve_clinic_slug() FROM PUBLIC;
REVOKE ALL ON public."ClinicSlugReservation" FROM PUBLIC;
DO $$ DECLARE runtime_name text; BEGIN
 FOR runtime_name IN SELECT DISTINCT grantee FROM information_schema.role_table_grants WHERE table_schema='public' AND table_name='Session' AND privilege_type='SELECT' AND grantee NOT IN(current_user,'PUBLIC') LOOP
  EXECUTE format('GRANT SELECT ON public."ClinicSlugReservation" TO %I',runtime_name);
 END LOOP;
END; $$;
COMMIT;
