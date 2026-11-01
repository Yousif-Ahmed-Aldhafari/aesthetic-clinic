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
const live = (name: string, fn: () => Promise<void>) => test(`inventory: ${name}`, { skip: !enabled }, fn);

const suffix = randomUUID();
const clinics = [randomUUID(), randomUUID()];
const users: string[] = [];
const origin = 'http://localhost:5173';
const password = randomBytes(32).toString('base64url');

const accounts = [
  'owner',
  'admin',
  'doctor',
  'reception',
].map((x) => `${x}-inv-${suffix}@example.invalid`);

let ownerDb: ReturnType<typeof fixtureDatabase>;
let pool: pg.Pool;
let app: INestApplication;
let base: string;

class Browser {
  cookies = new Map<string, string>();
  csrf = '';

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

  async login(index: number, clinic = 0) {
    this.csrf = ((await (await this.request('auth/csrf')).json()) as { csrfToken: string }).csrfToken;
    let r = await this.request('auth/login', 'POST', { email: accounts[index], password });
    assert.equal(r.status, 200);
    this.csrf = ((await r.json()) as { csrfToken: string }).csrfToken;
    r = await this.request('auth/clinic', 'POST', { clinicId: clinics[clinic] });
    assert.equal(r.status, 200);
    this.csrf = ((await r.json()) as { csrfToken: string }).csrfToken;
    return this;
  }

  path(clinic = 0, sub = '') {
    return `clinics/${clinics[clinic]}/inventory${sub}`;
  }
}

before(async () => {
  if (!enabled) return;
  const urls = testUrls();
  Object.assign(process.env, {
    DATABASE_URL: urls.runtime,
    NODE_ENV: 'test',
    AUTH_CSRF_SECRET: randomBytes(48).toString('base64url'),
    CORS_ORIGINS: origin,
    AUTH_LOGIN_ACCOUNT_LIMIT: '100',
    AUTH_LOGIN_IP_LIMIT: '10000',
  });

  const { AppModule } = await import('../src/app.module.js');
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication({ logger: false });
  configureApp(app);
  await app.listen(0, '127.0.0.1');
  base = await app.getUrl();

  ownerDb = fixtureDatabase();
  pool = new pg.Pool({ connectionString: urls.runtime });

  for (const [i, id] of clinics.entries()) {
    await ownerDb.clinic.create({
      data: {
        id,
        slug: `inv-clinic-${i}-${suffix}`,
        legalName: `عيادة لمسة تجريبية للمخزون ${i + 1}`,
        displayName: `عيادة لمسة تجريبية للمخزون ${i + 1}`,
        currency: 'SAR',
        branding: { create: {} },
      },
    });
  }

  const roles = ['CLINIC_OWNER', 'CLINIC_ADMIN', 'DOCTOR', 'RECEPTIONIST'] as const;
  for (const [i, email] of accounts.entries()) {
    const u = await provisionUser(ownerDb, {
      email,
      name: `موظف تجريبي ${i}`,
      password,
      memberships: [{ clinicSlug: `inv-clinic-0-${suffix}`, role: roles[i] }],
    });
    users.push(u.id);
  }

  // Also assign admin to Clinic 1 for cross-tenant testing
  await ownerDb.clinicMembership.create({
    data: { clinicId: clinics[1], userId: users[1], role: 'CLINIC_ADMIN', status: 'ACTIVE' },
  });
  await ownerDb.$executeRawUnsafe('ALTER TABLE public."InventoryStockMovement" ENABLE TRIGGER inventory_movement_immutability_guard');
});

