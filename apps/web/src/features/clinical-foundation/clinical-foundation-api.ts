import { api } from '../auth/api';

export type ObservationType =
  | 'BLOOD_PRESSURE_SYSTOLIC'
  | 'BLOOD_PRESSURE_DIASTOLIC'
  | 'HEART_RATE'
  | 'RESPIRATORY_RATE'
  | 'BODY_TEMPERATURE'
  | 'OXYGEN_SATURATION'
  | 'WEIGHT'
  | 'HEIGHT'
  | 'BODY_MASS_INDEX'
  | 'GENERAL_OBSERVATION';

export type ObservationStatus =
  | 'RECORDED'
  | 'VERIFIED'
  | 'AMENDED'
  | 'ENTERED_IN_ERROR';

export type ClinicalProvenance =
  | 'CLINICIAN_MEASURED'
  | 'PATIENT_REPORTED'
  | 'DEVICE_RECORDED'
  | 'HISTORICAL_TRANSCRIPTION';

export type DiagnosisRole =
  | 'PRIMARY'
  | 'SECONDARY'
  | 'DIFFERENTIAL'
  | 'ADMISSION'
  | 'DISCHARGE';

export type DiagnosisClinicalStatus =
  | 'PROVISIONAL'
  | 'CONFIRMED'
  | 'RESOLVED'
  | 'REFUTED'
  | 'ENTERED_IN_ERROR';

export type DiagnosisVerificationStatus =
  | 'SUSPECTED'
  | 'PROBABLE'
  | 'CONFIRMED'
  | 'REFUTED';

export type ProblemListStatus =
  | 'ACTIVE'
  | 'INACTIVE'
  | 'RESOLVED'
  | 'REMITTED';

export type AllergyStatusType =
  | 'ALLERGY_PRESENT'
  | 'NO_KNOWN_ALLERGIES'
  | 'STATUS_UNCONFIRMED_UNKNOWN';

export type AllergenCategory =
  | 'MEDICATION'
  | 'FOOD'
  | 'ENVIRONMENTAL'
  | 'BIOLOGICAL'
  | 'LATEX'
  | 'OTHER';

export type AllergySeverity =
  | 'MILD'
  | 'MODERATE'
  | 'SEVERE'
  | 'LIFE_THREATENING'
  | 'UNKNOWN';

export type AllergyClinicalStatus =
  | 'ACTIVE'
  | 'INACTIVE'
  | 'RESOLVED'
  | 'ENTERED_IN_ERROR';

export type AllergyVerificationStatus =
  | 'SUSPECTED'
  | 'PATIENT_REPORTED'
  | 'CLINICIAN_CONFIRMED'
  | 'REFUTED';

export type MedicationRecordStatus =
  | 'ACTIVE'
  | 'PAUSED'
  | 'DISCONTINUED'
  | 'COMPLETED'
  | 'ENTERED_IN_ERROR';

export type PrescriptionStatus =
  | 'DRAFT'
  | 'PENDING_REVIEW'
  | 'SIGNED'
  | 'CANCELLED'
  | 'SUPERSEDED';

export interface ClinicalObservationItem {
  id: string;
  clinicId: string;
  patientId: string;
  encounterId: string | null;
  authorMembershipId: string;
  observationType: ObservationType;
  numericValue: number | null;
  textValue: string | null;
  unit: string;
  measuredAt: string;
  status: ObservationStatus;
  provenance: ClinicalProvenance;
  bodySite: string | null;
  method: string | null;
  interpretation: string | null;
  amendmentReason: string | null;
  supersededById: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  authorName?: string | null;
}

export interface EncounterDiagnosisItem {
  id: string;
  clinicId: string;
  patientId: string;
  encounterId: string;
  authorMembershipId: string;
  confirmedByMembershipId: string | null;
  diagnosisRole: DiagnosisRole;
  clinicalStatus: DiagnosisClinicalStatus;
  verificationStatus: DiagnosisVerificationStatus;
  isProblem: boolean;
  problemStatus: ProblemListStatus | null;
  codingSystem: string;
  codingSystemVersion: string | null;
  code: string;
  displayAr: string;
  displayEn: string | null;
  clinicalNarrative: string | null;
  onsetDate: string | null;
  resolutionDate: string | null;
  amendmentReason: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  authorName?: string | null;
  confirmedByName?: string | null;
}

