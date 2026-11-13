import { api } from '../auth/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ClinicalServiceCategory =
  | 'GENERAL_CONSULTATION'
  | 'SPECIALIST_CONSULTATION'
  | 'FOLLOW_UP_CONSULTATION'
  | 'LABORATORY_TEST'
  | 'DIAGNOSTIC_IMAGING'
  | 'REFERRAL'
  | 'MINOR_PROCEDURE'
  | 'OTHER_OUTPATIENT_SERVICE';

export type ClinicalOrderType =
  | 'LABORATORY'
  | 'IMAGING'
  | 'REFERRAL'
  | 'PROCEDURE'
  | 'OTHER';

export type ClinicalOrderStatus =
  | 'DRAFT'
  | 'REQUESTED'
  | 'ACCEPTED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'REVIEWED'
  | 'CANCELLED';

export type OrderPriority = 'ROUTINE' | 'URGENT' | 'STAT';

export type DiagnosticResultStatus = 'PRELIMINARY' | 'FINAL' | 'CORRECTED' | 'CANCELLED';

export type ClinicalDocumentType =
  | 'LAB_REPORT'
  | 'IMAGING_REPORT'
  | 'REFERRAL_LETTER'
  | 'DISCHARGE_SUMMARY'
  | 'EXTERNAL_REPORT'
  | 'CONSENT_RECORD'
  | 'CLINICAL_SUMMARY'
  | 'OTHER';

export interface GeneralClinicalService {
  id: string;
  clinicId: string;
  serviceCode: string;
  nameAr: string;
  nameEn?: string | null;
  description?: string | null;
  category: ClinicalServiceCategory;
  specialtyId?: string | null;
  branchId?: string | null;
  defaultDurationMinutes: number;
  requiredPrivilege?: string | null;
  basePriceMinor: number;
  clinicServiceId?: string | null;
  isActive: boolean;
  specialty?: { id: string; code: string; arabicName: string; englishName: string } | null;
  branch?: { id: string; nameAr: string; nameEn?: string | null } | null;
  clinicService?: { id: string; name: string; durationMinutes: number } | null;
  createdAt: string;
  updatedAt: string;
}

export interface ClinicalOrder {
  id: string;
  clinicId: string;
  orderNumber: string;
  patientId: string;
  encounterId?: string | null;
  orderingDoctorMembershipId: string;
  specialtyId?: string | null;
  branchId?: string | null;
  orderType: ClinicalOrderType;
  generalClinicalServiceId?: string | null;
  clinicalIndication?: string | null;
  priority: OrderPriority;
  status: ClinicalOrderStatus;
  notes?: string | null;
  cancellationReason?: string | null;
  cancelledAt?: string | null;
  completedAt?: string | null;
  reviewedAt?: string | null;
  patient?: { id: string; fullName: string; patientNumber: string };
  orderingDoctor?: { id: string; user: { name: string; email?: string } };
  generalClinicalService?: GeneralClinicalService | null;
  results?: ClinicalOrderResult[];
  documents?: Partial<ClinicalDocument>[];
  createdAt: string;
  updatedAt: string;
}

export interface ClinicalOrderResult {
  id: string;
  clinicId: string;
  orderId: string;
  patientId: string;
  resultType: ClinicalOrderType;
  status: DiagnosticResultStatus;
  sourceOrganization?: string | null;
  performedAt?: string | null;
  issuedAt: string;
  recordedByMembershipId: string;
  verifiedByMembershipId?: string | null;
  verifiedAt?: string | null;
  narrativeFindings?: string | null;
  impression?: string | null;
  structuredData?: Record<string, unknown> | null;
  isCritical: boolean;
  criticalNotes?: string | null;
  criticalAcknowledgedAt?: string | null;
  correctionReason?: string | null;
  isReleasedToPatient: boolean;
  releasedAt?: string | null;
  recordedBy?: { id: string; user: { name: string } };
  verifiedBy?: { id: string; user: { name: string } } | null;
  documents?: Partial<ClinicalDocument>[];
  createdAt: string;
  updatedAt: string;
}

