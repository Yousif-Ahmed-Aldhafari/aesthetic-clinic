import { BadRequestException } from '@nestjs/common';
import type {
  InventoryCategory,
  InventoryLocationType,
  InventoryMovementType,
  InventoryUnit,
  InventoryBatchStatus,
} from '../generated/prisma/client.js';

const DECIMAL_REGEX = /^\d+(\.\d{1,4})?$/;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export function validateDecimalString(
  value: unknown,
  fieldName: string,
  options: { allowZero?: boolean } = {},
): string {
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw new BadRequestException(`${fieldName} must be a numeric string or number`);
  }
  const str = String(value).trim();
  if (!DECIMAL_REGEX.test(str)) {
    throw new BadRequestException(
      `${fieldName} must be a valid non-negative decimal with up to 4 decimal places (got '${str}')`,
    );
  }
  const num = parseFloat(str);
  if (!options.allowZero && num === 0) {
    throw new BadRequestException(`${fieldName} must be strictly greater than zero`);
  }
  if (num > 100000000) {
    throw new BadRequestException(`${fieldName} exceeds maximum allowable quantity`);
  }
  return str;
}

export function validateDateString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string') {
    throw new BadRequestException(`${fieldName} must be a string in YYYY-MM-DD format`);
  }
  const str = value.trim();
  if (!DATE_REGEX.test(str)) {
    throw new BadRequestException(`${fieldName} must match YYYY-MM-DD format`);
  }
  const [year, month, day] = str.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  ) {
    throw new BadRequestException(`${fieldName} must be a valid calendar date`);
  }
  return str;
}

export function getClinicLocalDateString(now: Date, timezone: string): string {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return formatter.format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

export function isBatchExpired(
  expirationDate: Date | string,
  clinicTimezone: string,
  now: Date = new Date(),
): boolean {
  let expStr: string;
  if (typeof expirationDate === 'string') {
    expStr = expirationDate.slice(0, 10);
  } else {
    expStr = expirationDate.toISOString().slice(0, 10);
  }
  const clinicTodayStr = getClinicLocalDateString(now, clinicTimezone);
  return clinicTodayStr > expStr;
}

export interface CreateProductDto {
  sku: string;
  nameAr: string;
  nameEn?: string;
  category: InventoryCategory;
  description?: string;
  unit: InventoryUnit;
  requiresBatchTracking?: boolean;
  reorderThreshold?: string;
  isActive?: boolean;
}

export interface UpdateProductDto {
  expectedVersion: number;
  nameAr?: string;
  nameEn?: string;
  category?: InventoryCategory;
  description?: string;
  unit?: InventoryUnit;
  requiresBatchTracking?: boolean;
  reorderThreshold?: string;
  isActive?: boolean;
}

export interface ProductListQuery {
  category?: InventoryCategory;
  isActive?: boolean;
  search?: string;
  limit?: number;
  cursor?: string;
}

export interface CreateLocationDto {
  code: string;
  nameAr: string;
  nameEn?: string;
  type?: InventoryLocationType;
  description?: string;
  isActive?: boolean;
}

export interface UpdateLocationDto {
  expectedVersion: number;
  nameAr?: string;
  nameEn?: string;
  type?: InventoryLocationType;
  description?: string;
  isActive?: boolean;
}

export interface OpeningBalanceDto {
  productId: string;
  locationId: string;
  quantity: string;
  idempotencyKey?: string;
}

export interface ReceiveStockDto {
  productId: string;
  locationId: string;
  quantity: string;
  reasonCode?: 'PURCHASE_RECEIPT' | 'RETURN';
  reasonExplanation?: string;
  idempotencyKey?: string;
}

export interface IssueStockDto {
  productId: string;
  locationId: string;
  quantity: string;
  reasonCode: 'CLINICAL_USE' | 'EXPIRED' | 'DAMAGED' | 'DISCREPANCY_CORRECTION';
  reasonExplanation?: string;
  idempotencyKey?: string;
}

export interface TransferStockDto {
  productId: string;
  sourceLocationId: string;
  targetLocationId: string;
  quantity: string;
  reasonExplanation?: string;
  idempotencyKey?: string;
}

export interface AdjustStockDto {
  productId: string;
  locationId: string;
  targetQuantity: string;
  reasonCode: 'DISCREPANCY_CORRECTION' | 'DAMAGED' | 'EXPIRED';
  reasonExplanation: string;
  idempotencyKey?: string;
}

export interface StockBalancesQuery {
  locationId?: string;
  productId?: string;
  lowStockOnly?: boolean;
}

export interface MovementsQuery {
  productId?: string;
  locationId?: string;
  movementType?: InventoryMovementType;
  limit?: number;
  cursor?: string;
}

export interface CreateBatchDto {
  productId: string;
  batchNumber: string;
  expirationDate: string; // YYYY-MM-DD
  initialQuantity: string;
  manufacturerName?: string;
  supplierName?: string;
  locationId?: string; // If provided, initializes opening balance at this location
  idempotencyKey?: string;
}

export interface UpdateBatchStatusDto {
  status: 'AVAILABLE' | 'QUARANTINED' | 'RECALLED';
  reason?: string;
}

export interface ReceiveBatchStockDto {
  productId: string;
  batchId: string;
  locationId: string;
  quantity: string;
  reasonCode?: 'PURCHASE_RECEIPT' | 'RETURN';
  reasonExplanation?: string;
  idempotencyKey?: string;
}

export interface IssueBatchStockDto {
  productId: string;
  batchId: string;
  locationId: string;
  quantity: string;
  reasonCode: 'CLINICAL_USE' | 'EXPIRED' | 'DAMAGED' | 'DISCREPANCY_CORRECTION';
  reasonExplanation?: string;
  idempotencyKey?: string;
}

export interface TransferBatchStockDto {
  productId: string;
  batchId: string;
  sourceLocationId: string;
  targetLocationId: string;
  quantity: string;
  reasonExplanation?: string;
  idempotencyKey?: string;
}

export interface RecordClinicalConsumptionDto {
  procedureExecutionId: string;
  productId: string;
  batchId: string;
  locationId: string;
  quantity: string;
  wasteQuantity?: string;
  unit?: InventoryUnit;
  notes?: string;
  idempotencyKey?: string;
}

export interface VoidClinicalConsumptionDto {
  reason: string;
  idempotencyKey?: string;
}

export interface BatchListQuery {
  productId?: string;
  status?: InventoryBatchStatus;
  expiringBefore?: string;
  search?: string;
  limit?: number;
  cursor?: string;
}

export interface ExpiryReportQuery {
  daysThreshold?: number;
  locationId?: string;
  productId?: string;
}

export interface ClinicalConsumptionListQuery {
  procedureExecutionId?: string;
  productId?: string;
  batchId?: string;
  limit?: number;
  cursor?: string;
}
