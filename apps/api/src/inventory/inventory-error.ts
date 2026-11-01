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
} as const;

export class InventoryError extends HttpException {
  constructor(readonly code: keyof typeof inventoryErrors) {
    super(code, inventoryErrors[code][0]);
  }
}

