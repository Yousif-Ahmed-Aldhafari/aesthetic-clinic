import { HttpException } from '@nestjs/common';

export const authErrors = {
  AUTH_FAILED: { status: 401, message: 'البريد الإلكتروني أو كلمة المرور غير صحيحة' },
  SESSION_EXPIRED: { status: 401, message: 'انتهت الجلسة أو تغيرت صلاحياتك. يرجى تسجيل الدخول مجددًا' },
  CSRF_INVALID: { status: 403, message: 'تعذر التحقق من الطلب. حدّث الصفحة ثم حاول مجددًا' },
  HTTPS_REQUIRED: { status: 403, message: 'يلزم اتصال آمن لتسجيل الدخول' },
  MFA_REQUIRED: { status: 403, message: 'يلزم التحقق بخطوتين للمتابعة' },
  MFA_SETUP_REQUIRED: { status: 403, message: 'يلزم إعداد التحقق بخطوتين لحسابك للمتابعة' },
  MFA_STEP_UP_REQUIRED: { status: 403, message: 'يلزم تأكيد الهوية للعمليات الحساسة' },
  MFA_INVALID_CODE: { status: 400, message: 'رمز التحقق غير صحيح أو منتهي الصلاحية' },
  MFA_INVALID_PASSWORD: { status: 400, message: 'كلمة المرور الحالية غير صحيحة' },
  MFA_ALREADY_ACTIVE: { status: 409, message: 'التحقق بخطوتين مفعّل مسبقًا' },
  MFA_NOT_ACTIVE: { status: 400, message: 'التحقق بخطوتين غير مفعّل' },
  MFA_CHALLENGE_EXPIRED: { status: 401, message: 'انتهت صلاحية جلسة التحقق. يرجى تسجيل الدخول مجددًا' },
  MFA_CHALLENGE_LOCKED: { status: 429, message: 'تم تجاوز عدد محاولات التحقق المسموح بها' },
  RECOVERY_CODE_INVALID: { status: 400, message: 'رمز الاسترداد غير صحيح أو تم استخدامه مسبقًا' },
} as const;

export class AuthError extends HttpException {
  constructor(readonly code: keyof typeof authErrors) {
    super({ statusCode: authErrors[code].status, message: authErrors[code].message, code }, authErrors[code].status);
  }
}
