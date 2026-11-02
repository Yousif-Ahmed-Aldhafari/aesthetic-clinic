# Lamssa — Phase 4 Step 4.5: Practitioner Commissions, Financial Reconciliation & Operational Reporting

## 1. Overview & Architectural Scope

Lamssa Phase 4 Step 4.5 implements automated practitioner commission calculation, segregation-of-duties adjustment workflows, batch settlement distribution, continuous multi-resource financial integrity reconciliation, and comprehensive executive operational analytics:

1. **Practitioner Commission Plans & Rules**:
   - Versionable, multi-tiered commission plans (`DRAFT`, `ACTIVE`, `ARCHIVED`) with granular rules per procedure category or specific procedure.
   - Calculation models supporting `PERCENTAGE_OF_SERVICE` (basis points with integer half-up rounding), `FLAT_AMOUNT_PER_SERVICE`, `PERCENTAGE_OF_PACKAGE_REDEMPTION`, and `TIERED_MONTHLY_REVENUE`.
   - Revenue basis selection: `GROSS_INVOICE_LINE` vs `NET_COLLECTED_REVENUE`.
   - Trigger events: `INVOICE_PAID`, `PROCEDURE_PERFORMED`, and `PACKAGE_SESSION_REDEEMED`.
   - Direct practitioner assignment with effective date ranges.

2. **Accruals, Segregation of Duties & Adjustment Governance**:
   - Automated accrual generation linked to invoices, line items, redemptions, and procedures.
   - Doctor own statement access allowing practitioners to inspect their own earned accruals and settlements without exposing clinic-wide financial records.
   - Audited adjustment requests (`REQUESTED`, `APPROVED`, `REJECTED`, `CANCELLED`) with strict segregation of duties: practitioners cannot approve their own adjustment requests, and administrative decisions require Step-Up MFA authentication (`@RequireStepUp(15)`).
   - Signed integer minor adjustments (`signedFixed`) preserving zero-loss integer arithmetic for retroactive clawbacks or bonuses.

3. **Commission Settlements & Batches**:
   - Monotonic settlement sequence numbering (`COMM-SETTLE-000001`) via atomic counter increments (`CommissionSettlementCounter`).
   - Batch creation and settlement confirmation locking accrued commission items and audited adjustments.

4. **Continuous Financial Reconciliation Engine**:
   - Automated cross-resource validation scanning 6 critical financial and operational domains:
     1. Invoices: `balanceMinor == totalAmountMinor - paidAmountMinor`.
     2. Payments: `allocatedAmountMinor == SUM(allocations.amountMinor)`.
     3. Installment Plans: `totalAmountMinor == SUM(schedules.expectedAmountMinor)`.
     4. Patient Packages: `remainingSessions == totalSessions - redeemedSessions - reservedSessions`.
     5. Commission Settlements: `totalAmountMinor == SUM(accruals.amountMinor) + SUM(adjustments.amountMinor)`.
     6. Inventory Balances: `quantityOnHand == calculated movement net balance`.
   - Status categorization: `CLEAN` or `DISCREPANCIES_FOUND` with detailed anomaly breakdowns.

5. **Executive Operational & Clinical Analytics**:
   - **Revenue & Collections Summary**: Gross invoiced, net collections, refunds, and payment method distribution.
   - **Installment Aging Buckets**: Current, 1–30 days, 31–60 days, 61–90 days, and 90+ days overdue balances.
   - **Package Liabilities**: Total prepaid collections, recognized earned revenue, and deferred unearned liability.
   - **Practitioner Performance**: Per-practitioner procedure counts, gross production, earned commission, and settlement totals.
   - **Inventory Valuation**: Current stock quantity, unit cost, and total inventory asset valuation by location and product category.
   - **Appointment Utilization**: Capacity utilization, completion counts, cancellation rates, and no-show percentages.

---

## 2. Database Schema & Data Dictionary

The migration `20261101000500_commissions_reconciliation_reporting` provisions 7 PostgreSQL enums and 7 relational tables:

### 2.1 Enums
- `CommissionCalculationMethod`: `'PERCENTAGE_OF_SERVICE' | 'FLAT_AMOUNT_PER_SERVICE' | 'PERCENTAGE_OF_PACKAGE_REDEMPTION' | 'TIERED_MONTHLY_REVENUE'`
- `CommissionBasis`: `'GROSS_INVOICE_LINE' | 'NET_COLLECTED_REVENUE'`
- `CommissionTriggerEvent`: `'INVOICE_PAID' | 'PROCEDURE_PERFORMED' | 'PACKAGE_SESSION_REDEEMED'`
- `CommissionPlanStatus`: `'DRAFT' | 'ACTIVE' | 'ARCHIVED'`
- `CommissionAccrualStatus`: `'PENDING' | 'APPROVED' | 'SETTLED' | 'VOIDED' | 'CLAWBACK'`
- `CommissionAdjustmentStatus`: `'REQUESTED' | 'APPROVED' | 'REJECTED' | 'CANCELLED'`
- `CommissionSettlementStatus`: `'DRAFT' | 'CONFIRMED' | 'CANCELLED'`

