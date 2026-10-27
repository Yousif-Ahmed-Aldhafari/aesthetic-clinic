export interface PrivacyRequest {
  id: string;
  clinicId: string;
  patientId: string | null;
  patientName: string;
  patientContact: string | null;
  requestType: 'ACCESS' | 'CORRECTION' | 'RESTRICTION' | 'EXPORT' | 'ERASURE';
  status: 'OPEN' | 'IN_REVIEW' | 'APPROVED' | 'DENIED' | 'COMPLETED' | 'WITHDRAWN' | 'HELD';
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

export interface PatientExport {
  id: string;
  clinicId: string;
  privacyRequestId: string | null;
  patientId: string;
  status: 'PENDING' | 'READY' | 'EXPIRED' | 'REVOKED';
  purpose: string;
  expiresAt: string | null;
  downloadCount: number;
  maxDownloads: number;
  revokedAt: string | null;
  revokeReason: string | null;
  fileSizeBytes: string | null;
  createdAt: string;
}

export interface RetentionPolicy {
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

export const requestTypeLabels: Record<string, string> = {
  ACCESS: 'طلب وصول لسجل المريض',
  CORRECTION: 'تصحيح بيانات إدارية',
  RESTRICTION: 'تقييد معالجة البيانات',
  EXPORT: 'تصدير بيانات قابلة للنقل',
  ERASURE: 'تقييم طلب المحو / الإتلاف',
};

export const requestStatusLabels: Record<string, string> = {
  OPEN: 'طلب جديد',
  IN_REVIEW: 'قيد المراجعة',
  APPROVED: 'مقبول',
  DENIED: 'مرفوض',
  COMPLETED: 'مكتمل ومُسلَّم',
  WITHDRAWN: 'مسحوب',
  HELD: 'مجمّد قانونيًا',
};

export const exportStatusLabels: Record<string, string> = {
  PENDING: 'قيد الإنشاء',
  READY: 'جاهز للتحميل',
  EXPIRED: 'منتهي الصلاحية',
  REVOKED: 'ملغى يدويًا',
};

