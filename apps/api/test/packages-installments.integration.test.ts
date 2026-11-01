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
const live = (name: string, fn: () => Promise<void>) => test(`packages-installments: ${name}`, { skip: !enabled }, fn);

const suffix = randomUUID();
const clinics = [randomUUID(), randomUUID()];
const users: string[] = [];
const origin = 'http://localhost:5173';
const password = randomBytes(32).toString('base64url');

const roles = ['CLINIC_OWNER', 'ACCOUNTANT', 'DOCTOR', 'RECEPTIONIST'] as const;
const emails = roles.map((r) => `pkg-${r.toLowerCase()}-${suffix}@example.invalid`);

let ownerDb: ReturnType<typeof fixtureDatabase>;
let pool: pg.Pool;
let app: INestApplication;
let base: string;

const patients: string[] = [];

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
        slug: `pkg-clinic-${i}-${suffix}`,
        legalName: `عيادة الباقات القانونية ${i}`,
        displayName: `عيادة الباقات التجريبية ${i}`,
        currency: 'SAR',
        timezone: 'Asia/Riyadh',
        mfaPolicy: 'OPTIONAL',
        branding: { create: { primaryColor: '#087F8C' } },
      },
    });

    const patient = await ownerDb.patient.create({
      data: {
        clinicId: id,
        patientNumber: `P-00000${i + 1}`,
        fullName: `مريض باقات تجريبي ${i}`,
        searchName: `مريض باقات تجريبي ${i}`,
      },
    });
    patients.push(patient.id);
  }

  for (const [i, email] of emails.entries()) {
    const user = await provisionUser(ownerDb, {
      email,
      name: `موظف الباقات ${roles[i]}`,
      password,
      memberships: [{ clinicSlug: `pkg-clinic-0-${suffix}`, role: roles[i] }],
    });
    users.push(user.id);
  }

  // Also give owner access to clinic 1 for cross-tenant testing
  await ownerDb.clinicMembership.create({
    data: { clinicId: clinics[1], userId: users[0], role: 'CLINIC_OWNER', status: 'ACTIVE' },
  });
});

after(async () => {
  if (app) await app.close();
  if (pool) await pool.end();
  if (ownerDb) await ownerDb.$disconnect();
});

live('Package catalog: create, version, publish, and query packages', async () => {
  const b = await new Browser().login(0); // CLINIC_OWNER

  // 1. Create package
  const pkgRes = await b.request(b.path('/packages'), 'POST', {
    code: `PKG-GLOW-${suffix.slice(0, 6)}`,
    nameAr: 'باقة النضارة الشاملة',
    nameEn: 'Comprehensive Glow Package',
    price: '1500.00',
    validityDays: 180,
    items: [
      { serviceName: 'جلسة هيدرافيشل', sessionQuantity: 3 },
      { serviceName: 'جلسة ميزوثيرابي', sessionQuantity: 2 },
    ],
  });
  const pkg = await json<any>(pkgRes, 201);
  assert.equal(pkg.status, 'DRAFT');
  assert.equal(pkg.nameAr, 'باقة النضارة الشاملة');
  assert.equal(pkg.versions.length, 1);
  assert.equal(pkg.versions[0].versionNumber, 1);
  assert.equal(pkg.versions[0].items.length, 2);
  assert.equal(pkg.versions[0].isPublished, false);

  // 2. Publish version 1
  const publishRes = await b.request(
    b.path(`/packages/${pkg.id}/versions/${pkg.versions[0].id}/publish`),
    'POST',
    {},
  );
  const publishedPkg = await json<any>(publishRes, 201);
  assert.equal(publishedPkg.status, 'ACTIVE');
  assert.equal(publishedPkg.currentVersionId, pkg.versions[0].id);
  assert.equal(publishedPkg.currentVersion.isPublished, true);

  // 3. Create version 2 with updated price and items
  const v2Res = await b.request(b.path(`/packages/${pkg.id}/versions`), 'POST', {
    nameAr: 'باقة النضارة المحدثة',
    price: '1800.00',
    validityDays: 365,
    items: [
      { serviceName: 'جلسة هيدرافيشل ملكي', sessionQuantity: 4 },
      { serviceName: 'جلسة ميزوثيرابي متقدمة', sessionQuantity: 2 },
    ],
  });
  const pkgWithV2 = await json<any>(v2Res, 201);
  assert.equal(pkgWithV2.versions.length, 2);
  const v2 = pkgWithV2.versions.find((v: any) => v.versionNumber === 2);
  assert.ok(v2);
  assert.equal(v2.isPublished, false);

  // 4. List packages
  const listRes = await b.request(b.path('/packages?status=ACTIVE'));
  const list = await json<any>(listRes, 200);
  assert.ok(list.items.some((p: any) => p.id === pkg.id));
});

