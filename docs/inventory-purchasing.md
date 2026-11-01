# Lamssa — Inventory Purchasing, Goods Receiving & Stock Operations

**Status:** Implemented (Phase 4, Step 4.3)  
**Security Classification:** Strict Tenant Isolation (PostgreSQL FORCE RLS), Financial Accuracy (`numeric(12, 4)` Decimal Math), Granular RBAC, Audit Logging.  
**Language Policy:** Architecture documentation in English; user interface authentic Arabic-first (RTL).

---

## 1. Executive Architecture Overview

Step 4.3 expands Lamssa's inventory domain from batch tracking and bedside consumption into comprehensive clinical supply chain management:
1. **Supplier Directory (`InventorySupplier`)**:
   - Clinic-scoped suppliers with unique uppercase codes per clinic.
   - Tax registration numbers and commercial registers for local fiscal compliance.
   - Active/Inactive lifecycle control.
2. **Purchase Orders (`InventoryPurchaseOrder` & `InventoryPurchaseOrderLine`)**:
   - Deterministic sequential order numbers (`PO-000001`) via atomic PostgreSQL counter `InventoryPurchaseOrderCounter`.
   - Immutable line items with exact decimal math: ordered quantity, unit cost, and tax rate.
   - Lifecycle state machine: `DRAFT` ➔ `SUBMITTED` ➔ `APPROVED` ➔ `PARTIALLY_RECEIVED` ➔ `RECEIVED` / `CLOSED` / `CANCELLED` / `REJECTED`.
3. **Goods Receiving (`InventoryGoodsReceipt` & `InventoryGoodsReceiptLine`)**:
   - Deterministic receipt numbers (`GR-000001`) via atomic counter `InventoryGoodsReceiptCounter`.
   - Line-by-line receipt against approved purchase orders with over-receipt prevention.
   - Immediate stock movement (`RECEIPT`) and balance updates for accepted items.
   - Batch and expiry tracking enforcement for products requiring batch tracking.
   - Quality disposition: `ACCEPTED`, `QUARANTINED`, `REJECTED`.
4. **Physical Stocktaking & Compensating Reconciliation (`InventoryStockCount` & `InventoryStockCountItem`)**:
   - Snapshotting current system balances per location/product at count creation (`SC-000001`).
   - Count entry with real-time discrepancy/variance calculation (`varianceQuantity = countedQuantity - systemQuantity`).
   - Atomic reconciliation: Posts compensating `ADJUSTMENT` stock movements and updates balances in a single transaction.
5. **Inventory Alerts & Notifications (`InventoryAlertAcknowledgment`)**:
   - Derivation of operational alerts: low stock (below `reorderThreshold`), stock-out, approaching expiry (<30/60/90 days), expired batches, and recalled batches.
   - Acknowledgement and snoozing with customizable durations and audit trail.

---

## 2. Database Schema & Migration Inventory

### 2.1 Enums Added
- `SupplierStatus`: `ACTIVE`, `INACTIVE`
- `PurchaseOrderStatus`: `DRAFT`, `SUBMITTED`, `APPROVED`, `PARTIALLY_RECEIVED`, `RECEIVED`, `CLOSED`, `CANCELLED`, `REJECTED`
- `GoodsReceiptDisposition`: `ACCEPTED`, `QUARANTINED`, `REJECTED`
- `StockCountStatus`: `DRAFT`, `COUNTING`, `SUBMITTED`, `RECONCILED`, `CANCELLED`

### 2.2 Tables & Models Added (Migration `20261101000300_inventory_purchasing_operations`)
1. `InventorySupplier`
2. `InventoryPurchaseOrder`
3. `InventoryPurchaseOrderLine`
4. `InventoryPurchaseOrderCounter`
5. `InventoryGoodsReceipt`
6. `InventoryGoodsReceiptLine`
7. `InventoryGoodsReceiptCounter`
8. `InventoryStockCount`
9. `InventoryStockCountItem`
10. `InventoryStockCountCounter`
11. `InventoryAlertAcknowledgment`

Total migrations: **24**. Total FORCE RLS tables: **45**. Security functions: **59**.

---

## 3. Security, Authorization & RLS Controls

- **FORCE ROW LEVEL SECURITY**: Every table enforces clinic isolation via PostgreSQL `FORCE ROW LEVEL SECURITY` and `lamssa_security.context_allows("clinicId")`.
- **Database Trigger Guards**:
  - `inventory_tenant_immutability_guard` blocks modifying `clinicId` on all inventory entities.
  - `inventory_balance_integrity_guard` blocks direct SQL deletion and prevents changing `productId` or `locationId`.
  - `inventory_consumption_insert_guard` prevents raw SQL insertion of clinical consumption referencing `RECALLED` batches or mismatched product IDs.
- **Granular Permissions & Least Privilege**:
  - Bedside recording: `clinical.inventory-consumption.record` (assigned strictly to `DOCTOR`; removed from administrative roles).
  - Supplier management: `inventory.suppliers.manage`, `inventory.suppliers.read`.
  - Purchasing: `inventory.purchase-orders.create`, `inventory.purchase-orders.approve`, `inventory.purchase-orders.read`.
  - Goods receipt: `inventory.goods-receipt.record`, `inventory.goods-receipt.read`.
  - Physical counts: `inventory.stock-counts.manage`, `inventory.stock-counts.reconcile`, `inventory.stock-counts.read`.
  - Operational alerts: `inventory.alerts.acknowledge`, `inventory.alerts.read`.

---

## 4. Financial & Calculation Invariants

- Quantities and costs are strictly typed as `Decimal` (`numeric(12, 4)` in PostgreSQL).
- Floating-point calculations (`number`) are completely avoided in financial ledger operations.
- Purchase order line math:
  $$\text{Line Subtotal} = \text{orderedQuantity} \times \text{unitCost}$$
  $$\text{Line Tax} = \text{Line Subtotal} \times \text{taxRate}$$
  $$\text{Line Total} = \text{Line Subtotal} + \text{Line Tax}$$
- Over-receipt validation:
  $$\sum \text{receivedQuantity} \le \text{orderedQuantity}$$
- Stocktaking variance calculation:
  $$\text{varianceQuantity} = \text{countedQuantity} - \text{systemQuantity}$$
  Compensating adjustment posting adjusts balances to exactly equal `countedQuantity`.

---

## 5. User Interface & Arabic RTL Workflows

- **`SupplierManagementPanel.tsx`**: Searchable and filterable directory of suppliers with tax IDs, commercial registers, and contact information.
- **`PurchaseOrderManagementPanel.tsx`**: Multi-line PO editor with live financial totals, status progression badges, and approval/rejection/cancellation controls.
- **`GoodsReceiptModal.tsx`**: Delivery note recording against approved orders with batch number and expiration date capture for batch-tracked items.
- **`StockCountPanel.tsx`**: Systematic physical stocktaking sessions with variance visibility and compensating reconciliation.
- **`InventoryAlertsBanner.tsx`**: Prominently displays low stock, expiring, and recalled batch notifications with snoozing options.
