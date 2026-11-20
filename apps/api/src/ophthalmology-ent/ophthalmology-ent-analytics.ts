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

export interface BilateralHearingEvaluationOptions {
  rightAirThresholds: number[];
  leftAirThresholds: number[];
  rightBoneThresholds?: number[];
  leftBoneThresholds?: number[];
  patientAgeYears?: number;
  maskingApplied?: boolean;
}

export interface BilateralHearingEvaluation {
  rightEar: HearingLossClassification | null;
  leftEar: HearingLossClassification | null;
  betterEarPtaDb: number | null;
  betterEarGrade: HearingLossClassification['grade'] | null;
  betterEarSide: 'RIGHT' | 'LEFT' | 'EQUAL' | null;
  whoPersonLevelImpairmentGrade: string;
  whoPersonLevelDescriptionAr: string;
  whoPersonLevelDescriptionEn: string;
  maskingAlertsAr: string[];
  maskingAlertsEn: string[];
  pediatricConsiderationsAr?: string;
  pediatricConsiderationsEn?: string;
}

/**
 * Calculates Pure-Tone Average (PTA-4 at 500, 1000, 2000, 4000 Hz) per WHO standard.
 * ISO 8253-1 strictly requires all 4 speech frequencies. If any frequency is missing or invalid,
 * this function fails closed and returns null rather than averaging an incomplete subset.
 * 
 * Accepted array formats:
 * - 7 frequencies: [125, 250, 500, 1000, 2000, 4000, 8000] -> indices 2, 3, 4, 5
 * - 6 frequencies: [250, 500, 1000, 2000, 4000, 8000] -> indices 1, 2, 3, 4
 * - 4 frequencies: [500, 1000, 2000, 4000] -> indices 0, 1, 2, 3
 */
export function calculatePta4(thresholds: number[]): number | null {
  if (!thresholds || !Array.isArray(thresholds)) return null;

  let relevant: (number | undefined)[];
  if (thresholds.length === 7) {
    relevant = [thresholds[2], thresholds[3], thresholds[4], thresholds[5]];
  } else if (thresholds.length === 6) {
    relevant = [thresholds[1], thresholds[2], thresholds[3], thresholds[4]];
  } else if (thresholds.length === 4) {
    relevant = [thresholds[0], thresholds[1], thresholds[2], thresholds[3]];
  } else {
    return null;
  }

  // Fails closed if ANY of the 4 core frequencies is missing or out of valid clinical range (-10 to 120 dB HL)
  for (const t of relevant) {
    if (typeof t !== 'number' || Number.isNaN(t) || t < -10 || t > 120) {
      return null;
    }
  }

  const sum = (relevant as number[]).reduce((acc, curr) => acc + curr, 0);
  return Math.round((sum / 4) * 10) / 10;
}

