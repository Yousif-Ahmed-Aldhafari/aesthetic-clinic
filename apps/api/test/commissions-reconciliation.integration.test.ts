import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import pg from 'pg';
import { configureApp } from '../src/configure-app.js';
import { provisionUser } from '../scripts/provision-user.js';
import { fixtureDatabase, testUrls } from './database-fixtures.js';

const enabled = Boolean(process.env.TEST_DATABASE_URL);
const live = (name: string, fn: () => Promise<void>) => test(`commissions-reconciliation: ${name}`, { skip: !enabled }, fn);

const suffix = randomUUID();
const clinics = [randomUUID(), randomUUID()];
const users: string[] = [];
const origin = 'http://localhost:5173';
const password = randomBytes(32).toString('base64url');

const roles = ['CLINIC_OWNER', 'ACCOUNTANT', 'DOCTOR', 'RECEPTIONIST'] as const;
const emails = roles.map((r) => `comm-${r.toLowerCase()}-${suffix}@example.invalid`);

let ownerDb: ReturnType<typeof fixtureDatabase>;
let pool: pg.Pool;
let app: INestApplication;
let base: string;

const patients: string[] = [];
let doctorMembershipId: string;
let procedureCatalogId: string;
let treatmentPlanItemId: string;
let completedProcedureExecutionId: string;

class Browser {
  cookies = new Map<string, string>();
  csrf = '';
  clinic = 0;

  path(suffix = '') {
    return `clinics/${clinics[this.clinic]}/billing${suffix}`;
  }

