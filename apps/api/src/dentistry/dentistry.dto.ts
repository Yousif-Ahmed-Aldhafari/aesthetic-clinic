import {
  IsArray,
  IsBoolean,
  IsEnum,
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
import { Type } from 'class-transformer';

export const DentitionTypes = ['PERMANENT', 'PRIMARY', 'MIXED'] as const;
export type DentitionType = (typeof DentitionTypes)[number];

export const ToothNumberingSystems = ['FDI_ISO_3950', 'UNIVERSAL_SYSTEM', 'PALMER_NOTATION'] as const;
export type ToothNumberingSystem = (typeof ToothNumberingSystems)[number];

export const ToothConditions = [
  'SOUND',
  'CARIES',
  'RESTORATION',
  'CROWN',
  'ROOT_CANAL',
  'IMPLANT',
  'FRACTURE',
  'IMPACTION',
  'MISSING_TOOTH',
  'EXTRACTION_HISTORY',
  'UNERUPTED',
  'SUPERNUMERARY',
  'OTHER',
] as const;
export type ToothCondition = (typeof ToothConditions)[number];

export const PeriodontalFurcationGrades = ['CLASS_0', 'CLASS_I', 'CLASS_II', 'CLASS_III', 'CLASS_IV'] as const;
export type PeriodontalFurcationGrade = (typeof PeriodontalFurcationGrades)[number];

export const ToothMobilityGrades = ['GRADE_0', 'GRADE_1', 'GRADE_2', 'GRADE_3'] as const;
export type ToothMobilityGrade = (typeof ToothMobilityGrades)[number];

export const DentalTreatmentStageStatuses = [
  'DRAFT',
  'PROPOSED',
  'APPROVED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
  'SUPERSEDED',
] as const;
export type DentalTreatmentStageStatus = (typeof DentalTreatmentStageStatuses)[number];

export class CreateDentalOdontogramDto {
  @IsUUID()
  patientId!: string;

  @IsUUID()
  encounterId!: string;

  @IsOptional()
  @IsEnum(DentitionTypes)
  dentitionType?: DentitionType;

  @IsOptional()
  @IsEnum(ToothNumberingSystems)
  numberingSystem?: ToothNumberingSystem;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  chartType?: string;

  @IsOptional()
  @IsString()
  generalOralCondition?: string;

  @IsOptional()
  @IsString()
  softTissueExamination?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  occlusionClassification?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  temporomandibularJoint?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateDentalOdontogramDraftDto {
  @IsOptional()
  @IsEnum(DentitionTypes)
  dentitionType?: DentitionType;

  @IsOptional()
  @IsEnum(ToothNumberingSystems)
  numberingSystem?: ToothNumberingSystem;

  @IsOptional()
  @IsString()
  generalOralCondition?: string;

  @IsOptional()
  @IsString()
  softTissueExamination?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  occlusionClassification?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  temporomandibularJoint?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsInt()
  @Min(1)
  expectedVersion!: number;
}

export class AmendDentalOdontogramDto {
  @IsString()
  @MinLength(10)
  @MaxLength(1000)
  amendmentReason!: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class EnterInErrorDentalOdontogramDto {
  @IsString()
  @MinLength(10)
  @MaxLength(1000)
  enteredInErrorReason!: string;

  @IsInt()
  @Min(1)
  expectedVersion!: number;
}

export class RecordToothFindingDto {
  @IsInt()
  toothNumberFdi!: number;

  @IsOptional()
  @IsBoolean()
  isSupernumerary?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  supernumeraryIdentifier?: string;

  @IsOptional()
  @IsBoolean()
  isDeciduous?: boolean;

  @IsEnum(ToothConditions)
  condition!: ToothCondition;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  surfacesAffected?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(255)
  existingWork?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  diagnosisCodeIcd10?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  clinicalDescription?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  severity?: string;
}

export class BatchRecordToothFindingsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RecordToothFindingDto)
  findings!: RecordToothFindingDto[];
}

export class RecordPeriodontalRecordDto {
  @IsInt()
  toothNumberFdi!: number;

  @IsArray()
  @IsInt({ each: true })
  probingDepthsMm!: number[]; // 6 sites: [MB, B, DB, ML, L, DL] (0-15 mm)

  @IsArray()
  @IsInt({ each: true })
  gingivalMarginMm!: number[]; // 6 sites: (-10 to +10 mm)

  @IsArray()
  @IsBoolean({ each: true })
  bleedingOnProbing!: boolean[]; // 6 sites

  @IsArray()
  @IsBoolean({ each: true })
  suppuration!: boolean[]; // 6 sites

  @IsOptional()
  @IsEnum(PeriodontalFurcationGrades)
  furcationGrade?: PeriodontalFurcationGrade;

  @IsOptional()
  @IsEnum(ToothMobilityGrades)
  mobilityGrade?: ToothMobilityGrade;

  @IsOptional()
  @IsBoolean()
  plaquePresent?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class CreateDentalTreatmentStageDto {
  @IsUUID()
  serviceId!: string;

  @IsOptional()
  @IsInt()
  toothNumberFdi?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  surfaces?: string[];

  @IsOptional()
  @IsInt()
  @Min(1)
  stageOrder?: number;

  @IsString()
  @MinLength(5)
  @MaxLength(500)
  clinicalIndication!: string;

  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(480)
  estimatedDurationMinutes?: number;

  @IsNumber()
  @Min(0)
  estimatedCost!: number;

  @IsOptional()
  @IsUUID()
  consentTemplateId?: string;
}

export class CompleteDentalTreatmentStageDto {
  @IsOptional()
  @IsString()
  completionNotes?: string;

  @IsOptional()
  @IsUUID()
  patientConsentId?: string;

  @IsInt()
  @Min(1)
  expectedVersion!: number;
}

export class CancelDentalTreatmentStageDto {
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  cancellationReason!: string;

  @IsInt()
  @Min(1)
  expectedVersion!: number;
}

export class BillDentalTreatmentStageDto {
  @IsOptional()
  @IsUUID()
  invoiceId?: string; // If staging to an existing draft invoice
}

export class ConsumeDentalStageMaterialsDto {
  @IsUUID()
  productId!: string;

  @IsUUID()
  batchId!: string;

  @IsUUID()
  locationId!: string;

  @IsNumber()
  @Min(0.0001)
  quantity!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  wasteQuantity?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  idempotencyKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
