import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import type { VerifiedPrincipal } from './verified-sessions.js';
import { TenantDatabaseService } from './tenant-database.service.js';
import { AuditRepository } from './audit.repository.js';
import type {
  AmendFollowUpAssessmentDto,
  CompleteFollowUpAssessmentDto,
  RecordAdverseEventDto,
  RecordTreatmentOutcomeDto,
  ScheduleFollowUpDto,
  UpdateAdverseEventDto,
  UpdateFollowUpStatusDto,
} from '../clinical-followups/followup-input.js';
import {
  OutcomeMeasurementScaleEnum,
} from '../clinical-followups/followup-input.js';

const clean = <T extends Record<string, unknown>>(record: T): T =>
  Object.fromEntries(Object.entries(record).filter(([, v]) => v !== undefined)) as T;

@Injectable()
export class ClinicalFollowUpRepository {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly audit: AuditRepository,
  ) {}

  /**
   * Schedules a clinical follow-up appointment/monitoring checkpoint under doctor supervision.
   */
  async scheduleFollowUp(proof: VerifiedPrincipal, clinicId: string, input: ScheduleFollowUpDto) {
    return this.database.withClinicContext(proof, clinicId, ['clinical.follow-ups.schedule'], async (tx, c) => {
      const patient = await tx.patient.findFirst({
        where: { id: input.patientId, clinicId: c.clinicId, status: 'ACTIVE' },
      });
      if (!patient) throw new NotFoundException('Patient not found or inactive');

      const doctor = await tx.clinicMembership.findFirst({
        where: { id: input.treatingDoctorMembershipId, clinicId: c.clinicId, status: 'ACTIVE' },
      });
      if (!doctor) throw new NotFoundException('Treating doctor not found in this clinic');

      if (input.encounterId) {
        const encounter = await tx.clinicalEncounter.findFirst({
          where: { id: input.encounterId, clinicId: c.clinicId, patientId: input.patientId },
        });
        if (!encounter) throw new NotFoundException('Clinical encounter not found for this patient');
      }

      if (input.treatmentPlanId) {
        const plan = await tx.treatmentPlan.findFirst({
          where: { id: input.treatmentPlanId, clinicId: c.clinicId, patientId: input.patientId },
        });
        if (!plan) throw new NotFoundException('Treatment plan not found for this patient');
      }

      if (input.procedureExecutionId) {
        const proc = await tx.procedureExecution.findFirst({
          where: { id: input.procedureExecutionId, clinicId: c.clinicId, patientId: input.patientId },
        });
        if (!proc) throw new NotFoundException('Procedure execution not found for this patient');
      }

      if (input.appointmentId) {
        const appt = await tx.appointment.findFirst({
          where: { id: input.appointmentId, clinicId: c.clinicId, patientId: input.patientId },
        });
        if (!appt) throw new NotFoundException('Appointment not found for this patient');
      }

      const scheduledDate = new Date(input.scheduledDate);
      if (isNaN(scheduledDate.getTime())) {
        throw new BadRequestException('Invalid scheduled date');
      }

      const followUp = await tx.clinicalFollowUp.create({
        data: {
          id: randomUUID(),
          clinicId: c.clinicId,
          patientId: input.patientId,
          treatingDoctorMembershipId: input.treatingDoctorMembershipId,
          encounterId: input.encounterId || null,
          treatmentPlanId: input.treatmentPlanId || null,
          procedureExecutionId: input.procedureExecutionId || null,
          appointmentId: input.appointmentId || null,
          status: 'SCHEDULED',
          reason: input.reason.trim(),
          scheduledDate,
          recoveryInstructions: input.recoveryInstructions?.trim() || null,
        },
        include: {
          patient: { select: { id: true, fullName: true, patientNumber: true } },
          treatingDoctor: { select: { id: true, user: { select: { name: true } } } },
        },
      });

      await this.audit.record(
        {
          clinicId: c.clinicId,
          actorId: c.userId,
          action: 'clinical.followup.schedule',
          category: 'CLINICAL',
          targetType: 'ClinicalFollowUp',
          targetId: followUp.id,
          outcome: 'SUCCESS',
          metadata: {
            patientId: input.patientId,
            treatingDoctorMembershipId: input.treatingDoctorMembershipId,
          },
        },
        tx,
      );

      return clean(followUp as unknown as Record<string, unknown>);
    });
  }

  /**
   * Lists clinical follow-ups for a patient or clinic.
   */
  async listFollowUps(proof: VerifiedPrincipal, clinicId: string, patientId?: string, status?: string) {
    return this.database.withClinicContext(proof, clinicId, ['clinical.follow-ups.read'], async (tx, c) => {
      const where: Record<string, unknown> = { clinicId: c.clinicId };
      if (patientId) where.patientId = patientId;
      if (status) where.status = status;

      const items = await tx.clinicalFollowUp.findMany({
        where,
        include: {
          patient: { select: { id: true, fullName: true, patientNumber: true } },
          treatingDoctor: { select: { id: true, user: { select: { name: true } } } },
          assessment: {
            include: {
              doctor: { select: { id: true, user: { select: { name: true } } } },
              amendments: {
                include: { author: { select: { id: true, user: { select: { name: true } } } } },
                orderBy: { createdAt: 'asc' },
              },
            },
          },
          outcomes: true,
          adverseEvents: true,
        },
        orderBy: [{ scheduledDate: 'desc' }, { createdAt: 'desc' }],
      });

      return {
        items: items.map((item) => clean(item as unknown as Record<string, unknown>)),
      };
    });
  }

  /**
   * Retrieves a single clinical follow-up by ID.
   */
  async getFollowUp(proof: VerifiedPrincipal, clinicId: string, followUpId: string) {
    return this.database.withClinicContext(proof, clinicId, ['clinical.follow-ups.read'], async (tx, c) => {
      return this.findFollowUpWithRelations(tx, c.clinicId, followUpId);
    });
  }

  private async findFollowUpWithRelations(
    tx: Parameters<Parameters<TenantDatabaseService['withClinicContext']>[3]>[0],
    clinicId: string,
    id: string,
  ) {
    const followUp = await tx.clinicalFollowUp.findFirst({
      where: { id, clinicId },
      include: {
        patient: { select: { id: true, fullName: true, patientNumber: true } },
        treatingDoctor: { select: { id: true, user: { select: { name: true } } } },
        assessment: {
          include: {
            doctor: { select: { id: true, user: { select: { name: true } } } },
            amendments: {
              include: { author: { select: { id: true, user: { select: { name: true } } } } },
              orderBy: { createdAt: 'asc' },
            },
          },
        },
        outcomes: true,
        adverseEvents: true,
      },
    });
    if (!followUp) throw new NotFoundException('Clinical follow-up not found');

    return clean(followUp as unknown as Record<string, unknown>);
  }

  /**
   * Updates follow-up status (e.g. IN_PROGRESS, CANCELLED, MISSED).
   */
  async updateStatus(proof: VerifiedPrincipal, clinicId: string, followUpId: string, input: UpdateFollowUpStatusDto) {
    return this.database.withClinicContext(proof, clinicId, ['clinical.follow-ups.update'], async (tx, c) => {
      const followUp = await tx.clinicalFollowUp.findFirst({
        where: { id: followUpId, clinicId: c.clinicId },
      });
      if (!followUp) throw new NotFoundException('Clinical follow-up not found');

      if (followUp.version !== input.expectedVersion) {
        throw new ConflictException('Concurrency conflict: follow-up record has been modified');
      }

      if (followUp.status === 'COMPLETED' || followUp.status === 'CANCELLED') {
        throw new ConflictException('Terminal follow-up statuses (COMPLETED, CANCELLED) cannot reopen or change');
      }

      if (input.status === 'COMPLETED') {
        throw new BadRequestException('Completing a follow-up requires a clinician-signed assessment');
      }

      const now = new Date();
      let cancelledAt: Date | null = null;
      let cancelReason: string | null = null;

      if (input.status === 'CANCELLED') {
        if (!input.cancelReason || input.cancelReason.trim().length < 3) {
          throw new BadRequestException('Cancellation reason is required when cancelling a follow-up');
        }
        cancelledAt = now;
        cancelReason = input.cancelReason.trim();
      }

      const res = await tx.clinicalFollowUp.updateMany({
        where: { id: followUpId, clinicId: c.clinicId, version: input.expectedVersion },
        data: {
          status: input.status,
          cancelledAt,
          cancelReason,
          version: { increment: 1 },
        },
      });
      if (res.count === 0) {
        throw new ConflictException('Concurrency conflict on status update');
      }

      await this.audit.record(
        {
          clinicId: c.clinicId,
          actorId: c.userId,
          action: 'clinical.followup.status.update',
          category: 'CLINICAL',
          targetType: 'ClinicalFollowUp',
          targetId: followUpId,
          outcome: 'SUCCESS',
          metadata: { newStatus: input.status, cancelled: Boolean(cancelledAt) },
        },
        tx,
      );

      return this.findFollowUpWithRelations(tx, c.clinicId, followUpId);
    });
  }

  /**
   * Completes a follow-up by creating and signing a FollowUpAssessment.
   */
  async completeAssessment(
    proof: VerifiedPrincipal,
    clinicId: string,
    followUpId: string,
    input: CompleteFollowUpAssessmentDto,
  ) {
    return this.database.withClinicContext(proof, clinicId, ['clinical.follow-ups.sign'], async (tx, c) => {
      const followUp = await tx.clinicalFollowUp.findFirst({
        where: { id: followUpId, clinicId: c.clinicId },
      });
      if (!followUp) throw new NotFoundException('Clinical follow-up not found');

      if (followUp.version !== input.expectedVersion) {
        throw new ConflictException('Concurrency conflict: follow-up record has been modified');
      }

      if (followUp.status === 'COMPLETED' || followUp.status === 'CANCELLED') {
        throw new ConflictException('Follow-up is already in a terminal status');
      }

      const now = new Date();
      const assessmentId = randomUUID();

      // Deterministic cryptographic digital signature over assessment payload
      const signaturePayload = JSON.stringify({
        clinicId: c.clinicId,
        followUpId,
        doctorMembershipId: c.membershipId,
        symptomsObserved: input.symptomsObserved.trim(),
        healingProgress: input.healingProgress.trim(),
        clinicalNotes: input.clinicalNotes.trim(),
        signedAt: now.toISOString(),
      });
      const signatureSha256 = createHash('sha256').update(signaturePayload, 'utf8').digest('hex');

      // Create assessment first
      await tx.followUpAssessment.create({
        data: {
          id: assessmentId,
          clinicId: c.clinicId,
          followUpId,
          doctorMembershipId: c.membershipId,
          symptomsObserved: input.symptomsObserved.trim(),
          healingProgress: input.healingProgress.trim(),
          clinicalNotes: input.clinicalNotes.trim(),
          signedAt: now,
          signatureSha256,
        },
      });

      // Update follow-up to COMPLETED
      const res = await tx.clinicalFollowUp.updateMany({
        where: { id: followUpId, clinicId: c.clinicId, version: input.expectedVersion },
        data: {
          status: 'COMPLETED',
          completedAt: now,
          version: { increment: 1 },
        },
      });
      if (res.count === 0) {
        throw new ConflictException('Concurrency conflict during completion');
      }

      await this.audit.record(
        {
          clinicId: c.clinicId,
          actorId: c.userId,
          action: 'clinical.followup.assess',
          category: 'CLINICAL',
          targetType: 'FollowUpAssessment',
          targetId: assessmentId,
          outcome: 'SUCCESS',
          metadata: { followUpId, signatureSha256 },
        },
        tx,
      );

      return this.findFollowUpWithRelations(tx, c.clinicId, followUpId);
    });
  }

  /**
   * Appends an immutable amendment to a signed follow-up assessment.
   */
  async amendAssessment(
    proof: VerifiedPrincipal,
    clinicId: string,
    assessmentId: string,
    input: AmendFollowUpAssessmentDto,
  ) {
    return this.database.withClinicContext(proof, clinicId, ['clinical.follow-ups.amend'], async (tx, c) => {
      const assessment = await tx.followUpAssessment.findFirst({
        where: { id: assessmentId, clinicId: c.clinicId },
      });
      if (!assessment) throw new NotFoundException('Follow-up assessment not found');

      if (!assessment.signedAt) {
        throw new ConflictException('Follow-up assessment is not yet signed and cannot be amended');
      }

      const now = new Date();
      const amendmentId = randomUUID();

      // Deterministic digital signature over amendment
      const signaturePayload = JSON.stringify({
        clinicId: c.clinicId,
        assessmentId,
        authorMembershipId: c.membershipId,
        amendmentReason: input.amendmentReason.trim(),
        amendedContent: input.amendedContent.trim(),
        signedAt: now.toISOString(),
      });
      const signatureSha256 = createHash('sha256').update(signaturePayload, 'utf8').digest('hex');

      const amendment = await tx.followUpAssessmentAmendment.create({
        data: {
          id: amendmentId,
          clinicId: c.clinicId,
          assessmentId,
          authorMembershipId: c.membershipId,
          amendmentReason: input.amendmentReason.trim(),
          amendedContent: input.amendedContent.trim(),
          signedAt: now,
          signatureSha256,
        },
        include: {
          author: { select: { id: true, user: { select: { name: true } } } },
        },
      });

      // Increment parent assessment version
      await tx.followUpAssessment.update({
        where: { id: assessmentId },
        data: { version: { increment: 1 } },
      });

      await this.audit.record(
        {
          clinicId: c.clinicId,
          actorId: c.userId,
          action: 'clinical.followup.amend',
          category: 'CLINICAL',
          targetType: 'FollowUpAssessmentAmendment',
          targetId: amendmentId,
          outcome: 'SUCCESS',
          metadata: { assessmentId, signatureSha256 },
        },
        tx,
      );

      return clean(amendment as unknown as Record<string, unknown>);
    });
  }

  /**
   * Records a clinician-authored or patient-reported treatment outcome with scale validation.
   */
  async recordOutcome(proof: VerifiedPrincipal, clinicId: string, input: RecordTreatmentOutcomeDto) {
    return this.database.withClinicContext(proof, clinicId, ['clinical.outcomes.record'], async (tx, c) => {
      const patient = await tx.patient.findFirst({
        where: { id: input.patientId, clinicId: c.clinicId, status: 'ACTIVE' },
      });
      if (!patient) throw new NotFoundException('Patient not found or inactive');

      if (input.clinicianScore === undefined && input.patientReportedScore === undefined) {
        throw new BadRequestException('At least one outcome score (clinician or patient-reported) must be provided');
      }

      // Strict validation of scale bounds — provenance preserved, no inferred percentage improvements
      this.validateScaleBounds(input.measurementScale, input.clinicianScore, 'Clinician score');
      this.validateScaleBounds(input.measurementScale, input.patientReportedScore, 'Patient-reported score');

      if (input.followUpId) {
        const followUp = await tx.clinicalFollowUp.findFirst({
          where: { id: input.followUpId, clinicId: c.clinicId, patientId: input.patientId },
        });
        if (!followUp) throw new NotFoundException('Follow-up record not found for this patient');
      }

      if (input.procedureExecutionId) {
        const proc = await tx.procedureExecution.findFirst({
          where: { id: input.procedureExecutionId, clinicId: c.clinicId, patientId: input.patientId },
        });
        if (!proc) throw new NotFoundException('Procedure execution not found for this patient');
      }

      if (input.treatmentPlanId) {
        const plan = await tx.treatmentPlan.findFirst({
          where: { id: input.treatmentPlanId, clinicId: c.clinicId, patientId: input.patientId },
        });
        if (!plan) throw new NotFoundException('Treatment plan not found for this patient');
      }

      if (input.photoComparisonGroupId) {
        const comparison = await tx.photoComparisonGroup.findFirst({
          where: { id: input.photoComparisonGroupId, clinicId: c.clinicId, patientId: input.patientId },
        });
        if (!comparison) throw new NotFoundException('Photo comparison group not found for this patient');
      }

      const recordedAt = input.recordedAt ? new Date(input.recordedAt) : new Date();

      const outcome = await tx.treatmentOutcome.create({
        data: {
          id: randomUUID(),
          clinicId: c.clinicId,
          patientId: input.patientId,
          followUpId: input.followUpId || null,
          procedureExecutionId: input.procedureExecutionId || null,
          treatmentPlanId: input.treatmentPlanId || null,
          photoComparisonGroupId: input.photoComparisonGroupId || null,
          recordedByMembershipId: c.membershipId,
          measurementScale: input.measurementScale,
          clinicianScore: input.clinicianScore !== undefined ? input.clinicianScore : null,
          clinicianNotes: input.clinicianNotes?.trim() || null,
          patientReportedScore: input.patientReportedScore !== undefined ? input.patientReportedScore : null,
          patientReportedNotes: input.patientReportedNotes?.trim() || null,
          recordedAt,
        },
        include: {
          recordedBy: { select: { id: true, user: { select: { name: true } } } },
          photoComparisonGroup: {
            select: {
              id: true,
              title: true,
              beforePhoto: { select: { id: true, bodyArea: true, takenAt: true } },
              afterPhoto: { select: { id: true, bodyArea: true, takenAt: true } },
            },
          },
        },
      });

      await this.audit.record(
        {
          clinicId: c.clinicId,
          actorId: c.userId,
          action: 'clinical.outcome.record',
          category: 'CLINICAL',
          targetType: 'TreatmentOutcome',
          targetId: outcome.id,
          outcome: 'SUCCESS',
          metadata: {
            patientId: input.patientId,
            scale: input.measurementScale,
            photoLinked: Boolean(input.photoComparisonGroupId),
          },
        },
        tx,
      );

      return clean(outcome as unknown as Record<string, unknown>);
    });
  }

  /**
   * Lists treatment outcomes for a patient.
   */
  async listOutcomes(proof: VerifiedPrincipal, clinicId: string, patientId: string) {
    return this.database.withClinicContext(proof, clinicId, ['clinical.outcomes.read'], async (tx, c) => {
      const items = await tx.treatmentOutcome.findMany({
        where: { clinicId: c.clinicId, patientId },
        include: {
          recordedBy: { select: { id: true, user: { select: { name: true } } } },
          photoComparisonGroup: {
            select: {
              id: true,
              title: true,
              beforePhoto: { select: { id: true, bodyArea: true, takenAt: true } },
              afterPhoto: { select: { id: true, bodyArea: true, takenAt: true } },
            },
          },
        },
        orderBy: [{ recordedAt: 'desc' }, { createdAt: 'desc' }],
      });

      return {
        items: items.map((i) => clean(i as unknown as Record<string, unknown>)),
      };
    });
  }

  /**
   * Records a clinician-documented adverse event or complication.
   */
  async recordAdverseEvent(proof: VerifiedPrincipal, clinicId: string, input: RecordAdverseEventDto) {
    return this.database.withClinicContext(proof, clinicId, ['clinical.adverse-events.record'], async (tx, c) => {
      const patient = await tx.patient.findFirst({
        where: { id: input.patientId, clinicId: c.clinicId, status: 'ACTIVE' },
      });
      if (!patient) throw new NotFoundException('Patient not found or inactive');

      if (input.followUpId) {
        const followUp = await tx.clinicalFollowUp.findFirst({
          where: { id: input.followUpId, clinicId: c.clinicId, patientId: input.patientId },
        });
        if (!followUp) throw new NotFoundException('Follow-up record not found for this patient');
      }

      if (input.procedureExecutionId) {
        const proc = await tx.procedureExecution.findFirst({
          where: { id: input.procedureExecutionId, clinicId: c.clinicId, patientId: input.patientId },
        });
        if (!proc) throw new NotFoundException('Procedure execution not found for this patient');
      }

      const observationDate = new Date(input.observationDate);
      if (isNaN(observationDate.getTime())) {
        throw new BadRequestException('Invalid observation date');
      }

      const event = await tx.adverseEvent.create({
        data: {
          id: randomUUID(),
          clinicId: c.clinicId,
          patientId: input.patientId,
          followUpId: input.followUpId || null,
          procedureExecutionId: input.procedureExecutionId || null,
          reportedByMembershipId: c.membershipId,
          eventType: input.eventType.trim(),
          severity: input.severity,
          observationDate,
          documentedFindings: input.documentedFindings.trim(),
          escalationNotes: input.escalationNotes?.trim() || null,
          status: 'REPORTED',
        },
        include: {
          reportedBy: { select: { id: true, user: { select: { name: true } } } },
        },
      });

      await this.audit.record(
        {
          clinicId: c.clinicId,
          actorId: c.userId,
          action: 'clinical.adverse_event.record',
          category: 'CLINICAL',
          targetType: 'AdverseEvent',
          targetId: event.id,
          outcome: 'SUCCESS',
          metadata: {
            patientId: input.patientId,
            severity: input.severity,
            eventType: input.eventType.trim(),
          },
        },
        tx,
      );

      return clean(event as unknown as Record<string, unknown>);
    });
  }

  /**
   * Updates an adverse event status or adds escalation notes.
   */
  async updateAdverseEvent(
    proof: VerifiedPrincipal,
    clinicId: string,
    eventId: string,
    input: UpdateAdverseEventDto,
  ) {
    return this.database.withClinicContext(proof, clinicId, ['clinical.adverse-events.manage'], async (tx, c) => {
      const event = await tx.adverseEvent.findFirst({
        where: { id: eventId, clinicId: c.clinicId },
      });
      if (!event) throw new NotFoundException('Adverse event not found');

      if (event.version !== input.expectedVersion) {
        throw new ConflictException('Concurrency conflict: adverse event record has been modified');
      }

      const now = new Date();
      const resolvedAt = input.status === 'RESOLVED' ? now : event.resolvedAt;

      const res = await tx.adverseEvent.updateMany({
        where: { id: eventId, clinicId: c.clinicId, version: input.expectedVersion },
        data: {
          status: input.status,
          escalationNotes: input.escalationNotes?.trim() || event.escalationNotes,
          resolvedAt,
          version: { increment: 1 },
        },
      });
      if (res.count === 0) {
        throw new ConflictException('Concurrency conflict on adverse event update');
      }

      await this.audit.record(
        {
          clinicId: c.clinicId,
          actorId: c.userId,
          action: 'clinical.adverse_event.update',
          category: 'CLINICAL',
          targetType: 'AdverseEvent',
          targetId: eventId,
          outcome: 'SUCCESS',
          metadata: { newStatus: input.status, resolved: Boolean(resolvedAt) },
        },
        tx,
      );

      const updated = await tx.adverseEvent.findFirst({
        where: { id: eventId, clinicId: c.clinicId },
        include: {
          reportedBy: { select: { id: true, user: { select: { name: true } } } },
        },
      });

      return clean(updated as unknown as Record<string, unknown>);
    });
  }

  /**
   * Lists adverse events for a patient or clinic.
   */
  async listAdverseEvents(proof: VerifiedPrincipal, clinicId: string, patientId?: string) {
    return this.database.withClinicContext(proof, clinicId, ['clinical.adverse-events.read'], async (tx, c) => {
      const where: Record<string, unknown> = { clinicId: c.clinicId };
      if (patientId) where.patientId = patientId;

      const items = await tx.adverseEvent.findMany({
        where,
        include: {
          reportedBy: { select: { id: true, user: { select: { name: true } } } },
        },
        orderBy: [{ observationDate: 'desc' }, { createdAt: 'desc' }],
      });

      return {
        items: items.map((i) => clean(i as unknown as Record<string, unknown>)),
      };
    });
  }

  private validateScaleBounds(scale: OutcomeMeasurementScaleEnum, score: number | undefined, label: string) {
    if (score === undefined) return;
    if (scale === OutcomeMeasurementScaleEnum.VISUAL_ANALOG_SCALE_10) {
      if (score < 0 || score > 10) {
        throw new BadRequestException(`${label} for VISUAL_ANALOG_SCALE_10 must be between 0 and 10`);
      }
    } else if (scale === OutcomeMeasurementScaleEnum.PATIENT_SATISFACTION_5_POINT) {
      if (score < 1 || score > 5) {
        throw new BadRequestException(`${label} for PATIENT_SATISFACTION_5_POINT must be between 1 and 5`);
      }
    } else if (scale === OutcomeMeasurementScaleEnum.CLINICAL_GLOBAL_IMPRESSION) {
      if (score < 1 || score > 7) {
        throw new BadRequestException(`${label} for CLINICAL_GLOBAL_IMPRESSION must be between 1 and 7`);
      }
    } else if (scale === OutcomeMeasurementScaleEnum.STRUCTURED_OBSERVATION) {
      if (score < 0) {
        throw new BadRequestException(`${label} for STRUCTURED_OBSERVATION cannot be negative`);
      }
    }
  }
}
