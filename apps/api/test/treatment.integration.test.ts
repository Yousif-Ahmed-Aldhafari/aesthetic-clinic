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
const live = (name: string, fn: () => Promise<void>) => test(`treatment: ${name}`, { skip: !enabled }, fn);

const suffix = randomUUID();
const clinics = [randomUUID(), randomUUID()];
const patients = [randomUUID(), randomUUID()];
const users: string[] = [];
const origin = 'http://localhost:5173';
const password = randomBytes(32).toString('base64url');

const accounts = [
  'doctor-a',
  'doctor-b',
  'owner',
  'admin',
  'reception',
  'accountant',
].map((x) => `${x}-treatment-${suffix}@example.invalid`);

let owner: ReturnType<typeof fixtureDatabase>;
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
    return `clinics/${clinics[clinic]}/clinical${sub}`;
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

  owner = fixtureDatabase();
  pool = new pg.Pool({ connectionString: urls.runtime });

  for (const [i, id] of clinics.entries()) {
    await owner.clinic.create({
      data: {
        id,
        slug: `treatment-${i}-${suffix}`,
        legalName: 'عيادة تجميلية علاجية وهمية',
        displayName: 'عيادة تجميلية علاجية وهمية',
        currency: 'YER',
        branding: { create: {} },
      },
    });
    await owner.patient.create({
      data: {
        id: patients[i],
        clinicId: id,
        patientNumber: `P-00000${i + 1}`,
        fullName: `مريض تجميلي وهمي ${i + 1}`,
        searchName: `مريض تجميلي وهمي ${i + 1}`,
      },
    });
  }

  const roles = ['DOCTOR', 'DOCTOR', 'CLINIC_OWNER', 'CLINIC_ADMIN', 'RECEPTIONIST', 'ACCOUNTANT'] as const;
  for (const [i, email] of accounts.entries()) {
    const u = await provisionUser(owner, {
      email,
      name: `مستخدم علاجي وهمي ${i}`,
      password,
      memberships: [{ clinicSlug: `treatment-0-${suffix}`, role: roles[i] }],
    });
    users.push(u.id);
  }

  // Doctor B belongs to Clinic 1
  await owner.clinicMembership.create({
    data: { clinicId: clinics[1], userId: users[1], role: 'DOCTOR', status: 'ACTIVE' },
  });
});

after(async () => {
  if (owner) {
    try {
      await owner.$executeRawUnsafe('ALTER TABLE public."TreatmentPlanRevision" DISABLE TRIGGER treatment_revision_guard');
      await owner.$executeRawUnsafe('ALTER TABLE public."TreatmentPlanItem" DISABLE TRIGGER treatment_item_guard');
      await owner.$executeRawUnsafe('ALTER TABLE public."ProcedureExecution" DISABLE TRIGGER procedure_execution_guard');
      await owner.$executeRawUnsafe('ALTER TABLE public."TreatmentPlan" DISABLE TRIGGER treatment_plan_guard');

      await owner.procedureExecution.deleteMany({ where: { clinicId: { in: clinics } } });
      await owner.treatmentPlanItem.deleteMany({ where: { clinicId: { in: clinics } } });
      await owner.treatmentPlanRevision.deleteMany({ where: { clinicId: { in: clinics } } });
      await owner.treatmentPlan.deleteMany({ where: { clinicId: { in: clinics } } });
      await owner.aestheticProcedureCatalog.deleteMany({ where: { clinicId: { in: clinics } } });
      await owner.clinicalNoteAmendment.deleteMany({ where: { clinicId: { in: clinics } } });
      await owner.clinicalNote.deleteMany({ where: { clinicId: { in: clinics } } });
      await owner.clinicalEncounter.deleteMany({ where: { clinicId: { in: clinics } } });
      await owner.medicalHistory.deleteMany({ where: { clinicId: { in: clinics } } });
      await owner.auditEvent.deleteMany({ where: { clinicId: { in: clinics } } });
      await owner.session.deleteMany({ where: { userId: { in: users } } });
      await owner.clinicMembership.deleteMany({ where: { userId: { in: users } } });
      await owner.user.deleteMany({ where: { id: { in: users } } });
      await owner.patient.deleteMany({ where: { clinicId: { in: clinics } } });
      await owner.clinicBranding.deleteMany({ where: { clinicId: { in: clinics } } });
      await owner.clinic.deleteMany({ where: { id: { in: clinics } } });
    } finally {
      await owner.$executeRawUnsafe('ALTER TABLE public."TreatmentPlanRevision" ENABLE TRIGGER treatment_revision_guard').catch(() => {});
      await owner.$executeRawUnsafe('ALTER TABLE public."TreatmentPlanItem" ENABLE TRIGGER treatment_item_guard').catch(() => {});
      await owner.$executeRawUnsafe('ALTER TABLE public."ProcedureExecution" ENABLE TRIGGER procedure_execution_guard').catch(() => {});
      await owner.$executeRawUnsafe('ALTER TABLE public."TreatmentPlan" ENABLE TRIGGER treatment_plan_guard').catch(() => {});
      await owner.$disconnect();
    }
  }
  await pool?.end();
  await app?.close();
});

