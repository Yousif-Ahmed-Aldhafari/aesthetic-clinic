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

// Step 4.5: Practitioner Commissions
export interface CommissionRuleRecord {
  id: string;
  planId: string;
  procedureId?: string | null;
  procedureNameAr?: string | null;
  procedureNameEn?: string | null;
  calculationType: 'PERCENTAGE' | 'FLAT_AMOUNT';
  rateBasisPoints?: number | null;
  flatAmountMinor?: string | null;
  earningEvent: 'PROCEDURE_COMPLETED' | 'INVOICE_PAID';
  description?: string | null;
  createdAt: string;
}

export interface CommissionAssignmentRecord {
  id: string;
  planId: string;
  practitionerMembershipId: string;
  practitionerName?: string | null;
  practitionerEmail?: string | null;
  effectiveFrom: string;
  effectiveTo?: string | null;
  notes?: string | null;
  createdAt: string;
}

export interface CommissionPlanRecord {
  id: string;
  clinicId: string;
  name: string;
  description?: string | null;
  status: 'ACTIVE' | 'ARCHIVED';
  currency: string;
  currencyScale: number;
  rules: CommissionRuleRecord[];
  assignments: CommissionAssignmentRecord[];
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface CommissionAdjustmentRecord {
  id: string;
  accrualId: string;
  adjustmentAmountMinor: string;
  reason: 'REFUND_REVERSAL' | 'DISCOUNT_CORRECTION' | 'DISPUTE_RESOLUTION' | 'ADMINISTRATIVE_CORRECTION';
  reasonDetails: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  requestedByMembershipId: string;
  requesterName?: string | null;
  decidedByMembershipId?: string | null;
  deciderName?: string | null;
  decidedAt?: string | null;
  settlementId?: string | null;
  createdAt: string;
  version: number;
}

export interface CommissionAccrualRecord {
  id: string;
  clinicId: string;
  planId: string;
  ruleId: string;
  practitionerMembershipId: string;
  practitionerName?: string | null;
  patientId: string;
  patientName?: string | null;
  patientNumber?: string | null;
  invoiceId: string;
  invoiceNumber?: string | null;
  procedureExecutionId?: string | null;
  appointmentId?: string | null;
  baseAmountMinor: string;
  commissionAmountMinor: string;
  currency: string;
  currencyScale: number;
  earningEvent: 'PROCEDURE_COMPLETED' | 'INVOICE_PAID';
  status: 'PENDING' | 'ADJUSTED' | 'SETTLED' | 'REVERSED';
  settlementId?: string | null;
  settlementNumber?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;
  adjustments?: CommissionAdjustmentRecord[];
}

export interface CommissionSettlementRecord {
  id: string;
  clinicId: string;
  settlementNumber: string;
  practitionerMembershipId: string;
  practitionerName?: string | null;
  periodStart: string;
  periodEnd: string;
  grossAmountMinor: string;
  adjustmentsAmountMinor: string;
  netSettledMinor: string;
  currency: string;
  currencyScale: number;
  status: 'DRAFT' | 'CONFIRMED' | 'CANCELLED';
  settledAt?: string | null;
  payoutReference?: string | null;
  notes?: string | null;
  accrualsCount?: number;
  adjustmentsCount?: number;
  createdAt: string;
  updatedAt: string;
  version: number;
  accruals?: CommissionAccrualRecord[];
  adjustments?: CommissionAdjustmentRecord[];
}

export interface DoctorStatementRecord {
  practitionerMembershipId: string;
  practitionerName: string;
  currency: string;
  currencyScale: number;
  grossAccruedMinor: string;
  adjustmentsMinor: string;
  settledMinor: string;
  pendingMinor: string;
  accruals: CommissionAccrualRecord[];
}

// Step 4.5: Financial Reconciliation & Operational Reporting
export interface ReconciliationFinding {
  resource: 'INVOICE' | 'PAYMENT' | 'PACKAGE' | 'INSTALLMENT' | 'COMMISSION' | 'INVENTORY';
  entityId: string;
  code: string;
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  details: string;
  metadata?: Record<string, unknown>;
}

export interface ReconciliationReport {
  clinicId: string;
  timestamp: string;
  reconciledAt?: string;
  status: 'CLEAN' | 'DISCREPANCIES_DETECTED' | 'DISCREPANCIES_FOUND';
  totalDiscrepancies: number;
  findings: ReconciliationFinding[];
  resourcesScanned: {
    invoicesCount: number;
    paymentsCount: number;
    installmentPlansCount: number;
    patientPackagesCount?: number;
    packagesCount?: number;
    refundRequestsCount?: number;
    commissionSettlementsCount: number;
    inventoryBalancesCount?: number;
    inventoryBatchesCount?: number;
    inventoryLocationsCount?: number;
  };
}

export interface RevenueCollectionsReport {
  periodStart: string;
  periodEnd: string;
  currency: string;
  currencyScale: number;
  invoicedRevenueMinor: string;
  collectedPaymentsMinor: string;
  refundedReversedMinor: string;
  netCollectedMinor: string;
  outstandingBalanceMinor: string;
  invoicesCount: number;
  paymentsCount: number;
}

export interface InstallmentAgingBucket {
  bucket: 'CURRENT' | 'PAST_DUE_1_30' | 'PAST_DUE_31_60' | 'PAST_DUE_61_90' | 'PAST_DUE_90_PLUS';
  labelAr: string;
  count: number;
  totalRemainingMinor: string;
}

export interface InstallmentAgingReport {
  asOf: string;
  currency: string;
  currencyScale: number;
  totalPlansCount: number;
  totalRemainingMinor: string;
  buckets: InstallmentAgingBucket[];
}

export interface PackageLiabilityReport {
  asOf: string;
  currency: string;
  currencyScale: number;
  totalPackagesActive: number;
  totalPrepaidMinor: string;
  totalRecognizedRevenueMinor: string;
  totalDeferredRevenueMinor: string;
  unredeemedSessionsCount: number;
}

export interface PractitionerPerformanceItem {
  practitionerMembershipId: string;
  practitionerName: string;
  proceduresCompleted: number;
  revenueGeneratedMinor: string;
  commissionsAccruedMinor: string;
  commissionsSettledMinor: string;
}

export interface PractitionerPerformanceReport {
  periodStart: string;
  periodEnd: string;
  currency: string;
  currencyScale: number;
  practitioners: PractitionerPerformanceItem[];
}

export interface InventoryValuationLocation {
  locationId: string;
  locationName: string;
  productsCount: number;
  totalUnits: string | number;
  valuationMinor: string;
}

export interface InventoryValuationReport {
  clinicId?: string;
  asOf: string;
  currency: string;
  currencyScale: number;
  totalProductsCount?: number;
  totalLocationsCount?: number;
  totalOnHandUnits?: string;
  totalValuationMinor: string;
  isAccountingVerified?: boolean;
  valuationMethod?: string;
  disclaimerAr?: string;
  disclaimerEn?: string;
  locations: InventoryValuationLocation[];
  batchesSummary?: {
    activeBatchesCount: number;
    expiredBatchesCount: number;
    recalledBatchesCount: number;
  };
}

export interface AppointmentUtilizationReport {
  periodStart: string;
  periodEnd: string;
  totalAppointments: number;
  completedAppointments: number;
  cancelledAppointments: number;
  noShowAppointments: number;
  utilizationRatePercentage: number;
  cancellationRatePercentage: number;
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

