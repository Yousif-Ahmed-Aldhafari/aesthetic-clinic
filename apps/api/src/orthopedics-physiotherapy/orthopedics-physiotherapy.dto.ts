import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum AnatomicalRegionEnum {
  CERVICAL_SPINE = 'CERVICAL_SPINE',
  THORACIC_SPINE = 'THORACIC_SPINE',
  LUMBAR_SPINE = 'LUMBAR_SPINE',
  SACROILIAC_PELVIS = 'SACROILIAC_PELVIS',
  SHOULDER = 'SHOULDER',
  ELBOW = 'ELBOW',
  WRIST_HAND = 'WRIST_HAND',
  HIP = 'HIP',
  KNEE = 'KNEE',
  ANKLE_FOOT = 'ANKLE_FOOT',
}

export enum JointLateralityEnum {
  LEFT = 'LEFT',
  RIGHT = 'RIGHT',
  BILATERAL = 'BILATERAL',
  AXIAL = 'AXIAL',
}

export enum JointMovementEnum {
  FLEXION = 'FLEXION',
  EXTENSION = 'EXTENSION',
  ABDUCTION = 'ABDUCTION',
  ADDUCTION = 'ADDUCTION',
  INTERNAL_ROTATION = 'INTERNAL_ROTATION',
  EXTERNAL_ROTATION = 'EXTERNAL_ROTATION',
  PRONATION = 'PRONATION',
  SUPINATION = 'SUPINATION',
  INVERSION = 'INVERSION',
  EVERSION = 'EVERSION',
  DORSIFLEXION = 'DORSIFLEXION',
  PLANTARFLEXION = 'PLANTARFLEXION',
  LATERAL_FLEXION = 'LATERAL_FLEXION',
  ELEVATION = 'ELEVATION',
  DEPRESSION = 'DEPRESSION',
}

export enum RangeOfMotionTypeEnum {
  ACTIVE = 'ACTIVE',
  PASSIVE = 'PASSIVE',
  ACTIVE_ASSISTED = 'ACTIVE_ASSISTED',
}

export enum RehabilitationEpisodeStatusEnum {
  ACTIVE = 'ACTIVE',
  COMPLETED = 'COMPLETED',
  SUSPENDED = 'SUSPENDED',
  DISCHARGED = 'DISCHARGED',
  CANCELLED = 'CANCELLED',
}

export class SpecialManeuverItemDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  result!: string; // 'POSITIVE' | 'NEGATIVE' | 'EQUIVOCAL'

  @IsOptional()
  @IsString()
  notes?: string;
}

export class RecordMusculoskeletalExamDto {
  @IsEnum(AnatomicalRegionEnum)
  anatomicalRegion!: AnatomicalRegionEnum;

  @IsString()
  @IsNotEmpty()
  joint!: string;

  @IsEnum(JointLateralityEnum)
  laterality!: JointLateralityEnum;

  @IsString()
  @IsNotEmpty()
  reasonForExam!: string;

  @IsOptional()
  @IsString()
  historyOfInjury?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tendernessLocations?: string[];

  @IsOptional()
  @IsString()
  swellingGrade?: string;

  @IsOptional()
  @IsString()
  deformityNotes?: string;

  @IsOptional()
  @IsBoolean()
  neurovascularIntact?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(5)
  motorStrengthMrcScale?: number;

  @IsOptional()
  @IsString()
  sensationFindings?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SpecialManeuverItemDto)
  specialManeuvers?: SpecialManeuverItemDto[];

  @IsOptional()
  @IsString()
  clinicalAssessment?: string;
}

export class RecordJointRomDto {
  @IsOptional()
  @IsUUID()
  examId?: string;

  @IsString()
  @IsNotEmpty()
  anatomicalJoint!: string;

  @IsEnum(JointMovementEnum)
  movement!: JointMovementEnum;

  @IsEnum(JointLateralityEnum)
  laterality!: JointLateralityEnum;

  @IsEnum(RangeOfMotionTypeEnum)
  motionType!: RangeOfMotionTypeEnum;

  @IsOptional()
  @IsNumber()
  @Min(-360)
  @Max(360)
  startingDegrees?: number;

  @IsNumber()
  @Min(-360)
  @Max(360)
  endingDegrees!: number;

  @IsOptional()
  @IsString()
  measurementMethod?: string;

  @IsOptional()
  @IsString()
  goniometerDevice?: string;

  @IsOptional()
  @IsNumber()
  @Min(-360)
  @Max(360)
  painOnsetDegrees?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10)
  painScaleVas?: number;

  @IsOptional()
  @IsNumber()
  @Min(-360)
  @Max(360)
  contralateralDegrees?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateRehabilitationEpisodeDto {
  @IsUUID()
  patientId!: string;

  @IsOptional()
  @IsUUID()
  encounterId?: string;

  @IsOptional()
  @IsUUID()
  referringClinicianMembershipId?: string;

  @IsString()
  @IsNotEmpty()
  rehabilitationGoal!: string;

  @IsString()
  @IsNotEmpty()
  functionalBaseline!: string;

  @IsString()
  @IsNotEmpty()
  startDate!: string; // YYYY-MM-DD

  @IsOptional()
  @IsString()
  targetEndDate?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(14)
  visitFrequencyPerWeek?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  plannedInterventions?: string[];
}

export class UpdateRehabilitationEpisodeStatusDto {
  @IsEnum(RehabilitationEpisodeStatusEnum)
  status!: RehabilitationEpisodeStatusEnum;

  @IsOptional()
  @IsString()
  dischargeSummary?: string;

  @IsInt()
  @Min(1)
  expectedVersion!: number;
}

export class ExerciseItemDto {
  @IsString()
  @IsNotEmpty()
  exercise!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  sets?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  reps?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(500)
  resistanceKg?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(120)
  durationMinutes?: number;
}

export class RecordPhysiotherapySessionDto {
  @IsUUID()
  patientId!: string;

  @IsOptional()
  @IsUUID()
  episodeId?: string;

  @IsArray()
  @IsString({ each: true })
  treatmentModalities!: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ExerciseItemDto)
  exerciseDetails?: ExerciseItemDto[];

  @IsInt()
  @Min(5)
  @Max(480)
  sessionDurationMinutes!: number;

  @IsOptional()
  @IsString()
  patientReportedTolerance?: string;

  @IsInt()
  @Min(0)
  @Max(10)
  preSessionPainVas!: number;

  @IsInt()
  @Min(0)
  @Max(10)
  postSessionPainVas!: number;

  @IsString()
  @IsNotEmpty()
  functionalProgressNotes!: string;

  @IsOptional()
  @IsString()
  adverseEvents?: string;
}

export class EnterInErrorRecordDto {
  @IsString()
  @IsNotEmpty()
  errorReason!: string;

  @IsInt()
  @Min(1)
  expectedVersion!: number;
}