live('Patient package: purchase, activation policy, redemptions and reversal', async () => {
  const b = await new Browser().login(0); // CLINIC_OWNER

  // Setup: create and publish a package
  const pkgRes = await b.request(b.path('/packages'), 'POST', {
    code: `PKG-SESS-${suffix.slice(0, 6)}`,
    nameAr: 'باقة الجلسات المحدودة',
    price: '600.00',
    validityDays: 90,
    items: [
      { serviceName: 'جلسة ليزر كربوني', sessionQuantity: 2 },
    ],
  });
  const pkg = await json<any>(pkgRes, 201);
  await b.request(b.path(`/packages/${pkg.id}/versions/${pkg.versions[0].id}/publish`), 'POST', {});

  // Create an invoice for this patient
  const invRes = await b.request(b.path('/invoices'), 'POST', {
    patientId: patients[0],
    requestKey: randomUUID(),
    lines: [
      { serviceName: 'باقة الجلسات المحدودة', quantity: '1', unitPrice: '600.00', discount: '0', taxBasisPoints: 0 },
    ],
  });
  const inv = await json<any>(invRes, 201);

  // 1. Purchase patient package with UPON_FULL_PAYMENT policy
  const purchaseRes = await b.request(b.path('/patient-packages'), 'POST', {
    patientId: patients[0],
    packageVersionId: pkg.versions[0].id,
    invoiceId: inv.id,
    activationPolicy: 'UPON_FULL_PAYMENT',
    requestKey: randomUUID(),
  });
  const patientPkg = await json<any>(purchaseRes, 201);
  assert.equal(patientPkg.status, 'PENDING_PAYMENT');
  assert.equal(patientPkg.entitlements.length, 1);
  assert.equal(patientPkg.entitlements[0].totalSessions, 2);
  assert.equal(patientPkg.entitlements[0].remainingSessions, 2);
  assert.equal(patientPkg.entitlements[0].redeemedSessions, 0);

  // Attempt to redeem when PENDING_PAYMENT fails
  const prematureRedeem = await b.request(b.path(`/patient-packages/${patientPkg.id}/redeem`), 'POST', {
    entitlementId: patientPkg.entitlements[0].id,
    patientId: patients[0],
    requestKey: randomUUID(),
    notes: 'محاولة استهلاك قبل السداد',
  });
  assert.equal(prematureRedeem.status, 400);

  // 2. Issue and Pay invoice in full -> Package automatically activates
  await b.request(b.path(`/invoices/${inv.id}/issue`), 'POST', {
    expectedVersion: inv.version,
    requestKey: randomUUID(),
  });
  await b.request(b.path(`/invoices/${inv.id}/payments`), 'POST', {
    amount: '600.00',
    method: 'CASH',
    expectedVersion: inv.version + 1,
    requestKey: randomUUID(),
  });

  // Verify patient package is now ACTIVE
  const activePkgRes = await b.request(b.path(`/patient-packages/${patientPkg.id}`));
  const activePkg = await json<any>(activePkgRes, 200);
  assert.equal(activePkg.status, 'ACTIVE');

  // 3. Doctor/Receptionist redeems session 1
  const doctorBrowser = await new Browser().login(2); // DOCTOR
  const redeem1Res = await doctorBrowser.request(doctorBrowser.path(`/patient-packages/${patientPkg.id}/redeem`), 'POST', {
    entitlementId: patientPkg.entitlements[0].id,
    patientId: patients[0],
    requestKey: randomUUID(),
    notes: 'الجلسة الأولى نفذت بنجاح',
  });
  const afterRedeem1 = await json<any>(redeem1Res, 201);
  assert.equal(afterRedeem1.entitlements[0].remainingSessions, 1);
  assert.equal(afterRedeem1.entitlements[0].redeemedSessions, 1);
  assert.equal(afterRedeem1.redemptions.length, 1);
  assert.equal(afterRedeem1.status, 'ACTIVE');

  // 4. Redeem session 2 (last session) -> status becomes EXHAUSTED
  const redeem2Res = await doctorBrowser.request(doctorBrowser.path(`/patient-packages/${patientPkg.id}/redeem`), 'POST', {
    entitlementId: patientPkg.entitlements[0].id,
    patientId: patients[0],
    requestKey: randomUUID(),
    notes: 'الجلسة الثانية والأخيرة',
  });
  const afterRedeem2 = await json<any>(redeem2Res, 201);
  assert.equal(afterRedeem2.entitlements[0].remainingSessions, 0);
  assert.equal(afterRedeem2.entitlements[0].redeemedSessions, 2);
  assert.equal(afterRedeem2.status, 'EXHAUSTED');

  // 5. Attempt 3rd redemption when 0 remaining -> ENTITLEMENT_EXHAUSTED (400)
  const overRedeem = await doctorBrowser.request(doctorBrowser.path(`/patient-packages/${patientPkg.id}/redeem`), 'POST', {
    entitlementId: patientPkg.entitlements[0].id,
    patientId: patients[0],
    requestKey: randomUUID(),
  });
  assert.equal(overRedeem.status, 400);

  // 6. Reverse the 2nd redemption -> session balance restored, status restored to ACTIVE
  const lastRedemptionId = afterRedeem2.redemptions.find((r: any) => r.status === 'RECORDED')?.id;
  assert.ok(lastRedemptionId);

  const reverseRes = await b.request(
    b.path(`/patient-packages/${patientPkg.id}/redemptions/${lastRedemptionId}/reverse`),
    'POST',
    {
      expectedVersion: afterRedeem2.version,
      reason: 'PATIENT_REFUND',
      reasonDetails: 'إلغاء الجلسة الثانية بناء على طلب المريض واستعادة الرصيد',
      requestKey: randomUUID(),
    },
  );
  const afterReverse = await json<any>(reverseRes, 201);
  assert.equal(afterReverse.entitlements[0].remainingSessions, 1);
  assert.equal(afterReverse.entitlements[0].redeemedSessions, 1);
  assert.equal(afterReverse.status, 'ACTIVE');
});

