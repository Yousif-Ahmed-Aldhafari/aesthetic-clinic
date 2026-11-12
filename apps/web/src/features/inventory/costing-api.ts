import { api } from '../auth/api';
import type { InventoryCategory, InventoryUnit } from './inventory-api';

export type InventoryCostStatus = 'VERIFIED' | 'UNVERIFIED_COST' | 'ADJUSTED' | 'EXHAUSTED';
export type InventoryCostProvenance = 'GOODS_RECEIPT' | 'OPENING_BALANCE' | 'TRANSFER_IN' | 'ADJUSTMENT';
export type LandedCostAllocationMethod = 'BY_VALUE' | 'BY_QUANTITY';
export type LandedCostStatus = 'DRAFT' | 'APPROVED' | 'ADJUSTED';
export type CostMovementType =
  | 'PURCHASE_RECEIPT'
  | 'ISSUE'
  | 'CONSUMPTION'
  | 'WASTE'
  | 'TRANSFER_OUT'
  | 'TRANSFER_IN'
  | 'ADJUSTMENT';
export type ValuationSnapshotStatus = 'PROVISIONAL' | 'FINAL' | 'SUPERSEDED';
export type CostAdjustmentStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export const COST_STATUS_LABELS: Record<InventoryCostStatus, string> = {
  VERIFIED: 'معتمد ومحقق',
  UNVERIFIED_COST: 'تكلفة تقديرية غير محققة',
  ADJUSTED: 'معدل محاسبياً',
  EXHAUSTED: 'مستنفد بالكامل',
};

export const PROVENANCE_LABELS: Record<InventoryCostProvenance, string> = {
  GOODS_RECEIPT: 'استلام مشتريات وتوريد',
  OPENING_BALANCE: 'رصيد افتتاحي مرحل',
  TRANSFER_IN: 'تحويل وارد بين الفروع',
  ADJUSTMENT: 'تسوية وإعادة تقييم',
};

export const ALLOCATION_METHOD_LABELS: Record<LandedCostAllocationMethod, string> = {
  BY_VALUE: 'حسب القيمة الإجمالية (تناسبي مع السعر)',
  BY_QUANTITY: 'حسب الكمية المستلمة (تناسبي مع الوحدات)',
};

export const LANDED_STATUS_LABELS: Record<LandedCostStatus, string> = {
  DRAFT: 'مسودة قيد المراجعة',
  APPROVED: 'معتمد ومرحل للتكلفة',
  ADJUSTED: 'معدل',
};

export const MOVEMENT_TYPE_LABELS: Record<CostMovementType, string> = {
  PURCHASE_RECEIPT: 'توريد واستلام',
  ISSUE: 'صرف عام',
  CONSUMPTION: 'استهلاك سريري مباشر',
  WASTE: 'هدر وتلف سريري',
  TRANSFER_OUT: 'تحويل صادر لفرع آخر',
  TRANSFER_IN: 'تحويل وارد من فرع آخر',
  ADJUSTMENT: 'تسوية محاسبية',
};

export const SNAPSHOT_STATUS_LABELS: Record<ValuationSnapshotStatus, string> = {
  PROVISIONAL: 'مبدئي / قيد التدقيق',
  FINAL: 'إقفال نهائي معتمد',
  SUPERSEDED: 'مستبدل بإقفال لاحق',
};

export const ADJUSTMENT_STATUS_LABELS: Record<CostAdjustmentStatus, string> = {
  PENDING: 'بانتظار موافقة المدير المالي',
  APPROVED: 'معتمد',
  REJECTED: 'مرفوض',
};

