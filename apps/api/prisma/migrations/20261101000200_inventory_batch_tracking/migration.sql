-- Phase 4 Step 4.2 — Batch/Lot Tracking, Expiry Management, Product Traceability & Clinical Procedure Consumption
BEGIN;

-- 1. Enums
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'InventoryBatchStatus') THEN
    CREATE TYPE public."InventoryBatchStatus" AS ENUM ('AVAILABLE', 'QUARANTINED', 'RECALLED', 'EXPIRED', 'DEPLETED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ClinicalConsumptionStatus') THEN
    CREATE TYPE public."ClinicalConsumptionStatus" AS ENUM ('RECORDED', 'VOIDED');
  END IF;
END $$;

-- 2. InventoryBatch
CREATE TABLE public."InventoryBatch" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clinicId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "batchNumber" VARCHAR(100) NOT NULL,
    "expirationDate" DATE NOT NULL,
    "status" public."InventoryBatchStatus" NOT NULL DEFAULT 'AVAILABLE',
    "initialQuantity" DECIMAL(12, 4) NOT NULL,
    "manufacturerName" VARCHAR(200),
    "supplierName" VARCHAR(200),
    "quarantinedAt" TIMESTAMPTZ(3),
    "quarantineReason" VARCHAR(500),
    "recalledAt" TIMESTAMPTZ(3),
    "recallReason" VARCHAR(500),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "InventoryBatch_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "InventoryBatch_clinic_fkey" FOREIGN KEY ("clinicId") REFERENCES public."Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "InventoryBatch_product_fkey" FOREIGN KEY ("clinicId", "productId") REFERENCES public."InventoryProduct"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "inventory_batch_values" CHECK (
        version > 0
        AND length(btrim("batchNumber")) >= 2
        AND "initialQuantity" > 0
    )
);

CREATE UNIQUE INDEX "InventoryBatch_clinicId_id_key" ON public."InventoryBatch"("clinicId", "id");
CREATE UNIQUE INDEX "InventoryBatch_clinicId_productId_batchNumber_key" ON public."InventoryBatch"("clinicId", "productId", "batchNumber");
CREATE INDEX "InventoryBatch_clinicId_status_expirationDate_idx" ON public."InventoryBatch"("clinicId", "status", "expirationDate");
CREATE INDEX "InventoryBatch_clinicId_productId_status_idx" ON public."InventoryBatch"("clinicId", "productId", "status");
CREATE INDEX "InventoryBatch_clinicId_expirationDate_idx" ON public."InventoryBatch"("clinicId", "expirationDate");

-- 3. InventoryBatchBalance (Per-location batch balances)
CREATE TABLE public."InventoryBatchBalance" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clinicId" UUID NOT NULL,
    "batchId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "locationId" UUID NOT NULL,
    "onHandQuantity" DECIMAL(12, 4) NOT NULL DEFAULT 0.0000,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "InventoryBatchBalance_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "InventoryBatchBalance_clinic_fkey" FOREIGN KEY ("clinicId") REFERENCES public."Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "InventoryBatchBalance_batch_fkey" FOREIGN KEY ("clinicId", "batchId") REFERENCES public."InventoryBatch"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "InventoryBatchBalance_product_fkey" FOREIGN KEY ("clinicId", "productId") REFERENCES public."InventoryProduct"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "InventoryBatchBalance_location_fkey" FOREIGN KEY ("clinicId", "locationId") REFERENCES public."InventoryLocation"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "inventory_batch_balance_values" CHECK (
        version > 0
        AND "onHandQuantity" >= 0
    )
);

CREATE UNIQUE INDEX "InventoryBatchBalance_clinicId_id_key" ON public."InventoryBatchBalance"("clinicId", "id");
CREATE UNIQUE INDEX "InventoryBatchBalance_clinicId_locationId_batchId_key" ON public."InventoryBatchBalance"("clinicId", "locationId", "batchId");
CREATE INDEX "InventoryBatchBalance_clinicId_batchId_idx" ON public."InventoryBatchBalance"("clinicId", "batchId");
CREATE INDEX "InventoryBatchBalance_clinicId_productId_locationId_idx" ON public."InventoryBatchBalance"("clinicId", "productId", "locationId");

-- 4. Extend InventoryStockMovement to reference batch
ALTER TABLE public."InventoryStockMovement" ADD COLUMN "batchId" UUID;
ALTER TABLE public."InventoryStockMovement" ADD CONSTRAINT "InventoryStockMovement_batch_fkey" FOREIGN KEY ("clinicId", "batchId") REFERENCES public."InventoryBatch"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
CREATE INDEX "InventoryStockMovement_clinicId_batchId_createdAt_idx" ON public."InventoryStockMovement"("clinicId", "batchId", "createdAt");

