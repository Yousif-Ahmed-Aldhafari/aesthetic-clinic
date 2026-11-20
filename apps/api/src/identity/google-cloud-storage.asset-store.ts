import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import type { Environment } from '../config/environment.js';
import { AssetStore } from './asset-store.js';

export class StorageError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = 'StorageError';
  }
}

export class StorageNotFoundError extends StorageError {
  constructor(key: string) {
    super(`Object not found in Google Cloud Storage: ${key}`, 404);
    this.name = 'StorageNotFoundError';
  }
}

export class StorageAccessDeniedError extends StorageError {
  constructor(key: string) {
    super(`Access denied to Google Cloud Storage object: ${key}`, 403);
    this.name = 'StorageAccessDeniedError';
  }
}

export class StoragePathTraversalError extends StorageError {
  constructor(key: string) {
    super(`Path traversal attempt detected in storage key: ${key}`, 400);
    this.name = 'StoragePathTraversalError';
  }
}

export interface GoogleStorageTransport {
  upload(bucket: string, objectName: string, bytes: Buffer, contentType?: string, kmsKeyName?: string): Promise<void>;
  download(bucket: string, objectName: string): Promise<{ bytes: Buffer; contentType: string; metadata?: Record<string, string> }>;
  delete(bucket: string, objectName: string): Promise<void>;
  head(bucket: string, objectName: string): Promise<{ exists: boolean; size: number; contentType: string; sha256?: string; metadata?: Record<string, string> }>;
}

@Injectable()
export class GoogleCloudStorageAssetStore extends AssetStore {
  private readonly bucketName: string;
  private readonly kmsKeyName: string;
  private readonly endpoint: string;
  private customTransport?: GoogleStorageTransport;
  private readonly inMemoryStorage = new Map<string, { bytes: Buffer; contentType: string; metadata?: Record<string, string> }>();

  constructor(private readonly config: ConfigService<Environment, true>) {
    super();
    this.bucketName =
      this.config.get('GCP_STORAGE_BUCKET', { infer: true }) ||
      process.env.GCP_STORAGE_BUCKET ||
      'production-lamssa-clinical-assets';
    this.kmsKeyName =
      this.config.get('GCP_KMS_ASSET_KEY', { infer: true }) ||
      process.env.GCP_KMS_ASSET_KEY ||
      '';
    this.endpoint =
      this.config.get('GCP_STORAGE_ENDPOINT', { infer: true }) ||
      process.env.GCP_STORAGE_ENDPOINT ||
      'https://storage.googleapis.com';
  }

  setTransport(transport: GoogleStorageTransport): void {
    this.customTransport = transport;
  }

  validateKey(key: string): void {
    if (!key || typeof key !== 'string') {
      throw new BadRequestException('Asset storage key cannot be empty');
    }
    // Block path traversal
    if (key.includes('..') || key.startsWith('/') || key.startsWith('\\')) {
      throw new StoragePathTraversalError(key);
    }
    // Validate tenant-scoped layout: <clinicUuid>/<path>
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\//i;
    if (!uuidRegex.test(key)) {
      throw new BadRequestException(`Asset key must be tenant-scoped starting with a clinic UUID: ${key}`);
    }
  }

