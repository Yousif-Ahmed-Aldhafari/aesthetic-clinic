import {
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  Matches,
  IsArray,
  IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';
import type {
  InventoryCategory as PrismaCategory,
  InventoryCostStatus as PrismaStatus,
  LandedCostAllocationMethod as PrismaMethod,
} from '../generated/prisma/client.js';

export enum LandedCostAllocationMethod {
  BY_QUANTITY = 'BY_QUANTITY',
  BY_VALUE = 'BY_VALUE',
}

export enum InventoryCostStatus {
  VERIFIED = 'VERIFIED',
  UNVERIFIED_COST = 'UNVERIFIED_COST',
  ADJUSTED = 'ADJUSTED',
  EXHAUSTED = 'EXHAUSTED',
}

export enum InventoryCategory {
  INJECTABLE = 'INJECTABLE',
  SKINCARE = 'SKINCARE',
  CONSUMABLE = 'CONSUMABLE',
  DEVICE_ACCESSORY = 'DEVICE_ACCESSORY',
  RETAIL = 'RETAIL',
}

const DECIMAL_REGEX = /^\d+(\.\d{1,4})?$/;

export class CreateLandedCostDto {
  @IsOptional()
  @IsUUID('4')
  purchaseOrderId?: string;

  @IsOptional()
  @IsUUID('4')
  goodsReceiptId?: string;

  @IsOptional()
  @Matches(DECIMAL_REGEX, { message: 'freightCost must be a non-negative decimal string with up to 4 decimal places' })
  freightCost?: string;

  @IsOptional()
  @Matches(DECIMAL_REGEX, { message: 'customsDuty must be a non-negative decimal string with up to 4 decimal places' })
  customsDuty?: string;

  @IsOptional()
  @Matches(DECIMAL_REGEX, { message: 'insuranceCost must be a non-negative decimal string with up to 4 decimal places' })
  insuranceCost?: string;

  @IsOptional()
  @Matches(DECIMAL_REGEX, { message: 'handlingCost must be a non-negative decimal string with up to 4 decimal places' })
  handlingCost?: string;

  @IsOptional()
  @Matches(DECIMAL_REGEX, { message: 'otherCharges must be a non-negative decimal string with up to 4 decimal places' })
  otherCharges?: string;

  @IsOptional()
  @Matches(DECIMAL_REGEX, { message: 'discountCredit must be a non-negative decimal string with up to 4 decimal places' })
  discountCredit?: string;

  @IsOptional()
  @IsEnum(LandedCostAllocationMethod)
  allocationMethod?: PrismaMethod = LandedCostAllocationMethod.BY_VALUE;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  idempotencyKey?: string;
}

export class ApproveLandedCostDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}

export class CostLayerQueryDto {
  @IsOptional()
  @IsUUID('4')
  productId?: string;

  @IsOptional()
  @IsUUID('4')
  branchId?: string;

  @IsOptional()
  @IsUUID('4')
  locationId?: string;

  @IsOptional()
  @IsUUID('4')
  batchId?: string;

  @IsOptional()
  @IsEnum(InventoryCostStatus)
  costStatus?: PrismaStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 50;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number = 0;
}

export class ValuationQueryDto {
  @IsOptional()
  @IsISO8601()
  asOfDate?: string;

  @IsOptional()
  @IsUUID('4')
  branchId?: string;

  @IsOptional()
  @IsUUID('4')
  productId?: string;

  @IsOptional()
  @IsEnum(InventoryCategory)
  category?: PrismaCategory;
}

export class CreateValuationSnapshotDto {
  @IsOptional()
  @IsUUID('4')
  branchId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class CreateCostAdjustmentDto {
  @IsUUID('4')
  costLayerId!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  reason!: string;

  @Matches(DECIMAL_REGEX, { message: 'newUnitLandedCost must be a non-negative decimal string with up to 4 decimal places' })
  newUnitLandedCost!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class DecideCostAdjustmentDto {
  @IsIn(['APPROVED', 'REJECTED'])
  decision!: 'APPROVED' | 'REJECTED';

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class InitializeOpeningBalancesDto {
  @IsOptional()
  @Matches(DECIMAL_REGEX, { message: 'defaultUnitCost must be a non-negative decimal string with up to 4 decimal places' })
  defaultUnitCost?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class ApproveOpeningBalancesDto {
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  layerIds?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
