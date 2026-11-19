import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { ObGynRepository } from '../src/prisma/obgyn.repository.js';
import { VerifiedSessions } from '../src/prisma/verified-sessions.js';
import { IdentityDatabase } from '../src/prisma/identity.database.js';
import { authorizationHash } from '../src/auth/crypto.js';
import { testUrls, fixtureDatabase } from './database-fixtures.js';

describe('Obstetrics & Gynecology (OB_GYN) Specialty Integration & Security Tests', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  let pool: pg.Pool;
  let obgynRepo: ObGynRepository;
  let verifiedSessions: VerifiedSessions;
  let identity: IdentityDatabase;

  const suffix = randomUUID().slice(0, 8);
  let clinicAId: string;
  let clinicBId: string;
  let branchAId: string;
  let branchBId: string;

  let userObgynAId: string;
  let userResidentAId: string;
  let userObgynBId: string;

  let membershipObgynAId: string;
  let membershipResidentAId: string;
  let membershipObgynBId: string;

  let sessionObgynAId: string;
  let sessionResidentAId: string;
  let sessionObgynBId: string;

  let patientFemaleAId: string;
  let patientFemale2AId: string;
  let patientFemaleBId: string;

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

    obgynRepo = app.get(ObGynRepository);
    verifiedSessions = app.get(VerifiedSessions);
    identity = app.get(IdentityDatabase);

    // 1. Create two distinct clinics
    const clinicA = await owner.clinic.create({
      data: {
        slug: `obgyn-clinic-a-${suffix}`,
        legalName: 'مركز الأمومة وصحة المرأة (أ)',
        displayName: 'عيادة حواء للأمومة والنساء',
        currency: 'YER',
        timezone: 'Asia/Aden',
      },
    });
    clinicAId = clinicA.id;

    const clinicB = await owner.clinic.create({
      data: {
        slug: `obgyn-clinic-b-${suffix}`,
        legalName: 'مجمع العيادات التخصصية (ب)',
        displayName: 'عيادة الشفاء التخصصية',
        currency: 'YER',
        timezone: 'Asia/Aden',
      },
    });
    clinicBId = clinicB.id;

    // Branches
    const branchA = await owner.clinicBranch.findFirstOrThrow({
      where: { clinicId: clinicAId, code: 'MAIN' },
    });
    branchAId = branchA.id;

    const branchB = await owner.clinicBranch.findFirstOrThrow({
      where: { clinicId: clinicBId, code: 'MAIN' },
    });
    branchBId = branchB.id;

    // 2. Specialty enablement
    const obgynSpecialty = await owner.medicalSpecialty.findUniqueOrThrow({
      where: { code: 'OB_GYN' },
    });

    await owner.clinicSpecialty.create({
      data: { clinicId: clinicAId, specialtyId: obgynSpecialty.id, status: 'ACTIVE' },
    });
    await owner.branchSpecialty.create({
      data: { clinicId: clinicAId, branchId: branchAId, specialtyId: obgynSpecialty.id, status: 'ACTIVE' },
    });

    await owner.clinicSpecialty.create({
      data: { clinicId: clinicBId, specialtyId: obgynSpecialty.id, status: 'ACTIVE' },
    });
    await owner.branchSpecialty.create({
      data: { clinicId: clinicBId, branchId: branchBId, specialtyId: obgynSpecialty.id, status: 'ACTIVE' },
    });

    // 3. Users and Memberships
    // Doctor A: Fully credentialed OB/GYN specialist
    const userObgynA = await owner.user.create({
      data: {
        name: 'د. ليلى عبد الرقيب - استشارية النساء والتوليد',
        email: `obgyn-a-${suffix}@example.invalid`,
        status: 'ACTIVE',
      },
    });
    userObgynAId = userObgynA.id;

    const memObgynA = await owner.clinicMembership.create({
      data: {
        clinicId: clinicAId,
        userId: userObgynAId,
        role: 'DOCTOR',
        status: 'ACTIVE',
      },
    });
    membershipObgynAId = memObgynA.id;

    await owner.branchMembership.create({
      data: { clinicId: clinicAId, branchId: branchAId, membershipId: membershipObgynAId, isPrimary: true, active: true },
    });

    const profObgynA = await owner.practitionerProfile.create({
      data: {
        clinicId: clinicAId,
        membershipId: membershipObgynAId,
        professionalTitleAr: 'استشارية أمراض النساء وجراحة التوليد',
        professionalTitleEn: 'Consultant Obstetrician & Gynecologist',
        licenseNumber: `OBG-LIC-${suffix}`,
        licensingAuthority: 'المجلس الطبي اليمني',
        licensingJurisdiction: 'YEMEN',
        verificationStatus: 'VERIFIED',
      },
    });

    const qualObgynA = await owner.practitionerSpecialty.create({
      data: {
        clinicId: clinicAId,
        practitionerProfileId: profObgynA.id,
        specialtyId: obgynSpecialty.id,
        qualificationTitle: 'البورد العربي في التوليد وأمراض النساء',
        status: 'VERIFIED',
        effectiveDate: new Date(Date.now() - 365 * 86400000),
      },
    });

    for (const priv of [
      'ANTENATAL_CARE_DOCUMENT',
      'OBSTETRIC_DATING_REVIEW',
      'OBSTETRIC_EPISODE_FINALIZE',
      'GYNECOLOGICAL_EXAM_PERFORM',
      'GYNECOLOGICAL_RECORD_REVIEW',
    ] as const) {
      await owner.practitionerClinicalPrivilege.create({
        data: {
          clinicId: clinicAId,
          practitionerProfileId: profObgynA.id,
          specialtyId: obgynSpecialty.id,
          practitionerSpecialtyId: qualObgynA.id,
          privilegeCode: priv,
          scope: 'CLINIC_WIDE',
          status: 'APPROVED',
          effectiveDate: new Date(Date.now() - 365 * 86400000),
        },
      });
    }

    // Resident A in Clinic A (Doctor without OB/GYN specialty privileges)
    const userResA = await owner.user.create({
      data: {
        name: 'د. منى سعيد - طبيبة عامة',
        email: `resident-a-${suffix}@example.invalid`,
        status: 'ACTIVE',
      },
    });
    userResidentAId = userResA.id;

    const memResA = await owner.clinicMembership.create({
      data: {
        clinicId: clinicAId,
        userId: userResidentAId,
        role: 'DOCTOR',
        status: 'ACTIVE',
      },
    });
    membershipResidentAId = memResA.id;

    await owner.branchMembership.create({
      data: { clinicId: clinicAId, branchId: branchAId, membershipId: membershipResidentAId, isPrimary: true, active: true },
    });

    await owner.practitionerProfile.create({
      data: {
        clinicId: clinicAId,
        membershipId: membershipResidentAId,
        professionalTitleAr: 'طبيبة عامة',
        professionalTitleEn: 'General Practitioner',
        verificationStatus: 'VERIFIED',
      },
    });

    // Doctor B in Clinic B
    const userObgynB = await owner.user.create({
      data: {
        name: 'د. فاطمة ناصر - استشارية نساء وتوليد عيادة ب',
        email: `obgyn-b-${suffix}@example.invalid`,
        status: 'ACTIVE',
      },
    });
    userObgynBId = userObgynB.id;

    const memObgynB = await owner.clinicMembership.create({
      data: {
        clinicId: clinicBId,
        userId: userObgynBId,
        role: 'DOCTOR',
        status: 'ACTIVE',
      },
    });
    membershipObgynBId = memObgynB.id;

    await owner.branchMembership.create({
      data: { clinicId: clinicBId, branchId: branchBId, membershipId: membershipObgynBId, isPrimary: true, active: true },
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

    sessionObgynAId = randomUUID();
    sessionResidentAId = randomUUID();
    sessionObgynBId = randomUUID();

    await makeSession(sessionObgynAId, userObgynAId, clinicAId, branchAId);
    await makeSession(sessionResidentAId, userResidentAId, clinicAId, branchAId);
    await makeSession(sessionObgynBId, userObgynBId, clinicBId, branchBId);

    // 4. Patients
    // Patient 1 (Clinic A): Pregnant female, 28 years old
    const pat1 = await owner.patient.create({
      data: {
        clinicId: clinicAId,
        patientNumber: `P-${String(Math.floor(Math.random() * 900000) + 100000)}`,
        fullName: 'أروى محمد حميد',
        searchName: 'اروى محمد حميد',
        dateOfBirth: new Date(Date.now() - 28 * 365.25 * 86400000),
        gender: 'FEMALE',
        status: 'ACTIVE',
      },
    });
    patientFemaleAId = pat1.id;

    // Patient 2 (Clinic A): Gynecological patient, 34 years old
    const pat2 = await owner.patient.create({
      data: {
        clinicId: clinicAId,
        patientNumber: `P-${String(Math.floor(Math.random() * 900000) + 100000)}`,
        fullName: 'سميرة عبد العزيز غالب',
        searchName: 'سميرة عبد العزيز غالب',
        dateOfBirth: new Date(Date.now() - 34 * 365.25 * 86400000),
        gender: 'FEMALE',
        status: 'ACTIVE',
      },
    });
    patientFemale2AId = pat2.id;

    // Patient 3 (Clinic B): Patient in foreign clinic
    const pat3 = await owner.patient.create({
      data: {
        clinicId: clinicBId,
        patientNumber: `P-${String(Math.floor(Math.random() * 900000) + 100000)}`,
        fullName: 'نادية عبد الله سعيد',
        searchName: 'نادية عبد الله سعيد',
        dateOfBirth: new Date(Date.now() - 30 * 365.25 * 86400000),
        gender: 'FEMALE',
        status: 'ACTIVE',
      },
    });
    patientFemaleBId = pat3.id;

    // Encounter in Clinic A
    const encA = await owner.clinicalEncounter.create({
      data: {
        clinicId: clinicAId,
        patientId: patientFemaleAId,
        clinicianMembershipId: membershipObgynAId,
        status: 'IN_PROGRESS',
      },
    });
    encounterAId = encA.id;
  });

  after(async () => {
    await app?.close();
    await pool?.end();
    await owner?.$disconnect();
  });

  const getProofObgynA = async () => verifiedSessions.issue(userObgynAId, sessionObgynAId);
  const getProofResidentA = async () => verifiedSessions.issue(userResidentAId, sessionResidentAId);
  const getProofObgynB = async () => verifiedSessions.issue(userObgynBId, sessionObgynBId);

  // =========================================================================
  // 1. PREGNANCY EPISODE & CLINICIAN DATING REVIEW TESTS
  // =========================================================================

  describe('1. Pregnancy Episode & Clinician Dating Provenance', () => {
    let createdEpisodeId: string;

    it('creates an active pregnancy episode calculating Naegele EDD (+280d)', async () => {
      const proof = await getProofObgynA();
      // LMP: 12 weeks ago (approx 84 days ago)
      const lmp = new Date(Date.now() - 84 * 86400000).toISOString().slice(0, 10);

      const episode = await obgynRepo.createPregnancyEpisode(proof, clinicAId, membershipObgynAId, {
        patientId: patientFemaleAId,
        gravidity: 2,
        parity: 1,
        termDeliveries: 1,
        pretermDeliveries: 0,
        abortions: 0,
        livingChildren: 1,
        lastMenstrualPeriodDate: lmp,
        lmpCertainty: true,
        bloodGroupRh: 'O_POSITIVE',
        rhAntibodyScreenPositive: false,
        highRiskFlag: false,
      });

      assert(episode.id);
      assert.equal(episode.patientId, patientFemaleAId);
      assert.equal(episode.status, 'ACTIVE');
      assert.equal(episode.gravidity, 2);
      assert.equal(episode.parity, 1);
      assert.equal(episode.datingMethod, 'LMP_CERTAIN');
      assert.equal(episode.isDatingFinalized, false);

      // Verify EDD is exactly LMP + 280 days
      const expectedEdd = new Date(new Date(lmp + 'T00:00:00Z').getTime() + 280 * 86400000).toISOString().slice(0, 10);
      assert.equal(new Date(episode.estimatedDueDate).toISOString().slice(0, 10), expectedEdd);

      createdEpisodeId = episode.id;
    });

    it('rejects creating a duplicate ACTIVE pregnancy episode for the same patient', async () => {
      const proof = await getProofObgynA();
      const lmp = new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10);

      await assert.rejects(
        () =>
          obgynRepo.createPregnancyEpisode(proof, clinicAId, membershipObgynAId, {
            patientId: patientFemaleAId,
            gravidity: 3,
            parity: 1,
            lastMenstrualPeriodDate: lmp,
          }),
        /Patient already has an active pregnancy episode/
      );
    });

    it('retrieves the active pregnancy episode accurately', async () => {
      const proof = await getProofObgynA();
      const active = await obgynRepo.getActivePregnancyEpisode(proof, clinicAId, patientFemaleAId);
      assert(active);
      assert.equal(active.id, createdEpisodeId);
    });

    it('reviews and reconciles pregnancy dating using ultrasound CRL biometry', async () => {
      const proof = await getProofObgynA();
      // CRL: 45 mm (~11w1d / 78 days)
      const scanDate = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
      const confirmedEdd = new Date(Date.now() + 195 * 86400000).toISOString().slice(0, 10);

      const reviewed = await obgynRepo.reviewPregnancyDating(proof, clinicAId, membershipObgynAId, createdEpisodeId, {
        confirmedEstimatedDueDate: confirmedEdd,
        datingMethod: 'ULTRASOUND_FIRST_TRIMESTER',
        ultrasoundDatingDate: scanDate,
        crownRumpLengthMm: 45.0,
        datingRationale: 'مطابقة قياس الجنين بالفحص بالموجات فوق الصوتية وتأكيد عمر الحمل والموعد المتوقع',
      });

      assert.equal(reviewed.id, createdEpisodeId);
      assert.equal(reviewed.isDatingFinalized, true);
      assert.equal(reviewed.datingReviewedByMembershipId, membershipObgynAId);
      assert(reviewed.datingReviewedAt);
      assert.equal(Number(reviewed.crownRumpLengthMm), 45.0);
    });

    it('rejects dating review by practitioner without OBSTETRIC_DATING_REVIEW privilege', async () => {
      const proof = await getProofResidentA();
      const confirmedEdd = new Date(Date.now() + 195 * 86400000).toISOString().slice(0, 10);
      await assert.rejects(
        () =>
          obgynRepo.reviewPregnancyDating(proof, clinicAId, membershipResidentAId, createdEpisodeId, {
            confirmedEstimatedDueDate: confirmedEdd,
            datingMethod: 'ULTRASOUND_FIRST_TRIMESTER',
            crownRumpLengthMm: 50.0,
            datingRationale: 'محاولة تعديل غير مصرح بها',
          }),
        /ForbiddenException|Practitioner lacks verified qualification|Insufficient clinical privileges/
      );
    });
  });

  // =========================================================================
  // 2. ANTENATAL VISIT RECORDS & PRE-ECLAMPSIA SCREENING TESTS
  // =========================================================================

  describe('2. Antenatal Visit Records & Pre-Eclampsia Screening', () => {
    let createdVisitId: string;
    let episodeId: string;

    before(async () => {
      const proof = await getProofObgynA();
      const active = await obgynRepo.getActivePregnancyEpisode(proof, clinicAId, patientFemaleAId);
      episodeId = active!.id;
    });

    it('records an antenatal visit with maternal vitals, fundal height, and FHR', async () => {
      const proof = await getProofObgynA();
      const visit = await obgynRepo.recordAntenatalVisit(proof, clinicAId, membershipObgynAId, {
        patientId: patientFemaleAId,
        pregnancyEpisodeId: episodeId,
        encounterId: encounterAId,
        gestationalAgeWeeks: 24,
        gestationalAgeDays: 3,
        systolicBp: 118,
        diastolicBp: 76,
        weightKg: 64.5,
        fundalHeightCm: 24.0,
        fetalHeartRateBpm: 144,
        fetalPresentation: 'CEPHALIC',
        fetalMovementPresent: true,
        urineProtein: 'NEGATIVE',
        urineGlucose: 'NEGATIVE',
        peripheralEdema: 'NONE',
        clinicalNotes: 'حالة الأم والجنين مستقرة مع حركة جنينية جيدة',
        managementPlan: 'الاستمرار على مكملات الحديد وحمض الفوليك وفحص السكر الأسبوع 26',
        nextVisitRecommendedWeeks: 4,
      });

      assert(visit.id);
      assert.equal(visit.patientId, patientFemaleAId);
      assert.equal(visit.pregnancyEpisodeId, episodeId);
      assert.equal(visit.gestationalAgeWeeks, 24);
      assert.equal(visit.gestationalAgeDays, 3);
      assert.equal(visit.systolicBp, 118);
      assert.equal(visit.diastolicBp, 76);
      assert.equal(visit.fetalHeartRateBpm, 144);
      assert.equal(visit.status, 'FINALIZED');

      createdVisitId = visit.id;
    });

    it('flags pre-eclampsia alert on severe hypertension with proteinuria', async () => {
      const proof = await getProofObgynA();
      // Record visit with severe BP (162/112) and 2+ protein
      const alertVisit = await obgynRepo.recordAntenatalVisit(proof, clinicAId, membershipObgynAId, {
        patientId: patientFemaleAId,
        pregnancyEpisodeId: episodeId,
        encounterId: encounterAId,
        gestationalAgeWeeks: 28,
        gestationalAgeDays: 0,
        systolicBp: 164,
        diastolicBp: 112,
        weightKg: 68.0,
        fundalHeightCm: 28.0,
        fetalHeartRateBpm: 150,
        urineProtein: '2_PLUS',
        peripheralEdema: 'MODERATE_LOWER_EXTREMITIES',
        clinicalNotes: 'صداع خفيف مع تورم في الأطراف السفلية',
        managementPlan: 'إحالة فورية للتقييم والتنويم لمراقبة ما قبل الإرجاج وإعطاء كبريتات المغنيسيوم',
      });

      assert(alertVisit.id);
      assert.equal(alertVisit.systolicBp, 164);
      assert.equal(alertVisit.diastolicBp, 112);
      assert.equal(alertVisit.urineProtein, '2_PLUS');
    });

    it('database trigger blocks direct mutation of a FINALIZED antenatal visit record', async () => {
      // Direct raw SQL attempt to update systolicBp on finalized record
      await assert.rejects(
        () =>
          owner.$executeRawUnsafe(
            `UPDATE public."AntenatalVisitRecord" SET "systolicBp" = 120 WHERE "id" = '${createdVisitId}'::uuid`
          ),
        /Finalized OB\/GYN records cannot be altered/
      );
    });

    it('voids an antenatal visit marking it as ENTERED_IN_ERROR with mandatory clinical reason', async () => {
      const proof = await getProofObgynA();
      const voided = await obgynRepo.enterInErrorAntenatalVisit(
        proof,
        clinicAId,
        membershipObgynAId,
        createdVisitId,
        { errorReason: 'تم تسجيل قراءة ضغط الدم خطأ بالتباس مع مريضة أخرى في نفس الغرفة' }
      );

      assert.equal(voided.id, createdVisitId);
      assert.equal(voided.status, 'ENTERED_IN_ERROR');
      assert.equal(voided.errorReason, 'تم تسجيل قراءة ضغط الدم خطأ بالتباس مع مريضة أخرى في نفس الغرفة');
    });

    it('rejects any further modification after ENTERED_IN_ERROR', async () => {
      const proof = await getProofObgynA();
      await assert.rejects(
        () =>
          obgynRepo.enterInErrorAntenatalVisit(
            proof,
            clinicAId,
            membershipObgynAId,
            createdVisitId,
            { errorReason: 'محاولة إلغاء مكررة' }
          ),
        /already marked as entered-in-error/
      );
    });
  });

  // =========================================================================
  // 3. OBSTETRIC HISTORY & PRIOR DELIVERY DOCUMENTATION
  // =========================================================================

  describe('3. Obstetric History & Prior Deliveries', () => {
    it('records prior obstetric delivery with uterine surgery alert (Classical C-Section)', async () => {
      const proof = await getProofObgynA();
      const history = await obgynRepo.createObstetricHistory(proof, clinicAId, membershipObgynAId, {
        patientId: patientFemaleAId,
        pregnancyNumber: 1,
        yearOfDelivery: 2023,
        gestationalAgeWeeks: 38,
        deliveryOutcome: 'LIVE_BIRTH_CESAREAN_EMERGENCY',
        deliveryMode: 'CESAREAN_EMERGENCY',
        birthWeightGrams: 3200,
        babyGender: 'MALE',
        anesthesiaType: 'SPINAL',
        previousUterineSurgery: true,
        uterineSurgeryDetails: 'عملية قيصرية طارئة مع شق رحمي علوي (Classical Uterine Incision)',
        complications: 'تأخر في التئام الجرح',
        neonatalOutcome: 'وليد حي معافى - درجة أبغار 9/10',
        notes: 'يمنع تجربة الولادة الطبيعية بعد القيصرية (VBAC) لوجود شق رحمي علوي كلاسيكي',
      });

      assert(history.id);
      assert.equal(history.patientId, patientFemaleAId);
      assert.equal(history.pregnancyNumber, 1);
      assert.equal(history.deliveryOutcome, 'LIVE_BIRTH_CESAREAN_EMERGENCY');
      assert.equal(history.previousUterineSurgery, true);
      assert.equal(history.uterineSurgeryDetails, 'عملية قيصرية طارئة مع شق رحمي علوي (Classical Uterine Incision)');
    });

    it('lists obstetric history ordered by pregnancyNumber', async () => {
      const proof = await getProofObgynA();
      const list = await obgynRepo.listObstetricHistory(proof, clinicAId, patientFemaleAId);
      assert(list.length >= 1);
      assert.equal(list[0].pregnancyNumber, 1);
      assert.equal(list[0].previousUterineSurgery, true);
    });
  });

  // =========================================================================
  // 4. CONFIDENTIAL GYNECOLOGICAL EXAMINATIONS & ACCESS CONTROLS
  // =========================================================================

  describe('4. Confidential Gynecological Examinations & Multi-Tier Access Controls', () => {
    let examId: string;

    it('records a confidential gynecological examination with chaperone verification', async () => {
      const proof = await getProofObgynA();
      const exam = await obgynRepo.recordGynecologicalExam(proof, clinicAId, membershipObgynAId, {
        patientId: patientFemale2AId,
        encounterId: encounterAId,
        examinationType: 'CERVICAL_SCREENING',
        isConfidential: true,
        chaperonePresent: true,
        chaperoneNameOrId: 'الممرضة فاطمة عمر (RN)',
        indicationsSymptoms: 'مسحة عنق الرحم الروتينية مع تقييم نزيف بين الدورات',
        lastMenstrualPeriodDate: new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10),
        menstrualCycleDays: 28,
        menstrualFlowDurationDays: 5,
        dysmenorrheaReported: false,
        abnormalBleedingPattern: 'SPOTTING_POSTCOITAL',
        externalGenitaliaFindings: 'الأعضاء التناسلية الخارجية طبيعية بدون تقرحات أو ثآليل',
        speculumExaminationFindings: 'عنق الرحم سليم مع وجود منطقة تحول واضحة وبدون إفرازات قيحية',
        bimanualExaminationFindings: 'الرحم ذو حجم طبيعي ومتنقل، والمبيضين طبيعيان بدون كتل أو إيلام ملحوظ',
        cervicalScreeningSampleCollected: true,
        cervicalScreeningTestType: 'LIQUID_BASED_CYTOLOGY_HPV',
        clinicalAssessment: 'فحص سريري مطمئن، تم أخذ المسحة الخلوية للتقييم المخبري',
        managementPlan: 'متابعة نتيجة مسحة عنق الرحم خلال أسبوعين والامتناع عن الجماع لمدة 48 ساعة',
      });

      assert(exam.id);
      assert.equal(exam.patientId, patientFemale2AId);
      assert.equal(exam.isConfidential, true);
      assert.equal(exam.chaperonePresent, true);
      assert.equal(exam.cervicalScreeningSampleCollected, true);
      assert.equal(exam.status, 'FINALIZED');

      examId = exam.id;
    });

    it('privileged OB/GYN doctor retrieves full intimate findings without redaction', async () => {
      const proof = await getProofObgynA();
      const exam = await obgynRepo.getGynecologicalExam(proof, clinicAId, membershipObgynAId, examId);

      assert.equal(exam.id, examId);
      assert.equal(exam.speculumExaminationFindings, 'عنق الرحم سليم مع وجود منطقة تحول واضحة وبدون إفرازات قيحية');
      assert.equal(exam.bimanualExaminationFindings, 'الرحم ذو حجم طبيعي ومتنقل، والمبيضين طبيعيان بدون كتل أو إيلام ملحوظ');
      assert.equal(exam.externalGenitaliaFindings, 'الأعضاء التناسلية الخارجية طبيعية بدون تقرحات أو ثآليل');
    });

    it('non-privileged resident receives redacted intimate findings in examination list', async () => {
      const proof = await getProofResidentA();
      const list = await obgynRepo.listGynecologicalExams(proof, clinicAId, membershipResidentAId, patientFemale2AId);

      assert(list.length >= 1);
      const found = list.find((e) => e.id === examId);
      assert(found);
      assert.equal(found.isConfidential, true);
      // Verify redaction: intimate findings are stripped to null and protected indicator in indications
      assert.equal(found.indicationsSymptoms, '[محتوى محمي - فحص نسائي سري / CONFIDENTIAL INTIMATE RECORD]');
      assert.equal(found.speculumExaminationFindings, null);
      assert.equal(found.bimanualExaminationFindings, null);
      assert.equal(found.externalGenitaliaFindings, null);
    });

    it('non-privileged resident direct retrieval of confidential exam throws ForbiddenException', async () => {
      const proof = await getProofResidentA();
      await assert.rejects(
        () => obgynRepo.getGynecologicalExam(proof, clinicAId, membershipResidentAId, examId),
        /ForbiddenException|restricted to privileged clinicians/
      );
    });

    it('database trigger blocks direct mutation of FINALIZED gynecological examination', async () => {
      await assert.rejects(
        () =>
          owner.$executeRawUnsafe(
            `UPDATE public."GynecologicalExamination" SET "clinicalAssessment" = 'تعديل غير مصرح' WHERE "id" = '${examId}'::uuid`
          ),
        /Finalized OB\/GYN records cannot be altered/
      );
    });
  });

  // =========================================================================
  // 5. CROSS-TENANT ISOLATION UNDER FORCE ROW LEVEL SECURITY
  // =========================================================================

  describe('5. Cross-Tenant Isolation under FORCE ROW LEVEL SECURITY', () => {
    it('clinic B clinician cannot view Clinic A pregnancy episode', async () => {
      const proof = await getProofObgynB();
      const episode = await obgynRepo.getActivePregnancyEpisode(proof, clinicBId, patientFemaleAId);
      assert.equal(episode, null);
    });

    it('clinic A clinician cannot access Clinic B patient records', async () => {
      const proof = await getProofObgynA();
      const episode = await obgynRepo.getActivePregnancyEpisode(proof, clinicAId, patientFemaleBId);
      assert.equal(episode, null);
    });

    it('direct tenant SQL query under Clinic B context returns 0 rows for Clinic A records', async () => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(
          `SELECT set_config('lamssa.clinic_id', $1, true), set_config('lamssa.user_id', $2, true), set_config('lamssa.session_id', $3, true)`,
          [clinicBId, userObgynBId, sessionObgynBId]
        );

        const resEpisode = await client.query('SELECT * FROM public."PregnancyEpisode" WHERE "clinicId" = $1', [clinicAId]);
        assert.equal(resEpisode.rows.length, 0);

        const resVisit = await client.query('SELECT * FROM public."AntenatalVisitRecord" WHERE "clinicId" = $1', [clinicAId]);
        assert.equal(resVisit.rows.length, 0);

        const resHistory = await client.query('SELECT * FROM public."ObstetricHistoryRecord" WHERE "clinicId" = $1', [clinicAId]);
        assert.equal(resHistory.rows.length, 0);

        const resExam = await client.query('SELECT * FROM public."GynecologicalExamination" WHERE "clinicId" = $1', [clinicAId]);
        assert.equal(resExam.rows.length, 0);

        await client.query('COMMIT');
      } finally {
        client.release();
      }
    });

    it('clinic reassignment trigger rejects updating clinicId across all OB/GYN tables', async () => {
      // 1. PregnancyEpisode
      await assert.rejects(
        () =>
          owner.$executeRawUnsafe(
            `UPDATE public."PregnancyEpisode" SET "clinicId" = '${clinicBId}'::uuid WHERE "clinicId" = '${clinicAId}'::uuid`
          ),
        /42501|clinic reassignment/i
      );

      // 2. AntenatalVisitRecord
      await assert.rejects(
        () =>
          owner.$executeRawUnsafe(
            `UPDATE public."AntenatalVisitRecord" SET "clinicId" = '${clinicBId}'::uuid WHERE "clinicId" = '${clinicAId}'::uuid`
          ),
        /42501|clinic reassignment/i
      );

      // 3. ObstetricHistoryRecord
      await assert.rejects(
        () =>
          owner.$executeRawUnsafe(
            `UPDATE public."ObstetricHistoryRecord" SET "clinicId" = '${clinicBId}'::uuid WHERE "clinicId" = '${clinicAId}'::uuid`
          ),
        /42501|clinic reassignment/i
      );

      // 4. GynecologicalExamination
      await assert.rejects(
        () =>
          owner.$executeRawUnsafe(
            `UPDATE public."GynecologicalExamination" SET "clinicId" = '${clinicBId}'::uuid WHERE "clinicId" = '${clinicAId}'::uuid`
          ),
        /42501|clinic reassignment/i
      );
    });
  });
});
