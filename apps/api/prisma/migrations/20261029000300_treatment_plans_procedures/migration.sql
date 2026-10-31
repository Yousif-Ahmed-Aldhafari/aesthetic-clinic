BEGIN;

-- CreateEnum
CREATE TYPE "TreatmentPlanStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TreatmentRevisionStatus" AS ENUM ('DRAFT', 'APPROVED');

-- CreateEnum
CREATE TYPE "TreatmentItemStatus" AS ENUM ('PLANNED', 'READY', 'CANCELLED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "ProcedureExecutionStatus" AS ENUM ('DRAFT', 'READY', 'PERFORMED', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "AestheticProcedureCatalog" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "nameAr" VARCHAR(150) NOT NULL,
    "nameEn" VARCHAR(150),
    "description" VARCHAR(2000),
    "category" VARCHAR(100) NOT NULL,
    "defaultDurationMinutes" INTEGER,
    "requirements" VARCHAR(4000),
    "clinicServiceId" UUID,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AestheticProcedureCatalog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TreatmentPlan" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "clinicianMembershipId" UUID NOT NULL,
    "originatingEncounterId" UUID,
    "status" "TreatmentPlanStatus" NOT NULL DEFAULT 'DRAFT',
    "currentRevisionNumber" INTEGER NOT NULL DEFAULT 1,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "TreatmentPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TreatmentPlanRevision" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "treatmentPlanId" UUID NOT NULL,
    "revisionNumber" INTEGER NOT NULL,
    "authorMembershipId" UUID NOT NULL,
    "approvedByMembershipId" UUID,
    "status" "TreatmentRevisionStatus" NOT NULL DEFAULT 'DRAFT',
    "title" VARCHAR(200) NOT NULL,
    "clinicalPurpose" VARCHAR(4000) NOT NULL,
    "indications" VARCHAR(4000),
    "objectives" VARCHAR(4000),
    "preparationInstructions" VARCHAR(6000),
    "aftercareInstructions" VARCHAR(6000),
    "revisionReason" VARCHAR(1000),
    "version" INTEGER NOT NULL DEFAULT 1,
    "approvedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "TreatmentPlanRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TreatmentPlanItem" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "revisionId" UUID NOT NULL,
    "procedureCatalogId" UUID NOT NULL,
    "sessionOrder" INTEGER NOT NULL,
    "targetAt" TIMESTAMPTZ(3),
    "expectedDurationMinutes" INTEGER NOT NULL,
    "status" "TreatmentItemStatus" NOT NULL DEFAULT 'PLANNED',
    "clinicianInstructions" VARCHAR(4000),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "TreatmentPlanItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcedureExecution" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "clinicianMembershipId" UUID NOT NULL,
    "treatmentPlanItemId" UUID NOT NULL,
    "encounterId" UUID,
    "status" "ProcedureExecutionStatus" NOT NULL DEFAULT 'DRAFT',
    "procedureNameArSnapshot" VARCHAR(150) NOT NULL,
    "procedureNameEnSnapshot" VARCHAR(150),
    "procedureCategorySnapshot" VARCHAR(100) NOT NULL,
    "procedureCatalogVersion" INTEGER NOT NULL,
    "scheduledAt" TIMESTAMPTZ(3),
    "performedAt" TIMESTAMPTZ(3),
    "details" VARCHAR(8000),
    "observations" VARCHAR(8000),
    "productName" VARCHAR(200),
    "batchLot" VARCHAR(100),
    "productExpiresOn" DATE,
    "postProcedureInstructions" VARCHAR(6000),
    "followUpPlan" VARCHAR(6000),
    "adverseEventSummary" VARCHAR(4000),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ProcedureExecution_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AestheticProcedureCatalog_clinicId_active_nameAr_id_idx" ON "AestheticProcedureCatalog"("clinicId", "active", "nameAr", "id");

-- CreateIndex
CREATE INDEX "AestheticProcedureCatalog_clinicId_clinicServiceId_idx" ON "AestheticProcedureCatalog"("clinicId", "clinicServiceId");

-- CreateIndex
CREATE UNIQUE INDEX "AestheticProcedureCatalog_clinicId_id_key" ON "AestheticProcedureCatalog"("clinicId", "id");

-- CreateIndex
CREATE INDEX "TreatmentPlan_clinicId_patientId_createdAt_id_idx" ON "TreatmentPlan"("clinicId", "patientId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "TreatmentPlan_clinicId_clinicianMembershipId_status_updated_idx" ON "TreatmentPlan"("clinicId", "clinicianMembershipId", "status", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "TreatmentPlan_clinicId_id_key" ON "TreatmentPlan"("clinicId", "id");

-- CreateIndex
CREATE INDEX "TreatmentPlanRevision_clinicId_treatmentPlanId_status_revis_idx" ON "TreatmentPlanRevision"("clinicId", "treatmentPlanId", "status", "revisionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "TreatmentPlanRevision_clinicId_id_key" ON "TreatmentPlanRevision"("clinicId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "TreatmentPlanRevision_clinicId_treatmentPlanId_revisionNumb_key" ON "TreatmentPlanRevision"("clinicId", "treatmentPlanId", "revisionNumber");

-- CreateIndex
CREATE INDEX "TreatmentPlanItem_clinicId_procedureCatalogId_status_idx" ON "TreatmentPlanItem"("clinicId", "procedureCatalogId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "TreatmentPlanItem_clinicId_id_key" ON "TreatmentPlanItem"("clinicId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "TreatmentPlanItem_clinicId_revisionId_sessionOrder_key" ON "TreatmentPlanItem"("clinicId", "revisionId", "sessionOrder");

-- CreateIndex
CREATE INDEX "ProcedureExecution_clinicId_patientId_status_createdAt_idx" ON "ProcedureExecution"("clinicId", "patientId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "ProcedureExecution_clinicId_clinicianMembershipId_status_idx" ON "ProcedureExecution"("clinicId", "clinicianMembershipId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ProcedureExecution_clinicId_id_key" ON "ProcedureExecution"("clinicId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ProcedureExecution_clinicId_treatmentPlanItemId_key" ON "ProcedureExecution"("clinicId", "treatmentPlanItemId");

-- AddForeignKey
ALTER TABLE "AestheticProcedureCatalog" ADD CONSTRAINT "AestheticProcedureCatalog_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "AestheticProcedureCatalog" ADD CONSTRAINT "AestheticProcedureCatalog_clinicId_clinicServiceId_fkey" FOREIGN KEY ("clinicId", "clinicServiceId") REFERENCES "ClinicService"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "TreatmentPlan" ADD CONSTRAINT "TreatmentPlan_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "TreatmentPlan" ADD CONSTRAINT "TreatmentPlan_clinicId_patientId_fkey" FOREIGN KEY ("clinicId", "patientId") REFERENCES "Patient"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "TreatmentPlan" ADD CONSTRAINT "TreatmentPlan_clinicId_clinicianMembershipId_fkey" FOREIGN KEY ("clinicId", "clinicianMembershipId") REFERENCES "ClinicMembership"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "TreatmentPlan" ADD CONSTRAINT "TreatmentPlan_clinicId_originatingEncounterId_fkey" FOREIGN KEY ("clinicId", "originatingEncounterId") REFERENCES "ClinicalEncounter"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "TreatmentPlanRevision" ADD CONSTRAINT "TreatmentPlanRevision_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "TreatmentPlanRevision" ADD CONSTRAINT "TreatmentPlanRevision_clinicId_treatmentPlanId_fkey" FOREIGN KEY ("clinicId", "treatmentPlanId") REFERENCES "TreatmentPlan"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "TreatmentPlanRevision" ADD CONSTRAINT "TreatmentPlanRevision_clinicId_authorMembershipId_fkey" FOREIGN KEY ("clinicId", "authorMembershipId") REFERENCES "ClinicMembership"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "TreatmentPlanRevision" ADD CONSTRAINT "TreatmentPlanRevision_clinicId_approvedByMembershipId_fkey" FOREIGN KEY ("clinicId", "approvedByMembershipId") REFERENCES "ClinicMembership"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "TreatmentPlanItem" ADD CONSTRAINT "TreatmentPlanItem_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "TreatmentPlanItem" ADD CONSTRAINT "TreatmentPlanItem_clinicId_revisionId_fkey" FOREIGN KEY ("clinicId", "revisionId") REFERENCES "TreatmentPlanRevision"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "TreatmentPlanItem" ADD CONSTRAINT "TreatmentPlanItem_clinicId_procedureCatalogId_fkey" FOREIGN KEY ("clinicId", "procedureCatalogId") REFERENCES "AestheticProcedureCatalog"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ProcedureExecution" ADD CONSTRAINT "ProcedureExecution_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ProcedureExecution" ADD CONSTRAINT "ProcedureExecution_clinicId_patientId_fkey" FOREIGN KEY ("clinicId", "patientId") REFERENCES "Patient"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ProcedureExecution" ADD CONSTRAINT "ProcedureExecution_clinicId_clinicianMembershipId_fkey" FOREIGN KEY ("clinicId", "clinicianMembershipId") REFERENCES "ClinicMembership"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ProcedureExecution" ADD CONSTRAINT "ProcedureExecution_clinicId_treatmentPlanItemId_fkey" FOREIGN KEY ("clinicId", "treatmentPlanItemId") REFERENCES "TreatmentPlanItem"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ProcedureExecution" ADD CONSTRAINT "ProcedureExecution_clinicId_encounterId_fkey" FOREIGN KEY ("clinicId", "encounterId") REFERENCES "ClinicalEncounter"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;


-- Database-level values and historical integrity.
ALTER TABLE public."AestheticProcedureCatalog" ADD CONSTRAINT procedure_catalog_values CHECK (version > 0 AND length(btrim("nameAr")) BETWEEN 2 AND 150 AND length(btrim(category)) BETWEEN 2 AND 100 AND ("defaultDurationMinutes" IS NULL OR "defaultDurationMinutes" BETWEEN 5 AND 720));
ALTER TABLE public."TreatmentPlan" ADD CONSTRAINT treatment_plan_values CHECK (version > 0 AND "currentRevisionNumber" > 0);
ALTER TABLE public."TreatmentPlanRevision" ADD CONSTRAINT treatment_revision_values CHECK (version > 0 AND "revisionNumber" > 0 AND length(btrim(title)) BETWEEN 2 AND 200 AND length(btrim("clinicalPurpose")) BETWEEN 2 AND 4000 AND ((status='DRAFT' AND "approvedAt" IS NULL AND "approvedByMembershipId" IS NULL) OR (status='APPROVED' AND "approvedAt" IS NOT NULL AND "approvedByMembershipId" IS NOT NULL)));
ALTER TABLE public."TreatmentPlanItem" ADD CONSTRAINT treatment_item_values CHECK (version > 0 AND "sessionOrder" > 0 AND "expectedDurationMinutes" BETWEEN 5 AND 720);
ALTER TABLE public."ProcedureExecution" ADD CONSTRAINT procedure_execution_values CHECK (version > 0 AND ((status IN ('DRAFT','READY','CANCELLED') AND "performedAt" IS NULL) OR (status IN ('PERFORMED','COMPLETED') AND "performedAt" IS NOT NULL)));

CREATE FUNCTION lamssa_security.treatment_plan_guard() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 IF NEW.id IS DISTINCT FROM OLD.id OR NEW."clinicId" IS DISTINCT FROM OLD."clinicId" OR NEW."patientId" IS DISTINCT FROM OLD."patientId" OR NEW."clinicianMembershipId" IS DISTINCT FROM OLD."clinicianMembershipId" OR NEW."originatingEncounterId" IS DISTINCT FROM OLD."originatingEncounterId" OR NEW.version < OLD.version OR NEW."currentRevisionNumber" < OLD."currentRevisionNumber" THEN RAISE EXCEPTION 'Treatment plan identity and revision are immutable' USING ERRCODE='42501'; END IF;
 IF OLD.status IN ('COMPLETED','CANCELLED') AND NEW.status<>OLD.status THEN RAISE EXCEPTION 'Terminal treatment plan cannot be reopened' USING ERRCODE='42501'; END IF; RETURN NEW;
END $$;
CREATE TRIGGER treatment_plan_guard BEFORE UPDATE ON public."TreatmentPlan" FOR EACH ROW EXECUTE FUNCTION lamssa_security.treatment_plan_guard();
CREATE FUNCTION lamssa_security.treatment_revision_guard() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 IF NEW.id IS DISTINCT FROM OLD.id OR NEW."clinicId" IS DISTINCT FROM OLD."clinicId" OR NEW."treatmentPlanId" IS DISTINCT FROM OLD."treatmentPlanId" OR NEW."revisionNumber" IS DISTINCT FROM OLD."revisionNumber" OR NEW."authorMembershipId" IS DISTINCT FROM OLD."authorMembershipId" OR NEW.version < OLD.version THEN RAISE EXCEPTION 'Treatment revision identity is immutable' USING ERRCODE='42501'; END IF;
 IF OLD.status='APPROVED' AND NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'Approved treatment revision is immutable' USING ERRCODE='42501'; END IF; RETURN NEW;
END $$;
CREATE TRIGGER treatment_revision_guard BEFORE UPDATE OR DELETE ON public."TreatmentPlanRevision" FOR EACH ROW EXECUTE FUNCTION lamssa_security.treatment_revision_guard();
CREATE FUNCTION lamssa_security.treatment_item_guard() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $$
DECLARE revision_status public."TreatmentRevisionStatus"; BEGIN
 SELECT status INTO revision_status FROM public."TreatmentPlanRevision" WHERE "clinicId"=OLD."clinicId" AND id=OLD."revisionId";
 IF revision_status<>'DRAFT' THEN RAISE EXCEPTION 'Approved treatment items are immutable' USING ERRCODE='42501'; END IF;
 IF TG_OP='UPDATE' AND (NEW.id IS DISTINCT FROM OLD.id OR NEW."clinicId" IS DISTINCT FROM OLD."clinicId" OR NEW."revisionId" IS DISTINCT FROM OLD."revisionId" OR NEW.version < OLD.version) THEN RAISE EXCEPTION 'Treatment item identity is immutable' USING ERRCODE='42501'; END IF; RETURN COALESCE(NEW,OLD);
END $$;
CREATE TRIGGER treatment_item_guard BEFORE UPDATE OR DELETE ON public."TreatmentPlanItem" FOR EACH ROW EXECUTE FUNCTION lamssa_security.treatment_item_guard();
CREATE FUNCTION lamssa_security.procedure_execution_guard() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 IF NEW.id IS DISTINCT FROM OLD.id OR NEW."clinicId" IS DISTINCT FROM OLD."clinicId" OR NEW."patientId" IS DISTINCT FROM OLD."patientId" OR NEW."clinicianMembershipId" IS DISTINCT FROM OLD."clinicianMembershipId" OR NEW."treatmentPlanItemId" IS DISTINCT FROM OLD."treatmentPlanItemId" OR NEW."encounterId" IS DISTINCT FROM OLD."encounterId" OR NEW.version < OLD.version THEN RAISE EXCEPTION 'Procedure execution identity is immutable' USING ERRCODE='42501'; END IF;
 IF OLD.status IN ('PERFORMED','COMPLETED') AND NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'Performed procedure is immutable' USING ERRCODE='42501'; END IF; RETURN NEW;
END $$;
CREATE TRIGGER procedure_execution_guard BEFORE UPDATE OR DELETE ON public."ProcedureExecution" FOR EACH ROW EXECUTE FUNCTION lamssa_security.procedure_execution_guard();

DO $$ DECLARE t text; owner_name text:=current_user; pred text; BEGIN
 FOREACH t IN ARRAY ARRAY['AestheticProcedureCatalog','TreatmentPlan','TreatmentPlanRevision','TreatmentPlanItem','ProcedureExecution'] LOOP
  pred:=format('CASE WHEN current_user=%L THEN false ELSE lamssa_security.context_allows("clinicId") END',owner_name);
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t); EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY maintenance_owner ON public.%I FOR ALL TO %I USING (true) WITH CHECK (true)',t,owner_name);
  EXECUTE format('CREATE POLICY tenant_select ON public.%I FOR SELECT USING (%s)',t,pred); EXECUTE format('CREATE POLICY tenant_insert ON public.%I FOR INSERT WITH CHECK (%s)',t,pred); EXECUTE format('CREATE POLICY tenant_update ON public.%I FOR UPDATE USING (%s) WITH CHECK (%s)',t,pred,pred);
  EXECUTE format('CREATE POLICY tenant_delete ON public.%I FOR DELETE USING (%s)',t,CASE WHEN t='TreatmentPlanItem' THEN pred ELSE 'false' END);
 END LOOP; END $$;
REVOKE ALL ON public."AestheticProcedureCatalog",public."TreatmentPlan",public."TreatmentPlanRevision",public."TreatmentPlanItem",public."ProcedureExecution" FROM PUBLIC;
REVOKE ALL ON FUNCTION lamssa_security.treatment_plan_guard(),lamssa_security.treatment_revision_guard(),lamssa_security.treatment_item_guard(),lamssa_security.procedure_execution_guard() FROM PUBLIC;
DO $$ DECLARE r text; BEGIN FOR r IN SELECT DISTINCT grantee FROM information_schema.role_table_grants WHERE table_schema='public' AND table_name='Session' AND privilege_type='SELECT' AND grantee NOT IN(current_user,'PUBLIC') LOOP
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r AND (rolsuper OR rolbypassrls)) OR pg_has_role(r,current_user,'MEMBER') THEN RAISE EXCEPTION 'Unsafe runtime role'; END IF;
 EXECUTE format('GRANT SELECT,INSERT,UPDATE ON public."AestheticProcedureCatalog",public."TreatmentPlan",public."TreatmentPlanRevision",public."TreatmentPlanItem",public."ProcedureExecution" TO %I',r); EXECUTE format('GRANT DELETE ON public."TreatmentPlanItem" TO %I',r);
 END LOOP; END $$;
COMMENT ON TABLE public."TreatmentPlanRevision" IS 'Sensitive clinical plan snapshot; approved revisions are immutable.';
COMMENT ON TABLE public."ProcedureExecution" IS 'Sensitive procedure documentation; performance is blocked until verified consent support exists.';
COMMIT;
