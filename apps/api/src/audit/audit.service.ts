import { Injectable, Logger } from '@nestjs/common';
import { AuditRepository } from '../prisma/audit.repository.js';
import type { TenantTransaction } from '../prisma/tenant-database.service.js';
import type { VerifiedPrincipal } from '../prisma/verified-sessions.js';
import type { AuditEventInput, SanitizedAuditEventDto } from './audit.types.js';
import type { AuditQueryDto } from './audit.dto.js';

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly auditRepository: AuditRepository) {}

  async record(input: AuditEventInput, tx?: TenantTransaction): Promise<SanitizedAuditEventDto> {
    return this.auditRepository.record(input, tx);
  }

  async recordDirectSafe(input: AuditEventInput): Promise<void> {
    try {
      await this.auditRepository.record(input);
    } catch (error) {
      this.logger.warn(`Safe audit record failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async listClinicAuditEvents(
    proof: VerifiedPrincipal,
    clinicId: string,
    query: AuditQueryDto,
  ): Promise<{ events: SanitizedAuditEventDto[]; nextCursor: string | null; totalCount: number }> {
    return this.auditRepository.list(proof, clinicId, {
      category: query.category,
      action: query.action,
      actorId: query.actorId,
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
      cursor: query.cursor,
      limit: query.limit,
    });
  }
}
