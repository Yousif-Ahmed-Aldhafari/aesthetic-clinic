import { api } from '../auth/api';

export type FollowUpStatus = 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'MISSED';
export type FollowUpSeverity = 'MILD' | 'MODERATE' | 'SEVERE';
export type AdverseEventStatus = 'REPORTED' | 'UNDER_EVALUATION' | 'RESOLVED' | 'ESCALATED';
export type OutcomeMeasurementScale =
  | 'CLINICAL_GLOBAL_IMPRESSION'
  | 'PATIENT_SATISFACTION_5_POINT'
  | 'VISUAL_ANALOG_SCALE_10'
  | 'STRUCTURED_OBSERVATION';

export interface FollowUpAssessmentAmendmentDto {
  id: string;
  amendedAt: string;
  amendmentReason: string;
  amendedContent: string;
  signatureSha256: string;
  author: {
    id: string;
    user: {
      name: string;
    };
  };
}

export interface FollowUpAssessmentDto {
  id: string;
  symptomsObserved: string;
  healingProgress: string;
  clinicalNotes: string;
  signedAt: string;
  signatureSha256: string;
  assessingDoctor: {
    id: string;
    user: {
      name: string;
    };
  };
  amendments?: FollowUpAssessmentAmendmentDto[];
}

export interface ClinicalFollowUpDto {
  id: string;
  patientId: string;
  treatingDoctorMembershipId: string;
  encounterId: string | null;
  treatmentPlanId: string | null;
  procedureExecutionId: string | null;
  appointmentId: string | null;
  status: FollowUpStatus;
  reason: string;
  scheduledDate: string;
  completedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  recoveryInstructions: string | null;
  version: number;
  createdAt: string;
  treatingDoctor: {
    id: string;
    user: {
      name: string;
    };
  };
  assessment?: FollowUpAssessmentDto | null;
  encounter?: {
    id: string;
    createdAt: string;
  } | null;
  procedureExecution?: {
    id: string;
    procedureNameArSnapshot: string;
    status: string;
  } | null;
}

export interface TreatmentOutcomeDto {
  id: string;
  patientId: string;
  followUpId: string | null;
  procedureExecutionId: string | null;
  treatmentPlanId: string | null;
  photoComparisonGroupId: string | null;
  measurementScale: OutcomeMeasurementScale;
  clinicianScore: number | null;
  clinicianNotes: string | null;
  patientReportedScore: number | null;
  patientReportedNotes: string | null;
  recordedAt: string;
  createdAt: string;
  recordingDoctor: {
    id: string;
    user: {
      name: string;
    };
  };
  photoComparisonGroup?: {
    id: string;
    title: string;
  } | null;
  procedureExecution?: {
    id: string;
    procedureNameArSnapshot: string;
  } | null;
}

export interface AdverseEventDto {
  id: string;
  patientId: string;
  followUpId: string | null;
  procedureExecutionId: string | null;
  eventType: string;
  severity: FollowUpSeverity;
  status: AdverseEventStatus;
  observationDate: string;
  documentedFindings: string;
  escalationNotes: string | null;
  resolvedAt: string | null;
  version: number;
  createdAt: string;
  reportingDoctor: {
    id: string;
    user: {
      name: string;
    };
  };
  procedureExecution?: {
    id: string;
    procedureNameArSnapshot: string;
  } | null;
}

export interface ScheduleFollowUpInput {
  patientId: string;
  treatingDoctorMembershipId: string;
  encounterId?: string;
  treatmentPlanId?: string;
  procedureExecutionId?: string;
  appointmentId?: string;
  reason: string;
  scheduledDate: string;
  recoveryInstructions?: string;
}

export interface UpdateFollowUpStatusInput {
  status: FollowUpStatus;
  cancelReason?: string;
  expectedVersion: number;
}

export interface CompleteAssessmentInput {
  symptomsObserved: string;
  healingProgress: string;
  clinicalNotes: string;
  expectedVersion: number;
}

export interface AmendAssessmentInput {
  amendmentReason: string;
  amendedContent: string;
}