export interface PatientAllergyItem {
  id: string;
  clinicId: string;
  patientId: string;
  encounterId: string | null;
  recordedByMembershipId: string;
  verifiedByMembershipId: string | null;
  allergyStatusType: AllergyStatusType;
  category: AllergenCategory;
  substance: string;
  substanceCode: string | null;
  codingSystem: string | null;
  reaction: string | null;
  severity: AllergySeverity;
  clinicalStatus: AllergyClinicalStatus;
  verificationStatus: AllergyVerificationStatus;
  onsetDate: string | null;
  recordedAt: string;
  verifiedAt: string | null;
  notes: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  recordedByName?: string | null;
  verifiedByName?: string | null;
}

export interface MedicationRecordItem {
  id: string;
  clinicId: string;
  patientId: string;
  encounterId: string | null;
  recordedByMembershipId: string;
  verifiedByMembershipId: string | null;
  reconciledByMembershipId: string | null;
  medicationName: string;
  genericName: string | null;
  brandName: string | null;
  atcCode: string | null;
  dosage: string;
  dosageAmount: number | null;
  dosageUnit: string | null;
  route: string;
  frequency: string;
  instructions: string | null;
  indication: string | null;
  status: MedicationRecordStatus;
  provenance: ClinicalProvenance;
  isReconciled: boolean;
  reconciledAt: string | null;
  startDate: string | null;
  endDate: string | null;
  discontinuationReason: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  recordedByName?: string | null;
  verifiedByName?: string | null;
  reconciledByName?: string | null;
}

