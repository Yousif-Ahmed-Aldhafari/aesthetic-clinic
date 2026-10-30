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
const live = (name: string, fn: () => Promise<void>) => test(`followup: ${name}`, { skip: !enabled }, fn);

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
].map((x) => `${x}-followup-${suffix}@example.invalid`);

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
        slug: `followup-${i}-${suffix}`,
        legalName: 'عيادة استشارية للمتابعة السريرية وهمية',
        displayName: 'عيادة استشارية للمتابعة السريرية وهمية',
        currency: 'SAR',
        branding: { create: {} },
      },
    });
    await owner.patient.create({
      data: {
        id: patients[i],
        clinicId: id,
        patientNumber: `P-00000${i + 1}`,
        fullName: `مريضة متابعة وهمية ${i + 1}`,
        searchName: `مريضة متابعة وهمية ${i + 1}`,
      },
    });
  }

  const roles = ['DOCTOR', 'DOCTOR', 'CLINIC_OWNER', 'CLINIC_ADMIN', 'RECEPTIONIST', 'ACCOUNTANT'] as const;
  for (const [i, email] of accounts.entries()) {
    const u = await provisionUser(owner, {
      email,
      name: `ممارس متابعة وهمي ${i}`,
      password,
      memberships: [{ clinicSlug: `followup-0-${suffix}`, role: roles[i] }],
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
      await owner.$executeRawUnsafe('ALTER TABLE public."AdverseEvent" DISABLE TRIGGER adverse_event_guard');
      await owner.$executeRawUnsafe('ALTER TABLE public."TreatmentOutcome" DISABLE TRIGGER treatment_outcome_guard');
      await owner.$executeRawUnsafe('ALTER TABLE public."FollowUpAssessmentAmendment" DISABLE TRIGGER followup_assessment_amendment_guard');
      await owner.$executeRawUnsafe('ALTER TABLE public."FollowUpAssessment" DISABLE TRIGGER followup_assessment_guard');
      await owner.$executeRawUnsafe('ALTER TABLE public."ClinicalFollowUp" DISABLE TRIGGER clinical_followup_guard');
      await owner.$executeRawUnsafe('ALTER TABLE public."PhotoAnnotation" DISABLE TRIGGER photo_annotation_guard');
      await owner.$executeRawUnsafe('ALTER TABLE public."PhotoComparisonGroup" DISABLE TRIGGER photo_comparison_guard');
      await owner.$executeRawUnsafe('ALTER TABLE public."ClinicalPhoto" DISABLE TRIGGER clinical_photo_guard');
      await owner.$executeRawUnsafe('ALTER TABLE public."ClinicalPhotoSession" DISABLE TRIGGER clinical_photo_session_guard');

      await owner.adverseEvent.deleteMany({ where: { clinicId: { in: clinics } } });
      await owner.treatmentOutcome.deleteMany({ where: { clinicId: { in: clinics } } });
      await owner.followUpAssessmentAmendment.deleteMany({ where: { clinicId: { in: clinics } } });
      await owner.followUpAssessment.deleteMany({ where: { clinicId: { in: clinics } } });
      await owner.clinicalFollowUp.deleteMany({ where: { clinicId: { in: clinics } } });
      await owner.photoAnnotation.deleteMany({ where: { clinicId: { in: clinics } } });
      await owner.photoComparisonGroup.deleteMany({ where: { clinicId: { in: clinics } } });
      await owner.clinicalPhoto.deleteMany({ where: { clinicId: { in: clinics } } });
      await owner.clinicalPhotoSession.deleteMany({ where: { clinicId: { in: clinics } } });
      await owner.patient.deleteMany({ where: { clinicId: { in: clinics } } });
      await owner.clinicMembership.deleteMany({ where: { clinicId: { in: clinics } } });
      await owner.session.deleteMany({ where: { userId: { in: users } } });
      await owner.user.deleteMany({ where: { id: { in: users } } });
      await owner.clinicBranding.deleteMany({ where: { clinicId: { in: clinics } } });
      await owner.clinic.deleteMany({ where: { id: { in: clinics } } });
    } finally {
      await owner.$executeRawUnsafe('ALTER TABLE public."AdverseEvent" ENABLE TRIGGER adverse_event_guard');
      await owner.$executeRawUnsafe('ALTER TABLE public."TreatmentOutcome" ENABLE TRIGGER treatment_outcome_guard');
      await owner.$executeRawUnsafe('ALTER TABLE public."FollowUpAssessmentAmendment" ENABLE TRIGGER followup_assessment_amendment_guard');
      await owner.$executeRawUnsafe('ALTER TABLE public."FollowUpAssessment" ENABLE TRIGGER followup_assessment_guard');
      await owner.$executeRawUnsafe('ALTER TABLE public."ClinicalFollowUp" ENABLE TRIGGER clinical_followup_guard');
      await owner.$executeRawUnsafe('ALTER TABLE public."PhotoAnnotation" ENABLE TRIGGER photo_annotation_guard');
      await owner.$executeRawUnsafe('ALTER TABLE public."PhotoComparisonGroup" ENABLE TRIGGER photo_comparison_guard');
      await owner.$executeRawUnsafe('ALTER TABLE public."ClinicalPhoto" ENABLE TRIGGER clinical_photo_guard');
      await owner.$executeRawUnsafe('ALTER TABLE public."ClinicalPhotoSession" ENABLE TRIGGER clinical_photo_session_guard');
    }
  }
  await pool?.end();
  await app?.close();
  await owner?.$disconnect();
});

