import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { PediatricsRepository } from '../src/prisma/pediatrics.repository.js';
import { VerifiedSessions } from '../src/prisma/verified-sessions.js';
import { IdentityDatabase } from '../src/prisma/identity.database.js';
import { authorizationHash } from '../src/auth/crypto.js';
import { testUrls, fixtureDatabase } from './database-fixtures.js';

describe('Pediatrics & Child Health Module Integration & Security Tests', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  let pool: pg.Pool;
  let pediatricsRepo: PediatricsRepository;
  let verifiedSessions: VerifiedSessions;
  let identity: IdentityDatabase;

  const suffix = randomUUID().slice(0, 8);
  let clinicAId: string;
  let clinicBId: string;
  let branchAId: string;
  let branchBId: string;

  let userPediatricianAId: string;
  let userNonPediatricianAId: string;
  let userPediatricianBId: string;

  let membershipPediatricianAId: string;
  let membershipNonPediatricianAId: string;
  let membershipPediatricianBId: string;

  let sessionPediatricianAId: string;
  let sessionNonPediatricianAId: string;
  let sessionPediatricianBId: string;

  let patientChildAId: string;
  let patientInfantPretermAId: string;
  let patientChildBId: string;

  let encounterAId: string;

  before(async () => {
    const urls = testUrls();
    process.env.DATABASE_URL = urls.runtime;
    process.env.NODE_ENV = 'test';
    owner = fixtureDatabase();
    pool = new pg.Pool({ connectionString: urls.runtime, max: 5 });

    // Bootstrap Nest context
    const { AppModule } = await import('../src/app.module.js');
    app = await NestFactory.create(AppModule, { logger: false });
    await app.init();

    pediatricsRepo = app.get(PediatricsRepository);
    verifiedSessions = app.get(VerifiedSessions);
    identity = app.get(IdentityDatabase);

    // 1. Create two distinct clinics
    const clinicA = await owner.clinic.create({
      data: {
        slug: `ped-clinic-a-${suffix}`,
        legalName: 'مجمع عيادات الأطفال والأسرة (أ)',
        displayName: 'عيادة الأمل للأطفال',
        currency: 'YER',
        timezone: 'Asia/Aden',
      },
    });
    clinicAId = clinicA.id;

    const clinicB = await owner.clinic.create({
      data: {
        slug: `ped-clinic-b-${suffix}`,
        legalName: 'مجمع العيادات التخصصية (ب)',
        displayName: 'عيادة البسمة التخصصية',
        currency: 'YER',
        timezone: 'Asia/Aden',
      },
    });
    clinicBId = clinicB.id;

    // Branches (auto-created by clinic trigger)
    const branchA = await owner.clinicBranch.findFirstOrThrow({
      where: { clinicId: clinicAId, code: 'MAIN' },
    });
    branchAId = branchA.id;

    const branchB = await owner.clinicBranch.findFirstOrThrow({
      where: { clinicId: clinicBId, code: 'MAIN' },
    });
    branchBId = branchB.id;

    // 2. Specialty enablement
    const pedSpecialty = await owner.medicalSpecialty.findUniqueOrThrow({
      where: { code: 'PEDIATRICS' },
    });

    await owner.clinicSpecialty.create({
      data: { clinicId: clinicAId, specialtyId: pedSpecialty.id, status: 'ACTIVE' },
    });
    await owner.branchSpecialty.create({
      data: { clinicId: clinicAId, branchId: branchAId, specialtyId: pedSpecialty.id, status: 'ACTIVE' },
    });

    await owner.clinicSpecialty.create({
      data: { clinicId: clinicBId, specialtyId: pedSpecialty.id, status: 'ACTIVE' },
    });
    await owner.branchSpecialty.create({
      data: { clinicId: clinicBId, branchId: branchBId, specialtyId: pedSpecialty.id, status: 'ACTIVE' },
    });

    // 3. Users and Memberships
    // Doctor A: Qualified Pediatrician with clinical privileges
    const userPedA = await owner.user.create({
      data: {
        name: 'د. أروى عبد الله - استشارية أطفال',
        email: `pediatrician-a-${suffix}@example.invalid`,
        status: 'ACTIVE',
      },
    });
    userPediatricianAId = userPedA.id;

    const memPedA = await owner.clinicMembership.create({
      data: {
        clinicId: clinicAId,
        userId: userPediatricianAId,
        role: 'DOCTOR',
        status: 'ACTIVE',
      },
    });
    membershipPediatricianAId = memPedA.id;

    await owner.branchMembership.create({
      data: { clinicId: clinicAId, branchId: branchAId, membershipId: membershipPediatricianAId, isPrimary: true, active: true },
    });

    // Profile & Credentials
    const profPedA = await owner.practitionerProfile.create({
      data: {
        clinicId: clinicAId,
        membershipId: membershipPediatricianAId,
        professionalTitleAr: 'استشارية طب الأطفال وحديثي الولادة',
        professionalTitleEn: 'Consultant Pediatrician',
        licenseNumber: `PED-LIC-${suffix}`,
        licensingAuthority: 'المجلس الطبي اليمني',
        licensingJurisdiction: 'YEMEN',
        verificationStatus: 'VERIFIED',
      },
    });

    const qualPedA = await owner.practitionerSpecialty.create({
      data: {
        clinicId: clinicAId,
        practitionerProfileId: profPedA.id,
        specialtyId: pedSpecialty.id,
        qualificationTitle: 'البورد العربي في طب الأطفال',
        status: 'VERIFIED',
        effectiveDate: new Date(Date.now() - 365 * 86400000),
      },
    });

    for (const priv of [
      'PEDIATRIC_CARE_DOCUMENT',
      'PEDIATRIC_GROWTH_RECORD',
      'PEDIATRIC_GROWTH_REVIEW',
      'PEDIATRIC_BIRTH_HISTORY_VERIFY',
    ] as const) {
      await owner.practitionerClinicalPrivilege.create({
        data: {
          clinicId: clinicAId,
          practitionerProfileId: profPedA.id,
          specialtyId: pedSpecialty.id,
          practitionerSpecialtyId: qualPedA.id,
          privilegeCode: priv,
          scope: 'CLINIC_WIDE',
          status: 'APPROVED',
          effectiveDate: new Date(Date.now() - 365 * 86400000),
        },
      });
    }

    // Doctor Non-Pediatrician A (No pediatric privileges)
    const userNonPedA = await owner.user.create({
      data: {
        name: 'د. خالد سالم - طبيب مقيم',
        email: `resident-a-${suffix}@example.invalid`,
        status: 'ACTIVE',
      },
    });
    userNonPediatricianAId = userNonPedA.id;

    const memNonPedA = await owner.clinicMembership.create({
      data: {
        clinicId: clinicAId,
        userId: userNonPediatricianAId,
        role: 'DOCTOR',
        status: 'ACTIVE',
      },
    });
    membershipNonPediatricianAId = memNonPedA.id;

    await owner.branchMembership.create({
      data: { clinicId: clinicAId, branchId: branchAId, membershipId: membershipNonPediatricianAId, isPrimary: true, active: true },
    });

    await owner.practitionerProfile.create({
      data: {
        clinicId: clinicAId,
        membershipId: membershipNonPediatricianAId,
        professionalTitleAr: 'طبيب مقيم',
        professionalTitleEn: 'Resident Physician',
        verificationStatus: 'VERIFIED',
      },
    });

    // Doctor B in Clinic B
    const userPedB = await owner.user.create({
      data: {
        name: 'د. سمير عبده - استشاري أطفال عيادة ب',
        email: `pediatrician-b-${suffix}@example.invalid`,
        status: 'ACTIVE',
      },
    });
    userPediatricianBId = userPedB.id;

    const memPedB = await owner.clinicMembership.create({
      data: {
        clinicId: clinicBId,
        userId: userPediatricianBId,
        role: 'DOCTOR',
        status: 'ACTIVE',
      },
    });
    membershipPediatricianBId = memPedB.id;

    await owner.branchMembership.create({
      data: { clinicId: clinicBId, branchId: branchBId, membershipId: membershipPediatricianBId, isPrimary: true, active: true },
    });

    // Sessions
    const makeSession = async (sessionId: string, userId: string, clinicId: string, branchId: string) => {
      const u = await identity.loadUser(owner, userId);
      const hash = authorizationHash(u!);
      const token = randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '');
      await owner.session.create({
        data: {
          id: sessionId,
          userId,
          selectedClinicId: clinicId,
          selectedBranchId: branchId,
          tokenHash: token,
          csrfHash: token,
          authorizationHash: hash,
          expiresAt: new Date(Date.now() + 86400000),
        },
      });
    };

    sessionPediatricianAId = randomUUID();
    sessionNonPediatricianAId = randomUUID();
    sessionPediatricianBId = randomUUID();

    await makeSession(sessionPediatricianAId, userPediatricianAId, clinicAId, branchAId);
    await makeSession(sessionNonPediatricianAId, userNonPediatricianAId, clinicAId, branchAId);
    await makeSession(sessionPediatricianBId, userPediatricianBId, clinicBId, branchBId);

    // 4. Patients
    // Patient 1 (Clinic A): 4-year-old child born full-term
    const patient1 = await owner.patient.create({
      data: {
        clinicId: clinicAId,
        patientNumber: `P-${String(Math.floor(Math.random() * 900000) + 100000)}`,
        fullName: 'الطفل يوسف أحمد حسن',
        searchName: 'يوسف احمد حسن',
        dateOfBirth: new Date(Date.now() - 4 * 365.25 * 86400000), // 4 years old
        gender: 'MALE',
        status: 'ACTIVE',
      },
    });
    patientChildAId = patient1.id;

    // Patient 2 (Clinic A): 3-month-old preterm infant (born 32 weeks)
    const patient2 = await owner.patient.create({
      data: {
        clinicId: clinicAId,
        patientNumber: `P-${String(Math.floor(Math.random() * 900000) + 100000)}`,
        fullName: 'الرضيعة مريم ياسين',
        searchName: 'مريم ياسين',
        dateOfBirth: new Date(Date.now() - 90 * 86400000), // 90 days chronological
        gender: 'FEMALE',
        status: 'ACTIVE',
      },
    });
    patientInfantPretermAId = patient2.id;

    // Patient 3 (Clinic B): Foreign patient
    const patient3 = await owner.patient.create({
      data: {
        clinicId: clinicBId,
        patientNumber: `P-${String(Math.floor(Math.random() * 900000) + 100000)}`,
        fullName: 'الطفل عمار ناصر (عيادة ب)',
        searchName: 'عمار ناصر',
        dateOfBirth: new Date(Date.now() - 2 * 365.25 * 86400000),
        gender: 'MALE',
        status: 'ACTIVE',
      },
    });
    patientChildBId = patient3.id;

    // Active Clinical Encounter for Patient 1
    const encounterA = await owner.clinicalEncounter.create({
      data: {
        clinicId: clinicAId,
        patientId: patientChildAId,
        clinicianMembershipId: membershipPediatricianAId,
        status: 'IN_PROGRESS',
      },
    });
    encounterAId = encounterA.id;
  });

  after(async () => {
    await app?.close();
    await pool?.end();
    await owner?.$disconnect();
  });

  const getProofPedA = async () => verifiedSessions.issue(userPediatricianAId, sessionPediatricianAId);
  const getProofNonPedA = async () => verifiedSessions.issue(userNonPediatricianAId, sessionNonPediatricianAId);
  const getProofPedB = async () => verifiedSessions.issue(userPediatricianBId, sessionPediatricianBId);

  // =========================================================================
  // 1. NEONATAL BIRTH HISTORY TESTS
  // =========================================================================

  describe('1. Neonatal Birth History & Attributable Amendments', () => {
    let createdHistoryId: string;

    it('records a comprehensive neonatal birth history with APGAR and delivery details', async () => {
      const proof = await getProofPedA();
      const result = await pediatricsRepo.recordBirthHistory(proof, clinicAId, membershipPediatricianAId, {
        patientId: patientInfantPretermAId,
        gestationalAgeWeeks: 32,
        gestationalAgeDays: 3,
        birthWeightGrams: 1850,
        birthLengthCm: 42.5,
        birthHeadCircumferenceCm: 29.0,
        apgar1Min: 7,
        apgar5Min: 9,
        apgar10Min: 10,
        deliveryMode: 'CESAREAN_EMERGENCY',
        birthType: 'SINGLETON',
        birthComplications: 'ولادة مبكرة بسبب انفصال جزئي في المشيمة',
        maternalComplications: 'ارتفاع ضغط الدم الحملي',
        nicAdmissionRequired: true,
        nicStayDays: 18,
        source: 'HOSPITAL_DISCHARGE_SUMMARY',
        consanguinity: false,
      });

      assert(result.id);
      assert.equal(result.patientId, patientInfantPretermAId);
      assert.equal(result.gestationalAgeWeeks, 32);
      assert.equal(result.deliveryMode, 'CESAREAN_EMERGENCY');
      assert.equal(result.version, 1);
      assert(result.verifiedAt !== null);

      createdHistoryId = result.id;
    });

    it('prevents creating duplicate birth history records for the same patient', async () => {
      const proof = await getProofPedA();
      await assert.rejects(
        async () => {
          await pediatricsRepo.recordBirthHistory(proof, clinicAId, membershipPediatricianAId, {
            patientId: patientInfantPretermAId,
            gestationalAgeWeeks: 34,
          });
        },
        (err: unknown) => {
          assert(err instanceof Error);
          assert.match(err.message, /already recorded/i);
          return true;
        },
      );
    });

    it('allows attributable amendments preserving audit snapshot and incrementing version', async () => {
      const proof = await getProofPedA();
      const amended = await pediatricsRepo.amendBirthHistory(
        proof,
        clinicAId,
        membershipPediatricianAId,
        createdHistoryId,
        {
          expectedVersion: 1,
          amendmentReason: 'تصحيح وزن الولادة الدقيق حسب التقرير التفصيلي من المستشفى',
          birthWeightGrams: 1890,
          nicStayDays: 21,
        },
      );

      assert.equal(amended.version, 2);
      assert.equal(amended.birthWeightGrams, 1890);
      assert.equal(amended.nicStayDays, 21);

      // Verify amendmentHistory array
      const history = amended.amendmentHistory as Array<{
        amendmentReason: string;
        previousState: { version: number; birthWeightGrams: number };
      }>;
      assert.equal(history.length, 1);
      assert.equal(history[0].previousState.version, 1);
      assert.equal(history[0].previousState.birthWeightGrams, 1850);
      assert.equal(history[0].amendmentReason, 'تصحيح وزن الولادة الدقيق حسب التقرير التفصيلي من المستشفى');
    });

    it('rejects amendment with concurrent modification conflict (mismatched version)', async () => {
      const proof = await getProofPedA();
      await assert.rejects(
        async () => {
          await pediatricsRepo.amendBirthHistory(
            proof,
            clinicAId,
            membershipPediatricianAId,
            createdHistoryId,
            {
              expectedVersion: 1, // Current is 2
              amendmentReason: 'تعديل قديم متزامن',
            },
          );
        },
        (err: unknown) => {
          assert(err instanceof Error);
          assert.match(err.message, /Concurrent modification conflict/i);
          return true;
        },
      );
    });

    it('blocks clinician without pediatric privileges from recording birth history', async () => {
      const proof = await getProofNonPedA();
      await assert.rejects(
        async () => {
          await pediatricsRepo.recordBirthHistory(proof, clinicAId, membershipNonPediatricianAId, {
            patientId: patientChildAId,
            gestationalAgeWeeks: 39,
          });
        },
        (err: unknown) => {
          assert(err instanceof Error);
          assert.match(err.message, /Insufficient clinical privileges|Practitioner lacks verified qualification/i);
          return true;
        },
      );
    });
  });

  // =========================================================================
  // 2. CAREGIVER AUTHORIZATION & RELATIONSHIPS
  // =========================================================================

  describe('2. Caregiver Authorization & Custody Governance', () => {
    let caregiver1Id: string;
    let caregiver2Id: string;

    it('creates child-caregiver relationships with distinct legal and consent scopes', async () => {
      const proof = await getProofPedA();

      // Mother: Primary legal custody and medical consent
      const mother = await pediatricsRepo.createCaregiver(proof, clinicAId, membershipPediatricianAId, {
        patientId: patientChildAId,
        caregiverName: 'فاطمة محمد علي (الأم)',
        caregiverNationalId: 'NAT-10029384',
        caregiverPhone: '771234567',
        relationshipType: 'MOTHER',
        hasLegalCustody: true,
        hasMedicalConsentAuthority: true,
        isEmergencyContact: true,
        emergencyPriority: 1,
        portalProxyAccess: true,
      });

      assert(mother.id);
      assert.equal(mother.hasLegalCustody, true);
      assert.equal(mother.hasMedicalConsentAuthority, true);
      assert.equal(mother.portalProxyAccess, true);
      caregiver1Id = mother.id;

      // Grandfather: Emergency contact only, no medical consent authority
      const grandFather = await pediatricsRepo.createCaregiver(proof, clinicAId, membershipPediatricianAId, {
        patientId: patientChildAId,
        caregiverName: 'محمد علي حسن (الجد)',
        caregiverPhone: '779876543',
        relationshipType: 'GRANDPARENT',
        hasLegalCustody: false,
        hasMedicalConsentAuthority: false,
        isEmergencyContact: true,
        emergencyPriority: 2,
        portalProxyAccess: false,
      });

      assert.equal(grandFather.hasMedicalConsentAuthority, false);
      assert.equal(grandFather.portalProxyAccess, false);
      caregiver2Id = grandFather.id;
    });

    it('lists caregivers sorted by active status and emergency priority', async () => {
      const proof = await getProofPedA();
      const list = await pediatricsRepo.listCaregivers(proof, clinicAId, patientChildAId);

      assert.equal(list.items.length, 2);
      assert.equal(list.items[0].id, caregiver1Id); // Priority 1
      assert.equal(list.items[1].id, caregiver2Id); // Priority 2
    });

    it('revokes caregiver authorization immediately terminating consent and portal proxy access', async () => {
      const proof = await getProofPedA();
      const revoked = await pediatricsRepo.revokeCaregiver(
        proof,
        clinicAId,
        membershipPediatricianAId,
        caregiver2Id,
        {
          expectedVersion: 1,
          revocationReason: 'تغيير في جهات الاتصال المعتمدة للطوارئ بطلب من الأم الحاضنة',
        },
      );

      assert.equal(revoked.isRevoked, true);
      assert.equal(revoked.hasMedicalConsentAuthority, false);
      assert.equal(revoked.portalProxyAccess, false);
      assert(revoked.revokedAt !== null);
      assert.equal(revoked.revokedByMembershipId, membershipPediatricianAId);
    });

    it('prohibits mutating a revoked caregiver relationship', async () => {
      const proof = await getProofPedA();
      await assert.rejects(
        async () => {
          await pediatricsRepo.updateCaregiver(
            proof,
            clinicAId,
            membershipPediatricianAId,
            caregiver2Id,
            {
              expectedVersion: 2,
              caregiverPhone: '770000000',
            },
          );
        },
        (err: unknown) => {
          assert(err instanceof Error);
          assert.match(err.message, /Cannot modify a revoked caregiver/i);
          return true;
        },
      );
    });
  });

  // =========================================================================
  // 3. PEDIATRIC GROWTH RECORDS & ANALYTICS
  // =========================================================================

  describe('3. Longitudinal Pediatric Growth Records & Analytics', () => {
    let growthRecord1Id: string;

    it('records growth measurement, calculating chronological and prematurity-corrected age and WHO percentiles', async () => {
      const proof = await getProofPedA();

      // For preterm infant (patientInfantPretermAId) born at 32w, chronological 90 days:
      // Weight 4.8 kg, Recumbent length 56.0 cm, Head circumference 38.5 cm
      const result = await pediatricsRepo.recordGrowth(proof, clinicAId, membershipPediatricianAId, {
        patientId: patientInfantPretermAId,
        encounterId: encounterAId,
        weightKg: 4.8,
        statureCm: 56.0,
        headCircumferenceCm: 38.5,
        useCorrectedAgeForZScores: true,
      });

      assert(result.id);
      assert.equal(result.chronologicalAgeDays, 90);
      // Preterm deficit was (40 - 32) * 7 - 3 = 53 days -> corrected age = 90 - 53 = 37 days (~1.2 months)
      assert(result.correctedAgeDays !== null && result.correctedAgeDays > 0);
      assert.equal(result.statureMethod, 'RECUMBENT_LENGTH');
      assert(result.weightForAgeZScore !== null);
      assert(result.weightForAgePercentile !== null);
      assert(result.lengthForAgeZScore !== null);
      assert(result.headCircumferenceZScore !== null);
      assert.equal(result.status, 'FINAL');

      growthRecord1Id = result.id;
    });

    it('marks a finalized growth record as entered-in-error with reason and audit trail', async () => {
      const proof = await getProofPedA();
      const updated = await pediatricsRepo.enterInErrorGrowthRecord(
        proof,
        clinicAId,
        membershipPediatricianAId,
        growthRecord1Id,
        {
          expectedVersion: 1,
          errorReason: 'تم تسجيل قياس الرأس خطأً بالسنتيمتر بدلاً من البوصة وتمت إعادة القياس',
        },
      );

      assert.equal(updated.status, 'ENTERED_IN_ERROR');
      assert.equal(updated.errorReason, 'تم تسجيل قياس الرأس خطأً بالسنتيمتر بدلاً من البوصة وتمت إعادة القياس');
      assert.equal(updated.version, 2);
    });

    it('blocks non-pediatric clinician from recording growth records', async () => {
      const proof = await getProofNonPedA();
      await assert.rejects(
        async () => {
          await pediatricsRepo.recordGrowth(proof, clinicAId, membershipNonPediatricianAId, {
            patientId: patientChildAId,
            weightKg: 16.0,
            statureCm: 102.0,
          });
        },
        (err: unknown) => {
          assert(err instanceof Error);
          assert.match(err.message, /Insufficient clinical privileges|Practitioner lacks verified qualification/i);
          return true;
        },
      );
    });
  });

  // =========================================================================
  // 4. PEDIATRIC MEDICATION SAFETY PREFLIGHT
  // =========================================================================

  describe('4. Pediatric Medication Safety Preflight Integration', () => {
    it('flags CRITICAL when prescribing pediatric medication with missing weight documentation', async () => {
      const proof = await getProofPedA();
      // Patient 1 has no growth records / weight documented yet
      const preflight = await pediatricsRepo.preflightMedicationSafety(proof, clinicAId, {
        patientId: patientChildAId,
        medicationName: 'Amoxicillin 250mg suspension',
      });

      assert.equal(preflight.isSafeToProceed, false);
      assert.equal(preflight.hasCriticalAlerts, true);
      assert(preflight.alerts.some((a) => a.code === 'WEIGHT_REQUIRED_FOR_PEDIATRIC_DISPENSING'));
    });

    it('blocks Aspirin in a 4-year-old child due to Reye Syndrome risk (CRITICAL)', async () => {
      const proof = await getProofPedA();
      const preflight = await pediatricsRepo.preflightMedicationSafety(proof, clinicAId, {
        patientId: patientChildAId,
        medicationName: 'Aspirin 100mg tablets',
        currentWeightKg: 16.5,
      });

      assert.equal(preflight.isSafeToProceed, false);
      assert(preflight.alerts.some((a) => a.code === 'CONTRAINDICATION_REYES_SYNDROME'));
    });

    it('blocks Tetracycline in a 4-year-old child (< 8 years) due to enamel hypoplasia (CRITICAL)', async () => {
      const proof = await getProofPedA();
      const preflight = await pediatricsRepo.preflightMedicationSafety(proof, clinicAId, {
        patientId: patientChildAId,
        medicationName: 'Doxycycline 100mg',
        currentWeightKg: 16.5,
      });

      assert.equal(preflight.isSafeToProceed, false);
      assert(preflight.alerts.some((a) => a.code === 'CONTRAINDICATION_DENTAL_STAINING'));
    });

    it('blocks Codeine in a child (< 12 years) due to fatal CYP2D6 respiratory arrest warning (CRITICAL)', async () => {
      const proof = await getProofPedA();
      const preflight = await pediatricsRepo.preflightMedicationSafety(proof, clinicAId, {
        patientId: patientChildAId,
        medicationName: 'Codeine phosphate syrup',
        currentWeightKg: 16.5,
      });

      assert.equal(preflight.isSafeToProceed, false);
      assert(preflight.alerts.some((a) => a.code === 'CONTRAINDICATION_RESPIRATORY_DEPRESSION'));
    });

    it('detects penicillin cross-reactivity when child has active Penicillin allergy', async () => {
      const proof = await getProofPedA();

      // Record penicillin allergy on Patient 1
      await owner.patientAllergy.create({
        data: {
          clinicId: clinicAId,
          patientId: patientChildAId,
          recordedByMembershipId: membershipPediatricianAId,
          allergyStatusType: 'ALLERGY_PRESENT',
          category: 'MEDICATION',
          substance: 'Penicillin',
          severity: 'SEVERE',
          clinicalStatus: 'ACTIVE',
        },
      });

      const preflight = await pediatricsRepo.preflightMedicationSafety(proof, clinicAId, {
        patientId: patientChildAId,
        medicationName: 'Augmentin (Amoxicillin/Clavulanate) 312.5mg/5ml',
        currentWeightKg: 16.5,
      });

      assert.equal(preflight.isSafeToProceed, false);
      assert(preflight.alerts.some((a) => a.code === 'ALLERGY_PENICILLIN_CROSS_REACTIVITY'));
    });
  });

  // =========================================================================
  // 5. MULTI-TENANT & ROW LEVEL SECURITY ISOLATION
  // =========================================================================

  describe('5. Multi-Tenant Boundary & Row-Level Security Isolation', () => {
    it('strictly isolates pediatric birth history across clinics (Clinic B cannot view Clinic A history)', async () => {
      const proofB = await getProofPedB();
      // Clinic B attempts to read Clinic A infant's birth history
      const history = await pediatricsRepo.getBirthHistory(proofB, clinicBId, patientInfantPretermAId);
      assert.equal(history, null);
    });

    it('strictly isolates caregiver records across clinics', async () => {
      const proofB = await getProofPedB();
      // Clinic B attempts to list Clinic A child's caregivers
      const list = await pediatricsRepo.listCaregivers(proofB, clinicBId, patientChildAId);
      assert.equal(list.items.length, 0);
    });

    it('strictly isolates growth records across clinics', async () => {
      const proofB = await getProofPedB();
      // Clinic B attempts to list Clinic A child's growth records
      const list = await pediatricsRepo.listGrowthRecords(proofB, clinicBId, patientChildAId);
      assert.equal(list.items.length, 0);
    });

    it('rejects cross-tenant recording attempts (Doctor in Clinic B cannot record in Clinic A)', async () => {
      const proofB = await getProofPedB();
      await assert.rejects(
        async () => {
          await pediatricsRepo.recordBirthHistory(proofB, clinicAId, membershipPediatricianBId, {
            patientId: patientChildAId,
            gestationalAgeWeeks: 38,
          });
        },
        (err: unknown) => {
          assert(err instanceof Error);
          return true;
        },
      );
    });
    it('allows Doctor in Clinic B with credentials to record growth for Clinic B child', async () => {
      const profB = await owner.practitionerProfile.create({
        data: {
          clinicId: clinicBId,
          membershipId: membershipPediatricianBId,
          professionalTitleAr: 'أخصائي طب الأطفال',
          professionalTitleEn: 'Pediatric Specialist',
          verificationStatus: 'VERIFIED',
        },
      });
      const pedSpecialty = await owner.medicalSpecialty.findUniqueOrThrow({ where: { code: 'PEDIATRICS' } });
      const qualB = await owner.practitionerSpecialty.create({
        data: {
          clinicId: clinicBId,
          practitionerProfileId: profB.id,
          specialtyId: pedSpecialty.id,
          qualificationTitle: 'ماجستير طب أطفال',
          status: 'VERIFIED',
        },
      });
      await owner.practitionerClinicalPrivilege.create({
        data: {
          clinicId: clinicBId,
          practitionerProfileId: profB.id,
          specialtyId: qualB.specialtyId,
          practitionerSpecialtyId: qualB.id,
          privilegeCode: 'PEDIATRIC_GROWTH_RECORD',
          scope: 'CLINIC_WIDE',
          status: 'APPROVED',
        },
      });

      const proofB = await getProofPedB();
      const result = await pediatricsRepo.recordGrowth(proofB, clinicBId, membershipPediatricianBId, {
        patientId: patientChildBId,
        weightKg: 12.0,
        statureCm: 88.0,
      });
      assert(result.id);
      assert.equal(result.patientId, patientChildBId);
    });
  });
});
