import { BadRequestException } from '@nestjs/common';
import type {
  InventoryCategory,
  InventoryLocationType,
  InventoryMovementType,
  InventoryUnit,
} from '../generated/prisma/client.js';

const DECIMAL_REGEX = /^\d+(\.\d{1,4})?$/;

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
