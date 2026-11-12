import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  SignPortalConsentDto,
  RefusePortalConsentDto,
  WithdrawPortalConsentDto,
  CreateRecoveryCheckInDto,
  SubmitPatientOutcomeDto,
  ReviewRecoveryCheckInDto,
} from '../src/portal/patient-portal.dto.js';

test('consent policy: SignPortalConsentDto enforces signerCapacity PATIENT only', async () => {
  const valid = plainToInstance(SignPortalConsentDto, {
    expectedVersion: 1,
    signerCapacity: 'PATIENT',
    signatureType: 'TYPED_CONFIRMATION',
    signatureData: 'Patient Full Name',
  });
  const errsValid = await validate(valid);
  assert.equal(errsValid.length, 0);

  const invalidCapacity = plainToInstance(SignPortalConsentDto, {
    expectedVersion: 1,
    signerCapacity: 'LEGAL_REPRESENTATIVE',
    signatureType: 'TYPED_CONFIRMATION',
    signatureData: 'Representative Name',
  });
  const errsInvalid = await validate(invalidCapacity);
  assert.ok(errsInvalid.length > 0, 'Must reject signerCapacity other than PATIENT');
  assert.ok(errsInvalid.some((e) => e.property === 'signerCapacity'));
});

test('consent policy: Refuse and Withdraw DTOs require positive expectedVersion and non-empty reason', async () => {
  const validRefuse = plainToInstance(RefusePortalConsentDto, {
    expectedVersion: 2,
    reason: 'أرغب في استشارة طبيب آخر أولاً',
  });
  const errsRefuse = await validate(validRefuse);
  assert.equal(errsRefuse.length, 0);

  const emptyRefuse = plainToInstance(RefusePortalConsentDto, {
    expectedVersion: 0,
    reason: '',
  });
  const errsEmpty = await validate(emptyRefuse);
  assert.ok(errsEmpty.length >= 2);

  const validWithdraw = plainToInstance(WithdrawPortalConsentDto, {
    expectedVersion: 3,
    reason: 'تم التراجع عن إجراء الحقن التجميلي',
  });
  const errsWithdraw = await validate(validWithdraw);
  assert.equal(errsWithdraw.length, 0);
});

test('recovery check-in policy: CreateRecoveryCheckInDto validates painScore VAS 0 to 10', async () => {
  const validCheckIn = plainToInstance(CreateRecoveryCheckInDto, {
    painScore: 5,
    symptoms: { mild_swelling: true },
    recoveryNotes: 'تورم خفيف بعد الجلسة',
  });
  const errs = await validate(validCheckIn);
  assert.equal(errs.length, 0);

  const outOfBoundsNegative = plainToInstance(CreateRecoveryCheckInDto, {
    painScore: -1,
  });
  const errsNeg = await validate(outOfBoundsNegative);
  assert.ok(errsNeg.some((e) => e.property === 'painScore'));

  const outOfBoundsHigh = plainToInstance(CreateRecoveryCheckInDto, {
    painScore: 11,
  });
  const errsHigh = await validate(outOfBoundsHigh);
  assert.ok(errsHigh.some((e) => e.property === 'painScore'));
});

test('patient outcome policy: SubmitPatientOutcomeDto validates measurement scale and score bounds', async () => {
  const validOutcome = plainToInstance(SubmitPatientOutcomeDto, {
    measurementScale: 'PATIENT_SATISFACTION_5_POINT',
    score: 5,
    notes: 'راضية جدا عن الخدمة',
  });
  const errs = await validate(validOutcome);
  assert.equal(errs.length, 0);

  const invalidScale = plainToInstance(SubmitPatientOutcomeDto, {
    measurementScale: 'UNKNOWN_SCALE',
    score: 5,
  });
  const errsScale = await validate(invalidScale);
  assert.ok(errsScale.some((e) => e.property === 'measurementScale'));
});

test('clinician review policy: ReviewRecoveryCheckInDto validates expectedVersion and status', async () => {
  const validReview = plainToInstance(ReviewRecoveryCheckInDto, {
    expectedVersion: 1,
    status: 'REVIEWED',
    clinicianNotes: 'تمت مراجعة الحالة والتأكد من استقرار المريض وصرف مسكن إضافي',
  });
  const errs = await validate(validReview);
  assert.equal(errs.length, 0);

  const invalidReview = plainToInstance(ReviewRecoveryCheckInDto, {
    expectedVersion: 0,
    status: 'INVALID_STATUS',
  });
  const errsInvalid = await validate(invalidReview);
  assert.ok(errsInvalid.length >= 2);
  assert.ok(errsInvalid.some((e) => e.property === 'expectedVersion'));
  assert.ok(errsInvalid.some((e) => e.property === 'status'));
});