after(async () => {
  if (ownerDb) {
    try {
      await ownerDb.$executeRawUnsafe('ALTER TABLE public."InventoryStockMovement" DISABLE TRIGGER inventory_movement_immutability_guard');
      await ownerDb.inventoryBalance.deleteMany({ where: { clinicId: { in: clinics } } });
      await ownerDb.inventoryStockMovement.deleteMany({ where: { clinicId: { in: clinics } } });
      await ownerDb.inventoryLocation.deleteMany({ where: { clinicId: { in: clinics } } });
      await ownerDb.inventoryProduct.deleteMany({ where: { clinicId: { in: clinics } } });
      await ownerDb.clinicMembership.deleteMany({ where: { clinicId: { in: clinics } } });
      await ownerDb.session.deleteMany({ where: { userId: { in: users } } });
      await ownerDb.user.deleteMany({ where: { id: { in: users } } });
      await ownerDb.clinic.deleteMany({ where: { id: { in: clinics } } });
      await ownerDb.clinicSlugReservation.deleteMany({
        where: { slug: { in: clinics.map((_, i) => `inv-clinic-${i}-${suffix}`) } },
      });
      await ownerDb.$executeRawUnsafe('ALTER TABLE public."InventoryStockMovement" ENABLE TRIGGER inventory_movement_immutability_guard');
    } catch {}
    await ownerDb.$disconnect().catch(() => {});
  }
  if (pool) await pool.end().catch(() => {});
  if (app) await app.close().catch(() => {});
});

live('product catalog lifecycle, unique SKU per clinic, and RBAC enforcement', async () => {
  const admin = await new Browser().login(1, 0);
  const doctor = await new Browser().login(2, 0);
  const reception = await new Browser().login(3, 0);

  // 1. Admin creates a skincare product
  const createRes = await admin.request(admin.path(0, '/products'), 'POST', {
    sku: 'SKIN-CRM-01',
    nameAr: 'كريم ترطيب طبي',
    nameEn: 'Medical Hydration Cream',
    category: 'SKINCARE',
    unit: 'PIECE',
    reorderThreshold: '10.0000',
    description: 'كريم ترطيب مكثف للبشرة بعد الجلسات',
  });
  assert.equal(createRes.status, 201);
  const product = (await createRes.json()) as any;
  assert.equal(product.sku, 'SKIN-CRM-01');
  assert.equal(product.nameAr, 'كريم ترطيب طبي');
  assert.equal(product.requiresBatchTracking, false);
  assert.equal(product.reorderThreshold, '10');

  // 2. Injectable defaults to requiresBatchTracking = true
  const injectRes = await admin.request(admin.path(0, '/products'), 'POST', {
    sku: 'BOTOX-100U',
    nameAr: 'بوتوكس أليرجان 100 وحدة',
    nameEn: 'Botox Allergan 100U',
    category: 'INJECTABLE',
    unit: 'VIAL',
    reorderThreshold: '5.0000',
  });
  assert.equal(injectRes.status, 201);
  const injectProduct = (await injectRes.json()) as any;
  assert.equal(injectProduct.requiresBatchTracking, true);

  // 3. Duplicate SKU in same clinic fails with 409 Conflict
  const dupRes = await admin.request(admin.path(0, '/products'), 'POST', {
    sku: 'SKIN-CRM-01',
    nameAr: 'كريم آخر بنفس الكود',
    category: 'SKINCARE',
    unit: 'PIECE',
  });
  assert.equal(dupRes.status, 409);

  // 4. Same SKU in Clinic 1 succeeds (clinic isolation)
  const adminClinic1 = await new Browser().login(1, 1);
  const clinic1Res = await adminClinic1.request(adminClinic1.path(1, '/products'), 'POST', {
    sku: 'SKIN-CRM-01',
    nameAr: 'كريم عيادة 2',
    category: 'SKINCARE',
    unit: 'PIECE',
  });
  assert.equal(clinic1Res.status, 201);

  // 5. Doctor has read-only access
  const docList = await doctor.request(doctor.path(0, '/products'));
  assert.equal(docList.status, 200);
  const docData = (await docList.json()) as any;
  assert(docData.items.length >= 2);

  // 6. Receptionist is forbidden from managing products
  const recCreate = await reception.request(reception.path(0, '/products'), 'POST', {
    sku: 'REC-SKU',
    nameAr: 'محاولة غير مصرحة',
    category: 'CONSUMABLE',
    unit: 'BOX',
  });
  assert.equal(recCreate.status, 403);

  // 7. Update product with optimistic versioning
  const updateRes = await admin.request(admin.path(0, `/products/${product.id}`), 'PATCH', {
    expectedVersion: 1,
    nameAr: 'كريم ترطيب طبي متطور',
    reorderThreshold: '15.0000',
  });
  assert.equal(updateRes.status, 200);
  const updated = (await updateRes.json()) as any;
  assert.equal(updated.nameAr, 'كريم ترطيب طبي متطور');
  assert.equal(updated.version, 2);

  // Stale version update fails
  const staleRes = await admin.request(admin.path(0, `/products/${product.id}`), 'PATCH', {
    expectedVersion: 1,
    nameAr: 'تعديل قديم',
  });
  assert.equal(staleRes.status, 409);
});

