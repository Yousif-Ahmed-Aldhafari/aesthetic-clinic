export interface PatientAllergySnapshot {
  id: string;
  allergen: string;
  allergenType?: string;
  severity: 'MILD' | 'MODERATE' | 'SEVERE' | 'LIFE_THREATENING';
  clinicalStatus: 'ACTIVE' | 'RESOLVED' | 'REFUTED';
}

export interface MedicationSafetyCheckInput {
  patientId: string;
  birthDate: Date;
  evaluationDate?: Date;
  medicationName: string;
  medicationCode?: string;
  route?: string;
  clinicalIndications?: string[];
  currentWeightKg?: number;
  weightMeasuredAt?: Date;
  allergies?: PatientAllergySnapshot[];
}

export type SafetyAlertSeverity = 'CRITICAL' | 'WARNING' | 'INFO';

export interface PediatricSafetyAlert {
  severity: SafetyAlertSeverity;
  code: string;
  titleAr: string;
  titleEn: string;
  messageAr: string;
  messageEn: string;
  clinicalRationale: string;
  evidenceReference: string;
  requiresPhysicianOverride: boolean;
}

export interface WeightRecencyCheckResult {
  isAcceptable: boolean;
  ageDays: number;
  ageCohort: 'NEONATE_OR_INFANT' | 'CHILD' | 'ADOLESCENT' | 'ADULT';
  maxAllowedAgeDays: number;
  weightAgeInDays: number | null;
  status: 'CURRENT' | 'STALE' | 'MISSING';
}

export interface PediatricMedicationSafetyResult {
  isSafeToProceed: boolean;
  hasCriticalAlerts: boolean;
  alerts: PediatricSafetyAlert[];
  weightRecency: WeightRecencyCheckResult;
}

/**
 * Validates recency of weight measurement according to pediatric clinical guidelines:
 * - Neonates & Infants (< 1 year): Weight must be within 7 days.
 * - Children (1 to 12 years): Weight must be within 30 days.
 * - Adolescents (12 to 18 years): Weight must be within 90 days.
 */
export function checkWeightRecency(
  birthDate: Date,
  evaluationDate: Date = new Date(),
  weightMeasuredAt?: Date,
): WeightRecencyCheckResult {
  const diffMs = evaluationDate.getTime() - birthDate.getTime();
  const ageDays = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));

  let ageCohort: 'NEONATE_OR_INFANT' | 'CHILD' | 'ADOLESCENT' | 'ADULT';
  let maxAllowedAgeDays: number;

  if (ageDays < 365) {
    ageCohort = 'NEONATE_OR_INFANT';
    maxAllowedAgeDays = 7;
  } else if (ageDays < 4383) {
    // 1 to 12 years
    ageCohort = 'CHILD';
    maxAllowedAgeDays = 30;
  } else if (ageDays < 6575) {
    // 12 to 18 years
    ageCohort = 'ADOLESCENT';
    maxAllowedAgeDays = 90;
  } else {
    ageCohort = 'ADULT';
    maxAllowedAgeDays = 180;
  }

  if (!weightMeasuredAt) {
    return {
      isAcceptable: false,
      ageDays,
      ageCohort,
      maxAllowedAgeDays,
      weightAgeInDays: null,
      status: 'MISSING',
    };
  }

  const weightDiffMs = evaluationDate.getTime() - weightMeasuredAt.getTime();
  const weightAgeInDays = Math.max(0, Math.floor(weightDiffMs / (1000 * 60 * 60 * 24)));
  const isAcceptable = weightAgeInDays <= maxAllowedAgeDays;

  return {
    isAcceptable,
    ageDays,
    ageCohort,
    maxAllowedAgeDays,
    weightAgeInDays,
    status: isAcceptable ? 'CURRENT' : 'STALE',
  };
}

/**
 * Known pediatric contraindications and black box warning patterns.
 */
interface ContraindicationRule {
  medicationPatterns: RegExp[];
  maxAgeDays?: number;
  minAgeDays?: number;
  severity: SafetyAlertSeverity;
  code: string;
  titleAr: string;
  titleEn: string;
  messageAr: string;
  messageEn: string;
  clinicalRationale: string;
  evidenceReference: string;
  requiresPhysicianOverride: boolean;
}

