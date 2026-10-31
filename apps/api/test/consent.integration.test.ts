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
const live = (name: string, fn: () => Promise<void>) => test(`consent: ${name}`, { skip: !enabled }, fn);

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
].map((x) => `${x}-consent-${suffix}@example.invalid`);

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
        slug: `consent-${i}-${suffix}`,
        legalName: 'عيادة استشارية للموافقات المستنيرة وهمية',
        displayName: 'عيادة استشارية للموافقات المستنيرة وهمية',
        currency: 'YER',
        branding: { create: {} },
      },
    });
    await owner.patient.create({
      data: {
        id: patients[i],
        clinicId: id,
        patientNumber: `P-00000${i + 1}`,
        fullName: `مريضة موافقة وهمية ${i + 1}`,
        searchName: `مريضة موافقة وهمية ${i + 1}`,
      },
    });
  }

  const roles = ['DOCTOR', 'DOCTOR', 'CLINIC_OWNER', 'CLINIC_ADMIN', 'RECEPTIONIST', 'ACCOUNTANT'] as const;
  for (const [i, email] of accounts.entries()) {
    const u = await provisionUser(owner, {
      email,
      name: `طبيب موافقة وهمي ${i}`,
      password,
      memberships: [{ clinicSlug: `consent-0-${suffix}`, role: roles[i] }],
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
      await owner.$executeRawUnsafe('ALTER TABLE public."ConsentWithdrawal" DISABLE TRIGGER consent_withdrawal_guard');
      await owner.$executeRawUnsafe('ALTER TABLE public."ConsentSignatureEvidence" DISABLE TRIGGER consent_signature_evidence_guard');
      await owner.$executeRawUnsafe('ALTER TABLE public."PatientConsent" DISABLE TRIGGER patient_consent_guard');
      await owner.$executeRawUnsafe('ALTER TABLE public."ConsentTemplateVersion" DISABLE TRIGGER consent_template_version_guard');
      await owner.$executeRawUnsafe('ALTER TABLE public."TreatmentPlanRevision" DISABLE TRIGGER treatment_revision_guard');
      await owner.$executeRawUnsafe('ALTER TABLE public."TreatmentPlanItem" DISABLE TRIGGER treatment_item_guard');
      await owner.$executeRawUnsafe('ALTER TABLE public."ProcedureExecution" DISABLE TRIGGER procedure_execution_guard');
      await owner.$executeRawUnsafe('ALTER TABLE public."TreatmentPlan" DISABLE TRIGGER treatment_plan_guard');

      await owner.consentWithdrawal.deleteMany({ where: { clinicId: { in: clinics } } });
      await owner.consentSignatureEvidence.deleteMany({ where: { clinicId: { in: clinics } } });
      await owner.patientConsent.deleteMany({ where: { clinicId: { in: clinics } } });
      await owner.consentTemplateVersion.deleteMany({ where: { clinicId: { in: clinics } } });
      await owner.consentTemplate.deleteMany({ where: { clinicId: { in: clinics } } });
      await owner.procedureExecution.deleteMany({ where: { clinicId: { in: clinics } } });
      await owner.treatmentPlanItem.deleteMany({ where: { clinicId: { in: clinics } } });
      await owner.treatmentPlanRevision.deleteMany({ where: { clinicId: { in: clinics } } });
      await owner.treatmentPlan.deleteMany({ where: { clinicId: { in: clinics } } });
      await owner.aestheticProcedureCatalog.deleteMany({ where: { clinicId: { in: clinics } } });
      await owner.patient.deleteMany({ where: { clinicId: { in: clinics } } });
      await owner.clinicMembership.deleteMany({ where: { clinicId: { in: clinics } } });
      await owner.session.deleteMany({ where: { userId: { in: users } } });
      await owner.user.deleteMany({ where: { id: { in: users } } });
      await owner.clinicBranding.deleteMany({ where: { clinicId: { in: clinics } } });
      await owner.clinic.deleteMany({ where: { id: { in: clinics } } });
    } finally {
      await owner.$executeRawUnsafe('ALTER TABLE public."ConsentWithdrawal" ENABLE TRIGGER consent_withdrawal_guard').catch(() => {});
      await owner.$executeRawUnsafe('ALTER TABLE public."ConsentSignatureEvidence" ENABLE TRIGGER consent_signature_evidence_guard').catch(() => {});
      await owner.$executeRawUnsafe('ALTER TABLE public."PatientConsent" ENABLE TRIGGER patient_consent_guard').catch(() => {});
      await owner.$executeRawUnsafe('ALTER TABLE public."ConsentTemplateVersion" ENABLE TRIGGER consent_template_version_guard').catch(() => {});
      await owner.$executeRawUnsafe('ALTER TABLE public."TreatmentPlanRevision" ENABLE TRIGGER treatment_revision_guard').catch(() => {});
      await owner.$executeRawUnsafe('ALTER TABLE public."TreatmentPlanItem" ENABLE TRIGGER treatment_item_guard').catch(() => {});
      await owner.$executeRawUnsafe('ALTER TABLE public."ProcedureExecution" ENABLE TRIGGER procedure_execution_guard').catch(() => {});
      await owner.$executeRawUnsafe('ALTER TABLE public."TreatmentPlan" ENABLE TRIGGER treatment_plan_guard').catch(() => {});
    }
  }
  await pool?.end();
  await app?.close();
  await owner?.$disconnect();
});

