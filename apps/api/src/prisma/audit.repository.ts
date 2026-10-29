import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from './prisma.service.js';
import { TenantDatabaseService, type TenantTransaction } from './tenant-database.service.js';
import type { VerifiedPrincipal } from './verified-sessions.js';
import {
  type AuditEventInput,
  type AuditQueryFilters,
  type SanitizedAuditEventDto,
  sanitizeAuditMetadata,
} from '../audit/audit.types.js';

const auditSelect = {
  id: true,
  clinicId: true,
  actorId: true,
  actorEmail: true,
  action: true,
  category: true,
  targetType: true,
  targetId: true,
  outcome: true,
  correlationId: true,
  ipAddress: true,
  userAgent: true,
  metadata: true,
  createdAt: true,
} as const satisfies Prisma.AuditEventSelect;

type AuditRow = Prisma.AuditEventGetPayload<{ select: typeof auditSelect }>;

const auditResponse = (row: AuditRow): SanitizedAuditEventDto => ({
  id: row.id,
  clinicId: row.clinicId,
  actorId: row.actorId,
  actorEmail: row.actorEmail,
  action: row.action,
  category: row.category,
  targetType: row.targetType,
  targetId: row.targetId,
  outcome: row.outcome,
  correlationId: row.correlationId,
  ipAddress: row.ipAddress,
  userAgent: row.userAgent,
  metadata: (row.metadata as Record<string, unknown> | null) ?? null,
  createdAt: row.createdAt.toISOString(),
});

@Injectable()
export class AuditRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly database: TenantDatabaseService,
  ) {}

  async record(input: AuditEventInput, tx?: TenantTransaction): Promise<SanitizedAuditEventDto> {
    const id = randomUUID();
    const sanitizedMetadata = input.metadata ? sanitizeAuditMetadata(input.metadata) : null;
    const data: Prisma.AuditEventUncheckedCreateInput = {
      id,
      clinicId: input.clinicId ?? null,
      actorId: input.actorId ?? null,
      actorEmail: input.actorEmail ? input.actorEmail.slice(0, 254) : null,
      action: input.action.slice(0, 64),
      category: input.category,
      targetType: input.targetType ? input.targetType.slice(0, 64) : null,
      targetId: input.targetId ? input.targetId.slice(0, 64) : null,
      outcome: input.outcome ?? 'SUCCESS',
      correlationId: input.correlationId ? input.correlationId.slice(0, 64) : null,
      ipAddress: input.ipAddress ? input.ipAddress.slice(0, 64) : null,
      userAgent: input.userAgent ? input.userAgent.slice(0, 256) : null,
      metadata: (sanitizedMetadata ?? undefined) as Prisma.InputJsonValue | undefined,
    };

    if (tx) {
      const created = await tx.auditEvent.create({ data, select: auditSelect });
      return auditResponse(created);
    }

    const metaJson = sanitizedMetadata ? JSON.stringify(sanitizedMetadata) : null;
    await this.prisma.$executeRaw`
      SELECT lamssa_security.record_audit_event(
        ${id}::uuid,
        ${data.clinicId}::uuid,
        ${data.actorId}::uuid,
        ${data.actorEmail},
        ${data.action},
        ${data.category}::"AuditCategory",
        ${data.targetType},
        ${data.targetId},
        ${data.outcome}::"AuditOutcome",
        ${data.correlationId},
        ${data.ipAddress},
        ${data.userAgent},
        ${metaJson}::jsonb
      );
    `;

    return {
      id,
      clinicId: data.clinicId ?? null,
      actorId: data.actorId ?? null,
      actorEmail: data.actorEmail ?? null,
      action: data.action,
      category: data.category,
      targetType: data.targetType ?? null,
      targetId: data.targetId ?? null,
      outcome: data.outcome ?? 'SUCCESS',
      correlationId: data.correlationId ?? null,
      ipAddress: data.ipAddress ?? null,
      userAgent: data.userAgent ?? null,
      metadata: sanitizedMetadata,
      createdAt: new Date().toISOString(),
    };
  }

  async list(
    proof: VerifiedPrincipal,
    clinicId: string,
    filters: AuditQueryFilters,
  ): Promise<{ events: SanitizedAuditEventDto[]; nextCursor: string | null; totalCount: number }> {
    return this.database.withClinicContext(proof, clinicId, ['audit.read'], async (tx, context) => {
      const where: Prisma.AuditEventWhereInput = {
        clinicId: context.clinicId,
        ...(filters.category ? { category: filters.category } : {}),
        ...(filters.action ? { action: filters.action } : {}),
        ...(filters.actorId ? { actorId: filters.actorId } : {}),
      };

      if (filters.from || filters.to) {
        where.createdAt = {
          ...(filters.from ? { gte: filters.from } : {}),
          ...(filters.to ? { lte: filters.to } : {}),
        };
      }

      if (filters.cursor) {
        const anchor = await tx.auditEvent.findFirst({
          where: { clinicId: context.clinicId, id: filters.cursor },
          select: { createdAt: true, id: true },
        });
        if (!anchor) throw new NotFoundException();
        where.AND = {
          OR: [
            { createdAt: { lt: anchor.createdAt } },
            {
              createdAt: anchor.createdAt,
              id: { lt: anchor.id },
            },
          ],
        };
      }

      const limit = Math.min(Math.max(filters.limit ?? 20, 1), 50);

      const [rows, totalCount] = await Promise.all([
        tx.auditEvent.findMany({
          where,
          select: auditSelect,
          orderBy: [
            { createdAt: 'desc' },
            { id: 'desc' },
          ],
          take: limit + 1,
        }),
        tx.auditEvent.count({
          where: {
            clinicId: context.clinicId,
            ...(filters.category ? { category: filters.category } : {}),
            ...(filters.action ? { action: filters.action } : {}),
            ...(filters.actorId ? { actorId: filters.actorId } : {}),
          },
        }),
      ]);

      const hasMore = rows.length > limit;
      const resultRows = hasMore ? rows.slice(0, limit) : rows;
      const nextCursor = hasMore && resultRows.length > 0 ? resultRows[resultRows.length - 1].id : null;

      return {
        events: resultRows.map(auditResponse),
        nextCursor,
        totalCount,
      };
    });
  }
}
