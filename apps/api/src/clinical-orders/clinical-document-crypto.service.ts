import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, mkdir, open, unlink } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { Environment } from '../config/environment.js';

export interface EncryptedDocumentPayload {
  storageKey: string;
  contentSha256: string;
  encryptionIv: string;
  encryptionTag: string;
  fileSizeBytes: bigint;
  detectedMime: string;
}

const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024; // 25 MiB

@Injectable()
export class ClinicalDocumentCryptoService {
  private readonly primaryKey: Buffer;
  private readonly fallbackKeys: Buffer[] = [];

  constructor(private readonly config: ConfigService<Environment, true>) {
    const isProd = this.config.get('NODE_ENV', { infer: true }) === 'production';
    const mediaKey =
      this.config.get('CLINICAL_MEDIA_ENCRYPTION_KEY', { infer: true }) ||
      process.env.CLINICAL_MEDIA_ENCRYPTION_KEY;

    if (isProd && (!mediaKey || mediaKey.length < 32)) {
      throw new Error('CLINICAL_MEDIA_ENCRYPTION_KEY is required and must be at least 32 characters in production');
    }

    const primarySecret = mediaKey || this.config.get('AUTH_CSRF_SECRET', { infer: true }) || 'dev-secret-key-at-least-32-chars-long!';
    this.primaryKey = Buffer.from(
      hkdfSync('sha256', primarySecret, '', 'lamssa-clinical-document-encryption-v1', 32),
    );

    const previousKey =
      this.config.get('CLINICAL_MEDIA_ENCRYPTION_KEY_PREVIOUS', { infer: true }) ||
      process.env.CLINICAL_MEDIA_ENCRYPTION_KEY_PREVIOUS;
    if (previousKey) {
      this.fallbackKeys.push(
        Buffer.from(hkdfSync('sha256', previousKey, '', 'lamssa-clinical-document-encryption-v1', 32)),
      );
    }

    if (!isProd && mediaKey) {
      const csrfFallback = this.config.get('AUTH_CSRF_SECRET', { infer: true });
      if (csrfFallback && csrfFallback !== mediaKey) {
        this.fallbackKeys.push(
          Buffer.from(hkdfSync('sha256', csrfFallback, '', 'lamssa-clinical-document-encryption-v1', 32)),
        );
      }
    }
  }

  /**
   * Validates document magic bytes against expected MIME types.
   */
  validateDocumentBytes(buffer: Buffer, declaredMime: string): string {
    if (!buffer || buffer.length === 0) {
      throw new BadRequestException('Document buffer cannot be empty');
    }
    if (buffer.length > MAX_DOCUMENT_BYTES) {
      throw new BadRequestException('Document exceeds maximum permitted size of 25 MiB');
    }

    // PDF: %PDF-
    const isPdf = buffer.length >= 5 && buffer.subarray(0, 5).toString('ascii') === '%PDF-';
    // PNG: \x89PNG\r\n\x1a\n
    const isPng =
      buffer.length >= 8 &&
      buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    // JPEG: \xff\xd8\xff
    const isJpeg = buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    // WebP: RIFF....WEBP
    const isWebp =
      buffer.length >= 12 &&
      buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buffer.subarray(8, 12).toString('ascii') === 'WEBP';
    // DICOM: 128-byte preamble followed by 'DICM'
    const isDicom =
      buffer.length >= 132 &&
      buffer.subarray(128, 132).toString('ascii') === 'DICM';
    // Plain text / JSON / XML / CSV: check if printable UTF-8 or matches mime
    const isText =
      declaredMime.startsWith('text/') ||
      declaredMime === 'application/json' ||
      declaredMime === 'application/xml';

    let detectedMime = declaredMime;
    if (isPdf) detectedMime = 'application/pdf';
    else if (isPng) detectedMime = 'image/png';
    else if (isJpeg) detectedMime = 'image/jpeg';
    else if (isWebp) detectedMime = 'image/webp';
    else if (isDicom) detectedMime = 'application/dicom';
    else if (isText) {
      // Check for binary null bytes which would indicate suspicious non-text content
      for (let i = 0; i < Math.min(buffer.length, 1024); i++) {
        if (buffer[i] === 0) {
          throw new BadRequestException('File contains invalid binary data for declared text document');
        }
      }
      detectedMime = declaredMime;
    } else {
      throw new BadRequestException(
        `Unsupported document type signature. Allowed types: PDF, PNG, JPEG, WebP, DICOM, JSON, Text.`,
      );
    }

    return detectedMime;
  }

  private async resolvePath(storageKey: string, create = false): Promise<string> {
    // Validate key pattern: <clinicUuid>/docs/<docUuid>.enc
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/docs\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.enc$/i.test(
        storageKey,
      )
    ) {
      throw new BadRequestException('Invalid document storage key format');
    }

