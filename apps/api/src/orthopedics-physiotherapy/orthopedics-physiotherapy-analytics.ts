/**
 * Lamssa — Orthopedics & Physiotherapy Clinical Analytics & Decision Support
 * 
 * Standards & Validated Instruments:
 * - AAOS (American Academy of Orthopaedic Surgeons) Normal Joint Range of Motion Reference Values
 * - Medical Research Council (MRC) 0–5 Motor Strength Scale
 * - Visual Analogue Scale (VAS) 0–10 Pain Intensity Assessment
 * - Oswestry Disability Index (ODI Version 2.0) for Lumbar Spine Impairment
 * - QuickDASH (Disabilities of the Arm, Shoulder and Hand - Institute for Work & Health)
 * - Lysholm Knee Scoring Scale for Cruciate/Meniscal Functional Evaluation
 * 
 * Clinical Decision Support Disclaimer:
 * Calculations and deficit analytics are advisory instruments to assist licensed clinicians
 * and physiotherapists. They do not constitute autonomous diagnostic conclusions or prescription mandates.
 */

export interface JointRomNormalReference {
  joint: string;
  movement: string;
  normalDegrees: number;
  minFunctionalDegrees: number;
}

export const NORMAL_ROM_REFERENCES: Record<string, Record<string, JointRomNormalReference>> = {
  KNEE: {
    FLEXION: { joint: 'KNEE', movement: 'FLEXION', normalDegrees: 140, minFunctionalDegrees: 110 },
    EXTENSION: { joint: 'KNEE', movement: 'EXTENSION', normalDegrees: 0, minFunctionalDegrees: 0 },
  },
  HIP: {
    FLEXION: { joint: 'HIP', movement: 'FLEXION', normalDegrees: 120, minFunctionalDegrees: 90 },
    EXTENSION: { joint: 'HIP', movement: 'EXTENSION', normalDegrees: 30, minFunctionalDegrees: 15 },
    ABDUCTION: { joint: 'HIP', movement: 'ABDUCTION', normalDegrees: 45, minFunctionalDegrees: 20 },
    ADDUCTION: { joint: 'HIP', movement: 'ADDUCTION', normalDegrees: 30, minFunctionalDegrees: 15 },
    INTERNAL_ROTATION: { joint: 'HIP', movement: 'INTERNAL_ROTATION', normalDegrees: 45, minFunctionalDegrees: 20 },
    EXTERNAL_ROTATION: { joint: 'HIP', movement: 'EXTERNAL_ROTATION', normalDegrees: 45, minFunctionalDegrees: 20 },
  },
  SHOULDER: {
    FLEXION: { joint: 'SHOULDER', movement: 'FLEXION', normalDegrees: 180, minFunctionalDegrees: 120 },
    EXTENSION: { joint: 'SHOULDER', movement: 'EXTENSION', normalDegrees: 60, minFunctionalDegrees: 30 },
    ABDUCTION: { joint: 'SHOULDER', movement: 'ABDUCTION', normalDegrees: 180, minFunctionalDegrees: 120 },
    ADDUCTION: { joint: 'SHOULDER', movement: 'ADDUCTION', normalDegrees: 50, minFunctionalDegrees: 30 },
    INTERNAL_ROTATION: { joint: 'SHOULDER', movement: 'INTERNAL_ROTATION', normalDegrees: 70, minFunctionalDegrees: 50 },
    EXTERNAL_ROTATION: { joint: 'SHOULDER', movement: 'EXTERNAL_ROTATION', normalDegrees: 90, minFunctionalDegrees: 60 },
  },
  ELBOW: {
    FLEXION: { joint: 'ELBOW', movement: 'FLEXION', normalDegrees: 150, minFunctionalDegrees: 130 },
    EXTENSION: { joint: 'ELBOW', movement: 'EXTENSION', normalDegrees: 0, minFunctionalDegrees: 0 },
    PRONATION: { joint: 'ELBOW', movement: 'PRONATION', normalDegrees: 80, minFunctionalDegrees: 50 },
    SUPINATION: { joint: 'ELBOW', movement: 'SUPINATION', normalDegrees: 80, minFunctionalDegrees: 50 },
  },
  WRIST_HAND: {
    FLEXION: { joint: 'WRIST_HAND', movement: 'FLEXION', normalDegrees: 80, minFunctionalDegrees: 40 },
    EXTENSION: { joint: 'WRIST_HAND', movement: 'EXTENSION', normalDegrees: 70, minFunctionalDegrees: 40 },
  },
  ANKLE_FOOT: {
    DORSIFLEXION: { joint: 'ANKLE_FOOT', movement: 'DORSIFLEXION', normalDegrees: 20, minFunctionalDegrees: 10 },
    PLANTARFLEXION: { joint: 'ANKLE_FOOT', movement: 'PLANTARFLEXION', normalDegrees: 50, minFunctionalDegrees: 30 },
    INVERSION: { joint: 'ANKLE_FOOT', movement: 'INVERSION', normalDegrees: 35, minFunctionalDegrees: 20 },
    EVERSION: { joint: 'ANKLE_FOOT', movement: 'EVERSION', normalDegrees: 15, minFunctionalDegrees: 10 },
  },
  CERVICAL_SPINE: {
    FLEXION: { joint: 'CERVICAL_SPINE', movement: 'FLEXION', normalDegrees: 50, minFunctionalDegrees: 30 },
    EXTENSION: { joint: 'CERVICAL_SPINE', movement: 'EXTENSION', normalDegrees: 60, minFunctionalDegrees: 40 },
    LATERAL_FLEXION: { joint: 'CERVICAL_SPINE', movement: 'LATERAL_FLEXION', normalDegrees: 45, minFunctionalDegrees: 30 },
  },
  LUMBAR_SPINE: {
    FLEXION: { joint: 'LUMBAR_SPINE', movement: 'FLEXION', normalDegrees: 60, minFunctionalDegrees: 40 },
    EXTENSION: { joint: 'LUMBAR_SPINE', movement: 'EXTENSION', normalDegrees: 25, minFunctionalDegrees: 15 },
    LATERAL_FLEXION: { joint: 'LUMBAR_SPINE', movement: 'LATERAL_FLEXION', normalDegrees: 25, minFunctionalDegrees: 15 },
  },
};