-- 5. InventoryClinicalConsumption
CREATE TABLE public."InventoryClinicalConsumption" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clinicId" UUID NOT NULL,
    "procedureExecutionId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "batchId" UUID NOT NULL,
    "locationId" UUID NOT NULL,
    "quantity" DECIMAL(12, 4) NOT NULL,
    "wasteQuantity" DECIMAL(12, 4) NOT NULL DEFAULT 0.0000,
    "unit" public."InventoryUnit" NOT NULL,
    "status" public."ClinicalConsumptionStatus" NOT NULL DEFAULT 'RECORDED',
    "notes" VARCHAR(1000),
    "movementId" UUID NOT NULL,
    "actorMembershipId" UUID NOT NULL,
    "voidedAt" TIMESTAMPTZ(3),
    "voidReason" VARCHAR(500),
    "voidedByUserId" UUID,
    "voidMovementId" UUID,
    "idempotencyKey" VARCHAR(100),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "InventoryClinicalConsumption_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "InventoryClinicalConsumption_clinic_fkey" FOREIGN KEY ("clinicId") REFERENCES public."Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "InventoryClinicalConsumption_procedureExecution_fkey" FOREIGN KEY ("clinicId", "procedureExecutionId") REFERENCES public."ProcedureExecution"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "InventoryClinicalConsumption_product_fkey" FOREIGN KEY ("clinicId", "productId") REFERENCES public."InventoryProduct"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "InventoryClinicalConsumption_batch_fkey" FOREIGN KEY ("clinicId", "batchId") REFERENCES public."InventoryBatch"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "InventoryClinicalConsumption_location_fkey" FOREIGN KEY ("clinicId", "locationId") REFERENCES public."InventoryLocation"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "InventoryClinicalConsumption_movement_fkey" FOREIGN KEY ("clinicId", "movementId") REFERENCES public."InventoryStockMovement"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "InventoryClinicalConsumption_voidMovement_fkey" FOREIGN KEY ("clinicId", "voidMovementId") REFERENCES public."InventoryStockMovement"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "InventoryClinicalConsumption_actor_fkey" FOREIGN KEY ("clinicId", "actorMembershipId") REFERENCES public."ClinicMembership"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "inventory_clinical_consumption_values" CHECK (
        version > 0
        AND "quantity" > 0
        AND "wasteQuantity" >= 0
        AND (
            ("status" = 'RECORDED' AND "voidedAt" IS NULL AND "voidReason" IS NULL AND "voidMovementId" IS NULL)
            OR ("status" = 'VOIDED' AND "voidedAt" IS NOT NULL AND length(btrim("voidReason")) >= 3 AND "voidMovementId" IS NOT NULL)
        )
    )
);

CREATE UNIQUE INDEX "InventoryClinicalConsumption_clinicId_id_key" ON public."InventoryClinicalConsumption"("clinicId", "id");
CREATE UNIQUE INDEX "InventoryClinicalConsumption_clinicId_idempotencyKey_key" ON public."InventoryClinicalConsumption"("clinicId", "idempotencyKey") WHERE "idempotencyKey" IS NOT NULL;
CREATE INDEX "InventoryClinicalConsumption_clinicId_procedureExecutionId_idx" ON public."InventoryClinicalConsumption"("clinicId", "procedureExecutionId");
CREATE INDEX "InventoryClinicalConsumption_clinicId_batchId_idx" ON public."InventoryClinicalConsumption"("clinicId", "batchId");
CREATE INDEX "InventoryClinicalConsumption_clinicId_productId_idx" ON public."InventoryClinicalConsumption"("clinicId", "productId");
CREATE INDEX "InventoryClinicalConsumption_clinicId_status_createdAt_idx" ON public."InventoryClinicalConsumption"("clinicId", "status", "createdAt");

-- 6. Immutability & Integrity Triggers
CREATE TRIGGER inventory_batch_tenant_guard BEFORE UPDATE ON public."InventoryBatch" FOR EACH ROW EXECUTE FUNCTION lamssa_security.inventory_tenant_immutability_guard();
CREATE TRIGGER inventory_batch_balance_tenant_guard BEFORE UPDATE ON public."InventoryBatchBalance" FOR EACH ROW EXECUTE FUNCTION lamssa_security.inventory_tenant_immutability_guard();
CREATE TRIGGER inventory_consumption_tenant_guard BEFORE UPDATE ON public."InventoryClinicalConsumption" FOR EACH ROW EXECUTE FUNCTION lamssa_security.inventory_tenant_immutability_guard();

