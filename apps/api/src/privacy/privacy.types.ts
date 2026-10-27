import type {
  PrivacyRequestType as PrismaPrivacyRequestType,
  PrivacyRequestStatus as PrismaPrivacyRequestStatus,
  ExportStatus as PrismaExportStatus,
} from '../generated/prisma/client.js';

export type PrivacyRequestType = PrismaPrivacyRequestType;
export type PrivacyRequestStatus = PrismaPrivacyRequestStatus;
export type ExportStatus = PrismaExportStatus;

export interface PrivacyRequestDto {
  id: string;
  clinicId: string;
  patientId: string | null;
  patientName: string;
  patientContact: string | null;
  requestType: PrivacyRequestType;
  status: PrivacyRequestStatus;
  subject: string;
  notes: string | null;
  decisionReason: string | null;
  decisionBy: string | null;
  decisionAt: string | null;
  completedAt: string | null;
  legalHold: boolean;
  legalHoldReason: string | null;
  requestedAt: string;
  updatedAt: string;
  version: number;
}

export interface PatientExportDto {
  id: string;
  clinicId: string;
  privacyRequestId: string | null;
  patientId: string;
  patientName?: string;
  status: ExportStatus;
  purpose: string;
  expiresAt: string | null;
  downloadCount: number;
  maxDownloads: number;
  revokedAt: string | null;
  revokeReason: string | null;
  fileSizeBytes: string | null;
  createdAt: string;
}

export interface GeneratedExportResult {
  exportId: string;
  downloadToken: string;
  downloadUrl: string;
  expiresAt: string;
  maxDownloads: number;
  fileSizeBytes: number;
}

export interface RetentionPolicyDto {
  clinicId: string;
  policyVersion: number;
  dryRunOnly: boolean;
  patientRecordDays: number | null;
  appointmentDays: number | null;
  visitDays: number | null;
  auditEventDays: number | null;
  backupRetentionDays: number | null;
  exportRetentionDays: number;
  privacyRequestDays: number | null;
  configuredBy: string | null;
  configuredAt: string;
  updatedAt: string;
}

export interface RetentionDryRunReport {
  clinicId: string;
  dryRunOnly: boolean;
  generatedAt: string;
  eligible: {
    patients: number;
    appointments: number;
    auditEvents: number;
    exports: number;
    privacyRequests: number;
  };
  note: string;
}

