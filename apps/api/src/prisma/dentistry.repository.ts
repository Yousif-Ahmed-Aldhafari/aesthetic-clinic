import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import type {
  DentitionType,
  ToothNumberingSystem,
  ToothCondition,
  PeriodontalFurcationGrade,
  ToothMobilityGrade,
  ClinicalPrivilegeCode,
} from '../generated/prisma/client.js';
import { TenantDatabaseService } from './tenant-database.service.js';
import type { VerifiedPrincipal } from './verified-sessions.js';
import { AuditRepository } from './audit.repository.js';
import { SpecialtyRepository } from './specialty.repository.js';
import { audit as financialAudit } from './billing.helpers.js';
import {
  isValidFdiToothNumber,
  validateSurfacesForTooth,
  calculateClinicalAttachmentLevel,
  validatePeriodontalSiteValues,
} from '../dentistry/tooth-numbering.js';
import type {
  CreateDentalOdontogramDto,
  UpdateDentalOdontogramDraftDto,
  AmendDentalOdontogramDto,
  EnterInErrorDentalOdontogramDto,
  RecordToothFindingDto,
  RecordPeriodontalRecordDto,
  CreateDentalTreatmentStageDto,
  CompleteDentalTreatmentStageDto,
  ConsumeDentalStageMaterialsDto,
} from '../dentistry/dentistry.dto.js';

