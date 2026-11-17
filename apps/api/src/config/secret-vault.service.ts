import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import type { Environment } from './environment.js';

export class SecretVaultError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SecretVaultError';
  }
}

export interface SecretVaultProvider {
  name: string;
  getSecret(key: string): string | undefined;
}

export class EnvironmentVaultProvider implements SecretVaultProvider {
  public readonly name = 'environment';
  constructor(private readonly config?: ConfigService<Environment, true>) {}

  getSecret(key: string): string | undefined {
    if (this.config) {
      const val = this.config.get(key as keyof Environment, { infer: true });
      if (typeof val === 'string' && val.length > 0) return val;
    }
    const envVal = process.env[key];
    if (typeof envVal === 'string' && envVal.length > 0) return envVal;
    return undefined;
  }
}

@Injectable()
export class SecretVaultService {
  private provider: SecretVaultProvider;

  constructor(config?: ConfigService<Environment, true>) {
    this.provider = new EnvironmentVaultProvider(config);
  }

  setProvider(provider: SecretVaultProvider): void {
    this.provider = provider;
  }

  getProviderName(): string {
    return this.provider.name;
  }

  /**
   * Retrieves a secret or throws a fail-closed SecretVaultError.
   */
  getSecret(key: string): string {
    const value = this.provider.getSecret(key);
    if (!value || typeof value !== 'string' || value.trim().length === 0) {
      throw new SecretVaultError(`Required secret '${key}' is missing or empty in vault provider '${this.provider.name}'`);
    }
    return value;
  }

  /**
   * Retrieves an optional secret, returning undefined if missing.
   */
  getOptionalSecret(key: string): string | undefined {
    const value = this.provider.getSecret(key);
    if (!value || typeof value !== 'string' || value.trim().length === 0) {
      return undefined;
    }
    return value;
  }

  /**
   * Produces a non-reversible masked fingerprint for audit/logging:
   * e.g., '****:a1b2c3d4'
   */
  static maskSecret(value: string | undefined | null): string {
    if (!value) return '[UNSET]';
    const hash = createHash('sha256').update(value).digest('hex').slice(0, 8);
    return `****:${hash}`;
  }

  maskSecret(value: string | undefined | null): string {
    return SecretVaultService.maskSecret(value);
  }

  /**
   * Deep sanitization of objects to prevent accidental secret leakage in logs or responses.
   */
  static sanitizeForLog(data: unknown): unknown {
    if (data === null || data === undefined) return data;
    if (typeof data !== 'object') return data;

    if (Array.isArray(data)) {
      return data.map(item => SecretVaultService.sanitizeForLog(item));
    }

    const sensitivePattern = /(secret|password|key|token|credential|auth|authorization|cookie)/i;
    const sanitized: Record<string, unknown> = {};

    for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
      if (sensitivePattern.test(k)) {
        if (typeof v === 'string') {
          sanitized[k] = SecretVaultService.maskSecret(v);
        } else {
          sanitized[k] = '[REDACTED]';
        }
      } else if (typeof v === 'object' && v !== null) {
        sanitized[k] = SecretVaultService.sanitizeForLog(v);
      } else {
        sanitized[k] = v;
      }
    }

    return sanitized;
  }
}
