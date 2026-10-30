import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import pg from 'pg';
import sharp from 'sharp';
import { configureApp } from '../src/configure-app.js';
import { provisionUser } from '../scripts/provision-user.js';
import { fixtureDatabase, testUrls } from './database-fixtures.js';

const enabled = Boolean(process.env.TEST_DATABASE_URL);
const live = (name: string, fn: () => Promise<void>) => test(`clinical-photo: ${name}`, { skip: !enabled }, fn);

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
].map((x) => `${x}-photo-${suffix}@example.invalid`);

let owner: ReturnType<typeof fixtureDatabase>;
let pool: pg.Pool;
let app: INestApplication;
let base: string;

let validConsentId: string;
let procedureConsentId: string;
let unverifiedConsentId: string;

class Browser {
  cookies = new Map<string, string>();
  csrf = '';

  async request(path: string, method = 'GET', body?: unknown, headers: Record<string, string> = {}) {
    const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
    const res = await fetch(`${base}/api/v1/${path}`, {
      method,
      headers: {
        Cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; '),
        ...(method === 'GET' ? {} : isFormData ? { Origin: origin, 'X-CSRF-Token': this.csrf } : { Origin: origin, 'Content-Type': 'application/json', 'X-CSRF-Token': this.csrf }),
        ...headers,
      },
      ...(body === undefined ? {} : isFormData ? { body: body as any } : { body: JSON.stringify(body) }),
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
        slug: `photo-${i}-${suffix}`,
        legalName: 'عيادة سريرية للصور',
        displayName: 'عيادة سريرية للصور',
        currency: 'YER',
        branding: { create: {} },
      },
    });

    await owner.patient.create({
      data: {
        id: patients[i],
        clinicId: id,
        patientNumber: `P-${String(i + 100000).padStart(6, '0')}`,
        fullName: 'مريض تجربة التصوير',
        searchName: 'مريض تجربة التصوير',
      },
    });
  }

  const roles = [
    'DOCTOR',
    'DOCTOR',
    'CLINIC_OWNER',
    'CLINIC_ADMIN',
    'RECEPTIONIST',
    'ACCOUNTANT',
  ] as const;

  for (const [i, email] of accounts.entries()) {
    const u = await provisionUser(owner, {
      email,
      name: `طبيب تجربة ${i}`,
      password,
      memberships: [{ clinicSlug: `photo-0-${suffix}`, role: roles[i] }],
    });
    users.push(u.id);
  }

  // Doctor B belongs to clinic 1
  await owner.clinicMembership.create({
    data: {
      clinicId: clinics[1],
      userId: users[1],
      role: 'DOCTOR',
      status: 'ACTIVE',
    },
  });

  const docMembership = await owner.clinicMembership.findFirstOrThrow({
    where: { clinicId: clinics[0], userId: users[0] },
  });

  // Create photography template
  const photoTemplate = await owner.consentTemplate.create({
    data: {
      clinicId: clinics[0],
      purpose: 'CLINICAL_PHOTOGRAPHY',
      title: 'نموذج موافقة التصوير السريري',
    },
  });

  const photoVer = await owner.consentTemplateVersion.create({
    data: {
      clinicId: clinics[0],
      templateId: photoTemplate.id,
      versionNumber: 1,
      status: 'PUBLISHED',
      titleAr: 'إقرار موافقة التصوير السريري الطبي',
      bodyAr: 'أوافق على التقاط صور سريرية طبية داخل ملفي الطبي لمتابعة العلاج.',
      risksTextAr: 'حفظ الصور مشفرة في السجل الطبي السري.',
      alternativesTextAr: 'الرفض لا يؤثر على تقديم الرعاية الطبية.',
      contentDigestSha256: randomBytes(32).toString('hex'),
      publishedAt: new Date(),
      publishedByMembershipId: docMembership.id,
    },
  });

  // Create active verified CLINICAL_PHOTOGRAPHY consent
  const photoConsent = await owner.patientConsent.create({
    data: {
      clinicId: clinics[0],
      patientId: patients[0],
      templateVersionId: photoVer.id,
      preparedByMembershipId: docMembership.id,
      purpose: 'CLINICAL_PHOTOGRAPHY',
      status: 'ACTIVE',
      validFrom: new Date(),
      expiresAt: new Date(Date.now() + 365 * 24 * 3600 * 1000),
      verifiedAt: new Date(),
      verifiedByMembershipId: docMembership.id,
    },
  });
  validConsentId = photoConsent.id;

  // Create PROCEDURE consent (must NOT be accepted for clinical photography)
  const procTemplate = await owner.consentTemplate.create({
    data: {
      clinicId: clinics[0],
      purpose: 'PROCEDURE',
      title: 'نموذج إجراء علاجي',
    },
  });

  const procVer = await owner.consentTemplateVersion.create({
    data: {
      clinicId: clinics[0],
      templateId: procTemplate.id,
      versionNumber: 1,
      status: 'PUBLISHED',
      titleAr: 'موافقة إجراء',
      bodyAr: 'موافقة إجراء سريري معتمد للعمليات التجميلية',
      risksTextAr: 'مخاطر الإجراء الموضعية المحتملة',
      alternativesTextAr: 'البدائل المتاحة للإجراء العلاجي',
      contentDigestSha256: randomBytes(32).toString('hex'),
      publishedAt: new Date(),
      publishedByMembershipId: docMembership.id,
    },
  });

  const procConsent = await owner.patientConsent.create({
    data: {
      clinicId: clinics[0],
      patientId: patients[0],
      templateVersionId: procVer.id,
      preparedByMembershipId: docMembership.id,
      purpose: 'PROCEDURE',
      status: 'ACTIVE',
      validFrom: new Date(),
      verifiedAt: new Date(),
      verifiedByMembershipId: docMembership.id,
    },
  });
  procedureConsentId = procConsent.id;

  // Create unverified CLINICAL_PHOTOGRAPHY consent (DRAFT status)
  const unverifiedConsent = await owner.patientConsent.create({
    data: {
      clinicId: clinics[0],
      patientId: patients[0],
      templateVersionId: photoVer.id,
      preparedByMembershipId: docMembership.id,
      purpose: 'CLINICAL_PHOTOGRAPHY',
      status: 'DRAFT',
    },
  });
  unverifiedConsentId = unverifiedConsent.id;
});

