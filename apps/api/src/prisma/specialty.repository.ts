import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { ClinicalPrivilegeCode, PrivilegeScope } from '../generated/prisma/client.js';
import type { VerifiedPrincipal } from './verified-sessions.js';
import { TenantDatabaseService } from './tenant-database.service.js';
import { AuditRepository } from './audit.repository.js';

export interface CreatePractitionerProfileInput {
  membershipId: string;
  professionalTitleAr: string;
  professionalTitleEn: string;
  licenseNumber?: string;
  licensingAuthority?: string;
  licensingJurisdiction?: string;
  licenseEffectiveDate?: string;
  licenseExpirationDate?: string;
  evidenceReference?: string;
}

export interface UpdatePractitionerProfileInput {
  professionalTitleAr?: string;
  professionalTitleEn?: string;
  licenseNumber?: string;
  licensingAuthority?: string;
  licensingJurisdiction?: string;
  licenseEffectiveDate?: string;
  licenseExpirationDate?: string;
  evidenceReference?: string;
}

export interface AddPractitionerQualificationInput {
  specialtyCode: string;
  qualificationTitle: string;
  qualificationLevel?: string;
  effectiveDate?: string;
  expirationDate?: string;
}

export interface RequestClinicalPrivilegeInput {
  specialtyCode: string;
  privilegeCode: ClinicalPrivilegeCode;
  scope?: PrivilegeScope;
  branchId?: string;
  expirationDate?: string;
}

export interface PrivilegeEvaluationResult {
  allowed: boolean;
  reason?: string;
  isCompatibility?: boolean;
}

@Injectable()
export class SpecialtyRepository {
  constructor(
    private readonly tenantDb: TenantDatabaseService,
    private readonly audit: AuditRepository,
  ) {}

  // 1. Global Specialty Reference Catalog
  async listCatalog(proof: VerifiedPrincipal, clinicId: string) {
    return this.tenantDb.withClinicContext(proof, clinicId, ['specialties.read'], async (tx) => {
      const items = await tx.medicalSpecialty.findMany({
        where: { isActive: true },
        orderBy: [{ classification: 'asc' }, { arabicName: 'asc' }],
      });
      return { items };
    });
  }

  // 2. Clinic Specialty Configuration
  async listClinicSpecialties(proof: VerifiedPrincipal, clinicId: string) {
    return this.tenantDb.withClinicContext(proof, clinicId, ['specialties.read'], async (tx) => {
      const items = await tx.clinicSpecialty.findMany({
        where: { clinicId },
        include: {
          specialty: true,
          branchSpecialties: {
            include: { branch: true },
          },
        },
        orderBy: { specialty: { arabicName: 'asc' } },
      });
      return { items };
    });
  }

  async enableClinicSpecialty(proof: VerifiedPrincipal, clinicId: string, specialtyCode: string) {
    return this.tenantDb.withClinicContext(proof, clinicId, ['specialties.manage'], async (tx, ctx) => {
      const specialty = await tx.medicalSpecialty.findUnique({
        where: { code: specialtyCode },
      });
      if (!specialty || !specialty.isActive) {
        throw new NotFoundException('Medical specialty not found in catalog');
      }

      const existing = await tx.clinicSpecialty.findUnique({
        where: { clinicId_specialtyId: { clinicId, specialtyId: specialty.id } },
      });

      let record;
      if (existing) {
        record = await tx.clinicSpecialty.update({
          where: { clinicId_id: { clinicId, id: existing.id } },
          data: {
            status: 'ACTIVE',
            disabledAt: null,
            version: { increment: 1 },
          },
          include: { specialty: true },
        });
      } else {
        record = await tx.clinicSpecialty.create({
          data: {
            clinicId,
            specialtyId: specialty.id,
            status: 'ACTIVE',
            isCompatibility: false,
            version: 1,
          },
          include: { specialty: true },
        });
      }

      await this.audit.record({
        clinicId: ctx.clinicId,
        actorId: ctx.userId,
        action: 'specialty.clinic.enable',
        category: 'STAFF',
        targetType: 'ClinicSpecialty',
        targetId: record.id,
        outcome: 'SUCCESS',
        metadata: { specialtyCode, specialtyId: specialty.id },
      }, tx);

      return record;
    });
  }

