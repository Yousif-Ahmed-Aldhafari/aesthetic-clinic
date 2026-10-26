import { IdentityError, identityErrors } from '../identity/identity-error.js';
import { BillingError, billingErrors } from '../billing/billing-error.js';
import { ArgumentsHost, Catch, ExceptionFilter, HttpException } from '@nestjs/common';
import type { Response } from 'express';
import { SchedulingError, schedulingErrors } from '../appointments/scheduling-error.js';
import { AuthError, authErrors } from '../auth/auth-error.js';
import { QueueError, queueErrors } from '../queue/queue-error.js';
import type { AuthRequest } from '../auth/access.js';
import type { AuditEventInput } from '../audit/audit.types.js';

const errors: Record<number, { code: string; message: string }> = {
  400: { code: 'INVALID_REQUEST', message: 'الطلب غير صالح' },
  401: { code: 'UNAUTHENTICATED', message: 'يلزم تسجيل الدخول' },
  403: { code: 'FORBIDDEN', message: 'لا تملك صلاحية تنفيذ هذا الإجراء' },
  404: { code: 'NOT_FOUND', message: 'المورد غير موجود' },
  409: { code: 'CONFLICT', message: 'يتعارض الطلب مع الحالة الحالية' },
  413: { code: 'IMAGE_TOO_LARGE', message: 'حجم الصورة يتجاوز الحد المسموح' },
  429: { code: 'RATE_LIMITED', message: 'يرجى المحاولة لاحقًا' },
  503: { code: 'SERVICE_UNAVAILABLE', message: 'الخدمة غير متاحة مؤقتًا' },
};

@Catch()
export class SafeExceptionFilter implements ExceptionFilter {
  constructor(private readonly auditService?: { recordDirectSafe: (event: AuditEventInput) => Promise<void> }) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const status = exception instanceof HttpException ? exception.getStatus() : 500;
    const error = exception instanceof IdentityError ? {code:exception.code,message:identityErrors[exception.code][1]} : exception instanceof BillingError ? {code:exception.code,message:billingErrors[exception.code][1]} : exception instanceof QueueError ? {code:exception.code,message:queueErrors[exception.code][1]} : exception instanceof SchedulingError ? { code: exception.code, message: schedulingErrors[exception.code][1] } : exception instanceof AuthError ? { code: exception.code, message: authErrors[exception.code].message } : errors[status] ?? (status >= 500
      ? { code: 'INTERNAL_ERROR', message: 'حدث خطأ داخلي' }
      : { code: 'REQUEST_REJECTED', message: 'تعذر تنفيذ الطلب' });

    if (status === 401 || status === 403 || status === 429) {
      const http = host.switchToHttp();
      const req = http.getRequest<AuthRequest>();
      if (req) {
        const correlationId = typeof req.headers?.['x-correlation-id'] === 'string'
          ? req.headers['x-correlation-id']
          : typeof req.headers?.['x-request-id'] === 'string'
          ? req.headers['x-request-id']
          : null;
        this.auditService?.recordDirectSafe({
          clinicId: req.clinicContext?.clinicId ?? req.auth?.session?.selectedClinicId ?? null,
          actorId: req.auth?.user?.id ?? null,
          actorEmail: req.auth?.user?.email ?? null,
          action: status === 401 ? 'security.unauthenticated_access' : status === 403 ? 'security.access_denied' : 'security.rate_limited',
          category: 'SECURITY',
          outcome: 'DENIED',
          ipAddress: req.ip ?? req.socket?.remoteAddress ?? null,
          userAgent: typeof req.headers?.['user-agent'] === 'string' ? req.headers['user-agent'] : null,
          correlationId,
          metadata: { path: req.url?.slice(0, 100), method: req.method, code: error.code },
        }).catch(() => {});
      }
    }

    // Do not serialize exception messages, request URLs, SQL, stacks or credentials.
    host.switchToHttp().getResponse<Response>().status(status).json({ statusCode: status, error });
  }
}
