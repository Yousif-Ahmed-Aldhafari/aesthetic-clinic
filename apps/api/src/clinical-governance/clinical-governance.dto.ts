import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import type {
  BreakGlassReviewOutcome,
  ClinicalIncidentCategory,
  ClinicalIncidentSeverity,
  ClinicalIncidentStatus,
  ClinicalPolicyCategory,
  PrivilegeReviewStatus,
  PrivilegeReviewType,
} from '../generated/prisma/client.js';

export const ClinicalPolicyCategories = [
  'ALLERGY_SAFETY',
  'PRESCRIPTION_SAFETY',
  'CRITICAL_RESULT_ESCALATION',
  'FORM_APPROVAL',
  'CLINICAL_PROTOCOL',
  'GENERAL_SAFETY',
] as const;

export const ClinicalIncidentSeverities = [
  'NEAR_MISS',
  'LOW',
  'MODERATE',
  'SEVERE',
  'SENTINEL',
] as const;

export const ClinicalIncidentCategories = [
  'MEDICATION_SAFETY',
  'ALLERGY_ADVERSE_REACTION',
  'DIAGNOSTIC_DELAY',
  'PROCEDURAL_COMPLICATION',
  'PRIVILEGE_BOUNDARY',
  'EQUIPMENT_SAFETY',
  'DOCUMENTATION_ERROR',
] as const;

export const ClinicalIncidentStatuses = [
  'REPORTED',
  'UNDER_INVESTIGATION',
  'CORRECTIVE_ACTION_PENDING',
  'RESOLVED',
  'CLOSED',
] as const;

export const PrivilegeReviewTypes = [
  'INITIAL_GRANT',
  'PERIODIC_RENEWAL',
  'EMERGENCY_SUSPENSION',
  'PRIVILEGE_REDUCTION',
  'REINSTATEMENT',
] as const;

export const PrivilegeReviewStatuses = [
  'PENDING',
  'COMPLETED',
  'REJECTED',
] as const;

export const BreakGlassReviewOutcomes = [
  'APPROVED_JUSTIFIED',
  'QUESTIONED',
  'UNJUSTIFIED_FLAGGED',
] as const;

export class CreateSafetyPolicyDto {
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim().toUpperCase() : value)
  @IsString()
  @MinLength(3)
  @MaxLength(64)
  code!: string;

  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  titleAr!: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MaxLength(200)
  titleEn?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsEnum(ClinicalPolicyCategories)
  category!: ClinicalPolicyCategory;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim().toUpperCase() : value)
  @IsString()
  @MaxLength(64)
  specialtyCode?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim().toUpperCase() : value)
  @IsString()
  @MaxLength(32)
  jurisdiction?: string;

  @IsOptional()
  @IsObject()
  initialRules?: Record<string, unknown>;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MaxLength(500)
  changeSummary?: string;
}

export class CreatePolicyVersionDto {
  @IsObject()
  rulesJson!: Record<string, unknown>;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MaxLength(500)
  changeSummary?: string;
}

export class ApprovePolicyVersionDto {
  @IsOptional()
  @IsISO8601()
  effectiveFrom?: string;

  @IsOptional()
  @IsISO8601()
  effectiveTo?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MaxLength(255)
  evidenceReference?: string;
}

export class RollbackPolicyDto {
  @IsInt()
  @Min(1)
  targetVersionNumber!: number;
}

export class ReportClinicalIncidentDto {
  @IsEnum(ClinicalIncidentSeverities)
  severity!: ClinicalIncidentSeverity;

  @IsEnum(ClinicalIncidentCategories)
  category!: ClinicalIncidentCategory;

  @IsISO8601()
  occurredAt!: string;

  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MinLength(10)
  @MaxLength(4000)
  description!: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MaxLength(2000)
  immediateActionTaken?: string;

  @IsOptional()
  @IsUUID()
  patientId?: string;

  @IsOptional()
  @IsUUID()
  encounterId?: string;
}

export class InvestigateClinicalIncidentDto {
  @IsEnum(ClinicalIncidentStatuses)
  status!: ClinicalIncidentStatus;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MaxLength(4000)
  investigationFindings?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MaxLength(4000)
  rootCauseAnalysis?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MaxLength(4000)
  correctiveActions?: string;
}

export class RequestBreakGlassDto {
  @IsUUID()
  patientId!: string;

  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MinLength(20, { message: 'Clinical justification must be at least 20 characters' })
  @MaxLength(500)
  clinicalJustification!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(120)
  durationMinutes?: number;
}

export class ReviewBreakGlassDto {
  @IsEnum(BreakGlassReviewOutcomes)
  reviewOutcome!: BreakGlassReviewOutcome;

  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MinLength(5)
  @MaxLength(2000)
  reviewNotes!: string;
}

export class RevokeBreakGlassDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class ConductPrivilegeReviewDto {
  @IsUUID()
  practitionerProfileId!: string;

  @IsOptional()
  @IsUUID()
  privilegeId?: string;

  @IsEnum(PrivilegeReviewTypes)
  reviewType!: PrivilegeReviewType;

  @IsOptional()
  @IsEnum(PrivilegeReviewStatuses)
  status?: PrivilegeReviewStatus;

  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MinLength(5)
  @MaxLength(4000)
  findings!: string;

  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MinLength(5)
  @MaxLength(4000)
  recommendation!: string;

  @IsOptional()
  @IsISO8601()
  effectiveDate?: string;

  @IsOptional()
  @IsISO8601()
  expirationDate?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MaxLength(255)
  evidenceReference?: string;
}
