import { BadRequestException, CanActivate, ExecutionContext, ForbiddenException, Injectable, Optional } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { isUUID } from 'class-validator';
import type { Response } from 'express';
import { ACCESS, STEP_UP, type AccessPolicy, type StepUpPolicy, type AuthRequest } from './access.js';
import { AuthService } from './auth.service.js';
import { CsrfService } from './csrf.service.js';
import { ClinicRepository } from '../prisma/clinic.repository.js';
import { AuthError } from './auth-error.js';
import { MfaService } from './mfa.service.js';

@Injectable()
export class AccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
    private readonly csrf: CsrfService,
    private readonly clinics: ClinicRepository,
    @Optional() private readonly mfa?: MfaService,
  ) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const policy = this.reflector.getAllAndOverride<AccessPolicy | undefined>(ACCESS, [context.getHandler(), context.getClass()]);
    if (!policy) throw new ForbiddenException();
    const request = context.switchToHttp().getRequest<AuthRequest>();
    const response = context.switchToHttp().getResponse<Response>();
    if ((policy.kind !== 'public' || request.path.startsWith('/api/v1/auth/')) && this.csrf.production && !request.secure) throw new AuthError('HTTPS_REQUIRED');
    if (policy.kind !== 'public') await this.auth.authenticate(request, response);
    if (!['GET','HEAD','OPTIONS'].includes(request.method)) this.csrf.validate(request, policy.kind === 'public');
    if (policy.kind === 'clinic') {
      const clinicId = request.params.clinicId;
      if (typeof clinicId !== 'string' || !isUUID(clinicId)) throw new BadRequestException();
      const clinic = await this.clinics.context(request.auth!.principal, clinicId, policy.permissions ?? []);
      if (!policy.permissions?.length || !policy.permissions.every(permission=>clinic.permissions.includes(permission))) throw new ForbiddenException();
      request.clinicContext = clinic;
    }

    const stepUp = this.reflector.getAllAndOverride<StepUpPolicy | undefined>(STEP_UP, [context.getHandler(), context.getClass()]);
    if (stepUp && policy.kind !== 'public') {
      const session = request.auth?.session;
      const user = request.auth?.user;
      if (!session || !user) throw new ForbiddenException();

      const mfaVerifiedAt = session.mfaVerifiedAt;
      const maxAgeMs = stepUp.maxAgeMinutes * 60 * 1000;
      const isFresh = mfaVerifiedAt && (Date.now() - new Date(mfaVerifiedAt).getTime() <= maxAgeMs);

      if (!isFresh) {
        if (this.mfa) {
          const hasMfa = await this.mfa.hasActiveMfa(user.id);
          if (hasMfa) {
            throw new AuthError('MFA_STEP_UP_REQUIRED');
          }
          const targetClinicId = typeof request.params?.clinicId === 'string' ? request.params.clinicId : session.selectedClinicId;
          const isRequired = await this.mfa.isMfaRequiredForUser(user, targetClinicId);
          if (isRequired) {
            throw new AuthError('MFA_SETUP_REQUIRED');
          }
        }
      }
    }

    if (policy.kind !== 'public') await this.auth.recordActivity(request);
    return true;
  }
}
