import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Min,
} from 'class-validator';

export type PhotoCategoryType = 'BEFORE' | 'AFTER' | 'FOLLOW_UP';
export type PhotoSessionStatusType = 'ACTIVE' | 'ARCHIVED';

export class CreatePhotoSessionDto {
  @IsUUID()
  patientId!: string;

  @IsUUID()
  consentId!: string;

  @IsDateString()
  sessionDate!: string;

  @IsOptional()
  @IsUUID()
  encounterId?: string;

  @IsOptional()
  @IsUUID()
  treatmentPlanId?: string;

  @IsOptional()
  @IsUUID()
  treatmentPlanItemId?: string;

  @IsOptional()
  @IsUUID()
  procedureExecutionId?: string;

  @IsOptional()
  @IsString()
  @Length(0, 1000)
  notes?: string;
}

export class UploadPhotoDto {
  @IsIn(['BEFORE', 'AFTER', 'FOLLOW_UP'])
  category!: PhotoCategoryType;

  @IsString()
  @Length(2, 100)
  bodyArea!: string;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  caption?: string;

  @IsOptional()
  @IsDateString()
  takenAt?: string;
}

export class CreatePhotoComparisonDto {
  @IsString()
  @Length(2, 200)
  title!: string;

  @IsUUID()
  beforePhotoId!: string;

  @IsUUID()
  afterPhotoId!: string;

  @IsOptional()
  @IsString()
  @Length(0, 1000)
  notes?: string;
}

export class CreatePhotoAnnotationDto {
  @IsString()
  @Length(2, 50)
  annotationType!: string;

  @IsOptional()
  @IsString()
  @Length(0, 2000)
  geometryJson?: string;

  @IsString()
  @Length(2, 1000)
  comment!: string;
}

export class ArchivePhotoDto {
  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @IsString()
  @Length(3, 500)
  reason!: string;
}

export class ClinicPatientRoute {
  @IsUUID()
  clinicId!: string;

  @IsUUID()
  patientId!: string;
}

export class PhotoSessionRoute {
  @IsUUID()
  clinicId!: string;

  @IsUUID()
  sessionId!: string;
}

export class PhotoRoute {
  @IsUUID()
  clinicId!: string;

  @IsUUID()
  photoId!: string;
}
