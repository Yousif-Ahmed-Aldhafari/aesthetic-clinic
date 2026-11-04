-- Phase 4 Step 4.3 — Supplier Management, Purchase Orders, Goods Receiving, Stock Corrections & Inventory Alerts
BEGIN;

-- 1. Enums
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'InventorySupplierStatus') THEN
    CREATE TYPE public."InventorySupplierStatus" AS ENUM ('ACTIVE', 'INACTIVE');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PurchaseOrderStatus') THEN
    CREATE TYPE public."PurchaseOrderStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CLOSED', 'REJECTED', 'CANCELLED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'GoodsReceiptDisposition') THEN
    CREATE TYPE public."GoodsReceiptDisposition" AS ENUM ('ACCEPTED', 'QUARANTINED', 'REJECTED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'StockCountStatus') THEN
    CREATE TYPE public."StockCountStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'RECONCILED', 'CANCELLED');
  END IF;
END $$;

-- 2. InventorySupplier
CREATE TABLE public."InventorySupplier" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clinicId" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "nameAr" VARCHAR(150) NOT NULL,
    "nameEn" VARCHAR(150),
    "contactPerson" VARCHAR(100),
    "email" VARCHAR(150),
    "phone" VARCHAR(50),
    "address" TEXT,
    "taxNumber" VARCHAR(50),
    "commercialRegister" VARCHAR(50),
    "status" public."InventorySupplierStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "InventorySupplier_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "InventorySupplier_clinic_fkey" FOREIGN KEY ("clinicId") REFERENCES public."Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "inventory_supplier_values" CHECK (
        version > 0
        AND length(btrim("code")) >= 2
        AND length(btrim("nameAr")) >= 2
        AND ("email" IS NULL OR "email" ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
    )
);

CREATE UNIQUE INDEX "InventorySupplier_clinicId_id_key" ON public."InventorySupplier"("clinicId", "id");
CREATE UNIQUE INDEX "InventorySupplier_clinicId_code_key" ON public."InventorySupplier"("clinicId", "code");
CREATE INDEX "InventorySupplier_clinicId_status_createdAt_idx" ON public."InventorySupplier"("clinicId", "status", "createdAt");

-- 3. Link InventoryBatch to InventorySupplier
ALTER TABLE public."InventoryBatch" ADD COLUMN IF NOT EXISTS "supplierId" UUID;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'InventoryBatch_supplier_fkey'
  ) THEN
    ALTER TABLE public."InventoryBatch"
    ADD CONSTRAINT "InventoryBatch_supplier_fkey"
    FOREIGN KEY ("clinicId", "supplierId") REFERENCES public."InventorySupplier"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
  END IF;
END $$;

-- 4. InventoryPurchaseOrder
CREATE TABLE public."InventoryPurchaseOrder" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clinicId" UUID NOT NULL,
    "orderNumber" VARCHAR(50) NOT NULL,
    "supplierId" UUID NOT NULL,
    "destinationLocationId" UUID NOT NULL,
    "status" public."PurchaseOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "orderDate" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expectedDeliveryDate" VARCHAR(10),
    "currency" VARCHAR(3) NOT NULL,
    "subtotal" DECIMAL(12, 4) NOT NULL DEFAULT 0.0000,
    "taxAmount" DECIMAL(12, 4) NOT NULL DEFAULT 0.0000,
    "totalAmount" DECIMAL(12, 4) NOT NULL DEFAULT 0.0000,
    "notes" TEXT,
    "rejectionReason" TEXT,
    "cancellationReason" TEXT,
    "createdByMembershipId" UUID NOT NULL,
    "approvedByMembershipId" UUID,
    "approvedAt" TIMESTAMPTZ(3),
    "closedAt" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "InventoryPurchaseOrder_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "InventoryPurchaseOrder_clinic_fkey" FOREIGN KEY ("clinicId") REFERENCES public."Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "InventoryPurchaseOrder_supplier_fkey" FOREIGN KEY ("clinicId", "supplierId") REFERENCES public."InventorySupplier"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "InventoryPurchaseOrder_destinationLocation_fkey" FOREIGN KEY ("clinicId", "destinationLocationId") REFERENCES public."InventoryLocation"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "InventoryPurchaseOrder_createdBy_fkey" FOREIGN KEY ("clinicId", "createdByMembershipId") REFERENCES public."ClinicMembership"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "InventoryPurchaseOrder_approvedBy_fkey" FOREIGN KEY ("clinicId", "approvedByMembershipId") REFERENCES public."ClinicMembership"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "inventory_purchase_order_values" CHECK (
        version > 0
        AND length(btrim("orderNumber")) >= 2
        AND "subtotal" >= 0
        AND "taxAmount" >= 0
        AND "totalAmount" >= 0
        AND length("currency") = 3
        AND (
            ("status" IN ('DRAFT', 'SUBMITTED') AND "approvedAt" IS NULL AND "approvedByMembershipId" IS NULL)
            OR ("status" IN ('APPROVED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CLOSED') AND "approvedAt" IS NOT NULL AND "approvedByMembershipId" IS NOT NULL)
            OR ("status" IN ('REJECTED', 'CANCELLED'))
        )
    )
);

