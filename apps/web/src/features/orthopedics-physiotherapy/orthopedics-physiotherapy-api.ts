import { api } from '../auth/api';
import type {
  MusculoskeletalExaminationRecord,
  JointRangeOfMotionRecord,
  PhysiotherapyRehabilitationEpisode,
  PhysiotherapySessionRecord,
  AnatomicalRegion,
  Laterality,
  JointMovement,
  MotionType,
  RehabEpisodeStatus,
  ExerciseItem,
  SpecialManeuverItem,
} from './types';

// =========================================================================
// 1. MUSCULOSKELETAL EXAMINATION API
// =========================================================================

export interface RecordMusculoskeletalExamInput {
  encounterId?: string;
  anatomicalRegion: AnatomicalRegion;
  joint: string;
  laterality: Laterality;
  reasonForExam: string;
  historyOfInjury?: string | null;
  tendernessLocations?: string[];
  swellingGrade?: string;
  deformityNotes?: string | null;
  neurovascularIntact?: boolean;
  motorStrengthMrcScale?: number | null;
  sensationFindings?: string | null;
  specialManeuvers?: SpecialManeuverItem[];
  clinicalAssessment?: string | null;
}

export async function recordMusculoskeletalExam(
  clinicId: string,
  encounterId: string,
  input: RecordMusculoskeletalExamInput,
  csrfToken?: string,
): Promise<MusculoskeletalExaminationRecord> {
  return api<MusculoskeletalExaminationRecord>(
    `clinics/${clinicId}/orthopedics/encounters/${encounterId}/examinations`,
    'POST',
    input,
    csrfToken,
  );
}

export async function listMusculoskeletalExams(
  clinicId: string,
  patientId: string,
  csrfToken?: string,
): Promise<{ items: MusculoskeletalExaminationRecord[] }> {
  const data = await api<MusculoskeletalExaminationRecord[] | { items: MusculoskeletalExaminationRecord[] }>(
    `clinics/${clinicId}/orthopedics/patients/${patientId}/examinations`,
    'GET',
    undefined,
    csrfToken,
  );
  return { items: Array.isArray(data) ? data : (data?.items ?? []) };
}

export async function enterInErrorMusculoskeletalExam(
  clinicId: string,
  id: string,
  errorReason: string,
  expectedVersion = 1,
  csrfToken?: string,
): Promise<MusculoskeletalExaminationRecord> {
  return api<MusculoskeletalExaminationRecord>(
    `clinics/${clinicId}/orthopedics/examinations/${id}/enter-in-error`,
    'PATCH',
    { errorReason, expectedVersion },
    csrfToken,
  );
}

// =========================================================================
// 2. JOINT RANGE OF MOTION (ROM) API
// =========================================================================

export interface RecordJointRomInput {
  encounterId?: string;
  examId?: string;
  anatomicalJoint: string;
  movement: JointMovement;
  laterality: Laterality;
  motionType: MotionType;
  startingDegrees?: number;
  endingDegrees: number;
  measurementMethod?: string;
  goniometerDevice?: string;
  painOnsetDegrees?: number;
  painScaleVas?: number;
  contralateralDegrees?: number;
  notes?: string;
}

export async function recordJointRom(
  clinicId: string,
  encounterId: string,
  input: RecordJointRomInput,
  csrfToken?: string,
): Promise<JointRangeOfMotionRecord> {
  return api<JointRangeOfMotionRecord>(
    `clinics/${clinicId}/orthopedics/encounters/${encounterId}/rom`,
    'POST',
    input,
    csrfToken,
  );
}

export async function listJointRom(
  clinicId: string,
  patientId: string,
  csrfToken?: string,
): Promise<{ items: JointRangeOfMotionRecord[] }> {
  const data = await api<JointRangeOfMotionRecord[] | { items: JointRangeOfMotionRecord[] }>(
    `clinics/${clinicId}/orthopedics/patients/${patientId}/rom`,
    'GET',
    undefined,
    csrfToken,
  );
  return { items: Array.isArray(data) ? data : (data?.items ?? []) };
}