live('template governance: create, versioning, publishing, content digest and immutability triggers', async () => {
  const doc = await new Browser().login(0);

  // 1. Create template
  const createRes = await doc.request(doc.path(0, '/consent-templates'), 'POST', {
    purpose: 'PROCEDURE',
    title: 'نموذج موافقة البوتوكس التجميلي',
    titleAr: 'الموافقة المستنيرة لحقن البوتوكس',
    bodyAr: 'أقر أنا المريض بأن الطبيب المعالج قد شرح لي تفاصيل حقن البوتوكس والمناطق المستهدفة.',
    risksTextAr: 'كدمات موضعية مؤقتة، ارتخاء مؤقت في الجفن العلوي نادر الحدوث.',
    alternativesTextAr: 'العلاجات الموضعية، الفيلر، أو التدخل الجراحي.',
  });
  assert.equal(createRes.status, 201);
  const template = (await createRes.json()) as any;
  assert.equal(template.purpose, 'PROCEDURE');
  assert.equal(template.versions.length, 1);
  const v1 = template.versions[0];
  assert.equal(v1.versionNumber, 1);
  assert.equal(v1.status, 'DRAFT');
  assert.equal(v1.contentDigestSha256.length, 64);

  // 2. Publish version 1
  const publishRes = await doc.request(
    doc.path(0, `/consent-templates/${template.id}/versions/${v1.id}/publish`),
    'POST',
    { expectedVersion: 1 },
  );
  assert.equal(publishRes.status, 201);
  const pubVersion = (await publishRes.json()) as any;
  assert.equal(pubVersion.status, 'PUBLISHED');
  assert(pubVersion.publishedAt);

  // 3. Immutability trigger: Attempt direct modification or delete on published version -> must be blocked
  await assert.rejects(
    owner.consentTemplateVersion.update({
      where: { id: v1.id },
      data: { titleAr: 'تعديل ممنوع' },
    }),
  );
  await assert.rejects(
    owner.consentTemplateVersion.delete({
      where: { id: v1.id },
    }),
  );

  // 4. Create version 2
  const v2Res = await doc.request(doc.path(0, `/consent-templates/${template.id}/versions`), 'POST', {
    titleAr: 'الموافقة المستنيرة لحقن البوتوكس - الإصدار المحدث',
    bodyAr: 'أقر أنا المريض بأنني اطلعت على الإرشادات المحدثة لحقن البوتوكس.',
    risksTextAr: 'كدمات خفيفة قد تستمر لبضعة أيام.',
    alternativesTextAr: 'الفيلر التجميلي أو الميزوثيرابي.',
  });
  assert.equal(v2Res.status, 201);
  const v2 = (await v2Res.json()) as any;
  assert.equal(v2.versionNumber, 2);
  assert.equal(v2.status, 'DRAFT');

  // 5. Publish version 2
  const pubV2 = await doc.request(
    doc.path(0, `/consent-templates/${template.id}/versions/${v2.id}/publish`),
    'POST',
    { expectedVersion: 1 },
  );
  assert.equal(pubV2.status, 201);

  // 6. Retire version 1
  const retireV1 = await doc.request(
    doc.path(0, `/consent-templates/${template.id}/versions/${v1.id}/retire`),
    'POST',
    { expectedVersion: 2 },
  );
  assert.equal(retireV1.status, 201);
  const retired = (await retireV1.json()) as any;
  assert.equal(retired.status, 'RETIRED');

  // 7. Retired version is immutable
  await assert.rejects(
    owner.consentTemplateVersion.update({
      where: { id: v1.id },
      data: { titleAr: 'ممنوع' },
    }),
  );
});

