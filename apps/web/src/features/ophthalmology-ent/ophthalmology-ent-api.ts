import { api } from '../auth/api';
import type {
  OphthalmicRefractionRecord,
  OphthalmicExaminationRecord,
  EntExaminationRecord,
  AudiometryAssessmentRecord,
  IopEvaluation,
  HearingLossAnalytics,
  VisualAcuityScale,
  TonometryMethod,
  TonsilFriedmanGrade,
  TympanogramType,
} from './types';

// =========================================================================
// 1. OPHTHALMIC REFRACTION API
// =========================================================================

export interface RecordRefractionInput {
  encounterId?: string;
  acuityScale: VisualAcuityScale;
  pupillaryDistanceMm?: number | null;
  odSphereDiopters?: number | null;
  odCylinderDiopters?: number | null;
  odAxisDegrees?: number | null;
  odReadingAddDiopters?: number | null;
  odUncorrectedVisualAcuity?: string | null;
  odCorrectedVisualAcuity?: string | null;
  odPinholeVisualAcuity?: string | null;
  osSphereDiopters?: number | null;
  osCylinderDiopters?: number | null;
  osAxisDegrees?: number | null;
  osReadingAddDiopters?: number | null;
  osUncorrectedVisualAcuity?: string | null;
  osCorrectedVisualAcuity?: string | null;
  osPinholeVisualAcuity?: string | null;
  ouVisualAcuity?: string | null;
  notes?: string | null;
}

export async function recordRefraction(
  clinicId: string,
  encounterId: string,
  input: RecordRefractionInput,
  csrfToken?: string,
): Promise<OphthalmicRefractionRecord> {
  return api<OphthalmicRefractionRecord>(
    `clinics/${clinicId}/ophthalmology/encounters/${encounterId}/refractions`,
    'POST',
    input,
    csrfToken,
  );
}

export async function listRefractions(
  clinicId: string,
  patientId: string,
  csrfToken?: string,
): Promise<{ items: OphthalmicRefractionRecord[] }> {
  const data = await api<OphthalmicRefractionRecord[] | { items: OphthalmicRefractionRecord[] }>(
    `clinics/${clinicId}/ophthalmology/patients/${patientId}/refractions`,
    'GET',
    undefined,
    csrfToken,
  );
  return { items: Array.isArray(data) ? data : (data?.items ?? []) };
}

export async function enterInErrorRefraction(
  clinicId: string,
  id: string,
  reason: string,
  csrfToken?: string,
): Promise<OphthalmicRefractionRecord> {
  return api<OphthalmicRefractionRecord>(
    `clinics/${clinicId}/ophthalmology/refractions/${id}/enter-in-error`,
    'PATCH',
    { reason },
    csrfToken,
  );
}

// =========================================================================
// 2. OPHTHALMIC EXAMINATION API
// =========================================================================

export interface RecordOphthalmicExamInput {
  encounterId?: string;
  tonometryMethod: TonometryMethod;
  odIntraocularPressureMmHg?: number | null;
  osIntraocularPressureMmHg?: number | null;
  tonometryTime?: string;
  odCorneaFindings?: string | null;
  osCorneaFindings?: string | null;
  odAnteriorChamber?: string | null;
  osAnteriorChamber?: string | null;
  odLensCondition?: string | null;
  osLensCondition?: string | null;
  odCupToDiscRatio?: number | null;
  osCupToDiscRatio?: number | null;
  odMaculaFindings?: string | null;
  osMaculaFindings?: string | null;
  odRetinalPeriphery?: string | null;
  osRetinalPeriphery?: string | null;
  clinicalNotes?: string | null;
}

export async function recordOphthalmicExam(
  clinicId: string,
  encounterId: string,
  input: RecordOphthalmicExamInput,
  csrfToken?: string,
): Promise<OphthalmicExaminationRecord> {
  return api<OphthalmicExaminationRecord>(
    `clinics/${clinicId}/ophthalmology/encounters/${encounterId}/examinations`,
    'POST',
    input,
    csrfToken,
  );
}

export async function listOphthalmicExams(
  clinicId: string,
  patientId: string,
  csrfToken?: string,
): Promise<{ items: OphthalmicExaminationRecord[] }> {
  const data = await api<OphthalmicExaminationRecord[] | { items: OphthalmicExaminationRecord[] }>(
    `clinics/${clinicId}/ophthalmology/patients/${patientId}/examinations`,
    'GET',
    undefined,
    csrfToken,
  );
  return { items: Array.isArray(data) ? data : (data?.items ?? []) };
}

export async function enterInErrorOphthalmicExam(
  clinicId: string,
  id: string,
  reason: string,
  csrfToken?: string,
): Promise<OphthalmicExaminationRecord> {
  return api<OphthalmicExaminationRecord>(
    `clinics/${clinicId}/ophthalmology/examinations/${id}/enter-in-error`,
    'PATCH',
    { reason },
    csrfToken,
  );
}

