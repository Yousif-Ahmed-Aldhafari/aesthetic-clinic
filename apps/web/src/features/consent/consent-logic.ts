export type ConsentPurpose = 'PROCEDURE' | 'CLINICAL_PHOTOGRAPHY' | 'MARKETING_PHOTOGRAPHY';
export type ConsentStatus = 'DRAFT' | 'PENDING_VERIFICATION' | 'ACTIVE' | 'WITHDRAWN' | 'EXPIRED' | 'REFUSED';

export function isConsentEligibleForProcedure(
  consent: {
    status: ConsentStatus;
    purpose: ConsentPurpose;
    procedureCatalogId?: string | null;
    expiresAt?: string | null;
  },
  procedureCatalogId: string,
  nowIso: string = new Date().toISOString()
): boolean {
  if (consent.status !== 'ACTIVE') return false;
  if (consent.purpose !== 'PROCEDURE') return false;
  if (consent.procedureCatalogId && consent.procedureCatalogId !== procedureCatalogId) return false;
  if (consent.expiresAt && consent.expiresAt < nowIso) return false;
  return true;
}

export function validateSignerInformation(signer: {
  capacity: 'PATIENT' | 'GUARDIAN' | 'LEGAL_REPRESENTATIVE';
  name: string;
  relationshipDescription?: string | null;
}): { valid: boolean; error?: string } {
  if (!signer.name || signer.name.trim().length < 2) {
    return { valid: false, error: 'اسم الموقّع يجب أن يكون حرفين على الأقل' };
  }
  if (signer.capacity !== 'PATIENT' && (!signer.relationshipDescription || signer.relationshipDescription.trim().length < 2)) {
    return { valid: false, error: 'صلة القرابة أو صفة التمثيل مطلوبة للولي أو الوكيل' };
  }
  return { valid: true };
}
