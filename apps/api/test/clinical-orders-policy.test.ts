import 'reflect-metadata';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { ConfigService } from '@nestjs/config';
import type { Environment } from '../src/config/environment.js';
import {
  CreateGeneralClinicalServiceDto,
  UpdateGeneralClinicalServiceDto,
  CreateClinicalOrderDto,
  UpdateClinicalOrderStatusDto,
  CancelClinicalOrderDto,
  RecordOrderResultDto,
  VerifyOrderResultDto,
  CorrectOrderResultDto,
  AcknowledgeCriticalResultDto,
  ReleaseResultToPatientDto,
  UpdateClinicalDocumentDto,
} from '../src/clinical-orders/clinical-orders.dto.js';
import { ClinicalDocumentCryptoService } from '../src/clinical-orders/clinical-document-crypto.service.js';
import { permissionsFor } from '../src/auth/permissions.js';

describe('Clinical Orders & Services Policy & DTO Unit Tests', () => {
  it('CreateGeneralClinicalServiceDto: enforces valid code, nameAr, category, and basePriceMinor', async () => {
    const valid = plainToInstance(CreateGeneralClinicalServiceDto, {
      serviceCode: 'CONS-GEN-001',
      nameAr: 'استشارة طبية عامة أولى',
      nameEn: 'Initial General Medical Consultation',
      category: 'GENERAL_CONSULTATION',
      defaultDurationMinutes: 20,
      basePriceMinor: 15000,
      isActive: true,
    });
    const errors = await validate(valid);
    assert.equal(errors.length, 0);

    // Empty serviceCode
    const emptyCode = plainToInstance(CreateGeneralClinicalServiceDto, {
      serviceCode: '   ',
      nameAr: 'خدمة',
      category: 'GENERAL_CONSULTATION',
    });
    const codeErrors = await validate(emptyCode);
    assert.ok(codeErrors.some(e => e.property === 'serviceCode'));

    // Empty nameAr
    const emptyName = plainToInstance(CreateGeneralClinicalServiceDto, {
      serviceCode: 'SVC-001',
      nameAr: '',
      category: 'GENERAL_CONSULTATION',
    });
    const nameErrors = await validate(emptyName);
    assert.ok(nameErrors.some(e => e.property === 'nameAr'));

    // Invalid category
    const invalidCat = plainToInstance(CreateGeneralClinicalServiceDto, {
      serviceCode: 'SVC-002',
      nameAr: 'خدمة',
      category: 'NOT_A_CATEGORY' as any,
    });
    const catErrors = await validate(invalidCat);
    assert.ok(catErrors.some(e => e.property === 'category'));

    // Negative base price
    const negPrice = plainToInstance(CreateGeneralClinicalServiceDto, {
      serviceCode: 'SVC-003',
      nameAr: 'خدمة',
      category: 'GENERAL_CONSULTATION',
      basePriceMinor: -100,
    });
    const priceErrors = await validate(negPrice);
    assert.ok(priceErrors.some(e => e.property === 'basePriceMinor'));
  });

  it('UpdateGeneralClinicalServiceDto: allows partial updates with positive duration and price', async () => {
    const valid = plainToInstance(UpdateGeneralClinicalServiceDto, {
      nameAr: 'استشارة طبية عامة معدلة',
      defaultDurationMinutes: 30,
      basePriceMinor: 20000,
      isActive: false,
      expectedVersion: 1,
    });
    const errors = await validate(valid);
    assert.equal(errors.length, 0);
  });

  it('CreateClinicalOrderDto: validates orderType, priority, patient UUID and indication length', async () => {
    const valid = plainToInstance(CreateClinicalOrderDto, {
      patientId: 'b0000000-0000-4000-8000-000000000001',
      encounterId: 'a0000000-0000-4000-8000-000000000001',
      orderType: 'LABORATORY',
      clinicalIndication: 'Routine screening for anemia and diabetes',
      priority: 'ROUTINE',
      notes: 'Fasting 10 hours required',
    });
    const errors = await validate(valid);
    assert.equal(errors.length, 0);

    // Invalid UUID
    const badUuid = plainToInstance(CreateClinicalOrderDto, {
      patientId: 'invalid-uuid',
      orderType: 'LABORATORY',
    });
    const uuidErrors = await validate(badUuid);
    assert.ok(uuidErrors.some(e => e.property === 'patientId'));

    // Invalid orderType
    const badType = plainToInstance(CreateClinicalOrderDto, {
      patientId: 'b0000000-0000-4000-8000-000000000001',
      orderType: 'SURGERY' as any,
    });
    const typeErrors = await validate(badType);
    assert.ok(typeErrors.some(e => e.property === 'orderType'));
  });

  it('UpdateClinicalOrderStatusDto: validates status transition payload', async () => {
    const valid = plainToInstance(UpdateClinicalOrderStatusDto, {
      status: 'IN_PROGRESS',
      expectedVersion: 1,
    });
    const errors = await validate(valid);
    assert.equal(errors.length, 0);
  });

  it('CancelClinicalOrderDto: requires minimum 3-character cancellationReason', async () => {
    const valid = plainToInstance(CancelClinicalOrderDto, {
      cancellationReason: 'Patient declined blood draw',
      expectedVersion: 2,
    });
    const errors = await validate(valid);
    assert.equal(errors.length, 0);

    const tooShort = plainToInstance(CancelClinicalOrderDto, {
      cancellationReason: 'no',
    });
    const shortErrors = await validate(tooShort);
    assert.ok(shortErrors.some(e => e.property === 'cancellationReason'));
  });

  it('RecordOrderResultDto: validates resultType, status, findings, and critical flag', async () => {
    const valid = plainToInstance(RecordOrderResultDto, {
      resultType: 'LABORATORY',
      status: 'FINAL',
      sourceOrganization: 'National Reference Laboratory',
      narrativeFindings: 'Hemoglobin 13.5 g/dL, Platelets 250,000 /mcL, WBC 6.8 K/uL',
      impression: 'Complete blood count within normal reference ranges',
      isCritical: false,
      isReleasedToPatient: false,
    });
    const errors = await validate(valid);
    assert.equal(errors.length, 0);
  });

  it('VerifyOrderResultDto: accepts optional verification notes and expectedVersion', async () => {
    const valid = plainToInstance(VerifyOrderResultDto, {
      verificationNotes: 'Reviewed and concurred with hematology panel findings',
      expectedVersion: 1,
    });
    const errors = await validate(valid);
    assert.equal(errors.length, 0);
  });

  it('CorrectOrderResultDto: requires correctionReason of at least 3 characters', async () => {
    const valid = plainToInstance(CorrectOrderResultDto, {
      correctionReason: 'Typo in potassium decimal place corrected from 55 to 5.5',
      narrativeFindings: 'Potassium 5.5 mEq/L',
      expectedVersion: 2,
    });
    const errors = await validate(valid);
    assert.equal(errors.length, 0);

    const invalid = plainToInstance(CorrectOrderResultDto, {
      correctionReason: 'ab',
    });
    const errors2 = await validate(invalid);
    assert.ok(errors2.some(e => e.property === 'correctionReason'));
  });

  it('AcknowledgeCriticalResultDto: requires actionTaken description', async () => {
    const valid = plainToInstance(AcknowledgeCriticalResultDto, {
      actionTaken: 'Contacted treating physician Dr. Sarah; stat potassium replenishment started',
      expectedVersion: 1,
    });
    const errors = await validate(valid);
    assert.equal(errors.length, 0);

    const emptyAction = plainToInstance(AcknowledgeCriticalResultDto, {
      actionTaken: '   ',
    });
    const actionErrors = await validate(emptyAction);
    assert.ok(actionErrors.some(e => e.property === 'actionTaken'));
  });

  it('ReleaseResultToPatientDto: enforces boolean flag', async () => {
    const valid = plainToInstance(ReleaseResultToPatientDto, {
      isReleasedToPatient: true,
      expectedVersion: 1,
    });
    const errors = await validate(valid);
    assert.equal(errors.length, 0);
  });

  it('UpdateClinicalDocumentDto: validates legal hold and confidentiality updates', async () => {
    const valid = plainToInstance(UpdateClinicalDocumentDto, {
      title: 'Updated Lab Report Title',
      isConfidential: true,
      isLegalHold: true,
      legalHoldReason: 'Court subpoena received for malpractice inquiry',
      expectedVersion: 1,
    });
    const errors = await validate(valid);
    assert.equal(errors.length, 0);
  });
});

