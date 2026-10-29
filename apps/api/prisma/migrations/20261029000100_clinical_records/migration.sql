BEGIN;

ALTER TYPE "AuditCategory" ADD VALUE IF NOT EXISTS 'CLINICAL';
CREATE TYPE "ClinicalEncounterStatus" AS ENUM ('DRAFT','IN_PROGRESS','SIGNED','AMENDED','CLOSED');
CREATE TYPE "ClinicalNoteStatus" AS ENUM ('DRAFT','SIGNED','AMENDED');
CREATE TYPE "ClinicalNoteType" AS ENUM ('CONSULTATION');

CREATE TABLE public."ClinicalEncounter" (
  id uuid PRIMARY KEY, "clinicId" uuid NOT NULL, "patientId" uuid NOT NULL,
  "clinicianMembershipId" uuid NOT NULL, "visitId" uuid, "appointmentId" uuid,
  status "ClinicalEncounterStatus" NOT NULL DEFAULT 'DRAFT', version integer NOT NULL DEFAULT 1,
  "createdAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamptz(3) NOT NULL
);
CREATE TABLE public."ClinicalNote" (
  id uuid PRIMARY KEY, "clinicId" uuid NOT NULL, "encounterId" uuid NOT NULL,
  "authorMembershipId" uuid NOT NULL, "noteType" "ClinicalNoteType" NOT NULL DEFAULT 'CONSULTATION',
  content jsonb NOT NULL, status "ClinicalNoteStatus" NOT NULL DEFAULT 'DRAFT', version integer NOT NULL DEFAULT 1,
  "signedAt" timestamptz(3), "createdAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamptz(3) NOT NULL
);
CREATE TABLE public."ClinicalNoteAmendment" (
  id uuid PRIMARY KEY, "clinicId" uuid NOT NULL, "noteId" uuid NOT NULL,
  "authorMembershipId" uuid NOT NULL, reason varchar(1000) NOT NULL, content jsonb NOT NULL,
  "createdAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE public."MedicalHistory" (
  "clinicId" uuid NOT NULL, "patientId" uuid NOT NULL, content jsonb NOT NULL,
  version integer NOT NULL DEFAULT 1, "reviewedByMembershipId" uuid, "reviewedAt" timestamptz(3),
  "createdAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" timestamptz(3) NOT NULL,
  CONSTRAINT "MedicalHistory_pkey" PRIMARY KEY ("clinicId","patientId")
);

CREATE UNIQUE INDEX "ClinicalEncounter_clinicId_id_key" ON public."ClinicalEncounter"("clinicId",id);
CREATE UNIQUE INDEX "ClinicalEncounter_clinicId_visitId_key" ON public."ClinicalEncounter"("clinicId","visitId");
CREATE INDEX "ClinicalEncounter_clinicId_patientId_createdAt_id_idx" ON public."ClinicalEncounter"("clinicId","patientId","createdAt",id);
CREATE INDEX "ClinicalEncounter_clinicId_clinicianMembershipId_status_createdAt_idx" ON public."ClinicalEncounter"("clinicId","clinicianMembershipId",status,"createdAt");
CREATE UNIQUE INDEX "ClinicalNote_clinicId_id_key" ON public."ClinicalNote"("clinicId",id);
CREATE INDEX "ClinicalNote_clinicId_encounterId_createdAt_idx" ON public."ClinicalNote"("clinicId","encounterId","createdAt");
CREATE INDEX "ClinicalNote_clinicId_authorMembershipId_status_idx" ON public."ClinicalNote"("clinicId","authorMembershipId",status);
CREATE UNIQUE INDEX "ClinicalNoteAmendment_clinicId_id_key" ON public."ClinicalNoteAmendment"("clinicId",id);
CREATE INDEX "ClinicalNoteAmendment_clinicId_noteId_createdAt_id_idx" ON public."ClinicalNoteAmendment"("clinicId","noteId","createdAt",id);
CREATE INDEX "MedicalHistory_clinicId_reviewedAt_idx" ON public."MedicalHistory"("clinicId","reviewedAt");