CREATE UNIQUE INDEX "InventoryPurchaseOrder_clinicId_id_key" ON public."InventoryPurchaseOrder"("clinicId", "id");
CREATE UNIQUE INDEX "InventoryPurchaseOrder_clinicId_orderNumber_key" ON public."InventoryPurchaseOrder"("clinicId", "orderNumber");
CREATE INDEX "InventoryPurchaseOrder_clinicId_status_orderDate_idx" ON public."InventoryPurchaseOrder"("clinicId", "status", "orderDate");
CREATE INDEX "InventoryPurchaseOrder_clinicId_supplierId_idx" ON public."InventoryPurchaseOrder"("clinicId", "supplierId");

-- 5. InventoryPurchaseOrderLine
CREATE TABLE public."InventoryPurchaseOrderLine" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clinicId" UUID NOT NULL,
    "purchaseOrderId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "lineNumber" INTEGER NOT NULL,
    "orderedQuantity" DECIMAL(12, 4) NOT NULL,
    "receivedQuantity" DECIMAL(12, 4) NOT NULL DEFAULT 0.0000,
    "unitCost" DECIMAL(12, 4) NOT NULL,
    "taxRate" DECIMAL(6, 4) NOT NULL DEFAULT 0.0000,
    "totalCost" DECIMAL(12, 4) NOT NULL,
    "notes" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "InventoryPurchaseOrderLine_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "InventoryPurchaseOrderLine_clinic_fkey" FOREIGN KEY ("clinicId") REFERENCES public."Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "InventoryPurchaseOrderLine_purchaseOrder_fkey" FOREIGN KEY ("clinicId", "purchaseOrderId") REFERENCES public."InventoryPurchaseOrder"("clinicId", "id") ON DELETE CASCADE ON UPDATE RESTRICT,
    CONSTRAINT "InventoryPurchaseOrderLine_product_fkey" FOREIGN KEY ("clinicId", "productId") REFERENCES public."InventoryProduct"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "inventory_purchase_order_line_values" CHECK (
        version > 0
        AND "lineNumber" > 0
        AND "orderedQuantity" > 0
        AND "receivedQuantity" >= 0
        AND "unitCost" >= 0
        AND "taxRate" >= 0 AND "taxRate" <= 1
        AND "totalCost" >= 0
    )
);

CREATE UNIQUE INDEX "InventoryPurchaseOrderLine_clinicId_id_key" ON public."InventoryPurchaseOrderLine"("clinicId", "id");
CREATE UNIQUE INDEX "InventoryPurchaseOrderLine_purchaseOrderId_lineNumber_key" ON public."InventoryPurchaseOrderLine"("purchaseOrderId", "lineNumber");
CREATE INDEX "InventoryPurchaseOrderLine_clinicId_productId_idx" ON public."InventoryPurchaseOrderLine"("clinicId", "productId");

-- 6. InventoryPurchaseOrderCounter
CREATE TABLE public."InventoryPurchaseOrderCounter" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clinicId" UUID NOT NULL,
    "lastNumber" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "InventoryPurchaseOrderCounter_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "InventoryPurchaseOrderCounter_clinic_fkey" FOREIGN KEY ("clinicId") REFERENCES public."Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "inventory_purchase_order_counter_values" CHECK ("lastNumber" >= 0)
);

CREATE UNIQUE INDEX "InventoryPurchaseOrderCounter_clinicId_key" ON public."InventoryPurchaseOrderCounter"("clinicId");

-- 7. InventoryGoodsReceipt
CREATE TABLE public."InventoryGoodsReceipt" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clinicId" UUID NOT NULL,
    "receiptNumber" VARCHAR(50) NOT NULL,
    "purchaseOrderId" UUID,
    "supplierId" UUID NOT NULL,
    "destinationLocationId" UUID NOT NULL,
    "receiptDate" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "supplierInvoiceNumber" VARCHAR(100),
    "supplierDeliveryNote" VARCHAR(100),
    "receiverMembershipId" UUID NOT NULL,
    "notes" TEXT,
    "idempotencyKey" VARCHAR(100),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "InventoryGoodsReceipt_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "InventoryGoodsReceipt_clinic_fkey" FOREIGN KEY ("clinicId") REFERENCES public."Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "InventoryGoodsReceipt_purchaseOrder_fkey" FOREIGN KEY ("clinicId", "purchaseOrderId") REFERENCES public."InventoryPurchaseOrder"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "InventoryGoodsReceipt_supplier_fkey" FOREIGN KEY ("clinicId", "supplierId") REFERENCES public."InventorySupplier"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "InventoryGoodsReceipt_destinationLocation_fkey" FOREIGN KEY ("clinicId", "destinationLocationId") REFERENCES public."InventoryLocation"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "InventoryGoodsReceipt_receiver_fkey" FOREIGN KEY ("clinicId", "receiverMembershipId") REFERENCES public."ClinicMembership"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "inventory_goods_receipt_values" CHECK (
        version > 0
        AND length(btrim("receiptNumber")) >= 2
    )
);

