import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ClinicPermissions, type AuthRequest } from '../auth/access.js';
import { DentistryRepository } from '../prisma/dentistry.repository.js';
import {
  RequireSpecialty,
  RequireClinicalPrivilege,
  SpecialtyPrivilegeGuard,
} from '../specialties/specialty-auth.guard.js';
import {
  CreateDentalOdontogramDto,
  UpdateDentalOdontogramDraftDto,
  AmendDentalOdontogramDto,
  EnterInErrorDentalOdontogramDto,
  BatchRecordToothFindingsDto,
  RecordPeriodontalRecordDto,
  CreateDentalTreatmentStageDto,
  CompleteDentalTreatmentStageDto,
  CancelDentalTreatmentStageDto,
  BillDentalTreatmentStageDto,
  ConsumeDentalStageMaterialsDto,
} from './dentistry.dto.js';

@Controller('clinics/:clinicId/dentistry')
@UseGuards(SpecialtyPrivilegeGuard)
export class DentistryController {
  constructor(private readonly dentistryRepo: DentistryRepository) {}

  private getMembershipId(req: AuthRequest, clinicId: string): string {
    const membership = req.auth?.user.memberships.find(
      (m) => m.clinicId === clinicId && m.status === 'ACTIVE',
    );
    return membership?.id ?? '';
  }

  // =========================================================================
  // ODONTOGRAMS
  // =========================================================================

  @Get('patients/:patientId/odontogram')
  @ClinicPermissions('clinical.encounters.read')
  getCurrentOdontogram(
    @Req() req: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Param('patientId') patientId: string,
  ) {
    return this.dentistryRepo.getCurrentOdontogram(req.auth!.principal, clinicId, patientId);
  }

  @Get('patients/:patientId/odontograms')
  @ClinicPermissions('clinical.encounters.read')
  listOdontograms(
    @Req() req: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Param('patientId') patientId: string,
  ) {
    return this.dentistryRepo.getPatientOdontograms(req.auth!.principal, clinicId, patientId);
  }

  @Get('odontograms/:odontogramId')
  @ClinicPermissions('clinical.encounters.read')
  getOdontogramById(
    @Req() req: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Param('odontogramId') odontogramId: string,
  ) {
    return this.dentistryRepo.getOdontogramById(req.auth!.principal, clinicId, odontogramId);
  }

  @Post('odontograms')
  @ClinicPermissions('clinical.encounters.create')
  @RequireSpecialty('DENTISTRY')
  @RequireClinicalPrivilege('DENTAL_EXAMINATION_RECORD')
  createOdontogramDraft(
    @Req() req: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Body() body: CreateDentalOdontogramDto,
  ) {
    const membershipId = this.getMembershipId(req, clinicId);
    return this.dentistryRepo.createOdontogram(req.auth!.principal, clinicId, membershipId, body);
  }

  @Patch('odontograms/:odontogramId')
  @ClinicPermissions('clinical.encounters.update')
  @RequireSpecialty('DENTISTRY')
  @RequireClinicalPrivilege('DENTAL_EXAMINATION_RECORD')
  updateOdontogramDraft(
    @Req() req: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Param('odontogramId') odontogramId: string,
    @Body() body: UpdateDentalOdontogramDraftDto,
  ) {
    const membershipId = this.getMembershipId(req, clinicId);
    return this.dentistryRepo.updateOdontogramDraft(
      req.auth!.principal,
      clinicId,
      odontogramId,
      membershipId,
      body,
    );
  }

  @Post('odontograms/:odontogramId/finalize')
  @ClinicPermissions('clinical.encounters.update')
  @RequireSpecialty('DENTISTRY')
  @RequireClinicalPrivilege('DENTAL_EXAMINATION_RECORD')
  finalizeOdontogram(
    @Req() req: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Param('odontogramId') odontogramId: string,
    @Body() body: { expectedVersion: number },
  ) {
    const membershipId = this.getMembershipId(req, clinicId);
    return this.dentistryRepo.finalizeOdontogram(
      req.auth!.principal,
      clinicId,
      odontogramId,
      membershipId,
      body.expectedVersion,
    );
  }