    // Step 4.5: Commissions
    commissionPlans:(query?:URLSearchParams,signal?:AbortSignal)=>api<CommissionPlanRecord[]>(`${root}/commission-plans?${query??''}`,'GET',undefined,undefined,signal),
    getCommissionPlan:(id:string,signal?:AbortSignal)=>api<CommissionPlanRecord>(`${root}/commission-plans/${id}`,'GET',undefined,undefined,signal),
    commissionAccruals:(query?:URLSearchParams,signal?:AbortSignal)=>api<CommissionAccrualRecord[]>(`${root}/commission-accruals?${query??''}`,'GET',undefined,undefined,signal),
    getCommissionAccrual:(id:string,signal?:AbortSignal)=>api<CommissionAccrualRecord>(`${root}/commission-accruals/${id}`,'GET',undefined,undefined,signal),
    commissionSettlements:(query?:URLSearchParams,signal?:AbortSignal)=>api<CommissionSettlementRecord[]>(`${root}/commission-settlements?${query??''}`,'GET',undefined,undefined,signal),
    getCommissionSettlement:(id:string,signal?:AbortSignal)=>api<CommissionSettlementRecord>(`${root}/commission-settlements/${id}`,'GET',undefined,undefined,signal),
    myStatement:(signal?:AbortSignal)=>api<DoctorStatementRecord>(`${root}/commissions/my-statement`,'GET',undefined,undefined,signal),

    // Step 4.5: Financial Reconciliation & Operational Reports
    reconciliation:(signal?:AbortSignal)=>api<ReconciliationReport>(`${root}/reconciliation`,'GET',undefined,undefined,signal),
    revenueCollections:(startDate:string,endDate:string,signal?:AbortSignal)=>api<RevenueCollectionsReport>(`${root}/reports/revenue-collections?startDate=${startDate}&endDate=${endDate}`,'GET',undefined,undefined,signal),
    installmentAging:(signal?:AbortSignal)=>api<InstallmentAgingReport>(`${root}/reports/installment-aging`,'GET',undefined,undefined,signal),
    packageLiability:(signal?:AbortSignal)=>api<PackageLiabilityReport>(`${root}/reports/package-liability`,'GET',undefined,undefined,signal),
    practitionerPerformance:(startDate:string,endDate:string,signal?:AbortSignal)=>api<PractitionerPerformanceReport>(`${root}/reports/practitioner-performance?startDate=${startDate}&endDate=${endDate}`,'GET',undefined,undefined,signal),
    inventoryValuation:(signal?:AbortSignal)=>api<InventoryValuationReport>(`${root}/reports/inventory-valuation`,'GET',undefined,undefined,signal),
    appointmentUtilization:(startDate:string,endDate:string,signal?:AbortSignal)=>api<AppointmentUtilizationReport>(`${root}/reports/appointment-utilization?startDate=${startDate}&endDate=${endDate}`,'GET',undefined,undefined,signal),
  };
};
