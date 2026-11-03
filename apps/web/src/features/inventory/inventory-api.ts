import { api } from '../auth/api';

export type InventoryCategory = 'INJECTABLE' | 'SKINCARE' | 'CONSUMABLE' | 'RETAIL' | 'OTHER';
export type InventoryUnit = 'PIECE' | 'VIAL' | 'BOX' | 'ML' | 'SYRINGE';
export type InventoryLocationType = 'MAIN_STORE' | 'TREATMENT_ROOM' | 'RETAIL_AREA' | 'OTHER';
export type InventoryMovementType =
  | 'OPENING_BALANCE'
  | 'RECEIPT'
  | 'ISSUE'
  | 'TRANSFER_OUT'
  | 'TRANSFER_IN'
  | 'ADJUSTMENT';
export type InventoryReasonCode =
  | 'INITIAL_COUNT'
  | 'PURCHASE_RECEIPT'
  | 'CLINICAL_USE'
  | 'EXPIRED'
  | 'DAMAGED'
  | 'DISCREPANCY_CORRECTION'
  | 'INTERNAL_TRANSFER'
  | 'RETURN';

export type InventoryBatchStatus =
  | 'AVAILABLE'
  | 'QUARANTINED'
  | 'RECALLED'
  | 'EXPIRED'
  | 'DEPLETED';

export type ClinicalConsumptionStatus = 'RECORDED' | 'VOIDED';

export type SupplierStatus = 'ACTIVE' | 'INACTIVE';

export type PurchaseOrderStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'APPROVED'
  | 'PARTIALLY_RECEIVED'
  | 'RECEIVED'
  | 'CLOSED'
  | 'CANCELLED'
  | 'REJECTED';

export type GoodsReceiptDisposition = 'ACCEPTED' | 'QUARANTINED' | 'REJECTED';

export type StockCountStatus =
  | 'DRAFT'
  | 'COUNTING'
  | 'SUBMITTED'
  | 'RECONCILED'
  | 'CANCELLED';

export type InventoryAlertType = 'LOW_STOCK' | 'EXPIRING_SOON' | 'EXPIRED' | 'RECALLED_BATCH' | 'STOCK_OUT';
export type InventoryAlertSeverity = 'CRITICAL' | 'WARNING' | 'INFO';

