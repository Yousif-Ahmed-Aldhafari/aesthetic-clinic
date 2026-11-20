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
import { OphthalmologyEntRepository } from '../prisma/ophthalmology-ent.repository.js';
import {
  RequireSpecialty,
  RequireClinicalPrivilege,
  SpecialtyPrivilegeGuard,
} from '../specialties/specialty-auth.guard.js';
import {
  RecordRefractionDto,
  RecordOphthalmicExamDto,
  RecordEntExamDto,
  RecordAudiometryDto,
  EnterInErrorSpecialtyRecordDto,
} from './ophthalmology-ent.dto.js';
import {
  evaluateIop,
  classifyHearingImpairment,
} from './ophthalmology-ent-analytics.js';

@Controller('clinics/:clinicId')
@UseGuards(SpecialtyPrivilegeGuard)
export class OphthalmologyEntController {
  constructor(private readonly ophthEntRepo: OphthalmologyEntRepository) {}

  private getMembershipId(req: AuthRequest, clinicId: string): string {
    const membership = req.auth?.user.memberships.find(
      (m) => m.clinicId === clinicId && m.status === 'ACTIVE',
    );
    return membership?.id ?? '';
  }

  // =========================================================================
  // 1. OPHTHALMIC REFRACTION ENDPOINTS
  // =========================================================================

  @Post(['ophthalmology/encounters/:encounterId/refractions', 'ophthalmology/refractions'])
  @RequireSpecialty('OPHTHALMOLOGY')
  @RequireClinicalPrivilege('REFRACTION_MEASURE')
  @ClinicPermissions('clinical.encounters.create')
  recordRefraction(
    @Req() req: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Param('encounterId') encounterId: string,
    @Body() dto: RecordRefractionDto & { encounterId?: string },
  ) {
    const targetEncounterId = encounterId || dto.encounterId!;
    const membershipId = this.getMembershipId(req, clinicId);
    return this.ophthEntRepo.recordRefraction(req.auth!.principal, clinicId, targetEncounterId, membershipId, dto);
  }

  @Get('ophthalmology/patients/:patientId/refractions')
  @RequireSpecialty('OPHTHALMOLOGY')
  @ClinicPermissions('clinical.encounters.read')
  listRefractions(
    @Req() req: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Param('patientId') patientId: string,
  ) {
    return this.ophthEntRepo.listRefractionsForPatient(req.auth!.principal, clinicId, patientId);
  }

  @Patch('ophthalmology/refractions/:id/enter-in-error')
  @RequireSpecialty('OPHTHALMOLOGY')
  @RequireClinicalPrivilege('OPHTHALMIC_RECORD_FINALIZE')
  @ClinicPermissions('clinical.encounters.create')
  enterInErrorRefraction(
    @Req() req: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Param('id') id: string,
    @Body() dto: EnterInErrorSpecialtyRecordDto,
  ) {
    const membershipId = this.getMembershipId(req, clinicId);
    return this.ophthEntRepo.enterInErrorRefraction(req.auth!.principal, clinicId, id, membershipId, dto);
  }

  // =========================================================================
  // 2. OPHTHALMIC EXAMINATION ENDPOINTS
  // =========================================================================

  @Post(['ophthalmology/encounters/:encounterId/examinations', 'ophthalmology/examinations'])
  @RequireSpecialty('OPHTHALMOLOGY')
  @RequireClinicalPrivilege('OPHTHALMIC_EXAM_DOCUMENT')
  @ClinicPermissions('clinical.encounters.create')
  recordOphthalmicExam(
    @Req() req: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Param('encounterId') encounterId: string,
    @Body() dto: RecordOphthalmicExamDto & { encounterId?: string },
  ) {
    const targetEncounterId = encounterId || dto.encounterId!;
    const membershipId = this.getMembershipId(req, clinicId);
    return this.ophthEntRepo.recordOphthalmicExam(req.auth!.principal, clinicId, targetEncounterId, membershipId, dto);
  }

  @Get('ophthalmology/patients/:patientId/examinations')
  @RequireSpecialty('OPHTHALMOLOGY')
  @ClinicPermissions('clinical.encounters.read')
  listOphthalmicExams(
    @Req() req: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Param('patientId') patientId: string,
  ) {
    return this.ophthEntRepo.listOphthalmicExamsForPatient(req.auth!.principal, clinicId, patientId);
  }

  @Patch('ophthalmology/examinations/:id/enter-in-error')
  @RequireSpecialty('OPHTHALMOLOGY')
  @RequireClinicalPrivilege('OPHTHALMIC_RECORD_FINALIZE')
  @ClinicPermissions('clinical.encounters.create')
  enterInErrorOphthalmicExam(
    @Req() req: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Param('id') id: string,
    @Body() dto: EnterInErrorSpecialtyRecordDto,
  ) {
    const membershipId = this.getMembershipId(req, clinicId);
    return this.ophthEntRepo.enterInErrorOphthalmicExam(req.auth!.principal, clinicId, id, membershipId, dto);
  }

