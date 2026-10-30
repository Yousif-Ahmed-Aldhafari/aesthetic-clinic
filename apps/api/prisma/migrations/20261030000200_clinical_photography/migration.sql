-- Phase 3 Step 3.4 — Secure Before-and-After Clinical Photography
BEGIN;

-- Enums
CREATE TYPE public."PhotoCategory" AS ENUM ('BEFORE', 'AFTER', 'FOLLOW_UP');
CREATE TYPE public."PhotoSessionStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- 1. ClinicalPhotoSession
CREATE TABLE public."ClinicalPhotoSession" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clinicId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "clinicianMembershipId" UUID NOT NULL,
    "consentId" UUID NOT NULL,
    "encounterId" UUID,
    "treatmentPlanId" UUID,
    "treatmentPlanItemId" UUID,
    "procedureExecutionId" UUID,
    "sessionDate" TIMESTAMPTZ(3) NOT NULL,
    "status" public."PhotoSessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" VARCHAR(1000),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ClinicalPhotoSession_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ClinicalPhotoSession_clinic_fkey" FOREIGN KEY ("clinicId") REFERENCES public."Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "ClinicalPhotoSession_patient_fkey" FOREIGN KEY ("clinicId", "patientId") REFERENCES public."Patient"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "ClinicalPhotoSession_clinician_fkey" FOREIGN KEY ("clinicId", "clinicianMembershipId") REFERENCES public."ClinicMembership"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "ClinicalPhotoSession_consent_fkey" FOREIGN KEY ("clinicId", "consentId") REFERENCES public."PatientConsent"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "ClinicalPhotoSession_encounter_fkey" FOREIGN KEY ("clinicId", "encounterId") REFERENCES public."ClinicalEncounter"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "ClinicalPhotoSession_treatmentPlan_fkey" FOREIGN KEY ("clinicId", "treatmentPlanId") REFERENCES public."TreatmentPlan"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "ClinicalPhotoSession_treatmentPlanItem_fkey" FOREIGN KEY ("clinicId", "treatmentPlanItemId") REFERENCES public."TreatmentPlanItem"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "ClinicalPhotoSession_procedureExecution_fkey" FOREIGN KEY ("clinicId", "procedureExecutionId") REFERENCES public."ProcedureExecution"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "clinical_photo_session_values" CHECK (version > 0 AND length(btrim(coalesce(notes, 'x'))) <= 1000)
);

CREATE UNIQUE INDEX "ClinicalPhotoSession_clinicId_id_key" ON public."ClinicalPhotoSession"("clinicId", "id");
CREATE INDEX "ClinicalPhotoSession_clinicId_patientId_sessionDate_id_idx" ON public."ClinicalPhotoSession"("clinicId", "patientId", "sessionDate", "id");
CREATE INDEX "ClinicalPhotoSession_clinicId_consentId_idx" ON public."ClinicalPhotoSession"("clinicId", "consentId");

-- 2. ClinicalPhoto
CREATE TABLE public."ClinicalPhoto" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clinicId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "photoSessionId" UUID NOT NULL,
    "clinicianMembershipId" UUID NOT NULL,
    "category" public."PhotoCategory" NOT NULL,
    "bodyArea" VARCHAR(100) NOT NULL,
    "caption" VARCHAR(500),
    "storageKey" VARCHAR(255) NOT NULL,
    "thumbnailStorageKey" VARCHAR(255) NOT NULL,
    "originalFileName" VARCHAR(255) NOT NULL,
    "mimeType" VARCHAR(50) NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "sha256Digest" VARCHAR(64) NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "takenAt" TIMESTAMPTZ(3) NOT NULL,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMPTZ(3),
    "archivedReason" VARCHAR(500),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ClinicalPhoto_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ClinicalPhoto_clinic_fkey" FOREIGN KEY ("clinicId") REFERENCES public."Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "ClinicalPhoto_patient_fkey" FOREIGN KEY ("clinicId", "patientId") REFERENCES public."Patient"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "ClinicalPhoto_session_fkey" FOREIGN KEY ("clinicId", "photoSessionId") REFERENCES public."ClinicalPhotoSession"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "ClinicalPhoto_clinician_fkey" FOREIGN KEY ("clinicId", "clinicianMembershipId") REFERENCES public."ClinicMembership"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "clinical_photo_values" CHECK (
        version > 0 AND
        "byteSize" > 0 AND
        width > 0 AND
        height > 0 AND
        length("sha256Digest") = 64 AND
        length(btrim("bodyArea")) >= 2 AND
        ((NOT "isArchived" AND "archivedAt" IS NULL AND "archivedReason" IS NULL) OR
         ("isArchived" AND "archivedAt" IS NOT NULL AND "archivedReason" IS NOT NULL))
    )
);