CREATE UNIQUE INDEX "InventoryGoodsReceipt_clinicId_id_key" ON public."InventoryGoodsReceipt"("clinicId", "id");
CREATE UNIQUE INDEX "InventoryGoodsReceipt_clinicId_receiptNumber_key" ON public."InventoryGoodsReceipt"("clinicId", "receiptNumber");
CREATE UNIQUE INDEX "InventoryGoodsReceipt_clinicId_idempotencyKey_key" ON public."InventoryGoodsReceipt"("clinicId", "idempotencyKey");
CREATE INDEX "InventoryGoodsReceipt_clinicId_supplierId_idx" ON public."InventoryGoodsReceipt"("clinicId", "supplierId");
CREATE INDEX "InventoryGoodsReceipt_clinicId_receiptDate_idx" ON public."InventoryGoodsReceipt"("clinicId", "receiptDate");

-- 8. InventoryGoodsReceiptLine
CREATE TABLE public."InventoryGoodsReceiptLine" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clinicId" UUID NOT NULL,
    "receiptId" UUID NOT NULL,
    "purchaseOrderLineId" UUID,
    "productId" UUID NOT NULL,
    "batchId" UUID,
    "locationId" UUID NOT NULL,
    "receivedQuantity" DECIMAL(12, 4) NOT NULL,
    "rejectedQuantity" DECIMAL(12, 4) NOT NULL DEFAULT 0.0000,
    "rejectionReason" TEXT,
    "unitCost" DECIMAL(12, 4) NOT NULL,
    "disposition" public."GoodsReceiptDisposition" NOT NULL DEFAULT 'ACCEPTED',
    "movementId" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "InventoryGoodsReceiptLine_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "InventoryGoodsReceiptLine_clinic_fkey" FOREIGN KEY ("clinicId") REFERENCES public."Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "InventoryGoodsReceiptLine_receipt_fkey" FOREIGN KEY ("clinicId", "receiptId") REFERENCES public."InventoryGoodsReceipt"("clinicId", "id") ON DELETE CASCADE ON UPDATE RESTRICT,
    CONSTRAINT "InventoryGoodsReceiptLine_purchaseOrderLine_fkey" FOREIGN KEY ("clinicId", "purchaseOrderLineId") REFERENCES public."InventoryPurchaseOrderLine"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "InventoryGoodsReceiptLine_product_fkey" FOREIGN KEY ("clinicId", "productId") REFERENCES public."InventoryProduct"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "InventoryGoodsReceiptLine_batch_fkey" FOREIGN KEY ("clinicId", "batchId") REFERENCES public."InventoryBatch"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "InventoryGoodsReceiptLine_location_fkey" FOREIGN KEY ("clinicId", "locationId") REFERENCES public."InventoryLocation"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "InventoryGoodsReceiptLine_movement_fkey" FOREIGN KEY ("clinicId", "movementId") REFERENCES public."InventoryStockMovement"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "inventory_goods_receipt_line_values" CHECK (
        version > 0
        AND "receivedQuantity" > 0
        AND "rejectedQuantity" >= 0
        AND "unitCost" >= 0
    )
);

CREATE UNIQUE INDEX "InventoryGoodsReceiptLine_clinicId_id_key" ON public."InventoryGoodsReceiptLine"("clinicId", "id");
CREATE INDEX "InventoryGoodsReceiptLine_clinicId_productId_idx" ON public."InventoryGoodsReceiptLine"("clinicId", "productId");
CREATE INDEX "InventoryGoodsReceiptLine_clinicId_receiptId_idx" ON public."InventoryGoodsReceiptLine"("clinicId", "receiptId");

-- 9. InventoryGoodsReceiptCounter
CREATE TABLE public."InventoryGoodsReceiptCounter" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clinicId" UUID NOT NULL,
    "lastNumber" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "InventoryGoodsReceiptCounter_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "InventoryGoodsReceiptCounter_clinic_fkey" FOREIGN KEY ("clinicId") REFERENCES public."Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "inventory_goods_receipt_counter_values" CHECK ("lastNumber" >= 0)
);

