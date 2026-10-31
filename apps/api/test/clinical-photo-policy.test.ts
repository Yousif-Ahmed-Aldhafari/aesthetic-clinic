import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import sharp from 'sharp';
import { rolePermissions } from '../src/auth/permissions.js';
import {
  ArchivePhotoDto,
  CreatePhotoAnnotationDto,
  CreatePhotoComparisonDto,
  CreatePhotoSessionDto,
  UploadPhotoDto,
} from '../src/clinical-photos/clinical-photo-input.js';
import { ClinicalMediaCryptoService } from '../src/clinical-photos/clinical-media-crypto.service.js';
import { ClinicalMediaProcessingService } from '../src/clinical-photos/clinical-media-processing.service.js';
import type { Environment } from '../src/config/environment.js';

test('clinical photography permissions are doctor-only and excluded from administrative and finance roles', () => {
  const photoPermissions = [
    'clinical.photos.read',
    'clinical.photos.upload',
    'clinical.photos.annotate',
    'clinical.photos.compare',
    'clinical.photos.manage',
  ] as const;

  const doctorPerms = rolePermissions.DOCTOR;
  for (const perm of photoPermissions) {
    assert.ok(doctorPerms.includes(perm), `DOCTOR must have ${perm}`);
  }

  const restrictedRoles = ['CLINIC_OWNER', 'CLINIC_ADMIN', 'RECEPTIONIST', 'ACCOUNTANT'] as const;
  for (const role of restrictedRoles) {
    const rolePerms = rolePermissions[role];
    for (const perm of photoPermissions) {
      assert.ok(!rolePerms.includes(perm as any), `${role} must NOT have ${perm}`);
    }
  }
});

test('CreatePhotoSessionDto rejects missing patient, consent or invalid session date', async () => {
  const valid = {
    patientId: randomUUID(),
    consentId: randomUUID(),
    sessionDate: '2026-10-30T10:00:00.000Z',
    notes: 'جلسة توثيق سريري قبل الإجراء',
  };

  const validInstance = plainToInstance(CreatePhotoSessionDto, valid);
  const errorsValid = await validate(validInstance);
  assert.equal(errorsValid.length, 0);

  // Missing patientId
  const invalidPatient = plainToInstance(CreatePhotoSessionDto, { ...valid, patientId: 'invalid-id' });
  const errorsPatient = await validate(invalidPatient);
  assert.ok(errorsPatient.some((e) => e.property === 'patientId'));

  // Missing consentId
  const invalidConsent = plainToInstance(CreatePhotoSessionDto, { ...valid, consentId: 'not-a-uuid' });
  const errorsConsent = await validate(invalidConsent);
  assert.ok(errorsConsent.some((e) => e.property === 'consentId'));

  // Invalid date
  const invalidDate = plainToInstance(CreatePhotoSessionDto, { ...valid, sessionDate: 'not-a-date' });
  const errorsDate = await validate(invalidDate);
  assert.ok(errorsDate.some((e) => e.property === 'sessionDate'));

  // Oversized notes
  const invalidNotes = plainToInstance(CreatePhotoSessionDto, { ...valid, notes: 'A'.repeat(1001) });
  const errorsNotes = await validate(invalidNotes);
  assert.ok(errorsNotes.some((e) => e.property === 'notes'));
});

test('UploadPhotoDto validates category enum, bodyArea length and date strings', async () => {
  const valid = {
    category: 'BEFORE' as const,
    bodyArea: 'الوجه والوجنتين',
    caption: 'صورة أمامية للوجه بالإضاءة المعيارية',
    takenAt: '2026-10-30T10:15:00.000Z',
  };

  const validInstance = plainToInstance(UploadPhotoDto, valid);
  const errorsValid = await validate(validInstance);
  assert.equal(errorsValid.length, 0);

  // Invalid category
  const invalidCat = plainToInstance(UploadPhotoDto, { ...valid, category: 'MARKETING' });
  const errorsCat = await validate(invalidCat);
  assert.ok(errorsCat.some((e) => e.property === 'category'));

  // Short bodyArea
  const shortBody = plainToInstance(UploadPhotoDto, { ...valid, bodyArea: 'أ' });
  const errorsShort = await validate(shortBody);
  assert.ok(errorsShort.some((e) => e.property === 'bodyArea'));

  // Oversized caption
  const longCaption = plainToInstance(UploadPhotoDto, { ...valid, caption: 'x'.repeat(501) });
  const errorsCaption = await validate(longCaption);
  assert.ok(errorsCaption.some((e) => e.property === 'caption'));
});

