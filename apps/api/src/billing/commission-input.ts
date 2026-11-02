import {
  IsEnum,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import type {
  CommissionCalculationType,
  CommissionEarningEvent,
  CommissionAdjustmentReason,
} from '../generated/prisma/client.js';

export class CreateCommissionPlanDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  @Matches(/^[A-Za-z0-9_-]+$/, { message: 'Code must contain only letters, numbers, hyphens or underscores' })
  code!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @ValidateIf((_, v) => v !== undefined && v !== null)
  @IsString()
  @MaxLength(1000)
  description?: string;
}

export class AssignPractitionerPlanDto {
  @IsUUID()
  practitionerMembershipId!: string;

  @IsISO8601()
  effectiveFrom!: string;

  @ValidateIf((_, v) => v !== undefined && v !== null && v !== '')
  @IsISO8601()
  effectiveTo?: string;

  @ValidateIf((_, v) => v !== undefined && v !== null)
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class CreateCommissionRuleDto {
  @ValidateIf((_, v) => v !== undefined && v !== null && v !== '')
  @IsUUID()
  procedureId?: string;

  @IsEnum(['PERCENTAGE', 'FLAT_AMOUNT'])
  calculationType!: CommissionCalculationType;

  @ValidateIf((o) => o.calculationType === 'PERCENTAGE' || (o.rateBasisPoints !== undefined && o.rateBasisPoints !== null))
  @IsInt()
  @Min(0)
  @Max(10000)
  rateBasisPoints?: number;

  @ValidateIf((o) => o.calculationType === 'FLAT_AMOUNT' || (o.flatAmount !== undefined && o.flatAmount !== null && o.flatAmount !== ''))
  @IsString()
  @Matches(/^[0-9]+(\.[0-9]{1,3})?$/, { message: 'Invalid decimal monetary amount' })
  flatAmount?: string;

  @IsEnum(['PROCEDURE_COMPLETED', 'INVOICE_PAID'])
  earningEvent!: CommissionEarningEvent;

  @ValidateIf((_, v) => v !== undefined && v !== null)
  @IsString()
  @MaxLength(255)
  description?: string;
}

export class CreateCommissionAccrualDto {
  @IsUUID()
  planId!: string;

  @IsUUID()
  ruleId!: string;

  @IsUUID()
  practitionerMembershipId!: string;

  @IsUUID()
  patientId!: string;

  @IsUUID()
  invoiceId!: string;

  @ValidateIf((_, v) => v !== undefined && v !== null && v !== '')
  @IsUUID()
  procedureExecutionId?: string;

  @ValidateIf((_, v) => v !== undefined && v !== null && v !== '')
  @IsUUID()
  appointmentId?: string;

  @IsString()
  @Matches(/^[0-9]+(\.[0-9]{1,3})?$/, { message: 'Invalid decimal base amount' })
  baseAmount!: string;

  @IsEnum(['PROCEDURE_COMPLETED', 'INVOICE_PAID'])
  earningEvent!: CommissionEarningEvent;

  @ValidateIf((_, v) => v !== undefined && v !== null)
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @IsUUID()
  requestKey!: string;
}

export class RequestCommissionAdjustmentDto {
  @IsString()
  @Matches(/^-?[0-9]+(\.[0-9]{1,3})?$/, { message: 'Invalid signed decimal adjustment amount' })
  adjustmentAmount!: string;

  @IsEnum(['REFUND_REVERSAL', 'DISCOUNT_CORRECTION', 'DISPUTE_RESOLUTION', 'ADMINISTRATIVE_CORRECTION'])
  reason!: CommissionAdjustmentReason;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reasonDetails!: string;

  @IsUUID()
  requestKey!: string;
}

export class DecideCommissionAdjustmentDto {
  @IsEnum(['APPROVE', 'REJECT'])
  decision!: 'APPROVE' | 'REJECT';

  @ValidateIf((_, v) => v !== undefined && v !== null)
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class CreateCommissionSettlementDto {
  @IsUUID()
  practitionerMembershipId!: string;

  @IsISO8601()
  periodStart!: string;

  @IsISO8601()
  periodEnd!: string;

  @IsUUID(undefined, { each: true })
  accrualIds!: string[];

  @ValidateIf((_, v) => Array.isArray(v))
  @IsUUID(undefined, { each: true })
  adjustmentIds?: string[];

  @ValidateIf((_, v) => v !== undefined && v !== null)
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @IsUUID()
  requestKey!: string;
}

export class ConfirmCommissionSettlementDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  payoutReference!: string;

  @IsInt()
  @Min(1)
  expectedVersion!: number;
}

export interface CommissionQuery {
  practitionerMembershipId?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
  cursor?: string;
  limit?: number;
}

export class OperationalReportQueryDto {
  @IsISO8601()
  startDate!: string;

  @IsISO8601()
  endDate!: string;

  @ValidateIf((_, v) => v !== undefined && v !== null && v !== '')
  @IsUUID()
  practitionerMembershipId?: string;
}