/**
 * Classifies hearing loss grade according to WHO 2021 Grades of Hearing Impairment.
 * Note: If bone conduction is missing, type is set to INDETERMINATE (never defaulted to SENSORINEURAL).
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

  if (grade === 'NORMAL') {
    return {
      ptaDb: pta,
      grade,
      type: 'NORMAL',
      descriptionAr,
      descriptionEn,
      typeDescriptionAr: 'طبيعي',
      typeDescriptionEn: 'Normal',
      airBoneGapMaxDb: 0,
    };
  }

  // Calculate Air-Bone Gap if bone thresholds provided
  let airBoneGapMaxDb = 0;
  let type: HearingLossClassification['type'] = 'INDETERMINATE';
  let typeDescriptionAr = 'غير محدد (يتطلب قياس التوصيل العظمي للتفريق بين الفقدان التوصيلي والحسي العصبي)';
  let typeDescriptionEn = 'Indeterminate (bone conduction testing required to differentiate conductive vs sensorineural hearing loss)';

  if (boneThresholds && Array.isArray(boneThresholds)) {
    let airMatching: number[] | null = null;
    if (airThresholds.length === 7) {
      airMatching = [airThresholds[2], airThresholds[3], airThresholds[4], airThresholds[5]];
    } else if (airThresholds.length === 6) {
      airMatching = [airThresholds[1], airThresholds[2], airThresholds[3], airThresholds[4]];
    } else if (airThresholds.length === 4) {
      airMatching = [airThresholds[0], airThresholds[1], airThresholds[2], airThresholds[3]];
    }

    let boneMatching: number[] | null = null;
    if (boneThresholds.length === 5) {
      boneMatching = [boneThresholds[1], boneThresholds[2], boneThresholds[3], boneThresholds[4]];
    } else if (boneThresholds.length === 4) {
      boneMatching = [boneThresholds[0], boneThresholds[1], boneThresholds[2], boneThresholds[3]];
    }

    if (airMatching && boneMatching) {
      const allBoneValid = boneMatching.every((b) => typeof b === 'number' && !Number.isNaN(b) && b >= -10 && b <= 120);
      if (allBoneValid) {
        const gaps: number[] = [];
        for (let i = 0; i < 4; i++) {
          gaps.push(Math.max(0, airMatching[i] - boneMatching[i]));
        }
        airBoneGapMaxDb = Math.max(...gaps);
        const bonePta = Math.round((boneMatching.reduce((acc, v) => acc + v, 0) / 4) * 10) / 10;

        if (airBoneGapMaxDb >= 15 && bonePta <= 25) {
          type = 'CONDUCTIVE';
          typeDescriptionAr = 'ضعف سمع توصيلي (فجوة هوائية-عظمية ≥ 15 dB مع توصيل عظمي طبيعي)';
          typeDescriptionEn = 'Conductive hearing loss (Air-Bone Gap ≥ 15 dB with normal bone thresholds)';
        } else if (airBoneGapMaxDb < 15 && bonePta > 25) {
          type = 'SENSORINEURAL';
          typeDescriptionAr = 'ضعف سمع حسي عصبي (تطابق التوصيل الهوائي والعظمي بدون فجوة)';
          typeDescriptionEn = 'Sensorineural hearing loss (impaired bone thresholds with ABG < 15 dB)';
        } else if (airBoneGapMaxDb >= 15 && bonePta > 25) {
          type = 'MIXED';
          typeDescriptionAr = 'ضعف سمع مختلط (مكون توصيلي وحسي عصبي مشترك)';
          typeDescriptionEn = 'Mixed hearing loss (combined conductive and sensorineural components)';
        }
      }
    }
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
 * Evaluates Bilateral Audiometry per WHO 2021 Better-Ear Standard and ISO 8253-1 masking requirements.
 */
