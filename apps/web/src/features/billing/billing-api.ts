import { api } from '../auth/api';
export interface Issuer {typography?:string;legalName:string;displayName:string;timezone:string;logoUrl:string|null;primaryColor:string;secondaryColor:string;address:string|null;registrationNumber:string|null;taxIdentifier:string|null}
export interface InvoiceLine {position:number;serviceName:string;description:string|null;quantityMilli:number;unitPriceMinor:string;grossMinor:string;discountMinor:string;taxBasisPoints:number;taxMinor:string;totalMinor:string}
export interface InvoiceRecord {id:string;patientId:string;visitId:string|null;number:string|null;currency:string;currencyScale:number;status:'DRAFT'|'ISSUED'|'PARTIALLY_PAID'|'PAID'|'VOID';subtotalMinor:string;discountMinor:string;taxMinor:string;totalMinor:string;netPaidMinor:string;balanceMinor:string;patientName:string;patientNumber:string;issuer:Issuer|null;issuedAt:string|null;voidedAt:string|null;voidReason:string|null;version:number;createdAt:string;updatedAt:string;lines:InvoiceLine[]}
export interface BillingLineInput {serviceName:string;description:string|null;quantity:string;unitPrice:string;discount:string;taxBasisPoints:number}
export interface PaymentRecord {id:string;invoiceId:string;receiptNumber:string;amountMinor:string;currency:string;currencyScale:number;method:string;createdAt:string;refundedMinor:string;refundableMinor:string;reversals:{id:string;kind:string;reason:string;amountMinor:string;createdAt:string}[]}
export interface BillingPage<T> {items:T[];hasMore:boolean;nextCursor:string|null}
export interface BillingProfile {legalName:string;displayName:string;currency:string;currencyScale:number;timezone:string;profile:{address:string|null;registrationNumber:string|null;taxIdentifier:string|null;version:number}}
export interface Summary {scope:string;items:{currency:string;currencyScale:number;invoiceCount:number;unpaidMinor:string;invoicedMinor:string;collectedMinor:string;outstandingMinor:string;receivedMinor:string;refundedMinor:string}[]}

// Step 4.4: Treatment Packages
export interface TreatmentPackageItem {
  id: string;
  serviceName: string;
  sessionQuantity: number;
  notes?: string | null;
}

export interface TreatmentPackageVersion {
  id: string;
  versionNumber: number;
  nameAr: string;
  nameEn?: string | null;
  description?: string | null;
  terms?: string | null;
  priceMinor: string;
  currency: string;
  currencyScale: number;
  validityDays: number;
  isPublished: boolean;
  publishedAt?: string | null;
  items: TreatmentPackageItem[];
}

export interface TreatmentPackage {
  id: string;
  code: string;
  status: 'ACTIVE' | 'ARCHIVED';
  currentVersion?: TreatmentPackageVersion | null;
  versions: TreatmentPackageVersion[];
  createdAt: string;
  updatedAt: string;
}

// Step 4.4: Patient Packages & Redemptions
export interface PatientPackageEntitlement {
  id: string;
  serviceName: string;
  totalSessions: number;
  redeemedSessions: number;
  remainingSessions: number;
  reservedSessions: number;
}

export interface PackageRedemption {
  id: string;
  entitlementId: string;
  sessionsRedeemed: number;
  status: 'RECORDED' | 'REVERSED';
  redeemedAt: string;
  notes?: string | null;
  reversal?: {
    id: string;
    reason: string;
    reversedAt: string;
  } | null;
}

