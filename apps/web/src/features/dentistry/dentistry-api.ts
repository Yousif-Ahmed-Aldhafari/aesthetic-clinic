import { api } from '../auth/api';
import type {
  DentalOdontogramItem,
  DentalToothFindingItem,
  DentalPeriodontalRecordItem,
  DentalTreatmentStageItem,
  DentitionType,
  ToothNumberingSystem,
  ToothSurface,
  PeriodontalFurcationGrade,
  ToothMobilityGrade,
} from './types';

// =========================================================================
// 1. ODONTOGRAM LIFECYCLE
// =========================================================================

export async function listPatientOdontograms(
  clinicId: string,
  patientId: string,
  csrfToken?: string,
): Promise<{ items: DentalOdontogramItem[] }> {
  return api<{ items: DentalOdontogramItem[] }>(
    `clinics/${clinicId}/dentistry/patients/${patientId}/odontograms`,
    'GET',
    undefined,
    csrfToken,
  );
}

export async function getOdontogramById(
  clinicId: string,
  odontogramId: string,
  csrfToken?: string,
): Promise<DentalOdontogramItem> {
  return api<DentalOdontogramItem>(
    `clinics/${clinicId}/dentistry/odontograms/${odontogramId}`,
    'GET',
    undefined,
    csrfToken,
  );
}

export async function createOdontogramDraft(
  clinicId: string,
  input: {
    patientId: string;
    encounterId: string;
    dentitionType?: DentitionType;
    numberingSystem?: ToothNumberingSystem;
    chartType?: string;
    generalOralCondition?: string;
    softTissueExamination?: string;
    occlusionClassification?: string;
    temporomandibularJoint?: string;
    notes?: string;
  },
  csrfToken?: string,
): Promise<DentalOdontogramItem> {
  return api<DentalOdontogramItem>(
    `clinics/${clinicId}/dentistry/odontograms`,
    'POST',
    input,
    csrfToken,
  );
}

export async function updateOdontogramDraft(
  clinicId: string,
  odontogramId: string,
  input: {
    expectedVersion: number;
    dentitionType?: DentitionType;
    numberingSystem?: ToothNumberingSystem;
    generalOralCondition?: string;
    softTissueExamination?: string;
    occlusionClassification?: string;
    temporomandibularJoint?: string;
    notes?: string;
  },
  csrfToken?: string,
): Promise<DentalOdontogramItem> {
  return api<DentalOdontogramItem>(
    `clinics/${clinicId}/dentistry/odontograms/${odontogramId}`,
    'PUT',
    input,
    csrfToken,
  );
}

export async function finalizeOdontogram(
  clinicId: string,
  odontogramId: string,
  expectedVersion: number,
  csrfToken?: string,
): Promise<DentalOdontogramItem> {
  return api<DentalOdontogramItem>(
    `clinics/${clinicId}/dentistry/odontograms/${odontogramId}/finalize`,
    'POST',
    { expectedVersion },
    csrfToken,
  );
}

export async function amendOdontogram(
  clinicId: string,
  odontogramId: string,
  input: {
    amendmentReason: string;
    notes?: string;
  },
  csrfToken?: string,
): Promise<DentalOdontogramItem> {
  return api<DentalOdontogramItem>(
    `clinics/${clinicId}/dentistry/odontograms/${odontogramId}/amend`,
    'POST',
    input,
    csrfToken,
  );
}

export async function enterInErrorOdontogram(
  clinicId: string,
  odontogramId: string,
  reason: string,
  csrfToken?: string,
): Promise<DentalOdontogramItem> {
  return api<DentalOdontogramItem>(
    `clinics/${clinicId}/dentistry/odontograms/${odontogramId}/enter-in-error`,
    'POST',
    { reason },
    csrfToken,
  );
}

// =========================================================================
// 2. TOOTH FINDINGS
// =========================================================================

export async function upsertToothFindings(
  clinicId: string,
  odontogramId: string,
  findings: DentalToothFindingItem[],
  csrfToken?: string,
): Promise<DentalToothFindingItem[]> {
  return api<DentalToothFindingItem[]>(
    `clinics/${clinicId}/dentistry/odontograms/${odontogramId}/findings`,
    'POST',
    { findings },
    csrfToken,
  );
}

// =========================================================================
// 3. PERIODONTAL RECORDING
// =========================================================================

