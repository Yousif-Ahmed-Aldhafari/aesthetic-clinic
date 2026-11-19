import { api } from '../auth/api.js';
import type {
  PregnancyEpisodeItem,
  AntenatalVisitRecordItem,
  ObstetricHistoryItem,
  GynecologicalExaminationItem,
  DatingMethod,
  FetalPresentation,
  DeliveryOutcome,
  DeliveryMode,
  GynecologicalExamType,
} from './types.js';

export async function getActivePregnancyEpisode(
  clinicId: string,
  patientId: string,
  csrfToken?: string,
  onAuthError?: (e?: unknown) => void,
): Promise<PregnancyEpisodeItem | null> {
  try {
    const data = await api<any>(
      `clinics/${clinicId}/obgyn/patients/${patientId}/active-pregnancy-episode`,
      'GET',
      undefined,
      csrfToken,
    );
    if (!data) return null;
    return (data.pregnancyEpisode !== undefined ? data.pregnancyEpisode : data) as PregnancyEpisodeItem | null;
  } catch (err: unknown) {
    if ((err as { status?: number })?.status === 401 && onAuthError) onAuthError(err);
    throw err;
  }
}

export async function listPregnancyEpisodes(
  clinicId: string,
  patientId: string,
  csrfToken?: string,
  onAuthError?: (e?: unknown) => void,
): Promise<PregnancyEpisodeItem[]> {
  try {
    const data = await api<any>(
      `clinics/${clinicId}/obgyn/patients/${patientId}/pregnancy-episodes`,
      'GET',
      undefined,
      csrfToken,
    );
    if (!data) return [];
    const list = data.pregnancyEpisodes !== undefined ? data.pregnancyEpisodes : data;
    return Array.isArray(list) ? list : [];
  } catch (err: unknown) {
    if ((err as { status?: number })?.status === 401 && onAuthError) onAuthError(err);
    throw err;
  }
}

export async function createPregnancyEpisode(
  clinicId: string,
  dto: {
    patientId: string;
    gravidity: number;
    parity: number;
    termDeliveries?: number;
    pretermDeliveries?: number;
    abortions?: number;
    livingChildren?: number;
    multipleGestationCount?: number;
    lastMenstrualPeriodDate?: string;
    lmpCertainty?: boolean;
    ultrasoundDatingDate?: string;
    crownRumpLengthMm?: number;
    biparietalDiameterMm?: number;
    estimatedDueDate?: string;
    datingMethod?: DatingMethod;
    datingRationale?: string;
    bloodGroupRh?: string;
    rhAntibodyScreenPositive?: boolean;
    highRiskFlag?: boolean;
    highRiskJustification?: string;
  },
  csrfToken?: string,
  onAuthError?: (e?: unknown) => void,
): Promise<PregnancyEpisodeItem> {
  try {
    const data = await api<any>(
      `clinics/${clinicId}/obgyn/pregnancy-episodes`,
      'POST',
      dto,
      csrfToken,
    );
    return (data.pregnancyEpisode !== undefined ? data.pregnancyEpisode : data) as PregnancyEpisodeItem;
  } catch (err: unknown) {
    if ((err as { status?: number })?.status === 401 && onAuthError) onAuthError(err);
    throw err;
  }
}

export async function reviewPregnancyDating(
  clinicId: string,
  episodeId: string,
  dto: {
    confirmedEstimatedDueDate: string;
    datingMethod: DatingMethod;
    datingRationale: string;
    crownRumpLengthMm?: number;
    ultrasoundDatingDate?: string;
  },
  csrfToken?: string,
  onAuthError?: (e?: unknown) => void,
): Promise<PregnancyEpisodeItem> {
  try {
    const data = await api<any>(
      `clinics/${clinicId}/obgyn/pregnancy-episodes/${episodeId}/dating-review`,
      'POST',
      dto,
      csrfToken,
    );
    return (data.pregnancyEpisode !== undefined ? data.pregnancyEpisode : data) as PregnancyEpisodeItem;
  } catch (err: unknown) {
    if ((err as { status?: number })?.status === 401 && onAuthError) onAuthError(err);
    throw err;
  }
}

