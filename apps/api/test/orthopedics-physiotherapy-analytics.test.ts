import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateRomDeficit,
  describeMrcGrade,
  calculatePainDelta,
  calculateOdiScore,
  calculateQuickDashScore,
  calculateLysholmScore,
} from '../src/orthopedics-physiotherapy/orthopedics-physiotherapy-analytics.js';

describe('Orthopedics & Physiotherapy Clinical Analytics Engine', () => {
  describe('1. Range of Motion (ROM) & Deficit Analytics (AAOS Norms)', () => {
    it('evaluates full/normal range of motion for knee flexion (140°)', () => {
      const res = evaluateRomDeficit('KNEE', 'FLEXION', 140);
      assert.equal(res.measuredDegrees, 140);
      assert.equal(res.normalDegrees, 140);
      assert.equal(res.deficitFromNormalDegrees, 0);
      assert.equal(res.deficitFromNormalPercent, 0);
      assert.equal(res.meetsFunctionalRequirement, true);
      assert.equal(res.severityEn, 'Full / Normal Range of Motion');
      assert.match(res.severityAr, /طبيعي/);
    });

    it('evaluates moderate knee flexion deficit without contralateral comparison', () => {
      // Knee flexion 95° vs normal 140°: deficit 45°, 45/140 = 32% (moderate)
      const res = evaluateRomDeficit('KNEE', 'FLEXION', 95);
      assert.equal(res.measuredDegrees, 95);
      assert.equal(res.normalDegrees, 140);
      assert.equal(res.deficitFromNormalDegrees, 45);
      assert.equal(res.deficitFromNormalPercent, 32);
      assert.equal(res.meetsFunctionalRequirement, false); // functional min is 110
      assert.equal(res.severityEn, 'Moderate Motion Deficit (21–40%)');
      assert.match(res.severityAr, /متوسط/);
    });

    it('evaluates motion deficit against contralateral healthy limb', () => {
      // Right shoulder abduction 110°, left (contralateral healthy) 170°
      const res = evaluateRomDeficit('SHOULDER', 'ABDUCTION', 110, 170);
      assert.equal(res.measuredDegrees, 110);
      assert.equal(res.contralateralDegrees, 170);
      assert.equal(res.deficitFromContralateralDegrees, 60);
      // 60 / 170 = 35% deficit (moderate)
      assert.equal(res.deficitFromContralateralPercent, 35);
      assert.equal(res.severityEn, 'Moderate Motion Deficit (21–40%)');
    });

    it('identifies severe motion deficit (> 40%)', () => {
      // Lumbar flexion 25° vs normal 60°: deficit 35°, 35/60 = 58%
      const res = evaluateRomDeficit('LUMBAR_SPINE', 'FLEXION', 25);
      assert.equal(res.deficitFromNormalPercent, 58);
      assert.ok(res.severityEn.includes('Severe Motion Deficit'));
      assert.match(res.severityAr, /شديد/);
    });
  });

  describe('2. MRC Muscle Strength Scale (0–5)', () => {
    it('returns accurate bilingual clinical descriptions for valid grades 0 through 5', () => {
      const g0 = describeMrcGrade(0);
      assert.ok(g0.en.includes('Complete paralysis'));
      assert.ok(g0.ar.includes('شلل تام'));

      const g3 = describeMrcGrade(3);
      assert.ok(g3.en.includes('against gravity'));
      assert.ok(g3.ar.includes('مضادة للجاذبية'));

      const g5 = describeMrcGrade(5);
      assert.ok(g5.en.includes('Normal power'));
      assert.ok(g5.ar.includes('طبيعية كاملة'));
    });

    it('fails closed and throws error on out-of-range or non-integer grades', () => {
      assert.throws(() => describeMrcGrade(-1), /Invalid MRC muscle strength grade/);
      assert.throws(() => describeMrcGrade(6), /Invalid MRC muscle strength grade/);
      assert.throws(() => describeMrcGrade(3.5), /Invalid MRC muscle strength grade/);
    });
  });

  describe('3. Visual Analogue Scale (VAS) Pain Comparison', () => {
    it('identifies clinically significant pain reduction post-session', () => {
      const res = calculatePainDelta(7, 3);
      assert.equal(res.delta, -4);
      assert.equal(res.improved, true);
      assert.equal(res.worsened, false);
      assert.equal(res.unchanged, false);
      assert.ok(res.descriptionEn.includes('Pain reduction of 4 points'));
      assert.ok(res.descriptionAr.includes('تحسن'));
    });

    it('identifies pain exacerbation requiring therapy adjustment', () => {
      const res = calculatePainDelta(2, 6);
      assert.equal(res.delta, 4);
      assert.equal(res.improved, false);
      assert.equal(res.worsened, true);
      assert.equal(res.unchanged, false);
      assert.ok(res.descriptionEn.includes('Pain increase of 4 points'));
      assert.ok(res.descriptionAr.includes('تفاقم'));
    });

    it('identifies stable pain level', () => {
      const res = calculatePainDelta(4, 4);
      assert.equal(res.delta, 0);
      assert.equal(res.improved, false);
      assert.equal(res.worsened, false);
      assert.equal(res.unchanged, true);
      assert.ok(res.descriptionEn.includes('unchanged'));
    });

    it('rejects VAS scores outside the 0–10 scale', () => {
      assert.throws(() => calculatePainDelta(-1, 5), /VAS pain scores must be integers between 0 and 10/);
      assert.throws(() => calculatePainDelta(5, 12), /VAS pain scores must be integers between 0 and 10/);
    });
  });

  describe('4. Oswestry Disability Index (ODI 2.0)', () => {
    it('calculates ODI percentage and category accurately for 10 answered sections', () => {
      // 10 sections with score 2 each -> total 20 / 50 = 40.0% (Moderate)
      const scores = [2, 2, 2, 2, 2, 2, 2, 2, 2, 2];
      const res = calculateOdiScore(scores);
      assert.ok(res);
      assert.equal(res.rawScore, 20);
      assert.equal(res.maxPossibleScore, 50);
      assert.equal(res.percentageScore, 40);
      assert.equal(res.severityCategory, 'MODERATE');
      assert.ok(res.descriptionEn.includes('Moderate disability'));
      assert.ok(res.descriptionAr.includes('معتدل'));
    });

    it('handles omitted section (e.g. sex life omitted, 9 sections answered)', () => {
      // 9 sections answered with score 1 each -> total 9 / (9*5=45) = 20.0% (Minimal)
      const scores = [1, 1, 1, 1, 1, 1, 1, 1, null, 1];
      const res = calculateOdiScore(scores);
      assert.ok(res);
      assert.equal(res.rawScore, 9);
      assert.equal(res.maxPossibleScore, 45);
      assert.equal(res.percentageScore, 20);
      assert.equal(res.severityCategory, 'MINIMAL');
    });

    it('fails closed (returns null) if fewer than 8 sections answered', () => {
      // Only 7 sections answered
      const scores = [2, 2, 2, 2, 2, 2, 2, null, null, null];
      const res = calculateOdiScore(scores);
      assert.equal(res, null);
    });

    it('classifies severe disability (41–60%) and crippled (61–80%)', () => {
      // Severe: score 25/50 = 50%
      const severeScores = [3, 3, 3, 3, 3, 2, 2, 2, 3, 4]; // 28/50 = 56%
      const severeRes = calculateOdiScore(severeScores);
      assert.ok(severeRes);
      assert.equal(severeRes.severityCategory, 'SEVERE');

      // Crippled: score 35/50 = 70%
      const crippledScores = [4, 4, 4, 3, 3, 3, 4, 3, 3, 4]; // 35/50 = 70%
      const crippledRes = calculateOdiScore(crippledScores);
      assert.ok(crippledRes);
      assert.equal(crippledRes.severityCategory, 'CRIPPLED');
    });
  });

  describe('5. QuickDASH Upper Extremity Score', () => {
    it('calculates QuickDASH score accurately with all 11 items answered', () => {
      // All items score 1 (no difficulty): ((11/11 - 1) * 25) = 0.0
      const noDisability = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1];
      const res0 = calculateQuickDashScore(noDisability);
      assert.ok(res0);
      assert.equal(res0.score, 0);
      assert.equal(res0.answeredCount, 11);
      assert.ok(res0.descriptionEn.includes('Minimal'));

      // All items score 3 (moderate difficulty): ((33/11 - 1) * 25) = (2 * 25) = 50.0
      const moderate = [3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3];
      const res50 = calculateQuickDashScore(moderate);
      assert.ok(res50);
      assert.equal(res50.score, 50);
      assert.ok(res50.descriptionEn.includes('Substantial'));
    });

    it('calculates score with 10 answered items (1 item missing)', () => {
      // 10 items answered with score 2: ((20/10 - 1) * 25) = (1 * 25) = 25.0
      const tenItems = [2, 2, 2, 2, 2, 2, 2, 2, 2, 2, null];
      const res = calculateQuickDashScore(tenItems);
      assert.ok(res);
      assert.equal(res.score, 25);
      assert.equal(res.answeredCount, 10);
      assert.ok(res.descriptionEn.includes('Moderate'));
    });

    it('fails closed (returns null) if fewer than 10 items answered', () => {
      // 9 items answered
      const nineItems = [2, 2, 2, 2, 2, 2, 2, 2, 2, null, null];
      const res = calculateQuickDashScore(nineItems);
      assert.equal(res, null);
    });
  });

  describe('6. Lysholm Knee Scoring Scale', () => {
    it('calculates Lysholm score accurately for excellent knee function (>= 95)', () => {
      const items = {
        limp: 5,
        support: 5,
        locking: 15,
        instability: 25,
        pain: 25,
        swelling: 10,
        stairClimbing: 10,
        squatting: 5,
      };
      const res = calculateLysholmScore(items);
      assert.ok(res);
      assert.equal(res.totalScore, 100);
      assert.equal(res.ratingCategory, 'EXCELLENT');
      assert.ok(res.descriptionEn.includes('Excellent'));
      assert.ok(res.descriptionAr.includes('ممتاز'));
    });

    it('classifies Good (84–94), Fair (65–83), and Poor (< 65)', () => {
      // Good: total = 84
      const goodRes = calculateLysholmScore({
        limp: 5, support: 5, locking: 10, instability: 20, pain: 20, swelling: 10, stairClimbing: 10, squatting: 4, // 5+5+10+20+20+10+10+4 = 84
      });
      assert.ok(goodRes);
      assert.equal(goodRes.ratingCategory, 'GOOD');

      // Fair: total = 70
      const fairRes = calculateLysholmScore({
        limp: 3, support: 2, locking: 6, instability: 15, pain: 20, swelling: 10, stairClimbing: 10, squatting: 4,
      });
      assert.ok(fairRes);
      assert.equal(fairRes.totalScore, 70);
      assert.equal(fairRes.ratingCategory, 'FAIR');

      // Poor: total = 50
      const poorRes = calculateLysholmScore({
        limp: 0, support: 0, locking: 2, instability: 10, pain: 15, swelling: 10, stairClimbing: 10, squatting: 3,
      });
      assert.ok(poorRes);
      assert.equal(poorRes.totalScore, 50);
      assert.equal(poorRes.ratingCategory, 'POOR');
    });

    it('fails closed on invalid or out-of-range Lysholm items', () => {
      // @ts-expect-error invalid input
      assert.equal(calculateLysholmScore(null), null);
      // Item score exceeding maximum domain limit
      assert.equal(calculateLysholmScore({
        limp: 10, // max is 5
        support: 5, locking: 15, instability: 25, pain: 25, swelling: 10, stairClimbing: 10, squatting: 5,
      }), null);
    });
  });
});
