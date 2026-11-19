/**
 * Clinical Gestational Dating & Antenatal Arithmetic Engine
 * Implements authoritative obstetric standards (ACOG, SOGC, Naegele's Rule, Robinson-Fleming CRL).
 * All date arithmetic is timezone-safe using UTC calendar days.
 */

import { BadRequestException } from '@nestjs/common';
import type { DatingMethod } from '../generated/prisma/client.js';

export interface GestationalAgeResult {
  totalDays: number;
  weeks: number;
  days: number;
  formattedAr: string;
  formattedEn: string;
}

export interface DatingComparisonResult {
  discrepancyDays: number;
  exceedsThreshold: boolean;
  thresholdDays: number;
  recommendedMethod: DatingMethod;
  clinicalRationaleAr: string;
  clinicalRationaleEn: string;
}

export type PreEclampsiaCategory =
  | 'NORMAL_BLOOD_PRESSURE'
  | 'CHRONIC_HYPERTENSION_SUSPECTED'
  | 'GESTATIONAL_HYPERTENSION_RISK'
  | 'SEVERE_HYPERTENSION_ALERT'
  | 'SUSPECTED_PREECLAMPSIA_PROTEINURIC'
  | 'SUSPECTED_PREECLAMPSIA_NON_PROTEINURIC'
  | 'ISOLATED_PROTEINURIA';

export interface PreEclampsiaScreenOptions {
  gestationalAgeWeeks?: number;
  gestationalAgeDays?: number;
  hasSevereHeadache?: boolean;
  hasVisualDisturbances?: boolean;
  hasEpigastricOrRupPain?: boolean;
  hasPulmonaryEdema?: boolean;
  hasThrombocytopenia?: boolean;
  hasImpairedLiverFunction?: boolean;
  hasRenalInsufficiency?: boolean;
  isRepeatedMeasurement?: boolean;
  knownChronicHypertension?: boolean;
}

export interface PreEclampsiaScreenResult {
  isAlert: boolean;
  severity: 'NONE' | 'MILD_HYPERTENSION' | 'SEVERE_PREECLAMPSIA_RISK';
  category: PreEclampsiaCategory;
  flags: string[];
  recommendationsAr: string[];
  recommendationsEn: string[];
  clinicalDisclaimerAr: string;
  clinicalDisclaimerEn: string;
}

// ---------------------------------------------------------------------------
// 1. Timezone-safe UTC Date Helpers
// ---------------------------------------------------------------------------

