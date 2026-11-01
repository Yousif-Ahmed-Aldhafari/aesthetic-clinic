import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsInt, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength, ValidateIf, ValidateNested } from 'class-validator';
import { normalizeName, safeText } from '../patients/patient-input.js';
const supplied=(_o:unknown,v:unknown)=>v!==undefined;
const optional=(_o:unknown,v:unknown)=>v!==undefined&&v!==null;
const text=()=>Transform(({value}:{value:unknown})=>typeof value==='string'?normalizeName(value):value);
export class LineInput {
  @text() @IsString() @MinLength(1) @MaxLength(120) @Matches(safeText) serviceName!:string;
  @ValidateIf(optional) @text() @IsString() @MaxLength(240) @Matches(safeText) description?:string|null;
  @IsString() @Matches(/^\d{1,4}(?:\.\d{1,3})?$/) quantity!:string;
  @IsString() @Matches(/^\d{1,12}(?:\.\d{1,3})?$/) unitPrice!:string;
  @IsString() @Matches(/^\d{1,12}(?:\.\d{1,3})?$/) discount='0';
  @IsInt() @Min(0) @Max(10000) taxBasisPoints=0;
}
export class CreateInvoice {
  @IsUUID() patientId!:string;
  @ValidateIf(optional) @IsUUID() visitId?:string|null;
  @IsUUID() requestKey!:string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(50) @ValidateNested({each:true}) @Type(()=>LineInput) lines!:LineInput[];
}
export class InvoiceVersion {
  @IsInt() @Min(1) @Max(2147483646) expectedVersion!:number;
}
export class EditInvoice extends InvoiceVersion {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(50) @ValidateNested({each:true}) @Type(()=>LineInput) lines!:LineInput[];
}
export class FinancialCommand extends InvoiceVersion {
  @IsUUID() requestKey!:string;
}
export const reasons=['ADMIN_ERROR','DUPLICATE','PATIENT_REFUND','OTHER'] as const;
export class VoidInvoice extends FinancialCommand {
  @IsIn(reasons) reason!:typeof reasons[number];
}
export class RecordPayment extends FinancialCommand {
  @IsString() @Matches(/^\d{1,12}(?:\.\d{1,3})?$/) amount!:string;
  @IsIn(['CASH','BANK_TRANSFER','CARD_MANUAL']) method!:'CASH'|'BANK_TRANSFER'|'CARD_MANUAL';
}
export class ReversePayment extends FinancialCommand {
  @IsString() @Matches(/^\d{1,12}(?:\.\d{1,3})?$/) amount!:string;
  @IsIn(['REFUND','REVERSAL']) kind!:'REFUND'|'REVERSAL';
  @IsIn(reasons) reason!:typeof reasons[number];
}
export class BillingPage {
  @Type(()=>Number) @IsInt() @Min(1) @Max(50) pageSize=20;
  @ValidateIf(supplied) @IsUUID() cursor?:string;
}
export class InvoiceQuery extends BillingPage {
  @text() @IsString() @MaxLength(60) @Matches(safeText) q='';
  @IsIn(['ALL','DRAFT','ISSUED','PARTIALLY_PAID','PAID','VOID']) status:'ALL'|'DRAFT'|'ISSUED'|'PARTIALLY_PAID'|'PAID'|'VOID'='ALL';
}
export class BillingPatientsQuery extends BillingPage {
  @text() @IsString() @MaxLength(60) @Matches(safeText) q='';
}
export class BillingVisitsQuery extends BillingPage {
  @IsUUID() patientId!:string;
}
export class InvoiceRoute { @IsUUID() clinicId!:string; @IsUUID() invoiceId!:string; }
export class PaymentRoute extends InvoiceRoute { @IsUUID() paymentId!:string; }
export class BillingProfileInput extends InvoiceVersion {
  @ValidateIf(optional) @text() @IsString() @MaxLength(250) @Matches(safeText) address?:string|null;
  @ValidateIf(optional) @text() @IsString() @MaxLength(50) @Matches(safeText) registrationNumber?:string|null;
  @ValidateIf(optional) @text() @IsString() @MaxLength(50) @Matches(safeText) taxIdentifier?:string|null;
}

// ---------------------------------------------------------------------------
// Step 4.4: Treatment Packages, Installments, Redemptions & Refunds DTOs
// ---------------------------------------------------------------------------

