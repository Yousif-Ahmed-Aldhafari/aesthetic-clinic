import { api } from '../auth/api';

export type ConsentPurpose = 'PROCEDURE' | 'CLINICAL_PHOTOGRAPHY' | 'MARKETING_PHOTOGRAPHY';
export type ConsentStatus = 'DRAFT' | 'PENDING_VERIFICATION' | 'ACTIVE' | 'WITHDRAWN' | 'EXPIRED' | 'REFUSED';
export type SignerCapacity = 'PATIENT' | 'GUARDIAN' | 'LEGAL_REPRESENTATIVE';
export type SignatureType = 'DRAWN_BASE64' | 'TYPED_CONFIRMATION' | 'SECURE_TOKEN';

export type ConsentTemplateVersion = {
  id: string;
  versionNumber: number;
  status: 'DRAFT' | 'PUBLISHED' | 'RETIRED';
  titleAr: string;
  bodyAr: string;
  titleEn: string | null;
  bodyEn: string | null;
  risksTextAr: string;
  alternativesTextAr: string;
  contentDigestSha256: string;
  publishedAt: string | null;
  createdAt: string;
  publishedBy?: { id: string; user: { name: string } };
};

export type ConsentTemplate = {
  id: string;
  purpose: ConsentPurpose;
  title: string;
  procedureCatalogId: string | null;
  active: boolean;
  version: number;
  createdAt: string;
  procedureCatalog?: { id: string; nameAr: string; nameEn: string | null; category: string } | null;
  versions: ConsentTemplateVersion[];
};

export type ConsentSignatureEvidence = {
  id: string;
  signerCapacity: SignerCapacity;
  signerName: string;
  signerIdentitySnapshot: string | null;
  relationshipDescription: string | null;
  signatureType: SignatureType;
  signatureData?: string;
  evidenceHashSha256: string;
  signedAt: string;
};

export type ConsentWithdrawal = {
  id: string;
  withdrawnAt: string;
  reason: string;
  withdrawnBy?: { id: string; user: { name: string } };
};

export type PatientConsent = {
  id: string;
  patientId: string;
  templateVersionId: string;
  purpose: ConsentPurpose;
  status: ConsentStatus;
  treatmentPlanId: string | null;
  treatmentPlanItemId: string | null;
  procedureCatalogId: string | null;
  verifiedAt: string | null;
  validFrom: string | null;
  expiresAt: string | null;
  refusalReason: string | null;
  notes: string | null;
  version: number;
  createdAt: string;
  templateVersion: ConsentTemplateVersion;
  procedureCatalog?: { id: string; nameAr: string; nameEn: string | null; category: string } | null;
  preparedBy: { id: string; user: { name: string } };
  verifiedBy?: { id: string; user: { name: string } } | null;
  signatureEvidence?: ConsentSignatureEvidence | null;
  withdrawal?: ConsentWithdrawal | null;
};

export const consentApi = (clinicId: string) => {
  const root = `clinics/${encodeURIComponent(clinicId)}/clinical`;
  return {
    listTemplates: (signal: AbortSignal, query = '') =>
      api<{ items: ConsentTemplate[]; nextCursor: string | null }>(`${root}/consent-templates${query ? `?${query}` : ''}`, 'GET', undefined, undefined, signal),
    getTemplate: (templateId: string, signal: AbortSignal) =>
      api<ConsentTemplate>(`${root}/consent-templates/${templateId}`, 'GET', undefined, undefined, signal),
    createTemplate: (body: any, csrf: string, signal: AbortSignal) =>
      api<ConsentTemplate>(`${root}/consent-templates`, 'POST', body, csrf, signal),
    publishVersion: (templateId: string, versionId: string, expectedVersion: number, csrf: string, signal: AbortSignal) =>
      api<ConsentTemplateVersion>(`${root}/consent-templates/${templateId}/versions/${versionId}/publish`, 'POST', { expectedVersion }, csrf, signal),
    listConsents: (signal: AbortSignal, query = '') =>
      api<{ items: PatientConsent[]; nextCursor: string | null }>(`${root}/consents${query ? `?${query}` : ''}`, 'GET', undefined, undefined, signal),
    getConsent: (consentId: string, signal: AbortSignal) =>
      api<PatientConsent>(`${root}/consents/${consentId}`, 'GET', undefined, undefined, signal),
    prepareConsent: (body: any, csrf: string, signal: AbortSignal) =>
      api<PatientConsent>(`${root}/consents`, 'POST', body, csrf, signal),
    signConsent: (consentId: string, body: any, csrf: string, signal: AbortSignal) =>
      api<PatientConsent>(`${root}/consents/${consentId}/sign`, 'POST', body, csrf, signal),
    verifyConsent: (consentId: string, expectedVersion: number, validUntil: string | undefined, csrf: string, signal: AbortSignal) =>
      api<PatientConsent>(`${root}/consents/${consentId}/verify`, 'POST', { expectedVersion, validUntil }, csrf, signal),
    withdrawConsent: (consentId: string, expectedVersion: number, reason: string, csrf: string, signal: AbortSignal) =>
      api<PatientConsent>(`${root}/consents/${consentId}/withdraw`, 'POST', { expectedVersion, reason }, csrf, signal),
    refuseConsent: (consentId: string, expectedVersion: number, reason: string, csrf: string, signal: AbortSignal) =>
      api<PatientConsent>(`${root}/consents/${consentId}/refuse`, 'POST', { expectedVersion, reason }, csrf, signal),
  };
};
