import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

export interface PatientPrincipal {
  clinicId: string;
  patientAccountId: string;
  patientId: string;
  sessionId: string;
  sessionToken: string;
  csrfHash: string;
}

export interface PatientAuthRequest extends Request {
  patientPrincipal?: PatientPrincipal;
}

export const CurrentPatient = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): PatientPrincipal => {
    const request = ctx.switchToHttp().getRequest<PatientAuthRequest>();
    if (!request.patientPrincipal) {
      throw new Error('PatientPrincipal not found on request');
    }
    return request.patientPrincipal;
  },
);
