import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type {
  BreakGlassReviewOutcome,
  ClinicalIncidentCategory,
  ClinicalIncidentSeverity,
  ClinicalIncidentStatus,
  ClinicalPolicyCategory,
  PrivilegeReviewStatus,
  PrivilegeReviewType,
} from '../generated/prisma/client.js';
import type { VerifiedPrincipal } from './verified-sessions.js';
import { TenantDatabaseService } from './tenant-database.service.js';
import { AuditRepository } from './audit.repository.js';

export interface CreateSafetyPolicyInput {
  code: string;
  titleAr: string;
  titleEn?: string;
  description?: string;
  category: ClinicalPolicyCategory;
  specialtyCode?: string;
  jurisdiction?: string;
  initialRules?: Record<string, unknown>;
  changeSummary?: string;
}

export interface CreatePolicyVersionInput {
  rulesJson: Record<string, unknown>;
  changeSummary?: string;
}

export interface ApprovePolicyVersionInput {
  effectiveFrom?: string;
  effectiveTo?: string;
  evidenceReference?: string;
}

export interface ReportIncidentInput {
  severity: ClinicalIncidentSeverity;
  category: ClinicalIncidentCategory;
  occurredAt: string;
  description: string;
  immediateActionTaken?: string;
  patientId?: string;
  encounterId?: string;
}

export interface InvestigateIncidentInput {
  investigationFindings?: string;
  rootCauseAnalysis?: string;
  correctiveActions?: string;
  status: ClinicalIncidentStatus;
}

export interface RequestBreakGlassInput {
  patientId: string;
  clinicalJustification: string;
  durationMinutes?: number;
}

export interface ReviewBreakGlassInput {
  reviewOutcome: BreakGlassReviewOutcome;
  reviewNotes: string;
}

export interface ConductPrivilegeReviewInput {
  practitionerProfileId: string;
  privilegeId?: string;
  reviewType: PrivilegeReviewType;
  status?: PrivilegeReviewStatus;
  findings: string;
  recommendation: string;
  effectiveDate?: string;
  expirationDate?: string;
  evidenceReference?: string;
}

function computeRulesDigest(rules: unknown): string {
  const canonical = JSON.stringify(rules, Object.keys(rules as object).sort());
  return createHash('sha256').update(canonical).digest('hex');
}

@Injectable()
export class ClinicalGovernanceRepository {
  constructor(
    private readonly tenantDb: TenantDatabaseService,
    private readonly audit: AuditRepository,
  ) {}

  // --------------------------------------------------------------------------
  // 1. Clinical Safety Policies & Protocols
  // --------------------------------------------------------------------------

  async createSafetyPolicy(proof: VerifiedPrincipal, clinicId: string, input: CreateSafetyPolicyInput) {
    return this.tenantDb.withClinicContext(proof, clinicId, ['clinical.safety-policies.manage'], async (tx, ctx) => {
      let specialtyId: string | null = null;
      if (input.specialtyCode) {
        const spec = await tx.medicalSpecialty.findUnique({ where: { code: input.specialtyCode } });
        if (!spec) throw new NotFoundException(`Specialty '${input.specialtyCode}' not found`);
        specialtyId = spec.id;
      }

      const existing = await tx.clinicalSafetyPolicy.findUnique({
        where: { clinicId_code: { clinicId, code: input.code } },
      });
      if (existing) {
        throw new ConflictException(`Safety policy with code '${input.code}' already exists`);
      }

      const policy = await tx.clinicalSafetyPolicy.create({
        data: {
          clinicId,
          code: input.code,
          titleAr: input.titleAr,
          titleEn: input.titleEn ?? null,
          description: input.description ?? null,
          category: input.category,
          specialtyId,
          jurisdiction: input.jurisdiction ?? 'GLOBAL',
          status: 'DRAFT',
        },
      });

      if (input.initialRules) {
        const digest = computeRulesDigest(input.initialRules);
        const version = await tx.clinicalSafetyPolicyVersion.create({
          data: {
            clinicId,
            policyId: policy.id,
            versionNumber: 1,
            rulesJson: input.initialRules as any,
            changeSummary: input.changeSummary ?? 'Initial draft creation',
            status: 'DRAFT',
            sha256Digest: digest,
            authorMembershipId: ctx.membershipId,
          },
        });
        return { ...policy, versions: [version] };
      }

      return policy;
    });
  }