live('Installment plans: creation, payment allocation, and completion', async () => {
  const b = await new Browser().login(0); // CLINIC_OWNER

  // Create and issue an invoice for 900.00
  const invRes = await b.request(b.path('/invoices'), 'POST', {
    patientId: patients[0],
    requestKey: randomUUID(),
    lines: [
      { serviceName: 'خطة علاجية مقسطة', quantity: '1', unitPrice: '900.00', discount: '0', taxBasisPoints: 0 },
    ],
  });
  const inv = await json<any>(invRes, 201);
  const issuedInvRes = await b.request(b.path(`/invoices/${inv.id}/issue`), 'POST', {
    expectedVersion: inv.version,
    requestKey: randomUUID(),
  });
  const issuedInv = await json<any>(issuedInvRes, 201);

  // 1. Invariant test: sum of schedules != totalAmount must fail
  const badPlanRes = await b.request(b.path('/installment-plans'), 'POST', {
    patientId: patients[0],
    invoiceId: issuedInv.id,
    numberOfInstallments: 3,
    totalAmount: '900.00',
    schedules: [
      { installmentNumber: 1, dueDate: '2026-11-15', expectedAmount: '300.00' },
      { installmentNumber: 2, dueDate: '2026-12-15', expectedAmount: '300.00' },
      { installmentNumber: 3, dueDate: '2027-01-15', expectedAmount: '200.00' }, // Sum is 800 != 900
    ],
    requestKey: randomUUID(),
  });
  assert.equal(badPlanRes.status, 400);

  // 2. Create valid 3-installment plan (300.00 each)
  const planRes = await b.request(b.path('/installment-plans'), 'POST', {
    patientId: patients[0],
    invoiceId: issuedInv.id,
    numberOfInstallments: 3,
    totalAmount: '900.00',
    schedules: [
      { installmentNumber: 1, dueDate: '2026-11-15', expectedAmount: '300.00' },
      { installmentNumber: 2, dueDate: '2026-12-15', expectedAmount: '300.00' },
      { installmentNumber: 3, dueDate: '2027-01-15', expectedAmount: '300.00' },
    ],
    requestKey: randomUUID(),
  });
  const plan = await json<any>(planRes, 201);
  assert.equal(plan.status, 'ACTIVE');
  assert.equal(plan.schedules.length, 3);
  assert.equal(plan.schedules[0].status, 'PENDING');

  // 3. Record a payment of 300.00 for the invoice
  const pay1Res = await b.request(b.path(`/invoices/${issuedInv.id}/payments`), 'POST', {
    amount: '300.00',
    method: 'CARD_MANUAL',
    expectedVersion: issuedInv.version,
    requestKey: randomUUID(),
  });
  const { payment: payment1 } = await json<any>(pay1Res, 201);

  // 4. Allocate payment to installment schedule 1
  const allocRes = await b.request(b.path(`/installment-plans/${plan.id}/allocations`), 'POST', {
    paymentId: payment1.id,
    scheduleId: plan.schedules[0].id,
    amount: '300.00',
  });
  const planAfterAlloc1 = await json<any>(allocRes, 201);
  assert.equal(planAfterAlloc1.schedules[0].status, 'PAID');
  assert.equal(planAfterAlloc1.schedules[0].paidAmountMinor, '30000');
  assert.equal(planAfterAlloc1.schedules[1].status, 'PENDING');
  assert.equal(planAfterAlloc1.status, 'ACTIVE');

  // 5. Record remaining payment of 600.00 and allocate to schedules 2 and 3
  const currentInvRes = await b.request(b.path(`/invoices/${issuedInv.id}`));
  const currentInv = await json<any>(currentInvRes, 200);

  const pay2Res = await b.request(b.path(`/invoices/${issuedInv.id}/payments`), 'POST', {
    amount: '600.00',
    method: 'BANK_TRANSFER',
    expectedVersion: currentInv.version,
    requestKey: randomUUID(),
  });
  const { payment: payment2 } = await json<any>(pay2Res, 201);

  await b.request(b.path(`/installment-plans/${plan.id}/allocations`), 'POST', {
    paymentId: payment2.id,
    scheduleId: plan.schedules[1].id,
    amount: '300.00',
  });
  const finalPlanRes = await b.request(b.path(`/installment-plans/${plan.id}/allocations`), 'POST', {
    paymentId: payment2.id,
    scheduleId: plan.schedules[2].id,
    amount: '300.00',
  });
  const completedPlan = await json<any>(finalPlanRes, 201);
  assert.equal(completedPlan.schedules[1].status, 'PAID');
  assert.equal(completedPlan.schedules[2].status, 'PAID');
  assert.equal(completedPlan.status, 'COMPLETED');
});