const PEDIATRIC_CONTRAINDICATION_RULES: ContraindicationRule[] = [
  // 1. Salicylates / Aspirin in viral illness / pediatric fever (Reye's syndrome)
  {
    medicationPatterns: [/\baspirin\b/i, /\bacetylsalicylic\b/i, /\baspégic\b/i, /\bbismuth\s+subsalicylate\b/i],
    maxAgeDays: 6575, // Under 18 years
    severity: 'CRITICAL',
    code: 'CONTRAINDICATION_REYES_SYNDROME',
    titleAr: 'تحذير حرج: خطر متلازمة راي (Reye Syndrome)',
    titleEn: 'Critical Warning: Reye Syndrome Risk with Salicylates',
    messageAr: 'يحظر استخدام حمض الأسيتيل ساليسيليك (الأسبرين) في الأطفال والمراهقين دون 18 عاماً بسبب خطر حدوث متلازمة راي القاتلة التي تسبب تنكساً دهنياً حاداً في الكبد واعتلالاً دماغياً.',
    messageEn: 'Aspirin/salicylates are contraindicated in children and adolescents under 18 due to risk of fatal Reye syndrome (acute hepatic failure and encephalopathy).',
    clinicalRationale: 'Salicylate exposure during viral illness triggers mitochondrial injury leading to acute encephalopathy and hepatic failure.',
    evidenceReference: 'FDA Safety Alert & AAP Guidelines on Pediatric Salicylate Use',
    requiresPhysicianOverride: true,
  },
  // 2. Tetracyclines under 8 years (tooth staining and bone growth inhibition)
  {
    medicationPatterns: [/\btetracycline\b/i, /\bminocycline\b/i, /\boxycycline\b/i, /\bdoxycycline\b/i],
    maxAgeDays: 2922, // Under 8 years
    severity: 'CRITICAL',
    code: 'CONTRAINDICATION_DENTAL_STAINING',
    titleAr: 'تحذير حرج: تلوّن وتلف ميناء الأسنان الدائمة وتثبيط نمو العظام',
    titleEn: 'Critical Warning: Enamel Hypoplasia & Tooth Discoloration',
    messageAr: 'يمنع استخدام مركبات التتراسيكلين في الأطفال دون سن 8 سنوات لأنها تترسب في العظام ومينا الأسنان النامية مسببة تلوناً بنياً دائماً ونقصاً في تنسج الميناء.',
    messageEn: 'Tetracyclines are contraindicated under 8 years of age due to permanent yellow-gray-brown tooth discoloration, enamel hypoplasia, and reversible suppression of skeletal growth.',
    clinicalRationale: 'Chelation with calcium in active mineralization zones of teeth and epiphyses.',
    evidenceReference: 'AAP Red Book & WHO Model Formulary for Children',
    requiresPhysicianOverride: true,
  },
  // 3. Fluoroquinolones in pediatric patients (arthropathy / cartilage toxicity)
  {
    medicationPatterns: [/\bciprofloxacin\b/i, /\blevofloxacin\b/i, /\bmoxifloxacin\b/i, /\bofloxacin\b/i],
    maxAgeDays: 6575, // Under 18 years
    severity: 'WARNING',
    code: 'CONTRAINDICATION_CARTILAGE_TOXICITY',
    titleAr: 'تنبيه سريري: سمية الغضاريف المفصلية الحاملة للوزن',
    titleEn: 'Clinical Alert: Weight-Bearing Articular Cartilage Toxicity',
    messageAr: 'الفلوروكينولونات ترتبط بتآكل الغضاريف واعتلال الأوتار والمفاصل في الحيوانات النامية؛ يجب قصر استخدامها في طب الأطفال على حالات العدوى البكتيرية المعقدة المحددة بدقة.',
    messageEn: 'Fluoroquinolones cause arthropathy and articular cartilage lesions in immature joints. Use strictly reserved for refractory Pseudomonas or specific multidrug-resistant infections.',
    clinicalRationale: 'Chondrotoxicity in juvenile joint cartilage and tendinopathy risk.',
    evidenceReference: 'AAP Policy Statement: Pediatric Use of Fluoroquinolones',
    requiresPhysicianOverride: true,
  },
  // 4. Codeine and Tramadol under 12 years (ultra-rapid CYP2D6 metabolizers)
  {
    medicationPatterns: [/\bcodeine\b/i, /\btramadol\b/i],
    maxAgeDays: 4383, // Under 12 years
    severity: 'CRITICAL',
    code: 'CONTRAINDICATION_RESPIRATORY_DEPRESSION',
    titleAr: 'تحذير صندوق أسود: خطر التثبيط التنفسي القاتل',
    titleEn: 'FDA Black Box Warning: Fatal Respiratory Depression with Codeine/Tramadol',
    messageAr: 'يحظر تماماً استخدام الكودايين والترامادول في الأطفال دون 12 عاماً بسبب التباين الوراثي في استقلاب إنزيم CYP2D6 الذي قد يحول الدواء سريعاً إلى مستويات مميتة من المورفين تسبب توقف التنفس.',
    messageEn: 'Codeine and tramadol are strictly contraindicated under 12 years due to unpredictable ultra-rapid CYP2D6 metabolism leading to fatal opioid intoxication and respiratory arrest.',
    clinicalRationale: 'Ultra-rapid CYP2D6 metabolizers produce life-threatening morphine serum concentrations.',
    evidenceReference: 'FDA Drug Safety Communication: Codeine and Tramadol Restriction in Children',
    requiresPhysicianOverride: true,
  },
  // 5. Promethazine under 2 years (fatal respiratory arrest)
  {
    medicationPatterns: [/\bpromethazine\b/i, /\bphenergan\b/i],
    maxAgeDays: 730, // Under 2 years
    severity: 'CRITICAL',
    code: 'CONTRAINDICATION_PROMETHAZINE_INFANT',
    titleAr: 'تحذير صندوق أسود: خطر توقف التنفس المفاجئ لدى الرضع',
    titleEn: 'FDA Black Box Warning: Severe Respiratory Depression in Children < 2y',
    messageAr: 'يمنع منعاً باتاً إعطاء البروميثازين للأطفال الرضع دون سن السنتين بسبب تقارير عن تثبيط تنفسي مميت ومتلازمة موت الرضع المفاجئ.',
    messageEn: 'Promethazine is contraindicated in pediatric patients under 2 years old due to fatal respiratory depression.',
    clinicalRationale: 'Central respiratory center depression in infants.',
    evidenceReference: 'FDA Black Box Warning: Promethazine Pediatric Contraindication',
    requiresPhysicianOverride: true,
  },
  // 6. Ceftriaxone in neonates (precipitation with calcium & kernicterus)
  {
    medicationPatterns: [/\bceftriaxone\b/i, /\brocephin\b/i],
    maxAgeDays: 28, // Neonates <= 28 days
    severity: 'CRITICAL',
    code: 'CONTRAINDICATION_NEONATAL_CEFTRIAXONE',
    titleAr: 'تحذير حرج: خطر الترسيب الكلوي والرئوي واليرقان النووي لحديثي الولادة',
    titleEn: 'Critical Warning: Neonatal Calcium-Ceftriaxone Precipitation & Kernicterus',
    messageAr: 'يحظر استخدام السيفترياكسون في حديثي الولادة (حتى عمر 28 يوماً) إذا كانوا يتلقون محاليل وريدية تحتوي على الكالسيوم أو يعانون من اليرقان (خطر الترسيب القاتل وإزاحة البيليروبين). يوصى بالسيفوتاكسيم كبديل آمن.',
    messageEn: 'Ceftriaxone is contraindicated in neonates <= 28 days receiving calcium-containing IV solutions or with hyperbilirubinemia due to fatal crystal precipitation and kernicterus risk. Cefotaxime is preferred.',
    clinicalRationale: 'Calcium-ceftriaxone particulate precipitation in pulmonary and renal vascular beds, and albumin-bilirubin binding displacement.',
    evidenceReference: 'FDA Drug Safety Communication: Ceftriaxone Neonatal Precautions',
    requiresPhysicianOverride: true,
  },
];

