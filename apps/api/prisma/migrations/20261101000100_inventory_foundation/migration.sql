-- Phase 4 Step 4.1 — Inventory Foundation, Product Catalog, Stock Locations & Auditable Stock Movements
BEGIN;

-- 1. Enums
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'InventoryCategory') THEN
    CREATE TYPE public."InventoryCategory" AS ENUM ('INJECTABLE', 'SKINCARE', 'CONSUMABLE', 'RETAIL', 'OTHER');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'InventoryUnit') THEN
    CREATE TYPE public."InventoryUnit" AS ENUM ('PIECE', 'VIAL', 'BOX', 'ML', 'SYRINGE');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'InventoryLocationType') THEN
    CREATE TYPE public."InventoryLocationType" AS ENUM ('MAIN_STORE', 'TREATMENT_ROOM', 'RETAIL_AREA', 'OTHER');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'InventoryMovementType') THEN
    CREATE TYPE public."InventoryMovementType" AS ENUM ('OPENING_BALANCE', 'RECEIPT', 'ISSUE', 'TRANSFER_OUT', 'TRANSFER_IN', 'ADJUSTMENT');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'InventoryReasonCode') THEN
    CREATE TYPE public."InventoryReasonCode" AS ENUM ('INITIAL_COUNT', 'PURCHASE_RECEIPT', 'CLINICAL_USE', 'EXPIRED', 'DAMAGED', 'DISCREPANCY_CORRECTION', 'INTERNAL_TRANSFER', 'RETURN');
  END IF;
END $$;

-- 2. InventoryProduct
CREATE TABLE public."InventoryProduct" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clinicId" UUID NOT NULL,
    "sku" VARCHAR(64) NOT NULL,
    "nameAr" VARCHAR(200) NOT NULL,
    "nameEn" VARCHAR(200),
    "category" public."InventoryCategory" NOT NULL,
    "description" VARCHAR(1000),
    "unit" public."InventoryUnit" NOT NULL,
    "requiresBatchTracking" BOOLEAN NOT NULL DEFAULT false,
    "reorderThreshold" DECIMAL(12, 4) NOT NULL DEFAULT 0.0000,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "InventoryProduct_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "InventoryProduct_clinic_fkey" FOREIGN KEY ("clinicId") REFERENCES public."Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "inventory_product_values" CHECK (
        version > 0
        AND length(btrim("sku")) >= 2
        AND length(btrim("nameAr")) >= 2
        AND "reorderThreshold" >= 0
    )
);

CREATE UNIQUE INDEX "InventoryProduct_clinicId_id_key" ON public."InventoryProduct"("clinicId", "id");
CREATE UNIQUE INDEX "InventoryProduct_clinicId_sku_key" ON public."InventoryProduct"("clinicId", "sku");
CREATE INDEX "InventoryProduct_clinicId_category_isActive_idx" ON public."InventoryProduct"("clinicId", "category", "isActive");
CREATE INDEX "InventoryProduct_clinicId_isActive_idx" ON public."InventoryProduct"("clinicId", "isActive");

-- 3. InventoryLocation
CREATE TABLE public."InventoryLocation" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clinicId" UUID NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "nameAr" VARCHAR(150) NOT NULL,
    "nameEn" VARCHAR(150),
    "type" public."InventoryLocationType" NOT NULL DEFAULT 'MAIN_STORE',
    "description" VARCHAR(500),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "InventoryLocation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "InventoryLocation_clinic_fkey" FOREIGN KEY ("clinicId") REFERENCES public."Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "inventory_location_values" CHECK (
        version > 0
        AND length(btrim("code")) >= 2
        AND length(btrim("nameAr")) >= 2
    )
);

CREATE UNIQUE INDEX "InventoryLocation_clinicId_id_key" ON public."InventoryLocation"("clinicId", "id");
CREATE UNIQUE INDEX "InventoryLocation_clinicId_code_key" ON public."InventoryLocation"("clinicId", "code");
CREATE INDEX "InventoryLocation_clinicId_type_isActive_idx" ON public."InventoryLocation"("clinicId", "type", "isActive");

