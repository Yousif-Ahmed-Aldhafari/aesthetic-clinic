import type {
  AdverseEventStatus,
  FollowUpSeverity,
  FollowUpStatus,
  OutcomeMeasurementScale,
} from './followup-api';

export interface ScaleDefinition {
  label: string;
  description: string;
  hasScore: boolean;
  min?: number;
  max?: number;
  step?: number;
  scoreLabels?: Record<number, string>;
}

export const MEASUREMENT_SCALES: Record<OutcomeMeasurementScale, ScaleDefinition> = {
  VISUAL_ANALOG_SCALE_10: {
    label: 'مقياس النظير البصري (VAS 0–10)',
    description: 'مقياس تدريجي من 0 (انعدام التحسن / أسوأ حالة) إلى 10 (تحسن تام / أفضل نتيجة متوقعة)',
    hasScore: true,
    min: 0,
    max: 10,
    step: 0.5,
  },
  PATIENT_SATISFACTION_5_POINT: {
    label: 'مقياس رضا المريض (5 نقاط)',
    description: 'مقياس ليكرت لرضا المريض عن النتيجة التجميلية من 1 إلى 5',
    hasScore: true,
    min: 1,
    max: 5,
    step: 1,
    scoreLabels: {
      1: 'غير راضٍ تماماً',
      2: 'غير راضٍ',
      3: 'محايد / مقبول',
      4: 'راضٍ',
      5: 'راضٍ جداً وممتن',
    },
  },
  CLINICAL_GLOBAL_IMPRESSION: {
    label: 'الانطباع السريري العام (CGI 1–7)',
    description: 'مقياس التقييم السريري الاحترافي لمدى التغير والتحسن السريري',
    hasScore: true,
    min: 1,
    max: 7,
    step: 1,
    scoreLabels: {
      1: 'تحسن سريري استثنائي وجذري',
      2: 'تحسن سريري ملحوظ',
      3: 'تحسن طفيف',
      4: 'لا يوجد تغيير سريري',
      5: 'تراجع سريري طفيف',
      6: 'تراجع سريري ملحوظ',
      7: 'تراجع سريري حاد',
    },
  },
  STRUCTURED_OBSERVATION: {
    label: 'ملاحظة سريرية هيكلية وصفية',
    description: 'توثيق وصفي نوعي للحالة والأنسجة دون الحاجة إلى درجة رقمية محددة',
    hasScore: false,
  },
};

export const FOLLOWUP_STATUS_META: Record<
  FollowUpStatus,
  { label: string; badgeClass: string; isTerminal: boolean }
> = {
  SCHEDULED: {
    label: 'مجدولة',
    badgeClass: 'badge-scheduled',
    isTerminal: false,
  },
  IN_PROGRESS: {
    label: 'قيد المتابعة السريرية',
    badgeClass: 'badge-in-progress',
    isTerminal: false,
  },
  COMPLETED: {
    label: 'مكتملة وموثقة',
    badgeClass: 'badge-completed',
    isTerminal: true,
  },
  CANCELLED: {
    label: 'ملغاة',
    badgeClass: 'badge-cancelled',
    isTerminal: true,
  },
  MISSED: {
    label: 'لم يحضر المريض',
    badgeClass: 'badge-missed',
    isTerminal: true,
  },
};

export const SEVERITY_META: Record<
  FollowUpSeverity,
  { label: string; badgeClass: string }
> = {
  MILD: {
    label: 'خفيفة / عارضة',
    badgeClass: 'badge-severity-mild',
  },
  MODERATE: {
    label: 'متوسطة',
    badgeClass: 'badge-severity-moderate',
  },
  SEVERE: {
    label: 'شديدة / تستوجب تدخلاً',
    badgeClass: 'badge-severity-severe',
  },
};

export const ADVERSE_EVENT_STATUS_META: Record<
  AdverseEventStatus,
  { label: string; badgeClass: string }
> = {
  REPORTED: {
    label: 'تم الإبلاغ',
    badgeClass: 'badge-ae-reported',
  },
  UNDER_EVALUATION: {
    label: 'قيد التقييم السريري',
    badgeClass: 'badge-ae-evaluation',
  },
  RESOLVED: {
    label: 'تم التعامل / مستقر',
    badgeClass: 'badge-ae-resolved',
  },
  ESCALATED: {
    label: 'تم التصعيد',
    badgeClass: 'badge-ae-escalated',
  },
};

/**
 * Validates a score against scale definitions.
 */
export function validateScoreForScale(
  scale: OutcomeMeasurementScale,
  score: number | undefined | null,
): { valid: boolean; error?: string } {
  const def = MEASUREMENT_SCALES[scale];
  if (!def.hasScore) {
    return { valid: true };
  }
  if (score === undefined || score === null || Number.isNaN(score)) {
    return { valid: false, error: `الدرجة مطلوبة للمقياس: ${def.label}` };
  }
  if (def.min !== undefined && score < def.min) {
    return { valid: false, error: `الدرجة لا يمكن أن تقل عن ${def.min}` };
  }
  if (def.max !== undefined && score > def.max) {
    return { valid: false, error: `الدرجة لا يمكن أن تزيد عن ${def.max}` };
  }
  return { valid: true };
}

/**
 * Arabic date and time formatter
 */
export function formatArabicDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  try {
    return new Intl.DateTimeFormat('ar-YE', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'UTC',
    }).format(new Date(dateStr));
  } catch {
    return dateStr;
  }
}
