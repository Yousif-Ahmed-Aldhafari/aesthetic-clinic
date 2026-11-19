/**
 * Lamssa — Ophthalmology & ENT Clinical Analytics & Decision Support
 * 
 * Complies with:
 * - WHO 2021 Grades of Hearing Impairment
 * - ISO 8253-1 Pure-Tone Air and Bone Conduction Audiometry
 * - AAO Preferred Practice Pattern for Glaucoma & Refractive Assessment
 * 
 * Advisory Clinical Decision Support: Calculations and classifications are informational
 * aids and do not substitute for authorized medical evaluation, diagnostic synthesis,
 * or licensed clinician judgment.
 */

export const AUDIOMETRY_FREQUENCIES_HZ = [125, 250, 500, 1000, 2000, 4000, 8000] as const;
export const BONE_CONDUCTION_FREQUENCIES_HZ = [250, 500, 1000, 2000, 4000] as const;

export interface HearingLossClassification {
  ptaDb: number;
  grade: 'NORMAL' | 'MILD' | 'MODERATE' | 'MODERATELY_SEVERE' | 'SEVERE' | 'PROFOUND' | 'COMPLETE';
  type: 'NORMAL' | 'CONDUCTIVE' | 'SENSORINEURAL' | 'MIXED' | 'INDETERMINATE';
  descriptionAr: string;
  descriptionEn: string;
  typeDescriptionAr: string;
  typeDescriptionEn: string;
  airBoneGapMaxDb: number;
}

export interface IopEvaluationResult {
  odMmHg: number | null;
  osMmHg: number | null;
  isElevatedOd: boolean;
  isElevatedOs: boolean;
  isHypotonyOd: boolean;
  isHypotonyOs: boolean;
  isAsymmetric: boolean;
  differenceMmHg: number | null;
  advisoryAlertsAr: string[];
  advisoryAlertsEn: string[];
  clinicalDisclaimerAr: string;
  clinicalDisclaimerEn: string;
}

export interface CdrEvaluationResult {
  odRatio: number | null;
  osRatio: number | null;
  isSuspiciousOd: boolean;
  isSuspiciousOs: boolean;
  isAsymmetric: boolean;
  difference: number | null;
  advisoryAlertsAr: string[];
  advisoryAlertsEn: string[];
}

/**
 * Calculates Pure-Tone Average (PTA-4 at 500, 1000, 2000, 4000 Hz) per WHO standard.
 * If 7-frequency array [125, 250, 500, 1000, 2000, 4000, 8000] is provided:
 * index 2 = 500 Hz, index 3 = 1000 Hz, index 4 = 2000 Hz, index 5 = 4000 Hz.
 */
export function calculatePta4(thresholds: number[]): number | null {
  if (!thresholds || thresholds.length < 6) return null;

  // If 7 frequencies provided [125, 250, 500, 1000, 2000, 4000, 8000]
  let relevant: number[];
  if (thresholds.length === 7) {
    relevant = [thresholds[2], thresholds[3], thresholds[4], thresholds[5]];
  } else if (thresholds.length === 6) {
    // [250, 500, 1000, 2000, 4000, 8000] -> indices 1, 2, 3, 4
    relevant = [thresholds[1], thresholds[2], thresholds[3], thresholds[4]];
  } else {
    relevant = thresholds.slice(0, 4);
  }

  const valid = relevant.filter((t) => typeof t === 'number' && !Number.isNaN(t) && t >= -10 && t <= 120);
  if (valid.length === 0) return null;

  const sum = valid.reduce((acc, curr) => acc + curr, 0);
  return Math.round((sum / valid.length) * 10) / 10;
}

/**
 * Classifies hearing loss grade according to WHO 2021 Grades of Hearing Impairment.
 */
