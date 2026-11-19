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

export interface PreEclampsiaScreenResult {
  isAlert: boolean;
  severity: 'NONE' | 'MILD_HYPERTENSION' | 'SEVERE_PREECLAMPSIA_RISK';
  flags: string[];
  recommendationsAr: string[];
  recommendationsEn: string[];
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

export function evaluatePreEclampsiaScreen(
  systolicBp: number,
  diastolicBp: number,
  urineProtein?: string | null,
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

  if (isSevereBp) {
    flags.push('CRITICAL_SEVERE_MATERNAL_HYPERTENSION');
    recommendationsAr.push('ضغط دم مرتفع بشدة (>= 160/110)؛ يتطلب تدخلاً طبياً عاجلاً وفحص تسمم الحمل الفوري');
    recommendationsEn.push('Severe maternal hypertension (>= 160/110 mmHg); requires immediate clinical evaluation');
  } else if (isElevatedBp) {
    flags.push('ELEVATED_MATERNAL_BLOOD_PRESSURE');
    recommendationsAr.push('ضغط دم مرتفع (>= 140/90)؛ يتطلب تكرار القياس خلال 15 دقيقة والمراقبة اللصيقة');
    recommendationsEn.push('Elevated blood pressure (>= 140/90 mmHg); repeat measurement in 15 minutes');
  }

  if (hasSignificantProteinuria) {
    flags.push('SIGNIFICANT_PROTEINURIA');
    recommendationsAr.push('وجود زلال في البول؛ يوصى بفحص نسبة البروتين إلى الكرياتينين في البول (PCR)');
    recommendationsEn.push('Proteinuria detected; recommend urine protein-to-creatinine ratio (PCR)');
  }

  if (isSevereBp && hasSignificantProteinuria) {
    return {
      isAlert: true,
      severity: 'SEVERE_PREECLAMPSIA_RISK',
      flags,
      recommendationsAr,
      recommendationsEn,
    };
  }

  if (isElevatedBp || hasSignificantProteinuria) {
    return {
      isAlert: true,
      severity: 'MILD_HYPERTENSION',
      flags,
      recommendationsAr,
      recommendationsEn,
    };
  }

  return {
    isAlert: false,
    severity: 'NONE',
    flags: [],
    recommendationsAr: [],
    recommendationsEn: [],
  };
}
