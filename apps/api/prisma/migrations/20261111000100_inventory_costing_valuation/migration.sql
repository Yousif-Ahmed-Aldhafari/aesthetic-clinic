-- Phase 5 Step 5.4: Advanced Inventory Costing, Landed Cost Allocation & FIFO Valuation
BEGIN;

-- 1. Create Enums
DO $$ BEGIN
  CREATE TYPE "InventoryCostStatus" AS ENUM ('VERIFIED', 'UNVERIFIED_COST', 'ADJUSTED', 'EXHAUSTED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "InventoryCostProvenance" AS ENUM ('GOODS_RECEIPT', 'OPENING_BALANCE', 'TRANSFER_IN', 'ADJUSTMENT');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "LandedCostAllocationMethod" AS ENUM ('BY_QUANTITY', 'BY_VALUE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "LandedCostStatus" AS ENUM ('DRAFT', 'APPROVED', 'ADJUSTED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "CostMovementType" AS ENUM ('RECEIPT', 'ISSUE', 'CONSUMPTION', 'WASTE', 'TRANSFER_OUT', 'TRANSFER_IN', 'ADJUSTMENT');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "ValuationSnapshotStatus" AS ENUM ('PROVISIONAL', 'APPROVED', 'SUPERSEDED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "CostAdjustmentStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. Create InventoryCostLayer
CREATE TABLE IF NOT EXISTS public."InventoryCostLayer" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "clinicId" UUID NOT NULL,
  "productId" UUID NOT NULL,
  "branchId" UUID,
  "locationId" UUID,
  "batchId" UUID,
  "goodsReceiptLineId" UUID,
  "layerDate" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "initialQuantity" DECIMAL(12, 4) NOT NULL,
  "remainingQuantity" DECIMAL(12, 4) NOT NULL,
  "unitAcquisitionCostMinor" BIGINT NOT NULL DEFAULT 0,
  "unitLandedCostMinor" BIGINT NOT NULL DEFAULT 0,
  "totalRemainingCostMinor" BIGINT NOT NULL DEFAULT 0,
  "costStatus" "InventoryCostStatus" NOT NULL DEFAULT 'VERIFIED',
  "sourceProvenance" "InventoryCostProvenance" NOT NULL DEFAULT 'GOODS_RECEIPT',
  "currency" VARCHAR(3) NOT NULL DEFAULT 'SAR',
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "InventoryCostLayer_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "InventoryCostLayer_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES public."Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "InventoryCostLayer_product_fkey" FOREIGN KEY ("clinicId", "productId") REFERENCES public."InventoryProduct"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "InventoryCostLayer_branch_fkey" FOREIGN KEY ("clinicId", "branchId") REFERENCES public."ClinicBranch"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "InventoryCostLayer_location_fkey" FOREIGN KEY ("clinicId", "locationId") REFERENCES public."InventoryLocation"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "InventoryCostLayer_batch_fkey" FOREIGN KEY ("clinicId", "batchId") REFERENCES public."InventoryBatch"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "InventoryCostLayer_goods_receipt_line_fkey" FOREIGN KEY ("clinicId", "goodsReceiptLineId") REFERENCES public."InventoryGoodsReceiptLine"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "InventoryCostLayer_clinicId_id_key" UNIQUE ("clinicId", "id"),
  CONSTRAINT "InventoryCostLayer_non_negative_remaining" CHECK ("remainingQuantity" >= 0),
  CONSTRAINT "InventoryCostLayer_remaining_le_initial" CHECK ("remainingQuantity" <= "initialQuantity"),
  CONSTRAINT "InventoryCostLayer_positive_initial" CHECK ("initialQuantity" > 0),
  CONSTRAINT "InventoryCostLayer_non_negative_acq_cost" CHECK ("unitAcquisitionCostMinor" >= 0),
  CONSTRAINT "InventoryCostLayer_non_negative_landed_cost" CHECK ("unitLandedCostMinor" >= 0),
  CONSTRAINT "InventoryCostLayer_non_negative_total_cost" CHECK ("totalRemainingCostMinor" >= 0)
);

CREATE INDEX IF NOT EXISTS "InventoryCostLayer_clinicId_productId_costStatus_layerDate_idx"
  ON public."InventoryCostLayer"("clinicId", "productId", "costStatus", "layerDate");
CREATE INDEX IF NOT EXISTS "InventoryCostLayer_clinicId_branchId_costStatus_idx"
  ON public."InventoryCostLayer"("clinicId", "branchId", "costStatus");
CREATE INDEX IF NOT EXISTS "InventoryCostLayer_clinicId_batchId_idx"
  ON public."InventoryCostLayer"("clinicId", "batchId");

-- 3. Create InventoryLandedCost
CREATE TABLE IF NOT EXISTS public."InventoryLandedCost" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "clinicId" UUID NOT NULL,
  "allocationNumber" VARCHAR(50) NOT NULL,
  "purchaseOrderId" UUID,
  "goodsReceiptId" UUID,
  "freightCostMinor" BIGINT NOT NULL DEFAULT 0,
  "customsDutyMinor" BIGINT NOT NULL DEFAULT 0,
  "insuranceCostMinor" BIGINT NOT NULL DEFAULT 0,
  "handlingCostMinor" BIGINT NOT NULL DEFAULT 0,
  "otherChargesMinor" BIGINT NOT NULL DEFAULT 0,
  "discountCreditMinor" BIGINT NOT NULL DEFAULT 0,
  "totalLandedCostMinor" BIGINT NOT NULL DEFAULT 0,
  "allocationMethod" "LandedCostAllocationMethod" NOT NULL DEFAULT 'BY_VALUE',
  "status" "LandedCostStatus" NOT NULL DEFAULT 'DRAFT',
  "approvedByMembershipId" UUID,
  "approvedAt" TIMESTAMPTZ(3),
  "notes" VARCHAR(1000),
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "InventoryLandedCost_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "InventoryLandedCost_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES public."Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "InventoryLandedCost_po_fkey" FOREIGN KEY ("clinicId", "purchaseOrderId") REFERENCES public."InventoryPurchaseOrder"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "InventoryLandedCost_gr_fkey" FOREIGN KEY ("clinicId", "goodsReceiptId") REFERENCES public."InventoryGoodsReceipt"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "InventoryLandedCost_approver_fkey" FOREIGN KEY ("clinicId", "approvedByMembershipId") REFERENCES public."ClinicMembership"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "InventoryLandedCost_clinicId_id_key" UNIQUE ("clinicId", "id"),
  CONSTRAINT "InventoryLandedCost_clinicId_allocationNumber_key" UNIQUE ("clinicId", "allocationNumber"),
  CONSTRAINT "InventoryLandedCost_charges_non_negative" CHECK (
    "freightCostMinor" >= 0 AND
    "customsDutyMinor" >= 0 AND
    "insuranceCostMinor" >= 0 AND
    "handlingCostMinor" >= 0 AND
    "otherChargesMinor" >= 0 AND
    "discountCreditMinor" >= 0 AND
    "totalLandedCostMinor" >= 0
  )
);