### 2.2 Relational Tables

| Table Name | Description | Key Invariants / Security Policies |
|---|---|---|
| `PractitionerCommissionPlan` | Plan definitions with clinic code and status | Unique `(clinicId, code)`, FORCE RLS, code regex `^[A-Za-z0-9_-]+$` |
| `PractitionerCommissionRule` | Per-procedure or category calculation rules | Rate basis points `[0, 10000]`, flat amount non-negative, trigger guard `trg_commission_rule_guard` |
| `PractitionerCommissionAssignment` | Assignment of plan to practitioner | Temporal validity `(effectiveFrom, effectiveTo)` |
| `CommissionSettlementCounter` | Atomic sequence generator for settlement references | Monotonic counter, code format `COMM-SETTLE-XXXXXX` |
| `PractitionerCommissionSettlement` | Finalized batch payout settlements | Settlement status lifecycle (`DRAFT` -> `CONFIRMED`), payment reference, date locks |
| `PractitionerCommissionAccrual` | Calculated commission line accrual records | Linked to invoice, line, or redemption; status guard `trg_commission_accrual_guard` |
| `PractitionerCommissionAdjustment` | Manual adjustments, clawbacks, and bonuses | Signed integer minor amount, reason required, segregation of duties (`decidedByUserId != requestedByUserId`) |

---

## 3. Financial & Arithmetic Invariants

1. **Exact Signed Minor Units**:
   - Standard monetary values are stored as unsigned `BIGINT` minor units.
   - Adjustments allow negative values for clawbacks and positive values for bonuses, parsed via `signedFixed(val, scale)`.
   - Floating-point numbers are prohibited in arithmetic calculations.
2. **Integer Half-Up Rounding**:
   - Rate calculations in basis points ($1\% = 100\text{ bps}$) use integer half-up rounding:
     $$\text{commissionMinor} = \left\lfloor \frac{\text{baseMinor} \times \text{rateBps} + 5000}{10000} \right\rfloor$$
3. **Segregation of Duties**:
   - The user who requested an adjustment cannot approve or reject it (`requestedByUserId !== decidedByUserId`).
   - Settlements require elevated administrative permissions (`commissions.settlements.manage`) and Step-Up MFA authentication.
4. **Multi-Tenant Row-Level Security**:
   - All 7 tables have `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY`.
   - Access is isolated strictly by `clinic_id = current_setting('app.current_clinic_id', true)`.

---

## 4. Role-Based Access Control (RBAC) & Step-Up Security

| Role | Commission Plans | Doctor Own Accruals | All Accruals & Adjust | Settlements | Reconciliation & Reports |
|---|---|---|---|---|---|
| **DOCTOR** | Denied | Read own | Denied (can request adj) | Denied | Denied |
| **RECEPTIONIST** | Denied | Denied | Denied | Denied | Operational reports read |
| **ACCOUNTANT** | Read only | Read own | Manage & Decide | Create & Confirm (Step-Up) | Full Read |
| **CLINIC_OWNER** | Full manage | Full manage | Full manage | Full manage (Step-Up) | Full Read |

---

## 5. Arabic RTL User Interface Terminology

| English Concept | Authentic Arabic Clinical UI Label |
|---|---|
| Commissions Workspace | عمولات الممارسين |
| Commission Plans | خطط العمولات |
| Commission Rules | قواعد الاحتساب |
| Commission Accruals | مستحقات العمولات |
| Commission Adjustments | تسويات وتعديلات العمولات |
| Batch Settlement | دورة تسوية وصرف العمولات |
| My Commission Statement | كشف مستحقاتي |
| Financial Reconciliation | المطابقة والتسوية المالية |
| Operational Reports | التقارير التشغيلية والتحليلية |
| Revenue & Collections | الإيرادات والمتحصلات |
| Installment Aging | أعمار الأقساط المستحقة |
| Package Liabilities | التزامات الباقات العلاجية |
| Practitioner Performance | أداء وإنتاجية الأطباء |
| Inventory Valuation | تقييم المخزون وتكلفة المواد |
| Appointment Utilization | إشغال المواعيد ومعدلات الحضور |
