import { Type } from 'class-transformer';
import { IsArray, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';

export class ClinicalSections {
  @IsOptional() @IsString() @MaxLength(4000) chiefComplaint?: string;
  @IsOptional() @IsString() @MaxLength(8000) relevantHistory?: string;
  @IsOptional() @IsArray() @IsString({each:true}) @MaxLength(500,{each:true}) allergies?: string[];
  @IsOptional() @IsArray() @IsString({each:true}) @MaxLength(500,{each:true}) medications?: string[];
  @IsOptional() @IsString() @MaxLength(6000) priorProcedures?: string;
  @IsOptional() @IsString() @MaxLength(8000) examination?: string;
  @IsOptional() @IsString() @MaxLength(8000) assessment?: string;
  @IsOptional() @IsString() @MaxLength(8000) recommendations?: string;
}

export class CreateEncounterDto {
  @IsUUID() patientId!: string;
  @IsOptional() @IsUUID() visitId?: string;
  @IsOptional() @IsUUID() appointmentId?: string;
  @ValidateNested() @Type(()=>ClinicalSections) content!: ClinicalSections;
}
export class UpdateClinicalNoteDto {
  @IsInt() @Min(1) expectedVersion!: number;
  @ValidateNested() @Type(()=>ClinicalSections) content!: ClinicalSections;
}
export class VersionDto { @IsInt() @Min(1) expectedVersion!: number; }
export class CreateAmendmentDto {
  @IsString() @MinLength(3) @MaxLength(1000) reason!: string;
  @ValidateNested() @Type(()=>ClinicalSections) content!: ClinicalSections;
}
export class UpdateMedicalHistoryDto {
  @IsInt() @Min(0) expectedVersion!: number;
  @ValidateNested() @Type(()=>ClinicalSections) content!: ClinicalSections;
}
export class ClinicalListQuery {
  @IsOptional() @IsUUID() cursor?: string;
  @IsOptional() @Type(()=>Number) @IsInt() @Min(1) @Max(50) pageSize=20;
}
export class ClinicalRoute {
  @IsUUID() clinicId!: string;
  @IsUUID() encounterId!: string;
}
export class ClinicalPatientRoute {
  @IsUUID() clinicId!: string;
  @IsUUID() patientId!: string;
}