live('stock locations lifecycle, unique code per clinic, and doctor read-only access', async () => {
  const admin = await new Browser().login(1, 0);
  const doctor = await new Browser().login(2, 0);

  // 1. Create main store and treatment room
  const loc1Res = await admin.request(admin.path(0, '/locations'), 'POST', {
    code: 'MAIN-STORE',
    nameAr: 'المستودع الرئيسي',
    type: 'MAIN_STORE',
    description: 'المستودع المركزي للعيادة',
  });
  assert.equal(loc1Res.status, 201);
  const loc1 = (await loc1Res.json()) as any;
  assert.equal(loc1.code, 'MAIN-STORE');

  const loc2Res = await admin.request(admin.path(0, '/locations'), 'POST', {
    code: 'ROOM-01',
    nameAr: 'غرفة الحقن 1',
    type: 'TREATMENT_ROOM',
  });
  assert.equal(loc2Res.status, 201);

  // 2. Duplicate code in same clinic fails
  const dupRes = await admin.request(admin.path(0, '/locations'), 'POST', {
    code: 'MAIN-STORE',
    nameAr: 'مستودع مكرر',
    type: 'MAIN_STORE',
  });
  assert.equal(dupRes.status, 409);

  // 3. Doctor can list locations
  const docLocs = await doctor.request(doctor.path(0, '/locations'));
  assert.equal(docLocs.status, 200);
  const docData = (await docLocs.json()) as any;
  assert(docData.length >= 2);
});

live('opening balance, stock receipt, issue, and negative balance prevention', async () => {
  const admin = await new Browser().login(1, 0);

  // Create product and location
  const pRes = await admin.request(admin.path(0, '/products'), 'POST', {
    sku: 'DERMA-ROLL-01',
    nameAr: 'ديرما رولر 0.5 مم',
    category: 'CONSUMABLE',
    unit: 'PIECE',
  });
  const product = (await pRes.json()) as any;

  const locRes = await admin.request(admin.path(0, '/locations'), 'POST', {
    code: 'PHARMACY-STORE',
    nameAr: 'صيدلية العيادة',
    type: 'MAIN_STORE',
  });
  const location = (await locRes.json()) as any;

  // 1. Post opening balance
  const openRes = await admin.request(admin.path(0, '/stock/opening-balance'), 'POST', {
    productId: product.id,
    locationId: location.id,
    quantity: '50.0000',
  });
  assert.equal(openRes.status, 201);
  const openMov = (await openRes.json()) as any;
  assert.equal(openMov.movementType, 'OPENING_BALANCE');
  assert.equal(openMov.quantity, '50');
  assert.equal(openMov.balanceAfter, '50');

  // Attempting duplicate opening balance fails with 409
  const dupOpen = await admin.request(admin.path(0, '/stock/opening-balance'), 'POST', {
    productId: product.id,
    locationId: location.id,
    quantity: '20.0000',
  });
  assert.equal(dupOpen.status, 409);

  // 2. Receive stock (+25.5000)
  const recvRes = await admin.request(admin.path(0, '/stock/receive'), 'POST', {
    productId: product.id,
    locationId: location.id,
    quantity: '25.5000',
    reasonCode: 'PURCHASE_RECEIPT',
    reasonExplanation: 'شحنة إضافية من المورد',
  });
  assert.equal(recvRes.status, 201);
  const recvMov = (await recvRes.json()) as any;
  assert.equal(recvMov.movementType, 'RECEIPT');
  assert.equal(recvMov.balanceAfter, '75.5');

  // 3. Issue stock (-10.5000) for clinical use
  const issueRes = await admin.request(admin.path(0, '/stock/issue'), 'POST', {
    productId: product.id,
    locationId: location.id,
    quantity: '10.5000',
    reasonCode: 'CLINICAL_USE',
  });
  assert.equal(issueRes.status, 201);
  const issueMov = (await issueRes.json()) as any;
  assert.equal(issueMov.movementType, 'ISSUE');
  assert.equal(issueMov.quantity, '-10.5');
  assert.equal(issueMov.balanceAfter, '65');

  // 4. Overdraw prevention: requesting 100 when 65 available fails closed
  const overdrawRes = await admin.request(admin.path(0, '/stock/issue'), 'POST', {
    productId: product.id,
    locationId: location.id,
    quantity: '100.0000',
    reasonCode: 'CLINICAL_USE',
  });
  assert.equal(overdrawRes.status, 409);

  // Verify balance is unchanged at 65
  const balRes = await admin.request(admin.path(0, `/stock/balances?productId=${product.id}&locationId=${location.id}`));
  assert.equal(balRes.status, 200);
  const [balance] = (await balRes.json()) as any;
  assert.equal(balance.onHandQuantity, '65');
});