after(async () => {
  if (owner) {
    try {
      await owner.$executeRawUnsafe('ALTER TABLE public."PhotoAnnotation" DISABLE TRIGGER photo_annotation_guard').catch(() => {});
      await owner.$executeRawUnsafe('ALTER TABLE public."PhotoComparisonGroup" DISABLE TRIGGER photo_comparison_guard').catch(() => {});
      await owner.$executeRawUnsafe('ALTER TABLE public."ClinicalPhoto" DISABLE TRIGGER clinical_photo_guard').catch(() => {});
      await owner.$executeRawUnsafe('ALTER TABLE public."ClinicalPhotoSession" DISABLE TRIGGER clinical_photo_session_guard').catch(() => {});
      await owner.$executeRawUnsafe('ALTER TABLE public."PatientConsent" DISABLE TRIGGER patient_consent_guard').catch(() => {});
      await owner.$executeRawUnsafe('ALTER TABLE public."ConsentTemplateVersion" DISABLE TRIGGER consent_template_version_guard').catch(() => {});

      await owner.photoAnnotation.deleteMany({ where: { clinicId: { in: clinics } } });
      await owner.photoComparisonGroup.deleteMany({ where: { clinicId: { in: clinics } } });
      await owner.clinicalPhoto.deleteMany({ where: { clinicId: { in: clinics } } });
      await owner.clinicalPhotoSession.deleteMany({ where: { clinicId: { in: clinics } } });
      await owner.patientConsent.deleteMany({ where: { clinicId: { in: clinics } } });
      await owner.consentTemplateVersion.deleteMany({ where: { clinicId: { in: clinics } } });
      await owner.consentTemplate.deleteMany({ where: { clinicId: { in: clinics } } });
      await owner.patient.deleteMany({ where: { clinicId: { in: clinics } } });
      await owner.clinicMembership.deleteMany({ where: { clinicId: { in: clinics } } });
      await owner.session.deleteMany({ where: { userId: { in: users } } });
      await owner.user.deleteMany({ where: { id: { in: users } } });
      await owner.clinic.deleteMany({ where: { id: { in: clinics } } });
    } catch {}
    finally {
      await owner.$executeRawUnsafe('ALTER TABLE public."PhotoAnnotation" ENABLE TRIGGER photo_annotation_guard').catch(() => {});
      await owner.$executeRawUnsafe('ALTER TABLE public."PhotoComparisonGroup" ENABLE TRIGGER photo_comparison_guard').catch(() => {});
      await owner.$executeRawUnsafe('ALTER TABLE public."ClinicalPhoto" ENABLE TRIGGER clinical_photo_guard').catch(() => {});
      await owner.$executeRawUnsafe('ALTER TABLE public."ClinicalPhotoSession" ENABLE TRIGGER clinical_photo_session_guard').catch(() => {});
      await owner.$executeRawUnsafe('ALTER TABLE public."PatientConsent" ENABLE TRIGGER patient_consent_guard').catch(() => {});
      await owner.$executeRawUnsafe('ALTER TABLE public."ConsentTemplateVersion" ENABLE TRIGGER consent_template_version_guard').catch(() => {});
    }
  }
  if (app) await app.close();
  if (pool) await pool.end();
  if (owner) await owner.$disconnect();
});

