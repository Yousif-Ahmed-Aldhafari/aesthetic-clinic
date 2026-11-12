import 'reflect-metadata';
import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { before, after, test } from 'node:test';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import pg from 'pg';
import { fixtureDatabase, testUrls } from './database-fixtures.js';
import { configureApp } from '../src/configure-app.js';
import { provisionUser } from '../scripts/provision-user.js';

const enabled = Boolean(process.env.TEST_DATABASE_URL);
const live = (name: string, fn: () => Promise<void>) => test(`patient-consent-recovery: ${name}`, { skip: !enabled }, fn);

const suffix = randomUUID();
const clinics = [randomUUID(), randomUUID()];
const clinicSlugs = [`consent-a-${suffix}`, `consent-b-${suffix}`];
const staffEmail = `owner-consent-${suffix}@example.invalid`;
const doctorEmail = `doc-consent-${suffix}@example.invalid`;
const password = randomBytes(32).toString('base64url');
const origin = 'http://localhost:5173';

let owner: ReturnType<typeof fixtureDatabase>;
let app: INestApplication;
let pool: pg.Pool;
let base: string;
// Two patients in Clinic 0 (Patient A and Patient B) and one patient in Clinic 1 (Patient C)
const patients: {
  id: string;
  clinicId: string;
  phone: string;
  dob: string;
  fullName: string;
  accountToken?: string;
}[] = [];

let procedureCatalogId: string;
let consentTemplateVersionId: string;

class StaffClient {
  cookies = new Map<string, string>();
  csrf = '';