@Injectable()
export class DentistryRepository {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly audit: AuditRepository,
    private readonly specialtyRepo: SpecialtyRepository,
  ) {}

  private async assertPrivilege(
    proof: VerifiedPrincipal,
    clinicId: string,
    membershipId: string,
    privilegeCode: ClinicalPrivilegeCode,
  ) {
    const result = await this.specialtyRepo.evaluatePrivilege(proof, clinicId, {
      practitionerMembershipId: membershipId,
      specialtyCode: 'DENTISTRY',
      privilegeCode,
    });
    if (!result.allowed) {
      throw new ForbiddenException(`Clinician lacks required privilege ${privilegeCode}: ${result.reason}`);
    }
  }

  // =========================================================================
  // 1. DENTAL ODONTOGRAM LIFECYCLE
  // =========================================================================

  async getCurrentOdontogram(proof: VerifiedPrincipal, clinicId: string, patientId: string) {
    return this.database.withClinicContext(proof, clinicId, ['clinical.encounters.read'], async (tx) => {
      const odontogram = await tx.dentalOdontogram.findFirst({
        where: {
          clinicId,
          patientId,
          status: { in: ['FINALIZED', 'DRAFT'] },
        },
        orderBy: [
          { status: 'asc' },
          { version: 'desc' },
          { createdAt: 'desc' },
        ],
        include: {
          findings: true,
          periodontalRecords: {
            orderBy: [{ toothNumberFdi: 'asc' }, { measuredAt: 'desc' }],
          },
          dentist: {
            select: { id: true, user: { select: { id: true, name: true, email: true } } },
          },
        },
      });

      return odontogram;
    });
  }

  async getOdontogramById(proof: VerifiedPrincipal, clinicId: string, odontogramId: string) {
    return this.database.withClinicContext(proof, clinicId, ['clinical.encounters.read'], async (tx) => {
      const odontogram = await tx.dentalOdontogram.findUnique({
        where: { clinicId_id: { clinicId, id: odontogramId } },
        include: {
          findings: {
            include: {
              recordedBy: {
                select: { id: true, user: { select: { id: true, name: true, email: true } } },
              },
            },
            orderBy: { toothNumberFdi: 'asc' },
          },
          periodontalRecords: {
            include: {
              examiner: {
                select: { id: true, user: { select: { id: true, name: true, email: true } } },
              },
            },
            orderBy: { toothNumberFdi: 'asc' },
          },
          treatmentStages: {
            include: {
              service: true,
              plannedDentist: {
                select: { id: true, user: { select: { id: true, name: true, email: true } } },
              },
            },
            orderBy: { stageOrder: 'asc' },
          },
          dentist: {
            select: { id: true, user: { select: { id: true, name: true, email: true } } },
          },
          encounter: {
            select: { id: true, status: true, createdAt: true },
          },
        },
      });

      if (!odontogram) {
        throw new NotFoundException('Dental odontogram not found');
      }

      return odontogram;
    });
  }

  async getPatientOdontograms(proof: VerifiedPrincipal, clinicId: string, patientId: string) {
    return this.database.withClinicContext(proof, clinicId, ['clinical.encounters.read'], async (tx) => {
      return tx.dentalOdontogram.findMany({
        where: { clinicId, patientId },
        orderBy: { version: 'desc' },
        include: {
          dentist: {
            select: { id: true, user: { select: { id: true, name: true, email: true } } },
          },
          _count: {
            select: { findings: true, periodontalRecords: true, treatmentStages: true },
          },
        },
      });
    });
  }

  async createOdontogram(
    proof: VerifiedPrincipal,
    clinicId: string,
    dentistMembershipId: string,
    input: CreateDentalOdontogramDto,
  ) {
    await this.assertPrivilege(proof, clinicId, dentistMembershipId, 'DENTAL_EXAMINATION_RECORD');

    return this.database.withClinicContext(proof, clinicId, ['clinical.encounters.create'], async (tx, ctx) => {
      const encounter = await tx.clinicalEncounter.findUnique({
        where: { clinicId_id: { clinicId, id: input.encounterId } },
      });
      if (!encounter || encounter.patientId !== input.patientId) {
        throw new BadRequestException('Encounter does not match patient or clinic');
      }
      if (encounter.status !== 'IN_PROGRESS') {
        throw new BadRequestException('Dental charts can only be created during an active IN_PROGRESS encounter');
      }

      const existingDraft = await tx.dentalOdontogram.findFirst({
        where: {
          clinicId,
          patientId: input.patientId,
          encounterId: input.encounterId,
          status: 'DRAFT',
        },
      });
      if (existingDraft) {
        throw new ConflictException('A draft odontogram already exists for this clinical encounter');
      }

      const latestChart = await tx.dentalOdontogram.findFirst({
        where: { clinicId, patientId: input.patientId },
        orderBy: { version: 'desc' },
      });
      const nextVersion = (latestChart?.version ?? 0) + 1;

      const created = await tx.dentalOdontogram.create({
        data: {
          clinicId,
          patientId: input.patientId,
          encounterId: input.encounterId,
          version: nextVersion,
          dentistMembershipId,
          dentitionType: (input.dentitionType as DentitionType) ?? 'PERMANENT',
          numberingSystem: (input.numberingSystem as ToothNumberingSystem) ?? 'FDI_ISO_3950',
          status: 'DRAFT',
          chartType: input.chartType ?? 'BASELINE',
          generalOralCondition: input.generalOralCondition,
          softTissueExamination: input.softTissueExamination,
          occlusionClassification: input.occlusionClassification,
          temporomandibularJoint: input.temporomandibularJoint,
          notes: input.notes,
        },
      });

      await this.audit.record({
        clinicId,
        actorId: ctx.userId,
        category: 'CLINICAL',
        action: 'dentistry.odontogram.create',
        targetType: 'DentalOdontogram',
        targetId: created.id,
        outcome: 'SUCCESS',
        metadata: { patientId: input.patientId, encounterId: input.encounterId },
      }, tx);

      return created;
    });
  }

  async updateOdontogramDraft(
    proof: VerifiedPrincipal,
    clinicId: string,
    odontogramId: string,
    _dentistMembershipId: string,
    input: UpdateDentalOdontogramDraftDto,
  ) {
    return this.database.withClinicContext(proof, clinicId, ['clinical.encounters.update'], async (tx) => {
      const existing = await tx.dentalOdontogram.findUnique({
        where: { clinicId_id: { clinicId, id: odontogramId } },
      });
      if (!existing) throw new NotFoundException('Odontogram not found');
      if (existing.status !== 'DRAFT') {
        throw new ConflictException('Cannot edit a non-draft dental odontogram');
      }
      if (existing.version !== input.expectedVersion) {
        throw new ConflictException('Concurrent modification conflict on dental odontogram');
      }

      return tx.dentalOdontogram.update({
        where: { clinicId_id: { clinicId, id: odontogramId } },
        data: {
          ...(input.dentitionType ? { dentitionType: input.dentitionType as DentitionType } : {}),
          ...(input.numberingSystem ? { numberingSystem: input.numberingSystem as ToothNumberingSystem } : {}),
          ...(input.generalOralCondition !== undefined ? { generalOralCondition: input.generalOralCondition } : {}),
          ...(input.softTissueExamination !== undefined ? { softTissueExamination: input.softTissueExamination } : {}),
          ...(input.occlusionClassification !== undefined ? { occlusionClassification: input.occlusionClassification } : {}),
          ...(input.temporomandibularJoint !== undefined ? { temporomandibularJoint: input.temporomandibularJoint } : {}),
          ...(input.notes !== undefined ? { notes: input.notes } : {}),
          version: { increment: 1 },
        },
      });
    });
  }

  async finalizeOdontogram(
    proof: VerifiedPrincipal,
    clinicId: string,
    odontogramId: string,
    dentistMembershipId: string,
    expectedVersion: number,
  ) {
    await this.assertPrivilege(proof, clinicId, dentistMembershipId, 'DENTAL_EXAMINATION_RECORD');

    return this.database.withClinicContext(proof, clinicId, ['clinical.encounters.update'], async (tx, ctx) => {
      const existing = await tx.dentalOdontogram.findUnique({
        where: { clinicId_id: { clinicId, id: odontogramId } },
        include: {
          findings: {
            orderBy: [{ toothNumberFdi: 'asc' }],
          },
          periodontalRecords: {
            orderBy: { toothNumberFdi: 'asc' },
          },
        },
      });
      if (!existing) throw new NotFoundException('Odontogram not found');
      if (existing.status !== 'DRAFT') {
        throw new ConflictException(`Cannot finalize an odontogram with status ${existing.status}`);
      }
      if (existing.version !== expectedVersion) {
        throw new ConflictException('Concurrent modification conflict on dental odontogram');
      }

      const canonicalRepresentation = JSON.stringify({
        odontogramId: existing.id,
        patientId: existing.patientId,
        encounterId: existing.encounterId,
        dentitionType: existing.dentitionType,
        findings: existing.findings.map(f => ({
          toothNumberFdi: f.toothNumberFdi,
          surfacesAffected: f.surfacesAffected,
          condition: f.condition,
          severity: f.severity,
          isSupernumerary: f.isSupernumerary,
        })),
        periodontal: existing.periodontalRecords.map(p => ({
          toothNumberFdi: p.toothNumberFdi,
          probingDepthsMm: p.probingDepthsMm,
          gingivalMarginMm: p.gingivalMarginMm,
          clinicalAttachmentMm: p.clinicalAttachmentMm,
          bleedingOnProbing: p.bleedingOnProbing,
          suppuration: p.suppuration,
          furcationGrade: p.furcationGrade,
          mobilityGrade: p.mobilityGrade,
        })),
      });

      const contentDigest = createHash('sha256').update(canonicalRepresentation, 'utf8').digest('hex');

      const finalized = await tx.dentalOdontogram.update({
        where: { clinicId_id: { clinicId, id: odontogramId } },
        data: {
          status: 'FINALIZED',
          finalizedAt: new Date(),
          finalizedByMembershipId: dentistMembershipId,
          contentDigest,
          version: { increment: 1 },
        },
        include: {
          findings: true,
          periodontalRecords: true,
        },
      });

      await this.audit.record({
        clinicId,
        actorId: ctx.userId,
        category: 'CLINICAL',
        action: 'dentistry.odontogram.finalize',
        targetType: 'DentalOdontogram',
        targetId: finalized.id,
        outcome: 'SUCCESS',
        metadata: { digest: contentDigest, findingsCount: existing.findings.length },
      }, tx);

      return finalized;
    });
  }

  async amendOdontogram(
    proof: VerifiedPrincipal,
    clinicId: string,
    odontogramId: string,
    dentistMembershipId: string,
    input: AmendDentalOdontogramDto,
  ) {
    await this.assertPrivilege(proof, clinicId, dentistMembershipId, 'DENTAL_EXAMINATION_RECORD');

    return this.database.withClinicContext(proof, clinicId, ['clinical.encounters.update'], async (tx, ctx) => {
      const prior = await tx.dentalOdontogram.findUnique({
        where: { clinicId_id: { clinicId, id: odontogramId } },
        include: { findings: true, periodontalRecords: true },
      });
      if (!prior) throw new NotFoundException('Odontogram not found');
      if (prior.status !== 'FINALIZED') {
        throw new BadRequestException('Only finalized odontograms can be amended');
      }

      // Check active encounter
      const encounter = await tx.clinicalEncounter.findUnique({
        where: { clinicId_id: { clinicId, id: prior.encounterId } },
      });
      if (!encounter || encounter.patientId !== prior.patientId) {
        throw new BadRequestException('Encounter does not match patient');
      }

      // 1. Create amended draft chart with incremented version
      const amendment = await tx.dentalOdontogram.create({
        data: {
          clinicId,
          patientId: prior.patientId,
          encounterId: prior.encounterId,
          version: prior.version + 1,
          dentistMembershipId,
          dentitionType: prior.dentitionType,
          numberingSystem: prior.numberingSystem,
          status: 'DRAFT',
          chartType: 'AMENDMENT',
          generalOralCondition: prior.generalOralCondition,
          softTissueExamination: prior.softTissueExamination,
          occlusionClassification: prior.occlusionClassification,
          temporomandibularJoint: prior.temporomandibularJoint,
          notes: input.notes ?? input.amendmentReason,
          supersededById: null,
          amendmentReason: input.amendmentReason,
        },
      });

      // 2. Mark prior chart as SUPERSEDED and link to amendment in a single update
      await tx.dentalOdontogram.update({
        where: { clinicId_id: { clinicId, id: odontogramId } },
        data: {
          status: 'SUPERSEDED',
          supersededById: amendment.id,
          version: { increment: 1 },
        },
      });

      // 3. Clone active findings into amendment
      for (const f of prior.findings) {
        await tx.dentalToothFinding.create({
          data: {
            clinicId,
            odontogramId: amendment.id,
            patientId: prior.patientId,
            toothNumberFdi: f.toothNumberFdi,
            isSupernumerary: f.isSupernumerary,
            supernumeraryIdentifier: f.supernumeraryIdentifier,
            isDeciduous: f.isDeciduous,
            condition: f.condition,
            surfacesAffected: f.surfacesAffected,
            existingWork: f.existingWork,
            diagnosisCodeIcd10: f.diagnosisCodeIcd10,
            clinicalDescription: f.clinicalDescription,
            severity: f.severity,
            recordedByMembershipId: dentistMembershipId,
          },
        });
      }

      // 4. Clone periodontal records into amendment
      for (const p of prior.periodontalRecords) {
        await tx.dentalPeriodontalRecord.create({
          data: {
            clinicId,
            odontogramId: amendment.id,
            patientId: prior.patientId,
            toothNumberFdi: p.toothNumberFdi,
            probingDepthsMm: p.probingDepthsMm,
            gingivalMarginMm: p.gingivalMarginMm,
            clinicalAttachmentMm: p.clinicalAttachmentMm,
            bleedingOnProbing: p.bleedingOnProbing,
            suppuration: p.suppuration,
            furcationGrade: p.furcationGrade,
            mobilityGrade: p.mobilityGrade,
            plaquePresent: p.plaquePresent,
            notes: p.notes,
            measuredAt: new Date(),
            examinerMembershipId: dentistMembershipId,
          },
        });
      }

      await this.audit.record({
        clinicId,
        actorId: ctx.userId,
        category: 'CLINICAL',
        action: 'dentistry.odontogram.amend',
        targetType: 'DentalOdontogram',
        targetId: amendment.id,
        outcome: 'SUCCESS',
        metadata: { supersededOdontogramId: prior.id, reason: input.amendmentReason },
      }, tx);

      return amendment;
    });
  }

  async enterInErrorOdontogram(
    proof: VerifiedPrincipal,
    clinicId: string,
    odontogramId: string,
    _dentistMembershipId: string,
    input: EnterInErrorDentalOdontogramDto,
  ) {
    return this.database.withClinicContext(proof, clinicId, ['clinical.encounters.update'], async (tx, ctx) => {
      const existing = await tx.dentalOdontogram.findUnique({
        where: { clinicId_id: { clinicId, id: odontogramId } },
      });
      if (!existing) throw new NotFoundException('Odontogram not found');
      if (existing.status !== 'FINALIZED') {
        throw new BadRequestException('Only finalized odontograms can be marked as entered in error');
      }
      if (existing.version !== input.expectedVersion) {
        throw new ConflictException('Concurrent modification conflict on dental odontogram');
      }

      const updated = await tx.dentalOdontogram.update({
        where: { clinicId_id: { clinicId, id: odontogramId } },
        data: {
          status: 'ENTERED_IN_ERROR',
          enteredInErrorReason: input.enteredInErrorReason,
          version: { increment: 1 },
        },
      });

      await this.audit.record({
        clinicId,
        actorId: ctx.userId,
        category: 'CLINICAL',
        action: 'dentistry.odontogram.enter_in_error',
        targetType: 'DentalOdontogram',
        targetId: updated.id,
        outcome: 'SUCCESS',
        metadata: { reason: input.enteredInErrorReason },
      }, tx);

      return updated;
    });
  }

  // =========================================================================
  // 2. TOOTH FINDINGS
  // =========================================================================

  async upsertToothFindings(
    proof: VerifiedPrincipal,
    clinicId: string,
    odontogramId: string,
    dentistMembershipId: string,
    findings: RecordToothFindingDto[],
  ) {
    for (const f of findings) {
      if (!isValidFdiToothNumber(f.toothNumberFdi)) {
        throw new BadRequestException(`Invalid FDI tooth number: ${f.toothNumberFdi}`);
      }
      if (f.surfacesAffected && f.surfacesAffected.length > 0) {
        const val = validateSurfacesForTooth(f.toothNumberFdi, f.surfacesAffected);
        if (!val.valid) {
          throw new BadRequestException(`Surface validation error for tooth ${f.toothNumberFdi}: ${val.reason}`);
        }
      }
    }

    return this.database.withClinicContext(proof, clinicId, ['clinical.encounters.update'], async (tx) => {
      const odontogram = await tx.dentalOdontogram.findUnique({
        where: { clinicId_id: { clinicId, id: odontogramId } },
      });
      if (!odontogram) throw new NotFoundException('Odontogram not found');
      if (odontogram.status !== 'DRAFT') {
        throw new BadRequestException('Tooth findings can only be recorded on draft odontograms');
      }

      const results = [];
      for (const f of findings) {
        const existing = await tx.dentalToothFinding.findFirst({
          where: {
            clinicId,
            odontogramId,
            toothNumberFdi: f.toothNumberFdi,
            isSupernumerary: f.isSupernumerary ?? false,
            supernumeraryIdentifier: f.supernumeraryIdentifier ?? null,
          },
        });

        if (existing) {
          const updated = await tx.dentalToothFinding.update({
            where: { clinicId_id: { clinicId, id: existing.id } },
            data: {
              condition: f.condition as ToothCondition,
              surfacesAffected: f.surfacesAffected ?? [],
              existingWork: f.existingWork ?? null,
              diagnosisCodeIcd10: f.diagnosisCodeIcd10 ?? null,
              clinicalDescription: f.clinicalDescription ?? null,
              severity: f.severity ?? null,
              recordedByMembershipId: dentistMembershipId,
              version: { increment: 1 },
            },
          });
          results.push(updated);
        } else {
          const created = await tx.dentalToothFinding.create({
            data: {
              clinicId,
              odontogramId,
              patientId: odontogram.patientId,
              toothNumberFdi: f.toothNumberFdi,
              isSupernumerary: f.isSupernumerary ?? false,
              supernumeraryIdentifier: f.supernumeraryIdentifier ?? null,
              isDeciduous: f.isDeciduous ?? false,
              condition: f.condition as ToothCondition,
              surfacesAffected: f.surfacesAffected ?? [],
              existingWork: f.existingWork ?? null,
              diagnosisCodeIcd10: f.diagnosisCodeIcd10 ?? null,
              clinicalDescription: f.clinicalDescription ?? null,
              severity: f.severity ?? null,
              recordedByMembershipId: dentistMembershipId,
            },
          });
          results.push(created);
        }
      }

      return results;
    });
  }

  async deleteToothFinding(
    proof: VerifiedPrincipal,
    clinicId: string,
    odontogramId: string,
    findingId: string,
  ) {
    return this.database.withClinicContext(proof, clinicId, ['clinical.encounters.update'], async (tx) => {
      const odontogram = await tx.dentalOdontogram.findUnique({
        where: { clinicId_id: { clinicId, id: odontogramId } },
      });
      if (!odontogram) throw new NotFoundException('Odontogram not found');
      if (odontogram.status !== 'DRAFT') {
        throw new BadRequestException('Findings can only be deleted from draft odontograms');
      }

      const finding = await tx.dentalToothFinding.findUnique({
        where: { clinicId_id: { clinicId, id: findingId } },
      });
      if (!finding || finding.odontogramId !== odontogramId) {
        throw new NotFoundException('Tooth finding not found');
      }

      await tx.dentalToothFinding.delete({
        where: { clinicId_id: { clinicId, id: findingId } },
      });

      return { success: true };
    });
  }

  // =========================================================================
  // 3. PERIODONTAL EXAMINATION
  // =========================================================================

  async recordPeriodontalRecord(
    proof: VerifiedPrincipal,
    clinicId: string,
    odontogramId: string,
    examinerMembershipId: string,
    input: RecordPeriodontalRecordDto,
  ) {
    if (!isValidFdiToothNumber(input.toothNumberFdi)) {
      throw new BadRequestException(`Invalid FDI tooth number: ${input.toothNumberFdi}`);
    }

    if (!input.probingDepthsMm || input.probingDepthsMm.length !== 6) {
      throw new BadRequestException('Probing depths must contain exactly 6 measurement sites');
    }
    if (!input.gingivalMarginMm || input.gingivalMarginMm.length !== 6) {
      throw new BadRequestException('Gingival margins must contain exactly 6 measurement sites');
    }
    if (!input.bleedingOnProbing || input.bleedingOnProbing.length !== 6) {
      throw new BadRequestException('Bleeding on probing must contain exactly 6 sites');
    }
    if (!input.suppuration || input.suppuration.length !== 6) {
      throw new BadRequestException('Suppuration must contain exactly 6 sites');
    }

    // Validate each of the 6 sites
    for (let i = 0; i < 6; i++) {
      const val = validatePeriodontalSiteValues({
        probingDepthMm: input.probingDepthsMm[i],
        gingivalMarginMm: input.gingivalMarginMm[i],
      });
      if (!val.valid) {
        throw new BadRequestException(`Site ${i + 1} periodontal measurement invalid: ${val.reason}`);
      }
    }

    // Calculate Clinical Attachment Level (CAL = PD + GM)
    const clinicalAttachmentMm = input.probingDepthsMm.map((pd, i) =>
      calculateClinicalAttachmentLevel(pd, input.gingivalMarginMm[i]),
    );

    return this.database.withClinicContext(proof, clinicId, ['clinical.encounters.update'], async (tx) => {
      const odontogram = await tx.dentalOdontogram.findUnique({
        where: { clinicId_id: { clinicId, id: odontogramId } },
      });
      if (!odontogram) throw new NotFoundException('Odontogram not found');
      if (odontogram.status !== 'DRAFT') {
        throw new BadRequestException('Periodontal records can only be recorded on draft odontograms');
      }

      const existing = await tx.dentalPeriodontalRecord.findFirst({
        where: {
          clinicId,
          odontogramId,
          toothNumberFdi: input.toothNumberFdi,
        },
      });

      const data = {
        probingDepthsMm: input.probingDepthsMm,
        gingivalMarginMm: input.gingivalMarginMm,
        clinicalAttachmentMm,
        bleedingOnProbing: input.bleedingOnProbing,
        suppuration: input.suppuration,
        furcationGrade: (input.furcationGrade as PeriodontalFurcationGrade) ?? 'CLASS_0',
        mobilityGrade: (input.mobilityGrade as ToothMobilityGrade) ?? 'GRADE_0',
        plaquePresent: input.plaquePresent ?? false,
        notes: input.notes ?? null,
        measuredAt: new Date(),
        examinerMembershipId,
      };

      if (existing) {
        return tx.dentalPeriodontalRecord.update({
          where: { clinicId_id: { clinicId, id: existing.id } },
          data: {
            ...data,
            version: { increment: 1 },
          },
        });
      }

      return tx.dentalPeriodontalRecord.create({
        data: {
          clinicId,
          odontogramId,
          patientId: odontogram.patientId,
          toothNumberFdi: input.toothNumberFdi,
          ...data,
        },
      });
    });
  }

  async getPeriodontalComparison(
    proof: VerifiedPrincipal,
    clinicId: string,
    patientId: string,
    toothNumberFdi?: number,
  ) {
    return this.database.withClinicContext(proof, clinicId, ['clinical.encounters.read'], async (tx) => {
      return tx.dentalPeriodontalRecord.findMany({
        where: {
          clinicId,
          patientId,
          ...(toothNumberFdi ? { toothNumberFdi } : {}),
        },
        orderBy: [{ toothNumberFdi: 'asc' }, { measuredAt: 'desc' }],
        include: {
          odontogram: {
            select: { id: true, version: true, status: true, chartType: true, createdAt: true },
          },
          examiner: {
            select: { id: true, user: { select: { id: true, name: true, email: true } } },
          },
        },
      });
    });
  }

  // =========================================================================
  // 4. DENTAL TREATMENT STAGING
  // =========================================================================

  async createTreatmentStage(
    proof: VerifiedPrincipal,
    clinicId: string,
    plannerMembershipId: string,
    input: CreateDentalTreatmentStageDto & { odontogramId: string; patientId: string; encounterId: string },
  ) {
    await this.assertPrivilege(proof, clinicId, plannerMembershipId, 'DENTAL_PROCEDURE_PLAN');

    if (input.toothNumberFdi && !isValidFdiToothNumber(input.toothNumberFdi)) {
      throw new BadRequestException(`Invalid FDI tooth number: ${input.toothNumberFdi}`);
    }

    return this.database.withClinicContext(proof, clinicId, ['clinical.treatment-plans.create'], async (tx) => {
      const service = await tx.generalClinicalService.findUnique({
        where: { clinicId_id: { clinicId, id: input.serviceId } },
      });
      if (!service || !service.isActive) {
        throw new NotFoundException('General clinical service not found or inactive');
      }

      return tx.dentalTreatmentStage.create({
        data: {
          clinicId,
          odontogramId: input.odontogramId,
          patientId: input.patientId,
          encounterId: input.encounterId,
          serviceId: input.serviceId,
          toothNumberFdi: input.toothNumberFdi ?? null,
          surfaces: input.surfaces ?? [],
          stageOrder: input.stageOrder ?? 1,
          status: 'PROPOSED',
          clinicalIndication: input.clinicalIndication,
          estimatedDurationMinutes: input.estimatedDurationMinutes ?? 30,
          estimatedCost: input.estimatedCost,
          plannedDentistMembershipId: plannerMembershipId,
          consentTemplateId: input.consentTemplateId ?? null,
        },
        include: {
          service: true,
          plannedDentist: {
            select: { id: true, user: { select: { id: true, name: true, email: true } } },
          },
        },
      });
    });
  }

  async approveTreatmentStage(
    proof: VerifiedPrincipal,
    clinicId: string,
    stageId: string,
    approverMembershipId: string,
    expectedVersion: number,
  ) {
    await this.assertPrivilege(proof, clinicId, approverMembershipId, 'DENTAL_PROCEDURE_APPROVE');

    return this.database.withClinicContext(proof, clinicId, ['clinical.treatment-plans.approve'], async (tx) => {
      const stage = await tx.dentalTreatmentStage.findUnique({
        where: { clinicId_id: { clinicId, id: stageId } },
      });
      if (!stage) throw new NotFoundException('Treatment stage not found');
      if (stage.status !== 'PROPOSED' && stage.status !== 'DRAFT') {
        throw new BadRequestException(`Cannot approve treatment stage with status ${stage.status}`);
      }
      if (stage.version !== expectedVersion) {
        throw new ConflictException('Concurrent modification conflict on dental treatment stage');
      }

      return tx.dentalTreatmentStage.update({
        where: { clinicId_id: { clinicId, id: stageId } },
        data: {
          status: 'APPROVED',
          approvedByMembershipId: approverMembershipId,
          approvedAt: new Date(),
          version: { increment: 1 },
        },
        include: { service: true },
      });
    });
  }

  async completeTreatmentStage(
    proof: VerifiedPrincipal,
    clinicId: string,
    stageId: string,
    completerMembershipId: string,
    input: CompleteDentalTreatmentStageDto,
  ) {
    await this.assertPrivilege(proof, clinicId, completerMembershipId, 'DENTAL_PROCEDURE_PERFORM');

    return this.database.withClinicContext(proof, clinicId, ['clinical.procedures.perform'], async (tx, ctx) => {
      const stage = await tx.dentalTreatmentStage.findUnique({
        where: { clinicId_id: { clinicId, id: stageId } },
      });
      if (!stage) throw new NotFoundException('Treatment stage not found');
      if (!['APPROVED', 'IN_PROGRESS'].includes(stage.status)) {
        throw new BadRequestException(`Cannot complete treatment stage with status ${stage.status}`);
      }
      if (stage.version !== input.expectedVersion) {
        throw new ConflictException('Concurrent modification conflict on dental treatment stage');
      }

      // Check Consent requirement
      if (stage.consentTemplateId) {
        let consentFound = false;

        if (input.patientConsentId) {
          const consent = await tx.patientConsent.findUnique({
            where: { clinicId_id: { clinicId, id: input.patientConsentId } },
          });
          if (consent && consent.patientId === stage.patientId && consent.status === 'ACTIVE') {
            consentFound = true;
          }
        } else {
          const consent = await tx.patientConsent.findFirst({
            where: {
              clinicId,
              patientId: stage.patientId,
              ...(stage.consentTemplateId ? { templateVersion: { templateId: stage.consentTemplateId } } : {}),
              status: 'ACTIVE',
            },
          });
          if (consent) {
            consentFound = true;
          }
        }

        if (!consentFound) {
          throw new ForbiddenException('Procedure cannot be completed without active patient informed consent');
        }
      }

      const completed = await tx.dentalTreatmentStage.update({
        where: { clinicId_id: { clinicId, id: stageId } },
        data: {
          status: 'COMPLETED',
          completedByMembershipId: completerMembershipId,
          completedAt: new Date(),
          patientConsentId: input.patientConsentId ?? stage.patientConsentId,
          completionNotes: input.completionNotes ?? null,
          version: { increment: 1 },
        },
        include: { service: true },
      });

      await this.audit.record({
        clinicId,
        actorId: ctx.userId,
        category: 'CLINICAL',
        action: 'dentistry.treatment_stage.complete',
        targetType: 'DentalTreatmentStage',
        targetId: completed.id,
        outcome: 'SUCCESS',
        metadata: { serviceId: stage.serviceId, tooth: stage.toothNumberFdi },
      }, tx);

      return completed;
    });
  }

  async cancelTreatmentStage(
    proof: VerifiedPrincipal,
    clinicId: string,
    stageId: string,
    _cancellerMembershipId: string,
    cancellationReason: string,
    expectedVersion: number,
  ) {
    return this.database.withClinicContext(proof, clinicId, ['clinical.treatment-plans.update'], async (tx) => {
      const stage = await tx.dentalTreatmentStage.findUnique({
        where: { clinicId_id: { clinicId, id: stageId } },
      });
      if (!stage) throw new NotFoundException('Treatment stage not found');
      if (['COMPLETED', 'CANCELLED', 'SUPERSEDED'].includes(stage.status)) {
        throw new BadRequestException(`Cannot cancel treatment stage in terminal status ${stage.status}`);
      }
      if (stage.version !== expectedVersion) {
        throw new ConflictException('Concurrent modification conflict on dental treatment stage');
      }

      const cancelled = await tx.dentalTreatmentStage.update({
        where: { clinicId_id: { clinicId, id: stageId } },
        data: {
          status: 'CANCELLED',
          cancellationReason,
          cancelledAt: new Date(),
          version: { increment: 1 },
        },
      });

      return cancelled;
    });
  }

  // =========================================================================
  // 5. BILLING & INVENTORY INTEGRATION
  // =========================================================================

  async billTreatmentStage(
    proof: VerifiedPrincipal,
    clinicId: string,
    stageId: string,
    _actorMembershipId: string,
    existingInvoiceId?: string,
  ) {
    return this.database.withClinicContext(proof, clinicId, ['invoices.create'], async (tx, ctx) => {
      // Concurrency protection on clinic invoice counter
      await tx.clinicInvoiceCounter.upsert({
        where: { clinicId: ctx.clinicId },
        create: { clinicId: ctx.clinicId },
        update: { revision: { increment: 1 } },
        select: { clinicId: true },
      });

      const stage = await tx.dentalTreatmentStage.findUnique({
        where: { clinicId_id: { clinicId, id: stageId } },
        include: { service: true, encounter: true },
      });
      if (!stage) throw new NotFoundException('Treatment stage not found');
      if (stage.status !== 'COMPLETED') {
        throw new BadRequestException('Only completed dental treatment stages can be billed');
      }
      if (stage.invoiceLineId) {
        throw new ConflictException('Dental treatment stage has already been billed');
      }

      const unitPriceMinor = stage.service?.basePriceMinor && stage.service.basePriceMinor > 0n
        ? stage.service.basePriceMinor
        : BigInt(Math.round(Number(stage.estimatedCost) * 100));

      const taxBasisPoints = 1500; // 15% VAT
      const taxMinor = (unitPriceMinor * BigInt(taxBasisPoints)) / 10000n;
      const totalMinor = unitPriceMinor + taxMinor;

      let invoiceId = existingInvoiceId;
      let isNewInvoice = false;
      let targetInvoiceVersion = 1;

      if (!invoiceId) {
        const activeInvoice = await tx.invoice.findFirst({
          where: {
            clinicId,
            patientId: stage.patientId,
            status: 'DRAFT',
          },
          orderBy: { createdAt: 'desc' },
        });

        if (activeInvoice) {
          invoiceId = activeInvoice.id;
        } else {
          isNewInvoice = true;
          const clinic = await tx.clinic.findFirstOrThrow({
            where: { id: clinicId },
            select: { currency: true },
          });
          const patient = await tx.patient.findFirstOrThrow({
            where: { clinicId, id: stage.patientId },
            select: { fullName: true, patientNumber: true },
          });
          const mainBranch = await tx.clinicBranch.findFirst({
            where: { clinicId, code: 'MAIN' },
            select: { id: true },
          });
          const reqKey = randomUUID();
          const reqHash = createHash('sha256').update(reqKey).digest('hex');

          const createdInvoice = await tx.invoice.create({
            data: {
              clinicId,
              branchId: mainBranch?.id ?? null,
              patientId: stage.patientId,
              visitId: stage.encounter?.visitId ?? null,
              currency: clinic.currency,
              currencyScale: 2,
              status: 'DRAFT',
              patientName: patient.fullName,
              patientNumber: patient.patientNumber,
              requestKey: reqKey,
              requestHash: reqHash,
              subtotalMinor: unitPriceMinor,
              discountMinor: 0n,
              taxMinor,
              totalMinor,
              netPaidMinor: 0n,
              version: 1,
            },
          });
          invoiceId = createdInvoice.id;
          targetInvoiceVersion = createdInvoice.version;
        }
      }

      const lineCount = isNewInvoice
        ? 0
        : await tx.invoiceLine.count({
            where: { clinicId, invoiceId },
          });

      const invoiceLine = await tx.invoiceLine.create({
        data: {
          clinicId,
          invoiceId,
          position: lineCount + 1,
          serviceName: stage.service?.nameAr ?? `إجراء أسنان مرحلة ${stage.stageOrder}`,
          description: `إجراء أسنان: السن ${stage.toothNumberFdi ?? 'عام'} - ${stage.clinicalIndication}`,
          quantityMilli: 1000,
          unitPriceMinor,
          grossMinor: unitPriceMinor,
          discountMinor: 0n,
          taxBasisPoints,
          taxMinor,
          totalMinor,
        },
      });

      if (!isNewInvoice) {
        const updatedInvoice = await tx.invoice.update({
          where: { clinicId_id: { clinicId, id: invoiceId } },
          data: {
            subtotalMinor: { increment: unitPriceMinor },
            taxMinor: { increment: taxMinor },
            totalMinor: { increment: totalMinor },
            version: { increment: 1 },
          },
        });
        targetInvoiceVersion = updatedInvoice.version;
      }

      // Record FinancialAuditEvent as enforced by PostgreSQL integrity trigger
      await financialAudit(
        tx,
        ctx,
        isNewInvoice ? 'DRAFT_CREATED' : 'DRAFT_EDITED',
        invoiceId,
        targetInvoiceVersion,
        {
          totalMinor: totalMinor.toString(),
          dentalStageId: stageId,
        },
      );

      const updatedStage = await tx.dentalTreatmentStage.update({
        where: { clinicId_id: { clinicId, id: stageId } },
        data: {
          invoiceLineId: invoiceLine.id,
          version: { increment: 1 },
        },
      });

      return { stage: updatedStage, invoiceLine, invoiceId };
    });
  }

  async consumeStageMaterials(
    proof: VerifiedPrincipal,
    clinicId: string,
    stageId: string,
    actorMembershipId: string,
    input: ConsumeDentalStageMaterialsDto,
  ) {
    return this.database.withClinicContext(proof, clinicId, ['clinical.inventory-consumption.record'], async (tx) => {
      const stage = await tx.dentalTreatmentStage.findUnique({
        where: { clinicId_id: { clinicId, id: stageId } },
      });
      if (!stage) throw new NotFoundException('Treatment stage not found');
      if (stage.status !== 'COMPLETED') {
        throw new BadRequestException('Materials can only be consumed for completed dental procedures');
      }

      const batch = await tx.inventoryBatch.findUnique({
        where: { clinicId_id: { clinicId, id: input.batchId } },
        include: { product: true },
      });
      if (!batch || batch.productId !== input.productId) {
        throw new NotFoundException('Inventory batch not found for product');
      }
      if (batch.status !== 'AVAILABLE') {
        throw new BadRequestException('Inventory batch is not available');
      }

      const batchBalance = await tx.inventoryBatchBalance.findUnique({
        where: {
          clinicId_locationId_batchId: {
            clinicId,
            locationId: input.locationId,
            batchId: input.batchId,
          },
        },
      });

      const requiredQty = input.quantity + (input.wasteQuantity ?? 0);
      if (!batchBalance || Number(batchBalance.onHandQuantity) < requiredQty) {
        throw new BadRequestException('Insufficient inventory batch balance at specified location');
      }

      const balance = await tx.inventoryBalance.findUnique({
        where: {
          clinicId_productId_locationId: {
            clinicId,
            productId: input.productId,
            locationId: input.locationId,
          },
        },
      });
      if (!balance || Number(balance.onHandQuantity) < requiredQty) {
        throw new BadRequestException('Insufficient inventory stock balance at specified location');
      }

      if (batch.expirationDate && batch.expirationDate < new Date()) {
        throw new BadRequestException('Cannot dispense expired inventory batch');
      }

      const newBal = Number(balance.onHandQuantity) - requiredQty;
      const newBatchBal = Number(batchBalance.onHandQuantity) - requiredQty;

      // 1. Create Stock Movement (ISSUE)
      const movement = await tx.inventoryStockMovement.create({
        data: {
          clinicId,
          productId: input.productId,
          locationId: input.locationId,
          batchId: batch.id,
          movementType: 'ISSUE',
          quantity: -requiredQty,
          balanceAfter: newBal,
          reasonCode: 'CLINICAL_USE',
          reasonExplanation: `Dental procedure stage consumption: ${stage.id}`,
          actorMembershipId,
          idempotencyKey: input.idempotencyKey ? `${input.idempotencyKey}:mov` : null,
        },
      });

      // 2. Decrement Batch Balance
      await tx.inventoryBatchBalance.update({
        where: { id: batchBalance.id },
        data: {
          onHandQuantity: newBatchBal,
          version: { increment: 1 },
        },
      });

      // 3. Decrement Product Balance
      await tx.inventoryBalance.update({
        where: { id: balance.id },
        data: {
          onHandQuantity: newBal,
          lastMovementId: movement.id,
          version: { increment: 1 },
        },
      });

      // 4. Update stage version
      await tx.dentalTreatmentStage.update({
        where: { clinicId_id: { clinicId, id: stageId } },
        data: { version: { increment: 1 } },
      });

      return { movement };
    });
  }
}
