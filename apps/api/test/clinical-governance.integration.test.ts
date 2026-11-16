import 'reflect-metadata';
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { ClinicalGovernanceRepository } from '../src/prisma/clinical-governance.repository.js';
import { VerifiedSessions, type VerifiedPrincipal } from '../src/prisma/verified-sessions.js';
import { IdentityDatabase } from '../src/prisma/identity.database.js';
import { authorizationHash } from '../src/auth/crypto.js';
import { testUrls, fixtureDatabase } from './database-fixtures.js';

describe('Clinical Governance, Patient Safety & Break-Glass Integration Tests', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  let pool: pg.Pool;
  let govRepo: ClinicalGovernanceRepository;
  let verifiedSessions: VerifiedSessions;
  let identity: IdentityDatabase;

  const suffix = randomUUID().slice(0, 8);
  let clinicAId: string;
  let clinicBId: string;

  let patientA1Id: string;

  let userMedDirectorAId: string;
  let userDoctorAId: string;
  let userDoctorBId: string;

  let membershipMedDirectorAId: string;
  let membershipDoctorAId: string;
  let membershipDoctorBId: string;

  let sessionMedDirectorAId: string;
  let sessionDoctorAId: string;
  let sessionDoctorBId: string;

  let proofMedDirectorA: VerifiedPrincipal;
  let proofDoctorA: VerifiedPrincipal;
  let proofDoctorB: VerifiedPrincipal;

  let profileDoctorAId: string;

  before(async () => {
    const urls = testUrls();
    process.env.DATABASE_URL = urls.runtime;
    process.env.NODE_ENV = 'test';
    owner = fixtureDatabase();
    pool = new pg.Pool({ connectionString: urls.runtime, max: 5 });

    const { AppModule } = await import('../src/app.module.js');
    const moduleRef = await NestFactory.createApplicationContext(AppModule, { logger: false });
    app = moduleRef as any;
    govRepo = moduleRef.get(ClinicalGovernanceRepository);
    verifiedSessions = moduleRef.get(VerifiedSessions);
    identity = moduleRef.get(IdentityDatabase);

    // 1. Clinics
    const clinicA = await owner.clinic.create({
      data: {
        slug: `clinic-gov-a-${suffix}`,
        displayName: 'عيادة الحوكمة والامتثال أ',
        legalName: 'شركة الحوكمة الطبية المحدودة أ',
        currency: 'SAR',
        status: 'ACTIVE',
      },
    });
    clinicAId = clinicA.id;

    const clinicB = await owner.clinic.create({
      data: {
        slug: `clinic-gov-b-${suffix}`,
        displayName: 'عيادة الحوكمة والامتثال ب',
        legalName: 'شركة الحوكمة الطبية المحدودة ب',
        currency: 'SAR',
        status: 'ACTIVE',
      },
    });
    clinicBId = clinicB.id;

    // 2. Patients
    const patientA1 = await owner.patient.create({
      data: {
        clinicId: clinicAId,
        patientNumber: `P-${Math.floor(100000 + Math.random() * 800000)}`,
        fullName: 'مريض تجريبي أ',
        searchName: 'مريض تجريبي أ',
        gender: 'MALE',
        status: 'ACTIVE',
      },
    });
    patientA1Id = patientA1.id;

    await owner.patient.create({
      data: {
        clinicId: clinicBId,
        patientNumber: `P-${Math.floor(800001 + Math.random() * 190000)}`,
        fullName: 'مريض تجريبي ب',
        searchName: 'مريض تجريبي ب',
        gender: 'FEMALE',
        status: 'ACTIVE',
      },
    });

    // 3. Users & Memberships
    // Med Director A (DOCTOR with isMedicalDirector: true)
    userMedDirectorAId = randomUUID();
    await owner.user.create({
      data: {
        id: userMedDirectorAId,
        email: `med-director-a-${suffix}@clinic.local`,
        name: 'د. خالد المدير الطبي',
        status: 'ACTIVE',
      },
    });

    membershipMedDirectorAId = randomUUID();
    await owner.clinicMembership.create({
      data: {
        id: membershipMedDirectorAId,
        clinicId: clinicAId,
        userId: userMedDirectorAId,
        role: 'DOCTOR',
        status: 'ACTIVE',
      },
    });

    await owner.practitionerProfile.create({
      data: {
        clinicId: clinicAId,
        membershipId: membershipMedDirectorAId,
        professionalTitleAr: 'استشاري ورئيس الشؤون الطبية',
        professionalTitleEn: 'Medical Director & Consultant',
        licenseNumber: `LIC-MD-${suffix}`,
        verificationStatus: 'VERIFIED',
        isMedicalDirector: true,
      },
    });

    // Doctor A (DOCTOR without Medical Director)
    userDoctorAId = randomUUID();
    await owner.user.create({
      data: {
        id: userDoctorAId,
        email: `doctor-a-${suffix}@clinic.local`,
        name: 'د. منى ممارس',
        status: 'ACTIVE',
      },
    });

    membershipDoctorAId = randomUUID();
    await owner.clinicMembership.create({
      data: {
        id: membershipDoctorAId,
        clinicId: clinicAId,
        userId: userDoctorAId,
        role: 'DOCTOR',
        status: 'ACTIVE',
      },
    });

    const profDocA = await owner.practitionerProfile.create({
      data: {
        clinicId: clinicAId,
        membershipId: membershipDoctorAId,
        professionalTitleAr: 'طبيبة عامة',
        professionalTitleEn: 'General Practitioner',
        licenseNumber: `LIC-DOC-${suffix}`,
        verificationStatus: 'VERIFIED',
        isMedicalDirector: false,
      },
    });
    profileDoctorAId = profDocA.id;

    // Doctor B (in Clinic B)
    userDoctorBId = randomUUID();
    await owner.user.create({
      data: {
        id: userDoctorBId,
        email: `doctor-b-${suffix}@clinic.local`,
        name: 'د. عمر عيادة ب',
        status: 'ACTIVE',
      },
    });

    membershipDoctorBId = randomUUID();
    await owner.clinicMembership.create({
      data: {
        id: membershipDoctorBId,
        clinicId: clinicBId,
        userId: userDoctorBId,
        role: 'DOCTOR',
        status: 'ACTIVE',
      },
    });

    await owner.practitionerProfile.create({
      data: {
        clinicId: clinicBId,
        membershipId: membershipDoctorBId,
        professionalTitleAr: 'طبيب عيادة ب',
        professionalTitleEn: 'Doctor Clinic B',
        licenseNumber: `LIC-DOCB-${suffix}`,
        verificationStatus: 'VERIFIED',
        isMedicalDirector: true,
      },
    });

    // 4. Create Sessions
    const makeSession = async (sessionId: string, userId: string, clinicId: string) => {
      const u = await identity.loadUser(owner, userId);
      const hash = authorizationHash(u!);
      const token = randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '');
      await owner.session.create({
        data: {
          id: sessionId,
          userId,
          selectedClinicId: clinicId,
          tokenHash: token,
          csrfHash: token,
          authorizationHash: hash,
          expiresAt: new Date(Date.now() + 86400000),
        },
      });
    };

    sessionMedDirectorAId = randomUUID();
    sessionDoctorAId = randomUUID();
    sessionDoctorBId = randomUUID();

    await makeSession(sessionMedDirectorAId, userMedDirectorAId, clinicAId);
    await makeSession(sessionDoctorAId, userDoctorAId, clinicAId);
    await makeSession(sessionDoctorBId, userDoctorBId, clinicBId);

    proofMedDirectorA = verifiedSessions.issue(userMedDirectorAId, sessionMedDirectorAId);
    proofDoctorA = verifiedSessions.issue(userDoctorAId, sessionDoctorAId);
    proofDoctorB = verifiedSessions.issue(userDoctorBId, sessionDoctorBId);
  });

  after(async () => {
    if (app) await app.close();
    if (pool) await pool.end();
    if (owner) await owner.$disconnect();
  });

  // --------------------------------------------------------------------------
  // Vector 1 & 2: Policy Lifecycle, Medical Director Authority & Anti-Self-Approval
  // --------------------------------------------------------------------------

  it('Vector 1 & 2: Policy creation, anti-self-approval and Medical Director authority', async () => {
    // Doctor A creates a policy draft
    const policy = await govRepo.createSafetyPolicy(proofDoctorA, clinicAId, {
      code: `POL-ANAPH-${suffix}`,
      titleAr: 'بروتوكول التعامل مع صدمة الحساسية المفرطة',
      titleEn: 'Anaphylaxis Management Protocol',
      category: 'ALLERGY_SAFETY',
      jurisdiction: 'KSA_MOH',
      initialRules: {
        epinephrineDoseAdultMg: 0.5,
        oxygenFlowLitersPerMin: 15,
        observationHoursMinimum: 6,
      },
    });

    assert.ok(policy.id);
    assert.equal(policy.status, 'DRAFT');

    const versions = await owner.clinicalSafetyPolicyVersion.findMany({
      where: { clinicId: clinicAId, policyId: policy.id },
      orderBy: { versionNumber: 'asc' },
    });
    assert.equal(versions.length, 1);
    const v1 = versions[0];
    assert.equal(v1.versionNumber, 1);
    assert.equal(v1.status, 'DRAFT');
    assert.equal(v1.authorMembershipId, membershipDoctorAId);
    assert.ok(v1.sha256Digest.length === 64);

    // Negative: Doctor A (non-Medical Director) cannot approve
    await assert.rejects(
      async () => {
        await govRepo.approvePolicyVersion(proofDoctorA, clinicAId, v1.id, {
          evidenceReference: 'محاولة اعتماد غير مصرح بها',
        });
      },
      (err: any) => err.status === 403 || err.message.includes('Medical Director'),
    );

    // Negative: If Medical Director creates their own version, they CANNOT self-approve (Anti-Self-Approval)
    const mdPolicy = await govRepo.createSafetyPolicy(proofMedDirectorA, clinicAId, {
      code: `POL-MD-SELF-${suffix}`,
      titleAr: 'بروتوكول أعده المدير الطبي',
      category: 'PRESCRIPTION_SAFETY',
      initialRules: { rule: 'test' },
    });
    const mdVersions = await owner.clinicalSafetyPolicyVersion.findMany({
      where: { clinicId: clinicAId, policyId: mdPolicy.id },
      orderBy: { versionNumber: 'asc' },
    });
    const mdV1 = mdVersions[0];

    // Medical Director attempting self-approval must be rejected by DB trigger clinical_safety_policy_version_guard (42501)
    await assert.rejects(
      async () => {
        await govRepo.approvePolicyVersion(proofMedDirectorA, clinicAId, mdV1.id, {
          evidenceReference: 'اعتماد ذاتي',
        });
      },
      (err: any) => err.message.includes('42501') || err.message.includes('cannot approve their own'),
    );

    // Positive: Medical Director approves Doctor A's version
    const approved = await govRepo.approvePolicyVersion(proofMedDirectorA, clinicAId, v1.id, {
      evidenceReference: 'تم الاعتماد سريرياً من قبل المدير الطبي',
    });
    assert.equal(approved.status, 'APPROVED');
    assert.equal(approved.approvedByMembershipId, membershipMedDirectorAId);
  });

  // --------------------------------------------------------------------------
  // Vector 3: Immutability of Approved Policy Versions
  // --------------------------------------------------------------------------

  it('Vector 3: Approved policy version rules are strictly immutable (DB trigger guard)', async () => {
    const approvedVersion = await owner.clinicalSafetyPolicyVersion.findFirst({
      where: { clinicId: clinicAId, status: 'APPROVED' },
    });
    assert.ok(approvedVersion);

    // Direct DB update attempt on approved rules must be rejected by DB trigger
    await assert.rejects(
      async () => {
        await owner.clinicalSafetyPolicyVersion.update({
          where: { id: approvedVersion.id },
          data: {
            rulesJson: { tampered: true },
          },
        });
      },
      (err: any) => err.message.includes('42501') || err.message.includes('cannot be modified'),
    );
  });

  // --------------------------------------------------------------------------
  // Vector 4: Policy Version Activation & Rollback
  // --------------------------------------------------------------------------

  it('Vector 4: Policy version activation and Medical Director rollback', async () => {
    const approvedVersion = await owner.clinicalSafetyPolicyVersion.findFirst({
      where: { clinicId: clinicAId, status: 'APPROVED' },
    });
    assert.ok(approvedVersion);

    // Activate v1
    const activatedVersion = await govRepo.activatePolicyVersion(proofDoctorA, clinicAId, approvedVersion.id);
    assert.equal(activatedVersion.status, 'ACTIVATED');

    const policy = await owner.clinicalSafetyPolicy.findUnique({ where: { id: approvedVersion.policyId } });
    assert.equal(policy?.activeVersionId, approvedVersion.id);
    assert.equal(policy?.status, 'ACTIVATED');

    // Create v2 by Doctor A
    const v2 = await govRepo.createPolicyVersion(proofDoctorA, clinicAId, approvedVersion.policyId, {
      changeSummary: 'تعديل جرعة الأكسجين في بروتوكول الصدمة',
      rulesJson: { epinephrineDoseAdultMg: 0.5, oxygenFlowLitersPerMin: 12 },
    });
    assert.equal(v2.versionNumber, 2);

    // Med Director approves v2
    await govRepo.approvePolicyVersion(proofMedDirectorA, clinicAId, v2.id, {
      evidenceReference: 'معتمد v2',
    });

    // Activate v2
    await govRepo.activatePolicyVersion(proofDoctorA, clinicAId, v2.id);

    // Rollback to v1 (only Medical Director can rollback)
    const rolledBack = await govRepo.rollbackPolicy(proofMedDirectorA, clinicAId, approvedVersion.policyId, 1);
    assert.equal(rolledBack.status, 'ACTIVATED');
    assert.equal(rolledBack.versionNumber, 1);

    const recheckPolicy = await owner.clinicalSafetyPolicy.findUnique({ where: { id: approvedVersion.policyId } });
    assert.equal(recheckPolicy?.activeVersionId, approvedVersion.id);
  });

  // --------------------------------------------------------------------------
  // Vector 5 & 6: Clinical Incidents Sequential Numbering & Investigation
  // --------------------------------------------------------------------------

  it('Vector 5 & 6: Monotonic sequential incident counter (INC-CLIN-XXXXXX) and investigation', async () => {
    const inc1 = await govRepo.reportIncident(proofDoctorA, clinicAId, {
      severity: 'NEAR_MISS',
      category: 'MEDICATION_SAFETY',
      occurredAt: new Date().toISOString(),
      description: 'كاد الطبيب يصف دواء بنسلين لمريض لديه حساسية مسجلة لولا التنبيه السريري',
      patientId: patientA1Id,
    });
    assert.equal(inc1.incidentNumber, 'INC-CLIN-000001');
    assert.equal(inc1.status, 'REPORTED');

    const inc2 = await govRepo.reportIncident(proofDoctorA, clinicAId, {
      severity: 'MODERATE',
      category: 'PROCEDURAL_COMPLICATION',
      occurredAt: new Date().toISOString(),
      description: 'حدوث وذمة موضعية بعد إجراء تنظيف جراحي طفيف',
      patientId: patientA1Id,
    });
    assert.equal(inc2.incidentNumber, 'INC-CLIN-000002');

    // Negative: Non-Medical Director cannot investigate
    await assert.rejects(
      async () => {
        await govRepo.investigateIncident(proofDoctorA, clinicAId, inc1.id, {
          status: 'UNDER_INVESTIGATION',
          investigationFindings: 'محاولة فحص من طبيب غير مخول',
        });
      },
      (err: any) => err.status === 403 || err.message.includes('Medical Director'),
    );

    // Positive: Medical Director investigates and resolves incident
    const investigated = await govRepo.investigateIncident(proofMedDirectorA, clinicAId, inc1.id, {
      status: 'RESOLVED',
      investigationFindings: 'تم فحص مسار الوصفة وتبين نجاح تنبيه الحساسية في منع الخطأ',
      rootCauseAnalysis: 'عدم انتباه الممارس للافتة الحساسية الورقية بجانب السجل الإلكتروني',
      correctiveActions: 'الاعتماد الكلي على الفحص الإلكتروني وتثبيت التحذير الرقمي البارز',
    });

    assert.equal(investigated.status, 'RESOLVED');
    assert.equal(investigated.investigatedByMembershipId, membershipMedDirectorAId);
    assert.ok(investigated.resolvedAt);
  });

  // --------------------------------------------------------------------------
  // Vector 7, 8 & 9: Emergency Break-Glass Invariants & Anti-Self-Audit
  // --------------------------------------------------------------------------

  it('Vector 7, 8 & 9: Emergency break-glass invariants, anti-self-audit and audit review', async () => {
    // Positive: Request break-glass access
    const bg = await govRepo.requestBreakGlass(proofDoctorA, clinicAId, {
      patientId: patientA1Id,
      clinicalJustification: 'حالة صدمة حساسية طارئة تستدعي فتح السجل فوراً لإنقاذ حياة المريض والاطلاع على الأدوية',
      durationMinutes: 45,
    });

    assert.ok(bg.id);
    assert.equal(bg.patientId, patientA1Id);
    assert.equal(bg.durationMinutes, 45);
    assert.equal(bg.requestedByMembershipId, membershipDoctorAId);
    assert.equal(bg.auditReviewedAt, null);

    // Negative: Doctor A CANNOT audit their own break-glass episode (Anti-Self-Audit)
    await assert.rejects(
      async () => {
        await govRepo.reviewBreakGlass(proofDoctorA, clinicAId, bg.id, {
          reviewOutcome: 'APPROVED_JUSTIFIED',
          reviewNotes: 'أنا الممارس وأؤكد أنني كنت محقاً',
        });
      },
      (err: any) => err.status === 403 || err.message.includes('anti-self-audit') || err.message.includes('42501'),
    );

    // Direct DB update attempt to bypass anti-self-audit must trigger DB constraint
    await assert.rejects(
      async () => {
        await owner.emergencyBreakGlassAccess.update({
          where: { id: bg.id },
          data: {
            reviewedByMembershipId: membershipDoctorAId, // Self audit
            auditReviewedAt: new Date(),
            reviewOutcome: 'APPROVED_JUSTIFIED',
          },
        });
      },
      (err: any) => err.message.includes('42501') || err.message.includes('cannot audit their own'),
    );

    // Positive: Medical Director reviews Doctor A's break-glass episode
    const reviewed = await govRepo.reviewBreakGlass(proofMedDirectorA, clinicAId, bg.id, {
      reviewOutcome: 'APPROVED_JUSTIFIED',
      reviewNotes: 'تمت المراجعة والتحقق من وجود حالة صدمة سريرية استدعت التدخل الطارئ',
    });

    assert.equal(reviewed.reviewOutcome, 'APPROVED_JUSTIFIED');
    assert.equal(reviewed.reviewedByMembershipId, membershipMedDirectorAId);
    assert.ok(reviewed.auditReviewedAt);
  });

  // --------------------------------------------------------------------------
  // Vector 10: Practitioner Privilege Review & Emergency Suspension
  // --------------------------------------------------------------------------

  it('Vector 10: Privilege review, emergency suspension and anti-self-review', async () => {
    // Negative: Doctor A cannot review their own privileges (Anti-Self-Review)
    await assert.rejects(
      async () => {
        await govRepo.conductPrivilegeReview(proofDoctorA, clinicAId, {
          practitionerProfileId: profileDoctorAId,
          reviewType: 'PERIODIC_RENEWAL',
          findings: 'مراجعة ذاتية',
          recommendation: 'تجديد ذاتي',
        });
      },
      (err: any) => err.status === 403 || err.message.includes('anti-self-review') || err.message.includes('42501'),
    );

    // Positive: Medical Director conducts emergency suspension of Doctor A
    const suspension = await govRepo.conductPrivilegeReview(proofMedDirectorA, clinicAId, {
      practitionerProfileId: profileDoctorAId,
      reviewType: 'EMERGENCY_SUSPENSION',
      findings: 'تعليق احترازي عاجل قيد التحقيق في حادثة سلامة دوائية',
      recommendation: 'تعليق الامتياز فورياً وإحالة الحالة للجنة الأخلاقيات الطبية',
    });

    assert.equal(suspension.reviewType, 'EMERGENCY_SUSPENSION');
    assert.equal(suspension.status, 'COMPLETED');
    assert.equal(suspension.conductedByMembershipId, membershipMedDirectorAId);
  });

  // --------------------------------------------------------------------------
  // Vector 11: Cross-Clinic Tenant Isolation Under FORCE ROW LEVEL SECURITY
  // --------------------------------------------------------------------------

  it('Vector 11: Cross-clinic tenant boundary isolation under FORCE ROW LEVEL SECURITY', async () => {
    // Doctor B in Clinic B lists policies in Clinic B -> should NOT see Clinic A's policies
    const policiesB = await govRepo.listSafetyPolicies(proofDoctorB, clinicBId);
    assert.ok(policiesB.every((p) => p.clinicId === clinicBId));

    // Doctor B attempting to list or access Clinic A records is rejected
    await assert.rejects(
      async () => {
        await govRepo.listSafetyPolicies(proofDoctorB, clinicAId);
      },
      (err: any) => err.status === 403 || err.status === 404,
    );

    // Doctor B cannot request break-glass on Clinic A patient
    await assert.rejects(
      async () => {
        await govRepo.requestBreakGlass(proofDoctorB, clinicBId, {
          patientId: patientA1Id, // Patient belonging to Clinic A
          clinicalJustification: 'محاولة وصول عابرة للمستأجرين لمريض في عيادة أخرى تماماً',
          durationMinutes: 30,
        });
      },
      (err: any) => err.status === 404 || err.message.includes('not found') || err.message.includes('42501'),
    );
  });
});
