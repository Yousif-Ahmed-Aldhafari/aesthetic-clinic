import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import type {
  DeliveryMode,
  BirthType,
  BirthHistorySource,
  CaregiverRelationshipType,
  StatureMeasurementMethod,
  MeasurementSource,
} from '../generated/prisma/client.js';

// ============================================================================
// BIRTH HISTORY DTOs
// ============================================================================

export class RecordPediatricBirthHistoryDto {
  @IsUUID()
  patientId!: string;

  @IsInt()
  @Min(20)
  @Max(45)
  @Type(() => Number)
  gestationalAgeWeeks!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(6)
  @Type(() => Number)
  gestationalAgeDays?: number;

  @IsOptional()
  @IsInt()
  @Min(300)
  @Max(8000)
  @Type(() => Number)
  birthWeightGrams?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(15.0)
  @Max(70.0)
  @Type(() => Number)
  birthLengthCm?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(10.0)
  @Max(50.0)
  @Type(() => Number)
  birthHeadCircumferenceCm?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10)
  @Type(() => Number)
  apgar1Min?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10)
  @Type(() => Number)
  apgar5Min?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10)
  @Type(() => Number)
  apgar10Min?: number;

  @IsOptional()
  @IsString()
  deliveryMode?: DeliveryMode;

  @IsOptional()
  @IsString()
  birthType?: BirthType;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  birthComplications?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  maternalComplications?: string;

  @IsOptional()
  @IsBoolean()
  consanguinity?: boolean;

  @IsOptional()
  @IsBoolean()
  neonatalResuscitationRequired?: boolean;

  @IsOptional()
  @IsBoolean()
  nicAdmissionRequired?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(365)
  @Type(() => Number)
  nicStayDays?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  newbornScreeningNotes?: string;

  @IsOptional()
  @IsString()
  source?: BirthHistorySource;
}

export class AmendPediatricBirthHistoryDto {
  @IsInt()
  @Min(1)
  @Type(() => Number)
  expectedVersion!: number;

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  amendmentReason!: string;

  @IsOptional()
  @IsInt()
  @Min(20)
  @Max(45)
  @Type(() => Number)
  gestationalAgeWeeks?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(6)
  @Type(() => Number)
  gestationalAgeDays?: number;

  @IsOptional()
  @IsInt()
  @Min(300)
  @Max(8000)
  @Type(() => Number)
  birthWeightGrams?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(15.0)
  @Max(70.0)
  @Type(() => Number)
  birthLengthCm?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(10.0)
  @Max(50.0)
  @Type(() => Number)
  birthHeadCircumferenceCm?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10)
  @Type(() => Number)
  apgar1Min?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10)
  @Type(() => Number)
  apgar5Min?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10)
  @Type(() => Number)
  apgar10Min?: number;

  @IsOptional()
  @IsString()
  deliveryMode?: DeliveryMode;

  @IsOptional()
  @IsString()
  birthType?: BirthType;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  birthComplications?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  maternalComplications?: string;

  @IsOptional()
  @IsBoolean()
  consanguinity?: boolean;

  @IsOptional()
  @IsBoolean()
  neonatalResuscitationRequired?: boolean;

  @IsOptional()
  @IsBoolean()
  nicAdmissionRequired?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(365)
  @Type(() => Number)
  nicStayDays?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  newbornScreeningNotes?: string;

  @IsOptional()
  @IsString()
  source?: BirthHistorySource;
}

// ============================================================================
// CAREGIVER RELATIONSHIP DTOs
// ============================================================================

export class CreateCaregiverRelationshipDto {
  @IsUUID()
  patientId!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(150)
  caregiverName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  caregiverNationalId?: string;

  @IsString()
  @MinLength(7)
  @MaxLength(20)
  caregiverPhone!: string;

  @IsString()
  relationshipType!: CaregiverRelationshipType;

  @IsOptional()
  @IsBoolean()
  hasLegalCustody?: boolean;

  @IsOptional()
  @IsBoolean()
  hasMedicalConsentAuthority?: boolean;

  @IsOptional()
  @IsBoolean()
  isEmergencyContact?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  @Type(() => Number)
  emergencyPriority?: number;

  @IsOptional()
  @IsBoolean()
  portalProxyAccess?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  legalDocumentationReference?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class UpdateCaregiverRelationshipDto {
  @IsInt()
  @Min(1)
  @Type(() => Number)
  expectedVersion!: number;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  caregiverName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  caregiverNationalId?: string;

  @IsOptional()
  @IsString()
  @MinLength(7)
  @MaxLength(20)
  caregiverPhone?: string;

  @IsOptional()
  @IsString()
  relationshipType?: CaregiverRelationshipType;

  @IsOptional()
  @IsBoolean()
  hasLegalCustody?: boolean;

  @IsOptional()
  @IsBoolean()
  hasMedicalConsentAuthority?: boolean;

  @IsOptional()
  @IsBoolean()
  isEmergencyContact?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  @Type(() => Number)
  emergencyPriority?: number;

  @IsOptional()
  @IsBoolean()
  portalProxyAccess?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  legalDocumentationReference?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class RevokeCaregiverRelationshipDto {
  @IsInt()
  @Min(1)
  @Type(() => Number)
  expectedVersion!: number;

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  revocationReason!: string;
}

// ============================================================================
// GROWTH RECORD DTOs
// ============================================================================

export class RecordPediatricGrowthDto {
  @IsUUID()
  patientId!: string;

  @IsOptional()
  @IsUUID()
  encounterId?: string;

  @IsOptional()
  @IsString()
  measuredAt?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.3)
  @Max(250.0)
  @Type(() => Number)
  weightKg?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(20.0)
  @Max(250.0)
  @Type(() => Number)
  statureCm?: number;

  @IsOptional()
  @IsString()
  statureMethod?: StatureMeasurementMethod;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(15.0)
  @Max(70.0)
  @Type(() => Number)
  headCircumferenceCm?: number;

  @IsOptional()
  @IsString()
  measurementSource?: MeasurementSource;

  @IsOptional()
  @IsBoolean()
  useCorrectedAgeForZScores?: boolean;
}

export class EnterInErrorGrowthRecordDto {
  @IsInt()
  @Min(1)
  @Type(() => Number)
  expectedVersion!: number;

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  errorReason!: string;
}

// ============================================================================
// MEDICATION SAFETY PREFLIGHT DTOs
// ============================================================================

export class PediatricMedicationPreflightDto {
  @IsUUID()
  patientId!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(200)
  medicationName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  medicationCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  route?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.3)
  @Max(250.0)
  @Type(() => Number)
  currentWeightKg?: number;

  @IsOptional()
  @IsInt()
  @Min(20)
  @Max(45)
  @Type(() => Number)
  gestationalAgeWeeksAtBirth?: number;

  @IsOptional()
  @IsString({ each: true })
  clinicalIndications?: string[];
}