  async disableClinicSpecialty(proof: VerifiedPrincipal, clinicId: string, specialtyCode: string) {
    return this.tenantDb.withClinicContext(proof, clinicId, ['specialties.manage'], async (tx, ctx) => {
      const specialty = await tx.medicalSpecialty.findUnique({
        where: { code: specialtyCode },
      });
      if (!specialty) throw new NotFoundException('Specialty not found');

      const existing = await tx.clinicSpecialty.findUnique({
        where: { clinicId_specialtyId: { clinicId, specialtyId: specialty.id } },
      });
      if (!existing) throw new NotFoundException('Specialty not enabled for this clinic');

      // Concurrency and safe soft disable: do not delete, preserve clinical records
      const record = await tx.clinicSpecialty.update({
        where: { clinicId_id: { clinicId, id: existing.id } },
        data: {
          status: 'INACTIVE',
          disabledAt: new Date(),
          version: { increment: 1 },
        },
        include: { specialty: true },
      });

      // Cascade disable to all branch specialties for this clinic
      await tx.branchSpecialty.updateMany({
        where: { clinicId, specialtyId: specialty.id, status: 'ACTIVE' },
        data: {
          status: 'INACTIVE',
          disabledAt: new Date(),
        },
      });

      await this.audit.record({
        clinicId: ctx.clinicId,
        actorId: ctx.userId,
        action: 'specialty.clinic.disable',
        category: 'STAFF',
        targetType: 'ClinicSpecialty',
        targetId: record.id,
        outcome: 'SUCCESS',
        metadata: { specialtyCode, specialtyId: specialty.id },
      }, tx);

      return record;
    });
  }

  // 3. Branch Specialty Availability
  async listBranchSpecialties(proof: VerifiedPrincipal, clinicId: string, branchId: string) {
    return this.tenantDb.withClinicContext(proof, clinicId, ['specialties.read'], async (tx) => {
      const items = await tx.branchSpecialty.findMany({
        where: { clinicId, branchId },
        include: { specialty: true },
        orderBy: { specialty: { arabicName: 'asc' } },
      });
      return { items };
    });
  }

  async enableBranchSpecialty(proof: VerifiedPrincipal, clinicId: string, branchId: string, specialtyCode: string) {
    return this.tenantDb.withClinicContext(proof, clinicId, ['specialties.manage'], async (tx, ctx) => {
      const specialty = await tx.medicalSpecialty.findUnique({
        where: { code: specialtyCode },
      });
      if (!specialty) throw new NotFoundException('Specialty not found');

      // Requirement 4.3: Branch cannot enable a specialty that is disabled for parent clinic
      const clinicSpecialty = await tx.clinicSpecialty.findUnique({
        where: { clinicId_specialtyId: { clinicId, specialtyId: specialty.id } },
      });
      if (!clinicSpecialty || clinicSpecialty.status !== 'ACTIVE') {
        throw new BadRequestException('Cannot enable specialty on branch when disabled for the parent clinic');
      }

      const branch = await tx.clinicBranch.findUnique({
        where: { clinicId_id: { clinicId, id: branchId } },
      });
      if (!branch || branch.status !== 'ACTIVE') {
        throw new NotFoundException('Active branch not found');
      }

      const existing = await tx.branchSpecialty.findUnique({
        where: { branchId_specialtyId: { branchId, specialtyId: specialty.id } },
      });

      let record;
      if (existing) {
        record = await tx.branchSpecialty.update({
          where: { clinicId_id: { clinicId, id: existing.id } },
          data: {
            status: 'ACTIVE',
            disabledAt: null,
            version: { increment: 1 },
          },
          include: { specialty: true },
        });
      } else {
        record = await tx.branchSpecialty.create({
          data: {
            clinicId,
            branchId,
            specialtyId: specialty.id,
            status: 'ACTIVE',
            isCompatibility: false,
            version: 1,
          },
          include: { specialty: true },
        });
      }

      await this.audit.record({
        clinicId: ctx.clinicId,
        actorId: ctx.userId,
        action: 'specialty.branch.enable',
        category: 'STAFF',
        targetType: 'BranchSpecialty',
        targetId: record.id,
        metadata: { branchId, specialtyCode, specialtyId: specialty.id },
      }, tx);

      return record;
    });
  }