CREATE UNIQUE INDEX "InventoryGoodsReceiptCounter_clinicId_key" ON public."InventoryGoodsReceiptCounter"("clinicId");

-- 10. InventoryStockCount
CREATE TABLE public."InventoryStockCount" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clinicId" UUID NOT NULL,
    "countNumber" VARCHAR(50) NOT NULL,
    "locationId" UUID NOT NULL,
    "status" public."StockCountStatus" NOT NULL DEFAULT 'DRAFT',
    "countDate" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "counterMembershipId" UUID NOT NULL,
    "approvedByMembershipId" UUID,
    "approvedAt" TIMESTAMPTZ(3),
    "notes" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "InventoryStockCount_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "InventoryStockCount_clinic_fkey" FOREIGN KEY ("clinicId") REFERENCES public."Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "InventoryStockCount_location_fkey" FOREIGN KEY ("clinicId", "locationId") REFERENCES public."InventoryLocation"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "InventoryStockCount_counter_fkey" FOREIGN KEY ("clinicId", "counterMembershipId") REFERENCES public."ClinicMembership"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "InventoryStockCount_approvedBy_fkey" FOREIGN KEY ("clinicId", "approvedByMembershipId") REFERENCES public."ClinicMembership"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "inventory_stock_count_values" CHECK (
        version > 0
        AND length(btrim("countNumber")) >= 2
        AND (
            ("status" IN ('DRAFT', 'SUBMITTED', 'CANCELLED') AND "approvedAt" IS NULL AND "approvedByMembershipId" IS NULL)
            OR ("status" = 'RECONCILED' AND "approvedAt" IS NOT NULL AND "approvedByMembershipId" IS NOT NULL)
        )
    )
);

CREATE UNIQUE INDEX "InventoryStockCount_clinicId_id_key" ON public."InventoryStockCount"("clinicId", "id");
CREATE UNIQUE INDEX "InventoryStockCount_clinicId_countNumber_key" ON public."InventoryStockCount"("clinicId", "countNumber");
CREATE INDEX "InventoryStockCount_clinicId_locationId_status_idx" ON public."InventoryStockCount"("clinicId", "locationId", "status");

-- 11. InventoryStockCountItem
CREATE TABLE public."InventoryStockCountItem" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clinicId" UUID NOT NULL,
    "stockCountId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "batchId" UUID,
    "systemQuantity" DECIMAL(12, 4) NOT NULL,
    "countedQuantity" DECIMAL(12, 4) NOT NULL,
    "varianceQuantity" DECIMAL(12, 4) NOT NULL,
    "discrepancyReason" TEXT,
    "movementId" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "InventoryStockCountItem_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "InventoryStockCountItem_clinic_fkey" FOREIGN KEY ("clinicId") REFERENCES public."Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "InventoryStockCountItem_stockCount_fkey" FOREIGN KEY ("clinicId", "stockCountId") REFERENCES public."InventoryStockCount"("clinicId", "id") ON DELETE CASCADE ON UPDATE RESTRICT,
    CONSTRAINT "InventoryStockCountItem_product_fkey" FOREIGN KEY ("clinicId", "productId") REFERENCES public."InventoryProduct"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "InventoryStockCountItem_batch_fkey" FOREIGN KEY ("clinicId", "batchId") REFERENCES public."InventoryBatch"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "InventoryStockCountItem_movement_fkey" FOREIGN KEY ("clinicId", "movementId") REFERENCES public."InventoryStockMovement"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "inventory_stock_count_item_values" CHECK (
        version > 0
        AND "systemQuantity" >= 0
        AND "countedQuantity" >= 0
    )
);

CREATE UNIQUE INDEX "InventoryStockCountItem_clinicId_id_key" ON public."InventoryStockCountItem"("clinicId", "id");
CREATE INDEX "InventoryStockCountItem_clinicId_productId_idx" ON public."InventoryStockCountItem"("clinicId", "productId");
CREATE INDEX "InventoryStockCountItem_clinicId_stockCountId_idx" ON public."InventoryStockCountItem"("clinicId", "stockCountId");

-- 12. InventoryStockCountCounter
CREATE TABLE public."InventoryStockCountCounter" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clinicId" UUID NOT NULL,
    "lastNumber" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "InventoryStockCountCounter_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "InventoryStockCountCounter_clinic_fkey" FOREIGN KEY ("clinicId") REFERENCES public."Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "inventory_stock_count_counter_values" CHECK ("lastNumber" >= 0)
);

CREATE UNIQUE INDEX "InventoryStockCountCounter_clinicId_key" ON public."InventoryStockCountCounter"("clinicId");