export interface RomDeficitEvaluation {
  measuredDegrees: number;
  normalDegrees: number;
  deficitFromNormalDegrees: number;
  deficitFromNormalPercent: number;
  contralateralDegrees: number | null;
  deficitFromContralateralDegrees: number | null;
  deficitFromContralateralPercent: number | null;
  meetsFunctionalRequirement: boolean;
  severityAr: string;
  severityEn: string;
}

/**
 * Evaluates Range of Motion deficit against standard AAOS population norms and contralateral side.
 */
export function evaluateRomDeficit(
  joint: string,
  movement: string,
  measuredDegrees: number,
  contralateralDegrees?: number | null,
): RomDeficitEvaluation {
  const jointUpper = joint.toUpperCase();
  const movementUpper = movement.toUpperCase();

  const ref = NORMAL_ROM_REFERENCES[jointUpper]?.[movementUpper] ?? {
    joint: jointUpper,
    movement: movementUpper,
    normalDegrees: 100,
    minFunctionalDegrees: 60,
  };

  const normalDegrees = ref.normalDegrees;
  const deficitFromNormalDegrees = Math.max(0, normalDegrees - measuredDegrees);
  const deficitFromNormalPercent = normalDegrees > 0
    ? Math.round((deficitFromNormalDegrees / normalDegrees) * 100)
    : 0;

  let deficitFromContralateralDegrees: number | null = null;
  let deficitFromContralateralPercent: number | null = null;

  if (typeof contralateralDegrees === 'number' && contralateralDegrees > 0) {
    deficitFromContralateralDegrees = Math.max(0, contralateralDegrees - measuredDegrees);
    deficitFromContralateralPercent = Math.round((deficitFromContralateralDegrees / contralateralDegrees) * 100);
  }

  const primaryDeficitPercent = deficitFromContralateralPercent ?? deficitFromNormalPercent;
  let severityAr: string;
  let severityEn: string;

  if (primaryDeficitPercent <= 5) {
    severityAr = 'مدى حركي كامل / طبيعي';
    severityEn = 'Full / Normal Range of Motion';
  } else if (primaryDeficitPercent <= 20) {
    severityAr = 'عجز حركي خفيف (≤ 20%)';
    severityEn = 'Mild Motion Deficit (≤ 20%)';
  } else if (primaryDeficitPercent <= 40) {
    severityAr = 'عجز حركي متوسط (21–40%)';
    severityEn = 'Moderate Motion Deficit (21–40%)';
  } else {
    severityAr = 'عجز حركي شديد (> 40%) — قيد وظيفي ملحوظ';
    severityEn = 'Severe Motion Deficit (> 40%) — significant functional restriction';
  }

  const meetsFunctionalRequirement = measuredDegrees >= ref.minFunctionalDegrees;

  return {
    measuredDegrees,
    normalDegrees,
    deficitFromNormalDegrees,
    deficitFromNormalPercent,
    contralateralDegrees: contralateralDegrees ?? null,
    deficitFromContralateralDegrees,
    deficitFromContralateralPercent,
    meetsFunctionalRequirement,
    severityAr,
    severityEn,
  };
}

