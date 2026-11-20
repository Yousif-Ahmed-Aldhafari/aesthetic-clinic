import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';
import type { Environment } from '../config/environment.js';
import type { KeyWrappingResult, KmsHealthReport, KmsProvider } from './kms.types.js';

export class GoogleKmsError extends Error {
  constructor(message: string, public readonly status?: number, public readonly cause?: unknown) {
    super(message);
    this.name = 'GoogleKmsError';
  }
}

export class KmsKeyDisabledError extends GoogleKmsError {
  constructor(keyName: string) {
    super(`Google Cloud KMS key is DISABLED: ${keyName}`, 400);
    this.name = 'KmsKeyDisabledError';
  }
}

export class KmsKeyRevokedError extends GoogleKmsError {
  constructor(keyName: string) {
    super(`Google Cloud KMS key is DESTROYED/REVOKED: ${keyName}`, 400);
    this.name = 'KmsKeyRevokedError';
  }
}

export class KmsPermissionDeniedError extends GoogleKmsError {
  constructor(keyName: string) {
    super(`Permission denied accessing Google Cloud KMS key: ${keyName}`, 403);
    this.name = 'KmsPermissionDeniedError';
  }
}

export class KmsNotFoundError extends GoogleKmsError {
  constructor(keyName: string) {
    super(`Google Cloud KMS key not found: ${keyName}`, 404);
    this.name = 'KmsNotFoundError';
  }
}

export interface GoogleKmsTransport {
  encrypt(keyName: string, plaintext: Buffer, aad?: Buffer): Promise<{ ciphertext: Buffer }>;
  decrypt(keyName: string, ciphertext: Buffer, aad?: Buffer): Promise<{ plaintext: Buffer }>;
  getKeyStatus(keyName: string): Promise<{ state: string; protectionLevel: string }>;
}

@Injectable()
export class GoogleCloudKmsProvider implements KmsProvider {
  public readonly providerName = 'google-cloud-kms';

  private readonly projectId: string;
  private readonly location: string;
  private readonly keyRing: string;
  private readonly defaultCryptoKey: string;
  private readonly endpoint: string;
  private customTransport?: GoogleKmsTransport;

  constructor(private readonly config: ConfigService<Environment, true>) {
    this.projectId =
      this.config.get('GCP_PROJECT_ID', { infer: true }) ||
      process.env.GCP_PROJECT_ID ||
      process.env.GOOGLE_CLOUD_PROJECT ||
      'lamssa-cloud';
    this.location =
      this.config.get('GCP_KMS_LOCATION', { infer: true }) ||
      process.env.GCP_KMS_LOCATION ||
      'me-central2';
    this.keyRing =
      this.config.get('GCP_KMS_KEY_RING', { infer: true }) ||
      process.env.GCP_KMS_KEY_RING ||
      'production-lamssa-keyring';
    this.defaultCryptoKey =
      this.config.get('GCP_KMS_CRYPTO_KEY', { infer: true }) ||
      process.env.GCP_KMS_CRYPTO_KEY ||
      'production-lamssa-database-kek';
    this.endpoint =
      this.config.get('GCP_KMS_ENDPOINT', { infer: true }) ||
      process.env.GCP_KMS_ENDPOINT ||
      'https://cloudkms.googleapis.com';
  }

  setTransport(transport: GoogleKmsTransport): void {
    this.customTransport = transport;
  }

