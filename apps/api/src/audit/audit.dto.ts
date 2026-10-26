import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import type { AuditCategory } from './audit.types.js';

export const auditCategories = [
  'AUTH',
  'IDENTITY',
  'STAFF',
  'PATIENTS',
  'SCHEDULING',
  'QUEUE',
  'FINANCE',
  'SECURITY',
  'PLATFORM',
] as const;

export class AuditQueryDto {
  @IsOptional()
  @IsIn(auditCategories)
  category?: AuditCategory;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  action?: string;

  @IsOptional()
  @IsUUID()
  actorId?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsUUID()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 20;
}

export class AuditClinicRoute {
  @IsUUID()
  clinicId!: string;
}

