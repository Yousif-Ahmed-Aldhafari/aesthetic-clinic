import 'reflect-metadata';
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { ClinicalGovernanceRepository } from '../src/prisma/clinical-governance.repository.js';
import { ClinicalRepository } from '../src/prisma/clinical.repository.js';
import { PharmacyAdapter } from '../src/interoperability/adapters/pharmacy.adapter.js';
import { HealthExchangeAdapter } from '../src/interoperability/adapters/health-exchange.adapter.js';
import { VerifiedSessions, type VerifiedPrincipal } from '../src/prisma/verified-sessions.js';
import { IdentityDatabase } from '../src/prisma/identity.database.js';
import { authorizationHash } from '../src/auth/crypto.js';
import { testUrls, fixtureDatabase } from './database-fixtures.js';

describe('Step 7.4 Security & Integration Code Audit: Break-Glass, Governance & SSRF', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  let pool: pg.Pool;
  let govRepo: ClinicalGovernanceRepository;
  let clinicalRepo: ClinicalRepository;
  let verifiedSessions: VerifiedSessions;
  let identity: IdentityDatabase;

  const suffix = randomUUID().slice(0, 8);
  let clinicAId: string;
  let clinicBId: string;

  let patientA1Id: string;

  let userMedDirectorAId: string;
  let userDoctorAId: string;
  let userUnverifiedDocAId: string;
  let userDoctorBId: string;

  let membershipMedDirectorAId: string;
  let membershipDoctorAId: string;
  let membershipUnverifiedDocAId: string;
  let membershipDoctorBId: string;

  let sessionMedDirectorAId: string;
  let sessionDoctorAId: string;
  let sessionUnverifiedDocAId: string;
  let sessionDoctorBId: string;

  let proofMedDirectorA: VerifiedPrincipal;
  let proofDoctorA: VerifiedPrincipal;
  let proofUnverifiedDocA: VerifiedPrincipal;
  let proofDoctorB: VerifiedPrincipal;

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
    clinicalRepo = moduleRef.get(ClinicalRepository);
    verifiedSessions = moduleRef.get(VerifiedSessions);
    identity = moduleRef.get(IdentityDatabase);

    // 1. Clinics
    const clinicA = await owner.clinic.create({
      data: {
        slug: `clinic-sec-a-${suffix}`,
        displayName: 'عيادة التدقيق الأمني أ',
        legalName: 'شركة التدقيق الأمني المحدودة أ',
        currency: 'SAR',
        status: 'ACTIVE',
      },
    });
    clinicAId = clinicA.id;

    const clinicB = await owner.clinic.create({
      data: {
        slug: `clinic-sec-b-${suffix}`,
        displayName: 'عيادة التدقيق الأمني ب',
        legalName: 'شركة التدقيق الأمني المحدودة ب',
        currency: 'SAR',
        status: 'ACTIVE',
      },
    });
    clinicBId = clinicB.id;

    // 2. Patient
    const patientA1 = await owner.patient.create({
      data: {
        clinicId: clinicAId,
        patientNumber: `P-${Math.floor(100000 + Math.random() * 800000)}`,
        fullName: 'مريض أمني تجريبي',
        searchName: 'مريض أمني تجريبي',
        gender: 'MALE',
        status: 'ACTIVE',
      },
    });
    patientA1Id = patientA1.id;

    // 3. Medical Director A
    userMedDirectorAId = randomUUID();
    await owner.user.create({
      data: {
        id: userMedDirectorAId,
        email: `med-director-sec-${suffix}@clinic.local`,
        name: 'د. فيصل مدير طبي',
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
        professionalTitleEn: 'Medical Director',
        licenseNumber: `LIC-MD-SEC-${suffix}`,
        verificationStatus: 'VERIFIED',
        isMedicalDirector: true,
      },
    });

    // 4. Verified Doctor A
    userDoctorAId = randomUUID();
    await owner.user.create({
      data: {
        id: userDoctorAId,
        email: `doctor-sec-${suffix}@clinic.local`,
        name: 'د. ليلى طبيب ممارس',
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
    await owner.practitionerProfile.create({
      data: {
        clinicId: clinicAId,
        membershipId: membershipDoctorAId,
        professionalTitleAr: 'طبيب مقيم',
        professionalTitleEn: 'Resident Physician',
        licenseNumber: `LIC-DOC-SEC-${suffix}`,
        verificationStatus: 'VERIFIED',
        isMedicalDirector: false,
      },
    });

    // 5. Unverified Doctor (profile pending verification)
    userUnverifiedDocAId = randomUUID();
    await owner.user.create({
      data: {
        id: userUnverifiedDocAId,
        email: `doc-unverified-${suffix}@clinic.local`,
        name: 'د. سمير غير معتمد',
        status: 'ACTIVE',
      },
    });
    membershipUnverifiedDocAId = randomUUID();
    await owner.clinicMembership.create({
      data: {
        id: membershipUnverifiedDocAId,
        clinicId: clinicAId,
        userId: userUnverifiedDocAId,
        role: 'DOCTOR',
        status: 'ACTIVE',
      },
    });
    await owner.practitionerProfile.create({
      data: {
        clinicId: clinicAId,
        membershipId: membershipUnverifiedDocAId,
        professionalTitleAr: 'طبيب تحت التحقق',
        professionalTitleEn: 'Unverified Physician',
        licenseNumber: `LIC-UNV-${suffix}`,
        verificationStatus: 'PENDING_VERIFICATION',
        isMedicalDirector: false,
      },
    });

    // 6. Doctor in Clinic B
    userDoctorBId = randomUUID();
    await owner.user.create({
      data: {
        id: userDoctorBId,
        email: `doctor-sec-b-${suffix}@clinic.local`,
        name: 'د. عادل عيادة ب',
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
        professionalTitleAr: 'طبيب عام عيادة ب',
        professionalTitleEn: 'General Physician Clinic B',
        licenseNumber: `LIC-DOC-B-${suffix}`,
        verificationStatus: 'VERIFIED',
        isMedicalDirector: false,
      },
    });

    // Sessions & Proofs using standard identity + verifiedSessions flow
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
    sessionUnverifiedDocAId = randomUUID();
    sessionDoctorBId = randomUUID();

    await makeSession(sessionMedDirectorAId, userMedDirectorAId, clinicAId);
    await makeSession(sessionDoctorAId, userDoctorAId, clinicAId);
    await makeSession(sessionUnverifiedDocAId, userUnverifiedDocAId, clinicAId);
    await makeSession(sessionDoctorBId, userDoctorBId, clinicBId);

    proofMedDirectorA = verifiedSessions.issue(userMedDirectorAId, sessionMedDirectorAId);
    proofDoctorA = verifiedSessions.issue(userDoctorAId, sessionDoctorAId);
    proofUnverifiedDocA = verifiedSessions.issue(userUnverifiedDocAId, sessionUnverifiedDocAId);
    proofDoctorB = verifiedSessions.issue(userDoctorBId, sessionDoctorBId);
  });

  after(async () => {
    if (app) await app.close();
    if (pool) await pool.end();
    if (owner) await owner.$disconnect();
  });

  // ==========================================================================
  // Section 1: Emergency Break-Glass Security & Verification
  // ==========================================================================

  it('1.1: Unverified practitioner CANNOT request break-glass access', async () => {
    await assert.rejects(
      async () => {
        await govRepo.requestBreakGlass(proofUnverifiedDocA, clinicAId, {
          patientId: patientA1Id,
          clinicalJustification: 'محاولة فتح السجل بحساب ممارس غير معتمد أو قيد التحقق',
          durationMinutes: 30,
        });
      },
      (err: any) => err.status === 403 || err.message.includes('verified practitioner'),
    );
  });

  it('1.2: Duration limits (1-120 minutes) and minimum clinical justification (20 chars) enforced', async () => {
    // Too short justification (<20 chars)
    await assert.rejects(
      async () => {
        await govRepo.requestBreakGlass(proofDoctorA, clinicAId, {
          patientId: patientA1Id,
          clinicalJustification: 'طوارئ قصيرة',
          durationMinutes: 30,
        });
      },
      (err: any) => err.status === 400 && err.message.includes('minimum 20 characters'),
    );

    // Duration > 120 minutes rejected
    await assert.rejects(
      async () => {
        await govRepo.requestBreakGlass(proofDoctorA, clinicAId, {
          patientId: patientA1Id,
          clinicalJustification: 'حالة طارئة حرجة تستدعي وصول سريري عاجل لمدة طويلة جداً',
          durationMinutes: 180,
        });
      },
      (err: any) => err.status === 400 && err.message.includes('between 1 and 120 minutes'),
    );

    // Duration <= 0 rejected
    await assert.rejects(
      async () => {
        await govRepo.requestBreakGlass(proofDoctorA, clinicAId, {
          patientId: patientA1Id,
          clinicalJustification: 'حالة طارئة حرجة تستدعي وصول سريري عاجل لمدة صفرية غير صالحة',
          durationMinutes: 0,
        });
      },
      (err: any) => err.status === 400 && err.message.includes('between 1 and 120 minutes'),
    );
  });

  it('1.3: Verified practitioner requests break-glass and active emergency access is verified', async () => {
    const bg = await govRepo.requestBreakGlass(proofDoctorA, clinicAId, {
      patientId: patientA1Id,
      clinicalJustification: 'حالة صدمة دوائية طارئة تستدعي الوصول الفوري لملف الحساسية والأدوية',
      durationMinutes: 60,
    });

    assert.ok(bg.id);
    assert.equal(bg.patientId, patientA1Id);
    assert.equal(bg.durationMinutes, 60);
    assert.equal(bg.requestedByMembershipId, membershipDoctorAId);
    assert.equal(bg.revokedAt, null);

    // Active emergency access helper returns true
    const isActive = await govRepo.isEmergencyAccessActive(
      owner,
      clinicAId,
      membershipDoctorAId,
      patientA1Id,
    );
    assert.equal(isActive, true);
  });

  it('1.4: Anti-self-audit strictly prevents requesting doctor from auditing own break-glass', async () => {
    const bg = await govRepo.requestBreakGlass(proofDoctorA, clinicAId, {
      patientId: patientA1Id,
      clinicalJustification: 'حالة إنعاش قلبي رئوي طارئة تتطلب كشف التاريخ المرضي العاجل',
      durationMinutes: 30,
    });

    // Requesting doctor attempting to audit own session must be rejected
    await assert.rejects(
      async () => {
        await govRepo.reviewBreakGlass(proofDoctorA, clinicAId, bg.id, {
          reviewOutcome: 'APPROVED_JUSTIFIED',
          reviewNotes: 'أنا الممارس وأراجع حالتي بنفسي',
        });
      },
      (err: any) => err.status === 403,
    );
  });

  it('1.5: Early revocation by requester or Medical Director terminates emergency access immediately', async () => {
    // Fresh patient specifically for revocation test
    const patientRevocation = await owner.patient.create({
      data: {
        clinicId: clinicAId,
        patientNumber: `P-${Math.floor(200000 + Math.random() * 700000)}`,
        fullName: 'مريض تجربة الإلغاء',
        searchName: 'مريض تجربة الإلغاء',
        gender: 'FEMALE',
        status: 'ACTIVE',
      },
    });

    const bg = await govRepo.requestBreakGlass(proofDoctorA, clinicAId, {
      patientId: patientRevocation.id,
      clinicalJustification: 'حالة طوارئ استدعت الاطلاع السريع وتم الانتهاء من الإنعاش بنجاح',
      durationMinutes: 45,
    });

    let isActive = await govRepo.isEmergencyAccessActive(
      owner,
      clinicAId,
      membershipDoctorAId,
      patientRevocation.id,
    );
    assert.equal(isActive, true);

    // Requester revokes early
    const revoked = await govRepo.revokeBreakGlass(
      proofDoctorA,
      clinicAId,
      bg.id,
      'تم استقرار حالة المريض وانتهاء الحاجة للوصول الطارئ',
    );

    assert.ok(revoked.revokedAt);
    assert.equal(revoked.revokedByMembershipId, membershipDoctorAId);

    // Active status is now false immediately
    isActive = await govRepo.isEmergencyAccessActive(
      owner,
      clinicAId,
      membershipDoctorAId,
      patientRevocation.id,
    );
    assert.equal(isActive, false);

    // Revoking already revoked access throws BadRequest
    await assert.rejects(
      async () => {
        await govRepo.revokeBreakGlass(proofDoctorA, clinicAId, bg.id);
      },
      (err: any) => err.status === 400 && err.message.includes('already been revoked'),
    );
  });

  it('1.6: Medical Director can audit break-glass episode and cross-clinic attempt is rejected', async () => {
    const bg = await govRepo.requestBreakGlass(proofDoctorA, clinicAId, {
      patientId: patientA1Id,
      clinicalJustification: 'تدخل عاجل لنزيف حاد أثناء إجراء جراحي صغرى يستدعي مراجعة فصيلة الدم',
      durationMinutes: 30,
    });

    // Doctor in Clinic B attempting to review Clinic A's break-glass is rejected
    await assert.rejects(
      async () => {
        await govRepo.reviewBreakGlass(proofDoctorB, clinicBId, bg.id, {
          reviewOutcome: 'APPROVED_JUSTIFIED',
          reviewNotes: 'محاولة تدقيق من عيادة أخرى',
        });
      },
      (err: any) => err.status === 404 || err.status === 403,
    );

    // Medical Director in Clinic A successfully audits
    const reviewed = await govRepo.reviewBreakGlass(proofMedDirectorA, clinicAId, bg.id, {
      reviewOutcome: 'APPROVED_JUSTIFIED',
      reviewNotes: 'تم التحقق من مبررات التدخل العاجل ومطابقة البيانات السريرية في سجل الطوارئ',
    });

    assert.equal(reviewed.reviewOutcome, 'APPROVED_JUSTIFIED');
    assert.equal(reviewed.reviewedByMembershipId, membershipMedDirectorAId);
    assert.ok(reviewed.auditReviewedAt);
  });

  it('1.7: Clinical read endpoints enforce break-glass authorization for cross-clinician records', async () => {
    // 1. Doctor A creates an encounter for Patient A1
    const encounter = await clinicalRepo.create(proofDoctorA, clinicAId, {
      patientId: patientA1Id,
      content: {
        chiefComplaint: 'ألم حاد في الصدر مع ضيق تنفس',
        relevantHistory: 'ارتفاع ضغط الدم',
        allergies: ['Penicillin'],
        medications: ['Amlodipine 5mg'],
        priorProcedures: '',
        examination: 'BP 160/95, HR 102',
        assessment: 'Suspected acute coronary syndrome',
        recommendations: 'ECG, Troponin, Aspirin 300mg',
      },
    });
    assert.ok(encounter.id);

    // 2. Doctor A can read their own encounter
    const readByDocA = await clinicalRepo.get(proofDoctorA, clinicAId, encounter.id);
    assert.equal(readByDocA.id, encounter.id);

    // 3. Med Director A (without break-glass) CANNOT read Doctor A's encounter (404)
    await assert.rejects(
      async () => {
        await clinicalRepo.get(proofMedDirectorA, clinicAId, encounter.id);
      },
      (err: any) => err.status === 404,
    );

    // Med Director A's encounter list for patientA1 is empty without break-glass
    const listBefore = await clinicalRepo.list(proofMedDirectorA, clinicAId, patientA1Id, { pageSize: 10 });
    assert.equal(listBefore.items.length, 0);

    // 4. Med Director A initiates emergency break-glass for patientA1
    const bg = await govRepo.requestBreakGlass(proofMedDirectorA, clinicAId, {
      patientId: patientA1Id,
      clinicalJustification: 'إنعاش فوري واستشارة قلبية طارئة تتطلب مراجعة ملاحظات د. ليلى',
      durationMinutes: 45,
    });
    assert.ok(bg.id);

    // 5. Under active break-glass, Med Director A CAN read Doctor A's encounter
    const readUnderBg = await clinicalRepo.get(proofMedDirectorA, clinicAId, encounter.id);
    assert.equal(readUnderBg.id, encounter.id);
    assert.equal(readUnderBg.patientId, patientA1Id);

    // And list returns Doctor A's encounter for patientA1
    const listUnderBg = await clinicalRepo.list(proofMedDirectorA, clinicAId, patientA1Id, { pageSize: 10 });
    assert.equal(listUnderBg.items.length, 1);
    assert.equal(listUnderBg.items[0].id, encounter.id);

    // 6. Cross-patient isolation: Med Director A still cannot read another patient's encounters
    const patientA2 = await owner.patient.create({
      data: {
        clinicId: clinicAId,
        patientNumber: `P-${Math.floor(800000 + Math.random() * 100000)}`,
        fullName: 'مريض آخر منفصل',
        searchName: 'مريض آخر منفصل',
        gender: 'FEMALE',
        status: 'ACTIVE',
      },
    });
    const encounterP2 = await clinicalRepo.create(proofDoctorA, clinicAId, {
      patientId: patientA2.id,
      content: {
        chiefComplaint: 'استشارة جلدية روتينية',
        relevantHistory: '',
        allergies: [],
        medications: [],
        priorProcedures: '',
        examination: '',
        assessment: 'Routine review',
        recommendations: 'Follow-up 2 weeks',
      },
    });
    await assert.rejects(
      async () => {
        await clinicalRepo.get(proofMedDirectorA, clinicAId, encounterP2.id);
      },
      (err: any) => err.status === 404,
    );

    // 7. Revoke break-glass early -> immediate fail-closed
    await govRepo.revokeBreakGlass(proofMedDirectorA, clinicAId, bg.id, 'تمت السيطرة على الحالة الإسعافية بنجاح');

    await assert.rejects(
      async () => {
        await clinicalRepo.get(proofMedDirectorA, clinicAId, encounter.id);
      },
      (err: any) => err.status === 404,
    );
    const listAfterRevoke = await clinicalRepo.list(proofMedDirectorA, clinicAId, patientA1Id, { pageSize: 10 });
    assert.equal(listAfterRevoke.items.length, 0);
  });

  // ==========================================================================
  // Section 2: Clinical Governance Authority & Anti-Self-Approval
  // ==========================================================================

  it('2.1: Ordinary DOCTOR cannot approve facility-wide safety policies', async () => {
    const policy = await owner.clinicalSafetyPolicy.create({
      data: {
        clinicId: clinicAId,
        code: `POL-GOV-${suffix}`,
        titleAr: 'سياسة التحقق من الحساسية الدوائية المزدوجة',
        titleEn: 'Double Check Allergy Policy',
        category: 'ALLERGY_SAFETY',
        jurisdiction: 'KSA_MOH',
        status: 'DRAFT',
      },
    });

    const version = await owner.clinicalSafetyPolicyVersion.create({
      data: {
        clinicId: clinicAId,
        policyId: policy.id,
        versionNumber: 1,
        rulesJson: { requireDoubleSignOff: true },
        changeSummary: 'Initial draft',
        status: 'DRAFT',
        sha256Digest: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        authorMembershipId: membershipDoctorAId,
      },
    });

    // Regular Doctor A (isMedicalDirector: false) attempting to approve policy version is forbidden
    await assert.rejects(
      async () => {
        await govRepo.approvePolicyVersion(proofDoctorA, clinicAId, version.id, {
          evidenceReference: 'EVID-MOH-2026',
        });
      },
      (err: any) => err.status === 403 && err.message.includes('Medical Director'),
    );

    // Medical Director A can approve
    const approved = await govRepo.approvePolicyVersion(proofMedDirectorA, clinicAId, version.id, {
      evidenceReference: 'EVID-MOH-2026-APPROVED',
    });
    assert.equal(approved.status, 'APPROVED');
    assert.equal(approved.approvedByMembershipId, membershipMedDirectorAId);
  });

  it('2.2: Medical Director cannot approve their own authored policy version (Anti-Self-Approval)', async () => {
    const policy = await owner.clinicalSafetyPolicy.create({
      data: {
        clinicId: clinicAId,
        code: `POL-SELF-${suffix}`,
        titleAr: 'سياسة الحوكمة الذاتية للسلامة',
        titleEn: 'Self Governance Policy',
        category: 'CLINICAL_PROTOCOL',
        jurisdiction: 'KSA_MOH',
        status: 'DRAFT',
      },
    });

    // Policy version authored by the Medical Director themselves
    const version = await owner.clinicalSafetyPolicyVersion.create({
      data: {
        clinicId: clinicAId,
        policyId: policy.id,
        versionNumber: 1,
        rulesJson: { maxOpioidDurationDays: 3 },
        changeSummary: 'Authored by Medical Director',
        status: 'DRAFT',
        sha256Digest: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        authorMembershipId: membershipMedDirectorAId,
      },
    });

    // Medical Director attempting to approve own authored version must be rejected
    await assert.rejects(
      async () => {
        await govRepo.approvePolicyVersion(proofMedDirectorA, clinicAId, version.id, {
          evidenceReference: 'SELF-REF',
        });
      },
      (err: any) => err.status === 403 && err.message.includes('anti-self-approval'),
    );
  });

  // ==========================================================================
  // Section 3: Integration SSRF Hardening & Network Isolation
  // ==========================================================================

  it('3.1: Reject unencrypted HTTP protocols', () => {
    const adapter = new PharmacyAdapter();
    assert.throws(
      () => adapter.validateEndpointSecurity('http://sandbox.wasfaty.sa/api'),
      (err: any) => err.message.includes('must strictly use \'https:\''),
    );
  });

  it('3.2: Reject embedded credentials in URLs', () => {
    const adapter = new PharmacyAdapter();
    assert.throws(
      () => adapter.validateEndpointSecurity('https://admin:secret123@sandbox.wasfaty.sa/api'),
      (err: any) => err.message.includes('Embedded credentials in endpoint URL are prohibited'),
    );
  });

  it('3.3: Reject non-standard ports', () => {
    const adapter = new HealthExchangeAdapter('KSA_SEHA_NPHIES');
    assert.throws(
      () => adapter.validateEndpointSecurity('https://sandbox.nphies.sa:8443/fhir'),
      (err: any) => err.message.includes('Non-standard port \'8443\' is prohibited'),
    );
  });

  it('3.4: SSRF Defense: Block IPv4 loopback, private subnets, and cloud metadata literals', () => {
    const adapter = new PharmacyAdapter();
    const maliciousEndpoints = [
      'https://127.0.0.1/prescriptions',
      'https://10.0.0.1/prescriptions',
      'https://172.16.0.5/prescriptions',
      'https://192.168.1.100/prescriptions',
      'https://169.254.169.254/latest/meta-data/', // AWS / GCP metadata
      'https://0.0.0.0/',
    ];

    for (const url of maliciousEndpoints) {
      assert.throws(
        () => adapter.validateEndpointSecurity(url),
        (err: any) => err.message.includes('SSRF blocked'),
        `Expected SSRF block for ${url}`,
      );
    }
  });

  it('3.5: SSRF Defense: Block IPv6 literals and loopback', () => {
    const adapter = new HealthExchangeAdapter('KSA_SEHA_NPHIES');
    const maliciousEndpoints = [
      'https://[::1]/fhir',
      'https://[fe80::1]/fhir',
      'https://[fc00::1]/fhir',
    ];

    for (const url of maliciousEndpoints) {
      assert.throws(
        () => adapter.validateEndpointSecurity(url),
        (err: any) => err.message.includes('SSRF blocked'),
        `Expected SSRF block for ${url}`,
      );
    }
  });

  it('3.6: Reject internal and metadata hostnames', () => {
    const adapter = new PharmacyAdapter();
    const internalHostnames = [
      'https://localhost/api',
      'https://metadata.google.internal/computeMetadata/v1/',
      'https://instance-data/latest/meta-data/',
    ];

    for (const url of internalHostnames) {
      assert.throws(
        () => adapter.validateEndpointSecurity(url),
        (err: any) => err.message.includes('SSRF blocked'),
      );
    }
  });

  it('3.7: Reject unallowlisted domains and domain spoofing / suffix evasion', () => {
    const adapter = new HealthExchangeAdapter('KSA_SEHA_NPHIES');

    // Completely unallowlisted
    assert.throws(
      () => adapter.validateEndpointSecurity('https://attacker-controlled-server.com/fhir'),
      (err: any) => err.message.includes('not in the certified allowlist'),
    );

    // Evasion attempt: target domain appended as subdomain of attacker domain
    assert.throws(
      () => adapter.validateEndpointSecurity('https://sandbox.nphies.sa.attacker.com/fhir'),
      (err: any) => err.message.includes('not in the certified allowlist'),
    );

    // Evasion attempt: prefix spoofing
    assert.throws(
      () => adapter.validateEndpointSecurity('https://evil-sandbox.nphies.sa/fhir'),
      (err: any) => err.message.includes('not in the certified allowlist'),
    );
  });

  it('3.8: Accept certified allowlisted domains', () => {
    const pharmacy = new PharmacyAdapter();
    const parsed1 = pharmacy.validateEndpointSecurity('https://sandbox.wasfaty.sa/api/v1/erx');
    assert.equal(parsed1.hostname, 'sandbox.wasfaty.sa');

    const hie = new HealthExchangeAdapter('KSA_SEHA_NPHIES');
    const parsed2 = hie.validateEndpointSecurity('https://sandbox.nphies.sa/fhir/r4/bundle');
    assert.equal(parsed2.hostname, 'sandbox.nphies.sa');
  });

  it('3.9: Zero-PHI enforcement in ordinary integration logs', () => {
    const adapter = new PharmacyAdapter();
    // Test that PII / PHI fields are deleted during sanitizeLog
    const logString = (adapter as any).sanitizeLog('Prescription transmission dispatched', {
      transmissionId: 'TRX-12345',
      patientName: 'أحمد محمود القحطاني',
      nationalId: '1098765432',
      phone: '+966501234567',
      email: 'ahmed@patient.local',
      address: 'الرياض، المملكة العربية السعودية',
      clinicalNotes: 'المريض يعاني من التهاب حاد',
      status: 'SENT',
    });

    assert.ok(!logString.includes('أحمد محمود القحطاني'), 'PHI patientName must be stripped');
    assert.ok(!logString.includes('1098765432'), 'PHI nationalId must be stripped');
    assert.ok(!logString.includes('+966501234567'), 'PHI phone must be stripped');
    assert.ok(!logString.includes('ahmed@patient.local'), 'PHI email must be stripped');
    assert.ok(!logString.includes('التهاب حاد'), 'PHI clinicalNotes must be stripped');
    assert.ok(logString.includes('TRX-12345'), 'Non-PHI transmissionId preserved');
    assert.ok(logString.includes('SENT'), 'Non-PHI status preserved');
  });
});
