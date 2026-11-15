import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import type { ClinicalPrivilegeCode, PrivilegeScope } from '../generated/prisma/client.js';

export const ClinicalPrivilegeCodes = [
  'CLINICAL_ENCOUNTER_DOCUMENT',
  'CLINICAL_NOTE_SIGN',
  'CLINICAL_DIAGNOSIS_RECORD',
  'MEDICATION_PRESCRIBE',
  'DIAGNOSTIC_LAB_ORDER',
  'DIAGNOSTIC_IMAGING_ORDER',
  'CLINICAL_PROCEDURE_PERFORM',
  'MEDICATION_ADMINISTER',
  'SEDATION_ADMINISTER',
] as const;

export const PrivilegeScopes = ['CLINIC_WIDE', 'BRANCH_SCOPED'] as const;

export class EnableSpecialtyDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  expectedVersion?: number;
}

export class CreatePractitionerProfileDto {
  @IsUUID()
  membershipId!: string;

  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MinLength(2)
  @MaxLength(128)
  professionalTitleAr!: string;

  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MinLength(2)
  @MaxLength(128)
  professionalTitleEn!: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MaxLength(64)
  licenseNumber?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MaxLength(128)
  licensingAuthority?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim().toUpperCase() : value)
  @IsString()
  @MaxLength(64)
  licensingJurisdiction?: string;

  @IsOptional()
  @IsISO8601()
  licenseEffectiveDate?: string;

  @IsOptional()
  @IsISO8601()
  licenseExpirationDate?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MaxLength(255)
  evidenceReference?: string;
}

export class UpdatePractitionerProfileDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  expectedVersion?: number;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MinLength(2)
  @MaxLength(128)
  professionalTitleAr?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MinLength(2)
  @MaxLength(128)
  professionalTitleEn?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MaxLength(64)
  licenseNumber?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MaxLength(128)
  licensingAuthority?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim().toUpperCase() : value)
  @IsString()
  @MaxLength(64)
  licensingJurisdiction?: string;

  @IsOptional()
  @IsISO8601()
  licenseEffectiveDate?: string;

  @IsOptional()
  @IsISO8601()
  licenseExpirationDate?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MaxLength(255)
  evidenceReference?: string;
}

export class AddQualificationDto {
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim().toUpperCase() : value)
  @IsString()
  @MinLength(2)
  @MaxLength(64)
  specialtyCode!: string;

  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MinLength(2)
  @MaxLength(128)
  qualificationTitle!: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MaxLength(64)
  qualificationLevel?: string;

  @IsOptional()
  @IsISO8601()
  effectiveDate?: string;

  @IsOptional()
  @IsISO8601()
  expirationDate?: string;
}

export class RejectQualificationDto {
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

export class RequestClinicalPrivilegeDto {
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim().toUpperCase() : value)
  @IsString()
  @MinLength(2)
  @MaxLength(64)
  specialtyCode!: string;

  @IsEnum(ClinicalPrivilegeCodes)
  privilegeCode!: ClinicalPrivilegeCode;

  @IsOptional()
  @IsEnum(PrivilegeScopes)
  scope?: PrivilegeScope;

  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsISO8601()
  expirationDate?: string;
}

export class RejectPrivilegeDto {
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}
