import type { ClinicRole } from '../generated/prisma/client.js';

export const permissions = [
  'clinic.settings.read', 'clinic.settings.update', 'clinic.branding.read', 'clinic.branding.update',
  'staff.read', 'staff.manage', 'patients.read', 'patients.create', 'patients.update',
  'appointments.read', 'appointments.create', 'appointments.update', 'appointments.cancel', 'appointments.complete', 'queue.read', 'queue.manage', 'queue.checkin', 'queue.transfer', 'queue.complete',
  'invoices.read', 'invoices.create', 'invoices.issue', 'payments.record', 'payments.reverse', 'invoices.manage', 'reports.read',
  'audit.read',
  'privacy.requests.read', 'privacy.requests.manage', 'privacy.export',
  'clinical.encounters.read', 'clinical.encounters.create', 'clinical.encounters.update', 'clinical.encounters.sign',
  'clinical.history.read', 'clinical.history.update', 'clinical.amendments.create',
  'clinical.treatment-plans.read', 'clinical.treatment-plans.create', 'clinical.treatment-plans.update', 'clinical.treatment-plans.approve',
  'clinical.procedure-catalog.read', 'clinical.procedure-catalog.manage',
  'clinical.procedures.read', 'clinical.procedures.document', 'clinical.procedures.perform',
  'clinical.consent-templates.read', 'clinical.consent-templates.manage',
  'clinical.consents.read', 'clinical.consents.prepare', 'clinical.consents.sign', 'clinical.consents.verify', 'clinical.consents.withdraw',
  'clinical.photos.read', 'clinical.photos.upload', 'clinical.photos.annotate', 'clinical.photos.compare', 'clinical.photos.manage',
  'clinical.follow-ups.read', 'clinical.follow-ups.schedule', 'clinical.follow-ups.update', 'clinical.follow-ups.sign', 'clinical.follow-ups.amend',
  'clinical.outcomes.read', 'clinical.outcomes.record',
  'clinical.adverse-events.read', 'clinical.adverse-events.record', 'clinical.adverse-events.manage',
  'inventory.products.read', 'inventory.products.manage',
  'inventory.locations.read', 'inventory.locations.manage',
  'inventory.stock.read', 'inventory.stock.receive', 'inventory.stock.issue', 'inventory.stock.adjust', 'inventory.stock.transfer',
  'inventory.movements.read', 'inventory.reconcile',
  'inventory.batches.read', 'inventory.batches.manage', 'inventory.batches.quarantine', 'inventory.batches.recall',
  'inventory.clinical-consumption.record', 'inventory.clinical-consumption.read',
] as const;
export type Permission = typeof permissions[number];
const operations: Permission[] = [
  'patients.read', 'patients.create', 'patients.update', 'appointments.read', 'appointments.create',
  'appointments.update', 'appointments.cancel', 'queue.read', 'queue.manage', 'queue.checkin', 'queue.transfer',
];
const inventoryManagement: Permission[] = [
  'inventory.products.read', 'inventory.products.manage',
  'inventory.locations.read', 'inventory.locations.manage',
  'inventory.stock.read', 'inventory.stock.receive', 'inventory.stock.issue', 'inventory.stock.adjust', 'inventory.stock.transfer',
  'inventory.movements.read', 'inventory.reconcile',
  'inventory.batches.read', 'inventory.batches.manage', 'inventory.batches.quarantine', 'inventory.batches.recall',
  'inventory.clinical-consumption.record', 'inventory.clinical-consumption.read',
];
const administration: Permission[] = [
  'clinic.settings.read', 'clinic.settings.update', 'clinic.branding.read', 'clinic.branding.update',
  'staff.read', 'staff.manage', ...operations, 'appointments.complete', 'queue.complete',
  'audit.read', 'privacy.requests.read', 'privacy.requests.manage',
  ...inventoryManagement,
];
export const rolePermissions: Readonly<Record<ClinicRole, readonly Permission[]>> = {
  CLINIC_OWNER: [...administration, 'invoices.read', 'invoices.create', 'invoices.issue', 'payments.record', 'payments.reverse', 'invoices.manage', 'reports.read', 'privacy.export'],
  CLINIC_ADMIN: administration,
  DOCTOR: ['clinic.branding.read', 'patients.read', 'patients.update', 'appointments.read', 'appointments.update', 'appointments.complete', 'queue.read', 'queue.manage', 'queue.complete',
    'clinical.encounters.read', 'clinical.encounters.create', 'clinical.encounters.update', 'clinical.encounters.sign',
    'clinical.history.read', 'clinical.history.update', 'clinical.amendments.create',
    'clinical.treatment-plans.read', 'clinical.treatment-plans.create', 'clinical.treatment-plans.update', 'clinical.treatment-plans.approve',
    'clinical.procedure-catalog.read', 'clinical.procedure-catalog.manage',
    'clinical.procedures.read', 'clinical.procedures.document', 'clinical.procedures.perform',
    'clinical.consent-templates.read', 'clinical.consent-templates.manage',
    'clinical.consents.read', 'clinical.consents.prepare', 'clinical.consents.sign', 'clinical.consents.verify', 'clinical.consents.withdraw',
    'clinical.photos.read', 'clinical.photos.upload', 'clinical.photos.annotate', 'clinical.photos.compare', 'clinical.photos.manage',
    'clinical.follow-ups.read', 'clinical.follow-ups.schedule', 'clinical.follow-ups.update', 'clinical.follow-ups.sign', 'clinical.follow-ups.amend',
    'clinical.outcomes.read', 'clinical.outcomes.record',
    'clinical.adverse-events.read', 'clinical.adverse-events.record', 'clinical.adverse-events.manage',
    'inventory.products.read', 'inventory.locations.read', 'inventory.stock.read',
    'inventory.batches.read', 'inventory.clinical-consumption.record', 'inventory.clinical-consumption.read'],
  RECEPTIONIST: ['clinic.branding.read', ...operations, 'invoices.read', 'invoices.create', 'invoices.issue', 'payments.record'],
  ACCOUNTANT: ['clinic.branding.read', 'invoices.read', 'invoices.create', 'invoices.issue', 'payments.record', 'payments.reverse', 'invoices.manage', 'reports.read'],
};
export const permissionsFor = (role: ClinicRole): readonly Permission[] => Object.hasOwn(rolePermissions, role) ? rolePermissions[role] : [];
