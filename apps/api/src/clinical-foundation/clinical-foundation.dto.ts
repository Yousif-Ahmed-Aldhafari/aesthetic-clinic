import {
  IsBoolean,
  IsEnum,
  IsISO8601,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

export const ObservationTypes = [
  'BLOOD_PRESSURE_SYSTOLIC',
  'BLOOD_PRESSURE_DIASTOLIC',
  'HEART_RATE',
  'RESPIRATORY_RATE',
  'BODY_TEMPERATURE',
  'OXYGEN_SATURATION',
  'WEIGHT',
  'HEIGHT',
  'BODY_MASS_INDEX',
  'GENERAL_OBSERVATION',
] as const;

export const ObservationStatuses = [
  'RECORDED',
  'VERIFIED',
  'AMENDED',
  'ENTERED_IN_ERROR',
] as const;

export const ClinicalProvenances = [
  'CLINICIAN_MEASURED',
  'PATIENT_REPORTED',
  'DEVICE_RECORDED',
  'HISTORICAL_TRANSCRIPTION',
] as const;

export const DiagnosisRoles = [
  'PRIMARY',
  'SECONDARY',
  'DIFFERENTIAL',
  'ADMISSION',
  'DISCHARGE',
] as const;

export const DiagnosisClinicalStatuses = [
  'PROVISIONAL',
  'CONFIRMED',
  'RESOLVED',
  'REFUTED',
  'ENTERED_IN_ERROR',
] as const;

export const DiagnosisVerificationStatuses = [
  'SUSPECTED',
  'PROBABLE',
  'CONFIRMED',
  'REFUTED',
] as const;

export const ProblemListStatuses = [
  'ACTIVE',
  'INACTIVE',
  'RESOLVED',
  'REMITTED',
] as const;

export const AllergyStatusTypes = [
  'ALLERGY_PRESENT',
  'NO_KNOWN_ALLERGIES',
  'STATUS_UNCONFIRMED_UNKNOWN',
] as const;

export const AllergenCategories = [
  'MEDICATION',
  'FOOD',
  'ENVIRONMENTAL',
  'BIOLOGICAL',
  'LATEX',
  'OTHER',
] as const;

export const AllergySeverities = [
  'MILD',
  'MODERATE',
  'SEVERE',
  'LIFE_THREATENING',
  'UNKNOWN',
] as const;

export const AllergyClinicalStatuses = [
  'ACTIVE',
  'INACTIVE',
  'RESOLVED',
  'ENTERED_IN_ERROR',
] as const;

export const AllergyVerificationStatuses = [
  'SUSPECTED',
  'PATIENT_REPORTED',
  'CLINICIAN_CONFIRMED',
  'REFUTED',
] as const;

export const MedicationRecordStatuses = [
  'ACTIVE',
  'PAUSED',
  'DISCONTINUED',
  'COMPLETED',
  'ENTERED_IN_ERROR',
] as const;

export const PrescriptionStatuses = [
  'DRAFT',
  'PENDING_REVIEW',
  'SIGNED',
  'CANCELLED',
  'SUPERSEDED',
] as const;

// 1. Clinical Observation DTOs
export class RecordObservationDto {
  @IsOptional()
  @IsUUID('all')
  encounterId?: string;

  @IsEnum(ObservationTypes)
  observationType!: (typeof ObservationTypes)[number];

  @IsOptional()
  @IsNumber()
  numericValue?: number;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MaxLength(1000)
  textValue?: string;

  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  unit!: string;

  @IsOptional()
  @IsISO8601()
  measuredAt?: string;

  @IsOptional()
  @IsEnum(ClinicalProvenances)
  provenance?: (typeof ClinicalProvenances)[number];

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MaxLength(100)
  bodySite?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MaxLength(100)
  method?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MaxLength(255)
  interpretation?: string;
}

export class AmendObservationDto {
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  amendmentReason!: string;

  @IsOptional()
  @IsNumber()
  numericValue?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  textValue?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  unit?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  expectedVersion?: number;
}

// 2. Encounter Diagnosis & Problem List DTOs
export class RecordDiagnosisDto {
  @IsUUID('all')
  encounterId!: string;

  @IsOptional()
  @IsEnum(DiagnosisRoles)
  diagnosisRole?: (typeof DiagnosisRoles)[number];

  @IsOptional()
  @IsEnum(DiagnosisClinicalStatuses)
  clinicalStatus?: (typeof DiagnosisClinicalStatuses)[number];

  @IsOptional()
  @IsEnum(DiagnosisVerificationStatuses)
  verificationStatus?: (typeof DiagnosisVerificationStatuses)[number];

  @IsOptional()
  @IsBoolean()
  isProblem?: boolean;

  @IsOptional()
  @IsEnum(ProblemListStatuses)
  problemStatus?: (typeof ProblemListStatuses)[number];

  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MinLength(2)
  @MaxLength(64)
  codingSystem!: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MaxLength(32)
  codingSystemVersion?: string;

  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  code!: string;

  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  displayAr!: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MaxLength(255)
  displayEn?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MaxLength(2000)
  clinicalNarrative?: string;

  @IsOptional()
  @IsISO8601()
  onsetDate?: string;
}

export class AmendDiagnosisDto {
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  amendmentReason!: string;

  @IsOptional()
  @IsEnum(DiagnosisClinicalStatuses)
  clinicalStatus?: (typeof DiagnosisClinicalStatuses)[number];

  @IsOptional()
  @IsEnum(ProblemListStatuses)
  problemStatus?: (typeof ProblemListStatuses)[number];

  @IsOptional()
  @IsBoolean()
  isProblem?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  clinicalNarrative?: string;

  @IsOptional()
  @IsISO8601()
  resolutionDate?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  expectedVersion?: number;
}

// 3. Patient Allergy DTOs
export class RecordAllergyDto {
  @IsOptional()
  @IsUUID('all')
  encounterId?: string;

  @IsOptional()
  @IsEnum(AllergyStatusTypes)
  allergyStatusType?: (typeof AllergyStatusTypes)[number];

  @IsOptional()
  @IsEnum(AllergenCategories)
  category?: (typeof AllergenCategories)[number];

  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  substance!: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MaxLength(64)
  substanceCode?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MaxLength(64)
  codingSystem?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MaxLength(500)
  reaction?: string;

  @IsOptional()
  @IsEnum(AllergySeverities)
  severity?: (typeof AllergySeverities)[number];

  @IsOptional()
  @IsEnum(AllergyClinicalStatuses)
  clinicalStatus?: (typeof AllergyClinicalStatuses)[number];

  @IsOptional()
  @IsEnum(AllergyVerificationStatuses)
  verificationStatus?: (typeof AllergyVerificationStatuses)[number];

  @IsOptional()
  @IsISO8601()
  onsetDate?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

// 4. Medication Record DTOs
export class RecordMedicationDto {
  @IsOptional()
  @IsUUID('all')
  encounterId?: string;

  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  medicationName!: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MaxLength(255)
  genericName?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MaxLength(255)
  brandName?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim().toUpperCase() : value)
  @IsString()
  @MaxLength(32)
  atcCode?: string;

  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  dosage!: string;

  @IsOptional()
  @IsNumber()
  dosageAmount?: number;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MaxLength(32)
  dosageUnit?: string;

  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MinLength(2)
  @MaxLength(64)
  route!: string;

  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  frequency!: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MaxLength(2000)
  instructions?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MaxLength(255)
  indication?: string;

  @IsOptional()
  @IsEnum(MedicationRecordStatuses)
  status?: (typeof MedicationRecordStatuses)[number];

  @IsOptional()
  @IsEnum(ClinicalProvenances)
  provenance?: (typeof ClinicalProvenances)[number];

  @IsOptional()
  @IsISO8601()
  startDate?: string;

  @IsOptional()
  @IsISO8601()
  endDate?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MaxLength(500)
  discontinuationReason?: string;
}

export class ReconcileMedicationsDto {
  @IsUUID('all', { each: true })
  medicationIds!: string[];
}

// 5. Prescription Item & Draft DTOs
export class PrescriptionItemDto {
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  medicationName!: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MaxLength(255)
  genericName?: string;

  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  strength!: string;

  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MinLength(2)
  @MaxLength(64)
  dosageForm!: string;

  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MinLength(2)
  @MaxLength(64)
  route!: string;

  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  frequency!: string;

  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  duration!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  durationDays?: number;

  @IsInt()
  @Min(1)
  @Max(1000)
  quantity!: number;

  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  unit!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10)
  refillsAllowed?: number;

  @IsOptional()
  @IsBoolean()
  substitutionAllowed?: boolean;

  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MinLength(2)
  @MaxLength(1000)
  instructions!: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MaxLength(255)
  indication?: string;
}

export class CreatePrescriptionDraftDto {
  @IsUUID('all')
  encounterId!: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => PrescriptionItemDto)
  items?: PrescriptionItemDto[];
}

export class SignPrescriptionDto {
  @IsOptional()
  @IsBoolean()
  safetyReviewAcknowledged?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  expectedVersion?: number;
}

export class CancelPrescriptionDto {
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  cancellationReason!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  expectedVersion?: number;
}
