# Batch/Lot Tracking, Expiry Management, Product Traceability & Clinical Procedure Consumption

This document details the architectural foundation, database model, security policies, transactional invariants, and clinical integration for Phase 4 Step 4.2 in Lamssa.

---

## 1. Domain Overview & Scope Boundaries

Step 4.2 extends Lamssa's inventory ledger with pharmaceutical-grade batch/lot tracking, timezone-aware expiry management, complete traceability, and direct clinical procedure consumption.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       Inventory Lot & Traceability Domain                   │
├──────────────────────────────┬──────────────────────────────────────────────┤
│ Product & Lot Registry       │ Storage & Batch Balances                     │
│ - InventoryProduct           │ - InventoryLocation                          │
│ - InventoryBatch             │ - InventoryBalance (Product-Location)        │
│   • batchNumber              │ - InventoryBatchBalance (Batch-Loc)          │
│   • expirationDate (YYYY-MM-DD)                                             │
│   • manufacturerName         │                                              │
│   • status (AVAILABLE, etc.) │                                              │
├──────────────────────────────┴──────────────────────────────────────────────┤
│                         Transactional Ledger & Clinical                     │
├──────────────────────────────┬──────────────────────────────────────────────┤
│ Append-Only Stock Movements  │ Clinical Procedure Consumption               │
│ - InventoryStockMovement     │ - InventoryClinicalConsumption               │
│   • batchId link             │   • procedureExecutionId                     │
│   • balance-after snapshot   │   • clinician authorization match            │
│   • immutability trigger     │   • verified consent eligibility             │
│                              │   • partial dose & waste tracking            │
│                              │   • non-destructive voiding / reversal       │
└──────────────────────────────┴──────────────────────────────────────────────┘
```

### 1.1 Scope Boundaries (Step 4.2 vs Future Steps)
- **In Scope for Step 4.2**:
  - Batch/lot lifecycle: creation, receipt, location transfer, issuing, quarantine, recall, depletion.
  - Multi-location lot balances (`InventoryBatchBalance`) maintaining exact `numeric(12, 4)` quantities.
  - Attribution of all lot movements to `InventoryStockMovement.batchId`.
  - Clinic-local calendar date expiration semantics avoiding UTC offset traps.
  - Real-time expiry report grouping into `EXPIRED`, `CRITICAL` (<=30 days), `WARNING` (<=90 days), and `NORMAL`.
  - First-Expired, First-Out (FEFO) recommendation engine in web UI.
  - Integration with `ProcedureExecution`: clinician assignment check, informed consent verification via `ConsentEligibilityService`, atomic stock deduction, and partial dose / waste tracking.
  - Non-destructive voiding of procedure consumption with automatic compensating return movement and provenance audit.
  - Strict confidentiality boundary: inventory-only roles cannot view patient medical histories or clinical consultation notes.
  - Database immutability triggers, `FORCE ROW LEVEL SECURITY`, tenant isolation, and privilege grants.
  - Arabic-first RTL web workspace for batch management and procedure consumption modal.

- **Out of Scope for Step 4.2 (Future Steps)**:
  - Supplier purchase orders, vendor catalog management, and supplier invoices (Step 4.3).
  - Point-of-Sale (POS) retail billing integration and package session consumption (Steps 4.4–4.5).

---

## 2. Database Schema & Architecture

Migration `20261101000200_inventory_batch_tracking` introduces three new tables, updates `InventoryStockMovement`, and installs integrity triggers and tenant guards.

### 2.1 Enums

| Enum | Values | Meaning |
|---|---|---|
| `InventoryBatchStatus` | `AVAILABLE` | Active lot available for clinical use or transfer. |
| | `QUARANTINED` | Temporarily isolated (e.g. cold-chain audit); issues blocked. |
| | `RECALLED` | Officially recalled by manufacturer/regulatory body; terminal lock. |
| | `EXPIRED` | Lot has passed local calendar expiration date; issues blocked. |
| | `DEPLETED` | Zero on-hand balance remaining across all clinic locations. |
| `ClinicalConsumptionStatus` | `RECORDED` | Valid consumption documented in procedure. |
| | `VOIDED` | Non-destructively reversed; stock compensated. |

### 2.2 Models

#### `InventoryBatch`
Represents an individual physical manufacturing lot of an `InventoryProduct`.
- `id`: UUID primary key.
- `clinicId`: UUID tenant identifier (`Clinic(id)`).
- `productId`: UUID product identifier (`InventoryProduct(id)`).
- `batchNumber`: Unique batch number per product and clinic (`UNIQUE(clinicId, productId, batchNumber)`).
- `expirationDate`: ISO calendar date string (`YYYY-MM-DD`).
- `manufacturerName`: Optional manufacturer or supplier name.
- `initialQuantity`: `numeric(12, 4)` initial received/opening quantity (> 0).
- `status`: `InventoryBatchStatus` (default: `AVAILABLE`).
- `notes`: Optional operational notes.
- `version`: Integer for optimistic locking.
- `createdAt` / `updatedAt`: Timestamps with time zone.

#### `InventoryBatchBalance`
Tracks physical quantity of a specific batch at a specific location.
- `id`: UUID primary key.
- `clinicId`: UUID tenant identifier.
- `batchId`: UUID referencing `InventoryBatch(id)`.
- `productId`: UUID referencing `InventoryProduct(id)`.
- `locationId`: UUID referencing `InventoryLocation(id)`.
- `onHandQuantity`: `numeric(12, 4)` on-hand balance (>= 0).
- `version`: Optimistic locking integer.
- Composite uniqueness: `UNIQUE(clinicId, batchId, locationId)`.

#### `InventoryClinicalConsumption`
Tracks the exact lot quantity administered during a clinical procedure.
- `id`: UUID primary key.
- `clinicId`: UUID tenant identifier.
- `procedureExecutionId`: UUID referencing `ProcedureExecution(id)`.
- `productId`: UUID referencing `InventoryProduct(id)`.
- `batchId`: UUID referencing `InventoryBatch(id)`.
- `locationId`: UUID referencing `InventoryLocation(id)`.
- `quantity`: `numeric(12, 4)` administered quantity (> 0).
- `wasteQuantity`: `numeric(12, 4)` discarded/unusable quantity (>= 0).
- `unit`: `InventoryUnit` snapshot matching the product unit.
- `movementId`: UUID referencing `InventoryStockMovement(id)` for the deduction.
- `actorMembershipId`: UUID clinician membership documenting the consumption.
- `status`: `ClinicalConsumptionStatus` (`RECORDED` or `VOIDED`).
- `voidReason`: Mandatory reason string when status transitions to `VOIDED`.
- `voidedAt`: Timestamp when voiding occurred.
- `voidedByMembershipId`: UUID membership who authorized the void.
- `idempotencyKey`: Optional idempotency key for safe mobile/API replay (`UNIQUE(clinicId, idempotencyKey)`).
- `notes`: Optional clinical or operational notes.

#### `InventoryStockMovement` Addition
- `batchId`: Optional UUID foreign key referencing `InventoryBatch(id)` with `(clinicId, batchId) -> InventoryBatch(clinicId, id)`.

---

## 3. Expiration Semantics & Clinic-Local Timezones

### 3.1 The UTC Offset Trap
In aesthetic clinics located in Saudi Arabia, Yemen, or the GCC (UTC+3), standard midnight UTC occurs at 03:00 local time the following morning, while 00:00 local time corresponds to 21:00 UTC the previous day. Comparing raw UTC timestamps against date strings causes batches to expire either too early or too late by 3 hours.

### 3.2 Pure Calendar Date Boundary
- `InventoryBatch.expirationDate` is stored as an invariant ISO calendar date string: `YYYY-MM-DD` (e.g. `2026-11-01`).
- Evaluation uses the clinic's local timezone (`Clinic.timezone`, e.g. `'Asia/Riyadh'` or `'Asia/Aden'`).
- A batch expiring on `2026-11-01` remains valid through `2026-11-01 23:59:59` in that timezone, and becomes expired at `2026-11-02 00:00:00`.
- System helper: `isBatchExpired(expirationDate, clinicTimezone)`.
- Real-time queries dynamically project `isExpired: boolean` and group lots into risk bands without mutating the database asynchronously.

### 3.3 Date Validation Invariants
Batch creation enforces:
1. Regex format: `^\d{4}-\d{2}-\d{2}$`.
2. Valid calendar dates: rejects non-existent dates such as `2028-02-30` or `2026-04-31`.
3. Future date requirement: rejects batches with an expiration date in the past relative to clinic-local today.

---

## 4. Status Transition Matrix & Immutability Rules

```
                      ┌───────────────┐
                      │   AVAILABLE   │◄──────────────┐
                      └───────┬───────┘               │
                              │                       │
               ┌──────────────┼──────────────┐        │ Release
               │              │              │        │
               ▼              ▼              ▼        │
        ┌─────────────┐┌─────────────┐┌─────────────┐ │
        │  DEPLETED   ││   EXPIRED   ││ QUARANTINED ├─┘
        └─────────────┘└─────────────┘└──────┬──────┘
               ▲                             │
               │         ┌───────────┐       │ Recall
               └─────────┤  RECALLED │◄──────┘
                         └───────────┘
