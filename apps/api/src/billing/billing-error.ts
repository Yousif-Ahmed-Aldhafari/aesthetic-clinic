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
} as const;
export class BillingError extends HttpException {
  constructor(readonly code:keyof typeof billingErrors){super(code,billingErrors[code][0]);}
}
