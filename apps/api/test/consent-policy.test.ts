import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { permissionsFor } from '../src/auth/permissions.js';
import {
  CreateConsentTemplateDto,
  RefusePatientConsentDto,
  SignPatientConsentDto,
  WithdrawPatientConsentDto,
} from '../src/consent/consent-input.js';
import { ConsentEligibilityService } from '../src/treatments/consent-eligibility.service.js';
import { digestContent, digestEvidence } from '../src/prisma/consent.repository.js';

test('consent permissions are doctor-only and excluded from administrative, receptionist, and accountant roles', () => {
  const doctor = permissionsFor('DOCTOR');
  const consentPerms = [
    'clinical.consent-templates.read',
    'clinical.consent-templates.manage',
    'clinical.consents.read',
    'clinical.consents.prepare',
    'clinical.consents.sign',
    'clinical.consents.verify',
    'clinical.consents.withdraw',
  ] as const;

  for (const perm of consentPerms) {
    assert(doctor.includes(perm), `DOCTOR role must include ${perm}`);
  }

  for (const role of ['CLINIC_OWNER', 'CLINIC_ADMIN', 'RECEPTIONIST', 'ACCOUNTANT'] as const) {
    const rolePerms = permissionsFor(role);
    for (const perm of consentPerms) {
      assert(!rolePerms.includes(perm as any), `${role} must not possess ${perm}`);
    }
  }
});

test('consent template DTOs reject mass assignment, invalid enum values, and bounds violations', async () => {
  const valid = plainToInstance(CreateConsentTemplateDto, {
    purpose: 'PROCEDURE',
    title: 'نموذج موافقة تقشير كيميائي وهمي',
    titleAr: 'الموافقة المستنيرة لإجراء التقشير الكيميائي',
    bodyAr: 'أقر أنا الموقع أدناه بأنني تلقيت شرحاً وافياً عن إجراء التقشير الكيميائي والنتائج المتوقعة.',
    risksTextAr: 'قد يحدث احمرار مؤقت أو تقشر طفيف في الجلد.',
    alternativesTextAr: 'العلاجات الموضعية البديلة أو التقشير بالليزر.',
  });
  const validErrors = await validate(valid, { whitelist: true, forbidNonWhitelisted: true });
  assert.equal(validErrors.length, 0);

  // Rejects invalid purpose enum
  const invalidPurpose = plainToInstance(CreateConsentTemplateDto, {
    purpose: 'GENERAL_CARE',
    title: 'نموذج غير صالح',
    titleAr: 'عنوان عربي صالح',
    bodyAr: 'نص موافقة مستنيرة طويل بما فيه الكفاية',
    risksTextAr: 'المخاطر المتوقعة',
    alternativesTextAr: 'البدائل العلاجية',
  });
  assert((await validate(invalidPurpose)).length > 0);

  // Rejects short Arabic text
  const shortBody = plainToInstance(CreateConsentTemplateDto, {
    purpose: 'PROCEDURE',
    title: 'نموذج',
    titleAr: 'ع',
    bodyAr: 'قصير',
    risksTextAr: 'م',
    alternativesTextAr: 'ب',
  });
  assert((await validate(shortBody)).length > 0);

  // Rejects mass assignment
  const massAssign = plainToInstance(CreateConsentTemplateDto, {
    purpose: 'PROCEDURE',
    title: 'نموذج صالح',
    titleAr: 'عنوان عربي صالح',
    bodyAr: 'نص موافقة مستنيرة طويل بما فيه الكفاية للاختبار',
    risksTextAr: 'المخاطر المحتملة للإجراء التجميلي',
    alternativesTextAr: 'البدائل المتاحة للإجراء التجميلي',
    clinicId: randomUUID(),
    status: 'PUBLISHED',
  });
  const massErrors = await validate(massAssign, { whitelist: true, forbidNonWhitelisted: true });
  assert(massErrors.length > 0);
});