```

1. **`AVAILABLE -> QUARANTINED`**: Requires explicit justification reason (e.g. cold-chain breach check). Stock cannot be issued or consumed while quarantined.
2. **`QUARANTINED -> AVAILABLE`**: Requires release action. Restores lot usability.
3. **`* -> RECALLED`**: Terminal safety state. Requires official regulatory/manufacturer circular number. Cannot be released or made available under any circumstances.
4. **`* -> EXPIRED`**: Evaluated dynamically and set terminal by status update. Cannot be returned to available status.
5. **Database Immutability Guard**: `inventory_batch_integrity_guard` trigger blocks DELETE operations and prevents updates from `RECALLED` or `EXPIRED` back to `AVAILABLE`.

---

## 5. Procedure Consumption & Clinical Safety Gates

Clinical administration of regulated products (such as Botox, Dysport, or hyaluronic acid fillers) requires four mandatory gates before inventory is deducted:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       Clinical Consumption Safety Gates                     │
├─────────────────────────────────────────────────────────────────────────────┤
│ 1. Assigned Clinician Verification:                                         │
│    Actor membership MUST match ProcedureExecution.clinicianMembershipId.   │
├─────────────────────────────────────────────────────────────────────────────┤
│ 2. Informed Consent Eligibility Verification:                               │
│    ConsentEligibilityService.check() confirms active, verified consent with │
│    cryptographic signature evidence for the specific procedure catalog.     │
├─────────────────────────────────────────────────────────────────────────────┤
│ 3. Batch Usability & Expiry Verification:                                   │
│    Batch status MUST be AVAILABLE, NOT QUARANTINED, NOT RECALLED, and NOT   │
│    EXPIRED in the clinic's local timezone.                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│ 4. Atomic Stock Deduction & Movement Ledger:                                │
│    Pessimistic row lock (SELECT FOR UPDATE) on both InventoryBalance and     │
│    InventoryBatchBalance. Total deducted = quantity + wasteQuantity.        │
│    Compensating return movement logged on VOID.                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 5.1 First-Expired, First-Out (FEFO) Allocation
When selecting a lot for clinical consumption, the web UI automatically recommends the lot with the earliest valid expiration date that has available stock at the treatment room location (`FEFO suggestion`). Clinicians can accept the suggestion or override it if a specific vial is already in use.

### 5.2 Waste & Partial Dose Tracking
- Injectables frequently require partial dose usage (e.g. 50 units administered from a 100-unit vial, with the remainder discarded due to single-patient sterility rules).
- The model records `quantity` (actual administered dose) and `wasteQuantity` (discarded amount).
- Both quantities are deducted from physical stock (`quantity + wasteQuantity`), while the clinical record maintains the distinction for therapeutic accuracy.

### 5.3 Non-Destructive Voiding & Stock Compensation
- If a clinical consumption was recorded in error (e.g. wrong batch selected or treatment aborted), the record is **never deleted**.
- Voiding updates status to `VOIDED`, records `voidReason`, `voidedAt`, and `voidedByMembershipId`.
- An atomic compensating stock movement (`TRANSFER_IN` / reversal) restores the exact deducted quantity back to the batch and location balance.
- Database trigger `inventory_consumption_immutability_guard` blocks DELETE and restricts UPDATE to the VOIDED transition.

---

## 6. Security, RBAC & Confidentiality Boundaries

### 6.1 Row Level Security (RLS)
PostgreSQL `FORCE ROW LEVEL SECURITY` is applied to all three new tables:
- `InventoryBatch`
- `InventoryBatchBalance`
- `InventoryClinicalConsumption`

Application runtime database roles have permissions restricted to `SELECT, INSERT, UPDATE`. Direct SQL `DELETE` privileges are revoked.

### 6.2 RBAC Permissions Matrix

| Permission | `CLINIC_OWNER` | `CLINIC_ADMIN` | `DOCTOR` | `RECEPTIONIST` | `ACCOUNTANT` |
|---|:---:|:---:|:---:|:---:|:---:|
| `inventory.batches.read` | Yes | Yes | Yes | No | No |
| `inventory.batches.manage` | Yes | Yes | No | No | No |
| `inventory.batches.quarantine` | Yes | Yes | No | No | No |
| `inventory.batches.recall` | Yes | Yes | No | No | No |
| `inventory.clinical-consumption.record` | Yes | Yes | Yes | No | No |
| `inventory.clinical-consumption.read` | Yes | Yes | Yes | No | No |

### 6.3 Clinical Confidentiality Boundary
Warehouse managers and inventory administrators need to track stock depletion, lot numbers, and wastage, but have no clinical need-to-know regarding patient medical records.
- When an inventory-only role calls `/clinical-consumption`, the API endpoint projects only operational fields (`productId`, `batchNumber`, `quantity`, `wasteQuantity`, `locationId`, `status`).
- Clinical notes, consultation diagnoses, and patient medical histories are omitted from the response.

---

## 7. API Reference

All routes require authentication, valid clinic tenancy header/cookie, and CSRF protection for mutating methods.

### 7.1 Batches
- `POST /api/v1/clinics/:clinicId/inventory/batches`: Register a new lot (with optional opening balance).
- `GET /api/v1/clinics/:clinicId/inventory/batches`: List lots with filters (`productId`, `status`, `locationId`).
- `GET /api/v1/clinics/:clinicId/inventory/batches/expiry-report`: Expiry risk breakdown (`EXPIRED`, `CRITICAL`, `WARNING`, `NORMAL`).
- `GET /api/v1/clinics/:clinicId/inventory/batches/:id`: Retrieve single lot details and balances.
- `POST /api/v1/clinics/:clinicId/inventory/batches/:id/quarantine`: Quarantine lot.
- `POST /api/v1/clinics/:clinicId/inventory/batches/:id/release`: Release quarantined lot.
- `POST /api/v1/clinics/:clinicId/inventory/batches/:id/recall`: Recall lot officially.
- `POST /api/v1/clinics/:clinicId/inventory/batches/receive`: Receive stock against an existing lot.
- `POST /api/v1/clinics/:clinicId/inventory/batches/issue`: Issue stock from a lot.
- `POST /api/v1/clinics/:clinicId/inventory/batches/transfer`: Transfer lot stock between locations.

### 7.2 Clinical Consumption
- `POST /api/v1/clinics/:clinicId/inventory/clinical-consumption`: Record procedure lot consumption (validates doctor match, consent, and deducts stock).
- `GET /api/v1/clinics/:clinicId/inventory/clinical-consumption`: List consumptions with optional filter by `procedureExecutionId`.
- `POST /api/v1/clinics/:clinicId/inventory/clinical-consumption/:id/void`: Void a consumption record and restore stock.
