import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ClinicPermissions, type AuthRequest } from '../auth/access.js';
import { ClinicalRepository } from '../prisma/clinical.repository.js';
import { ClinicalListQuery, ClinicalPatientRoute, ClinicalRoute, CreateAmendmentDto, CreateEncounterDto, UpdateClinicalNoteDto, UpdateMedicalHistoryDto, VersionDto } from './clinical-input.js';

@Controller('clinics/:clinicId/clinical')
export class ClinicalController {
  constructor(private readonly clinical:ClinicalRepository) {}
  @Get('patients/:patientId/encounters') @ClinicPermissions('clinical.encounters.read')
  list(@Req() r:AuthRequest,@Param() p:ClinicalPatientRoute,@Query() q:ClinicalListQuery){return this.clinical.list(r.auth!.principal,p.clinicId,p.patientId,q);}
  @Get('encounters/:encounterId') @ClinicPermissions('clinical.encounters.read')
  get(@Req() r:AuthRequest,@Param() p:ClinicalRoute){return this.clinical.get(r.auth!.principal,p.clinicId,p.encounterId);}
  @Post('encounters') @ClinicPermissions('clinical.encounters.create')
  create(@Req() r:AuthRequest,@Param('clinicId') clinicId:string,@Body() b:CreateEncounterDto){return this.clinical.create(r.auth!.principal,clinicId,b);}
  @Patch('encounters/:encounterId/note') @ClinicPermissions('clinical.encounters.update')
  update(@Req() r:AuthRequest,@Param() p:ClinicalRoute,@Body() b:UpdateClinicalNoteDto){return this.clinical.update(r.auth!.principal,p.clinicId,p.encounterId,b);}
  @Post('encounters/:encounterId/sign') @ClinicPermissions('clinical.encounters.sign')
  sign(@Req() r:AuthRequest,@Param() p:ClinicalRoute,@Body() b:VersionDto){return this.clinical.sign(r.auth!.principal,p.clinicId,p.encounterId,b);}
  @Post('encounters/:encounterId/amendments') @ClinicPermissions('clinical.amendments.create')
  amend(@Req() r:AuthRequest,@Param() p:ClinicalRoute,@Body() b:CreateAmendmentDto){return this.clinical.amend(r.auth!.principal,p.clinicId,p.encounterId,b);}
  @Get('patients/:patientId/history') @ClinicPermissions('clinical.history.read')
  history(@Req() r:AuthRequest,@Param() p:ClinicalPatientRoute){return this.clinical.history(r.auth!.principal,p.clinicId,p.patientId);}
  @Patch('patients/:patientId/history') @ClinicPermissions('clinical.history.update')
  updateHistory(@Req() r:AuthRequest,@Param() p:ClinicalPatientRoute,@Body() b:UpdateMedicalHistoryDto){return this.clinical.updateHistory(r.auth!.principal,p.clinicId,p.patientId,b);}
}