live('doctor can create photo session under active verified photography consent; other purposes rejected', async () => {
  const b = await new Browser().login(0);

  // Rejected with PROCEDURE consent
  const rProc = await b.request(b.path(0, '/photo-sessions'), 'POST', {
    patientId: patients[0],
    consentId: procedureConsentId,
    sessionDate: new Date().toISOString(),
    notes: 'جلسة محاولة بموافقة إجراء',
  });
  assert.equal(rProc.status, 403);

  // Rejected with unverified consent
  const rUnver = await b.request(b.path(0, '/photo-sessions'), 'POST', {
    patientId: patients[0],
    consentId: unverifiedConsentId,
    sessionDate: new Date().toISOString(),
  });
  assert.equal(rUnver.status, 403);

  // Success with valid CLINICAL_PHOTOGRAPHY consent
  const rSuccess = await b.request(b.path(0, '/photo-sessions'), 'POST', {
    patientId: patients[0],
    consentId: validConsentId,
    sessionDate: new Date().toISOString(),
    notes: 'جلسة توثيق سريري قبل الإجراء',
  });
  assert.equal(rSuccess.status, 201);
  const session = (await rSuccess.json()) as { id: string; patientId: string };
  assert.ok(session.id);
  assert.equal(session.patientId, patients[0]);
});

live('photo upload normalizes WebP, generates thumbnail, encrypts at rest, and streams decrypted WebP', async () => {
  const b = await new Browser().login(0);

  // Create session
  const rSession = await b.request(b.path(0, '/photo-sessions'), 'POST', {
    patientId: patients[0],
    consentId: validConsentId,
    sessionDate: new Date().toISOString(),
  });
  const session = (await rSession.json()) as { id: string };

  // Create raw PNG image
  const rawPng = await sharp({
    create: {
      width: 640,
      height: 480,
      channels: 3,
      background: { r: 230, g: 190, b: 170 },
    },
  })
    .png()
    .toBuffer();

  const formData = new FormData();
  formData.append('file', new Blob([rawPng], { type: 'image/png' }), 'face-before.png');
  formData.append('category', 'BEFORE');
  formData.append('bodyArea', 'منطقة الخدين والذقن');
  formData.append('caption', 'صورة قبل بدء العلاج');

  const rUpload = await b.request(b.path(0, `/photo-sessions/${session.id}/photos`), 'POST', formData);
  assert.equal(rUpload.status, 201);
  const photo = (await rUpload.json()) as { id: string; category: string; mimeType: string; width: number; height: number };
  assert.ok(photo.id);
  assert.equal(photo.category, 'BEFORE');
  assert.equal(photo.mimeType, 'image/webp');
  assert.equal(photo.width, 640);
  assert.equal(photo.height, 480);

  // Stream thumbnail
  const rThumb = await b.request(b.path(0, `/photos/${photo.id}/thumbnail`));
  assert.equal(rThumb.status, 200);
  assert.equal(rThumb.headers.get('content-type'), 'image/webp');
  assert.equal(rThumb.headers.get('cache-control'), 'no-store, no-cache, must-revalidate, private');
  assert.equal(rThumb.headers.get('x-content-type-options'), 'nosniff');
  const thumbBytes = Buffer.from(await rThumb.arrayBuffer());
  const thumbMeta = await sharp(thumbBytes).metadata();
  assert.equal(thumbMeta.format, 'webp');
  assert.ok((thumbMeta.width ?? 0) <= 320);

  // Stream original
  const rOrig = await b.request(b.path(0, `/photos/${photo.id}/original`));
  assert.equal(rOrig.status, 200);
  assert.equal(rOrig.headers.get('content-type'), 'image/webp');
  const origBytes = Buffer.from(await rOrig.arrayBuffer());
  const origMeta = await sharp(origBytes).metadata();
  assert.equal(origMeta.format, 'webp');
  assert.equal(origMeta.width, 640);
  assert.equal(origMeta.height, 480);
});

