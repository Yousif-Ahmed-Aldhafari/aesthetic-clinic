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
import type { Prisma } from '../generated/prisma/client.js';
import type {
  ClinicalPrivilegeCode,
  DeliveryMode,
  BirthType,
  BirthHistorySource,
  CaregiverRelationshipType,
  StatureMeasurementMethod,
  MeasurementSource,
  PatientGender,
} from '../generated/prisma/client.js';
import {
  RecordPediatricBirthHistoryDto,
  AmendPediatricBirthHistoryDto,
  CreateCaregiverRelationshipDto,
  UpdateCaregiverRelationshipDto,
  RevokeCaregiverRelationshipDto,
  RecordPediatricGrowthDto,
  EnterInErrorGrowthRecordDto,
  PediatricMedicationPreflightDto,
} from '../pediatrics/pediatrics.dto.js';
import {
  evaluatePediatricGrowth,
  determineStatureMethod,
} from '../pediatrics/growth-analytics.js';
import {
  preflightPediatricMedicationSafety,
  type PatientAllergySnapshot,
} from '../pediatrics/medication-safety.js';

@Injectable()
export class PediatricsRepository {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly audit: AuditRepository,
    private readonly specialtyRepo: SpecialtyRepository,
  ) {}

  private async assertPediatricPrivilege(
    proof: VerifiedPrincipal,
    clinicId: string,
    membershipId: string,
    privilegeCode: ClinicalPrivilegeCode,
  ) {
    const result = await this.specialtyRepo.evaluatePrivilege(proof, clinicId, {
      practitionerMembershipId: membershipId,
      specialtyCode: 'PEDIATRICS',
      privilegeCode,
    });

    if (!result.allowed) {
      throw new ForbiddenException(
        result.reason ?? 'Insufficient clinical privileges or PEDIATRICS specialty not enabled for clinic',
      );
    }
  }

  // =========================================================================
  // 1. NEONATAL BIRTH HISTORY
  // =========================================================================

  async getBirthHistory(proof: VerifiedPrincipal, clinicId: string, patientId: string) {
    return this.database.withClinicContext(proof, clinicId, ['clinical.encounters.read'], async (tx) => {
      const history = await tx.pediatricBirthHistory.findUnique({
        where: { clinicId_patientId: { clinicId, patientId } },
        include: {
          verifiedBy: {
            select: { id: true, user: { select: { id: true, name: true, email: true } } },
          },
        },
      });

      return history;
    });
  }

  async recordBirthHistory(
    proof: VerifiedPrincipal,
    clinicId: string,
    membershipId: string,
    input: RecordPediatricBirthHistoryDto,
  ) {
    await this.assertPediatricPrivilege(proof, clinicId, membershipId, 'PEDIATRIC_CARE_DOCUMENT');

    return this.database.withClinicContext(proof, clinicId, ['clinical.encounters.create'], async (tx, ctx) => {
      const patient = await tx.patient.findUnique({
        where: { clinicId_id: { clinicId, id: input.patientId } },
      });
      if (!patient) {
        throw new NotFoundException('Patient record not found in clinic context');
      }

      const existing = await tx.pediatricBirthHistory.findUnique({
        where: { clinicId_patientId: { clinicId, patientId: input.patientId } },
      });
      if (existing) {
        throw new ConflictException(
          'A birth history is already recorded for this patient. Use attributable amendment to update.',
        );
      }

      const created = await tx.pediatricBirthHistory.create({
        data: {
          clinicId,
          patientId: input.patientId,
          gestationalAgeWeeks: input.gestationalAgeWeeks,
          gestationalAgeDays: input.gestationalAgeDays ?? 0,
          birthWeightGrams: input.birthWeightGrams,
          birthLengthCm: input.birthLengthCm,
          birthHeadCircumferenceCm: input.birthHeadCircumferenceCm,
          apgar1Min: input.apgar1Min,
          apgar5Min: input.apgar5Min,
          apgar10Min: input.apgar10Min,
          deliveryMode: (input.deliveryMode as DeliveryMode) ?? 'VAGINAL',
          birthType: (input.birthType as BirthType) ?? 'SINGLETON',
          birthComplications: input.birthComplications,
          maternalComplications: input.maternalComplications,
          consanguinity: input.consanguinity ?? false,
          neonatalResuscitationRequired: input.neonatalResuscitationRequired ?? false,
          nicAdmissionRequired: input.nicAdmissionRequired ?? false,
          nicStayDays: input.nicStayDays,
          newbornScreeningNotes: input.newbornScreeningNotes,
          source: (input.source as BirthHistorySource) ?? 'MATERNAL_REPORT',
          verifiedByMembershipId: membershipId,
          verifiedAt: new Date(),
          version: 1,
          amendmentHistory: [],
        },
        include: {
          verifiedBy: {
            select: { id: true, user: { select: { id: true, name: true, email: true } } },
          },
        },
      });

      await this.audit.record(
        {
          clinicId,
          actorId: ctx.userId,
          category: 'CLINICAL',
          action: 'pediatrics.birth_history.record',
          targetType: 'PediatricBirthHistory',
          targetId: created.id,
          outcome: 'SUCCESS',
          metadata: {
            patientId: input.patientId,
            gestationalAgeWeeks: input.gestationalAgeWeeks,
            source: input.source,
          },
        },
        tx,
      );

      return created;
    });
  }

  async amendBirthHistory(
    proof: VerifiedPrincipal,
    clinicId: string,
    membershipId: string,
    historyId: string,
    input: AmendPediatricBirthHistoryDto,
  ) {
    await this.assertPediatricPrivilege(proof, clinicId, membershipId, 'PEDIATRIC_BIRTH_HISTORY_VERIFY');

    return this.database.withClinicContext(proof, clinicId, ['clinical.encounters.update'], async (tx, ctx) => {
      const existing = await tx.pediatricBirthHistory.findUnique({
        where: { clinicId_id: { clinicId, id: historyId } },
      });
      if (!existing) {
        throw new NotFoundException('Pediatric birth history not found');
      }

      if (existing.version !== input.expectedVersion) {
        throw new ConflictException('Concurrent modification conflict on pediatric birth history');
      }

      // Preserve snapshot in immutable amendment audit log
      const previousSnapshots = (existing.amendmentHistory as Array<Record<string, unknown>>) ?? [];
      const currentSnapshot = {
        amendedAt: new Date().toISOString(),
        amendedByMembershipId: membershipId,
        amendedByUserId: ctx.userId,
        amendmentReason: input.amendmentReason,
        previousState: {
          version: existing.version,
          gestationalAgeWeeks: existing.gestationalAgeWeeks,
          gestationalAgeDays: existing.gestationalAgeDays,
          birthWeightGrams: existing.birthWeightGrams,
          birthLengthCm: existing.birthLengthCm,
          birthHeadCircumferenceCm: existing.birthHeadCircumferenceCm,
          apgar1Min: existing.apgar1Min,
          apgar5Min: existing.apgar5Min,
          apgar10Min: existing.apgar10Min,
          deliveryMode: existing.deliveryMode,
          birthType: existing.birthType,
          birthComplications: existing.birthComplications,
          maternalComplications: existing.maternalComplications,
          consanguinity: existing.consanguinity,
          neonatalResuscitationRequired: existing.neonatalResuscitationRequired,
          nicAdmissionRequired: existing.nicAdmissionRequired,
          nicStayDays: existing.nicStayDays,
          newbornScreeningNotes: existing.newbornScreeningNotes,
          source: existing.source,
        },
      };

      const updated = await tx.pediatricBirthHistory.update({
        where: { clinicId_id: { clinicId, id: historyId } },
        data: {
          gestationalAgeWeeks: input.gestationalAgeWeeks ?? existing.gestationalAgeWeeks,
          gestationalAgeDays: input.gestationalAgeDays ?? existing.gestationalAgeDays,
          birthWeightGrams: input.birthWeightGrams !== undefined ? input.birthWeightGrams : existing.birthWeightGrams,
          birthLengthCm: input.birthLengthCm !== undefined ? input.birthLengthCm : existing.birthLengthCm,
          birthHeadCircumferenceCm:
            input.birthHeadCircumferenceCm !== undefined
              ? input.birthHeadCircumferenceCm
              : existing.birthHeadCircumferenceCm,
          apgar1Min: input.apgar1Min !== undefined ? input.apgar1Min : existing.apgar1Min,
          apgar5Min: input.apgar5Min !== undefined ? input.apgar5Min : existing.apgar5Min,
          apgar10Min: input.apgar10Min !== undefined ? input.apgar10Min : existing.apgar10Min,
          deliveryMode: (input.deliveryMode as DeliveryMode) ?? existing.deliveryMode,
          birthType: (input.birthType as BirthType) ?? existing.birthType,
          birthComplications:
            input.birthComplications !== undefined ? input.birthComplications : existing.birthComplications,
          maternalComplications:
            input.maternalComplications !== undefined ? input.maternalComplications : existing.maternalComplications,
          consanguinity: input.consanguinity !== undefined ? input.consanguinity : existing.consanguinity,
          neonatalResuscitationRequired:
            input.neonatalResuscitationRequired !== undefined
              ? input.neonatalResuscitationRequired
              : existing.neonatalResuscitationRequired,
          nicAdmissionRequired:
            input.nicAdmissionRequired !== undefined ? input.nicAdmissionRequired : existing.nicAdmissionRequired,
          nicStayDays: input.nicStayDays !== undefined ? input.nicStayDays : existing.nicStayDays,
          newbornScreeningNotes:
            input.newbornScreeningNotes !== undefined
              ? input.newbornScreeningNotes
              : existing.newbornScreeningNotes,
          source: (input.source as BirthHistorySource) ?? existing.source,
          verifiedByMembershipId: membershipId,
          verifiedAt: new Date(),
          version: { increment: 1 },
          amendmentHistory: [...previousSnapshots, currentSnapshot] as unknown as Prisma.InputJsonValue,
        },
        include: {
          verifiedBy: {
            select: { id: true, user: { select: { id: true, name: true, email: true } } },
          },
        },
      });

      await this.audit.record(
        {
          clinicId,
          actorId: ctx.userId,
          category: 'CLINICAL',
          action: 'pediatrics.birth_history.amend',
          targetType: 'PediatricBirthHistory',
          targetId: updated.id,
          outcome: 'SUCCESS',
          metadata: {
            patientId: existing.patientId,
            amendmentReason: input.amendmentReason,
            newVersion: updated.version,
          },
        },
        tx,
      );

      return updated;
    });
  }

  // =========================================================================
  // 2. CAREGIVER AUTHORIZATION & RELATIONSHIPS
  // =========================================================================

  async listCaregivers(proof: VerifiedPrincipal, clinicId: string, patientId: string) {
    return this.database.withClinicContext(proof, clinicId, ['clinical.encounters.read'], async (tx) => {
      const caregivers = await tx.patientCaregiverRelationship.findMany({
        where: { clinicId, patientId },
        orderBy: [{ isRevoked: 'asc' }, { emergencyPriority: 'asc' }, { createdAt: 'desc' }],
        include: {
          revokedBy: {
            select: { id: true, user: { select: { id: true, name: true, email: true } } },
          },
        },
      });

      return { items: caregivers };
    });
  }

  async createCaregiver(
    proof: VerifiedPrincipal,
    clinicId: string,
    _membershipId: string,
    input: CreateCaregiverRelationshipDto,
  ) {
    return this.database.withClinicContext(proof, clinicId, ['clinical.encounters.create'], async (tx, ctx) => {
      const patient = await tx.patient.findUnique({
        where: { clinicId_id: { clinicId, id: input.patientId } },
      });
      if (!patient) throw new NotFoundException('Patient not found');

      // Check existing active relationship with same phone
      const existing = await tx.patientCaregiverRelationship.findFirst({
        where: {
          clinicId,
          patientId: input.patientId,
          caregiverPhone: input.caregiverPhone,
          isRevoked: false,
        },
      });
      if (existing) {
        throw new ConflictException('An active caregiver relationship already exists with this phone number');
      }

      const created = await tx.patientCaregiverRelationship.create({
        data: {
          clinicId,
          patientId: input.patientId,
          caregiverName: input.caregiverName,
          caregiverNationalId: input.caregiverNationalId,
          caregiverPhone: input.caregiverPhone,
          relationshipType: input.relationshipType as CaregiverRelationshipType,
          hasLegalCustody: input.hasLegalCustody ?? false,
          hasMedicalConsentAuthority: input.hasMedicalConsentAuthority ?? false,
          isEmergencyContact: input.isEmergencyContact ?? false,
          emergencyPriority: input.emergencyPriority ?? 1,
          portalProxyAccess: input.portalProxyAccess ?? false,
          legalDocumentationReference: input.legalDocumentationReference,
          notes: input.notes,
          isRevoked: false,
          version: 1,
        },
      });

      await this.audit.record(
        {
          clinicId,
          actorId: ctx.userId,
          category: 'CLINICAL',
          action: 'pediatrics.caregiver.create',
          targetType: 'PatientCaregiverRelationship',
          targetId: created.id,
          outcome: 'SUCCESS',
          metadata: {
            patientId: input.patientId,
            relationshipType: input.relationshipType,
            hasMedicalConsentAuthority: created.hasMedicalConsentAuthority,
            portalProxyAccess: created.portalProxyAccess,
          },
        },
        tx,
      );

      return created;
    });
  }

  async updateCaregiver(
    proof: VerifiedPrincipal,
    clinicId: string,
    _membershipId: string,
    caregiverId: string,
    input: UpdateCaregiverRelationshipDto,
  ) {
    return this.database.withClinicContext(proof, clinicId, ['clinical.encounters.update'], async (tx, ctx) => {
      const existing = await tx.patientCaregiverRelationship.findUnique({
        where: { clinicId_id: { clinicId, id: caregiverId } },
      });
      if (!existing) throw new NotFoundException('Caregiver relationship record not found');
      if (existing.isRevoked) {
        throw new BadRequestException('Cannot modify a revoked caregiver relationship');
      }
      if (existing.version !== input.expectedVersion) {
        throw new ConflictException('Concurrent modification conflict on caregiver relationship');
      }

      const updated = await tx.patientCaregiverRelationship.update({
        where: { clinicId_id: { clinicId, id: caregiverId } },
        data: {
          caregiverName: input.caregiverName ?? existing.caregiverName,
          caregiverNationalId:
            input.caregiverNationalId !== undefined ? input.caregiverNationalId : existing.caregiverNationalId,
          caregiverPhone: input.caregiverPhone ?? existing.caregiverPhone,
          relationshipType: (input.relationshipType as CaregiverRelationshipType) ?? existing.relationshipType,
          hasLegalCustody: input.hasLegalCustody !== undefined ? input.hasLegalCustody : existing.hasLegalCustody,
          hasMedicalConsentAuthority:
            input.hasMedicalConsentAuthority !== undefined
              ? input.hasMedicalConsentAuthority
              : existing.hasMedicalConsentAuthority,
          isEmergencyContact:
            input.isEmergencyContact !== undefined ? input.isEmergencyContact : existing.isEmergencyContact,
          emergencyPriority:
            input.emergencyPriority !== undefined ? input.emergencyPriority : existing.emergencyPriority,
          portalProxyAccess:
            input.portalProxyAccess !== undefined ? input.portalProxyAccess : existing.portalProxyAccess,
          legalDocumentationReference:
            input.legalDocumentationReference !== undefined
              ? input.legalDocumentationReference
              : existing.legalDocumentationReference,
          notes: input.notes !== undefined ? input.notes : existing.notes,
          version: { increment: 1 },
        },
      });

      await this.audit.record(
        {
          clinicId,
          actorId: ctx.userId,
          category: 'CLINICAL',
          action: 'pediatrics.caregiver.update',
          targetType: 'PatientCaregiverRelationship',
          targetId: updated.id,
          outcome: 'SUCCESS',
          metadata: {
            patientId: existing.patientId,
            newVersion: updated.version,
          },
        },
        tx,
      );

      return updated;
    });
  }

  async revokeCaregiver(
    proof: VerifiedPrincipal,
    clinicId: string,
    membershipId: string,
    caregiverId: string,
    input: RevokeCaregiverRelationshipDto,
  ) {
    return this.database.withClinicContext(proof, clinicId, ['clinical.encounters.update'], async (tx, ctx) => {
      const existing = await tx.patientCaregiverRelationship.findUnique({
        where: { clinicId_id: { clinicId, id: caregiverId } },
      });
      if (!existing) throw new NotFoundException('Caregiver relationship not found');
      if (existing.isRevoked) {
        throw new BadRequestException('Caregiver relationship has already been revoked');
      }
      if (existing.version !== input.expectedVersion) {
        throw new ConflictException('Concurrent modification conflict on caregiver relationship');
      }

      const revoked = await tx.patientCaregiverRelationship.update({
        where: { clinicId_id: { clinicId, id: caregiverId } },
        data: {
          isRevoked: true,
          revokedAt: new Date(),
          revokedByMembershipId: membershipId,
          revocationReason: input.revocationReason,
          hasMedicalConsentAuthority: false,
          portalProxyAccess: false,
          version: { increment: 1 },
        },
        include: {
          revokedBy: {
            select: { id: true, user: { select: { id: true, name: true, email: true } } },
          },
        },
      });

      await this.audit.record(
        {
          clinicId,
          actorId: ctx.userId,
          category: 'CLINICAL',
          action: 'pediatrics.caregiver.revoke',
          targetType: 'PatientCaregiverRelationship',
          targetId: revoked.id,
          outcome: 'SUCCESS',
          metadata: {
            patientId: existing.patientId,
            revocationReason: input.revocationReason,
            revokedBy: membershipId,
          },
        },
        tx,
      );

      return revoked;
    });
  }

  // =========================================================================
  // 3. PEDIATRIC GROWTH RECORDS & ANALYTICS
  // =========================================================================

  async listGrowthRecords(proof: VerifiedPrincipal, clinicId: string, patientId: string) {
    return this.database.withClinicContext(proof, clinicId, ['clinical.encounters.read'], async (tx) => {
      const records = await tx.pediatricGrowthRecord.findMany({
        where: { clinicId, patientId },
        orderBy: { measuredAt: 'desc' },
        include: {
          recordedBy: {
            select: { id: true, user: { select: { id: true, name: true, email: true } } },
          },
        },
      });

      return { items: records };
    });
  }

  async recordGrowth(
    proof: VerifiedPrincipal,
    clinicId: string,
    membershipId: string,
    input: RecordPediatricGrowthDto,
  ) {
    await this.assertPediatricPrivilege(proof, clinicId, membershipId, 'PEDIATRIC_GROWTH_RECORD');

    return this.database.withClinicContext(proof, clinicId, ['clinical.encounters.create'], async (tx, ctx) => {
      const patient = await tx.patient.findUnique({
        where: { clinicId_id: { clinicId, id: input.patientId } },
      });
      if (!patient) throw new NotFoundException('Patient record not found');
      if (!patient.dateOfBirth) {
        throw new BadRequestException('Patient date of birth is required to evaluate pediatric growth percentiles');
      }

      // Check birth history for prematurity parameters
      const birthHistory = await tx.pediatricBirthHistory.findUnique({
        where: { clinicId_patientId: { clinicId, patientId: input.patientId } },
      });

      const measurementDate = input.measuredAt ? new Date(input.measuredAt) : new Date();

      // Clinical evaluation using WHO engine
      const evalResult = evaluatePediatricGrowth({
        birthDate: patient.dateOfBirth,
        measurementDate,
        gender: (patient.gender as PatientGender) === 'FEMALE' ? 'FEMALE' : 'MALE',
        gestationalAgeWeeks: birthHistory?.gestationalAgeWeeks,
        gestationalAgeDays: birthHistory?.gestationalAgeDays ?? 0,
        weightKg: input.weightKg,
        statureCm: input.statureCm,
        statureMethod:
          (input.statureMethod as StatureMeasurementMethod) ??
          determineStatureMethod(evalResultChronologicalAgeDays(patient.dateOfBirth, measurementDate)),
        headCircumferenceCm: input.headCircumferenceCm,
        useCorrectedAgeForZScores: input.useCorrectedAgeForZScores ?? true,
      });

      const effectiveStatureMethod =
        (input.statureMethod as StatureMeasurementMethod) ?? evalResult.recommendedStatureMethod;

      const created = await tx.pediatricGrowthRecord.create({
        data: {
          clinicId,
          patientId: input.patientId,
          encounterId: input.encounterId,
          recordedByMembershipId: membershipId,
          measuredAt: measurementDate,
          chronologicalAgeDays: evalResult.chronologicalAge.days,
          correctedAgeDays: evalResult.correctedAge.applies ? evalResult.correctedAge.correctedAgeDays : null,
          gestationalAgeAtBirthWeeks: birthHistory?.gestationalAgeWeeks,
          weightKg: input.weightKg,
          statureCm: input.statureCm,
          statureMethod: effectiveStatureMethod,
          headCircumferenceCm: input.headCircumferenceCm,
          bmi: evalResult.bmi,
          weightForAgeZScore: evalResult.weightForAge.zScore,
          weightForAgePercentile: evalResult.weightForAge.percentile,
          lengthForAgeZScore: evalResult.lengthForAge.zScore,
          lengthForAgePercentile: evalResult.lengthForAge.percentile,
          headCircumferenceZScore: evalResult.headCircumferenceForAge.zScore,
          headCircumferencePercentile: evalResult.headCircumferenceForAge.percentile,
          bmiForAgeZScore: evalResult.bmiForAge.zScore,
          bmiForAgePercentile: evalResult.bmiForAge.percentile,
          growthReferenceStandard: 'WHO_2006',
          measurementSource: (input.measurementSource as MeasurementSource) ?? 'CLINICAL_ENCOUNTER',
          status: 'FINAL',
          version: 1,
        },
        include: {
          recordedBy: {
            select: { id: true, user: { select: { id: true, name: true, email: true } } },
          },
        },
      });

      await this.audit.record(
        {
          clinicId,
          actorId: ctx.userId,
          category: 'CLINICAL',
          action: 'pediatrics.growth.record',
          targetType: 'PediatricGrowthRecord',
          targetId: created.id,
          outcome: 'SUCCESS',
          metadata: {
            patientId: input.patientId,
            chronologicalAgeDays: evalResult.chronologicalAge.days,
            weightKg: input.weightKg,
            statureCm: input.statureCm,
            alerts: evalResult.clinicalAlerts,
          },
        },
        tx,
      );

      return {
        ...created,
        clinicalAlerts: evalResult.clinicalAlerts,
        evaluationSummary: evalResult,
      };
    });
  }

  async enterInErrorGrowthRecord(
    proof: VerifiedPrincipal,
    clinicId: string,
    membershipId: string,
    recordId: string,
    input: EnterInErrorGrowthRecordDto,
  ) {
    await this.assertPediatricPrivilege(proof, clinicId, membershipId, 'PEDIATRIC_GROWTH_REVIEW');

    return this.database.withClinicContext(proof, clinicId, ['clinical.encounters.update'], async (tx, ctx) => {
      const existing = await tx.pediatricGrowthRecord.findUnique({
        where: { clinicId_id: { clinicId, id: recordId } },
      });
      if (!existing) throw new NotFoundException('Pediatric growth record not found');
      if (existing.status === 'ENTERED_IN_ERROR') {
        throw new BadRequestException('Record is already marked as entered in error');
      }
      if (existing.version !== input.expectedVersion) {
        throw new ConflictException('Concurrent modification conflict on pediatric growth record');
      }

      const updated = await tx.pediatricGrowthRecord.update({
        where: { clinicId_id: { clinicId, id: recordId } },
        data: {
          status: 'ENTERED_IN_ERROR',
          errorReason: input.errorReason,
          version: { increment: 1 },
        },
      });

      await this.audit.record(
        {
          clinicId,
          actorId: ctx.userId,
          category: 'CLINICAL',
          action: 'pediatrics.growth.enter_in_error',
          targetType: 'PediatricGrowthRecord',
          targetId: updated.id,
          outcome: 'SUCCESS',
          metadata: {
            patientId: existing.patientId,
            errorReason: input.errorReason,
          },
        },
        tx,
      );

      return updated;
    });
  }

  // =========================================================================
  // 4. PEDIATRIC MEDICATION SAFETY PREFLIGHT
  // =========================================================================

  async preflightMedicationSafety(
    proof: VerifiedPrincipal,
    clinicId: string,
    input: PediatricMedicationPreflightDto,
  ) {
    return this.database.withClinicContext(proof, clinicId, ['clinical.encounters.read'], async (tx) => {
      const patient = await tx.patient.findUnique({
        where: { clinicId_id: { clinicId, id: input.patientId } },
      });
      if (!patient) throw new NotFoundException('Patient record not found');
      if (!patient.dateOfBirth) {
        throw new BadRequestException('Patient date of birth is required for pediatric medication preflight safety verification');
      }

      // Check current or latest documented weight
      let weightKg = input.currentWeightKg;
      let weightDate: Date | undefined;

      if (!weightKg) {
        const latestGrowth = await tx.pediatricGrowthRecord.findFirst({
          where: { clinicId, patientId: input.patientId, status: 'FINAL', weightKg: { not: null } },
          orderBy: { measuredAt: 'desc' },
        });

        if (latestGrowth && latestGrowth.weightKg) {
          weightKg = Number(latestGrowth.weightKg);
          weightDate = latestGrowth.measuredAt;
        }
      } else {
        weightDate = new Date();
      }

      // Fetch active allergies
      const allergies = await tx.patientAllergy.findMany({
        where: { clinicId, patientId: input.patientId, clinicalStatus: 'ACTIVE' },
      });

      const allergySnapshots: PatientAllergySnapshot[] = allergies.map((a) => ({
        id: a.id,
        allergen: a.substance,
        severity: a.severity as 'MILD' | 'MODERATE' | 'SEVERE' | 'LIFE_THREATENING',
        clinicalStatus: 'ACTIVE',
      }));

      const safetyResult = preflightPediatricMedicationSafety({
        patientId: input.patientId,
        birthDate: patient.dateOfBirth,
        medicationName: input.medicationName,
        medicationCode: input.medicationCode,
        route: input.route,
        clinicalIndications: input.clinicalIndications,
        currentWeightKg: weightKg,
        weightMeasuredAt: weightDate,
        allergies: allergySnapshots,
      });

      return safetyResult;
    });
  }
}

function evalResultChronologicalAgeDays(birthDate: Date, measurementDate: Date): number {
  const diffMs = measurementDate.getTime() - birthDate.getTime();
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}