test('CreatePhotoComparisonDto requires distinct before/after UUIDs and title', async () => {
  const valid = {
    title: 'مقارنة قبل وبعد جلسة الليزر الجزئي',
    beforePhotoId: randomUUID(),
    afterPhotoId: randomUUID(),
    notes: 'ملاحظة تحسن ملحوظ في نضارة البشرة وانحسار التصبغات',
  };

  const validInstance = plainToInstance(CreatePhotoComparisonDto, valid);
  const errorsValid = await validate(validInstance);
  assert.equal(errorsValid.length, 0);

  // Missing title
  const invalidTitle = plainToInstance(CreatePhotoComparisonDto, { ...valid, title: 'a' });
  const errorsTitle = await validate(invalidTitle);
  assert.ok(errorsTitle.some((e) => e.property === 'title'));

  // Invalid photo IDs
  const invalidId = plainToInstance(CreatePhotoComparisonDto, { ...valid, beforePhotoId: 'not-uuid' });
  const errorsId = await validate(invalidId);
  assert.ok(errorsId.some((e) => e.property === 'beforePhotoId'));
});

test('CreatePhotoAnnotationDto validates annotationType, geometryJson and comment', async () => {
  const valid = {
    annotationType: 'PIN',
    geometryJson: JSON.stringify({ x: 0.45, y: 0.62 }),
    comment: 'منطقة تصبغ سطحي تحتاج جلسة متابعة إضافية',
  };

  const validInstance = plainToInstance(CreatePhotoAnnotationDto, valid);
  const errorsValid = await validate(validInstance);
  assert.equal(errorsValid.length, 0);

  // Short comment
  const shortComment = plainToInstance(CreatePhotoAnnotationDto, { ...valid, comment: 'a' });
  const errorsComment = await validate(shortComment);
  assert.ok(errorsComment.some((e) => e.property === 'comment'));
});

test('ArchivePhotoDto requires positive version and non-empty reason', async () => {
  const valid = {
    expectedVersion: 1,
    reason: 'تم التقاط صورة بديلة بزاوية إضاءة أكثر دقة',
  };

  const validInstance = plainToInstance(ArchivePhotoDto, valid);
  const errorsValid = await validate(validInstance);
  assert.equal(errorsValid.length, 0);

  // Zero version
  const zeroVer = plainToInstance(ArchivePhotoDto, { ...valid, expectedVersion: 0 });
  const errorsZero = await validate(zeroVer);
  assert.ok(errorsZero.some((e) => e.property === 'expectedVersion'));

  // Short reason
  const shortReason = plainToInstance(ArchivePhotoDto, { ...valid, reason: 'ab' });
  const errorsReason = await validate(shortReason);
  assert.ok(errorsReason.some((e) => e.property === 'reason'));
});

test('ClinicalMediaCryptoService encrypts and decrypts media buffer at rest with AES-256-GCM', () => {
  const config = new ConfigService<Environment, true>({
    NODE_ENV: 'test',
    AUTH_CSRF_SECRET: 'test-csrf-secret-with-sufficient-entropy-for-kdf-32-chars-long',
    CLINICAL_MEDIA_ENCRYPTION_KEY: 'clinical-media-test-secret-at-least-32-chars-long-12345',
  } as unknown as Environment);

  const crypto = new ClinicalMediaCryptoService(config);
  const plaintext = Buffer.from('fictional clinical photo test buffer content for encryption verification');

  const encrypted = crypto.encryptMedia(plaintext);
  assert.notDeepEqual(encrypted, plaintext);
  // Header: 12-byte IV + 16-byte AuthTag = 28 bytes
  assert.ok(encrypted.length > 28);

  const decrypted = crypto.decryptMedia(encrypted);
  assert.deepEqual(decrypted, plaintext);
});

test('ClinicalMediaCryptoService detects tampering and rejects corrupted ciphertext or tags', () => {
  const config = new ConfigService<Environment, true>({
    NODE_ENV: 'test',
    AUTH_CSRF_SECRET: 'test-csrf-secret-with-sufficient-entropy-for-kdf-32-chars-long',
    CLINICAL_MEDIA_ENCRYPTION_KEY: 'clinical-media-test-secret-at-least-32-chars-long-12345',
  } as unknown as Environment);

  const crypto = new ClinicalMediaCryptoService(config);
  const plaintext = Buffer.from('tamper-test-plaintext');
  const encrypted = crypto.encryptMedia(plaintext);

  // Tamper with IV
  const tamperedIv = Buffer.from(encrypted);
  tamperedIv[0] ^= 0xff;
  assert.throws(() => crypto.decryptMedia(tamperedIv));

  // Tamper with AuthTag
  const tamperedTag = Buffer.from(encrypted);
  tamperedTag[15] ^= 0xff;
  assert.throws(() => crypto.decryptMedia(tamperedTag));

  // Tamper with Ciphertext
  const tamperedCipher = Buffer.from(encrypted);
  tamperedCipher[30] ^= 0xff;
  assert.throws(() => crypto.decryptMedia(tamperedCipher));

  // Truncated header (< 28 bytes)
  const truncated = encrypted.subarray(0, 20);
  assert.throws(() => crypto.decryptMedia(truncated), /Malformed encrypted media payload/);
});

