import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsObject, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
export enum FormCategoryDto { CONSULTATION='CONSULTATION',ASSESSMENT='ASSESSMENT',INTAKE='INTAKE',FOLLOW_UP='FOLLOW_UP',OTHER='OTHER' }
export class FormPageDto{@IsOptional()@IsUUID()cursor?:string;@IsOptional()@Type(()=>Number)@IsInt()@Min(1)@Max(50)pageSize=20;@IsOptional()@IsString()@MaxLength(64)specialtyCode?:string;}
export class ApplicableFormsQueryDto{@IsUUID()patientId!:string;@IsUUID()encounterId!:string;}
export class FormResponsePageDto extends FormPageDto{@IsUUID()patientId!:string;@IsUUID()encounterId!:string;}
export class CreateFormDefinitionDto{@Matches(/^[a-z][a-z0-9_-]{2,99}$/)stableKey!:string;@IsString()@MinLength(2)@MaxLength(200)nameAr!:string;@IsOptional()@IsString()@MaxLength(200)nameEn?:string;@IsEnum(FormCategoryDto)category!:FormCategoryDto;@IsString()@MaxLength(64)specialtyCode!:string;@IsOptional()@IsUUID()serviceId?:string;@IsObject()validationSchema!:Record<string,unknown>;@IsObject()presentationSchema!:Record<string,unknown>;@IsOptional()@IsObject()compatibilityMetadata?:Record<string,unknown>;}
export class UpdateFormVersionDto{@IsInt()@Min(1)expectedVersion!:number;@IsObject()validationSchema!:Record<string,unknown>;@IsObject()presentationSchema!:Record<string,unknown>;@IsOptional()@IsObject()compatibilityMetadata?:Record<string,unknown>;}
export class ValidateFormSchemaDto{@IsObject()validationSchema!:Record<string,unknown>;@IsObject()presentationSchema!:Record<string,unknown>;}
export class VersionCommandDto{@IsInt()@Min(1)expectedVersion!:number;}
export class CreateFormVersionDto{@IsInt()@Min(1)expectedDefinitionVersion!:number;}
export class StartFormResponseDto{@IsUUID()patientId!:string;@IsUUID()encounterId!:string;@IsUUID()formVersionId!:string;@IsUUID()branchId!:string;@IsObject()responseData!:Record<string,unknown>;}
export class SaveFormResponseDto{@IsInt()@Min(1)expectedVersion!:number;@IsObject()responseData!:Record<string,unknown>;}
export class AmendFormResponseDto{@IsInt()@Min(1)expectedVersion!:number;@IsString()@MinLength(3)@MaxLength(1000)reason!:string;@IsObject()responseData!:Record<string,unknown>;}
export class FormRoute{@IsUUID()clinicId!:string;@IsUUID()definitionId!:string;}
export class FormVersionRoute extends FormRoute{@IsUUID()versionId!:string;}
export class FormResponseRoute{@IsUUID()clinicId!:string;@IsUUID()responseId!:string;}
