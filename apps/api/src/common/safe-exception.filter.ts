import { ArgumentsHost, Catch, ExceptionFilter, HttpException } from '@nestjs/common';
import type { Response } from 'express';
import { SchedulingError, schedulingErrors } from '../appointments/scheduling-error.js';
import { AuthError, authErrors } from '../auth/auth-error.js';

const errors: Record<number, { code: string; message: string }> = {
  400: { code: 'INVALID_REQUEST', message: 'الطلب غير صالح' },
  401: { code: 'UNAUTHENTICATED', message: 'يلزم تسجيل الدخول' },
  403: { code: 'FORBIDDEN', message: 'لا تملك صلاحية تنفيذ هذا الإجراء' },
  404: { code: 'NOT_FOUND', message: 'المورد غير موجود' },
  409: { code: 'CONFLICT', message: 'يتعارض الطلب مع الحالة الحالية' },
  429: { code: 'RATE_LIMITED', message: 'يرجى المحاولة لاحقًا' },
  503: { code: 'SERVICE_UNAVAILABLE', message: 'الخدمة غير متاحة مؤقتًا' },
};

@Catch()
export class SafeExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const status = exception instanceof HttpException ? exception.getStatus() : 500;
    const error = exception instanceof SchedulingError ? { code: exception.code, message: schedulingErrors[exception.code][1] } : exception instanceof AuthError ? { code: exception.code, message: authErrors[exception.code].message } : errors[status] ?? (status >= 500
      ? { code: 'INTERNAL_ERROR', message: 'حدث خطأ داخلي' }
      : { code: 'REQUEST_REJECTED', message: 'تعذر تنفيذ الطلب' });
    // Do not serialize exception messages, request URLs, SQL, stacks or credentials.
    host.switchToHttp().getResponse<Response>().status(status).json({ statusCode: status, error });
  }
}