CREATE OR REPLACE FUNCTION lamssa_security.inventory_batch_integrity_guard() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD."status" = 'RECALLED' AND NEW."status" != 'RECALLED' THEN
      RAISE EXCEPTION 'Recalled batches cannot be reactivated' USING ERRCODE='42501';
    END IF;
    IF OLD."status" = 'EXPIRED' AND NEW."status" = 'AVAILABLE' THEN
      RAISE EXCEPTION 'Expired batches cannot be returned to available status' USING ERRCODE='42501';
    END IF;
    IF NEW."productId" IS DISTINCT FROM OLD."productId" OR
       NEW."batchNumber" IS DISTINCT FROM OLD."batchNumber" OR
       NEW."initialQuantity" IS DISTINCT FROM OLD."initialQuantity" THEN
      RAISE EXCEPTION 'Core batch identity and initial quantity cannot be modified' USING ERRCODE='42501';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Inventory batches cannot be deleted' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER inventory_batch_integrity_guard
BEFORE UPDATE OR DELETE ON public."InventoryBatch"
FOR EACH ROW EXECUTE FUNCTION lamssa_security.inventory_batch_integrity_guard();

CREATE OR REPLACE FUNCTION lamssa_security.inventory_batch_balance_integrity_guard() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Inventory batch balances cannot be deleted' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER inventory_batch_balance_integrity_guard
BEFORE DELETE ON public."InventoryBatchBalance"
FOR EACH ROW EXECUTE FUNCTION lamssa_security.inventory_batch_balance_integrity_guard();

CREATE OR REPLACE FUNCTION lamssa_security.inventory_consumption_immutability_guard() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Clinical consumptions cannot be deleted' USING ERRCODE='42501';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD."status" = 'VOIDED' THEN
      RAISE EXCEPTION 'Voided clinical consumptions are immutable' USING ERRCODE='42501';
    END IF;
    IF NEW."status" != 'VOIDED' THEN
      RAISE EXCEPTION 'Clinical consumptions can only be updated to VOIDED' USING ERRCODE='42501';
    END IF;
    IF NEW."clinicId" IS DISTINCT FROM OLD."clinicId" OR
       NEW."procedureExecutionId" IS DISTINCT FROM OLD."procedureExecutionId" OR
       NEW."productId" IS DISTINCT FROM OLD."productId" OR
       NEW."batchId" IS DISTINCT FROM OLD."batchId" OR
       NEW."locationId" IS DISTINCT FROM OLD."locationId" OR
       NEW."quantity" IS DISTINCT FROM OLD."quantity" OR
       NEW."wasteQuantity" IS DISTINCT FROM OLD."wasteQuantity" OR
       NEW."unit" IS DISTINCT FROM OLD."unit" OR
       NEW."movementId" IS DISTINCT FROM OLD."movementId" OR
       NEW."actorMembershipId" IS DISTINCT FROM OLD."actorMembershipId" OR
       NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
      RAISE EXCEPTION 'Core consumption attributes cannot be modified during voiding' USING ERRCODE='42501';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER inventory_consumption_immutability_guard
BEFORE UPDATE OR DELETE ON public."InventoryClinicalConsumption"
FOR EACH ROW EXECUTE FUNCTION lamssa_security.inventory_consumption_immutability_guard();

-- 7. FORCE ROW LEVEL SECURITY and Tenant Isolation
DO $$ DECLARE t text; owner_name text:=current_user; pred text; BEGIN
 FOREACH t IN ARRAY ARRAY['InventoryBatch','InventoryBatchBalance','InventoryClinicalConsumption'] LOOP
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

-- 8. Grants and Revocations
REVOKE ALL ON public."InventoryBatch",public."InventoryBatchBalance",public."InventoryClinicalConsumption" FROM PUBLIC;
REVOKE ALL ON FUNCTION lamssa_security.inventory_batch_integrity_guard(),lamssa_security.inventory_batch_balance_integrity_guard(),lamssa_security.inventory_consumption_immutability_guard() FROM PUBLIC;

DO $$ DECLARE r text; BEGIN
 FOR r IN SELECT DISTINCT grantee FROM information_schema.role_table_grants WHERE table_schema='public' AND table_name='Session' AND privilege_type='SELECT' AND grantee NOT IN(current_user,'PUBLIC') LOOP
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r AND (rolsuper OR rolbypassrls)) OR pg_has_role(r,current_user,'MEMBER') THEN RAISE EXCEPTION 'Unsafe runtime role'; END IF;
  EXECUTE format('GRANT SELECT,INSERT,UPDATE ON public."InventoryBatch",public."InventoryBatchBalance",public."InventoryClinicalConsumption" TO %I',r);
 END LOOP;
END $$;

COMMENT ON TABLE public."InventoryBatch" IS 'Clinic-scoped inventory product batches/lots with expiration and status tracking.';
COMMENT ON TABLE public."InventoryBatchBalance" IS 'Current on-hand stock balance per batch, product, and location.';
COMMENT ON TABLE public."InventoryClinicalConsumption" IS 'Auditable record of inventory lot consumption in clinical procedures with waste tracking and voiding support.';

COMMIT;