CREATE INDEX IF NOT EXISTS "InventoryLandedCost_clinicId_status_idx"
  ON public."InventoryLandedCost"("clinicId", "status");

-- 4. Create InventoryLandedCostAllocationLine
CREATE TABLE IF NOT EXISTS public."InventoryLandedCostAllocationLine" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "clinicId" UUID NOT NULL,
  "landedCostId" UUID NOT NULL,
  "goodsReceiptLineId" UUID,
  "costLayerId" UUID,
  "allocatedAmountMinor" BIGINT NOT NULL DEFAULT 0,
  "roundingRemainderMinor" BIGINT NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "InventoryLandedCostAllocationLine_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "InventoryLandedCostAllocationLine_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES public."Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "InventoryLandedCostAllocationLine_landed_cost_fkey" FOREIGN KEY ("clinicId", "landedCostId") REFERENCES public."InventoryLandedCost"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "InventoryLandedCostAllocationLine_gr_line_fkey" FOREIGN KEY ("clinicId", "goodsReceiptLineId") REFERENCES public."InventoryGoodsReceiptLine"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "InventoryLandedCostAllocationLine_cost_layer_fkey" FOREIGN KEY ("clinicId", "costLayerId") REFERENCES public."InventoryCostLayer"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "InventoryLandedCostAllocationLine_clinicId_id_key" UNIQUE ("clinicId", "id")
);

CREATE INDEX IF NOT EXISTS "InventoryLandedCostAllocationLine_clinicId_landedCostId_idx"
  ON public."InventoryLandedCostAllocationLine"("clinicId", "landedCostId");

