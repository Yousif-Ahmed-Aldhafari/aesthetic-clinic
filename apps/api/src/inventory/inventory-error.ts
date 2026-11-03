import { HttpException } from '@nestjs/common';

export const inventoryErrors = {
  INVENTORY_BATCH_TRACKING_REQUIRED: [
    400,
    'Batch and expiry tracking is required for clinical consumption of this product (Phase 4 Step 4.2)',
  ],
  INVENTORY_INSUFFICIENT_STOCK: [409, 'المخزون المتوفر غير كافٍ لإتمام العملية.'],
  INVENTORY_DUPLICATE_SKU: [409, 'رمز المنتج (SKU) مستخدم بالفعل في هذه العيادة.'],
  INVENTORY_DUPLICATE_CODE: [409, 'كود موقع المخزون مستخدم بالفعل في هذه العيادة.'],
  INVENTORY_OPENING_BALANCE_EXISTS: [409, 'تم تسجيل رصيد افتتاحي لهذا المنتج في هذا الموقع مسبقًا.'],
  INVENTORY_CONCURRENT_MODIFICATION: [409, 'تم تعديل المخزون بواسطة عملية أخرى. يرجى إعادة المحاولة.'],
  INVENTORY_SAME_LOCATION_TRANSFER: [400, 'لا يمكن النقل إلى نفس الموقع.'],
  INVENTORY_IDEMPOTENCY_CONFLICT: [409, 'تعارض في مفتاح الطلب: استُخدم المعرف لعملية بمعاملات مختلفة.'],
  INVENTORY_DUPLICATE_BATCH: [409, 'رقم الدفعة/التشغيلة مسجل بالفعل لهذا المنتج.'],
  INVENTORY_BATCH_NOT_FOUND: [404, 'الدفعة/التشغيلة غير موجودة.'],
  INVENTORY_BATCH_EXPIRED: [400, 'الدفعة/التشغيلة منتهية الصلاحية ولا يمكن صرفها أو استخدامها سريريًا.'],
  INVENTORY_BATCH_QUARANTINED: [400, 'الدفعة/التشغيلة قيد الحجر الصحي.'],
  INVENTORY_BATCH_RECALLED: [400, 'الدفعة/التشغيلة مسحوبة رسميًا ولا يمكن استخدامها.'],
  INVENTORY_BATCH_DEPLETED: [400, 'رصيد هذه الدفعة/التشغيلة مستنفد.'],
  INVENTORY_BATCH_MISMATCH: [400, 'الدفعة/التشغيلة المحددة لا تنتمي لهذا الصنف.'],
  INVENTORY_BATCH_REQUIRED_FOR_PRODUCT: [400, 'هذا الصنف خاضع لتتبع التشغيلات ويتطلب تحديد الدفعة.'],
  INVENTORY_BATCH_IMMUTABLE_STATUS: [400, 'لا يمكن تغيير حالة دفعة مسحوبة أو منتهية الصلاحية إلى متاحة.'],
  INVENTORY_PROCEDURE_NOT_FOUND: [404, 'سجل الإجراء التجميلي غير موجود.'],
  INVENTORY_CLINICIAN_MISMATCH: [403, 'غير مصرح: يجب أن يكون الطبيب المعين للإجراء هو من يوثق الاستهلاك.'],
  INVENTORY_CONSENT_REQUIRED: [403, 'يلزم وجود موافقة مستنيرة سارية ومحققة قبل تسجيل استهلاك الإجراء.'],
  INVENTORY_CONSUMPTION_ALREADY_VOIDED: [409, 'تم إلغاء سجل الاستهلاك السريري مسبقًا.'],
  INVENTORY_DUPLICATE_SUPPLIER_CODE: [409, 'كود المورد مسجل بالفعل في هذه العيادة.'],
  INVENTORY_SUPPLIER_NOT_FOUND: [404, 'المورد غير موجود.'],
  INVENTORY_SUPPLIER_INACTIVE: [400, 'المورد غير نشط ولا يمكن إنشاء طلبات شراء له.'],
  INVENTORY_PURCHASE_ORDER_NOT_FOUND: [404, 'أمر الشراء غير موجود.'],
  INVENTORY_PURCHASE_ORDER_NOT_DRAFT: [400, 'لا يمكن تعديل أمر الشراء إلا إذا كان في حالة مسودة.'],
  INVENTORY_PURCHASE_ORDER_NOT_APPROVED: [400, 'لا يمكن استلام البضاعة إلا لأمر شراء معتمد.'],
  INVENTORY_PURCHASE_ORDER_CLOSED: [400, 'أمر الشراء مغلق أو مكتمل بالفعل.'],
  INVENTORY_PURCHASE_ORDER_CANNOT_CANCEL: [400, 'لا يمكن إلغاء أمر شراء تم استلام بضائع له أو مغلق.'],
  INVENTORY_GOODS_RECEIPT_OVER_RECEIPT: [400, 'الكمية المستلمة تتجاوز الكمية المطلوبة في أمر الشراء.'],
  INVENTORY_GOODS_RECEIPT_NOT_FOUND: [404, 'سند الاستلام غير موجود.'],
  INVENTORY_STOCK_COUNT_NOT_FOUND: [404, 'جلسة الجرد غير موجودة.'],
  INVENTORY_STOCK_COUNT_NOT_DRAFT: [400, 'لا يمكن تسجيل الأصناف إلا لجلسة جرد قيد الإجراء.'],
  INVENTORY_STOCK_COUNT_ALREADY_RECONCILED: [409, 'تمت تسوية جلسة الجرد مسبقًا ولا يمكن تعديلها.'],
} as const;

export class InventoryError extends HttpException {
  constructor(readonly code: keyof typeof inventoryErrors) {
    super(code, inventoryErrors[code][0]);
  }
}