describe('ClinicalDocumentCryptoService Unit Tests', () => {
  const fakeConfig = {
    get: (key: string) => {
      if (key === 'NODE_ENV') return 'test';
      if (key === 'CLINICAL_MEDIA_ENCRYPTION_KEY') return 'test-encryption-key-must-be-32-chars-long-clinical';
      if (key === 'AUTH_CSRF_SECRET') return 'test-csrf-secret-key-32-chars-long!';
      return undefined;
    },
  } as unknown as ConfigService<Environment, true>;

  const cryptoService = new ClinicalDocumentCryptoService(fakeConfig);

  it('validateDocumentBytes: correctly detects valid PDF magic bytes', () => {
    const pdfBuf = Buffer.from('%PDF-1.4 sample content here');
    const mime = cryptoService.validateDocumentBytes(pdfBuf, 'application/pdf');
    assert.equal(mime, 'application/pdf');
  });

  it('validateDocumentBytes: correctly detects valid PNG magic bytes', () => {
    const pngBuf = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13]);
    const mime = cryptoService.validateDocumentBytes(pngBuf, 'image/png');
    assert.equal(mime, 'image/png');
  });

  it('validateDocumentBytes: correctly detects valid JPEG magic bytes', () => {
    const jpegBuf = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    const mime = cryptoService.validateDocumentBytes(jpegBuf, 'image/jpeg');
    assert.equal(mime, 'image/jpeg');
  });

  it('validateDocumentBytes: correctly detects DICOM magic preamble', () => {
    const dicomBuf = Buffer.alloc(140);
    dicomBuf.write('DICM', 128, 'ascii');
    const mime = cryptoService.validateDocumentBytes(dicomBuf, 'application/dicom');
    assert.equal(mime, 'application/dicom');
  });

  it('validateDocumentBytes: rejects empty buffer', () => {
    const emptyBuf = Buffer.alloc(0);
    assert.throws(
      () => cryptoService.validateDocumentBytes(emptyBuf, 'application/pdf'),
      /Document buffer cannot be empty/,
    );
  });

  it('validateDocumentBytes: rejects oversized buffer exceeding 25 MiB', () => {
    const fakeOversized = {
      length: 26 * 1024 * 1024,
    } as unknown as Buffer;
    assert.throws(
      () => cryptoService.validateDocumentBytes(fakeOversized, 'application/pdf'),
      /Document exceeds maximum permitted size/,
    );
  });

  it('validateDocumentBytes: rejects binary null bytes in declared text document', () => {
    const badText = Buffer.from('hello\0world');
    assert.throws(
      () => cryptoService.validateDocumentBytes(badText, 'text/plain'),
      /File contains invalid binary data/,
    );
  });

  it('validateDocumentBytes: rejects completely unrecognized binary signature', () => {
    const badBuf = Buffer.from([0x01, 0x02, 0x03, 0x04, 0x05, 0x06]);
    assert.throws(
      () => cryptoService.validateDocumentBytes(badBuf, 'application/octet-stream'),
      /Unsupported document type signature/,
    );
  });

  it('AES-256-GCM encryption & decryption roundtrip produces matching plaintext and SHA-256', async () => {
    const clinicId = '00000000-0000-4000-8000-000000000001';
    const documentId = randomUUID();
    const samplePdf = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Title (Lab Test Result) >>\nendobj\ntrailer\n<<>>\n%%EOF');

    const stored = await cryptoService.storeEncryptedDocument(
      clinicId,
      documentId,
      samplePdf,
      'application/pdf',
    );

    assert.equal(stored.storageKey, `${clinicId}/docs/${documentId}.enc`);
    assert.equal(stored.detectedMime, 'application/pdf');
    assert.ok(stored.contentSha256.length === 64);

    const decrypted = await cryptoService.retrieveEncryptedDocument(
      stored.storageKey,
      stored.contentSha256,
      stored.encryptionIv,
      stored.encryptionTag,
    );

    assert.deepEqual(decrypted, samplePdf);
    assert.equal(decrypted.toString('ascii'), samplePdf.toString('ascii'));

    await cryptoService.removeDocument(stored.storageKey);
  });

  it('retrieveEncryptedDocument: rejects tampered SHA-256 hash', async () => {
    const clinicId = '00000000-0000-4000-8000-000000000001';
    const documentId = randomUUID();
    const sample = Buffer.from('%PDF-1.4 authentic medical report');

    const stored = await cryptoService.storeEncryptedDocument(
      clinicId,
      documentId,
      sample,
      'application/pdf',
    );

    const fakeSha = '0000000000000000000000000000000000000000000000000000000000000000';
    await assert.rejects(
      cryptoService.retrieveEncryptedDocument(stored.storageKey, fakeSha),
      /integrity check failed/,
    );

    await cryptoService.removeDocument(stored.storageKey);
  });
});

