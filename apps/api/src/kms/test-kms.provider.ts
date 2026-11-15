import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Environment } from '../config/environment.js';
import { LocalKmsProvider } from './local-kms.provider.js';
import type { KeyWrappingResult, KmsHealthReport, KmsProvider } from './kms.types.js';

@Injectable()
export class TestKmsProvider implements KmsProvider {
  public readonly providerName = 'synthetic-test';
  private readonly local: LocalKmsProvider;
  private wrapError: Error | null = null;
  private unwrapError: Error | null = null;
  private latencyMs = 0;
  private revokedKeys = new Set<string>();

  constructor(config: ConfigService<Environment, true>) {
    this.local = new LocalKmsProvider(config);
  }

  simulateFailure(action: 'wrap' | 'unwrap' | 'all', error: Error | string): void {
    const err = typeof error === 'string' ? new Error(error) : error;
    if (action === 'wrap' || action === 'all') this.wrapError = err;
    if (action === 'unwrap' || action === 'all') this.unwrapError = err;
  }

  simulateLatency(ms: number): void {
    this.latencyMs = ms;
  }

  simulateEmergencyRevocation(keyId: string): void {
    this.revokedKeys.add(keyId);
  }

  reset(): void {
    this.wrapError = null;
    this.unwrapError = null;
    this.latencyMs = 0;
    this.revokedKeys.clear();
  }

  private async applySimulatedLatency(): Promise<void> {
    if (this.latencyMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.latencyMs));
    }
  }

  async wrapKey(keyId: string, plaintextDek: Buffer): Promise<KeyWrappingResult> {
    await this.applySimulatedLatency();
    if (this.wrapError) {
      throw this.wrapError;
    }
    if (this.revokedKeys.has(keyId)) {
      throw new Error(`Key ${keyId} is under emergency revocation; wrap rejected`);
    }
    return this.local.wrapKey(keyId, plaintextDek);
  }

  async unwrapKey(keyId: string, wrapping: KeyWrappingResult): Promise<Buffer> {
    await this.applySimulatedLatency();
    if (this.unwrapError) {
      throw this.unwrapError;
    }
    if (this.revokedKeys.has(keyId)) {
      throw new Error(`Key ${keyId} is under emergency revocation; unwrap rejected`);
    }
    return this.local.unwrapKey(keyId, wrapping);
  }

  async healthCheck(): Promise<KmsHealthReport> {
    await this.applySimulatedLatency();
    if (this.wrapError || this.unwrapError) {
      return {
        ok: false,
        provider: this.providerName,
        activeKeyId: null,
        activeKeyVersion: null,
        activeKeyState: null,
        latencyMs: this.latencyMs,
        error: (this.wrapError || this.unwrapError)?.message,
      };
    }
    const report = await this.local.healthCheck();
    return {
      ...report,
      provider: this.providerName,
      latencyMs: report.latencyMs + this.latencyMs,
    };
  }
}