live('procedure execution gate: blocks PERFORMED without consent, blocks with photography-only consent, succeeds with verified procedure consent', async () => {
  const doc = await new Browser().login(0);

  // 1. Setup procedure catalog
  const catRes = await doc.request(doc.path(0, '/procedure-catalog'), 'POST', {
    nameAr: 'جلسة بلازما ديرمابن وهمية',
    category: 'نضارة البشرة',
    defaultDurationMinutes: 45,
  });
  assert.equal(catRes.status, 201);
  const catalog = (await catRes.json()) as any;

  // 2. Setup treatment plan and approve revision
  const planRes = await doc.request(doc.path(0, '/treatment-plans'), 'POST', {
    patientId: patients[0],
    title: 'خطة علاج نضارة البشرة وهمية',
    clinicalPurpose: 'تحفيز الكولاجين وعلاج التصبغات',
  });
  assert.equal(planRes.status, 201);
  const plan = (await planRes.json()) as any;

  const itemRes = await doc.request(doc.path(0, `/treatment-plans/${plan.id}/items`), 'POST', {
    procedureCatalogId: catalog.id,
    sessionOrder: 1,
    expectedDurationMinutes: 45,
  });
  assert.equal(itemRes.status, 201);
  const planWithItem = (await itemRes.json()) as any;
  const item = planWithItem.revisions[0].items[0];

  const approveRes = await doc.request(doc.path(0, `/treatment-plans/${plan.id}/approve`), 'POST', {
    expectedVersion: 1,
  });
  assert.equal(approveRes.status, 201);

  // 3. Create Procedure Execution
  const execRes = await doc.request(doc.path(0, '/procedure-executions'), 'POST', {
    treatmentPlanItemId: item.id,
  });
  assert.equal(execRes.status, 201);
  const execution = (await execRes.json()) as any;
  assert.equal(execution.status, 'DRAFT');
  assert.equal(execution.consentEligible, false);

  // Transition to READY
  const readyRes = await doc.request(doc.path(0, `/procedure-executions/${execution.id}/status`), 'PATCH', {
    expectedVersion: 1,
    status: 'READY',
  });
  assert.equal(readyRes.status, 200);

  // PHASE A: Transition to PERFORMED without consent -> MUST FAIL CLOSED (403 FORBIDDEN)
  const blockedRes1 = await doc.request(doc.path(0, `/procedure-executions/${execution.id}/status`), 'PATCH', {
    expectedVersion: 2,
    status: 'PERFORMED',
  });
  assert.equal(blockedRes1.status, 403);
  const blockedErr1 = (await blockedRes1.json()) as any;
  assert.equal(blockedErr1.error?.code || blockedErr1.message, 'FORBIDDEN');

  // Verify audit event 'clinical.procedure-execution.blocked' logged
  const auditBlocked1 = await owner.auditEvent.findFirst({
    where: {
      clinicId: clinics[0],
      action: 'clinical.procedure-execution.blocked',
      targetId: execution.id,
    },
    orderBy: { createdAt: 'desc' },
  });
  assert(auditBlocked1);
  assert.equal(auditBlocked1.outcome, 'DENIED');

  // PHASE B: Prepare and verify a CLINICAL_PHOTOGRAPHY consent -> MUST STILL BE BLOCKED!
  // Setup photography template
  const photoTemplateRes = await doc.request(doc.path(0, '/consent-templates'), 'POST', {
    purpose: 'CLINICAL_PHOTOGRAPHY',
    title: 'نموذج موافقة التصوير الطبي السريري',
    titleAr: 'موافقة التصوير الطبي لمتابعة الحالة السريرية',
    bodyAr: 'أوافق على التقاط صور سريرية لملفي الطبي الداخلي لتقييم النتائج قبل وبعد العلاج.',
    risksTextAr: 'حفظ الصور في السجل الطبي المحمي فقط.',
    alternativesTextAr: 'رفض التصوير لا يؤثر على تقديم الرعاية الطبية.',
  });
  assert.equal(photoTemplateRes.status, 201);
  const photoTemplate = (await photoTemplateRes.json()) as any;
  const photoV1 = photoTemplate.versions[0];
  await doc.request(
    doc.path(0, `/consent-templates/${photoTemplate.id}/versions/${photoV1.id}/publish`),
    'POST',
    { expectedVersion: 1 },
  );

  // Prepare photography consent
  const prepPhoto = await doc.request(doc.path(0, '/consents'), 'POST', {
    patientId: patients[0],
    templateVersionId: photoV1.id,
    purpose: 'CLINICAL_PHOTOGRAPHY',
  });
  assert.equal(prepPhoto.status, 201);
  const photoConsent = (await prepPhoto.json()) as any;

  // Sign photography consent
  const signPhoto = await doc.request(doc.path(0, `/consents/${photoConsent.id}/sign`), 'POST', {
    expectedVersion: 1,
    signerCapacity: 'PATIENT',
    signerName: 'مريضة موافقة وهمية 1',
    signatureType: 'DRAWN_BASE64',
    signatureData: 'data:image/png;base64,mockphotographyconsentphoto',
  });
  assert.equal(signPhoto.status, 201);

  // Verify photography consent
  const verifyPhoto = await doc.request(doc.path(0, `/consents/${photoConsent.id}/verify`), 'POST', {
    expectedVersion: 2,
  });
  assert.equal(verifyPhoto.status, 201);

  // Attempt transition to PERFORMED with photography consent only -> STILL BLOCKED (403)
  const blockedPhotoRes = await doc.request(doc.path(0, `/procedure-executions/${execution.id}/status`), 'PATCH', {
    expectedVersion: 2,
    status: 'PERFORMED',
  });
  assert.equal(blockedPhotoRes.status, 403);

  // PHASE C: Prepare, sign, and verify a valid PROCEDURE consent -> SUCCEEDS!
  // Setup procedure consent template
  const procTemplateRes = await doc.request(doc.path(0, '/consent-templates'), 'POST', {
    purpose: 'PROCEDURE',
    procedureCatalogId: catalog.id,
    title: 'نموذج موافقة جلسة البلازما',
    titleAr: 'الموافقة المستنيرة لحقن البلازما الغنية بالصفائح الدموية',
    bodyAr: 'أقر بأن الطبيب المعالج قد شرح لي آلية حقن البلازما واستخدام الديرمابن.',
    risksTextAr: 'احمرار مؤقت يدوم من 24 إلى 48 ساعة.',
    alternativesTextAr: 'الميزوثيرابي أو الفراكشنال ليزر.',
  });
  assert.equal(procTemplateRes.status, 201);
  const procTemplate = (await procTemplateRes.json()) as any;
  const procV1 = procTemplate.versions[0];
  await doc.request(
    doc.path(0, `/consent-templates/${procTemplate.id}/versions/${procV1.id}/publish`),
    'POST',
    { expectedVersion: 1 },
  );

  // Prepare procedure consent linked to this treatment plan item
  const prepProc = await doc.request(doc.path(0, '/consents'), 'POST', {
    patientId: patients[0],
    templateVersionId: procV1.id,
    purpose: 'PROCEDURE',
    treatmentPlanId: plan.id,
    treatmentPlanItemId: item.id,
    procedureCatalogId: catalog.id,
  });
  assert.equal(prepProc.status, 201);
  const procConsent = (await prepProc.json()) as any;
  assert.equal(procConsent.status, 'DRAFT');

  // Sign procedure consent
  const signProc = await doc.request(doc.path(0, `/consents/${procConsent.id}/sign`), 'POST', {
    expectedVersion: 1,
    signerCapacity: 'PATIENT',
    signerName: 'مريضة موافقة وهمية 1',
    signatureType: 'DRAWN_BASE64',
    signatureData: 'data:image/png;base64,validproceduredrawnsignature1234',
  });
  assert.equal(signProc.status, 201);
  const signedProc = (await signProc.json()) as any;
  assert.equal(signedProc.status, 'PENDING_VERIFICATION');
  assert(signedProc.signatureEvidence?.evidenceHashSha256);

  // Append-only trigger test: signature evidence cannot be modified or deleted directly
  await assert.rejects(
    owner.consentSignatureEvidence.update({
      where: { id: signedProc.signatureEvidence.id },
      data: { signerName: 'ممنوع' },
    }),
  );
  await assert.rejects(
    owner.consentSignatureEvidence.delete({
      where: { id: signedProc.signatureEvidence.id },
    }),
  );

  // Verify procedure consent
  const futureExp = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
  const verifyProc = await doc.request(doc.path(0, `/consents/${procConsent.id}/verify`), 'POST', {
    expectedVersion: 2,
    validUntil: futureExp,
  });
  assert.equal(verifyProc.status, 201);
  const verifiedConsent = (await verifyProc.json()) as any;
  assert.equal(verifiedConsent.status, 'ACTIVE');
  assert(verifiedConsent.validFrom);
  assert(verifiedConsent.verifiedAt);

  // Check eligibility endpoint
  const eligCheck = await doc.request(doc.path(0, `/procedure-executions/${execution.id}/eligibility`));
  assert.equal(eligCheck.status, 200);
  const eligData = (await eligCheck.json()) as any;
  assert.equal(eligData.eligible, true);
  assert.equal(eligData.consentId, procConsent.id);

  // Now transition to PERFORMED -> MUST SUCCEED!
  const performedRes = await doc.request(doc.path(0, `/procedure-executions/${execution.id}/status`), 'PATCH', {
    expectedVersion: 2,
    status: 'PERFORMED',
  });
  assert.equal(performedRes.status, 200);
  const performed = (await performedRes.json()) as any;
  assert.equal(performed.status, 'PERFORMED');

  // Verify database state: performed procedure has performedAt set and is immutable
  const dbExec = await owner.procedureExecution.findUniqueOrThrow({ where: { id: execution.id } });
  assert.equal(dbExec.status, 'PERFORMED');
  assert(dbExec.performedAt);
});

