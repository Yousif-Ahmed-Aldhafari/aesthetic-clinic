import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsISO8601, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';

export class ConsentListQuery {
  @IsOptional() @IsUUID() cursor?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) pageSize = 20;
  @IsOptional() @IsIn(['PROCEDURE', 'CLINICAL_PHOTOGRAPHY', 'MARKETING_PHOTOGRAPHY']) purpose?: 'PROCEDURE' | 'CLINICAL_PHOTOGRAPHY' | 'MARKETING_PHOTOGRAPHY';
  @IsOptional() @IsIn(['DRAFT', 'PENDING_VERIFICATION', 'ACTIVE', 'WITHDRAWN', 'EXPIRED', 'REFUSED']) status?: 'DRAFT' | 'PENDING_VERIFICATION' | 'ACTIVE' | 'WITHDRAWN' | 'EXPIRED' | 'REFUSED';
  @IsOptional() @IsUUID() patientId?: string;
  @IsOptional() @IsUUID() procedureCatalogId?: string;
}

export class CreateConsentTemplateDto {
  @IsIn(['PROCEDURE', 'CLINICAL_PHOTOGRAPHY', 'MARKETING_PHOTOGRAPHY']) purpose!: 'PROCEDURE' | 'CLINICAL_PHOTOGRAPHY' | 'MARKETING_PHOTOGRAPHY';
  @IsString() @MinLength(2) @MaxLength(200) title!: string;
  @IsOptional() @IsUUID() procedureCatalogId?: string;
  @IsString() @MinLength(2) @MaxLength(200) titleAr!: string;
  @IsString() @MinLength(10) @MaxLength(10000) bodyAr!: string;
  @IsOptional() @IsString() @MinLength(2) @MaxLength(200) titleEn?: string;
  @IsOptional() @IsString() @MinLength(10) @MaxLength(10000) bodyEn?: string;
  @IsString() @MinLength(5) @MaxLength(6000) risksTextAr!: string;
  @IsString() @MinLength(5) @MaxLength(6000) alternativesTextAr!: string;
}

export class UpdateConsentTemplateDto {
  @IsInt() @Min(1) expectedVersion!: number;
  @IsOptional() @IsString() @MinLength(2) @MaxLength(200) title?: string;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsUUID() procedureCatalogId?: string | null;
}

export class CreateTemplateVersionDto {
  @IsString() @MinLength(2) @MaxLength(200) titleAr!: string;
  @IsString() @MinLength(10) @MaxLength(10000) bodyAr!: string;
  @IsOptional() @IsString() @MinLength(2) @MaxLength(200) titleEn?: string;
  @IsOptional() @IsString() @MinLength(10) @MaxLength(10000) bodyEn?: string;
  @IsString() @MinLength(5) @MaxLength(6000) risksTextAr!: string;
  @IsString() @MinLength(5) @MaxLength(6000) alternativesTextAr!: string;
}

export class TemplateVersionDto {
  @IsInt() @Min(1) expectedVersion!: number;
}

export class PreparePatientConsentDto {
  @IsUUID() patientId!: string;
  @IsUUID() templateVersionId!: string;
  @IsIn(['PROCEDURE', 'CLINICAL_PHOTOGRAPHY', 'MARKETING_PHOTOGRAPHY']) purpose!: 'PROCEDURE' | 'CLINICAL_PHOTOGRAPHY' | 'MARKETING_PHOTOGRAPHY';
  @IsOptional() @IsUUID() treatmentPlanId?: string;
  @IsOptional() @IsUUID() treatmentPlanItemId?: string;
  @IsOptional() @IsUUID() procedureCatalogId?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

export class SignPatientConsentDto {
  @IsInt() @Min(1) expectedVersion!: number;
  @IsIn(['PATIENT', 'GUARDIAN', 'LEGAL_REPRESENTATIVE']) signerCapacity!: 'PATIENT' | 'GUARDIAN' | 'LEGAL_REPRESENTATIVE';
  @IsString() @MinLength(2) @MaxLength(200) signerName!: string;
  @IsOptional() @IsString() @MaxLength(100) signerIdentitySnapshot?: string;
  @IsOptional() @IsString() @MaxLength(200) relationshipDescription?: string;
  @IsIn(['DRAWN_BASE64', 'TYPED_CONFIRMATION', 'SECURE_TOKEN']) signatureType!: 'DRAWN_BASE64' | 'TYPED_CONFIRMATION' | 'SECURE_TOKEN';
  @IsString() @MinLength(4) @MaxLength(20000) signatureData!: string;
}

export class VerifyPatientConsentDto {
  @IsInt() @Min(1) expectedVersion!: number;
  @IsOptional() @IsISO8601({ strict: true }) validUntil?: string;
}

export class WithdrawPatientConsentDto {
  @IsInt() @Min(1) expectedVersion!: number;
  @IsString() @MinLength(2) @MaxLength(1000) reason!: string;
}

export class RefusePatientConsentDto {
  @IsInt() @Min(1) expectedVersion!: number;
  @IsString() @MinLength(2) @MaxLength(1000) reason!: string;
}

export class TemplateRoute {
  @IsUUID() clinicId!: string;
  @IsUUID() templateId!: string;
}

export class TemplateVersionRoute extends TemplateRoute {
  @IsUUID() versionId!: string;
}

export class ConsentRoute {
  @IsUUID() clinicId!: string;
  @IsUUID() consentId!: string;
}