live('regulated injectable clinical use gate and disposal issue allowance', async () => {
  const admin = await new Browser().login(1, 0);

  // Create an injectable product requiring batch tracking
  const pRes = await admin.request(admin.path(0, '/products'), 'POST', {
    sku: 'JUVEDERM-ULTRA',
    nameAr: 'جوفيديرم ألترا 4',
    category: 'INJECTABLE',
    unit: 'SYRINGE',
    requiresBatchTracking: true,
  });
  assert.equal(pRes.status, 201);
  const product = (await pRes.json()) as any;

  const locRes = await admin.request(admin.path(0, '/locations'), 'POST', {
    code: 'INJECT-ROOM-A',
    nameAr: 'غرفة الحقن أ',
    type: 'TREATMENT_ROOM',
  });
  const location = (await locRes.json()) as any;

  // Receive initial stock
  await admin.request(admin.path(0, '/stock/receive'), 'POST', {
    productId: product.id,
    locationId: location.id,
    quantity: '10.0000',
    reasonCode: 'PURCHASE_RECEIPT',
  });

  // 1. Generic clinical issue must be BLOCKED with explicit Phase 4 Step 4.2 message
  const blockedIssue = await admin.request(admin.path(0, '/stock/issue'), 'POST', {
    productId: product.id,
    locationId: location.id,
    quantity: '1.0000',
    reasonCode: 'CLINICAL_USE',
  });
  assert.equal(blockedIssue.status, 400);
  const errorJson = (await blockedIssue.json()) as any;
  const msg = errorJson.error?.message || errorJson.message || JSON.stringify(errorJson);
  assert.match(
    msg,
    /Batch and expiry tracking is required for clinical consumption of this product \(Phase 4 Step 4.2\)/,
  );

  // 2. Issue for DAMAGED or EXPIRED with explanation IS permitted
  const validDisposal = await admin.request(admin.path(0, '/stock/issue'), 'POST', {
    productId: product.id,
    locationId: location.id,
    quantity: '1.0000',
    reasonCode: 'DAMAGED',
    reasonExplanation: 'تلف العبوة الخارجية وفقدان التعقيم أثناء المناولة',
  });
  assert.equal(validDisposal.status, 201);
  const disposalMov = (await validDisposal.json()) as any;
  assert.equal(disposalMov.balanceAfter, '9');
});

