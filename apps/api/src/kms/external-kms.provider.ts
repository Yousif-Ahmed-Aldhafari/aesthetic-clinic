import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Environment } from '../config/environment.js';
import type { KeyWrappingResult, KmsHealthReport, KmsProvider } from './kms.types.js';

export class KmsExternalError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'KmsExternalError';
  }
}

@Injectable()
export class ExternalKmsProvider implements KmsProvider {
  public readonly providerName = 'external';
  private readonly logger = new Logger(ExternalKmsProvider.name);
  private readonly endpoint: string;
  private readonly defaultKeyId: string;
  private readonly region: string;

  constructor(private readonly config: ConfigService<Environment, true>) {
    this.endpoint =
      this.config.get('KMS_EXTERNAL_ENDPOINT', { infer: true }) ||
      process.env.KMS_EXTERNAL_ENDPOINT ||
      '';
    this.defaultKeyId =
      this.config.get('KMS_EXTERNAL_KEY_ID', { infer: true }) ||
      process.env.KMS_EXTERNAL_KEY_ID ||
      '';
    this.region =
      this.config.get('KMS_EXTERNAL_REGION', { infer: true }) ||
      process.env.KMS_EXTERNAL_REGION ||
      'me-central2';

    if (!this.endpoint) {
      this.logger.warn('External KMS provider initialized without an explicit KMS_EXTERNAL_ENDPOINT; fail-closed behavior will reject cryptographic operations');
    }
  }

  async wrapKey(keyId: string, plaintextDek: Buffer): Promise<KeyWrappingResult> {
    if (!this.endpoint) {
      throw new KmsExternalError('External KMS is not configured: missing KMS_EXTERNAL_ENDPOINT. Failing closed; fallback to local provider is strictly forbidden.');
    }

    const targetKey = keyId || this.defaultKeyId;
    if (!targetKey) {
      throw new KmsExternalError('External KMS wrap requested without a valid key identifier');
    }

    try {
      // In production, dispatch authenticated envelope wrap to Cloud KMS / Vault
      // Uses standard JSON-RPC / REST envelope contract:
      const response = await fetch(`${this.endpoint}/v1/keys/wrap`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-KMS-Region': this.region,
        },
        body: JSON.stringify({
          keyId: targetKey,
          plaintext: plaintextDek.toString('base64'),
        }),
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        throw new KmsExternalError(`External KMS wrap failed with HTTP status ${response.status}`);
      }

      const body = await response.json() as { wrappedKey: string; iv?: string; tag?: string };
      return {
        keyId: targetKey,
        wrappedKey: body.wrappedKey,
        algorithm: 'AES_256_GCM',
        iv: body.iv,
        tag: body.tag,
      };
    } catch (err) {
      this.logger.error('External KMS wrap failure — failing closed', err instanceof Error ? err.message : String(err));
      if (err instanceof KmsExternalError) throw err;
      throw new KmsExternalError('External KMS unreachable or operation rejected', err);
    }
  }

  async unwrapKey(keyId: string, wrapping: KeyWrappingResult): Promise<Buffer> {
    if (!this.endpoint) {
      throw new KmsExternalError('External KMS is not configured: missing KMS_EXTERNAL_ENDPOINT. Failing closed; fallback to local provider is strictly forbidden.');
    }

    try {
      const response = await fetch(`${this.endpoint}/v1/keys/unwrap`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-KMS-Region': this.region,
        },
        body: JSON.stringify({
          keyId,
          wrappedKey: wrapping.wrappedKey,
          iv: wrapping.iv,
          tag: wrapping.tag,
        }),
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        throw new KmsExternalError(`External KMS unwrap failed with HTTP status ${response.status}`);
      }

      const body = await response.json() as { plaintext: string };
      const dek = Buffer.from(body.plaintext, 'base64');
      if (dek.length !== 32) {
        dek.fill(0);
        throw new KmsExternalError('External KMS returned invalid unwrap byte length');
      }
      return dek;
    } catch (err) {
      this.logger.error('External KMS unwrap failure — failing closed', err instanceof Error ? err.message : String(err));
      if (err instanceof KmsExternalError) throw err;
      throw new KmsExternalError('External KMS unwrap operation failed', err);
    }
  }

  async healthCheck(): Promise<KmsHealthReport> {
    const start = performance.now();
    if (!this.endpoint) {
      return {
        ok: false,
        provider: this.providerName,
        activeKeyId: this.defaultKeyId || null,
        activeKeyVersion: null,
        activeKeyState: null,
        latencyMs: 0,
        error: 'KMS_EXTERNAL_ENDPOINT is not configured',
      };
    }

    try {
      const response = await fetch(`${this.endpoint}/v1/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(3000),
      });
      const latencyMs = Math.round((performance.now() - start) * 100) / 100;
      return {
        ok: response.ok,
        provider: this.providerName,
        activeKeyId: this.defaultKeyId || null,
        activeKeyVersion: null,
        activeKeyState: null,
        latencyMs,
        error: response.ok ? undefined : `Health probe returned ${response.status}`,
      };
    } catch (err) {
      const latencyMs = Math.round((performance.now() - start) * 100) / 100;
      return {
        ok: false,
        provider: this.providerName,
        activeKeyId: this.defaultKeyId || null,
        activeKeyVersion: null,
        activeKeyState: null,
        latencyMs,
        error: err instanceof Error ? err.message : 'External KMS health check timed out or failed',
      };
    }
  }
}
