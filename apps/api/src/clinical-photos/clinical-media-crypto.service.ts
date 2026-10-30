import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';
import type { Environment } from '../config/environment.js';

@Injectable()
export class ClinicalMediaCryptoService {
  private readonly primaryKey: Buffer;
  private readonly fallbackKeys: Buffer[] = [];

  constructor(private readonly config: ConfigService<Environment, true>) {
    const isProd = this.config.get('NODE_ENV', { infer: true }) === 'production';
    const mediaKey = this.config.get('CLINICAL_MEDIA_ENCRYPTION_KEY', { infer: true }) || process.env.CLINICAL_MEDIA_ENCRYPTION_KEY;

    if (isProd && (!mediaKey || mediaKey.length < 32)) {
      throw new Error('CLINICAL_MEDIA_ENCRYPTION_KEY is required and must be at least 32 characters in production');
    }

    const primarySecret = mediaKey || this.config.get('AUTH_CSRF_SECRET', { infer: true });
    this.primaryKey = Buffer.from(hkdfSync('sha256', primarySecret, '', 'lamssa-clinical-media-encryption-v1', 32));

    const previousKey = this.config.get('CLINICAL_MEDIA_ENCRYPTION_KEY_PREVIOUS', { infer: true }) || process.env.CLINICAL_MEDIA_ENCRYPTION_KEY_PREVIOUS;
    if (previousKey) {
      this.fallbackKeys.push(Buffer.from(hkdfSync('sha256', previousKey, '', 'lamssa-clinical-media-encryption-v1', 32)));
    }

    if (!isProd && mediaKey) {
      const csrfFallback = this.config.get('AUTH_CSRF_SECRET', { infer: true });
      if (csrfFallback && csrfFallback !== mediaKey) {
        this.fallbackKeys.push(Buffer.from(hkdfSync('sha256', csrfFallback, '', 'lamssa-clinical-media-encryption-v1', 32)));
      }
    }
  }

  /**
   * Encrypts plaintext media buffer at rest using AES-256-GCM.
   * Binary layout: [12-byte IV][16-byte AuthTag][Ciphertext]
   */
  encryptMedia(plaintext: Buffer): Buffer {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.primaryKey, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const tag = cipher.getAuthTag();

    return Buffer.concat([iv, tag, ciphertext]);
  }

  /**
   * Decrypts encrypted media buffer with authenticated tag verification and tamper detection.
   */
  decryptMedia(payload: Buffer): Buffer {
    if (!payload || payload.length < 28) {
      throw new Error('Malformed encrypted media payload: insufficient header length');
    }

    const iv = payload.subarray(0, 12);
    const tag = payload.subarray(12, 28);
    const ciphertext = payload.subarray(28);

    const allKeys = [this.primaryKey, ...this.fallbackKeys];
    let lastError: unknown;

    for (const key of allKeys) {
      try {
        const decipher = createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(tag);
        return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
      } catch (err) {
        lastError = err;
      }
    }

    throw lastError ?? new Error('Decryption failed: authentication tag verification failed');
  }
}