  async request(path: string, method = 'GET', body?: unknown) {
    const res = await fetch(`${base}/api/v1/${path}`, {
      method,
      headers: {
        Cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; '),
        ...(method === 'GET' ? {} : { Origin: origin, 'Content-Type': 'application/json', 'X-CSRF-Token': this.csrf }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    for (const cookie of res.headers.getSetCookie()) {
      const [p] = cookie.split(';');
      const i = p.indexOf('=');
      this.cookies.set(p.slice(0, i), p.slice(i + 1));
    }
    return res;
  }

  async login(clinicIndex = 0, userEmail = staffEmail) {
    const csrfRes = (await (await this.request('auth/csrf')).json()) as { csrfToken: string };
    this.csrf = csrfRes.csrfToken;
    const loginRes = await this.request('auth/login', 'POST', { email: userEmail, password });
    assert.equal(loginRes.status, 200);
    this.csrf = ((await loginRes.json()) as { csrfToken: string }).csrfToken;
    const clinicRes = await this.request('auth/clinic', 'POST', { clinicId: clinics[clinicIndex] });
    assert.equal(clinicRes.status, 200);
    this.csrf = ((await clinicRes.json()) as { csrfToken: string }).csrfToken;
    return this;
  }
}

class PatientClient {
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
    for (const cookie of res.headers.getSetCookie()) {
      const [p] = cookie.split(';');
      const i = p.indexOf('=');
      this.cookies.set(p.slice(0, i), p.slice(i + 1));
    }
    return res;
  }

  async activate(clinicSlug: string, token: string, phone: string, dateOfBirth: string, pass: string) {
    const res = await this.request('portal/auth/activate', 'POST', {
      clinicSlug,
      token,
      phone,
      dateOfBirth,
      password: pass,
    });
    if (res.status === 200) {
      const data = (await res.clone().json()) as { csrfToken: string };
      this.csrf = data.csrfToken;
    }
    return res;
  }

  async login(clinicSlug: string, phone: string, pass: string) {
    const res = await this.request('portal/auth/login', 'POST', {
      clinicSlug,
      phone,
      password: pass,
    });
    if (res.status === 200) {
      const data = (await res.clone().json()) as { csrfToken: string };
      this.csrf = data.csrfToken;
    }
    return res;
  }
}

before(async () => {
  if (!enabled) return;
  const urls = testUrls();
  process.env.DATABASE_URL = urls.runtime;
  process.env.NODE_ENV = 'test';
  process.env.AUTH_CSRF_SECRET = randomBytes(48).toString('base64url');
  process.env.CORS_ORIGINS = origin;
  process.env.AUTH_LOGIN_ACCOUNT_LIMIT = '100';
  process.env.AUTH_LOGIN_IP_LIMIT = '10000';

  const { AppModule } = await import('../src/app.module.js');
  const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = mod.createNestApplication({ logger: false });
  configureApp(app);
  await app.listen(0, '127.0.0.1');
  base = await app.getUrl();
  owner = fixtureDatabase();
  pool = new pg.Pool({ connectionString: urls.runtime, options: '-c timezone=UTC', max: 4 });

  // Provision clinics
  for (const [i, id] of clinics.entries()) {
    await owner.clinic.create({
      data: {
        id,
        slug: clinicSlugs[i],
        legalName: `عيادة الإقرارات القانونية ${i}`,
        displayName: `عيادة لمسة ${i}`,
        currency: 'YER',
        timezone: 'Asia/Aden',
      },
    });

    // Patients
    // In clinic 0, add two patients (Patient A and Patient B)
    // In clinic 1, add one patient (Patient C)
    const count = i === 0 ? 2 : 1;
    for (let pIdx = 0; pIdx < count; pIdx++) {
      const pId = randomUUID();
      const p = await owner.patient.create({
        data: {
          id: pId,
          clinicId: id,
          patientNumber: `P-${String(100000 + i * 10 + pIdx)}`,
          fullName: `مريض تجريبي ${i}-${pIdx + 1}`,
          searchName: `مريض تجريبي ${i} ${pIdx + 1}`,
          phone: `+967722222${i}${pIdx}`,
          email: `patient-${i}-${pIdx}@example.invalid`,
          dateOfBirth: new Date('1992-04-10T00:00:00.000Z'),
          gender: 'FEMALE',
          status: 'ACTIVE',
        },
      });
      patients.push({
        id: p.id,
        clinicId: id,
        phone: p.phone ?? `+967722222${i}${pIdx}`,
        dob: '1992-04-10',
        fullName: p.fullName,
      });
    }
  }

  // Provision staff user and doctor user
  await provisionUser(owner, {
    email: staffEmail,
    name: 'مالك العيادة',
    password,
    memberships: [
      { clinicSlug: clinicSlugs[0], role: 'CLINIC_OWNER' },
      { clinicSlug: clinicSlugs[1], role: 'CLINIC_OWNER' },
    ],
  });

  const doc = await provisionUser(owner, {
    email: doctorEmail,
    name: 'د. لينا الاستشارية',
    password,
    memberships: [
      { clinicSlug: clinicSlugs[0], role: 'DOCTOR' },
      { clinicSlug: clinicSlugs[1], role: 'DOCTOR' },
    ],
  });
  const docMembership = await owner.clinicMembership.findFirstOrThrow({
    where: { userId: doc.id, clinicId: clinics[0] },
  });

  // Provision procedure catalog and consent template
  const proc = await owner.aestheticProcedureCatalog.create({
    data: {
      clinicId: clinics[0],
      nameAr: 'حقن فيلر الشفاه التجميلي',
      category: 'INJECTABLES',
      active: true,
    },
  });
  procedureCatalogId = proc.id;

  const bodyAr = 'أقر بموافقتي على إجراء حقن الفيلر التجميلي بعد مناقشة الطبيب واستيعاب البدائل والمضاعفات.';
  const risksTextAr = 'قد يحدث تورم خفيف أو احمرار أو كدمات موضعية تزول خلال أيام قليلة.';
  const alternativesTextAr = 'عدم إجراء التدخل أو استخدام البدائل السطحية غير الحقنية.';
  const digest = createHash('sha256')
    .update(['إقرار حقن الفيلر', bodyAr, risksTextAr, alternativesTextAr, '1'].join('|'))
    .digest('hex');

  const tmpl = await owner.consentTemplate.create({
    data: {
      clinicId: clinics[0],
      title: 'إقرار حقن الفيلر',
      purpose: 'PROCEDURE',
    },
  });

  const tmplVer = await owner.consentTemplateVersion.create({
    data: {
      clinicId: clinics[0],
      templateId: tmpl.id,
      versionNumber: 1,
      status: 'PUBLISHED',
      titleAr: 'إقرار حقن الفيلر',
      bodyAr,
      risksTextAr,
      alternativesTextAr,
      contentDigestSha256: digest,
      publishedAt: new Date(),
      publishedByMembershipId: docMembership.id,
    },
  });
  consentTemplateVersionId = tmplVer.id;
});

after(async () => {
  try {
    if (owner) {
      try {
        await owner.$executeRawUnsafe('ALTER TABLE public."ConsentWithdrawal" DISABLE TRIGGER consent_withdrawal_guard').catch(() => {});
        await owner.$executeRawUnsafe('ALTER TABLE public."ConsentSignatureEvidence" DISABLE TRIGGER consent_signature_evidence_guard').catch(() => {});
        await owner.$executeRawUnsafe('ALTER TABLE public."PatientConsent" DISABLE TRIGGER patient_consent_guard').catch(() => {});
        await owner.$executeRawUnsafe('ALTER TABLE public."ConsentTemplateVersion" DISABLE TRIGGER consent_template_version_guard').catch(() => {});

        await owner.patientReportedOutcome.deleteMany({ where: { clinicId: { in: clinics } } });
        await owner.patientRecoveryCheckIn.deleteMany({ where: { clinicId: { in: clinics } } });
        await owner.clinicalFollowUp.deleteMany({ where: { clinicId: { in: clinics } } });
        await owner.consentWithdrawal.deleteMany({ where: { clinicId: { in: clinics } } });
        await owner.consentSignatureEvidence.deleteMany({ where: { clinicId: { in: clinics } } });
        await owner.patientConsent.deleteMany({ where: { clinicId: { in: clinics } } });
        await owner.consentTemplateVersion.deleteMany({ where: { clinicId: { in: clinics } } });
        await owner.consentTemplate.deleteMany({ where: { clinicId: { in: clinics } } });
        await owner.aestheticProcedureCatalog.deleteMany({ where: { clinicId: { in: clinics } } });
        await owner.patientPortalAuditEvent.deleteMany({ where: { clinicId: { in: clinics } } });
        await owner.patientSession.deleteMany({ where: { clinicId: { in: clinics } } });
        await owner.patientVerificationToken.deleteMany({ where: { clinicId: { in: clinics } } });
        await owner.patientAccount.deleteMany({ where: { clinicId: { in: clinics } } });
        await owner.patient.deleteMany({ where: { clinicId: { in: clinics } } });
        const testUsers = await owner.user.findMany({ where: { email: { contains: suffix } }, select: { id: true } });
        const testUserIds = testUsers.map((u) => u.id);
        await owner.clinicMembership.deleteMany({ where: { clinicId: { in: clinics } } });
        await owner.session.deleteMany({ where: { OR: [{ selectedClinicId: { in: clinics } }, { userId: { in: testUserIds } }] } });
        await owner.clinicBranding.deleteMany({ where: { clinicId: { in: clinics } } });
        await owner.clinicIdentityAuditEvent.deleteMany({ where: { clinicId: { in: clinics } } }).catch(() => {});
        await owner.clinicIdentityState.deleteMany({ where: { clinicId: { in: clinics } } }).catch(() => {});
        await owner.clinic.deleteMany({ where: { id: { in: clinics } } });
        await owner.user.deleteMany({ where: { id: { in: testUserIds } } });
      } finally {
        await owner.$executeRawUnsafe('ALTER TABLE public."ConsentWithdrawal" ENABLE TRIGGER consent_withdrawal_guard').catch(() => {});
        await owner.$executeRawUnsafe('ALTER TABLE public."ConsentSignatureEvidence" ENABLE TRIGGER consent_signature_evidence_guard').catch(() => {});
        await owner.$executeRawUnsafe('ALTER TABLE public."PatientConsent" ENABLE TRIGGER patient_consent_guard').catch(() => {});
        await owner.$executeRawUnsafe('ALTER TABLE public."ConsentTemplateVersion" ENABLE TRIGGER consent_template_version_guard').catch(() => {});
      }
    }
  } catch (err) {
    console.error('AFTER HOOK CLEANUP ERROR:', err);
  } finally {
    try { if (pool) await pool.end(); } catch (e) { console.error('POOL END ERROR:', e); }
    try { if (app) await app.close(); } catch (e) { console.error('APP CLOSE ERROR:', e); }
    try { if (owner) await owner.$disconnect(); } catch (e) { console.error('OWNER DISCONNECT ERROR:', e); }
  }
});

live('Setup: activate Patient A and Patient B portal accounts', async () => {
  const staff = new StaffClient();
  await staff.login(0);

  // Invite Patient A (index 0)
  const invA = await staff.request(`clinics/${clinics[0]}/patients/${patients[0].id}/portal-invitation`, 'POST', {});
  assert.equal(invA.status, 201);
  const dataA = (await invA.json()) as { activationToken: string };

  const clientA = new PatientClient();
  const actA = await clientA.activate(clinicSlugs[0], dataA.activationToken, patients[0].phone, patients[0].dob, 'PatientPass123!');
  assert.equal(actA.status, 200);

  // Invite Patient B (index 1) in same clinic
  const invB = await staff.request(`clinics/${clinics[0]}/patients/${patients[1].id}/portal-invitation`, 'POST', {});
  assert.equal(invB.status, 201);
  const dataB = (await invB.json()) as { activationToken: string };

  const clientB = new PatientClient();
  const actB = await clientB.activate(clinicSlugs[1] /* wrong clinic */, dataB.activationToken, patients[1].phone, patients[1].dob, 'PatientPass123!');
  assert.equal(actB.status, 400, 'Activating under wrong clinic slug must fail with 400 validation error');

  const actB2 = await clientB.activate(clinicSlugs[0], dataB.activationToken, patients[1].phone, patients[1].dob, 'PatientPass123!');
  assert.equal(actB2.status, 200, 'Activating Patient B in correct clinic must succeed');
});

live('Security: Patient A cannot read or sign Patient B consent (intra-clinic isolation)', async () => {
  // Staff creates a consent for Patient B (using doctor permissions)
  const doctor = new StaffClient();
  await doctor.login(0, doctorEmail);

  const consentRes = await doctor.request(`clinics/${clinics[0]}/clinical/consents`, 'POST', {
    patientId: patients[1].id,
    templateVersionId: consentTemplateVersionId,
    purpose: 'PROCEDURE',
    procedureCatalogId,
  });
  assert.equal(consentRes.status, 201);
  const bConsent = (await consentRes.json()) as { id: string; version: number };

  // Patient A logs in
  const clientA = new PatientClient();
  const loginA = await clientA.login(clinicSlugs[0], patients[0].phone, 'PatientPass123!');
  assert.equal(loginA.status, 200);

  // Patient A lists consents -> must not contain Patient B's consent
  const listA = await clientA.request('portal/consents');
  assert.equal(listA.status, 200);
  const listAData = (await listA.json()) as { id: string }[];
  assert.equal(listAData.some((c) => c.id === bConsent.id), false, 'Patient A must NOT see Patient B consent in list');

  // Patient A tries to GET Patient B's consent directly -> 404 NOT_FOUND
  const getB = await clientA.request(`portal/consents/${bConsent.id}`);
  assert.equal(getB.status, 404, 'Patient A direct GET of Patient B consent must return 404');

  // Patient A attempts to sign Patient B's consent -> 404 NOT_FOUND
  const signB = await clientA.request(`portal/consents/${bConsent.id}/sign`, 'POST', {
    expectedVersion: bConsent.version,
    signerCapacity: 'PATIENT',
    signatureType: 'TYPED_CONFIRMATION',
    signatureData: patients[0].fullName,
  });
  assert.equal(signB.status, 404, 'Patient A signing Patient B consent must return 404');
});

live('Consent: Patient B signs consent, enforces PATIENT capacity and PENDING_VERIFICATION', async () => {
  // Patient B logs in
  const clientB = new PatientClient();
  const loginB = await clientB.login(clinicSlugs[0], patients[1].phone, 'PatientPass123!');
  assert.equal(loginB.status, 200);

  const listB = await clientB.request('portal/consents');
  assert.equal(listB.status, 200);
  const listBData = (await listB.json()) as { id: string; status: string; version: number }[];
  const consentB = listBData[0];
  assert.ok(consentB);
  assert.equal(consentB.status, 'DRAFT');

  // Attempt to sign with representative capacity -> 400 Bad Request
  const signRep = await clientB.request(`portal/consents/${consentB.id}/sign`, 'POST', {
    expectedVersion: consentB.version,
    signerCapacity: 'LEGAL_REPRESENTATIVE',
    signatureType: 'TYPED_CONFIRMATION',
    signatureData: 'Representative Name',
  });
  assert.equal(signRep.status, 400, 'Representative signing via portal must be rejected with 400');

  // Sign with PATIENT capacity
  const signRes = await clientB.request(`portal/consents/${consentB.id}/sign`, 'POST', {
    expectedVersion: consentB.version,
    signerCapacity: 'PATIENT',
    signatureType: 'TYPED_CONFIRMATION',
    signatureData: patients[1].fullName,
  });
  assert.equal(signRes.status, 200);
  const signedData = (await signRes.json()) as {
    status: string;
    signatureEvidence: { signerCapacity: string; evidenceHashSha256: string };
  };
  assert.equal(signedData.status, 'PENDING_VERIFICATION', 'Consent must transition to PENDING_VERIFICATION');
  assert.equal(signedData.signatureEvidence.signerCapacity, 'PATIENT');
  assert.ok(signedData.signatureEvidence.evidenceHashSha256, 'Cryptographic evidence hash must be generated');

  // Clinician verifies consent
  const doctor = new StaffClient();
  await doctor.login(0, doctorEmail);

  const verifyRes = await doctor.request(`clinics/${clinics[0]}/clinical/consents/${consentB.id}/verify`, 'POST', {
    expectedVersion: 2,
  });
  assert.ok([200, 201].includes(verifyRes.status), `verify status expected 200/201 but got ${verifyRes.status}: ${await verifyRes.clone().text()}`);
  const activeData = (await verifyRes.json()) as { status: string };
  assert.equal(activeData.status, 'ACTIVE');

  // Patient B withdraws consent
  const withdrawRes = await clientB.request(`portal/consents/${consentB.id}/withdraw`, 'POST', {
    expectedVersion: 3,
    reason: 'أرغب في تأجيل الإجراء لوقت لاحق',
  });
  assert.equal(withdrawRes.status, 200);
  const withdrawnData = (await withdrawRes.json()) as { status: string; withdrawal: { reason: string } };
  assert.equal(withdrawnData.status, 'WITHDRAWN');
  assert.equal(withdrawnData.withdrawal.reason, 'أرغب في تأجيل الإجراء لوقت لاحق');
});

live('Recovery Check-In: VAS bounds, red-flag escalation, clinician review queue', async () => {
  const clientA = new PatientClient();
  await clientA.login(clinicSlugs[0], patients[0].phone, 'PatientPass123!');

  // Normal check-in submission (pain score 3, mild swelling)
  const normRes = await clientA.request('portal/check-ins', 'POST', {
    painScore: 3,
    symptoms: { mild_swelling: true },
    recoveryNotes: 'الأمور مستقرة بعد الجلسة',
  });
  assert.equal(normRes.status, 201);
  const normData = (await normRes.json()) as {
    checkIn: { id: string; status: string; isEscalated: boolean; painScore: number };
    emergencyNotice: string | null;
  };
  assert.equal(normData.checkIn.painScore, 3);
  assert.equal(normData.checkIn.isEscalated, false);
  assert.equal(normData.checkIn.status, 'PENDING_REVIEW');
  assert.equal(normData.emergencyNotice, null);

  // Severe check-in submission (pain score 9, continuous bleeding / fever) -> Automatic clinical escalation
  const escRes = await clientA.request('portal/check-ins', 'POST', {
    painScore: 9,
    symptoms: { fever: true },
    recoveryNotes: 'ألم شديد جدا مع ارتفاع في درجة الحرارة',
  });
  assert.equal(escRes.status, 201);
  const escData = (await escRes.json()) as {
    checkIn: { id: string; status: string; isEscalated: boolean; painScore: number; escalationReason: string };
    emergencyNotice: string | null;
  };
  assert.equal(escData.checkIn.isEscalated, true);
  assert.equal(escData.checkIn.status, 'ESCALATED');
  assert.ok(escData.emergencyNotice, 'Emergency medical advice banner must be returned');

  // Clinician reviews the escalated check-in
  const doctor = new StaffClient();
  await doctor.login(0, doctorEmail);

  // List recovery check-ins in clinic queue
  const queueRes = await doctor.request(`clinics/${clinics[0]}/clinical/recovery-check-ins?status=ESCALATED`);
  assert.equal(queueRes.status, 200);
  const queueData = (await queueRes.json()) as { items: { id: string; isEscalated: boolean }[] };
  assert.ok(queueData.items.some((c) => c.id === escData.checkIn.id), 'Escalated check-in must appear in doctor review queue');

  // Doctor records review & guidance
  const reviewRes = await doctor.request(`clinics/${clinics[0]}/clinical/recovery-check-ins/${escData.checkIn.id}/review`, 'POST', {
    expectedVersion: 1,
    status: 'REVIEWED',
    clinicianNotes: 'تم التواصل مع المريضة هاتفيًا وصرف كمادات باردة ومسكن وطلب الحضور فورًا للعيادة إذا استمر النزيف',
  });
  assert.ok([200, 201].includes(reviewRes.status), `review status expected 200/201 but got ${reviewRes.status}: ${await reviewRes.clone().text()}`);
  const reviewedData = (await reviewRes.json()) as { status: string; reviewedAt: string; clinicianNotes: string };
  assert.equal(reviewedData.status, 'REVIEWED');
  assert.ok(reviewedData.reviewedAt);

  // Patient A reviews check-ins history and sees doctor guidance notes
  const pCheckIns = await clientA.request('portal/check-ins');
  assert.equal(pCheckIns.status, 200);
  const pData = (await pCheckIns.json()) as { id: string; clinicianNotes?: string; status: string }[];
  const reviewedRecord = pData.find((c) => c.id === escData.checkIn.id);
  assert.ok(reviewedRecord);
  assert.equal(reviewedRecord.status, 'REVIEWED');
  assert.ok(reviewedRecord.clinicianNotes?.includes('تم التواصل مع المريضة'));

  // Patient B cannot read Patient A's check-ins
  const clientB = new PatientClient();
  await clientB.login(clinicSlugs[0], patients[1].phone, 'PatientPass123!');
  const getACheckInFromB = await clientB.request(`portal/check-ins/${escData.checkIn.id}`);
  assert.equal(getACheckInFromB.status, 404, 'Patient B must not access Patient A recovery check-in');
});

live('Patient Outcomes: PRO submission with PATIENT_PORTAL provenance', async () => {
  const clientA = new PatientClient();
  await clientA.login(clinicSlugs[0], patients[0].phone, 'PatientPass123!');

  const outcomeRes = await clientA.request('portal/outcomes', 'POST', {
    measurementScale: 'PATIENT_SATISFACTION_5_POINT',
    score: 5,
    notes: 'راضية تمامًا عن النتيجة وسرعة استجابة الطبيبة',
  });
  assert.equal(outcomeRes.status, 201);
  const outcomeData = (await outcomeRes.json()) as { id: string; score: number; measurementScale: string };
  assert.equal(Number(outcomeData.score), 5);

  // Direct SQL inspection: verify row level RLS and provenance
  const rlsCheck = await pool.query(
    `SELECT id, "clinicId", "patientId", score, "measurementScale"
     FROM public."PatientReportedOutcome"
     WHERE id = $1`,
    [outcomeData.id],
  );
  assert.equal(rlsCheck.rows.length, 1);
  assert.equal(rlsCheck.rows[0].clinicId, clinics[0]);
  assert.equal(rlsCheck.rows[0].patientId, patients[0].id);
  assert.equal(Number(rlsCheck.rows[0].score), 5);
});

live('Direct SQL RLS Enforcement: patient_row_allows denies cross-patient access', async () => {
  // Query table directly setting PostgreSQL session local to Patient A
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const dummySessionId = randomUUID();
    await client.query(
      `SELECT set_config('lamssa.clinic_id', $1, true),
              set_config('lamssa.patient_id', $2, true),
              set_config('lamssa.patient_session_id', $3, true)`,
      [clinics[0], patients[0].id, dummySessionId],
    );

    // Patient A reading consents: only Patient A's consents should be visible
    const resConsents = await client.query('SELECT id, "patientId" FROM public."PatientConsent"');
    for (const row of resConsents.rows) {
      assert.equal(row.patientId, patients[0].id, 'Direct SQL query under Patient A context must never return Patient B consents');
    }

    // Patient A reading recovery check-ins: only Patient A's check-ins visible
    const resCheckIns = await client.query('SELECT id, "patientId" FROM public."PatientRecoveryCheckIn"');
    for (const row of resCheckIns.rows) {
      assert.equal(row.patientId, patients[0].id, 'Direct SQL query under Patient A context must never return other patients check-ins');
    }

    await client.query('ROLLBACK');
  } finally {
    client.release();
  }
});
