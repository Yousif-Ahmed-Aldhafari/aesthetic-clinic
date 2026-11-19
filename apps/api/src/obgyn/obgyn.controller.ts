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
import { ObGynRepository } from '../prisma/obgyn.repository.js';
import {
  RequireSpecialty,
  RequireClinicalPrivilege,
  SpecialtyPrivilegeGuard,
} from '../specialties/specialty-auth.guard.js';
import {
  CreatePregnancyEpisodeDto,
  UpdatePregnancyEpisodeDto,
  ReviewPregnancyDatingDto,
  FinalizePregnancyEpisodeDto,
  RecordAntenatalVisitDto,
  EnterInErrorAntenatalVisitDto,
  CreateObstetricHistoryDto,
  UpdateObstetricHistoryDto,
  RecordGynecologicalExamDto,
  EnterInErrorGynecologicalExamDto,
} from './obgyn.dto.js';

@Controller('clinics/:clinicId/obgyn')
@UseGuards(SpecialtyPrivilegeGuard)
export class ObGynController {
  constructor(private readonly obgynRepo: ObGynRepository) {}

  private getMembershipId(req: AuthRequest, clinicId: string): string {
    const membership = req.auth?.user.memberships.find(
      (m) => m.clinicId === clinicId && m.status === 'ACTIVE',
    );
    return membership?.id ?? '';
  }

  // =========================================================================
  // 1. PREGNANCY EPISODES
  // =========================================================================

  @Post(['episodes', 'pregnancy-episodes'])
  @RequireSpecialty('OB_GYN')
  @RequireClinicalPrivilege('ANTENATAL_CARE_DOCUMENT')
  @ClinicPermissions('clinical.encounters.create')
  createPregnancyEpisode(
    @Req() req: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Body() dto: CreatePregnancyEpisodeDto,
  ) {
    const membershipId = this.getMembershipId(req, clinicId);
    return this.obgynRepo.createPregnancyEpisode(req.auth!.principal, clinicId, membershipId, dto);
  }

  @Get(['patients/:patientId/episodes/active', 'patients/:patientId/active-pregnancy-episode'])
  @RequireSpecialty('OB_GYN')
  @ClinicPermissions('clinical.encounters.read')
  getActivePregnancyEpisode(
    @Req() req: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Param('patientId') patientId: string,
  ) {
    return this.obgynRepo.getActivePregnancyEpisode(req.auth!.principal, clinicId, patientId);
  }

  @Get(['patients/:patientId/episodes', 'patients/:patientId/pregnancy-episodes'])
  @RequireSpecialty('OB_GYN')
  @ClinicPermissions('clinical.encounters.read')
  listPregnancyEpisodes(
    @Req() req: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Param('patientId') patientId: string,
  ) {
    return this.obgynRepo.listPregnancyEpisodes(req.auth!.principal, clinicId, patientId);
  }

  @Get(['episodes/:id', 'pregnancy-episodes/:id'])
  @RequireSpecialty('OB_GYN')
  @ClinicPermissions('clinical.encounters.read')
  getPregnancyEpisode(
    @Req() req: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Param('id') episodeId: string,
  ) {
    return this.obgynRepo.getPregnancyEpisode(req.auth!.principal, clinicId, episodeId);
  }

  @Patch(['episodes/:id', 'pregnancy-episodes/:id'])
  @RequireSpecialty('OB_GYN')
  @RequireClinicalPrivilege('ANTENATAL_CARE_DOCUMENT')
  @ClinicPermissions('clinical.encounters.update')
  updatePregnancyEpisode(
    @Req() req: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Param('id') episodeId: string,
    @Body() dto: UpdatePregnancyEpisodeDto,
  ) {
    return this.obgynRepo.updatePregnancyEpisode(req.auth!.principal, clinicId, episodeId, dto);
  }

  @Post(['episodes/:id/dating-review', 'pregnancy-episodes/:id/dating-review'])
  @RequireSpecialty('OB_GYN')
  @RequireClinicalPrivilege('OBSTETRIC_DATING_REVIEW')
  @ClinicPermissions('clinical.encounters.update')
  reviewPregnancyDating(
    @Req() req: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Param('id') episodeId: string,
    @Body() dto: ReviewPregnancyDatingDto,
  ) {
    const membershipId = this.getMembershipId(req, clinicId);
    return this.obgynRepo.reviewPregnancyDating(req.auth!.principal, clinicId, membershipId, episodeId, dto);
  }

  @Post(['episodes/:id/finalize', 'pregnancy-episodes/:id/finalize'])
  @RequireSpecialty('OB_GYN')
  @RequireClinicalPrivilege('OBSTETRIC_EPISODE_FINALIZE')
  @ClinicPermissions('clinical.encounters.update')
  finalizePregnancyEpisode(
    @Req() req: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Param('id') episodeId: string,
    @Body() dto: FinalizePregnancyEpisodeDto,
  ) {
    const membershipId = this.getMembershipId(req, clinicId);
    return this.obgynRepo.finalizePregnancyEpisode(req.auth!.principal, clinicId, membershipId, episodeId, dto);
  }

  // =========================================================================
  // 2. ANTENATAL CARE VISITS
  // =========================================================================