-- 4. InventoryStockMovement (Append-Only Ledger)
CREATE TABLE public."InventoryStockMovement" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clinicId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "locationId" UUID NOT NULL,
    "sourceLocationId" UUID,
    "movementType" public."InventoryMovementType" NOT NULL,
    "quantity" DECIMAL(12, 4) NOT NULL,
    "balanceAfter" DECIMAL(12, 4) NOT NULL,
    "reasonCode" public."InventoryReasonCode" NOT NULL,
    "reasonExplanation" VARCHAR(1000),
    "actorMembershipId" UUID NOT NULL,
    "idempotencyKey" VARCHAR(100),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryStockMovement_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "InventoryStockMovement_clinic_fkey" FOREIGN KEY ("clinicId") REFERENCES public."Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "InventoryStockMovement_product_fkey" FOREIGN KEY ("clinicId", "productId") REFERENCES public."InventoryProduct"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "InventoryStockMovement_location_fkey" FOREIGN KEY ("clinicId", "locationId") REFERENCES public."InventoryLocation"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "InventoryStockMovement_sourceLocation_fkey" FOREIGN KEY ("clinicId", "sourceLocationId") REFERENCES public."InventoryLocation"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "InventoryStockMovement_actor_fkey" FOREIGN KEY ("clinicId", "actorMembershipId") REFERENCES public."ClinicMembership"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "inventory_movement_values" CHECK (
        "quantity" != 0
        AND "balanceAfter" >= 0
        AND (
            ("movementType" = 'OPENING_BALANCE' AND "quantity" > 0 AND "reasonCode" = 'INITIAL_COUNT')
            OR ("movementType" = 'RECEIPT' AND "quantity" > 0 AND "reasonCode" IN ('PURCHASE_RECEIPT', 'RETURN'))
            OR ("movementType" = 'ISSUE' AND "quantity" < 0 AND "reasonCode" IN ('CLINICAL_USE', 'EXPIRED', 'DAMAGED', 'DISCREPANCY_CORRECTION'))
            OR ("movementType" = 'TRANSFER_OUT' AND "quantity" < 0 AND "reasonCode" = 'INTERNAL_TRANSFER' AND "sourceLocationId" IS NOT NULL)
            OR ("movementType" = 'TRANSFER_IN' AND "quantity" > 0 AND "reasonCode" = 'INTERNAL_TRANSFER' AND "sourceLocationId" IS NOT NULL)
            OR ("movementType" = 'ADJUSTMENT' AND "quantity" != 0 AND "reasonCode" IN ('DISCREPANCY_CORRECTION', 'DAMAGED', 'EXPIRED') AND length(btrim("reasonExplanation")) >= 3)
        )
    )
);

CREATE UNIQUE INDEX "InventoryStockMovement_clinicId_id_key" ON public."InventoryStockMovement"("clinicId", "id");
CREATE UNIQUE INDEX "InventoryStockMovement_clinicId_idempotencyKey_key" ON public."InventoryStockMovement"("clinicId", "idempotencyKey") WHERE "idempotencyKey" IS NOT NULL;
CREATE INDEX "InventoryStockMovement_clinicId_product_location_created_idx" ON public."InventoryStockMovement"("clinicId", "productId", "locationId", "createdAt");
CREATE INDEX "InventoryStockMovement_clinicId_movementType_created_idx" ON public."InventoryStockMovement"("clinicId", "movementType", "createdAt");
CREATE INDEX "InventoryStockMovement_clinicId_actor_created_idx" ON public."InventoryStockMovement"("clinicId", "actorMembershipId", "createdAt");

-- 5. InventoryBalance (Transactional Materialized Balance)
CREATE TABLE public."InventoryBalance" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clinicId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "locationId" UUID NOT NULL,
    "onHandQuantity" DECIMAL(12, 4) NOT NULL DEFAULT 0.0000,
    "lastMovementId" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "InventoryBalance_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "InventoryBalance_clinic_fkey" FOREIGN KEY ("clinicId") REFERENCES public."Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "InventoryBalance_product_fkey" FOREIGN KEY ("clinicId", "productId") REFERENCES public."InventoryProduct"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "InventoryBalance_location_fkey" FOREIGN KEY ("clinicId", "locationId") REFERENCES public."InventoryLocation"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "InventoryBalance_lastMovement_fkey" FOREIGN KEY ("clinicId", "lastMovementId") REFERENCES public."InventoryStockMovement"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "inventory_balance_values" CHECK (
        version > 0
        AND "onHandQuantity" >= 0
    )
);

CREATE UNIQUE INDEX "InventoryBalance_clinicId_id_key" ON public."InventoryBalance"("clinicId", "id");
CREATE UNIQUE INDEX "InventoryBalance_clinicId_productId_locationId_key" ON public."InventoryBalance"("clinicId", "productId", "locationId");
CREATE INDEX "InventoryBalance_clinicId_locationId_idx" ON public."InventoryBalance"("clinicId", "locationId");
CREATE INDEX "InventoryBalance_clinicId_productId_idx" ON public."InventoryBalance"("clinicId", "productId");