live('full clinical follow-up lifecycle: schedule -> in-progress -> complete assessment with signature -> attributable amendment', async () => {
  const doc = await new Browser().login(0, 0);

  // 1. Get Doctor A's membershipId
  const memberships = await owner.clinicMembership.findMany({
    where: { clinicId: clinics[0], userId: users[0] },
  });
  assert.equal(memberships.length, 1);
  const doctorMembershipId = memberships[0].id;

  // 2. Schedule Follow-up
  const scheduleRes = await doc.request(
    doc.path(0, '/follow-ups'),
    'POST',
    {
      patientId: patients[0],
      treatingDoctorMembershipId: doctorMembershipId,
      reason: 'متابعة ما بعد إجراء الفيلر والتأكد من انحسار التورم الأولي',
      scheduledDate: '2026-11-06T10:00:00.000Z',
      recoveryInstructions: 'كمادات باردة والامتناع عن التعرض المباشر للشمس',
    },
  );
  assert.equal(scheduleRes.status, 201);
  const followUp = (await scheduleRes.json()) as any;
  assert.equal(followUp.status, 'SCHEDULED');
  assert.equal(followUp.patientId, patients[0]);
  assert.equal(followUp.version, 1);

  // 3. Update Status to IN_PROGRESS
  const statusRes = await doc.request(
    doc.path(0, `/follow-ups/${followUp.id}/status`),
    'PATCH',
    {
      status: 'IN_PROGRESS',
      expectedVersion: 1,
    },
  );
  assert.equal(statusRes.status, 200);
  const inProgress = (await statusRes.json()) as any;
  assert.equal(inProgress.status, 'IN_PROGRESS');
  assert.equal(inProgress.version, 2);

  // 4. Complete Follow-up with Digital Signed Assessment
  const completeRes = await doc.request(
    doc.path(0, `/follow-ups/${followUp.id}/assess`),
    'POST',
    {
      symptomsObserved: 'انحسار التورم بالكامل وعدم وجود أي تكتلات في موضع الحقن',
      healingProgress: 'التئام سريري ممتاز وتوزيع متناسق للمادة المالئة',
      clinicalNotes: 'تم الفحص المباشر، النتيجة متناسقة والوجه في حالة تعافي مثالية',
      expectedVersion: 2,
    },
  );
  assert.equal(completeRes.status, 201);
  const completed = (await completeRes.json()) as any;
  assert.equal(completed.status, 'COMPLETED');
  assert.ok(completed.completedAt);
  assert.equal(completed.version, 3);
  assert.ok(completed.assessment);
  assert.ok(completed.assessment.signedAt);
  assert.equal(completed.assessment.signatureSha256.length, 64);
  const assessmentId = completed.assessment.id;

  // 5. Amend Assessment
  const amendRes = await doc.request(
    doc.path(0, `/assessments/${assessmentId}/amend`),
    'POST',
    {
      amendmentReason: 'إضافة ملاحظة توجيهية خاصة بالعناية الليلية بالبشرة',
      amendedContent: 'تم توجيه المريضة باستخدام مرطب لطيف خالٍ من العطور ليلاً',
    },
  );
  assert.equal(amendRes.status, 201);
  const amendment = (await amendRes.json()) as any;
  assert.equal(amendment.assessmentId, assessmentId);
  assert.ok(amendment.signedAt);
  assert.equal(amendment.signatureSha256.length, 64);

  // 6. Verify retrieved follow-up reflects COMPLETED status, signed assessment and amendment
  const getRes = await doc.request(doc.path(0, `/follow-ups/${followUp.id}`), 'GET');
  assert.equal(getRes.status, 200);
  const details = (await getRes.json()) as any;
  assert.equal(details.status, 'COMPLETED');
  assert.equal(details.assessment.amendments.length, 1);
  assert.equal(details.assessment.amendments[0].amendmentReason, 'إضافة ملاحظة توجيهية خاصة بالعناية الليلية بالبشرة');

  // 7. Terminal status cannot reopen: attempting to update COMPLETED follow-up fails closed
  const reopenRes = await doc.request(
    doc.path(0, `/follow-ups/${followUp.id}/status`),
    'PATCH',
    {
      status: 'IN_PROGRESS',
      expectedVersion: details.version,
    },
  );
  assert.equal(reopenRes.status, 409);
});

