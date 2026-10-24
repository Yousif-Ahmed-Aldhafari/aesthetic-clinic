import { Controller, Get, Req } from '@nestjs/common';
import { ClinicPermissions, type AuthRequest } from '../auth/access.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Controller('clinics/:clinicId')
export class ClinicContextController {
  constructor(private readonly prisma: PrismaService) {}
  @Get('me') @ClinicPermissions('clinic.branding.read')
  me(@Req() request: AuthRequest) { return request.clinicContext; }
  @Get('settings') @ClinicPermissions('clinic.settings.read')
  settings(@Req() request: AuthRequest) {
    return this.prisma.clinic.findUniqueOrThrow({ where: { id: request.clinicContext!.clinicId },
      select: { displayName: true, timezone: true, currency: true } });
  }
}
