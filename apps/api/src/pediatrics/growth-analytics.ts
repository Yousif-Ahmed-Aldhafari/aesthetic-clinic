import {
  getInterpolatedLms,
  type ChildGender,
  type GrowthMetricType,
} from './who-growth-data.js';

export interface ChronologicalAgeResult {
  days: number;
  months: number;
  years: number;
}

export interface CorrectedAgeResult {
  applies: boolean;
  chronologicalAgeDays: number;
  deficitDays: number;
  correctedAgeDays: number;
  correctedAgeMonths: number;
  isPretermNeonate: boolean;
  postMenstrualAgeWeeks?: number;
  postMenstrualAgeDays?: number;
  reason?: string;
}

export type StatureMethod = 'RECUMBENT_LENGTH' | 'STANDING_HEIGHT';

export interface GrowthScoreResult {
  status: 'CALCULATED' | 'OUT_OF_REFERENCE_RANGE' | 'INVALID_MEASUREMENT' | 'CALCULATION_UNAVAILABLE';
  zScore: number | null;
  percentile: number | null;
  referenceStandard: string;
  l?: number;
  m?: number;
  s?: number;
}

export interface GrowthCalculationParams {
  metric: GrowthMetricType;
  gender: ChildGender;
  ageInMonths: number;
  measurementValue: number;
}

export interface PediatricGrowthEvaluationInput {
  birthDate: Date;
  measurementDate?: Date;
  gender: ChildGender;
  gestationalAgeWeeks?: number;
  gestationalAgeDays?: number;
  weightKg?: number;
  statureCm?: number;
  statureMethod?: StatureMethod;
  headCircumferenceCm?: number;
  useCorrectedAgeForZScores?: boolean;
}

export interface PediatricGrowthEvaluationResult {
  chronologicalAge: ChronologicalAgeResult;
  correctedAge: CorrectedAgeResult;
  effectiveAgeInMonths: number;
  recommendedStatureMethod: StatureMethod;
  bmi: number | null;
  weightForAge: GrowthScoreResult;
  lengthForAge: GrowthScoreResult;
  headCircumferenceForAge: GrowthScoreResult;
  bmiForAge: GrowthScoreResult;
  clinicalAlerts: string[];
}

/**
 * Calculates exact chronological age in days, months, and years.
 * Standard pediatric informatics convention: 1 month = 30.4375 days (365.25 / 12).
 */
export function calculateChronologicalAge(
  birthDate: Date,
  measurementDate: Date = new Date(),
): ChronologicalAgeResult {
  const diffMs = measurementDate.getTime() - birthDate.getTime();
  const days = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
  const months = Math.round((days / 30.4375) * 100) / 100;
  const years = Math.round((days / 365.25) * 100) / 100;

  return { days, months, years };
}

/**
 * Calculates prematurity corrected age according to AAP and WHO pediatric guidelines.
 * Correction applies if gestational age at birth < 37 weeks AND chronological age <= 730 days (2 years).
 * Gestational deficit days = (40 * 7) - (GA_weeks * 7 + GA_days).
 * Corrected age days = Chronological age days - Deficit days.
 */