  async createPolicyVersion(proof: VerifiedPrincipal, clinicId: string, policyId: string, input: CreatePolicyVersionInput) {
    return this.tenantDb.withClinicContext(proof, clinicId, ['clinical.safety-policies.manage'], async (tx, ctx) => {
      const policy = await tx.clinicalSafetyPolicy.findUnique({
        where: { clinicId_id: { clinicId, id: policyId } },
      });
      if (!policy) throw new NotFoundException('Safety policy not found');

      const latestVersion = await tx.clinicalSafetyPolicyVersion.findFirst({
        where: { clinicId, policyId },
        orderBy: { versionNumber: 'desc' },
      });

      const nextVersionNumber = (latestVersion?.versionNumber ?? 0) + 1;
      const digest = computeRulesDigest(input.rulesJson);

      const version = await tx.clinicalSafetyPolicyVersion.create({
        data: {
          clinicId,
          policyId,
          versionNumber: nextVersionNumber,
          rulesJson: input.rulesJson as any,
          changeSummary: input.changeSummary ?? `Version ${nextVersionNumber} revision`,
          status: 'DRAFT',
          sha256Digest: digest,
          authorMembershipId: ctx.membershipId,
        },
      });

      return version;
    });
  }

  async approvePolicyVersion(proof: VerifiedPrincipal, clinicId: string, versionId: string, input: ApprovePolicyVersionInput) {
    return this.tenantDb.withClinicContext(proof, clinicId, ['clinical.safety-policies.read'], async (tx, ctx) => {
      // Must be an active, verified Medical Director
      const reviewerProfile = await tx.practitionerProfile.findUnique({
        where: { clinicId_membershipId: { clinicId, membershipId: ctx.membershipId } },
      });
      if (!reviewerProfile || !reviewerProfile.isMedicalDirector || reviewerProfile.verificationStatus !== 'VERIFIED') {
        throw new ForbiddenException('Only an active verified Medical Director can approve clinical safety policies');
      }

      const version = await tx.clinicalSafetyPolicyVersion.findUnique({
        where: { clinicId_id: { clinicId, id: versionId } },
        include: { policy: true },
      });
      if (!version) throw new NotFoundException('Policy version not found');

      // Requirement: Anti-self-approval
      if (version.authorMembershipId === ctx.membershipId) {
        throw new ForbiddenException('Medical Director cannot approve their own authored policy version (anti-self-approval rule)');
      }

      const approved = await tx.clinicalSafetyPolicyVersion.update({
        where: { clinicId_id: { clinicId, id: versionId } },
        data: {
          status: 'APPROVED',
          approvedByMembershipId: ctx.membershipId,
          approvedAt: new Date(),
          effectiveFrom: input.effectiveFrom ? new Date(input.effectiveFrom) : new Date(),
          effectiveTo: input.effectiveTo ? new Date(input.effectiveTo) : null,
          evidenceReference: input.evidenceReference ?? null,
          version: { increment: 1 },
        },
      });

      // Update parent policy status to APPROVED if in DRAFT
      if (version.policy.status === 'DRAFT') {
        await tx.clinicalSafetyPolicy.update({
          where: { clinicId_id: { clinicId, id: version.policyId } },
          data: { status: 'APPROVED', version: { increment: 1 } },
        });
      }

      await this.audit.record({
        clinicId,
        actorId: ctx.userId,
        category: 'CLINICAL',
        action: 'clinical.safety-policy.approve',
        targetType: 'ClinicalSafetyPolicyVersion',
        targetId: versionId,
        outcome: 'SUCCESS',
        metadata: { policyId: version.policyId, versionNumber: version.versionNumber },
      });

      return approved;
    });
  }

