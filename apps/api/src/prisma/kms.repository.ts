import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { KmsKeyMetadata, KmsKeyState } from '../kms/kms.types.js';
import { PrismaService } from './prisma.service.js';

@Injectable()
export class KmsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getActiveKey(): Promise<KmsKeyMetadata | null> {
    const key = await this.prisma.kmsKeyRegistry.findFirst({
      where: { state: 'ACTIVE' },
      orderBy: { version: 'desc' },
    });

    if (!key) return null;

    return {
      id: key.id,
      keyId: key.keyId,
      version: key.version,
      state: key.state as KmsKeyState,
      algorithm: key.algorithm as KmsKeyMetadata['algorithm'],
      description: key.description,
      createdAt: key.createdAt,
      rotatedAt: key.rotatedAt,
      revokedAt: key.revokedAt,
    };
  }

  async getKeyMetadata(keyId: string): Promise<KmsKeyMetadata | null> {
    const key = await this.prisma.kmsKeyRegistry.findUnique({
      where: { keyId },
    });

    if (!key) return null;

    return {
      id: key.id,
      keyId: key.keyId,
      version: key.version,
      state: key.state as KmsKeyState,
      algorithm: key.algorithm as KmsKeyMetadata['algorithm'],
      description: key.description,
      createdAt: key.createdAt,
      rotatedAt: key.rotatedAt,
      revokedAt: key.revokedAt,
    };
  }

  async listKeys(): Promise<KmsKeyMetadata[]> {
    const keys = await this.prisma.kmsKeyRegistry.findMany({
      orderBy: { version: 'desc' },
    });

    return keys.map((k) => ({
      id: k.id,
      keyId: k.keyId,
      version: k.version,
      state: k.state as KmsKeyState,
      algorithm: k.algorithm as KmsKeyMetadata['algorithm'],
      description: k.description,
      createdAt: k.createdAt,
      rotatedAt: k.rotatedAt,
      revokedAt: k.revokedAt,
    }));
  }

  async rotateKey(newKeyId: string, description?: string): Promise<KmsKeyMetadata> {
    const existing = await this.getKeyMetadata(newKeyId);
    if (existing) {
      throw new BadRequestException(`Key ID ${newKeyId} already exists in registry`);
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const active = await tx.kmsKeyRegistry.findFirst({
        where: { state: 'ACTIVE' },
        orderBy: { version: 'desc' },
      });

      const nextVersion = (active?.version ?? 0) + 1;
      const now = new Date();

      if (active) {
        await tx.kmsKeyRegistry.update({
          where: { id: active.id },
          data: {
            state: 'RETIRED',
            rotatedAt: now,
          },
        });
      }

      const created = await tx.kmsKeyRegistry.create({
        data: {
          keyId: newKeyId,
          version: nextVersion,
          state: 'ACTIVE',
          algorithm: 'AES_256_GCM',
          description: description ?? `Rotated active KEK version ${nextVersion}`,
        },
      });

      return created;
    });

    return {
      id: result.id,
      keyId: result.keyId,
      version: result.version,
      state: result.state as KmsKeyState,
      algorithm: result.algorithm as KmsKeyMetadata['algorithm'],
      description: result.description,
      createdAt: result.createdAt,
      rotatedAt: result.rotatedAt,
      revokedAt: result.revokedAt,
    };
  }

  async disableKey(keyId: string): Promise<KmsKeyMetadata> {
    const key = await this.getKeyMetadata(keyId);
    if (!key) throw new NotFoundException(`Key ${keyId} not found`);

    const updated = await this.prisma.kmsKeyRegistry.update({
      where: { keyId },
      data: { state: 'DISABLED' },
    });

    return {
      id: updated.id,
      keyId: updated.keyId,
      version: updated.version,
      state: updated.state as KmsKeyState,
      algorithm: updated.algorithm as KmsKeyMetadata['algorithm'],
      description: updated.description,
      createdAt: updated.createdAt,
      rotatedAt: updated.rotatedAt,
      revokedAt: updated.revokedAt,
    };
  }

  async revokeKey(keyId: string, reason?: string): Promise<KmsKeyMetadata> {
    const key = await this.getKeyMetadata(keyId);
    if (!key) throw new NotFoundException(`Key ${keyId} not found`);

    const updated = await this.prisma.kmsKeyRegistry.update({
      where: { keyId },
      data: {
        state: 'REVOKED',
        revokedAt: new Date(),
        description: reason ? `${key.description ?? ''} [REVOKED: ${reason}]`.trim() : key.description,
      },
    });

    return {
      id: updated.id,
      keyId: updated.keyId,
      version: updated.version,
      state: updated.state as KmsKeyState,
      algorithm: updated.algorithm as KmsKeyMetadata['algorithm'],
      description: updated.description,
      createdAt: updated.createdAt,
      rotatedAt: updated.rotatedAt,
      revokedAt: updated.revokedAt,
    };
  }

  async recordMigrationAudit(data: {
    clinicId?: string | null;
    resourceType: string;
    recordId: string;
    sourceKeyId: string;
    targetKeyId: string;
    status: string;
  }): Promise<void> {
    await this.prisma.kmsMigrationAudit.create({
      data: {
        clinicId: data.clinicId ?? null,
        resourceType: data.resourceType,
        recordId: data.recordId,
        sourceKeyId: data.sourceKeyId,
        targetKeyId: data.targetKeyId,
        status: data.status,
      },
    });
  }

  async getMigrationStatus(clinicId?: string): Promise<{
    totalAudited: number;
    successful: number;
    failed: number;
    recentAudits: Array<{
      id: string;
      resourceType: string;
      recordId: string;
      sourceKeyId: string;
      targetKeyId: string;
      status: string;
      migratedAt: Date;
    }>;
  }> {
    const where = clinicId ? { clinicId } : {};
    const total = await this.prisma.kmsMigrationAudit.count({ where });
    const successful = await this.prisma.kmsMigrationAudit.count({
      where: { ...where, status: 'SUCCESS' },
    });
    const failed = await this.prisma.kmsMigrationAudit.count({
      where: { ...where, status: 'FAILED' },
    });

    const recent = await this.prisma.kmsMigrationAudit.findMany({
      where,
      orderBy: { migratedAt: 'desc' },
      take: 20,
      select: {
        id: true,
        resourceType: true,
        recordId: true,
        sourceKeyId: true,
        targetKeyId: true,
        status: true,
        migratedAt: true,
      },
    });

    return {
      totalAudited: total,
      successful,
      failed,
      recentAudits: recent,
    };
  }
}
