import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import type {
  ClinicalServiceCategory,
  ClinicalOrderType,
  ClinicalOrderStatus,
  OrderPriority,
  DiagnosticResultStatus,
  ClinicalDocumentType,
} from '../generated/prisma/client.js';

export const ClinicalServiceCategories = [
  'GENERAL_CONSULTATION',
  'SPECIALIST_CONSULTATION',
  'FOLLOW_UP_CONSULTATION',
  'LABORATORY_TEST',
  'DIAGNOSTIC_IMAGING',
  'REFERRAL',
  'MINOR_PROCEDURE',
  'OTHER_OUTPATIENT_SERVICE',
] as const;

export const ClinicalOrderTypes = [
  'LABORATORY',
  'IMAGING',
  'REFERRAL',
  'PROCEDURE',
  'OTHER',
] as const;

export const ClinicalOrderStatuses = [
  'DRAFT',
  'REQUESTED',
  'ACCEPTED',
  'IN_PROGRESS',
  'COMPLETED',
  'REVIEWED',
  'CANCELLED',
] as const;

export const OrderPriorities = [
  'ROUTINE',
  'URGENT',
  'STAT',
] as const;

export const DiagnosticResultStatuses = [
  'PRELIMINARY',
  'FINAL',
  'CORRECTED',
  'CANCELLED',
] as const;

export const ClinicalDocumentTypes = [
  'LAB_REPORT',
  'IMAGING_REPORT',
  'REFERRAL_LETTER',
  'DISCHARGE_SUMMARY',
  'EXTERNAL_REPORT',
  'CONSENT_RECORD',
  'CLINICAL_SUMMARY',
  'OTHER',
] as const;

// ---------------------------------------------------------------------------
// 1. General Clinical Services DTOs
// ---------------------------------------------------------------------------

export class CreateGeneralClinicalServiceDto {
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @IsString()
  @MinLength(2)
  @MaxLength(64)
  @Matches(/^[A-Z0-9_-]+$/, { message: 'serviceCode must consist of uppercase alphanumeric characters, hyphens or underscores' })
  serviceCode!: string;

  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  nameAr!: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  nameEn?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsEnum(ClinicalServiceCategories, { message: 'Invalid clinical service category' })
  category!: ClinicalServiceCategory;

  @IsOptional()
  @IsUUID()
  specialtyId?: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(480)
  defaultDurationMinutes?: number = 30;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(64)
  requiredPrivilege?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  basePriceMinor?: number = 0;

  @IsOptional()
  @IsUUID()
  clinicServiceId?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean = true;
}

export class UpdateGeneralClinicalServiceDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  nameAr?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  nameEn?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsEnum(ClinicalServiceCategories)
  category?: ClinicalServiceCategory;

  @IsOptional()
  @IsUUID()
  specialtyId?: string | null;

  @IsOptional()
  @IsUUID()
  branchId?: string | null;

  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(480)
  defaultDurationMinutes?: number;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(64)
  requiredPrivilege?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  basePriceMinor?: number;

  @IsOptional()
  @IsUUID()
  clinicServiceId?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  expectedVersion?: number;
}

export class GeneralClinicalServiceQueryDto {
  @IsOptional()
  @IsEnum(ClinicalServiceCategories)
  category?: ClinicalServiceCategory;

  @IsOptional()
  @IsUUID()
  specialtyId?: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (value === 'true' || value === true ? true : value === 'false' || value === false ? false : undefined))
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (value ? Number.parseInt(String(value), 10) : 50))
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 50;

  @IsOptional()
  @IsString()
  cursor?: string;
}

// ---------------------------------------------------------------------------
// 2. Clinical Orders DTOs
// ---------------------------------------------------------------------------

export class CreateClinicalOrderDto {
  @IsUUID()
  patientId!: string;

  @IsOptional()
  @IsUUID()
  encounterId?: string;

  @IsOptional()
  @IsUUID()
  specialtyId?: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsEnum(ClinicalOrderTypes, { message: 'Invalid clinical order type' })
  orderType!: ClinicalOrderType;

  @IsOptional()
  @IsUUID()
  generalClinicalServiceId?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(2000)
  clinicalIndication?: string;

  @IsOptional()
  @IsEnum(OrderPriorities)
  priority?: OrderPriority = 'ROUTINE';

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class UpdateClinicalOrderStatusDto {
  @IsEnum(ClinicalOrderStatuses, { message: 'Invalid clinical order status' })
  status!: ClinicalOrderStatus;

  @ValidateIf((o: UpdateClinicalOrderStatusDto) => o.status === 'CANCELLED')
  @IsNotEmpty({ message: 'cancellationReason is required when cancelling an order' })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  cancellationReason?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  expectedVersion?: number;
}

export class CancelClinicalOrderDto {
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  cancellationReason!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  expectedVersion?: number;
}

export class ClinicalOrderQueryDto {
  @IsOptional()
  @IsUUID()
  patientId?: string;