  @Post('ophthalmology/evaluate-iop')
  @RequireSpecialty('OPHTHALMOLOGY')
  @ClinicPermissions('clinical.encounters.read')
  evaluateIopInteractive(
    @Body() body: { odIntraocularPressureMmHg?: number; osIntraocularPressureMmHg?: number },
  ) {
    return evaluateIop(body.odIntraocularPressureMmHg ?? null, body.osIntraocularPressureMmHg ?? null);
  }

  // =========================================================================
  // 3. ENT EXAMINATION ENDPOINTS
  // =========================================================================

  @Post(['ent/encounters/:encounterId/examinations', 'ent/examinations'])
  @RequireSpecialty('ENT')
  @RequireClinicalPrivilege('ENT_EXAM_DOCUMENT')
  @ClinicPermissions('clinical.encounters.create')
  recordEntExam(
    @Req() req: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Param('encounterId') encounterId: string,
    @Body() dto: RecordEntExamDto & { encounterId?: string },
  ) {
    const targetEncounterId = encounterId || dto.encounterId!;
    const membershipId = this.getMembershipId(req, clinicId);
    return this.ophthEntRepo.recordEntExam(req.auth!.principal, clinicId, targetEncounterId, membershipId, dto);
  }

  @Get('ent/patients/:patientId/examinations')
  @RequireSpecialty('ENT')
  @ClinicPermissions('clinical.encounters.read')
  listEntExams(
    @Req() req: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Param('patientId') patientId: string,
  ) {
    return this.ophthEntRepo.listEntExamsForPatient(req.auth!.principal, clinicId, patientId);
  }

  @Patch('ent/examinations/:id/enter-in-error')
  @RequireSpecialty('ENT')
  @RequireClinicalPrivilege('ENT_PROCEDURE_PERFORM')
  @ClinicPermissions('clinical.encounters.create')
  enterInErrorEntExam(
    @Req() req: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Param('id') id: string,
    @Body() dto: EnterInErrorSpecialtyRecordDto,
  ) {
    const membershipId = this.getMembershipId(req, clinicId);
    return this.ophthEntRepo.enterInErrorEntExam(req.auth!.principal, clinicId, id, membershipId, dto);
  }

  // =========================================================================
  // 4. AUDIOMETRY ASSESSMENT ENDPOINTS
  // =========================================================================

  @Post(['ent/encounters/:encounterId/audiometry', 'ent/audiometry'])
  @RequireSpecialty('ENT')
  @RequireClinicalPrivilege('AUDIOMETRY_RECORD')
  @ClinicPermissions('clinical.encounters.create')
  recordAudiometry(
    @Req() req: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Param('encounterId') encounterId: string,
    @Body() dto: RecordAudiometryDto & { encounterId?: string },
  ) {
    const targetEncounterId = encounterId || dto.encounterId!;
    const membershipId = this.getMembershipId(req, clinicId);
    return this.ophthEntRepo.recordAudiometry(req.auth!.principal, clinicId, targetEncounterId, membershipId, dto);
  }

  @Get('ent/patients/:patientId/audiometry')
  @RequireSpecialty('ENT')
  @ClinicPermissions('clinical.encounters.read')
  listAudiometry(
    @Req() req: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Param('patientId') patientId: string,
  ) {
    return this.ophthEntRepo.listAudiometryForPatient(req.auth!.principal, clinicId, patientId);
  }

  @Patch('ent/audiometry/:id/enter-in-error')
  @RequireSpecialty('ENT')
  @RequireClinicalPrivilege('ENT_PROCEDURE_PERFORM')
  @ClinicPermissions('clinical.encounters.create')
  enterInErrorAudiometry(
    @Req() req: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Param('id') id: string,
    @Body() dto: EnterInErrorSpecialtyRecordDto,
  ) {
    const membershipId = this.getMembershipId(req, clinicId);
    return this.ophthEntRepo.enterInErrorAudiometry(req.auth!.principal, clinicId, id, membershipId, dto);
  }

  @Post('ent/audiometry/calculate-pta')
  @RequireSpecialty('ENT')
  @ClinicPermissions('clinical.encounters.read')
  calculatePtaInteractive(
    @Body() body: { airThresholdsDb: number[]; boneThresholdsDb?: number[] },
  ) {
    return classifyHearingImpairment(body.airThresholdsDb, body.boneThresholdsDb);
  }
}
