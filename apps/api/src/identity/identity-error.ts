import { HttpException } from '@nestjs/common';
export const identityErrors={
  IDENTITY_STALE:[409,'تغيّرت الإعدادات. حدّث الصفحة وراجع القيم قبل الحفظ.'],
  IDENTITY_LOCKED:[409,'لا يمكن تغيير العملة أو المنطقة الزمنية بعد وجود سجلات مرتبطة بها.'],
  IDENTITY_CONFIRM:[400,'يلزم تأكيد تغيير العملة أو المنطقة الزمنية صراحةً.'],
  IDENTITY_CONFLICT:[409,'تعذّر حفظ التغيير: تحقق من حجز الاسم أو بقاء مالك نشط وصلاحية الإعدادات.'],
  DOMAIN_WAIT:[409,'انتظر قليلًا قبل إعادة التحقق، أو جدّد رمز الإثبات المنتهي.'],
  ASSET_INVALID:[400,'ارفع صورة PNG أو JPEG أو WebP ثابتة، بحجم حتى ٢ م.ب وأبعاد من ١٦ إلى ٤٠٩٦ بكسل.'],
  ASSET_LIMIT:[409,'توجد صور مسودة كثيرة. أعد استخدام الصور أو نظّف المسودات القديمة.'],
} as const;
export class IdentityError extends HttpException {
  constructor(readonly code:keyof typeof identityErrors){super(code,identityErrors[code][0]);}
}