export async function listAntenatalVisits(
  clinicId: string,
  pregnancyEpisodeId: string,
  csrfToken?: string,
  onAuthError?: (e?: unknown) => void,
): Promise<AntenatalVisitRecordItem[]> {
  try {
    const data = await api<any>(
      `clinics/${clinicId}/obgyn/pregnancy-episodes/${pregnancyEpisodeId}/antenatal-visits`,
      'GET',
      undefined,
      csrfToken,
    );
    if (!data) return [];
    const list = data.antenatalVisits !== undefined ? data.antenatalVisits : data;
    return Array.isArray(list) ? list : [];
  } catch (err: unknown) {
    if ((err as { status?: number })?.status === 401 && onAuthError) onAuthError(err);
    throw err;
  }
}

export async function recordAntenatalVisit(
  clinicId: string,
  dto: {
    patientId: string;
    pregnancyEpisodeId: string;
    encounterId: string;
    visitDate?: string;
    gestationalAgeWeeks: number;
    gestationalAgeDays?: number;
    systolicBp: number;
    diastolicBp: number;
    weightKg?: number;
    fundalHeightCm?: number;
    fetalHeartRateBpm?: number;
    fetalPresentation?: FetalPresentation;
    fetalMovementPresent?: boolean;
    urineProtein?: string;
    urineGlucose?: string;
    peripheralEdema?: string;
    clinicalNotes?: string;
    managementPlan?: string;
    nextVisitRecommendedWeeks?: number;
    diagnosticOrderIds?: string[];
    imagingDocumentIds?: string[];
  },
  csrfToken?: string,
  onAuthError?: (e?: unknown) => void,
): Promise<AntenatalVisitRecordItem> {
  try {
    const data = await api<any>(
      `clinics/${clinicId}/obgyn/antenatal-visits`,
      'POST',
      dto,
      csrfToken,
    );
    return (data.antenatalVisit !== undefined ? data.antenatalVisit : data) as AntenatalVisitRecordItem;
  } catch (err: unknown) {
    if ((err as { status?: number })?.status === 401 && onAuthError) onAuthError(err);
    throw err;
  }
}

export async function enterInErrorAntenatalVisit(
  clinicId: string,
  visitId: string,
  errorReason: string,
  csrfToken?: string,
  onAuthError?: (e?: unknown) => void,
): Promise<AntenatalVisitRecordItem> {
  try {
    const data = await api<any>(
      `clinics/${clinicId}/obgyn/antenatal-visits/${visitId}/enter-in-error`,
      'POST',
      { errorReason },
      csrfToken,
    );
    return (data.antenatalVisit !== undefined ? data.antenatalVisit : data) as AntenatalVisitRecordItem;
  } catch (err: unknown) {
    if ((err as { status?: number })?.status === 401 && onAuthError) onAuthError(err);
    throw err;
  }
}

export async function listObstetricHistory(
  clinicId: string,
  patientId: string,
  csrfToken?: string,
  onAuthError?: (e?: unknown) => void,
): Promise<ObstetricHistoryItem[]> {
  try {
    const data = await api<any>(
      `clinics/${clinicId}/obgyn/patients/${patientId}/obstetric-history`,
      'GET',
      undefined,
      csrfToken,
    );
    if (!data) return [];
    const list = data.obstetricHistory !== undefined ? data.obstetricHistory : data;
    return Array.isArray(list) ? list : [];
  } catch (err: unknown) {
    if ((err as { status?: number })?.status === 401 && onAuthError) onAuthError(err);
    throw err;
  }
}