  canonicalKeyName(keyId: string): string {
    if (keyId.startsWith('projects/')) {
      return keyId;
    }
    const cleanKey = keyId.replace(/^lamssa\//, '').replace(/\//g, '-');
    return `projects/${this.projectId}/locations/${this.location}/keyRings/${this.keyRing}/cryptoKeys/${cleanKey || this.defaultCryptoKey}`;
  }

  async wrapKey(keyId: string, plaintextDek: Buffer): Promise<KeyWrappingResult> {
    if (!plaintextDek || plaintextDek.length !== 32) {
      throw new GoogleKmsError('Plaintext DEK must be exactly 32 bytes (256-bit)');
    }

    const keyName = this.canonicalKeyName(keyId);
    const aad = Buffer.from(keyName, 'utf8');

    try {
      if (this.customTransport) {
        const result = await this.customTransport.encrypt(keyName, plaintextDek, aad);
        return {
          keyId,
          wrappedKey: result.ciphertext.toString('base64'),
          algorithm: 'AES_256_GCM',
        };
      }

      // Check if simulated emulator mode is active
      const isSimulated = process.env.KMS_GCP_SIMULATE === 'true' || this.endpoint.includes('localhost') || this.endpoint.includes('127.0.0.1');
      if (isSimulated) {
        const simKek = Buffer.from(hkdfSync('sha256', Buffer.from(keyName, 'utf8'), 'salt-sim', 'gcp-kms-sim', 32));
        const iv = randomBytes(12);
        const cipher = createCipheriv('aes-256-gcm', simKek, iv);
        cipher.setAAD(aad);
        const ciphertext = Buffer.concat([cipher.update(plaintextDek), cipher.final()]);
        const tag = cipher.getAuthTag();
        simKek.fill(0);
        return {
          keyId,
          wrappedKey: ciphertext.toString('base64'),
          algorithm: 'AES_256_GCM',
          iv: iv.toString('hex'),
          tag: tag.toString('hex'),
        };
      }

      // Live Google Cloud KMS HTTP call
      const url = `${this.endpoint}/v1/${keyName}:encrypt`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-User-Project': this.projectId,
        },
        body: JSON.stringify({
          plaintext: plaintextDek.toString('base64'),
          additionalAuthenticatedData: aad.toString('base64'),
        }),
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        if (response.status === 403) throw new KmsPermissionDeniedError(keyName);
        if (response.status === 404) throw new KmsNotFoundError(keyName);
        if (response.status === 400 && errorText.includes('DISABLED')) throw new KmsKeyDisabledError(keyName);
        if (response.status === 400 && (errorText.includes('DESTROYED') || errorText.includes('REVOKED'))) throw new KmsKeyRevokedError(keyName);
        throw new GoogleKmsError(`Cloud KMS wrap failed: HTTP ${response.status} - ${errorText}`, response.status);
      }

      const body = (await response.json()) as { ciphertext: string };
      return {
        keyId,
        wrappedKey: body.ciphertext,
        algorithm: 'AES_256_GCM',
      };
    } catch (err) {
      if (err instanceof GoogleKmsError) throw err;
      throw new GoogleKmsError(`Cloud KMS wrap failed: ${err instanceof Error ? err.message : String(err)}`, 500, err);
    }
  }

  async unwrapKey(keyId: string, wrapping: KeyWrappingResult): Promise<Buffer> {
    if (!wrapping.wrappedKey) {
      throw new GoogleKmsError('Malformed key wrapping result: missing wrappedKey ciphertext');
    }

    const keyName = this.canonicalKeyName(keyId);
    const aad = Buffer.from(keyName, 'utf8');

    try {
      if (this.customTransport) {
        const result = await this.customTransport.decrypt(keyName, Buffer.from(wrapping.wrappedKey, 'base64'), aad);
        return result.plaintext;
      }

      const isSimulated = process.env.KMS_GCP_SIMULATE === 'true' || this.endpoint.includes('localhost') || this.endpoint.includes('127.0.0.1');
      if (isSimulated) {
        if (!wrapping.iv || !wrapping.tag) {
          throw new GoogleKmsError('Simulated wrap missing IV or auth tag');
        }
        const simKek = Buffer.from(hkdfSync('sha256', Buffer.from(keyName, 'utf8'), 'salt-sim', 'gcp-kms-sim', 32));
        const decipher = createDecipheriv('aes-256-gcm', simKek, Buffer.from(wrapping.iv, 'hex'));
        decipher.setAAD(aad);
        decipher.setAuthTag(Buffer.from(wrapping.tag, 'hex'));
        const plaintext = Buffer.concat([decipher.update(Buffer.from(wrapping.wrappedKey, 'base64')), decipher.final()]);
        simKek.fill(0);
        return plaintext;
      }

      const url = `${this.endpoint}/v1/${keyName}:decrypt`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-User-Project': this.projectId,
        },
        body: JSON.stringify({
          ciphertext: wrapping.wrappedKey,
          additionalAuthenticatedData: aad.toString('base64'),
        }),
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        if (response.status === 403) throw new KmsPermissionDeniedError(keyName);
        if (response.status === 404) throw new KmsNotFoundError(keyName);
        if (response.status === 400 && errorText.includes('DISABLED')) throw new KmsKeyDisabledError(keyName);
        if (response.status === 400 && (errorText.includes('DESTROYED') || errorText.includes('REVOKED'))) throw new KmsKeyRevokedError(keyName);
        throw new GoogleKmsError(`Cloud KMS unwrap failed: HTTP ${response.status} - ${errorText}`, response.status);
      }

      const body = (await response.json()) as { plaintext: string };
      return Buffer.from(body.plaintext, 'base64');
    } catch (err) {
      if (err instanceof GoogleKmsError) throw err;
      throw new GoogleKmsError(`Cloud KMS unwrap failed: ${err instanceof Error ? err.message : String(err)}`, 500, err);
    }
  }

  async healthCheck(): Promise<KmsHealthReport> {
    const start = performance.now();
    const keyName = this.canonicalKeyName(this.defaultCryptoKey);

    try {
      if (this.customTransport) {
        const status = await this.customTransport.getKeyStatus(keyName);
        return {
          ok: status.state === 'ENABLED',
          provider: this.providerName,
          activeKeyId: keyName,
          activeKeyVersion: 1,
          activeKeyState: status.state === 'ENABLED' ? 'ACTIVE' : 'DISABLED',
          latencyMs: Math.round((performance.now() - start) * 100) / 100,
          details: { protectionLevel: status.protectionLevel },
        };
      }

      // Quick roundtrip verification using a temporary 32-byte DEK
      const testDek = randomBytes(32);
      const wrapped = await this.wrapKey(keyName, testDek);
      const unwrapped = await this.unwrapKey(keyName, wrapped);
      const matches = testDek.equals(unwrapped);
      testDek.fill(0);
      unwrapped.fill(0);

      const latencyMs = Math.round((performance.now() - start) * 100) / 100;
      return {
        ok: matches,
        provider: this.providerName,
        activeKeyId: keyName,
        activeKeyVersion: 1,
        activeKeyState: matches ? 'ACTIVE' : 'DISABLED',
        latencyMs,
        details: { region: this.location },
      };
    } catch (err) {
      const latencyMs = Math.round((performance.now() - start) * 100) / 100;
      return {
        ok: false,
        provider: this.providerName,
        activeKeyId: keyName,
        activeKeyVersion: null,
        activeKeyState: null,
        latencyMs,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}
