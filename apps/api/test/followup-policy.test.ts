import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { rolePermissions } from '../src/auth/permissions.js';
import {
  AmendFollowUpAssessmentDto,
  CompleteFollowUpAssessmentDto,
  FollowUpSeverityEnum,
  FollowUpStatusEnum,
  OutcomeMeasurementScaleEnum,
  RecordAdverseEventDto,
  RecordTreatmentOutcomeDto,
  ScheduleFollowUpDto,
  UpdateAdverseEventDto,
  UpdateFollowUpStatusDto,
} from '../src/clinical-followups/followup-input.js';

test('clinical follow-up and outcomes permissions are doctor-only and excluded from administrative and finance roles', () => {
  const followUpPermissions = [
    'clinical.follow-ups.read',
    'clinical.follow-ups.schedule',
    'clinical.follow-ups.update',
    'clinical.follow-ups.sign',
    'clinical.follow-ups.amend',
    'clinical.outcomes.read',
    'clinical.outcomes.record',
    'clinical.adverse-events.read',
    'clinical.adverse-events.record',
    'clinical.adverse-events.manage',
  ] as const;

  const doctorPerms = rolePermissions.DOCTOR;
  for (const perm of followUpPermissions) {
    assert.ok(doctorPerms.includes(perm), `DOCTOR must have ${perm}`);
  }

  const restrictedRoles = ['CLINIC_OWNER', 'CLINIC_ADMIN', 'RECEPTIONIST', 'ACCOUNTANT'] as const;
  for (const role of restrictedRoles) {
    const rolePerms = rolePermissions[role];
    for (const perm of followUpPermissions) {
      assert.ok(!rolePerms.includes(perm as any), `${role} must NOT have ${perm}`);
    }
  }
});

test('ScheduleFollowUpDto validates patientId, treatingDoctorMembershipId, date, and reason bounds', async () => {
  const valid = {
    patientId: randomUUID(),
    treatingDoctorMembershipId: randomUUID(),
    reason: 'متابعة ما بعد إجراء حقن الفيلر والتأكد من انحسار التورم',
    scheduledDate: '2026-11-05T10:00:00.000Z',
    recoveryInstructions: 'استخدام كمادات باردة والامتناع عن التعرض المباشر للحرارة',
  };

  const validInstance = plainToInstance(ScheduleFollowUpDto, valid);
  const errorsValid = await validate(validInstance);
  assert.equal(errorsValid.length, 0);

  // Missing patientId
  const invalidPatient = plainToInstance(ScheduleFollowUpDto, { ...valid, patientId: 'not-a-uuid' });
  const errorsPatient = await validate(invalidPatient);
  assert.ok(errorsPatient.some((e) => e.property === 'patientId'));

  // Missing doctor
  const invalidDoctor = plainToInstance(ScheduleFollowUpDto, { ...valid, treatingDoctorMembershipId: '' });
  const errorsDoctor = await validate(invalidDoctor);
  assert.ok(errorsDoctor.some((e) => e.property === 'treatingDoctorMembershipId'));

  // Short reason (< 3 chars)
  const shortReason = plainToInstance(ScheduleFollowUpDto, { ...valid, reason: 'م' });
  const errorsReason = await validate(shortReason);
  assert.ok(errorsReason.some((e) => e.property === 'reason'));

  // Invalid date
  const invalidDate = plainToInstance(ScheduleFollowUpDto, { ...valid, scheduledDate: 'invalid-date' });
  const errorsDate = await validate(invalidDate);
  assert.ok(errorsDate.some((e) => e.property === 'scheduledDate'));

  // Oversized instructions
  const longInstructions = plainToInstance(ScheduleFollowUpDto, {
    ...valid,
    recoveryInstructions: 'x'.repeat(2001),
  });
  const errorsInstructions = await validate(longInstructions);
  assert.ok(errorsInstructions.some((e) => e.property === 'recoveryInstructions'));
});

test('UpdateFollowUpStatusDto validates status enum, cancelReason, and expectedVersion', async () => {
  const valid = {
    status: FollowUpStatusEnum.CANCELLED,
    cancelReason: 'اعتذار المريض وتأجيل الموعد لأسباب سفر',
    expectedVersion: 1,
  };

  const validInstance = plainToInstance(UpdateFollowUpStatusDto, valid);
  const errorsValid = await validate(validInstance);
  assert.equal(errorsValid.length, 0);

  // Invalid status
  const invalidStatus = plainToInstance(UpdateFollowUpStatusDto, { ...valid, status: 'DONE' });
  const errorsStatus = await validate(invalidStatus);
  assert.ok(errorsStatus.some((e) => e.property === 'status'));

  // Non-positive version
  const invalidVersion = plainToInstance(UpdateFollowUpStatusDto, { ...valid, expectedVersion: 0 });
  const errorsVersion = await validate(invalidVersion);
  assert.ok(errorsVersion.some((e) => e.property === 'expectedVersion'));
});