-- 13. InventoryAlertAcknowledgment
CREATE TABLE public."InventoryAlertAcknowledgment" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clinicId" UUID NOT NULL,
    "alertKey" VARCHAR(150) NOT NULL,
    "acknowledgedByMembershipId" UUID NOT NULL,
    "acknowledgedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dismissedUntil" TIMESTAMPTZ(3),
    "notes" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "InventoryAlertAcknowledgment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "InventoryAlertAcknowledgment_clinic_fkey" FOREIGN KEY ("clinicId") REFERENCES public."Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "InventoryAlertAcknowledgment_acknowledgedBy_fkey" FOREIGN KEY ("clinicId", "acknowledgedByMembershipId") REFERENCES public."ClinicMembership"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "inventory_alert_ack_values" CHECK (
        version > 0
        AND length(btrim("alertKey")) >= 3
    )
);

CREATE UNIQUE INDEX "InventoryAlertAcknowledgment_clinicId_id_key" ON public."InventoryAlertAcknowledgment"("clinicId", "id");
CREATE UNIQUE INDEX "InventoryAlertAcknowledgment_clinicId_alertKey_key" ON public."InventoryAlertAcknowledgment"("clinicId", "alertKey");

-- 14. Tenant Guards (Immutable clinicId & id)
CREATE TRIGGER inventory_supplier_tenant_guard BEFORE UPDATE ON public."InventorySupplier" FOR EACH ROW EXECUTE FUNCTION lamssa_security.inventory_tenant_immutability_guard();
CREATE TRIGGER inventory_po_tenant_guard BEFORE UPDATE ON public."InventoryPurchaseOrder" FOR EACH ROW EXECUTE FUNCTION lamssa_security.inventory_tenant_immutability_guard();
CREATE TRIGGER inventory_po_line_tenant_guard BEFORE UPDATE ON public."InventoryPurchaseOrderLine" FOR EACH ROW EXECUTE FUNCTION lamssa_security.inventory_tenant_immutability_guard();
CREATE TRIGGER inventory_goods_receipt_tenant_guard BEFORE UPDATE ON public."InventoryGoodsReceipt" FOR EACH ROW EXECUTE FUNCTION lamssa_security.inventory_tenant_immutability_guard();
CREATE TRIGGER inventory_goods_receipt_line_tenant_guard BEFORE UPDATE ON public."InventoryGoodsReceiptLine" FOR EACH ROW EXECUTE FUNCTION lamssa_security.inventory_tenant_immutability_guard();
CREATE TRIGGER inventory_stock_count_tenant_guard BEFORE UPDATE ON public."InventoryStockCount" FOR EACH ROW EXECUTE FUNCTION lamssa_security.inventory_tenant_immutability_guard();
CREATE TRIGGER inventory_stock_count_item_tenant_guard BEFORE UPDATE ON public."InventoryStockCountItem" FOR EACH ROW EXECUTE FUNCTION lamssa_security.inventory_tenant_immutability_guard();
CREATE TRIGGER inventory_alert_ack_tenant_guard BEFORE UPDATE ON public."InventoryAlertAcknowledgment" FOR EACH ROW EXECUTE FUNCTION lamssa_security.inventory_tenant_immutability_guard();

-- 15. Domain Integrity Guards & Immutability Rules

-- Purchase Order Integrity Guard
CREATE OR REPLACE FUNCTION lamssa_security.inventory_po_integrity_guard() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."status" != 'DRAFT' THEN
      RAISE EXCEPTION 'Only draft purchase orders can be deleted' USING ERRCODE='42501';
    END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD."status" IN ('CLOSED', 'REJECTED', 'CANCELLED') THEN
      RAISE EXCEPTION 'Purchase orders in terminal status cannot be modified' USING ERRCODE='42501';
    END IF;
    IF OLD."status" = 'APPROVED' AND NEW."status" = 'DRAFT' THEN
      RAISE EXCEPTION 'Approved purchase orders cannot revert to draft' USING ERRCODE='42501';
    END IF;
    IF NEW."orderNumber" IS DISTINCT FROM OLD."orderNumber" OR
       NEW."supplierId" IS DISTINCT FROM OLD."supplierId" THEN
      RAISE EXCEPTION 'Core purchase order identity cannot be modified' USING ERRCODE='42501';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER inventory_po_integrity_guard
BEFORE UPDATE OR DELETE ON public."InventoryPurchaseOrder"
FOR EACH ROW EXECUTE FUNCTION lamssa_security.inventory_po_integrity_guard();

