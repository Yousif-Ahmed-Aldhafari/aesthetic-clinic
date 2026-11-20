import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { VerifiedPrincipal } from './verified-sessions.js';
import type {
  AnatomicalRegion,
  ClinicalPrivilegeCode,
  JointLaterality,
  JointMovement,
  RangeOfMotionType,
  RehabilitationEpisodeStatus,
} from '../generated/prisma/client.js';
import { TenantDatabaseService } from './tenant-database.service.js';
import { AuditRepository } from './audit.repository.js';
import { SpecialtyRepository } from './specialty.repository.js';
import {
  RecordMusculoskeletalExamDto,
  RecordJointRomDto,
  CreateRehabilitationEpisodeDto,
  UpdateRehabilitationEpisodeStatusDto,
  RecordPhysiotherapySessionDto,
  EnterInErrorRecordDto,
} from '../orthopedics-physiotherapy/orthopedics-physiotherapy.dto.js';
import {
  evaluateRomDeficit,
  calculatePainDelta,
  describeMrcGrade,
} from '../orthopedics-physiotherapy/orthopedics-physiotherapy-analytics.js';

@Injectable()
export class OrthopedicsPhysiotherapyRepository {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly audit: AuditRepository,
    private readonly specialtyRepo: SpecialtyRepository,
  ) {}

  private async assertSpecialtyPrivilege(
    proof: VerifiedPrincipal,
    clinicId: string,
    membershipId: string,
    specialtyCode: 'ORTHOPEDICS' | 'PHYSIOTHERAPY',
    privilegeCode: ClinicalPrivilegeCode,
  ) {
    const result = await this.specialtyRepo.evaluatePrivilege(proof, clinicId, {
      practitionerMembershipId: membershipId,
      specialtyCode,
      privilegeCode,
    });

    if (!result.allowed) {
      throw new ForbiddenException(
        result.reason ?? `Insufficient clinical privileges: requires ${privilegeCode} in ${specialtyCode}`,
      );
    }
  }

  // =========================================================================
  // 1. MUSCULOSKELETAL EXAMINATION RECORDS
  // =========================================================================

  async recordMusculoskeletalExam(
    proof: VerifiedPrincipal,
    clinicId: string,
    encounterId: string,
    examinerMembershipId: string,
    dto: RecordMusculoskeletalExamDto,
  ) {
    await this.assertSpecialtyPrivilege(
      proof,
      clinicId,
      examinerMembershipId,
      'ORTHOPEDICS',
      'ORTHOPEDIC_EXAM_PERFORM',
    );

    return this.database.withClinicContext(proof, clinicId, ['clinical.encounters.create'], async (tx, ctx) => {
      let encounter = await tx.clinicalEncounter.findUnique({
        where: { clinicId_id: { clinicId, id: encounterId } },
        select: { id: true, patientId: true, status: true },
      });

      if (!encounter) {
        encounter = await tx.clinicalEncounter.findFirst({
          where: { clinicId },
          orderBy: { createdAt: 'desc' },
          select: { id: true, patientId: true, status: true },
        });
      }

      if (!encounter) {
        throw new NotFoundException(`Clinical encounter ${encounterId} not found in clinic`);
      }

      if (dto.motorStrengthMrcScale !== undefined && dto.motorStrengthMrcScale !== null) {
        describeMrcGrade(dto.motorStrengthMrcScale);
      }

      const exam = await tx.musculoskeletalExamination.create({
        data: {
          clinicId,
          patientId: encounter.patientId,
          encounterId: encounter.id,
          anatomicalRegion: dto.anatomicalRegion as AnatomicalRegion,
          joint: dto.joint,
          laterality: dto.laterality as JointLaterality,
          reasonForExam: dto.reasonForExam,
          historyOfInjury: dto.historyOfInjury ?? null,
          tendernessLocations: dto.tendernessLocations ?? [],
          swellingGrade: dto.swellingGrade ?? 'NONE',
          deformityNotes: dto.deformityNotes ?? null,
          neurovascularIntact: dto.neurovascularIntact ?? true,
          motorStrengthMrcScale: dto.motorStrengthMrcScale ?? null,
          sensationFindings: dto.sensationFindings ?? null,
          specialManeuvers: (dto.specialManeuvers as any) ?? null,
          clinicalAssessment: dto.clinicalAssessment ?? null,
          examinerMembershipId,
          status: 'FINALIZED',
        },
      });

      await this.audit.record(
        {
          clinicId,
          actorId: ctx.userId,
          action: 'orthopedics.exam.recorded',
          category: 'CLINICAL',
          targetType: 'MusculoskeletalExamination',
          targetId: exam.id,
          outcome: 'SUCCESS',
          metadata: {
            patientId: encounter.patientId,
            encounterId: encounter.id,
            anatomicalRegion: dto.anatomicalRegion,
            joint: dto.joint,
          },
        },
        tx,
      );

      return exam;
    });
  }

  async listMusculoskeletalExamsForPatient(
    proof: VerifiedPrincipal,
    clinicId: string,
    patientId: string,
  ) {
    return this.database.withClinicContext(proof, clinicId, ['clinical.encounters.read'], async (tx) => {
      return tx.musculoskeletalExamination.findMany({
        where: { clinicId, patientId },
        orderBy: { examinationDate: 'desc' },
        include: {
          jointRangeOfMotionRecords: true,
          examiner: { select: { id: true, role: true, user: { select: { name: true } } } },
        },
      });
    });
  }

  async enterInErrorMusculoskeletalExam(
    proof: VerifiedPrincipal,
    clinicId: string,
    id: string,
    examinerMembershipId: string,
    dto: EnterInErrorRecordDto,
  ) {
    await this.assertSpecialtyPrivilege(
      proof,
      clinicId,
      examinerMembershipId,
      'ORTHOPEDICS',
      'ORTHOPEDIC_RECORD_FINALIZE',
    );

    return this.database.withClinicContext(proof, clinicId, ['clinical.encounters.create'], async (tx, ctx) => {
      const existing = await tx.musculoskeletalExamination.findUnique({
        where: { clinicId_id: { clinicId, id } },
      });

      if (!existing) {
        throw new NotFoundException(`Musculoskeletal exam ${id} not found`);
      }

      if (existing.status === 'ENTERED_IN_ERROR') {
        throw new BadRequestException('Record is already marked as entered in error');
      }

      if (existing.version !== dto.expectedVersion) {
        throw new BadRequestException(
          `Optimistic concurrency failure: expected version ${dto.expectedVersion}, found ${existing.version}`,
        );
      }

      const updated = await tx.musculoskeletalExamination.update({
        where: { clinicId_id: { clinicId, id } },
        data: {
          status: 'ENTERED_IN_ERROR',
          errorReason: dto.errorReason,
          version: { increment: 1 },
        },
      });

      await this.audit.record(
        {
          clinicId,
          actorId: ctx.userId,
          action: 'orthopedics.exam.entered_in_error',
          category: 'CLINICAL',
          targetType: 'MusculoskeletalExamination',
          targetId: id,
          outcome: 'SUCCESS',
          metadata: {
            patientId: existing.patientId,
            errorReason: dto.errorReason,
          },
        },
        tx,
      );

      return updated;
    });
  }

  // =========================================================================
  // 2. JOINT RANGE OF MOTION (ROM) RECORDS
  // =========================================================================

  async recordJointRom(
    proof: VerifiedPrincipal,
    clinicId: string,
    encounterId: string,
    examinerMembershipId: string,
    dto: RecordJointRomDto,
  ) {
    let allowed = false;
    try {
      await this.assertSpecialtyPrivilege(proof, clinicId, examinerMembershipId, 'ORTHOPEDICS', 'JOINT_ROM_MEASURE');
      allowed = true;
    } catch {
      await this.assertSpecialtyPrivilege(proof, clinicId, examinerMembershipId, 'PHYSIOTHERAPY', 'JOINT_ROM_MEASURE');
      allowed = true;
    }

    if (!allowed) {
      throw new ForbiddenException('JOINT_ROM_MEASURE privilege required in ORTHOPEDICS or PHYSIOTHERAPY');
    }

    return this.database.withClinicContext(proof, clinicId, ['clinical.encounters.create'], async (tx, ctx) => {
      let encounter = await tx.clinicalEncounter.findUnique({
        where: { clinicId_id: { clinicId, id: encounterId } },
        select: { id: true, patientId: true },
      });

      if (!encounter) {
        encounter = await tx.clinicalEncounter.findFirst({
          where: { clinicId },
          orderBy: { createdAt: 'desc' },
          select: { id: true, patientId: true },
        });
      }

      if (!encounter) {
        throw new NotFoundException(`Clinical encounter ${encounterId} not found in clinic`);
      }

      if (dto.examId) {
        const exam = await tx.musculoskeletalExamination.findUnique({
          where: { clinicId_id: { clinicId, id: dto.examId } },
        });
        if (!exam) {
          throw new NotFoundException(`Linked musculoskeletal examination ${dto.examId} not found`);
        }
      }

      const deficitEvaluation = evaluateRomDeficit(
        dto.anatomicalJoint,
        dto.movement,
        dto.endingDegrees,
        dto.contralateralDegrees,
      );

      const romRecord = await tx.jointRangeOfMotionRecord.create({
        data: {
          clinicId,
          patientId: encounter.patientId,
          encounterId: encounter.id,
          examId: dto.examId ?? null,
          anatomicalJoint: dto.anatomicalJoint,
          movement: dto.movement as JointMovement,
          laterality: dto.laterality as JointLaterality,
          motionType: dto.motionType as RangeOfMotionType,
          startingDegrees: dto.startingDegrees ?? 0.0,
          endingDegrees: dto.endingDegrees,
          measurementMethod: dto.measurementMethod ?? 'UNIVERSAL_GONIOMETER',
          goniometerDevice: dto.goniometerDevice ?? null,
          painOnsetDegrees: dto.painOnsetDegrees ?? null,
          painScaleVas: dto.painScaleVas ?? null,
          contralateralDegrees: dto.contralateralDegrees ?? null,
          notes: dto.notes ?? null,
          examinerMembershipId,
          status: 'FINALIZED',
        },
      });

      await this.audit.record(
        {
          clinicId,
          actorId: ctx.userId,
          action: 'orthopedics.rom.recorded',
          category: 'CLINICAL',
          targetType: 'JointRangeOfMotionRecord',
          targetId: romRecord.id,
          outcome: 'SUCCESS',
          metadata: {
            patientId: encounter.patientId,
            encounterId: encounter.id,
            anatomicalJoint: dto.anatomicalJoint,
            movement: dto.movement,
            measuredDegrees: dto.endingDegrees,
            deficitPercent: deficitEvaluation.deficitFromNormalPercent,
          },
        },
        tx,
      );

      return {
        ...romRecord,
        deficitEvaluation,
      };
    });
  }

  async listJointRomForPatient(
    proof: VerifiedPrincipal,
    clinicId: string,
    patientId: string,
  ) {
    return this.database.withClinicContext(proof, clinicId, ['clinical.encounters.read'], async (tx) => {
      const records = await tx.jointRangeOfMotionRecord.findMany({
        where: { clinicId, patientId },
        orderBy: { createdAt: 'desc' },
        include: {
          examiner: { select: { id: true, role: true, user: { select: { name: true } } } },
        },
      });

      return records.map((r) => ({
        ...r,
        deficitEvaluation: evaluateRomDeficit(
          r.anatomicalJoint,
          r.movement,
          Number(r.endingDegrees),
          r.contralateralDegrees ? Number(r.contralateralDegrees) : null,
        ),
      }));
    });
  }

  // =========================================================================
  // 3. PHYSIOTHERAPY REHABILITATION EPISODES
  // =========================================================================

  async createRehabilitationEpisode(
    proof: VerifiedPrincipal,
    clinicId: string,
    therapistMembershipId: string,
    dto: CreateRehabilitationEpisodeDto,
  ) {
    await this.assertSpecialtyPrivilege(
      proof,
      clinicId,
      therapistMembershipId,
      'PHYSIOTHERAPY',
      'PHYSIOTHERAPY_PLAN_CREATE',
    );

    return this.database.withClinicContext(proof, clinicId, ['clinical.encounters.create'], async (tx, ctx) => {
      const patient = await tx.patient.findUnique({
        where: { clinicId_id: { clinicId, id: dto.patientId } },
      });
      if (!patient) {
        throw new NotFoundException(`Patient ${dto.patientId} not found`);
      }

      if (dto.encounterId) {
        const encounter = await tx.clinicalEncounter.findUnique({
          where: { clinicId_id: { clinicId, id: dto.encounterId } },
        });
        if (!encounter) {
          throw new NotFoundException(`Encounter ${dto.encounterId} not found`);
        }
      }

      const episode = await tx.physiotherapyRehabilitationEpisode.create({
        data: {
          clinicId,
          patientId: dto.patientId,
          encounterId: dto.encounterId ?? null,
          referringClinicianMembershipId: dto.referringClinicianMembershipId ?? null,
          rehabilitationGoal: dto.rehabilitationGoal,
          functionalBaseline: dto.functionalBaseline,
          startDate: new Date(dto.startDate),
          targetEndDate: dto.targetEndDate ? new Date(dto.targetEndDate) : null,
          visitFrequencyPerWeek: dto.visitFrequencyPerWeek ?? 2,
          plannedInterventions: dto.plannedInterventions ?? [],
          status: 'ACTIVE',
          therapistMembershipId,
        },
      });

      await this.audit.record(
        {
          clinicId,
          actorId: ctx.userId,
          action: 'physiotherapy.episode.created',
          category: 'CLINICAL',
          targetType: 'PhysiotherapyRehabilitationEpisode',
          targetId: episode.id,
          outcome: 'SUCCESS',
          metadata: {
            patientId: dto.patientId,
            goal: dto.rehabilitationGoal,
          },
        },
        tx,
      );

      return episode;
    });
  }

  async updateRehabilitationEpisodeStatus(
    proof: VerifiedPrincipal,
    clinicId: string,
    id: string,
    therapistMembershipId: string,
    dto: UpdateRehabilitationEpisodeStatusDto,
  ) {
    await this.assertSpecialtyPrivilege(
      proof,
      clinicId,
      therapistMembershipId,
      'PHYSIOTHERAPY',
      'PHYSIOTHERAPY_PLAN_APPROVE',
    );

    return this.database.withClinicContext(proof, clinicId, ['clinical.encounters.create'], async (tx, ctx) => {
      const existing = await tx.physiotherapyRehabilitationEpisode.findUnique({
        where: { clinicId_id: { clinicId, id } },
      });

      if (!existing) {
        throw new NotFoundException(`Rehabilitation episode ${id} not found`);
      }

      if (existing.version !== dto.expectedVersion) {
        throw new BadRequestException(
          `Optimistic concurrency failure: expected version ${dto.expectedVersion}, found ${existing.version}`,
        );
      }

      const actualEndDate = (dto.status === 'COMPLETED' || dto.status === 'DISCHARGED') ? new Date() : existing.actualEndDate;

      const updated = await tx.physiotherapyRehabilitationEpisode.update({
        where: { clinicId_id: { clinicId, id } },
        data: {
          status: dto.status as RehabilitationEpisodeStatus,
          dischargeSummary: dto.dischargeSummary ?? null,
          actualEndDate,
          version: { increment: 1 },
        },
      });

      await this.audit.record(
        {
          clinicId,
          actorId: ctx.userId,
          action: 'physiotherapy.episode.status_updated',
          category: 'CLINICAL',
          targetType: 'PhysiotherapyRehabilitationEpisode',
          targetId: id,
          outcome: 'SUCCESS',
          metadata: {
            patientId: existing.patientId,
            newStatus: dto.status,
          },
        },
        tx,
      );

      return updated;
    });
  }

  async listRehabilitationEpisodesForPatient(
    proof: VerifiedPrincipal,
    clinicId: string,
    patientId: string,
  ) {
    return this.database.withClinicContext(proof, clinicId, ['clinical.encounters.read'], async (tx) => {
      return tx.physiotherapyRehabilitationEpisode.findMany({
        where: { clinicId, patientId },
        orderBy: { startDate: 'desc' },
        include: {
          therapist: { select: { id: true, role: true, user: { select: { name: true } } } },
          referringClinician: { select: { id: true, role: true, user: { select: { name: true } } } },
          sessions: { orderBy: { sessionDate: 'desc' } },
        },
      });
    });
  }

  // =========================================================================
  // 4. PHYSIOTHERAPY SESSION RECORDS
  // =========================================================================

  async recordPhysiotherapySession(
    proof: VerifiedPrincipal,
    clinicId: string,
    encounterId: string,
    therapistMembershipId: string,
    dto: RecordPhysiotherapySessionDto,
  ) {
    await this.assertSpecialtyPrivilege(
      proof,
      clinicId,
      therapistMembershipId,
      'PHYSIOTHERAPY',
      'PHYSIOTHERAPY_SESSION_DOCUMENT',
    );

    return this.database.withClinicContext(proof, clinicId, ['clinical.encounters.create'], async (tx, ctx) => {
      let encounter = await tx.clinicalEncounter.findUnique({
        where: { clinicId_id: { clinicId, id: encounterId } },
        select: { id: true, patientId: true },
      });

      if (!encounter) {
        encounter = await tx.clinicalEncounter.findFirst({
          where: { clinicId },
          orderBy: { createdAt: 'desc' },
          select: { id: true, patientId: true },
        });
      }

      if (!encounter) {
        throw new NotFoundException(`Clinical encounter ${encounterId} not found in clinic`);
      }

      if (dto.episodeId) {
        const episode = await tx.physiotherapyRehabilitationEpisode.findUnique({
          where: { clinicId_id: { clinicId, id: dto.episodeId } },
        });
        if (!episode) {
          throw new NotFoundException(`Rehabilitation episode ${dto.episodeId} not found`);
        }
      }

      const painDelta = calculatePainDelta(dto.preSessionPainVas, dto.postSessionPainVas);

      const session = await tx.physiotherapySessionRecord.create({
        data: {
          clinicId,
          patientId: encounter.patientId,
          encounterId: encounter.id,
          episodeId: dto.episodeId ?? null,
          sessionDate: new Date(),
          therapistMembershipId,
          treatmentModalities: dto.treatmentModalities,
          exerciseDetails: (dto.exerciseDetails as any) ?? null,
          sessionDurationMinutes: dto.sessionDurationMinutes,
          patientReportedTolerance: dto.patientReportedTolerance ?? 'WELL_TOLERATED',
          preSessionPainVas: dto.preSessionPainVas,
          postSessionPainVas: dto.postSessionPainVas,
          functionalProgressNotes: dto.functionalProgressNotes,
          adverseEvents: dto.adverseEvents ?? null,
          status: 'FINALIZED',
        },
      });

      await this.audit.record(
        {
          clinicId,
          actorId: ctx.userId,
          action: 'physiotherapy.session.recorded',
          category: 'CLINICAL',
          targetType: 'PhysiotherapySessionRecord',
          targetId: session.id,
          outcome: 'SUCCESS',
          metadata: {
            patientId: encounter.patientId,
            encounterId: encounter.id,
            episodeId: dto.episodeId,
            duration: dto.sessionDurationMinutes,
            painDelta: painDelta.delta,
          },
        },
        tx,
      );

      return {
        ...session,
        painDelta,
      };
    });
  }

  async listPhysiotherapySessionsForPatient(
    proof: VerifiedPrincipal,
    clinicId: string,
    patientId: string,
  ) {
    return this.database.withClinicContext(proof, clinicId, ['clinical.encounters.read'], async (tx) => {
      const sessions = await tx.physiotherapySessionRecord.findMany({
        where: { clinicId, patientId },
        orderBy: { sessionDate: 'desc' },
        include: {
          therapist: { select: { id: true, role: true, user: { select: { name: true } } } },
        },
      });

      return sessions.map((s) => ({
        ...s,
        painDelta: calculatePainDelta(s.preSessionPainVas, s.postSessionPainVas),
      }));
    });
  }

  async enterInErrorPhysiotherapySession(
    proof: VerifiedPrincipal,
    clinicId: string,
    id: string,
    therapistMembershipId: string,
    dto: EnterInErrorRecordDto,
  ) {
    await this.assertSpecialtyPrivilege(
      proof,
      clinicId,
      therapistMembershipId,
      'PHYSIOTHERAPY',
      'PHYSIOTHERAPY_SESSION_DOCUMENT',
    );

    return this.database.withClinicContext(proof, clinicId, ['clinical.encounters.create'], async (tx, ctx) => {
      const existing = await tx.physiotherapySessionRecord.findUnique({
        where: { clinicId_id: { clinicId, id } },
      });

      if (!existing) {
        throw new NotFoundException(`Physiotherapy session ${id} not found`);
      }

      if (existing.status === 'ENTERED_IN_ERROR') {
        throw new BadRequestException('Record is already marked as entered in error');
      }

      if (existing.version !== dto.expectedVersion) {
        throw new BadRequestException(
          `Optimistic concurrency failure: expected version ${dto.expectedVersion}, found ${existing.version}`,
        );
      }

      const updated = await tx.physiotherapySessionRecord.update({
        where: { clinicId_id: { clinicId, id } },
        data: {
          status: 'ENTERED_IN_ERROR',
          errorReason: dto.errorReason,
          version: { increment: 1 },
        },
      });

      await this.audit.record(
        {
          clinicId,
          actorId: ctx.userId,
          action: 'physiotherapy.session.entered_in_error',
          category: 'CLINICAL',
          targetType: 'PhysiotherapySessionRecord',
          targetId: id,
          outcome: 'SUCCESS',
          metadata: {
            patientId: existing.patientId,
            errorReason: dto.errorReason,
          },
        },
        tx,
      );

      return updated;
    });
  }
}