live('inter-location transfer creates atomic opposing movement legs', async () => {
  const admin = await new Browser().login(1, 0);

  const pRes = await admin.request(admin.path(0, '/products'), 'POST', {
    sku: 'GAUZE-STERILE',
    nameAr: 'شاش معقم',
    category: 'CONSUMABLE',
    unit: 'BOX',
  });
  const product = (await pRes.json()) as any;

  const loc1Res = await admin.request(admin.path(0, '/locations'), 'POST', {
    code: 'CENTRAL-DEPOT',
    nameAr: 'المستودع الأوسط',
    type: 'MAIN_STORE',
  });
  const loc1 = (await loc1Res.json()) as any;

  const loc2Res = await admin.request(admin.path(0, '/locations'), 'POST', {
    code: 'ROOM-LASER-1',
    nameAr: 'غرفة الليزر 1',
    type: 'TREATMENT_ROOM',
  });
  const loc2 = (await loc2Res.json()) as any;

  // Receive 20 into central depot
  await admin.request(admin.path(0, '/stock/receive'), 'POST', {
    productId: product.id,
    locationId: loc1.id,
    quantity: '20.0000',
    reasonCode: 'PURCHASE_RECEIPT',
  });

  // Transfer 6 from central depot to laser room
  const transferRes = await admin.request(admin.path(0, '/stock/transfer'), 'POST', {
    productId: product.id,
    sourceLocationId: loc1.id,
    targetLocationId: loc2.id,
    quantity: '6.0000',
    reasonExplanation: 'تغذية غرفة الليزر باحتياجات الأسبوع',
  });
  assert.equal(transferRes.status, 201);
  const { transferOut, transferIn } = (await transferRes.json()) as any;

  assert.equal(transferOut.movementType, 'TRANSFER_OUT');
  assert.equal(transferOut.quantity, '-6');
  assert.equal(transferOut.balanceAfter, '14');

  assert.equal(transferIn.movementType, 'TRANSFER_IN');
  assert.equal(transferIn.quantity, '6');
  assert.equal(transferIn.balanceAfter, '6');

  // Transfer to same location fails
  const selfTransfer = await admin.request(admin.path(0, '/stock/transfer'), 'POST', {
    productId: product.id,
    sourceLocationId: loc1.id,
    targetLocationId: loc1.id,
    quantity: '1.0000',
  });
  assert.equal(selfTransfer.status, 400);

  // Transfer exceeding available source stock fails
  const excessiveTransfer = await admin.request(admin.path(0, '/stock/transfer'), 'POST', {
    productId: product.id,
    sourceLocationId: loc1.id,
    targetLocationId: loc2.id,
    quantity: '50.0000',
  });
  assert.equal(excessiveTransfer.status, 409);
});

live('physical stock discrepancy adjustment and ledger reconciliation', async () => {
  const admin = await new Browser().login(1, 0);

  const pRes = await admin.request(admin.path(0, '/products'), 'POST', {
    sku: 'GLOVES-LATEX-M',
    nameAr: 'قفازات طبية قياس وسط',
    category: 'CONSUMABLE',
    unit: 'BOX',
  });
  const product = (await pRes.json()) as any;

  const locRes = await admin.request(admin.path(0, '/locations'), 'POST', {
    code: 'INVENTORY-ROOM-B',
    nameAr: 'غرفة المستلزمات ب',
    type: 'MAIN_STORE',
  });
  const location = (await locRes.json()) as any;

  // Receive 30 boxes
  await admin.request(admin.path(0, '/stock/receive'), 'POST', {
    productId: product.id,
    locationId: location.id,
    quantity: '30.0000',
    reasonCode: 'PURCHASE_RECEIPT',
  });

  // Adjust to physical count of 28 (discrepancy of -2)
  const adjustRes = await admin.request(admin.path(0, '/stock/adjust'), 'POST', {
    productId: product.id,
    locationId: location.id,
    targetQuantity: '28.0000',
    reasonCode: 'DISCREPANCY_CORRECTION',
    reasonExplanation: 'جرد دوري شهري: تبين نقص علبتين مسجلتين خطأ',
  });
  assert.equal(adjustRes.status, 201);
  const adjustMov = (await adjustRes.json()) as any;
  assert.equal(adjustMov.movementType, 'ADJUSTMENT');
  assert.equal(adjustMov.quantity, '-2');
  assert.equal(adjustMov.balanceAfter, '28');

  // Verify Ledger Reconciliation reports 100% match
  const reconcileRes = await admin.request(admin.path(0, '/stock/reconcile'), 'POST');
  assert.equal(reconcileRes.status, 201);
  const report = (await reconcileRes.json()) as any;
  assert.equal(report.status, 'RECONCILED');
  assert.equal(report.discrepancies.length, 0);
  assert(report.totalItemsChecked >= 1);
});

