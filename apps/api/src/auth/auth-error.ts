import { HttpException } from '@nestjs/common';

export const authErrors = {
  AUTH_FAILED: { status: 401, message: 'البريد الإلكتروني أو كلمة المرور غير صحيحة' },
  SESSION_EXPIRED: { status: 401, message: 'انتهت الجلسة أو تغيرت صلاحياتك. يرجى تسجيل الدخول مجددًا' },
  CSRF_INVALID: { status: 403, message: 'تعذر التحقق من الطلب. حدّث الصفحة ثم حاول مجددًا' },
  HTTPS_REQUIRED: { status: 403, message: 'يلزم اتصال آمن لتسجيل الدخول' },
} as const;
export class AuthError extends HttpException {
  constructor(readonly code: keyof typeof authErrors) { super(authErrors[code].message, authErrors[code].status); }
}