  @Post('antenatal-visits')
  @RequireSpecialty('OB_GYN')
  @RequireClinicalPrivilege('ANTENATAL_CARE_DOCUMENT')
  @ClinicPermissions('clinical.encounters.create')
  recordAntenatalVisit(
    @Req() req: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Body() dto: RecordAntenatalVisitDto,
  ) {
    const membershipId = this.getMembershipId(req, clinicId);
    return this.obgynRepo.recordAntenatalVisit(req.auth!.principal, clinicId, membershipId, dto);
  }

  @Get(['episodes/:episodeId/antenatal-visits', 'pregnancy-episodes/:episodeId/antenatal-visits'])
  @RequireSpecialty('OB_GYN')
  @ClinicPermissions('clinical.encounters.read')
  listAntenatalVisits(
    @Req() req: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Param('episodeId') episodeId: string,
  ) {
    return this.obgynRepo.listAntenatalVisits(req.auth!.principal, clinicId, episodeId);
  }

  @Post('antenatal-visits/:id/enter-in-error')
  @RequireSpecialty('OB_GYN')
  @RequireClinicalPrivilege('ANTENATAL_CARE_DOCUMENT')
  @ClinicPermissions('clinical.encounters.update')
  enterInErrorAntenatalVisit(
    @Req() req: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Param('id') visitId: string,
    @Body() dto: EnterInErrorAntenatalVisitDto,
  ) {
    const membershipId = this.getMembershipId(req, clinicId);
    return this.obgynRepo.enterInErrorAntenatalVisit(req.auth!.principal, clinicId, membershipId, visitId, dto);
  }

  // =========================================================================
  // 3. OBSTETRIC HISTORY
  // =========================================================================

  @Post('obstetric-history')
  @RequireSpecialty('OB_GYN')
  @RequireClinicalPrivilege('ANTENATAL_CARE_DOCUMENT')
  @ClinicPermissions('clinical.encounters.create')
  createObstetricHistory(
    @Req() req: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Body() dto: CreateObstetricHistoryDto,
  ) {
    const membershipId = this.getMembershipId(req, clinicId);
    return this.obgynRepo.createObstetricHistory(req.auth!.principal, clinicId, membershipId, dto);
  }

  @Get('patients/:patientId/obstetric-history')
  @RequireSpecialty('OB_GYN')
  @ClinicPermissions('clinical.encounters.read')
  listObstetricHistory(
    @Req() req: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Param('patientId') patientId: string,
  ) {
    return this.obgynRepo.listObstetricHistory(req.auth!.principal, clinicId, patientId);
  }

  @Patch('obstetric-history/:id')
  @RequireSpecialty('OB_GYN')
  @RequireClinicalPrivilege('ANTENATAL_CARE_DOCUMENT')
  @ClinicPermissions('clinical.encounters.update')
  updateObstetricHistory(
    @Req() req: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Param('id') historyId: string,
    @Body() dto: UpdateObstetricHistoryDto,
  ) {
    return this.obgynRepo.updateObstetricHistory(req.auth!.principal, clinicId, historyId, dto);
  }

  // =========================================================================
  // 4. CONFIDENTIAL GYNECOLOGICAL EXAMINATIONS
  // =========================================================================

  @Post('gynecological-exams')
  @RequireSpecialty('OB_GYN')
  @RequireClinicalPrivilege('GYNECOLOGICAL_EXAM_PERFORM')
  @ClinicPermissions('clinical.encounters.create')
  recordGynecologicalExam(
    @Req() req: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Body() dto: RecordGynecologicalExamDto,
  ) {
    const membershipId = this.getMembershipId(req, clinicId);
    return this.obgynRepo.recordGynecologicalExam(req.auth!.principal, clinicId, membershipId, dto);
  }

  @Get('patients/:patientId/gynecological-exams')
  @RequireSpecialty('OB_GYN')
  @ClinicPermissions('clinical.encounters.read')
  listGynecologicalExams(
    @Req() req: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Param('patientId') patientId: string,
  ) {
    const membershipId = this.getMembershipId(req, clinicId);
    return this.obgynRepo.listGynecologicalExams(req.auth!.principal, clinicId, membershipId, patientId);
  }

  @Get('gynecological-exams/:id')
  @RequireSpecialty('OB_GYN')
  @ClinicPermissions('clinical.encounters.read')
  getGynecologicalExam(
    @Req() req: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Param('id') examId: string,
  ) {
    const membershipId = this.getMembershipId(req, clinicId);
    return this.obgynRepo.getGynecologicalExam(req.auth!.principal, clinicId, membershipId, examId);
  }

  @Post('gynecological-exams/:id/enter-in-error')
  @RequireSpecialty('OB_GYN')
  @RequireClinicalPrivilege('GYNECOLOGICAL_EXAM_PERFORM')
  @ClinicPermissions('clinical.encounters.update')
  enterInErrorGynecologicalExam(
    @Req() req: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Param('id') examId: string,
    @Body() dto: EnterInErrorGynecologicalExamDto,
  ) {
    const membershipId = this.getMembershipId(req, clinicId);
    return this.obgynRepo.enterInErrorGynecologicalExam(req.auth!.principal, clinicId, membershipId, examId, dto);
  }
}
