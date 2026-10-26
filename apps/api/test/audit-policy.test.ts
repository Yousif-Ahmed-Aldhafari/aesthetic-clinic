import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sanitizeAuditMetadata } from '../src/audit/audit.types.js';
import { permissions, permissionsFor } from '../src/auth/permissions.js';
import { calculateSha256, decryptBackup, encryptBackup } from '../src/audit/backup-crypto.js';

test('audit.read permission is granted only to CLINIC_OWNER and CLINIC_ADMIN', () => {
  assert(permissions.includes('audit.read'));

  const ownerPerms = permissionsFor('CLINIC_OWNER');
  const adminPerms = permissionsFor('CLINIC_ADMIN');
  const doctorPerms = permissionsFor('DOCTOR');
  const receptionistPerms = permissionsFor('RECEPTIONIST');
  const accountantPerms = permissionsFor('ACCOUNTANT');

  assert(ownerPerms.includes('audit.read'), 'CLINIC_OWNER must have audit.read');
  assert(adminPerms.includes('audit.read'), 'CLINIC_ADMIN must have audit.read');
  assert(!doctorPerms.includes('audit.read'), 'DOCTOR must NOT have audit.read');
  assert(!receptionistPerms.includes('audit.read'), 'RECEPTIONIST must NOT have audit.read');
  assert(!accountantPerms.includes('audit.read'), 'ACCOUNTANT must NOT have audit.read');
});

test('sanitizeAuditMetadata redacts passwords, tokens, secrets, cookies, and payment cards', () => {
  const sensitiveInput = {
    username: 'admin@lamssa.com',
    password: 'superSecretPassword123!',
    token: 'jwt.bearer.token',
    refreshToken: 'rt-12345',
    cookie: 'session=xyz',
    csrfToken: 'csrf-token-abc',
    creditCard: '4111222233334444',
    cvv: '123',
    cardNumber: '5555666677778888',
    nationalId: '1098765432',
    safeField: 'reception-desk-1',
    count: 5,
  };

  const sanitized = sanitizeAuditMetadata(sensitiveInput) as Record<string, unknown>;
  assert(sanitized !== null);

  assert.equal(sanitized.username, 'admin@lamssa.com');
  assert.equal(sanitized.password, '[REDACTED]');
  assert.equal(sanitized.token, '[REDACTED]');
  assert.equal(sanitized.refreshToken, '[REDACTED]');
  assert.equal(sanitized.cookie, '[REDACTED]');
  assert.equal(sanitized.csrfToken, '[REDACTED]');
  assert.equal(sanitized.creditCard, '[REDACTED]');
  assert.equal(sanitized.cvv, '[REDACTED]');
  assert.equal(sanitized.cardNumber, '[REDACTED]');
  assert.equal(sanitized.nationalId, '[REDACTED]');
  assert.equal(sanitized.safeField, 'reception-desk-1');
  assert.equal(sanitized.count, 5);
});

test('sanitizeAuditMetadata redacts medical and clinical details', () => {
  const clinicalInput = {
    patientId: 'patient-uuid-1',
    medicalNotes: 'Patient has high blood pressure and allergy to penicillin',
    diagnosis: 'Acne vulgaris grade 3',
    symptoms: 'Facial redness and scarring',
    prescription: 'Isotretinoin 20mg daily',
    treatmentNotes: 'Performed laser resurfacing session 1',
    status: 'ACTIVE',
  };

  const sanitized = sanitizeAuditMetadata(clinicalInput) as Record<string, unknown>;
  assert(sanitized !== null);

  assert.equal(sanitized.patientId, 'patient-uuid-1');
  assert.equal(sanitized.status, 'ACTIVE');
  assert.equal(sanitized.medicalNotes, '[REDACTED]');
  assert.equal(sanitized.diagnosis, '[REDACTED]');
  assert.equal(sanitized.symptoms, '[REDACTED]');
  assert.equal(sanitized.prescription, '[REDACTED]');
  assert.equal(sanitized.treatmentNotes, '[REDACTED]');
});

test('sanitizeAuditMetadata recursively sanitizes nested objects and arrays', () => {
  const nested = {
    level1: {
      password: 'secret',
      items: [
        { card: '1234', safe: 'ok' },
        { token: 'tok' },
      ],
    },
  };

  const sanitized = sanitizeAuditMetadata(nested) as { level1: { password: string; items: Array<Record<string, unknown>> } };
  assert(sanitized !== null);
  assert.equal(sanitized.level1.password, '[REDACTED]');
  assert.equal(sanitized.level1.items[0].card, '[REDACTED]');
  assert.equal(sanitized.level1.items[0].safe, 'ok');
  assert.equal(sanitized.level1.items[1].token, '[REDACTED]');
});

test('sanitizeAuditMetadata truncates oversized string values', () => {
  const oversized = 'a'.repeat(2000);
  const sanitized = sanitizeAuditMetadata({ longText: oversized }) as { longText: string };
  assert(sanitized !== null);
  assert(sanitized.longText.length <= 1040);
  assert(sanitized.longText.endsWith('...[TRUNCATED]'));
});

test('backup crypto encrypts and decrypts with AES-256-GCM and scrypt KDF', () => {
  const testData = Buffer.from('PostgreSQL dump header and binary payload for Lamssa audit test.');
  const passphrase = 'test-encryption-key-for-audit-suite-32-chars';

  const { ciphertext, meta } = encryptBackup(testData, passphrase);

  assert(Buffer.isBuffer(ciphertext));
  assert.notDeepEqual(ciphertext, testData);
  assert.equal(meta.cipher, 'aes-256-gcm');
  assert.equal(meta.kdf, 'scrypt');
  assert.equal(meta.plaintextSize, testData.length);
  assert.equal(meta.ciphertextSize, ciphertext.length);

  const decrypted = decryptBackup(ciphertext, passphrase, meta);
  assert.deepEqual(decrypted, testData);
});

test('backup crypto detects SHA-256 tampering and fails closed', () => {
  const testData = Buffer.from('Database backup buffer');
  const passphrase = 'test-encryption-key-passphrase-secure';
  const { ciphertext, meta } = encryptBackup(testData, passphrase);

  // Tamper with the metadata SHA-256
  const badMeta = { ...meta, ciphertextSha256: '0000000000000000000000000000000000000000000000000000000000000000' };
  assert.throws(
    () => decryptBackup(ciphertext, passphrase, badMeta),
    /Integrity check failed: ciphertext SHA-256 mismatch/
  );
});

test('backup crypto detects ciphertext tampering or incorrect passphrase via GCM auth tag', () => {
  const testData = Buffer.from('Sensitive financial and patient records dump');
  const passphrase = 'correct-passphrase-for-backup';
  const { ciphertext, meta } = encryptBackup(testData, passphrase);

  // Wrong passphrase
  assert.throws(
    () => decryptBackup(ciphertext, 'wrong-passphrase', meta),
    /Decryption failed: authentication tag verification failed/
  );

  // Tampered ciphertext byte
  const tamperedCiphertext = Buffer.from(ciphertext);
  tamperedCiphertext[10] ^= 0xff;
  const tamperedMeta = { ...meta, ciphertextSha256: calculateSha256(tamperedCiphertext) };
  assert.throws(
    () => decryptBackup(tamperedCiphertext, passphrase, tamperedMeta),
    /Decryption failed: authentication tag verification failed/
  );
});