CREATE UNIQUE INDEX "ClinicalPhoto_clinicId_id_key" ON public."ClinicalPhoto"("clinicId", "id");
CREATE INDEX "ClinicalPhoto_clinicId_patientId_category_takenAt_id_idx" ON public."ClinicalPhoto"("clinicId", "patientId", "category", "takenAt", "id");
CREATE INDEX "ClinicalPhoto_clinicId_photoSessionId_id_idx" ON public."ClinicalPhoto"("clinicId", "photoSessionId", "id");

-- 3. PhotoComparisonGroup
CREATE TABLE public."PhotoComparisonGroup" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clinicId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "clinicianMembershipId" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "notes" VARCHAR(1000),
    "beforePhotoId" UUID NOT NULL,
    "afterPhotoId" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PhotoComparisonGroup_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PhotoComparisonGroup_clinic_fkey" FOREIGN KEY ("clinicId") REFERENCES public."Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "PhotoComparisonGroup_patient_fkey" FOREIGN KEY ("clinicId", "patientId") REFERENCES public."Patient"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "PhotoComparisonGroup_clinician_fkey" FOREIGN KEY ("clinicId", "clinicianMembershipId") REFERENCES public."ClinicMembership"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "PhotoComparisonGroup_beforePhoto_fkey" FOREIGN KEY ("clinicId", "beforePhotoId") REFERENCES public."ClinicalPhoto"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "PhotoComparisonGroup_afterPhoto_fkey" FOREIGN KEY ("clinicId", "afterPhotoId") REFERENCES public."ClinicalPhoto"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "photo_comparison_group_values" CHECK (version > 0 AND length(btrim(title)) >= 2 AND "beforePhotoId" <> "afterPhotoId")
);

CREATE UNIQUE INDEX "PhotoComparisonGroup_clinicId_id_key" ON public."PhotoComparisonGroup"("clinicId", "id");
CREATE INDEX "PhotoComparisonGroup_clinicId_patientId_createdAt_id_idx" ON public."PhotoComparisonGroup"("clinicId", "patientId", "createdAt", "id");

-- 4. PhotoAnnotation
CREATE TABLE public."PhotoAnnotation" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clinicId" UUID NOT NULL,
    "photoId" UUID NOT NULL,
    "authorMembershipId" UUID NOT NULL,
    "annotationType" VARCHAR(50) NOT NULL,
    "geometryJson" VARCHAR(2000),
    "comment" VARCHAR(1000) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PhotoAnnotation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PhotoAnnotation_clinic_fkey" FOREIGN KEY ("clinicId") REFERENCES public."Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "PhotoAnnotation_photo_fkey" FOREIGN KEY ("clinicId", "photoId") REFERENCES public."ClinicalPhoto"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "PhotoAnnotation_author_fkey" FOREIGN KEY ("clinicId", "authorMembershipId") REFERENCES public."ClinicMembership"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "photo_annotation_values" CHECK (version > 0 AND length(btrim(comment)) >= 2 AND length(btrim("annotationType")) >= 2)
);

CREATE UNIQUE INDEX "PhotoAnnotation_clinicId_id_key" ON public."PhotoAnnotation"("clinicId", "id");
CREATE INDEX "PhotoAnnotation_clinicId_photoId_createdAt_id_idx" ON public."PhotoAnnotation"("clinicId", "photoId", "createdAt", "id");

-- Trigger Functions and Security Guards
CREATE FUNCTION lamssa_security.clinical_photo_session_guard() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Clinical photo sessions cannot be deleted' USING ERRCODE='42501';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW."clinicId" IS DISTINCT FROM OLD."clinicId" OR NEW."patientId" IS DISTINCT FROM OLD."patientId" OR NEW."consentId" IS DISTINCT FROM OLD."consentId" OR NEW.version < OLD.version THEN
    RAISE EXCEPTION 'Clinical photo session identity and consent are immutable' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER clinical_photo_session_guard BEFORE UPDATE OR DELETE ON public."ClinicalPhotoSession" FOR EACH ROW EXECUTE FUNCTION lamssa_security.clinical_photo_session_guard();