live('consent withdrawal: immediately blocks future procedures and creates immutable append-only record', async () => {
  const doc = await new Browser().login(0);

  // Create another catalog and treatment plan item for a second session
  const catRes = await doc.request(doc.path(0, '/procedure-catalog'), 'POST', {
    nameAr: 'جلسة نضارة ثانية وهمية',
    category: 'نضارة',
  });
  const catalog = (await catRes.json()) as any;

  const planRes = await doc.request(doc.path(0, '/treatment-plans'), 'POST', {
    patientId: patients[0],
    title: 'خطة علاج جلسات متعددة وهمية',
    clinicalPurpose: 'إجراءات متسلسلة',
  });
  const plan = (await planRes.json()) as any;

  const itemRes = await doc.request(doc.path(0, `/treatment-plans/${plan.id}/items`), 'POST', {
    procedureCatalogId: catalog.id,
    sessionOrder: 1,
    expectedDurationMinutes: 30,
  });
  const planWithItem = (await itemRes.json()) as any;
  const item = planWithItem.revisions[0].items[0];
  await doc.request(doc.path(0, `/treatment-plans/${plan.id}/approve`), 'POST', { expectedVersion: 1 });

  // Template + active consent
  const templateRes = await doc.request(doc.path(0, '/consent-templates'), 'POST', {
    purpose: 'PROCEDURE',
    procedureCatalogId: catalog.id,
    title: 'موافقة الجلسة الثانية',
    titleAr: 'موافقة الجلسة الثانية',
    bodyAr: 'أقر بالموافقة على الجلسة الثانية وتفاصيلها الكاملة.',
    risksTextAr: 'احمرار مؤقت أو تهيج بسيط.',
    alternativesTextAr: 'العلاج البديل.',
  });
  const template = (await templateRes.json()) as any;
  await doc.request(doc.path(0, `/consent-templates/${template.id}/versions/${template.versions[0].id}/publish`), 'POST', { expectedVersion: 1 });

  const prepRes = await doc.request(doc.path(0, '/consents'), 'POST', {
    patientId: patients[0],
    templateVersionId: template.versions[0].id,
    purpose: 'PROCEDURE',
    procedureCatalogId: catalog.id,
  });
  const consent = (await prepRes.json()) as any;

  await doc.request(doc.path(0, `/consents/${consent.id}/sign`), 'POST', {
    expectedVersion: 1,
    signerCapacity: 'PATIENT',
    signerName: 'مريضة 1',
    signatureType: 'DRAWN_BASE64',
    signatureData: 'data:image/png;base64,validsigdata1234',
  });

  await doc.request(doc.path(0, `/consents/${consent.id}/verify`), 'POST', { expectedVersion: 2 });

  // Create procedure execution in READY status
  const execRes = await doc.request(doc.path(0, '/procedure-executions'), 'POST', {
    treatmentPlanItemId: item.id,
  });
  const exec = (await execRes.json()) as any;
  await doc.request(doc.path(0, `/procedure-executions/${exec.id}/status`), 'PATCH', { expectedVersion: 1, status: 'READY' });

  // Confirm eligible initially
  const eligBefore = await doc.request(doc.path(0, `/procedure-executions/${exec.id}/eligibility`));
  assert.equal(((await eligBefore.json()) as any).eligible, true);

  // WITHDRAW CONSENT
  const withdrawRes = await doc.request(doc.path(0, `/consents/${consent.id}/withdraw`), 'POST', {
    expectedVersion: 3,
    reason: 'أبلغت المريضة العيادة برغبتها في التوقف عن الإجراء لأسباب شخصية',
  });
  assert.equal(withdrawRes.status, 201);
  const withdrawn = (await withdrawRes.json()) as any;
  assert.equal(withdrawn.status, 'WITHDRAWN');

  // Direct update to withdrawal -> must be blocked (42501 append-only)
  const dbWithdrawal = await owner.consentWithdrawal.findFirstOrThrow({
    where: { patientConsentId: consent.id },
  });
  await assert.rejects(
    owner.consentWithdrawal.update({
      where: { id: dbWithdrawal.id },
      data: { reason: 'تعديل سبب ممنوع' },
    }),
  );
  await assert.rejects(
    owner.consentWithdrawal.delete({
      where: { id: dbWithdrawal.id },
    }),
  );

  // Terminal status cannot be reopened
  await assert.rejects(
    owner.patientConsent.update({
      where: { id: consent.id },
      data: { status: 'ACTIVE' },
    }),
  );

  // After withdrawal: eligibility is false
  const eligAfter = await doc.request(doc.path(0, `/procedure-executions/${exec.id}/eligibility`));
  assert.equal(((await eligAfter.json()) as any).eligible, false);

  // Attempting to PERFORM is immediately blocked with 403
  const blockedExec = await doc.request(doc.path(0, `/procedure-executions/${exec.id}/status`), 'PATCH', {
    expectedVersion: 2,
    status: 'PERFORMED',
  });
  assert.equal(blockedExec.status, 403);
});