export function evaluateBilateralHearingImpairment(
  options: BilateralHearingEvaluationOptions,
): BilateralHearingEvaluation {
  const rightEar = classifyHearingImpairment(options.rightAirThresholds, options.rightBoneThresholds);
  const leftEar = classifyHearingImpairment(options.leftAirThresholds, options.leftBoneThresholds);

  let betterEarPtaDb: number | null = null;
  let betterEarGrade: HearingLossClassification['grade'] | null = null;
  let betterEarSide: 'RIGHT' | 'LEFT' | 'EQUAL' | null = null;

  if (rightEar && leftEar) {
    if (rightEar.ptaDb < leftEar.ptaDb) {
      betterEarPtaDb = rightEar.ptaDb;
      betterEarGrade = rightEar.grade;
      betterEarSide = 'RIGHT';
    } else if (leftEar.ptaDb < rightEar.ptaDb) {
      betterEarPtaDb = leftEar.ptaDb;
      betterEarGrade = leftEar.grade;
      betterEarSide = 'LEFT';
    } else {
      betterEarPtaDb = rightEar.ptaDb;
      betterEarGrade = rightEar.grade;
      betterEarSide = 'EQUAL';
    }
  } else if (rightEar) {
    betterEarPtaDb = rightEar.ptaDb;
    betterEarGrade = rightEar.grade;
    betterEarSide = 'RIGHT';
  } else if (leftEar) {
    betterEarPtaDb = leftEar.ptaDb;
    betterEarGrade = leftEar.grade;
    betterEarSide = 'LEFT';
  }

  let whoPersonLevelImpairmentGrade = 'INDETERMINATE';
  let whoPersonLevelDescriptionAr = 'غير محدد — يتطلب بيانات سمعية ثنائية الجانب مكتملة';
  let whoPersonLevelDescriptionEn = 'Indeterminate — complete bilateral audiometric data required';

  if (betterEarGrade) {
    whoPersonLevelImpairmentGrade = betterEarGrade;
    if (betterEarGrade === 'NORMAL') {
      whoPersonLevelDescriptionAr = 'تصنيف منظمة الصحة العالمية (الأذن الأفضل): لا يوجد ضعف سمع ملحوظ على مستوى الشخص';
      whoPersonLevelDescriptionEn = 'WHO 2021 Person-Level: No impairment in better ear (≤ 20 dB HL)';
    } else {
      whoPersonLevelDescriptionAr = `تصنيف منظمة الصحة العالمية (الأذن الأفضل): ضعف سمع بمستوى (${betterEarGrade}) على مستوى الشخص`;
      whoPersonLevelDescriptionEn = `WHO 2021 Person-Level: Hearing impairment grade (${betterEarGrade}) in better ear`;
    }
  }

  const maskingAlertsAr: string[] = [];
  const maskingAlertsEn: string[] = [];

  // Inter-aural difference check (>= 40 dB HL)
  if (rightEar && leftEar) {
    const interAuralDiff = Math.abs(rightEar.ptaDb - leftEar.ptaDb);
    if (interAuralDiff >= 40) {
      maskingAlertsAr.push(`تنبيه إخفاء سريري (Clinical Masking): فارق العتبات الهوائية بين الأذنين (${interAuralDiff} dB ≥ 40 dB) يستلزم تطبيق الإخفاء لتفادي التوصيل العابر للجمجمة`);
      maskingAlertsEn.push(`Clinical Masking Alert: Inter-aural air threshold difference (${interAuralDiff} dB ≥ 40 dB) indicates mandatory masking of the non-test ear to prevent cross-hearing`);
    }
  }

  // Bone conduction masking check (ABG > 10 dB)
  if (rightEar && rightEar.airBoneGapMaxDb > 10) {
    maskingAlertsAr.push('تنبيه إخفاء الأذن اليمنى: وجود فجوة هوائية-عظمية تتجاوز 10 dB يستدعي تطبيق إخفاء هوائي للأذن المقابلة لتأكيد عتبة التوصيل العظمي');
    maskingAlertsEn.push('Right ear masking alert: Air-Bone Gap > 10 dB requires contralateral masking to isolate true bone threshold');
  }
  if (leftEar && leftEar.airBoneGapMaxDb > 10) {
    maskingAlertsAr.push('تنبيه إخفاء الأذن اليسرى: وجود فجوة هوائية-عظمية تتجاوز 10 dB يستدعي تطبيق إخفاء هوائي للأذن المقابلة لتأكيد عتبة التوصيل العظمي');
    maskingAlertsEn.push('Left ear masking alert: Air-Bone Gap > 10 dB requires contralateral masking to isolate true bone threshold');
  }

  let pediatricConsiderationsAr: string | undefined;
  let pediatricConsiderationsEn: string | undefined;
  if (typeof options.patientAgeYears === 'number' && options.patientAgeYears < 12) {
    pediatricConsiderationsAr = 'تنبيه طب الأطفال السمعي: تقييم العتبات السمعية للأطفال دون سن 12 عاماً يستدعي التحقق السلوكي المناسب للعمر (VRA / CPA) والاقتران بالفحوصات الموضوعية (ضغط الأذن Tympanometry، الانبعاثات OAE، واستجابة جذع المخ ABR) ولا يُعتمد على التخطيط الروتيني للبالغين منفرداً.';
    pediatricConsiderationsEn = 'Pediatric Audiology Precaution: Audiometric threshold evaluation in children under 12 years requires age-appropriate conditioning (VRA/CPA) corroborated by objective physiologic tests (tympanometry, OAE, and ABR), and must not rely solely on unconditioned standard behavioral thresholds.';
  }

  return {
    rightEar,
    leftEar,
    betterEarPtaDb,
    betterEarGrade,
    betterEarSide,
    whoPersonLevelImpairmentGrade,
    whoPersonLevelDescriptionAr,
    whoPersonLevelDescriptionEn,
    maskingAlertsAr,
    maskingAlertsEn,
    pediatricConsiderationsAr,
    pediatricConsiderationsEn,
  };
}

/**
 * Evaluates Intraocular Pressure (IOP) with clinical guardrails, method provenance and asymmetry detection.
 */
