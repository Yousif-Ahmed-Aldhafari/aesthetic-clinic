export interface ClinicContext {
  clinicId: string; slug: string; displayName: string; role: string; permissions: string[];
  branding: { logoUrl: string | null; primaryColor: string; secondaryColor: string; accentColor: string | null } | null;
}
export interface SessionInfo {
  user: { id: string; name: string; email: string }; selectedClinicId: string | null; csrfToken: string; expiresAt: string;
}
export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message); }
}
// Session cookie is HttpOnly. CSRF values live only in React memory, never browser storage.
export async function api<T>(path: string, method = 'GET', body?: unknown, csrfToken?: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api/v1/${path}`, { method, credentials: 'same-origin', cache: 'no-store', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000),
    headers: { Accept: 'application/json', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await response.json().catch(()=>null);
  if (!response.ok) throw new ApiError(response.status, data?.error?.code ?? 'UNAVAILABLE', data?.error?.message ?? 'تعذّر الاتصال بالخدمة');
  return data as T;
}
export const roleNames: Record<string,string> = {
  CLINIC_OWNER: 'مالك العيادة', CLINIC_ADMIN: 'مدير العيادة', DOCTOR: 'طبيب', RECEPTIONIST: 'موظف استقبال', ACCOUNTANT: 'محاسب',
};
