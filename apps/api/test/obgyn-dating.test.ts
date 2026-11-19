import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateEddByLmp,
  calculateGestationalAgeFromCrl,
  calculateEddByUltrasound,
  calculateGestationalAgeAtDate,
  evaluateDatingDiscrepancy,
  evaluatePreEclampsiaScreen,
  toUtcDateOnly,
  addUtcDays,
  diffUtcDays,
} from '../src/obgyn/obgyn-dating.js';

describe('Obstetric Dating & Clinical Antenatal Analytics Engine', () => {
  describe('1. Timezone-Safe UTC Date Helpers', () => {
    test('toUtcDateOnly strips time and retains exact UTC calendar day', () => {
      const d = toUtcDateOnly('2026-05-15T23:59:59.999Z');
      assert.equal(d.getUTCFullYear(), 2026);
      assert.equal(d.getUTCMonth(), 4); // 0-indexed May
      assert.equal(d.getUTCDate(), 15);
      assert.equal(d.getUTCHours(), 0);
    });

    test('addUtcDays adds days without clock drift or leap year failure', () => {
      // Leap year 2024: Feb 28 + 1 day = Feb 29
      const d1 = new Date(Date.UTC(2024, 1, 28));
      const nextDay = addUtcDays(d1, 1);
      assert.equal(nextDay.getUTCDate(), 29);
      assert.equal(nextDay.getUTCMonth(), 1);

      // Non-leap year 2025: Feb 28 + 1 day = March 1
      const d2 = new Date(Date.UTC(2025, 1, 28));
      const marchDay = addUtcDays(d2, 1);
      assert.equal(marchDay.getUTCDate(), 1);
      assert.equal(marchDay.getUTCMonth(), 2);
    });

    test('diffUtcDays computes exact integer day difference across years', () => {
      const start = new Date(Date.UTC(2026, 0, 1));
      const end = new Date(Date.UTC(2026, 0, 15));
      assert.equal(diffUtcDays(start, end), 14);
    });
  });

  describe('2. Naegele Rule: LMP Gestational Dating', () => {
    test('calculates exact 280-day gestational EDD from LMP', () => {
      // LMP: January 1, 2026 -> +280 days = October 8, 2026
      const lmp = '2026-01-01';
      const edd = calculateEddByLmp(lmp);
      assert.equal(edd.toISOString().slice(0, 10), '2026-10-08');
      assert.equal(diffUtcDays(toUtcDateOnly(lmp), edd), 280);
    });

    test('correctly traverses leap year boundaries', () => {
      // LMP: November 1, 2023 -> year 2024 has Feb 29 -> +280 days = August 7, 2024
      const lmp = '2023-11-01';
      const edd = calculateEddByLmp(lmp);
      assert.equal(edd.toISOString().slice(0, 10), '2024-08-07');
      assert.equal(diffUtcDays(toUtcDateOnly(lmp), edd), 280);
    });
  });

  describe('3. First Trimester Ultrasound Dating (Robinson-Fleming CRL)', () => {
    test('calculates accurate gestational age from CRL in valid range', () => {
      // CRL 10 mm (~7w0d / ~49 days)
      const res10 = calculateGestationalAgeFromCrl(10);
      assert.equal(res10.weeks, 7);
      assert.equal(res10.days, 0);
      assert.equal(res10.totalDays, 49);
      assert.equal(res10.formattedAr, '7+0 أسابيع');

      // CRL 45 mm (~11w1d / ~78 days)
      const res45 = calculateGestationalAgeFromCrl(45);
      assert.equal(res45.weeks, 11);
      assert.equal(res45.days, 1);
      assert.equal(res45.totalDays, 78);
      assert.equal(res45.formattedEn, '11w 1d');

      // CRL 84 mm (~14w0d / 98 days)
      const res84 = calculateGestationalAgeFromCrl(84);
      assert.equal(res84.weeks, 14);
      assert.equal(res84.days, 0);
      assert.equal(res84.totalDays, 98);
    });

    test('rejects CRL outside the clinically validated first-trimester range (10-84 mm)', () => {
      assert.throws(() => calculateGestationalAgeFromCrl(8), /outside the valid first-trimester dating range/);
      assert.throws(() => calculateGestationalAgeFromCrl(95), /outside the valid first-trimester dating range/);
    });

    test('calculates EDD by ultrasound from scan date and CRL GA', () => {
      // Scan date: Feb 1, 2026. GA = 70 days (10w0d). Remaining = 210 days -> EDD = Aug 30, 2026
      const scanDate = '2026-02-01';
      const gaDays = 70;
      const usEdd = calculateEddByUltrasound(scanDate, gaDays);
      assert.equal(usEdd.toISOString().slice(0, 10), '2026-08-30');
      assert.equal(diffUtcDays(toUtcDateOnly(scanDate), usEdd), 210);
    });
  });

  describe('4. Gestational Age Calculation at Encounter / Target Date', () => {
    test('calculates current GA in weeks and days accurately', () => {
      // EDD: October 10, 2026 (Day 280)
      // Visit date: August 1, 2026 (70 days before EDD -> GA = 210 days = 30w 0d)
      const edd = '2026-10-10';
      const visitDate = '2026-08-01';
      const ga = calculateGestationalAgeAtDate(edd, visitDate);
      assert.equal(ga.weeks, 30);
      assert.equal(ga.days, 0);
      assert.equal(ga.totalDays, 210);
      assert.equal(ga.formattedAr, '30+0 أسابيع');
    });

    test('calculates early gestational age at booking visit', () => {
      // EDD: October 10, 2026. Visit: March 7, 2026 (217 days before EDD -> GA = 63 days = 9w 0d)
      const edd = '2026-10-10';
      const visitDate = '2026-03-07';
      const ga = calculateGestationalAgeAtDate(edd, visitDate);
      assert.equal(ga.weeks, 9);
      assert.equal(ga.days, 0);
      assert.equal(ga.totalDays, 63);
    });
  });

  describe('5. Dating Discrepancy & Redating Guidelines (ACOG/SOGC)', () => {
    test('retains certain LMP dating when discrepancy is <= 7 days in first trimester', () => {
      const lmpEdd = '2026-10-10';
      const usEdd = '2026-10-15'; // 5 days discrepancy
      const evalRes = evaluateDatingDiscrepancy(lmpEdd, usEdd, 10, true);
      assert.equal(evalRes.discrepancyDays, 5);
      assert.equal(evalRes.exceedsThreshold, false);
      assert.equal(evalRes.recommendedMethod, 'LMP_CERTAIN');
      assert(evalRes.clinicalRationaleAr.includes('ضمن الحد المقبول'));
    });

    test('recommends ultrasound redating when discrepancy > 7 days in first trimester', () => {
      const lmpEdd = '2026-10-10';
      const usEdd = '2026-10-22'; // 12 days discrepancy
      const evalRes = evaluateDatingDiscrepancy(lmpEdd, usEdd, 11, true);
      assert.equal(evalRes.discrepancyDays, 12);
      assert.equal(evalRes.exceedsThreshold, true);
      assert.equal(evalRes.recommendedMethod, 'ULTRASOUND_FIRST_TRIMESTER');
      assert(evalRes.clinicalRationaleAr.includes('يتجاوز الحد المسموح به'));
    });

    test('forces ultrasound dating when LMP is clinically uncertain', () => {
      const lmpEdd = '2026-10-10';
      const usEdd = '2026-10-12'; // 2 days discrepancy, but LMP uncertain
      const evalRes = evaluateDatingDiscrepancy(lmpEdd, usEdd, 9, false);
      assert.equal(evalRes.exceedsThreshold, true);
      assert.equal(evalRes.recommendedMethod, 'ULTRASOUND_FIRST_TRIMESTER');
      assert(evalRes.clinicalRationaleAr.includes('تاريخ الدورة الشهرية غير مؤكد'));
    });

    test('applies 10-day threshold for mid-pregnancy (16-22 weeks)', () => {
      const lmpEdd = '2026-10-10';
      const usEdd = '2026-10-19'; // 9 days discrepancy
      const evalRes = evaluateDatingDiscrepancy(lmpEdd, usEdd, 18, true);
      assert.equal(evalRes.thresholdDays, 10);
      assert.equal(evalRes.exceedsThreshold, false);
      assert.equal(evalRes.recommendedMethod, 'LMP_CERTAIN');
    });
  });

  describe('6. Maternal Vital Signs & Pre-Eclampsia Screening', () => {
    test('returns negative screen for normotensive maternal vitals without proteinuria', () => {
      const screen = evaluatePreEclampsiaScreen(118, 76, 'NEGATIVE');
      assert.equal(screen.isAlert, false);
      assert.equal(screen.severity, 'NONE');
      assert.equal(screen.category, 'NORMAL_BLOOD_PRESSURE');
      assert.equal(screen.flags.length, 0);
      assert(screen.clinicalDisclaimerAr.includes('تنبيه دعم سريري استرشادي'));
      assert(screen.clinicalDisclaimerEn.includes('advisory screening indicator'));
    });

    test('flags mild hypertension when systolic >= 140 or diastolic >= 90 without proteinuria', () => {
      const screen = evaluatePreEclampsiaScreen(144, 88, 'NEGATIVE', { gestationalAgeWeeks: 28 });
      assert.equal(screen.isAlert, true);
      assert.equal(screen.severity, 'MILD_HYPERTENSION');
      assert.equal(screen.category, 'GESTATIONAL_HYPERTENSION_RISK');
      assert(screen.flags.includes('ELEVATED_MATERNAL_BLOOD_PRESSURE'));
      assert(screen.recommendationsAr.some((r) => r.includes('إعادة القياس')));
    });

    test('flags severe pre-eclampsia risk on severe hypertension (>=160/110) with proteinuria', () => {
      const screen = evaluatePreEclampsiaScreen(165, 112, 'PLUS_2', { gestationalAgeWeeks: 34 });
      assert.equal(screen.isAlert, true);
      assert.equal(screen.severity, 'SEVERE_PREECLAMPSIA_RISK');
      assert.equal(screen.category, 'SUSPECTED_PREECLAMPSIA_PROTEINURIC');
      assert(screen.flags.includes('CRITICAL_SEVERE_MATERNAL_HYPERTENSION'));
      assert(screen.flags.includes('SIGNIFICANT_PROTEINURIA'));
      assert(screen.recommendationsAr.some((r) => r.includes('عاجلة') || r.includes('عاجلاً')));
    });

    test('identifies non-proteinuric preeclampsia with severe features (ACOG/ISSHP standards)', () => {
      // Patient with BP 148/94, NEGATIVE urine dipstick, but new-onset severe headache and visual changes at 32 weeks
      const screen = evaluatePreEclampsiaScreen(148, 94, 'NEGATIVE', {
        gestationalAgeWeeks: 32,
        hasSevereHeadache: true,
        hasVisualDisturbances: true,
      });

      assert.equal(screen.isAlert, true);
      assert.equal(screen.severity, 'SEVERE_PREECLAMPSIA_RISK');
      assert.equal(screen.category, 'SUSPECTED_PREECLAMPSIA_NON_PROTEINURIC');
      assert(screen.flags.includes('ELEVATED_MATERNAL_BLOOD_PRESSURE'));
      assert(screen.flags.includes('NEW_ONSET_SEVERE_PERSISTENT_HEADACHE'));
      assert(screen.flags.includes('VISUAL_DISTURBANCES_SCOTOMATA'));
      assert(screen.recommendationsEn.some((r) => r.includes('Non-proteinuric preeclampsia')));
    });

    test('identifies non-proteinuric preeclampsia with thrombocytopenia or impaired liver function', () => {
      const screen = evaluatePreEclampsiaScreen(142, 92, 'NEGATIVE', {
        gestationalAgeWeeks: 28,
        hasThrombocytopenia: true,
        hasImpairedLiverFunction: true,
      });

      assert.equal(screen.isAlert, true);
      assert.equal(screen.severity, 'SEVERE_PREECLAMPSIA_RISK');
      assert.equal(screen.category, 'SUSPECTED_PREECLAMPSIA_NON_PROTEINURIC');
      assert(screen.flags.includes('THROMBOCYTOPENIA_PLATELETS_UNDER_100K'));
      assert(screen.flags.includes('IMPAIRED_LIVER_TRANSAMINASES_ELEVATED'));
    });

    test('treats dipstick 1+ as qualitative indicator requiring quantitative UPCR confirmation', () => {
      const screen = evaluatePreEclampsiaScreen(146, 92, 'PLUS_1', { gestationalAgeWeeks: 30 });
      assert.equal(screen.isAlert, true);
      assert.equal(screen.category, 'SUSPECTED_PREECLAMPSIA_PROTEINURIC');
      assert(screen.recommendationsEn.some((r) => r.includes('UPCR >= 0.3 or 24-hr urine >= 300 mg')));
      assert(screen.recommendationsAr.some((r) => r.includes('مؤشراً استرشادياً')));
    });

    test('distinguishes chronic hypertension suspected prior to 20 weeks gestation', () => {
      // Patient at 14 weeks with elevated blood pressure
      const screen = evaluatePreEclampsiaScreen(144, 92, 'NEGATIVE', { gestationalAgeWeeks: 14 });
      assert.equal(screen.isAlert, true);
      assert.equal(screen.severity, 'MILD_HYPERTENSION');
      assert.equal(screen.category, 'CHRONIC_HYPERTENSION_SUSPECTED');
      assert(screen.recommendationsEn.some((r) => r.includes('suggests pre-existing chronic hypertension')));
      assert(screen.recommendationsAr.some((r) => r.includes('ضغط دم مزمن')));
    });

    test('identifies isolated proteinuria with normal blood pressure', () => {
      const screen = evaluatePreEclampsiaScreen(116, 74, 'PLUS_2', { gestationalAgeWeeks: 26 });
      assert.equal(screen.isAlert, true);
      assert.equal(screen.category, 'ISOLATED_PROTEINURIA');
      assert(screen.flags.includes('SIGNIFICANT_PROTEINURIA'));
      assert(screen.recommendationsEn.some((r) => r.includes('urinary tract infection and renal etiology')));
    });
  });
});
