import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ClinicPermissions, type AuthRequest } from '../auth/access.js';
import { ClinicalFollowUpRepository } from '../prisma/clinical-followup.repository.js';
import {
  AmendFollowUpAssessmentDto,
  CompleteFollowUpAssessmentDto,
  RecordAdverseEventDto,
  RecordTreatmentOutcomeDto,
  ScheduleFollowUpDto,
  UpdateAdverseEventDto,
  UpdateFollowUpStatusDto,
} from './followup-input.js';

@Controller('clinics/:clinicId/clinical')
export class ClinicalFollowUpController {
  constructor(private readonly followUps: ClinicalFollowUpRepository) {}

  @Post('follow-ups')
  @ClinicPermissions('clinical.follow-ups.schedule')
  scheduleFollowUp(
    @Req() r: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Body() body: ScheduleFollowUpDto,
  ) {
    return this.followUps.scheduleFollowUp(r.auth!.principal, clinicId, body);
  }

  @Get('follow-ups')
  @ClinicPermissions('clinical.follow-ups.read')
  listFollowUps(
    @Req() r: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Query('patientId') patientId?: string,
    @Query('status') status?: string,
  ) {
    return this.followUps.listFollowUps(r.auth!.principal, clinicId, patientId, status);
  }

  @Get('follow-ups/:followUpId')
  @ClinicPermissions('clinical.follow-ups.read')
  getFollowUp(
    @Req() r: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Param('followUpId') followUpId: string,
  ) {
    return this.followUps.getFollowUp(r.auth!.principal, clinicId, followUpId);
  }

  @Patch('follow-ups/:followUpId/status')
  @ClinicPermissions('clinical.follow-ups.update')
  updateStatus(
    @Req() r: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Param('followUpId') followUpId: string,
    @Body() body: UpdateFollowUpStatusDto,
  ) {
    return this.followUps.updateStatus(r.auth!.principal, clinicId, followUpId, body);
  }

  @Post('follow-ups/:followUpId/assess')
  @ClinicPermissions('clinical.follow-ups.sign')
  completeAssessment(
    @Req() r: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Param('followUpId') followUpId: string,
    @Body() body: CompleteFollowUpAssessmentDto,
  ) {
    return this.followUps.completeAssessment(r.auth!.principal, clinicId, followUpId, body);
  }

  @Post('assessments/:assessmentId/amend')
  @ClinicPermissions('clinical.follow-ups.amend')
  amendAssessment(
    @Req() r: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Param('assessmentId') assessmentId: string,
    @Body() body: AmendFollowUpAssessmentDto,
  ) {
    return this.followUps.amendAssessment(r.auth!.principal, clinicId, assessmentId, body);
  }

  @Post('outcomes')
  @ClinicPermissions('clinical.outcomes.record')
  recordOutcome(
    @Req() r: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Body() body: RecordTreatmentOutcomeDto,
  ) {
    return this.followUps.recordOutcome(r.auth!.principal, clinicId, body);
  }

  @Get('patients/:patientId/outcomes')
  @ClinicPermissions('clinical.outcomes.read')
  listOutcomes(
    @Req() r: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Param('patientId') patientId: string,
  ) {
    return this.followUps.listOutcomes(r.auth!.principal, clinicId, patientId);
  }

  @Post('adverse-events')
  @ClinicPermissions('clinical.adverse-events.record')
  recordAdverseEvent(
    @Req() r: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Body() body: RecordAdverseEventDto,
  ) {
    return this.followUps.recordAdverseEvent(r.auth!.principal, clinicId, body);
  }

  @Patch('adverse-events/:eventId')
  @ClinicPermissions('clinical.adverse-events.manage')
  updateAdverseEvent(
    @Req() r: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Param('eventId') eventId: string,
    @Body() body: UpdateAdverseEventDto,
  ) {
    return this.followUps.updateAdverseEvent(r.auth!.principal, clinicId, eventId, body);
  }

  @Get('adverse-events')
  @ClinicPermissions('clinical.adverse-events.read')
  listAdverseEvents(
    @Req() r: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Query('patientId') patientId?: string,
  ) {
    return this.followUps.listAdverseEvents(r.auth!.principal, clinicId, patientId);
  }
}