export interface InventoryCostLayerRecord {
  id: string;
  clinicId: string;
  productId: string;
  branchId: string | null;
  locationId: string | null;
  batchId: string | null;
  goodsReceiptLineId: string | null;
  layerDate: string;
  initialQuantity: string;
  remainingQuantity: string;
  unitAcquisitionCost: string;
  unitLandedCost: string;
  totalRemainingCost: string;
  costStatus: InventoryCostStatus;
  sourceProvenance: InventoryCostProvenance;
  currency: string;
  version: number;
  product?: {
    id: string;
    sku: string;
    nameAr: string;
    unit: InventoryUnit;
    category: InventoryCategory;
  };
  branch?: {
    id: string;
    code: string;
    nameAr: string;
  } | null;
  location?: {
    id: string;
    code: string;
    nameAr: string;
  } | null;
  batch?: {
    id: string;
    batchNumber: string;
    expirationDate: string;
  } | null;
}

export interface LandedCostAllocationLineRecord {
  id: string;
  landedCostId: string;
  goodsReceiptLineId: string | null;
  costLayerId: string | null;
  allocatedAmount: string;
  roundingRemainder: string;
  goodsReceiptLine?: {
    id: string;
    receivedQuantity: string;
    acceptedQuantity: string;
    unitCost: string;
    product?: {
      id: string;
      sku: string;
      nameAr: string;
      unit: InventoryUnit;
    };
  } | null;
}

export interface InventoryLandedCostRecord {
  id: string;
  clinicId: string;
  allocationNumber: string;
  purchaseOrderId: string | null;
  goodsReceiptId: string | null;
  freightCost: string;
  customsDuty: string;
  insuranceCost: string;
  handlingCost: string;
  otherCharges: string;
  discountCredit: string;
  totalLandedCharges: string;
  allocationMethod: LandedCostAllocationMethod;
  status: LandedCostStatus;
  approvedByMembershipId: string | null;
  approvedAt: string | null;
  notes: string | null;
  version: number;
  createdAt: string;
  allocationLines: LandedCostAllocationLineRecord[];
  goodsReceipt?: {
    id: string;
    receiptNumber: string;
    receiptDate: string;
    supplier?: {
      nameAr: string;
    };
  } | null;
  purchaseOrder?: {
    id: string;
    poNumber: string;
  } | null;
  approvedBy?: {
    user: {
      name: string;
    };
  } | null;
}

export interface InventoryCostMovementRecord {
  id: string;
  movementNumber: string;
  costLayerId: string;
  stockMovementId: string | null;
  consumptionId: string | null;
  transferId: string | null;
  movementType: CostMovementType;
  quantity: string;
  unitCost: string;
  totalCost: string;
  wasteCost: string;
  notes: string | null;
  occurredAt: string;
  costLayer?: {
    productId: string;
    product?: {
      sku: string;
      nameAr: string;
      unit: InventoryUnit;
    };
    branch?: {
      code: string;
      nameAr: string;
    } | null;
  };
}

export interface ValuationProductSummary {
  productId: string;
  sku: string;
  nameAr: string;
  category: InventoryCategory;
  unit: InventoryUnit;
  totalUnits: string;
  totalValuation: string;
  averageLandedUnitCost: string;
  verifiedUnits: string;
  unverifiedUnits: string;
  activeLayersCount: number;
  transitUnits?: string;
  transitValuation?: string;
}

export interface ValuationReportResponse {
  clinicId: string;
  asOfDate: string;
  currency: string;
  currencyScale: number;
  valuationMethod: string;
  disclaimerAr: string;
  disclaimerEn: string;
  summary: {
    totalOnHandUnits: string;
    totalValuation: string;
    totalValuationMinor: string;
    verifiedValuation: string;
    unverifiedValuation: string;
    transitValuation: string;
    quarantinedValuation: string;
    expiredValuation: string;
    discrepancyCount: number;
    discrepancyUnits: string;
  };
  products: ValuationProductSummary[];
}

export interface ValuationSnapshotRecord {
  id: string;
  clinicId: string;
  snapshotNumber: string;
  snapshotDate: string;
  branchId: string | null;
  totalUnits: string;
  totalValueMinor: string;
  verifiedValueMinor: string;
  unverifiedValueMinor: string;
  transitValueMinor: string;
  valuationMethod: string;
  breakdownJson: any;
  discrepancyCount: number;
  status: ValuationSnapshotStatus;
  notes: string | null;
  version: number;
  createdAt: string;
  branch?: {
    code: string;
    nameAr: string;
  } | null;
}