export function calculateCorrectedAge(
  birthDate: Date,
  measurementDate: Date = new Date(),
  gestationalAgeWeeks?: number,
  gestationalAgeDays: number = 0,
): CorrectedAgeResult {
  const chrono = calculateChronologicalAge(birthDate, measurementDate);

  if (gestationalAgeWeeks === undefined || gestationalAgeWeeks === null || gestationalAgeWeeks >= 37) {
    return {
      applies: false,
      chronologicalAgeDays: chrono.days,
      deficitDays: 0,
      correctedAgeDays: chrono.days,
      correctedAgeMonths: chrono.months,
      isPretermNeonate: false,
      reason: 'Term birth (Gestational age >= 37 weeks) - correction does not apply',
    };
  }

  // After 24 months (730 days), catch-up growth boundary is reached and corrected age ceases to be used.
  if (chrono.days > 730) {
    return {
      applies: false,
      chronologicalAgeDays: chrono.days,
      deficitDays: 0,
      correctedAgeDays: chrono.days,
      correctedAgeMonths: chrono.months,
      isPretermNeonate: false,
      reason: 'Child is older than 24 months (730 days) - standard growth catch-up boundary reached',
    };
  }

  const birthGATotalDays = gestationalAgeWeeks * 7 + (gestationalAgeDays || 0);
  const fullTermDays = 40 * 7; // 280 days
  const deficitDays = Math.max(0, fullTermDays - birthGATotalDays);
  const correctedAgeDays = chrono.days - deficitDays;
  const correctedAgeMonths = Math.round((correctedAgeDays / 30.4375) * 100) / 100;

  if (correctedAgeDays < 0) {
    // Measurement taken before reaching 40 weeks post-menstrual age
    const totalDaysSinceLMP = birthGATotalDays + chrono.days;
    const postMenstrualAgeWeeks = Math.floor(totalDaysSinceLMP / 7);
    const postMenstrualAgeDays = totalDaysSinceLMP % 7;

    return {
      applies: true,
      chronologicalAgeDays: chrono.days,
      deficitDays,
      correctedAgeDays,
      correctedAgeMonths,
      isPretermNeonate: true,
      postMenstrualAgeWeeks,
      postMenstrualAgeDays,
      reason: `Preterm neonate prior to 40 weeks post-menstrual age (${postMenstrualAgeWeeks}w+${postMenstrualAgeDays}d PMA)`,
    };
  }

  return {
    applies: true,
    chronologicalAgeDays: chrono.days,
    deficitDays,
    correctedAgeDays,
    correctedAgeMonths,
    isPretermNeonate: false,
    reason: `Preterm birth (${gestationalAgeWeeks}w) corrected for ${deficitDays} days deficit`,
  };
}

/**
 * Determines standard WHO stature measurement method based on chronological age.
 * - Under 24 months (< 730 days): RECUMBENT_LENGTH
 * - 24 months and older (>= 730 days): STANDING_HEIGHT
 */
export function determineStatureMethod(chronologicalAgeDays: number): StatureMethod {
  return chronologicalAgeDays < 730 ? 'RECUMBENT_LENGTH' : 'STANDING_HEIGHT';
}

/**
 * Calculates Body Mass Index: weight (kg) / (stature (m))^2
 */
export function calculateBmi(weightKg?: number, statureCm?: number): number | null {
  if (!weightKg || !statureCm || weightKg <= 0 || statureCm <= 0) return null;
  const statureM = statureCm / 100;
  const bmi = weightKg / (statureM * statureM);
  return Math.round(bmi * 100) / 100;
}

/**
 * High-precision approximation of the error function erf(x).
 * Abramowitz & Stegun formula 7.1.26 (max error < 1.5e-7).
 */
function erf(x: number): number {
  const sign = x >= 0 ? 1 : -1;
  const absX = Math.abs(x);

  const p = 0.3275911;
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;

  const t = 1.0 / (1.0 + p * absX);
  const poly = ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t;
  const y = 1.0 - poly * Math.exp(-absX * absX);

  return sign * y;
}

/**
 * Standard Normal Cumulative Distribution Function (Phi(z))
 * Converts Z-score to percentile (0.01 to 99.99).
 */
export function zScoreToPercentile(z: number): number {
  const cdf = 0.5 * (1.0 + erf(z / Math.SQRT2));
  const rawPct = cdf * 100;
  // Clamp to clinically meaningful percentile precision
  const clamped = Math.max(0.01, Math.min(99.99, rawPct));
  return Math.round(clamped * 100) / 100;
}

/**
 * Calculates WHO growth Z-Score and Percentile using Box-Cox power exponential LMS method.
 * Implements WHO restricted SD adjustments for extreme weight and BMI (Z > 3 or Z < -3).
 */