live('doctor creates procedure catalog, drafts treatment plan, manages items and approves plan', async () => {
  const doc = await new Browser().login(0);

  // 1. Create Procedure Catalog entries
  let r = await doc.request(doc.path(0, '/procedure-catalog'), 'POST', {
    nameAr: 'جلسة تقشير كيميائي سطحي',
    nameEn: 'Superficial Chemical Peel',
    category: 'عناية بالبشرة',
    defaultDurationMinutes: 45,
    description: 'إجراء تقشير سطحي لتجديد نضارة البشرة',
  });
  assert.equal(r.status, 201);
  const catalogPeel = (await r.json()) as any;
  assert.equal(catalogPeel.nameAr, 'جلسة تقشير كيميائي سطحي');
  assert.equal(catalogPeel.version, 1);

  r = await doc.request(doc.path(0, '/procedure-catalog'), 'POST', {
    nameAr: 'جلسة ليزر كربوني للوجه',
    category: 'علاج بالليزر',
    defaultDurationMinutes: 30,
  });
  assert.equal(r.status, 201);
  const catalogLaser = (await r.json()) as any;

  // 2. Create Treatment Plan (Draft, Revision 1)
  r = await doc.request(doc.path(0, '/treatment-plans'), 'POST', {
    patientId: patients[0],
    title: 'خطة علاج تصبغات ونضارة البشرة',
    clinicalPurpose: 'تحسين توحيد لون البشرة ومعالجة التصبغات السطحية بعد التقييم السريري',
    indications: 'تصبغات جلدية خفيفة ناتجة عن أشعة الشمس',
    objectives: 'تحقيق توحيد بنسبة ٥٠٪؜ بعد ٣ جلسات',
    preparationInstructions: 'تجنب المقشرات المنزلية والتعرض المباشر للشمس لمدة ٤٨ ساعة قبل الجلسة',
    aftercareInstructions: 'استخدام واقي شمس واسع الطيف ومرطب لطيف مرتين يوميًا',
  });
  assert.equal(r.status, 201);
  let plan = (await r.json()) as any;
  assert.equal(plan.status, 'DRAFT');
  assert.equal(plan.currentRevisionNumber, 1);
  assert.equal(plan.revisions.length, 1);
  assert.equal(plan.revisions[0].status, 'DRAFT');

  // 3. Add items to Revision 1
  r = await doc.request(doc.path(0, `/treatment-plans/${plan.id}/items`), 'POST', {
    procedureCatalogId: catalogPeel.id,
    sessionOrder: 1,
    expectedDurationMinutes: 45,
    clinicianInstructions: 'تركيز على منطقة الجبهة والخدين',
  });
  assert.equal(r.status, 201);
  plan = await r.json();
  assert.equal(plan.revisions[0].items.length, 1);

  r = await doc.request(doc.path(0, `/treatment-plans/${plan.id}/items`), 'POST', {
    procedureCatalogId: catalogLaser.id,
    sessionOrder: 2,
    expectedDurationMinutes: 30,
  });
  assert.equal(r.status, 201);
  plan = await r.json();
  assert.equal(plan.revisions[0].items.length, 2);

  // 4. Update an item
  const itemId = plan.revisions[0].items[1].id;
  const itemVersion = plan.revisions[0].items[1].version;
  r = await doc.request(doc.path(0, `/treatment-plans/${plan.id}/items/${itemId}`), 'PATCH', {
    procedureCatalogId: catalogLaser.id,
    sessionOrder: 2,
    expectedDurationMinutes: 40,
    expectedVersion: itemVersion,
    clinicianInstructions: 'استخدام طاقة منخفضة في الجلسة الأولى',
  });
  assert.equal(r.status, 200);
  plan = await r.json();
  assert.equal(plan.revisions[0].items[1].expectedDurationMinutes, 40);

  // 5. Update draft text
  const rev = plan.revisions[0];
  r = await doc.request(doc.path(0, `/treatment-plans/${plan.id}/draft`), 'PATCH', {
    expectedVersion: rev.version,
    title: 'خطة علاج تصبغات ونضارة البشرة - محدثة',
    clinicalPurpose: 'تحسين توحيد لون البشرة ومعالجة التصبغات السطحية بعد التقييم السريري الدقيق',
  });
  assert.equal(r.status, 200);
  plan = await r.json();
  assert.equal(plan.revisions[0].title, 'خطة علاج تصبغات ونضارة البشرة - محدثة');

  // 6. Approve the plan
  r = await doc.request(doc.path(0, `/treatment-plans/${plan.id}/approve`), 'POST', {
    expectedVersion: plan.version,
  });
  assert.equal(r.status, 201);
  plan = await r.json();
  assert.equal(plan.status, 'ACTIVE');
  assert.equal(plan.revisions[0].status, 'APPROVED');
  assert(plan.revisions[0].approvedAt);
});

