import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateChronologicalAge,
  calculateCorrectedAge,
  determineStatureMethod,
  calculateBmi,
  calculateGrowthZScoreAndPercentile,
  evaluatePediatricGrowth,
  zScoreToPercentile,
} from '../src/pediatrics/growth-analytics.js';
import {
  checkWeightRecency,
  preflightPediatricMedicationSafety,
} from '../src/pediatrics/medication-safety.js';

describe('Pediatrics Informatics & Clinical Growth Analytics', () => {
  describe('Chronological Age Calculations', () => {
    it('calculates exact age in days, months and years', () => {
      const birth = new Date('2025-01-01T00:00:00Z');
      const measure = new Date('2025-04-01T00:00:00Z'); // 90 days
      const age = calculateChronologicalAge(birth, measure);

      assert.equal(age.days, 90);
      assert.equal(Math.round(age.months), 3);
      assert.equal(age.years, 0.25);
    });

    it('handles birth on measurement day gracefully (age 0)', () => {
      const now = new Date('2026-06-01T10:00:00Z');
      const age = calculateChronologicalAge(now, now);
      assert.equal(age.days, 0);
      assert.equal(age.months, 0);
      assert.equal(age.years, 0);
    });
  });

  describe('Prematurity and Corrected Age Calculations', () => {
    it('applies gestational age correction for preterm infant (< 37 weeks)', () => {
      const birth = new Date('2026-01-01T00:00:00Z');
      const measure = new Date('2026-04-01T00:00:00Z'); // 90 days chronological
      // Born at 32 weeks + 0 days -> deficit = (40 - 32) * 7 = 56 days
      const result = calculateCorrectedAge(birth, measure, 32, 0);

      assert.equal(result.applies, true);
      assert.equal(result.chronologicalAgeDays, 90);
      assert.equal(result.deficitDays, 56);
      assert.equal(result.correctedAgeDays, 34); // 90 - 56 = 34 days
      assert.equal(result.isPretermNeonate, false);
    });

    it('does NOT apply correction to term infants (>= 37 weeks)', () => {
      const birth = new Date('2026-01-01T00:00:00Z');
      const measure = new Date('2026-04-01T00:00:00Z');
      const result = calculateCorrectedAge(birth, measure, 38, 2);

      assert.equal(result.applies, false);
      assert.equal(result.deficitDays, 0);
      assert.equal(result.correctedAgeDays, 90);
    });

    it('correctly flags preterm neonate measured prior to 40 weeks PMA', () => {
      const birth = new Date('2026-01-01T00:00:00Z');
      const measure = new Date('2026-01-22T00:00:00Z'); // 21 days chronological
      // Born at 28 weeks + 0 days -> deficit = 84 days -> correctedAgeDays = 21 - 84 = -63 days
      const result = calculateCorrectedAge(birth, measure, 28, 0);

      assert.equal(result.applies, true);
      assert.equal(result.isPretermNeonate, true);
      assert.equal(result.correctedAgeDays, -63);
      // Post-menstrual age = 28w + 21d (3w) = 31 weeks
      assert.equal(result.postMenstrualAgeWeeks, 31);
    });

    it('stops applying corrected age after 24 months (730 days) catch-up boundary', () => {
      const birth = new Date('2024-01-01T00:00:00Z');
      const measure = new Date('2026-02-01T00:00:00Z'); // > 730 days
      const result = calculateCorrectedAge(birth, measure, 30, 0);

      assert.equal(result.applies, false);
      assert.match(result.reason ?? '', /730 days/);
    });
  });

  describe('Stature Method Recommendation & BMI Computation', () => {
    it('recommends RECUMBENT_LENGTH for infants < 2 years and STANDING_HEIGHT for children >= 2 years', () => {
      assert.equal(determineStatureMethod(729), 'RECUMBENT_LENGTH');
      assert.equal(determineStatureMethod(730), 'STANDING_HEIGHT');
      assert.equal(determineStatureMethod(1000), 'STANDING_HEIGHT');
    });

    it('calculates BMI correctly and handles invalid inputs', () => {
      // 12 kg, 85 cm -> 12 / (0.85^2) = 16.609 -> 16.61
      const bmi = calculateBmi(12.0, 85.0);
      assert.equal(bmi, 16.61);

      assert.equal(calculateBmi(0, 85), null);
      assert.equal(calculateBmi(12, 0), null);
      assert.equal(calculateBmi(undefined, 85), null);
    });
  });

  describe('WHO LMS Growth Z-Score and Percentile Analytics', () => {
    it('calculates normal birth weight for male at 50th percentile (Z ~ 0)', () => {
      const score = calculateGrowthZScoreAndPercentile({
        metric: 'WEIGHT_FOR_AGE',
        gender: 'MALE',
        ageInMonths: 0,
        measurementValue: 3.346, // WHO median is ~3.346 kg
      });

      assert.equal(score.status, 'CALCULATED');
      assert(score.zScore !== null && Math.abs(score.zScore) < 0.05, `Z-Score was ${score.zScore}`);
      assert(score.percentile !== null && Math.abs(score.percentile - 50.0) < 2.0);
    });

    it('calculates severe underweight Z-Score (Z < -3) with restricted SD adjustment', () => {
      // At 12 months, male median is ~9.67kg. A weight of 6.0 kg is severely underweight.
      const score = calculateGrowthZScoreAndPercentile({
        metric: 'WEIGHT_FOR_AGE',
        gender: 'MALE',
        ageInMonths: 12,
        measurementValue: 6.0,
      });

      assert.equal(score.status, 'CALCULATED');
      assert(score.zScore !== null && score.zScore < -3.0);
      assert(score.percentile !== null && score.percentile < 0.2);
    });

    it('correctly maps Z-scores to standard normal percentiles', () => {
      assert.equal(zScoreToPercentile(0), 50.0);
      assert.equal(Math.round(zScoreToPercentile(1.036)), 85);
      assert.equal(Math.round(zScoreToPercentile(-1.036)), 15);
      assert.equal(Math.round(zScoreToPercentile(1.881)), 97);
      assert.equal(Math.round(zScoreToPercentile(-1.881)), 3);
    });

    it('rejects out-of-range ages without fabricating LMS values', () => {
      const score = calculateGrowthZScoreAndPercentile({
        metric: 'WEIGHT_FOR_AGE',
        gender: 'FEMALE',
        ageInMonths: 75, // > 60 months
        measurementValue: 22.0,
      });

      assert.equal(score.status, 'OUT_OF_REFERENCE_RANGE');
      assert.equal(score.zScore, null);
      assert.equal(score.percentile, null);
    });
  });

  describe('Full Pediatric Growth Record Evaluation', () => {
    it('evaluates comprehensive pediatric growth and generates appropriate alerts', () => {
      const birthDate = new Date('2025-06-01T00:00:00Z');
      const measurementDate = new Date('2026-06-01T00:00:00Z'); // 12 months
      const result = evaluatePediatricGrowth({
        birthDate,
        measurementDate,
        gender: 'MALE',
        weightKg: 6.5, // Severely underweight at 12m
        statureCm: 75.5, // Normal length
        headCircumferenceCm: 46.0, // Normal HC
      });

      assert.equal(result.chronologicalAge.days, 365);
      assert.equal(result.recommendedStatureMethod, 'RECUMBENT_LENGTH');
      assert(result.weightForAge.zScore !== null && result.weightForAge.zScore < -2.5);
      assert(result.lengthForAge.zScore !== null && Math.abs(result.lengthForAge.zScore) < 0.5);
      assert(result.headCircumferenceForAge.zScore !== null && Math.abs(result.headCircumferenceForAge.zScore) < 0.5);

      // Verify clinical alert for underweight
      assert(result.clinicalAlerts.some((a) => a.includes('UNDERWEIGHT')));
    });
  });
});

