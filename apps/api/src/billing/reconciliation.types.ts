export interface ReconciliationFinding {
  resource: 'INVOICE' | 'PAYMENT' | 'INSTALLMENT' | 'PACKAGE' | 'REFUND' | 'COMMISSION' | 'INVENTORY';
  entityId: string;
  code: string;
  severity: 'WARNING' | 'CRITICAL';
  details: string;
  metadata: Record<string, string>;
}

export interface FinancialReconciliationReport {
  clinicId: string;
  timestamp: string;
  resourcesScanned: {
    invoicesCount: number;
    paymentsCount: number;
    installmentPlansCount: number;
    patientPackagesCount: number;
    refundRequestsCount: number;
    commissionSettlementsCount: number;
    inventoryBalancesCount: number;
    inventoryBatchesCount: number;
  };
  totalDiscrepancies: number;
  findings: ReconciliationFinding[];
  status: 'CLEAN' | 'DISCREPANCIES_DETECTED';
}

export interface RevenueCollectionsSummary {
  clinicId: string;
  periodStart: string;
  periodEnd: string;
  currency: string;
  currencyScale: number;
  invoicedRevenueMinor: string;
  invoicesIssuedCount: number;
  grossPaymentsCollectedMinor: string;
  paymentsCount: number;
  refundsSettledMinor: string;
  refundsCount: number;
  netCashFlowMinor: string;
  outstandingReceivablesMinor: string;
}

export interface InstallmentAgingBucket {
  bucket: 'CURRENT' | 'DAYS_1_30' | 'DAYS_31_60' | 'DAYS_61_90' | 'DAYS_90_PLUS';
  labelAr: string;
  schedulesCount: number;
  expectedAmountMinor: string;
  unpaidAmountMinor: string;
}

export interface InstallmentAgingReport {
  clinicId: string;
  asOfDate: string;
  currency: string;
  currencyScale: number;
  totalActivePlansCount: number;
  totalOutstandingMinor: string;
  buckets: InstallmentAgingBucket[];
}

export interface PackageLiabilityReport {
  clinicId: string;
  currency: string;
  currencyScale: number;
  totalActivePackages: number;
  totalSessionsPurchased: number;
  totalSessionsRedeemed: number;
  totalSessionsRemaining: number;
  totalEstimatedUnearnedLiabilityMinor: string;
  packages: Array<{
    packageId: string;
    packageName: string;
    patientName: string;
    totalSessions: number;
    remainingSessions: number;
    status: string;
    expiresAt: string | null;
  }>;
}

export interface PractitionerPerformanceReportItem {
  practitionerMembershipId: string;
  practitionerName: string;
  role: string;
  completedProceduresCount: number;
  grossBillableMinor: string;
  accruedCommissionMinor: string;
  settledCommissionMinor: string;
  pendingCommissionMinor: string;
}

export interface PractitionerPerformanceReport {
  clinicId: string;
  periodStart: string;
  periodEnd: string;
  currency: string;
  currencyScale: number;
  practitioners: PractitionerPerformanceReportItem[];
}

export interface InventoryValuationLocationSummary {
  locationId: string;
  locationName: string;
  productsCount: number;
  totalUnits: string;
  valuationMinor: string;
}

export interface InventoryValuationSummary {
  clinicId: string;
  asOf: string;
  currency: string;
  currencyScale: number;
  totalProductsCount: number;
  totalLocationsCount: number;
  totalOnHandUnits: string;
  totalValuationMinor: string;
  isAccountingVerified: boolean;
  valuationMethod: 'ESTIMATED_UNIT_COST' | 'ACCOUNTING_VERIFIED_FIFO' | 'WEIGHTED_AVERAGE';
  disclaimerAr: string;
  disclaimerEn: string;
  locations: InventoryValuationLocationSummary[];
  batchesSummary: {
    activeBatchesCount: number;
    expiredBatchesCount: number;
    recalledBatchesCount: number;
  };
}

export interface AppointmentUtilizationReport {
  clinicId: string;
  periodStart: string;
  periodEnd: string;
  totalScheduled: number;
  totalArrived: number;
  totalCompleted: number;
  totalCancelled: number;
  totalNoShow: number;
  completionRatePercent: number;
  cancellationRatePercent: number;
}
