import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { VerifiedPrincipal } from './verified-sessions.js';
import { TenantDatabaseService } from './tenant-database.service.js';
import { AuditRepository } from './audit.repository.js';
import { SpecialtyRepository } from './specialty.repository.js';
import type {
  ClinicalPrivilegeCode,
  PregnancyEpisodeStatus,
  DatingMethod,
} from '../generated/prisma/client.js';
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
} from '../obgyn/obgyn.dto.js';
import {
  calculateEddByLmp,
  calculateGestationalAgeFromCrl,
  calculateEddByUltrasound,
  calculateGestationalAgeAtDate,
  evaluatePreEclampsiaScreen,
  toUtcDateOnly,
} from '../obgyn/obgyn-dating.js';

@Injectable()
export class ObGynRepository {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly audit: AuditRepository,
    private readonly specialtyRepo: SpecialtyRepository,
  ) {}

  private async assertObGynPrivilege(
    proof: VerifiedPrincipal,
    clinicId: string,
    membershipId: string,
    privilegeCode: ClinicalPrivilegeCode,
  ) {
    const result = await this.specialtyRepo.evaluatePrivilege(proof, clinicId, {
      practitionerMembershipId: membershipId,
      specialtyCode: 'OB_GYN',
      privilegeCode,
    });

    if (!result.allowed) {
      throw new ForbiddenException(
        result.reason ?? 'Insufficient clinical privileges or OB_GYN specialty not enabled for clinic',
      );
    }
  }

  private async canAccessConfidentialExam(
    proof: VerifiedPrincipal,
    clinicId: string,
    membershipId: string,
  ): Promise<boolean> {
    const reviewCheck = await this.specialtyRepo.evaluatePrivilege(proof, clinicId, {
      practitionerMembershipId: membershipId,
      specialtyCode: 'OB_GYN',
      privilegeCode: 'GYNECOLOGICAL_RECORD_REVIEW',
    });
    if (reviewCheck.allowed) return true;

    const examCheck = await this.specialtyRepo.evaluatePrivilege(proof, clinicId, {
      practitionerMembershipId: membershipId,
      specialtyCode: 'OB_GYN',
      privilegeCode: 'GYNECOLOGICAL_EXAM_PERFORM',
    });
    return examCheck.allowed;
  }

  // =========================================================================
  // 1. PREGNANCY EPISODE MANAGEMENT
  // =========================================================================

  async createPregnancyEpisode(
    proof: VerifiedPrincipal,
    clinicId: string,
    membershipId: string,
    dto: CreatePregnancyEpisodeDto,
  ) {
    return this.database.withClinicContext(proof, clinicId, ['clinical.encounters.create'], async (tx, ctx) => {
      // 1. Validate patient exists and verify biological sex appropriateness
      const patient = await tx.patient.findUnique({
        where: { clinicId_id: { clinicId, id: dto.patientId } },
      });
      if (!patient) {
        throw new NotFoundException(`Patient ${dto.patientId} not found in this clinic`);
      }
      if (patient.gender === 'MALE') {
        throw new BadRequestException('Obstetric pregnancy episodes cannot be registered for male patients');
      }

      // 2. Check if an active pregnancy episode already exists
      const existingActive = await tx.pregnancyEpisode.findFirst({
        where: {
          clinicId,
          patientId: dto.patientId,
          status: 'ACTIVE',
        },
      });
      if (existingActive) {
        throw new ConflictException(
          `Patient already has an active pregnancy episode (#${existingActive.episodeNumber}). Finalize or transfer care before opening a new episode.`,
        );
      }

      // Count prior episodes for sequence number
      const episodeCount = await tx.pregnancyEpisode.count({
        where: { clinicId, patientId: dto.patientId },
      });

      // 3. Reconcile Estimated Due Date
      let estimatedDueDate: Date;
      let datingMethod: DatingMethod = (dto.datingMethod as DatingMethod) || 'LMP_CERTAIN';
      let datingRationale = dto.datingRationale ?? null;

      if (dto.estimatedDueDate) {
        estimatedDueDate = toUtcDateOnly(dto.estimatedDueDate);
      } else if (dto.lastMenstrualPeriodDate) {
        estimatedDueDate = calculateEddByLmp(dto.lastMenstrualPeriodDate);
        datingMethod = dto.lmpCertainty === false ? 'LMP_UNCERTAIN' : 'LMP_CERTAIN';
      } else if (dto.crownRumpLengthMm && dto.ultrasoundDatingDate) {
        const ga = calculateGestationalAgeFromCrl(dto.crownRumpLengthMm);
        estimatedDueDate = calculateEddByUltrasound(dto.ultrasoundDatingDate, ga.totalDays);
        datingMethod = 'ULTRASOUND_FIRST_TRIMESTER';
      } else {
        throw new BadRequestException('Either estimatedDueDate, lastMenstrualPeriodDate, or ultrasound CRL dating must be provided');
      }

      const episode = await tx.pregnancyEpisode.create({
        data: {
          clinicId,
          patientId: dto.patientId,
          episodeNumber: episodeCount + 1,
          status: 'ACTIVE',
          gravidity: dto.gravidity,
          parity: dto.parity,
          termDeliveries: dto.termDeliveries ?? 0,
          pretermDeliveries: dto.pretermDeliveries ?? 0,
          abortions: dto.abortions ?? 0,
          livingChildren: dto.livingChildren ?? 0,
          multipleGestationCount: dto.multipleGestationCount ?? 1,
          lastMenstrualPeriodDate: dto.lastMenstrualPeriodDate ? toUtcDateOnly(dto.lastMenstrualPeriodDate) : null,
          lmpCertainty: dto.lmpCertainty ?? true,
          ultrasoundDatingDate: dto.ultrasoundDatingDate ? toUtcDateOnly(dto.ultrasoundDatingDate) : null,
          crownRumpLengthMm: dto.crownRumpLengthMm != null ? dto.crownRumpLengthMm : null,
          biparietalDiameterMm: dto.biparietalDiameterMm != null ? dto.biparietalDiameterMm : null,
          ultrasoundEstimatedGestationalDays: dto.ultrasoundEstimatedGestationalDays ?? null,
          estimatedDueDate,
          datingMethod,
          datingRationale,
          bloodGroupRh: dto.bloodGroupRh ?? null,
          rhAntibodyScreenPositive: dto.rhAntibodyScreenPositive ?? false,
          highRiskFlag: dto.highRiskFlag ?? false,
          highRiskJustification: dto.highRiskJustification ?? null,
        },
      });

      await this.audit.record(
        {
          clinicId,
          actorId: ctx.userId,
          category: 'CLINICAL',
          action: 'obgyn.pregnancy_episode.create',
          targetType: 'PregnancyEpisode',
          targetId: episode.id,
          metadata: { patientId: dto.patientId, episodeNumber: episode.episodeNumber, estimatedDueDate: estimatedDueDate.toISOString(), createdByMembershipId: membershipId },
        },
        tx,
      );

      return episode;
    });
  }

  async getActivePregnancyEpisode(proof: VerifiedPrincipal, clinicId: string, patientId: string) {
    return this.database.withClinicContext(proof, clinicId, ['clinical.encounters.read'], async (tx) => {
      const episode = await tx.pregnancyEpisode.findFirst({
        where: { clinicId, patientId, status: 'ACTIVE' },
        include: {
          datingReviewedBy: {
            select: { id: true, user: { select: { id: true, name: true, email: true } } },
          },
          antenatalVisits: {
            orderBy: { visitDate: 'desc' },
            take: 5,
          },
        },
      });

      if (!episode) return null;

      const ga = calculateGestationalAgeAtDate(episode.estimatedDueDate, new Date());
      return {
        ...episode,
        currentGestationalAge: ga,
      };
    });
  }

  async listPregnancyEpisodes(proof: VerifiedPrincipal, clinicId: string, patientId: string) {
    return this.database.withClinicContext(proof, clinicId, ['clinical.encounters.read'], async (tx) => {
      return tx.pregnancyEpisode.findMany({
        where: { clinicId, patientId },
        orderBy: { episodeNumber: 'desc' },
        include: {
          datingReviewedBy: {
            select: { id: true, user: { select: { id: true, name: true } } },
          },
          finalizedBy: {
            select: { id: true, user: { select: { id: true, name: true } } },
          },
          _count: { select: { antenatalVisits: true } },
        },
      });
    });
  }

  async getPregnancyEpisode(proof: VerifiedPrincipal, clinicId: string, episodeId: string) {
    return this.database.withClinicContext(proof, clinicId, ['clinical.encounters.read'], async (tx) => {
      const episode = await tx.pregnancyEpisode.findUnique({
        where: { clinicId_id: { clinicId, id: episodeId } },
        include: {
          datingReviewedBy: {
            select: { id: true, user: { select: { id: true, name: true, email: true } } },
          },
          finalizedBy: {
            select: { id: true, user: { select: { id: true, name: true, email: true } } },
          },
          antenatalVisits: {
            orderBy: { visitDate: 'asc' },
          },
        },
      });

      if (!episode) {
        throw new NotFoundException(`Pregnancy episode ${episodeId} not found`);
      }

      const ga = calculateGestationalAgeAtDate(episode.estimatedDueDate, new Date());
      return {
        ...episode,
        currentGestationalAge: ga,
      };
    });
  }

  async updatePregnancyEpisode(
    proof: VerifiedPrincipal,
    clinicId: string,
    episodeId: string,
    dto: UpdatePregnancyEpisodeDto,
  ) {
    return this.database.withClinicContext(proof, clinicId, ['clinical.encounters.update'], async (tx, ctx) => {
      const episode = await tx.pregnancyEpisode.findUnique({
        where: { clinicId_id: { clinicId, id: episodeId } },
      });
      if (!episode) throw new NotFoundException(`Pregnancy episode ${episodeId} not found`);

      const updated = await tx.pregnancyEpisode.update({
        where: { clinicId_id: { clinicId, id: episodeId } },
        data: {
          gravidity: dto.gravidity !== undefined ? dto.gravidity : episode.gravidity,
          parity: dto.parity !== undefined ? dto.parity : episode.parity,
          termDeliveries: dto.termDeliveries !== undefined ? dto.termDeliveries : episode.termDeliveries,
          pretermDeliveries: dto.pretermDeliveries !== undefined ? dto.pretermDeliveries : episode.pretermDeliveries,
          abortions: dto.abortions !== undefined ? dto.abortions : episode.abortions,
          livingChildren: dto.livingChildren !== undefined ? dto.livingChildren : episode.livingChildren,
          bloodGroupRh: dto.bloodGroupRh !== undefined ? dto.bloodGroupRh : episode.bloodGroupRh,
          rhAntibodyScreenPositive: dto.rhAntibodyScreenPositive !== undefined ? dto.rhAntibodyScreenPositive : episode.rhAntibodyScreenPositive,
          highRiskFlag: dto.highRiskFlag !== undefined ? dto.highRiskFlag : episode.highRiskFlag,
          highRiskJustification: dto.highRiskJustification !== undefined ? dto.highRiskJustification : episode.highRiskJustification,
          status: dto.status ?? episode.status,
          version: { increment: 1 },
        },
      });

      await this.audit.record(
        {
          clinicId,
          actorId: ctx.userId,
          category: 'CLINICAL',
          action: 'obgyn.pregnancy_episode.update',
          targetType: 'PregnancyEpisode',
          targetId: episodeId,
          metadata: { patientId: episode.patientId },
        },
        tx,
      );

      return updated;
    });
  }

  async reviewPregnancyDating(
    proof: VerifiedPrincipal,
    clinicId: string,
    membershipId: string,
    episodeId: string,
    dto: ReviewPregnancyDatingDto,
  ) {
    await this.assertObGynPrivilege(proof, clinicId, membershipId, 'OBSTETRIC_DATING_REVIEW');

    return this.database.withClinicContext(proof, clinicId, ['clinical.encounters.update'], async (tx, ctx) => {
      const episode = await tx.pregnancyEpisode.findUnique({
        where: { clinicId_id: { clinicId, id: episodeId } },
      });
      if (!episode) throw new NotFoundException(`Pregnancy episode ${episodeId} not found`);
      if (episode.status !== 'ACTIVE') {
        throw new ConflictException('Dating review can only be performed on active pregnancy episodes');
      }

      const updated = await tx.pregnancyEpisode.update({
        where: { clinicId_id: { clinicId, id: episodeId } },
        data: {
          estimatedDueDate: toUtcDateOnly(dto.confirmedEstimatedDueDate),
          datingMethod: dto.datingMethod,
          datingRationale: dto.datingRationale,
          crownRumpLengthMm: dto.crownRumpLengthMm != null ? dto.crownRumpLengthMm : episode.crownRumpLengthMm,
          ultrasoundDatingDate: dto.ultrasoundDatingDate ? toUtcDateOnly(dto.ultrasoundDatingDate) : episode.ultrasoundDatingDate,
          datingReviewedByMembershipId: membershipId,
          datingReviewedAt: new Date(),
          isDatingFinalized: true,
          version: { increment: 1 },
        },
      });

      await this.audit.record(
        {
          clinicId,
          actorId: ctx.userId,
          category: 'CLINICAL',
          action: 'obgyn.pregnancy_episode.dating_review',
          targetType: 'PregnancyEpisode',
          targetId: episodeId,
          metadata: {
            confirmedDueDate: dto.confirmedEstimatedDueDate,
            datingMethod: dto.datingMethod,
            reviewerMembershipId: membershipId,
          },
        },
        tx,
      );

      return updated;
    });
  }

  async finalizePregnancyEpisode(
    proof: VerifiedPrincipal,
    clinicId: string,
    membershipId: string,
    episodeId: string,
    dto: FinalizePregnancyEpisodeDto,
  ) {
    await this.assertObGynPrivilege(proof, clinicId, membershipId, 'OBSTETRIC_EPISODE_FINALIZE');

    return this.database.withClinicContext(proof, clinicId, ['clinical.encounters.update'], async (tx, ctx) => {
      const episode = await tx.pregnancyEpisode.findUnique({
        where: { clinicId_id: { clinicId, id: episodeId } },
      });
      if (!episode) throw new NotFoundException(`Pregnancy episode ${episodeId} not found`);
      if (episode.status !== 'ACTIVE') {
        throw new ConflictException(`Pregnancy episode is already ${episode.status}`);
      }

      const status: PregnancyEpisodeStatus = (dto.status as PregnancyEpisodeStatus) || 'COMPLETED';

      const updated = await tx.pregnancyEpisode.update({
        where: { clinicId_id: { clinicId, id: episodeId } },
        data: {
          status,
          outcomeDate: toUtcDateOnly(dto.outcomeDate),
          outcomeSummary: dto.outcomeSummary,
          finalizedByMembershipId: membershipId,
          finalizedAt: new Date(),
          version: { increment: 1 },
        },
      });

      await this.audit.record(
        {
          clinicId,
          actorId: ctx.userId,
          category: 'CLINICAL',
          action: 'obgyn.pregnancy_episode.finalize',
          targetType: 'PregnancyEpisode',
          targetId: episodeId,
          metadata: { status, outcomeDate: dto.outcomeDate, finalizedByMembershipId: membershipId },
        },
        tx,
      );

      return updated;
    });
  }

  // =========================================================================
  // 2. ANTENATAL VISIT RECORDS
  // =========================================================================

  async recordAntenatalVisit(
    proof: VerifiedPrincipal,
    clinicId: string,
    membershipId: string,
    dto: RecordAntenatalVisitDto,
  ) {
    await this.assertObGynPrivilege(proof, clinicId, membershipId, 'ANTENATAL_CARE_DOCUMENT');

    return this.database.withClinicContext(proof, clinicId, ['clinical.encounters.create'], async (tx, ctx) => {
      // 1. Verify pregnancy episode is active
      const episode = await tx.pregnancyEpisode.findUnique({
        where: { clinicId_id: { clinicId, id: dto.pregnancyEpisodeId } },
      });
      if (!episode) {
        throw new NotFoundException(`Pregnancy episode ${dto.pregnancyEpisodeId} not found`);
      }
      if (episode.patientId !== dto.patientId) {
        throw new ConflictException('Pregnancy episode does not belong to specified patient');
      }
      if (episode.status !== 'ACTIVE') {
        throw new ConflictException(`Cannot record antenatal visits for a ${episode.status} pregnancy episode`);
      }

      // 2. Verify encounter exists or locate/create encounter
      let encounter = dto.encounterId
        ? await tx.clinicalEncounter.findUnique({
            where: { clinicId_id: { clinicId, id: dto.encounterId } },
          })
        : null;
      if (!encounter) {
        encounter = await tx.clinicalEncounter.findFirst({
          where: { clinicId, patientId: dto.patientId },
          orderBy: { createdAt: 'desc' },
        });
      }
      if (!encounter) {
        encounter = await tx.clinicalEncounter.create({
          data: {
            clinicId,
            patientId: dto.patientId,
            clinicianMembershipId: membershipId,
            status: 'DRAFT',
          },
        });
      }

      // 3. Clinical screening for maternal pre-eclampsia
      const peScreen = evaluatePreEclampsiaScreen(dto.systolicBp, dto.diastolicBp, dto.urineProtein);

      const visit = await tx.antenatalVisitRecord.create({
        data: {
          clinicId,
          patientId: dto.patientId,
          pregnancyEpisodeId: dto.pregnancyEpisodeId,
          encounterId: encounter.id,
          recordedByMembershipId: membershipId,
          visitDate: dto.visitDate ? new Date(dto.visitDate) : new Date(),
          gestationalAgeWeeks: dto.gestationalAgeWeeks,
          gestationalAgeDays: dto.gestationalAgeDays ?? 0,
          systolicBp: dto.systolicBp,
          diastolicBp: dto.diastolicBp,
          weightKg: dto.weightKg != null ? dto.weightKg : null,
          fundalHeightCm: dto.fundalHeightCm != null ? dto.fundalHeightCm : null,
          fetalHeartRateBpm: dto.fetalHeartRateBpm ?? null,
          fetalPresentation: dto.fetalPresentation ?? null,
          fetalMovementPresent: dto.fetalMovementPresent ?? true,
          urineProtein: dto.urineProtein ?? 'NEGATIVE',
          urineGlucose: dto.urineGlucose ?? 'NEGATIVE',
          peripheralEdema: dto.peripheralEdema ?? 'NONE',
          clinicalNotes: dto.clinicalNotes ?? null,
          managementPlan: dto.managementPlan ?? null,
          nextVisitRecommendedWeeks: dto.nextVisitRecommendedWeeks ?? 4,
          diagnosticOrderIds: dto.diagnosticOrderIds ?? [],
          imagingDocumentIds: dto.imagingDocumentIds ?? [],
          status: 'FINALIZED',
        },
      });

      await this.audit.record(
        {
          clinicId,
          actorId: ctx.userId,
          category: 'CLINICAL',
          action: 'obgyn.antenatal_visit.record',
          targetType: 'AntenatalVisitRecord',
          targetId: visit.id,
          metadata: {
            episodeId: dto.pregnancyEpisodeId,
            gestationalAgeWeeks: dto.gestationalAgeWeeks,
            preEclampsiaAlert: peScreen.isAlert,
            preEclampsiaSeverity: peScreen.severity,
          },
        },
        tx,
      );

      return {
        ...visit,
        preEclampsiaScreen: peScreen,
      };
    });
  }

  async listAntenatalVisits(proof: VerifiedPrincipal, clinicId: string, pregnancyEpisodeId: string) {
    return this.database.withClinicContext(proof, clinicId, ['clinical.encounters.read'], async (tx) => {
      const visits = await tx.antenatalVisitRecord.findMany({
        where: { clinicId, pregnancyEpisodeId },
        orderBy: { visitDate: 'asc' },
        include: {
          recordedBy: {
            select: { id: true, user: { select: { id: true, name: true } } },
          },
        },
      });

      return visits.map((v) => ({
        ...v,
        preEclampsiaScreen: evaluatePreEclampsiaScreen(v.systolicBp, v.diastolicBp, v.urineProtein),
      }));
    });
  }

  async enterInErrorAntenatalVisit(
    proof: VerifiedPrincipal,
    clinicId: string,
    membershipId: string,
    visitId: string,
    dto: EnterInErrorAntenatalVisitDto,
  ) {
    await this.assertObGynPrivilege(proof, clinicId, membershipId, 'ANTENATAL_CARE_DOCUMENT');

    return this.database.withClinicContext(proof, clinicId, ['clinical.encounters.update'], async (tx, ctx) => {
      const visit = await tx.antenatalVisitRecord.findUnique({
        where: { clinicId_id: { clinicId, id: visitId } },
      });
      if (!visit) throw new NotFoundException(`Antenatal visit record ${visitId} not found`);
      if (visit.status === 'ENTERED_IN_ERROR') {
        throw new ConflictException('Antenatal visit record is already marked as entered-in-error');
      }

      const updated = await tx.antenatalVisitRecord.update({
        where: { clinicId_id: { clinicId, id: visitId } },
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
          category: 'CLINICAL',
          action: 'obgyn.antenatal_visit.enter_in_error',
          targetType: 'AntenatalVisitRecord',
          targetId: visitId,
          metadata: { reason: dto.errorReason, membershipId },
        },
        tx,
      );

      return updated;
    });
  }

  // =========================================================================
  // 3. OBSTETRIC HISTORY RECORDS
  // =========================================================================

  async createObstetricHistory(
    proof: VerifiedPrincipal,
    clinicId: string,
    membershipId: string,
    dto: CreateObstetricHistoryDto,
  ) {
    return this.database.withClinicContext(proof, clinicId, ['clinical.encounters.create'], async (tx, ctx) => {
      const patient = await tx.patient.findUnique({
        where: { clinicId_id: { clinicId, id: dto.patientId } },
      });
      if (!patient) throw new NotFoundException(`Patient ${dto.patientId} not found`);

      const record = await tx.obstetricHistoryRecord.create({
        data: {
          clinicId,
          patientId: dto.patientId,
          recordedByMembershipId: membershipId,
          pregnancyNumber: dto.pregnancyNumber,
          yearOfDelivery: dto.yearOfDelivery ?? null,
          gestationalAgeWeeks: dto.gestationalAgeWeeks ?? null,
          deliveryOutcome: dto.deliveryOutcome ?? 'LIVE_BIRTH_SPONTANEOUS_VAGINAL',
          deliveryMode: dto.deliveryMode ?? 'VAGINAL',
          birthWeightGrams: dto.birthWeightGrams ?? null,
          babyGender: dto.babyGender ?? null,
          anesthesiaType: dto.anesthesiaType ?? null,
          previousUterineSurgery: dto.previousUterineSurgery ?? false,
          uterineSurgeryDetails: dto.uterineSurgeryDetails ?? null,
          complications: dto.complications ?? null,
          neonatalOutcome: dto.neonatalOutcome ?? null,
          notes: dto.notes ?? null,
        },
      });

      await this.audit.record(
        {
          clinicId,
          actorId: ctx.userId,
          category: 'CLINICAL',
          action: 'obgyn.obstetric_history.create',
          targetType: 'ObstetricHistoryRecord',
          targetId: record.id,
          metadata: { patientId: dto.patientId, pregnancyNumber: dto.pregnancyNumber },
        },
        tx,
      );

      return record;
    });
  }

  async listObstetricHistory(proof: VerifiedPrincipal, clinicId: string, patientId: string) {
    return this.database.withClinicContext(proof, clinicId, ['clinical.encounters.read'], async (tx) => {
      return tx.obstetricHistoryRecord.findMany({
        where: { clinicId, patientId },
        orderBy: { pregnancyNumber: 'asc' },
        include: {
          recordedBy: {
            select: { id: true, user: { select: { id: true, name: true } } },
          },
        },
      });
    });
  }

  async updateObstetricHistory(
    proof: VerifiedPrincipal,
    clinicId: string,
    historyId: string,
    dto: UpdateObstetricHistoryDto,
  ) {
    return this.database.withClinicContext(proof, clinicId, ['clinical.encounters.update'], async (tx, ctx) => {
      const record = await tx.obstetricHistoryRecord.findUnique({
        where: { clinicId_id: { clinicId, id: historyId } },
      });
      if (!record) throw new NotFoundException(`Obstetric history record ${historyId} not found`);

      const updated = await tx.obstetricHistoryRecord.update({
        where: { clinicId_id: { clinicId, id: historyId } },
        data: {
          yearOfDelivery: dto.yearOfDelivery !== undefined ? dto.yearOfDelivery : record.yearOfDelivery,
          gestationalAgeWeeks: dto.gestationalAgeWeeks !== undefined ? dto.gestationalAgeWeeks : record.gestationalAgeWeeks,
          deliveryOutcome: dto.deliveryOutcome ?? record.deliveryOutcome,
          deliveryMode: dto.deliveryMode ?? record.deliveryMode,
          birthWeightGrams: dto.birthWeightGrams !== undefined ? dto.birthWeightGrams : record.birthWeightGrams,
          babyGender: dto.babyGender !== undefined ? dto.babyGender : record.babyGender,
          anesthesiaType: dto.anesthesiaType !== undefined ? dto.anesthesiaType : record.anesthesiaType,
          previousUterineSurgery: dto.previousUterineSurgery !== undefined ? dto.previousUterineSurgery : record.previousUterineSurgery,
          uterineSurgeryDetails: dto.uterineSurgeryDetails !== undefined ? dto.uterineSurgeryDetails : record.uterineSurgeryDetails,
          complications: dto.complications !== undefined ? dto.complications : record.complications,
          neonatalOutcome: dto.neonatalOutcome !== undefined ? dto.neonatalOutcome : record.neonatalOutcome,
          notes: dto.notes !== undefined ? dto.notes : record.notes,
          version: { increment: 1 },
        },
      });

      await this.audit.record(
        {
          clinicId,
          actorId: ctx.userId,
          category: 'CLINICAL',
          action: 'obgyn.obstetric_history.update',
          targetType: 'ObstetricHistoryRecord',
          targetId: historyId,
          metadata: { patientId: record.patientId },
        },
        tx,
      );

      return updated;
    });
  }

  // =========================================================================
  // 4. CONFIDENTIAL GYNECOLOGICAL EXAMINATIONS
  // =========================================================================

  async recordGynecologicalExam(
    proof: VerifiedPrincipal,
    clinicId: string,
    membershipId: string,
    dto: RecordGynecologicalExamDto,
  ) {
    await this.assertObGynPrivilege(proof, clinicId, membershipId, 'GYNECOLOGICAL_EXAM_PERFORM');

    return this.database.withClinicContext(proof, clinicId, ['clinical.encounters.create'], async (tx, ctx) => {
      const patient = await tx.patient.findUnique({
        where: { clinicId_id: { clinicId, id: dto.patientId } },
      });
      if (!patient) throw new NotFoundException(`Patient ${dto.patientId} not found`);

      let encounter = dto.encounterId
        ? await tx.clinicalEncounter.findUnique({
            where: { clinicId_id: { clinicId, id: dto.encounterId } },
          })
        : null;
      if (!encounter) {
        encounter = await tx.clinicalEncounter.findFirst({
          where: { clinicId, patientId: dto.patientId },
          orderBy: { createdAt: 'desc' },
        });
      }
      if (!encounter) {
        encounter = await tx.clinicalEncounter.create({
          data: {
            clinicId,
            patientId: dto.patientId,
            clinicianMembershipId: membershipId,
            status: 'DRAFT',
          },
        });
      }

      const exam = await tx.gynecologicalExamination.create({
        data: {
          clinicId,
          patientId: dto.patientId,
          encounterId: encounter.id,
          examinerMembershipId: membershipId,
          examinationDate: dto.examinationDate ? new Date(dto.examinationDate) : new Date(),
          examinationType: dto.examinationType ?? 'GENERAL_PELVIC',
          isConfidential: dto.isConfidential ?? true,
          indicationsSymptoms: dto.indicationsSymptoms ?? null,
          lastMenstrualPeriodDate: dto.lastMenstrualPeriodDate ? toUtcDateOnly(dto.lastMenstrualPeriodDate) : null,
          menstrualCycleDays: dto.menstrualCycleDays ?? 28,
          menstrualFlowDurationDays: dto.menstrualFlowDurationDays ?? 5,
          dysmenorrheaReported: dto.dysmenorrheaReported ?? false,
          abnormalBleedingPattern: dto.abnormalBleedingPattern ?? null,
          externalGenitaliaFindings: dto.externalGenitaliaFindings ?? null,
          speculumExaminationFindings: dto.speculumExaminationFindings ?? null,
          bimanualExaminationFindings: dto.bimanualExaminationFindings ?? null,
          cervicalScreeningSampleCollected: dto.cervicalScreeningSampleCollected ?? false,
          cervicalScreeningTestType: dto.cervicalScreeningTestType ?? null,
          chaperonePresent: dto.chaperonePresent,
          chaperoneNameOrId: dto.chaperoneNameOrId ?? null,
          clinicalAssessment: dto.clinicalAssessment ?? null,
          managementPlan: dto.managementPlan ?? null,
          consentEvidenceId: dto.consentEvidenceId ?? null,
          linkedDocumentIds: dto.linkedDocumentIds ?? [],
          status: 'FINALIZED',
        },
      });

      await this.audit.record(
        {
          clinicId,
          actorId: ctx.userId,
          category: 'CLINICAL',
          action: 'obgyn.gynecological_exam.record',
          targetType: 'GynecologicalExamination',
          targetId: exam.id,
          metadata: {
            patientId: dto.patientId,
            encounterId: dto.encounterId,
            isConfidential: exam.isConfidential,
            chaperonePresent: exam.chaperonePresent,
          },
        },
        tx,
      );

      return exam;
    });
  }

  async listGynecologicalExams(
    proof: VerifiedPrincipal,
    clinicId: string,
    membershipId: string,
    patientId: string,
  ) {
    const hasPrivilegedAccess = await this.canAccessConfidentialExam(proof, clinicId, membershipId);

    return this.database.withClinicContext(proof, clinicId, ['clinical.encounters.read'], async (tx) => {
      const exams = await tx.gynecologicalExamination.findMany({
        where: { clinicId, patientId },
        orderBy: { examinationDate: 'desc' },
        include: {
          examiner: {
            select: { id: true, user: { select: { id: true, name: true } } },
          },
        },
      });

      // Server-side segregation: redact intimate clinical fields for non-privileged staff
      if (!hasPrivilegedAccess) {
        return exams.map((e) => {
          if (!e.isConfidential) return e;
          return {
            id: e.id,
            clinicId: e.clinicId,
            patientId: e.patientId,
            encounterId: e.encounterId,
            examinerMembershipId: e.examinerMembershipId,
            examiner: e.examiner,
            examinationDate: e.examinationDate,
            examinationType: e.examinationType,
            isConfidential: true,
            status: e.status,
            chaperonePresent: e.chaperonePresent,
            chaperoneNameOrId: e.chaperoneNameOrId,
            // Sensitive fields stripped completely
            indicationsSymptoms: '[محتوى محمي - فحص نسائي سري / CONFIDENTIAL INTIMATE RECORD]',
            externalGenitaliaFindings: null,
            speculumExaminationFindings: null,
            bimanualExaminationFindings: null,
            clinicalAssessment: null,
            managementPlan: null,
            abnormalBleedingPattern: null,
            version: e.version,
            createdAt: e.createdAt,
            updatedAt: e.updatedAt,
          };
        });
      }

      return exams;
    });
  }

  async getGynecologicalExam(
    proof: VerifiedPrincipal,
    clinicId: string,
    membershipId: string,
    examId: string,
  ) {
    const hasPrivilegedAccess = await this.canAccessConfidentialExam(proof, clinicId, membershipId);

    return this.database.withClinicContext(proof, clinicId, ['clinical.encounters.read'], async (tx) => {
      const exam = await tx.gynecologicalExamination.findUnique({
        where: { clinicId_id: { clinicId, id: examId } },
        include: {
          examiner: {
            select: { id: true, user: { select: { id: true, name: true, email: true } } },
          },
        },
      });

      if (!exam) {
        throw new NotFoundException(`Gynecological examination ${examId} not found`);
      }

      if (exam.isConfidential && !hasPrivilegedAccess) {
        throw new ForbiddenException(
          'Access to confidential gynecological examination records is restricted to privileged clinicians',
        );
      }

      return exam;
    });
  }

  async enterInErrorGynecologicalExam(
    proof: VerifiedPrincipal,
    clinicId: string,
    membershipId: string,
    examId: string,
    dto: EnterInErrorGynecologicalExamDto,
  ) {
    await this.assertObGynPrivilege(proof, clinicId, membershipId, 'GYNECOLOGICAL_EXAM_PERFORM');

    return this.database.withClinicContext(proof, clinicId, ['clinical.encounters.update'], async (tx, ctx) => {
      const exam = await tx.gynecologicalExamination.findUnique({
        where: { clinicId_id: { clinicId, id: examId } },
      });
      if (!exam) throw new NotFoundException(`Gynecological examination ${examId} not found`);
      if (exam.status === 'ENTERED_IN_ERROR') {
        throw new ConflictException('Gynecological examination record is already marked as entered-in-error');
      }

      const updated = await tx.gynecologicalExamination.update({
        where: { clinicId_id: { clinicId, id: examId } },
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
          category: 'CLINICAL',
          action: 'obgyn.gynecological_exam.enter_in_error',
          targetType: 'GynecologicalExamination',
          targetId: examId,
          metadata: { reason: dto.errorReason, membershipId },
        },
        tx,
      );

      return updated;
    });
  }
}