export interface ClinicalDocument {
  id: string;
  clinicId: string;
  patientId: string;
  encounterId?: string | null;
  orderId?: string | null;
  resultId?: string | null;
  documentType: ClinicalDocumentType;
  title: string;
  fileName: string;
  mimeType: string;
  fileSizeBytes: number;
  storageKey?: string;
  contentSha256?: string;
  isConfidential: boolean;
  isLegalHold: boolean;
  legalHoldReason?: string | null;
  uploadedByMembershipId: string;
  patient?: { id: string; fullName: string; patientNumber: string };
  uploadedBy?: { id: string; user: { name: string } };
  createdAt: string;
  updatedAt: string;
}

export interface PagedResult<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

function buildQuery(params?: Record<string, unknown>): string {
  if (!params) return '';
  const searchParams = new URLSearchParams();
  for (const [key, val] of Object.entries(params)) {
    if (val !== undefined && val !== null && val !== '') {
      searchParams.append(key, String(val));
    }
  }
  const qs = searchParams.toString();
  return qs ? `?${qs}` : '';
}

// ---------------------------------------------------------------------------
// API: General Clinical Services
// ---------------------------------------------------------------------------

export function listGeneralClinicalServices(
  clinicId: string,
  params?: {
    category?: ClinicalServiceCategory;
    specialtyId?: string;
    branchId?: string;
    isActive?: boolean;
    search?: string;
    pageSize?: number;
    cursor?: string;
  },
  csrfToken?: string,
): Promise<PagedResult<GeneralClinicalService>> {
  const qs = buildQuery(params);
  return api<PagedResult<GeneralClinicalService>>(
    `clinics/${clinicId}/clinical/services${qs}`,
    'GET',
    undefined,
    csrfToken,
  );
}

export function getGeneralClinicalService(
  clinicId: string,
  serviceId: string,
  csrfToken?: string,
): Promise<GeneralClinicalService> {
  return api<GeneralClinicalService>(
    `clinics/${clinicId}/clinical/services/${serviceId}`,
    'GET',
    undefined,
    csrfToken,
  );
}

export function createGeneralClinicalService(
  clinicId: string,
  payload: {
    serviceCode: string;
    nameAr: string;
    nameEn?: string;
    description?: string;
    category: ClinicalServiceCategory;
    specialtyId?: string;
    branchId?: string;
    defaultDurationMinutes?: number;
    requiredPrivilege?: string;
    basePriceMinor?: number;
    clinicServiceId?: string;
    isActive?: boolean;
  },
  csrfToken?: string,
): Promise<GeneralClinicalService> {
  return api<GeneralClinicalService>(
    `clinics/${clinicId}/clinical/services`,
    'POST',
    payload,
    csrfToken,
  );
}

export function updateGeneralClinicalService(
  clinicId: string,
  serviceId: string,
  payload: {
    nameAr?: string;
    nameEn?: string;
    description?: string;
    category?: ClinicalServiceCategory;
    specialtyId?: string | null;
    branchId?: string | null;
    defaultDurationMinutes?: number;
    requiredPrivilege?: string | null;
    basePriceMinor?: number;
    clinicServiceId?: string | null;
    isActive?: boolean;
    expectedVersion?: number;
  },
  csrfToken?: string,
): Promise<GeneralClinicalService> {
  return api<GeneralClinicalService>(
    `clinics/${clinicId}/clinical/services/${serviceId}`,
    'PATCH',
    payload,
    csrfToken,
  );
}

// ---------------------------------------------------------------------------
// API: Clinical Orders
// ---------------------------------------------------------------------------

export function listClinicalOrders(
  clinicId: string,
  params?: {
    patientId?: string;
    encounterId?: string;
    orderType?: ClinicalOrderType;
    status?: ClinicalOrderStatus;
    priority?: OrderPriority;
    pageSize?: number;
    cursor?: string;
  },
  csrfToken?: string,
): Promise<PagedResult<ClinicalOrder>> {
  const qs = buildQuery(params);
  return api<PagedResult<ClinicalOrder>>(
    `clinics/${clinicId}/clinical/orders${qs}`,
    'GET',
    undefined,
    csrfToken,
  );
}

