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
import { OrthopedicsPhysiotherapyRepository } from '../prisma/orthopedics-physiotherapy.repository.js';
import {
  RequireSpecialty,
  RequireClinicalPrivilege,
  SpecialtyPrivilegeGuard,
} from '../specialties/specialty-auth.guard.js';
import {
  RecordMusculoskeletalExamDto,
  RecordJointRomDto,
  CreateRehabilitationEpisodeDto,
  UpdateRehabilitationEpisodeStatusDto,
  RecordPhysiotherapySessionDto,
  EnterInErrorRecordDto,
} from './orthopedics-physiotherapy.dto.js';

@Controller('clinics/:clinicId')
@UseGuards(SpecialtyPrivilegeGuard)
export class OrthopedicsPhysiotherapyController {
  constructor(private readonly orthoPtRepo: OrthopedicsPhysiotherapyRepository) {}

  private getMembershipId(req: AuthRequest, clinicId: string): string {
    const membership = req.auth?.user.memberships.find(
      (m) => m.clinicId === clinicId && m.status === 'ACTIVE',
    );
    return membership?.id ?? '';
  }

  // =========================================================================
  // 1. MUSCULOSKELETAL EXAMINATION ENDPOINTS
  // =========================================================================

  @Post(['orthopedics/encounters/:encounterId/examinations', 'orthopedics/examinations'])
  @RequireSpecialty('ORTHOPEDICS')
  @RequireClinicalPrivilege('ORTHOPEDIC_EXAM_PERFORM')
  @ClinicPermissions('clinical.encounters.create')
  recordMusculoskeletalExam(
    @Req() req: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Param('encounterId') encounterId: string,
    @Body() dto: RecordMusculoskeletalExamDto & { encounterId?: string },
  ) {
    const targetEncounterId = encounterId || dto.encounterId!;
    const membershipId = this.getMembershipId(req, clinicId);
    return this.orthoPtRepo.recordMusculoskeletalExam(
      req.auth!.principal,
      clinicId,
      targetEncounterId,
      membershipId,
      dto,
    );
  }

  @Get('orthopedics/patients/:patientId/examinations')
  @RequireSpecialty('ORTHOPEDICS')
  @ClinicPermissions('clinical.encounters.read')
  listMusculoskeletalExams(
    @Req() req: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Param('patientId') patientId: string,
  ) {
    return this.orthoPtRepo.listMusculoskeletalExamsForPatient(
      req.auth!.principal,
      clinicId,
      patientId,
    );
  }

  @Patch('orthopedics/examinations/:id/enter-in-error')
  @RequireSpecialty('ORTHOPEDICS')
  @RequireClinicalPrivilege('ORTHOPEDIC_RECORD_FINALIZE')
  @ClinicPermissions('clinical.encounters.create')
  enterInErrorMusculoskeletalExam(
    @Req() req: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Param('id') id: string,
    @Body() dto: EnterInErrorRecordDto,
  ) {
    const membershipId = this.getMembershipId(req, clinicId);
    return this.orthoPtRepo.enterInErrorMusculoskeletalExam(
      req.auth!.principal,
      clinicId,
      id,
      membershipId,
      dto,
    );
  }

  // =========================================================================
  // 2. JOINT RANGE OF MOTION (ROM) ENDPOINTS
  // =========================================================================

  @Post([
    'orthopedics/encounters/:encounterId/rom',
    'orthopedics/rom',
    'physiotherapy/encounters/:encounterId/rom',
    'physiotherapy/rom',
  ])
  @RequireClinicalPrivilege('JOINT_ROM_MEASURE')
  @ClinicPermissions('clinical.encounters.create')
  recordJointRom(
    @Req() req: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Param('encounterId') encounterId: string,
    @Body() dto: RecordJointRomDto & { encounterId?: string },
  ) {
    const targetEncounterId = encounterId || dto.encounterId!;
    const membershipId = this.getMembershipId(req, clinicId);
    return this.orthoPtRepo.recordJointRom(
      req.auth!.principal,
      clinicId,
      targetEncounterId,
      membershipId,
      dto,
    );
  }