  async activatePolicyVersion(proof: VerifiedPrincipal, clinicId: string, versionId: string) {
    return this.tenantDb.withClinicContext(proof, clinicId, ['clinical.safety-policies.manage'], async (tx, ctx) => {
      const version = await tx.clinicalSafetyPolicyVersion.findUnique({
        where: { clinicId_id: { clinicId, id: versionId } },
        include: { policy: true },
      });
      if (!version) throw new NotFoundException('Policy version not found');

      if (version.status !== 'APPROVED') {
        throw new BadRequestException('Only approved policy versions can be activated');
      }

      // Retire existing active version if present
      if (version.policy.activeVersionId) {
        await tx.clinicalSafetyPolicyVersion.update({
          where: { clinicId_id: { clinicId, id: version.policy.activeVersionId } },
          data: { status: 'RETIRED', version: { increment: 1 } },
        });
      }

      // Activate target version
      const activated = await tx.clinicalSafetyPolicyVersion.update({
        where: { clinicId_id: { clinicId, id: versionId } },
        data: { status: 'ACTIVATED', version: { increment: 1 } },
      });

      await tx.clinicalSafetyPolicy.update({
        where: { clinicId_id: { clinicId, id: version.policyId } },
        data: {
          status: 'ACTIVATED',
          activeVersionId: version.id,
          version: { increment: 1 },
        },
      });

      await this.audit.record({
        clinicId,
        actorId: ctx.userId,
        category: 'CLINICAL',
        action: 'clinical.safety-policy.activate',
        targetType: 'ClinicalSafetyPolicy',
        targetId: version.policyId,
        outcome: 'SUCCESS',
        metadata: { activatedVersionId: versionId, versionNumber: version.versionNumber },
      });

      return activated;
    });
  }

  async rollbackPolicy(proof: VerifiedPrincipal, clinicId: string, policyId: string, targetVersionNumber: number) {
    return this.tenantDb.withClinicContext(proof, clinicId, ['clinical.safety-policies.read'], async (tx, ctx) => {
      const reviewerProfile = await tx.practitionerProfile.findUnique({
        where: { clinicId_membershipId: { clinicId, membershipId: ctx.membershipId } },
      });
      if (!reviewerProfile || !reviewerProfile.isMedicalDirector) {
        throw new ForbiddenException('Only Medical Director can rollback clinical safety policies');
      }

      const targetVersion = await tx.clinicalSafetyPolicyVersion.findUnique({
        where: { policyId_versionNumber: { policyId, versionNumber: targetVersionNumber } },
      });
      if (!targetVersion) throw new NotFoundException(`Version ${targetVersionNumber} not found`);

      if (targetVersion.status !== 'APPROVED' && targetVersion.status !== 'RETIRED') {
        throw new BadRequestException('Can only rollback to an approved or retired version');
      }

      // Retire current active version
      const policy = await tx.clinicalSafetyPolicy.findUnique({ where: { clinicId_id: { clinicId, id: policyId } } });
      if (policy?.activeVersionId) {
        await tx.clinicalSafetyPolicyVersion.update({
          where: { clinicId_id: { clinicId, id: policy.activeVersionId } },
          data: { status: 'RETIRED', version: { increment: 1 } },
        });
      }

      // Activate target version
      const activated = await tx.clinicalSafetyPolicyVersion.update({
        where: { clinicId_id: { clinicId, id: targetVersion.id } },
        data: { status: 'ACTIVATED', version: { increment: 1 } },
      });

      await tx.clinicalSafetyPolicy.update({
        where: { clinicId_id: { clinicId, id: policyId } },
        data: {
          status: 'ACTIVATED',
          activeVersionId: targetVersion.id,
          version: { increment: 1 },
        },
      });

      await this.audit.record({
        clinicId,
        actorId: ctx.userId,
        category: 'CLINICAL',
        action: 'clinical.safety-policy.rollback',
        targetType: 'ClinicalSafetyPolicy',
        targetId: policyId,
        outcome: 'SUCCESS',
        metadata: { rolledBackToVersion: targetVersionNumber },
      });

      return activated;
    });
  }