  @Post('odontograms/:odontogramId/amend')
  @ClinicPermissions('clinical.encounters.update')
  @RequireSpecialty('DENTISTRY')
  @RequireClinicalPrivilege('DENTAL_EXAMINATION_RECORD')
  amendOdontogram(
    @Req() req: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Param('odontogramId') odontogramId: string,
    @Body() body: AmendDentalOdontogramDto,
  ) {
    const membershipId = this.getMembershipId(req, clinicId);
    return this.dentistryRepo.amendOdontogram(req.auth!.principal, clinicId, odontogramId, membershipId, body);
  }

  @Post('odontograms/:odontogramId/enter-in-error')
  @ClinicPermissions('clinical.encounters.update')
  @RequireSpecialty('DENTISTRY')
  @RequireClinicalPrivilege('DENTAL_EXAMINATION_RECORD')
  enterInErrorOdontogram(
    @Req() req: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Param('odontogramId') odontogramId: string,
    @Body() body: EnterInErrorDentalOdontogramDto,
  ) {
    const membershipId = this.getMembershipId(req, clinicId);
    return this.dentistryRepo.enterInErrorOdontogram(
      req.auth!.principal,
      clinicId,
      odontogramId,
      membershipId,
      body,
    );
  }

  // =========================================================================
  // TOOTH FINDINGS
  // =========================================================================

  @Post('odontograms/:odontogramId/findings')
  @ClinicPermissions('clinical.encounters.update')
  @RequireSpecialty('DENTISTRY')
  @RequireClinicalPrivilege('DENTAL_EXAMINATION_RECORD')
  upsertToothFindings(
    @Req() req: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Param('odontogramId') odontogramId: string,
    @Body() body: BatchRecordToothFindingsDto,
  ) {
    const membershipId = this.getMembershipId(req, clinicId);
    return this.dentistryRepo.upsertToothFindings(
      req.auth!.principal,
      clinicId,
      odontogramId,
      membershipId,
      body.findings,
    );
  }

  @Delete('odontograms/:odontogramId/findings/:findingId')
  @ClinicPermissions('clinical.encounters.update')
  @RequireSpecialty('DENTISTRY')
  @RequireClinicalPrivilege('DENTAL_EXAMINATION_RECORD')
  deleteToothFinding(
    @Req() req: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Param('odontogramId') odontogramId: string,
    @Param('findingId') findingId: string,
  ) {
    return this.dentistryRepo.deleteToothFinding(
      req.auth!.principal,
      clinicId,
      odontogramId,
      findingId,
    );
  }

  // =========================================================================
  // PERIODONTAL CHARTING
  // =========================================================================

  @Post('odontograms/:odontogramId/periodontal')
  @ClinicPermissions('clinical.encounters.update')
  @RequireSpecialty('DENTISTRY')
  @RequireClinicalPrivilege('DENTAL_EXAMINATION_RECORD')
  upsertPeriodontalRecord(
    @Req() req: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Param('odontogramId') odontogramId: string,
    @Body() body: RecordPeriodontalRecordDto,
  ) {
    const membershipId = this.getMembershipId(req, clinicId);
    return this.dentistryRepo.recordPeriodontalRecord(
      req.auth!.principal,
      clinicId,
      odontogramId,
      membershipId,
      body,
    );
  }

  @Get('patients/:patientId/periodontal-comparison')
  @ClinicPermissions('clinical.encounters.read')
  getPeriodontalComparison(
    @Req() req: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Param('patientId') patientId: string,
    @Query('toothNumber') toothNumber?: string,
  ) {
    const toothNumberFdi = toothNumber ? Number.parseInt(toothNumber, 10) : undefined;
    return this.dentistryRepo.getPeriodontalComparison(
      req.auth!.principal,
      clinicId,
      patientId,
      toothNumberFdi,
    );
  }

