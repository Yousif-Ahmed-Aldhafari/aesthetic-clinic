import { api } from '../auth/api';

export type PaymentProviderCode =
  | 'SANDBOX_MOCK'
  | 'MOYASAR'
  | 'CHECKOUT_COM'
  | 'STRIPE'
  | 'REGIONAL_BANK_GATEWAY';

export type IntegrationMode = 'SANDBOX' | 'LIVE';
export type ProviderHealthStatus = 'UNKNOWN' | 'HEALTHY' | 'DEGRADED' | 'DISABLED';
export type PaymentIntentStatus = 'CREATED' | 'REQUIRES_ACTION' | 'PROCESSING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';
export type RegulatoryFramework = 'NOT_CONFIGURED' | 'SA_ZATCA' | 'AE_FTA' | 'GENERIC_TAX_INVOICE';
export type RegulatoryDocumentType = 'TAX_INVOICE' | 'SIMPLIFIED_TAX_INVOICE' | 'CREDIT_NOTE' | 'DEBIT_NOTE';

export interface ProviderConfigRecord {
  id: string;
  clinicId: string;
  providerCode: PaymentProviderCode;
  mode: IntegrationMode;
  isEnabled: boolean;
  supportedCurrencies: string[];
  jurisdiction: string;
  hasApiKey: boolean;
  hasWebhookSecret: boolean;
  secretFingerprint: string | null;
  healthStatus: ProviderHealthStatus;
  lastHealthCheckedAt: string | null;
}

export interface PaymentIntentRecord {
  id: string;
  invoiceId: string;
  providerCode: PaymentProviderCode;
  mode: IntegrationMode;
  providerIntentId: string | null;
  amountMinor: string;
  currency: string;
  status: PaymentIntentStatus;
  checkoutUrl: string | null;
  postedPaymentId: string | null;
  createdAt: string;
}

export interface WebhookEventRecord {
  id: string;
  providerCode: PaymentProviderCode;
  providerEventId: string;
  eventType: string;
  processingStatus: string;
  signatureVerified: boolean;
  errorMessage: string | null;
  createdAt: string;
}

export interface ExternalRefundRecord {
  id: string;
  refundRequestId: string;
  providerCode: PaymentProviderCode;
  providerRefundId: string | null;
  amountMinor: string;
  currency: string;
  status: string;
  createdAt: string;
}

export interface ExternalPayoutRecord {
  id: string;
  payoutNumber: string;
  providerCode: PaymentProviderCode | null;
  mode: IntegrationMode;
  amountMinor: string;
  currency: string;
  status: string;
  bankReference: string | null;
  createdAt: string;
}

export interface ReconciliationFindingRecord {
  id: string;
  findingType: string;
  severity: string;
  entityType: string;
  entityId: string;
  descriptionAr: string;
  descriptionEn: string;
}

export interface ReconciliationRunRecord {
  id: string;
  runNumber: string;
  scope: string;
  status: string;
  totalChecked: number;
  discrepancyCount: number;
  summaryJson: {
    internalPostedTotalMinor?: string;
    providerReportedTotalMinor?: string;
    bankSettledTotalMinor?: string;
  };
  findings: ReconciliationFindingRecord[];
  createdAt: string;
}

export interface RegulatoryProfileRecord {
  clinicId: string;
  countryCode: string;
  framework: RegulatoryFramework;
  taxRegistrationNumber: string | null;
  invoiceNumberingPrefix: string | null;
  isEInvoicingEnabled: boolean;
  sandboxMode: boolean;
}

export interface RegulatoryDocumentRecord {
  id: string;
  invoiceId: string;
  documentNumber: string;
  documentType: RegulatoryDocumentType;
  framework: RegulatoryFramework;
  canonicalHash: string;
  status: string;
  isImmutable: boolean;
  createdAt: string;
  submissions?: Array<{
    id: string;
    mode: IntegrationMode;
    status: string;
    externalReferenceId: string | null;
    responseSummary?: { disclaimer?: string; responseMessage?: string } | null;
  }>;
}

export function integrationsApi(clinicId: string) {
  const base = `clinics/${clinicId}/integrations`;
  return {
    listProviders: (signal?: AbortSignal) =>
      api<ProviderConfigRecord[]>(`${base}/providers`, 'GET', undefined, undefined, signal),
    upsertProvider: (csrf: string, body: unknown, signal?: AbortSignal) =>
      api<ProviderConfigRecord>(`${base}/providers`, 'PUT', body, csrf, signal),
    checkProviderHealth: (csrf: string, configId: string, signal?: AbortSignal) =>
      api<ProviderConfigRecord & { health: { ok: boolean; message: string } }>(`${base}/providers/${configId}/health`, 'POST', {}, csrf, signal),
    listPaymentIntents: (signal?: AbortSignal) =>
      api<PaymentIntentRecord[]>(`${base}/payment-intents`, 'GET', undefined, undefined, signal),
    listWebhookEvents: (signal?: AbortSignal) =>
      api<WebhookEventRecord[]>(`${base}/webhook-events`, 'GET', undefined, undefined, signal),
    listExternalRefunds: (signal?: AbortSignal) =>
      api<ExternalRefundRecord[]>(`${base}/external-refunds`, 'GET', undefined, undefined, signal),
    listExternalPayouts: (signal?: AbortSignal) =>
      api<ExternalPayoutRecord[]>(`${base}/external-payouts`, 'GET', undefined, undefined, signal),
    approvePayout: (csrf: string, payoutId: string, submitSandbox: boolean, signal?: AbortSignal) =>
      api<ExternalPayoutRecord>(`${base}/external-payouts/${payoutId}/approve`, 'POST', { submitSandbox }, csrf, signal),
    listReconciliationRuns: (signal?: AbortSignal) =>
      api<ReconciliationRunRecord[]>(`${base}/reconciliation-runs`, 'GET', undefined, undefined, signal),
    runReconciliation: (csrf: string, body: unknown, signal?: AbortSignal) =>
      api<ReconciliationRunRecord>(`${base}/reconciliation-runs`, 'POST', body, csrf, signal),
    getRegulatoryProfile: (signal?: AbortSignal) =>
      api<RegulatoryProfileRecord | null>(`${base}/regulatory/profile`, 'GET', undefined, undefined, signal),
    upsertRegulatoryProfile: (csrf: string, body: unknown, signal?: AbortSignal) =>
      api<RegulatoryProfileRecord>(`${base}/regulatory/profile`, 'PUT', body, csrf, signal),
    listRegulatoryDocuments: (signal?: AbortSignal) =>
      api<RegulatoryDocumentRecord[]>(`${base}/regulatory/documents`, 'GET', undefined, undefined, signal),
    submitRegulatoryDocument: (csrf: string, docId: string, signal?: AbortSignal) =>
      api<unknown>(`${base}/regulatory/documents/${docId}/submit`, 'POST', {}, csrf, signal),
  };
}