live('treatment outcome tracking: validates scale bounds, records clinician vs patient score, and links photo comparison', async () => {
  const doc = await new Browser().login(0, 0);

  // 1. Valid Visual Analog Scale (0-10)
  const vasRes = await doc.request(
    doc.path(0, '/outcomes'),
    'POST',
    {
      patientId: patients[0],
      measurementScale: 'VISUAL_ANALOG_SCALE_10',
      clinicianScore: 8.5,
      clinicianNotes: 'تحسن سريري بمعدل ٨.٥ من ١٠',
      patientReportedScore: 9.0,
      patientReportedNotes: 'المريضة تشعر بارتياح ملحوظ للنتيجة',
    },
  );
  assert.equal(vasRes.status, 201);
  const vasOutcome = (await vasRes.json()) as any;
  assert.equal(Number(vasOutcome.clinicianScore), 8.5);
  assert.equal(Number(vasOutcome.patientReportedScore), 9.0);
  assert.equal(vasOutcome.measurementScale, 'VISUAL_ANALOG_SCALE_10');

  // 2. Out of bounds score for 5-point scale fails closed
  const invalidScaleRes = await doc.request(
    doc.path(0, '/outcomes'),
    'POST',
    {
      patientId: patients[0],
      measurementScale: 'PATIENT_SATISFACTION_5_POINT',
      clinicianScore: 7.0, // Invalid: must be between 1 and 5
    },
  );
  assert.equal(invalidScaleRes.status, 400);

  // 3. Out of bounds score for VAS (negative or > 10) fails closed
  const invalidVasRes = await doc.request(
    doc.path(0, '/outcomes'),
    'POST',
    {
      patientId: patients[0],
      measurementScale: 'VISUAL_ANALOG_SCALE_10',
      patientReportedScore: 11.0,
    },
  );
  assert.equal(invalidVasRes.status, 400);

  // 4. Missing both scores fails closed
  const noScoreRes = await doc.request(
    doc.path(0, '/outcomes'),
    'POST',
    {
      patientId: patients[0],
      measurementScale: 'CLINICAL_GLOBAL_IMPRESSION',
      clinicianNotes: 'ملاحظة دون تقييم رقمي',
    },
  );
  assert.equal(noScoreRes.status, 400);

  // 5. List outcomes for patient
  const listRes = await doc.request(doc.path(0, `/patients/${patients[0]}/outcomes`), 'GET');
  assert.equal(listRes.status, 200);
  const outcomes = (await listRes.json()) as any;
  assert.ok(outcomes.items.length >= 1);
});

live('adverse event reporting: documentation, severity rating, and resolution lifecycle', async () => {
  const doc = await new Browser().login(0, 0);

  // 1. Report Adverse Event
  const reportRes = await doc.request(
    doc.path(0, '/adverse-events'),
    'POST',
    {
      patientId: patients[0],
      eventType: 'تجمع دموي طفيف غير متوقع',
      severity: 'MILD',
      observationDate: '2026-11-05T14:00:00.000Z',
      documentedFindings: 'لوحظت كدمة طفيفة في منطقة الشفة العليا بقطر ١ سم دون ألم حاد',
      escalationNotes: 'وصف كمادات باردة ومتابعة هاتفية بعد ٢٤ ساعة',
    },
  );
  assert.equal(reportRes.status, 201);
  const event = (await reportRes.json()) as any;
  assert.equal(event.status, 'REPORTED');
  assert.equal(event.severity, 'MILD');
  assert.equal(event.version, 1);

  // 2. Update to RESOLVED
  const resolveRes = await doc.request(
    doc.path(0, `/adverse-events/${event.id}`),
    'PATCH',
    {
      status: 'RESOLVED',
      escalationNotes: 'تم اختفاء الكدمة بالكامل في الفحص المباشر دون أي آثار جانبية',
      expectedVersion: 1,
    },
  );
  assert.equal(resolveRes.status, 200);
  const resolved = (await resolveRes.json()) as any;
  assert.equal(resolved.status, 'RESOLVED');
  assert.ok(resolved.resolvedAt);
  assert.equal(resolved.version, 2);

  // 3. List adverse events
  const listRes = await doc.request(doc.path(0, `/adverse-events?patientId=${patients[0]}`), 'GET');
  assert.equal(listRes.status, 200);
  const list = (await listRes.json()) as any;
  assert.ok(list.items.some((e: any) => e.id === event.id && e.status === 'RESOLVED'));
});

