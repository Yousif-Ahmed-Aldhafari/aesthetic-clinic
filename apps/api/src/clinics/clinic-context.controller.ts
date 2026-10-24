import { Controller, Get, Req } from '@nestjs/common';
import { ClinicPermissions, type AuthRequest } from '../auth/access.js';
import { ClinicRepository } from '../prisma/clinic.repository.js';

@Controller('clinics/:clinicId')
export class ClinicContextController {
  constructor(private readonly clinics: ClinicRepository) {}
  @Get('me') @ClinicPermissions('clinic.branding.read')
  me(@Req() request: AuthRequest) { return request.clinicContext; }
  @Get('settings') @ClinicPermissions('clinic.settings.read')
  settings(@Req() request: AuthRequest) {
    return this.clinics.settings(request.auth!.principal,request.clinicContext!.clinicId);
  }
}