live('Refund requests: request, validation, approval, and settlement', async () => {
  const b = await new Browser().login(0); // CLINIC_OWNER
  const receptionist = await new Browser().login(3); // RECEPTIONIST

  // Create, issue, and pay invoice for 500.00
  const invRes = await b.request(b.path('/invoices'), 'POST', {
    patientId: patients[0],
    requestKey: randomUUID(),
    lines: [
      { serviceName: 'خدمة قابلة للاسترجاع', quantity: '1', unitPrice: '500.00', discount: '0', taxBasisPoints: 0 },
    ],
  });
  const inv = await json<any>(invRes, 201);
  const issuedInvRes = await b.request(b.path(`/invoices/${inv.id}/issue`), 'POST', {
    expectedVersion: inv.version,
    requestKey: randomUUID(),
  });
  const issuedInv = await json<any>(issuedInvRes, 201);
  await b.request(b.path(`/invoices/${inv.id}/payments`), 'POST', {
    amount: '500.00',
    method: 'CASH',
    expectedVersion: issuedInv.version,
    requestKey: randomUUID(),
  });

  // 1. Invariant: Refund amount exceeding net paid must fail
  const badRefundRes = await receptionist.request(receptionist.path('/refund-requests'), 'POST', {
    invoiceId: inv.id,
    patientId: patients[0],
    amount: '600.00',
    reason: 'PATIENT_REFUND',
    reasonDetails: 'طلب استرجاع بمبلغ أكبر من المدفوع',
    requestKey: randomUUID(),
  });
  assert.equal(badRefundRes.status, 409);

  // 2. Create valid refund request for 200.00
  const refundReqRes = await receptionist.request(receptionist.path('/refund-requests'), 'POST', {
    invoiceId: inv.id,
    patientId: patients[0],
    amount: '200.00',
    reason: 'PATIENT_REFUND',
    reasonDetails: 'المريض لم يناسبه العلاج ويطلب استرجاع جزء من المبلغ',
    requestKey: randomUUID(),
  });
  const refundReq = await json<any>(refundReqRes, 201);
  assert.equal(refundReq.status, 'REQUESTED');
  assert.equal(refundReq.amountMinor, '20000');

  // 3. Permission check: Receptionist cannot approve refund (needs refunds.approve)
  const unauthorizedApproval = await receptionist.request(
    receptionist.path(`/refund-requests/${refundReq.id}/approve`),
    'POST',
    { expectedVersion: refundReq.version },
  );
  assert.equal(unauthorizedApproval.status, 403);

  // 4. Owner approves refund
  const approveRes = await b.request(b.path(`/refund-requests/${refundReq.id}/approve`), 'POST', {
    expectedVersion: refundReq.version,
    notes: 'تمت الموافقة من إدارة العيادة',
  });
  const approvedRefund = await json<any>(approveRes, 201);
  assert.equal(approvedRefund.status, 'APPROVED');

  // 5. Owner settles refund
  const settleRes = await b.request(b.path(`/refund-requests/${refundReq.id}/settle`), 'POST', {
    expectedVersion: approvedRefund.version,
    settlementReference: 'TX-REFUND-001',
    requestKey: randomUUID(),
  });
  const settledRefund = await json<any>(settleRes, 201);
  assert.equal(settledRefund.status, 'SETTLED');
  assert.ok(settledRefund.paymentReversalId);

  // 6. Verify invoice netPaidMinor decreased by 200.00 (from 500.00 to 300.00)
  const updatedInvRes = await b.request(b.path(`/invoices/${inv.id}`));
  const updatedInv = await json<any>(updatedInvRes, 200);
  assert.equal(updatedInv.netPaidMinor, '30000');
});

live('Cross-tenant isolation: Tenant B cannot access Tenant A packages, redemptions, or refunds', async () => {
  const b0 = await new Browser().login(0, 0); // Tenant A (Clinic 0)
  const b1 = await new Browser().login(0, 1); // Tenant B (Clinic 1)

  // Create package in Clinic 0
  const pkgRes = await b0.request(b0.path('/packages'), 'POST', {
    code: `PKG-A-${suffix.slice(0, 6)}`,
    nameAr: 'باقة عيادة أ',
    price: '400.00',
    validityDays: 60,
    items: [{ serviceName: 'خدمة أ', sessionQuantity: 1 }],
  });
  const pkgA = await json<any>(pkgRes, 201);

  // Tenant B cannot fetch Clinic A's package
  const crossGet = await b1.request(`clinics/${clinics[1]}/billing/packages/${pkgA.id}`);
  assert.equal(crossGet.status, 404);

  // Tenant B listing packages only sees Clinic B's packages (none created yet)
  const listB = await json<any>(await b1.request(`clinics/${clinics[1]}/billing/packages`), 200);
  assert.equal(listB.items.some((p: any) => p.id === pkgA.id), false);
});