-- 6. Immutability & Integrity Triggers
CREATE OR REPLACE FUNCTION lamssa_security.inventory_movement_immutability_guard() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Inventory movements are append-only and cannot be deleted' USING ERRCODE='42501';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'Inventory movements are append-only and cannot be updated' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER inventory_movement_immutability_guard
BEFORE UPDATE OR DELETE ON public."InventoryStockMovement"
FOR EACH ROW EXECUTE FUNCTION lamssa_security.inventory_movement_immutability_guard();

CREATE OR REPLACE FUNCTION lamssa_security.inventory_tenant_immutability_guard() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW."clinicId" IS DISTINCT FROM OLD."clinicId" THEN
    RAISE EXCEPTION 'Clinic ID is immutable' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER inventory_product_tenant_guard BEFORE UPDATE ON public."InventoryProduct" FOR EACH ROW EXECUTE FUNCTION lamssa_security.inventory_tenant_immutability_guard();
CREATE TRIGGER inventory_location_tenant_guard BEFORE UPDATE ON public."InventoryLocation" FOR EACH ROW EXECUTE FUNCTION lamssa_security.inventory_tenant_immutability_guard();
CREATE TRIGGER inventory_balance_tenant_guard BEFORE UPDATE ON public."InventoryBalance" FOR EACH ROW EXECUTE FUNCTION lamssa_security.inventory_tenant_immutability_guard();

-- 7. FORCE ROW LEVEL SECURITY and Tenant Isolation
DO $$ DECLARE t text; owner_name text:=current_user; pred text; BEGIN
 FOREACH t IN ARRAY ARRAY['InventoryProduct','InventoryLocation','InventoryStockMovement','InventoryBalance'] LOOP
  pred:=format('CASE WHEN current_user=%L THEN false ELSE lamssa_security.context_allows("clinicId") END',owner_name);
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY maintenance_owner ON public.%I FOR ALL TO %I USING (true) WITH CHECK (true)',t,owner_name);
  EXECUTE format('CREATE POLICY tenant_select ON public.%I FOR SELECT USING (%s)',t,pred);
  EXECUTE format('CREATE POLICY tenant_insert ON public.%I FOR INSERT WITH CHECK (%s)',t,pred);
  IF t = 'InventoryStockMovement' THEN
    EXECUTE format('CREATE POLICY tenant_update ON public.%I FOR UPDATE USING (false)',t);
  ELSE
    EXECUTE format('CREATE POLICY tenant_update ON public.%I FOR UPDATE USING (%s) WITH CHECK (%s)',t,pred,pred);
  END IF;
  EXECUTE format('CREATE POLICY tenant_delete ON public.%I FOR DELETE USING (false)',t);
 END LOOP;
END $$;

-- 8. Grants and Revocations
REVOKE ALL ON public."InventoryProduct",public."InventoryLocation",public."InventoryStockMovement",public."InventoryBalance" FROM PUBLIC;
REVOKE ALL ON FUNCTION lamssa_security.inventory_movement_immutability_guard(),lamssa_security.inventory_tenant_immutability_guard() FROM PUBLIC;

DO $$ DECLARE r text; BEGIN
 FOR r IN SELECT DISTINCT grantee FROM information_schema.role_table_grants WHERE table_schema='public' AND table_name='Session' AND privilege_type='SELECT' AND grantee NOT IN(current_user,'PUBLIC') LOOP
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r AND (rolsuper OR rolbypassrls)) OR pg_has_role(r,current_user,'MEMBER') THEN RAISE EXCEPTION 'Unsafe runtime role'; END IF;
  EXECUTE format('GRANT SELECT,INSERT,UPDATE ON public."InventoryProduct",public."InventoryLocation",public."InventoryBalance" TO %I',r);
  EXECUTE format('GRANT SELECT,INSERT ON public."InventoryStockMovement" TO %I',r);
 END LOOP;
END $$;

COMMENT ON TABLE public."InventoryProduct" IS 'Clinic-scoped inventory products with categories, units, and reorder thresholds.';
COMMENT ON TABLE public."InventoryLocation" IS 'Clinic-scoped inventory storage and usage locations.';
COMMENT ON TABLE public."InventoryStockMovement" IS 'Append-only auditable stock ledger recording every stock transition.';
COMMENT ON TABLE public."InventoryBalance" IS 'Current on-hand stock balance per product and location, transactional with ledger.';

COMMIT;

