# Inventory Foundation, Product Catalog, Stock Locations & Auditable Stock Movements

This document details the architectural foundation, database model, security policies, transactional ledger, and API endpoints for Phase 4 Step 4.1 inventory management in Lamssa.

---

## 1. Architectural Overview & Domain Scope

Lamssa's inventory subsystem manages aesthetic clinic products, pharmaceuticals, consumables, and retail items across multiple physical and logical stock locations with mathematical integrity and complete auditability.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Inventory Domain                               │
├──────────────────────────────┬──────────────────────────────────────────────┤
│ Product Catalog              │ Storage Locations                            │
│ - InventoryProduct           │ - InventoryLocation                          │
│ - Category & Unit Enums      │ - Location Types (MAIN_WAREHOUSE, etc.)      │
│ - SKU & Arabic/English Names │ - Active / Inactive Status                   │
│ - Reorder Thresholds         │ - Clinic-scoped Isolation                    │
├──────────────────────────────┴──────────────────────────────────────────────┤
│                         Double-Entry / Balance Layer                        │
├──────────────────────────────┬──────────────────────────────────────────────┤
│ Append-Only Stock Ledger     │ Real-Time Balances                           │
│ - InventoryStockMovement     │ - InventoryBalance                           │
│ - Movement Types & Reasons   │ - Row-Level Locking (Pessimistic)            │
│ - Balance-After Snapshot     │ - On-Hand Quantity (Decimal 12,4)            │
│ - Immutability Trigger Guard │ - Optimistic Version Concurrency             │
└──────────────────────────────┴──────────────────────────────────────────────┘
```

### 1.1 Scope Boundaries (Step 4.1 vs Future Steps)
- **In Scope for Step 4.1**:
  - Clinic-scoped product catalog (`InventoryProduct`) with categories, units, and reorder thresholds.
  - Multi-location hierarchy (`InventoryLocation`) for main warehouses, pharmacy storage, and treatment rooms.
  - Append-only transactional stock ledger (`InventoryStockMovement`) guarded by database triggers against updates or deletions.
  - Transactional balances (`InventoryBalance`) maintained atomically inside PostgreSQL transactions.
  - Stock movements: opening balances, purchase receipts, issues with structured reason codes, inter-location transfers, and discrepancy adjustments.
  - Regulatory clinical consumption gate: products marked with `requiresBatchTracking: true` (e.g. injectables like Botox and dermal fillers) are blocked from generic clinical issue with message:
    `"Batch and expiry tracking is required for clinical consumption of this product (Phase 4 Step 4.2)"`.
  - Ledger reconciliation endpoint (`/stock/reconcile`) verifying `InventoryBalance.onHandQuantity == SUM(movements.quantity)`.
  - Comprehensive RBAC permissions and PostgreSQL `FORCE ROW LEVEL SECURITY`.
  - Arabic-first RTL web workspace for inventory operations.

- **Explicitly Out of Scope for Step 4.1**:
  - Specific batch/lot numbers and expiry date allocation (Step 4.2).
  - First-Expired, First-Out (FEFO) automated allocation (Step 4.2).
  - Automated stock deduction triggered directly from procedure executions (Step 4.2).
  - Supplier purchase orders, vendor catalogs, and supplier invoices (Step 4.3).
  - Point-of-Sale (POS) retail billing integration and package consumption (Steps 4.4–4.5).

---

## 2. Data Model & Database Architecture

Migration `20261101000100_inventory_foundation` defines four core tables with multi-tenant isolation, composite foreign keys `(clinicId, id)`, check constraints, and database triggers.

### 2.1 Enums

| Enum | Values |
|---|---|
| `InventoryCategory` | `INJECTABLE`, `MEDICATION`, `SKINCARE`, `CONSUMABLE`, `RETAIL`, `EQUIPMENT_PART`, `OTHER` |
| `InventoryUnit` | `UNIT`, `VIAL`, `AMPOULE`, `SYRINGE`, `BOX`, `ML`, `GRAM`, `PACK` |
| `InventoryLocationType` | `MAIN_WAREHOUSE`, `PHARMACY`, `TREATMENT_ROOM`, `STORAGE_CABINET`, `RETAIL_COUNTER` |
| `InventoryMovementType` | `OPENING_BALANCE`, `RECEIPT`, `ISSUE`, `TRANSFER_IN`, `TRANSFER_OUT`, `ADJUSTMENT` |
| `InventoryReasonCode` | `OPENING_SETUP`, `PURCHASE_RECEIPT`, `CLINICAL_USE`, `EXPIRED`, `DAMAGED`, `DISCREPANCY_FOUND`, `LOCATION_TRANSFER`, `INTERNAL_USE`, `OTHER` |

### 2.2 Tables

#### `InventoryProduct`
Defines products and medical items owned by a clinic.
- `id`: UUID primary key.
- `clinicId`: UUID referencing `Clinic(id)`.
- `sku`: Unique stock keeping unit within the clinic (`UNIQUE(clinicId, sku)`).
- `nameAr`: Mandatory Arabic name (1–150 chars).
- `nameEn`: Optional English name (max 150 chars).
- `category`: `InventoryCategory`.
- `unit`: `InventoryUnit`.
- `reorderThreshold`: `numeric(12, 4)` minimum stock level before alert.
- `requiresBatchTracking`: Boolean flag identifying regulated items (e.g. injectables).
- `description`: Optional text.
- `version`: Integer for optimistic concurrency.
- `isActive`: Boolean status flag.

#### `InventoryLocation`
Physical or logical locations where stock is stored.
- `id`: UUID primary key.
- `clinicId`: UUID referencing `Clinic(id)`.
- `code`: Unique location code within the clinic (`UNIQUE(clinicId, code)`).
- `nameAr`: Arabic location name.
- `nameEn`: Optional English name.
- `type`: `InventoryLocationType`.
- `isActive`: Boolean status flag.
- `version`: Integer for optimistic concurrency.

#### `InventoryBalance`
Real-time on-hand stock balance per product and location.
- `id`: UUID primary key.
- `clinicId`: UUID referencing `Clinic(id)`.
- `productId`: UUID referencing `InventoryProduct(id)`.
- `locationId`: UUID referencing `InventoryLocation(id)`.
- `onHandQuantity`: `numeric(12, 4)` checking `onHandQuantity >= 0` (negative balances blocked).
- `version`: Integer for optimistic locking.
- `Composite Unique`: `UNIQUE(clinicId, productId, locationId)`.
- `Composite Foreign Keys`:
  - `(clinicId, productId)` -> `InventoryProduct(clinicId, id)`
  - `(clinicId, locationId)` -> `InventoryLocation(clinicId, id)`

#### `InventoryStockMovement`
Append-only auditable ledger recording every transaction affecting stock levels.
- `id`: UUID primary key.
- `clinicId`: UUID referencing `Clinic(id)`.
- `productId`: UUID referencing `InventoryProduct(id)`.
- `locationId`: UUID referencing `InventoryLocation(id)`.
- `transferLocationId`: Optional UUID referencing destination/source location for transfers.
- `movementType`: `InventoryMovementType`.
- `quantity`: `numeric(12, 4)` (positive for inflows, negative for outflows).
- `balanceAfter`: `numeric(12, 4)` snapshot of resulting balance at the location.
- `reasonCode`: `InventoryReasonCode`.
- `reasonExplanation`: Optional explanation (mandatory when `OTHER`).
- `referenceType`: Optional metadata string (e.g. `OPENING_BALANCE`, `TRANSFER`).
- `referenceId`: Optional metadata UUID.
- `idempotencyKey`: Optional unique key per clinic preventing duplicate postings.
- `performedByUserId`: UUID referencing `User(id)`.
- `occurredAt`: Timestamp.
- `createdAt`: Timestamp.

---

## 3. Database Security & Immutability Triggers

### 3.1 Immutability Trigger Guard
`InventoryStockMovement` is protected by `inventory_movement_immutability_guard()` in `lamssa_security`:
```sql
CREATE OR REPLACE FUNCTION lamssa_security.inventory_movement_immutability_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RAISE EXCEPTION 'Inventory stock movements are strictly append-only and cannot be updated or deleted'
    USING ERRCODE = '42501';
