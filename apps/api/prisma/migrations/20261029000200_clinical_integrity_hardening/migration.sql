BEGIN;

CREATE OR REPLACE FUNCTION lamssa_security.clinical_immutable() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW."clinicId" IS DISTINCT FROM OLD."clinicId"
     OR NEW."patientId" IS DISTINCT FROM OLD."patientId" OR NEW."clinicianMembershipId" IS DISTINCT FROM OLD."clinicianMembershipId"
     OR NEW."visitId" IS DISTINCT FROM OLD."visitId" OR NEW."appointmentId" IS DISTINCT FROM OLD."appointmentId" THEN
    RAISE EXCEPTION 'Clinical encounter ownership is immutable' USING ERRCODE='42501';
  END IF;
  IF NEW.version < OLD.version
     OR (OLD.status='SIGNED' AND NEW.status NOT IN ('SIGNED','AMENDED','CLOSED'))
     OR (OLD.status='AMENDED' AND NEW.status NOT IN ('AMENDED','CLOSED'))
     OR (OLD.status='CLOSED' AND NEW.status<>'CLOSED') THEN
    RAISE EXCEPTION 'Clinical encounter state cannot move backward' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION lamssa_security.clinical_note_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW."clinicId" IS DISTINCT FROM OLD."clinicId"
     OR NEW."encounterId" IS DISTINCT FROM OLD."encounterId" OR NEW."authorMembershipId" IS DISTINCT FROM OLD."authorMembershipId"
     OR NEW."noteType" IS DISTINCT FROM OLD."noteType" THEN
    RAISE EXCEPTION 'Clinical note identity is immutable' USING ERRCODE='42501';
  END IF;
  IF NEW.version < OLD.version
     OR (OLD.status='SIGNED' AND NEW.status NOT IN ('SIGNED','AMENDED'))
     OR (OLD.status='AMENDED' AND NEW.status<>'AMENDED')
     OR (OLD.status IN ('SIGNED','AMENDED') AND (NEW.content IS DISTINCT FROM OLD.content OR NEW."signedAt" IS DISTINCT FROM OLD."signedAt")) THEN
    RAISE EXCEPTION 'Signed clinical content and state are immutable' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END; $$;

CREATE FUNCTION lamssa_security.medical_history_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
  IF NEW."clinicId" IS DISTINCT FROM OLD."clinicId" OR NEW."patientId" IS DISTINCT FROM OLD."patientId" OR NEW.version < OLD.version THEN
    RAISE EXCEPTION 'Medical history ownership and version are immutable' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER medical_history_guard BEFORE UPDATE ON public."MedicalHistory"
FOR EACH ROW EXECUTE FUNCTION lamssa_security.medical_history_guard();

REVOKE ALL ON FUNCTION lamssa_security.medical_history_guard() FROM PUBLIC;

COMMIT;