/**
 * Medical Research Council (MRC) Motor Power Grading (0 to 5)
 */
export const MRC_SCALE_DEFINITIONS: Record<number, { ar: string; en: string }> = {
  0: {
    ar: 'الدرجة 0: شلل تام — لا يوجد أي انقباض عضلي ملحوظ أو ملموس',
    en: 'Grade 0: Complete paralysis — no muscle contraction detectable',
  },
  1: {
    ar: 'الدرجة 1: أثر انقباض — وميض أو تقلص عضلي طفيف ملموس بدون أي حركة للمفصل',
    en: 'Grade 1: Trace / flicker of contraction palpable, without joint movement',
  },
  2: {
    ar: 'الدرجة 2: حركة نشطة مع إلغاء الجاذبية الأرضية فقط',
    en: 'Grade 2: Active movement with gravity eliminated only',
  },
  3: {
    ar: 'الدرجة 3: حركة نشطة مضادة للجاذبية الأرضية ولكن بدون مقاومة إضافية',
    en: 'Grade 3: Active movement against gravity, but not against resistance',
  },
  4: {
    ar: 'الدرجة 4: حركة نشطة ضد الجاذبية ومقاومة معتدلة',
    en: 'Grade 4: Active movement against gravity and moderate resistance',
  },
  5: {
    ar: 'الدرجة 5: قوة عضلية طبيعية كاملة ضد أقصى مقاومة',
    en: 'Grade 5: Normal power against full resistance',
  },
};

export function describeMrcGrade(grade: number): { ar: string; en: string } {
  if (grade < 0 || grade > 5 || !Number.isInteger(grade)) {
    throw new Error(`Invalid MRC muscle strength grade: ${grade}. Must be an integer between 0 and 5.`);
  }
  return MRC_SCALE_DEFINITIONS[grade];
}

/**
 * Visual Analogue Scale (VAS) Pain Comparison
 */
export function calculatePainDelta(preVas: number, postVas: number): {
  delta: number;
  improved: boolean;
  worsened: boolean;
  unchanged: boolean;
  descriptionAr: string;
  descriptionEn: string;
} {
  if (preVas < 0 || preVas > 10 || postVas < 0 || postVas > 10) {
    throw new Error('VAS pain scores must be integers between 0 and 10');
  }

  const delta = postVas - preVas;
  const improved = delta < 0;
  const worsened = delta > 0;
  const unchanged = delta === 0;

  let descriptionAr: string;
  let descriptionEn: string;

  if (improved) {
    descriptionAr = `تحسن في شدة الألم بمقدار ${Math.abs(delta)} درجات (من ${preVas} إلى ${postVas})`;
    descriptionEn = `Pain reduction of ${Math.abs(delta)} points on VAS (from ${preVas} to ${postVas})`;
  } else if (worsened) {
    descriptionAr = `تفاقم في شدة الألم بمقدار ${delta} درجات (من ${preVas} إلى ${postVas}) — يستدعي مراجعة شدة التمارين`;
    descriptionEn = `Pain increase of ${delta} points on VAS (from ${preVas} to ${postVas}) — reassessment of exercise intensity indicated`;
  } else {
    descriptionAr = `شدة الألم مستقرة بدون تغير بعد الجلسة (${preVas}/10)`;
    descriptionEn = `Pain level unchanged following session (${preVas}/10)`;
  }

  return { delta, improved, worsened, unchanged, descriptionAr, descriptionEn };
}

// =========================================================================
// VALIDATED FUNCTIONAL SCALES
// =========================================================================