export function evaluateIop(od: number | null, os: number | null, method?: string): IopEvaluationResult {
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

  const isAirPuff = method && /air|puff|non[-_ ]?contact/i.test(method);
  if (isAirPuff) {
    advisoryAlertsAr.push('طريقة القياس (هواء غير تلامسي Air-Puff): يُعد قياساً مسحياً أولياً يتأثر بسماكة وصلابة القرنية؛ يلزم التأكيد بواسطة مقياس غولدمان التسطيحي (Goldmann) قبل اتخاذ أي قرار علاجي.');
    advisoryAlertsEn.push('Measurement Method (Non-contact Air-Puff): Advisory screening measurement susceptible to corneal biomechanics; mandatory verification via Goldmann Applanation Tonometry prior to clinical diagnosis or therapy.');
  }

  if (isElevatedOd) {
    advisoryAlertsAr.push(`ارتفاع ضغط العين اليمنى (OD: ${od} mmHg > 21.0 mmHg) — فحص مسحي يشير لاحتمال فرط ضغط العين؛ لا يُعد تشخيصاً نهائياً للجلوكوما`);
    advisoryAlertsEn.push(`Elevated Right Eye IOP (OD: ${od} mmHg > 21.0 mmHg) — Screening indicator of ocular hypertension; does not constitute a standalone glaucoma diagnosis`);
  }
  if (isElevatedOs) {
    advisoryAlertsAr.push(`ارتفاع ضغط العين اليسرى (OS: ${os} mmHg > 21.0 mmHg) — فحص مسحي يشير لاحتمال فرط ضغط العين؛ لا يُعد تشخيصاً نهائياً للجلوكوما`);
    advisoryAlertsEn.push(`Elevated Left Eye IOP (OS: ${os} mmHg > 21.0 mmHg) — Screening indicator of ocular hypertension; does not constitute a standalone glaucoma diagnosis`);
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
    clinicalDisclaimerAr: 'تنبيه سريري استشاري فقط: قياس ضغط العين فحص مسحي مساعد ويجب تفسيره بالاقتران مع سماكة القرنية المركزية (CCT) وفحص العصب البصري والمجال البصري. لا يتم تشخيص الجلوكوما أو وصف الأدوية تلقائياً بناءً على الضغط فقط.',
    clinicalDisclaimerEn: 'Advisory Clinical Decision Support: Intraocular pressure is a risk-factor screening measurement and must be correlated with central corneal thickness (CCT), optic nerve head examination, and visual field testing. Glaucoma diagnosis and medications are never automatically assigned.',
  };
}

/**
 * Evaluates Cup-to-Disc Ratio (CDR) with asymmetry detection and screening guardrails.
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
    advisoryAlertsAr.push(`تضخم تقعر القرص البصري للعين اليمنى (OD CDR: ${odRatio} ≥ 0.60) — مؤشر مسحي يستلزم تقييم سماكة ألياف العصب البصري (OCT) ومجال الرؤية؛ لا يمثل تشخيصاً نهائياً`);
    advisoryAlertsEn.push(`Right Eye optic cup enlargement (OD CDR: ${odRatio} ≥ 0.60) — screening observation warranting OCT RNFL and perimetry evaluation; does not establish definitive glaucoma diagnosis`);
  }
  if (isSuspiciousOs) {
    advisoryAlertsAr.push(`تضخم تقعر القرص البصري للعين اليسرى (OS CDR: ${osRatio} ≥ 0.60) — مؤشر مسحي يستلزم تقييم سماكة ألياف العصب البصري (OCT) ومجال الرؤية؛ لا يمثل تشخيصاً نهائياً`);
    advisoryAlertsEn.push(`Left Eye optic cup enlargement (OS CDR: ${osRatio} ≥ 0.60) — screening observation warranting OCT RNFL and perimetry evaluation; does not establish definitive glaucoma diagnosis`);
  }
  if (isAsymmetric) {
    advisoryAlertsAr.push(`تباين سريري في نسبة التقعر بين العينين (فارق ${difference} ≥ 0.20) — مؤشر محتمل للاعتلال العصبي غير المتناظر يستدعي فحوصات تصوير متقدمة`);
    advisoryAlertsEn.push(`Significant CDR asymmetry between eyes (Δ ${difference} ≥ 0.20) — indicator of possible asymmetric optic neuropathy warranting structural imaging`);
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
