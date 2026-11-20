import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Environment } from './environment.js';
import type { SecretVaultProvider } from './secret-vault.service.js';

export class SecretManagerError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = 'SecretManagerError';
  }
}

export class SecretNotFoundError extends SecretManagerError {
  constructor(secretId: string) {
    super(`Secret '${secretId}' not found in Google Secret Manager`, 404);
    this.name = 'SecretNotFoundError';
  }
}

export class SecretAccessDeniedError extends SecretManagerError {
  constructor(secretId: string) {
    super(`Access denied to secret '${secretId}' in Google Secret Manager (check IAM)`, 403);
    this.name = 'SecretAccessDeniedError';
  }
}

export interface GoogleSecretManagerTransport {
  accessSecretVersion(secretPath: string): Promise<{ payload: string }>;
}

interface CacheEntry {
  value: string;
  expiresAt: number;
}

@Injectable()
export class GoogleSecretManagerVaultProvider implements SecretVaultProvider {
  public readonly name = 'google-secret-manager';

  private readonly projectId: string;
  private readonly secretPrefix: string;
  private readonly endpoint: string;
  private readonly ttlMs: number;
  private readonly cache = new Map<string, CacheEntry>();
  private customTransport?: GoogleSecretManagerTransport;

  constructor(private readonly config?: ConfigService<Environment, true>) {
    this.projectId =
      this.config?.get('GCP_PROJECT_ID', { infer: true }) ||
      process.env.GCP_PROJECT_ID ||
      process.env.GOOGLE_CLOUD_PROJECT ||
      'lamssa-cloud';
    this.secretPrefix =
      this.config?.get('GCP_SECRET_PREFIX', { infer: true }) ||
      process.env.GCP_SECRET_PREFIX ||
      '';
    this.endpoint =
      this.config?.get('GCP_SECRET_MANAGER_ENDPOINT', { infer: true }) ||
      process.env.GCP_SECRET_MANAGER_ENDPOINT ||
      'https://secretmanager.googleapis.com';
    this.ttlMs = 300_000; // 5-minute in-memory cache
  }

  setTransport(transport: GoogleSecretManagerTransport): void {
    this.customTransport = transport;
  }

  setCache(key: string, value: string): void {
    this.cache.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }

  clearCache(): void {
    this.cache.clear();
  }

  private canonicalSecretPath(key: string, version = 'latest'): string {
    const sanitizedKey = key.toLowerCase().replace(/_/g, '-');
    const secretId = this.secretPrefix ? `${this.secretPrefix}-${sanitizedKey}` : sanitizedKey;
    return `projects/${this.projectId}/secrets/${secretId}/versions/${version}`;
  }

  getSecret(key: string): string | undefined {
    // 1. Check in-memory TTL cache first
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }

    // 2. In Node environment, synchronous access checks environment override
    // or cached preloaded secrets
    const envOverride = process.env[key];
    if (envOverride && envOverride.trim().length > 0) {
      this.setCache(key, envOverride);
      return envOverride;
    }

    return cached?.value;
  }

  async loadSecretAsync(key: string, version = 'latest'): Promise<string> {
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }

    const secretPath = this.canonicalSecretPath(key, version);

    try {
      if (this.customTransport) {
        const result = await this.customTransport.accessSecretVersion(secretPath);
        this.setCache(key, result.payload);
        return result.payload;
      }

      // Check simulated mode
      const isSimulated = process.env.GSM_SIMULATE === 'true' || this.endpoint.includes('localhost') || this.endpoint.includes('127.0.0.1');
      if (isSimulated) {
        const mockValue = `mock-secret-for-${key}-gcp-secret-manager`;
        this.setCache(key, mockValue);
        return mockValue;
      }

      const url = `${this.endpoint}/v1/${secretPath}:access`;
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-User-Project': this.projectId,
        },
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        if (response.status === 404) throw new SecretNotFoundError(key);
        if (response.status === 403) throw new SecretAccessDeniedError(key);
        throw new SecretManagerError(`Failed to fetch secret '${key}': HTTP ${response.status}`, response.status);
      }

      const body = (await response.json()) as { payload?: { data?: string } };
      if (!body.payload?.data) {
        throw new SecretManagerError(`Secret payload for '${key}' was empty`);
      }

      const plaintext = Buffer.from(body.payload.data, 'base64').toString('utf8');
      this.setCache(key, plaintext);
      return plaintext;
    } catch (err) {
      if (err instanceof SecretManagerError) throw err;
      throw new SecretManagerError(`Error loading secret '${key}': ${err instanceof Error ? err.message : String(err)}`, 500);
    }
  }
}
