import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type {
  ObservationType,
  ClinicalProvenance,
  DiagnosisRole,
  DiagnosisClinicalStatus,
  DiagnosisVerificationStatus,
  ProblemListStatus,
  AllergyStatusType,
  AllergenCategory,
  AllergySeverity,
  AllergyClinicalStatus,
  AllergyVerificationStatus,
  MedicationRecordStatus,
  PrescriptionStatus,
} from '../generated/prisma/client.js';
import { TenantDatabaseService, type TenantTransaction } from './tenant-database.service.js';
import type { VerifiedPrincipal } from './verified-sessions.js';
import { AuditRepository } from './audit.repository.js';
import { SpecialtyRepository } from './specialty.repository.js';
import type {
  RecordObservationDto,
  AmendObservationDto,
  RecordDiagnosisDto,
  AmendDiagnosisDto,
  RecordAllergyDto,
  RecordMedicationDto,
  ReconcileMedicationsDto,
  CreatePrescriptionDraftDto,
  SignPrescriptionDto,
  CancelPrescriptionDto,
} from '../clinical-foundation/clinical-foundation.dto.js';

export interface ObservationListQuery {
  patientId: string;
  encounterId?: string;
  observationType?: ObservationType;
  pageSize?: number;
  cursor?: string;
}

export interface DiagnosisListQuery {
  patientId: string;
  encounterId?: string;
  isProblem?: boolean;
  problemStatus?: ProblemListStatus;
}

export interface AllergyListQuery {
  patientId: string;
  clinicalStatus?: AllergyClinicalStatus;
}

export interface MedicationListQuery {
  patientId: string;
  status?: MedicationRecordStatus;
  isReconciled?: boolean;
}

export interface PrescriptionListQuery {
  patientId: string;
  encounterId?: string;
  status?: PrescriptionStatus;
}