  async listSafetyPolicies(proof: VerifiedPrincipal, clinicId: string) {
    return this.tenantDb.withClinicContext(proof, clinicId, ['clinical.safety-policies.read'], async (tx) => {
      return tx.clinicalSafetyPolicy.findMany({
        where: { clinicId },
        include: {
          specialty: true,
          activeVersion: true,
          versions: { orderBy: { versionNumber: 'desc' } },
        },
        orderBy: { createdAt: 'desc' },
      });
    });
  }

  // --------------------------------------------------------------------------
  // 2. Clinical Incidents & Near-Miss Investigations
  // --------------------------------------------------------------------------

  async reportIncident(proof: VerifiedPrincipal, clinicId: string, input: ReportIncidentInput) {
    return this.tenantDb.withClinicContext(proof, clinicId, ['clinical.incidents.report'], async (tx, ctx) => {
      // Monotonic sequence allocator
      const counter = await tx.clinicalIncidentCounter.upsert({
        where: { clinicId },
        create: { clinicId, lastNumber: 1 },
        update: { lastNumber: { increment: 1 } },
        select: { lastNumber: true },
      });
      const incidentNumber = `INC-CLIN-${String(counter.lastNumber).padStart(6, '0')}`;

      const incident = await tx.clinicalIncident.create({
        data: {
          clinicId,
          incidentNumber,
          severity: input.severity,
          category: input.category,
          status: 'REPORTED',
          patientId: input.patientId ?? null,
          encounterId: input.encounterId ?? null,
          reportedByMembershipId: ctx.membershipId,
          occurredAt: new Date(input.occurredAt),
          description: input.description,
          immediateActionTaken: input.immediateActionTaken ?? null,
        },
        include: {
          reportedBy: { include: { user: true } },
          patient: true,
        },
      });

      await this.audit.record({
        clinicId,
        actorId: ctx.userId,
        category: 'CLINICAL',
        action: 'clinical.incident.report',
        targetType: 'ClinicalIncident',
        targetId: incident.id,
        outcome: 'SUCCESS',
        metadata: { incidentNumber, severity: input.severity, category: input.category },
      });

      return incident;
    });
  }

  async investigateIncident(proof: VerifiedPrincipal, clinicId: string, incidentId: string, input: InvestigateIncidentInput) {
    return this.tenantDb.withClinicContext(proof, clinicId, ['clinical.incidents.read'], async (tx, ctx) => {
      // Must be an active Medical Director or Quality Officer
      const reviewerProfile = await tx.practitionerProfile.findUnique({
        where: { clinicId_membershipId: { clinicId, membershipId: ctx.membershipId } },
      });
      if (!reviewerProfile || !reviewerProfile.isMedicalDirector) {
        throw new ForbiddenException('Only Medical Director or authorized clinical governance lead can investigate clinical incidents');
      }

      const existing = await tx.clinicalIncident.findUnique({
        where: { clinicId_id: { clinicId, id: incidentId } },
      });
      if (!existing) throw new NotFoundException('Clinical incident not found');

      const isClosing = input.status === 'CLOSED';
      const isResolving = input.status === 'RESOLVED';

      const updated = await tx.clinicalIncident.update({
        where: { clinicId_id: { clinicId, id: incidentId } },
        data: {
          status: input.status,
          investigationFindings: input.investigationFindings ?? existing.investigationFindings,
          rootCauseAnalysis: input.rootCauseAnalysis ?? existing.rootCauseAnalysis,
          correctiveActions: input.correctiveActions ?? existing.correctiveActions,
          investigatedByMembershipId: ctx.membershipId,
          resolvedAt: isResolving ? new Date() : existing.resolvedAt,
          closedAt: isClosing ? new Date() : existing.closedAt,
          version: { increment: 1 },
        },
      });

      await this.audit.record({
        clinicId,
        actorId: ctx.userId,
        category: 'CLINICAL',
        action: 'clinical.incident.investigate',
        targetType: 'ClinicalIncident',
        targetId: incidentId,
        outcome: 'SUCCESS',
        metadata: { status: input.status },
      });

      return updated;
    });
  }

