import {
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
} from 'node:crypto';
import type { Environment } from '../config/environment.js';
import { KeyManagementService } from './key-management.service.js';
import type { KeyWrappingResult } from './kms.types.js';

export interface EncryptionContext {
  clinicId?: string | null;
  resourceType: string;
  recordId: string;
}

@Injectable()
export class EnvelopeEncryptionService {
  private readonly logger = new Logger(EnvelopeEncryptionService.name);
  private readonly legacyPrimaryKeys: Buffer[] = [];

  constructor(
    private readonly kms: KeyManagementService,
    private readonly config: ConfigService<Environment, true>,
  ) {
    // Populate legacy v1 fallback keys for backward compatibility
    const csrf = this.config.get('AUTH_CSRF_SECRET', { infer: true });
    if (csrf) {
      // Integration secrets legacy HKDF
      this.legacyPrimaryKeys.push(
        Buffer.from(hkdfSync('sha256', csrf, '', 'lamssa-integration-secrets-v1', 32)),
      );
      // MFA secrets legacy HKDF
      this.legacyPrimaryKeys.push(
        Buffer.from(hkdfSync('sha256', csrf, '', 'lamssa-mfa-encryption-v1', 32)),
      );
      // Clinical document/media legacy HKDF
      this.legacyPrimaryKeys.push(
        Buffer.from(hkdfSync('sha256', csrf, '', 'lamssa-clinical-document-encryption-v1', 32)),
      );
    }
  }

  private buildAad(context?: EncryptionContext): string {
    if (!context) return 'lamssa:envelope:v2';
    const clinic = context.clinicId ?? 'global';
    return `${clinic}:${context.resourceType}:${context.recordId}`;
  }

  async encrypt(
    plaintext: string | Buffer,
    context?: EncryptionContext,
  ): Promise<string> {
    const activeKey = await this.kms.getActiveKey();
    const dek = randomBytes(32);
    const iv = randomBytes(12);

    try {
      const aadString = this.buildAad(context);
      const aad = Buffer.from(aadString, 'utf8');

      const cipher = createCipheriv('aes-256-gcm', dek, iv);
      cipher.setAAD(aad);

      const payload = typeof plaintext === 'string' ? Buffer.from(plaintext, 'utf8') : plaintext;
      const ciphertext = Buffer.concat([cipher.update(payload), cipher.final()]);
      const tag = cipher.getAuthTag();

      // Wrap the DEK with active KEK
      const wrapping = await this.kms.wrapDek(activeKey.keyId, dek);

      // Compact serialized envelope format:
      // v2:<keyId>:<wrappedDekBase64>:<ivHex>:<tagHex>:<ciphertextBase64>:<wrappedIvHex>:<wrappedTagHex>
      return [
        'v2',
        encodeURIComponent(activeKey.keyId),
        wrapping.wrappedKey,
        iv.toString('hex'),
        tag.toString('hex'),
        ciphertext.toString('base64'),
        wrapping.iv ?? '',
        wrapping.tag ?? '',
      ].join(':');
    } finally {
      // Zero out raw DEK in memory
      dek.fill(0);
    }
  }

  async decrypt(
    packed: string,
    context?: EncryptionContext,
  ): Promise<string> {
    if (!packed || typeof packed !== 'string') {
      throw new BadRequestException('Ciphertext payload is empty or invalid');
    }

    // Check envelope version
    if (packed.startsWith('v2:')) {
      return this.decryptV2(packed, context);
    }

    if (packed.startsWith('v1:')) {
      return this.decryptLegacyV1(packed);
    }

    throw new BadRequestException('Unrecognized cryptographic envelope format');
  }

  private async decryptV2(
    packed: string,
    context?: EncryptionContext,
  ): Promise<string> {
    const parts = packed.split(':');
    if (parts.length !== 8) {
      throw new BadRequestException('Malformed v2 cryptographic envelope');
    }

    const [, encodedKeyId, wrappedDekBase64, ivHex, tagHex, ciphertextBase64, wrappedIvHex, wrappedTagHex] = parts;
    const keyId = decodeURIComponent(encodedKeyId);

    const wrapping: KeyWrappingResult = {
      keyId,
      wrappedKey: wrappedDekBase64,
      algorithm: 'AES_256_GCM',
      iv: wrappedIvHex || undefined,
      tag: wrappedTagHex || undefined,
    };

    // Unwrap DEK using KMS
    const dek = await this.kms.unwrapDek(keyId, wrapping);

    try {
      const iv = Buffer.from(ivHex, 'hex');
      const tag = Buffer.from(tagHex, 'hex');
      const ciphertext = Buffer.from(ciphertextBase64, 'base64');
      const aad = Buffer.from(this.buildAad(context), 'utf8');

      const decipher = createDecipheriv('aes-256-gcm', dek, iv);
      decipher.setAAD(aad);
      decipher.setAuthTag(tag);

      const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
      return plaintext.toString('utf8');
    } catch (err) {
      this.logger.error('Failed to decrypt envelope ciphertext with unwrapped DEK', err instanceof Error ? err.message : String(err));
      throw new BadRequestException('Failed to authenticate and decrypt ciphertext payload');
    } finally {
      dek.fill(0);
    }
  }

  private decryptLegacyV1(packed: string): string {
    const parts = packed.split(':');
    if (parts.length !== 4) {
      throw new BadRequestException('Malformed legacy v1 ciphertext format');
    }

    const [, ivHex, tagHex, ciphertextBase64] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    const ciphertext = Buffer.from(ciphertextBase64, 'base64');

    let lastError: unknown;
    for (const key of this.legacyPrimaryKeys) {
      try {
        const decipher = createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(tag);
        const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
        return decrypted.toString('utf8');
      } catch (err) {
        lastError = err;
      }
    }

    if (lastError instanceof Error) {
      this.logger.debug(`Legacy v1 decryption attempted and failed: ${lastError.message}`);
    }
    throw new BadRequestException('Legacy v1 decryption failed; no valid key matched');
  }

  isLegacyFormat(packed: string): boolean {
    return typeof packed === 'string' && packed.startsWith('v1:');
  }

  extractKeyId(packed: string): string | null {
    if (!packed || !packed.startsWith('v2:')) return null;
    const parts = packed.split(':');
    return parts.length >= 2 ? decodeURIComponent(parts[1]) : null;
  }
}