CREATE FUNCTION lamssa_security.clinical_photo_guard() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Clinical photos cannot be deleted' USING ERRCODE='42501';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW."clinicId" IS DISTINCT FROM OLD."clinicId" OR NEW."patientId" IS DISTINCT FROM OLD."patientId" OR NEW."photoSessionId" IS DISTINCT FROM OLD."photoSessionId" OR NEW."clinicianMembershipId" IS DISTINCT FROM OLD."clinicianMembershipId" OR NEW."sha256Digest" IS DISTINCT FROM OLD."sha256Digest" OR NEW."storageKey" IS DISTINCT FROM OLD."storageKey" OR NEW."thumbnailStorageKey" IS DISTINCT FROM OLD."thumbnailStorageKey" OR NEW."byteSize" IS DISTINCT FROM OLD."byteSize" OR NEW."mimeType" IS DISTINCT FROM OLD."mimeType" OR NEW.version < OLD.version THEN
    RAISE EXCEPTION 'Clinical photo master and identity are immutable' USING ERRCODE='42501';
  END IF;
  IF OLD."isArchived" AND (NOT NEW."isArchived" OR NEW."archivedReason" IS DISTINCT FROM OLD."archivedReason") THEN
    RAISE EXCEPTION 'Archived clinical photos cannot be unarchived or modified' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER clinical_photo_guard BEFORE UPDATE OR DELETE ON public."ClinicalPhoto" FOR EACH ROW EXECUTE FUNCTION lamssa_security.clinical_photo_guard();

CREATE FUNCTION lamssa_security.photo_comparison_guard() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Photo comparisons cannot be deleted' USING ERRCODE='42501';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW."clinicId" IS DISTINCT FROM OLD."clinicId" OR NEW."patientId" IS DISTINCT FROM OLD."patientId" OR NEW.version < OLD.version THEN
    RAISE EXCEPTION 'Photo comparison identity is immutable' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER photo_comparison_guard BEFORE UPDATE OR DELETE ON public."PhotoComparisonGroup" FOR EACH ROW EXECUTE FUNCTION lamssa_security.photo_comparison_guard();

CREATE FUNCTION lamssa_security.photo_annotation_guard() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Photo annotations cannot be deleted' USING ERRCODE='42501';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW."clinicId" IS DISTINCT FROM OLD."clinicId" OR NEW."photoId" IS DISTINCT FROM OLD."photoId" OR NEW."authorMembershipId" IS DISTINCT FROM OLD."authorMembershipId" OR NEW.version < OLD.version THEN
    RAISE EXCEPTION 'Photo annotation identity and authorship are immutable' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER photo_annotation_guard BEFORE UPDATE OR DELETE ON public."PhotoAnnotation" FOR EACH ROW EXECUTE FUNCTION lamssa_security.photo_annotation_guard();

