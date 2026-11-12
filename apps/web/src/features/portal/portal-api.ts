import { api, ApiError } from '../auth/api';

export interface PublicClinic {
  id: string;
  slug: string;
  displayName: string;
  timezone: string;
  contactPhone?: string | null;
  branding: {
    logoUrl: string | null;
    primaryColor: string;
    secondaryColor: string;
    accentColor: string | null;
    faviconUrl?: string | null;
    typography?: string;
  } | null;
}

export interface PatientUser {
  id: string;
  patientNumber: string;
  fullName: string;
  phone: string;
  email?: string | null;
  dateOfBirth?: string | null;
  gender?: string | null;
}

export interface PatientAuthResponse {
  csrfToken: string;
  expiresAt: string;
  patient: PatientUser;
  clinic: {
    id: string;
    slug: string;
    displayName: string;
  };
}

export interface PatientProfileResponse {
  patient: PatientUser;
  clinic: PublicClinic;
}

export interface BookableService {
  id: string;
  name: string;
  durationMinutes: number;
  requiresRoom: boolean;
}

export interface BookableDoctor {
  id: string;
  label: string;
}

export interface TimeSlot {
  startAt: string;
  endAt: string;
  startLocal: string;
  endLocal: string;
  offset: string;
  disambiguation: 'REJECT' | 'EARLIER' | 'LATER';
}

export interface AvailabilityResponse {
  timezone: string;
  date: string;
  slots: TimeSlot[];
}