live('non-doctor roles (owner, admin, receptionist, accountant) are forbidden from clinical photos', async () => {
  // owner = 2, admin = 3, receptionist = 4, accountant = 5
  for (const idx of [2, 3, 4, 5]) {
    const b = await new Browser().login(idx);
    const r = await b.request(b.path(0, `/patients/${patients[0]}/photo-sessions`));
    assert.equal(r.status, 403, `Role index ${idx} must be denied access to clinical photos`);
  }
});

live('cross-clinic tenant isolation strictly prevents doctor B from viewing clinic A photos', async () => {
  // Doctor A creates session and uploads photo in Clinic 0
  const bDocA = await new Browser().login(0, 0);
  const rSession = await bDocA.request(bDocA.path(0, '/photo-sessions'), 'POST', {
    patientId: patients[0],
    consentId: validConsentId,
    sessionDate: new Date().toISOString(),
  });
  const session = (await rSession.json()) as { id: string };

  const rawPng = await sharp({
    create: { width: 400, height: 400, channels: 3, background: { r: 200, g: 200, b: 200 } },
  }).png().toBuffer();

  const formData = new FormData();
  formData.append('file', new Blob([rawPng], { type: 'image/png' }), 'isolated.png');
  formData.append('category', 'BEFORE');
  formData.append('bodyArea', 'الوجه');

  const rUpload = await bDocA.request(bDocA.path(0, `/photo-sessions/${session.id}/photos`), 'POST', formData);
  const photo = (await rUpload.json()) as { id: string };

  // Doctor B belongs to Clinic 1, tries to access Clinic 0 photo
  const bDocB = await new Browser().login(1, 1);
  const rCross = await bDocB.request(`clinics/${clinics[1]}/clinical/photos/${photo.id}`);
  assert.equal(rCross.status, 404);

  const rCrossStream = await bDocB.request(`clinics/${clinics[1]}/clinical/photos/${photo.id}/original`);
  assert.equal(rCrossStream.status, 404);
});