-- 5. Create InventoryCostMovement
CREATE TABLE IF NOT EXISTS public."InventoryCostMovement" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "clinicId" UUID NOT NULL,
  "movementNumber" VARCHAR(50) NOT NULL,
  "costLayerId" UUID NOT NULL,
  "stockMovementId" UUID,
  "consumptionId" UUID,
  "transferId" UUID,
  "movementType" "CostMovementType" NOT NULL,
  "quantity" DECIMAL(12, 4) NOT NULL,
  "unitCostMinor" BIGINT NOT NULL DEFAULT 0,
  "totalCostMinor" BIGINT NOT NULL DEFAULT 0,
  "wasteCostMinor" BIGINT NOT NULL DEFAULT 0,
  "notes" VARCHAR(1000),
  "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "InventoryCostMovement_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "InventoryCostMovement_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES public."Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "InventoryCostMovement_cost_layer_fkey" FOREIGN KEY ("clinicId", "costLayerId") REFERENCES public."InventoryCostLayer"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "InventoryCostMovement_stock_movement_fkey" FOREIGN KEY ("clinicId", "stockMovementId") REFERENCES public."InventoryStockMovement"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "InventoryCostMovement_consumption_fkey" FOREIGN KEY ("clinicId", "consumptionId") REFERENCES public."InventoryClinicalConsumption"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "InventoryCostMovement_transfer_fkey" FOREIGN KEY ("clinicId", "transferId") REFERENCES public."InterBranchTransfer"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "InventoryCostMovement_clinicId_id_key" UNIQUE ("clinicId", "id"),
  CONSTRAINT "InventoryCostMovement_clinicId_movementNumber_key" UNIQUE ("clinicId", "movementNumber"),
  CONSTRAINT "InventoryCostMovement_positive_quantity" CHECK ("quantity" > 0),
  CONSTRAINT "InventoryCostMovement_non_negative_costs" CHECK (
    "unitCostMinor" >= 0 AND
    "totalCostMinor" >= 0 AND
    "wasteCostMinor" >= 0
  )
);

CREATE INDEX IF NOT EXISTS "InventoryCostMovement_clinicId_costLayerId_occurredAt_idx"
  ON public."InventoryCostMovement"("clinicId", "costLayerId", "occurredAt");
CREATE INDEX IF NOT EXISTS "InventoryCostMovement_clinicId_movementType_occurredAt_idx"
  ON public."InventoryCostMovement"("clinicId", "movementType", "occurredAt");

-- 6. Create InventoryValuationSnapshot
CREATE TABLE IF NOT EXISTS public."InventoryValuationSnapshot" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "clinicId" UUID NOT NULL,
  "snapshotNumber" VARCHAR(50) NOT NULL,
  "snapshotDate" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "branchId" UUID,
  "totalUnits" DECIMAL(12, 4) NOT NULL,
  "totalValueMinor" BIGINT NOT NULL DEFAULT 0,
  "verifiedValueMinor" BIGINT NOT NULL DEFAULT 0,
  "unverifiedValueMinor" BIGINT NOT NULL DEFAULT 0,
  "transitValueMinor" BIGINT NOT NULL DEFAULT 0,
  "valuationMethod" VARCHAR(50) NOT NULL DEFAULT 'FIFO_ACTUAL_LANDED_COST',
  "breakdownJson" JSONB NOT NULL,
  "discrepancyCount" INTEGER NOT NULL DEFAULT 0,
  "discrepancyMinor" BIGINT NOT NULL DEFAULT 0,
  "status" "ValuationSnapshotStatus" NOT NULL DEFAULT 'PROVISIONAL',
  "approvedByMembershipId" UUID,
  "approvedAt" TIMESTAMPTZ(3),
  "notes" VARCHAR(1000),
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "InventoryValuationSnapshot_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "InventoryValuationSnapshot_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES public."Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "InventoryValuationSnapshot_branch_fkey" FOREIGN KEY ("clinicId", "branchId") REFERENCES public."ClinicBranch"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "InventoryValuationSnapshot_approver_fkey" FOREIGN KEY ("clinicId", "approvedByMembershipId") REFERENCES public."ClinicMembership"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "InventoryValuationSnapshot_clinicId_id_key" UNIQUE ("clinicId", "id"),
  CONSTRAINT "InventoryValuationSnapshot_clinicId_snapshotNumber_key" UNIQUE ("clinicId", "snapshotNumber"),
  CONSTRAINT "InventoryValuationSnapshot_non_negative_values" CHECK (
    "totalUnits" >= 0 AND
    "totalValueMinor" >= 0
  )
);

CREATE INDEX IF NOT EXISTS "InventoryValuationSnapshot_clinicId_status_snapshotDate_idx"
  ON public."InventoryValuationSnapshot"("clinicId", "status", "snapshotDate");