describe('Clinical Orders Role Permissions Verification', () => {
  it('DOCTOR has all clinical orders, results, services, and document permissions', () => {
    const perms = permissionsFor('DOCTOR');
    assert.ok(perms.includes('clinical.orders.create'));
    assert.ok(perms.includes('clinical.orders.read'));
    assert.ok(perms.includes('clinical.orders.update'));
    assert.ok(perms.includes('clinical.orders.cancel'));
    assert.ok(perms.includes('clinical.results.record'));
    assert.ok(perms.includes('clinical.results.verify'));
    assert.ok(perms.includes('clinical.results.release'));
    assert.ok(perms.includes('clinical.documents.upload'));
    assert.ok(perms.includes('clinical.documents.read'));
    assert.ok(perms.includes('clinical.documents.manage'));
    assert.ok(perms.includes('clinical.services.read'));
    assert.ok(perms.includes('clinical.services.manage'));
  });

  it('nonclinical roles have no order, result, document, or service permissions', () => {
    for (const role of ['CLINIC_OWNER', 'CLINIC_ADMIN', 'RECEPTIONIST', 'ACCOUNTANT'] as const) {
      assert.ok(!permissionsFor(role).some(p => ['clinical.orders.','clinical.results.','clinical.documents.','clinical.services.'].some(prefix => p.startsWith(prefix))));
    }
  });
});