-- Enhance procedure_execution_guard to enforce verified procedure consent at trigger level
CREATE OR REPLACE FUNCTION lamssa_security.procedure_execution_guard() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Procedure executions cannot be deleted' USING ERRCODE='42501';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW."clinicId" IS DISTINCT FROM OLD."clinicId" OR NEW."patientId" IS DISTINCT FROM OLD."patientId" OR NEW."clinicianMembershipId" IS DISTINCT FROM OLD."clinicianMembershipId" OR NEW."treatmentPlanItemId" IS DISTINCT FROM OLD."treatmentPlanItemId" OR NEW."encounterId" IS DISTINCT FROM OLD."encounterId" OR NEW.version < OLD.version THEN
    RAISE EXCEPTION 'Procedure execution identity is immutable' USING ERRCODE='42501';
  END IF;
  IF OLD.status IN ('PERFORMED','COMPLETED') AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'Performed procedure is immutable' USING ERRCODE='42501';
  END IF;

  -- Raw SQL and runtime bypass prevention: Transitioning to PERFORMED or COMPLETED requires verified active procedure consent
  IF NEW.status IN ('PERFORMED', 'COMPLETED') AND OLD.status NOT IN ('PERFORMED', 'COMPLETED') THEN
    IF NOT EXISTS (
      SELECT 1 FROM public."PatientConsent" pc
      JOIN public."TreatmentPlanItem" tpi ON tpi.id = NEW."treatmentPlanItemId" AND tpi."clinicId" = NEW."clinicId"
      JOIN public."TreatmentPlanRevision" tpr ON tpr.id = tpi."revisionId" AND tpr."clinicId" = NEW."clinicId"
      JOIN public."ConsentSignatureEvidence" cse ON cse."patientConsentId" = pc.id AND cse."clinicId" = pc."clinicId"
      WHERE pc."clinicId" = NEW."clinicId"
        AND pc."patientId" = NEW."patientId"
        AND pc.purpose = 'PROCEDURE'
        AND pc.status = 'ACTIVE'
        AND pc."procedureCatalogId" = tpi."procedureCatalogId"
        AND (pc."treatmentPlanId" IS NULL OR pc."treatmentPlanId" = tpr."treatmentPlanId")
        AND (pc."treatmentPlanRevisionNumber" IS NULL OR pc."treatmentPlanRevisionNumber" = tpr."revisionNumber")
        AND (pc."treatmentPlanItemId" IS NULL OR pc."treatmentPlanItemId" = NEW."treatmentPlanItemId")
        AND pc."verifiedAt" IS NOT NULL
        AND pc."verifiedByMembershipId" IS NOT NULL
        AND pc."validFrom" <= CURRENT_TIMESTAMP
        AND (pc."expiresAt" IS NULL OR pc."expiresAt" > CURRENT_TIMESTAMP)
        AND NOT EXISTS (
          SELECT 1 FROM public."ConsentWithdrawal" cw WHERE cw."patientConsentId" = pc.id AND cw."clinicId" = pc."clinicId"
        )
    ) THEN
      RAISE EXCEPTION 'Verified active procedure consent required to perform procedure' USING ERRCODE='42501';
    END IF;
  END IF;

  RETURN NEW;
END $$;

-- FORCE ROW LEVEL SECURITY and Tenant Isolation
DO $$ DECLARE t text; owner_name text:=current_user; pred text; BEGIN
 FOREACH t IN ARRAY ARRAY['ClinicalPhotoSession','ClinicalPhoto','PhotoComparisonGroup','PhotoAnnotation'] LOOP
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

REVOKE ALL ON public."ClinicalPhotoSession",public."ClinicalPhoto",public."PhotoComparisonGroup",public."PhotoAnnotation" FROM PUBLIC;
REVOKE ALL ON FUNCTION lamssa_security.clinical_photo_session_guard(),lamssa_security.clinical_photo_guard(),lamssa_security.photo_comparison_guard(),lamssa_security.photo_annotation_guard() FROM PUBLIC;

DO $$ DECLARE r text; BEGIN
 FOR r IN SELECT DISTINCT grantee FROM information_schema.role_table_grants WHERE table_schema='public' AND table_name='Session' AND privilege_type='SELECT' AND grantee NOT IN(current_user,'PUBLIC') LOOP
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r AND (rolsuper OR rolbypassrls)) OR pg_has_role(r,current_user,'MEMBER') THEN RAISE EXCEPTION 'Unsafe runtime role'; END IF;
  EXECUTE format('GRANT SELECT,INSERT,UPDATE ON public."ClinicalPhotoSession",public."ClinicalPhoto",public."PhotoComparisonGroup",public."PhotoAnnotation" TO %I',r);
 END LOOP;
END $$;

COMMENT ON TABLE public."ClinicalPhotoSession" IS 'Clinical photography session capturing before/after documentation under verified clinical photography consent.';
COMMENT ON TABLE public."ClinicalPhoto" IS 'Encrypted clinical photography asset with stripped EXIF and immutable master content digest.';
COMMENT ON TABLE public."PhotoComparisonGroup" IS 'Clinical comparison grouping associating BEFORE and AFTER photographs.';
COMMENT ON TABLE public."PhotoAnnotation" IS 'Attributable non-destructive clinical annotation on a clinical photograph.';

COMMIT;