export interface PrescriptionItemModel {
  id: string;
  clinicId: string;
  prescriptionId: string;
  medicationName: string;
  genericName: string | null;
  strength: string;
  dosageForm: string;
  route: string;
  frequency: string;
  duration: string;
  durationDays: number | null;
  quantity: number;
  unit: string;
  refillsAllowed: number;
  substitutionAllowed: boolean;
  instructions: string;
  indication: string | null;
  itemOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface MedicationPrescriptionItem {
  id: string;
  clinicId: string;
  patientId: string;
  encounterId: string;
  prescriberMembershipId: string;
  practitionerClinicalPrivilegeId: string | null;
  prescriptionNumber: string;
  status: PrescriptionStatus;
  notes: string | null;
  signedAt: string | null;
  signedByMembershipId: string | null;
  signatureDigest: string | null;
  cancellationReason: string | null;
  cancelledAt: string | null;
  supersededById: string | null;
  safetyReviewAcknowledged: boolean;
  allergyCheckWarning: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  prescriberName?: string;
  signedByName?: string | null;
  items: PrescriptionItemModel[];
}

export interface PatientClinicalSummary {
  patient: {
    id: string;
    name: string;
    birthDate: string | null;
    gender: string | null;
  };
  recentObservations: ClinicalObservationItem[];
  activeProblems: EncounterDiagnosisItem[];
  allergies: PatientAllergyItem[];
  activeMedications: MedicationRecordItem[];
  recentPrescriptions: MedicationPrescriptionItem[];
}

// -----------------------------------------------------------------------------
// API CLIENT IMPLEMENTATION
// -----------------------------------------------------------------------------

// Observations
export async function listObservations(
  clinicId: string,
  patientId: string,
  params?: { encounterId?: string; observationType?: ObservationType; pageSize?: number; cursor?: string },
  csrfToken?: string,
) {
  const q = new URLSearchParams();
  if (params?.encounterId) q.append('encounterId', params.encounterId);
  if (params?.observationType) q.append('observationType', params.observationType);
  if (params?.pageSize) q.append('pageSize', String(params.pageSize));
  if (params?.cursor) q.append('cursor', params.cursor);
  const query = q.toString() ? `?${q.toString()}` : '';
  return api<{ items: ClinicalObservationItem[]; nextCursor: string | null }>(
    `clinics/${clinicId}/clinical/patients/${patientId}/observations${query}`,
    'GET',
    undefined,
    csrfToken,
  );
}

export async function recordObservation(
  clinicId: string,
  patientId: string,
  data: {
    encounterId?: string;
    observationType: ObservationType;
    numericValue?: number;
    textValue?: string;
    unit: string;
    measuredAt?: string;
    provenance?: ClinicalProvenance;
    bodySite?: string;
    method?: string;
    interpretation?: string;
  },
  csrfToken?: string,
) {
  return api<ClinicalObservationItem>(
    `clinics/${clinicId}/clinical/patients/${patientId}/observations`,
    'POST',
    data,
    csrfToken,
  );
}

export async function amendObservation(
  clinicId: string,
  observationId: string,
  data: {
    amendmentReason: string;
    numericValue?: number;
    textValue?: string;
    unit?: string;
    expectedVersion?: number;
  },
  csrfToken?: string,
) {
  return api<ClinicalObservationItem>(
    `clinics/${clinicId}/clinical/observations/${observationId}`,
    'PATCH',
    data,
    csrfToken,
  );
}

// Diagnoses & Problems
export async function listDiagnoses(
  clinicId: string,
  patientId: string,
  params?: { encounterId?: string; isProblem?: boolean; problemStatus?: ProblemListStatus },
  csrfToken?: string,
) {
  const q = new URLSearchParams();
  if (params?.encounterId) q.append('encounterId', params.encounterId);
  if (params?.isProblem !== undefined) q.append('isProblem', String(params.isProblem));
  if (params?.problemStatus) q.append('problemStatus', params.problemStatus);
  const query = q.toString() ? `?${q.toString()}` : '';
  return api<EncounterDiagnosisItem[]>(
    `clinics/${clinicId}/clinical/patients/${patientId}/diagnoses${query}`,
    'GET',
    undefined,
    csrfToken,
  );
}

export async function recordDiagnosis(
  clinicId: string,
  patientId: string,
  data: {
    encounterId: string;
    diagnosisRole?: DiagnosisRole;
    clinicalStatus?: DiagnosisClinicalStatus;
    verificationStatus?: DiagnosisVerificationStatus;
    isProblem?: boolean;
    problemStatus?: ProblemListStatus;
    codingSystem: string;
    codingSystemVersion?: string;
    code: string;
    displayAr: string;
    displayEn?: string;
    clinicalNarrative?: string;
    onsetDate?: string;
  },
  csrfToken?: string,
) {
  return api<EncounterDiagnosisItem>(
    `clinics/${clinicId}/clinical/patients/${patientId}/diagnoses`,
    'POST',
    data,
    csrfToken,
  );
}

export async function amendDiagnosis(
  clinicId: string,
  diagnosisId: string,
  data: {
    amendmentReason: string;
    clinicalStatus?: DiagnosisClinicalStatus;
    isProblem?: boolean;
    problemStatus?: ProblemListStatus;
    clinicalNarrative?: string;
    resolutionDate?: string;
    expectedVersion?: number;
  },
  csrfToken?: string,
) {
  return api<EncounterDiagnosisItem>(
    `clinics/${clinicId}/clinical/diagnoses/${diagnosisId}`,
    'PATCH',
    data,
    csrfToken,
  );
}

export async function confirmDiagnosis(clinicId: string, diagnosisId: string, csrfToken?: string) {
  return api<EncounterDiagnosisItem>(
    `clinics/${clinicId}/clinical/diagnoses/${diagnosisId}/confirm`,
    'POST',
    {},
    csrfToken,
  );
}

// Allergies
export async function listAllergies(
  clinicId: string,
  patientId: string,
  params?: { clinicalStatus?: AllergyClinicalStatus },
  csrfToken?: string,
) {
  const q = new URLSearchParams();
  if (params?.clinicalStatus) q.append('clinicalStatus', params.clinicalStatus);
  const query = q.toString() ? `?${q.toString()}` : '';
  return api<PatientAllergyItem[]>(
    `clinics/${clinicId}/clinical/patients/${patientId}/allergies${query}`,
    'GET',
    undefined,
    csrfToken,
  );
}

export async function recordAllergy(
  clinicId: string,
  patientId: string,
  data: {
    encounterId?: string;
    allergyStatusType?: AllergyStatusType;
    category?: AllergenCategory;
    substance: string;
    substanceCode?: string;
    codingSystem?: string;
    reaction?: string;
    severity?: AllergySeverity;
    clinicalStatus?: AllergyClinicalStatus;
    verificationStatus?: AllergyVerificationStatus;
    onsetDate?: string;
    notes?: string;
  },
  csrfToken?: string,
) {
  return api<PatientAllergyItem>(
    `clinics/${clinicId}/clinical/patients/${patientId}/allergies`,
    'POST',
    data,
    csrfToken,
  );
}

export async function verifyAllergy(clinicId: string, allergyId: string, csrfToken?: string) {
  return api<PatientAllergyItem>(
    `clinics/${clinicId}/clinical/allergies/${allergyId}/verify`,
    'POST',
    {},
    csrfToken,
  );
}

// Medications
export async function listMedications(
  clinicId: string,
  patientId: string,
  params?: { status?: MedicationRecordStatus; isReconciled?: boolean },
  csrfToken?: string,
) {
  const q = new URLSearchParams();
  if (params?.status) q.append('status', params.status);
  if (params?.isReconciled !== undefined) q.append('isReconciled', String(params.isReconciled));
  const query = q.toString() ? `?${q.toString()}` : '';
  return api<MedicationRecordItem[]>(
    `clinics/${clinicId}/clinical/patients/${patientId}/medications${query}`,
    'GET',
    undefined,
    csrfToken,
  );
}

export async function recordMedication(
  clinicId: string,
  patientId: string,
  data: {
    encounterId?: string;
    medicationName: string;
    genericName?: string;
    brandName?: string;
    atcCode?: string;
    dosage: string;
    dosageAmount?: number;
    dosageUnit?: string;
    route: string;
    frequency: string;
    instructions?: string;
    indication?: string;
    status?: MedicationRecordStatus;
    provenance?: ClinicalProvenance;
    startDate?: string;
    endDate?: string;
    discontinuationReason?: string;
  },
  csrfToken?: string,
) {
  return api<MedicationRecordItem>(
    `clinics/${clinicId}/clinical/patients/${patientId}/medications`,
    'POST',
    data,
    csrfToken,
  );
}

export async function reconcileMedications(
  clinicId: string,
  patientId: string,
  medicationIds: string[],
  csrfToken?: string,
) {
  return api<{ reconciledCount: number; reconciledAt: string }>(
    `clinics/${clinicId}/clinical/patients/${patientId}/medications/reconcile`,
    'POST',
    { medicationIds },
    csrfToken,
  );
}

// Prescriptions
export async function listPrescriptions(
  clinicId: string,
  patientId: string,
  params?: { encounterId?: string; status?: PrescriptionStatus },
  csrfToken?: string,
) {
  const q = new URLSearchParams();
  if (params?.encounterId) q.append('encounterId', params.encounterId);
  if (params?.status) q.append('status', params.status);
  const query = q.toString() ? `?${q.toString()}` : '';
  return api<MedicationPrescriptionItem[]>(
    `clinics/${clinicId}/clinical/patients/${patientId}/prescriptions${query}`,
    'GET',
    undefined,
    csrfToken,
  );
}

export async function getPrescription(clinicId: string, prescriptionId: string, csrfToken?: string) {
  return api<MedicationPrescriptionItem>(
    `clinics/${clinicId}/clinical/prescriptions/${prescriptionId}`,
    'GET',
    undefined,
    csrfToken,
  );
}

export async function createPrescriptionDraft(
  clinicId: string,
  patientId: string,
  data: {
    encounterId: string;
    notes?: string;
    items?: Array<{
      medicationName: string;
      genericName?: string;
      strength: string;
      dosageForm: string;
      route: string;
      frequency: string;
      duration: string;
      durationDays?: number;
      quantity: number;
      unit: string;
      refillsAllowed?: number;
      substitutionAllowed?: boolean;
      instructions: string;
      indication?: string;
    }>;
  },
  csrfToken?: string,
) {
  return api<MedicationPrescriptionItem>(
    `clinics/${clinicId}/clinical/patients/${patientId}/prescriptions`,
    'POST',
    data,
    csrfToken,
  );
}

export async function signPrescription(
  clinicId: string,
  prescriptionId: string,
  data: { safetyReviewAcknowledged?: boolean; expectedVersion?: number },
  csrfToken?: string,
) {
  return api<MedicationPrescriptionItem>(
    `clinics/${clinicId}/clinical/prescriptions/${prescriptionId}/sign`,
    'POST',
    data,
    csrfToken,
  );
}

export async function cancelPrescription(
  clinicId: string,
  prescriptionId: string,
  data: { cancellationReason: string; expectedVersion?: number },
  csrfToken?: string,
) {
  return api<MedicationPrescriptionItem>(
    `clinics/${clinicId}/clinical/prescriptions/${prescriptionId}/cancel`,
    'POST',
    data,
    csrfToken,
  );
}

// Clinical Summary
export async function getPatientClinicalSummary(
  clinicId: string,
  patientId: string,
  csrfToken?: string,
) {
  return api<PatientClinicalSummary>(
    `clinics/${clinicId}/clinical/patients/${patientId}/summary`,
    'GET',
    undefined,
    csrfToken,
  );
}
