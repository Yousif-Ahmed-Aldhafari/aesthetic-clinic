import type { ClinicRole } from '../generated/prisma/client.js';

export const permissions = [
  'clinic.settings.read', 'clinic.settings.update', 'clinic.branding.read', 'clinic.branding.update',
  'staff.read', 'staff.manage', 'patients.read', 'patients.create', 'patients.update',
  'appointments.read', 'appointments.create', 'appointments.update', 'appointments.cancel', 'appointments.complete', 'queue.read', 'queue.manage', 'queue.checkin', 'queue.transfer', 'queue.complete',
  'invoices.read', 'invoices.create', 'invoices.issue', 'payments.record', 'payments.reverse', 'invoices.manage', 'reports.read',
  'audit.read',
] as const;
export type Permission = typeof permissions[number];
const operations: Permission[] = [
  'patients.read', 'patients.create', 'patients.update', 'appointments.read', 'appointments.create',
  'appointments.update', 'appointments.cancel', 'queue.read', 'queue.manage', 'queue.checkin', 'queue.transfer',
];
const administration: Permission[] = [
  'clinic.settings.read', 'clinic.settings.update', 'clinic.branding.read', 'clinic.branding.update',
  'staff.read', 'staff.manage', ...operations, 'appointments.complete', 'queue.complete',
  'audit.read',
];
export const rolePermissions: Readonly<Record<ClinicRole, readonly Permission[]>> = {
  CLINIC_OWNER: [...administration, 'invoices.read', 'invoices.create', 'invoices.issue', 'payments.record', 'payments.reverse', 'invoices.manage', 'reports.read'],
  CLINIC_ADMIN: administration,
  DOCTOR: ['clinic.branding.read', 'patients.read', 'patients.update', 'appointments.read', 'appointments.update', 'appointments.complete', 'queue.read', 'queue.manage', 'queue.complete'],
  RECEPTIONIST: ['clinic.branding.read', ...operations, 'invoices.read', 'invoices.create', 'invoices.issue', 'payments.record'],
  ACCOUNTANT: ['clinic.branding.read', 'invoices.read', 'invoices.create', 'invoices.issue', 'payments.record', 'payments.reverse', 'invoices.manage', 'reports.read'],
};
export const permissionsFor = (role: ClinicRole): readonly Permission[] => Object.hasOwn(rolePermissions, role) ? rolePermissions[role] : [];