export function classifyHearingImpairment(
  airThresholds: number[],
  boneThresholds?: number[],
): HearingLossClassification | null {
  const pta = calculatePta4(airThresholds);
  if (pta === null) return null;

  let grade: HearingLossClassification['grade'];
  let descriptionAr: string;
  let descriptionEn: string;

  if (pta <= 20) {
    grade = 'NORMAL';
    descriptionAr = 'سمع طبيعي (ضمن الحدود الطبيعية)';
    descriptionEn = 'Normal hearing (≤ 20 dB HL)';
  } else if (pta <= 34) {
    grade = 'MILD';
    descriptionAr = 'ضعف سمع خفيف (صعوبة في تمييز الأصوات الخافتة والهمس)';
    descriptionEn = 'Mild hearing loss (21–34 dB HL)';
  } else if (pta <= 49) {
    grade = 'MODERATE';
    descriptionAr = 'ضعف سمع متوسط (صعوبة في متابعة المحادثة بدون تكرار أو مكبر صوت)';
    descriptionEn = 'Moderate hearing loss (35–49 dB HL)';
  } else if (pta <= 64) {
    grade = 'MODERATELY_SEVERE';
    descriptionAr = 'ضعف سمع شديد الاعتدال (صعوبة كبيرة في المحادثات الجماعية بدون معينات سمعية)';
    descriptionEn = 'Moderately severe hearing loss (50–64 dB HL)';
  } else if (pta <= 79) {
    grade = 'SEVERE';
    descriptionAr = 'ضعف سمع شديد (لا يسمع معظم الكلمات المنطوقة بصوت مرتفع)';
    descriptionEn = 'Severe hearing loss (65–79 dB HL)';
  } else if (pta <= 94) {
    grade = 'PROFOUND';
    descriptionAr = 'ضعف سمع عميق (صعوبة في تمييز الأصوات الشديدة جداً بدون أجهزة متقدمة)';
    descriptionEn = 'Profound hearing loss (80–94 dB HL)';
  } else {
    grade = 'COMPLETE';
    descriptionAr = 'فقدان سمع كامل / صمم (≥ 95 dB HL)';
    descriptionEn = 'Complete hearing loss (≥ 95 dB HL)';
  }

  // Calculate Air-Bone Gap if bone thresholds provided
  let airBoneGapMaxDb = 0;
  let type: HearingLossClassification['type'] = 'NORMAL';
  let typeDescriptionAr = 'طبيعي';
  let typeDescriptionEn = 'Normal';

  if (boneThresholds && boneThresholds.length >= 4) {
    // Compare at matching frequencies (500, 1000, 2000, 4000 Hz)
    const airMatching = airThresholds.length === 7 ? [airThresholds[2], airThresholds[3], airThresholds[4], airThresholds[5]] : airThresholds.slice(0, 4);
    const boneMatching = boneThresholds.length >= 5 ? boneThresholds.slice(1, 5) : boneThresholds.slice(0, 4);

    const gaps: number[] = [];
    for (let i = 0; i < Math.min(airMatching.length, boneMatching.length); i++) {
      if (typeof airMatching[i] === 'number' && typeof boneMatching[i] === 'number') {
        const gap = Math.max(0, airMatching[i] - boneMatching[i]);
        gaps.push(gap);
      }
    }

    if (gaps.length > 0) {
      airBoneGapMaxDb = Math.max(...gaps);
      const bonePta = boneMatching.reduce((acc, v) => acc + v, 0) / boneMatching.length;

      if (grade === 'NORMAL') {
        type = 'NORMAL';
        typeDescriptionAr = 'طبيعي';
        typeDescriptionEn = 'Normal';
      } else if (airBoneGapMaxDb >= 15 && bonePta <= 25) {
        type = 'CONDUCTIVE';
        typeDescriptionAr = 'ضعف سمع توصيلي (فجوة هوائية-عظمية ≥ 15 dB)';
        typeDescriptionEn = 'Conductive hearing loss (Air-Bone Gap ≥ 15 dB with normal bone thresholds)';
      } else if (airBoneGapMaxDb < 15 && bonePta > 25) {
        type = 'SENSORINEURAL';
        typeDescriptionAr = 'ضعف سمع حسي عصبي (تطابق التوصيل الهوائي والعظمي)';
        typeDescriptionEn = 'Sensorineural hearing loss (impaired bone thresholds with ABG < 15 dB)';
      } else if (airBoneGapMaxDb >= 15 && bonePta > 25) {
        type = 'MIXED';
        typeDescriptionAr = 'ضعف سمع مختلط (مكون توصيلي وحسي عصبي مشترك)';
        typeDescriptionEn = 'Mixed hearing loss (combined conductive and sensorineural components)';
      } else {
        type = 'INDETERMINATE';
        typeDescriptionAr = 'غير محدد سريرياً (يتطلب فحوصات إضافية)';
        typeDescriptionEn = 'Indeterminate (further clinical evaluation required)';
      }
    }
  } else if (grade !== 'NORMAL') {
    type = 'SENSORINEURAL'; // Default PTA interpretation pending bone conduction
    typeDescriptionAr = 'حسي عصبي محتمل (في انتظار اختبار التوصيل العظمي)';
    typeDescriptionEn = 'Presumed sensorineural pending bone conduction testing';
  }

  return {
    ptaDb: pta,
    grade,
    type,
    descriptionAr,
    descriptionEn,
    typeDescriptionAr,
    typeDescriptionEn,
    airBoneGapMaxDb,
  };
}

