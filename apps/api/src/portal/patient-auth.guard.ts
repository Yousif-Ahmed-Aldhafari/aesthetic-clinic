import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { CsrfService } from '../auth/csrf.service.js';
import { PatientPortalRepository } from '../prisma/patient-portal.repository.js';
import type { PatientAuthRequest } from './patient-principal.js';

@Injectable()
export class PatientAuthGuard implements CanActivate {
  constructor(
    private readonly portalRepo: PatientPortalRepository,
    private readonly csrf: CsrfService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<PatientAuthRequest>();

    // Resolve raw patient session token from HttpOnly cookie or Authorization header
    let rawSession: string | undefined = request.cookies?.[this.csrf.patientSessionCookie];
    if (!rawSession && typeof request.headers.authorization === 'string') {
      const parts = request.headers.authorization.split(' ');
      if (parts.length === 2 && parts[0] === 'Bearer') {
        rawSession = parts[1];
      }
    }

    if (!rawSession || typeof rawSession !== 'string') {
      throw new UnauthorizedException('UNAUTHORIZED_PATIENT');
    }

    const principal = await this.portalRepo.validateSession(rawSession);
    if (!principal) {
      throw new UnauthorizedException('SESSION_EXPIRED');
    }

    // CSRF check on state-mutating HTTP methods
    const method = request.method?.toUpperCase();
    if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(method)) {
      this.csrf.validatePatient(request as any, principal.csrfHash);
    }

    request.patientPrincipal = principal;
    return true;
  }
}
