import 'reflect-metadata';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import {
  CreateSafetyPolicyDto,
  CreatePolicyVersionDto,
  ApprovePolicyVersionDto,
  RollbackPolicyDto,
  ReportClinicalIncidentDto,
  InvestigateClinicalIncidentDto,
  RequestBreakGlassDto,
  ReviewBreakGlassDto,
  ConductPrivilegeReviewDto,
} from '../src/clinical-governance/clinical-governance.dto.js';
import { permissionsFor } from '../src/auth/permissions.js';

describe('Clinical Governance & Patient Safety Policy Unit Tests', () => {
  it('CreateSafetyPolicyDto: validates code, titleAr, category', async () => {
    const valid = plainToInstance(CreateSafetyPolicyDto, {
      code: 'POL-SAFE-001',
      titleAr: 'بروتوكول السلامة من الصدمة التأقية',
      titleEn: 'Anaphylaxis Emergency Response Protocol',
      category: 'ALLERGY_SAFETY',
      jurisdiction: 'KSA',
    });
    const errors = await validate(valid);
    assert.equal(errors.length, 0);

    // Invalid: empty titleAr
    const invalidTitle = plainToInstance(CreateSafetyPolicyDto, {
      code: 'POL-SAFE-001',
      titleAr: '',
      category: 'ALLERGY_SAFETY',
    });
    const titleErrors = await validate(invalidTitle);
    assert.ok(titleErrors.some((e) => e.property === 'titleAr'));

    // Invalid: unknown category
    const invalidCat = plainToInstance(CreateSafetyPolicyDto, {
      code: 'POL-SAFE-001',
      titleAr: 'بروتوكول',
      category: 'NON_EXISTENT_CATEGORY',
    });
    const catErrors = await validate(invalidCat);
    assert.ok(catErrors.some((e) => e.property === 'category'));
  });

  it('CreatePolicyVersionDto: requires changeSummary and rulesJson', async () => {
    const valid = plainToInstance(CreatePolicyVersionDto, {
      changeSummary: 'تحديث معايير الإنعاش القلبي الرئوي للأطفال والبالغين',
      rulesJson: { epinephrineDoseMg: 0.5, route: 'IM', checkIntervalMinutes: 5 },
    });
    const errors = await validate(valid);
    assert.equal(errors.length, 0);

    // Invalid: empty rulesJson
    const invalid = plainToInstance(CreatePolicyVersionDto, {
      changeSummary: 'تحديث',
      rulesJson: 'not-an-object',
    });
    const invErrors = await validate(invalid);
    assert.ok(invErrors.some((e) => e.property === 'rulesJson'));
  });

  it('ApprovePolicyVersionDto & RollbackPolicyDto validation', async () => {
    const approve = plainToInstance(ApprovePolicyVersionDto, {
      effectiveFrom: new Date().toISOString(),
    });
    assert.equal((await validate(approve)).length, 0);

    const rollback = plainToInstance(RollbackPolicyDto, {
      targetVersionNumber: 1,
      reason: 'الرجوع للإصدار السابق لعدم توفر المستحضر الدوائي البديل',
    });
    assert.equal((await validate(rollback)).length, 0);

    const invalidRollback = plainToInstance(RollbackPolicyDto, {
      targetVersionNumber: 0, // Must be >= 1
      reason: 'سبب',
    });
    const rbErrors = await validate(invalidRollback);
    assert.ok(rbErrors.some((e) => e.property === 'targetVersionNumber'));
  });

  it('ReportClinicalIncidentDto: validates severity, category, and description', async () => {
    const valid = plainToInstance(ReportClinicalIncidentDto, {
      severity: 'NEAR_MISS',
      category: 'MEDICATION_SAFETY',
      occurredAt: new Date().toISOString(),
      description: 'كادت الممرضة أن تعطي دواءً مشابهاً في الاسم لولا مراجعة الباركود الدوائي',
      immediateActionTaken: 'تم إيقاف صرف الدواء وإبلاغ الصيدلية المناوبة فوراً',
    });
    const errors = await validate(valid);
    assert.equal(errors.length, 0);

    const invalid = plainToInstance(ReportClinicalIncidentDto, {
      severity: 'INVALID_SEV',
      category: 'INVALID_CAT',
      description: '   ',
    });
    const invErrors = await validate(invalid);
    assert.ok(invErrors.some((e) => e.property === 'severity'));
    assert.ok(invErrors.some((e) => e.property === 'category'));
    assert.ok(invErrors.some((e) => e.property === 'description'));
  });

  it('InvestigateClinicalIncidentDto: validates status and findings', async () => {
    const valid = plainToInstance(InvestigateClinicalIncidentDto, {
      status: 'UNDER_INVESTIGATION',
      investigationFindings: 'تبين تشابه العبوات الدوائية في المستودع الفرعي',
      rootCauseAnalysis: 'خطأ في فرز الأدوية المتشابهة شكلاً ونطقاً (LASA)',
      correctiveActions: 'فصل الأدوية ووضع علامات تحذيرية ملونة',
    });
    const errors = await validate(valid);
    assert.equal(errors.length, 0);
  });

  it('RequestBreakGlassDto: enforces clinical justification >= 20 chars and duration bounds <= 120 mins', async () => {
    const valid = plainToInstance(RequestBreakGlassDto, {
      patientId: randomUUID(),
      clinicalJustification: 'حالة حرجة فاقدة للوعي تتطلب الاطلاع العاجل على سجل التحسس الدوائي والعمليات السابقة',
      durationMinutes: 60,
    });
    const errors = await validate(valid);
    assert.equal(errors.length, 0);

    // Too short justification (< 20 chars)
    const tooShort = plainToInstance(RequestBreakGlassDto, {
      patientId: randomUUID(),
      clinicalJustification: 'حالة طارئة جدا', // 14 chars
      durationMinutes: 60,
    });
    const shortErrors = await validate(tooShort);
    assert.ok(shortErrors.some((e) => e.property === 'clinicalJustification'));

    // Exceeds max 120 minutes
    const tooLongDuration = plainToInstance(RequestBreakGlassDto, {
      patientId: randomUUID(),
      clinicalJustification: 'حالة حرجة تتطلب الاطلاع العاجل والمبرر السريري كافٍ جداً هنا',
      durationMinutes: 180,
    });
    const durErrors = await validate(tooLongDuration);
    assert.ok(durErrors.some((e) => e.property === 'durationMinutes'));

    // Less than 1 minute
    const zeroDuration = plainToInstance(RequestBreakGlassDto, {
      patientId: randomUUID(),
      clinicalJustification: 'حالة حرجة تتطلب الاطلاع العاجل والمبرر السريري كافٍ جداً هنا',
      durationMinutes: 0,
    });
    const zeroErrors = await validate(zeroDuration);
    assert.ok(zeroErrors.some((e) => e.property === 'durationMinutes'));
  });

  it('ReviewBreakGlassDto & ConductPrivilegeReviewDto validation', async () => {
    const review = plainToInstance(ReviewBreakGlassDto, {
      reviewOutcome: 'APPROVED_JUSTIFIED',
      reviewNotes: 'تمت مراجعة الحالة السريرية وتبين أن كسر الحاجز كان مبرراً لإنقاذ حياة المريض',
    });
    assert.equal((await validate(review)).length, 0);

    const priv = plainToInstance(ConductPrivilegeReviewDto, {
      practitionerProfileId: randomUUID(),
      reviewType: 'EMERGENCY_SUSPENSION',
      status: 'PENDING',
      findings: 'تعليق طارئ احترازي للاشتباه في خطأ طبي جسيم قيد التحقيق',
      recommendation: 'سحب امتياز وصف أدوية التخدير فوراً',
    });
    assert.equal((await validate(priv)).length, 0);
  });

  it('Deterministic SHA-256 calculation over policy rulesJson', () => {
    const rules = {
      maxDoseMg: 100,
      minAgeYears: 18,
      contraindications: ['PREGNANCY', 'RENAL_FAILURE'],
      checkFrequency: 'DAILY',
    };

    const sortedJson = JSON.stringify(rules, Object.keys(rules).sort());
    const hash1 = createHash('sha256').update(sortedJson).digest('hex');

    const rulesReordered = {
      checkFrequency: 'DAILY',
      contraindications: ['PREGNANCY', 'RENAL_FAILURE'],
      minAgeYears: 18,
      maxDoseMg: 100,
    };
    const sortedJson2 = JSON.stringify(rulesReordered, Object.keys(rulesReordered).sort());
    const hash2 = createHash('sha256').update(sortedJson2).digest('hex');

    assert.equal(hash1, hash2);
    assert.equal(hash1.length, 64);
  });

  it('Role-based governance permissions strictly distinguish DOCTOR from administrative roles', () => {
    const doctorPermissions = permissionsFor('DOCTOR');
    const adminPermissions = permissionsFor('CLINIC_ADMIN');
    const receptionistPermissions = permissionsFor('RECEPTIONIST');

    // DOCTOR has clinical permissions
    assert.ok(doctorPermissions.includes('clinical.safety-policies.read'));
    assert.ok(doctorPermissions.includes('clinical.incidents.report'));
    assert.ok(doctorPermissions.includes('clinical.break-glass.request'));

    // RECEPTIONIST has zero clinical governance or break-glass access
    assert.ok(!receptionistPermissions.includes('clinical.safety-policies.approve'));
    assert.ok(!receptionistPermissions.includes('clinical.incidents.investigate'));
    assert.ok(!receptionistPermissions.includes('clinical.break-glass.request'));
    assert.ok(!receptionistPermissions.includes('clinical.break-glass.audit'));

    // CLINIC_ADMIN cannot approve clinical safety policies (Medical Director required)
    assert.ok(!adminPermissions.includes('clinical.safety-policies.approve'));
  });
});
