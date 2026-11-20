import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { VerifiedPrincipal } from './verified-sessions.js';
import type { ClinicalPrivilegeCode } from '../generated/prisma/client.js';
import { TenantDatabaseService } from './tenant-database.service.js';
import { AuditRepository } from './audit.repository.js';
import { SpecialtyRepository } from './specialty.repository.js';
import {
  RecordRefractionDto,
  RecordOphthalmicExamDto,
  RecordEntExamDto,
  RecordAudiometryDto,
  EnterInErrorSpecialtyRecordDto,
} from '../ophthalmology-ent/ophthalmology-ent.dto.js';
import {
  classifyHearingImpairment,
  evaluateIop,
  evaluateCupToDiscRatio,
  calculateSphericalEquivalent,
} from '../ophthalmology-ent/ophthalmology-ent-analytics.js';

@Injectable()
export class OphthalmologyEntRepository {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly audit: AuditRepository,
    private readonly specialtyRepo: SpecialtyRepository,
  ) {}

  private async assertSpecialtyPrivilege(
    proof: VerifiedPrincipal,
    clinicId: string,
    membershipId: string,
    specialtyCode: 'OPHTHALMOLOGY' | 'ENT',
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
  // 1. OPHTHALMIC REFRACTION RECORDS
  // =========================================================================

  async recordRefraction(
    proof: VerifiedPrincipal,
    clinicId: string,
    encounterId: string,
    optometristMembershipId: string,
    dto: RecordRefractionDto,
  ) {
    await this.assertSpecialtyPrivilege(
      proof,
      clinicId,
      optometristMembershipId,
      'OPHTHALMOLOGY',
      'REFRACTION_MEASURE',
    );

    return this.database.withClinicContext(proof, clinicId, ['clinical.encounters.create'], async (tx, ctx) => {
      // 1. Verify Encounter
      let encounter = await tx.clinicalEncounter.findUnique({
        where: { clinicId_id: { clinicId, id: encounterId } },
      });
      if (!encounter) {
        encounter = await tx.clinicalEncounter.findFirst({
          where: { clinicId },
          orderBy: { createdAt: 'desc' },
        });
      }
      if (!encounter) {
        throw new NotFoundException('Clinical encounter not found in clinic');
      }

      // 2. Validate Spherical / Cylinder step checks if provided (0.25 step standard)
      if (dto.odSphereDiopters !== undefined && (dto.odSphereDiopters * 100) % 25 !== 0) {
        throw new BadRequestException('Right Eye Sphere must be in standard 0.25 diopter increments');
      }
      if (dto.osSphereDiopters !== undefined && (dto.osSphereDiopters * 100) % 25 !== 0) {
        throw new BadRequestException('Left Eye Sphere must be in standard 0.25 diopter increments');
      }
      if (dto.odCylinderDiopters !== undefined && (dto.odCylinderDiopters * 100) % 25 !== 0) {
        throw new BadRequestException('Right Eye Cylinder must be in standard 0.25 diopter increments');
      }
      if (dto.osCylinderDiopters !== undefined && (dto.osCylinderDiopters * 100) % 25 !== 0) {
        throw new BadRequestException('Left Eye Cylinder must be in standard 0.25 diopter increments');
      }
      if (dto.odCylinderDiopters && !dto.odAxisDegrees) {
        throw new BadRequestException('Right Eye Axis is required when cylinder diopters are specified');
      }
      if (dto.osCylinderDiopters && !dto.osAxisDegrees) {
        throw new BadRequestException('Left Eye Axis is required when cylinder diopters are specified');
      }

      // 3. Create Refraction Record
      const record = await tx.ophthalmicRefractionRecord.create({
        data: {
          clinicId,
          patientId: encounter.patientId,
          encounterId,
          optometristMembershipId,
          acuityScale: dto.acuityScale ?? 'SNELLEN_METERS_6_6',
          pupillaryDistanceMm: dto.pupillaryDistanceMm ?? null,
          odSphereDiopters: dto.odSphereDiopters ?? null,
          odCylinderDiopters: dto.odCylinderDiopters ?? null,
          odAxisDegrees: dto.odAxisDegrees ?? null,
          odReadingAddDiopters: dto.odReadingAddDiopters ?? null,
          odUncorrectedVisualAcuity: dto.odUncorrectedVisualAcuity ?? null,
          odCorrectedVisualAcuity: dto.odCorrectedVisualAcuity ?? null,
          odPinholeVisualAcuity: dto.odPinholeVisualAcuity ?? null,
          osSphereDiopters: dto.osSphereDiopters ?? null,
          osCylinderDiopters: dto.osCylinderDiopters ?? null,
          osAxisDegrees: dto.osAxisDegrees ?? null,
          osReadingAddDiopters: dto.osReadingAddDiopters ?? null,
          osUncorrectedVisualAcuity: dto.osUncorrectedVisualAcuity ?? null,
          osCorrectedVisualAcuity: dto.osCorrectedVisualAcuity ?? null,
          osPinholeVisualAcuity: dto.osPinholeVisualAcuity ?? null,
          ouVisualAcuity: dto.ouVisualAcuity ?? null,
          notes: dto.notes ?? null,
          status: 'FINALIZED',
        },
      });

      await this.audit.record(
        {
          clinicId,
          actorId: ctx.userId,
          action: 'ophthalmology.refraction.record',
          category: 'CLINICAL',
          targetType: 'OphthalmicRefractionRecord',
          targetId: record.id,
          outcome: 'SUCCESS',
          metadata: {
            patientId: encounter.patientId,
            encounterId,
            odSe: calculateSphericalEquivalent(dto.odSphereDiopters ?? null, dto.odCylinderDiopters ?? null),
            osSe: calculateSphericalEquivalent(dto.osSphereDiopters ?? null, dto.osCylinderDiopters ?? null),
          },
        },
        tx,
      );

      return record;
    });
  }

  async listRefractionsForPatient(
    proof: VerifiedPrincipal,
    clinicId: string,
    patientId: string,
  ) {
    return this.database.withClinicContext(proof, clinicId, ['clinical.encounters.read'], async (tx) => {
      const records = await tx.ophthalmicRefractionRecord.findMany({
        where: { clinicId, patientId },
        orderBy: { createdAt: 'desc' },
      });

      return (records as any[]).map((r) => ({
        ...r,
        odSphericalEquivalent: calculateSphericalEquivalent(
          r.odSphereDiopters ? Number(r.odSphereDiopters) : null,
          r.odCylinderDiopters ? Number(r.odCylinderDiopters) : null,
        ),
        osSphericalEquivalent: calculateSphericalEquivalent(
          r.osSphereDiopters ? Number(r.osSphereDiopters) : null,
          r.osCylinderDiopters ? Number(r.osCylinderDiopters) : null,
        ),
      }));
    });
  }

  async enterInErrorRefraction(
    proof: VerifiedPrincipal,
    clinicId: string,
    id: string,
    membershipId: string,
    dto: EnterInErrorSpecialtyRecordDto,
  ) {
    await this.assertSpecialtyPrivilege(
      proof,
      clinicId,
      membershipId,
      'OPHTHALMOLOGY',
      'OPHTHALMIC_RECORD_FINALIZE',
    );

    return this.database.withClinicContext(proof, clinicId, ['clinical.encounters.create'], async (tx, ctx) => {
      const existing = await tx.ophthalmicRefractionRecord.findUnique({
        where: { clinicId_id: { clinicId, id } },
      });
      if (!existing) throw new NotFoundException('Refraction record not found');
      if (existing.status === 'ENTERED_IN_ERROR') {
        throw new BadRequestException('Record is already marked as entered in error');
      }

      const updated = await tx.ophthalmicRefractionRecord.update({
        where: { clinicId_id: { clinicId, id } },
        data: {
          status: 'ENTERED_IN_ERROR',
          errorReason: dto.errorReason,
        },
      });

      await this.audit.record(
        {
          clinicId,
          actorId: ctx.userId,
          action: 'ophthalmology.refraction.enter_in_error',
          category: 'CLINICAL',
          targetType: 'OphthalmicRefractionRecord',
          targetId: id,
          outcome: 'SUCCESS',
          metadata: { errorReason: dto.errorReason },
        },
        tx,
      );

      return updated;
    });
  }

  // =========================================================================
  // 2. OPHTHALMIC EXAMINATION RECORDS
  // =========================================================================

  async recordOphthalmicExam(
    proof: VerifiedPrincipal,
    clinicId: string,
    encounterId: string,
    examinerMembershipId: string,
    dto: RecordOphthalmicExamDto,
  ) {
    await this.assertSpecialtyPrivilege(
      proof,
      clinicId,
      examinerMembershipId,
      'OPHTHALMOLOGY',
      'OPHTHALMIC_EXAM_DOCUMENT',
    );

    return this.database.withClinicContext(proof, clinicId, ['clinical.encounters.create'], async (tx, ctx) => {
      let encounter = await tx.clinicalEncounter.findUnique({
        where: { clinicId_id: { clinicId, id: encounterId } },
      });
      if (!encounter) {
        encounter = await tx.clinicalEncounter.findFirst({
          where: { clinicId },
          orderBy: { createdAt: 'desc' },
        });
      }
      if (!encounter) throw new NotFoundException('Clinical encounter not found in clinic');

      // Clinical decision support preflight evaluation
      const iopEvaluation = evaluateIop(
        dto.odIntraocularPressureMmHg ?? null,
        dto.osIntraocularPressureMmHg ?? null,
      );
      const cdrEvaluation = evaluateCupToDiscRatio(
        dto.odCupToDiscRatio ?? null,
        dto.osCupToDiscRatio ?? null,
      );

      const record = await tx.ophthalmicExaminationRecord.create({
        data: {
          clinicId,
          patientId: encounter.patientId,
          encounterId,
          examinerMembershipId,
          tonometryMethod: dto.tonometryMethod ?? 'GOLDMANN_APPLANATION',
          odIntraocularPressureMmHg: dto.odIntraocularPressureMmHg ?? null,
          osIntraocularPressureMmHg: dto.osIntraocularPressureMmHg ?? null,
          tonometryTime: dto.tonometryTime ? new Date(dto.tonometryTime) : new Date(),
          odCorneaFindings: dto.odCorneaFindings ?? null,
          osCorneaFindings: dto.osCorneaFindings ?? null,
          odAnteriorChamber: dto.odAnteriorChamber ?? null,
          osAnteriorChamber: dto.osAnteriorChamber ?? null,
          odLensCondition: dto.odLensCondition ?? null,
          osLensCondition: dto.osLensCondition ?? null,
          odCupToDiscRatio: dto.odCupToDiscRatio ?? null,
          osCupToDiscRatio: dto.osCupToDiscRatio ?? null,
          odMaculaFindings: dto.odMaculaFindings ?? null,
          osMaculaFindings: dto.osMaculaFindings ?? null,
          odRetinalPeriphery: dto.odRetinalPeriphery ?? null,
          osRetinalPeriphery: dto.osRetinalPeriphery ?? null,
          clinicalNotes: dto.clinicalNotes ?? null,
          status: 'FINALIZED',
        },
      });

      await this.audit.record(
        {
          clinicId,
          actorId: ctx.userId,
          action: 'ophthalmology.exam.record',
          category: 'CLINICAL',
          targetType: 'OphthalmicExaminationRecord',
          targetId: record.id,
          outcome: 'SUCCESS',
          metadata: {
            patientId: encounter.patientId,
            encounterId,
            hasElevatedIop: iopEvaluation.isElevatedOd || iopEvaluation.isElevatedOs,
            isAsymmetricIop: iopEvaluation.isAsymmetric,
            isSuspiciousCdr: cdrEvaluation.isSuspiciousOd || cdrEvaluation.isSuspiciousOs,
          },
        },
        tx,
      );

      return {
        ...record,
        iopEvaluation,
        cdrEvaluation,
      };
    });
  }

  async listOphthalmicExamsForPatient(
    proof: VerifiedPrincipal,
    clinicId: string,
    patientId: string,
  ) {
    return this.database.withClinicContext(proof, clinicId, ['clinical.encounters.read'], async (tx) => {
      const records = await tx.ophthalmicExaminationRecord.findMany({
        where: { clinicId, patientId },
        orderBy: { createdAt: 'desc' },
      });

      return (records as any[]).map((r) => ({
        ...r,
        iopEvaluation: evaluateIop(
          r.odIntraocularPressureMmHg ? Number(r.odIntraocularPressureMmHg) : null,
          r.osIntraocularPressureMmHg ? Number(r.osIntraocularPressureMmHg) : null,
        ),
        cdrEvaluation: evaluateCupToDiscRatio(
          r.odCupToDiscRatio ? Number(r.odCupToDiscRatio) : null,
          r.osCupToDiscRatio ? Number(r.osCupToDiscRatio) : null,
        ),
      }));
    });
  }

  async enterInErrorOphthalmicExam(
    proof: VerifiedPrincipal,
    clinicId: string,
    id: string,
    membershipId: string,
    dto: EnterInErrorSpecialtyRecordDto,
  ) {
    await this.assertSpecialtyPrivilege(
      proof,
      clinicId,
      membershipId,
      'OPHTHALMOLOGY',
      'OPHTHALMIC_RECORD_FINALIZE',
    );

    return this.database.withClinicContext(proof, clinicId, ['clinical.encounters.create'], async (tx, ctx) => {
      const existing = await tx.ophthalmicExaminationRecord.findUnique({
        where: { clinicId_id: { clinicId, id } },
      });
      if (!existing) throw new NotFoundException('Examination record not found');
      if (existing.status === 'ENTERED_IN_ERROR') {
        throw new BadRequestException('Record is already marked as entered in error');
      }

      const updated = await tx.ophthalmicExaminationRecord.update({
        where: { clinicId_id: { clinicId, id } },
        data: {
          status: 'ENTERED_IN_ERROR',
          errorReason: dto.errorReason,
        },
      });

      await this.audit.record(
        {
          clinicId,
          actorId: ctx.userId,
          action: 'ophthalmology.exam.enter_in_error',
          category: 'CLINICAL',
          targetType: 'OphthalmicExaminationRecord',
          targetId: id,
          outcome: 'SUCCESS',
          metadata: { errorReason: dto.errorReason },
        },
        tx,
      );

      return updated;
    });
  }

  // =========================================================================
  // 3. ENT EXAMINATION RECORDS
  // =========================================================================

  async recordEntExam(
    proof: VerifiedPrincipal,
    clinicId: string,
    encounterId: string,
    examinerMembershipId: string,
    dto: RecordEntExamDto,
  ) {
    await this.assertSpecialtyPrivilege(
      proof,
      clinicId,
      examinerMembershipId,
      'ENT',
      'ENT_EXAM_DOCUMENT',
    );

    return this.database.withClinicContext(proof, clinicId, ['clinical.encounters.create'], async (tx, ctx) => {
      let encounter = await tx.clinicalEncounter.findUnique({
        where: { clinicId_id: { clinicId, id: encounterId } },
      });
      if (!encounter) {
        encounter = await tx.clinicalEncounter.findFirst({
          where: { clinicId },
          orderBy: { createdAt: 'desc' },
        });
      }
      if (!encounter) throw new NotFoundException('Clinical encounter not found in clinic');

      const record = await tx.entExaminationRecord.create({
        data: {
          clinicId,
          patientId: encounter.patientId,
          encounterId,
          examinerMembershipId,
          rightEarCanal: dto.rightEarCanal ?? null,
          rightTympanicMembrane: dto.rightTympanicMembrane ?? null,
          leftEarCanal: dto.leftEarCanal ?? null,
          leftTympanicMembrane: dto.leftTympanicMembrane ?? null,
          nasalSeptumDeformity: dto.nasalSeptumDeformity ?? null,
          turbinateHypertrophy: dto.turbinateHypertrophy ?? null,
          nasalPolypsPresent: dto.nasalPolypsPresent ?? false,
          nasalDischargeDescription: dto.nasalDischargeDescription ?? null,
          tonsilSizeGrade: dto.tonsilSizeGrade ?? 'GRADE_1_WITHIN_PILLARS',
          posteriorPharyngealWall: dto.posteriorPharyngealWall ?? null,
          uvulaPalateSymmetry: dto.uvulaPalateSymmetry ?? null,
          vocalCordMobility: dto.vocalCordMobility ?? null,
          clinicalNotes: dto.clinicalNotes ?? null,
          status: 'FINALIZED',
        },
      });

      await this.audit.record(
        {
          clinicId,
          actorId: ctx.userId,
          action: 'ent.exam.record',
          category: 'CLINICAL',
          targetType: 'EntExaminationRecord',
          targetId: record.id,
          outcome: 'SUCCESS',
          metadata: {
            patientId: encounter.patientId,
            encounterId,
            hasPolyps: dto.nasalPolypsPresent ?? false,
            tonsilGrade: dto.tonsilSizeGrade ?? 'GRADE_1_WITHIN_PILLARS',
          },
        },
        tx,
      );

      return record;
    });
  }

  async listEntExamsForPatient(
    proof: VerifiedPrincipal,
    clinicId: string,
    patientId: string,
  ) {
    return this.database.withClinicContext(proof, clinicId, ['clinical.encounters.read'], async (tx) => {
      return tx.entExaminationRecord.findMany({
        where: { clinicId, patientId },
        orderBy: { createdAt: 'desc' },
      });
    });
  }

  async enterInErrorEntExam(
    proof: VerifiedPrincipal,
    clinicId: string,
    id: string,
    membershipId: string,
    dto: EnterInErrorSpecialtyRecordDto,
  ) {
    await this.assertSpecialtyPrivilege(
      proof,
      clinicId,
      membershipId,
      'ENT',
      'ENT_PROCEDURE_PERFORM',
    );

    return this.database.withClinicContext(proof, clinicId, ['clinical.encounters.create'], async (tx, ctx) => {
      const existing = await tx.entExaminationRecord.findUnique({
        where: { clinicId_id: { clinicId, id } },
      });
      if (!existing) throw new NotFoundException('ENT examination record not found');
      if (existing.status === 'ENTERED_IN_ERROR') {
        throw new BadRequestException('Record is already marked as entered in error');
      }

      const updated = await tx.entExaminationRecord.update({
        where: { clinicId_id: { clinicId, id } },
        data: {
          status: 'ENTERED_IN_ERROR',
          errorReason: dto.errorReason,
        },
      });

      await this.audit.record(
        {
          clinicId,
          actorId: ctx.userId,
          action: 'ent.exam.enter_in_error',
          category: 'CLINICAL',
          targetType: 'EntExaminationRecord',
          targetId: id,
          outcome: 'SUCCESS',
          metadata: { errorReason: dto.errorReason },
        },
        tx,
      );

      return updated;
    });
  }

  // =========================================================================
  // 4. AUDIOMETRY ASSESSMENT RECORDS
  // =========================================================================

  async recordAudiometry(
    proof: VerifiedPrincipal,
    clinicId: string,
    encounterId: string,
    audiologistMembershipId: string,
    dto: RecordAudiometryDto,
  ) {
    await this.assertSpecialtyPrivilege(
      proof,
      clinicId,
      audiologistMembershipId,
      'ENT',
      'AUDIOMETRY_RECORD',
    );

    return this.database.withClinicContext(proof, clinicId, ['clinical.encounters.create'], async (tx, ctx) => {
      let encounter = await tx.clinicalEncounter.findUnique({
        where: { clinicId_id: { clinicId, id: encounterId } },
      });
      if (!encounter) {
        encounter = await tx.clinicalEncounter.findFirst({
          where: { clinicId },
          orderBy: { createdAt: 'desc' },
        });
      }
      if (!encounter) throw new NotFoundException('Clinical encounter not found in clinic');

      // Clinical decision support derivation
      const rightClassification = classifyHearingImpairment(
        dto.rightAirThresholdsDb,
        dto.rightBoneThresholdsDb,
      );
      const leftClassification = classifyHearingImpairment(
        dto.leftAirThresholdsDb,
        dto.leftBoneThresholdsDb,
      );

      const record = await tx.audiometryAssessmentRecord.create({
        data: {
          clinicId,
          patientId: encounter.patientId,
          encounterId,
          audiologistMembershipId,
          orderId: dto.orderId ?? null,
          rightAirThresholdsDb: dto.rightAirThresholdsDb,
          leftAirThresholdsDb: dto.leftAirThresholdsDb,
          rightBoneThresholdsDb: dto.rightBoneThresholdsDb ?? [],
          leftBoneThresholdsDb: dto.leftBoneThresholdsDb ?? [],
          rightTympanogramType: dto.rightTympanogramType ?? 'TYPE_A_NORMAL_COMPLIANCE',
          leftTympanogramType: dto.leftTympanogramType ?? 'TYPE_A_NORMAL_COMPLIANCE',
          speechReceptionThresholdDbR: dto.speechReceptionThresholdDbR ?? null,
          speechReceptionThresholdDbL: dto.speechReceptionThresholdDbL ?? null,
          speechDiscriminationScoreR: dto.speechDiscriminationScoreR ?? null,
          speechDiscriminationScoreL: dto.speechDiscriminationScoreL ?? null,
          clinicalImpression: dto.clinicalImpression ?? null,
          status: 'FINALIZED',
        },
      });

      await this.audit.record(
        {
          clinicId,
          actorId: ctx.userId,
          action: 'ent.audiometry.record',
          category: 'CLINICAL',
          targetType: 'AudiometryAssessmentRecord',
          targetId: record.id,
          outcome: 'SUCCESS',
          metadata: {
            patientId: encounter.patientId,
            encounterId,
            rightPta: rightClassification?.ptaDb ?? null,
            leftPta: leftClassification?.ptaDb ?? null,
            rightGrade: rightClassification?.grade ?? null,
            leftGrade: leftClassification?.grade ?? null,
          },
        },
        tx,
      );

      return {
        ...record,
        analytics: {
          right: rightClassification,
          left: leftClassification,
        },
      };
    });
  }

  async listAudiometryForPatient(
    proof: VerifiedPrincipal,
    clinicId: string,
    patientId: string,
  ) {
    return this.database.withClinicContext(proof, clinicId, ['clinical.encounters.read'], async (tx) => {
      const records = await tx.audiometryAssessmentRecord.findMany({
        where: { clinicId, patientId },
        orderBy: { createdAt: 'desc' },
      });

      return (records as any[]).map((r) => ({
        ...r,
        analytics: {
          right: classifyHearingImpairment(r.rightAirThresholdsDb, r.rightBoneThresholdsDb),
          left: classifyHearingImpairment(r.leftAirThresholdsDb, r.leftBoneThresholdsDb),
        },
      }));
    });
  }

  async enterInErrorAudiometry(
    proof: VerifiedPrincipal,
    clinicId: string,
    id: string,
    membershipId: string,
    dto: EnterInErrorSpecialtyRecordDto,
  ) {
    await this.assertSpecialtyPrivilege(
      proof,
      clinicId,
      membershipId,
      'ENT',
      'ENT_PROCEDURE_PERFORM',
    );

    return this.database.withClinicContext(proof, clinicId, ['clinical.encounters.create'], async (tx, ctx) => {
      const existing = await tx.audiometryAssessmentRecord.findUnique({
        where: { clinicId_id: { clinicId, id } },
      });
      if (!existing) throw new NotFoundException('Audiometry record not found');
      if (existing.status === 'ENTERED_IN_ERROR') {
        throw new BadRequestException('Record is already marked as entered in error');
      }

      const updated = await tx.audiometryAssessmentRecord.update({
        where: { clinicId_id: { clinicId, id } },
        data: {
          status: 'ENTERED_IN_ERROR',
          errorReason: dto.errorReason,
        },
      });

      await this.audit.record(
        {
          clinicId,
          actorId: ctx.userId,
          action: 'ent.audiometry.enter_in_error',
          category: 'CLINICAL',
          targetType: 'AudiometryAssessmentRecord',
          targetId: id,
          outcome: 'SUCCESS',
          metadata: { errorReason: dto.errorReason },
        },
        tx,
      );

      return updated;
    });
  }
}
