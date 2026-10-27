import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';
import type { Environment } from '../config/environment.js';

@Injectable()
export class MfaCryptoService {
  private readonly primaryKey: Buffer;
  private readonly fallbackKeys: Buffer[] = [];

  constructor(private readonly config: ConfigService<Environment, true>) {
    const isProd = this.config.get('NODE_ENV', { infer: true }) === 'production';
    const mfaKey = this.config.get('MFA_ENCRYPTION_KEY', { infer: true }) || process.env.MFA_ENCRYPTION_KEY;

    if (isProd && (!mfaKey || mfaKey.length < 32)) {
      throw new Error('MFA_ENCRYPTION_KEY is required and must be at least 32 characters in production');
    }

    const primarySecret = mfaKey || this.config.get('AUTH_CSRF_SECRET', { infer: true });
    this.primaryKey = Buffer.from(hkdfSync('sha256', primarySecret, '', 'lamssa-mfa-encryption-v1', 32));

    const previousKey = this.config.get('MFA_ENCRYPTION_KEY_PREVIOUS', { infer: true }) || process.env.MFA_ENCRYPTION_KEY_PREVIOUS;
    if (previousKey) {
      this.fallbackKeys.push(Buffer.from(hkdfSync('sha256', previousKey, '', 'lamssa-mfa-encryption-v1', 32)));
    }

    // In non-production, if a dedicated MFA_ENCRYPTION_KEY was provided, also retain CSRF fallback so dev test fixtures stay readable
    if (!isProd && mfaKey) {
      const csrfFallback = this.config.get('AUTH_CSRF_SECRET', { infer: true });
      if (csrfFallback && csrfFallback !== mfaKey) {
        this.fallbackKeys.push(Buffer.from(hkdfSync('sha256', csrfFallback, '', 'lamssa-mfa-encryption-v1', 32)));
      }
    }
  }

  encryptSecret(secretBytes: Buffer): { ciphertext: string; iv: string; tag: string } {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.primaryKey, iv);
    const encrypted = Buffer.concat([cipher.update(secretBytes), cipher.final()]);
    const tag = cipher.getAuthTag();

    return {
      ciphertext: encrypted.toString('base64'),
      iv: iv.toString('hex'),
      tag: tag.toString('hex'),
    };
  }

  decryptSecret(ciphertext: string, ivHex: string, tagHex: string): Buffer {
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    const cipherBuf = Buffer.from(ciphertext, 'base64');

    const allKeys = [this.primaryKey, ...this.fallbackKeys];
    let lastError: unknown;

    for (const key of allKeys) {
      try {
        const decipher = createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(tag);
        return Buffer.concat([decipher.update(cipherBuf), decipher.final()]);
      } catch (err) {
        lastError = err;
      }
    }

    throw lastError ?? new Error('Decryption failed');
  }
}