/**
 * Checks for known drug allergy conflicts based on active patient allergy records.
 */
function evaluateAllergyConflicts(
  medicationName: string,
  allergies?: PatientAllergySnapshot[],
): PediatricSafetyAlert[] {
  if (!allergies || allergies.length === 0) return [];

  const alerts: PediatricSafetyAlert[] = [];
  const normalizedMed = medicationName.toLowerCase();

  for (const allergy of allergies) {
    if (allergy.clinicalStatus !== 'ACTIVE') continue;

    const allergen = allergy.allergen.toLowerCase();

    // Direct match
    if (normalizedMed.includes(allergen) || allergen.includes(normalizedMed)) {
      alerts.push({
        severity: 'CRITICAL',
        code: 'ALLERGY_DIRECT_CONFLICT',
        titleAr: `تعارض تحسسي مباشر: ${allergy.allergen}`,
        titleEn: `Direct Allergy Conflict: ${allergy.allergen}`,
        messageAr: `المريض لديه حساسية سريرية موثقة ومعتمدة تجاه: ${allergy.allergen} (الشدة: ${allergy.severity}).`,
        messageEn: `Documented active clinical allergy to ${allergy.allergen} with ${allergy.severity} severity.`,
        clinicalRationale: 'Prescription matches confirmed allergen on patient allergy registry.',
        evidenceReference: 'Lamssa Patient Safety & Allergy Management System',
        requiresPhysicianOverride: true,
      });
      continue;
    }

    // Cross-reactivity: Penicillin <-> Beta-lactams / Amoxicillin
    if (
      (allergen.includes('penicillin') || allergen.includes('بنسلين')) &&
      (/amoxicillin|ampicillin|augmentin|piperacillin|penicillin/i.test(normalizedMed) ||
        /أموكسيسيلين|أوجمنتين|بنسلين/.test(normalizedMed))
    ) {
      alerts.push({
        severity: 'CRITICAL',
        code: 'ALLERGY_PENICILLIN_CROSS_REACTIVITY',
        titleAr: 'تعارض تحسسي دوائي من زمرة البنسلينات',
        titleEn: 'Penicillin Cross-Reactivity Allergy Conflict',
        messageAr: `المريض موثق لديه حساسية تجاه البنسلين والدواء الموصوف (${medicationName}) ينتمي لنفس الزمرة.`,
        messageEn: `Patient has documented penicillin allergy; prescribed ${medicationName} is a beta-lactam penicillin class antibiotic.`,
        clinicalRationale: 'Shared beta-lactam core structure triggers severe hypersensitivity / anaphylaxis.',
        evidenceReference: 'Clinical Allergy Guidelines on Beta-Lactam Cross-Reactivity',
        requiresPhysicianOverride: true,
      });
    }

    // Cross-reactivity: Sulfa <-> Sulfonamides / Co-trimoxazole
    if (
      (allergen.includes('sulfa') || allergen.includes('سلفا')) &&
      (/sulfamethoxazole|co-trimoxazole|bactrim|septra/i.test(normalizedMed) ||
        /سلفاميثوكسازول|باكتريم|سيبترا/.test(normalizedMed))
    ) {
      alerts.push({
        severity: 'CRITICAL',
        code: 'ALLERGY_SULFA_CROSS_REACTIVITY',
        titleAr: 'تعارض تحسسي من زمرة السلفا (Sulfonamides)',
        titleEn: 'Sulfonamide Cross-Reactivity Conflict',
        messageAr: `المريض موثق لديه حساسية تجاه السلفا والدواء الموصوف (${medicationName}) يحتوي على مركبات السلفوناميد.`,
        messageEn: `Patient has documented sulfa allergy; prescribed ${medicationName} contains sulfonamide moieties.`,
        clinicalRationale: 'Hypersensitivity to sulfonamide antimicrobials.',
        evidenceReference: 'Clinical Allergy Guidelines on Sulfonamide Cross-Reactivity',
        requiresPhysicianOverride: true,
      });
    }
  }

  return alerts;
}

