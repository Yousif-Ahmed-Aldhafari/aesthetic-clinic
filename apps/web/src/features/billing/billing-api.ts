import { api } from '../auth/api';
export interface Issuer {typography?:string;legalName:string;displayName:string;timezone:string;logoUrl:string|null;primaryColor:string;secondaryColor:string;address:string|null;registrationNumber:string|null;taxIdentifier:string|null}
export interface InvoiceLine {position:number;serviceName:string;description:string|null;quantityMilli:number;unitPriceMinor:string;grossMinor:string;discountMinor:string;taxBasisPoints:number;taxMinor:string;totalMinor:string}
export interface InvoiceRecord {id:string;patientId:string;visitId:string|null;number:string|null;currency:string;currencyScale:number;status:'DRAFT'|'ISSUED'|'PARTIALLY_PAID'|'PAID'|'VOID';subtotalMinor:string;discountMinor:string;taxMinor:string;totalMinor:string;netPaidMinor:string;balanceMinor:string;patientName:string;patientNumber:string;issuer:Issuer|null;issuedAt:string|null;voidedAt:string|null;voidReason:string|null;version:number;createdAt:string;updatedAt:string;lines:InvoiceLine[]}
export interface BillingLineInput {serviceName:string;description:string|null;quantity:string;unitPrice:string;discount:string;taxBasisPoints:number}
export interface PaymentRecord {id:string;invoiceId:string;receiptNumber:string;amountMinor:string;currency:string;currencyScale:number;method:string;createdAt:string;refundedMinor:string;refundableMinor:string;reversals:{id:string;kind:string;reason:string;amountMinor:string;createdAt:string}[]}
export interface BillingPage<T> {items:T[];hasMore:boolean;nextCursor:string|null}
export interface BillingProfile {legalName:string;displayName:string;currency:string;currencyScale:number;timezone:string;profile:{address:string|null;registrationNumber:string|null;taxIdentifier:string|null;version:number}}
export interface Summary {scope:string;items:{currency:string;currencyScale:number;invoiceCount:number;unpaidMinor:string;invoicedMinor:string;collectedMinor:string;outstandingMinor:string;receivedMinor:string;refundedMinor:string}[]}
export const billingApi=(clinicId:string)=>{
  const root=`clinics/${clinicId}/billing`;
  return {
    list:(query:URLSearchParams,signal:AbortSignal)=>api<BillingPage<InvoiceRecord>>(`${root}/invoices?${query}`,'GET',undefined,undefined,signal),
    get:(id:string,signal:AbortSignal)=>api<InvoiceRecord>(`${root}/invoices/${id}`,'GET',undefined,undefined,signal),
    profile:(signal:AbortSignal)=>api<BillingProfile>(`${root}/profile`,'GET',undefined,undefined,signal),
    summary:(signal:AbortSignal)=>api<Summary>(`${root}/summary`,'GET',undefined,undefined,signal),
    patients:(query:URLSearchParams,signal:AbortSignal)=>api<BillingPage<{id:string;fullName:string;patientNumber:string}>>(`${root}/patients?${query}`,'GET',undefined,undefined,signal),
    visits:(query:URLSearchParams,signal:AbortSignal)=>api<BillingPage<{id:string;checkedInAt:string}>>(`${root}/visits?${query}`,'GET',undefined,undefined,signal),
    payments:(id:string,query:URLSearchParams,signal:AbortSignal)=>api<BillingPage<PaymentRecord>>(`${root}/invoices/${id}/payments?${query}`,'GET',undefined,undefined,signal),
    write:<T>(path:string,method:string,input:unknown,csrf:string,signal:AbortSignal)=>api<T>(`${root}/${path}`,method,input,csrf,signal),
  };
};
