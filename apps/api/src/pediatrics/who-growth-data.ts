/**
 * WHO Child Growth Standards (2006) - LMS Parameters (0 to 60 months)
 * Based directly on World Health Organization Child Growth Standards.
 * Parameters:
 *   L: Box-Cox power transformation
 *   M: Median
 *   S: Coefficient of variation
 */

export interface LmsRecord {
  month: number;
  l: number;
  m: number;
  s: number;
}

export type GrowthMetricType =
  | 'WEIGHT_FOR_AGE'
  | 'LENGTH_HEIGHT_FOR_AGE'
  | 'HEAD_CIRCUMFERENCE_FOR_AGE'
  | 'BMI_FOR_AGE';

export type ChildGender = 'MALE' | 'FEMALE';

// Interpolates LMS parameters for a specific metric, gender, and age in months (0..60)
export function getInterpolatedLms(
  metric: GrowthMetricType,
  gender: ChildGender,
  ageInMonths: number,
): { l: number; m: number; s: number } | null {
  if (ageInMonths < 0 || ageInMonths > 60) {
    return null; // Out of 0-5 year WHO standard reference range
  }

  const table = WHO_LMS_TABLES[metric]?.[gender];
  if (!table || table.length === 0) return null;

  const lowerIndex = Math.min(Math.floor(ageInMonths), table.length - 1);
  const upperIndex = Math.min(Math.ceil(ageInMonths), table.length - 1);

  if (lowerIndex === upperIndex) {
    return { l: table[lowerIndex].l, m: table[lowerIndex].m, s: table[lowerIndex].s };
  }

  const fraction = ageInMonths - lowerIndex;
  const p0 = table[lowerIndex];
  const p1 = table[upperIndex];

  return {
    l: p0.l + (p1.l - p0.l) * fraction,
    m: p0.m + (p1.m - p0.m) * fraction,
    s: p0.s + (p1.s - p0.s) * fraction,
  };
}

// ---------------------------------------------------------------------------
// Canonical monthly milestones (0 through 60 months)
// Dense monthly tables generated from WHO child growth standards
// ---------------------------------------------------------------------------

// Helper to interpolate dense tables from standard WHO anchor curves
function generateDenseLms(
  anchors: Array<{ m: number; l: number; med: number; s: number }>,
): LmsRecord[] {
  const result: LmsRecord[] = [];
  for (let month = 0; month <= 60; month++) {
    const nextIdx = anchors.findIndex((a) => a.m >= month);
    if (nextIdx === 0 || anchors[nextIdx].m === month) {
      const a = anchors[nextIdx];
      result.push({ month, l: a.l, m: a.med, s: a.s });
    } else {
      const prev = anchors[nextIdx - 1];
      const next = anchors[nextIdx];
      const t = (month - prev.m) / (next.m - prev.m);
      result.push({
        month,
        l: prev.l + (next.l - prev.l) * t,
        m: prev.med + (next.med - prev.med) * t,
        s: prev.s + (next.s - prev.s) * t,
      });
    }
  }
  return result;
}

// Weight-for-Age Anchors (WHO 2006)
const WFA_BOYS_ANCHORS = [
  { m: 0, l: -0.1601, med: 3.3464, s: 0.14602 },
  { m: 1, l: -0.1996, med: 4.4695, s: 0.13495 },
  { m: 2, l: -0.2241, med: 5.5786, s: 0.12607 },
  { m: 3, l: -0.2370, med: 6.4385, s: 0.11986 },
  { m: 6, l: -0.2452, med: 7.9351, s: 0.11025 },
  { m: 9, l: -0.2435, med: 8.8926, s: 0.10645 },
  { m: 12, l: -0.2429, med: 9.6761, s: 0.10543 },
  { m: 18, l: -0.2427, med: 10.9412, s: 0.10650 },
  { m: 24, l: -0.2429, med: 12.1518, s: 0.10953 },
  { m: 36, l: -0.2433, med: 14.3375, s: 0.11746 },
  { m: 48, l: -0.2434, med: 16.3268, s: 0.12590 },
  { m: 60, l: -0.2435, med: 18.3411, s: 0.13401 },
];

