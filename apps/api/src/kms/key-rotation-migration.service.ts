import { Injectable, Logger } from '@nestjs/common';
import { KmsRepository } from '../prisma/kms.repository.js';
import { EnvelopeEncryptionService } from './envelope-encryption.service.js';
import { KeyManagementService } from './key-management.service.js';

export interface MigrationResult {
  migrated: boolean;
  sourceKeyId: string;
  targetKeyId: string;
  newCiphertext?: string;
  error?: string;
}

export interface BatchMigrationReport {
  examined: number;
  migrated: number;
  skipped: number;
  errors: number;
  dryRun: boolean;
  targetKeyId: string;
}

@Injectable()
export class KeyRotationMigrationService {
  private readonly logger = new Logger(KeyRotationMigrationService.name);

  constructor(
    private readonly repo: KmsRepository,
    private readonly envelope: EnvelopeEncryptionService,
    private readonly kms: KeyManagementService,
  ) {}

  async migrateRecord(
    clinicId: string | null,
    resourceType: string,
    recordId: string,
    currentCiphertext: string,
  ): Promise<MigrationResult> {
    const activeKey = await this.kms.getActiveKey();
    const isLegacy = this.envelope.isLegacyFormat(currentCiphertext);
    const sourceKeyId = isLegacy
      ? 'legacy-v1-direct'
      : (this.envelope.extractKeyId(currentCiphertext) ?? 'unknown');

    // If already encrypted with the current active KEK, skip
    if (!isLegacy && sourceKeyId === activeKey.keyId) {
      return {
        migrated: false,
        sourceKeyId,
        targetKeyId: activeKey.keyId,
      };
    }

    try {
      const plaintext = await this.envelope.decrypt(currentCiphertext, {
        clinicId,
        resourceType,
        recordId,
      });

      const newCiphertext = await this.envelope.encrypt(plaintext, {
        clinicId,
        resourceType,
        recordId,
      });

      // Record to KmsMigrationAudit
      await this.repo.recordMigrationAudit({
        clinicId: clinicId ?? null,
        resourceType,
        recordId,
        sourceKeyId,
        targetKeyId: activeKey.keyId,
        status: 'SUCCESS',
      });

      return {
        migrated: true,
        sourceKeyId,
        targetKeyId: activeKey.keyId,
        newCiphertext,
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Migration failed for ${resourceType}:${recordId}`, errorMsg);

      await this.repo.recordMigrationAudit({
        clinicId: clinicId ?? null,
        resourceType,
        recordId,
        sourceKeyId,
        targetKeyId: activeKey.keyId,
        status: 'FAILED',
      });

      return {
        migrated: false,
        sourceKeyId,
        targetKeyId: activeKey.keyId,
        error: errorMsg,
      };
    }
  }

  async getMigrationStatus(clinicId?: string) {
    return this.repo.getMigrationStatus(clinicId);
  }
}