live('photo comparison groups, annotations, and optimistic concurrency archival', async () => {
  const b = await new Browser().login(0);

  // Create session
  const rSession = await b.request(b.path(0, '/photo-sessions'), 'POST', {
    patientId: patients[0],
    consentId: validConsentId,
    sessionDate: new Date().toISOString(),
  });
  const session = (await rSession.json()) as { id: string };

  const imgBefore = await sharp({ create: { width: 300, height: 300, channels: 3, background: { r: 250, g: 150, b: 150 } } }).png().toBuffer();
  const imgAfter = await sharp({ create: { width: 300, height: 300, channels: 3, background: { r: 150, g: 250, b: 150 } } }).png().toBuffer();

  // Upload BEFORE photo
  const fdBefore = new FormData();
  fdBefore.append('file', new Blob([imgBefore], { type: 'image/png' }), 'before.png');
  fdBefore.append('category', 'BEFORE');
  fdBefore.append('bodyArea', 'الجبهة');
  const rBefore = await b.request(b.path(0, `/photo-sessions/${session.id}/photos`), 'POST', fdBefore);
  const beforePhoto = (await rBefore.json()) as { id: string; version: number };

  // Upload AFTER photo
  const fdAfter = new FormData();
  fdAfter.append('file', new Blob([imgAfter], { type: 'image/png' }), 'after.png');
  fdAfter.append('category', 'AFTER');
  fdAfter.append('bodyArea', 'الجبهة');
  const rAfter = await b.request(b.path(0, `/photo-sessions/${session.id}/photos`), 'POST', fdAfter);
  const afterPhoto = (await rAfter.json()) as { id: string };

  // Create comparison group
  const rComp = await b.request(b.path(0, `/patients/${patients[0]}/photo-comparisons`), 'POST', {
    title: 'مقارنة نضارة الجبهة قبل وبعد الإجراء',
    beforePhotoId: beforePhoto.id,
    afterPhotoId: afterPhoto.id,
    notes: 'تحسن في مرونة الجلد ونضارته',
  });
  assert.equal(rComp.status, 201);
  const comp = (await rComp.json()) as { id: string; title: string };
  assert.ok(comp.id);

  // Add annotation to beforePhoto
  const rAnnot = await b.request(b.path(0, `/photos/${beforePhoto.id}/annotations`), 'POST', {
    annotationType: 'PIN',
    geometryJson: JSON.stringify({ x: 0.5, y: 0.5 }),
    comment: 'تصبغ سطحي طفيف مستهدف بالعلاج',
  });
  assert.equal(rAnnot.status, 201);

  // List annotations
  const rAnnots = await b.request(b.path(0, `/photos/${beforePhoto.id}/annotations`));
  assert.equal(rAnnots.status, 200);
  const annotList = (await rAnnots.json()) as { items: Array<{ comment: string }> };
  assert.equal(annotList.items.length, 1);
  assert.equal(annotList.items[0].comment, 'تصبغ سطحي طفيف مستهدف بالعلاج');

  // Archive photo: version mismatch fails
  const rArchMismatch = await b.request(b.path(0, `/photos/${beforePhoto.id}/archive`), 'POST', {
    expectedVersion: 999,
    reason: 'أرشفة اختبارية',
  });
  assert.equal(rArchMismatch.status, 409);

  // Archive photo: success
  const rArchSuccess = await b.request(b.path(0, `/photos/${beforePhoto.id}/archive`), 'POST', {
    expectedVersion: beforePhoto.version,
    reason: 'تم استبدال الصورة بزاوية إضاءة أكثر وضوحاً',
  });
  assert.equal(rArchSuccess.status, 201);

  // Double archive fails with 409
  const rArchDouble = await b.request(b.path(0, `/photos/${beforePhoto.id}/archive`), 'POST', {
    expectedVersion: beforePhoto.version + 1,
    reason: 'محاولة ثانية',
  });
  assert.equal(rArchDouble.status, 409);
});

live('trigger immutability prevents raw SQL modification of photo storageKey and sha256Digest', async () => {
  const b = await new Browser().login(0);
  const rSession = await b.request(b.path(0, '/photo-sessions'), 'POST', {
    patientId: patients[0],
    consentId: validConsentId,
    sessionDate: new Date().toISOString(),
  });
  const session = (await rSession.json()) as { id: string };

  const raw = await sharp({ create: { width: 100, height: 100, channels: 3, background: { r: 100, g: 100, b: 100 } } }).png().toBuffer();
  const fd = new FormData();
  fd.append('file', new Blob([raw], { type: 'image/png' }), 'test.png');
  fd.append('category', 'BEFORE');
  fd.append('bodyArea', 'الوجه');

  const rUpload = await b.request(b.path(0, `/photo-sessions/${session.id}/photos`), 'POST', fd);
  const photo = (await rUpload.json()) as { id: string };

  // Attempt raw SQL update of storageKey via database owner connection
  await assert.rejects(
    owner.$executeRawUnsafe(`UPDATE public."ClinicalPhoto" SET "storageKey" = 'tampered/path' WHERE id = '${photo.id}'`),
    /Clinical photo master and identity are immutable/,
  );

  // Attempt raw SQL update of sha256Digest
  await assert.rejects(
    owner.$executeRawUnsafe(`UPDATE public."ClinicalPhoto" SET "sha256Digest" = 'tampered-digest' WHERE id = '${photo.id}'`),
    /Clinical photo master and identity are immutable/,
  );

  // Attempt raw SQL delete
  await assert.rejects(
    owner.$executeRawUnsafe(`DELETE FROM public."ClinicalPhoto" WHERE id = '${photo.id}'`),
    /Clinical photos cannot be deleted/,
  );
});

