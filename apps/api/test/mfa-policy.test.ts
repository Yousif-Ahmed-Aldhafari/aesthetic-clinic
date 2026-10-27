import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ConfigService } from '@nestjs/config';
import {
  base32Decode,
  generateOtpauthUri,
  generateRecoveryCodes,
  generateTotp,
  generateTotpSecret,
  verifyRecoveryCode,
  verifyTotp,
} from '../src/auth/totp.js';
import { MfaCryptoService } from '../src/auth/mfa-crypto.service.js';
import { maskIpAddress, summarizeDevice } from '../src/auth/session-manager.service.js';

test('RFC 6238 TOTP generates expected 6-digit codes and respects 30-second steps', () => {
  // Test secret from RFC 6238 Appendix B (HMAC-SHA1): "12345678901234567890" in ASCII
  const rfcSecret = Buffer.from('12345678901234567890', 'ascii');

  // RFC 6238 test vectors:
  // Time = 59s -> step = 1 -> TOTP: 287082
  assert.equal(generateTotp(rfcSecret, 1n, 6), '287082');

  // Time = 1111111109s -> step = 37037036 -> TOTP: 081804
  assert.equal(generateTotp(rfcSecret, 37037036n, 6), '081804');

  // Time = 1111111111s -> step = 37037037 -> TOTP: 050471
  assert.equal(generateTotp(rfcSecret, 37037037n, 6), '050471');

  // Time = 1234567890s -> step = 41152263 -> TOTP: 005924
  assert.equal(generateTotp(rfcSecret, 41152263n, 6), '005924');

  // Time = 2000000000s -> step = 66666666 -> TOTP: 279037
  assert.equal(generateTotp(rfcSecret, 66666666n, 6), '279037');
});

test('Base32 encoding and decoding handles binary secret bytes without loss', () => {
  const { secretBytes, base32Secret } = generateTotpSecret(20);
  assert.equal(secretBytes.length, 20);
  assert(/^[A-Z2-7]+$/.test(base32Secret));

  const decoded = base32Decode(base32Secret);
  assert.deepEqual(decoded, secretBytes);

  // Case-insensitivity and whitespace stripping
  const mixed = base32Secret.toLowerCase().slice(0, 8) + ' ' + base32Secret.toLowerCase().slice(8);
  assert.deepEqual(base32Decode(mixed), secretBytes);
});

test('verifyTotp enforces bounded clock drift window of +/- 1 step', () => {
  const secret = Buffer.from('abcdefghijklmnopqrst', 'ascii');
  const now = 1000000 * 30 * 1000; // Exact step 1000000
  const currentStep = 1000000n;

  const currentCode = generateTotp(secret, currentStep);
  const prevCode = generateTotp(secret, currentStep - 1n);
  const nextCode = generateTotp(secret, currentStep + 1n);
  const tooEarlyCode = generateTotp(secret, currentStep - 2n);
  const tooLateCode = generateTotp(secret, currentStep + 2n);

  // Exact step is valid
  assert.equal(verifyTotp(secret, currentCode, { timeMs: now, stepWindow: 1 }).valid, true);

  // +/- 1 step (30s drift) is valid
  assert.equal(verifyTotp(secret, prevCode, { timeMs: now, stepWindow: 1 }).valid, true);
  assert.equal(verifyTotp(secret, nextCode, { timeMs: now, stepWindow: 1 }).valid, true);

  // Outside +/- 1 step is invalid
  assert.equal(verifyTotp(secret, tooEarlyCode, { timeMs: now, stepWindow: 1 }).valid, false);
  assert.equal(verifyTotp(secret, tooLateCode, { timeMs: now, stepWindow: 1 }).valid, false);
});