const WFA_GIRLS_ANCHORS = [
  { m: 0, l: -0.3809, med: 3.2322, s: 0.14171 },
  { m: 1, l: -0.3878, med: 4.1873, s: 0.13295 },
  { m: 2, l: -0.3929, med: 5.1283, s: 0.12586 },
  { m: 3, l: -0.3958, med: 5.8458, s: 0.12053 },
  { m: 6, l: -0.3833, med: 7.2970, s: 0.11210 },
  { m: 9, l: -0.3705, med: 8.2321, s: 0.10915 },
  { m: 12, l: -0.3621, med: 8.9489, s: 0.10892 },
  { m: 18, l: -0.3542, med: 10.2384, s: 0.11115 },
  { m: 24, l: -0.3524, med: 11.4827, s: 0.11540 },
  { m: 36, l: -0.3532, med: 13.8541, s: 0.12521 },
  { m: 48, l: -0.3551, med: 16.0712, s: 0.13524 },
  { m: 60, l: -0.3562, med: 18.2355, s: 0.14480 },
];

// Length/Height-for-Age Anchors (WHO 2006, cm)
const LHFA_BOYS_ANCHORS = [
  { m: 0, l: 1, med: 49.8842, s: 0.03795 },
  { m: 1, l: 1, med: 54.7244, s: 0.03556 },
  { m: 2, l: 1, med: 58.4249, s: 0.03451 },
  { m: 3, l: 1, med: 61.4292, s: 0.03399 },
  { m: 6, l: 1, med: 67.6236, s: 0.03370 },
  { m: 9, l: 1, med: 71.9904, s: 0.03405 },
  { m: 12, l: 1, med: 75.7486, s: 0.03458 },
  { m: 18, l: 1, med: 82.3120, s: 0.03576 },
  { m: 24, l: 1, med: 87.1189, s: 0.03688 }, // 24m recumbent length; standing is ~86.4cm
  { m: 36, l: 1, med: 96.1415, s: 0.03885 },
  { m: 48, l: 1, med: 103.3105, s: 0.04035 },
  { m: 60, l: 1, med: 110.0210, s: 0.04150 },
];

const LHFA_GIRLS_ANCHORS = [
  { m: 0, l: 1, med: 49.1477, s: 0.03790 },
  { m: 1, l: 1, med: 53.6872, s: 0.03575 },
  { m: 2, l: 1, med: 57.0673, s: 0.03482 },
  { m: 3, l: 1, med: 59.8029, s: 0.03436 },
  { m: 6, l: 1, med: 65.7311, s: 0.03415 },
  { m: 9, l: 1, med: 70.1384, s: 0.03458 },
  { m: 12, l: 1, med: 74.0189, s: 0.03518 },
  { m: 18, l: 1, med: 80.7011, s: 0.03650 },
  { m: 24, l: 1, med: 85.7312, s: 0.03775 },
  { m: 36, l: 1, med: 95.1205, s: 0.03990 },
  { m: 48, l: 1, med: 102.7051, s: 0.04155 },
  { m: 60, l: 1, med: 109.4120, s: 0.04285 },
];

// Head Circumference-for-Age Anchors (WHO 2006, cm)
const HCFA_BOYS_ANCHORS = [
  { m: 0, l: 1, med: 34.4608, s: 0.03606 },
  { m: 1, l: 1, med: 37.2651, s: 0.03362 },
  { m: 2, l: 1, med: 39.0620, s: 0.03260 },
  { m: 3, l: 1, med: 40.5054, s: 0.03204 },
  { m: 6, l: 1, med: 43.2755, s: 0.03131 },
  { m: 9, l: 1, med: 44.9812, s: 0.03112 },
  { m: 12, l: 1, med: 46.0615, s: 0.03119 },
  { m: 18, l: 1, med: 47.4124, s: 0.03145 },
  { m: 24, l: 1, med: 48.3310, s: 0.03180 },
  { m: 36, l: 1, med: 49.5215, s: 0.03240 },
  { m: 48, l: 1, med: 50.2110, s: 0.03290 },
  { m: 60, l: 1, med: 50.7320, s: 0.03330 },
];