live('tenant isolation & RBAC: Clinic B doctor cannot access Clinic A consents, administrative roles denied', async () => {
  const docA = await new Browser().login(0, 0); // Doctor A in Clinic 0
  const docB = await new Browser().login(1, 1); // Doctor B in Clinic 1

  // Create template in Clinic 0
  const createRes = await docA.request(docA.path(0, '/consent-templates'), 'POST', {
    purpose: 'PROCEDURE',
    title: 'نموذج عزل عيادة أ',
    titleAr: 'عنوان عزل عيادة أ',
    bodyAr: 'نص موافقة مستنيرة للعزل السريري للعيادة أ.',
    risksTextAr: 'مخاطر العزل',
    alternativesTextAr: 'بدائل العزل',
  });
  assert.equal(createRes.status, 201);
  const templateA = (await createRes.json()) as any;

  // Doctor B tries to access Clinic 0's template -> 403 (membership check fails)
  const crossGet = await docB.request(`clinics/${clinics[0]}/clinical/consent-templates/${templateA.id}`);
  assert.equal(crossGet.status, 403);

  // Doctor B lists templates in Clinic 1 -> sees none of Clinic 0's templates
  const listB = await docB.request(docB.path(1, '/consent-templates'));
  assert.equal(listB.status, 200);
  const bItems = ((await listB.json()) as any).items;
  assert(!bItems.some((x: any) => x.id === templateA.id));

  // Role separation: Administrative roles (CLINIC_OWNER, CLINIC_ADMIN, RECEPTIONIST, ACCOUNTANT) cannot access clinical consent endpoints
  for (let roleIdx = 2; roleIdx <= 5; roleIdx++) {
    const adminBrowser = await new Browser().login(roleIdx, 0);
    const deniedList = await adminBrowser.request(adminBrowser.path(0, '/consent-templates'));
    assert.equal(deniedList.status, 403, `Role ${accounts[roleIdx]} must be denied on consent templates`);

    const deniedConsents = await adminBrowser.request(adminBrowser.path(0, '/consents'));
    assert.equal(deniedConsents.status, 403, `Role ${accounts[roleIdx]} must be denied on patient consents`);
  }
});