export interface PortalAppointment {
  id: string;
  service: { id: string; name: string; durationMinutes: number };
  doctor: { id: string; label: string };
  room?: { id: string; label: string } | null;
  startAt: string;
  endAt: string;
  startLocal: string;
  endLocal: string;
  timezone: string;
  status: 'SCHEDULED' | 'CONFIRMED' | 'ARRIVED' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';
  cancellationReason?: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface AppointmentsResponse {
  timezone: string;
  appointments: PortalAppointment[];
}

export async function fetchPublicClinic(slug: string, signal?: AbortSignal): Promise<PublicClinic> {
  return api<PublicClinic>(`portal/clinics/${encodeURIComponent(slug)}`, 'GET', undefined, undefined, signal);
}

export async function activatePatientAccount(
  data: { clinicSlug: string; token: string; phone: string; dateOfBirth: string; password: string },
): Promise<PatientAuthResponse> {
  return api<PatientAuthResponse>('portal/auth/activate', 'POST', data);
}

export async function patientLogin(
  data: { clinicSlug: string; phone: string; password: string },
): Promise<PatientAuthResponse> {
  return api<PatientAuthResponse>('portal/auth/login', 'POST', data);
}

export async function patientLogout(csrfToken?: string): Promise<{ success: boolean }> {
  return api<{ success: boolean }>('portal/auth/logout', 'POST', {}, csrfToken);
}

export async function requestPasswordReset(
  data: { clinicSlug: string; phone: string; dateOfBirth: string },
): Promise<{ success: boolean; testToken?: string }> {
  return api<{ success: boolean; testToken?: string }>('portal/auth/forgot-password', 'POST', data);
}

export async function resetPassword(
  data: { clinicSlug: string; token: string; newPassword: string },
): Promise<{ success: boolean }> {
  return api<{ success: boolean }>('portal/auth/reset-password', 'POST', data);
}

export async function fetchPatientProfile(signal?: AbortSignal): Promise<PatientProfileResponse> {
  return api<PatientProfileResponse>('portal/me', 'GET', undefined, undefined, signal);
}

export async function fetchBookableServices(signal?: AbortSignal): Promise<BookableService[]> {
  return api<BookableService[]>('portal/services', 'GET', undefined, undefined, signal);
}

export async function fetchBookableDoctors(signal?: AbortSignal): Promise<BookableDoctor[]> {
  return api<BookableDoctor[]>('portal/doctors', 'GET', undefined, undefined, signal);
}

export async function fetchAvailability(
  params: { date: string; serviceId: string; doctorResourceId?: string },
  signal?: AbortSignal,
): Promise<AvailabilityResponse> {
  const query = new URLSearchParams({
    date: params.date,
    serviceId: params.serviceId,
    ...(params.doctorResourceId ? { doctorResourceId: params.doctorResourceId } : {}),
  });
  return api<AvailabilityResponse>(`portal/availability?${query.toString()}`, 'GET', undefined, undefined, signal);
}

export async function fetchPatientAppointments(signal?: AbortSignal): Promise<AppointmentsResponse> {
  return api<AppointmentsResponse>('portal/appointments', 'GET', undefined, undefined, signal);
}

export async function bookPatientAppointment(
  data: {
    serviceId: string;
    doctorResourceId: string;
    roomResourceId?: string;
    startLocal: string;
    durationMinutes?: number;
    disambiguation?: 'REJECT' | 'EARLIER' | 'LATER';
    bookingKey: string;
  },
  csrfToken: string,
): Promise<PortalAppointment> {
  return api<PortalAppointment>('portal/appointments', 'POST', data, csrfToken);
}

export async function reschedulePatientAppointment(
  appointmentId: string,
  data: {
    expectedVersion: number;
    serviceId: string;
    doctorResourceId: string;
    roomResourceId?: string;
    startLocal: string;
    disambiguation?: 'REJECT' | 'EARLIER' | 'LATER';
  },
  csrfToken: string,
): Promise<PortalAppointment> {
  return api<PortalAppointment>(`portal/appointments/${appointmentId}/reschedule`, 'POST', data, csrfToken);
}

export async function cancelPatientAppointment(
  appointmentId: string,
  data: { expectedVersion: number; reason?: string },
  csrfToken: string,
): Promise<PortalAppointment> {
  return api<PortalAppointment>(`portal/appointments/${appointmentId}/cancel`, 'POST', data, csrfToken);
}

// ---------------------------------------------------------------------------
// Step 5.2: Consent Self-Service Interfaces & Client
// ---------------------------------------------------------------------------
export interface PortalConsent {
  id: string;
  purpose: 'PROCEDURE' | 'CLINICAL_PHOTOGRAPHY' | 'MARKETING_PHOTOGRAPHY';
  status: 'DRAFT' | 'PENDING_VERIFICATION' | 'ACTIVE' | 'WITHDRAWN' | 'EXPIRED' | 'REFUSED';
  validFrom?: string | null;
  expiresAt?: string | null;
  verifiedAt?: string | null;
  refusalReason?: string | null;
  version: number;
  createdAt: string;
  templateVersion: {
    id: string;
    versionNumber: number;
    titleAr: string;
    titleEn?: string | null;
    bodyAr: string;
    risksTextAr: string;
    alternativesTextAr: string;
    contentDigestSha256: string;
  };
  procedureCatalog?: { id: string; nameAr: string; nameEn?: string | null } | null;
  signatureEvidence?: {
    id: string;
    signerCapacity: string;
    signerName: string;
    signatureType: string;
    evidenceHashSha256: string;
    signedAt: string;
  } | null;
  withdrawal?: {
    id: string;
    withdrawnAt: string;
    reason: string;
  } | null;
}

export async function fetchPatientConsents(signal?: AbortSignal): Promise<PortalConsent[]> {
  return api<PortalConsent[]>('portal/consents', 'GET', undefined, undefined, signal);
}

export async function fetchPatientConsent(id: string, signal?: AbortSignal): Promise<PortalConsent> {
  return api<PortalConsent>(`portal/consents/${id}`, 'GET', undefined, undefined, signal);
}

export async function signPatientConsent(
  id: string,
  data: {
    expectedVersion: number;
    signerCapacity: 'PATIENT';
    signatureType: 'DRAWN_BASE64' | 'TYPED_CONFIRMATION';
    signatureData: string;
  },
  csrfToken: string,
): Promise<PortalConsent> {
  return api<PortalConsent>(`portal/consents/${id}/sign`, 'POST', data, csrfToken);
}

export async function refusePatientConsent(
  id: string,
  data: { expectedVersion: number; reason: string },
  csrfToken: string,
): Promise<PortalConsent> {
  return api<PortalConsent>(`portal/consents/${id}/refuse`, 'POST', data, csrfToken);
}

export async function withdrawPatientConsent(
  id: string,
  data: { expectedVersion: number; reason: string },
  csrfToken: string,
): Promise<PortalConsent> {
  return api<PortalConsent>(`portal/consents/${id}/withdraw`, 'POST', data, csrfToken);
}

// ---------------------------------------------------------------------------
// Step 5.2: Follow-ups, Recovery Check-ins & Outcomes Interfaces & Client
// ---------------------------------------------------------------------------
export interface PortalFollowUp {
  id: string;
  status: string;
  reason: string;
  scheduledDate: string;
  recoveryInstructions?: string | null;
  procedureExecution?: {
    id: string;
    treatmentPlanItem?: { procedureCatalog: { nameAr: string; nameEn?: string | null } } | null;
  } | null;
  treatingDoctor?: { user: { name: string } } | null;
  createdAt: string;
}

export interface PortalRecoveryCheckIn {
  id: string;
  painScore: number;
  symptoms: Record<string, unknown> | string[];
  recoveryNotes?: string | null;
  status: 'PENDING_REVIEW' | 'REVIEWED' | 'ESCALATED';
  isEscalated: boolean;
  escalationReason?: string | null;
  reviewedAt?: string | null;
  reviewedBy?: { user: { name: string } } | null;
  clinicianNotes?: string | null;
  checkInDate: string;
  version: number;
  followUp?: { id: string; reason: string; scheduledDate: string; recoveryInstructions?: string | null } | null;
}

export interface PortalReportedOutcome {
  id: string;
  measurementScale: string;
  score: string | number;
  notes?: string | null;
  submittedAt: string;
}

export async function fetchPatientFollowUps(signal?: AbortSignal): Promise<PortalFollowUp[]> {
  return api<PortalFollowUp[]>('portal/follow-ups', 'GET', undefined, undefined, signal);
}

export async function fetchPatientCheckIns(signal?: AbortSignal): Promise<PortalRecoveryCheckIn[]> {
  return api<PortalRecoveryCheckIn[]>('portal/check-ins', 'GET', undefined, undefined, signal);
}

export async function createPatientCheckIn(
  data: {
    followUpId?: string;
    procedureExecutionId?: string;
    painScore: number;
    symptoms: Record<string, boolean> | string[];
    recoveryNotes?: string;
  },
  csrfToken: string,
): Promise<{ checkIn: PortalRecoveryCheckIn; emergencyNotice: string | null }> {
  return api<{ checkIn: PortalRecoveryCheckIn; emergencyNotice: string | null }>('portal/check-ins', 'POST', data, csrfToken);
}

export async function fetchPatientOutcomes(signal?: AbortSignal): Promise<PortalReportedOutcome[]> {
  return api<PortalReportedOutcome[]>('portal/outcomes', 'GET', undefined, undefined, signal);
}

export async function submitPatientOutcome(
  data: {
    checkInId?: string;
    followUpId?: string;
    procedureExecutionId?: string;
    treatmentOutcomeId?: string;
    measurementScale: string;
    score: number;
    notes?: string;
  },
  csrfToken: string,
): Promise<PortalReportedOutcome> {
  return api<PortalReportedOutcome>('portal/outcomes', 'POST', data, csrfToken);
}

export { ApiError };