export function calculateGrowthZScoreAndPercentile(
  params: GrowthCalculationParams,
): GrowthScoreResult {
  const { metric, gender, ageInMonths, measurementValue } = params;

  if (measurementValue <= 0 || !Number.isFinite(measurementValue)) {
    return {
      status: 'INVALID_MEASUREMENT',
      zScore: null,
      percentile: null,
      referenceStandard: 'WHO_2006',
    };
  }

  if (ageInMonths < 0 || ageInMonths > 60) {
    return {
      status: 'OUT_OF_REFERENCE_RANGE',
      zScore: null,
      percentile: null,
      referenceStandard: 'WHO_2006',
    };
  }

  const lms = getInterpolatedLms(metric, gender, ageInMonths);
  if (!lms) {
    return {
      status: 'CALCULATION_UNAVAILABLE',
      zScore: null,
      percentile: null,
      referenceStandard: 'WHO_2006',
    };
  }

  const { l, m, s } = lms;
  const y = measurementValue;

  // Standard Box-Cox Z-score
  let z: number;
  if (Math.abs(l) > 0.0001) {
    z = (Math.pow(y / m, l) - 1.0) / (l * s);
  } else {
    z = Math.log(y / m) / s;
  }

  // WHO restricted SD adjustment for Weight and BMI
  if (metric === 'WEIGHT_FOR_AGE' || metric === 'BMI_FOR_AGE') {
    if (z > 3) {
      const sd3pos = m * Math.pow(1.0 + l * s * 3.0, 1.0 / l);
      const sd2pos = m * Math.pow(1.0 + l * s * 2.0, 1.0 / l);
      const sd23pos = sd3pos - sd2pos;
      if (sd23pos > 0) {
        z = 3.0 + (y - sd3pos) / sd23pos;
      }
    } else if (z < -3) {
      const sd3neg = m * Math.pow(1.0 - l * s * 3.0, 1.0 / l);
      const sd2neg = m * Math.pow(1.0 - l * s * 2.0, 1.0 / l);
      const sd23neg = sd2neg - sd3neg;
      if (sd23neg > 0) {
        z = -3.0 + (y - sd3neg) / sd23neg;
      }
    }
  }

  const roundedZ = Math.round(z * 100) / 100;
  const percentile = zScoreToPercentile(roundedZ);

  return {
    status: 'CALCULATED',
    zScore: roundedZ,
    percentile,
    referenceStandard: 'WHO_2006',
    l: Math.round(l * 10000) / 10000,
    m: Math.round(m * 1000) / 1000,
    s: Math.round(s * 10000) / 10000,
  };
}

/**
 * Complete evaluation of a pediatric growth measurement record.
 * Integrates chronological age, corrected age, stature method, and all 4 WHO growth parameters.
 */