live('approved revisions and plan items are immutable at trigger and API layers', async () => {
  const doc = await new Browser().login(0);

  // 1. Catalog item
  const catRes = await doc.request(doc.path(0, '/procedure-catalog'), 'POST', {
    nameAr: 'جلسة ترطيب عميق',
    category: 'عناية',
    defaultDurationMinutes: 30,
  });
  const catalog = (await catRes.json()) as any;

  // 2. Create and approve plan
  const planRes = await doc.request(doc.path(0, '/treatment-plans'), 'POST', {
    patientId: patients[0],
    title: 'خطة حماية حاجز البشرة',
    clinicalPurpose: 'ترطيب وحماية حاجز البشرة الطبيعي',
  });
  let plan = (await planRes.json()) as any;

  await doc.request(doc.path(0, `/treatment-plans/${plan.id}/items`), 'POST', {
    procedureCatalogId: catalog.id,
    sessionOrder: 1,
    expectedDurationMinutes: 30,
  });

  const approvedRes = await doc.request(doc.path(0, `/treatment-plans/${plan.id}/approve`), 'POST', {
    expectedVersion: plan.version,
  });
  assert.equal(approvedRes.status, 201);
  plan = await approvedRes.json();
  const approvedRev = plan.revisions[0];
  const approvedItem = approvedRev.items[0];

  // 3. API rejects mutation to approved revision
  const mutateDraft = await doc.request(doc.path(0, `/treatment-plans/${plan.id}/draft`), 'PATCH', {
    expectedVersion: approvedRev.version,
    title: 'محاولة تعديل غير مسموح بها',
    clinicalPurpose: 'غرض معدل',
  });
  assert.equal(mutateDraft.status, 409);

  // 4. API rejects adding items to approved revision
  const addItemRes = await doc.request(doc.path(0, `/treatment-plans/${plan.id}/items`), 'POST', {
    procedureCatalogId: catalog.id,
    sessionOrder: 2,
    expectedDurationMinutes: 30,
  });
  assert.equal(addItemRes.status, 409);

  // 5. API rejects deleting item from approved revision
  const deleteItemRes = await doc.request(
    doc.path(0, `/treatment-plans/${plan.id}/items/${approvedItem.id}`),
    'DELETE',
  );
  assert.equal(deleteItemRes.status, 404); // Not found among draft items

  // 6. Direct SQL updates to approved revision trigger lamssa_security.treatment_revision_guard
  await assert.rejects(
    owner.treatmentPlanRevision.update({
      where: { id: approvedRev.id },
      data: { title: 'تعديل مباشر غير مصرح' },
    }),
    /Approved treatment revision is immutable/,
  );

  // 7. Direct SQL update to items in approved revision trigger lamssa_security.treatment_item_guard
  await assert.rejects(
    owner.treatmentPlanItem.update({
      where: { id: approvedItem.id },
      data: { expectedDurationMinutes: 90 },
    }),
    /Approved treatment items are immutable/,
  );

  // 8. Direct SQL delete of items in approved revision trigger lamssa_security.treatment_item_guard
  await assert.rejects(
    owner.treatmentPlanItem.delete({
      where: { id: approvedItem.id },
    }),
    /Approved treatment items are immutable/,
  );
});