  @IsOptional()
  @IsUUID()
  encounterId?: string;

  @IsOptional()
  @IsEnum(ClinicalOrderTypes)
  orderType?: ClinicalOrderType;

  @IsOptional()
  @IsEnum(ClinicalOrderStatuses)
  status?: ClinicalOrderStatus;

  @IsOptional()
  @IsEnum(OrderPriorities)
  priority?: OrderPriority;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (value ? Number.parseInt(String(value), 10) : 50))
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 50;

  @IsOptional()
  @IsString()
  cursor?: string;
}

// ---------------------------------------------------------------------------
// 3. Clinical Order Results DTOs
// ---------------------------------------------------------------------------

export class RecordOrderResultDto {
  @IsEnum(ClinicalOrderTypes)
  resultType!: ClinicalOrderType;

  @IsOptional()
  @IsEnum(DiagnosticResultStatuses)
  status?: DiagnosticResultStatus = 'FINAL';

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(150)
  sourceOrganization?: string;

  @IsOptional()
  @IsISO8601()
  performedAt?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  narrativeFindings?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  impression?: string;

  @IsOptional()
  @IsObject()
  structuredData?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  isCritical?: boolean = false;

  @ValidateIf((o: RecordOrderResultDto) => o.isCritical === true)
  @IsNotEmpty({ message: 'criticalNotes is required when result is marked critical' })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(1000)
  criticalNotes?: string;

  @IsOptional()
  @IsBoolean()
  isReleasedToPatient?: boolean = false;
}

export class VerifyOrderResultDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  expectedVersion?: number;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(1000)
  verificationNotes?: string;
}

export class CorrectOrderResultDto {
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  correctionReason!: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  narrativeFindings?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  impression?: string;

  @IsOptional()
  @IsObject()
  structuredData?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  isCritical?: boolean;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(1000)
  criticalNotes?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  expectedVersion?: number;
}

export class AcknowledgeCriticalResultDto {
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  actionTaken!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  expectedVersion?: number;
}

export class ReleaseResultToPatientDto {
  @IsBoolean()
  isReleasedToPatient!: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  expectedVersion?: number;
}

// ---------------------------------------------------------------------------
// 4. Clinical Document DTOs
// ---------------------------------------------------------------------------

export class CreateClinicalDocumentDto {
  @IsUUID()
  patientId!: string;

  @IsOptional()
  @IsUUID()
  encounterId?: string;

  @IsOptional()
  @IsUUID()
  orderId?: string;

  @IsOptional()
  @IsUUID()
  resultId?: string;

  @IsEnum(ClinicalDocumentTypes)
  documentType!: ClinicalDocumentType;

  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title!: string;

  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  fileName!: string;

  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(100)
  mimeType!: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => value === 'true' || value === true ? true : value === 'false' || value === false ? false : value)
  @IsBoolean()
  isConfidential?: boolean = false;

  @IsOptional()
  @IsString()
  fileBase64?: string;
}

export class UpdateClinicalDocumentDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsBoolean()
  isConfidential?: boolean;

  @IsOptional()
  @IsBoolean()
  isLegalHold?: boolean;

  @ValidateIf((o: UpdateClinicalDocumentDto) => o.isLegalHold === true)
  @IsNotEmpty({ message: 'legalHoldReason is required when legal hold is applied' })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  legalHoldReason?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  expectedVersion?: number;
}

export class ClinicalDocumentQueryDto {
  @IsOptional()
  @IsUUID()
  patientId?: string;

  @IsOptional()
  @IsUUID()
  encounterId?: string;

  @IsOptional()
  @IsUUID()
  orderId?: string;

  @IsOptional()
  @IsUUID()
  resultId?: string;

  @IsOptional()
  @IsEnum(ClinicalDocumentTypes)
  documentType?: ClinicalDocumentType;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (value === 'true' || value === true ? true : value === 'false' || value === false ? false : undefined))
  @IsBoolean()
  isLegalHold?: boolean;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (value ? Number.parseInt(String(value), 10) : 50))
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 50;

  @IsOptional()
  @IsString()
  cursor?: string;
}

// ---------------------------------------------------------------------------
// 5. Billing Integration DTO
// ---------------------------------------------------------------------------

export class CreateDraftInvoiceForOrderDto {
  @IsUUID()
  orderId!: string;

  @IsUUID()
  requestKey!: string;

  @IsOptional()
  @IsUUID()
  visitId?: string;
}

export class CreateDraftInvoiceForGeneralServiceDto {
  @IsUUID()
  patientId!: string;

  @IsUUID()
  generalClinicalServiceId!: string;

  @IsUUID()
  requestKey!: string;

  @IsOptional()
  @IsUUID()
  visitId?: string;
}