test('CompleteFollowUpAssessmentDto validates structured clinical fields and expectedVersion', async () => {
  const valid = {
    symptomsObserved: 'تحسن ملحوظ واختفاء الكدمات الخفيفة',
    healingProgress: 'التئام طبيعي وممتاز دون علامات التهاب',
    clinicalNotes: 'تمت معاينة موضع الحقن، النتيجة متناسقة والتوصية بمراجعة بعد ٣ أشهر',
    expectedVersion: 1,
  };

  const validInstance = plainToInstance(CompleteFollowUpAssessmentDto, valid);
  const errorsValid = await validate(validInstance);
  assert.equal(errorsValid.length, 0);

  // Short symptoms (< 2 chars)
  const shortSymptoms = plainToInstance(CompleteFollowUpAssessmentDto, { ...valid, symptomsObserved: 'a' });
  const errorsSymptoms = await validate(shortSymptoms);
  assert.ok(errorsSymptoms.some((e) => e.property === 'symptomsObserved'));

  // Oversized notes (> 4000 chars)
  const longNotes = plainToInstance(CompleteFollowUpAssessmentDto, { ...valid, clinicalNotes: 'x'.repeat(4001) });
  const errorsNotes = await validate(longNotes);
  assert.ok(errorsNotes.some((e) => e.property === 'clinicalNotes'));
});

test('AmendFollowUpAssessmentDto requires substantial amendment reason and content', async () => {
  const valid = {
    amendmentReason: 'إضافة توضيح بخصوص فحص الحساسية اللاحق',
    amendedContent: 'تم تأكيد عدم وجود أي رد فعل تحسسي متأخر في الفحص السريري المباشر',
  };

  const validInstance = plainToInstance(AmendFollowUpAssessmentDto, valid);
  const errorsValid = await validate(validInstance);
  assert.equal(errorsValid.length, 0);

  // Weak/short amendment reason (< 5 chars)
  const weakReason = plainToInstance(AmendFollowUpAssessmentDto, { ...valid, amendmentReason: 'تعد' });
  const errorsReason = await validate(weakReason);
  assert.ok(errorsReason.some((e) => e.property === 'amendmentReason'));
});

test('RecordTreatmentOutcomeDto validates scale enum and numeric scores', async () => {
  const valid = {
    patientId: randomUUID(),
    measurementScale: OutcomeMeasurementScaleEnum.VISUAL_ANALOG_SCALE_10,
    clinicianScore: 8.5,
    clinicianNotes: 'تحسن سريري بنسبة تقييم ٨.٥ من ١٠',
    patientReportedScore: 9,
    patientReportedNotes: 'المريضة تشعر بارتياح كبير للنتيجة',
    recordedAt: '2026-11-05T11:00:00.000Z',
  };

  const validInstance = plainToInstance(RecordTreatmentOutcomeDto, valid);
  const errorsValid = await validate(validInstance);
  assert.equal(errorsValid.length, 0);

  // Invalid scale
  const invalidScale = plainToInstance(RecordTreatmentOutcomeDto, { ...valid, measurementScale: 'PERCENTAGE_GUESS' });
  const errorsScale = await validate(invalidScale);
  assert.ok(errorsScale.some((e) => e.property === 'measurementScale'));

  // Non-numeric score
  const nonNumeric = plainToInstance(RecordTreatmentOutcomeDto, { ...valid, clinicianScore: 'high' as any });
  const errorsNonNumeric = await validate(nonNumeric);
  assert.ok(errorsNonNumeric.some((e) => e.property === 'clinicianScore'));
});

test('RecordAdverseEventDto enforces severity enum, observationDate, and findings bounds', async () => {
  const valid = {
    patientId: randomUUID(),
    eventType: 'تجمع دموي موضعي خفيف',
    severity: FollowUpSeverityEnum.MILD,
    observationDate: '2026-11-05T12:00:00.000Z',
    documentedFindings: 'لوحظ احمرار طفيف وتورم موضعي في موضع الحقن الأيمن دون علامات عدوى',
    escalationNotes: 'لا حاجة لتدخل جراحي، وصف مرهم موضعي للمتابعة',
  };

  const validInstance = plainToInstance(RecordAdverseEventDto, valid);
  const errorsValid = await validate(validInstance);
  assert.equal(errorsValid.length, 0);

  // Invalid severity
  const invalidSev = plainToInstance(RecordAdverseEventDto, { ...valid, severity: 'CRITICAL' });
  const errorsSev = await validate(invalidSev);
  assert.ok(errorsSev.some((e) => e.property === 'severity'));

  // Short findings (< 5 chars)
  const shortFindings = plainToInstance(RecordAdverseEventDto, { ...valid, documentedFindings: 'ألم' });
  const errorsFindings = await validate(shortFindings);
  assert.ok(errorsFindings.some((e) => e.property === 'documentedFindings'));
});

test('UpdateAdverseEventDto validates status transitions and optimistic versioning', async () => {
  const valid = {
    status: 'RESOLVED' as any,
    escalationNotes: 'تم حل الأعراض بالكامل واختفاء التورم في المراجعة السريرية',
    expectedVersion: 1,
  };

  const validInstance = plainToInstance(UpdateAdverseEventDto, valid);
  const errorsValid = await validate(validInstance);
  assert.equal(errorsValid.length, 0);

  // Invalid status
  const invalidStatus = plainToInstance(UpdateAdverseEventDto, { ...valid, status: 'CLOSED' });
  const errorsStatus = await validate(invalidStatus);
  assert.ok(errorsStatus.some((e) => e.property === 'status'));
});