test('verifyTotp enforces replay protection against reused or earlier steps', () => {
  const secret = Buffer.from('abcdefghijklmnopqrst', 'ascii');
  const now = 1000000 * 30 * 1000;
  const currentStep = 1000000n;
  const currentCode = generateTotp(secret, currentStep);

  // First use at currentStep succeeds
  const res = verifyTotp(secret, currentCode, { timeMs: now, stepWindow: 1, lastReplayStep: null });
  assert.equal(res.valid, true);
  assert.equal(res.step, currentStep);

  // Second use with lastReplayStep == currentStep fails closed
  const replay = verifyTotp(secret, currentCode, { timeMs: now, stepWindow: 1, lastReplayStep: currentStep });
  assert.equal(replay.valid, false);
  assert.equal(replay.error, 'REPLAYED_CODE');

  // Attempting an older code also fails closed
  const olderCode = generateTotp(secret, currentStep - 1n);
  const olderReplay = verifyTotp(secret, olderCode, { timeMs: now, stepWindow: 1, lastReplayStep: currentStep });
  assert.equal(olderReplay.valid, false);
  assert.equal(olderReplay.error, 'REPLAYED_CODE');

  // Future code (> lastReplayStep) succeeds
  const futureCode = generateTotp(secret, currentStep + 1n);
  const futureUse = verifyTotp(secret, futureCode, { timeMs: now, stepWindow: 1, lastReplayStep: currentStep });
  assert.equal(futureUse.valid, true);
  assert.equal(futureUse.step, currentStep + 1n);
});

test('Recovery codes generate high-entropy verifiers and verify constant-time', () => {
  const { plaintextCodes, hashedCodes } = generateRecoveryCodes(8);
  assert.equal(plaintextCodes.length, 8);
  assert.equal(hashedCodes.length, 8);

  for (let i = 0; i < 8; i++) {
    const raw = plaintextCodes[i];
    assert(/^([2-9A-HJ-NP-Z]{4})-([2-9A-HJ-NP-Z]{4})-([2-9A-HJ-NP-Z]{4})-([2-9A-HJ-NP-Z]{4})$/.test(raw), 'Code must format as XXXX-XXXX-XXXX-XXXX with >=80 bits of entropy');
    assert.equal(hashedCodes[i].length, 64, 'SHA-256 verifier must be 64 hex characters');

    // Verification succeeds with raw, lowercase, or stripped hyphens
    assert.equal(verifyRecoveryCode(raw, hashedCodes[i]), true);
    assert.equal(verifyRecoveryCode(raw.toLowerCase(), hashedCodes[i]), true);
    assert.equal(verifyRecoveryCode(raw.replace(/-/g, ''), hashedCodes[i]), true);

    // Tampered code fails
    const tampered = raw.endsWith('X') ? raw.slice(0, -1) + 'Y' : raw.slice(0, -1) + 'X';
    assert.equal(verifyRecoveryCode(tampered, hashedCodes[i]), false);
  }

  // Backwards compatibility: verify previously generated 8-character codes still verify cleanly
  const legacyPlain = 'ABCD-EFGH';
  const legacyHash = '9ac2197d9258257b1ae8463e4214e4cd0a578bc1517f2415928b91be4283fc48'; // sha256('ABCDEFGH')
  assert.equal(verifyRecoveryCode(legacyPlain, legacyHash), true);
  assert.equal(verifyRecoveryCode('abcd-efgh', legacyHash), true);
  assert.equal(verifyRecoveryCode('ABCDEFGH', legacyHash), true);
});

test('generateOtpauthUri formats RFC standard URI with issuer and email', () => {
  const uri = generateOtpauthUri('admin@lamssa.clinic', 'JBSWY3DPEHPK3PXP', 'Lamssa');
  assert(uri.startsWith('otpauth://totp/Lamssa:admin%40lamssa.clinic?'));
  assert(uri.includes('secret=JBSWY3DPEHPK3PXP'));
  assert(uri.includes('issuer=Lamssa'));
  assert(uri.includes('digits=6'));
  assert(uri.includes('period=30'));
});

