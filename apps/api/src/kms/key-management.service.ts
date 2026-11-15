import {
  ForbiddenException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { KmsRepository } from '../prisma/kms.repository.js';
import type {
  KeyWrappingResult,
  KmsHealthReport,
  KmsKeyMetadata,
  KmsProvider,
} from './kms.types.js';

export const KMS_PROVIDER_TOKEN = 'KmsProviderToken';

@Injectable()
export class KeyManagementService {
  private readonly logger = new Logger(KeyManagementService.name);

  constructor(
    private readonly repo: KmsRepository,
    @Inject(KMS_PROVIDER_TOKEN) private readonly provider: KmsProvider,
  ) {}

  getProviderName(): string {
    return this.provider.providerName;
  }

  async getActiveKey(): Promise<KmsKeyMetadata> {
    const key = await this.repo.getActiveKey();
    if (!key) {
      throw new InternalServerErrorException('No active KEK found in KMS key registry');
    }
    return key;
  }

  async getKeyMetadata(keyId: string): Promise<KmsKeyMetadata | null> {
    return this.repo.getKeyMetadata(keyId);
  }

  async listKeys(): Promise<KmsKeyMetadata[]> {
    return this.repo.listKeys();
  }

  async wrapDek(keyId: string, plaintextDek: Buffer): Promise<KeyWrappingResult> {
    const metadata = await this.getKeyMetadata(keyId);
    if (!metadata) {
      throw new NotFoundException(`KMS key ${keyId} not registered`);
    }

    if (metadata.state !== 'ACTIVE') {
      throw new ForbiddenException(`KMS key ${keyId} is in ${metadata.state} state; encryption permitted only with ACTIVE keys`);
    }

    return this.provider.wrapKey(keyId, plaintextDek);
  }

  async unwrapDek(keyId: string, wrapping: KeyWrappingResult): Promise<Buffer> {
    const metadata = await this.getKeyMetadata(keyId);
    if (!metadata) {
      throw new NotFoundException(`KMS key ${keyId} not registered`);
    }

    if (metadata.state === 'DISABLED') {
      throw new ForbiddenException(`KMS key ${keyId} is DISABLED; decryption is temporarily suspended`);
    }

    if (metadata.state === 'REVOKED') {
      throw new ForbiddenException(`KMS key ${keyId} is REVOKED; cryptographic access is permanently barred`);
    }

    return this.provider.unwrapKey(keyId, wrapping);
  }

  async rotateKey(newKeyId: string, description?: string): Promise<KmsKeyMetadata> {
    const rotated = await this.repo.rotateKey(newKeyId, description);
    this.logger.log(`KEK rotation succeeded. New active key: ${rotated.keyId} (v${rotated.version})`);
    return rotated;
  }

  async disableKey(keyId: string): Promise<KmsKeyMetadata> {
    const updated = await this.repo.disableKey(keyId);
    this.logger.warn(`KEK ${keyId} has been DISABLED`);
    return updated;
  }

  async revokeKey(keyId: string, reason?: string): Promise<KmsKeyMetadata> {
    const updated = await this.repo.revokeKey(keyId, reason);
    this.logger.error(`KEK ${keyId} has been REVOKED: ${reason ?? 'No reason provided'}`);
    return updated;
  }

  async getSecurityHealth(): Promise<KmsHealthReport> {
    const probe = await this.provider.healthCheck();
    let activeKey: KmsKeyMetadata | null = null;
    try {
      activeKey = await this.getActiveKey();
    } catch {
      // Active key lookup failed
    }

    const allKeys = await this.listKeys();

    return {
      ok: probe.ok && activeKey !== null,
      provider: this.provider.providerName,
      activeKeyId: activeKey?.keyId ?? null,
      activeKeyVersion: activeKey?.version ?? null,
      activeKeyState: activeKey?.state ?? null,
      latencyMs: probe.latencyMs,
      error: probe.error,
      details: {
        totalKeys: allKeys.length,
        retiredKeys: allKeys.filter((k) => k.state === 'RETIRED').length,
        disabledKeys: allKeys.filter((k) => k.state === 'DISABLED').length,
        revokedKeys: allKeys.filter((k) => k.state === 'REVOKED').length,
        ...probe.details,
      },
    };
  }
}