export interface OdiScoreResult {
  rawScore: number;
  maxPossibleScore: number;
  percentageScore: number;
  severityCategory: 'MINIMAL' | 'MODERATE' | 'SEVERE' | 'CRIPPLED' | 'BED_BOUND';
  descriptionAr: string;
  descriptionEn: string;
}

/**
 * Oswestry Disability Index (ODI 2.0) Calculation
 * Requires at least 8 answered sections out of 10.
 * Each section is scored 0 to 5.
 */
export function calculateOdiScore(sectionScores: (number | null | undefined)[]): OdiScoreResult | null {
  if (!sectionScores || !Array.isArray(sectionScores) || sectionScores.length !== 10) {
    return null;
  }

  let answeredCount = 0;
  let totalScore = 0;

  for (const s of sectionScores) {
    if (typeof s === 'number' && !Number.isNaN(s) && s >= 0 && s <= 5) {
      answeredCount++;
      totalScore += s;
    }
  }

  // Fails closed if fewer than 8 sections answered per clinical psychometric guidelines
  if (answeredCount < 8) {
    return null;
  }

  const maxPossibleScore = answeredCount * 5;
  const percentageScore = Math.round((totalScore / maxPossibleScore) * 1000) / 10;

  let severityCategory: OdiScoreResult['severityCategory'];
  let descriptionAr: string;
  let descriptionEn: string;

  if (percentageScore <= 20) {
    severityCategory = 'MINIMAL';
    descriptionAr = 'عجز وظيفي طفيف (0–20%): المريض قادر على أداء معظم الأنشطة اليومية بدون معوقات كبرى';
    descriptionEn = 'Minimal disability (0–20%): Patient copes with most living activities without major limitation';
  } else if (percentageScore <= 40) {
    severityCategory = 'MODERATE';
    descriptionAr = 'عجز وظيفي معتدل (21–40%): يعاني المريض من ألم وصعوبة عند الجلوس أو الرفع أو الوقوف';
    descriptionEn = 'Moderate disability (21–40%): Patient experiences pain and difficulty with sitting, lifting, and standing';
  } else if (percentageScore <= 60) {
    severityCategory = 'SEVERE';
    descriptionAr = 'عجز وظيفي شديد (41–60%): الألم يمثل المشكلة الرئيسية وتتأثر كافة الأنشطة اليومية';
    descriptionEn = 'Severe disability (41–60%): Pain remains the main problem and travel/sleep are significantly disrupted';
  } else if (percentageScore <= 80) {
    severityCategory = 'CRIPPLED';
    descriptionAr = 'عجز شديد جداً ومقعد (61–80%): ألم الظهر يتعدى جميع جوانب حياة المريض ويستدعي تدخلاً حثيثاً';
    descriptionEn = 'Crippled / severe limitation (61–80%): Back pain impinges on all aspects of patient life';
  } else {
    severityCategory = 'BED_BOUND';
    descriptionAr = 'عجز تام / ملازم للفراش (81–100%): المريض ملازم للفراش أو يعاني من إعاقة حركية قصوى';
    descriptionEn = 'Bed-bound or exaggerating symptoms (81–100%): Extreme limitation confined to bed';
  }

  return {
    rawScore: totalScore,
    maxPossibleScore,
    percentageScore,
    severityCategory,
    descriptionAr,
    descriptionEn,
  };
}

export interface QuickDashScoreResult {
  score: number;
  answeredCount: number;
  descriptionAr: string;
  descriptionEn: string;
}

/**
 * QuickDASH Disability/Symptom Score Calculation
 * 11 items, each scored 1 to 5.
 * Formula: ((sum / n) - 1) * 25
 * Must have at least 10 answered items out of 11.
 */