// =========================================================================
// 3. PHYSIOTHERAPY REHABILITATION EPISODES API
// =========================================================================

export interface CreateRehabilitationEpisodeInput {
  patientId: string;
  encounterId?: string;
  referringClinicianMembershipId?: string;
  rehabilitationGoal: string;
  functionalBaseline: string;
  startDate: string;
  targetEndDate?: string;
  visitFrequencyPerWeek?: number;
  plannedInterventions?: string[];
}

export async function createRehabilitationEpisode(
  clinicId: string,
  input: CreateRehabilitationEpisodeInput,
  csrfToken?: string,
): Promise<PhysiotherapyRehabilitationEpisode> {
  return api<PhysiotherapyRehabilitationEpisode>(
    `clinics/${clinicId}/physiotherapy/episodes`,
    'POST',
    input,
    csrfToken,
  );
}

export interface UpdateEpisodeStatusInput {
  status: RehabEpisodeStatus;
  dischargeSummary?: string;
  expectedVersion: number;
}

export async function updateEpisodeStatus(
  clinicId: string,
  id: string,
  input: UpdateEpisodeStatusInput,
  csrfToken?: string,
): Promise<PhysiotherapyRehabilitationEpisode> {
  return api<PhysiotherapyRehabilitationEpisode>(
    `clinics/${clinicId}/physiotherapy/episodes/${id}/status`,
    'PATCH',
    input,
    csrfToken,
  );
}

export async function listRehabilitationEpisodes(
  clinicId: string,
  patientId: string,
  csrfToken?: string,
): Promise<{ items: PhysiotherapyRehabilitationEpisode[] }> {
  const data = await api<PhysiotherapyRehabilitationEpisode[] | { items: PhysiotherapyRehabilitationEpisode[] }>(
    `clinics/${clinicId}/physiotherapy/patients/${patientId}/episodes`,
    'GET',
    undefined,
    csrfToken,
  );
  return { items: Array.isArray(data) ? data : (data?.items ?? []) };
}

// =========================================================================
// 4. PHYSIOTHERAPY SESSIONS API
// =========================================================================

export interface RecordPhysiotherapySessionInput {
  patientId: string;
  encounterId?: string;
  episodeId?: string;
  treatmentModalities: string[];
  exerciseDetails?: ExerciseItem[];
  sessionDurationMinutes: number;
  patientReportedTolerance?: string;
  preSessionPainVas: number;
  postSessionPainVas: number;
  functionalProgressNotes: string;
  adverseEvents?: string;
}

export async function recordPhysiotherapySession(
  clinicId: string,
  encounterId: string,
  input: RecordPhysiotherapySessionInput,
  csrfToken?: string,
): Promise<PhysiotherapySessionRecord> {
  return api<PhysiotherapySessionRecord>(
    `clinics/${clinicId}/physiotherapy/encounters/${encounterId}/sessions`,
    'POST',
    input,
    csrfToken,
  );
}

export async function listPhysiotherapySessions(
  clinicId: string,
  patientId: string,
  csrfToken?: string,
): Promise<{ items: PhysiotherapySessionRecord[] }> {
  const data = await api<PhysiotherapySessionRecord[] | { items: PhysiotherapySessionRecord[] }>(
    `clinics/${clinicId}/physiotherapy/patients/${patientId}/sessions`,
    'GET',
    undefined,
    csrfToken,
  );
  return { items: Array.isArray(data) ? data : (data?.items ?? []) };
}

export async function enterInErrorPhysiotherapySession(
  clinicId: string,
  id: string,
  errorReason: string,
  expectedVersion = 1,
  csrfToken?: string,
): Promise<PhysiotherapySessionRecord> {
  return api<PhysiotherapySessionRecord>(
    `clinics/${clinicId}/physiotherapy/sessions/${id}/enter-in-error`,
    'PATCH',
    { errorReason, expectedVersion },
    csrfToken,
  );
}
