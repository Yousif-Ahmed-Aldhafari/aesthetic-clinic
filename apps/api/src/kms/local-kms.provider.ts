import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';
import type { Environment } from '../config/environment.js';
import type { KeyWrappingResult, KmsHealthReport, KmsProvider } from './kms.types.js';

@Injectable()
export class LocalKmsProvider implements KmsProvider {
  public readonly providerName = 'local';
  private readonly masterKey: string;

  constructor(private readonly config: ConfigService<Environment, true>) {
    const isProd = this.config.get('NODE_ENV', { infer: true }) === 'production';
    const localKey = this.config.get('KMS_LOCAL_MASTER_KEY', { infer: true }) || process.env.KMS_LOCAL_MASTER_KEY;

    if (isProd && (!localKey || localKey.length < 32)) {
      throw new Error('KMS_LOCAL_MASTER_KEY is required and must be at least 32 characters in production when KMS_PROVIDER is local');
    }

    this.masterKey = localKey
      || this.config.get('AUTH_CSRF_SECRET', { infer: true })
      || 'dev-local-kms-master-key-32-bytes-minimum!';
  }

  private deriveKeyMaterial(keyId: string): Buffer {
    return Buffer.from(
      hkdfSync('sha256', this.masterKey, keyId, `lamssa-kms-kek-v1:${keyId}`, 32),
    );
  }

  async wrapKey(keyId: string, plaintextDek: Buffer): Promise<KeyWrappingResult> {
    if (!plaintextDek || plaintextDek.length !== 32) {
      throw new Error('Plaintext DEK must be exactly 32 bytes (256-bit)');
    }

    const kek = this.deriveKeyMaterial(keyId);
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', kek, iv);
    cipher.setAAD(Buffer.from(keyId, 'utf8'));

    const wrapped = Buffer.concat([cipher.update(plaintextDek), cipher.final()]);
    const tag = cipher.getAuthTag();

    // Clean derived key material from memory
    kek.fill(0);

    return {
      keyId,
      wrappedKey: wrapped.toString('base64'),
      algorithm: 'AES_256_GCM',
      iv: iv.toString('hex'),
      tag: tag.toString('hex'),
    };
  }

  async unwrapKey(keyId: string, wrapping: KeyWrappingResult): Promise<Buffer> {
    if (!wrapping.wrappedKey || !wrapping.iv || !wrapping.tag) {
      throw new Error('Malformed key wrapping payload: missing iv, tag or ciphertext');
    }

    const kek = this.deriveKeyMaterial(keyId);
    const iv = Buffer.from(wrapping.iv, 'hex');
    const tag = Buffer.from(wrapping.tag, 'hex');
    const ciphertext = Buffer.from(wrapping.wrappedKey, 'base64');

    try {
      const decipher = createDecipheriv('aes-256-gcm', kek, iv);
      decipher.setAAD(Buffer.from(keyId, 'utf8'));
      decipher.setAuthTag(tag);

      const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
      if (plaintext.length !== 32) {
        plaintext.fill(0);
        throw new Error('Unwrapped key length mismatch: expected 32 bytes');
      }
      return plaintext;
    } finally {
      kek.fill(0);
    }
  }

  async healthCheck(): Promise<KmsHealthReport> {
    const start = performance.now();
    try {
      const testKeyId = 'lamssa/kek/health-check';
      const testDek = randomBytes(32);
      const wrapped = await this.wrapKey(testKeyId, testDek);
      const unwrapped = await this.unwrapKey(testKeyId, wrapped);

      const match = testDek.equals(unwrapped);
      testDek.fill(0);
      unwrapped.fill(0);

      const latencyMs = Math.round((performance.now() - start) * 100) / 100;
      if (!match) {
        return {
          ok: false,
          provider: this.providerName,
          activeKeyId: null,
          activeKeyVersion: null,
          activeKeyState: null,
          latencyMs,
          error: 'DEK round-trip verification failed in health check',
        };
      }

      return {
        ok: true,
        provider: this.providerName,
        activeKeyId: null,
        activeKeyVersion: null,
        activeKeyState: null,
        latencyMs,
      };
    } catch (err) {
      const latencyMs = Math.round((performance.now() - start) * 100) / 100;
      return {
        ok: false,
        provider: this.providerName,
        activeKeyId: null,
        activeKeyVersion: null,
        activeKeyState: null,
        latencyMs,
        error: err instanceof Error ? err.message : 'Unknown health check error',
      };
    }
  }
}