  async disableBranchSpecialty(proof: VerifiedPrincipal, clinicId: string, branchId: string, specialtyCode: string) {
    return this.tenantDb.withClinicContext(proof, clinicId, ['specialties.manage'], async (tx, ctx) => {
      const specialty = await tx.medicalSpecialty.findUnique({
        where: { code: specialtyCode },
      });
      if (!specialty) throw new NotFoundException('Specialty not found');

      const existing = await tx.branchSpecialty.findUnique({
        where: { branchId_specialtyId: { branchId, specialtyId: specialty.id } },
      });
      if (!existing) throw new NotFoundException('Specialty not enabled on this branch');

      const record = await tx.branchSpecialty.update({
        where: { clinicId_id: { clinicId, id: existing.id } },
        data: {
          status: 'INACTIVE',
          disabledAt: new Date(),
          version: { increment: 1 },
        },
        include: { specialty: true },
      });

      await this.audit.record({
        clinicId: ctx.clinicId,
        actorId: ctx.userId,
        action: 'specialty.branch.disable',
        category: 'STAFF',
        targetType: 'BranchSpecialty',
        targetId: record.id,
        metadata: { branchId, specialtyCode, specialtyId: specialty.id },
      }, tx);

      return record;
    });
  }

  // 4. Practitioner Profile Management
  async listPractitioners(proof: VerifiedPrincipal, clinicId: string) {
    return this.tenantDb.withClinicContext(proof, clinicId, ['practitioners.profiles.read'], async (tx) => {
      const items = await tx.practitionerProfile.findMany({
        where: { clinicId },
        include: {
          membership: {
            include: { user: { select: { id: true, name: true, email: true } } },
          },
          verifiedBy: {
            include: { user: { select: { id: true, name: true } } },
          },
          qualifications: {
            include: { specialty: true },
          },
          clinicalPrivileges: {
            include: { specialty: true, branch: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      });
      return { items };
    });
  }

  async getPractitionerProfile(proof: VerifiedPrincipal, clinicId: string, membershipId: string) {
    return this.tenantDb.withClinicContext(proof, clinicId, ['practitioners.profiles.read'], async (tx) => {
      const profile = await tx.practitionerProfile.findUnique({
        where: { clinicId_membershipId: { clinicId, membershipId } },
        include: {
          membership: {
            include: { user: { select: { id: true, name: true, email: true } } },
          },
          verifiedBy: {
            include: { user: { select: { id: true, name: true } } },
          },
          qualifications: {
            include: {
              specialty: true,
              verifiedBy: {
                include: { user: { select: { id: true, name: true } } },
              },
            },
          },
          clinicalPrivileges: {
            include: {
              specialty: true,
              branch: true,
              approvedBy: {
                include: { user: { select: { id: true, name: true } } },
              },
            },
          },
        },
      });
      if (!profile) throw new NotFoundException('Practitioner profile not found');
      return profile;
    });
  }

  async upsertPractitionerProfile(
    proof: VerifiedPrincipal,
    clinicId: string,
    input: CreatePractitionerProfileInput,
  ) {
    return this.tenantDb.withClinicContext(proof, clinicId, ['practitioners.profiles.manage'], async (tx, ctx) => {
      // Must be doctor membership
      const membership = await tx.clinicMembership.findUnique({
        where: { clinicId_id: { clinicId, id: input.membershipId } },
      });
      if (!membership || membership.status !== 'ACTIVE' || membership.role !== 'DOCTOR') {
        throw new BadRequestException('Practitioner profile requires an active DOCTOR membership');
      }

      // Check if updating own profile or administrator updating
      const isSelf = ctx.membershipId === input.membershipId;
      const isAdmin = ctx.permissions.includes('staff.manage');
      if (!isSelf && !isAdmin) {
        throw new ForbiddenException('Cannot edit another practitioner profile without administrative permission');
      }

      const existing = await tx.practitionerProfile.findUnique({
        where: { clinicId_membershipId: { clinicId, membershipId: input.membershipId } },
      });

      let record;
      if (existing) {
        record = await tx.practitionerProfile.update({
          where: { clinicId_id: { clinicId, id: existing.id } },
          data: {
            professionalTitleAr: input.professionalTitleAr,
            professionalTitleEn: input.professionalTitleEn,
            licenseNumber: input.licenseNumber ?? existing.licenseNumber,
            licensingAuthority: input.licensingAuthority ?? existing.licensingAuthority,
            licensingJurisdiction: input.licensingJurisdiction ?? existing.licensingJurisdiction,
            licenseEffectiveDate: input.licenseEffectiveDate ? new Date(input.licenseEffectiveDate) : existing.licenseEffectiveDate,
            licenseExpirationDate: input.licenseExpirationDate ? new Date(input.licenseExpirationDate) : existing.licenseExpirationDate,
            evidenceReference: input.evidenceReference ?? existing.evidenceReference,
            // If license changed, reset verification to PENDING_VERIFICATION
            verificationStatus: input.licenseNumber && input.licenseNumber !== existing.licenseNumber
              ? 'PENDING_VERIFICATION'
              : existing.verificationStatus,
            version: { increment: 1 },
          },
          include: { membership: { include: { user: true } } },
        });
      } else {
        record = await tx.practitionerProfile.create({
          data: {
            clinicId,
            membershipId: input.membershipId,
            professionalTitleAr: input.professionalTitleAr,
            professionalTitleEn: input.professionalTitleEn,
            licenseNumber: input.licenseNumber ?? null,
            licensingAuthority: input.licensingAuthority ?? null,
            licensingJurisdiction: input.licensingJurisdiction ?? null,
            licenseEffectiveDate: input.licenseEffectiveDate ? new Date(input.licenseEffectiveDate) : null,
            licenseExpirationDate: input.licenseExpirationDate ? new Date(input.licenseExpirationDate) : null,
            evidenceReference: input.evidenceReference ?? null,
            verificationStatus: input.licenseNumber ? 'PENDING_VERIFICATION' : 'SELF_REPORTED',
            isMedicalDirector: false,
            version: 1,
          },
          include: { membership: { include: { user: true } } },
        });
      }

      await this.audit.record({
        clinicId: ctx.clinicId,
        actorId: ctx.userId,
        action: existing ? 'practitioner.profile.update' : 'practitioner.profile.create',
        category: 'STAFF',
        targetType: 'PractitionerProfile',
        targetId: record.id,
        outcome: 'SUCCESS',
        metadata: { membershipId: input.membershipId, verificationStatus: record.verificationStatus },
      }, tx);

      return record;
    });
  }

  // 5. Medical Director Governance & Bootstrap
  async designateMedicalDirector(
    proof: VerifiedPrincipal,
    clinicId: string,
    membershipId: string,
  ) {
    // Medical Director appointment requires CLINIC_OWNER authority
    return this.tenantDb.withClinicContext(proof, clinicId, ['staff.manage'], async (tx, ctx) => {
      if (ctx.role !== 'CLINIC_OWNER') {
        throw new ForbiddenException('Only clinic owner can designate the Medical Director');
      }

      const profile = await tx.practitionerProfile.findUnique({
        where: { clinicId_membershipId: { clinicId, membershipId } },
      });
      if (!profile) {
        throw new BadRequestException('Practitioner profile must be created before designation as Medical Director');
      }

      if (!profile.licenseNumber || !profile.licensingAuthority) {
        throw new BadRequestException('Medical Director must have documented professional license credentials');
      }

      const updated = await tx.practitionerProfile.update({
        where: { clinicId_id: { clinicId, id: profile.id } },
        data: {
          isMedicalDirector: true,
          verificationStatus: 'VERIFIED',
          verifiedByMembershipId: ctx.membershipId,
          verifiedAt: new Date(),
          version: { increment: 1 },
        },
      });

      await this.audit.record({
        clinicId: ctx.clinicId,
        actorId: ctx.userId,
        action: 'practitioner.medical_director.designate',
        category: 'STAFF',
        targetType: 'PractitionerProfile',
        targetId: updated.id,
        outcome: 'SUCCESS',
        metadata: { membershipId, designatedBy: ctx.membershipId },
      }, tx);

      return updated;
    });
  }

  // 6. Practitioner Specialty Qualifications
  async addPractitionerQualification(
    proof: VerifiedPrincipal,
    clinicId: string,
    membershipId: string,
    input: AddPractitionerQualificationInput,
  ) {
    return this.tenantDb.withClinicContext(proof, clinicId, ['practitioners.profiles.manage'], async (tx, ctx) => {
      const profile = await tx.practitionerProfile.findUnique({
        where: { clinicId_membershipId: { clinicId, membershipId } },
      });
      if (!profile) throw new NotFoundException('Practitioner profile not found');

      const specialty = await tx.medicalSpecialty.findUnique({
        where: { code: input.specialtyCode },
      });
      if (!specialty || !specialty.isActive) throw new NotFoundException('Medical specialty not found in catalog');

      const existing = await tx.practitionerSpecialty.findUnique({
        where: { practitionerProfileId_specialtyId: { practitionerProfileId: profile.id, specialtyId: specialty.id } },
      });
      if (existing) throw new ConflictException('Qualification for this specialty already exists on profile');

      const qualification = await tx.practitionerSpecialty.create({
        data: {
          clinicId,
          practitionerProfileId: profile.id,
          specialtyId: specialty.id,
          qualificationTitle: input.qualificationTitle,
          qualificationLevel: input.qualificationLevel ?? 'SPECIALIST',
          status: 'PENDING_VERIFICATION',
          effectiveDate: input.effectiveDate ? new Date(input.effectiveDate) : new Date(),
          expirationDate: input.expirationDate ? new Date(input.expirationDate) : null,
          version: 1,
        },
        include: { specialty: true },
      });

      await this.audit.record({
        clinicId: ctx.clinicId,
        actorId: ctx.userId,
        action: 'practitioner.qualification.add',
        category: 'STAFF',
        targetType: 'PractitionerSpecialty',
        targetId: qualification.id,
        outcome: 'SUCCESS',
        metadata: { profileId: profile.id, specialtyCode: input.specialtyCode },
      }, tx);

      return qualification;
    });
  }

  async verifyPractitionerQualification(
    proof: VerifiedPrincipal,
    clinicId: string,
    qualificationId: string,
  ) {
    return this.tenantDb.withClinicContext(proof, clinicId, ['practitioners.profiles.read'], async (tx, ctx) => {
      // Must be an active Medical Director
      const reviewerProfile = await tx.practitionerProfile.findUnique({
        where: { clinicId_membershipId: { clinicId, membershipId: ctx.membershipId } },
      });
      if (!reviewerProfile || !reviewerProfile.isMedicalDirector || reviewerProfile.verificationStatus !== 'VERIFIED') {
        throw new ForbiddenException('Only an active verified Medical Director can verify medical qualifications');
      }

      const qualification = await tx.practitionerSpecialty.findUnique({
        where: { clinicId_id: { clinicId, id: qualificationId } },
        include: { practitionerProfile: true },
      });
      if (!qualification) throw new NotFoundException('Qualification not found');

      // Requirement 9: Reject self-approval
      if (qualification.practitionerProfile.membershipId === ctx.membershipId) {
        throw new ForbiddenException('Self-approval of credentials is prohibited');
      }

      const verified = await tx.practitionerSpecialty.update({
        where: { clinicId_id: { clinicId, id: qualificationId } },
        data: {
          status: 'VERIFIED',
          verifiedByMembershipId: ctx.membershipId,
          verifiedAt: new Date(),
          rejectionReason: null,
          version: { increment: 1 },
        },
        include: { specialty: true },
      });

      await this.audit.record({
        clinicId: ctx.clinicId,
        actorId: ctx.userId,
        action: 'practitioner.qualification.verify',
        category: 'STAFF',
        targetType: 'PractitionerSpecialty',
        targetId: verified.id,
        outcome: 'SUCCESS',
        metadata: { qualificationId, verifiedBy: ctx.membershipId },
      }, tx);

      return verified;
    });
  }

  async rejectPractitionerQualification(
    proof: VerifiedPrincipal,
    clinicId: string,
    qualificationId: string,
    reason: string,
  ) {
    return this.tenantDb.withClinicContext(proof, clinicId, ['practitioners.profiles.read'], async (tx, ctx) => {
      const reviewerProfile = await tx.practitionerProfile.findUnique({
        where: { clinicId_membershipId: { clinicId, membershipId: ctx.membershipId } },
      });
      if (!reviewerProfile || !reviewerProfile.isMedicalDirector) {
        throw new ForbiddenException('Only Medical Director can reject qualifications');
      }

      const qualification = await tx.practitionerSpecialty.findUnique({
        where: { clinicId_id: { clinicId, id: qualificationId } },
        include: { practitionerProfile: true },
      });
      if (!qualification) throw new NotFoundException('Qualification not found');

      if (qualification.practitionerProfile.membershipId === ctx.membershipId) {
        throw new ForbiddenException('Self-approval or self-rejection of credentials is prohibited');
      }

      const rejected = await tx.practitionerSpecialty.update({
        where: { clinicId_id: { clinicId, id: qualificationId } },
        data: {
          status: 'REJECTED',
          rejectionReason: reason,
          verifiedByMembershipId: ctx.membershipId,
          verifiedAt: new Date(),
          version: { increment: 1 },
        },
        include: { specialty: true },
      });

      await this.audit.record({
        clinicId: ctx.clinicId,
        actorId: ctx.userId,
        action: 'practitioner.qualification.reject',
        category: 'STAFF',
        targetType: 'PractitionerSpecialty',
        targetId: rejected.id,
        outcome: 'SUCCESS',
        metadata: { qualificationId, reason, rejectedBy: ctx.membershipId },
      }, tx);

      return rejected;
    });
  }

  // 7. Clinical Privilege Engine
  async requestClinicalPrivilege(
    proof: VerifiedPrincipal,
    clinicId: string,
    membershipId: string,
    input: RequestClinicalPrivilegeInput,
  ) {
    return this.tenantDb.withClinicContext(proof, clinicId, ['privileges.request'], async (tx, ctx) => {
      const profile = await tx.practitionerProfile.findUnique({
        where: { clinicId_membershipId: { clinicId, membershipId } },
      });
      if (!profile) throw new NotFoundException('Practitioner profile not found');

      const specialty = await tx.medicalSpecialty.findUnique({
        where: { code: input.specialtyCode },
      });
      if (!specialty || !specialty.isActive) throw new NotFoundException('Specialty not found');

      // Check if branch scoped
      if (input.scope === 'BRANCH_SCOPED' && !input.branchId) {
        throw new BadRequestException('Branch ID required when requesting branch-scoped privilege');
      }

      // Check if qualification exists
      const qualification = await tx.practitionerSpecialty.findUnique({
        where: { practitionerProfileId_specialtyId: { practitionerProfileId: profile.id, specialtyId: specialty.id } },
      });

      // Ensure branch specialty is active if branch scoped
      if (input.branchId) {
        const branchSpec = await tx.branchSpecialty.findUnique({
          where: { branchId_specialtyId: { branchId: input.branchId, specialtyId: specialty.id } },
        });
        if (!branchSpec || branchSpec.status !== 'ACTIVE') {
          throw new BadRequestException('Specialty is not active at the specified branch');
        }
      }

      const existing = await tx.practitionerClinicalPrivilege.findFirst({
        where: {
          practitionerProfileId: profile.id,
          specialtyId: specialty.id,
          privilegeCode: input.privilegeCode,
          branchId: input.branchId ?? null,
        },
      });

      let record;
      if (existing) {
        if (existing.status === 'APPROVED') {
          throw new ConflictException('Clinical privilege is already approved for this practitioner');
        }
        record = await tx.practitionerClinicalPrivilege.update({
          where: { clinicId_id: { clinicId, id: existing.id } },
          data: {
            status: 'REQUESTED',
            scope: input.scope ?? 'CLINIC_WIDE',
            practitionerSpecialtyId: qualification?.id ?? null,
            expirationDate: input.expirationDate ? new Date(input.expirationDate) : null,
            version: { increment: 1 },
          },
          include: { specialty: true, branch: true },
        });
      } else {
        record = await tx.practitionerClinicalPrivilege.create({
          data: {
            clinicId,
            branchId: input.branchId ?? null,
            practitionerProfileId: profile.id,
            specialtyId: specialty.id,
            practitionerSpecialtyId: qualification?.id ?? null,
            privilegeCode: input.privilegeCode,
            scope: input.scope ?? 'CLINIC_WIDE',
            status: 'REQUESTED',
            expirationDate: input.expirationDate ? new Date(input.expirationDate) : null,
            version: 1,
          },
          include: { specialty: true, branch: true },
        });
      }

      await this.audit.record({
        clinicId: ctx.clinicId,
        actorId: ctx.userId,
        action: 'practitioner.privilege.request',
        category: 'STAFF',
        targetType: 'PractitionerClinicalPrivilege',
        targetId: record.id,
        outcome: 'SUCCESS',
        metadata: { membershipId, privilegeCode: input.privilegeCode, specialtyCode: input.specialtyCode },
      }, tx);

      return record;
    });
  }

  async approveClinicalPrivilege(
    proof: VerifiedPrincipal,
    clinicId: string,
    privilegeId: string,
  ) {
    return this.tenantDb.withClinicContext(proof, clinicId, ['privileges.read'], async (tx, ctx) => {
      // Must be active verified Medical Director
      const reviewerProfile = await tx.practitionerProfile.findUnique({
        where: { clinicId_membershipId: { clinicId, membershipId: ctx.membershipId } },
      });
      if (!reviewerProfile || !reviewerProfile.isMedicalDirector || reviewerProfile.verificationStatus !== 'VERIFIED') {
        throw new ForbiddenException('Only an active verified Medical Director can approve clinical privileges');
      }

      const privilege = await tx.practitionerClinicalPrivilege.findUnique({
        where: { clinicId_id: { clinicId, id: privilegeId } },
        include: { practitionerProfile: true, specialty: true },
      });
      if (!privilege) throw new NotFoundException('Clinical privilege record not found');

      // Requirement 9: Reject self-approval
      if (privilege.practitionerProfile.membershipId === ctx.membershipId) {
        throw new ForbiddenException('Self-approval of clinical privileges is prohibited');
      }

      // Requirement 8: Evaluate verified qualification
      const qualification = await tx.practitionerSpecialty.findUnique({
        where: {
          practitionerProfileId_specialtyId: {
            practitionerProfileId: privilege.practitionerProfileId,
            specialtyId: privilege.specialtyId,
          },
        },
      });
      if (!qualification || qualification.status !== 'VERIFIED') {
        throw new BadRequestException('Practitioner must have a VERIFIED qualification in this specialty before privilege approval');
      }

      const approved = await tx.practitionerClinicalPrivilege.update({
        where: { clinicId_id: { clinicId, id: privilegeId } },
        data: {
          status: 'APPROVED',
          approvedByMembershipId: ctx.membershipId,
          approvedAt: new Date(),
          practitionerSpecialtyId: qualification.id,
          rejectionReason: null,
          version: { increment: 1 },
        },
        include: { specialty: true, branch: true },
      });

      await this.audit.record({
        clinicId: ctx.clinicId,
        actorId: ctx.userId,
        action: 'practitioner.privilege.approve',
        category: 'STAFF',
        targetType: 'PractitionerClinicalPrivilege',
        targetId: approved.id,
        outcome: 'SUCCESS',
        metadata: { privilegeId, approvedBy: ctx.membershipId, privilegeCode: privilege.privilegeCode },
      }, tx);

      return approved;
    });
  }

  async revokeClinicalPrivilege(
    proof: VerifiedPrincipal,
    clinicId: string,
    privilegeId: string,
    reason: string,
  ) {
    return this.tenantDb.withClinicContext(proof, clinicId, ['privileges.read'], async (tx, ctx) => {
      const reviewerProfile = await tx.practitionerProfile.findUnique({
        where: { clinicId_membershipId: { clinicId, membershipId: ctx.membershipId } },
      });
      if (!reviewerProfile || !reviewerProfile.isMedicalDirector) {
        throw new ForbiddenException('Only Medical Director can revoke clinical privileges');
      }

      const privilege = await tx.practitionerClinicalPrivilege.findUnique({
        where: { clinicId_id: { clinicId, id: privilegeId } },
      });
      if (!privilege) throw new NotFoundException('Privilege not found');

      const revoked = await tx.practitionerClinicalPrivilege.update({
        where: { clinicId_id: { clinicId, id: privilegeId } },
        data: {
          status: 'REVOKED',
          rejectionReason: reason,
          approvedByMembershipId: ctx.membershipId,
          version: { increment: 1 },
        },
      });

      await this.audit.record({
        clinicId: ctx.clinicId,
        actorId: ctx.userId,
        action: 'practitioner.privilege.revoke',
        category: 'STAFF',
        targetType: 'PractitionerClinicalPrivilege',
        targetId: revoked.id,
        outcome: 'SUCCESS',
        metadata: { privilegeId, reason, revokedBy: ctx.membershipId },
      }, tx);

      return revoked;
    });
  }

  async listApprovalQueue(proof: VerifiedPrincipal, clinicId: string) {
    return this.tenantDb.withClinicContext(proof, clinicId, ['privileges.read'], async (tx) => {
      const pendingQualifications = await tx.practitionerSpecialty.findMany({
        where: { clinicId, status: 'PENDING_VERIFICATION' },
        include: {
          specialty: true,
          practitionerProfile: {
            include: { membership: { include: { user: { select: { id: true, name: true, email: true } } } } },
          },
        },
        orderBy: { createdAt: 'asc' },
      });

      const pendingPrivileges = await tx.practitionerClinicalPrivilege.findMany({
        where: { clinicId, status: 'REQUESTED' },
        include: {
          specialty: true,
          branch: true,
          practitionerProfile: {
            include: { membership: { include: { user: { select: { id: true, name: true, email: true } } } } },
          },
        },
        orderBy: { createdAt: 'asc' },
      });

      return {
        pendingQualifications,
        pendingPrivileges,
      };
    });
  }

  // 8. Runtime Clinical Privilege Authorization Evaluator
  async evaluatePrivilege(
    proof: VerifiedPrincipal,
    clinicId: string,
    params: {
      practitionerMembershipId: string;
      specialtyCode: string;
      privilegeCode: ClinicalPrivilegeCode;
      branchId?: string | null;
      isAestheticExecution?: boolean;
    },
  ): Promise<PrivilegeEvaluationResult> {
    return this.tenantDb.withClinicContext(proof, clinicId, ['clinic.branding.read'], async (tx) => {
      const now = new Date();

      // Step 1: Principal & Practitioner membership check
      const membership = await tx.clinicMembership.findUnique({
        where: { clinicId_id: { clinicId, id: params.practitionerMembershipId } },
      });
      if (!membership || membership.status !== 'ACTIVE' || membership.role !== 'DOCTOR') {
        return { allowed: false, reason: 'Practitioner membership is not active DOCTOR' };
      }

      // Step 2: Clinic specialty enablement
      const specialty = await tx.medicalSpecialty.findUnique({
        where: { code: params.specialtyCode },
      });
      if (!specialty || !specialty.isActive) {
        return { allowed: false, reason: 'Medical specialty not active in catalog' };
      }

      const clinicSpec = await tx.clinicSpecialty.findUnique({
        where: { clinicId_specialtyId: { clinicId, specialtyId: specialty.id } },
      });
      if (!clinicSpec || clinicSpec.status !== 'ACTIVE') {
        return { allowed: false, reason: 'Specialty is disabled for clinic' };
      }

      // Step 3: Branch specialty enablement (if branch is specified)
      if (params.branchId) {
        const branchSpec = await tx.branchSpecialty.findUnique({
          where: { branchId_specialtyId: { branchId: params.branchId, specialtyId: specialty.id } },
        });
        if (!branchSpec || branchSpec.status !== 'ACTIVE') {
          return { allowed: false, reason: 'Specialty is disabled for branch' };
        }
      }

      // Step 4: Backward Compatibility Policy for Aesthetic Clinics (Section 5)
      // If performing aesthetic procedures or documenting aesthetic consultations under existing workflows:
      if (
        params.specialtyCode === 'AESTHETICS' &&
        params.isAestheticExecution &&
        (params.privilegeCode === 'CLINICAL_PROCEDURE_PERFORM' || params.privilegeCode === 'CLINICAL_ENCOUNTER_DOCUMENT')
      ) {
        return { allowed: true, isCompatibility: true, reason: 'AESTHETIC_BACKWARD_COMPATIBILITY' };
      }

      // Step 5: Professional Identity & Qualifications
      const profile = await tx.practitionerProfile.findUnique({
        where: { clinicId_membershipId: { clinicId, membershipId: params.practitionerMembershipId } },
      });
      if (!profile || profile.verificationStatus === 'SUSPENDED' || profile.verificationStatus === 'REJECTED') {
        return { allowed: false, reason: 'Practitioner profile not active or rejected' };
      }

      if (profile.licenseExpirationDate && profile.licenseExpirationDate <= now) {
        return { allowed: false, reason: 'Practitioner medical license has expired' };
      }

      // Step 6: Verified Specialty Qualification
      const qualification = await tx.practitionerSpecialty.findUnique({
        where: {
          practitionerProfileId_specialtyId: {
            practitionerProfileId: profile.id,
            specialtyId: specialty.id,
          },
        },
      });
      if (!qualification || qualification.status !== 'VERIFIED') {
        return { allowed: false, reason: 'Practitioner lacks verified qualification in this specialty' };
      }

      if (qualification.expirationDate && qualification.expirationDate <= now) {
        return { allowed: false, reason: 'Specialty qualification credential has expired' };
      }

      // Step 7: Active, Approved Clinical Privilege
      // Look for clinic-wide privilege or branch-scoped privilege
      const privilege = await tx.practitionerClinicalPrivilege.findFirst({
        where: {
          clinicId,
          practitionerProfileId: profile.id,
          specialtyId: specialty.id,
          privilegeCode: params.privilegeCode,
          status: 'APPROVED',
          OR: [
            { scope: 'CLINIC_WIDE' },
            ...(params.branchId ? [{ scope: 'BRANCH_SCOPED' as const, branchId: params.branchId }] : []),
          ],
        },
      });

      if (!privilege) {
        return { allowed: false, reason: 'No approved clinical privilege found for this action and scope' };
      }

      if (privilege.expirationDate && privilege.expirationDate <= now) {
        return { allowed: false, reason: 'Clinical privilege grant has expired' };
      }

      return { allowed: true };
    });
  }
}