-- Purchase Order Line Integrity Guard
CREATE OR REPLACE FUNCTION lamssa_security.inventory_po_line_integrity_guard() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $$
DECLARE
  v_po_status public."PurchaseOrderStatus";
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT "status" INTO v_po_status FROM public."InventoryPurchaseOrder" WHERE id = OLD."purchaseOrderId";
    IF v_po_status IN ('APPROVED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CLOSED') THEN
      RAISE EXCEPTION 'Cannot delete lines from approved or received purchase orders' USING ERRCODE='42501';
    END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    SELECT "status" INTO v_po_status FROM public."InventoryPurchaseOrder" WHERE id = OLD."purchaseOrderId";
    IF v_po_status IN ('APPROVED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CLOSED') THEN
      IF NEW."orderedQuantity" IS DISTINCT FROM OLD."orderedQuantity" OR
         NEW."unitCost" IS DISTINCT FROM OLD."unitCost" OR
         NEW."taxRate" IS DISTINCT FROM OLD."taxRate" OR
         NEW."totalCost" IS DISTINCT FROM OLD."totalCost" OR
         NEW."productId" IS DISTINCT FROM OLD."productId" THEN
        RAISE EXCEPTION 'Core financial and quantity lines on approved purchase orders are immutable' USING ERRCODE='42501';
      END IF;
    END IF;
    IF NEW."productId" IS DISTINCT FROM OLD."productId" OR
       NEW."lineNumber" IS DISTINCT FROM OLD."lineNumber" THEN
      RAISE EXCEPTION 'Purchase order line product and numbering cannot be modified' USING ERRCODE='42501';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER inventory_po_line_integrity_guard
BEFORE UPDATE OR DELETE ON public."InventoryPurchaseOrderLine"
FOR EACH ROW EXECUTE FUNCTION lamssa_security.inventory_po_line_integrity_guard();

-- Goods Receipt Integrity Guard
CREATE OR REPLACE FUNCTION lamssa_security.inventory_goods_receipt_integrity_guard() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Goods receipts are immutable audit records and cannot be deleted' USING ERRCODE='42501';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW."receiptNumber" IS DISTINCT FROM OLD."receiptNumber" OR
       NEW."purchaseOrderId" IS DISTINCT FROM OLD."purchaseOrderId" OR
       NEW."supplierId" IS DISTINCT FROM OLD."supplierId" OR
       NEW."destinationLocationId" IS DISTINCT FROM OLD."destinationLocationId" OR
       NEW."receiverMembershipId" IS DISTINCT FROM OLD."receiverMembershipId" OR
       NEW."receiptDate" IS DISTINCT FROM OLD."receiptDate" THEN
      RAISE EXCEPTION 'Goods receipt header attributes cannot be modified' USING ERRCODE='42501';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER inventory_goods_receipt_integrity_guard
BEFORE UPDATE OR DELETE ON public."InventoryGoodsReceipt"
FOR EACH ROW EXECUTE FUNCTION lamssa_security.inventory_goods_receipt_integrity_guard();

-- Goods Receipt Line Integrity Guard (Append-only)
CREATE OR REPLACE FUNCTION lamssa_security.inventory_goods_receipt_line_integrity_guard() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Goods receipt lines are immutable and cannot be deleted' USING ERRCODE='42501';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'Goods receipt lines are immutable and cannot be updated' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER inventory_goods_receipt_line_integrity_guard
BEFORE UPDATE OR DELETE ON public."InventoryGoodsReceiptLine"
FOR EACH ROW EXECUTE FUNCTION lamssa_security.inventory_goods_receipt_line_integrity_guard();

-- Stock Count Integrity Guard
CREATE OR REPLACE FUNCTION lamssa_security.inventory_stock_count_integrity_guard() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."status" = 'RECONCILED' THEN
      RAISE EXCEPTION 'Reconciled stock counts cannot be deleted' USING ERRCODE='42501';
    END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD."status" IN ('RECONCILED', 'CANCELLED') THEN
      RAISE EXCEPTION 'Stock count in terminal status cannot be modified' USING ERRCODE='42501';
    END IF;
    IF NEW."countNumber" IS DISTINCT FROM OLD."countNumber" OR
       NEW."locationId" IS DISTINCT FROM OLD."locationId" THEN
      RAISE EXCEPTION 'Stock count number and location cannot be modified' USING ERRCODE='42501';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER inventory_stock_count_integrity_guard
BEFORE UPDATE OR DELETE ON public."InventoryStockCount"
FOR EACH ROW EXECUTE FUNCTION lamssa_security.inventory_stock_count_integrity_guard();

-- Stock Count Item Integrity Guard
CREATE OR REPLACE FUNCTION lamssa_security.inventory_stock_count_item_integrity_guard() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $$
DECLARE
  v_sc_status public."StockCountStatus";
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT "status" INTO v_sc_status FROM public."InventoryStockCount" WHERE id = OLD."stockCountId";
    IF v_sc_status = 'RECONCILED' THEN
      RAISE EXCEPTION 'Cannot delete items from a reconciled stock count' USING ERRCODE='42501';
    END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    SELECT "status" INTO v_sc_status FROM public."InventoryStockCount" WHERE id = OLD."stockCountId";
    IF v_sc_status = 'RECONCILED' THEN
      RAISE EXCEPTION 'Items in reconciled stock count are immutable' USING ERRCODE='42501';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER inventory_stock_count_item_integrity_guard