export function evaluatePediatricGrowth(
  input: PediatricGrowthEvaluationInput,
): PediatricGrowthEvaluationResult {
  const chrono = calculateChronologicalAge(input.birthDate, input.measurementDate);
  const corrected = calculateCorrectedAge(
    input.birthDate,
    input.measurementDate,
    input.gestationalAgeWeeks,
    input.gestationalAgeDays,
  );

  const recommendedStatureMethod = determineStatureMethod(chrono.days);

  // Age in months used for WHO growth standards
  const shouldUseCorrected = Boolean(input.useCorrectedAgeForZScores && corrected.applies);
  const effectiveAgeInMonths = shouldUseCorrected ? corrected.correctedAgeMonths : chrono.months;

  // Stature measurement adjustment (if measured standing < 2y or recumbent >= 2y)
  let adjustedStature = input.statureCm;
  if (input.statureCm && input.statureMethod) {
    if (chrono.days < 730 && input.statureMethod === 'STANDING_HEIGHT') {
      // Standing height is ~0.7cm less than recumbent length
      adjustedStature = input.statureCm + 0.7;
    } else if (chrono.days >= 730 && input.statureMethod === 'RECUMBENT_LENGTH') {
      adjustedStature = input.statureCm - 0.7;
    }
  }

  const bmi = calculateBmi(input.weightKg, adjustedStature ?? input.statureCm);

  // Growth scores
  const weightForAge = input.weightKg
    ? calculateGrowthZScoreAndPercentile({
        metric: 'WEIGHT_FOR_AGE',
        gender: input.gender,
        ageInMonths: effectiveAgeInMonths,
        measurementValue: input.weightKg,
      })
    : { status: 'CALCULATION_UNAVAILABLE' as const, zScore: null, percentile: null, referenceStandard: 'WHO_2006' };

  const lengthForAge = adjustedStature
    ? calculateGrowthZScoreAndPercentile({
        metric: 'LENGTH_HEIGHT_FOR_AGE',
        gender: input.gender,
        ageInMonths: effectiveAgeInMonths,
        measurementValue: adjustedStature,
      })
    : { status: 'CALCULATION_UNAVAILABLE' as const, zScore: null, percentile: null, referenceStandard: 'WHO_2006' };

  const headCircumferenceForAge = input.headCircumferenceCm
    ? calculateGrowthZScoreAndPercentile({
        metric: 'HEAD_CIRCUMFERENCE_FOR_AGE',
        gender: input.gender,
        ageInMonths: effectiveAgeInMonths,
        measurementValue: input.headCircumferenceCm,
      })
    : { status: 'CALCULATION_UNAVAILABLE' as const, zScore: null, percentile: null, referenceStandard: 'WHO_2006' };

  const bmiForAge = bmi
    ? calculateGrowthZScoreAndPercentile({
        metric: 'BMI_FOR_AGE',
        gender: input.gender,
        ageInMonths: effectiveAgeInMonths,
        measurementValue: bmi,
      })
    : { status: 'CALCULATION_UNAVAILABLE' as const, zScore: null, percentile: null, referenceStandard: 'WHO_2006' };

  // Clinical alerts based on WHO cutoffs
  const clinicalAlerts: string[] = [];

  if (weightForAge.zScore !== null) {
    if (weightForAge.zScore < -3) {
      clinicalAlerts.push('SEVERE_UNDERWEIGHT: Z-Score < -3 (Critical nutritional evaluation indicated)');
    } else if (weightForAge.zScore < -2) {
      clinicalAlerts.push('UNDERWEIGHT: Z-Score < -2 (Growth faltering / nutritional monitoring recommended)');
    } else if (weightForAge.zScore > 3) {
      clinicalAlerts.push('HIGH_WEIGHT_FOR_AGE: Z-Score > +3');
    }
  }

  if (lengthForAge.zScore !== null) {
    if (lengthForAge.zScore < -3) {
      clinicalAlerts.push('SEVERE_STUNTING: Length/Height-for-age Z-Score < -3');
    } else if (lengthForAge.zScore < -2) {
      clinicalAlerts.push('STUNTING: Length/Height-for-age Z-Score < -2 (Chronic growth restriction)');
    }
  }

  if (headCircumferenceForAge.zScore !== null) {
    if (headCircumferenceForAge.zScore < -2) {
      clinicalAlerts.push('MICROCEPHALY_WARNING: Head circumference Z-Score < -2 (Neurological evaluation recommended)');
    } else if (headCircumferenceForAge.zScore > 2) {
      clinicalAlerts.push('MACROCEPHALY_WARNING: Head circumference Z-Score > +2');
    }
  }

  if (bmiForAge.zScore !== null) {
    if (bmiForAge.zScore > 3) {
      clinicalAlerts.push('OBESITY: BMI-for-age Z-Score > +3 (WHO 2006 standard)');
    } else if (bmiForAge.zScore > 2) {
      clinicalAlerts.push('OVERWEIGHT: BMI-for-age Z-Score > +2');
    } else if (bmiForAge.zScore < -2) {
      clinicalAlerts.push('WASTING: BMI-for-age Z-Score < -2 (Acute malnutrition / wasting)');
    }
  }

  if (corrected.isPretermNeonate) {
    clinicalAlerts.push(
      `PRETERM_NEONATE: Post-menstrual age ${corrected.postMenstrualAgeWeeks}w+${corrected.postMenstrualAgeDays}d - specialized neonatal curve recommended`,
    );
  }

  return {
    chronologicalAge: chrono,
    correctedAge: corrected,
    effectiveAgeInMonths,
    recommendedStatureMethod,
    bmi,
    weightForAge,
    lengthForAge,
    headCircumferenceForAge,
    bmiForAge,
    clinicalAlerts,
  };
}