export async function createObstetricHistory(
  clinicId: string,
  dto: {
    patientId: string;
    pregnancyNumber: number;
    yearOfDelivery?: number;
    gestationalAgeWeeks?: number;
    deliveryOutcome?: DeliveryOutcome;
    deliveryMode?: DeliveryMode;
    birthWeightGrams?: number;
    babyGender?: 'MALE' | 'FEMALE' | 'OTHER' | 'UNDISCLOSED';
    anesthesiaType?: string;
    previousUterineSurgery?: boolean;
    uterineSurgeryDetails?: string;
    complications?: string;
    neonatalOutcome?: string;
    notes?: string;
  },
  csrfToken?: string,
  onAuthError?: (e?: unknown) => void,
): Promise<ObstetricHistoryItem> {
  try {
    const data = await api<any>(
      `clinics/${clinicId}/obgyn/obstetric-history`,
      'POST',
      dto,
      csrfToken,
    );
    return (data.obstetricHistory !== undefined ? data.obstetricHistory : data) as ObstetricHistoryItem;
  } catch (err: unknown) {
    if ((err as { status?: number })?.status === 401 && onAuthError) onAuthError(err);
    throw err;
  }
}

export async function listGynecologicalExams(
  clinicId: string,
  patientId: string,
  csrfToken?: string,
  onAuthError?: (e?: unknown) => void,
): Promise<GynecologicalExaminationItem[]> {
  try {
    const data = await api<any>(
      `clinics/${clinicId}/obgyn/patients/${patientId}/gynecological-exams`,
      'GET',
      undefined,
      csrfToken,
    );
    if (!data) return [];
    const list = data.gynecologicalExams !== undefined ? data.gynecologicalExams : data;
    return Array.isArray(list) ? list : [];
  } catch (err: unknown) {
    if ((err as { status?: number })?.status === 401 && onAuthError) onAuthError(err);
    throw err;
  }
}

export async function getGynecologicalExam(
  clinicId: string,
  examId: string,
  csrfToken?: string,
  onAuthError?: (e?: unknown) => void,
): Promise<GynecologicalExaminationItem> {
  try {
    const data = await api<any>(
      `clinics/${clinicId}/obgyn/gynecological-exams/${examId}`,
      'GET',
      undefined,
      csrfToken,
    );
    return (data.gynecologicalExam !== undefined ? data.gynecologicalExam : data) as GynecologicalExaminationItem;
  } catch (err: unknown) {
    if ((err as { status?: number })?.status === 401 && onAuthError) onAuthError(err);
    throw err;
  }
}

export async function recordGynecologicalExam(
  clinicId: string,
  dto: {
    patientId: string;
    encounterId: string;
    examinationDate?: string;
    examinationType?: GynecologicalExamType;
    isConfidential?: boolean;
    indicationsSymptoms?: string;
    lastMenstrualPeriodDate?: string;
    menstrualCycleDays?: number;
    menstrualFlowDurationDays?: number;
    dysmenorrheaReported?: boolean;
    abnormalBleedingPattern?: string;
    externalGenitaliaFindings?: string;
    speculumExaminationFindings?: string;
    bimanualExaminationFindings?: string;
    cervicalScreeningSampleCollected?: boolean;
    cervicalScreeningTestType?: string;
    chaperonePresent: boolean;
    chaperoneNameOrId?: string;
    clinicalAssessment?: string;
    managementPlan?: string;
    consentEvidenceId?: string;
    linkedDocumentIds?: string[];
  },
  csrfToken?: string,
  onAuthError?: (e?: unknown) => void,
): Promise<GynecologicalExaminationItem> {
  try {
    const data = await api<any>(
      `clinics/${clinicId}/obgyn/gynecological-exams`,
      'POST',
      dto,
      csrfToken,
    );
    return (data.gynecologicalExam !== undefined ? data.gynecologicalExam : data) as GynecologicalExaminationItem;
  } catch (err: unknown) {
    if ((err as { status?: number })?.status === 401 && onAuthError) onAuthError(err);
    throw err;
  }
}