  async put(key: string, bytes: Buffer, metadata?: Record<string, string>): Promise<void> {
    this.validateKey(key);

    if (this.customTransport) {
      await this.customTransport.upload(this.bucketName, key, bytes, metadata?.contentType ?? 'application/octet-stream', this.kmsKeyName);
      return;
    }

    const isSimulated = process.env.GCS_SIMULATE === 'true' || this.endpoint.includes('localhost') || this.endpoint.includes('127.0.0.1');
    if (isSimulated) {
      this.inMemoryStorage.set(`${this.bucketName}/${key}`, {
        bytes: Buffer.from(bytes),
        contentType: metadata?.contentType ?? 'application/octet-stream',
        metadata,
      });
      return;
    }

    try {
      const url = `${this.endpoint}/upload/storage/v1/b/${this.bucketName}/o?uploadType=media&name=${encodeURIComponent(key)}`;
      const headers: Record<string, string> = {
        'Content-Type': metadata?.contentType ?? 'application/octet-stream',
      };
      if (this.kmsKeyName) {
        headers['x-goog-encryption-kms-key-name'] = this.kmsKeyName;
      }

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: new Uint8Array(bytes),
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) {
        if (response.status === 403) throw new StorageAccessDeniedError(key);
        throw new StorageError(`Upload to GCS failed: HTTP ${response.status}`, response.status);
      }
    } catch (err) {
      if (err instanceof StorageError) throw err;
      throw new ServiceUnavailableException(`GCS storage unavailable: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async read(key: string): Promise<Buffer> {
    this.validateKey(key);

    if (this.customTransport) {
      const res = await this.customTransport.download(this.bucketName, key);
      return res.bytes;
    }

    const isSimulated = process.env.GCS_SIMULATE === 'true' || this.endpoint.includes('localhost') || this.endpoint.includes('127.0.0.1');
    if (isSimulated) {
      const item = this.inMemoryStorage.get(`${this.bucketName}/${key}`);
      if (!item) throw new NotFoundException(`Asset not found in storage: ${key}`);
      return Buffer.from(item.bytes);
    }

    try {
      const url = `${this.endpoint}/storage/v1/b/${this.bucketName}/o/${encodeURIComponent(key)}?alt=media`;
      const response = await fetch(url, {
        method: 'GET',
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) {
        if (response.status === 404) throw new NotFoundException(`Asset not found: ${key}`);
        if (response.status === 403) throw new StorageAccessDeniedError(key);
        throw new StorageError(`Download from GCS failed: HTTP ${response.status}`, response.status);
      }

      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (err) {
      if (err instanceof NotFoundException) throw err;
      if (err instanceof StorageError) throw err;
      throw new ServiceUnavailableException(`GCS read unavailable: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async remove(key: string): Promise<void> {
    this.validateKey(key);

    if (this.customTransport) {
      await this.customTransport.delete(this.bucketName, key);
      return;
    }

    const isSimulated = process.env.GCS_SIMULATE === 'true' || this.endpoint.includes('localhost') || this.endpoint.includes('127.0.0.1');
    if (isSimulated) {
      this.inMemoryStorage.delete(`${this.bucketName}/${key}`);
      return;
    }

    try {
      const url = `${this.endpoint}/storage/v1/b/${this.bucketName}/o/${encodeURIComponent(key)}`;
      const response = await fetch(url, {
        method: 'DELETE',
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok && response.status !== 404) {
        if (response.status === 403) throw new StorageAccessDeniedError(key);
        throw new StorageError(`Delete from GCS failed: HTTP ${response.status}`, response.status);
      }
    } catch (err) {
      if (err instanceof StorageError) throw err;
      throw new ServiceUnavailableException(`GCS delete error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async exists(key: string): Promise<boolean> {
    this.validateKey(key);

    if (this.customTransport) {
      const meta = await this.customTransport.head(this.bucketName, key);
      return meta.exists;
    }

    const isSimulated = process.env.GCS_SIMULATE === 'true' || this.endpoint.includes('localhost') || this.endpoint.includes('127.0.0.1');
    if (isSimulated) {
      return this.inMemoryStorage.has(`${this.bucketName}/${key}`);
    }

    try {
      const url = `${this.endpoint}/storage/v1/b/${this.bucketName}/o/${encodeURIComponent(key)}`;
      const response = await fetch(url, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async getMetadata(key: string): Promise<{ size: number; contentType: string; sha256?: string; customMetadata?: Record<string, string> }> {
    this.validateKey(key);

    if (this.customTransport) {
      const meta = await this.customTransport.head(this.bucketName, key);
      if (!meta.exists) throw new NotFoundException(`Object '${key}' not found`);
      return {
        size: meta.size,
        contentType: meta.contentType,
        sha256: meta.sha256,
        customMetadata: meta.metadata,
      };
    }

    const isSimulated = process.env.GCS_SIMULATE === 'true' || this.endpoint.includes('localhost') || this.endpoint.includes('127.0.0.1');
    if (isSimulated) {
      const item = this.inMemoryStorage.get(`${this.bucketName}/${key}`);
      if (!item) throw new NotFoundException(`Object '${key}' not found in storage`);
      const sha256 = createHash('sha256').update(item.bytes).digest('hex');
      return {
        size: item.bytes.length,
        contentType: item.contentType,
        sha256,
        customMetadata: item.metadata,
      };
    }

    const buffer = await this.read(key);
    const sha256 = createHash('sha256').update(buffer).digest('hex');
    return {
      size: buffer.length,
      contentType: 'application/octet-stream',
      sha256,
    };
  }

  async getStream(key: string): Promise<Readable> {
    const bytes = await this.read(key);
    return Readable.from(bytes);
  }
}