export interface RecordOutcomeInput {
  patientId: string;
  followUpId?: string;
  procedureExecutionId?: string;
  treatmentPlanId?: string;
  photoComparisonGroupId?: string;
  measurementScale: OutcomeMeasurementScale;
  clinicianScore?: number;
  clinicianNotes?: string;
  patientReportedScore?: number;
  patientReportedNotes?: string;
  recordedAt?: string;
}

export interface RecordAdverseEventInput {
  patientId: string;
  followUpId?: string;
  procedureExecutionId?: string;
  eventType: string;
  severity: FollowUpSeverity;
  observationDate: string;
  documentedFindings: string;
  escalationNotes?: string;
}

export interface UpdateAdverseEventInput {
  status: AdverseEventStatus;
  escalationNotes?: string;
  expectedVersion: number;
}

export const followupApi = (clinicId: string) => {
  const root = `clinics/${encodeURIComponent(clinicId)}/clinical`;
  return {
    // Follow-ups
    listFollowUps: (patientId: string, status?: FollowUpStatus, signal?: AbortSignal) => {
      const q = new URLSearchParams({ patientId });
      if (status) q.set('status', status);
      return api<{ items: ClinicalFollowUpDto[] }>(`${root}/follow-ups?${q.toString()}`, 'GET', undefined, undefined, signal);
    },
    getFollowUp: (id: string, signal?: AbortSignal) =>
      api<ClinicalFollowUpDto>(`${root}/follow-ups/${encodeURIComponent(id)}`, 'GET', undefined, undefined, signal),
    scheduleFollowUp: (body: ScheduleFollowUpInput, csrf: string, signal?: AbortSignal) =>
      api<ClinicalFollowUpDto>(`${root}/follow-ups`, 'POST', body, csrf, signal),
    updateStatus: (id: string, body: UpdateFollowUpStatusInput, csrf: string, signal?: AbortSignal) =>
      api<ClinicalFollowUpDto>(`${root}/follow-ups/${encodeURIComponent(id)}/status`, 'PATCH', body, csrf, signal),
    completeAssessment: (id: string, body: CompleteAssessmentInput, csrf: string, signal?: AbortSignal) =>
      api<ClinicalFollowUpDto>(`${root}/follow-ups/${encodeURIComponent(id)}/assess`, 'POST', body, csrf, signal),
    amendAssessment: (assessmentId: string, body: AmendAssessmentInput, csrf: string, signal?: AbortSignal) =>
      api<FollowUpAssessmentAmendmentDto>(`${root}/assessments/${encodeURIComponent(assessmentId)}/amend`, 'POST', body, csrf, signal),

    // Outcomes
    listOutcomes: (patientId: string, signal?: AbortSignal) => {
      const q = new URLSearchParams({ patientId });
      return api<{ items: TreatmentOutcomeDto[] }>(`${root}/outcomes?${q.toString()}`, 'GET', undefined, undefined, signal);
    },
    recordOutcome: (body: RecordOutcomeInput, csrf: string, signal?: AbortSignal) =>
      api<TreatmentOutcomeDto>(`${root}/outcomes`, 'POST', body, csrf, signal),

    // Adverse Events
    listAdverseEvents: (patientId: string, status?: AdverseEventStatus, signal?: AbortSignal) => {
      const q = new URLSearchParams({ patientId });
      if (status) q.set('status', status);
      return api<{ items: AdverseEventDto[] }>(`${root}/adverse-events?${q.toString()}`, 'GET', undefined, undefined, signal);
    },
    recordAdverseEvent: (body: RecordAdverseEventInput, csrf: string, signal?: AbortSignal) =>
      api<AdverseEventDto>(`${root}/adverse-events`, 'POST', body, csrf, signal),
    updateAdverseEvent: (id: string, body: UpdateAdverseEventInput, csrf: string, signal?: AbortSignal) =>
      api<AdverseEventDto>(`${root}/adverse-events/${encodeURIComponent(id)}`, 'PATCH', body, csrf, signal),
  };
};

