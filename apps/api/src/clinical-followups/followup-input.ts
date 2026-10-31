import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
  Min,
} from 'class-validator';

export enum FollowUpStatusEnum {
  SCHEDULED = 'SCHEDULED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  MISSED = 'MISSED',
}

export enum FollowUpSeverityEnum {
  MILD = 'MILD',
  MODERATE = 'MODERATE',
  SEVERE = 'SEVERE',
}

export enum AdverseEventStatusEnum {
  REPORTED = 'REPORTED',
  UNDER_EVALUATION = 'UNDER_EVALUATION',
  RESOLVED = 'RESOLVED',
  ESCALATED = 'ESCALATED',
}

export enum OutcomeMeasurementScaleEnum {
  CLINICAL_GLOBAL_IMPRESSION = 'CLINICAL_GLOBAL_IMPRESSION',
  PATIENT_SATISFACTION_5_POINT = 'PATIENT_SATISFACTION_5_POINT',
  VISUAL_ANALOG_SCALE_10 = 'VISUAL_ANALOG_SCALE_10',
  STRUCTURED_OBSERVATION = 'STRUCTURED_OBSERVATION',
}

export class ScheduleFollowUpDto {
  @IsUUID('4', { message: 'patientId must be a valid UUID' })
  patientId!: string;

  @IsUUID('4', { message: 'treatingDoctorMembershipId must be a valid UUID' })
  treatingDoctorMembershipId!: string;

  @IsOptional()
  @IsUUID('4', { message: 'encounterId must be a valid UUID' })
  encounterId?: string;

  @IsOptional()
  @IsUUID('4', { message: 'treatmentPlanId must be a valid UUID' })
  treatmentPlanId?: string;

  @IsOptional()
  @IsUUID('4', { message: 'procedureExecutionId must be a valid UUID' })
  procedureExecutionId?: string;

  @IsOptional()
  @IsUUID('4', { message: 'appointmentId must be a valid UUID' })
  appointmentId?: string;

  @IsString({ message: 'reason must be a string' })
  @Length(3, 500, { message: 'reason must be between 3 and 500 characters' })
  reason!: string;

  @IsDateString({}, { message: 'scheduledDate must be a valid ISO-8601 date string' })
  scheduledDate!: string;

  @IsOptional()
  @IsString({ message: 'recoveryInstructions must be a string' })
  @MaxLength(2000, { message: 'recoveryInstructions cannot exceed 2000 characters' })
  recoveryInstructions?: string;
}

export class UpdateFollowUpStatusDto {
  @IsEnum(FollowUpStatusEnum, { message: 'status must be a valid FollowUpStatus' })
  status!: FollowUpStatusEnum;

  @IsOptional()
  @IsString({ message: 'cancelReason must be a string' })
  @Length(3, 500, { message: 'cancelReason must be between 3 and 500 characters' })
  cancelReason?: string;

  @IsInt({ message: 'expectedVersion must be an integer' })
  @Min(1, { message: 'expectedVersion must be positive' })
  expectedVersion!: number;
}

export class CompleteFollowUpAssessmentDto {
  @IsString({ message: 'symptomsObserved must be a string' })
  @Length(2, 2000, { message: 'symptomsObserved must be between 2 and 2000 characters' })
  symptomsObserved!: string;

  @IsString({ message: 'healingProgress must be a string' })
  @Length(2, 1000, { message: 'healingProgress must be between 2 and 1000 characters' })
  healingProgress!: string;

  @IsString({ message: 'clinicalNotes must be a string' })
  @Length(2, 4000, { message: 'clinicalNotes must be between 2 and 4000 characters' })
  clinicalNotes!: string;

  @IsInt({ message: 'expectedVersion must be an integer' })
  @Min(1, { message: 'expectedVersion must be positive' })
  expectedVersion!: number;
}