export function toUtcDateOnly(date: Date | string): Date {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) {
    throw new BadRequestException('Invalid date provided for obstetric calculation');
  }
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function addUtcDays(date: Date, days: number): Date {
  const result = new Date(date.getTime());
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

export function diffUtcDays(start: Date, end: Date): number {
  const msPerDay = 1000 * 60 * 60 * 24;
  const utc1 = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
  const utc2 = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
  return Math.round((utc2 - utc1) / msPerDay);
}

// ---------------------------------------------------------------------------
// 2. Naegele's Rule: EDD from Last Menstrual Period
// ---------------------------------------------------------------------------

/**
 * Standard 280-day gestational duration (40 weeks) from first day of LMP.
 */
export function calculateEddByLmp(lmpDate: Date | string): Date {
  const utc = toUtcDateOnly(lmpDate);
  return addUtcDays(utc, 280);
}

// ---------------------------------------------------------------------------
// 3. First Trimester Ultrasound Dating (Crown-Rump Length: Robinson & Fleming)
// ---------------------------------------------------------------------------

/**
 * Calculates gestational age from Crown-Rump Length (CRL) in millimeters.
 * Standard Robinson & Fleming formula:
 *   GA (days) = 8.052 * sqrt(CRL_mm) + 23.73
 * Valid clinical range: 10 mm (~7w0d) to 84 mm (~13w6d).
 */
export function calculateGestationalAgeFromCrl(crlMm: number): GestationalAgeResult {
  if (crlMm < 10 || crlMm > 84) {
    throw new BadRequestException(
      `Crown-Rump Length (${crlMm} mm) is outside the valid first-trimester dating range (10 mm to 84 mm)`,
    );
  }

  const rawDays = 8.052 * Math.sqrt(crlMm) + 23.73;
  const totalDays = Math.round(rawDays);
  const weeks = Math.floor(totalDays / 7);
  const days = totalDays % 7;

  return {
    totalDays,
    weeks,
    days,
    formattedAr: `${weeks}+${days} أسابيع`,
    formattedEn: `${weeks}w ${days}d`,
  };
}

/**
 * Calculates EDD by Ultrasound from the examination date and ultrasound-derived GA in days:
 *   EDD = ScanDate + (280 - GA_days)
 */
export function calculateEddByUltrasound(scanDate: Date | string, gaDays: number): Date {
  const utcScan = toUtcDateOnly(scanDate);
  if (gaDays < 35 || gaDays > 300) {
    throw new BadRequestException(`Ultrasound gestational age (${gaDays} days) is out of plausible pregnancy bounds`);
  }
  const remainingDays = 280 - gaDays;
  return addUtcDays(utcScan, remainingDays);
}

// ---------------------------------------------------------------------------
// 4. Gestational Age at any Target Date (e.g. Visit Date)
// ---------------------------------------------------------------------------

/**
 * Given the canonical/reconciled EDD and an encounter/observation date,
 * computes the exact gestational age in weeks and days.
 *   GA_days = 280 - (EDD - ObservationDate)
 */
export function calculateGestationalAgeAtDate(
  estimatedDueDate: Date | string,
  targetDate: Date | string = new Date(),
): GestationalAgeResult {
  const eddUtc = toUtcDateOnly(estimatedDueDate);
  const targetUtc = toUtcDateOnly(targetDate);

  const daysToEdd = diffUtcDays(targetUtc, eddUtc);
  const totalDays = 280 - daysToEdd;

  const weeks = Math.floor(totalDays / 7);
  const days = Math.max(0, totalDays % 7);

  return {
    totalDays,
    weeks,
    days,
    formattedAr: `${weeks}+${days} أسابيع`,
    formattedEn: `${weeks}w ${days}d`,
  };
}

// ---------------------------------------------------------------------------
// 5. Dating Provenance & Discrepancy Evaluation (ACOG / SOGC Guidelines)
// ---------------------------------------------------------------------------

/**
 * Compares LMP-derived EDD with Ultrasound-derived EDD to determine if
 * clinical redating is warranted under evidence-based guidelines:
 * - First trimester (<= 13w6d / 97 days): discrepancy > 7 days => redating recommended to ultrasound
 * - Early second trimester (14w0d to 15w6d): discrepancy > 7 days
 * - Mid second trimester (16w0d to 21w6d): discrepancy > 10 days
 */
export function evaluateDatingDiscrepancy(
  lmpEdd: Date | string,
  usEdd: Date | string,
  gaWeeksAtScan: number,
  isLmpCertain: boolean = true,
): DatingComparisonResult {
  const lmpUtc = toUtcDateOnly(lmpEdd);
  const usUtc = toUtcDateOnly(usEdd);
  const discrepancyDays = Math.abs(diffUtcDays(lmpUtc, usUtc));

  if (!isLmpCertain) {
    return {
      discrepancyDays,
      exceedsThreshold: true,
      thresholdDays: 0,
      recommendedMethod: 'ULTRASOUND_FIRST_TRIMESTER',
      clinicalRationaleAr: 'تاريخ الدورة الشهرية غير مؤكد؛ يجب اعتماد قياس السونار لتحديد موعد الولادة المتوقع',
      clinicalRationaleEn: 'LMP is uncertain; ultrasound biometric dating is the clinical standard of care',
    };
  }

  let thresholdDays = 7;
  if (gaWeeksAtScan > 15 && gaWeeksAtScan <= 22) {
    thresholdDays = 10;
  } else if (gaWeeksAtScan > 22) {
    thresholdDays = 14;
  }

  const exceedsThreshold = discrepancyDays > thresholdDays;
  const recommendedMethod: DatingMethod = exceedsThreshold
    ? gaWeeksAtScan <= 13
      ? 'ULTRASOUND_FIRST_TRIMESTER'
      : 'ULTRASOUND_SECOND_TRIMESTER'
    : 'LMP_CERTAIN';

  const clinicalRationaleAr = exceedsThreshold
    ? `الفارق بين حساب الدورة والسونار (${discrepancyDays} يوم) يتجاوز الحد المسموح به (${thresholdDays} أيام). يوصى بتعديل موعد الولادة إلى السونار.`
    : `الفارق بين حساب الدورة والسونار (${discrepancyDays} يوم) ضمن الحد المقبول (${thresholdDays} أيام). يتم الإبقاء على حساب الدورة الشهرية المؤكدة.`;

  const clinicalRationaleEn = exceedsThreshold
    ? `Discrepancy between LMP and ultrasound (${discrepancyDays} days) exceeds the ${thresholdDays}-day threshold. Clinical guideline advises redating to ultrasound.`
    : `Discrepancy between LMP and ultrasound (${discrepancyDays} days) is within the acceptable ${thresholdDays}-day margin. LMP dating is preserved.`;

  return {
    discrepancyDays,
    exceedsThreshold,
    thresholdDays,
    recommendedMethod,
    clinicalRationaleAr,
    clinicalRationaleEn,
  };
}

// ---------------------------------------------------------------------------
// 6. Maternal Vital Signs & Pre-Eclampsia Screening
// ---------------------------------------------------------------------------

const CLINICAL_DISCLAIMER_AR =
  'تنبيه دعم سريري استرشادي فقط: هذا التقييم مخصص للمساعدة السريرية ولا يمثل تشخيصاً طبياً نهائياً ولا يصرف أدوية تلقائياً. يجب على الطبيب المعالج تأكيد القياس سريرياً وفحص المريضة وفق المعايير السريرية المعتمدة.';
const CLINICAL_DISCLAIMER_EN =
  'Clinical decision support screening alert only: This is an advisory screening indicator and does not constitute an automated diagnosis or initiate medications. Qualified clinician evaluation and repeat measurement are required.';

export function evaluatePreEclampsiaScreen(
  systolicBp: number,
  diastolicBp: number,
  urineProtein?: string | null,
  options?: PreEclampsiaScreenOptions,
): PreEclampsiaScreenResult {
  const flags: string[] = [];
  const recommendationsAr: string[] = [];
  const recommendationsEn: string[] = [];

  const isSevereBp = systolicBp >= 160 || diastolicBp >= 110;
  const isElevatedBp = systolicBp >= 140 || diastolicBp >= 90;

  const hasSignificantProteinuria =
    urineProtein === 'PLUS_1' ||
    urineProtein === 'PLUS_2' ||
    urineProtein === 'PLUS_3' ||
    urineProtein === 'PLUS_4' ||
    urineProtein === 'ONE_PLUS_30MG' ||
    urineProtein === 'TWO_PLUS_100MG' ||
    urineProtein === 'THREE_PLUS_300MG' ||
    urineProtein === 'FOUR_PLUS_OVER_1000MG';

  const isPlusOneScreenOnly = urineProtein === 'PLUS_1' || urineProtein === 'ONE_PLUS_30MG';

  // Severe non-proteinuric features (ACOG Practice Bulletin No. 222 & ISSHP standard criteria)
  const severeSymptomsOrLabFeatures: string[] = [];
  if (options?.hasSevereHeadache) severeSymptomsOrLabFeatures.push('NEW_ONSET_SEVERE_PERSISTENT_HEADACHE');
  if (options?.hasVisualDisturbances) severeSymptomsOrLabFeatures.push('VISUAL_DISTURBANCES_SCOTOMATA');
  if (options?.hasEpigastricOrRupPain) severeSymptomsOrLabFeatures.push('SEVERE_EPIGASTRIC_OR_RUQ_PAIN');
  if (options?.hasPulmonaryEdema) severeSymptomsOrLabFeatures.push('PULMONARY_EDEMA');
  if (options?.hasThrombocytopenia) severeSymptomsOrLabFeatures.push('THROMBOCYTOPENIA_PLATELETS_UNDER_100K');
  if (options?.hasImpairedLiverFunction) severeSymptomsOrLabFeatures.push('IMPAIRED_LIVER_TRANSAMINASES_ELEVATED');
  if (options?.hasRenalInsufficiency) severeSymptomsOrLabFeatures.push('RENAL_INSUFFICIENCY_CREATININE_ELEVATED');

  const hasSevereNonProteinuricFeatures = severeSymptomsOrLabFeatures.length > 0;
  if (hasSevereNonProteinuricFeatures) {
    flags.push(...severeSymptomsOrLabFeatures);
  }

  // Gestational age evaluation: preeclampsia is diagnosed at GA >= 20 weeks (or postpartum)
  const gaWeeks = options?.gestationalAgeWeeks;
  const isPreTwentyWeeks = gaWeeks !== undefined && gaWeeks < 20;

  if (isSevereBp) {
    flags.push('CRITICAL_SEVERE_MATERNAL_HYPERTENSION');
    recommendationsAr.push('ضغط دم مرتفع بشدة (>= 160/110 مم زئبق)؛ يتطلب إعادة القياس خلال دقائق واستشارة طبية عاجلة');
    recommendationsEn.push('Severe-range hypertension (>= 160/110 mmHg); requires immediate repeat measurement and urgent clinical assessment');
  } else if (isElevatedBp) {
    flags.push('ELEVATED_MATERNAL_BLOOD_PRESSURE');
    recommendationsAr.push('ضغط دم مرتفع (>= 140/90 مم زئبق)؛ يتطلب إعادة القياس بعد 4 ساعات على الأقل للتحقق من الاستمرار');
    recommendationsEn.push('Elevated blood pressure (>= 140/90 mmHg); requires repeat measurement at least 4 hours apart to verify persistence');
  }

  if (hasSignificantProteinuria) {
    flags.push('SIGNIFICANT_PROTEINURIA');
    if (isPlusOneScreenOnly) {
      recommendationsAr.push('وجود زلال 1+ في شريط البول يعد مؤشراً استرشادياً؛ يلزم التأكيد الكمي بنسبة البروتين للكرياتينين (UPCR >= 0.3) أو جمع بول 24 ساعة (>= 300 مجم)');
      recommendationsEn.push('Dipstick 1+ proteinuria is a qualitative screening indicator; quantitative confirmation (UPCR >= 0.3 or 24-hr urine >= 300 mg) is clinically required');
    } else {
      recommendationsAr.push('وجود زلال ملحوظ في البول؛ يوصى بفحص نسبة البروتين إلى الكرياتينين في البول (UPCR) وتقييم وظائف الكلى');
      recommendationsEn.push('Substantial proteinuria detected; recommend urine protein-to-creatinine ratio (UPCR) and renal panel');
    }
  }

  // 1. Chronic hypertension boundary (< 20 weeks)
  if (isPreTwentyWeeks && (isElevatedBp || isSevereBp)) {
    const category: PreEclampsiaCategory = isSevereBp ? 'SEVERE_HYPERTENSION_ALERT' : 'CHRONIC_HYPERTENSION_SUSPECTED';
    recommendationsAr.push('ارتفاع ضغط الدم قبل الأسبوع العشرين من الحمل يشير إلى احتمالية وجود ضغط دم مزمن (Chronic Hypertension)؛ يتطلب تقييم القاع القلبي والكلوي المسبق');
    recommendationsEn.push('Hypertension before 20 weeks gestation suggests pre-existing chronic hypertension; baseline renal and cardiovascular assessment recommended');
    return {
      isAlert: true,
      severity: isSevereBp ? 'SEVERE_PREECLAMPSIA_RISK' : 'MILD_HYPERTENSION',
      category,
      flags,
      recommendationsAr,
      recommendationsEn,
      clinicalDisclaimerAr: CLINICAL_DISCLAIMER_AR,
      clinicalDisclaimerEn: CLINICAL_DISCLAIMER_EN,
    };
  }

  // 2. Severe Hypertension Alert (>= 160/110)
  if (isSevereBp) {
    let category: PreEclampsiaCategory = 'SEVERE_HYPERTENSION_ALERT';
    if (hasSignificantProteinuria) {
      category = 'SUSPECTED_PREECLAMPSIA_PROTEINURIC';
    } else if (hasSevereNonProteinuricFeatures) {
      category = 'SUSPECTED_PREECLAMPSIA_NON_PROTEINURIC';
    }

    if (category !== 'SEVERE_HYPERTENSION_ALERT') {
      recommendationsAr.push('اشتباه ما قبل الإرجاج مع مظاهر شديدة (Preeclampsia with Severe Features)؛ يوصى بالتقييم التوليدي الفوري ومراقبة الجنين وتجهيز بروتوكول كبريتات المغنيسيوم إذا لزم سريرياً');
      recommendationsEn.push('Preeclampsia with severe features suspected; immediate obstetric evaluation, fetal monitoring, and clinical readiness required');
    }

    return {
      isAlert: true,
      severity: 'SEVERE_PREECLAMPSIA_RISK',
      category,
      flags,
      recommendationsAr,
      recommendationsEn,
      clinicalDisclaimerAr: CLINICAL_DISCLAIMER_AR,
      clinicalDisclaimerEn: CLINICAL_DISCLAIMER_EN,
    };
  }

  // 3. Elevated Blood Pressure (140-159 / 90-109)
  if (isElevatedBp) {
    if (hasSignificantProteinuria) {
      return {
        isAlert: true,
        severity: 'SEVERE_PREECLAMPSIA_RISK',
        category: 'SUSPECTED_PREECLAMPSIA_PROTEINURIC',
        flags,
        recommendationsAr: [
          ...recommendationsAr,
          'اشتباه ما قبل الإرجاج المرتفق بالزلال (Preeclampsia with Proteinuria)؛ يلزم تأكيد كمي مخبري ومراقبة العلامات الحيوية وصحة الجنين',
        ],
        recommendationsEn: [
          ...recommendationsEn,
          'Suspected preeclampsia with proteinuria; quantitative laboratory confirmation and maternal/fetal surveillance required',
        ],
        clinicalDisclaimerAr: CLINICAL_DISCLAIMER_AR,
        clinicalDisclaimerEn: CLINICAL_DISCLAIMER_EN,
      };
    }

    if (hasSevereNonProteinuricFeatures) {
      return {
        isAlert: true,
        severity: 'SEVERE_PREECLAMPSIA_RISK',
        category: 'SUSPECTED_PREECLAMPSIA_NON_PROTEINURIC',
        flags,
        recommendationsAr: [
          ...recommendationsAr,
          'اشتباه ما قبل الإرجاج بدون زلال بولي لوجود أعراض سريرية/مخبرية حرجة (Non-proteinuric Preeclampsia with Severe Features) وفق معايير ACOG/ISSHP',
        ],
        recommendationsEn: [
          ...recommendationsEn,
          'Non-proteinuric preeclampsia with severe features suspected due to presence of systemic end-organ signs/symptoms under ACOG/ISSHP criteria',
        ],
        clinicalDisclaimerAr: CLINICAL_DISCLAIMER_AR,
        clinicalDisclaimerEn: CLINICAL_DISCLAIMER_EN,
      };
    }

    return {
      isAlert: true,
      severity: 'MILD_HYPERTENSION',
      category: 'GESTATIONAL_HYPERTENSION_RISK',
      flags,
      recommendationsAr: [
        ...recommendationsAr,
        'احتمالية ارتفاع ضغط الدم الحملي (Gestational Hypertension Risk) دون زلال أو مظاهر شديدة؛ يوصى بالمتابعة اللصيقة واستبعاد التطور لتسمم الحمل',
      ],
      recommendationsEn: [
        ...recommendationsEn,
        'Gestational hypertension risk without proteinuria or severe end-organ features; close monitoring and symptom education advised',
      ],
      clinicalDisclaimerAr: CLINICAL_DISCLAIMER_AR,
      clinicalDisclaimerEn: CLINICAL_DISCLAIMER_EN,
    };
  }

  // 4. Isolated Proteinuria without Hypertension
  if (hasSignificantProteinuria) {
    return {
      isAlert: true,
      severity: 'MILD_HYPERTENSION',
      category: 'ISOLATED_PROTEINURIA',
      flags,
      recommendationsAr: [
        ...recommendationsAr,
        'وجود زلال في البول مع ضغط دم طبيعي؛ يوصى باستبعاد التهاب المسالك البولية والتحقق المخبري من وظائف الكلى',
      ],
      recommendationsEn: [
        ...recommendationsEn,
        'Isolated proteinuria with normal blood pressure; evaluate for urinary tract infection and renal etiology',
      ],
      clinicalDisclaimerAr: CLINICAL_DISCLAIMER_AR,
      clinicalDisclaimerEn: CLINICAL_DISCLAIMER_EN,
    };
  }

  return {
    isAlert: false,
    severity: 'NONE',
    category: 'NORMAL_BLOOD_PRESSURE',
    flags: [],
    recommendationsAr: [],
    recommendationsEn: [],
    clinicalDisclaimerAr: CLINICAL_DISCLAIMER_AR,
    clinicalDisclaimerEn: CLINICAL_DISCLAIMER_EN,
  };
}