END;
$$;
```
Any raw `UPDATE` or `DELETE` statement issued against `InventoryStockMovement` is rejected with SQL error code `42501`.

### 3.2 Tenant Key Immutability
`inventory_tenant_immutability_guard()` prevents reassignment of `clinicId` on products, locations, and balances.

### 3.3 Restricted Runtime Privileges
Under the least-privilege runtime role `lamssa_runtime`:
- `InventoryProduct`: `SELECT, INSERT, UPDATE` (no `DELETE`).
- `InventoryLocation`: `SELECT, INSERT, UPDATE` (no `DELETE`).
- `InventoryBalance`: `SELECT, INSERT, UPDATE` (no `DELETE`).
- `InventoryStockMovement`: `SELECT, INSERT` (no `UPDATE`, no `DELETE`).

### 3.4 FORCE ROW LEVEL SECURITY
All 4 tables have `ALTER TABLE ... FORCE ROW LEVEL SECURITY` enabled:
```sql
CREATE POLICY inventory_product_tenant_isolation ON "InventoryProduct"
  FOR ALL TO lamssa_runtime
  USING ("clinicId" = lamssa_security.current_tenant_id())
  WITH CHECK ("clinicId" = lamssa_security.current_tenant_id());
```

---

## 4. Business Logic & Transactional Invariants

### 4.1 Atomic Balance Posting
Stock movements and balance updates always execute within an atomic PostgreSQL transaction using row-level locking (`SELECT ... FOR UPDATE`):
1. Lock existing `InventoryBalance` or create a zero-balance row.
2. Verify that `currentBalance + deltaQuantity >= 0`. Overdraws throw `INVENTORY_INSUFFICIENT_STOCK`.
3. Update `InventoryBalance.onHandQuantity = currentBalance + deltaQuantity`.
4. Insert `InventoryStockMovement` recording `quantity = deltaQuantity` and `balanceAfter = newBalance`.

### 4.2 Regulatory Clinical Consumption Gate
To ensure regulatory compliance for aesthetic injectables:
- If `InventoryProduct.requiresBatchTracking === true` AND `movementType === 'ISSUE'` AND `reasonCode === 'CLINICAL_USE'`:
- The API blocks the transaction and returns HTTP 400:
  `"Batch and expiry tracking is required for clinical consumption of this product (Phase 4 Step 4.2)"`.
- Non-clinical issues (such as `EXPIRED`, `DAMAGED`, or `OTHER` disposal) are permitted for these products.

### 4.3 Inter-Location Transfers
A transfer creates two atomic ledger entries within a single database transaction:
1. Source location: `TRANSFER_OUT` with negative quantity `-qty`, updating source balance.
2. Destination location: `TRANSFER_IN` with positive quantity `+qty`, updating destination balance.
3. Both entries link to the opposite location via `transferLocationId`.

### 4.4 Ledger Reconciliation
The endpoint `GET /api/v1/clinics/:clinicId/inventory/stock/reconcile` computes a mathematical comparison across all products and locations:
$$\text{Difference} = \text{Balance.onHandQuantity} - \sum \text{Movements.quantity}$$
- If $\text{Difference} = 0$ for all balance records, status is `RECONCILED`.
- If any discrepancy is found, status is `DISCREPANCY_DETECTED` with detailed line-item differences.

---

## 5. Role-Based Access Control (RBAC)

Granular inventory permissions are assigned to clinic roles:

| Permission | Description | CLINIC_OWNER | CLINIC_ADMIN | DOCTOR | RECEPTIONIST | ACCOUNTANT |
|---|---|:---:|:---:|:---:|:---:|:---:|
| `inventory.products.read` | View product catalog | Yes | Yes | Yes | No | No |
| `inventory.products.manage` | Create/edit products | Yes | Yes | No | No | No |
| `inventory.locations.read` | View stock locations | Yes | Yes | Yes | No | No |
| `inventory.locations.manage` | Create/edit locations | Yes | Yes | No | No | No |
| `inventory.stock.read` | View balances | Yes | Yes | Yes | No | No |
| `inventory.stock.receive` | Post stock receipts | Yes | Yes | No | No | No |
| `inventory.stock.issue` | Post stock issues | Yes | Yes | No | No | No |
| `inventory.stock.adjust` | Post stock adjustments | Yes | Yes | No | No | No |
| `inventory.stock.transfer` | Post stock transfers | Yes | Yes | No | No | No |
| `inventory.movements.read` | View stock ledger history | Yes | Yes | No | No | No |
| `inventory.reconcile` | Run ledger reconciliation | Yes | Yes | No | No | No |

---

## 6. API Reference

All requests require authentication, clinic scope selection, and `X-CSRF-Token`.

### Products
- `GET /api/v1/clinics/:clinicId/inventory/products`: List products (supports `?category=...&search=...&isActive=...`).
- `POST /api/v1/clinics/:clinicId/inventory/products`: Create a product.
- `GET /api/v1/clinics/:clinicId/inventory/products/:id`: Get product details.
- `PATCH /api/v1/clinics/:clinicId/inventory/products/:id`: Update product attributes (with optimistic `expectedVersion`).

### Locations
- `GET /api/v1/clinics/:clinicId/inventory/locations`: List locations.
- `POST /api/v1/clinics/:clinicId/inventory/locations`: Create a location.
- `GET /api/v1/clinics/:clinicId/inventory/locations/:id`: Get location details.
- `PATCH /api/v1/clinics/:clinicId/inventory/locations/:id`: Update location attributes.

### Stock Operations
- `GET /api/v1/clinics/:clinicId/inventory/stock/balances`: Query on-hand balances per product/location.
- `GET /api/v1/clinics/:clinicId/inventory/stock/movements`: Keyset-paginated stock ledger movements.
- `POST /api/v1/clinics/:clinicId/inventory/stock/opening-balance`: Initialize starting inventory.
- `POST /api/v1/clinics/:clinicId/inventory/stock/receive`: Receive supplier or incoming stock.
- `POST /api/v1/clinics/:clinicId/inventory/stock/issue`: Issue stock for clinical use, disposal, or internal use.
- `POST /api/v1/clinics/:clinicId/inventory/stock/transfer`: Transfer stock between locations atomically.
- `POST /api/v1/clinics/:clinicId/inventory/stock/adjust`: Post discrepancy adjustments.
- `GET /api/v1/clinics/:clinicId/inventory/stock/reconcile`: Execute ledger-to-balance reconciliation audit.