export class TreatmentPackageItemInput {
  @ValidateIf(optional) @IsUUID() procedureId?: string | null;
  @text() @IsString() @MinLength(2) @MaxLength(120) @Matches(safeText) serviceName!: string;
  @IsInt() @Min(1) @Max(100) sessionQuantity!: number;
  @ValidateIf(optional) @text() @IsString() @MaxLength(500) @Matches(safeText) notes?: string | null;
}

export class CreateTreatmentPackageDto {
  @IsString() @MinLength(2) @MaxLength(50) @Matches(/^[A-Za-z0-9_-]+$/) code!: string;
  @text() @IsString() @MinLength(2) @MaxLength(150) @Matches(safeText) nameAr!: string;
  @ValidateIf(optional) @text() @IsString() @MaxLength(150) @Matches(safeText) nameEn?: string | null;
  @ValidateIf(optional) @text() @IsString() @MaxLength(2000) @Matches(safeText) description?: string | null;
  @ValidateIf(optional) @text() @IsString() @MaxLength(2000) @Matches(safeText) terms?: string | null;
  @IsString() @Matches(/^\d{1,12}(?:\.\d{1,3})?$/) price!: string;
  @ValidateIf(optional) @IsInt() @Min(1) @Max(3650) validityDays = 365;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => TreatmentPackageItemInput) items!: TreatmentPackageItemInput[];
}

export class CreatePackageVersionDto {
  @text() @IsString() @MinLength(2) @MaxLength(150) @Matches(safeText) nameAr!: string;
  @ValidateIf(optional) @text() @IsString() @MaxLength(150) @Matches(safeText) nameEn?: string | null;
  @ValidateIf(optional) @text() @IsString() @MaxLength(2000) @Matches(safeText) description?: string | null;
  @ValidateIf(optional) @text() @IsString() @MaxLength(2000) @Matches(safeText) terms?: string | null;
  @IsString() @Matches(/^\d{1,12}(?:\.\d{1,3})?$/) price!: string;
  @ValidateIf(optional) @IsInt() @Min(1) @Max(3650) validityDays = 365;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => TreatmentPackageItemInput) items!: TreatmentPackageItemInput[];
}

export class PublishPackageVersionDto {
  @ValidateIf(optional) @text() @IsString() @MaxLength(500) @Matches(safeText) notes?: string | null;
}

export class UpdatePackageStatusDto extends InvoiceVersion {
  @IsIn(['ACTIVE', 'RETIRED']) status!: 'ACTIVE' | 'RETIRED';
}

export class PurchasePatientPackageDto {
  @IsUUID() patientId!: string;
  @IsUUID() packageVersionId!: string;
  @ValidateIf(optional) @IsUUID() invoiceId?: string | null;
  @ValidateIf(optional) @IsIn(['UPON_INVOICE_ISSUANCE', 'UPON_FULL_PAYMENT', 'MANUAL_OVERRIDE']) activationPolicy: 'UPON_INVOICE_ISSUANCE' | 'UPON_FULL_PAYMENT' | 'MANUAL_OVERRIDE' = 'UPON_FULL_PAYMENT';
  @IsUUID() requestKey!: string;
  @ValidateIf(optional) @text() @IsString() @MaxLength(500) @Matches(safeText) notes?: string | null;
}

export class ActivatePatientPackageDto extends InvoiceVersion {
  @ValidateIf(optional) @text() @IsString() @MaxLength(500) @Matches(safeText) notes?: string | null;
}

export class RedeemPackageSessionDto {
  @IsUUID() entitlementId!: string;
  @IsUUID() patientId!: string;
  @ValidateIf(optional) @IsUUID() procedureExecutionId?: string | null;
  @ValidateIf(optional) @IsUUID() appointmentId?: string | null;
  @ValidateIf(optional) @IsUUID() visitId?: string | null;
  @ValidateIf(optional) @IsInt() @Min(1) @Max(10) sessionsRedeemed: number = 1;
  @IsUUID() requestKey!: string;
  @ValidateIf(optional) @text() @IsString() @MaxLength(500) @Matches(safeText) notes?: string | null;
}

export class ReversePackageRedemptionDto {
  @ValidateIf(optional) @IsInt() @Min(1) expectedVersion?: number;
  @text() @IsString() @MinLength(3) @MaxLength(500) @Matches(safeText) reason!: string;
  @ValidateIf(optional) @text() @IsString() @MaxLength(500) @Matches(safeText) reasonDetails?: string | null;
  @IsUUID() requestKey!: string;
}

