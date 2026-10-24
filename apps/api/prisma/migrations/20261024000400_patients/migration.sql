-- Additive administrative patient storage. No legacy data import or deletion.
BEGIN;
-- CreateEnum
CREATE TYPE "PatientStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "PatientGender" AS ENUM ('FEMALE', 'MALE', 'OTHER', 'UNDISCLOSED');

-- CreateTable
CREATE TABLE "Patient" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "patientNumber" VARCHAR(20) NOT NULL,
    "fullName" VARCHAR(150) NOT NULL,
    "searchName" VARCHAR(150) NOT NULL,
    "phone" VARCHAR(16),
    "email" VARCHAR(254),
    "dateOfBirth" DATE,
    "gender" "PatientGender",
    "status" "PatientStatus" NOT NULL DEFAULT 'ACTIVE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Patient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientCounter" (
    "clinicId" UUID NOT NULL,
    "lastNumber" INTEGER NOT NULL,

    CONSTRAINT "PatientCounter_pkey" PRIMARY KEY ("clinicId")
);

-- CreateIndex
CREATE INDEX "Patient_clinicId_createdAt_id_idx" ON "Patient"("clinicId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "Patient_clinicId_status_createdAt_id_idx" ON "Patient"("clinicId", "status", "createdAt", "id");

-- CreateIndex
CREATE INDEX "Patient_clinicId_searchName_idx" ON "Patient"("clinicId", "searchName");

-- CreateIndex
CREATE INDEX "Patient_clinicId_phone_idx" ON "Patient"("clinicId", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "Patient_clinicId_id_key" ON "Patient"("clinicId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Patient_clinicId_patientNumber_key" ON "Patient"("clinicId", "patientNumber");

-- AddForeignKey
ALTER TABLE "Patient" ADD CONSTRAINT "Patient_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "PatientCounter" ADD CONSTRAINT "PatientCounter_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE public."Patient" ADD CONSTRAINT patient_values CHECK (
  length(btrim("fullName")) >= 2 AND length(btrim("searchName")) > 0
  AND "patientNumber" ~ '^P-[0-9]{6,10}$' AND version > 0
  AND (phone IS NULL OR phone ~ '^\+?[0-9]{7,15}$')
);
ALTER TABLE public."PatientCounter" ADD CONSTRAINT positive_patient_counter CHECK ("lastNumber" > 0);
-- Prefix-search operator classes also support deterministic literal Arabic search.
CREATE INDEX patient_name_prefix ON public."Patient" ("clinicId", "searchName" text_pattern_ops);
CREATE INDEX patient_phone_prefix ON public."Patient" ("clinicId", phone text_pattern_ops);
CREATE INDEX patient_number_prefix ON public."Patient" ("clinicId", "patientNumber" text_pattern_ops);

CREATE FUNCTION lamssa_security.patient_identity_immutable() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW."clinicId" IS DISTINCT FROM OLD."clinicId"
     OR NEW."patientNumber" IS DISTINCT FROM OLD."patientNumber" THEN
    RAISE EXCEPTION 'Patient identity is immutable' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER immutable_patient_identity BEFORE UPDATE ON public."Patient"
  FOR EACH ROW EXECUTE FUNCTION lamssa_security.patient_identity_immutable();

CREATE FUNCTION lamssa_security.patient_counter_advance() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF NEW."clinicId" IS DISTINCT FROM OLD."clinicId" OR NEW."lastNumber"::bigint <> OLD."lastNumber"::bigint + 1 THEN
    RAISE EXCEPTION 'Patient counter may only advance by one' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER monotonic_patient_counter BEFORE UPDATE ON public."PatientCounter"
  FOR EACH ROW EXECUTE FUNCTION lamssa_security.patient_counter_advance();
REVOKE ALL ON FUNCTION lamssa_security.patient_identity_immutable(),lamssa_security.patient_counter_advance() FROM PUBLIC;

DO $$
DECLARE table_name text; owner_name text := current_user; predicate text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['Patient','PatientCounter'] LOOP
    predicate := format('CASE WHEN current_user = %L THEN false ELSE lamssa_security.context_allows("clinicId") END', owner_name);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('CREATE POLICY maintenance_owner ON public.%I FOR ALL TO %I USING (true) WITH CHECK (true)', table_name, owner_name);
    EXECUTE format('CREATE POLICY tenant_select ON public.%I FOR SELECT USING (%s)', table_name, predicate);
    EXECUTE format('CREATE POLICY tenant_insert ON public.%I FOR INSERT WITH CHECK (%s%s)', table_name, predicate,
      CASE WHEN table_name = 'PatientCounter' THEN ' AND "lastNumber" = 1' ELSE '' END);
    EXECUTE format('CREATE POLICY tenant_update ON public.%I FOR UPDATE USING (%s) WITH CHECK (%s)', table_name, predicate, predicate);
    -- No hard deletion, including if a future grant accidentally permits DELETE.
    EXECUTE format('CREATE POLICY tenant_delete ON public.%I FOR DELETE USING (false)', table_name);
  END LOOP;
END;
$$;
REVOKE ALL ON public."Patient",public."PatientCounter" FROM PUBLIC;
DO $$
DECLARE runtime_name text;
BEGIN
  FOR runtime_name IN SELECT DISTINCT grantee FROM information_schema.role_table_grants
    WHERE table_schema='public' AND table_name='Session' AND privilege_type='SELECT' AND grantee NOT IN (current_user,'PUBLIC')
  LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=runtime_name AND (rolsuper OR rolbypassrls))
       OR pg_has_role(runtime_name,current_user,'MEMBER') THEN
      RAISE EXCEPTION 'Unsafe runtime role';
    END IF;
    EXECUTE format('REVOKE ALL ON public."Patient",public."PatientCounter" FROM %I',runtime_name);
    EXECUTE format('GRANT SELECT,INSERT,UPDATE ON public."Patient",public."PatientCounter" TO %I',runtime_name);
  END LOOP;
END;
$$;
COMMENT ON TABLE public."Patient" IS 'Administrative identity only; all runtime access requires authorized tenant transaction. No clinical notes or media.';
COMMENT ON TABLE public."PatientCounter" IS 'Clinic-local transactional number allocation; runtime cannot delete or rewind counters.';
COMMIT;