  @Get([
    'orthopedics/patients/:patientId/rom',
    'physiotherapy/patients/:patientId/rom',
  ])
  @ClinicPermissions('clinical.encounters.read')
  listJointRom(
    @Req() req: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Param('patientId') patientId: string,
  ) {
    return this.orthoPtRepo.listJointRomForPatient(
      req.auth!.principal,
      clinicId,
      patientId,
    );
  }

  // =========================================================================
  // 3. PHYSIOTHERAPY REHABILITATION EPISODES
  // =========================================================================

  @Post('physiotherapy/episodes')
  @RequireSpecialty('PHYSIOTHERAPY')
  @RequireClinicalPrivilege('PHYSIOTHERAPY_PLAN_CREATE')
  @ClinicPermissions('clinical.encounters.create')
  createRehabilitationEpisode(
    @Req() req: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Body() dto: CreateRehabilitationEpisodeDto,
  ) {
    const membershipId = this.getMembershipId(req, clinicId);
    return this.orthoPtRepo.createRehabilitationEpisode(
      req.auth!.principal,
      clinicId,
      membershipId,
      dto,
    );
  }

  @Patch('physiotherapy/episodes/:id/status')
  @RequireSpecialty('PHYSIOTHERAPY')
  @RequireClinicalPrivilege('PHYSIOTHERAPY_PLAN_APPROVE')
  @ClinicPermissions('clinical.encounters.create')
  updateEpisodeStatus(
    @Req() req: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Param('id') id: string,
    @Body() dto: UpdateRehabilitationEpisodeStatusDto,
  ) {
    const membershipId = this.getMembershipId(req, clinicId);
    return this.orthoPtRepo.updateRehabilitationEpisodeStatus(
      req.auth!.principal,
      clinicId,
      id,
      membershipId,
      dto,
    );
  }

  @Get('physiotherapy/patients/:patientId/episodes')
  @RequireSpecialty('PHYSIOTHERAPY')
  @ClinicPermissions('clinical.encounters.read')
  listRehabilitationEpisodes(
    @Req() req: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Param('patientId') patientId: string,
  ) {
    return this.orthoPtRepo.listRehabilitationEpisodesForPatient(
      req.auth!.principal,
      clinicId,
      patientId,
    );
  }

  // =========================================================================
  // 4. PHYSIOTHERAPY SESSIONS
  // =========================================================================

  @Post([
    'physiotherapy/encounters/:encounterId/sessions',
    'physiotherapy/sessions',
  ])
  @RequireSpecialty('PHYSIOTHERAPY')
  @RequireClinicalPrivilege('PHYSIOTHERAPY_SESSION_DOCUMENT')
  @ClinicPermissions('clinical.encounters.create')
  recordPhysiotherapySession(
    @Req() req: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Param('encounterId') encounterId: string,
    @Body() dto: RecordPhysiotherapySessionDto & { encounterId?: string },
  ) {
    const targetEncounterId = encounterId || dto.encounterId!;
    const membershipId = this.getMembershipId(req, clinicId);
    return this.orthoPtRepo.recordPhysiotherapySession(
      req.auth!.principal,
      clinicId,
      targetEncounterId,
      membershipId,
      dto,
    );
  }

  @Get('physiotherapy/patients/:patientId/sessions')
  @RequireSpecialty('PHYSIOTHERAPY')
  @ClinicPermissions('clinical.encounters.read')
  listPhysiotherapySessions(
    @Req() req: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Param('patientId') patientId: string,
  ) {
    return this.orthoPtRepo.listPhysiotherapySessionsForPatient(
      req.auth!.principal,
      clinicId,
      patientId,
    );
  }

  @Patch('physiotherapy/sessions/:id/enter-in-error')
  @RequireSpecialty('PHYSIOTHERAPY')
  @RequireClinicalPrivilege('PHYSIOTHERAPY_SESSION_DOCUMENT')
  @ClinicPermissions('clinical.encounters.create')
  enterInErrorPhysiotherapySession(
    @Req() req: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Param('id') id: string,
    @Body() dto: EnterInErrorRecordDto,
  ) {
    const membershipId = this.getMembershipId(req, clinicId);
    return this.orthoPtRepo.enterInErrorPhysiotherapySession(
      req.auth!.principal,
      clinicId,
      id,
      membershipId,
      dto,
    );
  }
}