  async listIncidents(proof: VerifiedPrincipal, clinicId: string) {
    return this.tenantDb.withClinicContext(proof, clinicId, ['clinical.incidents.read'], async (tx) => {
      return tx.clinicalIncident.findMany({
        where: { clinicId },
        include: {
          reportedBy: { include: { user: true } },
          investigatedBy: { include: { user: true } },
          patient: true,
        },
        orderBy: { occurredAt: 'desc' },
      });
    });
  }

  // --------------------------------------------------------------------------
  // 3. Emergency Break-Glass Access
  // --------------------------------------------------------------------------

  async requestBreakGlass(proof: VerifiedPrincipal, clinicId: string, input: RequestBreakGlassInput) {
    return this.tenantDb.withClinicContext(proof, clinicId, ['clinical.break-glass.request'], async (tx, ctx) => {
      const justification = input.clinicalJustification?.trim() ?? '';
      if (justification.length < 20) {
        throw new BadRequestException('Emergency break-glass access requires a detailed clinical justification (minimum 20 characters)');
      }

      const durationMinutes = input.durationMinutes ?? 60;
      if (durationMinutes <= 0 || durationMinutes > 120) {
        throw new BadRequestException('Emergency break-glass duration must be between 1 and 120 minutes');
      }

      // Verify patient exists in clinic
      const patient = await tx.patient.findUnique({
        where: { clinicId_id: { clinicId, id: input.patientId } },
      });
      if (!patient) throw new NotFoundException('Patient not found in this clinic');

      const now = new Date();
      const expiresAt = new Date(now.getTime() + durationMinutes * 60 * 1000);

      const breakGlass = await tx.emergencyBreakGlassAccess.create({
        data: {
          clinicId,
          requestedByMembershipId: ctx.membershipId,
          patientId: input.patientId,
          clinicalJustification: justification,
          durationMinutes,
          grantedAt: now,
          expiresAt,
        },
        include: {
          patient: true,
          requestedBy: { include: { user: true } },
        },
      });

      // High-priority security audit
      await this.audit.record({
        clinicId,
        actorId: ctx.userId,
        category: 'SECURITY',
        action: 'clinical.break-glass.invoked',
        targetType: 'EmergencyBreakGlassAccess',
        targetId: breakGlass.id,
        outcome: 'SUCCESS',
        metadata: {
          patientId: input.patientId,
          durationMinutes,
          expiresAt: expiresAt.toISOString(),
          justificationSummary: justification.slice(0, 100),
        },
      });

      return breakGlass;
    });
  }

  async reviewBreakGlass(proof: VerifiedPrincipal, clinicId: string, breakGlassId: string, input: ReviewBreakGlassInput) {
    return this.tenantDb.withClinicContext(proof, clinicId, ['clinical.break-glass.audit'], async (tx, ctx) => {
      const breakGlass = await tx.emergencyBreakGlassAccess.findUnique({
        where: { clinicId_id: { clinicId, id: breakGlassId } },
      });
      if (!breakGlass) throw new NotFoundException('Break-glass record not found');

      // Requirement: Anti-self-audit
      if (breakGlass.requestedByMembershipId === ctx.membershipId) {
        throw new ForbiddenException('A clinician cannot audit or approve their own emergency break-glass episode (anti-self-audit rule)');
      }

      const reviewed = await tx.emergencyBreakGlassAccess.update({
        where: { clinicId_id: { clinicId, id: breakGlassId } },
        data: {
          auditReviewedAt: new Date(),
          reviewedByMembershipId: ctx.membershipId,
          reviewOutcome: input.reviewOutcome,
          reviewNotes: input.reviewNotes,
          version: { increment: 1 },
        },
      });

      await this.audit.record({
        clinicId,
        actorId: ctx.userId,
        category: 'SECURITY',
        action: 'clinical.break-glass.reviewed',
        targetType: 'EmergencyBreakGlassAccess',
        targetId: breakGlassId,
        outcome: 'SUCCESS',
        metadata: { reviewOutcome: input.reviewOutcome },
      });

      return reviewed;
    });
  }