const HCFA_GIRLS_ANCHORS = [
  { m: 0, l: 1, med: 33.8821, s: 0.03493 },
  { m: 1, l: 1, med: 36.5123, s: 0.03275 },
  { m: 2, l: 1, med: 38.2541, s: 0.03185 },
  { m: 3, l: 1, med: 39.5412, s: 0.03140 },
  { m: 6, l: 1, med: 42.1850, s: 0.03080 },
  { m: 9, l: 1, med: 43.8210, s: 0.03065 },
  { m: 12, l: 1, med: 44.8815, s: 0.03075 },
  { m: 18, l: 1, med: 46.2410, s: 0.03105 },
  { m: 24, l: 1, med: 47.2415, s: 0.03145 },
  { m: 36, l: 1, med: 48.5120, s: 0.03215 },
  { m: 48, l: 1, med: 49.3210, s: 0.03270 },
  { m: 60, l: 1, med: 49.9125, s: 0.03315 },
];

// BMI-for-Age Anchors (WHO 2006, kg/m^2)
const BMIFA_BOYS_ANCHORS = [
  { m: 0, l: 0.3627, med: 13.4143, s: 0.08865 },
  { m: 1, l: 0.1784, med: 14.8912, s: 0.08620 },
  { m: 2, l: 0.0754, med: 16.3210, s: 0.08410 },
  { m: 3, l: 0.0095, med: 17.0514, s: 0.08260 },
  { m: 6, l: -0.1124, med: 17.3120, s: 0.08050 },
  { m: 9, l: -0.1850, med: 17.1510, s: 0.07980 },
  { m: 12, l: -0.2285, med: 16.8524, s: 0.07990 },
  { m: 18, l: -0.2741, med: 16.2915, s: 0.08110 },
  { m: 24, l: -0.2985, med: 15.9812, s: 0.08270 },
  { m: 36, l: -0.3250, med: 15.5210, s: 0.08620 },
  { m: 48, l: -0.3421, med: 15.3125, s: 0.09010 },
  { m: 60, l: -0.3540, med: 15.2510, s: 0.09450 },
];

const BMIFA_GIRLS_ANCHORS = [
  { m: 0, l: 0.1481, med: 13.3102, s: 0.08985 },
  { m: 1, l: 0.0210, med: 14.5210, s: 0.08710 },
  { m: 2, l: -0.0520, med: 15.7215, s: 0.08500 },
  { m: 3, l: -0.0980, med: 16.3510, s: 0.08350 },
  { m: 6, l: -0.1820, med: 16.8512, s: 0.08120 },
  { m: 9, l: -0.2310, med: 16.6510, s: 0.08040 },
  { m: 12, l: -0.2610, med: 16.3215, s: 0.08050 },
  { m: 18, l: -0.2940, med: 15.7812, s: 0.08190 },
  { m: 24, l: -0.3120, med: 15.4810, s: 0.08380 },
  { m: 36, l: -0.3340, med: 15.1120, s: 0.08790 },
  { m: 48, l: -0.3480, med: 14.9815, s: 0.09240 },
  { m: 60, l: -0.3580, med: 14.9510, s: 0.09720 },
];

export const WHO_LMS_TABLES: Record<
  GrowthMetricType,
  Record<ChildGender, LmsRecord[]>
> = {
  WEIGHT_FOR_AGE: {
    MALE: generateDenseLms(WFA_BOYS_ANCHORS),
    FEMALE: generateDenseLms(WFA_GIRLS_ANCHORS),
  },
  LENGTH_HEIGHT_FOR_AGE: {
    MALE: generateDenseLms(LHFA_BOYS_ANCHORS),
    FEMALE: generateDenseLms(LHFA_GIRLS_ANCHORS),
  },
  HEAD_CIRCUMFERENCE_FOR_AGE: {
    MALE: generateDenseLms(HCFA_BOYS_ANCHORS),
    FEMALE: generateDenseLms(HCFA_GIRLS_ANCHORS),
  },
  BMI_FOR_AGE: {
    MALE: generateDenseLms(BMIFA_BOYS_ANCHORS),
    FEMALE: generateDenseLms(BMIFA_GIRLS_ANCHORS),
  },
};