export function getClinicalOrder(
  clinicId: string,
  orderId: string,
  csrfToken?: string,
): Promise<ClinicalOrder> {
  return api<ClinicalOrder>(
    `clinics/${clinicId}/clinical/orders/${orderId}`,
    'GET',
    undefined,
    csrfToken,
  );
}

export function createClinicalOrder(
  clinicId: string,
  payload: {
    patientId: string;
    encounterId?: string;
    specialtyId?: string;
    branchId?: string;
    orderType: ClinicalOrderType;
    generalClinicalServiceId?: string;
    clinicalIndication?: string;
    priority?: OrderPriority;
    notes?: string;
  },
  csrfToken?: string,
): Promise<ClinicalOrder> {
  return api<ClinicalOrder>(
    `clinics/${clinicId}/clinical/orders`,
    'POST',
    payload,
    csrfToken,
  );
}

export function updateClinicalOrderStatus(
  clinicId: string,
  orderId: string,
  payload: {
    status: ClinicalOrderStatus;
    cancellationReason?: string;
    expectedVersion?: number;
  },
  csrfToken?: string,
): Promise<ClinicalOrder> {
  return api<ClinicalOrder>(
    `clinics/${clinicId}/clinical/orders/${orderId}/status`,
    'PATCH',
    payload,
    csrfToken,
  );
}

export function cancelClinicalOrder(
  clinicId: string,
  orderId: string,
  payload: {
    cancellationReason: string;
    expectedVersion?: number;
  },
  csrfToken?: string,
): Promise<ClinicalOrder> {
  return api<ClinicalOrder>(
    `clinics/${clinicId}/clinical/orders/${orderId}/cancel`,
    'POST',
    payload,
    csrfToken,
  );
}

// ---------------------------------------------------------------------------
// API: Clinical Order Results
// ---------------------------------------------------------------------------

export function listOrderResults(
  clinicId: string,
  orderId: string,
  csrfToken?: string,
): Promise<ClinicalOrderResult[]> {
  return api<ClinicalOrderResult[]>(
    `clinics/${clinicId}/clinical/orders/${orderId}/results`,
    'GET',
    undefined,
    csrfToken,
  );
}

export function recordOrderResult(
  clinicId: string,
  orderId: string,
  payload: {
    resultType: ClinicalOrderType;
    status?: DiagnosticResultStatus;
    sourceOrganization?: string;
    performedAt?: string;
    narrativeFindings?: string;
    impression?: string;
    structuredData?: Record<string, unknown>;
    isCritical?: boolean;
    criticalNotes?: string;
    isReleasedToPatient?: boolean;
  },
  csrfToken?: string,
): Promise<ClinicalOrderResult> {
  return api<ClinicalOrderResult>(
    `clinics/${clinicId}/clinical/orders/${orderId}/results`,
    'POST',
    payload,
    csrfToken,
  );
}

export function verifyOrderResult(
  clinicId: string,
  resultId: string,
  payload?: {
    expectedVersion?: number;
    verificationNotes?: string;
  },
  csrfToken?: string,
): Promise<ClinicalOrderResult> {
  return api<ClinicalOrderResult>(
    `clinics/${clinicId}/clinical/results/${resultId}/verify`,
    'POST',
    payload ?? {},
    csrfToken,
  );
}

export function correctOrderResult(
  clinicId: string,
  resultId: string,
  payload: {
    correctionReason: string;
    narrativeFindings?: string;
    impression?: string;
    structuredData?: Record<string, unknown>;
    isCritical?: boolean;
    criticalNotes?: string;
    expectedVersion?: number;
  },
  csrfToken?: string,
): Promise<ClinicalOrderResult> {
  return api<ClinicalOrderResult>(
    `clinics/${clinicId}/clinical/results/${resultId}/correct`,
    'POST',
    payload,
    csrfToken,
  );
}

export function acknowledgeCriticalResult(
  clinicId: string,
  resultId: string,
  payload: {
    actionTaken: string;
    expectedVersion?: number;
  },
  csrfToken?: string,
): Promise<ClinicalOrderResult> {
  return api<ClinicalOrderResult>(
    `clinics/${clinicId}/clinical/results/${resultId}/acknowledge-critical`,
    'POST',
    payload,
    csrfToken,
  );
}

