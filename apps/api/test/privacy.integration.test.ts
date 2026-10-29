import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { after, before, test } from 'node:test';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { config } from 'dotenv';
import { configureApp } from '../src/configure-app.js';
import type { PrismaClient } from '../src/generated/prisma/client.js';
import { fixtureDatabase } from './database-fixtures.js';
import { base32Decode, generateTotp } from '../src/auth/totp.js';
import { provisionUser } from '../scripts/provision-user.js';
import { sanitizeFormulaField, sanitizeObjectForExport } from '../src/privacy/privacy.sanitize.js';

config({ path: resolve(import.meta.dirname, '../../../../.env'), quiet: true });
const testUrl = process.env.TEST_DATABASE_URL;
const enabled = Boolean(testUrl);
const origin = 'http://localhost:5173';
const password = randomBytes(32).toString('base64url');
const suffix = randomUUID();

// Clinic A (Owner + Admin + Doctor)
const clinicAId = randomUUID();
const slugA = `privacy-a-${suffix}`;
const ownerAEmail = `privacy-owner-a-${suffix}@example.invalid`;
const adminAEmail = `privacy-admin-a-${suffix}@example.invalid`;
const doctorAEmail = `privacy-doctor-a-${suffix}@example.invalid`;

// Clinic B (for cross-clinic isolation tests)
const clinicBId = randomUUID();
const slugB = `privacy-b-${suffix}`;
const ownerBEmail = `privacy-owner-b-${suffix}@example.invalid`;

let app: INestApplication, prisma: PrismaClient, base: string;

