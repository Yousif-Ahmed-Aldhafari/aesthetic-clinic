import { HttpException } from '@nestjs/common';
export const billingErrors = {
  BILLING_STALE: [409, 'تغيّرت الفاتورة. أعد تحميلها وراجع الرصيد قبل المتابعة.'],
  BILLING_STATE: [409, 'لا تسمح حالة الفاتورة بهذا الإجراء.'],
  BILLING_AMOUNT: [400, 'تحقق من المبالغ والكمية والخصم والضريبة ودقة العملة.'],
  BILLING_CURRENCY: [400, 'عملة العيادة غير مدعومة للفوترة بعد. لا يوجد تحويل تلقائي للعملات.'],
  BILLING_OVERPAYMENT: [409, 'المبلغ يتجاوز الرصيد المستحق. حدّث الفاتورة قبل الدفع.'],
  BILLING_REFUND: [409, 'المبلغ يتجاوز المتاح للاسترداد، أو لا يسمح سجل الدفعة بالعكس الكامل.'],
  BILLING_RETRY: [409, 'استُخدم مفتاح الطلب مع بيانات مختلفة. راجع السجل قبل إنشاء طلب جديد.'],
  BILLING_BUSY: [409, 'تجري عملية مالية أخرى. حدّث السجل وأعد المحاولة بالمفتاح نفسه.'],
  PACKAGE_NOT_FOUND: [404, 'الباقة العلاجية غير موجودة.'],
  PACKAGE_CODE_EXISTS: [409, 'رمز الباقة العلاجية مستخدم بالفعل في هذه العيادة.'],
  PACKAGE_NOT_ACTIVE: [400, 'الباقة العلاجية غير مفعلة ولا يمكن شراؤها أو استخدامها.'],
  PACKAGE_VERSION_NOT_PUBLISHED: [400, 'إصدار الباقة لم يُنشر بعد، لا يمكن بيعه للمرضى.'],
  PACKAGE_VERSION_IMMUTABLE: [409, 'لا يمكن تعديل إصدار باقة منشور. أنشئ إصداراً جديداً للتعديل.'],
  PATIENT_PACKAGE_NOT_FOUND: [404, 'سجل باقة المريض غير موجود.'],
  PATIENT_PACKAGE_NOT_ACTIVE: [400, 'باقة المريض غير مفعلة (قد تكون بانتظار السداد أو منتهية الصلاحية أو ملغاة).'],
  PATIENT_PACKAGE_EXPIRED: [400, 'انتهت صلاحية باقة المريض ولم يعد بالإمكان استرداد الجلسات.'],
  PATIENT_PACKAGE_EXHAUSTED: [400, 'تم استهلاك جميع جلسات هذه الباقة بالكامل.'],
  INSUFFICIENT_PACKAGE_SESSIONS: [409, 'عدد الجلسات المتبقية في هذه الباقة غير كافٍ.'],
  REDEMPTION_ALREADY_REVERSED: [409, 'تم إلغاء استرداد هذه الجلسة مسبقاً.'],
  INSTALLMENT_PLAN_NOT_FOUND: [404, 'خطة التقسيط غير موجودة.'],
  INSTALLMENT_SCHEDULE_NOT_FOUND: [404, 'قسط السداد المحدد غير موجود.'],
  INSTALLMENT_OVERPAYMENT: [409, 'مبلغ التخصيص يتجاوز المتبقي من هذا القسط.'],
  INSTALLMENT_PAYMENT_UNAVAILABLE: [409, 'الدفعة المالية غير صالحة أو تم تخصيصها بالكامل مسبقاً.'],
  REFUND_REQUEST_NOT_FOUND: [404, 'طلب الاسترداد المالي غير موجود.'],
  REFUND_ALREADY_DECIDED: [409, 'تم البت في طلب الاسترداد مسبقاً (معتمد، مرفوض أو مسوّى).'],
  REFUND_EXCEEDS_NET_PAID: [409, 'مبلغ الاسترداد المطلوب يتجاوز صافي المدفوع من الفاتورة.'],
  REFUND_SETTLEMENT_FAILED: [400, 'تعذر تسوية الاسترداد: تأكد من وجود دفعة مؤهلة للعكس أو الاسترداد.'],
} as const;
export class BillingError extends HttpException {
  constructor(readonly code:keyof typeof billingErrors){super(code,billingErrors[code][0]);}
}
