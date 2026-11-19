import {
  IsArray,
  IsBoolean,
  IsDateString,
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
  PregnancyEpisodeStatus,
  DatingMethod,
  FetalPresentation,
  DeliveryOutcome,
  DeliveryMode,
  GynecologicalExamType,
  PatientGender,
} from '../generated/prisma/client.js';

// ============================================================================
// 1. PREGNANCY EPISODE DTOs
// ============================================================================

export class CreatePregnancyEpisodeDto {
  @IsUUID()
  patientId!: string;

  @IsInt()
  @Min(1)
  @Max(30)
  @Type(() => Number)
  gravidity!: number;

  @IsInt()
  @Min(0)
  @Max(30)
  @Type(() => Number)
  parity!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(30)
  @Type(() => Number)
  termDeliveries?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(30)
  @Type(() => Number)
  pretermDeliveries?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(30)
  @Type(() => Number)
  abortions?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(30)
  @Type(() => Number)
  livingChildren?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(6)
  @Type(() => Number)
  multipleGestationCount?: number;

  @IsOptional()
  @IsDateString()
  lastMenstrualPeriodDate?: string;

  @IsOptional()
  @IsBoolean()
  lmpCertainty?: boolean;

  @IsOptional()
  @IsDateString()
  ultrasoundDatingDate?: string;

  @IsOptional()
  @IsNumber()
  @Min(10)
  @Max(84)
  @Type(() => Number)
  crownRumpLengthMm?: number;

  @IsOptional()
  @IsNumber()
  @Min(10)
  @Max(120)
  @Type(() => Number)
  biparietalDiameterMm?: number;

  @IsOptional()
  @IsInt()
  @Min(35)
  @Max(300)
  @Type(() => Number)
  ultrasoundEstimatedGestationalDays?: number;

  @IsOptional()
  @IsDateString()
  estimatedDueDate?: string;

  @IsOptional()
  @IsString()
  datingMethod?: DatingMethod;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  datingRationale?: string;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  bloodGroupRh?: string;

  @IsOptional()
  @IsBoolean()
  rhAntibodyScreenPositive?: boolean;

  @IsOptional()
  @IsBoolean()
  highRiskFlag?: boolean;

  @IsOptional()
  @IsString()
  highRiskJustification?: string;
}

export class UpdatePregnancyEpisodeDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(30)
  @Type(() => Number)
  gravidity?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(30)
  @Type(() => Number)
  parity?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(30)
  @Type(() => Number)
  termDeliveries?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(30)
  @Type(() => Number)
  pretermDeliveries?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(30)
  @Type(() => Number)
  abortions?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(30)
  @Type(() => Number)
  livingChildren?: number;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  bloodGroupRh?: string;

  @IsOptional()
  @IsBoolean()
  rhAntibodyScreenPositive?: boolean;

  @IsOptional()
  @IsBoolean()
  highRiskFlag?: boolean;

  @IsOptional()
  @IsString()
  highRiskJustification?: string;

  @IsOptional()
  @IsString()
  status?: PregnancyEpisodeStatus;
}

export class ReviewPregnancyDatingDto {
  @IsDateString()
  confirmedEstimatedDueDate!: string;

  @IsString()
  datingMethod!: DatingMethod;

  @IsString()
  @MinLength(5)
  @MaxLength(500)
  datingRationale!: string;

  @IsOptional()
  @IsNumber()
  @Min(10)
  @Max(84)
  @Type(() => Number)
  crownRumpLengthMm?: number;

  @IsOptional()
  @IsDateString()
  ultrasoundDatingDate?: string;
}

export class FinalizePregnancyEpisodeDto {
  @IsDateString()
  outcomeDate!: string;

  @IsString()
  @MinLength(3)
  outcomeSummary!: string;

  @IsOptional()
  @IsString()
  status?: PregnancyEpisodeStatus;
}

// ============================================================================
// 2. ANTENATAL VISIT DTOs
// ============================================================================

export class RecordAntenatalVisitDto {
  @IsUUID()
  patientId!: string;

  @IsUUID()
  pregnancyEpisodeId!: string;

  @IsUUID()
  encounterId!: string;

  @IsOptional()
  @IsDateString()
  visitDate?: string;

  @IsInt()
  @Min(4)
  @Max(44)
  @Type(() => Number)
  gestationalAgeWeeks!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(6)
  @Type(() => Number)
  gestationalAgeDays?: number;

  @IsInt()
  @Min(60)
  @Max(250)
  @Type(() => Number)
  systolicBp!: number;

  @IsInt()
  @Min(30)
  @Max(160)
  @Type(() => Number)
  diastolicBp!: number;

  @IsOptional()
  @IsNumber()
  @Min(30)
  @Max(250)
  @Type(() => Number)
  weightKg?: number;

  @IsOptional()
  @IsNumber()
  @Min(10)
  @Max(50)
  @Type(() => Number)
  fundalHeightCm?: number;

