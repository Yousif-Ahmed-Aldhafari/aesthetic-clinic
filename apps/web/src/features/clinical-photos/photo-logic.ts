import type { PhotoCategory } from './photo-api';

export interface ConsentLike {
  purpose: string;
  status: string;
  validFrom?: string | null;
  expiresAt?: string | null;
  withdrawal?: unknown | null;
}

export interface PhotoLike {
  id: string;
  category: PhotoCategory;
  isArchived?: boolean;
}

/**
 * Checks whether an informed consent record qualifies to authorize clinical photography.
 */
export function isPhotographyConsentActive(consent: ConsentLike | null | undefined, nowIso = new Date().toISOString()): boolean {
  if (!consent) return false;
  if (consent.purpose !== 'CLINICAL_PHOTOGRAPHY') return false;
  if (consent.status !== 'ACTIVE') return false;
  if (consent.withdrawal) return false;

  const now = new Date(nowIso).getTime();
  if (consent.validFrom && new Date(consent.validFrom).getTime() > now) return false;
  if (consent.expiresAt && new Date(consent.expiresAt).getTime() <= now) return false;

  return true;
}

/**
 * Validates whether two photographs can form a valid Before-and-After comparison group.
 */
export function validateComparisonPair(
  before: PhotoLike | null | undefined,
  after: PhotoLike | null | undefined,
): { valid: boolean; error?: string } {
  if (!before || !after) {
    return { valid: false, error: 'يجب اختيار صورتين لإجراء المقارنة السريرية' };
  }

  if (before.id === after.id) {
    return { valid: false, error: 'يجب أن تكون صورتا قبل وبعد مختلفتين تماماً' };
  }

  if (before.isArchived || after.isArchived) {
    return { valid: false, error: 'لا يمكن إدراج صورة مؤرشفة في مجموعة مقارنة جديدة' };
  }

  if (before.category === 'AFTER' && after.category === 'BEFORE') {
    return { valid: false, error: 'ترتيب المقارنة غير صحيح: لا يمكن اختيار صورة (بعد) كصورة أولى وصورة (قبل) كصورة ثانية' };
  }

  return { valid: true };
}
