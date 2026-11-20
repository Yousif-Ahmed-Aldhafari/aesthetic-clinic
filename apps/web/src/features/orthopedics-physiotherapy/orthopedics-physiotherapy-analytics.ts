// Client-side analytics for Orthopedics & Physiotherapy functional scales

export interface OdiScoreResult {
  rawScore: number;
  maxPossibleScore: number;
  percentageScore: number;
  answeredSectionsCount: number;
  severityCategory: 'MINIMAL' | 'MODERATE' | 'SEVERE' | 'CRIPPLED' | 'BED_BOUND_OR_EXAGGERATING';
  descriptionAr: string;
  descriptionEn: string;
}

export function calculateOdiScore(sectionScores: (number | null | undefined)[]): OdiScoreResult | null {
  const answeredScores = sectionScores.filter((s): s is number => s !== null && s !== undefined && !Number.isNaN(s));
  if (answeredScores.length < 8) {
    return null; // At least 8 answered sections required by ODI protocol
  }

  const rawScore = answeredScores.reduce((sum, val) => sum + val, 0);
  const maxPossibleScore = answeredScores.length * 5;
  const percentageScore = Math.round((rawScore / maxPossibleScore) * 100 * 10) / 10;

  let severityCategory: OdiScoreResult['severityCategory'];
  let descriptionAr: string;
  let descriptionEn: string;

  if (percentageScore <= 20) {
    severityCategory = 'MINIMAL';
    descriptionAr = `عجز طفيف (${percentageScore}%) — المريض قادر على التعامل مع معظم الأنشطة اليومية.`;
    descriptionEn = `Minimal disability (${percentageScore}%) — patient copes with most daily living activities.`;
  } else if (percentageScore <= 40) {
    severityCategory = 'MODERATE';
    descriptionAr = `عجز معتدل (${percentageScore}%) — يعاني المريض من ألم وصعوبة عند الجلوس والرفع والوقوف.`;
    descriptionEn = `Moderate disability (${percentageScore}%) — pain and difficulty with sitting, lifting and standing.`;
  } else if (percentageScore <= 60) {
    severityCategory = 'SEVERE';
    descriptionAr = `عجز شديد (${percentageScore}%) — الألم يعيق الأنشطة اليومية؛ الفحص والاستقصاءات ضرورية.`;
    descriptionEn = `Severe disability (${percentageScore}%) — pain impinges on all aspects of daily living.`;
  } else if (percentageScore <= 80) {
    severityCategory = 'CRIPPLED';
    descriptionAr = `عجز مقعد (${percentageScore}%) — آلام الظهر تؤثر على جميع مجالات حياة المريض؛ تدخل نشط مطلوب.`;
    descriptionEn = `Crippled (${percentageScore}%) — back pain impinges on all areas of life; active intervention required.`;
  } else {
    severityCategory = 'BED_BOUND_OR_EXAGGERATING';
    descriptionAr = `طريح الفراش أو تضخيم للأعراض (${percentageScore}%) — مريض مقعد في السرير أو يحتاج لتقييم دقيق للأعراض.`;
    descriptionEn = `Bed-bound or symptom exaggeration (${percentageScore}%).`;
  }

  return {
    rawScore,
    maxPossibleScore,
    percentageScore,
    answeredSectionsCount: answeredScores.length,
    severityCategory,
    descriptionAr,
    descriptionEn,
  };
}

export interface QuickDashScoreResultInternal {
  score: number;
  answeredCount: number;
  descriptionAr: string;
  descriptionEn: string;
}

export function calculateQuickDashScore(itemScores: (number | null | undefined)[]): QuickDashScoreResultInternal | null {
  const answeredScores = itemScores.filter((s): s is number => s !== null && s !== undefined && !Number.isNaN(s) && s >= 1 && s <= 5);
  if (answeredScores.length < 10) {
    return null; // At least 10 answered items required by QuickDASH protocol
  }

  const sum = answeredScores.reduce((acc, v) => acc + v, 0);
  const score = Math.round((((sum / answeredScores.length) - 1) * 25) * 10) / 10;

  let descriptionAr: string;
  let descriptionEn: string;

  if (score <= 20) {
    descriptionAr = `عجز وظيفي خفيف جداً في الطرف العلوي (${score}/100)`;
    descriptionEn = `Minimal upper limb disability (${score}/100)`;
  } else if (score <= 40) {
    descriptionAr = `عجز وظيفي معتدل في الطرف العلوي (${score}/100)`;
    descriptionEn = `Moderate upper limb disability (${score}/100)`;
  } else if (score <= 60) {
    descriptionAr = `عجز وظيفي ملحوظ في الطرف العلوي (${score}/100)`;
    descriptionEn = `Substantial upper limb disability (${score}/100)`;
  } else {
    descriptionAr = `عجز وظيفي شديد في الطرف العلوي (${score}/100)`;
    descriptionEn = `Severe upper limb disability (${score}/100)`;
  }

  return {
    score,
    answeredCount: answeredScores.length,
    descriptionAr,
    descriptionEn,
  };
}

export interface LysholmItems {
  limp: number;
  support: number;
  locking: number;
  instability: number;
  pain: number;
  swelling: number;
  stairClimbing: number;
  squatting: number;
}

export interface LysholmScoreResultInternal {
  totalScore: number;
  ratingCategory: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR';
  descriptionAr: string;
  descriptionEn: string;
}

export function calculateLysholmScore(items: LysholmItems | null | undefined): LysholmScoreResultInternal | null {
  if (!items) return null;
  const { limp, support, locking, instability, pain, swelling, stairClimbing, squatting } = items;
  if (
    limp < 0 || limp > 5 ||
    support < 0 || support > 5 ||
    locking < 0 || locking > 15 ||
    instability < 0 || instability > 25 ||
    pain < 0 || pain > 25 ||
    swelling < 0 || swelling > 10 ||
    stairClimbing < 0 || stairClimbing > 10 ||
    squatting < 0 || squatting > 5
  ) {
    return null;
  }

  const totalScore = limp + support + locking + instability + pain + swelling + stairClimbing + squatting;
  let ratingCategory: LysholmScoreResultInternal['ratingCategory'];
  let descriptionAr: string;
  let descriptionEn: string;

  if (totalScore >= 95) {
    ratingCategory = 'EXCELLENT';
    descriptionAr = `أداء ركبة ممتاز (درجة ليزهولم: ${totalScore}/100) — بدون أعراض محددة للنشاط`;
    descriptionEn = `Excellent knee function (${totalScore}/100)`;
  } else if (totalScore >= 84) {
    ratingCategory = 'GOOD';
    descriptionAr = `أداء ركبة جيد (درجة ليزهولم: ${totalScore}/100) — قيود خفيفة في الأنشطة المجهدة`;
    descriptionEn = `Good knee function (${totalScore}/100)`;
  } else if (totalScore >= 65) {
    ratingCategory = 'FAIR';
    descriptionAr = `أداء ركبة مقبول / متوسط (درجة ليزهولم: ${totalScore}/100) — ألم أو عدم استقرار معتدل`;
    descriptionEn = `Fair knee function (${totalScore}/100)`;
  } else {
    ratingCategory = 'POOR';
    descriptionAr = `أداء ركبة ضعيف (درجة ليزهولم: ${totalScore}/100) — عجز وظيفي شديد يستدعي تدخلاً جراحياً أو تأهيلياً مكثفاً`;
    descriptionEn = `Poor knee function (${totalScore}/100)`;
  }

  return { totalScore, ratingCategory, descriptionAr, descriptionEn };
}