  @IsOptional()
  @IsInt()
  @Min(60)
  @Max(220)
  @Type(() => Number)
  fetalHeartRateBpm?: number;

  @IsOptional()
  @IsString()
  fetalPresentation?: FetalPresentation;

  @IsOptional()
  @IsBoolean()
  fetalMovementPresent?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  urineProtein?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  urineGlucose?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  peripheralEdema?: string;

  @IsOptional()
  @IsString()
  clinicalNotes?: string;

  @IsOptional()
  @IsString()
  managementPlan?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  @Type(() => Number)
  nextVisitRecommendedWeeks?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  diagnosticOrderIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  imagingDocumentIds?: string[];
}

export class EnterInErrorAntenatalVisitDto {
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  errorReason!: string;
}

// ============================================================================
// 3. OBSTETRIC HISTORY DTOs
// ============================================================================

export class CreateObstetricHistoryDto {
  @IsUUID()
  patientId!: string;

  @IsInt()
  @Min(1)
  @Max(30)
  @Type(() => Number)
  pregnancyNumber!: number;

  @IsOptional()
  @IsInt()
  @Min(1950)
  @Max(2030)
  @Type(() => Number)
  yearOfDelivery?: number;

  @IsOptional()
  @IsInt()
  @Min(4)
  @Max(44)
  @Type(() => Number)
  gestationalAgeWeeks?: number;

  @IsOptional()
  @IsString()
  deliveryOutcome?: DeliveryOutcome;

  @IsOptional()
  @IsString()
  deliveryMode?: DeliveryMode;

  @IsOptional()
  @IsInt()
  @Min(200)
  @Max(7000)
  @Type(() => Number)
  birthWeightGrams?: number;

  @IsOptional()
  @IsString()
  babyGender?: PatientGender;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  anesthesiaType?: string;

  @IsOptional()
  @IsBoolean()
  previousUterineSurgery?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  uterineSurgeryDetails?: string;

  @IsOptional()
  @IsString()
  complications?: string;

  @IsOptional()
  @IsString()
  neonatalOutcome?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateObstetricHistoryDto {
  @IsOptional()
  @IsInt()
  @Min(1950)
  @Max(2030)
  @Type(() => Number)
  yearOfDelivery?: number;

  @IsOptional()
  @IsInt()
  @Min(4)
  @Max(44)
  @Type(() => Number)
  gestationalAgeWeeks?: number;

  @IsOptional()
  @IsString()
  deliveryOutcome?: DeliveryOutcome;

  @IsOptional()
  @IsString()
  deliveryMode?: DeliveryMode;

  @IsOptional()
  @IsInt()
  @Min(200)
  @Max(7000)
  @Type(() => Number)
  birthWeightGrams?: number;

  @IsOptional()
  @IsString()
  babyGender?: PatientGender;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  anesthesiaType?: string;

  @IsOptional()
  @IsBoolean()
  previousUterineSurgery?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  uterineSurgeryDetails?: string;

  @IsOptional()
  @IsString()
  complications?: string;

  @IsOptional()
  @IsString()
  neonatalOutcome?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

// ============================================================================
// 4. CONFIDENTIAL GYNECOLOGICAL EXAMINATION DTOs
// ============================================================================

export class RecordGynecologicalExamDto {
  @IsUUID()
  patientId!: string;

  @IsUUID()
  encounterId!: string;

  @IsOptional()
  @IsDateString()
  examinationDate?: string;

  @IsOptional()
  @IsString()
  examinationType?: GynecologicalExamType;

  @IsOptional()
  @IsBoolean()
  isConfidential?: boolean;

  @IsOptional()
  @IsString()
  indicationsSymptoms?: string;

  @IsOptional()
  @IsDateString()
  lastMenstrualPeriodDate?: string;

  @IsOptional()
  @IsInt()
  @Min(14)
  @Max(60)
  @Type(() => Number)
  menstrualCycleDays?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  @Type(() => Number)
  menstrualFlowDurationDays?: number;

  @IsOptional()
  @IsBoolean()
  dysmenorrheaReported?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  abnormalBleedingPattern?: string;

  @IsOptional()
  @IsString()
  externalGenitaliaFindings?: string;

  @IsOptional()
  @IsString()
  speculumExaminationFindings?: string;

  @IsOptional()
  @IsString()
  bimanualExaminationFindings?: string;

  @IsOptional()
  @IsBoolean()
  cervicalScreeningSampleCollected?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  cervicalScreeningTestType?: string;

  @IsBoolean()
  chaperonePresent!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  chaperoneNameOrId?: string;

  @IsOptional()
  @IsString()
  clinicalAssessment?: string;

  @IsOptional()
  @IsString()
  managementPlan?: string;

  @IsOptional()
  @IsUUID()
  consentEvidenceId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  linkedDocumentIds?: string[];
}

export class EnterInErrorGynecologicalExamDto {
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  errorReason!: string;
}