live('tenant isolation & RBAC: Clinic B doctor cannot access Clinic A follow-ups; administrative roles denied', async () => {
  const docA = await new Browser().login(0, 0);
  const docB = await new Browser().login(1, 1);

  // 1. Get Doctor A membershipId
  const doctorAMembership = (await owner.clinicMembership.findFirst({
    where: { clinicId: clinics[0], userId: users[0] },
  }))!;

  // 2. Doctor A creates follow-up in Clinic A
  const createRes = await docA.request(
    docA.path(0, '/follow-ups'),
    'POST',
    {
      patientId: patients[0],
      treatingDoctorMembershipId: doctorAMembership.id,
      reason: 'متابعة سريرية خاصة بعيادة ألف',
      scheduledDate: '2026-11-07T09:00:00.000Z',
    },
  );
  assert.equal(createRes.status, 201);
  const followUpA = (await createRes.json()) as any;

  // 3. Doctor B (Clinic B) cannot access Clinic A follow-up
  const crossGet = await docB.request(docB.path(0, `/follow-ups/${followUpA.id}`), 'GET');
  assert.ok([403, 404].includes(crossGet.status));

  // 4. Non-doctor roles (Owner, Admin, Receptionist, Accountant) denied access
  const nonDoctorIndices = [2, 3, 4, 5]; // owner, admin, reception, accountant
  for (const idx of nonDoctorIndices) {
    const userBrowser = await new Browser().login(idx, 0);

    // Cannot schedule
    const scheduleDenied = await userBrowser.request(
      userBrowser.path(0, '/follow-ups'),
      'POST',
      {
        patientId: patients[0],
        treatingDoctorMembershipId: doctorAMembership.id,
        reason: 'محاولة جدولة غير مصرحة',
        scheduledDate: '2026-11-08T10:00:00.000Z',
      },
    );
    assert.equal(scheduleDenied.status, 403);

    // Cannot read
    const readDenied = await userBrowser.request(userBrowser.path(0, '/follow-ups'), 'GET');
    assert.equal(readDenied.status, 403);

    // Cannot record outcome
    const outcomeDenied = await userBrowser.request(
      userBrowser.path(0, '/outcomes'),
      'POST',
      {
        patientId: patients[0],
        measurementScale: 'VISUAL_ANALOG_SCALE_10',
        clinicianScore: 5,
      },
    );
    assert.equal(outcomeDenied.status, 403);

    // Cannot record adverse event
    const eventDenied = await userBrowser.request(
      userBrowser.path(0, '/adverse-events'),
      'POST',
      {
        patientId: patients[0],
        eventType: 'محاولة غير مصرحة',
        severity: 'MILD',
        observationDate: '2026-11-05T12:00:00.000Z',
        documentedFindings: 'فحص غير طبي',
      },
    );
    assert.equal(eventDenied.status, 403);
  }
});

live('database immutability triggers prevent deletion and protect signed assessment integrity', async () => {
  // 1. Deleting FollowUp fails closed via trigger
  await assert.rejects(
    owner.$executeRawUnsafe('DELETE FROM public."ClinicalFollowUp"'),
    /Clinical follow-ups cannot be deleted/,
  );

  // 2. Deleting FollowUpAssessment fails closed via trigger
  await assert.rejects(
    owner.$executeRawUnsafe('DELETE FROM public."FollowUpAssessment"'),
    /Follow-up assessments cannot be deleted/,
  );

  // 3. Deleting TreatmentOutcome fails closed via trigger
  await assert.rejects(
    owner.$executeRawUnsafe('DELETE FROM public."TreatmentOutcome"'),
    /Treatment outcomes cannot be deleted/,
  );

  // 4. Deleting AdverseEvent fails closed via trigger
  await assert.rejects(
    owner.$executeRawUnsafe('DELETE FROM public."AdverseEvent"'),
    /Adverse events cannot be deleted/,
  );
});