test('MfaCryptoService encrypts and decrypts TOTP secret at rest with AES-256-GCM', () => {
  const config = new ConfigService({
    AUTH_CSRF_SECRET: 'test-csrf-secret-key-material-at-least-43-chars-long-abc1234567890',
  });
  const cryptoService = new MfaCryptoService(config as any);

  const secret = Buffer.from('my-super-secret-totp-bytes');
  const enc = cryptoService.encryptSecret(secret);

  assert(enc.ciphertext);
  assert.equal(enc.iv.length, 24, '12 bytes IV in hex');
  assert.equal(enc.tag.length, 32, '16 bytes tag in hex');

  const dec = cryptoService.decryptSecret(enc.ciphertext, enc.iv, enc.tag);
  assert.deepEqual(dec, secret);

  // Tampered ciphertext fails closed
  const tamperedCipher = Buffer.from(enc.ciphertext, 'base64');
  tamperedCipher[0] ^= 0x01;
  assert.throws(() => cryptoService.decryptSecret(tamperedCipher.toString('base64'), enc.iv, enc.tag));

  // Tampered tag fails closed
  const tamperedTag = enc.tag.slice(0, -2) + '00';
  assert.throws(() => cryptoService.decryptSecret(enc.ciphertext, enc.iv, tamperedTag));
});

test('MfaCryptoService fails closed in production without MFA_ENCRYPTION_KEY and supports key rotation', () => {
  // Production requires MFA_ENCRYPTION_KEY
  const prodConfigWithoutKey = new ConfigService({
    NODE_ENV: 'production',
    AUTH_CSRF_SECRET: 'test-csrf-secret-key-material-at-least-43-chars-long-abc1234567890',
  });
  assert.throws(() => new MfaCryptoService(prodConfigWithoutKey as any), /MFA_ENCRYPTION_KEY is required/);

  // Key rotation: secrets encrypted under previous key can still be decrypted after rotation
  const oldKey = 'old-mfa-key-32-bytes-minimum-length-material!';
  const newKey = 'new-mfa-key-32-bytes-minimum-length-material!';

  const initialService = new MfaCryptoService(new ConfigService({
    NODE_ENV: 'production',
    MFA_ENCRYPTION_KEY: oldKey,
    AUTH_CSRF_SECRET: 'test-csrf-secret-key-material-at-least-43-chars-long-abc1234567890',
  }) as any);

  const testSecret = Buffer.from('secret-payload-across-rotation');
  const encryptedWithOld = initialService.encryptSecret(testSecret);

  // Now simulate rotation: new key is primary, old key is MFA_ENCRYPTION_KEY_PREVIOUS
  const rotatedService = new MfaCryptoService(new ConfigService({
    NODE_ENV: 'production',
    MFA_ENCRYPTION_KEY: newKey,
    MFA_ENCRYPTION_KEY_PREVIOUS: oldKey,
    AUTH_CSRF_SECRET: 'test-csrf-secret-key-material-at-least-43-chars-long-abc1234567890',
  }) as any);

  // Decryption succeeds via fallback key
  const decrypted = rotatedService.decryptSecret(encryptedWithOld.ciphertext, encryptedWithOld.iv, encryptedWithOld.tag);
  assert.deepEqual(decrypted, testSecret);

  // New encryptions use new key
  const encryptedWithNew = rotatedService.encryptSecret(testSecret);
  const decryptedNew = rotatedService.decryptSecret(encryptedWithNew.ciphertext, encryptedWithNew.iv, encryptedWithNew.tag);
  assert.deepEqual(decryptedNew, testSecret);
});

test('Session device summaries and IP masking preserve privacy and Arabic localization', () => {
  // Device summaries
  assert.equal(summarizeDevice('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0'), 'Chrome على Linux');
  assert.equal(summarizeDevice('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Firefox/121.0'), 'Firefox على Windows');
  assert.equal(summarizeDevice('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15'), 'Safari على macOS');
  assert.equal(summarizeDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/605.1.15'), 'Safari على iOS');
  assert.equal(summarizeDevice(null), 'متصفح غير معروف');

  // IP masking
  assert.equal(maskIpAddress('192.168.1.42'), '192.168.***.***');
  assert.equal(maskIpAddress('10.200.5.10'), '10.200.***.***');
  assert.equal(maskIpAddress('2001:0db8:85a3:0000:0000:8a2e:0370:7334'), '2001:0db8:***');
  assert.equal(maskIpAddress('127.0.0.1'), '127.0.***.***');
  assert.equal(maskIpAddress(null), 'مجهول');
});