live('idempotency key prevents duplicate postings on network retry', async () => {
  const admin = await new Browser().login(1, 0);

  const pRes = await admin.request(admin.path(0, '/products'), 'POST', {
    sku: 'ALCOHOL-SWAB-01',
    nameAr: 'مسحات كحولية معقمة',
    category: 'CONSUMABLE',
    unit: 'BOX',
  });
  const product = (await pRes.json()) as any;

  const locRes = await admin.request(admin.path(0, '/locations'), 'POST', {
    code: 'IDEMP-LOC',
    nameAr: 'مستودع اختبار التكرار',
    type: 'MAIN_STORE',
  });
  const location = (await locRes.json()) as any;

  const idempKey = `idemp-tx-${randomUUID()}`;

  // First POST
  const first = await admin.request(admin.path(0, '/stock/receive'), 'POST', {
    productId: product.id,
    locationId: location.id,
    quantity: '10.0000',
    reasonCode: 'PURCHASE_RECEIPT',
    idempotencyKey: idempKey,
  });
  assert.equal(first.status, 201);
  const firstMov = (await first.json()) as any;

  // Immediate retry with exact same idempotencyKey
  const second = await admin.request(admin.path(0, '/stock/receive'), 'POST', {
    productId: product.id,
    locationId: location.id,
    quantity: '10.0000',
    reasonCode: 'PURCHASE_RECEIPT',
    idempotencyKey: idempKey,
  });
  assert.equal(second.status, 201);
  const secondMov = (await second.json()) as any;

  // Must return the existing movement without double-crediting
  assert.equal(firstMov.id, secondMov.id);

  // Balance must be exactly 10, NOT 20
  const balRes = await admin.request(admin.path(0, `/stock/balances?productId=${product.id}&locationId=${location.id}`));
  const [balance] = (await balRes.json()) as any;
  assert.equal(balance.onHandQuantity, '10');
});

live('database immutability trigger and privilege revocation prevent SQL UPDATE and DELETE on movements', async () => {
  // 1. Runtime application user lacks UPDATE and DELETE privileges
  const runtimeClient = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL });
  await runtimeClient.connect();
  try {
    await assert.rejects(
      runtimeClient.query(`UPDATE public."InventoryStockMovement" SET "quantity" = 9999 WHERE "clinicId" = $1`, [clinics[0]]),
      (err: any) => {
        assert(err.message.includes('permission denied for table InventoryStockMovement'));
        assert.equal(err.code, '42501');
        return true;
      },
    );
    await assert.rejects(
      runtimeClient.query(`DELETE FROM public."InventoryStockMovement" WHERE "clinicId" = $1`, [clinics[0]]),
      (err: any) => {
        assert(err.message.includes('permission denied for table InventoryStockMovement'));
        assert.equal(err.code, '42501');
        return true;
      },
    );
  } finally {
    await runtimeClient.end().catch(() => {});
  }

  // 2. Migration owner (who has full SQL privileges) is blocked by the database immutability trigger
  const migrationUrl = process.env.TEST_MIGRATION_DATABASE_URL;
  if (!migrationUrl) return;
  const ownerClient = new pg.Client({ connectionString: migrationUrl });
  await ownerClient.connect();
  try {
    const { rows } = await ownerClient.query(
      `SELECT id FROM public."InventoryStockMovement" WHERE "clinicId" = $1 LIMIT 1`,
      [clinics[0]],
    );
    assert(rows.length > 0, 'Movement record must exist to test trigger execution');
    const movementId = rows[0].id;

    // Trigger blocks UPDATE even for table owner
    await assert.rejects(
      ownerClient.query(`UPDATE public."InventoryStockMovement" SET "quantity" = 9999 WHERE id = $1`, [movementId]),
      (err: any) => {
        assert(err.message.includes('Inventory movements are append-only and cannot be updated'));
        assert.equal(err.code, '42501');
        return true;
      },
    );

    // Trigger blocks DELETE even for table owner
    await assert.rejects(
      ownerClient.query(`DELETE FROM public."InventoryStockMovement" WHERE id = $1`, [movementId]),
      (err: any) => {
        assert(err.message.includes('Inventory movements are append-only and cannot be deleted'));
        assert.equal(err.code, '42501');
        return true;
      },
    );
  } finally {
    await ownerClient.end().catch(() => {});
  }
});