test('consent signing DTO enforces signer capacity, signature types, and min length', async () => {
  const valid = plainToInstance(SignPatientConsentDto, {
    expectedVersion: 1,
    signerCapacity: 'PATIENT',
    signerName: 'سارة أحمد محمد',
    signatureType: 'DRAWN_BASE64',
    signatureData: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  });
  assert.equal((await validate(valid, { whitelist: true, forbidNonWhitelisted: true })).length, 0);

  // Guardian signing with relationship
  const guardianValid = plainToInstance(SignPatientConsentDto, {
    expectedVersion: 1,
    signerCapacity: 'GUARDIAN',
    signerName: 'أحمد محمد علي',
    relationshipDescription: 'والد المريضة والوصي القانوني',
    signerIdentitySnapshot: '1098765432',
    signatureType: 'TYPED_CONFIRMATION',
    signatureData: 'أوافق بصفتي ولي أمر المريضة',
  });
  assert.equal((await validate(guardianValid, { whitelist: true, forbidNonWhitelisted: true })).length, 0);

  // Rejects invalid signer capacity
  const invalidCapacity = plainToInstance(SignPatientConsentDto, {
    expectedVersion: 1,
    signerCapacity: 'FRIEND',
    signerName: 'سارة',
    signatureType: 'DRAWN_BASE64',
    signatureData: 'abcd',
  });
  assert((await validate(invalidCapacity)).length > 0);

  // Rejects too-short signature data
  const shortSignature = plainToInstance(SignPatientConsentDto, {
    expectedVersion: 1,
    signerCapacity: 'PATIENT',
    signerName: 'سارة',
    signatureType: 'DRAWN_BASE64',
    signatureData: 'a',
  });
  assert((await validate(shortSignature)).length > 0);
});

test('withdrawal and refusal DTOs require substantial reason and positive expected version', async () => {
  const validWithdrawal = plainToInstance(WithdrawPatientConsentDto, {
    expectedVersion: 2,
    reason: 'طلب المريض سحب الموافقة قبل بدء الجلسة بسبب السفر الطارئ',
  });
  assert.equal((await validate(validWithdrawal, { whitelist: true, forbidNonWhitelisted: true })).length, 0);

  const emptyReason = plainToInstance(WithdrawPatientConsentDto, {
    expectedVersion: 2,
    reason: ' ',
  });
  assert((await validate(emptyReason)).length > 0);

  const validRefusal = plainToInstance(RefusePatientConsentDto, {
    expectedVersion: 1,
    reason: 'رفض المريض التوقيع بعد الاطلاع على قائمة المخاطر المحتملة',
  });
  assert.equal((await validate(validRefusal, { whitelist: true, forbidNonWhitelisted: true })).length, 0);
});

test('cryptographic content digest produces deterministic SHA-256 and detects subtle content tampering', () => {
  const hash1 = digestContent('عنوان', 'نص', 'Title', 'Body', 'مخاطر', 'بدائل');
  const hash2 = digestContent('عنوان', 'نص', 'Title', 'Body', 'مخاطر', 'بدائل');
  assert.equal(hash1, hash2);
  assert.equal(hash1.length, 64);

  // Changing one character alters digest
  const hashTampered = digestContent('عنوان معدل', 'نص', 'Title', 'Body', 'مخاطر', 'بدائل');
  assert.notEqual(hash1, hashTampered);
});

test('cryptographic evidence digest binds clinic, patient, template, signer and timestamp', () => {
  const clinicId = randomUUID();
  const patientId = randomUUID();
  const templateVerId = randomUUID();
  const contentDigest = 'a'.repeat(64);
  const now = new Date().toISOString();

  const hash1 = digestEvidence(clinicId, patientId, templateVerId, contentDigest, 'PATIENT', 'مريض وهمي', 'DRAWN_BASE64', 'data1234', now);
  const hash2 = digestEvidence(clinicId, patientId, templateVerId, contentDigest, 'PATIENT', 'مريض وهمي', 'DRAWN_BASE64', 'data1234', now);
  assert.equal(hash1, hash2);
  assert.equal(hash1.length, 64);

  // Cross-clinic or cross-patient alteration changes evidence hash
  const hashOtherPatient = digestEvidence(clinicId, randomUUID(), templateVerId, contentDigest, 'PATIENT', 'مريض وهمي', 'DRAWN_BASE64', 'data1234', now);
  assert.notEqual(hash1, hashOtherPatient);

  // Signer name tampering changes hash
  const hashTamperedSigner = digestEvidence(clinicId, patientId, templateVerId, contentDigest, 'PATIENT', 'شخص آخر', 'DRAWN_BASE64', 'data1234', now);
  assert.notEqual(hash1, hashTamperedSigner);
});