live('plan revision workflow creates new draft revision and preserves historical revision', async () => {
  const doc = await new Browser().login(0);

  const catRes = await doc.request(doc.path(0, '/procedure-catalog'), 'POST', {
    nameAr: 'جلسة شد سطحي بالخيوط',
    category: 'إجراءات تجميلية',
    defaultDurationMinutes: 60,
  });
  const catalog = (await catRes.json()) as any;

  const planRes = await doc.request(doc.path(0, '/treatment-plans'), 'POST', {
    patientId: patients[0],
    title: 'خطة شد ونضارة أولية',
    clinicalPurpose: 'غرض أولي للشد السطحي',
  });
  let plan = (await planRes.json()) as any;

  await doc.request(doc.path(0, `/treatment-plans/${plan.id}/items`), 'POST', {
    procedureCatalogId: catalog.id,
    sessionOrder: 1,
    expectedDurationMinutes: 60,
  });

  const approved = await (
    await doc.request(doc.path(0, `/treatment-plans/${plan.id}/approve`), 'POST', {
      expectedVersion: plan.version,
    })
  ).json() as any;

  // Revise the approved plan
  const reviseRes = await doc.request(doc.path(0, `/treatment-plans/${plan.id}/revisions`), 'POST', {
    expectedVersion: approved.version,
    reason: 'تحديث استجابة المريض وإضافة جلسات متابعة',
  });
  assert.equal(reviseRes.status, 201);
  const revisedPlan = (await reviseRes.json()) as any;

  assert.equal(revisedPlan.status, 'DRAFT');
  assert.equal(revisedPlan.currentRevisionNumber, 2);
  assert.equal(revisedPlan.revisions.length, 2);

  const rev1 = revisedPlan.revisions.find((r: any) => r.revisionNumber === 1);
  const rev2 = revisedPlan.revisions.find((r: any) => r.revisionNumber === 2);
  assert.equal(rev1.status, 'APPROVED');
  assert.equal(rev2.status, 'DRAFT');
  assert.equal(rev2.revisionReason, 'تحديث استجابة المريض وإضافة جلسات متابعة');
  assert.equal(rev2.items.length, 1); // Items copied over for editing
});