export class InstallmentScheduleInput {
  @IsInt() @Min(1) @Max(36) installmentNumber!: number;
  @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) dueDate!: string;
  @IsString() @Matches(/^\d{1,12}(?:\.\d{1,3})?$/) expectedAmount!: string;
}

export class CreateInstallmentPlanDto {
  @IsUUID() patientId!: string;
  @IsUUID() invoiceId!: string;
  @ValidateIf(optional) @IsUUID() patientPackageId?: string | null;
  @IsInt() @Min(2) @Max(36) numberOfInstallments!: number;
  @IsString() @Matches(/^\d{1,12}(?:\.\d{1,3})?$/) totalAmount!: string;
  @IsArray() @ArrayMinSize(2) @ArrayMaxSize(36) @ValidateNested({ each: true }) @Type(() => InstallmentScheduleInput) schedules!: InstallmentScheduleInput[];
  @IsUUID() requestKey!: string;
  @ValidateIf(optional) @text() @IsString() @MaxLength(500) @Matches(safeText) notes?: string | null;
}

export class AllocateInstallmentPaymentDto {
  @IsUUID() paymentId!: string;
  @IsUUID() scheduleId!: string;
  @IsString() @Matches(/^\d{1,12}(?:\.\d{1,3})?$/) amount!: string;
  @ValidateIf(optional) @text() @IsString() @MaxLength(500) @Matches(safeText) notes?: string | null;
}

export class CreateRefundRequestDto {
  @IsUUID() invoiceId!: string;
  @IsUUID() patientId!: string;
  @ValidateIf(optional) @IsUUID() patientPackageId?: string | null;
  @IsString() @Matches(/^\d{1,12}(?:\.\d{1,3})?$/) amount!: string;
  @IsIn(reasons) reason!: typeof reasons[number];
  @text() @IsString() @MinLength(3) @MaxLength(500) @Matches(safeText) reasonDetails!: string;
  @IsUUID() requestKey!: string;
}

export class DecideRefundRequestDto extends InvoiceVersion {
  @ValidateIf(optional) @text() @IsString() @MaxLength(500) @Matches(safeText) notes?: string | null;
  @ValidateIf(optional) @text() @IsString() @MaxLength(500) @Matches(safeText) rejectionReason?: string | null;
}

export class SettleRefundRequestDto extends InvoiceVersion {
  @ValidateIf(optional) @text() @IsString() @MaxLength(100) @Matches(safeText) settlementReference?: string | null;
  @IsUUID() requestKey!: string;
}

export class CancelPatientPackageDto extends InvoiceVersion {
  @text() @IsString() @MinLength(3) @MaxLength(500) @Matches(safeText) reason!: string;
}

export class PackageQuery extends BillingPage {
  @text() @IsString() @MaxLength(60) @Matches(safeText) q = '';
  @IsIn(['ALL', 'DRAFT', 'ACTIVE', 'RETIRED']) status: 'ALL' | 'DRAFT' | 'ACTIVE' | 'RETIRED' = 'ALL';
}

export class PatientPackageQuery extends BillingPage {
  @ValidateIf(supplied) @IsUUID() patientId?: string;
  @IsIn(['ALL', 'PENDING_PAYMENT', 'ACTIVE', 'EXHAUSTED', 'EXPIRED', 'CANCELLED']) status: 'ALL' | 'PENDING_PAYMENT' | 'ACTIVE' | 'EXHAUSTED' | 'EXPIRED' | 'CANCELLED' = 'ALL';
}

export class InstallmentPlanQuery extends BillingPage {
  @ValidateIf(supplied) @IsUUID() patientId?: string;
  @ValidateIf(supplied) @IsUUID() invoiceId?: string;
  @IsIn(['ALL', 'DRAFT', 'ACTIVE', 'COMPLETED', 'CANCELLED', 'OVERDUE']) status: 'ALL' | 'DRAFT' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED' | 'OVERDUE' = 'ALL';
}

export class RefundRequestQuery extends BillingPage {
  @ValidateIf(supplied) @IsUUID() invoiceId?: string;
  @ValidateIf(supplied) @IsUUID() patientId?: string;
  @IsIn(['ALL', 'REQUESTED', 'APPROVED', 'REJECTED', 'SETTLED', 'CANCELLED']) status: 'ALL' | 'REQUESTED' | 'APPROVED' | 'REJECTED' | 'SETTLED' | 'CANCELLED' = 'ALL';
}
