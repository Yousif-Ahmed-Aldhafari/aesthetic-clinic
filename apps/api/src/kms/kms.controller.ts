import { Controller, Get, Param, Req } from '@nestjs/common';
import { ClinicPermissions, type AuthRequest } from '../auth/access.js';
import { KeyManagementService } from './key-management.service.js';
import { KeyRotationMigrationService } from './key-rotation-migration.service.js';

@Controller('clinics/:clinicId/security')
export class KmsClinicController {
  constructor(
    private readonly kms: KeyManagementService,
    private readonly migration: KeyRotationMigrationService,
  ) {}

  @Get('health')
  @ClinicPermissions('clinic.branding.read')
  async getClinicSecurityHealth(
    @Req() _req: AuthRequest,
    @Param('clinicId') clinicId: string,
  ) {
    const health = await this.kms.getSecurityHealth();
    const migrationStatus = await this.migration.getMigrationStatus(clinicId);

    return {
      success: true,
      data: {
        kms: health,
        migration: migrationStatus,
      },
    };
  }
}

@Controller('admin/security')
export class KmsAdminController {
  constructor(
    private readonly kms: KeyManagementService,
    private readonly migration: KeyRotationMigrationService,
  ) {}

  @Get('health')
  async getSystemSecurityHealth() {
    const health = await this.kms.getSecurityHealth();
    const migrationStatus = await this.migration.getMigrationStatus();

    return {
      success: true,
      data: {
        kms: health,
        migration: migrationStatus,
      },
    };
  }
}
