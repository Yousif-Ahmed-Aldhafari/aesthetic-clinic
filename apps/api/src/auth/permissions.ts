import type { ClinicRole } from '../generated/prisma/client.js';

export const permissions = [
  'clinic.settings.read', 'clinic.settings.update', 'clinic.branding.read', 'clinic.branding.update',
  'staff.read', 'staff.manage', 'patients.read', 'patients.create', 'patients.update',
  'appointments.read', 'appointments.create', 'appointments.update', 'appointments.cancel', 'appointments.complete', 'queue.read', 'queue.manage',
  'invoices.read', 'invoices.create', 'invoices.manage', 'reports.read',
] as const;
export type Permission = typeof permissions[number];
const operations: Permission[] = [
  'patients.read', 'patients.create', 'patients.update', 'appointments.read', 'appointments.create',
  'appointments.update', 'appointments.cancel', 'queue.read', 'queue.manage',
];
const administration: Permission[] = [
  'clinic.settings.read', 'clinic.settings.update', 'clinic.branding.read', 'clinic.branding.update',
  'staff.read', 'staff.manage', ...operations, 'appointments.complete',
];
export const rolePermissions: Readonly<Record<ClinicRole, readonly Permission[]>> = {
  CLINIC_OWNER: [...administration, 'invoices.read', 'invoices.create', 'invoices.manage', 'reports.read'],
  CLINIC_ADMIN: administration,
  DOCTOR: ['clinic.branding.read', 'patients.read', 'patients.update', 'appointments.read', 'appointments.update', 'appointments.complete', 'queue.read', 'queue.manage'],
  RECEPTIONIST: ['clinic.branding.read', ...operations, 'invoices.read', 'invoices.create'],
  ACCOUNTANT: ['clinic.branding.read', 'invoices.read', 'invoices.create', 'invoices.manage', 'reports.read'],
};
export const permissionsFor = (role: ClinicRole): readonly Permission[] => Object.hasOwn(rolePermissions, role) ? rolePermissions[role] : [];
