import { api } from '../auth/api.js';
import type {
  PediatricBirthHistoryItem,
  PatientCaregiverItem,
  PediatricGrowthRecordItem,
  PediatricMedicationPreflightResult,
  DeliveryMode,
  BirthType,
  BirthHistorySource,
  CaregiverRelationshipType,
  StatureMeasurementMethod,
  MeasurementSource,
} from './types.js';

export async function getBirthHistory(
  clinicId: string,
  patientId: string,
  csrfToken?: string,
  onAuthError?: (e?: unknown) => void,
): Promise<PediatricBirthHistoryItem | null> {
  try {
    const data = await api<any>(
      `clinics/${clinicId}/pediatrics/patients/${patientId}/birth-history`,
      'GET',
      undefined,
      csrfToken,
    );
    if (!data) return null;
    return (data.birthHistory !== undefined ? data.birthHistory : data) as PediatricBirthHistoryItem | null;
  } catch (err: unknown) {
    if ((err as { status?: number })?.status === 401 && onAuthError) onAuthError(err);
    throw err;
  }
}

export async function recordBirthHistory(
  clinicId: string,
  patientId: string,
  dto: {
    gestationalAgeWeeks: number;
    gestationalAgeDays?: number;
    birthWeightGrams?: number;
    birthLengthCm?: number;
    birthHeadCircumferenceCm?: number;
    apgar1Min?: number;
    apgar5Min?: number;
    apgar10Min?: number;
    deliveryMode?: DeliveryMode;
    birthType?: BirthType;
    birthComplications?: string;
    maternalComplications?: string;
    nicAdmissionRequired?: boolean;
    nicStayDays?: number;
    bloodType?: string;
    newbornScreeningNotes?: string;
    hearingScreeningPassed?: boolean;
    congenitalAnomalies?: string;
    consanguinity?: boolean;
    source?: BirthHistorySource;
    notes?: string;
  },
  csrfToken?: string,
  onAuthError?: (e?: unknown) => void,
): Promise<PediatricBirthHistoryItem> {
  try {
    const data = await api<any>(
      `clinics/${clinicId}/pediatrics/birth-history`,
      'POST',
      { ...dto, patientId },
      csrfToken,
    );
    return (data?.birthHistory ?? data) as PediatricBirthHistoryItem;
  } catch (err: unknown) {
    if ((err as { status?: number })?.status === 401 && onAuthError) onAuthError(err);
    throw err;
  }
}

export async function amendBirthHistory(
  clinicId: string,
  historyId: string,
  dto: {
    expectedVersion: number;
    amendmentReason: string;
    gestationalAgeWeeks?: number;
    gestationalAgeDays?: number;
    birthWeightGrams?: number;
    birthLengthCm?: number;
    birthHeadCircumferenceCm?: number;
    apgar1Min?: number;
    apgar5Min?: number;
    apgar10Min?: number;
    deliveryMode?: DeliveryMode;
    birthType?: BirthType;
    birthComplications?: string;
    maternalComplications?: string;
    nicAdmissionRequired?: boolean;
    nicStayDays?: number;
    bloodType?: string;
    newbornScreeningNotes?: string;
    hearingScreeningPassed?: boolean;
    congenitalAnomalies?: string;
    consanguinity?: boolean;
    notes?: string;
  },
  csrfToken?: string,
  onAuthError?: (e?: unknown) => void,
): Promise<PediatricBirthHistoryItem> {
  try {
    const data = await api<any>(
      `clinics/${clinicId}/pediatrics/birth-history/${historyId}/amend`,
      'PATCH',
      dto,
      csrfToken,
    );
    return (data?.birthHistory ?? data) as PediatricBirthHistoryItem;
  } catch (err: unknown) {
    if ((err as { status?: number })?.status === 401 && onAuthError) onAuthError(err);
    throw err;
  }
}

export async function listCaregivers(
  clinicId: string,
  patientId: string,
  csrfToken?: string,
  onAuthError?: (e?: unknown) => void,
): Promise<PatientCaregiverItem[]> {
  try {
    const data = await api<any>(
      `clinics/${clinicId}/pediatrics/patients/${patientId}/caregivers`,
      'GET',
      undefined,
      csrfToken,
    );
    if (Array.isArray(data)) return data;
    return (data?.items ?? data?.caregivers ?? []) as PatientCaregiverItem[];
  } catch (err: unknown) {
    if ((err as { status?: number })?.status === 401 && onAuthError) onAuthError(err);
    throw err;
  }
}

export async function createCaregiver(
  clinicId: string,
  patientId: string,
  dto: {
    caregiverName: string;
    caregiverNationalId?: string;
    caregiverPhone: string;
    caregiverEmail?: string;
    relationshipType: CaregiverRelationshipType;
    hasLegalCustody?: boolean;
    hasMedicalConsentAuthority?: boolean;
    isEmergencyContact?: boolean;
    emergencyPriority?: number;
    portalProxyAccess?: boolean;
    notes?: string;
  },
  csrfToken?: string,
  onAuthError?: (e?: unknown) => void,
): Promise<PatientCaregiverItem> {
  try {
    const data = await api<{ caregiver: PatientCaregiverItem }>(
      `clinics/${clinicId}/pediatrics/caregivers`,
      'POST',
      { ...dto, patientId },
      csrfToken,
    );
    return data.caregiver;
  } catch (err: unknown) {
    if ((err as { status?: number })?.status === 401 && onAuthError) onAuthError(err);
    throw err;
  }
}

