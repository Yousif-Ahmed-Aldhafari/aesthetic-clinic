import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from 'node:crypto';
import type { Environment } from '../config/environment.js';

@Injectable()
export class IntegrationCryptoService {
  private readonly primaryKey: Buffer;
  private readonly fallbackKeys: Buffer[] = [];

  constructor(private readonly config?: ConfigService<Environment, true>) {
    const nodeEnv = this.config?.get('NODE_ENV', { infer: true }) ?? process.env.NODE_ENV ?? 'development';
    const isProd = nodeEnv === 'production';
    const primaryEnv =
      this.config?.get('INTEGRATION_SECRETS_ENCRYPTION_KEY' as keyof Environment, { infer: true } as never) as string | undefined
      || process.env.INTEGRATION_SECRETS_ENCRYPTION_KEY;

    if (isProd && (!primaryEnv || primaryEnv.length < 32)) {
      throw new Error('INTEGRATION_SECRETS_ENCRYPTION_KEY is required and must be at least 32 characters in production');
    }

    const fallbackCsrf =
      (this.config?.get('AUTH_CSRF_SECRET', { infer: true }) as string | undefined)
      || process.env.AUTH_CSRF_SECRET
      || 'lamssa-dev-integration-secret-fallback-key';
    const primarySecret = primaryEnv || fallbackCsrf;

    this.primaryKey = Buffer.from(hkdfSync('sha256', primarySecret, '', 'lamssa-integration-secrets-v1', 32));

    const previousKey =
      (this.config?.get('INTEGRATION_SECRETS_ENCRYPTION_KEY_PREVIOUS' as keyof Environment, { infer: true } as never) as string | undefined)
      || process.env.INTEGRATION_SECRETS_ENCRYPTION_KEY_PREVIOUS;
    if (previousKey) {
      this.fallbackKeys.push(Buffer.from(hkdfSync('sha256', previousKey, '', 'lamssa-integration-secrets-v1', 32)));
    }
    if (!isProd && primaryEnv && fallbackCsrf !== primaryEnv) {
      this.fallbackKeys.push(Buffer.from(hkdfSync('sha256', fallbackCsrf, '', 'lamssa-integration-secrets-v1', 32)));
    }
  }

  encryptSecret(plaintext: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.primaryKey, iv);
    const encrypted = Buffer.concat([cipher.update(Buffer.from(plaintext, 'utf8')), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `v1:${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('base64')}`;
  }

  decryptSecret(packed: string): string {
    const parts = packed.split(':');
    if (parts.length !== 4 || parts[0] !== 'v1') {
      throw new Error('INVALID_ENCRYPTED_SECRET_FORMAT');
    }
    const iv = Buffer.from(parts[1], 'hex');
    const tag = Buffer.from(parts[2], 'hex');
    const ciphertext = Buffer.from(parts[3], 'base64');

    const keys = [this.primaryKey, ...this.fallbackKeys];
    let lastError: unknown;
    for (const key of keys) {
      try {
        const decipher = createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(tag);
        const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
        return decrypted.toString('utf8');
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError instanceof Error ? lastError : new Error('INTEGRATION_SECRET_DECRYPTION_FAILED');
  }

  fingerprintSecret(plaintext: string): string {
    const digest = createHash('sha256').update(plaintext, 'utf8').digest('hex').slice(0, 8);
    if (plaintext.length <= 8) return `****:${digest}`;
    return `${plaintext.slice(0, 3)}****${plaintext.slice(-3)}:${digest}`;
  }
}
