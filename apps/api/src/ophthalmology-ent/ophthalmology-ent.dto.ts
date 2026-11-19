import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import type {
  VisualAcuityScale,
  TonometryMethod,
  TonsilFriedmanGrade,
  TympanogramType,
} from '../generated/prisma/client.js';

export const VisualAcuityScales = [
  'SNELLEN_FEET_20_20',
  'SNELLEN_METERS_6_6',
  'LOGMAR',
  'DECIMAL',
] as const;

export const TonometryMethods = [
  'GOLDMANN_APPLANATION',
  'NON_CONTACT_AIR_PUFF',
  'TONOPEN',
  'ICARE_REBOUND',
  'PERKINS_PORTABLE',
] as const;

export const TonsilFriedmanGrades = [
  'GRADE_0_SURGICALLY_ABSENT',
  'GRADE_1_WITHIN_PILLARS',
  'GRADE_2_EXTENDING_TO_PILLARS',
  'GRADE_3_BEYOND_PILLARS',
  'GRADE_4_KISSING_TONSILS',
] as const;

export const TympanogramTypes = [
  'TYPE_A_NORMAL_COMPLIANCE',
  'TYPE_AS_STIFF_SYSTEM',
  'TYPE_AD_HIGH_COMPLIANCE_FLACCID',
  'TYPE_B_FLAT_EFFUSION',
  'TYPE_C_NEGATIVE_PRESSURE',
] as const;

// ============================================================================
// 1. OPHTHALMIC REFRACTION DTOS
// ============================================================================

export class RecordRefractionDto {
  @IsOptional()
  @IsIn(VisualAcuityScales)
  acuityScale?: VisualAcuityScale;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(20.0)
  @Max(80.0)
  pupillaryDistanceMm?: number;

  // Right Eye (OD)
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(-25.0)
  @Max(25.0)
  odSphereDiopters?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(-10.0)
  @Max(10.0)
  odCylinderDiopters?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(180)
  odAxisDegrees?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.5)
  @Max(4.0)
  odReadingAddDiopters?: number;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  odUncorrectedVisualAcuity?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  odCorrectedVisualAcuity?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  odPinholeVisualAcuity?: string;

  // Left Eye (OS)
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(-25.0)
  @Max(25.0)
  osSphereDiopters?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(-10.0)
  @Max(10.0)
  osCylinderDiopters?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(180)
  osAxisDegrees?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.5)
  @Max(4.0)
  osReadingAddDiopters?: number;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  osUncorrectedVisualAcuity?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  osCorrectedVisualAcuity?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  osPinholeVisualAcuity?: string;

  // Binocular & Notes
  @IsOptional()
  @IsString()
  @MaxLength(32)
  ouVisualAcuity?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

// ============================================================================
// 2. OPHTHALMIC EXAMINATION DTOS
// ============================================================================

export class RecordOphthalmicExamDto {
  @IsOptional()
  @IsIn(TonometryMethods)
  tonometryMethod?: TonometryMethod;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(1.0)
  @Max(80.0)
  odIntraocularPressureMmHg?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(1.0)
  @Max(80.0)
  osIntraocularPressureMmHg?: number;

  @IsOptional()
  @IsISO8601()
  tonometryTime?: string;

  // Anterior Segment (OD / OS)
  @IsOptional()
  @IsString()
  @MaxLength(255)
  odCorneaFindings?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  osCorneaFindings?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  odAnteriorChamber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  osAnteriorChamber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  odLensCondition?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  osLensCondition?: string;

  // Posterior Segment (OD / OS)
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.0)
  @Max(1.0)
  odCupToDiscRatio?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.0)
  @Max(1.0)
  osCupToDiscRatio?: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  odMaculaFindings?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  osMaculaFindings?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  odRetinalPeriphery?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  osRetinalPeriphery?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  clinicalNotes?: string;
}

// ============================================================================
// 3. ENT EXAMINATION DTOS
// ============================================================================

export class RecordEntExamDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  rightEarCanal?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  rightTympanicMembrane?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  leftEarCanal?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  leftTympanicMembrane?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  nasalSeptumDeformity?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  turbinateHypertrophy?: string;

  @IsOptional()
  @IsBoolean()
  nasalPolypsPresent?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  nasalDischargeDescription?: string;

  @IsOptional()
  @IsIn(TonsilFriedmanGrades)
  tonsilSizeGrade?: TonsilFriedmanGrade;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  posteriorPharyngealWall?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  uvulaPalateSymmetry?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  vocalCordMobility?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  clinicalNotes?: string;
}

// ============================================================================
// 4. AUDIOMETRY ASSESSMENT DTOS
// ============================================================================

export class RecordAudiometryDto {
  @IsOptional()
  @IsUUID()
  orderId?: string;

  @IsArray()
  @IsInt({ each: true })
  @Min(-10, { each: true })
  @Max(120, { each: true })
  rightAirThresholdsDb!: number[];

  @IsArray()
  @IsInt({ each: true })
  @Min(-10, { each: true })
  @Max(120, { each: true })
  leftAirThresholdsDb!: number[];

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Min(-10, { each: true })
  @Max(80, { each: true })
  rightBoneThresholdsDb?: number[];

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Min(-10, { each: true })
  @Max(80, { each: true })
  leftBoneThresholdsDb?: number[];

  @IsOptional()
  @IsIn(TympanogramTypes)
  rightTympanogramType?: TympanogramType;

  @IsOptional()
  @IsIn(TympanogramTypes)
  leftTympanogramType?: TympanogramType;

  @IsOptional()
  @IsInt()
  @Min(-10)
  @Max(120)
  speechReceptionThresholdDbR?: number;

  @IsOptional()
  @IsInt()
  @Min(-10)
  @Max(120)
  speechReceptionThresholdDbL?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.0)
  @Max(100.0)
  speechDiscriminationScoreR?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.0)
  @Max(100.0)
  speechDiscriminationScoreL?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  clinicalImpression?: string;
}

// ============================================================================
// 5. ENTER-IN-ERROR (IMMUTABILITY) DTO
// ============================================================================

export class EnterInErrorSpecialtyRecordDto {
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  errorReason!: string;
}
