import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export const PAYMENT_PROVIDER_CODES = [
  'SANDBOX_MOCK',
  'MOYASAR',
  'CHECKOUT_COM',
  'STRIPE',
  'REGIONAL_BANK_GATEWAY',
] as const;

export const INTEGRATION_MODES = ['SANDBOX', 'LIVE'] as const;

export const REGULATORY_FRAMEWORKS = [
  'NOT_CONFIGURED',
  'SA_ZATCA',
  'AE_FTA',
  'GENERIC_TAX_INVOICE',
] as const;

export const REGULATORY_DOCUMENT_TYPES = [
  'TAX_INVOICE',
  'SIMPLIFIED_TAX_INVOICE',
  'CREDIT_NOTE',
  'DEBIT_NOTE',
] as const;

export const RECONCILIATION_SCOPES = [
  'INTERNAL_LEDGER',
  'PAYMENT_PROVIDER',
  'BANK_STATEMENT',
] as const;

export class UpsertProviderConfigurationDto {
  @IsIn(PAYMENT_PROVIDER_CODES)
  providerCode!: (typeof PAYMENT_PROVIDER_CODES)[number];

  @IsIn(INTEGRATION_MODES)
  mode!: (typeof INTEGRATION_MODES)[number];

  @IsBoolean()
  isEnabled!: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  supportedCurrencies?: string[];

  @IsOptional()
  @IsString()
  @Length(2, 16)
  jurisdiction?: string;

  @IsOptional()
  @IsString()
  @Length(8, 512)
  apiKey?: string;

  @IsOptional()
  @IsString()
  @Length(12, 512)
  webhookSecret?: string;
}

export class CreatePaymentIntentDto {
  @IsUUID()
  invoiceId!: string;

  @IsIn(PAYMENT_PROVIDER_CODES)
  providerCode!: (typeof PAYMENT_PROVIDER_CODES)[number];

  @IsOptional()
  @IsIn(INTEGRATION_MODES)
  mode?: (typeof INTEGRATION_MODES)[number];

  @IsInt()
  @Min(1)
  @Max(100_000_000)
  amountMinor!: number;

  @IsString()
  @Length(3, 3)
  currency!: string;

  @IsUUID()
  idempotencyKey!: string;

  @IsOptional()
  @IsString()
  @Length(1, 255)
  returnUrl?: string;
}

export class RecordPaymentSettlementDto {
  @IsUUID()
  providerConfigId!: string;

  @IsString()
  @Length(2, 128)
  providerSettlementId!: string;

  @IsInt()
  @Min(1)
  @Max(100_000_000)
  grossAmountMinor!: number;

  @IsInt()
  @Min(0)
  @Max(100_000_000)
  feeAmountMinor!: number;

  @IsInt()
  @Min(0)
  @Max(100_000_000)
  netAmountMinor!: number;

  @IsString()
  @Length(3, 3)
  currency!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(4)
  currencyScale?: number;

  @IsDateString()
  settledAt!: string;

  @IsOptional()
  @IsString()
  @Length(2, 128)
  bankReference?: string;
}

export class ExecuteExternalRefundDto {
  @IsUUID()
  refundRequestId!: string;

  @IsUUID()
  paymentIntentId!: string;

  @IsUUID()
  idempotencyKey!: string;

  @IsOptional()
  @IsString()
  @Length(2, 240)
  reason?: string;
}

export class PrepareExternalPayoutDto {
  @IsUUID()
  commissionSettlementId!: string;

  @IsUUID()
  providerConfigId!: string;

  @IsUUID()
  idempotencyKey!: string;

  @IsString()
  @Length(2, 120)
  beneficiaryRef!: string;
}

export class ApproveExternalPayoutDto {
  @IsOptional()
  @IsBoolean()
  submitSandbox?: boolean;
}

export class ExternalStatementItemDto {
  @IsString()
  @Length(2, 128)
  providerIntentId!: string;

  @IsInt()
  @Min(0)
  @Max(100_000_000)
  amountMinor!: number;

  @IsString()
  @Length(3, 3)
  currency!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100_000_000)
  feeMinor?: number;

  @IsOptional()
  @IsIn(['SUCCEEDED', 'FAILED', 'REFUNDED'])
  status?: 'SUCCEEDED' | 'FAILED' | 'REFUNDED';
}

export class BankStatementItemDto {
  @IsString()
  @Length(2, 128)
  bankReference!: string;

  @IsInt()
  @Min(0)
  @Max(100_000_000)
  netAmountMinor!: number;

  @IsString()
  @Length(3, 3)
  currency!: string;
}

export class RunExternalReconciliationDto {
  @IsDateString()
  periodStart!: string;

  @IsDateString()
  periodEnd!: string;

  @IsOptional()
  @IsIn(RECONCILIATION_SCOPES)
  scope?: (typeof RECONCILIATION_SCOPES)[number];

  @IsOptional()
  @IsIn(PAYMENT_PROVIDER_CODES)
  providerCode?: (typeof PAYMENT_PROVIDER_CODES)[number];

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => ExternalStatementItemDto)
  providerTransactions?: ExternalStatementItemDto[];

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => BankStatementItemDto)
  bankStatements?: BankStatementItemDto[];
}

export class UpsertRegulatoryProfileDto {
  @IsString()
  @Length(2, 2)
  countryCode!: string;

  @IsIn(REGULATORY_FRAMEWORKS)
  framework!: (typeof REGULATORY_FRAMEWORKS)[number];

  @IsOptional()
  @IsString()
  @Length(4, 60)
  taxRegistrationNumber?: string;

  @IsOptional()
  @IsString()
  @Length(1, 20)
  invoiceNumberingPrefix?: string;

  @IsBoolean()
  isEInvoicingEnabled!: boolean;

  @IsBoolean()
  sandboxMode!: boolean;
}

export class PrepareRegulatoryDocumentDto {
  @IsIn(REGULATORY_DOCUMENT_TYPES)
  documentType!: (typeof REGULATORY_DOCUMENT_TYPES)[number];

  @IsUUID()
  invoiceId!: string;
}

export class WebhookEventPayloadDto {
  @IsString()
  @Length(2, 128)
  eventId!: string;

  @IsString()
  @Length(2, 80)
  eventType!: string;

  @IsString()
  @Length(2, 128)
  providerIntentId!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  amountMinor?: number;

  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;

  @IsOptional()
  @IsObject()
  data?: Record<string, unknown>;
}
