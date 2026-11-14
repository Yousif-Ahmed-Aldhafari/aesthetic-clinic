BEGIN;

-- CreateEnum
CREATE TYPE "ClinicalFormDefinitionStatus" AS ENUM ('ACTIVE', 'RETIRED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ClinicalFormVersionStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'RETIRED');

-- CreateEnum
CREATE TYPE "ClinicalFormCategory" AS ENUM ('CONSULTATION', 'ASSESSMENT', 'INTAKE', 'FOLLOW_UP', 'OTHER');

-- CreateEnum
CREATE TYPE "ClinicalFormResponseStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'FINALIZED', 'AMENDED', 'ENTERED_IN_ERROR');
-- CreateTable
CREATE TABLE "ClinicalFormDefinition" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clinicId" UUID NOT NULL,
    "stableKey" VARCHAR(100) NOT NULL,
    "nameAr" VARCHAR(200) NOT NULL,
    "nameEn" VARCHAR(200),
    "category" "ClinicalFormCategory" NOT NULL,
    "specialtyId" UUID NOT NULL,
    "serviceId" UUID,
    "status" "ClinicalFormDefinitionStatus" NOT NULL DEFAULT 'ACTIVE',
    "currentVersion" INTEGER NOT NULL DEFAULT 1,
    "createdByMembershipId" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ClinicalFormDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClinicalFormDefinitionVersion" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clinicId" UUID NOT NULL,
    "definitionId" UUID NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "status" "ClinicalFormVersionStatus" NOT NULL DEFAULT 'DRAFT',
    "validationSchema" JSONB NOT NULL,
    "presentationSchema" JSONB NOT NULL,
    "compatibilityMetadata" JSONB,
    "schemaDialect" VARCHAR(100) NOT NULL DEFAULT 'https://json-schema.org/draft/2020-12/schema',
    "schemaDigest" CHAR(64) NOT NULL,
    "authorMembershipId" UUID NOT NULL,
    "publishedByMembershipId" UUID,
    "publishedAt" TIMESTAMPTZ(3),
    "retiredAt" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ClinicalFormDefinitionVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClinicalFormResponse" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clinicId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "encounterId" UUID NOT NULL,
    "formDefinitionId" UUID NOT NULL,
    "formVersionId" UUID NOT NULL,
    "specialtyId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "authorMembershipId" UUID NOT NULL,
    "finalizedByMembershipId" UUID,
    "status" "ClinicalFormResponseStatus" NOT NULL DEFAULT 'DRAFT',
    "responseData" JSONB NOT NULL,
    "contentDigest" CHAR(64) NOT NULL,
    "submittedAt" TIMESTAMPTZ(3),
    "finalizedAt" TIMESTAMPTZ(3),
    "enteredInErrorReason" VARCHAR(1000),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ClinicalFormResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClinicalFormResponseAmendment" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clinicId" UUID NOT NULL,
    "responseId" UUID NOT NULL,
    "authorMembershipId" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "reason" VARCHAR(1000) NOT NULL,
    "previousDigest" CHAR(64) NOT NULL,
    "amendedData" JSONB NOT NULL,
    "contentDigest" CHAR(64) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClinicalFormResponseAmendment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClinicalFormDefinition_clinicId_specialtyId_status_idx" ON "ClinicalFormDefinition"("clinicId", "specialtyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ClinicalFormDefinition_clinicId_id_key" ON "ClinicalFormDefinition"("clinicId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ClinicalFormDefinition_clinicId_stableKey_key" ON "ClinicalFormDefinition"("clinicId", "stableKey");

-- CreateIndex
CREATE INDEX "ClinicalFormDefinitionVersion_clinicId_definitionId_status__idx" ON "ClinicalFormDefinitionVersion"("clinicId", "definitionId", "status", "versionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "ClinicalFormDefinitionVersion_clinicId_id_key" ON "ClinicalFormDefinitionVersion"("clinicId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ClinicalFormDefinitionVersion_clinicId_definitionId_version_key" ON "ClinicalFormDefinitionVersion"("clinicId", "definitionId", "versionNumber");

-- CreateIndex
CREATE INDEX "ClinicalFormResponse_clinicId_patientId_encounterId_created_idx" ON "ClinicalFormResponse"("clinicId", "patientId", "encounterId", "createdAt");

-- CreateIndex
CREATE INDEX "ClinicalFormResponse_clinicId_authorMembershipId_status_upd_idx" ON "ClinicalFormResponse"("clinicId", "authorMembershipId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "ClinicalFormResponse_clinicId_formVersionId_idx" ON "ClinicalFormResponse"("clinicId", "formVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "ClinicalFormResponse_clinicId_id_key" ON "ClinicalFormResponse"("clinicId", "id");

-- CreateIndex
CREATE INDEX "ClinicalFormResponseAmendment_clinicId_responseId_createdAt_idx" ON "ClinicalFormResponseAmendment"("clinicId", "responseId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ClinicalFormResponseAmendment_clinicId_id_key" ON "ClinicalFormResponseAmendment"("clinicId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ClinicalFormResponseAmendment_clinicId_responseId_sequence_key" ON "ClinicalFormResponseAmendment"("clinicId", "responseId", "sequence");
ALTER TABLE "ClinicalFormDefinition" ADD CONSTRAINT "ClinicalFormDefinition_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ClinicalFormDefinition" ADD CONSTRAINT "ClinicalFormDefinition_specialtyId_fkey" FOREIGN KEY ("specialtyId") REFERENCES "MedicalSpecialty"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ClinicalFormDefinition" ADD CONSTRAINT "ClinicalFormDefinition_clinicId_serviceId_fkey" FOREIGN KEY ("clinicId", "serviceId") REFERENCES "GeneralClinicalService"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ClinicalFormDefinition" ADD CONSTRAINT "ClinicalFormDefinition_clinicId_createdByMembershipId_fkey" FOREIGN KEY ("clinicId", "createdByMembershipId") REFERENCES "ClinicMembership"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ClinicalFormDefinitionVersion" ADD CONSTRAINT "ClinicalFormDefinitionVersion_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ClinicalFormDefinitionVersion" ADD CONSTRAINT "ClinicalFormDefinitionVersion_clinicId_definitionId_fkey" FOREIGN KEY ("clinicId", "definitionId") REFERENCES "ClinicalFormDefinition"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ClinicalFormDefinitionVersion" ADD CONSTRAINT "ClinicalFormDefinitionVersion_clinicId_authorMembershipId_fkey" FOREIGN KEY ("clinicId", "authorMembershipId") REFERENCES "ClinicMembership"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ClinicalFormDefinitionVersion" ADD CONSTRAINT "ClinicalFormDefinitionVersion_clinicId_publishedByMembersh_fkey" FOREIGN KEY ("clinicId", "publishedByMembershipId") REFERENCES "ClinicMembership"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ClinicalFormResponse" ADD CONSTRAINT "ClinicalFormResponse_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ClinicalFormResponse" ADD CONSTRAINT "ClinicalFormResponse_clinicId_patientId_fkey" FOREIGN KEY ("clinicId", "patientId") REFERENCES "Patient"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ClinicalFormResponse" ADD CONSTRAINT "ClinicalFormResponse_clinicId_encounterId_fkey" FOREIGN KEY ("clinicId", "encounterId") REFERENCES "ClinicalEncounter"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ClinicalFormResponse" ADD CONSTRAINT "ClinicalFormResponse_clinicId_formDefinitionId_fkey" FOREIGN KEY ("clinicId", "formDefinitionId") REFERENCES "ClinicalFormDefinition"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ClinicalFormResponse" ADD CONSTRAINT "ClinicalFormResponse_clinicId_formVersionId_fkey" FOREIGN KEY ("clinicId", "formVersionId") REFERENCES "ClinicalFormDefinitionVersion"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ClinicalFormResponse" ADD CONSTRAINT "ClinicalFormResponse_specialtyId_fkey" FOREIGN KEY ("specialtyId") REFERENCES "MedicalSpecialty"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ClinicalFormResponse" ADD CONSTRAINT "ClinicalFormResponse_clinicId_branchId_fkey" FOREIGN KEY ("clinicId", "branchId") REFERENCES "ClinicBranch"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ClinicalFormResponse" ADD CONSTRAINT "ClinicalFormResponse_clinicId_authorMembershipId_fkey" FOREIGN KEY ("clinicId", "authorMembershipId") REFERENCES "ClinicMembership"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ClinicalFormResponse" ADD CONSTRAINT "ClinicalFormResponse_clinicId_finalizedByMembershipId_fkey" FOREIGN KEY ("clinicId", "finalizedByMembershipId") REFERENCES "ClinicMembership"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ClinicalFormResponseAmendment" ADD CONSTRAINT "ClinicalFormResponseAmendment_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ClinicalFormResponseAmendment" ADD CONSTRAINT "ClinicalFormResponseAmendment_clinicId_responseId_fkey" FOREIGN KEY ("clinicId", "responseId") REFERENCES "ClinicalFormResponse"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ClinicalFormResponseAmendment" ADD CONSTRAINT "ClinicalFormResponseAmendment_clinicId_authorMembershipId_fkey" FOREIGN KEY ("clinicId", "authorMembershipId") REFERENCES "ClinicMembership"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;


ALTER TABLE public."ClinicalFormDefinition" ADD CONSTRAINT clinical_form_definition_values CHECK (
  version > 0 AND "currentVersion" > 0 AND "stableKey" ~ '^[a-z][a-z0-9_-]{2,99}$' AND length(btrim("nameAr")) BETWEEN 2 AND 200
);
ALTER TABLE public."ClinicalFormDefinitionVersion" ADD CONSTRAINT clinical_form_version_values CHECK (
  version > 0 AND "versionNumber" > 0
  AND "schemaDialect" = 'https://json-schema.org/draft/2020-12/schema'
  AND jsonb_typeof("validationSchema")='object' AND octet_length("validationSchema"::text) <= 65536
  AND jsonb_typeof("presentationSchema")='object' AND octet_length("presentationSchema"::text) <= 32768
  AND ("compatibilityMetadata" IS NULL OR (jsonb_typeof("compatibilityMetadata")='object' AND octet_length("compatibilityMetadata"::text) <= 8192))
  AND ((status='DRAFT' AND "publishedAt" IS NULL AND "publishedByMembershipId" IS NULL AND "retiredAt" IS NULL)
    OR (status='PUBLISHED' AND "publishedAt" IS NOT NULL AND "publishedByMembershipId" IS NOT NULL AND "retiredAt" IS NULL)
    OR (status='RETIRED' AND "publishedAt" IS NOT NULL AND "publishedByMembershipId" IS NOT NULL AND "retiredAt" IS NOT NULL))
);
ALTER TABLE public."ClinicalFormResponse" ADD CONSTRAINT clinical_form_response_values CHECK (
  version > 0 AND jsonb_typeof("responseData")='object' AND octet_length("responseData"::text) <= 262144
  AND ((status='DRAFT' AND "submittedAt" IS NULL AND "finalizedAt" IS NULL AND "finalizedByMembershipId" IS NULL)
    OR (status='SUBMITTED' AND "submittedAt" IS NOT NULL AND "finalizedAt" IS NULL AND "finalizedByMembershipId" IS NULL)
    OR (status IN ('FINALIZED','AMENDED') AND "submittedAt" IS NOT NULL AND "finalizedAt" IS NOT NULL AND "finalizedByMembershipId" IS NOT NULL)
    OR (status='ENTERED_IN_ERROR' AND "enteredInErrorReason" IS NOT NULL))
);
ALTER TABLE public."ClinicalFormResponseAmendment" ADD CONSTRAINT clinical_form_amendment_values CHECK (
  sequence > 0 AND length(btrim(reason)) BETWEEN 3 AND 1000 AND jsonb_typeof("amendedData")='object' AND octet_length("amendedData"::text) <= 262144
);

CREATE FUNCTION lamssa_security.clinical_form_definition_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Clinical form definitions cannot be deleted' USING ERRCODE='42501'; END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW."clinicId" IS DISTINCT FROM OLD."clinicId" OR NEW."stableKey" IS DISTINCT FROM OLD."stableKey" OR NEW."specialtyId" IS DISTINCT FROM OLD."specialtyId" OR NEW."createdByMembershipId" IS DISTINCT FROM OLD."createdByMembershipId" OR NEW."currentVersion" < OLD."currentVersion" OR NEW.version < OLD.version THEN RAISE EXCEPTION 'Clinical form definition identity is immutable' USING ERRCODE='42501'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER clinical_form_definition_guard BEFORE UPDATE OR DELETE ON public."ClinicalFormDefinition" FOR EACH ROW EXECUTE FUNCTION lamssa_security.clinical_form_definition_guard();

CREATE FUNCTION lamssa_security.clinical_form_version_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Clinical form versions cannot be deleted' USING ERRCODE='42501'; END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW."clinicId" IS DISTINCT FROM OLD."clinicId" OR NEW."definitionId" IS DISTINCT FROM OLD."definitionId" OR NEW."versionNumber" IS DISTINCT FROM OLD."versionNumber" OR NEW."authorMembershipId" IS DISTINCT FROM OLD."authorMembershipId" OR NEW.version < OLD.version THEN RAISE EXCEPTION 'Clinical form version identity is immutable' USING ERRCODE='42501'; END IF;
  IF OLD.status IN ('PUBLISHED','RETIRED') AND (NEW."validationSchema" IS DISTINCT FROM OLD."validationSchema" OR NEW."presentationSchema" IS DISTINCT FROM OLD."presentationSchema" OR NEW."compatibilityMetadata" IS DISTINCT FROM OLD."compatibilityMetadata" OR NEW."schemaDigest" IS DISTINCT FROM OLD."schemaDigest" OR NEW."schemaDialect" IS DISTINCT FROM OLD."schemaDialect" OR NEW."publishedByMembershipId" IS DISTINCT FROM OLD."publishedByMembershipId" OR NEW."publishedAt" IS DISTINCT FROM OLD."publishedAt") THEN RAISE EXCEPTION 'Published clinical form schema is immutable' USING ERRCODE='42501'; END IF;
  IF OLD.status='RETIRED' AND NEW.status<>'RETIRED' THEN RAISE EXCEPTION 'Retired clinical form version cannot be reopened' USING ERRCODE='42501'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER clinical_form_version_guard BEFORE UPDATE OR DELETE ON public."ClinicalFormDefinitionVersion" FOR EACH ROW EXECUTE FUNCTION lamssa_security.clinical_form_version_guard();

CREATE FUNCTION lamssa_security.clinical_form_response_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Clinical form responses cannot be deleted' USING ERRCODE='42501'; END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW."clinicId" IS DISTINCT FROM OLD."clinicId" OR NEW."patientId" IS DISTINCT FROM OLD."patientId" OR NEW."encounterId" IS DISTINCT FROM OLD."encounterId" OR NEW."formDefinitionId" IS DISTINCT FROM OLD."formDefinitionId" OR NEW."formVersionId" IS DISTINCT FROM OLD."formVersionId" OR NEW."specialtyId" IS DISTINCT FROM OLD."specialtyId" OR NEW."branchId" IS DISTINCT FROM OLD."branchId" OR NEW."authorMembershipId" IS DISTINCT FROM OLD."authorMembershipId" OR NEW.version < OLD.version THEN RAISE EXCEPTION 'Clinical form response provenance is immutable' USING ERRCODE='42501'; END IF;
  IF OLD.status IN ('FINALIZED','AMENDED','ENTERED_IN_ERROR') AND (NEW."responseData" IS DISTINCT FROM OLD."responseData" OR NEW."contentDigest" IS DISTINCT FROM OLD."contentDigest" OR NEW."submittedAt" IS DISTINCT FROM OLD."submittedAt" OR NEW."finalizedAt" IS DISTINCT FROM OLD."finalizedAt" OR NEW."finalizedByMembershipId" IS DISTINCT FROM OLD."finalizedByMembershipId") THEN RAISE EXCEPTION 'Finalized clinical form evidence is immutable' USING ERRCODE='42501'; END IF;
  IF OLD.status='ENTERED_IN_ERROR' AND NEW.status<>'ENTERED_IN_ERROR' THEN RAISE EXCEPTION 'Entered-in-error response cannot be reopened' USING ERRCODE='42501'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER clinical_form_response_guard BEFORE UPDATE OR DELETE ON public."ClinicalFormResponse" FOR EACH ROW EXECUTE FUNCTION lamssa_security.clinical_form_response_guard();
CREATE TRIGGER clinical_form_amendment_immutable BEFORE UPDATE OR DELETE ON public."ClinicalFormResponseAmendment" FOR EACH ROW EXECUTE FUNCTION lamssa_security.reject_audit_mutation();

DO $$ DECLARE t text; owner_name text:=current_user; pred text; response_pred text; BEGIN
  FOREACH t IN ARRAY ARRAY['ClinicalFormDefinition','ClinicalFormDefinitionVersion'] LOOP
    pred:=format('CASE WHEN current_user=%L THEN false ELSE lamssa_security.context_allows("clinicId") END',owner_name);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t); EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',t);
    EXECUTE format('CREATE POLICY maintenance_owner ON public.%I FOR ALL TO %I USING (true) WITH CHECK (true)',t,owner_name);
    EXECUTE format('CREATE POLICY tenant_select ON public.%I FOR SELECT USING (%s)',t,pred);
    EXECUTE format('CREATE POLICY tenant_insert ON public.%I FOR INSERT WITH CHECK (%s)',t,pred);
    EXECUTE format('CREATE POLICY tenant_update ON public.%I FOR UPDATE USING (%s) WITH CHECK (%s)',t,pred,pred);
    EXECUTE format('CREATE POLICY tenant_delete ON public.%I FOR DELETE USING (false)',t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['ClinicalFormResponse','ClinicalFormResponseAmendment'] LOOP
    response_pred:=format('CASE WHEN current_user=%L THEN false ELSE lamssa_security.context_allows(%I."clinicId") AND EXISTS (SELECT 1 FROM public."ClinicMembership" m WHERE m."clinicId"=%I."clinicId" AND m.id=%I."authorMembershipId" AND m."userId"=lamssa_security.context_uuid(''lamssa.user_id'') AND m.status=''ACTIVE'') END',owner_name,t,t,t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t); EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',t);
    EXECUTE format('CREATE POLICY maintenance_owner ON public.%I FOR ALL TO %I USING (true) WITH CHECK (true)',t,owner_name);
    EXECUTE format('CREATE POLICY clinical_select ON public.%I FOR SELECT USING (%s)',t,response_pred);
    EXECUTE format('CREATE POLICY clinical_insert ON public.%I FOR INSERT WITH CHECK (%s)',t,response_pred);
    EXECUTE format('CREATE POLICY clinical_update ON public.%I FOR UPDATE USING (%s) WITH CHECK (%s)',t,response_pred,response_pred);
    EXECUTE format('CREATE POLICY clinical_delete ON public.%I FOR DELETE USING (false)',t);
  END LOOP;
END $$;

REVOKE ALL ON public."ClinicalFormDefinition",public."ClinicalFormDefinitionVersion",public."ClinicalFormResponse",public."ClinicalFormResponseAmendment" FROM PUBLIC;
REVOKE ALL ON FUNCTION lamssa_security.clinical_form_definition_guard(),lamssa_security.clinical_form_version_guard(),lamssa_security.clinical_form_response_guard() FROM PUBLIC;
DO $$ DECLARE r text; BEGIN
 FOR r IN SELECT DISTINCT grantee FROM information_schema.role_table_grants WHERE table_schema='public' AND table_name='Session' AND privilege_type='SELECT' AND grantee NOT IN(current_user,'PUBLIC') LOOP
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r AND (rolsuper OR rolbypassrls)) OR pg_has_role(r,current_user,'MEMBER') THEN RAISE EXCEPTION 'Unsafe runtime role'; END IF;
  EXECUTE format('GRANT SELECT,INSERT,UPDATE ON public."ClinicalFormDefinition",public."ClinicalFormDefinitionVersion",public."ClinicalFormResponse" TO %I',r);
  EXECUTE format('GRANT SELECT,INSERT ON public."ClinicalFormResponseAmendment" TO %I',r);
 END LOOP;
END $$;
COMMENT ON TABLE public."ClinicalFormDefinitionVersion" IS 'Versioned JSON Schema 2020-12 clinical form definition; published schemas are immutable.';
COMMENT ON TABLE public."ClinicalFormResponse" IS 'Sensitive clinical response bound to exact published schema, patient, encounter, specialty, branch and practitioner.';
COMMENT ON TABLE public."ClinicalFormResponseAmendment" IS 'Append-only attributable correction preserving finalized clinical form evidence.';
COMMIT;
