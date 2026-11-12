import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateBranchDto {
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim().toUpperCase() : value)
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  @Matches(/^[A-Z0-9_-]+$/, { message: 'Branch code must contain uppercase letters, numbers, hyphens or underscores only.' })
  code!: string;

  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  nameAr!: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MaxLength(200)
  nameEn?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MaxLength(50)
  phone?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MaxLength(254)
  email?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MaxLength(500)
  address?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MaxLength(100)
  timezone?: string;

  @IsOptional()
  operatingHours?: Record<string, unknown>;
}

export class UpdateBranchDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  nameAr?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MaxLength(200)
  nameEn?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MaxLength(50)
  phone?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MaxLength(254)
  email?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MaxLength(500)
  address?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MaxLength(100)
  timezone?: string;

  @IsOptional()
  operatingHours?: Record<string, unknown>;

  @IsOptional()
  @IsEnum(['ACTIVE', 'INACTIVE', 'SUSPENDED'] as const)
  status?: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';

  @IsInt()
  @Min(1)
  expectedVersion!: number;
}

export class AssignStaffBranchDto {
  @IsUUID()
  membershipId!: string;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}

export class SwitchBranchDto {
  @IsUUID()
  branchId!: string;
}

export class DispatchTransferDto {
  @IsUUID()
  sourceBranchId!: string;

  @IsUUID()
  destinationBranchId!: string;

  @IsUUID()
  sourceLocationId!: string;

  @IsUUID()
  destinationLocationId!: string;

  @IsUUID()
  productId!: string;

  @IsOptional()
  @IsUUID()
  batchId?: string;

  @IsNotEmpty()
  quantity!: string | number;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class ReceiveTransferDto {
  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class CancelTransferDto {
  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MaxLength(1000)
  reason?: string;
}