-- 7. Create InventoryCostAdjustment
CREATE TABLE IF NOT EXISTS public."InventoryCostAdjustment" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "clinicId" UUID NOT NULL,
  "adjustmentNumber" VARCHAR(50) NOT NULL,
  "costLayerId" UUID NOT NULL,
  "reason" VARCHAR(1000) NOT NULL,
  "previousUnitCostMinor" BIGINT NOT NULL DEFAULT 0,
  "newUnitCostMinor" BIGINT NOT NULL DEFAULT 0,
  "deltaUnitCostMinor" BIGINT NOT NULL DEFAULT 0,
  "quantityAffected" DECIMAL(12, 4) NOT NULL,
  "totalDeltaMinor" BIGINT NOT NULL DEFAULT 0,
  "status" "CostAdjustmentStatus" NOT NULL DEFAULT 'PENDING',
  "approvedByMembershipId" UUID,
  "approvedAt" TIMESTAMPTZ(3),
  "notes" VARCHAR(1000),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "InventoryCostAdjustment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "InventoryCostAdjustment_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES public."Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "InventoryCostAdjustment_cost_layer_fkey" FOREIGN KEY ("clinicId", "costLayerId") REFERENCES public."InventoryCostLayer"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "InventoryCostAdjustment_approver_fkey" FOREIGN KEY ("clinicId", "approvedByMembershipId") REFERENCES public."ClinicMembership"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "InventoryCostAdjustment_clinicId_id_key" UNIQUE ("clinicId", "id"),
  CONSTRAINT "InventoryCostAdjustment_clinicId_adjustmentNumber_key" UNIQUE ("clinicId", "adjustmentNumber"),
  CONSTRAINT "InventoryCostAdjustment_non_negative_costs" CHECK (
    "previousUnitCostMinor" >= 0 AND
    "newUnitCostMinor" >= 0 AND
    "quantityAffected" > 0
  )
);

CREATE INDEX IF NOT EXISTS "InventoryCostAdjustment_clinicId_costLayerId_idx"
  ON public."InventoryCostAdjustment"("clinicId", "costLayerId");
CREATE INDEX IF NOT EXISTS "InventoryCostAdjustment_clinicId_status_idx"
  ON public."InventoryCostAdjustment"("clinicId", "status");

-- 8. Create Sequential Counters
CREATE TABLE IF NOT EXISTS public."InventoryLandedCostCounter" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "clinicId" UUID NOT NULL,
  "lastNumber" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "InventoryLandedCostCounter_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "InventoryLandedCostCounter_clinicId_key" UNIQUE ("clinicId"),
  CONSTRAINT "InventoryLandedCostCounter_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES public."Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE TABLE IF NOT EXISTS public."InventoryCostMovementCounter" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "clinicId" UUID NOT NULL,
  "lastNumber" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "InventoryCostMovementCounter_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "InventoryCostMovementCounter_clinicId_key" UNIQUE ("clinicId"),
  CONSTRAINT "InventoryCostMovementCounter_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES public."Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE TABLE IF NOT EXISTS public."InventoryValuationSnapshotCounter" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "clinicId" UUID NOT NULL,
  "lastNumber" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "InventoryValuationSnapshotCounter_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "InventoryValuationSnapshotCounter_clinicId_key" UNIQUE ("clinicId"),
  CONSTRAINT "InventoryValuationSnapshotCounter_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES public."Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE TABLE IF NOT EXISTS public."InventoryCostAdjustmentCounter" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "clinicId" UUID NOT NULL,
  "lastNumber" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "InventoryCostAdjustmentCounter_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "InventoryCostAdjustmentCounter_clinicId_key" UNIQUE ("clinicId"),
  CONSTRAINT "InventoryCostAdjustmentCounter_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES public."Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT
);