class Browser {
  cookies = new Map<string, string>();
  csrf = '';
  async request(path: string, method = 'GET', body?: unknown, headers: Record<string, string> = {}) {
    const response = await fetch(`${base}/api/v1/${path}`, {
      method,
      headers: {
        Cookie: [...this.cookies].map(([key, value]) => `${key}=${value}`).join('; '),
        ...(method !== 'GET' ? { Origin: origin, 'Content-Type': 'application/json', 'X-CSRF-Token': this.csrf } : {}),
        ...headers,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(';')[0],
        index = pair.indexOf('=');
      this.cookies.set(pair.slice(0, index), pair.slice(index + 1));
    }
    return response;
  }
  async login(email: string, pass = password) {
    const csrfRes = await this.request('auth/csrf');
    this.csrf = (await csrfRes.json()).csrfToken;
    const response = await this.request('auth/login', 'POST', { email, password: pass });
    if (response.ok) {
      const data = (await response.clone().json()) as any;
      if (data?.csrfToken) this.csrf = data.csrfToken;
    }
    return response;
  }
  async select(cId: string) {
    const response = await this.request('auth/clinic', 'POST', { clinicId: cId });
    if (response.ok) {
      const data = (await response.clone().json()) as any;
      if (data?.csrfToken) this.csrf = data.csrfToken;
    }
    return response;
  }
}

const live = enabled ? test : test.skip;

before(async () => {
  if (!enabled) return;
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = testUrl;
  process.env.AUTH_CSRF_SECRET = randomBytes(48).toString('base64url');
  process.env.CORS_ORIGINS = origin;
  process.env.AUTH_LOGIN_ACCOUNT_LIMIT = '100';
  process.env.AUTH_LOGIN_IP_LIMIT = '10000';

  prisma = fixtureDatabase();

  // Create Clinic A
  await prisma.clinic.create({
    data: {
      id: clinicAId,
      legalName: `Privacy Clinic A ${suffix}`,
      displayName: `عيادة الخصوصية أ ${suffix}`,
      slug: slugA,
      currency: 'SAR',
      timezone: 'Asia/Riyadh',
      mfaPolicy: 'OWNER_ONLY',
      branding: { create: { primaryColor: '#7854D9' } },
    },
  });

  // Create Clinic B
  await prisma.clinic.create({
    data: {
      id: clinicBId,
      legalName: `Privacy Clinic B ${suffix}`,
      displayName: `عيادة الخصوصية ب ${suffix}`,
      slug: slugB,
      currency: 'SAR',
      timezone: 'Asia/Riyadh',
      mfaPolicy: 'OPTIONAL',
      branding: { create: { primaryColor: '#7854D9' } },
    },
  });

  await provisionUser(prisma, {
    email: ownerAEmail,
    name: 'Privacy Owner A',
    password,
    memberships: [{ clinicSlug: slugA, role: 'CLINIC_OWNER' }],
  });

  await provisionUser(prisma, {
    email: adminAEmail,
    name: 'Privacy Admin A',
    password,
    memberships: [{ clinicSlug: slugA, role: 'CLINIC_ADMIN' }],
  });

  await provisionUser(prisma, {
    email: doctorAEmail,
    name: 'Privacy Doctor A',
    password,
    memberships: [{ clinicSlug: slugA, role: 'DOCTOR' }],
  });

  await provisionUser(prisma, {
    email: ownerBEmail,
    name: 'Privacy Owner B',
    password,
    memberships: [{ clinicSlug: slugB, role: 'CLINIC_OWNER' }],
  });

  const { AppModule } = await import('../src/app.module.js');
  const fixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = fixture.createNestApplication({ logger: false });
  configureApp(app);
  await app.listen(0, '127.0.0.1');
  base = await app.getUrl();
});

after(async () => {
  if (app) await app.close();
  if (prisma) await prisma.$disconnect();
});

test('Formula injection sanitization utility protects dangerous characters', () => {
  assert.equal(sanitizeFormulaField('=cmd|"/C calc"!A0'), '\'=cmd|"/C calc"!A0');
  assert.equal(sanitizeFormulaField('+12345'), '\'+12345');
  assert.equal(sanitizeFormulaField('-500'), '\'-500');
  assert.equal(sanitizeFormulaField('@SUM(A1:A10)'), '\'@SUM(A1:A10)');
  assert.equal(sanitizeFormulaField('\tTabbed'), '\'\tTabbed');
  assert.equal(sanitizeFormulaField('Normal Patient Name'), 'Normal Patient Name');

  // Advanced evasions: leading whitespace, control characters, pipes, and percents
  assert.equal(sanitizeFormulaField('   =cmd|"/C calc"!A0'), '\'   =cmd|"/C calc"!A0');
  assert.equal(sanitizeFormulaField('  +999'), '\'  +999');
  assert.equal(sanitizeFormulaField(' \t@DangerousFormula'), '\' \t@DangerousFormula');
  assert.equal(sanitizeFormulaField('\r\n-50'), '\'\r\n-50');
  assert.equal(sanitizeFormulaField('|calc'), '\'|calc');
  assert.equal(sanitizeFormulaField('   %SYSTEM%'), '\'   %SYSTEM%');
  assert.equal(sanitizeFormulaField('\x00=calc'), '\'\x00=calc');

  const nested = {
    name: '=Dangerous',
    whitespaceName: '   =IndentedDangerous',
    profile: {
      notes: '+MaliciousFormula',
      count: 42,
    },
    tags: ['safe', '@FormulaTag', '  |PipeFormula'],
  };
  const sanitized = sanitizeObjectForExport(nested);
  assert.equal(sanitized.name, '\'=Dangerous');
  assert.equal(sanitized.whitespaceName, '\'   =IndentedDangerous');
  assert.equal(sanitized.profile.notes, '\'+MaliciousFormula');
  assert.equal(sanitized.profile.count, 42);
  assert.equal(sanitized.tags[0], 'safe');
  assert.equal(sanitized.tags[1], '\'@FormulaTag');
  assert.equal(sanitized.tags[2], '\'  |PipeFormula');
});

live('Privacy rights request lifecycle: create, list, review decision, and audit', async () => {
  const adminClient = new Browser();
  await adminClient.login(adminAEmail);
  await adminClient.select(clinicAId);

  // 1. Create a privacy request (CORRECTION)
  const createRes = await adminClient.request(`clinics/${clinicAId}/privacy/requests`, 'POST', {
    patientName: 'سارة عبد الله',
    patientContact: 'sara@example.invalid',
    requestType: 'CORRECTION',
    subject: 'طلب تصحيح العنوان الوطني في السجل الإداري',
    notes: 'المريض قدّم وثيقة تثبت العنوان الجديد',
  });
  assert.equal(createRes.status, 201);
  const created = await createRes.json();
  assert.equal(created.patientName, 'سارة عبد الله');
  assert.equal(created.requestType, 'CORRECTION');
  assert.equal(created.status, 'OPEN');
  assert.equal(created.version, 1);

  // 2. List requests
  const listRes = await adminClient.request(`clinics/${clinicAId}/privacy/requests?status=OPEN`);
  assert.equal(listRes.status, 200);
  const listData = await listRes.json();
  assert(listData.items.some((r: { id: string }) => r.id === created.id));

  // 3. Decide request (Approve with documented reason)
  const decideRes = await adminClient.request(`clinics/${clinicAId}/privacy/requests/${created.id}/decision`, 'PATCH', {
    status: 'APPROVED',
    decisionReason: 'تم التحقق من الوثيقة الثبوتية وتحديث العنوان في ملف المريض',
    expectedVersion: 1,
  });
  assert.equal(decideRes.status, 200);
  const updated = await decideRes.json();
  assert.equal(updated.status, 'APPROVED');
  assert.equal(updated.version, 2);
  assert(updated.decisionAt !== null);

  // 4. Stale version conflict
  const staleRes = await adminClient.request(`clinics/${clinicAId}/privacy/requests/${created.id}/decision`, 'PATCH', {
    status: 'COMPLETED',
    decisionReason: 'إكمال الطلب',
    expectedVersion: 1, // Stale!
  });
  assert.equal(staleRes.status, 409);

  // 5. Audit event verification
  const auditRes = await adminClient.request(`clinics/${clinicAId}/audit/events?category=PRIVACY`);
  assert.equal(auditRes.status, 200);
  const auditData = await auditRes.json();
  assert(auditData.events.some((e: { action: string }) => e.action === 'privacy.request.create'));
  assert(auditData.events.some((e: { action: string }) => e.action === 'privacy.request.decision'));
});

live('Cross-clinic isolation prevents Clinic B from reading or modifying Clinic A privacy requests', async () => {
  // Admin in Clinic A creates a request
  const adminA = new Browser();
  await adminA.login(adminAEmail);
  await adminA.select(clinicAId);
  const reqRes = await adminA.request(`clinics/${clinicAId}/privacy/requests`, 'POST', {
    patientName: 'مريض سري',
    requestType: 'ACCESS',
    subject: 'طلب فحص السجل الإداري',
  });
  const reqA = await reqRes.json();

  // Owner in Clinic B tries to read it
  const ownerB = new Browser();
  await ownerB.login(ownerBEmail);
  await ownerB.select(clinicBId);

  // Attempt reading Clinic A's request with Clinic B's context
  const crossGet = await ownerB.request(`clinics/${clinicBId}/privacy/requests/${reqA.id}`);
  assert.equal(crossGet.status, 404, 'Must return safe 404 for cross-clinic request ID');

  // Attempt reading directly from Clinic A route
  const forbiddenRoute = await ownerB.request(`clinics/${clinicAId}/privacy/requests/${reqA.id}`);
  assert([403, 404].includes(forbiddenRoute.status), 'Must return 403 or 404 for unauthorized clinic URL');
});

live('Role boundaries: CLINIC_ADMIN cannot export data; DOCTOR is denied all privacy management', async () => {
  // Admin A has privacy.requests.manage but NOT privacy.export
  const adminA = new Browser();
  await adminA.login(adminAEmail);
  await adminA.select(clinicAId);

  const exportAttempt = await adminA.request(`clinics/${clinicAId}/privacy/exports`, 'POST', {
    patientId: randomUUID(),
    purpose: 'تصدير غير مصرح به',
  });
  assert.equal(exportAttempt.status, 403, 'CLINIC_ADMIN must be denied privacy.export');

  // Doctor A has neither
  const docA = new Browser();
  await docA.login(doctorAEmail);
  await docA.select(clinicAId);

  const docList = await docA.request(`clinics/${clinicAId}/privacy/requests`);
  assert.equal(docList.status, 403, 'DOCTOR must be denied privacy.requests.read');
});

live('Data export requires MFA step-up, generates secure expiring file, and supports revocation', async () => {
  // 1. First enroll MFA for Owner A
  const ownerA = new Browser();
  await ownerA.login(ownerAEmail);
  await ownerA.select(clinicAId);

  const setupRes = await ownerA.request('auth/mfa/setup', 'POST', { password });
  assert.equal(setupRes.status, 200, await setupRes.clone().text());
  const setupData = await setupRes.json();
  const secretBytes = base32Decode(setupData.base32Secret);
  const otp = generateTotp(secretBytes);
  const verifyRes = await ownerA.request('auth/mfa/verify-setup', 'POST', { code: otp });
  assert.equal(verifyRes.status, 200);

  // 2. Register a real patient in Clinic A
  const patientRes = await ownerA.request(`clinics/${clinicAId}/patients`, 'POST', {
    fullName: '=المريض المحمي',
    phone: '+966501234567',
    email: 'patient-privacy@example.invalid',
  });
  assert.equal(patientRes.status, 201);
  const patient = await patientRes.json();

  // 3. Step-up authorization using an unused recovery code
  const stepUpRes = await ownerA.request('auth/mfa/step-up', 'POST', { recoveryCode: setupData.recoveryCodes[0] });
  assert.equal(stepUpRes.status, 200);

  // 4. Create Export with Step-Up session
  const expRes = await ownerA.request(`clinics/${clinicAId}/privacy/exports`, 'POST', {
    patientId: patient.id,
    purpose: 'تسليم نسخة رسمية من السجل الإداري والمالي للمريض',
  });
  assert.equal(expRes.status, 201);
  const expData = await expRes.json();
  assert(expData.exportId);
  assert(expData.downloadToken);
  assert.equal(expData.maxDownloads, 3);

  // 5. Download export using secure token
  const downloadRes = await ownerA.request(
    `clinics/${clinicAId}/privacy/exports/${expData.exportId}/download?token=${expData.downloadToken}`,
  );
  assert.equal(downloadRes.status, 200);
  assert.equal(downloadRes.headers.get('content-type'), 'application/json');
  const payload = await downloadRes.json();
  assert.equal(payload.patient.fullName, '\'=المريض المحمي', 'Formula injection prefix must be present');
  assert.equal(payload.patient.patientNumber, patient.patientNumber);

  // 6. Tampered token fails
  const badDownload = await ownerA.request(
    `clinics/${clinicAId}/privacy/exports/${expData.exportId}/download?token=wrong-token-value-0000000000000000`,
  );
  assert.equal(badDownload.status, 403);

  // 7. Legal hold blocks export generation
  const holdReqRes = await ownerA.request(`clinics/${clinicAId}/privacy/requests`, 'POST', {
    patientName: 'مريض خاضع لحجز نظامي',
    requestType: 'EXPORT',
    subject: 'طلب معلق بانتظار استكمال الإجراءات القضائية',
  });
  assert.equal(holdReqRes.status, 201);
  const createdHoldReq = await holdReqRes.json();

  const placeHoldRes = await ownerA.request(`clinics/${clinicAId}/privacy/requests/${createdHoldReq.id}/decision`, 'PATCH', {
    status: 'HELD',
    decisionReason: 'تعليق مؤقت بموجب أمر قضائي',
    legalHold: true,
    legalHoldReason: 'نزاع مالي قيد التحقيق القضائي',
    expectedVersion: 1,
  });
  assert.equal(placeHoldRes.status, 200);
  const holdReq = await placeHoldRes.json();
  assert.equal(holdReq.legalHold, true);

  const blockedExpRes = await ownerA.request(`clinics/${clinicAId}/privacy/exports`, 'POST', {
    patientId: patient.id,
    privacyRequestId: holdReq.id,
    purpose: 'محاولة تصدير ملف عليه حجز قانوني',
  });
  assert.equal(blockedExpRes.status, 403, 'Legal hold MUST block export creation');

  // 8. Bounded download exhaustion test: 2nd and 3rd download succeed; 4th exceeds maxDownloads
  const dl2 = await ownerA.request(
    `clinics/${clinicAId}/privacy/exports/${expData.exportId}/download?token=${expData.downloadToken}`,
  );
  assert.equal(dl2.status, 200);

  const dl3 = await ownerA.request(
    `clinics/${clinicAId}/privacy/exports/${expData.exportId}/download?token=${expData.downloadToken}`,
  );
  assert.equal(dl3.status, 200);

  const dl4Exceeded = await ownerA.request(
    `clinics/${clinicAId}/privacy/exports/${expData.exportId}/download?token=${expData.downloadToken}`,
  );
  assert.equal(dl4Exceeded.status, 403, 'Exceeding maxDownloads MUST fail with 403');

  // 9. Revoke export (re-test revocation on a fresh active export)
  const freshExpRes = await ownerA.request(`clinics/${clinicAId}/privacy/exports`, 'POST', {
    patientId: patient.id,
    purpose: 'تصدير قابل للإلغاء',
  });
  const freshExp = await freshExpRes.json();

  const revokeRes = await ownerA.request(`clinics/${clinicAId}/privacy/exports/${freshExp.exportId}/revoke`, 'PATCH', {
    reason: 'تم تسليم الملف للمريض بنجاح',
  });
  assert.equal(revokeRes.status, 200);
  const revoked = await revokeRes.json();
  assert.equal(revoked.status, 'REVOKED');

  // 10. Subsequent download after revocation is blocked
  const blockedDownload = await ownerA.request(
    `clinics/${clinicAId}/privacy/exports/${freshExp.exportId}/download?token=${freshExp.downloadToken}`,
  );
  assert.equal(blockedDownload.status, 403);
});

live('Retention policy rejects sub-minimum configurations and dry-run report modifies no data', async () => {
  const adminA = new Browser();
  await adminA.login(adminAEmail);
  await adminA.select(clinicAId);

  // 1. Attempting audit retention < 90 days fails closed
  const badAudit = await adminA.request(`clinics/${clinicAId}/privacy/retention-policy`, 'PATCH', {
    auditEventDays: 30, // Illegal! Minimum is 90
  });
  assert.equal(badAudit.status, 400);

  // 2. Valid policy update (dryRunOnly remains true)
  const validPolicy = await adminA.request(`clinics/${clinicAId}/privacy/retention-policy`, 'PATCH', {
    auditEventDays: 180,
    backupRetentionDays: 60,
    patientRecordDays: 365,
    appointmentDays: 180,
    exportRetentionDays: 7,
  });
  assert.equal(validPolicy.status, 200);
  const pol = await validPolicy.json();
  assert.equal(pol.auditEventDays, 180);
  assert.equal(pol.dryRunOnly, true, 'Dry-run only MUST remain true');

  // 3. Execute dry-run report
  const dryRunRes = await adminA.request(`clinics/${clinicAId}/privacy/retention-dry-run`, 'POST');
  assert.equal(dryRunRes.status, 200);
  const report = await dryRunRes.json();
  assert.equal(report.dryRunOnly, true);
  assert.equal(typeof report.eligible.patients, 'number');
  assert.equal(typeof report.eligible.appointments, 'number');
  assert.equal(typeof report.eligible.auditEvents, 'number');
  assert(report.note.includes('Dry-run'));
});
