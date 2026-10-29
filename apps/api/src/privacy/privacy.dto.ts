import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export const privacyRequestTypes = ['ACCESS', 'CORRECTION', 'RESTRICTION', 'EXPORT', 'ERASURE'] as const;
export type PrivacyRequestTypeEnum = typeof privacyRequestTypes[number];

export const privacyRequestStatuses = [
  'OPEN',
  'IN_REVIEW',
  'APPROVED',
  'DENIED',
  'COMPLETED',
  'WITHDRAWN',
  'HELD',
] as const;
export type PrivacyRequestStatusEnum = typeof privacyRequestStatuses[number];

export class CreatePrivacyRequestDto {
  @IsOptional()
  @IsUUID()
  patientId?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  patientName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(254)
  patientContact?: string;

  @IsIn(privacyRequestTypes)
  requestType!: PrivacyRequestTypeEnum;

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  subject!: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes?: string;
}

export class DecidePrivacyRequestDto {
  @IsIn(privacyRequestStatuses)
  status!: PrivacyRequestStatusEnum;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  decisionReason?: string;

  @IsOptional()
  @IsBoolean()
  legalHold?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  legalHoldReason?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}

export class PrivacyRequestQueryDto {
  @IsOptional()
  @IsIn(privacyRequestStatuses)
  status?: PrivacyRequestStatusEnum;

  @IsOptional()
  @IsIn(privacyRequestTypes)
  requestType?: PrivacyRequestTypeEnum;

  @IsOptional()
  @IsUUID()
  patientId?: string;

  @IsOptional()
  @IsUUID()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 20;
}

export class CreatePatientExportDto {
  @IsUUID()
  patientId!: string;

  @IsOptional()
  @IsUUID()
  privacyRequestId?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  purpose!: string;
}

export class RevokeExportDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  reason!: string;
}

export class UpdateRetentionPolicyDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3650)
  patientRecordDays?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3650)
  appointmentDays?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3650)
  visitDays?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(90) // Platform minimum: 90 days for audit logs
  @Max(3650)
  auditEventDays?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(7) // Platform minimum: 7 days for backups
  @Max(3650)
  backupRetentionDays?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(30)
  exportRetentionDays?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3650)
  privacyRequestDays?: number;
}
