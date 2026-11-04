# Lamssa — Phase 4 Step 4.4: Treatment Packages, Installments & Advanced Billing

## 1. Overview & Architectural Scope

Lamssa Phase 4 Step 4.4 implements advanced medical-aesthetic clinical billing capabilities:
1. **Multi-Service Treatment Packages**: Version-controlled clinical packages with published immutability, validity periods, multi-service session allowances, and Arabic clinical descriptions.
2. **Patient Packages & Prepaid Entitlements**: Patient purchases tracked by entitlement counters, session reconciliation guards, and configurable activation policies (`UPON_INVOICE_ISSUANCE`, `UPON_FULL_PAYMENT`, `MANUAL_OVERRIDE`).
3. **Session Redemptions & Reversals**: Granular clinical procedure redemption recording linked to treating doctors and encounters, with audited immutable reversal workflows.
4. **Installment Payment Plans**: Multi-payment installment agreements linked to issued invoices, with structured due dates, payment status tracking (`PENDING`, `PARTIALLY_PAID`, `PAID`, `OVERDUE`, `WAIVED`), and deterministic payment allocation.
5. **Refund Request Lifecycle & Financial Integrity**: Formal refund governance workflow (`REQUESTED`, `APPROVED`, `REJECTED`, `SETTLED`, `CANCELLED`), dual-custody approval/settlement, reason auditing, and automated atomic linkage to `PaymentReversal`.

All entities enforce multi-tenant PostgreSQL Row-Level Security (`ENABLE` and `FORCE ROW LEVEL SECURITY`), strict tenant isolation, immutable database triggers, and authentic Arabic-first RTL user interfaces.

---

## 2. Database Schema & Data Dictionary

The migration `20261101000400_packages_installments_refunds` provisions 7 PostgreSQL enums and 11 relational tables:

### 2.1 Enums
- `TreatmentPackageStatus`: `'ACTIVE' | 'ARCHIVED'`
- `PatientPackageStatus`: `'PENDING_PAYMENT' | 'ACTIVE' | 'EXHAUSTED' | 'EXPIRED' | 'CANCELLED'`
- `PackageActivationPolicy`: `'UPON_INVOICE_ISSUANCE' | 'UPON_FULL_PAYMENT' | 'MANUAL_OVERRIDE'`
- `PackageRedemptionStatus`: `'RECORDED' | 'REVERSED'`
- `InstallmentPlanStatus`: `'ACTIVE' | 'COMPLETED' | 'DEFAULTED' | 'CANCELLED'`
- `InstallmentScheduleStatus`: `'PENDING' | 'PARTIALLY_PAID' | 'PAID' | 'OVERDUE' | 'WAIVED'`
- `RefundRequestStatus`: `'REQUESTED' | 'APPROVED' | 'REJECTED' | 'SETTLED' | 'CANCELLED'`

### 2.2 Relational Tables

| Table Name | Description | Key Invariants / Security Policies |
|---|---|---|
| `TreatmentPackage` | Package catalog header with unique alphanumeric clinic code | FORCE RLS, code format `^[A-Za-z0-9_-]+$`, unique `(clinicId, code)` |
| `TreatmentPackageVersion` | Immutable published version snapshot | Once `isPublished = true`, fields cannot be modified via trigger `trg_package_version_immutability` |
| `TreatmentPackageItem` | Services included in a package version | Cannot delete items from published version via trigger `trg_package_item_delete` |
| `PatientPackage` | Patient package contract and purchase record | Total/redeemed/remaining session balances; activation policy; versioning |
| `PatientPackageEntitlement` | Granular per-service remaining session quotas | Trigger `trg_patient_package_entitlement_guard` guarantees `remainingSessions = totalSessions - redeemedSessions - reservedSessions` and `remainingSessions >= 0` |
| `PackageRedemption` | Clinical session consumption log | Links to entitlement, treating practitioner, procedure, and notes |
| `PackageRedemptionReversal` | Audit record of reversed session redemptions | Restores entitlement balances; reason tracking; idempotency key |
| `InstallmentPlan` | Financial installment contract for invoice | Must have at least 2 installments; total amount matches schedule sum |
| `InstallmentSchedule` | Scheduled due dates and expected installment amounts | Due date validation; status lifecycle (`PENDING` -> `PAID`) |
| `InstallmentAllocation` | Payment allocation receipt to installment schedule | Prevents over-allocation; reconciles remaining balances |
| `RefundRequest` | Formal refund request and decision workflow | Dual-custody review; required reason and audit details; step-up authentication |