test('ConsentEligibilityService fails closed and separates photography/marketing consent from procedure eligibility', async () => {
  const service = new ConsentEligibilityService();
  const clinicId = randomUUID();
  const patientId = randomUUID();
  const execId = randomUUID();
  const catalogId = randomUUID();
  const planId = randomUUID();

  // Without tx or db, fails closed
  assert.deepEqual(await service.check(clinicId, patientId, execId), {
    eligible: false,
    reason: 'VERIFIED_CONSENT_REQUIRED',
  });

  // Mock transactional client where execution exists
  const mockExecution = {
    id: execId,
    clinicId,
    patientId,
    treatmentPlanItemId: randomUUID(),
    treatmentPlanItem: {
      procedureCatalogId: catalogId,
      revision: {
        treatmentPlanId: planId,
        revisionNumber: 1,
        status: 'APPROVED',
      },
    },
  };

  // 1. When patient has ONLY Clinical Photography or Marketing consent -> MUST FAIL CLOSED!
  const mockTxPhotographyOnly = {
    procedureExecution: {
      findFirst: async () => mockExecution,
    },
    patientConsent: {
      findMany: async (args: any) => {
        // Service queries purpose: 'PROCEDURE'; photography row must not be returned
        if (args.where.purpose === 'PROCEDURE') return [];
        return [
          {
            id: randomUUID(),
            clinicId,
            patientId,
            purpose: 'CLINICAL_PHOTOGRAPHY',
            status: 'ACTIVE',
            verifiedAt: new Date(),
            verifiedByMembershipId: randomUUID(),
            validFrom: new Date(Date.now() - 3600000),
            expiresAt: null,
            signatureEvidence: {
              signerName: 'سارة',
              signatureData: 'data1234',
              evidenceHashSha256: 'a'.repeat(64),
            },
          },
        ];
      },
    },
  };

  const photoResult = await service.check(clinicId, patientId, execId, mockTxPhotographyOnly);
  assert.equal(photoResult.eligible, false);
  assert.equal(photoResult.reason, 'VERIFIED_CONSENT_REQUIRED');

  // 2. When patient has valid, verified PROCEDURE consent -> ELIGIBLE
  const consentId = randomUUID();
  const verifiedAt = new Date();
  const validFrom = new Date(Date.now() - 60000);
  const mockTxValidProcedure = {
    procedureExecution: {
      findFirst: async () => mockExecution,
    },
    patientConsent: {
      findMany: async () => [
        {
          id: consentId,
          clinicId,
          patientId,
          purpose: 'PROCEDURE',
          status: 'ACTIVE',
          procedureCatalogId: catalogId,
          treatmentPlanId: planId,
          treatmentPlanItemId: mockExecution.treatmentPlanItemId,
          verifiedAt,
          verifiedByMembershipId: randomUUID(),
          validFrom,
          expiresAt: null,
          templateVersion: { status: 'PUBLISHED' },
          signatureEvidence: {
            signerName: 'سارة',
            signatureData: 'data1234',
            evidenceHashSha256: 'b'.repeat(64),
          },
          withdrawal: null,
        },
      ],
    },
  };

  const validResult = await service.check(clinicId, patientId, execId, mockTxValidProcedure);
  assert.equal(validResult.eligible, true);
  if (validResult.eligible) {
    assert.equal(validResult.consentId, consentId);
    assert.equal(validResult.purpose, 'PROCEDURE');
  }
});
