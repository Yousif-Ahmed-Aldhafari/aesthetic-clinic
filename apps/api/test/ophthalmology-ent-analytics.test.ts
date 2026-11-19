import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculatePta4,
  classifyHearingImpairment,
  evaluateBilateralHearingImpairment,
  evaluateIop,
  evaluateCupToDiscRatio,
  calculateSphericalEquivalent,
} from '../src/ophthalmology-ent/ophthalmology-ent-analytics.js';

describe('Ophthalmology & ENT Analytics & Clinical Guardrails', () => {
  describe('1. Pure-Tone Average (PTA-4) Calculation', () => {
    it('calculates PTA-4 accurately from standard 7-frequency audiogram array [125..8000 Hz]', () => {
      // Frequencies: [125, 250, 500, 1000, 2000, 4000, 8000]
      // 500=20, 1000=25, 2000=30, 4000=35 -> avg = 110 / 4 = 27.5 dB
      const thresholds = [15, 15, 20, 25, 30, 35, 40];
      const pta = calculatePta4(thresholds);
      assert.equal(pta, 27.5);
    });

    it('calculates PTA-4 from 4-frequency array [500, 1000, 2000, 4000 Hz]', () => {
      const pta = calculatePta4([20, 25, 30, 35]);
      assert.equal(pta, 27.5);
    });

    it('fails closed (returns null) if any core speech frequency is missing, null, or out-of-range', () => {
      // Missing frequency (NaN or null passed)
      // @ts-expect-error testing invalid element
      assert.equal(calculatePta4([15, 15, 20, null, 30, 35, 40]), null);
      // Value out of bounds (> 120 dB HL)
      assert.equal(calculatePta4([15, 15, 20, 25, 130, 35, 40]), null);
      // Incomplete array (only 3 frequencies)
      assert.equal(calculatePta4([20, 25, 30]), null);
      assert.equal(calculatePta4([]), null);
      // @ts-expect-error test invalid input
      assert.equal(calculatePta4(null), null);
    });
  });

  describe('2. WHO Hearing Impairment Classification', () => {
    it('classifies normal hearing (PTA <= 20 dB HL)', () => {
      // 500=10, 1000=15, 2000=15, 4000=20 -> avg = 15 dB
      const air = [10, 10, 10, 15, 15, 20, 20];
      const result = classifyHearingImpairment(air);
      assert.ok(result);
      assert.equal(result.grade, 'NORMAL');
      assert.equal(result.type, 'NORMAL');
      assert.match(result.descriptionAr, /سمع طبيعي/);
      assert.match(result.descriptionEn, /Normal hearing/);
    });

    it('classifies mild hearing loss (21–34 dB HL)', () => {
      // 500=25, 1000=30, 2000=30, 4000=35 -> avg = 30 dB
      const air = [20, 20, 25, 30, 30, 35, 35];
      const result = classifyHearingImpairment(air);
      assert.ok(result);
      assert.equal(result.grade, 'MILD');
      assert.match(result.descriptionAr, /خفيف/);
    });

    it('classifies moderate hearing loss (35–49 dB HL)', () => {
      // avg = 45 dB
      const air = [30, 35, 40, 45, 45, 50, 55];
      const result = classifyHearingImpairment(air);
      assert.ok(result);
      assert.equal(result.grade, 'MODERATE');
      assert.match(result.descriptionAr, /متوسط/);
    });

    it('classifies moderately severe hearing loss (50–64 dB HL)', () => {
      // avg = 55 dB
      const air = [45, 50, 50, 55, 55, 60, 65];
      const result = classifyHearingImpairment(air);
      assert.ok(result);
      assert.equal(result.grade, 'MODERATELY_SEVERE');
      assert.match(result.descriptionAr, /شديد الاعتدال/);
    });

    it('classifies severe hearing loss (65–79 dB HL)', () => {
      // avg = 70 dB
      const air = [60, 65, 65, 70, 70, 75, 80];
      const result = classifyHearingImpairment(air);
      assert.ok(result);
      assert.equal(result.grade, 'SEVERE');
      assert.match(result.descriptionAr, /شديد/);
    });

    it('classifies profound hearing loss (80–94 dB HL)', () => {
      // avg = 85 dB
      const air = [75, 80, 80, 85, 85, 90, 95];
      const result = classifyHearingImpairment(air);
      assert.ok(result);
      assert.equal(result.grade, 'PROFOUND');
      assert.match(result.descriptionAr, /عميق/);
    });

    it('classifies complete hearing loss (>= 95 dB HL)', () => {
      // avg = 100 dB
      const air = [90, 95, 95, 100, 100, 105, 110];
      const result = classifyHearingImpairment(air);
      assert.ok(result);
      assert.equal(result.grade, 'COMPLETE');
      assert.match(result.descriptionAr, /كامل/);
    });

    it('identifies Conductive Hearing Loss (Air-Bone Gap >= 15 dB with normal bone conduction)', () => {
      // Air: avg = 45 dB (moderate)
      const air = [30, 35, 40, 45, 45, 50, 55];
      // Bone: [250, 500, 1000, 2000, 4000] -> [15, 15, 15, 15, 15] (normal bone, gap = 30 dB)
      const bone = [15, 15, 15, 15, 15];
      const result = classifyHearingImpairment(air, bone);
      assert.ok(result);
      assert.equal(result.type, 'CONDUCTIVE');
      assert.ok(result.airBoneGapMaxDb >= 15);
      assert.match(result.typeDescriptionAr, /توصيلي/);
      assert.match(result.typeDescriptionEn, /Conductive/);
    });

    it('identifies Sensorineural Hearing Loss (abnormal bone conduction with ABG < 15 dB)', () => {
      // Air: avg = 50 dB
      const air = [40, 45, 50, 50, 50, 50, 55];
      // Bone matching: [45, 45, 45, 45, 45] -> gap = 5 dB
      const bone = [45, 45, 45, 45, 45];
      const result = classifyHearingImpairment(air, bone);
      assert.ok(result);
      assert.equal(result.type, 'SENSORINEURAL');
      assert.match(result.typeDescriptionAr, /حسي عصبي/);
      assert.match(result.typeDescriptionEn, /Sensorineural/);
    });

    it('identifies Mixed Hearing Loss (abnormal bone conduction with ABG >= 15 dB)', () => {
      // Air: avg = 60 dB
      const air = [50, 55, 60, 60, 60, 60, 65];
      // Bone: [35, 35, 35, 35, 35] -> impaired bone, gap = 25 dB
      const bone = [35, 35, 35, 35, 35];
      const result = classifyHearingImpairment(air, bone);
      assert.ok(result);
      assert.equal(result.type, 'MIXED');
      assert.match(result.typeDescriptionAr, /مختلط/);
      assert.match(result.typeDescriptionEn, /Mixed/);
    });

    it('sets type to INDETERMINATE when bone conduction is missing (never defaults to sensorineural)', () => {
      // Air thresholds indicating moderate hearing loss
      const air = [30, 35, 40, 45, 45, 50, 55];
      const result = classifyHearingImpairment(air);
      assert.ok(result);
      assert.equal(result.grade, 'MODERATE');
      assert.equal(result.type, 'INDETERMINATE');
      assert.match(result.typeDescriptionEn, /Indeterminate/);
      assert.match(result.typeDescriptionAr, /غير محدد/);
    });
  });

  describe('3. Bilateral Audiometry & WHO 2021 Better-Ear Standard', () => {
    it('determines person-level impairment grade based on the better ear (WHO 2021)', () => {
      // Right Ear: Normal (PTA = 15 dB)
      const rightAir = [10, 10, 10, 15, 15, 20, 20];
      // Left Ear: Moderate hearing loss (PTA = 45 dB)
      const leftAir = [30, 35, 40, 45, 45, 50, 55];

      const res = evaluateBilateralHearingImpairment({
        rightAirThresholds: rightAir,
        leftAirThresholds: leftAir,
      });

      assert.equal(res.betterEarSide, 'RIGHT');
      assert.equal(res.betterEarPtaDb, 15);
      assert.equal(res.betterEarGrade, 'NORMAL');
      assert.equal(res.whoPersonLevelImpairmentGrade, 'NORMAL');
      assert(res.whoPersonLevelDescriptionEn.includes('No impairment in better ear'));
    });

    it('flags clinical masking requirement on inter-aural difference >= 40 dB HL', () => {
      // Right Ear: PTA = 15 dB
      const rightAir = [10, 10, 10, 15, 15, 20, 20];
      // Left Ear: PTA = 60 dB (diff = 45 dB >= 40 dB)
      const leftAir = [50, 55, 60, 60, 60, 60, 65];

      const res = evaluateBilateralHearingImpairment({
        rightAirThresholds: rightAir,
        leftAirThresholds: leftAir,
      });

      assert.ok(res.maskingAlertsEn.some((a) => a.includes('mandatory masking')));
      assert.ok(res.maskingAlertsAr.some((a) => a.includes('تنبيه إخفاء سريري')));
    });

    it('flags clinical masking requirement on Air-Bone Gap > 10 dB HL', () => {
      // Right Ear with ABG = 25 dB
      const rightAir = [30, 35, 40, 45, 45, 50, 55];
      const rightBone = [15, 15, 15, 15, 15]; // gaps = 25, 30, 30, 35
      const leftAir = [10, 10, 10, 15, 15, 20, 20];

      const res = evaluateBilateralHearingImpairment({
        rightAirThresholds: rightAir,
        leftAirThresholds: leftAir,
        rightBoneThresholds: rightBone,
      });

      assert.ok(res.maskingAlertsEn.some((a) => a.includes('Right ear masking alert')));
    });

    it('includes pediatric audiometry precautions for patients under 12 years old', () => {
      const rightAir = [10, 10, 10, 15, 15, 20, 20];
      const leftAir = [10, 10, 10, 15, 15, 20, 20];

      const res = evaluateBilateralHearingImpairment({
        rightAirThresholds: rightAir,
        leftAirThresholds: leftAir,
        patientAgeYears: 7,
      });

      assert.ok(res.pediatricConsiderationsEn?.includes('Pediatric Audiology Precaution'));
      assert.ok(res.pediatricConsiderationsAr?.includes('تنبيه طب الأطفال السمعي'));
    });
  });

  describe('4. Intraocular Pressure (IOP) Evaluation & Glaucoma Guardrails', () => {
    it('passes normal bilateral IOP without clinical alert flags', () => {
      const result = evaluateIop(15.0, 16.5);
      assert.equal(result.isElevatedOd, false);
      assert.equal(result.isElevatedOs, false);
      assert.equal(result.isHypotonyOd, false);
      assert.equal(result.isHypotonyOs, false);
      assert.equal(result.isAsymmetric, false);
      assert.equal(result.advisoryAlertsAr.length, 0);
      assert.ok(result.clinicalDisclaimerAr.includes('تنبيه سريري استشاري'));
    });

    it('evaluates unilateral IOP measurements safely without asymmetry error', () => {
      const result = evaluateIop(18.0, null);
      assert.equal(result.isElevatedOd, false);
      assert.equal(result.isElevatedOs, false);
      assert.equal(result.isAsymmetric, false);
      assert.equal(result.differenceMmHg, null);
    });

    it('flags air-puff tonometry method warning requiring Goldmann confirmation', () => {
      const result = evaluateIop(22.0, 18.0, 'AIR_PUFF_SCREENING');
      assert.ok(result.advisoryAlertsEn.some((a) => a.includes('Non-contact Air-Puff') && a.includes('Goldmann Applanation Tonometry')));
      assert.ok(result.advisoryAlertsAr.some((a) => a.includes('Air-Puff') && a.includes('غولدمان')));
    });

    it('flags ocular hypertension when IOP exceeds 21.0 mmHg', () => {
      const result = evaluateIop(26.0, 17.0);
      assert.equal(result.isElevatedOd, true);
      assert.equal(result.isElevatedOs, false);
      assert.ok(result.advisoryAlertsAr.some((a) => a.includes('ارتفاع ضغط العين اليمنى')));
      assert.ok(result.advisoryAlertsEn.some((a) => a.includes('Elevated Right Eye IOP')));
    });

    it('flags inter-eye IOP asymmetry when difference is >= 4.0 mmHg', () => {
      const result = evaluateIop(19.0, 14.0);
      assert.equal(result.isElevatedOd, false);
      assert.equal(result.isElevatedOs, false);
      assert.equal(result.isAsymmetric, true);
      assert.equal(result.differenceMmHg, 5.0);
      assert.ok(result.advisoryAlertsAr.some((a) => a.includes('تباين ملحوظ بين العينين')));
    });

    it('flags ocular hypotony when IOP is < 6.0 mmHg', () => {
      const result = evaluateIop(4.5, 14.0);
      assert.equal(result.isHypotonyOd, true);
      assert.equal(result.isHypotonyOs, false);
      assert.ok(result.advisoryAlertsAr.some((a) => a.includes('انخفاض شديد في ضغط العين')));
    });
  });

  describe('5. Cup-to-Disc Ratio (CDR) Evaluation', () => {
    it('passes normal physiological CDR', () => {
      const result = evaluateCupToDiscRatio(0.35, 0.35);
      assert.equal(result.isSuspiciousOd, false);
      assert.equal(result.isSuspiciousOs, false);
      assert.equal(result.isAsymmetric, false);
    });

    it('flags suspicious glaucomatous cupping when CDR >= 0.60', () => {
      const result = evaluateCupToDiscRatio(0.70, 0.40);
      assert.equal(result.isSuspiciousOd, true);
      assert.equal(result.isSuspiciousOs, false);
      assert.equal(result.isAsymmetric, true);
      assert.equal(result.difference, 0.3);
      assert.ok(result.advisoryAlertsAr.some((a) => a.includes('تضخم تقعر القرص البصري للعين اليمنى')));
      assert.ok(result.advisoryAlertsAr.some((a) => a.includes('تباين سريري')));
    });
  });

  describe('6. Refractive Calculations', () => {
    it('calculates spherical equivalent accurately (SE = Sphere + Cyl / 2)', () => {
      // Myopia with astigmatism: -2.00 DS, -1.00 DC -> -2.50 D
      assert.equal(calculateSphericalEquivalent(-2.0, -1.0), -2.5);
      // Hyperopia with astigmatism: +1.50 DS, -0.50 DC -> +1.25 D
      assert.equal(calculateSphericalEquivalent(1.5, -0.5), 1.25);
      // Pure sphere: -3.00 DS, 0 DC -> -3.00 D
      assert.equal(calculateSphericalEquivalent(-3.0, 0), -3.0);
      // Null handling
      assert.equal(calculateSphericalEquivalent(null, -1.0), null);
    });
  });
});