/**
 * Evaluates Intraocular Pressure (IOP) with clinical guardrails and asymmetry detection.
 */
export function evaluateIop(od: number | null, os: number | null): IopEvaluationResult {
  const isElevatedOd = od !== null && od > 21.0;
  const isElevatedOs = os !== null && os > 21.0;
  const isHypotonyOd = od !== null && od < 6.0;
  const isHypotonyOs = os !== null && os < 6.0;

  let isAsymmetric = false;
  let differenceMmHg: number | null = null;
  if (od !== null && os !== null) {
    differenceMmHg = Math.round(Math.abs(od - os) * 10) / 10;
    isAsymmetric = differenceMmHg >= 4.0;
  }

  const advisoryAlertsAr: string[] = [];
  const advisoryAlertsEn: string[] = [];

  if (isElevatedOd) {
    advisoryAlertsAr.push(`ارتفاع ضغط العين اليمنى (OD: ${od} mmHg > 21.0 mmHg) — اشتباه فرط ضغط العين أو جلوكوما`);
    advisoryAlertsEn.push(`Elevated Right Eye IOP (OD: ${od} mmHg > 21.0 mmHg) — Ocular hypertension / Glaucoma risk`);
  }
  if (isElevatedOs) {
    advisoryAlertsAr.push(`ارتفاع ضغط العين اليسرى (OS: ${os} mmHg > 21.0 mmHg) — اشتباه فرط ضغط العين أو جلوكوما`);
    advisoryAlertsEn.push(`Elevated Left Eye IOP (OS: ${os} mmHg > 21.0 mmHg) — Ocular hypertension / Glaucoma risk`);
  }
  if (isHypotonyOd) {
    advisoryAlertsAr.push(`انخفاض شديد في ضغط العين اليمنى (OD: ${od} mmHg < 6.0 mmHg) — اشتباه هبوط ضغط العين (Hypotony)`);
    advisoryAlertsEn.push(`Ocular hypotony in Right Eye (OD: ${od} mmHg < 6.0 mmHg)`);
  }
  if (isHypotonyOs) {
    advisoryAlertsAr.push(`انخفاض شديد في ضغط العين اليسرى (OS: ${os} mmHg < 6.0 mmHg) — اشتباه هبوط ضغط العين (Hypotony)`);
    advisoryAlertsEn.push(`Ocular hypotony in Left Eye (OS: ${os} mmHg < 6.0 mmHg)`);
  }
  if (isAsymmetric) {
    advisoryAlertsAr.push(`تباين ملحوظ بين العينين (فارق ${differenceMmHg} mmHg ≥ 4.0 mmHg) — يستدعي فحص قاع العين والمجال البصري`);
    advisoryAlertsEn.push(`Significant inter-eye IOP asymmetry (Δ ${differenceMmHg} mmHg ≥ 4.0 mmHg) — requires optic nerve and visual field review`);
  }

  return {
    odMmHg: od,
    osMmHg: os,
    isElevatedOd,
    isElevatedOs,
    isHypotonyOd,
    isHypotonyOs,
    isAsymmetric,
    differenceMmHg,
    advisoryAlertsAr,
    advisoryAlertsEn,
    clinicalDisclaimerAr: 'تنبيه سريري استشاري فقط: قياس ضغط العين مؤشر مساند ويجب تفسيره بالاقتران مع سماكة القرنية المركزية (CCT) وفحص العصب البصري والمجال البصري. لا يتم وصف أدوية خفض الضغط تلقائياً.',
    clinicalDisclaimerEn: 'Advisory Clinical Decision Support: Intraocular pressure must be correlated with central corneal thickness (CCT), optic nerve head examination, and visual field testing. Antiglaucoma medications are never automatically prescribed.',
  };
}