live('procedure execution fails closed until verified informed consent exists', async () => {
  const doc = await new Browser().login(0);

  const catRes = await doc.request(doc.path(0, '/procedure-catalog'), 'POST', {
    nameAr: 'حقن فيلر الشفاه',
    nameEn: 'Lip Filler Injection',
    category: 'حقن تجميلي',
    defaultDurationMinutes: 30,
  });
  const catalog = (await catRes.json()) as any;

  const planRes = await doc.request(doc.path(0, '/treatment-plans'), 'POST', {
    patientId: patients[0],
    title: 'خطة حقن الشفاه',
    clinicalPurpose: 'تصحيح التناسق وزيادة الحجم الطبيعي',
  });
  let plan = (await planRes.json()) as any;

  await doc.request(doc.path(0, `/treatment-plans/${plan.id}/items`), 'POST', {
    procedureCatalogId: catalog.id,
    sessionOrder: 1,
    expectedDurationMinutes: 30,
  });

  plan = await (
    await doc.request(doc.path(0, `/treatment-plans/${plan.id}/approve`), 'POST', {
      expectedVersion: plan.version,
    })
  ).json() as any;

  const approvedItemId = plan.revisions[0].items[0].id;

  // 1. Create execution record
  const execRes = await doc.request(doc.path(0, '/procedure-executions'), 'POST', {
    treatmentPlanItemId: approvedItemId,
    details: 'توثيق مبدئي لموقع الحقن والجرعة المخططة',
    productName: 'Hyaluronic Acid 1ml',
    batchLot: 'LOT-998822',
  });
  assert.equal(execRes.status, 201);
  const execution = (await execRes.json()) as any;
  assert.equal(execution.status, 'DRAFT');
  assert.equal(execution.consentEligible, false);
  assert.equal(execution.consentReason, 'VERIFIED_CONSENT_REQUIRED');

  // 2. Check eligibility endpoint directly
  const eligRes = await doc.request(doc.path(0, `/procedure-executions/${execution.id}/eligibility`));
  assert.equal(eligRes.status, 200);
  const eligBody = (await eligRes.json()) as any;
  assert.equal(eligBody.eligible, false);
  assert.equal(eligBody.reason, 'VERIFIED_CONSENT_REQUIRED');

  // 3. Attempting to mark as PERFORMED fails closed with 403 Forbidden
  const performRes = await doc.request(doc.path(0, `/procedure-executions/${execution.id}/status`), 'PATCH', {
    expectedVersion: execution.version,
    status: 'PERFORMED',
  });
  assert.equal(performRes.status, 403);
  const errBody = (await performRes.json()) as any;
  assert.equal(errBody.error?.code, 'FORBIDDEN');

  // 4. Attempting to mark as COMPLETED fails closed with 403 Forbidden
  const completeRes = await doc.request(doc.path(0, `/procedure-executions/${execution.id}/status`), 'PATCH', {
    expectedVersion: execution.version,
    status: 'COMPLETED',
  });
  assert.equal(completeRes.status, 403);

  // 5. Verify audit events were logged for blocked execution attempts
  const blockedAudits = await owner.auditEvent.findMany({
    where: {
      clinicId: clinics[0],
      action: 'clinical.procedure-execution.blocked',
      targetId: execution.id,
    },
    orderBy: { createdAt: 'asc' },
  });
  assert.equal(blockedAudits.length, 2, 'Must record audit log for each blocked procedure execution without consent');
  assert.equal((blockedAudits[0].metadata as any)?.reason, 'VERIFIED_CONSENT_REQUIRED');
  assert.equal((blockedAudits[0].metadata as any)?.targetStatus, 'PERFORMED');
  assert.equal((blockedAudits[1].metadata as any)?.targetStatus, 'COMPLETED');

  // 6. Transition to READY succeeds (allowed preparatory status)
  const readyRes = await doc.request(doc.path(0, `/procedure-executions/${execution.id}/status`), 'PATCH', {
    expectedVersion: execution.version,
    status: 'READY',
  });
  assert.equal(readyRes.status, 200);
  const readyExec = (await readyRes.json()) as any;
  assert.equal(readyExec.status, 'READY');

  // 7. Transition from READY to CANCELLED succeeds
  const cancelRes = await doc.request(doc.path(0, `/procedure-executions/${execution.id}/status`), 'PATCH', {
    expectedVersion: readyExec.version,
    status: 'CANCELLED',
  });
  assert.equal(cancelRes.status, 200);
});

