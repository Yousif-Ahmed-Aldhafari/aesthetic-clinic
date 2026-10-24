import { BadRequestException, CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { isUUID } from 'class-validator';
import type { Response } from 'express';
import { ACCESS, type AccessPolicy, type AuthRequest } from './access.js';
import { AuthService } from './auth.service.js';
import { CsrfService } from './csrf.service.js';
import { AuthError } from './auth-error.js';

@Injectable()
export class AccessGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly auth: AuthService, private readonly csrf: CsrfService) {}
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
      const clinic = await this.auth.clinic(request.auth!.user.id, clinicId);
      if (!policy.permissions?.length || !policy.permissions.every(permission=>clinic.permissions.includes(permission))) throw new ForbiddenException();
      request.clinicContext = clinic;
    }
    if (policy.kind !== 'public') await this.auth.recordActivity(request);
    return true;
  }
}
