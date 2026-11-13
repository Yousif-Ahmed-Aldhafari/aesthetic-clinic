import { CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { ClinicalPrivilegeCode } from '../generated/prisma/client.js';
import type { AuthRequest } from '../auth/access.js';
import { SpecialtyRepository } from '../prisma/specialty.repository.js';

export const REQUIRE_SPECIALTY_KEY = 'require_specialty';
export const REQUIRE_CLINICAL_PRIVILEGE_KEY = 'require_clinical_privilege';

export const RequireSpecialty = (specialtyCode: string) =>
  SetMetadata(REQUIRE_SPECIALTY_KEY, specialtyCode);

export const RequireClinicalPrivilege = (privilegeCode: ClinicalPrivilegeCode) =>
  SetMetadata(REQUIRE_CLINICAL_PRIVILEGE_KEY, privilegeCode);

@Injectable()
export class SpecialtyPrivilegeGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly specialtyRepo: SpecialtyRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredSpecialty = this.reflector.getAllAndOverride<string | undefined>(
      REQUIRE_SPECIALTY_KEY,
      [context.getHandler(), context.getClass()],
    );

    const requiredPrivilege = this.reflector.getAllAndOverride<ClinicalPrivilegeCode | undefined>(
      REQUIRE_CLINICAL_PRIVILEGE_KEY,
      [context.getHandler(), context.getClass()],
    );

    // If neither is required, pass through
    if (!requiredSpecialty && !requiredPrivilege) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthRequest>();
    const principal = request.auth?.principal;
    if (!principal) {
      throw new ForbiddenException('Authenticated principal required');
    }

    const paramClinicId = request.params?.clinicId;
    const bodyClinicId = (request.body as { clinicId?: string } | undefined)?.clinicId;
    const clinicId = typeof paramClinicId === 'string'
      ? paramClinicId
      : Array.isArray(paramClinicId)
      ? paramClinicId[0]
      : typeof bodyClinicId === 'string'
      ? bodyClinicId
      : undefined;

    if (!clinicId) {
      throw new ForbiddenException('Clinic context required for specialty authorization');
    }

    const membership = request.auth?.user.memberships.find(m => m.clinicId === clinicId && m.status === 'ACTIVE');
    const membershipId = membership?.id ?? '';
    const branchId = request.auth?.session.selectedBranchId ?? null;

    // Evaluate trusted database state
    const specialtyCode = requiredSpecialty ?? 'GENERAL_MEDICINE';
    const privilegeCode = requiredPrivilege ?? ('CLINICAL_ENCOUNTER_DOCUMENT' as ClinicalPrivilegeCode);

    const evaluation = await this.specialtyRepo.evaluatePrivilege(principal, clinicId, {
      practitionerMembershipId: membershipId,
      specialtyCode,
      privilegeCode,
      branchId,
      isAestheticExecution: (request.body as { isAesthetic?: boolean } | undefined)?.isAesthetic ?? false,
    });

    if (!evaluation.allowed) {
      throw new ForbiddenException(evaluation.reason ?? 'Insufficient clinical privileges or specialty not enabled');
    }

    return true;
  }
}