  async listBreakGlass(proof: VerifiedPrincipal, clinicId: string) {
    return this.tenantDb.withClinicContext(proof, clinicId, ['clinical.break-glass.audit'], async (tx) => {
      return tx.emergencyBreakGlassAccess.findMany({
        where: { clinicId },
        include: {
          requestedBy: { include: { user: true } },
          reviewedBy: { include: { user: true } },
          patient: true,
        },
        orderBy: { grantedAt: 'desc' },
      });
    });
  }

  // --------------------------------------------------------------------------
  // 4. Periodic Credential Review, Renewal & Emergency Suspension
  // --------------------------------------------------------------------------

  async conductPrivilegeReview(proof: VerifiedPrincipal, clinicId: string, input: ConductPrivilegeReviewInput) {
    return this.tenantDb.withClinicContext(proof, clinicId, ['privileges.read'], async (tx, ctx) => {
      // Must be an active verified Medical Director
      const reviewerProfile = await tx.practitionerProfile.findUnique({
        where: { clinicId_membershipId: { clinicId, membershipId: ctx.membershipId } },
      });
      if (!reviewerProfile || !reviewerProfile.isMedicalDirector || reviewerProfile.verificationStatus !== 'VERIFIED') {
        throw new ForbiddenException('Only an active verified Medical Director can conduct privilege reviews');
      }

      const practitionerProfile = await tx.practitionerProfile.findUnique({
        where: { clinicId_id: { clinicId, id: input.practitionerProfileId } },
      });
      if (!practitionerProfile) throw new NotFoundException('Practitioner profile not found');

      // Requirement: Anti-self-review
      if (practitionerProfile.membershipId === ctx.membershipId) {
        throw new ForbiddenException('Medical Director cannot conduct a privilege review or emergency suspension on themselves (anti-self-review rule)');
      }

      const review = await tx.practitionerPrivilegeReview.create({
        data: {
          clinicId,
          practitionerProfileId: input.practitionerProfileId,
          privilegeId: input.privilegeId ?? null,
          reviewType: input.reviewType,
          status: input.status ?? 'COMPLETED',
          conductedByMembershipId: ctx.membershipId,
          findings: input.findings,
          recommendation: input.recommendation,
          effectiveDate: input.effectiveDate ? new Date(input.effectiveDate) : new Date(),
          expirationDate: input.expirationDate ? new Date(input.expirationDate) : null,
          evidenceReference: input.evidenceReference ?? null,
        },
      });

      // Immediate effect for EMERGENCY_SUSPENSION or REINSTATEMENT
      if (input.reviewType === 'EMERGENCY_SUSPENSION' && input.privilegeId) {
        await tx.practitionerClinicalPrivilege.update({
          where: { clinicId_id: { clinicId, id: input.privilegeId } },
          data: { status: 'REVOKED', version: { increment: 1 } },
        });
      } else if (input.reviewType === 'REINSTATEMENT' && input.privilegeId) {
        await tx.practitionerClinicalPrivilege.update({
          where: { clinicId_id: { clinicId, id: input.privilegeId } },
          data: { status: 'APPROVED', version: { increment: 1 } },
        });
      }

      await this.audit.record({
        clinicId,
        actorId: ctx.userId,
        category: 'CLINICAL',
        action: 'clinical.privilege.review',
        targetType: 'PractitionerPrivilegeReview',
        targetId: review.id,
        outcome: 'SUCCESS',
        metadata: {
          reviewType: input.reviewType,
          practitionerProfileId: input.practitionerProfileId,
          privilegeId: input.privilegeId,
        },
      });

      return review;
    });
  }

  async listPrivilegeReviews(proof: VerifiedPrincipal, clinicId: string, practitionerProfileId?: string) {
    return this.tenantDb.withClinicContext(proof, clinicId, ['privileges.read'], async (tx) => {
      return tx.practitionerPrivilegeReview.findMany({
        where: {
          clinicId,
          ...(practitionerProfileId ? { practitionerProfileId } : {}),
        },
        include: {
          conductedBy: { include: { user: true } },
          practitionerProfile: true,
          privilege: true,
        },
        orderBy: { effectiveDate: 'desc' },
      });
    });
  }
}