@Injectable()
export class ClinicalFoundationRepository {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly audit: AuditRepository,
    private readonly specialtyRepo: SpecialtyRepository,
  ) {}

  // =========================================================================
  // 1. VITAL SIGNS & CLINICAL OBSERVATIONS
  // =========================================================================

  private validateObservationBounds(type: ObservationType, value?: number): void {
    if (value === undefined || value === null) return;

    switch (type) {
      case 'BLOOD_PRESSURE_SYSTOLIC':
        if (value < 40 || value > 300) {
          throw new BadRequestException(`Systolic blood pressure ${value} is out of physiological bounds (40-300 mmHg)`);
        }
        break;
      case 'BLOOD_PRESSURE_DIASTOLIC':
        if (value < 20 || value > 200) {
          throw new BadRequestException(`Diastolic blood pressure ${value} is out of physiological bounds (20-200 mmHg)`);
        }
        break;
      case 'HEART_RATE':
        if (value < 20 || value > 300) {
          throw new BadRequestException(`Heart rate ${value} bpm is out of physiological bounds (20-300 bpm)`);
        }
        break;
      case 'RESPIRATORY_RATE':
        if (value < 4 || value > 80) {
          throw new BadRequestException(`Respiratory rate ${value} /min is out of physiological bounds (4-80 /min)`);
        }
        break;
      case 'BODY_TEMPERATURE':
        if (value < 25 || value > 45) {
          throw new BadRequestException(`Body temperature ${value} °C is out of physiological bounds (25-45 °C)`);
        }
        break;
      case 'OXYGEN_SATURATION':
        if (value < 50 || value > 100) {
          throw new BadRequestException(`Oxygen saturation ${value} % is out of physiological bounds (50-100 %)`);
        }
        break;
      case 'WEIGHT':
        if (value < 0.5 || value > 500) {
          throw new BadRequestException(`Weight ${value} kg is out of physiological bounds (0.5-500 kg)`);
        }
        break;
      case 'HEIGHT':
        if (value < 20 || value > 260) {
          throw new BadRequestException(`Height ${value} cm is out of physiological bounds (20-260 cm)`);
        }
        break;
      case 'BODY_MASS_INDEX':
        if (value < 5 || value > 120) {
          throw new BadRequestException(`BMI ${value} kg/m² is out of physiological bounds (5-120 kg/m²)`);
        }
        break;
      default:
        break;
    }
  }

  calculateBmi(weightKg: number, heightCm: number): number {
    if (weightKg <= 0 || heightCm <= 0) {
      throw new BadRequestException('Weight and height must be strictly positive to calculate BMI');
    }
    const heightM = heightCm / 100;
    const bmi = weightKg / (heightM * heightM);
    return Math.round(bmi * 100) / 100;
  }

  async recordObservation(
    proof: VerifiedPrincipal,
    clinicId: string,
    patientId: string,
    dto: RecordObservationDto,
  ) {
    this.validateObservationBounds(dto.observationType as ObservationType, dto.numericValue);

    return this.database.withClinicContext(proof, clinicId, ['clinical.observations.create'], async (tx, c) => {
      const patient = await tx.patient.findFirst({
        where: { id: patientId, clinicId: c.clinicId, status: 'ACTIVE' },
        select: { id: true },
      });
      if (!patient) throw new NotFoundException('Active patient not found in clinic');

      if (dto.encounterId) {
        const encounter = await tx.clinicalEncounter.findFirst({
          where: { id: dto.encounterId, clinicId: c.clinicId, patientId },
          select: { id: true },
        });
        if (!encounter) throw new NotFoundException('Clinical encounter not found for patient in clinic');
      }

      const created = await tx.clinicalObservation.create({
        data: {
          clinicId: c.clinicId,
          patientId,
          encounterId: dto.encounterId ?? null,
          authorMembershipId: c.membershipId,
          observationType: dto.observationType as ObservationType,
          numericValue: dto.numericValue !== undefined ? dto.numericValue : null,
          textValue: dto.textValue ?? null,
          unit: dto.unit,
          measuredAt: dto.measuredAt ? new Date(dto.measuredAt) : new Date(),
          status: 'RECORDED',
          provenance: (dto.provenance as ClinicalProvenance) ?? 'CLINICIAN_MEASURED',
          bodySite: dto.bodySite ?? null,
          method: dto.method ?? null,
          interpretation: dto.interpretation ?? null,
        },
      });

      await this.safeAudit(tx, c, 'clinical.observation.record', created.id, {
        observationType: created.observationType,
        numericValue: dto.numericValue,
        unit: created.unit,
      });

      return {
        ...created,
        numericValue: created.numericValue !== null ? Number(created.numericValue) : null,
        measuredAt: created.measuredAt.toISOString(),
        createdAt: created.createdAt.toISOString(),
        updatedAt: created.updatedAt.toISOString(),
      };
    });
  }

  async amendObservation(
    proof: VerifiedPrincipal,
    clinicId: string,
    observationId: string,
    dto: AmendObservationDto,
  ) {
    return this.database.withClinicContext(proof, clinicId, ['clinical.observations.update'], async (tx, c) => {
      const obs = await tx.clinicalObservation.findFirst({
        where: { id: observationId, clinicId: c.clinicId },
      });
      if (!obs) throw new NotFoundException('Observation not found in clinic');

      if (obs.status === 'ENTERED_IN_ERROR') {
        throw new ConflictException('Cannot amend an observation that is already entered in error');
      }

      if (dto.expectedVersion !== undefined && obs.version !== dto.expectedVersion) {
        throw new ConflictException(`Version conflict: expected ${dto.expectedVersion}, actual ${obs.version}`);
      }

      if (dto.numericValue !== undefined) {
        this.validateObservationBounds(obs.observationType, dto.numericValue);
      }

      const updated = await tx.clinicalObservation.update({
        where: { id: obs.id },
        data: {
          numericValue: dto.numericValue !== undefined ? dto.numericValue : obs.numericValue,
          textValue: dto.textValue !== undefined ? dto.textValue : obs.textValue,
          unit: dto.unit !== undefined ? dto.unit : obs.unit,
          status: 'AMENDED',
          amendmentReason: dto.amendmentReason,
          version: { increment: 1 },
        },
      });

      await this.safeAudit(tx, c, 'clinical.observation.amend', updated.id, {
        reason: dto.amendmentReason,
        previousVersion: obs.version,
        newVersion: updated.version,
      });

      return {
        ...updated,
        numericValue: updated.numericValue !== null ? Number(updated.numericValue) : null,
        measuredAt: updated.measuredAt.toISOString(),
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      };
    });
  }

  async listObservations(proof: VerifiedPrincipal, clinicId: string, query: ObservationListQuery) {
    return this.database.withClinicContext(proof, clinicId, ['clinical.observations.read'], async (tx, c) => {
      const patient = await tx.patient.findFirst({
        where: { id: query.patientId, clinicId: c.clinicId },
        select: { id: true },
      });
      if (!patient) throw new NotFoundException('Patient not found in clinic');

      const take = Math.min(query.pageSize ?? 50, 100);
      const rows = await tx.clinicalObservation.findMany({
        where: {
          clinicId: c.clinicId,
          patientId: query.patientId,
          ...(query.encounterId ? { encounterId: query.encounterId } : {}),
          ...(query.observationType ? { observationType: query.observationType } : {}),
        },
        include: {
          author: { select: { user: { select: { name: true } } } },
        },
        orderBy: [{ measuredAt: 'desc' }, { id: 'desc' }],
        take: take + 1,
        ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      });

      const items = rows.slice(0, take);
      const nextCursor = rows.length > take ? items[items.length - 1]?.id ?? null : null;

      await this.safeAudit(tx, c, 'clinical.observation.list', query.patientId, { count: items.length });

      return {
        items: items.map(obs => ({
          ...obs,
          authorName: obs.author?.user?.name ?? null,
          numericValue: obs.numericValue !== null ? Number(obs.numericValue) : null,
          measuredAt: obs.measuredAt.toISOString(),
          createdAt: obs.createdAt.toISOString(),
          updatedAt: obs.updatedAt.toISOString(),
        })),
        nextCursor,
      };
    });
  }

  // =========================================================================
  // 2. ENCOUNTER DIAGNOSES & LONGITUDINAL PROBLEM LISTS
  // =========================================================================

  async recordDiagnosis(
    proof: VerifiedPrincipal,
    clinicId: string,
    patientId: string,
    dto: RecordDiagnosisDto,
  ) {
    return this.database.withClinicContext(proof, clinicId, ['clinical.diagnoses.create'], async (tx, c) => {
      const patient = await tx.patient.findFirst({
        where: { id: patientId, clinicId: c.clinicId, status: 'ACTIVE' },
        select: { id: true },
      });
      if (!patient) throw new NotFoundException('Active patient not found in clinic');

      const encounter = await tx.clinicalEncounter.findFirst({
        where: { id: dto.encounterId, clinicId: c.clinicId, patientId },
        select: { id: true },
      });
      if (!encounter) throw new NotFoundException('Clinical encounter not found for patient in clinic');

      // If diagnosisRole is PRIMARY, check if one already exists for this encounter and demote to SECONDARY
      const diagnosisRole = (dto.diagnosisRole as DiagnosisRole) ?? 'PRIMARY';
      if (diagnosisRole === 'PRIMARY') {
        await tx.encounterDiagnosis.updateMany({
          where: { clinicId: c.clinicId, encounterId: dto.encounterId, diagnosisRole: 'PRIMARY' },
          data: { diagnosisRole: 'SECONDARY', version: { increment: 1 } },
        });
      }

      const isProblem = dto.isProblem ?? false;
      const problemStatus = isProblem ? ((dto.problemStatus as ProblemListStatus) ?? 'ACTIVE') : null;

      const created = await tx.encounterDiagnosis.create({
        data: {
          clinicId: c.clinicId,
          patientId,
          encounterId: dto.encounterId,
          authorMembershipId: c.membershipId,
          diagnosisRole,
          clinicalStatus: (dto.clinicalStatus as DiagnosisClinicalStatus) ?? 'PROVISIONAL',
          verificationStatus: (dto.verificationStatus as DiagnosisVerificationStatus) ?? 'SUSPECTED',
          isProblem,
          problemStatus,
          codingSystem: dto.codingSystem,
          codingSystemVersion: dto.codingSystemVersion ?? null,
          code: dto.code,
          displayAr: dto.displayAr,
          displayEn: dto.displayEn ?? null,
          clinicalNarrative: dto.clinicalNarrative ?? null,
          onsetDate: dto.onsetDate ? new Date(dto.onsetDate) : null,
        },
      });

      await this.safeAudit(tx, c, 'clinical.diagnosis.record', created.id, {
        code: created.code,
        role: created.diagnosisRole,
        isProblem: created.isProblem,
      });

      return {
        ...created,
        onsetDate: created.onsetDate?.toISOString() ?? null,
        resolutionDate: created.resolutionDate?.toISOString() ?? null,
        createdAt: created.createdAt.toISOString(),
        updatedAt: created.updatedAt.toISOString(),
      };
    });
  }

  async amendDiagnosis(
    proof: VerifiedPrincipal,
    clinicId: string,
    diagnosisId: string,
    dto: AmendDiagnosisDto,
  ) {
    return this.database.withClinicContext(proof, clinicId, ['clinical.diagnoses.update'], async (tx, c) => {
      const diag = await tx.encounterDiagnosis.findFirst({
        where: { id: diagnosisId, clinicId: c.clinicId },
      });
      if (!diag) throw new NotFoundException('Diagnosis not found in clinic');

      if (dto.expectedVersion !== undefined && diag.version !== dto.expectedVersion) {
        throw new ConflictException(`Version conflict: expected ${dto.expectedVersion}, actual ${diag.version}`);
      }

      const isProblem = dto.isProblem !== undefined ? dto.isProblem : diag.isProblem;
      const problemStatus = isProblem
        ? (dto.problemStatus as ProblemListStatus) ?? diag.problemStatus ?? 'ACTIVE'
        : null;

      const updated = await tx.encounterDiagnosis.update({
        where: { id: diag.id },
        data: {
          clinicalStatus: (dto.clinicalStatus as DiagnosisClinicalStatus) ?? diag.clinicalStatus,
          isProblem,
          problemStatus,
          clinicalNarrative: dto.clinicalNarrative !== undefined ? dto.clinicalNarrative : diag.clinicalNarrative,
          resolutionDate: dto.resolutionDate ? new Date(dto.resolutionDate) : diag.resolutionDate,
          amendmentReason: dto.amendmentReason,
          version: { increment: 1 },
        },
      });

      await this.safeAudit(tx, c, 'clinical.diagnosis.amend', updated.id, {
        reason: dto.amendmentReason,
        previousVersion: diag.version,
        newVersion: updated.version,
      });

      return {
        ...updated,
        onsetDate: updated.onsetDate?.toISOString() ?? null,
        resolutionDate: updated.resolutionDate?.toISOString() ?? null,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      };
    });
  }

  async confirmDiagnosis(proof: VerifiedPrincipal, clinicId: string, diagnosisId: string) {
    return this.database.withClinicContext(proof, clinicId, ['clinical.diagnoses.confirm'], async (tx, c) => {
      const diag = await tx.encounterDiagnosis.findFirst({
        where: { id: diagnosisId, clinicId: c.clinicId },
      });
      if (!diag) throw new NotFoundException('Diagnosis not found in clinic');

      const updated = await tx.encounterDiagnosis.update({
        where: { id: diag.id },
        data: {
          confirmedByMembershipId: c.membershipId,
          clinicalStatus: 'CONFIRMED',
          verificationStatus: 'CONFIRMED',
          version: { increment: 1 },
        },
      });

      await this.safeAudit(tx, c, 'clinical.diagnosis.confirm', updated.id, {
        confirmedBy: c.membershipId,
        newVersion: updated.version,
      });

      return {
        ...updated,
        onsetDate: updated.onsetDate?.toISOString() ?? null,
        resolutionDate: updated.resolutionDate?.toISOString() ?? null,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      };
    });
  }

  async listDiagnoses(proof: VerifiedPrincipal, clinicId: string, query: DiagnosisListQuery) {
    return this.database.withClinicContext(proof, clinicId, ['clinical.diagnoses.read'], async (tx, c) => {
      const patient = await tx.patient.findFirst({
        where: { id: query.patientId, clinicId: c.clinicId },
        select: { id: true },
      });
      if (!patient) throw new NotFoundException('Patient not found in clinic');

      const rows = await tx.encounterDiagnosis.findMany({
        where: {
          clinicId: c.clinicId,
          patientId: query.patientId,
          ...(query.encounterId ? { encounterId: query.encounterId } : {}),
          ...(query.isProblem !== undefined ? { isProblem: query.isProblem } : {}),
          ...(query.problemStatus ? { problemStatus: query.problemStatus } : {}),
        },
        include: {
          author: { select: { user: { select: { name: true } } } },
          confirmedBy: { select: { user: { select: { name: true } } } },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      });

      await this.safeAudit(tx, c, 'clinical.diagnosis.list', query.patientId, { count: rows.length });

      return rows.map(d => ({
        ...d,
        authorName: d.author?.user?.name ?? null,
        confirmedByName: d.confirmedBy?.user?.name ?? null,
        onsetDate: d.onsetDate?.toISOString() ?? null,
        resolutionDate: d.resolutionDate?.toISOString() ?? null,
        createdAt: d.createdAt.toISOString(),
        updatedAt: d.updatedAt.toISOString(),
      }));
    });
  }

  // =========================================================================
  // 3. ALLERGIES & ADVERSE REACTIONS
  // =========================================================================

  async recordAllergy(
    proof: VerifiedPrincipal,
    clinicId: string,
    patientId: string,
    dto: RecordAllergyDto,
  ) {
    return this.database.withClinicContext(proof, clinicId, ['clinical.allergies.create'], async (tx, c) => {
      const patient = await tx.patient.findFirst({
        where: { id: patientId, clinicId: c.clinicId, status: 'ACTIVE' },
        select: { id: true },
      });
      if (!patient) throw new NotFoundException('Active patient not found in clinic');

      if (dto.encounterId) {
        const encounter = await tx.clinicalEncounter.findFirst({
          where: { id: dto.encounterId, clinicId: c.clinicId, patientId },
          select: { id: true },
        });
        if (!encounter) throw new NotFoundException('Clinical encounter not found for patient in clinic');
      }

      const allergyStatusType = (dto.allergyStatusType as AllergyStatusType) ?? 'ALLERGY_PRESENT';
      const substance = dto.substance.trim();

      const created = await tx.patientAllergy.create({
        data: {
          clinicId: c.clinicId,
          patientId,
          encounterId: dto.encounterId ?? null,
          recordedByMembershipId: c.membershipId,
          allergyStatusType,
          category: (dto.category as AllergenCategory) ?? 'MEDICATION',
          substance,
          substanceCode: dto.substanceCode ?? null,
          codingSystem: dto.codingSystem ?? null,
          reaction: dto.reaction ?? null,
          severity: (dto.severity as AllergySeverity) ?? 'UNKNOWN',
          clinicalStatus: (dto.clinicalStatus as AllergyClinicalStatus) ?? 'ACTIVE',
          verificationStatus: (dto.verificationStatus as AllergyVerificationStatus) ?? 'PATIENT_REPORTED',
          onsetDate: dto.onsetDate ? new Date(dto.onsetDate) : null,
          notes: dto.notes ?? null,
        },
      });

      await this.safeAudit(tx, c, 'clinical.allergy.record', created.id, {
        allergyStatusType: created.allergyStatusType,
        substance: created.substance,
        severity: created.severity,
      });

      return {
        ...created,
        onsetDate: created.onsetDate?.toISOString() ?? null,
        recordedAt: created.recordedAt.toISOString(),
        verifiedAt: created.verifiedAt?.toISOString() ?? null,
        createdAt: created.createdAt.toISOString(),
        updatedAt: created.updatedAt.toISOString(),
      };
    });
  }

  async verifyAllergy(proof: VerifiedPrincipal, clinicId: string, allergyId: string) {
    return this.database.withClinicContext(proof, clinicId, ['clinical.allergies.verify'], async (tx, c) => {
      const allergy = await tx.patientAllergy.findFirst({
        where: { id: allergyId, clinicId: c.clinicId },
      });
      if (!allergy) throw new NotFoundException('Allergy record not found in clinic');

      const updated = await tx.patientAllergy.update({
        where: { id: allergy.id },
        data: {
          verifiedByMembershipId: c.membershipId,
          verificationStatus: 'CLINICIAN_CONFIRMED',
          verifiedAt: new Date(),
          version: { increment: 1 },
        },
      });

      await this.safeAudit(tx, c, 'clinical.allergy.verify', updated.id, {
        verifiedBy: c.membershipId,
        newVersion: updated.version,
      });

      return {
        ...updated,
        onsetDate: updated.onsetDate?.toISOString() ?? null,
        recordedAt: updated.recordedAt.toISOString(),
        verifiedAt: updated.verifiedAt?.toISOString() ?? null,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      };
    });
  }

  async listAllergies(proof: VerifiedPrincipal, clinicId: string, query: AllergyListQuery) {
    return this.database.withClinicContext(proof, clinicId, ['clinical.allergies.read'], async (tx, c) => {
      const patient = await tx.patient.findFirst({
        where: { id: query.patientId, clinicId: c.clinicId },
        select: { id: true },
      });
      if (!patient) throw new NotFoundException('Patient not found in clinic');

      const rows = await tx.patientAllergy.findMany({
        where: {
          clinicId: c.clinicId,
          patientId: query.patientId,
          ...(query.clinicalStatus ? { clinicalStatus: query.clinicalStatus } : {}),
        },
        include: {
          recordedBy: { select: { user: { select: { name: true } } } },
          verifiedBy: { select: { user: { select: { name: true } } } },
        },
        orderBy: [{ recordedAt: 'desc' }, { id: 'desc' }],
      });

      await this.safeAudit(tx, c, 'clinical.allergy.list', query.patientId, { count: rows.length });

      return rows.map(a => ({
        ...a,
        recordedByName: a.recordedBy?.user?.name ?? null,
        verifiedByName: a.verifiedBy?.user?.name ?? null,
        onsetDate: a.onsetDate?.toISOString() ?? null,
        recordedAt: a.recordedAt.toISOString(),
        verifiedAt: a.verifiedAt?.toISOString() ?? null,
        createdAt: a.createdAt.toISOString(),
        updatedAt: a.updatedAt.toISOString(),
      }));
    });
  }

  // Pre-flight allergy safety checking
  async checkAllergySafety(tx: TenantTransaction, clinicId: string, patientId: string, medicationNames: string[]): Promise<string[]> {
    if (!medicationNames || medicationNames.length === 0) return [];

    const activeAllergies = await tx.patientAllergy.findMany({
      where: {
        clinicId,
        patientId,
        clinicalStatus: 'ACTIVE',
        allergyStatusType: 'ALLERGY_PRESENT',
      },
      select: { substance: true, reaction: true, severity: true },
    });

    const warnings: string[] = [];
    for (const med of medicationNames) {
      const normalizedMed = med.trim().toLowerCase();
      for (const al of activeAllergies) {
        const normalizedAllergen = al.substance.trim().toLowerCase();
        if (
          normalizedMed.includes(normalizedAllergen) ||
          normalizedAllergen.includes(normalizedMed)
        ) {
          warnings.push(
            `Allergy conflict: Patient has active allergy to "${al.substance}" (${al.severity}, reaction: ${al.reaction ?? 'not specified'}), matching medication "${med}".`
          );
        }
      }
    }
    return warnings;
  }

  // =========================================================================
  // 4. MEDICATION RECONCILIATION & HISTORIES
  // =========================================================================

  async recordMedication(
    proof: VerifiedPrincipal,
    clinicId: string,
    patientId: string,
    dto: RecordMedicationDto,
  ) {
    return this.database.withClinicContext(proof, clinicId, ['clinical.medications.create'], async (tx, c) => {
      const patient = await tx.patient.findFirst({
        where: { id: patientId, clinicId: c.clinicId, status: 'ACTIVE' },
        select: { id: true },
      });
      if (!patient) throw new NotFoundException('Active patient not found in clinic');

      if (dto.encounterId) {
        const encounter = await tx.clinicalEncounter.findFirst({
          where: { id: dto.encounterId, clinicId: c.clinicId, patientId },
          select: { id: true },
        });
        if (!encounter) throw new NotFoundException('Clinical encounter not found for patient in clinic');
      }

      const created = await tx.medicationRecord.create({
        data: {
          clinicId: c.clinicId,
          patientId,
          encounterId: dto.encounterId ?? null,
          recordedByMembershipId: c.membershipId,
          medicationName: dto.medicationName,
          genericName: dto.genericName ?? null,
          brandName: dto.brandName ?? null,
          atcCode: dto.atcCode ?? null,
          dosage: dto.dosage,
          dosageAmount: dto.dosageAmount !== undefined ? dto.dosageAmount : null,
          dosageUnit: dto.dosageUnit ?? null,
          route: dto.route,
          frequency: dto.frequency,
          instructions: dto.instructions ?? null,
          indication: dto.indication ?? null,
          status: (dto.status as MedicationRecordStatus) ?? 'ACTIVE',
          provenance: (dto.provenance as ClinicalProvenance) ?? 'PATIENT_REPORTED',
          startDate: dto.startDate ? new Date(dto.startDate) : null,
          endDate: dto.endDate ? new Date(dto.endDate) : null,
          discontinuationReason: dto.discontinuationReason ?? null,
        },
      });

      await this.safeAudit(tx, c, 'clinical.medication.record', created.id, {
        medicationName: created.medicationName,
        status: created.status,
      });

      return {
        ...created,
        dosageAmount: created.dosageAmount !== null ? Number(created.dosageAmount) : null,
        startDate: created.startDate?.toISOString() ?? null,
        endDate: created.endDate?.toISOString() ?? null,
        reconciledAt: created.reconciledAt?.toISOString() ?? null,
        createdAt: created.createdAt.toISOString(),
        updatedAt: created.updatedAt.toISOString(),
      };
    });
  }

  async reconcileMedications(
    proof: VerifiedPrincipal,
    clinicId: string,
    patientId: string,
    dto: ReconcileMedicationsDto,
  ) {
    return this.database.withClinicContext(proof, clinicId, ['clinical.medications.reconcile'], async (tx, c) => {
      const patient = await tx.patient.findFirst({
        where: { id: patientId, clinicId: c.clinicId, status: 'ACTIVE' },
        select: { id: true },
      });
      if (!patient) throw new NotFoundException('Active patient not found in clinic');

      const now = new Date();
      const updatedCount = await tx.medicationRecord.updateMany({
        where: {
          clinicId: c.clinicId,
          patientId,
          id: { in: dto.medicationIds },
        },
        data: {
          isReconciled: true,
          reconciledAt: now,
          reconciledByMembershipId: c.membershipId,
          version: { increment: 1 },
        },
      });

      await this.safeAudit(tx, c, 'clinical.medication.reconcile', patientId, {
        reconciledCount: updatedCount.count,
        medicationIds: dto.medicationIds,
      });

      return {
        reconciledCount: updatedCount.count,
        reconciledAt: now.toISOString(),
      };
    });
  }

  async listMedications(proof: VerifiedPrincipal, clinicId: string, query: MedicationListQuery) {
    return this.database.withClinicContext(proof, clinicId, ['clinical.medications.read'], async (tx, c) => {
      const patient = await tx.patient.findFirst({
        where: { id: query.patientId, clinicId: c.clinicId },
        select: { id: true },
      });
      if (!patient) throw new NotFoundException('Patient not found in clinic');

      const rows = await tx.medicationRecord.findMany({
        where: {
          clinicId: c.clinicId,
          patientId: query.patientId,
          ...(query.status ? { status: query.status } : {}),
          ...(query.isReconciled !== undefined ? { isReconciled: query.isReconciled } : {}),
        },
        include: {
          recordedBy: { select: { user: { select: { name: true } } } },
          verifiedBy: { select: { user: { select: { name: true } } } },
          reconciledBy: { select: { user: { select: { name: true } } } },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      });

      await this.safeAudit(tx, c, 'clinical.medication.list', query.patientId, { count: rows.length });

      return rows.map(m => ({
        ...m,
        recordedByName: m.recordedBy?.user?.name ?? null,
        verifiedByName: m.verifiedBy?.user?.name ?? null,
        reconciledByName: m.reconciledBy?.user?.name ?? null,
        dosageAmount: m.dosageAmount !== null ? Number(m.dosageAmount) : null,
        startDate: m.startDate?.toISOString() ?? null,
        endDate: m.endDate?.toISOString() ?? null,
        reconciledAt: m.reconciledAt?.toISOString() ?? null,
        createdAt: m.createdAt.toISOString(),
        updatedAt: m.updatedAt.toISOString(),
      }));
    });
  }

  // =========================================================================
  // 5. CONTROLLED OUTPATIENT PRESCRIPTIONS & TAMPER-EVIDENT SIGNATURES
  // =========================================================================

  private async generatePrescriptionNumber(tx: TenantTransaction, clinicId: string): Promise<string> {
    const counter = await tx.clinicPrescriptionCounter.upsert({
      where: { clinicId },
      create: { clinicId, nextValue: 2 },
      update: { nextValue: { increment: 1 } },
      select: { nextValue: true },
    });
    const assignedValue = counter.nextValue - 1;
    return `RX-${String(assignedValue).padStart(6, '0')}`;
  }

  async createPrescriptionDraft(
    proof: VerifiedPrincipal,
    clinicId: string,
    patientId: string,
    dto: CreatePrescriptionDraftDto,
  ) {
    return this.database.withClinicContext(proof, clinicId, ['clinical.prescriptions.draft'], async (tx, c) => {
      const patient = await tx.patient.findFirst({
        where: { id: patientId, clinicId: c.clinicId, status: 'ACTIVE' },
        select: { id: true },
      });
      if (!patient) throw new NotFoundException('Active patient not found in clinic');

      const encounter = await tx.clinicalEncounter.findFirst({
        where: { id: dto.encounterId, clinicId: c.clinicId, patientId },
        select: { id: true },
      });
      if (!encounter) throw new NotFoundException('Clinical encounter not found for patient in clinic');

      // Pre-flight allergy safety check across all draft items
      const itemNames = (dto.items ?? []).map(i => i.genericName ? `${i.medicationName} (${i.genericName})` : i.medicationName);
      const allergyWarnings = await this.checkAllergySafety(tx, c.clinicId, patientId, itemNames);
      const allergyCheckWarning = allergyWarnings.length > 0 ? allergyWarnings.join('; ') : null;

      // Generate sequential prescription number
      const prescriptionNumber = await this.generatePrescriptionNumber(tx, c.clinicId);

      // Create prescription header
      const createdRx = await tx.medicationPrescription.create({
        data: {
          clinicId: c.clinicId,
          patientId,
          encounterId: dto.encounterId,
          prescriberMembershipId: c.membershipId,
          prescriptionNumber,
          status: 'DRAFT',
          notes: dto.notes ?? null,
          allergyCheckWarning,
        },
      });

      // Create items if provided
      if (dto.items && dto.items.length > 0) {
        await tx.medicationPrescriptionItem.createMany({
          data: dto.items.map((item, index) => ({
            clinicId: c.clinicId,
            prescriptionId: createdRx.id,
            medicationName: item.medicationName,
            genericName: item.genericName ?? null,
            strength: item.strength,
            dosageForm: item.dosageForm,
            route: item.route,
            frequency: item.frequency,
            duration: item.duration,
            durationDays: item.durationDays ?? null,
            quantity: item.quantity,
            unit: item.unit,
            refillsAllowed: item.refillsAllowed ?? 0,
            substitutionAllowed: item.substitutionAllowed ?? false,
            instructions: item.instructions,
            indication: item.indication ?? null,
            itemOrder: index + 1,
          })),
        });
      }

      await this.safeAudit(tx, c, 'clinical.prescription.draft', createdRx.id, {
        prescriptionNumber,
        itemCount: dto.items?.length ?? 0,
        allergyWarningPresent: Boolean(allergyCheckWarning),
      });

      const fullRx = await tx.medicationPrescription.findUniqueOrThrow({
        where: { id: createdRx.id },
        include: {
          items: { orderBy: { itemOrder: 'asc' } },
          prescriber: { select: { user: { select: { name: true } } } },
        },
      });

      return {
        ...fullRx,
        prescriberName: fullRx.prescriber.user.name,
        signedAt: fullRx.signedAt?.toISOString() ?? null,
        cancelledAt: fullRx.cancelledAt?.toISOString() ?? null,
        createdAt: fullRx.createdAt.toISOString(),
        updatedAt: fullRx.updatedAt.toISOString(),
        items: fullRx.items.map(it => ({
          ...it,
          createdAt: it.createdAt.toISOString(),
          updatedAt: it.updatedAt.toISOString(),
        })),
      };
    });
  }

  async signPrescription(
    proof: VerifiedPrincipal,
    clinicId: string,
    prescriptionId: string,
    dto: SignPrescriptionDto,
  ) {
    return this.database.withClinicContext(proof, clinicId, ['clinical.prescriptions.sign'], async (tx, c) => {
      const rx = await tx.medicationPrescription.findFirst({
        where: { id: prescriptionId, clinicId: c.clinicId },
        include: { items: { orderBy: { itemOrder: 'asc' } } },
      });
      if (!rx) throw new NotFoundException('Prescription not found in clinic');

      if (rx.status !== 'DRAFT' && rx.status !== 'PENDING_REVIEW') {
        throw new ConflictException(`Cannot sign prescription in ${rx.status} status`);
      }

      if (dto.expectedVersion !== undefined && rx.version !== dto.expectedVersion) {
        throw new ConflictException(`Version conflict: expected ${dto.expectedVersion}, actual ${rx.version}`);
      }

      if (rx.items.length === 0) {
        throw new BadRequestException('Cannot sign a prescription with zero medication items');
      }

      // Check clinical privilege: prescriber must hold MEDICATION_PRESCRIBE privilege
      const evalResult = await this.specialtyRepo.evaluatePrivilege(proof, c.clinicId, {
        practitionerMembershipId: c.membershipId,
        specialtyCode: 'GENERAL_MEDICINE',
        privilegeCode: 'MEDICATION_PRESCRIBE',
        branchId: c.selectedBranchId,
      });

      if (!evalResult.allowed) {
        throw new ForbiddenException(evalResult.reason ?? 'Practitioner lacks active MEDICATION_PRESCRIBE clinical privilege');
      }

      const privilege = await tx.practitionerClinicalPrivilege.findFirst({
        where: {
          clinicId: c.clinicId,
          practitionerProfile: { membershipId: c.membershipId },
          privilegeCode: 'MEDICATION_PRESCRIBE',
          status: 'APPROVED',
        },
      });

      // Pre-flight allergy safety check
      if (rx.allergyCheckWarning && !dto.safetyReviewAcknowledged) {
        throw new BadRequestException(
          `Allergy conflict present on prescription: ${rx.allergyCheckWarning}. Explicit safetyReviewAcknowledged=true required.`
        );
      }

      const signedAt = new Date();

      // Generate SHA-256 tamper-evident digest
      const canonicalPayload = JSON.stringify({
        clinicId: rx.clinicId,
        prescriptionNumber: rx.prescriptionNumber,
        patientId: rx.patientId,
        prescriberMembershipId: rx.prescriberMembershipId,
        signedByMembershipId: c.membershipId,
        signedAt: signedAt.toISOString(),
        items: rx.items.map(it => ({
          medicationName: it.medicationName,
          genericName: it.genericName ?? null,
          strength: it.strength,
          dosageForm: it.dosageForm,
          route: it.route,
          frequency: it.frequency,
          duration: it.duration,
          quantity: it.quantity,
          unit: it.unit,
          refillsAllowed: it.refillsAllowed,
          instructions: it.instructions,
        })),
      });

      const signatureDigest = createHash('sha256').update(canonicalPayload).digest('hex');

      const updatedRx = await tx.medicationPrescription.update({
        where: { id: rx.id },
        data: {
          status: 'SIGNED',
          signedAt,
          signedByMembershipId: c.membershipId,
          practitionerClinicalPrivilegeId: privilege?.id ?? null,
          signatureDigest,
          safetyReviewAcknowledged: true,
          version: { increment: 1 },
        },
        include: {
          items: { orderBy: { itemOrder: 'asc' } },
          prescriber: { select: { user: { select: { name: true } } } },
          signedBy: { select: { user: { select: { name: true } } } },
        },
      });

      await this.safeAudit(tx, c, 'clinical.prescription.sign', updatedRx.id, {
        prescriptionNumber: updatedRx.prescriptionNumber,
        signatureDigest,
        signedAt: signedAt.toISOString(),
      });

      return {
        ...updatedRx,
        prescriberName: updatedRx.prescriber.user.name,
        signedByName: updatedRx.signedBy?.user?.name ?? null,
        signedAt: updatedRx.signedAt?.toISOString() ?? null,
        cancelledAt: updatedRx.cancelledAt?.toISOString() ?? null,
        createdAt: updatedRx.createdAt.toISOString(),
        updatedAt: updatedRx.updatedAt.toISOString(),
        items: updatedRx.items.map(it => ({
          ...it,
          createdAt: it.createdAt.toISOString(),
          updatedAt: it.updatedAt.toISOString(),
        })),
      };
    });
  }

  async cancelPrescription(
    proof: VerifiedPrincipal,
    clinicId: string,
    prescriptionId: string,
    dto: CancelPrescriptionDto,
  ) {
    return this.database.withClinicContext(proof, clinicId, ['clinical.prescriptions.cancel'], async (tx, c) => {
      const rx = await tx.medicationPrescription.findFirst({
        where: { id: prescriptionId, clinicId: c.clinicId },
      });
      if (!rx) throw new NotFoundException('Prescription not found in clinic');

      if (rx.status === 'CANCELLED' || rx.status === 'SUPERSEDED') {
        throw new ConflictException(`Prescription is already in terminal state ${rx.status}`);
      }

      if (dto.expectedVersion !== undefined && rx.version !== dto.expectedVersion) {
        throw new ConflictException(`Version conflict: expected ${dto.expectedVersion}, actual ${rx.version}`);
      }

      const cancelledAt = new Date();
      const updatedRx = await tx.medicationPrescription.update({
        where: { id: rx.id },
        data: {
          status: 'CANCELLED',
          cancelledAt,
          cancellationReason: dto.cancellationReason,
          version: { increment: 1 },
        },
        include: {
          items: { orderBy: { itemOrder: 'asc' } },
          prescriber: { select: { user: { select: { name: true } } } },
          signedBy: { select: { user: { select: { name: true } } } },
        },
      });

      await this.safeAudit(tx, c, 'clinical.prescription.cancel', updatedRx.id, {
        cancellationReason: dto.cancellationReason,
        previousStatus: rx.status,
      });

      return {
        ...updatedRx,
        prescriberName: updatedRx.prescriber.user.name,
        signedByName: updatedRx.signedBy?.user?.name ?? null,
        signedAt: updatedRx.signedAt?.toISOString() ?? null,
        cancelledAt: updatedRx.cancelledAt?.toISOString() ?? null,
        createdAt: updatedRx.createdAt.toISOString(),
        updatedAt: updatedRx.updatedAt.toISOString(),
        items: updatedRx.items.map(it => ({
          ...it,
          createdAt: it.createdAt.toISOString(),
          updatedAt: it.updatedAt.toISOString(),
        })),
      };
    });
  }

  async getPrescription(proof: VerifiedPrincipal, clinicId: string, prescriptionId: string) {
    return this.database.withClinicContext(proof, clinicId, ['clinical.prescriptions.read'], async (tx, c) => {
      const rx = await tx.medicationPrescription.findFirst({
        where: { id: prescriptionId, clinicId: c.clinicId },
        include: {
          items: { orderBy: { itemOrder: 'asc' } },
          prescriber: { select: { user: { select: { name: true } } } },
          signedBy: { select: { user: { select: { name: true } } } },
        },
      });
      if (!rx) throw new NotFoundException('Prescription not found in clinic');

      await this.safeAudit(tx, c, 'clinical.prescription.read', rx.id, { prescriptionNumber: rx.prescriptionNumber });

      return {
        ...rx,
        prescriberName: rx.prescriber.user.name,
        signedByName: rx.signedBy?.user?.name ?? null,
        signedAt: rx.signedAt?.toISOString() ?? null,
        cancelledAt: rx.cancelledAt?.toISOString() ?? null,
        createdAt: rx.createdAt.toISOString(),
        updatedAt: rx.updatedAt.toISOString(),
        items: rx.items.map(it => ({
          ...it,
          createdAt: it.createdAt.toISOString(),
          updatedAt: it.updatedAt.toISOString(),
        })),
      };
    });
  }

  async listPrescriptions(proof: VerifiedPrincipal, clinicId: string, query: PrescriptionListQuery) {
    return this.database.withClinicContext(proof, clinicId, ['clinical.prescriptions.read'], async (tx, c) => {
      const patient = await tx.patient.findFirst({
        where: { id: query.patientId, clinicId: c.clinicId },
        select: { id: true },
      });
      if (!patient) throw new NotFoundException('Patient not found in clinic');

      const rows = await tx.medicationPrescription.findMany({
        where: {
          clinicId: c.clinicId,
          patientId: query.patientId,
          ...(query.encounterId ? { encounterId: query.encounterId } : {}),
          ...(query.status ? { status: query.status } : {}),
        },
        include: {
          items: { orderBy: { itemOrder: 'asc' } },
          prescriber: { select: { user: { select: { name: true } } } },
          signedBy: { select: { user: { select: { name: true } } } },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      });

      await this.safeAudit(tx, c, 'clinical.prescription.list', query.patientId, { count: rows.length });

      return rows.map(rx => ({
        ...rx,
        prescriberName: rx.prescriber.user.name,
        signedByName: rx.signedBy?.user?.name ?? null,
        signedAt: rx.signedAt?.toISOString() ?? null,
        cancelledAt: rx.cancelledAt?.toISOString() ?? null,
        createdAt: rx.createdAt.toISOString(),
        updatedAt: rx.updatedAt.toISOString(),
        items: rx.items.map(it => ({
          ...it,
          createdAt: it.createdAt.toISOString(),
          updatedAt: it.updatedAt.toISOString(),
        })),
      }));
    });
  }

  // =========================================================================
  // 6. CLINICAL SUMMARY VIEW
  // =========================================================================

  async getPatientClinicalSummary(proof: VerifiedPrincipal, clinicId: string, patientId: string) {
    return this.database.withClinicContext(
      proof,
      clinicId,
      [
        'clinical.observations.read',
        'clinical.diagnoses.read',
        'clinical.allergies.read',
        'clinical.medications.read',
        'clinical.prescriptions.read',
      ],
      async (tx, c) => {
        const patient = await tx.patient.findFirst({
          where: { id: patientId, clinicId: c.clinicId },
          select: { id: true, fullName: true, dateOfBirth: true, gender: true },
        });
        if (!patient) throw new NotFoundException('Patient not found in clinic');

        // Recent vital signs (most recent of each type)
        const recentObservations = await tx.clinicalObservation.findMany({
          where: { clinicId: c.clinicId, patientId, status: { not: 'ENTERED_IN_ERROR' } },
          orderBy: { measuredAt: 'desc' },
          take: 20,
        });

        // Active problems
        const activeProblems = await tx.encounterDiagnosis.findMany({
          where: {
            clinicId: c.clinicId,
            patientId,
            isProblem: true,
            problemStatus: 'ACTIVE',
          },
          orderBy: { createdAt: 'desc' },
        });

        // Active allergies
        const allergies = await tx.patientAllergy.findMany({
          where: { clinicId: c.clinicId, patientId, clinicalStatus: 'ACTIVE' },
          orderBy: { recordedAt: 'desc' },
        });

        // Active medications
        const activeMedications = await tx.medicationRecord.findMany({
          where: { clinicId: c.clinicId, patientId, status: 'ACTIVE' },
          orderBy: { createdAt: 'desc' },
        });

        // Recent prescriptions
        const recentPrescriptions = await tx.medicationPrescription.findMany({
          where: { clinicId: c.clinicId, patientId },
          include: { items: true },
          orderBy: { createdAt: 'desc' },
          take: 5,
        });

        await this.safeAudit(tx, c, 'clinical.summary.read', patientId, {
          observationCount: recentObservations.length,
          problemCount: activeProblems.length,
          allergyCount: allergies.length,
          medicationCount: activeMedications.length,
          prescriptionCount: recentPrescriptions.length,
        });

        return {
          patient: {
            id: patient.id,
            name: patient.fullName,
            birthDate: patient.dateOfBirth?.toISOString() ?? null,
            gender: patient.gender,
          },
          recentObservations: recentObservations.map(o => ({
            ...o,
            numericValue: o.numericValue !== null ? Number(o.numericValue) : null,
            measuredAt: o.measuredAt.toISOString(),
            createdAt: o.createdAt.toISOString(),
            updatedAt: o.updatedAt.toISOString(),
          })),
          activeProblems: activeProblems.map(p => ({
            ...p,
            onsetDate: p.onsetDate?.toISOString() ?? null,
            resolutionDate: p.resolutionDate?.toISOString() ?? null,
            createdAt: p.createdAt.toISOString(),
            updatedAt: p.updatedAt.toISOString(),
          })),
          allergies: allergies.map(a => ({
            ...a,
            onsetDate: a.onsetDate?.toISOString() ?? null,
            recordedAt: a.recordedAt.toISOString(),
            verifiedAt: a.verifiedAt?.toISOString() ?? null,
            createdAt: a.createdAt.toISOString(),
            updatedAt: a.updatedAt.toISOString(),
          })),
          activeMedications: activeMedications.map(m => ({
            ...m,
            dosageAmount: m.dosageAmount !== null ? Number(m.dosageAmount) : null,
            startDate: m.startDate?.toISOString() ?? null,
            endDate: m.endDate?.toISOString() ?? null,
            reconciledAt: m.reconciledAt?.toISOString() ?? null,
            createdAt: m.createdAt.toISOString(),
            updatedAt: m.updatedAt.toISOString(),
          })),
          recentPrescriptions: recentPrescriptions.map(rx => ({
            ...rx,
            signedAt: rx.signedAt?.toISOString() ?? null,
            cancelledAt: rx.cancelledAt?.toISOString() ?? null,
            createdAt: rx.createdAt.toISOString(),
            updatedAt: rx.updatedAt.toISOString(),
            items: rx.items.map(it => ({
              ...it,
              createdAt: it.createdAt.toISOString(),
              updatedAt: it.updatedAt.toISOString(),
            })),
          })),
        };
      },
    );
  }

  // =========================================================================
  // AUDIT LOG HELPER
  // =========================================================================

  private safeAudit(
    tx: TenantTransaction,
    c: { clinicId: string; userId: string },
    action: string,
    targetId: string,
    metadata: Record<string, unknown>,
  ) {
    return this.audit.record(
      {
        clinicId: c.clinicId,
        actorId: c.userId,
        action,
        category: 'CLINICAL',
        targetType: 'ClinicalFoundationRecord',
        targetId,
        outcome: 'SUCCESS',
        metadata,
      },
      tx,
    );
  }
}