export function releaseResultToPatient(
  clinicId: string,
  resultId: string,
  payload: {
    isReleasedToPatient: boolean;
    expectedVersion?: number;
  },
  csrfToken?: string,
): Promise<ClinicalOrderResult> {
  return api<ClinicalOrderResult>(
    `clinics/${clinicId}/clinical/results/${resultId}/release`,
    'POST',
    payload,
    csrfToken,
  );
}

// ---------------------------------------------------------------------------
// API: Clinical Documents
// ---------------------------------------------------------------------------

export function listClinicalDocuments(
  clinicId: string,
  params?: {
    patientId?: string;
    encounterId?: string;
    orderId?: string;
    resultId?: string;
    documentType?: ClinicalDocumentType;
    isLegalHold?: boolean;
    pageSize?: number;
    cursor?: string;
  },
  csrfToken?: string,
): Promise<PagedResult<ClinicalDocument>> {
  const qs = buildQuery(params);
  return api<PagedResult<ClinicalDocument>>(
    `clinics/${clinicId}/clinical/documents${qs}`,
    'GET',
    undefined,
    csrfToken,
  );
}

export function getClinicalDocumentMetadata(
  clinicId: string,
  documentId: string,
  csrfToken?: string,
): Promise<ClinicalDocument> {
  return api<ClinicalDocument>(
    `clinics/${clinicId}/clinical/documents/${documentId}`,
    'GET',
    undefined,
    csrfToken,
  );
}

export async function uploadClinicalDocument(
  clinicId: string,
  file: File,
  meta: {
    patientId: string;
    encounterId?: string;
    orderId?: string;
    resultId?: string;
    documentType: ClinicalDocumentType;
    title: string;
    isConfidential?: boolean;
  },
  csrfToken?: string,
): Promise<ClinicalDocument> {
  const form = new FormData();
  form.append('file', file, file.name);
  form.append('patientId', meta.patientId);
  form.append('documentType', meta.documentType);
  form.append('title', meta.title);
  form.append('fileName', file.name);
  form.append('mimeType', file.type || 'application/octet-stream');
  if (meta.encounterId) form.append('encounterId', meta.encounterId);
  if (meta.orderId) form.append('orderId', meta.orderId);
  if (meta.resultId) form.append('resultId', meta.resultId);
  if (meta.isConfidential !== undefined) form.append('isConfidential', String(meta.isConfidential));

  const res = await fetch(`/api/v1/clinics/${clinicId}/clinical/documents`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
    },
    body: form,
  });

  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.message ?? data?.error?.message ?? 'فشل في رفع وتشفير المستند');
  }

  return res.json() as Promise<ClinicalDocument>;
}

export function updateClinicalDocument(
  clinicId: string,
  documentId: string,
  payload: {
    title?: string;
    isConfidential?: boolean;
    isLegalHold?: boolean;
    legalHoldReason?: string;
    expectedVersion?: number;
  },
  csrfToken?: string,
): Promise<ClinicalDocument> {
  return api<ClinicalDocument>(
    `clinics/${clinicId}/clinical/documents/${documentId}`,
    'PATCH',
    payload,
    csrfToken,
  );
}

export function getClinicalDocumentDownloadUrl(clinicId: string, documentId: string): string {
  return `/api/v1/clinics/${clinicId}/clinical/documents/${documentId}/download`;
}

// ---------------------------------------------------------------------------
// API: Billing Integration
// ---------------------------------------------------------------------------

export function createDraftInvoiceForService(
  clinicId: string,
  payload: {
    patientId: string;
    generalClinicalServiceId: string;
    requestKey: string;
    visitId?: string;
  },
  csrfToken?: string,
): Promise<unknown> {
  return api(
    `clinics/${clinicId}/clinical/billing/draft-invoice-service`,
    'POST',
    payload,
    csrfToken,
  );
}

export function createDraftInvoiceForOrder(
  clinicId: string,
  payload: {
    orderId: string;
    requestKey: string;
    visitId?: string;
  },
  csrfToken?: string,
): Promise<unknown> {
  return api(
    `clinics/${clinicId}/clinical/billing/draft-invoice-order`,
    'POST',
    payload,
    csrfToken,
  );
}