BEFORE UPDATE OR DELETE ON public."InventoryStockCountItem"
FOR EACH ROW EXECUTE FUNCTION lamssa_security.inventory_stock_count_item_integrity_guard();

-- 16. Security Hardening on Existing Inventory Tables (Direct SQL Bypass Prevention)

-- Guard on InventoryBalance (Block DELETE, and block changing productId/locationId)
CREATE OR REPLACE FUNCTION lamssa_security.inventory_balance_integrity_guard() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Inventory balances cannot be deleted' USING ERRCODE='42501';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW."productId" IS DISTINCT FROM OLD."productId" OR
       NEW."locationId" IS DISTINCT FROM OLD."locationId" THEN
      RAISE EXCEPTION 'Product and location identities on balance records cannot be modified' USING ERRCODE='42501';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'inventory_balance_integrity_guard'
  ) THEN
    CREATE TRIGGER inventory_balance_integrity_guard
    BEFORE UPDATE OR DELETE ON public."InventoryBalance"
    FOR EACH ROW EXECUTE FUNCTION lamssa_security.inventory_balance_integrity_guard();
  END IF;
END $$;

-- Update InventoryBatchBalance Guard (Prevent mutating batchId, productId, or locationId)
CREATE OR REPLACE FUNCTION lamssa_security.inventory_batch_balance_integrity_guard() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Inventory batch balances cannot be deleted' USING ERRCODE='42501';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW."batchId" IS DISTINCT FROM OLD."batchId" OR
       NEW."productId" IS DISTINCT FROM OLD."productId" OR
       NEW."locationId" IS DISTINCT FROM OLD."locationId" THEN
      RAISE EXCEPTION 'Batch, product and location identities on batch balance records cannot be modified' USING ERRCODE='42501';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'inventory_batch_balance_integrity_guard'
  ) THEN
    CREATE TRIGGER inventory_batch_balance_integrity_guard
    BEFORE UPDATE OR DELETE ON public."InventoryBatchBalance"
    FOR EACH ROW EXECUTE FUNCTION lamssa_security.inventory_batch_balance_integrity_guard();
  END IF;
END $$;

-- Guard on InventoryClinicalConsumption on INSERT (Prevent SQL bypass of recalled batch or mismatched product)
CREATE OR REPLACE FUNCTION lamssa_security.inventory_consumption_insert_guard() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $$
DECLARE
  v_batch_status public."InventoryBatchStatus";
  v_batch_product_id UUID;
BEGIN
  SELECT "status", "productId" INTO v_batch_status, v_batch_product_id
  FROM public."InventoryBatch"
  WHERE id = NEW."batchId" AND "clinicId" = NEW."clinicId";

  IF v_batch_status IS NULL THEN
    RAISE EXCEPTION 'Referenced batch not found in same clinic' USING ERRCODE='42501';
  END IF;

  IF v_batch_status = 'RECALLED' THEN
    RAISE EXCEPTION 'Cannot record clinical consumption for recalled batch' USING ERRCODE='42501';
  END IF;

  IF v_batch_product_id IS DISTINCT FROM NEW."productId" THEN
    RAISE EXCEPTION 'Referenced batch does not belong to specified product' USING ERRCODE='42501';
  END IF;

  RETURN NEW;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'inventory_consumption_insert_guard'
  ) THEN
    CREATE TRIGGER inventory_consumption_insert_guard
    BEFORE INSERT ON public."InventoryClinicalConsumption"
    FOR EACH ROW EXECUTE FUNCTION lamssa_security.inventory_consumption_insert_guard();
  END IF;
END $$;

-- Update clinical consumption check constraint to allow NO_RESTOCK voiding (where voidMovementId is NULL)
ALTER TABLE public."InventoryClinicalConsumption"
DROP CONSTRAINT IF EXISTS "inventory_clinical_consumption_values";

ALTER TABLE public."InventoryClinicalConsumption"
ADD CONSTRAINT "inventory_clinical_consumption_values" CHECK (
    version > 0
    AND "quantity" > 0
    AND "wasteQuantity" >= 0
    AND (
        ("status" = 'RECORDED' AND "voidedAt" IS NULL AND "voidReason" IS NULL AND "voidMovementId" IS NULL)
        OR ("status" = 'VOIDED' AND "voidedAt" IS NOT NULL AND length(btrim("voidReason")) >= 3)
    )
);

