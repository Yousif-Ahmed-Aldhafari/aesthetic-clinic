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
  await ownerDb.$executeRawUnsafe('ALTER TABLE public."InventoryStockMovement" ENABLE TRIGGER inventory_movement_immutability_guard').catch(() => {});
  await ownerDb.$executeRawUnsafe('ALTER TABLE public."InventoryClinicalConsumption" ENABLE TRIGGER inventory_consumption_immutability_guard').catch(() => {});
  await ownerDb.$executeRawUnsafe('ALTER TABLE public."InventoryBatch" ENABLE TRIGGER inventory_batch_integrity_guard').catch(() => {});
  await ownerDb.$executeRawUnsafe('ALTER TABLE public."InventoryBatchBalance" ENABLE TRIGGER inventory_batch_balance_integrity_guard').catch(() => {});
});

after(async () => {
  if (ownerDb) {
    try {
      await ownerDb.$executeRawUnsafe('ALTER TABLE public."InventoryStockMovement" DISABLE TRIGGER inventory_movement_immutability_guard').catch(() => {});
      await ownerDb.$executeRawUnsafe('ALTER TABLE public."InventoryClinicalConsumption" DISABLE TRIGGER inventory_consumption_immutability_guard').catch(() => {});
      await ownerDb.$executeRawUnsafe('ALTER TABLE public."InventoryBatch" DISABLE TRIGGER inventory_batch_integrity_guard').catch(() => {});
      await ownerDb.$executeRawUnsafe('ALTER TABLE public."InventoryBatchBalance" DISABLE TRIGGER inventory_batch_balance_integrity_guard').catch(() => {});
      await ownerDb.$executeRawUnsafe('ALTER TABLE public."ProcedureExecution" DISABLE TRIGGER procedure_execution_guard').catch(() => {});
      await ownerDb.$executeRawUnsafe('ALTER TABLE public."PatientConsent" DISABLE TRIGGER patient_consent_guard').catch(() => {});
      await ownerDb.$executeRawUnsafe('ALTER TABLE public."ConsentSignatureEvidence" DISABLE TRIGGER consent_signature_evidence_guard').catch(() => {});
      await ownerDb.$executeRawUnsafe('ALTER TABLE public."ConsentTemplateVersion" DISABLE TRIGGER consent_template_version_guard').catch(() => {});
      await ownerDb.$executeRawUnsafe('ALTER TABLE public."TreatmentPlanRevision" DISABLE TRIGGER treatment_revision_guard').catch(() => {});
      await ownerDb.$executeRawUnsafe('ALTER TABLE public."TreatmentPlanItem" DISABLE TRIGGER treatment_item_guard').catch(() => {});
      await ownerDb.$executeRawUnsafe('ALTER TABLE public."TreatmentPlan" DISABLE TRIGGER treatment_plan_guard').catch(() => {});

      await ownerDb.inventoryAlertAcknowledgment.deleteMany({ where: { clinicId: { in: clinics } } });
      await ownerDb.inventoryStockCountItem.deleteMany({ where: { clinicId: { in: clinics } } });
      await ownerDb.inventoryStockCount.deleteMany({ where: { clinicId: { in: clinics } } });
      await ownerDb.inventoryStockCountCounter.deleteMany({ where: { clinicId: { in: clinics } } });
      await ownerDb.inventoryGoodsReceiptLine.deleteMany({ where: { clinicId: { in: clinics } } });
      await ownerDb.inventoryGoodsReceipt.deleteMany({ where: { clinicId: { in: clinics } } });
      await ownerDb.inventoryGoodsReceiptCounter.deleteMany({ where: { clinicId: { in: clinics } } });
      await ownerDb.inventoryPurchaseOrderLine.deleteMany({ where: { clinicId: { in: clinics } } });
      await ownerDb.inventoryPurchaseOrder.deleteMany({ where: { clinicId: { in: clinics } } });
      await ownerDb.inventoryPurchaseOrderCounter.deleteMany({ where: { clinicId: { in: clinics } } });
      await ownerDb.inventorySupplier.deleteMany({ where: { clinicId: { in: clinics } } });

      await ownerDb.inventoryClinicalConsumption.deleteMany({ where: { clinicId: { in: clinics } } });
      await ownerDb.inventoryBatchBalance.deleteMany({ where: { clinicId: { in: clinics } } });
      await ownerDb.inventoryStockMovement.deleteMany({ where: { clinicId: { in: clinics } } });
      await ownerDb.inventoryBatch.deleteMany({ where: { clinicId: { in: clinics } } });
      await ownerDb.inventoryBalance.deleteMany({ where: { clinicId: { in: clinics } } });
      await ownerDb.consentSignatureEvidence.deleteMany({ where: { clinicId: { in: clinics } } });
      await ownerDb.patientConsent.deleteMany({ where: { clinicId: { in: clinics } } });
      await ownerDb.consentTemplateVersion.deleteMany({ where: { clinicId: { in: clinics } } });
      await ownerDb.consentTemplate.deleteMany({ where: { clinicId: { in: clinics } } });
      await ownerDb.procedureExecution.deleteMany({ where: { clinicId: { in: clinics } } });
      await ownerDb.treatmentPlanItem.deleteMany({ where: { clinicId: { in: clinics } } });
      await ownerDb.treatmentPlanRevision.deleteMany({ where: { clinicId: { in: clinics } } });
      await ownerDb.treatmentPlan.deleteMany({ where: { clinicId: { in: clinics } } });
      await ownerDb.aestheticProcedureCatalog.deleteMany({ where: { clinicId: { in: clinics } } });
      await ownerDb.patient.deleteMany({ where: { clinicId: { in: clinics } } });
      await ownerDb.inventoryLocation.deleteMany({ where: { clinicId: { in: clinics } } });
      await ownerDb.inventoryProduct.deleteMany({ where: { clinicId: { in: clinics } } });
      await ownerDb.clinicMembership.deleteMany({ where: { clinicId: { in: clinics } } });
      await ownerDb.session.deleteMany({ where: { userId: { in: users } } });
      await ownerDb.user.deleteMany({ where: { id: { in: users } } });
      await ownerDb.clinic.deleteMany({ where: { id: { in: clinics } } });
      await ownerDb.clinicSlugReservation.deleteMany({
        where: { slug: { in: clinics.map((_, i) => `inv-clinic-${i}-${suffix}`) } },
      });
    } catch {} finally {
      await ownerDb.$executeRawUnsafe('ALTER TABLE public."InventoryStockMovement" ENABLE TRIGGER inventory_movement_immutability_guard').catch(() => {});
      await ownerDb.$executeRawUnsafe('ALTER TABLE public."InventoryClinicalConsumption" ENABLE TRIGGER inventory_consumption_immutability_guard').catch(() => {});
      await ownerDb.$executeRawUnsafe('ALTER TABLE public."InventoryBatch" ENABLE TRIGGER inventory_batch_integrity_guard').catch(() => {});
      await ownerDb.$executeRawUnsafe('ALTER TABLE public."InventoryBatchBalance" ENABLE TRIGGER inventory_batch_balance_integrity_guard').catch(() => {});
      await ownerDb.$executeRawUnsafe('ALTER TABLE public."ProcedureExecution" ENABLE TRIGGER procedure_execution_guard').catch(() => {});
      await ownerDb.$executeRawUnsafe('ALTER TABLE public."PatientConsent" ENABLE TRIGGER patient_consent_guard').catch(() => {});
      await ownerDb.$executeRawUnsafe('ALTER TABLE public."ConsentSignatureEvidence" ENABLE TRIGGER consent_signature_evidence_guard').catch(() => {});
      await ownerDb.$executeRawUnsafe('ALTER TABLE public."ConsentTemplateVersion" ENABLE TRIGGER consent_template_version_guard').catch(() => {});
      await ownerDb.$executeRawUnsafe('ALTER TABLE public."TreatmentPlanRevision" ENABLE TRIGGER treatment_revision_guard').catch(() => {});
      await ownerDb.$executeRawUnsafe('ALTER TABLE public."TreatmentPlanItem" ENABLE TRIGGER treatment_item_guard').catch(() => {});
      await ownerDb.$executeRawUnsafe('ALTER TABLE public."TreatmentPlan" ENABLE TRIGGER treatment_plan_guard').catch(() => {});
    }
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

  // Attempt to replay the same idempotencyKey with a conflicting payload (different quantity)
  const conflictRes = await admin.request(admin.path(0, '/stock/receive'), 'POST', {
    productId: product.id,
    locationId: location.id,
    quantity: '25.0000',
    reasonCode: 'PURCHASE_RECEIPT',
    idempotencyKey: idempKey,
  });
  assert.equal(conflictRes.status, 409);
  const conflictErr = (await conflictRes.json()) as any;
  assert.equal(conflictErr.error?.code, 'INVENTORY_IDEMPOTENCY_CONFLICT');
});

live('products requiring batch tracking cannot escape traceability via generic adjustment', async () => {
  const admin = await new Browser().login(1, 0);

  const pRes = await admin.request(admin.path(0, '/products'), 'POST', {
    sku: `BOTOX-ESC-${randomUUID().slice(0, 8)}`,
    nameAr: 'بوتوكس اختبار الهروب من التتبع',
    category: 'INJECTABLE',
    unit: 'VIAL',
    requiresBatchTracking: true,
  });
  assert.equal(pRes.status, 201);
  const product = (await pRes.json()) as any;

  const locRes = await admin.request(admin.path(0, '/locations'), 'POST', {
    code: `ESC-LOC-${randomUUID().slice(0, 8)}`,
    nameAr: 'مستودع تجربة التتبع',
    type: 'MAIN_STORE',
  });
  const location = (await locRes.json()) as any;

  // Generic adjustment without batch must be rejected
  const adjustRes = await admin.request(admin.path(0, '/stock/adjust'), 'POST', {
    productId: product.id,
    locationId: location.id,
    targetQuantity: '50.0000',
    reasonCode: 'DISCREPANCY_CORRECTION',
    reasonExplanation: 'محاولة تعديل رصيد صنف تشغيلات بدون تحديد الدفعة',
  });
  assert.equal(adjustRes.status, 400);
  const err = (await adjustRes.json()) as any;
  assert.equal(err.error?.code, 'INVENTORY_BATCH_REQUIRED_FOR_PRODUCT');
});

live('concurrent stock issues against the same balance execute without race conditions', async () => {
  const admin = await new Browser().login(1, 0);

  const pRes = await admin.request(admin.path(0, '/products'), 'POST', {
    sku: `RACE-PROD-${randomUUID().slice(0, 8)}`,
    nameAr: 'منتج اختبار التزامن',
    category: 'CONSUMABLE',
    unit: 'PIECE',
    requiresBatchTracking: false,
  });
  const product = (await pRes.json()) as any;

  const locRes = await admin.request(admin.path(0, '/locations'), 'POST', {
    code: `RACE-LOC-${randomUUID().slice(0, 8)}`,
    nameAr: 'مستودع اختبار التزامن',
    type: 'MAIN_STORE',
  });
  const location = (await locRes.json()) as any;

  // Initial stock: 10 units
  await admin.request(admin.path(0, '/stock/receive'), 'POST', {
    productId: product.id,
    locationId: location.id,
    quantity: '10.0000',
    reasonCode: 'PURCHASE_RECEIPT',
  });

  // Launch two concurrent issues of 6 units each (total 12 > 10)
  const [res1, res2] = await Promise.all([
    admin.request(admin.path(0, '/stock/issue'), 'POST', {
      productId: product.id,
      locationId: location.id,
      quantity: '6.0000',
      reasonCode: 'CLINICAL_USE',
    }),
    admin.request(admin.path(0, '/stock/issue'), 'POST', {
      productId: product.id,
      locationId: location.id,
      quantity: '6.0000',
      reasonCode: 'CLINICAL_USE',
    }),
  ]);

  // Exactly one should succeed (201) and one should fail (409 conflict or insufficient stock)
  const statuses = [res1.status, res2.status].sort();
  assert.deepEqual(statuses, [201, 409]);

  // Final balance must be exactly 4 (10 - 6), never negative
  const balRes = await admin.request(admin.path(0, `/stock/balances?productId=${product.id}&locationId=${location.id}`));
  const [balance] = (await balRes.json()) as any;
  assert.equal(balance.onHandQuantity, '4');
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

live('batch/lot registration, duplicate rejection, and cross-clinic tenant isolation', async () => {
  const admin = await new Browser().login(1, 0);

  // 1. Create a batch-tracked product
  const prodRes = await admin.request(admin.path(0, '/products'), 'POST', {
    sku: `LOT-PROD-${suffix.slice(0, 8)}`,
    nameAr: 'بوتوكس أليرجان 100 وحدة',
    category: 'INJECTABLE',
    unit: 'VIAL',
    requiresBatchTracking: true,
  });
  assert.equal(prodRes.status, 201);
  const prod = (await prodRes.json()) as any;

  // 2. Register a batch
  const batchRes1 = await admin.request(admin.path(0, '/batches'), 'POST', {
    productId: prod.id,
    batchNumber: `LOT-C88-${suffix.slice(0, 6)}`,
    expirationDate: '2028-06-30',
    initialQuantity: '50.0000',
    manufacturerName: 'Allergan Aesthetics',
  });
  assert.equal(batchRes1.status, 201);
  const batch1 = (await batchRes1.json()) as any;
  assert.equal(batch1.batchNumber, `LOT-C88-${suffix.slice(0, 6)}`);
  assert.equal(batch1.status, 'AVAILABLE');

  // 3. Duplicate batch number for same product in same clinic must be rejected
  const dupRes = await admin.request(admin.path(0, '/batches'), 'POST', {
    productId: prod.id,
    batchNumber: `LOT-C88-${suffix.slice(0, 6)}`,
    expirationDate: '2028-06-30',
    initialQuantity: '20.0000',
  });
  assert.equal(dupRes.status, 409);
  const dupErr = (await dupRes.json()) as any;
  assert.equal(dupErr.error?.code, 'INVENTORY_DUPLICATE_BATCH');

  // 4. Cross-clinic tenant isolation: admin in clinic 1 cannot view or access clinic 0's batch
  const adminClinic1 = await new Browser().login(1, 1);
  const crossGet = await adminClinic1.request(adminClinic1.path(1, `/batches/${batch1.id}`));
  assert.equal(crossGet.status, 404);
});

live('batch expiry validation respects clinic-local calendar dates', async () => {
  const admin = await new Browser().login(1, 0);

  const prodRes = await admin.request(admin.path(0, '/products'), 'POST', {
    sku: `EXP-PROD-${suffix.slice(0, 8)}`,
    nameAr: 'فيلر جوفيديرم الترا',
    category: 'INJECTABLE',
    unit: 'SYRINGE',
    requiresBatchTracking: true,
  });
  const prod = (await prodRes.json()) as any;

  // 1. Past expiration date is rejected
  const pastRes = await admin.request(admin.path(0, '/batches'), 'POST', {
    productId: prod.id,
    batchNumber: `LOT-PAST-${suffix.slice(0, 6)}`,
    expirationDate: '2021-01-01',
    initialQuantity: '10.0000',
  });
  assert.equal(pastRes.status, 400);
  const pastErr = (await pastRes.json()) as any;
  assert.equal(pastErr.error?.code, 'INVENTORY_BATCH_EXPIRED');

  // 2. Invalid date format is rejected
  const malformedRes = await admin.request(admin.path(0, '/batches'), 'POST', {
    productId: prod.id,
    batchNumber: `LOT-BAD-${suffix.slice(0, 6)}`,
    expirationDate: 'not-a-date',
    initialQuantity: '10.0000',
  });
  assert.equal(malformedRes.status, 400);

  // 3. Impossible calendar date (Feb 30) is rejected
  const feb30Res = await admin.request(admin.path(0, '/batches'), 'POST', {
    productId: prod.id,
    batchNumber: `LOT-FEB30-${suffix.slice(0, 6)}`,
    expirationDate: '2028-02-30',
    initialQuantity: '10.0000',
  });
  assert.equal(feb30Res.status, 400);
});

live('batch quarantine, recall, and issue blocking workflow', async () => {
  const admin = await new Browser().login(1, 0);

  const locRes = await admin.request(admin.path(0, '/locations'), 'POST', {
    code: `LOC-QR-${suffix.slice(0, 6)}`,
    nameAr: 'غرفة عيادة الحجر',
  });
  const loc = (await locRes.json()) as any;

  const prodRes = await admin.request(admin.path(0, '/products'), 'POST', {
    sku: `QR-PROD-${suffix.slice(0, 8)}`,
    nameAr: 'ديسبورت 300 وحدة',
    category: 'INJECTABLE',
    unit: 'VIAL',
    requiresBatchTracking: true,
  });
  const prod = (await prodRes.json()) as any;

  // Create batch with initial opening balance
  const batchRes = await admin.request(admin.path(0, '/batches'), 'POST', {
    productId: prod.id,
    batchNumber: `LOT-QR-${suffix.slice(0, 6)}`,
    expirationDate: '2028-12-31',
    initialQuantity: '20.0000',
    locationId: loc.id,
  });
  assert.equal(batchRes.status, 201);
  const batch = (await batchRes.json()) as any;

  // 1. Quarantine batch
  const qRes = await admin.request(admin.path(0, `/batches/${batch.id}/quarantine`), 'POST', {
    reason: 'اشتباه تغير في درجة حرارة الثلاجة أثناء التخزين',
  });
  assert.equal(qRes.status, 201);
  const quarantined = (await qRes.json()) as any;
  assert.equal(quarantined.status, 'QUARANTINED');

  // Attempt to issue from quarantined batch -> BLOCKED
  const issueQ = await admin.request(admin.path(0, '/batches/issue'), 'POST', {
    productId: prod.id,
    batchId: batch.id,
    locationId: loc.id,
    quantity: '2.0000',
    reasonCode: 'DAMAGED',
  });
  assert.equal(issueQ.status, 400);
  const qErr = (await issueQ.json()) as any;
  assert.equal(qErr.error?.code, 'INVENTORY_BATCH_QUARANTINED');

  // 2. Release batch back to AVAILABLE
  const relRes = await admin.request(admin.path(0, `/batches/${batch.id}/release`), 'POST', {});
  assert.equal(relRes.status, 201);
  const released = (await relRes.json()) as any;
  assert.equal(released.status, 'AVAILABLE');

  // Issue now succeeds
  const issueOk = await admin.request(admin.path(0, '/batches/issue'), 'POST', {
    productId: prod.id,
    batchId: batch.id,
    locationId: loc.id,
    quantity: '2.0000',
    reasonCode: 'DAMAGED',
  });
  assert.equal(issueOk.status, 201);

  // 3. Recall batch
  const recRes = await admin.request(admin.path(0, `/batches/${batch.id}/recall`), 'POST', {
    reason: 'سحب احترازي من الشركة المصنعة رقم تعميم 402',
  });
  assert.equal(recRes.status, 201);
  const recalled = (await recRes.json()) as any;
  assert.equal(recalled.status, 'RECALLED');

  // Attempt to issue from recalled batch -> BLOCKED
  const issueRec = await admin.request(admin.path(0, '/batches/issue'), 'POST', {
    productId: prod.id,
    batchId: batch.id,
    locationId: loc.id,
    quantity: '1.0000',
    reasonCode: 'DAMAGED',
  });
  assert.equal(issueRec.status, 400);
  const recErr = (await issueRec.json()) as any;
  assert.equal(recErr.error?.code, 'INVENTORY_BATCH_RECALLED');

  // Attempt to release a recalled batch -> BLOCKED by immutable status
  const relRec = await admin.request(admin.path(0, `/batches/${batch.id}/release`), 'POST', {});
  assert.equal(relRec.status, 400);
  const relRecErr = (await relRec.json()) as any;
  assert.equal(relRecErr.error?.code, 'INVENTORY_BATCH_IMMUTABLE_STATUS');
});

live('batch stock transfer preserves lot balance consistency across locations', async () => {
  const admin = await new Browser().login(1, 0);

  const [loc1Res, loc2Res] = await Promise.all([
    admin.request(admin.path(0, '/locations'), 'POST', {
      code: `MS-${suffix.slice(0, 6)}`,
      nameAr: 'مستودع رئيسي تجريبي',
      type: 'MAIN_STORE',
    }),
    admin.request(admin.path(0, '/locations'), 'POST', {
      code: `TR-${suffix.slice(0, 6)}`,
      nameAr: 'غرفة معالجة 1',
      type: 'TREATMENT_ROOM',
    }),
  ]);
  const loc1 = (await loc1Res.json()) as any;
  const loc2 = (await loc2Res.json()) as any;

  const prodRes = await admin.request(admin.path(0, '/products'), 'POST', {
    sku: `TRF-PROD-${suffix.slice(0, 8)}`,
    nameAr: 'إبر فيلر رادييس 1.5 مل',
    category: 'INJECTABLE',
    unit: 'SYRINGE',
    requiresBatchTracking: true,
  });
  const prod = (await prodRes.json()) as any;

  // Create batch with 15 units at Location 1
  const batchRes = await admin.request(admin.path(0, '/batches'), 'POST', {
    productId: prod.id,
    batchNumber: `LOT-TRF-${suffix.slice(0, 6)}`,
    expirationDate: '2028-11-30',
    initialQuantity: '15.0000',
    locationId: loc1.id,
  });
  assert.equal(batchRes.status, 201);
  const batch = (await batchRes.json()) as any;

  // Transfer 5 units from Location 1 to Location 2
  const trfRes = await admin.request(admin.path(0, '/batches/transfer'), 'POST', {
    productId: prod.id,
    batchId: batch.id,
    sourceLocationId: loc1.id,
    targetLocationId: loc2.id,
    quantity: '5.0000',
    reasonExplanation: 'تزويد غرفة العلاج',
  });
  assert.equal(trfRes.status, 201);

  // Check Batch details: location 1 has 10, location 2 has 5
  const batchDetailsRes = await admin.request(admin.path(0, `/batches/${batch.id}`));
  assert.equal(batchDetailsRes.status, 200);
  const batchDetails = (await batchDetailsRes.json()) as any;
  assert.equal(batchDetails.totalOnHandQuantity, '15');
  const balMap = new Map(batchDetails.batchBalances.map((bb: any) => [bb.locationId, bb.onHandQuantity]));
  assert.equal(balMap.get(loc1.id), '10');
  assert.equal(balMap.get(loc2.id), '5');

  // Check general balances: loc1 = 10, loc2 = 5
  const balRes = await admin.request(admin.path(0, `/stock/balances?productId=${prod.id}`));
  const bList = (await balRes.json()) as any[];
  const prodBalMap = new Map(bList.map((b: any) => [b.locationId, b.onHandQuantity]));
  assert.equal(prodBalMap.get(loc1.id), '10');
  assert.equal(prodBalMap.get(loc2.id), '5');
});

live('clinical consumption: atomic stock deduction, consent eligibility, doctor check, and voiding', async () => {
  const admin = await new Browser().login(1, 0);
  const doctor = await new Browser().login(2, 0);

  // 1. Create patient and doctor resource
  const patient = await ownerDb.patient.create({
    data: {
      clinicId: clinics[0],
      fullName: 'مريضة سريرية لاختبار المخزون',
      searchName: 'مريضة سريرية لاختبار المخزون',
      patientNumber: `P-${String(Math.floor(100000 + Math.random() * 900000))}`,
      gender: 'FEMALE',
      dateOfBirth: new Date('1992-04-10'),
    },
  });

  const doctorMembership = await ownerDb.clinicMembership.findFirstOrThrow({
    where: { clinicId: clinics[0], userId: users[2] },
  });

  // Create procedure catalog item
  const catalog = await ownerDb.aestheticProcedureCatalog.create({
    data: {
      clinicId: clinics[0],
      nameAr: 'حقن بوتوكس للجبهة',
      category: 'حقن تجميلي',
      version: 1,
    },
  });

  // Create treatment plan & approved revision
  const plan = await ownerDb.treatmentPlan.create({
    data: {
      clinicId: clinics[0],
      patientId: patient.id,
      clinicianMembershipId: doctorMembership.id,
    },
  });

  const revision = await ownerDb.treatmentPlanRevision.create({
    data: {
      clinicId: clinics[0],
      treatmentPlanId: plan.id,
      revisionNumber: 1,
      authorMembershipId: doctorMembership.id,
      title: 'خطة علاج البوتوكس',
      clinicalPurpose: 'إزالة التجاعيد التعبيرية',
      status: 'APPROVED',
      approvedByMembershipId: doctorMembership.id,
      approvedAt: new Date(),
    },
  });

  const planItem = await ownerDb.treatmentPlanItem.create({
    data: {
      clinicId: clinics[0],
      revisionId: revision.id,
      procedureCatalogId: catalog.id,
      sessionOrder: 1,
      expectedDurationMinutes: 30,
    },
  });

  // Create procedure execution assigned to this doctor
  const execution = await ownerDb.procedureExecution.create({
    data: {
      clinicId: clinics[0],
      patientId: patient.id,
      clinicianMembershipId: doctorMembership.id,
      treatmentPlanItemId: planItem.id,
      procedureCatalogVersion: 1,
      procedureNameArSnapshot: catalog.nameAr,
      procedureCategorySnapshot: catalog.category,
      status: 'READY',
    },
  });

  // Create verified consent for this procedure
  const template = await ownerDb.consentTemplate.create({
    data: {
      clinicId: clinics[0],
      title: 'نموذج موافقة البوتوكس',
      purpose: 'PROCEDURE',
      procedureCatalogId: catalog.id,
    },
  });
  const tVersion = await ownerDb.consentTemplateVersion.create({
    data: {
      clinicId: clinics[0],
      templateId: template.id,
      versionNumber: 1,
      titleAr: 'الموافقة على حقن البوتوكس',
      bodyAr: 'أقر أنا المريضة بالموافقة على إجراء حقن البوتوكس واطلعت على المحاذير والمضاعفات المحتملة.',
      risksTextAr: 'كدمات خفيفة',
      alternativesTextAr: 'لا يوجد',
      contentDigestSha256: randomBytes(32).toString('hex'),
      status: 'PUBLISHED',
      publishedAt: new Date(),
      publishedByMembershipId: doctorMembership.id,
    },
  });
  const consent = await ownerDb.patientConsent.create({
    data: {
      clinicId: clinics[0],
      patientId: patient.id,
      templateVersionId: tVersion.id,
      purpose: 'PROCEDURE',
      procedureCatalogId: catalog.id,
      treatmentPlanId: plan.id,
      treatmentPlanItemId: planItem.id,
      status: 'ACTIVE',
      validFrom: new Date(Date.now() - 3600000),
      expiresAt: new Date(Date.now() + 86400000 * 30),
      verifiedAt: new Date(),
      verifiedByMembershipId: doctorMembership.id,
      preparedByMembershipId: doctorMembership.id,
    },
  });
  await ownerDb.consentSignatureEvidence.create({
    data: {
      clinicId: clinics[0],
      patientConsentId: consent.id,
      signerCapacity: 'PATIENT',
      signerName: patient.fullName,
      signatureType: 'DRAWN_BASE64',
      signatureData: 'data:image/png;base64,validsignatureevidence',
      evidenceHashSha256: randomBytes(32).toString('hex'),
      signedAt: new Date(),
    },
  });

  // 2. Prepare inventory: product, location, batch with 10 units
  const locRes = await admin.request(admin.path(0, '/locations'), 'POST', {
    code: `CLIN-LOC-${suffix.slice(0, 6)}`,
    nameAr: 'غرفة حقن العيادة',
  });
  const loc = (await locRes.json()) as any;

  const prodRes = await admin.request(admin.path(0, '/products'), 'POST', {
    sku: `BOTOX-${suffix.slice(0, 8)}`,
    nameAr: 'بوتوكس طبي 100 وحدة',
    category: 'INJECTABLE',
    unit: 'VIAL',
    requiresBatchTracking: true,
  });
  const prod = (await prodRes.json()) as any;

  const batchRes = await admin.request(admin.path(0, '/batches'), 'POST', {
    productId: prod.id,
    batchNumber: `LOT-BTX-${suffix.slice(0, 6)}`,
    expirationDate: '2028-10-31',
    initialQuantity: '10.0000',
    locationId: loc.id,
  });
  const batch = (await batchRes.json()) as any;

  // 3. Doctor records clinical consumption (1.0000 used + 0.2000 waste = 1.2000 total deduction)
  const consRes = await doctor.request(doctor.path(0, '/clinical-consumption'), 'POST', {
    procedureExecutionId: execution.id,
    productId: prod.id,
    batchId: batch.id,
    locationId: loc.id,
    quantity: '1.0000',
    wasteQuantity: '0.2000',
    notes: 'حقن عضلات الجبهة ومحيط العين',
    idempotencyKey: `idem-cons-${suffix}`,
  });
  assert.equal(consRes.status, 201);
  const consumption = (await consRes.json()) as any;
  assert.equal(consumption.quantity, '1');
  assert.equal(consumption.wasteQuantity, '0.2');
  assert.equal(consumption.status, 'RECORDED');

  // Verify stock was decremented by 1.2: 10 - 1.2 = 8.8
  const checkBal = await admin.request(admin.path(0, `/stock/balances?productId=${prod.id}&locationId=${loc.id}`));
  const [balRow] = (await checkBal.json()) as any[];
  assert.equal(balRow.onHandQuantity, '8.8');

  // 4. Idempotency replay with same key returns same consumption record
  const replayRes = await doctor.request(doctor.path(0, '/clinical-consumption'), 'POST', {
    procedureExecutionId: execution.id,
    productId: prod.id,
    batchId: batch.id,
    locationId: loc.id,
    quantity: '1.0000',
    wasteQuantity: '0.2000',
    idempotencyKey: `idem-cons-${suffix}`,
  });
  assert.equal(replayRes.status, 201);
  const replayed = (await replayRes.json()) as any;
  assert.equal(replayed.id, consumption.id);

  // 5. Conflicting payload with same idempotency key is rejected
  const conflictRes = await doctor.request(doctor.path(0, '/clinical-consumption'), 'POST', {
    procedureExecutionId: execution.id,
    productId: prod.id,
    batchId: batch.id,
    locationId: loc.id,
    quantity: '3.0000', // Different quantity!
    idempotencyKey: `idem-cons-${suffix}`,
  });
  assert.equal(conflictRes.status, 409);
  const conflictErr = (await conflictRes.json()) as any;
  assert.equal(conflictErr.error?.code, 'INVENTORY_IDEMPOTENCY_CONFLICT');

  // 6. Confidentiality check: admin reading consumption list gets operational info without clinical notes
  const adminListCons = await admin.request(admin.path(0, `/clinical-consumption?procedureExecutionId=${execution.id}`));
  assert.equal(adminListCons.status, 200);
  const adminConsData = (await adminListCons.json()) as any;
  assert(adminConsData.items.length >= 1);
  // Confidentiality projection: notes property is omitted or undefined for inventory-only role
  assert.equal(adminConsData.items[0].notes, undefined);

  // 7. Doctor voids clinical consumption with genuine unopened return
  const voidRes = await doctor.request(doctor.path(0, `/clinical-consumption/${consumption.id}/void`), 'POST', {
    reason: 'تم إلغاء الجلسة واسترجاع الفيال السليم غير المفتوح',
    restockAction: 'RESTOCK_UNOPENED',
  });
  assert.equal(voidRes.status, 201);
  const voided = (await voidRes.json()) as any;
  assert.equal(voided.status, 'VOIDED');
  assert.equal(voided.voidReason, 'تم إلغاء الجلسة واسترجاع الفيال السليم غير المفتوح');

  // Stock is restored ONLY by administered quantity (1.0000), waste (0.2000) is NEVER restocked: 8.8 + 1.0 = 9.8
  const restoredBal = await admin.request(admin.path(0, `/stock/balances?productId=${prod.id}&locationId=${loc.id}`));
  const [restoredRow] = (await restoredBal.json()) as any[];
  assert.equal(restoredRow.onHandQuantity, '9.8');

  // Attempting to void again is rejected
  const voidAgainRes = await doctor.request(doctor.path(0, `/clinical-consumption/${consumption.id}/void`), 'POST', {
    reason: 'محاولة إلغاء مكررة',
  });
  assert.equal(voidAgainRes.status, 409);
  const voidAgainErr = (await voidAgainRes.json()) as any;
  assert.equal(voidAgainErr.error?.code, 'INVENTORY_CONSUMPTION_ALREADY_VOIDED');
});

live('database immutability and integrity triggers on batches, batch balances, and consumptions', async () => {
  const migrationUrl = process.env.TEST_MIGRATION_DATABASE_URL;
  if (!migrationUrl) return;

  const ownerClient = new pg.Client({ connectionString: migrationUrl });
  await ownerClient.connect();
  try {
    // 1. Direct DELETE on InventoryBatch is blocked by trigger
    const batchRow = await ownerClient.query(
      `SELECT id FROM public."InventoryBatch" WHERE "clinicId" = $1 LIMIT 1`,
      [clinics[0]],
    );
    if (batchRow.rows.length > 0) {
      await assert.rejects(
        ownerClient.query(`DELETE FROM public."InventoryBatch" WHERE id = $1`, [batchRow.rows[0].id]),
        (err: any) => {
          assert(err.message.includes('Inventory batches cannot be deleted'));
          assert.equal(err.code, '42501');
          return true;
        },
      );
    }

    // 2. Direct DELETE on InventoryBatchBalance is blocked by trigger
    const bbRow = await ownerClient.query(
      `SELECT id FROM public."InventoryBatchBalance" WHERE "clinicId" = $1 LIMIT 1`,
      [clinics[0]],
    );
    if (bbRow.rows.length > 0) {
      await assert.rejects(
        ownerClient.query(`DELETE FROM public."InventoryBatchBalance" WHERE id = $1`, [bbRow.rows[0].id]),
        (err: any) => {
          assert(err.message.includes('Inventory batch balances cannot be deleted'));
          assert.equal(err.code, '42501');
          return true;
        },
      );
    }

    // 3. Direct DELETE on InventoryClinicalConsumption is blocked by trigger
    const consRow = await ownerClient.query(
      `SELECT id FROM public."InventoryClinicalConsumption" WHERE "clinicId" = $1 LIMIT 1`,
      [clinics[0]],
    );
    if (consRow.rows.length > 0) {
      await assert.rejects(
        ownerClient.query(`DELETE FROM public."InventoryClinicalConsumption" WHERE id = $1`, [consRow.rows[0].id]),
        (err: any) => {
          assert(err.message.includes('Clinical consumptions cannot be deleted'));
          assert.equal(err.code, '42501');
          return true;
        },
      );
    }
  } finally {
    await ownerClient.end().catch(() => {});
  }
});

// =============================================================================
// Phase 4 Step 4.3: Suppliers, Purchasing & Inventory Operations
// =============================================================================

live('inventory: supplier management: registration, uniqueness, tenant isolation, and updates', async () => {
  const admin = await new Browser().login(1, 0);
  const doctor = await new Browser().login(2, 0);

  // 1. Clinic A creates a supplier
  const docSupRes = await doctor.request(doctor.path(0, '/suppliers'), 'POST', {
    code: 'DOC-SUP',
    nameAr: 'طبيب يحاول إضافة مورد',
  });
  assert.equal(docSupRes.status, 403);

  const supRes = await admin.request(admin.path(0, '/suppliers'), 'POST', {
    code: `SUP-ALLERGAN-${suffix.slice(0, 6)}`,
    nameAr: 'شركة أليرجان للأدوية والمستحضرات',
    nameEn: 'Allergan Pharmaceuticals',
    contactPerson: 'د. خالد العمري',
    email: 'khaled@allergan-example.com',
    phone: '+967771234567',
    taxNumber: '300123456700003',
    commercialRegister: '1010123456',
    notes: 'المورد الرئيسي لمستحضرات البوتوكس والفيلر',
  });
  assert.equal(supRes.status, 201);
  const supplier = (await supRes.json()) as any;
  assert.equal(supplier.code, `SUP-ALLERGAN-${suffix.slice(0, 6).toUpperCase()}`);
  assert.equal(supplier.nameAr, 'شركة أليرجان للأدوية والمستحضرات');
  assert.equal(supplier.status, 'ACTIVE');

  // 2. Duplicate supplier code within Clinic A is rejected (409)
  const dupRes = await admin.request(admin.path(0, '/suppliers'), 'POST', {
    code: `SUP-ALLERGAN-${suffix.slice(0, 6)}`,
    nameAr: 'شركة أخرى بنفس الرمز',
  });
  assert.equal(dupRes.status, 409);

  // 3. Multi-tenant isolation: Clinic B can use the same supplier code independently
  const adminClinic1 = await new Browser().login(1, 1);
  const clinicBSupRes = await adminClinic1.request(adminClinic1.path(1, '/suppliers'), 'POST', {
    code: `SUP-ALLERGAN-${suffix.slice(0, 6)}`,
    nameAr: 'شركة أليرجان فرع العيادة الثانية',
  });
  assert.equal(clinicBSupRes.status, 201);
  const clinicBSupplier = (await clinicBSupRes.json()) as any;
  assert.notEqual(clinicBSupplier.id, supplier.id);

  // Clinic B cannot read Clinic A's supplier
  const crossGet = await adminClinic1.request(adminClinic1.path(1, `/suppliers/${supplier.id}`));
  assert.equal(crossGet.status, 404);

  // 4. Update supplier details
  const updateRes = await admin.request(admin.path(0, `/suppliers/${supplier.id}`), 'PATCH', {
    expectedVersion: supplier.version,
    contactPerson: 'د. عمار السقاف',
    phone: '+967779876543',
  });
  assert.equal(updateRes.status, 200);
  const updated = (await updateRes.json()) as any;
  assert.equal(updated.contactPerson, 'د. عمار السقاف');
  assert.equal(updated.version, supplier.version + 1);

  // Stale version update is rejected (409)
  const staleRes = await admin.request(admin.path(0, `/suppliers/${supplier.id}`), 'PATCH', {
    expectedVersion: supplier.version,
    contactPerson: 'محاولة تعديل قديمة',
  });
  assert.equal(staleRes.status, 409);

  // 5. List suppliers with search and status filters
  const listRes = await admin.request(admin.path(0, `/suppliers?search=أليرجان`));
  assert.equal(listRes.status, 200);
  const listData = (await listRes.json()) as any;
  assert(listData.items.some((s: any) => s.id === supplier.id));
});

live('inventory: purchase orders: lifecycle DRAFT -> SUBMITTED -> APPROVED, multi-line financial math, and immutability', async () => {
  const admin = await new Browser().login(1, 0);
  const doctor = await new Browser().login(2, 0);

  // 1. Setup supplier, destination location and two products
  const supRes = await admin.request(admin.path(0, '/suppliers'), 'POST', {
    code: `SUP-PO-${suffix.slice(0, 6)}`,
    nameAr: 'مورد أجهزة ومواد طبية',
  });
  const supplier = (await supRes.json()) as any;

  const locRes = await admin.request(admin.path(0, '/locations'), 'POST', {
    code: `LOC-PO-${suffix.slice(0, 6)}`,
    nameAr: 'مستودع التوريدات المركزي',
  });
  const location = (await locRes.json()) as any;

  const p1Res = await admin.request(admin.path(0, '/products'), 'POST', {
    sku: `PO-PROD1-${suffix.slice(0, 6)}`,
    nameAr: 'فيلر جوفيديرم الترا',
    category: 'INJECTABLE',
    unit: 'SYRINGE',
    requiresBatchTracking: true,
  });
  const prod1 = (await p1Res.json()) as any;

  const p2Res = await admin.request(admin.path(0, '/products'), 'POST', {
    sku: `PO-PROD2-${suffix.slice(0, 6)}`,
    nameAr: 'كريم مخدر موضعي بريلوكائين',
    category: 'CONSUMABLE',
    unit: 'PIECE',
    requiresBatchTracking: false,
  });
  const prod2 = (await p2Res.json()) as any;

  // 2. Create Purchase Order in DRAFT
  // Line 1: 20 syringes @ 150.0000 each + 15% VAT = 3000 + 450 = 3450
  // Line 2: 10 tubes @ 25.0000 each + 15% VAT = 250 + 37.5 = 287.5
  // Subtotal = 3250.0000, Tax = 487.5000, Total = 3737.5000
  const poRes = await admin.request(admin.path(0, '/purchase-orders'), 'POST', {
    supplierId: supplier.id,
    destinationLocationId: location.id,
    currency: 'YER',
    expectedDeliveryDate: '2027-01-15',
    notes: 'طلبية الربع الأول التجميلية',
    lines: [
      {
        productId: prod1.id,
        orderedQuantity: '20.0000',
        unitCost: '150.0000',
        taxRate: '0.1500',
      },
      {
        productId: prod2.id,
        orderedQuantity: '10.0000',
        unitCost: '25.0000',
        taxRate: '0.1500',
      },
    ],
  });
  assert.equal(poRes.status, 201);
  const po = (await poRes.json()) as any;
  assert.equal(po.status, 'DRAFT');
  assert(po.orderNumber.startsWith('PO-'));
  assert.equal(po.subtotal, '3250');
  assert.equal(po.taxAmount, '487.5');
  assert.equal(po.totalAmount, '3737.5');
  assert.equal(po.lines.length, 2);

  // 3. Submit Purchase Order
  const submitRes = await admin.request(admin.path(0, `/purchase-orders/${po.id}/submit`), 'POST', {
    expectedVersion: po.version,
  });
  assert.equal(submitRes.status, 201);
  const submittedPo = (await submitRes.json()) as any;
  assert.equal(submittedPo.status, 'SUBMITTED');

  // Doctor cannot approve PO (forbidden)
  const docApprove = await doctor.request(doctor.path(0, `/purchase-orders/${po.id}/approve`), 'POST', {
    expectedVersion: submittedPo.version,
  });
  assert.equal(docApprove.status, 403);

  // 4. Admin approves Purchase Order
  const approveRes = await admin.request(admin.path(0, `/purchase-orders/${po.id}/approve`), 'POST', {
    expectedVersion: submittedPo.version,
  });
  assert.equal(approveRes.status, 201);
  const approvedPo = (await approveRes.json()) as any;
  assert.equal(approvedPo.status, 'APPROVED');

  // 5. Approved PO lines are immutable (cannot update or delete lines)
  const updateApproved = await admin.request(admin.path(0, `/purchase-orders/${po.id}`), 'PATCH', {
    expectedVersion: approvedPo.version,
    lines: [
      {
        productId: prod1.id,
        orderedQuantity: '50.0000',
        unitCost: '100.0000',
      },
    ],
  });
  assert.equal(updateApproved.status, 400);
});

live('inventory: goods receiving: partial delivery, batch creation, ledger posting, and over-receipt prevention', async () => {
  const admin = await new Browser().login(1, 0);
  const doctor = await new Browser().login(2, 0);

  // 1. Setup PO with approved status
  const supRes = await admin.request(admin.path(0, '/suppliers'), 'POST', {
    code: `SUP-GR-${suffix.slice(0, 6)}`,
    nameAr: 'مورد توريد واستلام',
  });
  const supplier = (await supRes.json()) as any;

  const locRes = await admin.request(admin.path(0, '/locations'), 'POST', {
    code: `LOC-GR-${suffix.slice(0, 6)}`,
    nameAr: 'صيدلية العيادة',
  });
  const location = (await locRes.json()) as any;

  const prodRes = await admin.request(admin.path(0, '/products'), 'POST', {
    sku: `GR-BTX-${suffix.slice(0, 6)}`,
    nameAr: 'ديسبورت 300 وحدة',
    category: 'INJECTABLE',
    unit: 'VIAL',
    requiresBatchTracking: true,
  });
  const product = (await prodRes.json()) as any;

  const poRes = await admin.request(admin.path(0, '/purchase-orders'), 'POST', {
    supplierId: supplier.id,
    destinationLocationId: location.id,
    currency: 'YER',
    lines: [
      {
        productId: product.id,
        orderedQuantity: '10.0000',
        unitCost: '200.0000',
        taxRate: '0.1500',
      },
    ],
  });
  const po = (await poRes.json()) as any;
  await admin.request(admin.path(0, `/purchase-orders/${po.id}/submit`), 'POST', { expectedVersion: po.version });
  await admin.request(admin.path(0, `/purchase-orders/${po.id}/approve`), 'POST', { expectedVersion: po.version + 1 });

  // Doctor cannot record goods receipt (403)
  const docGrRes = await doctor.request(doctor.path(0, '/goods-receipts'), 'POST', {
    purchaseOrderId: po.id,
    lines: [],
  });
  assert.equal(docGrRes.status, 403);

  // 2. Delivery 1: Partial delivery of 6 vials with batch capture and idempotency
  const gr1IdempotencyKey = `gr-idem-${suffix}`;
  const gr1Payload = {
    purchaseOrderId: po.id,
    deliveryNoteNumber: `DN-${suffix.slice(0, 6)}`,
    idempotencyKey: gr1IdempotencyKey,
    lines: [
      {
        purchaseOrderLineId: po.lines[0].id,
        receivedQuantity: '6.0000',
        batchNumber: `LOT-DYSP-${suffix.slice(0, 6)}`,
        expirationDate: '2028-06-30',
        disposition: 'ACCEPTED',
      },
    ],
  };
  const gr1Res = await admin.request(admin.path(0, '/goods-receipts'), 'POST', gr1Payload);
  assert.equal(gr1Res.status, 201);
  const gr1 = (await gr1Res.json()) as any;
  assert(gr1.receiptNumber.startsWith('GR-'));
  assert.equal(gr1.lines[0].receivedQuantity, '6');
  assert(gr1.lines[0].batchId, 'Batch record must be created for batch-tracked product');

  // Idempotency replay: sending identical request returns same receipt without double stock posting
  const gr1ReplayRes = await admin.request(admin.path(0, '/goods-receipts'), 'POST', gr1Payload);
  assert.equal(gr1ReplayRes.status, 201);
  const gr1Replay = (await gr1ReplayRes.json()) as any;
  assert.equal(gr1Replay.id, gr1.id);
  assert.equal(gr1Replay.receiptNumber, gr1.receiptNumber);

  // Verify PO transitioned to PARTIALLY_RECEIVED
  const checkPo1 = await admin.request(admin.path(0, `/purchase-orders/${po.id}`));
  const poData1 = (await checkPo1.json()) as any;
  assert.equal(poData1.status, 'PARTIALLY_RECEIVED');

  // Verify stock balance updated to 6
  const balRes1 = await admin.request(admin.path(0, `/stock/balances?productId=${product.id}&locationId=${location.id}`));
  const [balRow1] = (await balRes1.json()) as any[];
  assert.equal(balRow1.onHandQuantity, '6');

  // 3. Over-receipt attempt: trying to receive 5 more when only 4 remain (6 + 5 = 11 > 10)
  const overReceiptRes = await admin.request(admin.path(0, '/goods-receipts'), 'POST', {
    purchaseOrderId: po.id,
    lines: [
      {
        purchaseOrderLineId: po.lines[0].id,
        receivedQuantity: '5.0000',
        batchNumber: `LOT-DYSP-${suffix.slice(0, 6)}`,
        expirationDate: '2028-06-30',
      },
    ],
  });
  assert.equal(overReceiptRes.status, 400);

  // 4. Delivery 2: Final delivery of remaining 4 vials completes the PO
  const gr2Res = await admin.request(admin.path(0, '/goods-receipts'), 'POST', {
    purchaseOrderId: po.id,
    lines: [
      {
        purchaseOrderLineId: po.lines[0].id,
        receivedQuantity: '4.0000',
        batchNumber: `LOT-DYSP-${suffix.slice(0, 6)}`,
        expirationDate: '2028-06-30',
        disposition: 'ACCEPTED',
      },
    ],
  });
  assert.equal(gr2Res.status, 201);

  // Verify PO is now RECEIVED
  const checkPo2 = await admin.request(admin.path(0, `/purchase-orders/${po.id}`));
  const poData2 = (await checkPo2.json()) as any;
  assert.equal(poData2.status, 'RECEIVED');

  // Verify stock balance is now 10
  const balRes2 = await admin.request(admin.path(0, `/stock/balances?productId=${product.id}&locationId=${location.id}`));
  const [balRow2] = (await balRes2.json()) as any[];
  assert.equal(balRow2.onHandQuantity, '10');
});

live('inventory: physical stocktaking: snapshotting, variance entry, and compensating reconciliation', async () => {
  const admin = await new Browser().login(1, 0);
  const doctor = await new Browser().login(2, 0);

  // 1. Setup location and product with known stock
  const locRes = await admin.request(admin.path(0, '/locations'), 'POST', {
    code: `LOC-ST-${suffix.slice(0, 6)}`,
    nameAr: 'غرفة جرد المنتجات',
  });
  const location = (await locRes.json()) as any;

  const prodRes = await admin.request(admin.path(0, '/products'), 'POST', {
    sku: `ST-PROD-${suffix.slice(0, 6)}`,
    nameAr: 'شاش معقم غير منسوج',
    category: 'CONSUMABLE',
    unit: 'BOX',
    requiresBatchTracking: false,
  });
  const product = (await prodRes.json()) as any;

  // Add opening balance of 50 packs
  await admin.request(admin.path(0, '/stock/opening-balance'), 'POST', {
    productId: product.id,
    locationId: location.id,
    quantity: '50.0000',
  });

  // Doctor cannot create stock count (403)
  const docScRes = await doctor.request(doctor.path(0, '/stock-counts'), 'POST', {
    locationId: location.id,
  });
  assert.equal(docScRes.status, 403);

  // 2. Create Stock Count session
  const countRes = await admin.request(admin.path(0, '/stock-counts'), 'POST', {
    locationId: location.id,
    notes: 'جرد شهري دوري لغرفة المواد المستهلكة',
    productIds: [product.id],
  });
  assert.equal(countRes.status, 201);
  const stockCount = (await countRes.json()) as any;
  assert.equal(stockCount.status, 'DRAFT');
  assert(stockCount.countNumber.startsWith('SC-'));
  assert.equal(stockCount.items.length, 1);
  assert.equal(stockCount.items[0].systemQuantity, '50');

  // 3. Record physical count: observed 46 packs (deficit of 4 packs, variance = -4)
  const recordRes = await admin.request(admin.path(0, `/stock-counts/${stockCount.id}/items`), 'POST', {
    expectedVersion: stockCount.version,
    items: [
      {
        productId: product.id,
        countedQuantity: '46.0000',
        discrepancyReason: 'تلف عبوات أثناء النقل',
      },
    ],
  });
  assert.equal(recordRes.status, 201);
  const submittedCount = (await recordRes.json()) as any;
  assert.equal(submittedCount.status, 'SUBMITTED');
  assert.equal(submittedCount.items[0].countedQuantity, '46');
  assert.equal(submittedCount.items[0].varianceQuantity, '-4');

  // 4. Reconcile Stock Count: posts atomic compensating adjustment
  const reconcileRes = await admin.request(admin.path(0, `/stock-counts/${stockCount.id}/reconcile`), 'POST', {
    expectedVersion: submittedCount.version,
    notes: 'تم اعتماد تسوية الفاقد',
  });
  assert.equal(reconcileRes.status, 201);
  const reconciled = (await reconcileRes.json()) as any;
  assert.equal(reconciled.status, 'RECONCILED');

  // Verify stock balance adjusted from 50 to 46
  const balRes = await admin.request(admin.path(0, `/stock/balances?productId=${product.id}&locationId=${location.id}`));
  const [balRow] = (await balRes.json()) as any[];
  assert.equal(balRow.onHandQuantity, '46');

  // Reconciled stock count cannot be reconciled again (409)
  const reconcileAgain = await admin.request(admin.path(0, `/stock-counts/${stockCount.id}/reconcile`), 'POST', {
    expectedVersion: reconciled.version,
  });
  assert.equal(reconcileAgain.status, 409);
});

live('inventory: alerts and operational notifications: derivation and snoozing', async () => {
  const admin = await new Browser().login(1, 0);
  const doctor = await new Browser().login(2, 0);

  // 1. Setup product with reorder threshold 20, but stock is 5 (triggers LOW_STOCK)
  const locRes = await admin.request(admin.path(0, '/locations'), 'POST', {
    code: `LOC-AL-${suffix.slice(0, 6)}`,
    nameAr: 'مستودع التنبيهات',
  });
  const location = (await locRes.json()) as any;

  const lowProdRes = await admin.request(admin.path(0, '/products'), 'POST', {
    sku: `AL-LOW-${suffix.slice(0, 6)}`,
    nameAr: 'خيوط شد جراحية بولي ديوكسانون',
    category: 'CONSUMABLE',
    unit: 'BOX',
    reorderThreshold: '20.0000',
  });
  const lowProduct = (await lowProdRes.json()) as any;

  await admin.request(admin.path(0, '/stock/opening-balance'), 'POST', {
    productId: lowProduct.id,
    locationId: location.id,
    quantity: '5.0000',
  });

  // 2. Fetch inventory alerts
  const alertsRes = await admin.request(admin.path(0, '/alerts'));
  assert.equal(alertsRes.status, 200);
  const alertData = (await alertsRes.json()) as any;
  assert(alertData.summary.total >= 1);
  const lowStockAlert = alertData.items.find((a: any) => a.targetId === lowProduct.id && a.alertType === 'LOW_STOCK');
  assert(lowStockAlert, 'Must identify product below reorder threshold');
  assert.equal(lowStockAlert.severity, 'WARNING');

  // Doctor cannot acknowledge alerts (403)
  const docAckRes = await doctor.request(doctor.path(0, '/alerts/acknowledge'), 'POST', {
    alertType: 'LOW_STOCK',
    targetType: 'PRODUCT',
    targetId: lowProduct.id,
  });
  assert.equal(docAckRes.status, 403);

  // 3. Acknowledge and snooze alert for 7 days
  const futureSnooze = new Date(Date.now() + 7 * 86400000).toISOString();
  const ackRes = await admin.request(admin.path(0, '/alerts/acknowledge'), 'POST', {
    alertType: 'LOW_STOCK',
    targetType: 'PRODUCT',
    targetId: lowProduct.id,
    snoozedUntil: futureSnooze,
    notes: 'تم إصدار أمر شراء بالمتبقي',
  });
  assert.equal(ackRes.status, 201);

  // 4. Alert is now snoozed and excluded from active alerts list
  const refreshedAlerts = await admin.request(admin.path(0, '/alerts'));
  const refreshedData = (await refreshedAlerts.json()) as any;
  const snoozedAlert = refreshedData.items.find((a: any) => a.targetId === lowProduct.id && a.alertType === 'LOW_STOCK');
  assert.equal(snoozedAlert, undefined, 'Snoozed alert must not appear in active inventory alerts');
});

live('inventory: security hardening: direct SQL bypass triggers on balances, po lines, and consumption insert guard', async () => {
  const migrationUrl = process.env.TEST_MIGRATION_DATABASE_URL;
  if (!migrationUrl) return;

  const ownerClient = new pg.Client({ connectionString: migrationUrl });
  await ownerClient.connect();

  try {
    // 1. Direct DELETE on InventoryBalance is blocked by inventory_balance_integrity_guard
    const balRow = await ownerClient.query(
      `SELECT id FROM public."InventoryBalance" WHERE "clinicId" = $1 LIMIT 1`,
      [clinics[0]],
    );
    if (balRow.rows.length > 0) {
      await assert.rejects(
        ownerClient.query(`DELETE FROM public."InventoryBalance" WHERE id = $1`, [balRow.rows[0].id]),
        (err: any) => {
          assert(err.message.includes('Inventory balances cannot be deleted'));
          assert.equal(err.code, '42501');
          return true;
        },
      );
    }

    // 2. Direct UPDATE modifying productId or locationId on InventoryBalance is blocked
    if (balRow.rows.length > 0) {
      await assert.rejects(
        ownerClient.query(`UPDATE public."InventoryBalance" SET "productId" = $1 WHERE id = $2`, [randomUUID(), balRow.rows[0].id]),
        (err: any) => {
          assert(err.message.includes('Product and location identities on balance records cannot be modified'));
          assert.equal(err.code, '42501');
          return true;
        },
      );
    }

    // 3. Direct SQL insert of clinical consumption with a RECALLED batch is blocked by trigger
    // Create a recalled batch directly
    const recalledBatchId = randomUUID();
    const prodRow = await ownerClient.query(
      `SELECT id FROM public."InventoryProduct" WHERE "clinicId" = $1 LIMIT 1`,
      [clinics[0]],
    );
    const locRow = await ownerClient.query(
      `SELECT id FROM public."InventoryLocation" WHERE "clinicId" = $1 LIMIT 1`,
      [clinics[0]],
    );

    if (prodRow.rows.length > 0 && locRow.rows.length > 0) {
      await ownerClient.query(
        `INSERT INTO public."InventoryBatch" (id, "clinicId", "productId", "batchNumber", "expirationDate", status, "initialQuantity", "updatedAt")
         VALUES ($1, $2, $3, $4, '2028-12-31', 'RECALLED', 10, NOW())`,
        [recalledBatchId, clinics[0], prodRow.rows[0].id, `RECALLED-${suffix.slice(0, 6)}`],
      );

      // Attempt direct SQL INSERT into InventoryClinicalConsumption referencing this recalled batch
      const procRow = await ownerClient.query(
        `SELECT id FROM public."ProcedureExecution" WHERE "clinicId" = $1 LIMIT 1`,
        [clinics[0]],
      );
      const memRow = await ownerClient.query(
        `SELECT id FROM public."ClinicMembership" WHERE "clinicId" = $1 LIMIT 1`,
        [clinics[0]],
      );

      if (procRow.rows.length > 0 && memRow.rows.length > 0) {
        await assert.rejects(
          ownerClient.query(
            `INSERT INTO public."InventoryClinicalConsumption"
             (id, "clinicId", "procedureExecutionId", "productId", "batchId", "locationId", quantity, "wasteQuantity", unit, status, "actorMembershipId", "updatedAt")
             VALUES ($1, $2, $3, $4, $5, $6, 1, 0, 'VIAL', 'RECORDED', $7, NOW())`,
            [randomUUID(), clinics[0], procRow.rows[0].id, prodRow.rows[0].id, recalledBatchId, locRow.rows[0].id, memRow.rows[0].id],
          ),
          (err: any) => {
            assert(err.message.includes('recalled batch'));
            assert.equal(err.code, '42501');
            return true;
          },
        );
      }
    }
  } finally {
    await ownerClient.end().catch(() => {});
  }
});

