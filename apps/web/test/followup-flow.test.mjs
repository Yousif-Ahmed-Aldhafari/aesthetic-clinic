import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ADVERSE_EVENT_STATUS_META,
  FOLLOWUP_STATUS_META,
  MEASUREMENT_SCALES,
  SEVERITY_META,
  formatArabicDateTime,
  validateScoreForScale,
} from '../src/features/clinical-followups/followup-logic.ts';

test('validateScoreForScale validates scores against medical scale boundaries', () => {
  // 1. VISUAL_ANALOG_SCALE_10: 0 to 10
  assert.equal(validateScoreForScale('VISUAL_ANALOG_SCALE_10', 0).valid, true);
  assert.equal(validateScoreForScale('VISUAL_ANALOG_SCALE_10', 5.5).valid, true);
  assert.equal(validateScoreForScale('VISUAL_ANALOG_SCALE_10', 10).valid, true);
  assert.equal(validateScoreForScale('VISUAL_ANALOG_SCALE_10', -1).valid, false);
  assert.equal(validateScoreForScale('VISUAL_ANALOG_SCALE_10', 10.1).valid, false);
  assert.equal(validateScoreForScale('VISUAL_ANALOG_SCALE_10', null).valid, false);

  // 2. PATIENT_SATISFACTION_5_POINT: 1 to 5
  assert.equal(validateScoreForScale('PATIENT_SATISFACTION_5_POINT', 1).valid, true);
  assert.equal(validateScoreForScale('PATIENT_SATISFACTION_5_POINT', 5).valid, true);
  assert.equal(validateScoreForScale('PATIENT_SATISFACTION_5_POINT', 0).valid, false);
  assert.equal(validateScoreForScale('PATIENT_SATISFACTION_5_POINT', 6).valid, false);

  // 3. CLINICAL_GLOBAL_IMPRESSION: 1 to 7
  assert.equal(validateScoreForScale('CLINICAL_GLOBAL_IMPRESSION', 1).valid, true);
  assert.equal(validateScoreForScale('CLINICAL_GLOBAL_IMPRESSION', 7).valid, true);
  assert.equal(validateScoreForScale('CLINICAL_GLOBAL_IMPRESSION', 0).valid, false);
  assert.equal(validateScoreForScale('CLINICAL_GLOBAL_IMPRESSION', 8).valid, false);

  // 4. STRUCTURED_OBSERVATION: no score required
  assert.equal(validateScoreForScale('STRUCTURED_OBSERVATION', null).valid, true);
  assert.equal(validateScoreForScale('STRUCTURED_OBSERVATION', undefined).valid, true);
});

test('FOLLOWUP_STATUS_META correctly identifies terminal vs transitionable lifecycle states', () => {
  assert.equal(FOLLOWUP_STATUS_META.SCHEDULED.isTerminal, false);
  assert.equal(FOLLOWUP_STATUS_META.IN_PROGRESS.isTerminal, false);
  assert.equal(FOLLOWUP_STATUS_META.COMPLETED.isTerminal, true);
  assert.equal(FOLLOWUP_STATUS_META.CANCELLED.isTerminal, true);
  assert.equal(FOLLOWUP_STATUS_META.MISSED.isTerminal, true);

  // Arabic labels exist
  assert.ok(FOLLOWUP_STATUS_META.SCHEDULED.label.length > 0);
  assert.ok(FOLLOWUP_STATUS_META.IN_PROGRESS.label.length > 0);
  assert.ok(FOLLOWUP_STATUS_META.COMPLETED.label.length > 0);
});

test('Adverse event and severity meta define complete classifications', () => {
  assert.equal(SEVERITY_META.MILD.label, 'خفيفة / عارضة');
  assert.equal(SEVERITY_META.MODERATE.label, 'متوسطة');
  assert.equal(SEVERITY_META.SEVERE.label, 'شديدة / تستوجب تدخلاً');

  assert.ok(ADVERSE_EVENT_STATUS_META.REPORTED.badgeClass);
  assert.ok(ADVERSE_EVENT_STATUS_META.UNDER_EVALUATION.badgeClass);
  assert.ok(ADVERSE_EVENT_STATUS_META.RESOLVED.badgeClass);
  assert.ok(ADVERSE_EVENT_STATUS_META.ESCALATED.badgeClass);
});

test('formatArabicDateTime handles valid and invalid inputs gracefully', () => {
  const formatted = formatArabicDateTime('2026-11-06T10:00:00.000Z');
  assert.ok(formatted.length > 0);
  assert.equal(formatArabicDateTime(null), '—');
  assert.equal(formatArabicDateTime(undefined), '—');
});
