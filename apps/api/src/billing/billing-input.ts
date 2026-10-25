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
