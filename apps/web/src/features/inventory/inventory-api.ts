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

    voidClinicalConsumption: (consumptionId: string, reason: string, csrf: string, signal?: AbortSignal) =>
      api<InventoryClinicalConsumptionRecord>(
        `${root}/clinical-consumption/${consumptionId}/void`,
        'POST',
        { reason },
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
  };
};