-- 17. FORCE ROW LEVEL SECURITY on all 11 new tables
DO $$ DECLARE t text; owner_name text:=current_user; pred text; BEGIN
 FOREACH t IN ARRAY ARRAY[
   'InventorySupplier',
   'InventoryPurchaseOrder',
   'InventoryPurchaseOrderLine',
   'InventoryPurchaseOrderCounter',
   'InventoryGoodsReceipt',
   'InventoryGoodsReceiptLine',
   'InventoryGoodsReceiptCounter',
   'InventoryStockCount',
   'InventoryStockCountItem',
   'InventoryStockCountCounter',
   'InventoryAlertAcknowledgment'
 ] LOOP
  pred:=format('CASE WHEN current_user=%L THEN false ELSE lamssa_security.context_allows("clinicId") END',owner_name);
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY maintenance_owner ON public.%I FOR ALL TO %I USING (true) WITH CHECK (true)',t,owner_name);
  EXECUTE format('CREATE POLICY tenant_select ON public.%I FOR SELECT USING (%s)',t,pred);
  EXECUTE format('CREATE POLICY tenant_insert ON public.%I FOR INSERT WITH CHECK (%s)',t,pred);
  EXECUTE format('CREATE POLICY tenant_update ON public.%I FOR UPDATE USING (%s) WITH CHECK (%s)',t,pred,pred);
  EXECUTE format('CREATE POLICY tenant_delete ON public.%I FOR DELETE USING (%s)',t,CASE WHEN t IN ('InventoryPurchaseOrderLine', 'InventoryStockCountItem') THEN pred ELSE 'false' END);
 END LOOP;
END $$;

-- 18. Revocations and Grants
REVOKE ALL ON
  public."InventorySupplier",
  public."InventoryPurchaseOrder",
  public."InventoryPurchaseOrderLine",
  public."InventoryPurchaseOrderCounter",
  public."InventoryGoodsReceipt",
  public."InventoryGoodsReceiptLine",
  public."InventoryGoodsReceiptCounter",
  public."InventoryStockCount",
  public."InventoryStockCountItem",
  public."InventoryStockCountCounter",
  public."InventoryAlertAcknowledgment"
FROM PUBLIC;

REVOKE ALL ON FUNCTION
  lamssa_security.inventory_po_integrity_guard(),
  lamssa_security.inventory_po_line_integrity_guard(),
  lamssa_security.inventory_goods_receipt_integrity_guard(),
  lamssa_security.inventory_goods_receipt_line_integrity_guard(),
  lamssa_security.inventory_stock_count_integrity_guard(),
  lamssa_security.inventory_stock_count_item_integrity_guard(),
  lamssa_security.inventory_balance_integrity_guard(),
  lamssa_security.inventory_consumption_insert_guard()
FROM PUBLIC;

DO $$ DECLARE r text; BEGIN
 FOR r IN SELECT DISTINCT grantee FROM information_schema.role_table_grants WHERE table_schema='public' AND table_name='Session' AND privilege_type='SELECT' AND grantee NOT IN(current_user,'PUBLIC') LOOP
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r AND (rolsuper OR rolbypassrls)) OR pg_has_role(r,current_user,'MEMBER') THEN RAISE EXCEPTION 'Unsafe runtime role'; END IF;
  EXECUTE format('GRANT SELECT,INSERT,UPDATE ON public."InventorySupplier",public."InventoryPurchaseOrder",public."InventoryPurchaseOrderLine",public."InventoryPurchaseOrderCounter",public."InventoryGoodsReceipt",public."InventoryGoodsReceiptLine",public."InventoryGoodsReceiptCounter",public."InventoryStockCount",public."InventoryStockCountItem",public."InventoryStockCountCounter",public."InventoryAlertAcknowledgment" TO %I',r);
  EXECUTE format('GRANT DELETE ON public."InventoryPurchaseOrderLine" TO %I',r);
 END LOOP;
END $$;

-- 19. Comments
COMMENT ON TABLE public."InventorySupplier" IS 'Clinic-scoped vendor/supplier catalog with tax and contact registration.';
COMMENT ON TABLE public."InventoryPurchaseOrder" IS 'Purchasing orders lifecycle from draft to approved, received, and closed.';
COMMENT ON TABLE public."InventoryPurchaseOrderLine" IS 'Individual line items of purchase orders with quantities, unit costs, and tax.';
COMMENT ON TABLE public."InventoryGoodsReceipt" IS 'Auditable receiving records for partial and full PO deliveries.';
COMMENT ON TABLE public."InventoryGoodsReceiptLine" IS 'Received and rejected delivery lines with batch allocation and stock posting.';
COMMENT ON TABLE public."InventoryStockCount" IS 'Physical inventory stocktaking sessions with reconciliation and adjustment controls.';
COMMENT ON TABLE public."InventoryStockCountItem" IS 'Counted vs system stock quantities and discrepancy explanations.';
COMMENT ON TABLE public."InventoryAlertAcknowledgment" IS 'Internal inventory alert acknowledgments and snoozing tracking.';

COMMIT;