ALTER TABLE public."ClinicalEncounter" ADD CONSTRAINT "ClinicalEncounter_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES public."Clinic"(id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."ClinicalEncounter" ADD CONSTRAINT "ClinicalEncounter_clinicId_patientId_fkey" FOREIGN KEY ("clinicId","patientId") REFERENCES public."Patient"("clinicId",id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."ClinicalEncounter" ADD CONSTRAINT "ClinicalEncounter_clinicId_clinicianMembershipId_fkey" FOREIGN KEY ("clinicId","clinicianMembershipId") REFERENCES public."ClinicMembership"("clinicId",id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."ClinicalEncounter" ADD CONSTRAINT "ClinicalEncounter_clinicId_visitId_fkey" FOREIGN KEY ("clinicId","visitId") REFERENCES public."Visit"("clinicId",id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."ClinicalEncounter" ADD CONSTRAINT "ClinicalEncounter_clinicId_appointmentId_fkey" FOREIGN KEY ("clinicId","appointmentId") REFERENCES public."Appointment"("clinicId",id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."ClinicalNote" ADD CONSTRAINT "ClinicalNote_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES public."Clinic"(id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."ClinicalNote" ADD CONSTRAINT "ClinicalNote_clinicId_encounterId_fkey" FOREIGN KEY ("clinicId","encounterId") REFERENCES public."ClinicalEncounter"("clinicId",id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."ClinicalNote" ADD CONSTRAINT "ClinicalNote_clinicId_authorMembershipId_fkey" FOREIGN KEY ("clinicId","authorMembershipId") REFERENCES public."ClinicMembership"("clinicId",id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."ClinicalNoteAmendment" ADD CONSTRAINT "ClinicalNoteAmendment_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES public."Clinic"(id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."ClinicalNoteAmendment" ADD CONSTRAINT "ClinicalNoteAmendment_clinicId_noteId_fkey" FOREIGN KEY ("clinicId","noteId") REFERENCES public."ClinicalNote"("clinicId",id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."ClinicalNoteAmendment" ADD CONSTRAINT "ClinicalNoteAmendment_clinicId_authorMembershipId_fkey" FOREIGN KEY ("clinicId","authorMembershipId") REFERENCES public."ClinicMembership"("clinicId",id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."MedicalHistory" ADD CONSTRAINT "MedicalHistory_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES public."Clinic"(id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."MedicalHistory" ADD CONSTRAINT "MedicalHistory_clinicId_patientId_fkey" FOREIGN KEY ("clinicId","patientId") REFERENCES public."Patient"("clinicId",id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."MedicalHistory" ADD CONSTRAINT "MedicalHistory_clinicId_reviewedByMembershipId_fkey" FOREIGN KEY ("clinicId","reviewedByMembershipId") REFERENCES public."ClinicMembership"("clinicId",id) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE public."ClinicalEncounter" ADD CONSTRAINT clinical_encounter_values CHECK (version > 0);
ALTER TABLE public."ClinicalNote" ADD CONSTRAINT clinical_note_values CHECK (version > 0 AND jsonb_typeof(content)='object' AND octet_length(content::text) <= 65536);
ALTER TABLE public."ClinicalNoteAmendment" ADD CONSTRAINT clinical_amendment_values CHECK (length(btrim(reason)) BETWEEN 3 AND 1000 AND jsonb_typeof(content)='object' AND octet_length(content::text) <= 65536);
ALTER TABLE public."MedicalHistory" ADD CONSTRAINT medical_history_values CHECK (version > 0 AND jsonb_typeof(content)='object' AND octet_length(content::text) <= 65536);

CREATE FUNCTION lamssa_security.clinical_immutable() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW."clinicId" IS DISTINCT FROM OLD."clinicId"
     OR NEW."patientId" IS DISTINCT FROM OLD."patientId" OR NEW."clinicianMembershipId" IS DISTINCT FROM OLD."clinicianMembershipId"
     OR NEW."visitId" IS DISTINCT FROM OLD."visitId" OR NEW."appointmentId" IS DISTINCT FROM OLD."appointmentId" THEN
    RAISE EXCEPTION 'Clinical encounter ownership is immutable' USING ERRCODE='42501';
  END IF; RETURN NEW;
END; $$;
CREATE TRIGGER clinical_encounter_immutable BEFORE UPDATE ON public."ClinicalEncounter" FOR EACH ROW EXECUTE FUNCTION lamssa_security.clinical_immutable();

CREATE FUNCTION lamssa_security.clinical_note_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW."clinicId" IS DISTINCT FROM OLD."clinicId" OR NEW."encounterId" IS DISTINCT FROM OLD."encounterId" OR NEW."authorMembershipId" IS DISTINCT FROM OLD."authorMembershipId" THEN
    RAISE EXCEPTION 'Clinical note identity is immutable' USING ERRCODE='42501';
  END IF;
  IF OLD.status IN ('SIGNED','AMENDED') AND (NEW.content IS DISTINCT FROM OLD.content OR NEW."signedAt" IS DISTINCT FROM OLD."signedAt") THEN
    RAISE EXCEPTION 'Signed clinical content is immutable' USING ERRCODE='42501';
  END IF; RETURN NEW;
END; $$;
CREATE TRIGGER clinical_note_guard BEFORE UPDATE ON public."ClinicalNote" FOR EACH ROW EXECUTE FUNCTION lamssa_security.clinical_note_guard();
CREATE TRIGGER clinical_amendment_immutable BEFORE UPDATE OR DELETE ON public."ClinicalNoteAmendment" FOR EACH ROW EXECUTE FUNCTION lamssa_security.reject_audit_mutation();

DO $$ DECLARE t text; owner_name text:=current_user; pred text; BEGIN
  FOREACH t IN ARRAY ARRAY['ClinicalEncounter','ClinicalNote','ClinicalNoteAmendment','MedicalHistory'] LOOP
    pred:=format('CASE WHEN current_user=%L THEN false ELSE lamssa_security.context_allows("clinicId") END',owner_name);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',t);
    EXECUTE format('CREATE POLICY maintenance_owner ON public.%I FOR ALL TO %I USING (true) WITH CHECK (true)',t,owner_name);
    EXECUTE format('CREATE POLICY tenant_select ON public.%I FOR SELECT USING (%s)',t,pred);
    EXECUTE format('CREATE POLICY tenant_insert ON public.%I FOR INSERT WITH CHECK (%s)',t,pred);
    EXECUTE format('CREATE POLICY tenant_update ON public.%I FOR UPDATE USING (%s) WITH CHECK (%s)',t,pred,pred);
    EXECUTE format('CREATE POLICY tenant_delete ON public.%I FOR DELETE USING (false)',t);
  END LOOP;
END $$;
REVOKE ALL ON public."ClinicalEncounter",public."ClinicalNote",public."ClinicalNoteAmendment",public."MedicalHistory" FROM PUBLIC;
REVOKE ALL ON FUNCTION lamssa_security.clinical_immutable(),lamssa_security.clinical_note_guard() FROM PUBLIC;
DO $$ DECLARE r text; BEGIN
  FOR r IN SELECT DISTINCT grantee FROM information_schema.role_table_grants WHERE table_schema='public' AND table_name='Session' AND privilege_type='SELECT' AND grantee NOT IN(current_user,'PUBLIC') LOOP
    IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r AND (rolsuper OR rolbypassrls)) OR pg_has_role(r,current_user,'MEMBER') THEN RAISE EXCEPTION 'Unsafe runtime role'; END IF;
    EXECUTE format('GRANT SELECT,INSERT,UPDATE ON public."ClinicalEncounter",public."ClinicalNote",public."MedicalHistory" TO %I',r);
    EXECUTE format('GRANT SELECT,INSERT ON public."ClinicalNoteAmendment" TO %I',r);
  END LOOP;
END $$;
COMMENT ON TABLE public."ClinicalNote" IS 'Sensitive clinical content; signed rows are immutable and corrections are append-only amendments.';
COMMENT ON TABLE public."MedicalHistory" IS 'Sensitive patient clinical history; versioned, tenant-scoped and excluded from administrative exports.';
COMMIT;