export async function updateCaregiver(
  clinicId: string,
  caregiverId: string,
  dto: {
    expectedVersion: number;
    caregiverName?: string;
    caregiverNationalId?: string;
    caregiverPhone?: string;
    caregiverEmail?: string;
    relationshipType?: CaregiverRelationshipType;
    hasLegalCustody?: boolean;
    hasMedicalConsentAuthority?: boolean;
    isEmergencyContact?: boolean;
    emergencyPriority?: number;
    portalProxyAccess?: boolean;
    notes?: string;
  },
  csrfToken?: string,
  onAuthError?: (e?: unknown) => void,
): Promise<PatientCaregiverItem> {
  try {
    const data = await api<{ caregiver: PatientCaregiverItem }>(
      `clinics/${clinicId}/pediatrics/caregivers/${caregiverId}`,
      'PATCH',
      dto,
      csrfToken,
    );
    return data.caregiver;
  } catch (err: unknown) {
    if ((err as { status?: number })?.status === 401 && onAuthError) onAuthError(err);
    throw err;
  }
}

export async function revokeCaregiver(
  clinicId: string,
  caregiverId: string,
  dto: {
    expectedVersion: number;
    revocationReason: string;
  },
  csrfToken?: string,
  onAuthError?: (e?: unknown) => void,
): Promise<PatientCaregiverItem> {
  try {
    const data = await api<{ caregiver: PatientCaregiverItem }>(
      `clinics/${clinicId}/pediatrics/caregivers/${caregiverId}/revoke`,
      'POST',
      dto,
      csrfToken,
    );
    return data.caregiver;
  } catch (err: unknown) {
    if ((err as { status?: number })?.status === 401 && onAuthError) onAuthError(err);
    throw err;
  }
}

export async function listGrowthRecords(
  clinicId: string,
  patientId: string,
  csrfToken?: string,
  onAuthError?: (e?: unknown) => void,
): Promise<PediatricGrowthRecordItem[]> {
  try {
    const data = await api<any>(
      `clinics/${clinicId}/pediatrics/patients/${patientId}/growth-records`,
      'GET',
      undefined,
      csrfToken,
    );
    if (Array.isArray(data)) return data;
    return (data?.items ?? data?.records ?? []) as PediatricGrowthRecordItem[];
  } catch (err: unknown) {
    if ((err as { status?: number })?.status === 401 && onAuthError) onAuthError(err);
    throw err;
  }
}

export async function recordGrowth(
  clinicId: string,
  patientId: string,
  dto: {
    encounterId?: string;
    measuredAt?: string;
    weightKg?: number;
    statureCm?: number;
    statureMethod?: StatureMeasurementMethod;
    headCircumferenceCm?: number;
    useCorrectedAgeForZScores?: boolean;
    measurementSource?: MeasurementSource;
    deviceIdentifier?: string;
    clinicalNotes?: string;
  },
  csrfToken?: string,
  onAuthError?: (e?: unknown) => void,
): Promise<PediatricGrowthRecordItem> {
  try {
    const data = await api<any>(
      `clinics/${clinicId}/pediatrics/growth-records`,
      'POST',
      { ...dto, patientId },
      csrfToken,
    );
    return (data?.record ?? data) as PediatricGrowthRecordItem;
  } catch (err: unknown) {
    if ((err as { status?: number })?.status === 401 && onAuthError) onAuthError(err);
    throw err;
  }
}

export async function enterInErrorGrowthRecord(
  clinicId: string,
  recordId: string,
  dto: {
    expectedVersion: number;
    errorReason: string;
  },
  csrfToken?: string,
  onAuthError?: (e?: unknown) => void,
): Promise<PediatricGrowthRecordItem> {
  try {
    const data = await api<any>(
      `clinics/${clinicId}/pediatrics/growth-records/${recordId}/enter-in-error`,
      'POST',
      dto,
      csrfToken,
    );
    return (data?.record ?? data) as PediatricGrowthRecordItem;
  } catch (err: unknown) {
    if ((err as { status?: number })?.status === 401 && onAuthError) onAuthError(err);
    throw err;
  }
}

export async function preflightMedicationSafety(
  clinicId: string,
  patientId: string,
  dto: {
    medicationName: string;
    currentWeightKg?: number;
    gestationalAgeWeeksAtBirth?: number;
  },
  csrfToken?: string,
  onAuthError?: (e?: unknown) => void,
): Promise<PediatricMedicationPreflightResult> {
  try {
    const data = await api<any>(
      `clinics/${clinicId}/pediatrics/medication-safety/preflight`,
      'POST',
      { ...dto, patientId },
      csrfToken,
    );
    return (data?.preflight ?? data) as PediatricMedicationPreflightResult;
  } catch (err: unknown) {
    if ((err as { status?: number })?.status === 401 && onAuthError) onAuthError(err);
    throw err;
  }
}