  // =========================================================================
  // DENTAL TREATMENT STAGING
  // =========================================================================

  @Get('patients/:patientId/treatment-stages')
  @ClinicPermissions('clinical.treatment-plans.read')
  listTreatmentStages(
    @Req() req: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Param('patientId') patientId: string,
  ) {
    return this.dentistryRepo.getPatientTreatmentStages(req.auth!.principal, clinicId, patientId);
  }

  @Post('encounters/:encounterId/treatment-stages')
  @ClinicPermissions('clinical.treatment-plans.create')
  @RequireSpecialty('DENTISTRY')
  @RequireClinicalPrivilege('DENTAL_PROCEDURE_PLAN')
  createTreatmentStage(
    @Req() req: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Param('encounterId') encounterId: string,
    @Body() body: CreateDentalTreatmentStageDto & { odontogramId: string; patientId: string },
  ) {
    const membershipId = this.getMembershipId(req, clinicId);
    return this.dentistryRepo.createTreatmentStage(req.auth!.principal, clinicId, membershipId, {
      ...body,
      encounterId,
    });
  }

  @Post('treatment-stages/:stageId/approve')
  @ClinicPermissions('clinical.treatment-plans.approve')
  @RequireSpecialty('DENTISTRY')
  @RequireClinicalPrivilege('DENTAL_PROCEDURE_APPROVE')
  approveTreatmentStage(
    @Req() req: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Param('stageId') stageId: string,
    @Body() body: { expectedVersion: number },
  ) {
    const membershipId = this.getMembershipId(req, clinicId);
    return this.dentistryRepo.approveTreatmentStage(
      req.auth!.principal,
      clinicId,
      stageId,
      membershipId,
      body.expectedVersion,
    );
  }

  @Post('treatment-stages/:stageId/complete')
  @ClinicPermissions('clinical.procedures.perform')
  @RequireSpecialty('DENTISTRY')
  @RequireClinicalPrivilege('DENTAL_PROCEDURE_PERFORM')
  completeTreatmentStage(
    @Req() req: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Param('stageId') stageId: string,
    @Body() body: CompleteDentalTreatmentStageDto,
  ) {
    const membershipId = this.getMembershipId(req, clinicId);
    return this.dentistryRepo.completeTreatmentStage(
      req.auth!.principal,
      clinicId,
      stageId,
      membershipId,
      body,
    );
  }

  @Post('treatment-stages/:stageId/cancel')
  @ClinicPermissions('clinical.treatment-plans.update')
  cancelTreatmentStage(
    @Req() req: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Param('stageId') stageId: string,
    @Body() body: CancelDentalTreatmentStageDto,
  ) {
    const membershipId = this.getMembershipId(req, clinicId);
    return this.dentistryRepo.cancelTreatmentStage(
      req.auth!.principal,
      clinicId,
      stageId,
      membershipId,
      body.cancellationReason,
      body.expectedVersion,
    );
  }

  @Post('treatment-stages/:stageId/bill')
  @ClinicPermissions('invoices.create')
  billTreatmentStage(
    @Req() req: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Param('stageId') stageId: string,
    @Body() body: BillDentalTreatmentStageDto,
  ) {
    const membershipId = this.getMembershipId(req, clinicId);
    return this.dentistryRepo.billTreatmentStage(
      req.auth!.principal,
      clinicId,
      stageId,
      membershipId,
      body,
    );
  }

  @Post('treatment-stages/:stageId/consume-materials')
  @ClinicPermissions('clinical.inventory-consumption.record')
  consumeStageMaterials(
    @Req() req: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Param('stageId') stageId: string,
    @Body() body: ConsumeDentalStageMaterialsDto,
  ) {
    const membershipId = this.getMembershipId(req, clinicId);
    return this.dentistryRepo.consumeStageMaterials(
      req.auth!.principal,
      clinicId,
      stageId,
      membershipId,
      body,
    );
  }
}