export class AmendFollowUpAssessmentDto {
  @IsString({ message: 'amendmentReason must be a string' })
  @Length(5, 1000, { message: 'amendmentReason must be between 5 and 1000 characters' })
  amendmentReason!: string;

  @IsString({ message: 'amendedContent must be a string' })
  @Length(2, 4000, { message: 'amendedContent must be between 2 and 4000 characters' })
  amendedContent!: string;
}

export class RecordTreatmentOutcomeDto {
  @IsUUID('4', { message: 'patientId must be a valid UUID' })
  patientId!: string;

  @IsOptional()
  @IsUUID('4', { message: 'followUpId must be a valid UUID' })
  followUpId?: string;

  @IsOptional()
  @IsUUID('4', { message: 'procedureExecutionId must be a valid UUID' })
  procedureExecutionId?: string;

  @IsOptional()
  @IsUUID('4', { message: 'treatmentPlanId must be a valid UUID' })
  treatmentPlanId?: string;

  @IsOptional()
  @IsUUID('4', { message: 'photoComparisonGroupId must be a valid UUID' })
  photoComparisonGroupId?: string;

  @IsEnum(OutcomeMeasurementScaleEnum, { message: 'measurementScale must be a valid OutcomeMeasurementScale' })
  measurementScale!: OutcomeMeasurementScaleEnum;

  @IsOptional()
  @IsNumber({}, { message: 'clinicianScore must be a number' })
  clinicianScore?: number;

  @IsOptional()
  @IsString({ message: 'clinicianNotes must be a string' })
  @MaxLength(2000, { message: 'clinicianNotes cannot exceed 2000 characters' })
  clinicianNotes?: string;

  @IsOptional()
  @IsNumber({}, { message: 'patientReportedScore must be a number' })
  patientReportedScore?: number;

  @IsOptional()
  @IsString({ message: 'patientReportedNotes must be a string' })
  @MaxLength(2000, { message: 'patientReportedNotes cannot exceed 2000 characters' })
  patientReportedNotes?: string;

  @IsOptional()
  @IsDateString({}, { message: 'recordedAt must be a valid ISO-8601 date string' })
  recordedAt?: string;
}

export class RecordAdverseEventDto {
  @IsUUID('4', { message: 'patientId must be a valid UUID' })
  patientId!: string;

  @IsOptional()
  @IsUUID('4', { message: 'followUpId must be a valid UUID' })
  followUpId?: string;

  @IsOptional()
  @IsUUID('4', { message: 'procedureExecutionId must be a valid UUID' })
  procedureExecutionId?: string;

  @IsString({ message: 'eventType must be a string' })
  @Length(2, 100, { message: 'eventType must be between 2 and 100 characters' })
  eventType!: string;

  @IsEnum(FollowUpSeverityEnum, { message: 'severity must be a valid FollowUpSeverity' })
  severity!: FollowUpSeverityEnum;

  @IsDateString({}, { message: 'observationDate must be a valid ISO-8601 date string' })
  observationDate!: string;

  @IsString({ message: 'documentedFindings must be a string' })
  @Length(5, 4000, { message: 'documentedFindings must be between 5 and 4000 characters' })
  documentedFindings!: string;

  @IsOptional()
  @IsString({ message: 'escalationNotes must be a string' })
  @MaxLength(2000, { message: 'escalationNotes cannot exceed 2000 characters' })
  escalationNotes?: string;
}

export class UpdateAdverseEventDto {
  @IsEnum(AdverseEventStatusEnum, { message: 'status must be a valid AdverseEventStatus' })
  status!: AdverseEventStatusEnum;

  @IsOptional()
  @IsString({ message: 'escalationNotes must be a string' })
  @MaxLength(2000, { message: 'escalationNotes cannot exceed 2000 characters' })
  escalationNotes?: string;

  @IsInt({ message: 'expectedVersion must be an integer' })
  @Min(1, { message: 'expectedVersion must be positive' })
  expectedVersion!: number;
}