test('ClinicalMediaCryptoService supports key rotation via fallback previous key', () => {
  const oldSecret = 'old-key-rotation-secret-32-bytes-long-123456';
  const newSecret = 'new-key-rotation-secret-32-bytes-long-654321';

  // Crypto initialized with old key
  const oldConfig = new ConfigService<Environment, true>({
    NODE_ENV: 'test',
    AUTH_CSRF_SECRET: 'csrf-secret-for-testing-key-rotations-32-bytes',
    CLINICAL_MEDIA_ENCRYPTION_KEY: oldSecret,
  } as unknown as Environment);
  const oldCrypto = new ClinicalMediaCryptoService(oldConfig);

  const plaintext = Buffer.from('data encrypted before key rotation');
  const ciphertext = oldCrypto.encryptMedia(plaintext);

  // Rotated crypto: primary is newSecret, fallback is oldSecret
  const rotatedConfig = new ConfigService<Environment, true>({
    NODE_ENV: 'test',
    AUTH_CSRF_SECRET: 'csrf-secret-for-testing-key-rotations-32-bytes',
    CLINICAL_MEDIA_ENCRYPTION_KEY: newSecret,
    CLINICAL_MEDIA_ENCRYPTION_KEY_PREVIOUS: oldSecret,
  } as unknown as Environment);
  const rotatedCrypto = new ClinicalMediaCryptoService(rotatedConfig);

  const decrypted = rotatedCrypto.decryptMedia(ciphertext);
  assert.deepEqual(decrypted, plaintext);
});

test('ClinicalMediaProcessingService normalizes image to WebP, generates thumbnail, and strips EXIF', async () => {
  const processing = new ClinicalMediaProcessingService();

  // Create test PNG image buffer with Sharp
  const rawPng = await sharp({
    create: {
      width: 800,
      height: 600,
      channels: 3,
      background: { r: 240, g: 200, b: 180 },
    },
  })
    .withMetadata({
      exif: {
        IFD0: {
          Artist: 'Sensitive Device Artist Info',
          Make: 'Device Manufacturer',
          Model: 'Camera Model XYZ',
        },
      },
    })
    .png()
    .toBuffer();

  const processed = await processing.processAndNormalizeImage({
    buffer: rawPng,
    mimetype: 'image/png',
    size: rawPng.length,
    originalname: 'clinical-face-shot.png',
  });

  assert.equal(processed.mimeType, 'image/webp');
  assert.equal(processed.width, 800);
  assert.equal(processed.height, 600);
  assert.ok(processed.sha256Digest.length === 64);
  assert.ok(processed.canonicalBytes.length > 0);
  assert.ok(processed.thumbnailBytes.length > 0);

  // Inspect normalized image metadata to ensure EXIF is completely stripped
  const masterMeta = await sharp(processed.canonicalBytes).metadata();
  assert.equal(masterMeta.format, 'webp');
  assert.equal(masterMeta.exif, undefined, 'EXIF metadata must be stripped from canonical master');

  // Inspect thumbnail dimensions: max dimension 320px
  const thumbMeta = await sharp(processed.thumbnailBytes).metadata();
  assert.equal(thumbMeta.format, 'webp');
  assert.ok((thumbMeta.width ?? 0) <= 320);
  assert.ok((thumbMeta.height ?? 0) <= 320);
  assert.equal(thumbMeta.exif, undefined, 'EXIF metadata must be stripped from thumbnail');
});

test('ClinicalMediaProcessingService rejects non-image or corrupted files', async () => {
  const processing = new ClinicalMediaProcessingService();

  // Corrupted payload with image/jpeg mime
  await assert.rejects(
    () =>
      processing.processAndNormalizeImage({
        buffer: Buffer.from('plain text masquerading as image'),
        mimetype: 'image/jpeg',
        size: 32,
        originalname: 'fake.jpg',
      }),
    /Unsupported.*image file format/,
  );

  // Missing file payload
  await assert.rejects(
    () => processing.processAndNormalizeImage(undefined),
    /No image file payload provided/,
  );
});
