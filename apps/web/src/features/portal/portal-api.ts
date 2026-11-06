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

export { ApiError };