---

## 3. Financial & Clinical Invariants

1. **Exact Integer Monetary Minor Units**:
   All monetary amounts (`priceMinor`, `totalAmountMinor`, `expectedAmountMinor`, `allocatedAmountMinor`, `amountMinor`) are stored as non-negative PostgreSQL `BIGINT` minor units and handled in TypeScript via `bigint`. Floating-point arithmetic is strictly prohibited.
2. **Session Balance Reconciliation**:
   `PatientPackageEntitlement` maintains an absolute database check and trigger guarantee:
   $$\text{remainingSessions} = \text{totalSessions} - \text{redeemedSessions} - \text{reservedSessions}$$
   Attempting to consume more sessions than remaining results in exception `23514` (`ENTITLEMENT_EXHAUSTED`).
3. **Published Version Immutability**:
   Once a package version is marked `isPublished = true`, prices, included services, validity periods, and names cannot be altered or deleted. Changes require creating a new version (`TreatmentPackageVersion`).
4. **Activation Policies**:
   - `UPON_INVOICE_ISSUANCE`: The patient package automatically transitions from `PENDING_PAYMENT` to `ACTIVE` when the invoice is issued.
   - `UPON_FULL_PAYMENT`: The package remains `PENDING_PAYMENT` until the invoice is completely settled (`balanceMinor === 0n`).
   - `MANUAL_OVERRIDE`: The clinic manager or accountant explicitly activates the package with documented authorization.
5. **Installment Payment Distribution**:
   When payments are recorded against an installment plan, allocations are applied deterministically in FIFO order to the earliest pending schedule.
6. **Dual-Custody Refund Settle**:
   Refund requests require explicit approval (`refunds.approve`) before they can be settled (`refunds.settle`). Settling creates a corresponding `PaymentReversal` and reduces invoice net paid amounts.

---

## 4. Role-Based Access Control (RBAC) & Step-Up Security

| Role | Packages Catalog | Patient Packages | Redemptions | Installment Plans | Refunds |
|---|---|---|---|---|---|
| **DOCTOR** | Read only | Read only | Record redemption | Denied | Denied |
| **RECEPTIONIST** | Read only | Purchase & Read | Record redemption | Read only | Request only |
| **ACCOUNTANT** | Read only | Manage & Read | Reverse (with Step-Up) | Manage & Allocate | Approve, Reject, Settle (with Step-Up) |
| **CLINIC_OWNER** | Full manage | Full manage | Full manage | Full manage | Full manage |

Critical destructive and financial write operations (`reversePackageRedemption`, `approveRefundRequest`, `rejectRefundRequest`, `settleRefundRequest`) strictly enforce `@RequireStepUp(15)` requiring MFA step-up verification within the past 15 minutes.

---

## 5. Arabic RTL User Interface Terminology

| English Concept | Authentic Arabic Clinical UI Label |
|---|---|
| Treatment Package | باقة علاجية |
| Package Catalog | دليل الباقات |
| Session Entitlement | استحقاق الجلسات |
| Session Redemption | استهلاك جلسة |
| Reversal of Redemption | عكس استهلاك جلسة |
| Installment Plan | خطة تقسيط |
| Installment Schedule | جدول الأقساط والدفعات |
| Due Date | تاريخ الاستحقاق |
| Expected Amount | المبلغ المستحق |
| Payment Allocation | تخصيص الدفعة للقسط |
| Refund Request | طلب استرداد مالي |
| Refund Settlement | تسوية وقيد الاسترداد |
| Pending Payment | قيد السداد |
| Active Package | نشطة ومتاحة |
| Exhausted Package | مستنفدة بالكامل |
| Overdue Installment | متأخر عن الاستحقاق |