-- 9. Row Level Security & Definer Triggers
DO $$ DECLARE t text; owner_name text:=current_user; pred text; BEGIN
 FOREACH t IN ARRAY ARRAY[
   'InventoryCostLayer',
   'InventoryLandedCost',
   'InventoryLandedCostAllocationLine',
   'InventoryCostMovement',
   'InventoryValuationSnapshot',
   'InventoryCostAdjustment',
   'InventoryLandedCostCounter',
   'InventoryCostMovementCounter',
   'InventoryValuationSnapshotCounter',
   'InventoryCostAdjustmentCounter'
 ] LOOP
  pred:=format('CASE WHEN current_user=%L THEN false ELSE lamssa_security.context_allows("clinicId") END',owner_name);
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('DROP POLICY IF EXISTS maintenance_owner ON public.%I',t);
  EXECUTE format('CREATE POLICY maintenance_owner ON public.%I FOR ALL TO %I USING (true) WITH CHECK (true)',t,owner_name);
  EXECUTE format('DROP POLICY IF EXISTS tenant_select ON public.%I',t);
  EXECUTE format('CREATE POLICY tenant_select ON public.%I FOR SELECT USING (%s)',t,pred);
  EXECUTE format('DROP POLICY IF EXISTS tenant_insert ON public.%I',t);
  EXECUTE format('CREATE POLICY tenant_insert ON public.%I FOR INSERT WITH CHECK (%s)',t,pred);
  EXECUTE format('DROP POLICY IF EXISTS tenant_update ON public.%I',t);
  EXECUTE format('CREATE POLICY tenant_update ON public.%I FOR UPDATE USING (%s) WITH CHECK (%s)',t,pred,pred);
  EXECUTE format('DROP POLICY IF EXISTS tenant_delete ON public.%I',t);
  EXECUTE format('CREATE POLICY tenant_delete ON public.%I FOR DELETE USING (false)',t);
 END LOOP;
END $$;

-- Immutability triggers on clinicId
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY[
   'InventoryCostLayer',
   'InventoryLandedCost',
   'InventoryLandedCostAllocationLine',
   'InventoryCostMovement',
   'InventoryValuationSnapshot',
   'InventoryCostAdjustment',
   'InventoryLandedCostCounter',
   'InventoryCostMovementCounter',
   'InventoryValuationSnapshotCounter',
   'InventoryCostAdjustmentCounter'
 ] LOOP
  EXECUTE format('DROP TRIGGER IF EXISTS immutable_clinic ON public.%I',t);
  EXECUTE format('CREATE TRIGGER immutable_clinic BEFORE UPDATE OF "clinicId" ON public.%I FOR EACH ROW EXECUTE FUNCTION lamssa_security.reject_clinic_reassignment()',t);
 END LOOP;
END $$;

-- 10. Runtime Grants
REVOKE ALL ON
  public."InventoryCostLayer",
  public."InventoryLandedCost",
  public."InventoryLandedCostAllocationLine",
  public."InventoryCostMovement",
  public."InventoryValuationSnapshot",
  public."InventoryCostAdjustment",
  public."InventoryLandedCostCounter",
  public."InventoryCostMovementCounter",
  public."InventoryValuationSnapshotCounter",
  public."InventoryCostAdjustmentCounter"
FROM PUBLIC;

DO $$
DECLARE r text;
BEGIN
  FOR r IN SELECT DISTINCT grantee FROM information_schema.role_table_grants
           WHERE table_schema = 'public' AND table_name = 'Session' AND privilege_type = 'SELECT' AND grantee NOT IN (current_user, 'PUBLIC') LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r AND (rolsuper OR rolbypassrls)) OR pg_has_role(r, current_user, 'MEMBER') THEN
      RAISE EXCEPTION 'Unsafe runtime role';
    END IF;
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON
      public."InventoryCostLayer",
      public."InventoryLandedCost",
      public."InventoryLandedCostAllocationLine",
      public."InventoryCostMovement",
      public."InventoryValuationSnapshot",
      public."InventoryCostAdjustment",
      public."InventoryLandedCostCounter",
      public."InventoryCostMovementCounter",
      public."InventoryValuationSnapshotCounter",
      public."InventoryCostAdjustmentCounter"
    TO %I', r);
  END LOOP;
END $$;

-- 11. Comments
COMMENT ON TABLE public."InventoryCostLayer" IS 'FIFO inventory acquisition cost layers with landed costs and remaining balances.';
COMMENT ON TABLE public."InventoryLandedCost" IS 'Landed cost allocation vouchers capturing freight, customs, insurance, and handling charges.';
COMMENT ON TABLE public."InventoryLandedCostAllocationLine" IS 'Deterministic allocation of landed costs to specific goods receipt lines and cost layers.';
COMMENT ON TABLE public."InventoryCostMovement" IS 'Immutable financial audit ledger of cost assignments, consumption, waste, and transfers.';
COMMENT ON TABLE public."InventoryValuationSnapshot" IS 'Periodic certified inventory valuation snapshots with FIFO landed costs.';
COMMENT ON TABLE public."InventoryCostAdjustment" IS 'Auditable cost adjustments and revaluations for FIFO inventory layers.';

COMMIT;