export interface PatientPackageRecord {
  id: string;
  patientId: string;
  packageId: string;
  packageVersionId: string;
  invoiceId?: string | null;
  status: 'PENDING_PAYMENT' | 'ACTIVE' | 'EXHAUSTED' | 'EXPIRED' | 'CANCELLED';
  activationPolicy: 'UPON_INVOICE_ISSUANCE' | 'UPON_FULL_PAYMENT' | 'MANUAL_OVERRIDE';
  purchasedAt: string;
  activatedAt?: string | null;
  expiresAt?: string | null;
  totalSessions: number;
  redeemedSessions: number;
  remainingSessions: number;
  version: number;
  notes?: string | null;
  package?: TreatmentPackage | null;
  packageVersion?: TreatmentPackageVersion | null;
  entitlements: PatientPackageEntitlement[];
  redemptions: PackageRedemption[];
}

// Step 4.4: Installment Plans
export interface InstallmentSchedule {
  id: string;
  installmentNumber: number;
  dueDate: string;
  expectedAmountMinor: string;
  allocatedAmountMinor: string;
  status: 'PENDING' | 'PARTIALLY_PAID' | 'PAID' | 'OVERDUE' | 'WAIVED';
  paidAt?: string | null;
  allocations: {
    id: string;
    paymentId: string;
    amountMinor: string;
    allocatedAt: string;
  }[];
}

export interface InstallmentPlanRecord {
  id: string;
  patientId: string;
  invoiceId: string;
  patientPackageId?: string | null;
  numberOfInstallments: number;
  totalAmountMinor: string;
  remainingAmountMinor: string;
  status: 'ACTIVE' | 'COMPLETED' | 'DEFAULTED' | 'CANCELLED';
  currency: string;
  currencyScale: number;
  version: number;
  notes?: string | null;
  createdAt: string;
  schedules: InstallmentSchedule[];
}

// Step 4.4: Refund Requests
export interface RefundRequestRecord {
  id: string;
  invoiceId: string;
  patientId: string;
  patientPackageId?: string | null;
  amountMinor: string;
  currency: string;
  currencyScale: number;
  reason: 'ADMIN_ERROR' | 'DUPLICATE' | 'PATIENT_REFUND' | 'OTHER';
  reasonDetails: string;
  status: 'REQUESTED' | 'APPROVED' | 'REJECTED' | 'SETTLED' | 'CANCELLED';
  requestedAt: string;
  reviewedAt?: string | null;
  rejectionReason?: string | null;
  settledAt?: string | null;
  settlementReference?: string | null;
  paymentReversalId?: string | null;
  version: number;
}

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

    // Step 4.4: Treatment Packages
    packages:(query:URLSearchParams,signal:AbortSignal)=>api<BillingPage<TreatmentPackage>>(`${root}/packages?${query}`,'GET',undefined,undefined,signal),
    getPackage:(id:string,signal:AbortSignal)=>api<TreatmentPackage>(`${root}/packages/${id}`,'GET',undefined,undefined,signal),

    // Step 4.4: Patient Packages & Redemptions
    patientPackages:(query:URLSearchParams,signal:AbortSignal)=>api<BillingPage<PatientPackageRecord>>(`${root}/patient-packages?${query}`,'GET',undefined,undefined,signal),
    getPatientPackage:(id:string,signal:AbortSignal)=>api<PatientPackageRecord>(`${root}/patient-packages/${id}`,'GET',undefined,undefined,signal),

    // Step 4.4: Installment Plans
    installmentPlans:(query:URLSearchParams,signal:AbortSignal)=>api<BillingPage<InstallmentPlanRecord>>(`${root}/installment-plans?${query}`,'GET',undefined,undefined,signal),
    getInstallmentPlan:(id:string,signal:AbortSignal)=>api<InstallmentPlanRecord>(`${root}/installment-plans/${id}`,'GET',undefined,undefined,signal),

    // Step 4.4: Refund Requests
    refundRequests:(query:URLSearchParams,signal:AbortSignal)=>api<BillingPage<RefundRequestRecord>>(`${root}/refund-requests?${query}`,'GET',undefined,undefined,signal),
    getRefundRequest:(id:string,signal:AbortSignal)=>api<RefundRequestRecord>(`${root}/refund-requests/${id}`,'GET',undefined,undefined,signal),
  };
};