/**
 * Evaluates Cup-to-Disc Ratio (CDR) with asymmetry detection.
 */
export function evaluateCupToDiscRatio(odRatio: number | null, osRatio: number | null): CdrEvaluationResult {
  const isSuspiciousOd = odRatio !== null && odRatio >= 0.60;
  const isSuspiciousOs = osRatio !== null && osRatio >= 0.60;

  let isAsymmetric = false;
  let difference: number | null = null;
  if (odRatio !== null && osRatio !== null) {
    difference = Math.round(Math.abs(odRatio - osRatio) * 100) / 100;
    isAsymmetric = difference >= 0.20;
  }

  const advisoryAlertsAr: string[] = [];
  const advisoryAlertsEn: string[] = [];

  if (isSuspiciousOd) {
    advisoryAlertsAr.push(`تضخم تقعر القرص البصري للعين اليمنى (OD CDR: ${odRatio} ≥ 0.60) — اشتباه تقعر مَرَضي`);
    advisoryAlertsEn.push(`Right Eye optic cup enlargement (OD CDR: ${odRatio} ≥ 0.60) — suspicious for glaucomatous cupping`);
  }
  if (isSuspiciousOs) {
    advisoryAlertsAr.push(`تضخم تقعر القرص البصري للعين اليسرى (OS CDR: ${osRatio} ≥ 0.60) — اشتباه تقعر مَرَضي`);
    advisoryAlertsEn.push(`Left Eye optic cup enlargement (OS CDR: ${osRatio} ≥ 0.60) — suspicious for glaucomatous cupping`);
  }
  if (isAsymmetric) {
    advisoryAlertsAr.push(`تباين سريري في نسبة التقعر بين العينين (فارق ${difference} ≥ 0.20) — مؤشر محتمل للاعتلال العصبي غير المتناظر`);
    advisoryAlertsEn.push(`Significant CDR asymmetry between eyes (Δ ${difference} ≥ 0.20) — indicator of possible asymmetric optic neuropathy`);
  }

  return {
    odRatio,
    osRatio,
    isSuspiciousOd,
    isSuspiciousOs,
    isAsymmetric,
    difference,
    advisoryAlertsAr,
    advisoryAlertsEn,
  };
}

/**
 * Calculates Spherical Equivalent (SE = Sphere + Cylinder / 2).
 */
export function calculateSphericalEquivalent(sphere: number | null, cylinder: number | null): number | null {
  if (sphere === null) return null;
  const cyl = cylinder ?? 0;
  return Math.round((sphere + cyl / 2) * 100) / 100;
}
