BEGIN;

-- CreateEnum
CREATE TYPE "ConsentPurpose" AS ENUM ('PROCEDURE', 'CLINICAL_PHOTOGRAPHY', 'MARKETING_PHOTOGRAPHY');

-- CreateEnum
CREATE TYPE "ConsentTemplateStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'RETIRED');

-- CreateEnum
CREATE TYPE "ConsentStatus" AS ENUM ('DRAFT', 'PENDING_VERIFICATION', 'ACTIVE', 'WITHDRAWN', 'EXPIRED', 'REFUSED');

-- CreateEnum
CREATE TYPE "SignerCapacity" AS ENUM ('PATIENT', 'GUARDIAN', 'LEGAL_REPRESENTATIVE');

-- CreateEnum
CREATE TYPE "SignatureType" AS ENUM ('DRAWN_BASE64', 'TYPED_CONFIRMATION', 'SECURE_TOKEN');

-- CreateTable
CREATE TABLE "ConsentTemplate" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "purpose" "ConsentPurpose" NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "procedureCatalogId" UUID,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ConsentTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsentTemplateVersion" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "templateId" UUID NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "status" "ConsentTemplateStatus" NOT NULL DEFAULT 'DRAFT',
    "titleAr" VARCHAR(200) NOT NULL,
    "bodyAr" VARCHAR(10000) NOT NULL,
    "titleEn" VARCHAR(200),
    "bodyEn" VARCHAR(10000),
    "risksTextAr" VARCHAR(6000) NOT NULL,
    "alternativesTextAr" VARCHAR(6000) NOT NULL,
    "contentDigestSha256" VARCHAR(64) NOT NULL,
    "publishedAt" TIMESTAMPTZ(3),
    "publishedByMembershipId" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ConsentTemplateVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientConsent" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "templateVersionId" UUID NOT NULL,
    "purpose" "ConsentPurpose" NOT NULL,
    "status" "ConsentStatus" NOT NULL DEFAULT 'DRAFT',
    "treatmentPlanId" UUID,
    "treatmentPlanRevisionNumber" INTEGER,
    "treatmentPlanItemId" UUID,
    "procedureCatalogId" UUID,
    "preparedByMembershipId" UUID NOT NULL,
    "verifiedByMembershipId" UUID,
    "verifiedAt" TIMESTAMPTZ(3),
    "validFrom" TIMESTAMPTZ(3),
    "expiresAt" TIMESTAMPTZ(3),
    "refusalReason" VARCHAR(1000),
    "notes" VARCHAR(2000),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PatientConsent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsentSignatureEvidence" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "patientConsentId" UUID NOT NULL,
    "signerCapacity" "SignerCapacity" NOT NULL,
    "signerName" VARCHAR(200) NOT NULL,
    "signerIdentitySnapshot" VARCHAR(100),
    "relationshipDescription" VARCHAR(200),
    "signatureType" "SignatureType" NOT NULL,
    "signatureData" VARCHAR(20000) NOT NULL,
    "evidenceHashSha256" VARCHAR(64) NOT NULL,
    "signedAt" TIMESTAMPTZ(3) NOT NULL,
    "ipAddress" VARCHAR(64),
    "userAgent" VARCHAR(500),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsentSignatureEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsentWithdrawal" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "patientConsentId" UUID NOT NULL,
    "withdrawnAt" TIMESTAMPTZ(3) NOT NULL,
    "withdrawnByMembershipId" UUID,
    "reason" VARCHAR(1000) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsentWithdrawal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ConsentTemplate_clinicId_purpose_active_createdAt_id_idx" ON "ConsentTemplate"("clinicId", "purpose", "active", "createdAt", "id");