describe('Pediatric Medication Safety Preflight Engine', () => {
  const birthDate = new Date('2020-01-01T00:00:00Z'); // ~6 years old child

  describe('Weight Recency Boundary Validation', () => {
    it('flags CRITICAL when pediatric weight is completely missing', () => {
      const result = preflightPediatricMedicationSafety({
        patientId: 'p-synthetic-1',
        birthDate,
        medicationName: 'Amoxicillin 250mg/5ml',
        currentWeightKg: undefined,
        weightMeasuredAt: undefined,
      });

      assert.equal(result.isSafeToProceed, false);
      assert(result.alerts.some((a) => a.code === 'WEIGHT_REQUIRED_FOR_PEDIATRIC_DISPENSING'));
    });

    it('flags WARNING when child weight exceeds 30-day freshness limit', () => {
      const now = new Date('2026-06-01T00:00:00Z');
      const staleWeightDate = new Date('2026-04-15T00:00:00Z'); // 47 days old (> 30 days)

      const result = preflightPediatricMedicationSafety({
        patientId: 'p-synthetic-2',
        birthDate,
        evaluationDate: now,
        medicationName: 'Amoxicillin 250mg/5ml',
        currentWeightKg: 20.5,
        weightMeasuredAt: staleWeightDate,
      });

      assert(result.alerts.some((a) => a.code === 'WEIGHT_DOCUMENTATION_STALE'));
      assert.equal(result.weightRecency.status, 'STALE');
    });

    it('accepts current weight within cohort threshold', () => {
      const now = new Date('2026-06-01T00:00:00Z');
      const recentWeightDate = new Date('2026-05-20T00:00:00Z'); // 12 days old (< 30 days)

      const check = checkWeightRecency(birthDate, now, recentWeightDate);
      assert.equal(check.isAcceptable, true);
      assert.equal(check.status, 'CURRENT');
    });
  });

  describe('Pediatric Specific Contraindications & Warnings', () => {
    const freshWeightDate = new Date();

    it('blocks Aspirin in a child due to Reye Syndrome risk (CRITICAL)', () => {
      const result = preflightPediatricMedicationSafety({
        patientId: 'p-synthetic-3',
        birthDate, // 6 years
        medicationName: 'Aspirin 100mg tablets',
        currentWeightKg: 21.0,
        weightMeasuredAt: freshWeightDate,
      });

      assert.equal(result.isSafeToProceed, false);
      assert(result.alerts.some((a) => a.code === 'CONTRAINDICATION_REYES_SYNDROME'));
    });

    it('blocks Tetracyclines in children under 8 years due to tooth discoloration (CRITICAL)', () => {
      const result = preflightPediatricMedicationSafety({
        patientId: 'p-synthetic-4',
        birthDate, // 6 years (< 8 years)
        medicationName: 'Doxycycline 100mg capsules',
        currentWeightKg: 21.0,
        weightMeasuredAt: freshWeightDate,
      });

      assert.equal(result.isSafeToProceed, false);
      assert(result.alerts.some((a) => a.code === 'CONTRAINDICATION_DENTAL_STAINING'));
    });

    it('warns about Fluoroquinolones in pediatric patients due to cartilage toxicity (WARNING)', () => {
      const result = preflightPediatricMedicationSafety({
        patientId: 'p-synthetic-5',
        birthDate, // 6 years
        medicationName: 'Ciprofloxacin 250mg oral suspension',
        currentWeightKg: 21.0,
        weightMeasuredAt: freshWeightDate,
      });

      assert(result.alerts.some((a) => a.code === 'CONTRAINDICATION_CARTILAGE_TOXICITY'));
    });

    it('blocks Codeine in children under 12 years (CRITICAL)', () => {
      const result = preflightPediatricMedicationSafety({
        patientId: 'p-synthetic-6',
        birthDate, // 6 years (< 12 years)
        medicationName: 'Codeine phosphate syrup',
        currentWeightKg: 21.0,
        weightMeasuredAt: freshWeightDate,
      });

      assert.equal(result.isSafeToProceed, false);
      assert(result.alerts.some((a) => a.code === 'CONTRAINDICATION_RESPIRATORY_DEPRESSION'));
    });

    it('blocks Promethazine in infants under 2 years (CRITICAL)', () => {
      const infantBirth = new Date(Date.now() - 180 * 86400000); // 6 months old
      const result = preflightPediatricMedicationSafety({
        patientId: 'p-synthetic-7',
        birthDate: infantBirth,
        medicationName: 'Promethazine syrup',
        currentWeightKg: 7.5,
        weightMeasuredAt: freshWeightDate,
      });

      assert.equal(result.isSafeToProceed, false);
      assert(result.alerts.some((a) => a.code === 'CONTRAINDICATION_PROMETHAZINE_INFANT'));
    });

    it('blocks Ceftriaxone in neonates <= 28 days (CRITICAL)', () => {
      const neonateBirth = new Date(Date.now() - 10 * 86400000); // 10 days old
      const result = preflightPediatricMedicationSafety({
        patientId: 'p-synthetic-8',
        birthDate: neonateBirth,
        medicationName: 'Ceftriaxone 500mg IV',
        currentWeightKg: 3.2,
        weightMeasuredAt: freshWeightDate,
      });

      assert.equal(result.isSafeToProceed, false);
      assert(result.alerts.some((a) => a.code === 'CONTRAINDICATION_NEONATAL_CEFTRIAXONE'));
    });
  });

  describe('Pediatric Allergy & Cross-Reactivity Verification', () => {
    it('detects penicillin cross-reactivity with Augmentin/Amoxicillin', () => {
      const result = preflightPediatricMedicationSafety({
        patientId: 'p-synthetic-9',
        birthDate,
        medicationName: 'Augmentin 312.5mg/5ml suspension',
        currentWeightKg: 20.0,
        weightMeasuredAt: new Date(),
        allergies: [
          {
            id: 'alg-1',
            allergen: 'Penicillin',
            severity: 'SEVERE',
            clinicalStatus: 'ACTIVE',
          },
        ],
      });

      assert.equal(result.isSafeToProceed, false);
      assert(result.alerts.some((a) => a.code === 'ALLERGY_PENICILLIN_CROSS_REACTIVITY'));
    });
  });
});