  async request(path: string, method = 'GET', body?: unknown, headers: Record<string, string> = {}) {
    const res = await fetch(`${base}/api/v1/${path}`, {
      method,
      headers: {
        Cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; '),
        ...(method === 'GET' ? {} : { Origin: origin, 'Content-Type': 'application/json', 'X-CSRF-Token': this.csrf }),
        ...headers,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(';');
      const idx = pair.indexOf('=');
      this.cookies.set(pair.slice(0, idx), pair.slice(idx + 1));
    }
    return res;
  }

  async login(roleIndex = 0, clinic = 0) {
    this.clinic = clinic;
    this.csrf = ((await (await this.request('auth/csrf')).json()) as { csrfToken: string }).csrfToken;
    let r = await this.request('auth/login', 'POST', { email: emails[roleIndex], password });
    assert.equal(r.status, 200);
    this.csrf = ((await r.json()) as { csrfToken: string }).csrfToken;
    r = await this.request('auth/clinic', 'POST', { clinicId: clinics[clinic] });
    assert.equal(r.status, 200);
    this.csrf = ((await r.json()) as { csrfToken: string }).csrfToken;
    return this;
  }
}

async function json<T>(r: Response, status = 200): Promise<T> {
  assert.equal(r.status, status, JSON.stringify(await r.clone().json()));
  return (await r.json()) as T;
}

before(async () => {
  if (!enabled) return;
  const urls = testUrls();
  process.env.DATABASE_URL = urls.runtime;
  process.env.NODE_ENV = 'test';
  process.env.AUTH_CSRF_SECRET = randomBytes(48).toString('base64url');
  process.env.CORS_ORIGINS = origin;
  process.env.AUTH_LOGIN_ACCOUNT_LIMIT = '200';
  process.env.AUTH_LOGIN_IP_LIMIT = '10000';

  const { AppModule } = await import('../src/app.module.js');
  const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = mod.createNestApplication({ logger: false });
  configureApp(app);
  await app.listen(0, '127.0.0.1');
  base = await app.getUrl();
  ownerDb = fixtureDatabase();
  pool = new pg.Pool({ connectionString: urls.runtime, max: 4 });

  for (const [i, id] of clinics.entries()) {
    await ownerDb.clinic.create({
      data: {
        id,
        slug: `comm-clinic-${i}-${suffix}`,
        legalName: `عيادة العمولات ${i}`,
        displayName: `عيادة العمولات التجريبية ${i}`,
        currency: 'SAR',
        timezone: 'Asia/Riyadh',
        mfaPolicy: 'OPTIONAL',
        branding: { create: { primaryColor: '#7854D9' } },
      },
    });

    const patient = await ownerDb.patient.create({
      data: {
        clinicId: id,
        patientNumber: `P-00000${i + 1}`,
        fullName: `مريض عمولات تجريبي ${i}`,
        searchName: `مريض عمولات تجريبي ${i}`,
      },
    });
    patients.push(patient.id);
  }

  for (const [i, email] of emails.entries()) {
    const user = await provisionUser(ownerDb, {
      email,
      name: `موظف العمولات ${roles[i]}`,
      password,
      memberships: [{ clinicSlug: `comm-clinic-0-${suffix}`, role: roles[i] }],
    });
    users.push(user.id);
  }

  // Retrieve doctor membership ID
  const docMem = await ownerDb.clinicMembership.findFirstOrThrow({
    where: { clinicId: clinics[0], userId: users[2], role: 'DOCTOR' },
  });
  doctorMembershipId = docMem.id;

  // Add owner to clinic 1 as well for cross-tenant testing
  await ownerDb.clinicMembership.create({
    data: { clinicId: clinics[1], userId: users[0], role: 'CLINIC_OWNER', status: 'ACTIVE' },
  });

  // Seed procedure catalog
  const proc = await ownerDb.aestheticProcedureCatalog.create({
    data: {
      clinicId: clinics[0],
      nameAr: 'جلسة بوتوكس للجبهة',
      category: 'INJECTABLES',
      active: true,
      version: 1,
    },
  });
  procedureCatalogId = proc.id;

  // Seed treatment plan, revision and item
  const plan = await ownerDb.treatmentPlan.create({
    data: {
      clinicId: clinics[0],
      patientId: patients[0],
      clinicianMembershipId: doctorMembershipId,
      status: 'ACTIVE',
      version: 1,
    },
  });
  const revision = await ownerDb.treatmentPlanRevision.create({
    data: {
      clinicId: clinics[0],
      treatmentPlanId: plan.id,
      revisionNumber: 1,
      authorMembershipId: doctorMembershipId,
      title: 'خطة علاج تجريبية',
      clinicalPurpose: 'خطة تجريبية للعمولات',
      status: 'APPROVED',
      approvedByMembershipId: doctorMembershipId,
      approvedAt: new Date(),
    },
  });
  const planItem = await ownerDb.treatmentPlanItem.create({
    data: {
      clinicId: clinics[0],
      revisionId: revision.id,
      procedureCatalogId: procedureCatalogId,
      sessionOrder: 1,
      expectedDurationMinutes: 30,
      status: 'PLANNED',
    },
  });
  treatmentPlanItemId = planItem.id;

  // Seed completed procedure execution
  const procExec = await ownerDb.procedureExecution.create({
    data: {
      clinicId: clinics[0],
      patientId: patients[0],
      clinicianMembershipId: doctorMembershipId,
      treatmentPlanItemId: treatmentPlanItemId,
      status: 'COMPLETED',
      procedureNameArSnapshot: 'جلسة بوتوكس للجبهة',
      procedureCategorySnapshot: 'INJECTABLES',
      procedureCatalogVersion: 1,
      performedAt: new Date(),
      version: 1,
    },
  });
  completedProcedureExecutionId = procExec.id;
});

after(async () => {
  if (app) await app.close();
  if (pool) await pool.end();
  if (ownerDb) await ownerDb.$disconnect();
});

live('1. commission plans and rule creation with immutability protection', async () => {
  const owner = await new Browser().login(0, 0); // Owner in Clinic 0

  // 1. Create a Commission Plan
  const planRes = await owner.request(owner.path('/commission-plans'), 'POST', {
    code: `COMM-PLAN-${suffix.slice(0, 6)}`,
    name: 'خطة عمولات الأطباء 2026',
    description: 'خطة عمولات قسم الإجراءات التجميلية',
  });
  const plan = await json<any>(planRes, 201);
  assert.equal(plan.name, 'خطة عمولات الأطباء 2026');
  assert.equal(plan.status, 'ACTIVE');

  // 2. Add Percentage-based rule (15.00% = 1500 bps) for procedure completed
  const ruleRes = await owner.request(owner.path(`/commission-plans/${plan.id}/rules`), 'POST', {
    calculationType: 'PERCENTAGE',
    rateBasisPoints: 1500,
    earningEvent: 'PROCEDURE_COMPLETED',
    procedureId: procedureCatalogId,
    description: 'عمولة 15% على جلسات البوتوكس المكتملة',
  });
  const updatedPlan = await json<any>(ruleRes, 201);
  assert.equal(updatedPlan.rules.length, 1);
  assert.equal(updatedPlan.rules[0].rateBasisPoints, 1500);
  assert.equal(updatedPlan.rules[0].calculationType, 'PERCENTAGE');

  // 3. Assign DOCTOR to this plan
  const assignRes = await owner.request(owner.path(`/commission-plans/${plan.id}/assignments`), 'POST', {
    practitionerMembershipId: doctorMembershipId,
    effectiveFrom: '2026-01-01T00:00:00.000Z',
    notes: 'تعيين طبيب التجميل الرئيسي',
  });
  const assignedPlan = await json<any>(assignRes, 201);
  assert.equal(assignedPlan.assignments.length, 1);
  assert.equal(assignedPlan.assignments[0].practitionerMembershipId, doctorMembershipId);
});

live('2. commission accrual calculation on completed procedure execution', async () => {
  const owner = await new Browser().login(0, 0);

  const plans = await json<any[]>(await owner.request(owner.path('/commission-plans')), 200);
  const plan = plans[0];
  const rule = plan.rules[0];

  // 1. Create and pay an invoice for the procedure
  const invRes = await owner.request(owner.path('/invoices'), 'POST', {
    patientId: patients[0],
    lines: [{ serviceName: 'جلسة بوتوكس للجبهة', quantity: '1', unitPrice: '1000.00', discount: '0', taxBasisPoints: 0 }],
    requestKey: randomUUID(),
  });
  const inv = await json<any>(invRes, 201);

  const issueRes = await owner.request(owner.path(`/invoices/${inv.id}/issue`), 'POST', {
    expectedVersion: inv.version,
    requestKey: randomUUID(),
  });
  const issued = await json<any>(issueRes, 201);

  await json<any>(await owner.request(owner.path(`/invoices/${inv.id}/payments`), 'POST', {
    amount: '1000.00',
    method: 'CASH',
    expectedVersion: issued.version,
    requestKey: randomUUID(),
  }), 201);

  // 2. Accrue commission for the completed procedure execution (base: 1000.00 at 1500 bps = 150.00 SAR)
  const accrualRes = await owner.request(owner.path('/commission-accruals'), 'POST', {
    planId: plan.id,
    ruleId: rule.id,
    practitionerMembershipId: doctorMembershipId,
    patientId: patients[0],
    invoiceId: inv.id,
    procedureExecutionId: completedProcedureExecutionId,
    baseAmount: '1000.00',
    earningEvent: 'PROCEDURE_COMPLETED',
    notes: 'استحقاق عمولة الإجراء التجميلي',
    requestKey: randomUUID(),
  });
  const accrual = await json<any>(accrualRes, 201);
  assert.equal(accrual.status, 'PENDING');
  assert.equal(accrual.commissionAmountMinor, '15000'); // 150.00 SAR
  assert.equal(accrual.baseAmountMinor, '100000');
});

live('3. commission adjustments with segregation of duties enforcement', async () => {
  const accountant = await new Browser().login(1, 0); // Accountant
  const owner = await new Browser().login(0, 0); // Owner

  const accruals = await json<any[]>(await accountant.request(accountant.path('/commission-accruals')), 200);
  const accrual = accruals[0];

  // 1. Accountant requests a discount adjustment (-20.00 SAR = -2000 minor)
  const adjRes = await accountant.request(accountant.path(`/commission-accruals/${accrual.id}/adjustments`), 'POST', {
    adjustmentAmount: '-20.00',
    reason: 'DISCOUNT_CORRECTION',
    reasonDetails: 'خصم ترويجي للمريض تم تطبيقه لاحقاً',
    requestKey: randomUUID(),
  });
  const adj = await json<any>(adjRes, 201);
  assert.equal(adj.status, 'PENDING');
  assert.equal(adj.adjustmentAmountMinor, '-2000');

  // 2. Accountant attempts to decide/approve their own adjustment -> rejected (403 segregation of duties)
  const selfApproveRes = await accountant.request(accountant.path(`/commission-adjustments/${adj.id}/decide`), 'POST', {
    decision: 'APPROVE',
  });
  assert.equal(selfApproveRes.status, 403);

  // 3. Owner approves the adjustment
  const ownerApproveRes = await owner.request(owner.path(`/commission-adjustments/${adj.id}/decide`), 'POST', {
    decision: 'APPROVE',
  });
  const approvedAdj = await json<any>(ownerApproveRes, 201);
  assert.equal(approvedAdj.status, 'APPROVED');

  // 4. Verify accrual was adjusted from 15000 down to 13000 (130.00 SAR)
  const updatedAccrual = await json<any>(await owner.request(owner.path(`/commission-accruals/${accrual.id}`)), 200);
  assert.equal(updatedAccrual.commissionAmountMinor, '13000');
  assert.equal(updatedAccrual.status, 'ADJUSTED');
});

live('4. commission settlement batch creation and confirmation', async () => {
  const accountant = await new Browser().login(1, 0);

  const accruals = await json<any[]>(await accountant.request(accountant.path('/commission-accruals')), 200);
  const accrual = accruals[0];

  // 1. Create settlement batch
  const settleRes = await accountant.request(accountant.path('/commission-settlements'), 'POST', {
    practitionerMembershipId: doctorMembershipId,
    periodStart: '2026-01-01T00:00:00.000Z',
    periodEnd: '2026-12-31T23:59:59.000Z',
    accrualIds: [accrual.id],
    notes: 'تسوية عمولات شهر يناير',
    requestKey: randomUUID(),
  });
  const settlement = await json<any>(settleRes, 201);
  assert.equal(settlement.status, 'DRAFT');
  assert.equal(settlement.netSettledMinor, '13000');
  assert.equal(settlement.settlementNumber, 'COMM-SETTLE-000001');

  // 2. Confirm settlement with payout reference
  const confirmRes = await accountant.request(accountant.path(`/commission-settlements/${settlement.id}/confirm`), 'POST', {
    payoutReference: 'BANK-TRANSFER-TX-987654',
    expectedVersion: settlement.version,
  });
  const confirmed = await json<any>(confirmRes, 201);
  assert.equal(confirmed.status, 'CONFIRMED');
  assert.equal(confirmed.payoutReference, 'BANK-TRANSFER-TX-987654');

  // 3. Verify accrual is now marked SETTLED
  const settledAccrual = await json<any>(await accountant.request(accountant.path(`/commission-accruals/${accrual.id}`)), 200);
  assert.equal(settledAccrual.status, 'SETTLED');
});

live('5. doctor access control to own statements and denial of clinic-wide reports', async () => {
  const doctor = await new Browser().login(2, 0); // Doctor in Clinic 0

  // 1. Doctor can query their own statement
  const stmtRes = await doctor.request(doctor.path('/commissions/my-statement'));
  const stmt = await json<any>(stmtRes, 200);
  assert.equal(stmt.practitionerMembershipId, doctorMembershipId);
  assert.equal(stmt.settledMinor, '13000');

  // 2. Doctor is denied access to clinic-wide commission accruals list
  const deniedAccruals = await doctor.request(doctor.path('/commission-accruals'));
  assert.equal(deniedAccruals.status, 403);

  // 3. Doctor is denied access to operational reporting
  const deniedReports = await doctor.request(doctor.path('/reports/revenue-collections?startDate=2026-01-01&endDate=2026-12-31'));
  assert.equal(deniedReports.status, 403);
});

live('6. financial reconciliation engine scans all core resources', async () => {
  const accountant = await new Browser().login(1, 0);

  const reconRes = await accountant.request(accountant.path('/reconciliation'));
  const report = await json<any>(reconRes, 200);
  assert.equal(report.clinicId, clinics[0]);
  assert.equal(report.status, 'CLEAN');
  assert.equal(report.totalDiscrepancies, 0);
  assert(report.resourcesScanned.invoicesCount > 0);
  assert(report.resourcesScanned.commissionSettlementsCount > 0);
});

live('7. operational reporting metrics and bounded queries', async () => {
  const accountant = await new Browser().login(1, 0);

  // 1. Revenue & Collections Summary
  const revRes = await accountant.request(accountant.path('/reports/revenue-collections?startDate=2026-01-01&endDate=2026-12-31'));
  const rev = await json<any>(revRes, 200);
  assert(BigInt(rev.invoicedRevenueMinor) > 0n);

  // 2. Installment Aging Report
  const agingRes = await accountant.request(accountant.path('/reports/installment-aging'));
  const aging = await json<any>(agingRes, 200);
  assert.equal(aging.buckets.length, 5);

  // 3. Package Liability Report
  const pkgLiabRes = await accountant.request(accountant.path('/reports/package-liability'));
  const pkgLiab = await json<any>(pkgLiabRes, 200);
  assert(pkgLiab.totalSessionsPurchased >= 0);

  // 4. Practitioner Performance Report
  const perfRes = await accountant.request(accountant.path('/reports/practitioner-performance?startDate=2026-01-01&endDate=2026-12-31'));
  const perf = await json<any>(perfRes, 200);
  assert(perf.practitioners.length > 0);

  // 5. Unbounded date range exceeds 366 days fails closed
  const oversized = await accountant.request(accountant.path('/reports/revenue-collections?startDate=2024-01-01&endDate=2026-12-31'));
  assert.equal(oversized.status, 400);
});

live('8. cross-tenant RLS isolation on commission plans and settlements', async () => {
  const rivalOwner = await new Browser().login(0, 1); // Owner in Clinic 1

  // Rival tries to list Clinic 0's commission plans
  const rivalRes = await rivalOwner.request(`clinics/${clinics[0]}/billing/commission-plans`);
  assert.equal(rivalRes.status, 403);

  // Rival lists their own clinic plans (must be empty, not seeing Clinic 0's plan)
  const ownRes = await rivalOwner.request(`clinics/${clinics[1]}/billing/commission-plans`);
  const ownPlans = await json<any[]>(ownRes, 200);
  assert.equal(ownPlans.length, 0);
});

live('9. financial reconciliation engine detects deliberately injected synthetic discrepancies', async () => {
  const accountant = await new Browser().login(1, 0);

  // 1. Verify that database triggers block direct tampering of Invoice netPaidMinor
  const invoice = await ownerDb.invoice.findFirst({
    where: { clinicId: clinics[0], status: { not: 'VOID' } },
  });
  assert(invoice);

  await assert.rejects(
    async () => {
      await ownerDb.invoice.update({
        where: { id: invoice.id },
        data: { netPaidMinor: invoice.netPaidMinor > 0n ? invoice.netPaidMinor - 1000n : 1000n, version: { increment: 1 } },
      });
    },
    /Financial totals inconsistent/,
  );

  // 2. Find confirmed settlement and seed inventory balance to inject anomalies
  const settlement = await ownerDb.practitionerCommissionSettlement.findFirst({
    where: { clinicId: clinics[0], status: 'CONFIRMED' },
  });
  assert(settlement);

  const location = await ownerDb.inventoryLocation.create({
    data: {
      clinicId: clinics[0],
      code: `LOC-${suffix.slice(0, 6)}`,
      nameAr: 'مستودع تجريبي للمطابقة',
      type: 'MAIN_STORE',
    },
  });
  const product = await ownerDb.inventoryProduct.create({
    data: {
      clinicId: clinics[0],
      sku: `SKU-${suffix.slice(0, 6)}`,
      nameAr: 'منتج تجريبي للمطابقة',
      nameEn: 'Recon Test Product',
      category: 'INJECTABLE',
      unit: 'SYRINGE',
    },
  });
  const balance = await ownerDb.inventoryBalance.create({
    data: {
      clinicId: clinics[0],
      locationId: location.id,
      productId: product.id,
      onHandQuantity: '10.0000', // No stock movements recorded, ledger sum is 0.0000
    },
  });

  const originalSettlementGross = settlement.grossAmountMinor;
  await ownerDb.practitionerCommissionSettlement.update({
    where: { id: settlement.id },
    data: { grossAmountMinor: originalSettlementGross + 2500n, version: { increment: 1 } },
  });

  try {
    // 3. Run reconciliation and assert discrepancy detection
    const reconRes = await accountant.request(accountant.path('/reconciliation'));
    const report = await json<any>(reconRes, 200);

    assert.equal(report.status, 'DISCREPANCIES_DETECTED');
    assert(report.totalDiscrepancies >= 2);

    const codes = report.findings.map((f: any) => f.code);
    assert(codes.includes('COMMISSION_GROSS_AMOUNT_DRIFT'));
    assert(codes.includes('COMMISSION_NET_SETTLED_MISMATCH'));
    assert(codes.includes('INVENTORY_LEDGER_BALANCE_MISMATCH'));
  } finally {
    // 4. Rollback synthetic discrepancies to restore clean baseline
    await ownerDb.practitionerCommissionSettlement.update({
      where: { id: settlement.id },
      data: { grossAmountMinor: originalSettlementGross, version: { increment: 1 } },
    });
    // Inventory balances are immutable against deletion; update back to 0.0000 to match ledger sum
    await ownerDb.inventoryBalance.update({
      where: { id: balance.id },
      data: { onHandQuantity: '0.0000', version: { increment: 1 } },
    });
  }

  // 5. Confirm clean state restored
  const cleanReconRes = await accountant.request(accountant.path('/reconciliation'));
  const cleanReport = await json<any>(cleanReconRes, 200);
  assert.equal(cleanReport.status, 'CLEAN');
  assert.equal(cleanReport.totalDiscrepancies, 0);
});