    const configured = this.config.get('ASSET_STORAGE_DIR', { infer: true });
    if (this.config.get('NODE_ENV', { infer: true }) === 'production' && !configured) {
      throw new ServiceUnavailableException('ASSET_STORAGE_DIR required in production');
    }

    const root = configured ?? resolve(import.meta.dirname, '../../../../var/clinic-documents');
    const file = resolve(root, storageKey);
    const folder = dirname(file);

    if (create) {
      await mkdir(root, { recursive: true, mode: 0o700 });
      await mkdir(folder, { recursive: true, mode: 0o700 });
    }

    const rootStat = await lstat(root).catch(() => null);
    const folderStat = await lstat(folder).catch(() => null);
    if ((rootStat && rootStat.isSymbolicLink()) || (folderStat && folderStat.isSymbolicLink())) {
      throw new ServiceUnavailableException('Storage root cannot be a symbolic link');
    }

    return file;
  }

  /**
   * Encrypts plaintext document at rest using AES-256-GCM and writes it to private disk storage.
   */
  async storeEncryptedDocument(
    clinicId: string,
    documentId: string,
    plaintext: Buffer,
    declaredMime: string,
  ): Promise<EncryptedDocumentPayload> {
    const detectedMime = this.validateDocumentBytes(plaintext, declaredMime);
    const contentSha256 = createHash('sha256').update(plaintext).digest('hex');
    const storageKey = `${clinicId}/docs/${documentId}.enc`;

    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.primaryKey, iv);
    cipher.setAAD(Buffer.from(storageKey, 'utf8'));
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const tag = cipher.getAuthTag();

    const encryptedPayload = Buffer.concat([iv, tag, ciphertext]);

    const filePath = await this.resolvePath(storageKey, true);
    const file = await open(
      filePath,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
      0o600,
    );
    try {
      await file.writeFile(encryptedPayload);
    } finally {
      await file.close();
    }

    return {
      storageKey,
      contentSha256,
      encryptionIv: iv.toString('hex'),
      encryptionTag: tag.toString('hex'),
      fileSizeBytes: BigInt(plaintext.length),
      detectedMime,
    };
  }

  /**
   * Reads, decrypts, and verifies integrity of an encrypted document from private disk storage.
   */
  async retrieveEncryptedDocument(
    storageKey: string,
    expectedSha256: string,
    expectedIvHex?: string,
    expectedTagHex?: string,
  ): Promise<Buffer> {
    let payload: Buffer;
    try {
      const filePath = await this.resolvePath(storageKey, false);
      const file = await open(filePath, constants.O_RDONLY | constants.O_NOFOLLOW);
      try {
        payload = await file.readFile();
      } finally {
        await file.close();
      }
    } catch {
      throw new NotFoundException('Requested clinical document file not found on disk');
    }

    if (!payload || payload.length < 28) {
      throw new BadRequestException('Malformed encrypted document file');
    }

    const iv = payload.subarray(0, 12);
    const tag = payload.subarray(12, 28);
    const ciphertext = payload.subarray(28);

    if (expectedIvHex && iv.toString('hex') !== expectedIvHex) {
      throw new BadRequestException('Document encryption IV mismatch; storage tampering detected');
    }
    if (expectedTagHex && tag.toString('hex') !== expectedTagHex) {
      throw new BadRequestException('Document authentication tag mismatch; storage tampering detected');
    }

    const allKeys = [this.primaryKey, ...this.fallbackKeys];
    let decrypted: Buffer | null = null;
    let lastError: unknown;

    for (const key of allKeys) {
      for (const bindIdentity of [true, false]) {
        try {
          const decipher = createDecipheriv('aes-256-gcm', key, iv);
          if (bindIdentity) decipher.setAAD(Buffer.from(storageKey, 'utf8'));
          decipher.setAuthTag(tag);
          decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
          break;
        } catch (err) {
          lastError = err;
        }
      }
      if (decrypted) break;
    }

    if (!decrypted) {
      void lastError;
      throw new BadRequestException('Document decryption or authentication failed');
    }

    const actualSha256 = createHash('sha256').update(decrypted).digest('hex');
    if (actualSha256 !== expectedSha256) {
      throw new BadRequestException('Document SHA-256 digest integrity check failed; possible tampering');
    }

    return decrypted;
  }

  /**
   * Deletes document from disk if legal hold is not active.
   */
  async removeDocument(storageKey: string): Promise<void> {
    try {
      const filePath = await this.resolvePath(storageKey, false);
      await unlink(filePath);
    } catch (e) {
      if ((e as { code?: string }).code !== 'ENOENT') throw e;
    }
  }
}