export interface InventorySupplierRecord {
  id: string;
  clinicId: string;
  code: string;
  nameAr: string;
  nameEn: string | null;
  contactPerson: string | null;
  email: string | null;
  phone: string | null;
  taxNumber: string | null;
  commercialRegister: string | null;
  address: string | null;
  notes: string | null;
  status: SupplierStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface InventoryPurchaseOrderLineRecord {
  id: string;
  lineNumber: number;
  productId: string;
  orderedQuantity: string;
  receivedQuantity: string;
  unitCost: string;
  taxRate: string;
  totalCost: string;
  notes: string | null;
  product?: {
    id: string;
    sku: string;
    nameAr: string;
    unit: InventoryUnit;
    requiresBatchTracking: boolean;
  };
}

export interface InventoryPurchaseOrderRecord {
  id: string;
  orderNumber: string;
  supplierId: string;
  destinationLocationId: string;
  status: PurchaseOrderStatus;
  orderDate: string;
  expectedDeliveryDate: string | null;
  currency: string;
  subtotal: string;
  taxAmount: string;
  totalAmount: string;
  notes: string | null;
  createdByMembershipId: string;
  approvedByMembershipId: string | null;
  approvedAt: string | null;
  rejectionReason: string | null;
  cancellationReason: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  supplier?: { id: string; code: string; nameAr: string; phone?: string | null };
  destinationLocation?: { id: string; code: string; nameAr: string };
  lines?: InventoryPurchaseOrderLineRecord[];
}

export interface InventoryGoodsReceiptLineRecord {
  id: string;
  purchaseOrderLineId: string | null;
  productId: string;
  batchId: string | null;
  locationId: string;
  receivedQuantity: string;
  rejectedQuantity: string;
  rejectionReason: string | null;
  unitCost: string;
  disposition: GoodsReceiptDisposition;
  movementId: string | null;
  product?: { id: string; sku: string; nameAr: string; unit: InventoryUnit };
  batch?: { id: string; batchNumber: string; expirationDate: string } | null;
}

export interface InventoryGoodsReceiptRecord {
  id: string;
  receiptNumber: string;
  purchaseOrderId: string | null;
  supplierId: string | null;
  destinationLocationId: string;
  supplierDeliveryNote: string | null;
  receivedAt: string;
  receiverMembershipId: string;
  notes: string | null;
  version: number;
  createdAt: string;
  supplier?: { id: string; code: string; nameAr: string } | null;
  destinationLocation?: { id: string; code: string; nameAr: string };
  lines?: InventoryGoodsReceiptLineRecord[];
}

export interface InventoryStockCountItemRecord {
  id: string;
  productId: string;
  batchId: string | null;
  systemQuantity: string;
  countedQuantity: string;
  varianceQuantity: string;
  discrepancyReason: string | null;
  movementId: string | null;
  product?: { id: string; sku: string; nameAr: string; unit: InventoryUnit };
  batch?: { id: string; batchNumber: string; expirationDate: string } | null;
}

export interface InventoryStockCountRecord {
  id: string;
  countNumber: string;
  locationId: string;
  status: StockCountStatus;
  notes: string | null;
  counterMembershipId: string;
  approvedByMembershipId: string | null;
  approvedAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  location?: { id: string; code: string; nameAr: string };
  items?: InventoryStockCountItemRecord[];
}

export interface InventoryAlertItem {
  id: string;
  alertType: InventoryAlertType;
  severity: InventoryAlertSeverity;
  titleAr: string;
  titleEn: string;
  messageAr: string;
  messageEn: string;
  targetType: 'PRODUCT' | 'BATCH' | 'LOCATION';
  targetId: string;
  targetName: string;
  locationId?: string | null;
  locationName?: string | null;
  currentQuantity?: string;
  thresholdQuantity?: string;
  expirationDate?: string;
  daysRemaining?: number;
  createdAt: string;
}

export interface InventoryAlertsReport {
  clinicTimezone: string;
  generatedAt: string;
  summary: {
    critical: number;
    warning: number;
    info: number;
    total: number;
  };
  items: InventoryAlertItem[];
}

export const PURCHASE_ORDER_STATUS_LABELS: Record<PurchaseOrderStatus, string> = {
  DRAFT: 'مسودة',
  SUBMITTED: 'بانتظار الاعتماد',
  APPROVED: 'معتمد',
  PARTIALLY_RECEIVED: 'مستلم جزئياً',
  RECEIVED: 'مستلم بالكامل',
  CLOSED: 'مغلق',
  CANCELLED: 'ملغى',
  REJECTED: 'مرفوض',
};

export const STOCK_COUNT_STATUS_LABELS: Record<StockCountStatus, string> = {
  DRAFT: 'مسودة',
  COUNTING: 'قيد الجرد',
  SUBMITTED: 'بانتظار التسوية',
  RECONCILED: 'تمت التسوية',
  CANCELLED: 'ملغى',
};

export const SUPPLIER_STATUS_LABELS: Record<SupplierStatus, string> = {
  ACTIVE: 'نشط',
  INACTIVE: 'غير نشط',
};

export interface InventoryBatchRecord {
  id: string;
  clinicId: string;
  productId: string;
  batchNumber: string;
  expirationDate: string;
  status: InventoryBatchStatus;
  initialQuantity: string;
  manufacturerName: string | null;
  supplierName: string | null;
  quarantinedAt: string | null;
  quarantineReason: string | null;
  recalledAt: string | null;
  recallReason: string | null;
  totalOnHandQuantity: string;
  isExpired: boolean;
  product?: {
    id: string;
    sku: string;
    nameAr: string;
    nameEn: string | null;
    unit: InventoryUnit;
    category: InventoryCategory;
  };
  batchBalances?: Array<{
    locationId: string;
    onHandQuantity: string;
    location: { id: string; code: string; nameAr: string };
  }>;
}

export interface ExpiryReportItem {
  id: string;
  batchNumber: string;
  productId: string;
  product: {
    id: string;
    sku: string;
    nameAr: string;
    nameEn: string | null;
    unit: InventoryUnit;
    category: InventoryCategory;
  };
  status: InventoryBatchStatus;
  expirationDate: string;
  isExpired: boolean;
  daysRemaining: number;
  riskLevel: 'EXPIRED' | 'CRITICAL' | 'WARNING' | 'NORMAL';
  totalOnHandQuantity: string;
  locationBalances: Array<{
    locationId: string;
    locationCode: string;
    locationNameAr: string;
    onHandQuantity: string;
  }>;
}

export interface ExpiryReport {
  clinicTimezone: string;
  evaluatedAt: string;
  daysThreshold: number;
  totalBatches: number;
  items: ExpiryReportItem[];
}

export interface InventoryClinicalConsumptionRecord {
  id: string;
  procedureExecutionId: string;
  productId: string;
  batchId: string;
  locationId: string;
  quantity: string;
  wasteQuantity: string;
  unit: InventoryUnit;
  status: ClinicalConsumptionStatus;
  notes: string | null;
  voidedAt?: string | null;
  voidReason?: string | null;
  createdAt: string;
  product?: { id: string; sku: string; nameAr: string; unit: string };
  batch?: { id: string; batchNumber: string; expirationDate: string; status: InventoryBatchStatus };
  location?: { id: string; code: string; nameAr: string };
  actor?: { user: { name: string } };
}

export interface InventoryProductRecord {
  id: string;
  sku: string;
  nameAr: string;
  nameEn: string | null;
  category: InventoryCategory;
  description: string | null;
  unit: InventoryUnit;
  requiresBatchTracking: boolean;
  reorderThreshold: string;
  isActive: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
  balances?: Array<{
    locationId: string;
    onHandQuantity: string;
    location: { id: string; code: string; nameAr: string; type?: string };
  }>;
}

export interface InventoryLocationRecord {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string | null;
  type: InventoryLocationType;
  description: string | null;
  isActive: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
  _count?: { balances: number };
}

export interface InventoryBalanceRecord {
  id: string;
  productId: string;
  locationId: string;
  onHandQuantity: string;
  version: number;
  isLowStock: boolean;
  product: {
    id: string;
    sku: string;
    nameAr: string;
    nameEn: string | null;
    category: InventoryCategory;
    unit: InventoryUnit;
    reorderThreshold: string;
    requiresBatchTracking: boolean;
    isActive: boolean;
  };
  location: {
    id: string;
    code: string;
    nameAr: string;
    type: InventoryLocationType;
    isActive: boolean;
  };
}

export interface InventoryMovementRecord {
  id: string;
  productId: string;
  locationId: string;
  sourceLocationId: string | null;
  movementType: InventoryMovementType;
  quantity: string;
  balanceAfter: string;
  reasonCode: InventoryReasonCode;
  reasonExplanation: string | null;
  createdAt: string;
  product: { id: string; sku: string; nameAr: string; unit: string };
  location: { id: string; code: string; nameAr: string };
  sourceLocation: { id: string; code: string; nameAr: string } | null;
  actor: { id: string; user: { name: string; email: string } };
}

export interface ReconciliationReport {
  status: 'RECONCILED' | 'DISCREPANCY_DETECTED';
  verifiedAt: string;
  totalItemsChecked: number;
  discrepancies: Array<{
    productId: string;
    locationId: string;
    productSku: string;
    productNameAr: string;
    locationCode: string;
    balanceQuantity: string;
    ledgerSumQuantity: string;
    difference: string;
  }>;
}

export const inventoryCategoryLabels: Record<InventoryCategory, string> = {
  INJECTABLE: 'حقن وتجميل علاجي',
  SKINCARE: 'عناية بالبشرة',
  CONSUMABLE: 'مستهلكات طبية',
  RETAIL: 'تجزئة ومبيعات',
  OTHER: 'أخرى',
};

export const inventoryUnitLabels: Record<InventoryUnit, string> = {
  PIECE: 'قطعة',
  VIAL: 'فيال / قارورة',
  BOX: 'علبة / صندوق',
  ML: 'ملليلتر (ml)',
  SYRINGE: 'محقنة معبأة',
};

export const inventoryLocationTypeLabels: Record<InventoryLocationType, string> = {
  MAIN_STORE: 'المستودع الرئيسي',
  TREATMENT_ROOM: 'غرفة علاج / حقن',
  RETAIL_AREA: 'منطقة البيع',
  OTHER: 'موقع آخر',
};

export const inventoryMovementTypeLabels: Record<InventoryMovementType, string> = {
  OPENING_BALANCE: 'رصيد افتتاحي',
  RECEIPT: 'توريد وارد',
  ISSUE: 'صرف مخزون',
  TRANSFER_OUT: 'تحويل صادر',
  TRANSFER_IN: 'تحويل وارد',
  ADJUSTMENT: 'تسوية وجرد',
};

export const inventoryReasonLabels: Record<InventoryReasonCode, string> = {
  INITIAL_COUNT: 'جرد افتتاحي',
  PURCHASE_RECEIPT: 'شراء وتوريد',
  CLINICAL_USE: 'استهلاك سريري',
  EXPIRED: 'انتهاء صلاحية',
  DAMAGED: 'تالف / مكسور',
  DISCREPANCY_CORRECTION: 'تصحيح فروقات الجرد',
  INTERNAL_TRANSFER: 'نقل داخلي',
  RETURN: 'مرتجع',
};

export const inventoryBatchStatusLabels: Record<InventoryBatchStatus, string> = {
  AVAILABLE: 'متاح للاستخدام',
  QUARANTINED: 'حجر صحي',
  RECALLED: 'مسحوب',
  EXPIRED: 'منتهي الصلاحية',
  DEPLETED: 'مستنفد',
};

export const clinicalConsumptionStatusLabels: Record<ClinicalConsumptionStatus, string> = {
  RECORDED: 'مسجل ومصروف',
  VOIDED: 'ملغى ومسترجع',
};

export const inventoryApi = (clinicId: string) => {
  const root = `clinics/${clinicId}/inventory`;
  return {
    listProducts: (query: URLSearchParams, signal?: AbortSignal) =>
      api<{ items: InventoryProductRecord[]; nextCursor: string | null }>(
        `${root}/products?${query}`,
        'GET',
        undefined,
        undefined,
        signal,
      ),

    createProduct: (input: unknown, csrf: string, signal?: AbortSignal) =>
      api<InventoryProductRecord>(`${root}/products`, 'POST', input, csrf, signal),

    updateProduct: (productId: string, input: unknown, csrf: string, signal?: AbortSignal) =>
      api<InventoryProductRecord>(`${root}/products/${productId}`, 'PATCH', input, csrf, signal),

    listLocations: (signal?: AbortSignal) =>
      api<InventoryLocationRecord[]>(`${root}/locations`, 'GET', undefined, undefined, signal),

    createLocation: (input: unknown, csrf: string, signal?: AbortSignal) =>
      api<InventoryLocationRecord>(`${root}/locations`, 'POST', input, csrf, signal),

    updateLocation: (locationId: string, input: unknown, csrf: string, signal?: AbortSignal) =>
      api<InventoryLocationRecord>(`${root}/locations/${locationId}`, 'PATCH', input, csrf, signal),

    listBalances: (query: URLSearchParams, signal?: AbortSignal) =>
      api<InventoryBalanceRecord[]>(`${root}/stock/balances?${query}`, 'GET', undefined, undefined, signal),

    listMovements: (query: URLSearchParams, signal?: AbortSignal) =>
      api<{ items: InventoryMovementRecord[]; nextCursor: string | null }>(
        `${root}/stock/movements?${query}`,
        'GET',
        undefined,
        undefined,
        signal,
      ),

    postOpeningBalance: (input: unknown, csrf: string, signal?: AbortSignal) =>
      api<InventoryMovementRecord>(`${root}/stock/opening-balance`, 'POST', input, csrf, signal),

    receiveStock: (input: unknown, csrf: string, signal?: AbortSignal) =>
      api<InventoryMovementRecord>(`${root}/stock/receive`, 'POST', input, csrf, signal),

    issueStock: (input: unknown, csrf: string, signal?: AbortSignal) =>
      api<InventoryMovementRecord>(`${root}/stock/issue`, 'POST', input, csrf, signal),

    transferStock: (input: unknown, csrf: string, signal?: AbortSignal) =>
      api<{ transferOut: InventoryMovementRecord; transferIn: InventoryMovementRecord }>(
        `${root}/stock/transfer`,
        'POST',
        input,
        csrf,
        signal,
      ),

    adjustStock: (input: unknown, csrf: string, signal?: AbortSignal) =>
      api<InventoryMovementRecord>(`${root}/stock/adjust`, 'POST', input, csrf, signal),

    reconcileLedger: (csrf: string, signal?: AbortSignal) =>
      api<ReconciliationReport>(`${root}/stock/reconcile`, 'POST', {}, csrf, signal),

    // Batches
    listBatches: (query: URLSearchParams, signal?: AbortSignal) =>
      api<{ items: InventoryBatchRecord[]; nextCursor: string | null }>(
        `${root}/batches?${query}`,
        'GET',
        undefined,
        undefined,
        signal,
      ),

    getBatch: (batchId: string, signal?: AbortSignal) =>
      api<InventoryBatchRecord>(`${root}/batches/${batchId}`, 'GET', undefined, undefined, signal),

    createBatch: (input: unknown, csrf: string, signal?: AbortSignal) =>
      api<InventoryBatchRecord>(`${root}/batches`, 'POST', input, csrf, signal),

    updateBatchStatus: (batchId: string, input: unknown, csrf: string, signal?: AbortSignal) =>
      api<InventoryBatchRecord>(`${root}/batches/${batchId}/status`, 'PATCH', input, csrf, signal),

    quarantineBatch: (batchId: string, reason: string, csrf: string, signal?: AbortSignal) =>
      api<InventoryBatchRecord>(`${root}/batches/${batchId}/quarantine`, 'POST', { reason }, csrf, signal),

    recallBatch: (batchId: string, reason: string, csrf: string, signal?: AbortSignal) =>
      api<InventoryBatchRecord>(`${root}/batches/${batchId}/recall`, 'POST', { reason }, csrf, signal),

    releaseBatch: (batchId: string, csrf: string, signal?: AbortSignal) =>
      api<InventoryBatchRecord>(`${root}/batches/${batchId}/release`, 'POST', {}, csrf, signal),

    getExpiryReport: (query: URLSearchParams, signal?: AbortSignal) =>
      api<ExpiryReport>(`${root}/batches/expiry-report?${query}`, 'GET', undefined, undefined, signal),

    receiveBatchStock: (input: unknown, csrf: string, signal?: AbortSignal) =>
      api<InventoryMovementRecord>(`${root}/batches/receive`, 'POST', input, csrf, signal),

    issueBatchStock: (input: unknown, csrf: string, signal?: AbortSignal) =>
      api<InventoryMovementRecord>(`${root}/batches/issue`, 'POST', input, csrf, signal),

    transferBatchStock: (input: unknown, csrf: string, signal?: AbortSignal) =>
      api<{ transferOut: InventoryMovementRecord; transferIn: InventoryMovementRecord }>(
        `${root}/batches/transfer`,
        'POST',
        input,
        csrf,
        signal,
      ),

    // Clinical Consumption
    recordClinicalConsumption: (input: unknown, csrf: string, signal?: AbortSignal) =>
      api<InventoryClinicalConsumptionRecord>(`${root}/clinical-consumption`, 'POST', input, csrf, signal),

    voidClinicalConsumption: (
      consumptionId: string,
      input: string | { reason: string; restockAction?: 'NO_RESTOCK' | 'CORRECTION_NO_RESTOCK' | 'DISPOSAL_NO_RESTOCK' | 'RESTOCK_UNOPENED'; restockQuantity?: string },
      csrf: string,
      signal?: AbortSignal,
    ) =>
      api<InventoryClinicalConsumptionRecord>(
        `${root}/clinical-consumption/${consumptionId}/void`,
        'POST',
        typeof input === 'string' ? { reason: input } : input,
        csrf,
        signal,
      ),

    listClinicalConsumptions: (query: URLSearchParams, signal?: AbortSignal) =>
      api<{ items: InventoryClinicalConsumptionRecord[]; nextCursor: string | null }>(
        `${root}/clinical-consumption?${query}`,
        'GET',
        undefined,
        undefined,
        signal,
      ),

    getProcedureConsumptions: (procedureExecutionId: string, signal?: AbortSignal) =>
      api<InventoryClinicalConsumptionRecord[]>(
        `${root}/clinical-consumption/procedure/${procedureExecutionId}`,
        'GET',
        undefined,
        undefined,
        signal,
      ),

    // Suppliers
    listSuppliers: (query?: URLSearchParams, signal?: AbortSignal) =>
      api<{ items: InventorySupplierRecord[]; nextCursor: string | null }>(
        `${root}/suppliers${query ? `?${query}` : ''}`,
        'GET',
        undefined,
        undefined,
        signal,
      ),

    getSupplier: (supplierId: string, signal?: AbortSignal) =>
      api<InventorySupplierRecord>(`${root}/suppliers/${supplierId}`, 'GET', undefined, undefined, signal),

    createSupplier: (input: unknown, csrf: string, signal?: AbortSignal) =>
      api<InventorySupplierRecord>(`${root}/suppliers`, 'POST', input, csrf, signal),

    updateSupplier: (supplierId: string, input: unknown, csrf: string, signal?: AbortSignal) =>
      api<InventorySupplierRecord>(`${root}/suppliers/${supplierId}`, 'PATCH', input, csrf, signal),

    // Purchase Orders
    listPurchaseOrders: (query?: URLSearchParams, signal?: AbortSignal) =>
      api<{ items: InventoryPurchaseOrderRecord[]; nextCursor: string | null }>(
        `${root}/purchase-orders${query ? `?${query}` : ''}`,
        'GET',
        undefined,
        undefined,
        signal,
      ),

    getPurchaseOrder: (poId: string, signal?: AbortSignal) =>
      api<InventoryPurchaseOrderRecord>(`${root}/purchase-orders/${poId}`, 'GET', undefined, undefined, signal),

    createPurchaseOrder: (input: unknown, csrf: string, signal?: AbortSignal) =>
      api<InventoryPurchaseOrderRecord>(`${root}/purchase-orders`, 'POST', input, csrf, signal),

    updatePurchaseOrder: (poId: string, input: unknown, csrf: string, signal?: AbortSignal) =>
      api<InventoryPurchaseOrderRecord>(`${root}/purchase-orders/${poId}`, 'PATCH', input, csrf, signal),

    submitPurchaseOrder: (poId: string, expectedVersion: number, csrf: string, signal?: AbortSignal) =>
      api<InventoryPurchaseOrderRecord>(
        `${root}/purchase-orders/${poId}/submit`,
        'POST',
        { expectedVersion },
        csrf,
        signal,
      ),

    approvePurchaseOrder: (
      poId: string,
      expectedVersion: number,
      notes: string | undefined,
      csrf: string,
      signal?: AbortSignal,
    ) =>
      api<InventoryPurchaseOrderRecord>(
        `${root}/purchase-orders/${poId}/approve`,
        'POST',
        { expectedVersion, notes },
        csrf,
        signal,
      ),

    rejectPurchaseOrder: (
      poId: string,
      expectedVersion: number,
      reason: string,
      csrf: string,
      signal?: AbortSignal,
    ) =>
      api<InventoryPurchaseOrderRecord>(
        `${root}/purchase-orders/${poId}/reject`,
        'POST',
        { expectedVersion, reason },
        csrf,
        signal,
      ),

    cancelPurchaseOrder: (
      poId: string,
      expectedVersion: number,
      reason: string,
      csrf: string,
      signal?: AbortSignal,
    ) =>
      api<InventoryPurchaseOrderRecord>(
        `${root}/purchase-orders/${poId}/cancel`,
        'POST',
        { expectedVersion, reason },
        csrf,
        signal,
      ),

    // Goods Receipts
    listGoodsReceipts: (query?: URLSearchParams, signal?: AbortSignal) =>
      api<{ items: InventoryGoodsReceiptRecord[]; nextCursor: string | null }>(
        `${root}/goods-receipts${query ? `?${query}` : ''}`,
        'GET',
        undefined,
        undefined,
        signal,
      ),

    getGoodsReceipt: (receiptId: string, signal?: AbortSignal) =>
      api<InventoryGoodsReceiptRecord>(`${root}/goods-receipts/${receiptId}`, 'GET', undefined, undefined, signal),

    receiveGoods: (input: unknown, csrf: string, signal?: AbortSignal) =>
      api<InventoryGoodsReceiptRecord>(`${root}/goods-receipts`, 'POST', input, csrf, signal),

    // Stock Counts
    listStockCounts: (query?: URLSearchParams, signal?: AbortSignal) =>
      api<{ items: InventoryStockCountRecord[]; nextCursor: string | null }>(
        `${root}/stock-counts${query ? `?${query}` : ''}`,
        'GET',
        undefined,
        undefined,
        signal,
      ),

    getStockCount: (stockCountId: string, signal?: AbortSignal) =>
      api<InventoryStockCountRecord>(`${root}/stock-counts/${stockCountId}`, 'GET', undefined, undefined, signal),

    createStockCount: (input: unknown, csrf: string, signal?: AbortSignal) =>
      api<InventoryStockCountRecord>(`${root}/stock-counts`, 'POST', input, csrf, signal),

    recordStockCountItems: (stockCountId: string, input: unknown, csrf: string, signal?: AbortSignal) =>
      api<InventoryStockCountRecord>(`${root}/stock-counts/${stockCountId}/items`, 'POST', input, csrf, signal),

    reconcileStockCount: (stockCountId: string, input: unknown, csrf: string, signal?: AbortSignal) =>
      api<InventoryStockCountRecord>(`${root}/stock-counts/${stockCountId}/reconcile`, 'POST', input, csrf, signal),

    // Alerts
    getAlerts: (signal?: AbortSignal) =>
      api<InventoryAlertsReport>(`${root}/alerts`, 'GET', undefined, undefined, signal),

    acknowledgeAlert: (input: unknown, csrf: string, signal?: AbortSignal) =>
      api<{ id: string; acknowledgedAt: string }>(`${root}/alerts/acknowledge`, 'POST', input, csrf, signal),
  };
};