export interface CostAdjustmentRecord {
  id: string;
  adjustmentNumber: string;
  costLayerId: string;
  reason: string;
  previousUnitCost: string;
  newUnitCost: string;
  deltaUnitCost: string;
  quantityAffected: string;
  totalDeltaCost: string;
  status: CostAdjustmentStatus;
  approvedAt: string | null;
  notes: string | null;
  createdAt: string;
  costLayer?: {
    product?: {
      sku: string;
      nameAr: string;
    };
  };
}

export const costingApi = (clinicId: string) => {
  const root = `/clinics/${clinicId}/costing`;

  return {
    // Landed Costs
    listLandedCosts: (signal?: AbortSignal) =>
      api<InventoryLandedCostRecord[]>(`${root}/landed-costs`, 'GET', undefined, undefined, signal),

    getLandedCost: (id: string, signal?: AbortSignal) =>
      api<InventoryLandedCostRecord>(`${root}/landed-costs/${id}`, 'GET', undefined, undefined, signal),

    draftLandedCost: (input: unknown, csrf: string, signal?: AbortSignal) =>
      api<InventoryLandedCostRecord>(`${root}/landed-costs`, 'POST', input, csrf, signal),

    approveLandedCost: (id: string, input: { expectedVersion: number }, csrf: string, signal?: AbortSignal) =>
      api<InventoryLandedCostRecord>(`${root}/landed-costs/${id}/approve`, 'POST', input, csrf, signal),

    // Cost Layers
    listCostLayers: (query?: URLSearchParams, signal?: AbortSignal) =>
      api<{ items: InventoryCostLayerRecord[]; total: number }>(
        `${root}/layers${query ? `?${query}` : ''}`,
        'GET',
        undefined,
        undefined,
        signal,
      ),

    // Cost Movements
    listCostMovements: (layerId?: string, signal?: AbortSignal) =>
      api<InventoryCostMovementRecord[]>(
        `${root}/movements${layerId ? `?layerId=${layerId}` : ''}`,
        'GET',
        undefined,
        undefined,
        signal,
      ),

    // Valuation & Snapshots
    getValuationReport: (query?: URLSearchParams, signal?: AbortSignal) =>
      api<ValuationReportResponse>(`${root}/valuation${query ? `?${query}` : ''}`, 'GET', undefined, undefined, signal),

    createValuationSnapshot: (input: { branchId?: string; notes?: string }, csrf: string, signal?: AbortSignal) =>
      api<ValuationSnapshotRecord>(`${root}/snapshots`, 'POST', input, csrf, signal),

    // Opening Balances Backfill & Approval
    initializeOpeningBalances: (input: { defaultUnitCost?: string; branchId?: string }, csrf: string, signal?: AbortSignal) =>
      api<{ success: boolean; createdLayersCount: number; message: string }>(
        `${root}/opening-balances`,
        'POST',
        input,
        csrf,
        signal,
      ),

    approveOpeningBalances: (input: { notes?: string; layerIds?: string[] }, csrf: string, signal?: AbortSignal) =>
      api<{ success: boolean; approvedCount: number; message: string }>(
        `${root}/opening-balances/approve`,
        'POST',
        input,
        csrf,
        signal,
      ),

    // Cost Adjustments
    createCostAdjustment: (
      input: { costLayerId: string; newUnitLandedCost: string; reason: string },
      csrf: string,
      signal?: AbortSignal,
    ) => api<CostAdjustmentRecord>(`${root}/adjustments`, 'POST', input, csrf, signal),

    decideCostAdjustment: (
      id: string,
      input: { decision: 'APPROVED' | 'REJECTED'; notes?: string },
      csrf: string,
      signal?: AbortSignal,
    ) => api<CostAdjustmentRecord>(`${root}/adjustments/${id}/decide`, 'PATCH', input, csrf, signal),
  };
};