export async function recordPeriodontalRecord(
  clinicId: string,
  odontogramId: string,
  input: {
    toothNumberFdi: number;
    probingDepthsMm: number[];
    gingivalMarginMm: number[];
    bleedingOnProbing: boolean[];
    suppuration: boolean[];
    furcationGrade?: PeriodontalFurcationGrade;
    mobilityGrade?: ToothMobilityGrade;
    plaquePresent?: boolean;
    notes?: string;
  },
  csrfToken?: string,
): Promise<DentalPeriodontalRecordItem> {
  return api<DentalPeriodontalRecordItem>(
    `clinics/${clinicId}/dentistry/odontograms/${odontogramId}/periodontal`,
    'POST',
    input,
    csrfToken,
  );
}

// =========================================================================
// 4. TREATMENT STAGING & PROCEDURES
// =========================================================================

export async function listTreatmentStages(
  clinicId: string,
  patientId: string,
  csrfToken?: string,
): Promise<{ items: DentalTreatmentStageItem[] }> {
  return api<{ items: DentalTreatmentStageItem[] }>(
    `clinics/${clinicId}/dentistry/patients/${patientId}/treatment-stages`,
    'GET',
    undefined,
    csrfToken,
  );
}

export async function createTreatmentStage(
  clinicId: string,
  input: {
    odontogramId: string;
    patientId: string;
    encounterId: string;
    serviceId: string;
    toothNumberFdi?: number;
    surfaces?: ToothSurface[];
    stageOrder: number;
    clinicalIndication: string;
    procedureNotes?: string;
    estimatedCost: number;
    currency?: string;
    plannedDentistMembershipId?: string;
    consentTemplateId?: string;
  },
  csrfToken?: string,
): Promise<DentalTreatmentStageItem> {
  return api<DentalTreatmentStageItem>(
    `clinics/${clinicId}/dentistry/treatment-stages`,
    'POST',
    input,
    csrfToken,
  );
}

export async function approveTreatmentStage(
  clinicId: string,
  stageId: string,
  expectedVersion: number,
  csrfToken?: string,
): Promise<DentalTreatmentStageItem> {
  return api<DentalTreatmentStageItem>(
    `clinics/${clinicId}/dentistry/treatment-stages/${stageId}/approve`,
    'POST',
    { expectedVersion },
    csrfToken,
  );
}

export async function completeTreatmentStage(
  clinicId: string,
  stageId: string,
  input: {
    expectedVersion: number;
    patientConsentId?: string;
    completionNotes?: string;
  },
  csrfToken?: string,
): Promise<DentalTreatmentStageItem> {
  return api<DentalTreatmentStageItem>(
    `clinics/${clinicId}/dentistry/treatment-stages/${stageId}/complete`,
    'POST',
    input,
    csrfToken,
  );
}

export async function cancelTreatmentStage(
  clinicId: string,
  stageId: string,
  input: {
    expectedVersion: number;
    cancellationReason: string;
  },
  csrfToken?: string,
): Promise<DentalTreatmentStageItem> {
  return api<DentalTreatmentStageItem>(
    `clinics/${clinicId}/dentistry/treatment-stages/${stageId}/cancel`,
    'POST',
    input,
    csrfToken,
  );
}

export async function billTreatmentStage(
  clinicId: string,
  stageId: string,
  existingInvoiceId?: string,
  csrfToken?: string,
): Promise<{ stage: DentalTreatmentStageItem; invoiceLine: unknown; invoiceId: string }> {
  return api<{ stage: DentalTreatmentStageItem; invoiceLine: unknown; invoiceId: string }>(
    `clinics/${clinicId}/dentistry/treatment-stages/${stageId}/bill`,
    'POST',
    { existingInvoiceId },
    csrfToken,
  );
}

export async function consumeStageMaterials(
  clinicId: string,
  stageId: string,
  items: Array<{
    productId: string;
    locationId: string;
    batchId: string;
    quantity: number;
    notes?: string;
  }>,
  csrfToken?: string,
): Promise<{ success: boolean; movementsCount: number }> {
  return api<{ success: boolean; movementsCount: number }>(
    `clinics/${clinicId}/dentistry/treatment-stages/${stageId}/consume-materials`,
    'POST',
    { items },
    csrfToken,
  );
}