export function calculateQuickDashScore(itemScores: (number | null | undefined)[]): QuickDashScoreResult | null {
  if (!itemScores || !Array.isArray(itemScores) || itemScores.length !== 11) {
    return null;
  }

  let answeredCount = 0;
  let sum = 0;

  for (const item of itemScores) {
    if (typeof item === 'number' && !Number.isNaN(item) && item >= 1 && item <= 5) {
      answeredCount++;
      sum += item;
    }
  }

  // QuickDASH requires at least 10 completed items to score validly
  if (answeredCount < 10) {
    return null;
  }

  const score = Math.round((((sum / answeredCount) - 1) * 25) * 10) / 10;

  let descriptionAr: string;
  let descriptionEn: string;

  if (score <= 20) {
    descriptionAr = `عجز خفيف جداً في الطرف العلوي (درجة QuickDASH: ${score}/100)`;
    descriptionEn = `Minimal upper limb disability (QuickDASH score: ${score}/100)`;
  } else if (score <= 40) {
    descriptionAr = `عجز وظيفي معتدل في الطرف العلوي (درجة QuickDASH: ${score}/100)`;
    descriptionEn = `Moderate upper limb disability (QuickDASH score: ${score}/100)`;
  } else if (score <= 60) {
    descriptionAr = `عجز وظيفي ملحوظ في الطرف العلوي (درجة QuickDASH: ${score}/100)`;
    descriptionEn = `Substantial upper limb disability (QuickDASH score: ${score}/100)`;
  } else {
    descriptionAr = `عجز وظيفي شديد في الطرف العلوي (درجة QuickDASH: ${score}/100)`;
    descriptionEn = `Severe upper limb disability (QuickDASH score: ${score}/100)`;
  }

  return {
    score,
    answeredCount,
    descriptionAr,
    descriptionEn,
  };
}

export interface LysholmKneeScoreResult {
  totalScore: number;
  ratingCategory: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR';
  descriptionAr: string;
  descriptionEn: string;
}

export interface LysholmItems {
  limp: number; // 0, 3, 5
  support: number; // 0, 2, 5
  locking: number; // 0, 2, 6, 10, 15
  instability: number; // 0, 5, 10, 15, 20, 25
  pain: number; // 0, 5, 10, 15, 20, 25
  swelling: number; // 0, 2, 6, 10
  stairClimbing: number; // 0, 2, 6, 10
  squatting: number; // 0, 2, 5
}

/**
 * Lysholm Knee Scoring Scale
 * Evaluates symptoms and function in ligament and meniscal knee injuries.
 * Max score = 100.
 */
export function calculateLysholmScore(items: LysholmItems): LysholmKneeScoreResult | null {
  if (!items) return null;

  const { limp, support, locking, instability, pain, swelling, stairClimbing, squatting } = items;

  // Validation
  const values = [limp, support, locking, instability, pain, swelling, stairClimbing, squatting];
  for (const v of values) {
    if (typeof v !== 'number' || Number.isNaN(v) || v < 0) {
      return null;
    }
  }

  if (limp > 5 || support > 5 || locking > 15 || instability > 25 || pain > 25 || swelling > 10 || stairClimbing > 10 || squatting > 5) {
    return null;
  }

  const totalScore = limp + support + locking + instability + pain + swelling + stairClimbing + squatting;

  let ratingCategory: LysholmKneeScoreResult['ratingCategory'];
  let descriptionAr: string;
  let descriptionEn: string;

  if (totalScore >= 95) {
    ratingCategory = 'EXCELLENT';
    descriptionAr = `أداء ركبة ممتاز (درجة ليزهولم: ${totalScore}/100) — بدون أعراض محددة للنشاط`;
    descriptionEn = `Excellent knee function (Lysholm score: ${totalScore}/100) — minimal or no symptoms`;
  } else if (totalScore >= 84) {
    ratingCategory = 'GOOD';
    descriptionAr = `أداء ركبة جيد (درجة ليزهولم: ${totalScore}/100) — قيود خفيفة في الأنشطة المجهدة`;
    descriptionEn = `Good knee function (Lysholm score: ${totalScore}/100) — minor limitations with strenuous activity`;
  } else if (totalScore >= 65) {
    ratingCategory = 'FAIR';
    descriptionAr = `أداء ركبة مقبول / متوسط (درجة ليزهولم: ${totalScore}/100) — عدم استقرار أو ألم معتدل`;
    descriptionEn = `Fair knee function (Lysholm score: ${totalScore}/100) — moderate pain or instability with activity`;
  } else {
    ratingCategory = 'POOR';
    descriptionAr = `أداء ركبة ضعيف (درجة ليزهولم: ${totalScore}/100) — عجز وظيفي شديد يستدعي تدخلاً جراحياً أو تأهيلياً مكثفاً`;
    descriptionEn = `Poor knee function (Lysholm score: ${totalScore}/100) — marked impairment, instability, or pain`;
  }

  return {
    totalScore,
    ratingCategory,
    descriptionAr,
    descriptionEn,
  };
}