live('multi-clinic isolation, role separation, and optimistic concurrency fail closed', async () => {
  const docA = await new Browser().login(0);

  // Doctor A creates a plan in Clinic 0
  const planRes = await docA.request(docA.path(0, '/treatment-plans'), 'POST', {
    patientId: patients[0],
    title: 'خطة عيادة أ الحصرية',
    clinicalPurpose: 'علاج خاص بالعيادة الأولى',
  });
  const planA = (await planRes.json()) as any;

  // Doctor B belongs to Clinic 1, tries to access Doctor A's plan in Clinic 0
  const docB = await new Browser().login(1, 1);
  const unauthorizedRead = await docB.request(`clinics/${clinics[0]}/clinical/treatment-plans/${planA.id}`);
  assert.equal(unauthorizedRead.status, 403); // Cannot access other clinic context

  // Doctor B in Clinic 1 cannot access planA even if URL points to Clinic 1
  const crossClinicPlan = await docB.request(docB.path(1, `/treatment-plans/${planA.id}`));
  assert.equal(crossClinicPlan.status, 404);

  // Doctor A cannot create a treatment plan for Patient 1 (who belongs to Clinic 1)
  const wrongPatientRes = await docA.request(docA.path(0, '/treatment-plans'), 'POST', {
    patientId: patients[1],
    title: 'خطة لمريض من عيادة أخرى',
    clinicalPurpose: 'غير مسموح به',
  });
  assert.equal(wrongPatientRes.status, 404);

  // Non-doctor roles (Owner, Admin, Receptionist, Accountant) are denied access (403)
  for (const idx of [2, 3, 4, 5]) {
    const nonDoctor = await new Browser().login(idx, 0);
    const deniedList = await nonDoctor.request(nonDoctor.path(0, `/patients/${patients[0]}/treatment-plans`));
    assert.equal(deniedList.status, 403);

    const deniedCatalog = await nonDoctor.request(nonDoctor.path(0, '/procedure-catalog'));
    assert.equal(deniedCatalog.status, 403);
  }

  // CSRF forgery check
  const csrfFail = await docA.request(
    docA.path(0, '/treatment-plans'),
    'POST',
    {
      patientId: patients[0],
      title: 'محاولة تزوير CSRF',
      clinicalPurpose: 'طلب برمز مزور',
    },
    { 'X-CSRF-Token': 'forged-token-value' },
  );
  assert.equal(csrfFail.status, 403);

  // Optimistic concurrency conflict on stale version
  const staleUpdate = await docA.request(docA.path(0, `/treatment-plans/${planA.id}/draft`), 'PATCH', {
    expectedVersion: 999, // Stale version
    title: 'محاولة تعديل مع إصدار قديم',
    clinicalPurpose: 'غرض معدل',
  });
  assert.equal(staleUpdate.status, 409);
});

live('runtime database role is constrained by FORCE RLS and restricted table privileges', async () => {
  const clinicalTables = [
    'AestheticProcedureCatalog',
    'TreatmentPlan',
    'TreatmentPlanRevision',
    'TreatmentPlanItem',
    'ProcedureExecution',
  ] as const;

  for (const table of clinicalTables) {
    // Runtime connection without tenant context sees 0 rows
    const res = await pool.query(`SELECT * FROM public."${table}"`);
    assert.equal(res.rowCount, 0, `Table ${table} must return 0 rows to unauthenticated runtime`);

    // Verify relrowsecurity and relforcerowsecurity are enabled
    const {
      rows: [meta],
    } = await pool.query(
      `SELECT relrowsecurity, relforcerowsecurity, pg_get_userbyid(relowner) = current_user AS is_owner,
              has_table_privilege(oid, 'DELETE') AS can_delete
       FROM pg_class WHERE oid = $1::regclass`,
      [`public."${table}"`],
    );
    assert(meta.relrowsecurity, `${table} must have RLS enabled`);
    assert(meta.relforcerowsecurity, `${table} must have FORCE RLS enabled`);
    assert(!meta.is_owner, `${table} must not be owned by the application runtime role`);

    // Runtime has DELETE only on TreatmentPlanItem, never on plans, revisions, catalog, or executions
    if (table === 'TreatmentPlanItem') {
      assert(meta.can_delete, 'TreatmentPlanItem must allow deletion during DRAFT state');
    } else {
      assert(!meta.can_delete, `${table} must not grant DELETE to runtime role`);
    }
  }
});