CREATE INDEX "ConsentTemplate_clinicId_procedureCatalogId_idx" ON "ConsentTemplate"("clinicId", "procedureCatalogId");
CREATE UNIQUE INDEX "ConsentTemplate_clinicId_id_key" ON "ConsentTemplate"("clinicId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ConsentTemplateVersion_clinicId_id_key" ON "ConsentTemplateVersion"("clinicId", "id");
CREATE UNIQUE INDEX "ConsentTemplateVersion_clinicId_templateId_versionNumber_key" ON "ConsentTemplateVersion"("clinicId", "templateId", "versionNumber");
CREATE INDEX "ConsentTemplateVersion_clinicId_templateId_status_versionNumber_idx" ON "ConsentTemplateVersion"("clinicId", "templateId", "status", "versionNumber");

-- CreateIndex
CREATE INDEX "PatientConsent_clinicId_patientId_status_purpose_createdAt_id_idx" ON "PatientConsent"("clinicId", "patientId", "status", "purpose", "createdAt", "id");
CREATE INDEX "PatientConsent_clinicId_treatmentPlanItemId_status_idx" ON "PatientConsent"("clinicId", "treatmentPlanItemId", "status");
CREATE INDEX "PatientConsent_clinicId_procedureCatalogId_status_idx" ON "PatientConsent"("clinicId", "procedureCatalogId", "status");
CREATE UNIQUE INDEX "PatientConsent_clinicId_id_key" ON "PatientConsent"("clinicId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ConsentSignatureEvidence_clinicId_id_key" ON "ConsentSignatureEvidence"("clinicId", "id");
CREATE UNIQUE INDEX "ConsentSignatureEvidence_clinicId_patientConsentId_key" ON "ConsentSignatureEvidence"("clinicId", "patientConsentId");
CREATE INDEX "ConsentSignatureEvidence_clinicId_signedAt_id_idx" ON "ConsentSignatureEvidence"("clinicId", "signedAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ConsentWithdrawal_clinicId_id_key" ON "ConsentWithdrawal"("clinicId", "id");
CREATE UNIQUE INDEX "ConsentWithdrawal_clinicId_patientConsentId_key" ON "ConsentWithdrawal"("clinicId", "patientConsentId");
CREATE INDEX "ConsentWithdrawal_clinicId_withdrawnAt_id_idx" ON "ConsentWithdrawal"("clinicId", "withdrawnAt", "id");

-- AddForeignKey
ALTER TABLE "ConsentTemplate" ADD CONSTRAINT "ConsentTemplate_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "ConsentTemplate" ADD CONSTRAINT "ConsentTemplate_clinicId_procedureCatalogId_fkey" FOREIGN KEY ("clinicId", "procedureCatalogId") REFERENCES "AestheticProcedureCatalog"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ConsentTemplateVersion" ADD CONSTRAINT "ConsentTemplateVersion_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "ConsentTemplateVersion" ADD CONSTRAINT "ConsentTemplateVersion_clinicId_templateId_fkey" FOREIGN KEY ("clinicId", "templateId") REFERENCES "ConsentTemplate"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "ConsentTemplateVersion" ADD CONSTRAINT "ConsentTemplateVersion_clinicId_publishedByMembershipId_fkey" FOREIGN KEY ("clinicId", "publishedByMembershipId") REFERENCES "ClinicMembership"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "PatientConsent" ADD CONSTRAINT "PatientConsent_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "PatientConsent" ADD CONSTRAINT "PatientConsent_clinicId_patientId_fkey" FOREIGN KEY ("clinicId", "patientId") REFERENCES "Patient"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "PatientConsent" ADD CONSTRAINT "PatientConsent_clinicId_templateVersionId_fkey" FOREIGN KEY ("clinicId", "templateVersionId") REFERENCES "ConsentTemplateVersion"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "PatientConsent" ADD CONSTRAINT "PatientConsent_clinicId_preparedByMembershipId_fkey" FOREIGN KEY ("clinicId", "preparedByMembershipId") REFERENCES "ClinicMembership"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "PatientConsent" ADD CONSTRAINT "PatientConsent_clinicId_verifiedByMembershipId_fkey" FOREIGN KEY ("clinicId", "verifiedByMembershipId") REFERENCES "ClinicMembership"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "PatientConsent" ADD CONSTRAINT "PatientConsent_clinicId_treatmentPlanId_fkey" FOREIGN KEY ("clinicId", "treatmentPlanId") REFERENCES "TreatmentPlan"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "PatientConsent" ADD CONSTRAINT "PatientConsent_clinicId_treatmentPlanItemId_fkey" FOREIGN KEY ("clinicId", "treatmentPlanItemId") REFERENCES "TreatmentPlanItem"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "PatientConsent" ADD CONSTRAINT "PatientConsent_clinicId_procedureCatalogId_fkey" FOREIGN KEY ("clinicId", "procedureCatalogId") REFERENCES "AestheticProcedureCatalog"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ConsentSignatureEvidence" ADD CONSTRAINT "ConsentSignatureEvidence_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "ConsentSignatureEvidence" ADD CONSTRAINT "ConsentSignatureEvidence_clinicId_patientConsentId_fkey" FOREIGN KEY ("clinicId", "patientConsentId") REFERENCES "PatientConsent"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ConsentWithdrawal" ADD CONSTRAINT "ConsentWithdrawal_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "ConsentWithdrawal" ADD CONSTRAINT "ConsentWithdrawal_clinicId_patientConsentId_fkey" FOREIGN KEY ("clinicId", "patientConsentId") REFERENCES "PatientConsent"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "ConsentWithdrawal" ADD CONSTRAINT "ConsentWithdrawal_clinicId_withdrawnByMembershipId_fkey" FOREIGN KEY ("clinicId", "withdrawnByMembershipId") REFERENCES "ClinicMembership"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Check Constraints
ALTER TABLE public."ConsentTemplate" ADD CONSTRAINT consent_template_values CHECK (version > 0 AND length(btrim(title)) BETWEEN 2 AND 200);
ALTER TABLE public."ConsentTemplateVersion" ADD CONSTRAINT consent_template_version_values CHECK (version > 0 AND "versionNumber" > 0 AND length(btrim("titleAr")) BETWEEN 2 AND 200 AND length(btrim("bodyAr")) BETWEEN 10 AND 10000 AND length(btrim("risksTextAr")) BETWEEN 5 AND 6000 AND length(btrim("alternativesTextAr")) BETWEEN 5 AND 6000 AND length(btrim("contentDigestSha256")) = 64 AND ((status='DRAFT' AND "publishedAt" IS NULL AND "publishedByMembershipId" IS NULL) OR (status IN ('PUBLISHED','RETIRED') AND "publishedAt" IS NOT NULL AND "publishedByMembershipId" IS NOT NULL)));
ALTER TABLE public."PatientConsent" ADD CONSTRAINT patient_consent_values CHECK (version > 0 AND ((status IN ('DRAFT','REFUSED') AND "verifiedAt" IS NULL AND "verifiedByMembershipId" IS NULL) OR (status='PENDING_VERIFICATION' AND "verifiedAt" IS NULL) OR (status IN ('ACTIVE','WITHDRAWN','EXPIRED') AND "verifiedAt" IS NOT NULL AND "verifiedByMembershipId" IS NOT NULL AND "validFrom" IS NOT NULL)));
ALTER TABLE public."ConsentSignatureEvidence" ADD CONSTRAINT consent_signature_evidence_values CHECK (length(btrim("signerName")) BETWEEN 2 AND 200 AND length(btrim("evidenceHashSha256")) = 64 AND length("signatureData") >= 4);
ALTER TABLE public."ConsentWithdrawal" ADD CONSTRAINT consent_withdrawal_values CHECK (length(btrim(reason)) BETWEEN 2 AND 1000);

-- Trigger functions and guards
CREATE FUNCTION lamssa_security.consent_template_version_guard() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status IN ('PUBLISHED', 'RETIRED') THEN
      RAISE EXCEPTION 'Published consent template versions cannot be deleted' USING ERRCODE='42501';
    END IF;
    RETURN OLD;
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW."clinicId" IS DISTINCT FROM OLD."clinicId" OR NEW."templateId" IS DISTINCT FROM OLD."templateId" OR NEW."versionNumber" IS DISTINCT FROM OLD."versionNumber" OR NEW.version < OLD.version THEN
    RAISE EXCEPTION 'Consent template version identity is immutable' USING ERRCODE='42501';
  END IF;
  IF OLD.status = 'PUBLISHED' THEN
    IF NOT (NEW.status = 'RETIRED' AND ROW(NEW.id,NEW."clinicId",NEW."templateId",NEW."versionNumber",NEW."titleAr",NEW."bodyAr",NEW."titleEn",NEW."bodyEn",NEW."risksTextAr",NEW."alternativesTextAr",NEW."contentDigestSha256",NEW."publishedAt",NEW."publishedByMembershipId") IS NOT DISTINCT FROM ROW(OLD.id,OLD."clinicId",OLD."templateId",OLD."versionNumber",OLD."titleAr",OLD."bodyAr",OLD."titleEn",OLD."bodyEn",OLD."risksTextAr",OLD."alternativesTextAr",OLD."contentDigestSha256",OLD."publishedAt",OLD."publishedByMembershipId")) THEN
      RAISE EXCEPTION 'Published consent template version content is immutable' USING ERRCODE='42501';
    END IF;
  END IF;
  IF OLD.status = 'RETIRED' AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'Retired consent template version is immutable' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER consent_template_version_guard BEFORE UPDATE OR DELETE ON public."ConsentTemplateVersion" FOR EACH ROW EXECUTE FUNCTION lamssa_security.consent_template_version_guard();

CREATE FUNCTION lamssa_security.patient_consent_guard() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Patient consent records cannot be deleted' USING ERRCODE='42501';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW."clinicId" IS DISTINCT FROM OLD."clinicId" OR NEW."patientId" IS DISTINCT FROM OLD."patientId" OR NEW."templateVersionId" IS DISTINCT FROM OLD."templateVersionId" OR NEW."purpose" IS DISTINCT FROM OLD."purpose" OR NEW."treatmentPlanId" IS DISTINCT FROM OLD."treatmentPlanId" OR NEW."treatmentPlanRevisionNumber" IS DISTINCT FROM OLD."treatmentPlanRevisionNumber" OR NEW."treatmentPlanItemId" IS DISTINCT FROM OLD."treatmentPlanItemId" OR NEW."procedureCatalogId" IS DISTINCT FROM OLD."procedureCatalogId" OR NEW."preparedByMembershipId" IS DISTINCT FROM OLD."preparedByMembershipId" OR NEW.version < OLD.version THEN
    RAISE EXCEPTION 'Patient consent identity is immutable' USING ERRCODE='42501';
  END IF;
  IF OLD.status IN ('WITHDRAWN', 'EXPIRED', 'REFUSED') AND NEW.status <> OLD.status THEN
    RAISE EXCEPTION 'Terminal patient consent status cannot be reopened' USING ERRCODE='42501';
  END IF;
  IF OLD.status = 'ACTIVE' AND NEW.status NOT IN ('ACTIVE', 'WITHDRAWN', 'EXPIRED') THEN
    RAISE EXCEPTION 'Active consent can only be withdrawn or expired' USING ERRCODE='42501';
  END IF;
  IF OLD.status = 'ACTIVE' AND (NEW."verifiedAt" IS DISTINCT FROM OLD."verifiedAt" OR NEW."verifiedByMembershipId" IS DISTINCT FROM OLD."verifiedByMembershipId" OR NEW."validFrom" IS DISTINCT FROM OLD."validFrom") THEN
    RAISE EXCEPTION 'Verified consent audit details cannot be altered' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER patient_consent_guard BEFORE UPDATE OR DELETE ON public."PatientConsent" FOR EACH ROW EXECUTE FUNCTION lamssa_security.patient_consent_guard();

CREATE FUNCTION lamssa_security.consent_signature_evidence_guard() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
  RAISE EXCEPTION 'Consent signature evidence is immutable append-only' USING ERRCODE='42501';
END $$;
CREATE TRIGGER consent_signature_evidence_guard BEFORE UPDATE OR DELETE ON public."ConsentSignatureEvidence" FOR EACH ROW EXECUTE FUNCTION lamssa_security.consent_signature_evidence_guard();

CREATE FUNCTION lamssa_security.consent_withdrawal_guard() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
  RAISE EXCEPTION 'Consent withdrawal is immutable append-only' USING ERRCODE='42501';
END $$;
CREATE TRIGGER consent_withdrawal_guard BEFORE UPDATE OR DELETE ON public."ConsentWithdrawal" FOR EACH ROW EXECUTE FUNCTION lamssa_security.consent_withdrawal_guard();

-- RLS Enforcement
DO $$ DECLARE t text; owner_name text:=current_user; pred text; BEGIN
 FOREACH t IN ARRAY ARRAY['ConsentTemplate','ConsentTemplateVersion','PatientConsent','ConsentSignatureEvidence','ConsentWithdrawal'] LOOP
  pred:=format('CASE WHEN current_user=%L THEN false ELSE lamssa_security.context_allows("clinicId") END',owner_name);
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY maintenance_owner ON public.%I FOR ALL TO %I USING (true) WITH CHECK (true)',t,owner_name);
  EXECUTE format('CREATE POLICY tenant_select ON public.%I FOR SELECT USING (%s)',t,pred);
  EXECUTE format('CREATE POLICY tenant_insert ON public.%I FOR INSERT WITH CHECK (%s)',t,pred);
  EXECUTE format('CREATE POLICY tenant_update ON public.%I FOR UPDATE USING (%s) WITH CHECK (%s)',t,pred,pred);
  EXECUTE format('CREATE POLICY tenant_delete ON public.%I FOR DELETE USING (%s)',t,CASE WHEN t='ConsentTemplateVersion' THEN pred ELSE 'false' END);
 END LOOP;
END $$;

REVOKE ALL ON public."ConsentTemplate",public."ConsentTemplateVersion",public."PatientConsent",public."ConsentSignatureEvidence",public."ConsentWithdrawal" FROM PUBLIC;
REVOKE ALL ON FUNCTION lamssa_security.consent_template_version_guard(),lamssa_security.patient_consent_guard(),lamssa_security.consent_signature_evidence_guard(),lamssa_security.consent_withdrawal_guard() FROM PUBLIC;

DO $$ DECLARE r text; BEGIN
 FOR r IN SELECT DISTINCT grantee FROM information_schema.role_table_grants WHERE table_schema='public' AND table_name='Session' AND privilege_type='SELECT' AND grantee NOT IN(current_user,'PUBLIC') LOOP
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r AND (rolsuper OR rolbypassrls)) OR pg_has_role(r,current_user,'MEMBER') THEN RAISE EXCEPTION 'Unsafe runtime role'; END IF;
  EXECUTE format('GRANT SELECT,INSERT,UPDATE ON public."ConsentTemplate",public."ConsentTemplateVersion",public."PatientConsent" TO %I',r);
  EXECUTE format('GRANT DELETE ON public."ConsentTemplateVersion" TO %I',r);
  EXECUTE format('GRANT SELECT,INSERT ON public."ConsentSignatureEvidence",public."ConsentWithdrawal" TO %I',r);
 END LOOP;
END $$;

COMMENT ON TABLE public."ConsentTemplateVersion" IS 'Sensitive informed consent template snapshot; published versions are immutable.';
COMMENT ON TABLE public."PatientConsent" IS 'Legal informed consent record for procedures and photography; active status required for clinical procedure performance.';
COMMENT ON TABLE public."ConsentSignatureEvidence" IS 'Immutable append-only signature evidence record binding patient acknowledgment to exact template content digest.';
COMMENT ON TABLE public."ConsentWithdrawal" IS 'Immutable append-only consent withdrawal record terminating procedure authorization.';

COMMIT;
