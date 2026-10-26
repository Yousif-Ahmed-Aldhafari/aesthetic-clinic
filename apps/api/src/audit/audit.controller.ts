import { Controller, Get, Param, Query, Req } from '@nestjs/common';
import { ClinicPermissions, type AuthRequest } from '../auth/access.js';
import { AuditService } from './audit.service.js';
import { AuditClinicRoute, AuditQueryDto } from './audit.dto.js';

@Controller('clinics/:clinicId/audit')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get('events')
  @ClinicPermissions('audit.read')
  async listEvents(
    @Req() request: AuthRequest,
    @Param() route: AuditClinicRoute,
    @Query() query: AuditQueryDto,
  ) {
    return this.auditService.listClinicAuditEvents(
      request.auth!.principal,
      route.clinicId,
      query,
    );
  }
}

