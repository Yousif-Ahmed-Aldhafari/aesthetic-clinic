import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ClinicPermissions, type AuthRequest } from '../auth/access.js';
import { PediatricsRepository } from '../prisma/pediatrics.repository.js';
import {
  RequireSpecialty,
  RequireClinicalPrivilege,
  SpecialtyPrivilegeGuard,
} from '../specialties/specialty-auth.guard.js';
import {
  RecordPediatricBirthHistoryDto,
  AmendPediatricBirthHistoryDto,
  CreateCaregiverRelationshipDto,
  UpdateCaregiverRelationshipDto,
  RevokeCaregiverRelationshipDto,
  RecordPediatricGrowthDto,
  EnterInErrorGrowthRecordDto,
  PediatricMedicationPreflightDto,
} from './pediatrics.dto.js';

@Controller('clinics/:clinicId/pediatrics')
@UseGuards(SpecialtyPrivilegeGuard)
export class PediatricsController {
  constructor(private readonly pediatricsRepo: PediatricsRepository) {}

  private getMembershipId(req: AuthRequest, clinicId: string): string {
    const membership = req.auth?.user.memberships.find(
      (m) => m.clinicId === clinicId && m.status === 'ACTIVE',
    );
    return membership?.id ?? '';
  }

  // =========================================================================
  // 1. NEONATAL BIRTH HISTORY
  // =========================================================================

  @Get('patients/:patientId/birth-history')
  @ClinicPermissions('clinical.encounters.read')
  getBirthHistory(
    @Req() req: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Param('patientId') patientId: string,
  ) {
    return this.pediatricsRepo.getBirthHistory(req.auth!.principal, clinicId, patientId);
  }

  @Post('birth-history')
  @ClinicPermissions('clinical.encounters.create')
  @RequireSpecialty('PEDIATRICS')
  @RequireClinicalPrivilege('PEDIATRIC_CARE_DOCUMENT')
  recordBirthHistory(
    @Req() req: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Body() body: RecordPediatricBirthHistoryDto,
  ) {
    const membershipId = this.getMembershipId(req, clinicId);
    return this.pediatricsRepo.recordBirthHistory(req.auth!.principal, clinicId, membershipId, body);
  }

  @Patch('birth-history/:historyId/amend')
  @ClinicPermissions('clinical.encounters.update')
  @RequireSpecialty('PEDIATRICS')
  @RequireClinicalPrivilege('PEDIATRIC_BIRTH_HISTORY_VERIFY')
  amendBirthHistory(
    @Req() req: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Param('historyId') historyId: string,
    @Body() body: AmendPediatricBirthHistoryDto,
  ) {
    const membershipId = this.getMembershipId(req, clinicId);
    return this.pediatricsRepo.amendBirthHistory(
      req.auth!.principal,
      clinicId,
      membershipId,
      historyId,
      body,
    );
  }

  // =========================================================================
  // 2. CAREGIVER AUTHORIZATION & RELATIONSHIPS
  // =========================================================================

  @Get('patients/:patientId/caregivers')
  @ClinicPermissions('clinical.encounters.read')
  listCaregivers(
    @Req() req: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Param('patientId') patientId: string,
  ) {
    return this.pediatricsRepo.listCaregivers(req.auth!.principal, clinicId, patientId);
  }

  @Post('caregivers')
  @ClinicPermissions('clinical.encounters.create')
  createCaregiver(
    @Req() req: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Body() body: CreateCaregiverRelationshipDto,
  ) {
    const membershipId = this.getMembershipId(req, clinicId);
    return this.pediatricsRepo.createCaregiver(req.auth!.principal, clinicId, membershipId, body);
  }

  @Patch('caregivers/:caregiverId')
  @ClinicPermissions('clinical.encounters.update')
  updateCaregiver(
    @Req() req: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Param('caregiverId') caregiverId: string,
    @Body() body: UpdateCaregiverRelationshipDto,
  ) {
    const membershipId = this.getMembershipId(req, clinicId);
    return this.pediatricsRepo.updateCaregiver(
      req.auth!.principal,
      clinicId,
      membershipId,
      caregiverId,
      body,
    );
  }

  @Post('caregivers/:caregiverId/revoke')
  @ClinicPermissions('clinical.encounters.update')
  revokeCaregiver(
    @Req() req: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Param('caregiverId') caregiverId: string,
    @Body() body: RevokeCaregiverRelationshipDto,
  ) {
    const membershipId = this.getMembershipId(req, clinicId);
    return this.pediatricsRepo.revokeCaregiver(
      req.auth!.principal,
      clinicId,
      membershipId,
      caregiverId,
      body,
    );
  }

  // =========================================================================
  // 3. PEDIATRIC GROWTH RECORDS & ANALYTICS
  // =========================================================================

  @Get('patients/:patientId/growth-records')
  @ClinicPermissions('clinical.encounters.read')
  listGrowthRecords(
    @Req() req: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Param('patientId') patientId: string,
  ) {
    return this.pediatricsRepo.listGrowthRecords(req.auth!.principal, clinicId, patientId);
  }

  @Post('growth-records')
  @ClinicPermissions('clinical.encounters.create')
  @RequireSpecialty('PEDIATRICS')
  @RequireClinicalPrivilege('PEDIATRIC_GROWTH_RECORD')
  recordGrowth(
    @Req() req: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Body() body: RecordPediatricGrowthDto,
  ) {
    const membershipId = this.getMembershipId(req, clinicId);
    return this.pediatricsRepo.recordGrowth(req.auth!.principal, clinicId, membershipId, body);
  }

  @Post('growth-records/:recordId/enter-in-error')
  @ClinicPermissions('clinical.encounters.update')
  @RequireSpecialty('PEDIATRICS')
  @RequireClinicalPrivilege('PEDIATRIC_GROWTH_REVIEW')
  enterInErrorGrowthRecord(
    @Req() req: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Param('recordId') recordId: string,
    @Body() body: EnterInErrorGrowthRecordDto,
  ) {
    const membershipId = this.getMembershipId(req, clinicId);
    return this.pediatricsRepo.enterInErrorGrowthRecord(
      req.auth!.principal,
      clinicId,
      membershipId,
      recordId,
      body,
    );
  }

  // =========================================================================
  // 4. MEDICATION SAFETY PREFLIGHT
  // =========================================================================

  @Post('medication-safety/preflight')
  @ClinicPermissions('clinical.encounters.read')
  preflightMedicationSafety(
    @Req() req: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Body() body: PediatricMedicationPreflightDto,
  ) {
    return this.pediatricsRepo.preflightMedicationSafety(req.auth!.principal, clinicId, body);
  }
}