export async function evaluateIopInteractive(
  clinicId: string,
  odMmHg?: number | null,
  osMmHg?: number | null,
  csrfToken?: string,
): Promise<IopEvaluation> {
  return api<IopEvaluation>(
    `clinics/${clinicId}/ophthalmology/evaluate-iop`,
    'POST',
    {
      odIntraocularPressureMmHg: odMmHg,
      osIntraocularPressureMmHg: osMmHg,
    },
    csrfToken,
  );
}

// =========================================================================
// 3. ENT EXAMINATION API
// =========================================================================

export interface RecordEntExamInput {
  encounterId?: string;
  rightEarCanal?: string | null;
  rightTympanicMembrane?: string | null;
  leftEarCanal?: string | null;
  leftTympanicMembrane?: string | null;
  nasalSeptumDeformity?: string | null;
  turbinateHypertrophy?: string | null;
  nasalPolypsPresent?: boolean;
  nasalDischargeDescription?: string | null;
  tonsilSizeGrade?: TonsilFriedmanGrade;
  posteriorPharyngealWall?: string | null;
  uvulaPalateSymmetry?: string | null;
  vocalCordMobility?: string | null;
  clinicalNotes?: string | null;
}

export async function recordEntExam(
  clinicId: string,
  encounterId: string,
  input: RecordEntExamInput,
  csrfToken?: string,
): Promise<EntExaminationRecord> {
  return api<EntExaminationRecord>(
    `clinics/${clinicId}/ent/encounters/${encounterId}/examinations`,
    'POST',
    input,
    csrfToken,
  );
}

export async function listEntExams(
  clinicId: string,
  patientId: string,
  csrfToken?: string,
): Promise<{ items: EntExaminationRecord[] }> {
  const data = await api<EntExaminationRecord[] | { items: EntExaminationRecord[] }>(
    `clinics/${clinicId}/ent/patients/${patientId}/examinations`,
    'GET',
    undefined,
    csrfToken,
  );
  return { items: Array.isArray(data) ? data : (data?.items ?? []) };
}

export async function enterInErrorEntExam(
  clinicId: string,
  id: string,
  reason: string,
  csrfToken?: string,
): Promise<EntExaminationRecord> {
  return api<EntExaminationRecord>(
    `clinics/${clinicId}/ent/examinations/${id}/enter-in-error`,
    'PATCH',
    { reason },
    csrfToken,
  );
}

// =========================================================================
// 4. AUDIOMETRY ASSESSMENT API
// =========================================================================

export interface RecordAudiometryInput {
  encounterId?: string;
  orderId?: string | null;
  rightAirThresholdsDb: number[];
  leftAirThresholdsDb: number[];
  rightBoneThresholdsDb?: number[];
  leftBoneThresholdsDb?: number[];
  rightTympanogramType?: TympanogramType;
  leftTympanogramType?: TympanogramType;
  speechReceptionThresholdDbR?: number | null;
  speechReceptionThresholdDbL?: number | null;
  speechDiscriminationScoreR?: number | null;
  speechDiscriminationScoreL?: number | null;
  clinicalImpression?: string | null;
}

export async function recordAudiometry(
  clinicId: string,
  encounterId: string,
  input: RecordAudiometryInput,
  csrfToken?: string,
): Promise<AudiometryAssessmentRecord> {
  return api<AudiometryAssessmentRecord>(
    `clinics/${clinicId}/ent/encounters/${encounterId}/audiometry`,
    'POST',
    input,
    csrfToken,
  );
}

export async function listAudiometry(
  clinicId: string,
  patientId: string,
  csrfToken?: string,
): Promise<{ items: AudiometryAssessmentRecord[] }> {
  const data = await api<AudiometryAssessmentRecord[] | { items: AudiometryAssessmentRecord[] }>(
    `clinics/${clinicId}/ent/patients/${patientId}/audiometry`,
    'GET',
    undefined,
    csrfToken,
  );
  return { items: Array.isArray(data) ? data : (data?.items ?? []) };
}

export async function enterInErrorAudiometry(
  clinicId: string,
  id: string,
  reason: string,
  csrfToken?: string,
): Promise<AudiometryAssessmentRecord> {
  return api<AudiometryAssessmentRecord>(
    `clinics/${clinicId}/ent/audiometry/${id}/enter-in-error`,
    'PATCH',
    { reason },
    csrfToken,
  );
}

export async function calculatePtaInteractive(
  clinicId: string,
  airThresholdsDb: number[],
  boneThresholdsDb?: number[],
  csrfToken?: string,
): Promise<HearingLossAnalytics> {
  return api<HearingLossAnalytics>(
    `clinics/${clinicId}/ent/audiometry/calculate-pta`,
    'POST',
    { airThresholdsDb, boneThresholdsDb },
    csrfToken,
  );
}
