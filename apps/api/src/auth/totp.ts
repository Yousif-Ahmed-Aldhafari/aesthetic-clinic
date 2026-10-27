import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i];
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

export function base32Decode(str: string): Buffer {
  const clean = str.toUpperCase().replace(/[\s=-]/g, '');
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (let i = 0; i < clean.length; i++) {
    const idx = BASE32_ALPHABET.indexOf(clean[i]);
    if (idx === -1) {
      throw new Error(`Invalid base32 character: ${clean[i]}`);
    }
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

export function generateTotpSecret(numBytes = 20): { secretBytes: Buffer; base32Secret: string } {
  const secretBytes = randomBytes(numBytes);
  const base32Secret = base32Encode(secretBytes);
  return { secretBytes, base32Secret };
}

export function generateOtpauthUri(email: string, base32Secret: string, issuer = 'Lamssa'): string {
  const encodedIssuer = encodeURIComponent(issuer);
  const encodedEmail = encodeURIComponent(email);
  return `otpauth://totp/${encodedIssuer}:${encodedEmail}?secret=${base32Secret}&issuer=${encodedIssuer}&algorithm=SHA1&digits=6&period=30`;
}

export function generateTotp(secretBytes: Buffer, step?: bigint, digits = 6): string {
  const currentStep = step ?? BigInt(Math.floor(Date.now() / 1000 / 30));
  const buf = Buffer.alloc(8);
  buf.writeBigInt64BE(currentStep);
  const hmac = createHmac('sha1', secretBytes).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    ((hmac[offset] & 0x7f) << 24 |
      (hmac[offset + 1] & 0xff) << 16 |
      (hmac[offset + 2] & 0xff) << 8 |
      (hmac[offset + 3] & 0xff)) %
    Math.pow(10, digits);
  return code.toString().padStart(digits, '0');
}

export interface VerifyTotpOptions {
  stepWindow?: number; // default: 1 (+/- 1 step: 90s window)
  lastReplayStep?: bigint | null;
  timeMs?: number;
}

export function verifyTotp(
  secretBytes: Buffer,
  token: string,
  options: VerifyTotpOptions = {},
): { valid: boolean; step?: bigint; error?: string } {
  const normalized = token.trim().replace(/\s+/g, '');
  if (!/^\d{6}$/.test(normalized)) {
    return { valid: false, error: 'INVALID_FORMAT' };
  }

  const window = options.stepWindow ?? 1;
  const currentStep = BigInt(Math.floor((options.timeMs ?? Date.now()) / 1000 / 30));
  const tokenBuf = Buffer.from(normalized, 'utf8');

  for (let offset = -window; offset <= window; offset++) {
    const candidateStep = currentStep + BigInt(offset);
    const expectedOtp = generateTotp(secretBytes, candidateStep, 6);
    const expectedBuf = Buffer.from(expectedOtp, 'utf8');

    if (tokenBuf.length === expectedBuf.length && timingSafeEqual(tokenBuf, expectedBuf)) {
      if (options.lastReplayStep !== undefined && options.lastReplayStep !== null) {
        if (candidateStep <= options.lastReplayStep) {
          return { valid: false, error: 'REPLAYED_CODE' };
        }
      }
      return { valid: true, step: candidateStep };
    }
  }

  return { valid: false, error: 'INVALID_CODE' };
}

export function generateRecoveryCodes(count = 8): { plaintextCodes: string[]; hashedCodes: string[] } {
  const charset = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  const plaintextCodes: string[] = [];
  const hashedCodes: string[] = [];

  for (let i = 0; i < count; i++) {
    const bytes = randomBytes(16);
    let code = '';
    for (let j = 0; j < 16; j++) {
      code += charset[bytes[j] % charset.length];
    }
    const formatted = `${code.slice(0, 4)}-${code.slice(4, 8)}-${code.slice(8, 12)}-${code.slice(12, 16)}`;
    plaintextCodes.push(formatted);
    hashedCodes.push(hashRecoveryCode(formatted));
  }

  return { plaintextCodes, hashedCodes };
}

export function normalizeRecoveryCode(code: string): string {
  return code.toUpperCase().replace(/[\s-]/g, '').trim();
}

export function hashRecoveryCode(code: string): string {
  const normalized = normalizeRecoveryCode(code);
  return createHash('sha256').update(normalized, 'utf8').digest('hex');
}

export function verifyRecoveryCode(plaintext: string, expectedHash: string): boolean {
  const computed = hashRecoveryCode(plaintext);
  const bufA = Buffer.from(computed, 'hex');
  const bufB = Buffer.from(expectedHash, 'hex');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

