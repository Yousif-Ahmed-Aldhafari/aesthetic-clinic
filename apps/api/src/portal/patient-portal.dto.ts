import { Transform } from 'class-transformer';
import { IsDefined, IsEmail, IsInt, IsNumber, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength, ValidateBy, ValidateIf } from 'class-validator';
import { normalizePhone, safeText, validBirthDate } from '../patients/patient-input.js';
import { LocalBookingInput } from '../appointments/scheduling-input.js';

const supplied = (_o: unknown, v: unknown) => v !== undefined;
const nonNull = (_o: unknown, v: unknown) => v !== undefined && v !== null;

export class ActivatePatientAccountDto {
  @IsString() @Matches(/^[a-z0-9][a-z0-9-]{0,62}$/)
  clinicSlug!: string;

  @IsString() @MinLength(16) @MaxLength(128)
  token!: string;

  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? normalizePhone(value) : value)
  @IsString() @Matches(/^\+?[0-9]{7,15}$/)
  phone!: string;

  @ValidateBy({ name: 'dateOnly', validator: { validate: validBirthDate } })
  dateOfBirth!: string;

  @IsString() @MinLength(8) @MaxLength(128)
  password!: string;
}

export class PatientLoginDto {
  @IsString() @Matches(/^[a-z0-9][a-z0-9-]{0,62}$/)
  clinicSlug!: string;

  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? normalizePhone(value) : value)
  @IsString() @Matches(/^\+?[0-9]{7,15}$/)
  phone!: string;

  @IsString() @MinLength(6) @MaxLength(128)
  password!: string;
}

export class RequestPasswordResetDto {
  @IsString() @Matches(/^[a-z0-9][a-z0-9-]{0,62}$/)
  clinicSlug!: string;

  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? normalizePhone(value) : value)
  @IsString() @Matches(/^\+?[0-9]{7,15}$/)
  phone!: string;

  @ValidateBy({ name: 'dateOnly', validator: { validate: validBirthDate } })
  dateOfBirth!: string;
}

export class ResetPasswordDto {
  @IsString() @Matches(/^[a-z0-9][a-z0-9-]{0,62}$/)
  clinicSlug!: string;

  @IsString() @MinLength(16) @MaxLength(128)
  token!: string;

  @IsString() @MinLength(8) @MaxLength(128)
  newPassword!: string;
}

export class CreatePortalInvitationDto {
  @ValidateIf(nonNull)
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? normalizePhone(value) : value)
  @IsString() @Matches(/^\+?[0-9]{7,15}$/)
  phone?: string | null;

  @ValidateIf(nonNull)
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim().toLowerCase() : value)
  @IsEmail() @MaxLength(254)
  email?: string | null;
}

export class CreatePatientBookingDto extends LocalBookingInput {
  @IsUUID()
  bookingKey!: string;
}

export class ReschedulePatientBookingDto extends LocalBookingInput {
  @IsInt() @Min(1) @Max(2147483646)
  expectedVersion!: number;
}

export class CancelPatientBookingDto {
  @IsInt() @Min(1) @Max(2147483646)
  expectedVersion!: number;

  @ValidateIf(supplied)
  @IsString() @MaxLength(200) @Matches(safeText)
  reason?: string;
}

export class PortalAvailabilityQuery {
  @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date!: string;

  @IsUUID()
  serviceId!: string;

  @ValidateIf(supplied)
  @IsUUID()
  doctorResourceId?: string;
}

export class SignPortalConsentDto {
  @IsInt() @Min(1) @Max(2147483646)
  expectedVersion!: number;

  @IsString() @Matches(/^PATIENT$/, { message: 'REPRESENTATIVE_SIGNING_REQUIRES_IN_PERSON_VERIFICATION' })
  signerCapacity!: string;

  @IsString() @Matches(/^(DRAWN_BASE64|TYPED_CONFIRMATION)$/)
  signatureType!: 'DRAWN_BASE64' | 'TYPED_CONFIRMATION';

  @IsString() @MinLength(2) @MaxLength(20000)
  signatureData!: string;
}

export class RefusePortalConsentDto {
  @IsInt() @Min(1) @Max(2147483646)
  expectedVersion!: number;

  @IsString() @MinLength(2) @MaxLength(1000)
  reason!: string;
}

export class WithdrawPortalConsentDto {
  @IsInt() @Min(1) @Max(2147483646)
  expectedVersion!: number;

  @IsString() @MinLength(3) @MaxLength(1000)
  reason!: string;
}

export class CreateRecoveryCheckInDto {
  @ValidateIf(supplied)
  @IsUUID()
  followUpId?: string;

  @ValidateIf(supplied)
  @IsUUID()
  procedureExecutionId?: string;

  @IsInt() @Min(0) @Max(10)
  painScore!: number;

  @IsDefined()
  symptoms!: Record<string, boolean | string | number> | string[];

  @ValidateIf(supplied)
  @IsString() @MaxLength(1000)
  recoveryNotes?: string;
}

export class SubmitPatientOutcomeDto {
  @ValidateIf(supplied)
  @IsUUID()
  checkInId?: string;

  @ValidateIf(supplied)
  @IsUUID()
  followUpId?: string;

  @ValidateIf(supplied)
  @IsUUID()
  procedureExecutionId?: string;

  @ValidateIf(supplied)
  @IsUUID()
  treatmentOutcomeId?: string;

  @IsString() @Matches(/^(VISUAL_ANALOG_SCALE_10|PATIENT_SATISFACTION_5_POINT|CLINICAL_GLOBAL_IMPRESSION|STRUCTURED_OBSERVATION)$/)
  measurementScale!: 'VISUAL_ANALOG_SCALE_10' | 'PATIENT_SATISFACTION_5_POINT' | 'CLINICAL_GLOBAL_IMPRESSION' | 'STRUCTURED_OBSERVATION';

  @IsNumber()
  score!: number;

  @ValidateIf(supplied)
  @IsString() @MaxLength(1000)
  notes?: string;
}

export class ReviewRecoveryCheckInDto {
  @IsInt() @Min(1) @Max(2147483646)
  expectedVersion!: number;

  @IsString() @Matches(/^(REVIEWED|ESCALATED)$/)
  status!: 'REVIEWED' | 'ESCALATED';

  @ValidateIf(supplied)
  @IsString() @MaxLength(1000)
  clinicianNotes?: string;

  @ValidateIf(supplied)
  isEscalated?: boolean;

  @ValidateIf(supplied)
  @IsString() @MaxLength(500)
  escalationReason?: string;
}