/**
 * Pediatric Medication Safety Preflight Check
 * Performs automated validation without dose fabrication:
 * 1. Validates recency of weight documentation.
 * 2. Checks age-specific contraindications and FDA Black Box warnings.
 * 3. Checks cross-reactivity and direct allergy conflicts.
 *
 * NOTE: This service NEVER fabricates or recommends doses. It acts as an independent
 * safety verification boundary.
 */
export function preflightPediatricMedicationSafety(
  input: MedicationSafetyCheckInput,
): PediatricMedicationSafetyResult {
  const evalDate = input.evaluationDate ?? new Date();
  const weightRecency = checkWeightRecency(input.birthDate, evalDate, input.weightMeasuredAt);
  const alerts: PediatricSafetyAlert[] = [];

  // Check 1: Weight Recency Warning / Critical Flag
  if (!input.currentWeightKg || input.currentWeightKg <= 0 || weightRecency.status === 'MISSING') {
    alerts.push({
      severity: 'CRITICAL',
      code: 'WEIGHT_REQUIRED_FOR_PEDIATRIC_DISPENSING',
      titleAr: 'تنبيه أمان: مطلوب قياس وزن حالي للمريض للأطفال',
      titleEn: 'Safety Preflight: Current Weight Required for Pediatric Dispensing',
      messageAr: 'يحظر صرف أو تأكيد وصفة دوائية للأطفال دون توثيق وزن سريري حالي معتمد في الملف لحساب الجرعة الآمنة.',
      messageEn: 'Pediatric medication orders require a documented clinical weight to ensure safe weight-based prescribing.',
      clinicalRationale: 'Pediatric dosing is weight-based (mg/kg). Prescribing without verified weight risks severe underdosing or fatal toxicity.',
      evidenceReference: 'WHO Pediatric Medication Safety Guidelines & Lamssa Clinical Governance',
      requiresPhysicianOverride: false,
    });
  } else if (weightRecency.status === 'STALE') {
    alerts.push({
      severity: 'WARNING',
      code: 'WEIGHT_DOCUMENTATION_STALE',
      titleAr: 'تنبيه: قياس الوزن السريري غير حديث',
      titleEn: 'Warning: Pediatric Weight Measurement is Stale',
      messageAr: `قياس وزن المريض الموثق عمره (${weightRecency.weightAgeInDays} يوماً)، متجاوزاً الحد الأقصى المسموح لفئته العمرية (${weightRecency.maxAllowedAgeDays} يوماً). يوصى بإعادة وزن الطفل قبل الاعتماد النهائي.`,
      messageEn: `Documented weight is ${weightRecency.weightAgeInDays} days old, exceeding the ${weightRecency.maxAllowedAgeDays}-day threshold for this age cohort. Weight re-measurement strongly recommended.`,
      clinicalRationale: 'Rapid growth and fluid shifts in children can render weight-based calculations obsolete within days to weeks.',
      evidenceReference: 'Pediatric Pharmacy Association Guidelines on Weight-Based Prescribing',
      requiresPhysicianOverride: true,
    });
  }

  // Check 2: Age-Based Pediatric Contraindications
  for (const rule of PEDIATRIC_CONTRAINDICATION_RULES) {
    const matchesMed = rule.medicationPatterns.some((pattern) =>
      pattern.test(input.medicationName) || (input.medicationCode && pattern.test(input.medicationCode)),
    );

    if (!matchesMed) continue;

    // Age bounds evaluation
    const violatesMaxAge = rule.maxAgeDays !== undefined && weightRecency.ageDays < rule.maxAgeDays;
    const violatesMinAge = rule.minAgeDays !== undefined && weightRecency.ageDays >= rule.minAgeDays;

    if (violatesMaxAge || violatesMinAge) {
      alerts.push({
        severity: rule.severity,
        code: rule.code,
        titleAr: rule.titleAr,
        titleEn: rule.titleEn,
        messageAr: rule.messageAr,
        messageEn: rule.messageEn,
        clinicalRationale: rule.clinicalRationale,
        evidenceReference: rule.evidenceReference,
        requiresPhysicianOverride: rule.requiresPhysicianOverride,
      });
    }
  }

  // Check 3: Allergy & Cross-Reactivity Conflicts
  const allergyAlerts = evaluateAllergyConflicts(input.medicationName, input.allergies);
  alerts.push(...allergyAlerts);

  const hasCriticalAlerts = alerts.some((a) => a.severity === 'CRITICAL');
  const isSafeToProceed = !hasCriticalAlerts;

  return {
    isSafeToProceed,
    hasCriticalAlerts,
    alerts,
    weightRecency,
  };
}
