import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { OrthopedicsPhysiotherapyRepository } from '../src/prisma/orthopedics-physiotherapy.repository.js';
import { VerifiedSessions } from '../src/prisma/verified-sessions.js';
import { IdentityDatabase } from '../src/prisma/identity.database.js';
import { authorizationHash } from '../src/auth/crypto.js';
import { testUrls, fixtureDatabase } from './database-fixtures.js';
import {
  AnatomicalRegionEnum,
  JointLateralityEnum,
  JointMovementEnum,
  RangeOfMotionTypeEnum,
  RehabilitationEpisodeStatusEnum,
} from '../src/orthopedics-physiotherapy/orthopedics-physiotherapy.dto.js';

describe('Orthopedics & Physiotherapy Specialty Integration & Security Tests', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  let pool: pg.Pool;
  let orthoPtRepo: OrthopedicsPhysiotherapyRepository;
  let verifiedSessions: VerifiedSessions;
  let identity: IdentityDatabase;

  const suffix = randomUUID().slice(0, 8);
  let clinicAId: string;
  let clinicBId: string;
  let branchAId: string;
  let branchBId: string;

  let userDocAId: string;
  let userResidentAId: string;
  let userDocBId: string;

  let membershipDocAId: string;
  let membershipResidentAId: string;
  let membershipDocBId: string;

  let sessionDocAId: string;
  let sessionResidentAId: string;
  let sessionDocBId: string;

  let patientAId: string;
  let encounterAId: string;

  before(async () => {
    const urls = testUrls();
    process.env.DATABASE_URL = urls.runtime;
    process.env.NODE_ENV = 'test';
    owner = fixtureDatabase();
    pool = new pg.Pool({ connectionString: urls.runtime, max: 5 });

    const { AppModule } = await import('../src/app.module.js');
    app = await NestFactory.create(AppModule, { logger: false });
    await app.init();

    orthoPtRepo = app.get(OrthopedicsPhysiotherapyRepository);
    verifiedSessions = app.get(VerifiedSessions);
    identity = app.get(IdentityDatabase);

    // 1. Create Clinics A & B
    const clinicA = await owner.clinic.create({
      data: {
        slug: `ortho-clinic-a-${suffix}`,
        legalName: 'مستشفى الشفاء للعظام والتأهيل',
        displayName: 'مركز الشفاء للعظام والعلاج الطبيعي',
        currency: 'SAR',
        timezone: 'Asia/Riyadh',
        status: 'ACTIVE',
      },
    });
    clinicAId = clinicA.id;

    const clinicB = await owner.clinic.create({
      data: {
        slug: `ortho-clinic-b-${suffix}`,
        legalName: 'عيادة الأمل التخصصية',
        displayName: 'الأمل الطبي',
        currency: 'SAR',
        timezone: 'Asia/Riyadh',
        status: 'ACTIVE',
      },
    });
    clinicBId = clinicB.id;

    const branchA = await owner.clinicBranch.findFirstOrThrow({
      where: { clinicId: clinicAId, code: 'MAIN' },
    });
    branchAId = branchA.id;

    const branchB = await owner.clinicBranch.findFirstOrThrow({
      where: { clinicId: clinicBId, code: 'MAIN' },
    });
    branchBId = branchB.id;

    // 2. Enable ORTHOPEDICS & PHYSIOTHERAPY for Clinic A
    const orthoSpecialty = await owner.medicalSpecialty.findUniqueOrThrow({ where: { code: 'ORTHOPEDICS' } });
    await owner.clinicSpecialty.create({
      data: { clinicId: clinicAId, specialtyId: orthoSpecialty.id, status: 'ACTIVE' },
    });
    await owner.branchSpecialty.create({
      data: { clinicId: clinicAId, branchId: branchAId, specialtyId: orthoSpecialty.id, status: 'ACTIVE' },
    });

    const ptSpecialty = await owner.medicalSpecialty.findUniqueOrThrow({ where: { code: 'PHYSIOTHERAPY' } });
    await owner.clinicSpecialty.create({
      data: { clinicId: clinicAId, specialtyId: ptSpecialty.id, status: 'ACTIVE' },
    });
    await owner.branchSpecialty.create({
      data: { clinicId: clinicAId, branchId: branchAId, specialtyId: ptSpecialty.id, status: 'ACTIVE' },
    });

    // 3. Create Users & Memberships
    const userDocA = await owner.user.create({
      data: {
        name: 'د. خالد العظمي - استشاري جراحة العظام والتأهيل',
        email: `ortho-doc-a-${suffix}@example.invalid`,
        status: 'ACTIVE',
      },
    });
    userDocAId = userDocA.id;

    const membershipDocA = await owner.clinicMembership.create({
      data: {
        clinicId: clinicAId,
        userId: userDocAId,
        role: 'DOCTOR',
        status: 'ACTIVE',
      },
    });
    membershipDocAId = membershipDocA.id;
    await owner.branchMembership.create({
      data: { clinicId: clinicAId, branchId: branchAId, membershipId: membershipDocAId, isPrimary: true, active: true },
    });

    const userResidentA = await owner.user.create({
      data: {
        name: 'د. معتز المقيم',
        email: `ortho-resident-a-${suffix}@example.invalid`,
        status: 'ACTIVE',
      },
    });
    userResidentAId = userResidentA.id;

    const membershipResidentA = await owner.clinicMembership.create({
      data: {
        clinicId: clinicAId,
        userId: userResidentAId,
        role: 'DOCTOR',
        status: 'ACTIVE',
      },
    });
    membershipResidentAId = membershipResidentA.id;
    await owner.branchMembership.create({
      data: { clinicId: clinicAId, branchId: branchAId, membershipId: membershipResidentAId, isPrimary: true, active: true },
    });

    const userDocB = await owner.user.create({
      data: {
        name: 'د. سامي في عيادة ب',
        email: `ortho-doc-b-${suffix}@example.invalid`,
        status: 'ACTIVE',
      },
    });
    userDocBId = userDocB.id;

    const membershipDocB = await owner.clinicMembership.create({
      data: {
        clinicId: clinicBId,
        userId: userDocBId,
        role: 'DOCTOR',
        status: 'ACTIVE',
      },
    });
    membershipDocBId = membershipDocB.id;
    await owner.branchMembership.create({
      data: { clinicId: clinicBId, branchId: branchBId, membershipId: membershipDocBId, isPrimary: true, active: true },
    });

    // 4. Create Sessions
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

    sessionDocAId = randomUUID();
    sessionResidentAId = randomUUID();
    sessionDocBId = randomUUID();

    await makeSession(sessionDocAId, userDocAId, clinicAId, branchAId);
    await makeSession(sessionResidentAId, userResidentAId, clinicAId, branchAId);
    await makeSession(sessionDocBId, userDocBId, clinicBId, branchBId);

    // 5. Create Practitioner Profile & Qualifications for Doc A
    const profileDocA = await owner.practitionerProfile.create({
      data: {
        clinicId: clinicAId,
        membershipId: membershipDocAId,
        professionalTitleAr: 'استشاري جراحة العظام والإصابات الرياضية',
        professionalTitleEn: 'Senior Consultant Orthopedic Surgeon & Physical Therapist',
        licenseNumber: `ORT-PT-${suffix}`,
        licensingAuthority: 'Saudi Commission for Health Specialties (SCFHS)',
        licenseExpirationDate: new Date(Date.now() + 365 * 86400000),
        verificationStatus: 'VERIFIED',
      },
    });

    await owner.practitionerProfile.create({
      data: {
        clinicId: clinicAId,
        membershipId: membershipResidentAId,
        professionalTitleAr: 'طبيب مقيم',
        professionalTitleEn: 'Resident Physician',
        licenseNumber: `RES-${suffix}`,
        licensingAuthority: 'Saudi Commission for Health Specialties (SCFHS)',
        licenseExpirationDate: new Date(Date.now() + 365 * 86400000),
        verificationStatus: 'VERIFIED',
      },
    });

    const qualOrtho = await owner.practitionerSpecialty.create({
      data: {
        clinicId: clinicAId,
        practitionerProfileId: profileDocA.id,
        specialtyId: orthoSpecialty.id,
        qualificationTitle: 'Fellowship in Orthopedic Surgery',
        status: 'VERIFIED',
        effectiveDate: new Date(Date.now() - 365 * 86400000),
      },
    });

    const qualPt = await owner.practitionerSpecialty.create({
      data: {
        clinicId: clinicAId,
        practitionerProfileId: profileDocA.id,
        specialtyId: ptSpecialty.id,
        qualificationTitle: 'Board Certification in Physical Therapy',
        status: 'VERIFIED',
        effectiveDate: new Date(Date.now() - 365 * 86400000),
      },
    });

    // Grant Privileges to Doc A
    const privilegesToGrant = [
      { specialtyId: orthoSpecialty.id, qualId: qualOrtho.id, code: 'ORTHOPEDIC_EXAM_PERFORM' },
      { specialtyId: orthoSpecialty.id, qualId: qualOrtho.id, code: 'ORTHOPEDIC_RECORD_FINALIZE' },
      { specialtyId: orthoSpecialty.id, qualId: qualOrtho.id, code: 'JOINT_ROM_MEASURE' },
      { specialtyId: ptSpecialty.id, qualId: qualPt.id, code: 'PHYSIOTHERAPY_PLAN_CREATE' },
      { specialtyId: ptSpecialty.id, qualId: qualPt.id, code: 'PHYSIOTHERAPY_PLAN_APPROVE' },
      { specialtyId: ptSpecialty.id, qualId: qualPt.id, code: 'PHYSIOTHERAPY_PLAN_EXECUTE' },
      { specialtyId: ptSpecialty.id, qualId: qualPt.id, code: 'PHYSIOTHERAPY_SESSION_DOCUMENT' },
    ];

    for (const p of privilegesToGrant) {
      await owner.practitionerClinicalPrivilege.create({
        data: {
          clinicId: clinicAId,
          practitionerProfileId: profileDocA.id,
          specialtyId: p.specialtyId,
          practitionerSpecialtyId: p.qualId,
          privilegeCode: p.code as any,
          scope: 'CLINIC_WIDE',
          status: 'APPROVED',
        },
      });
    }

    // 6. Create Patient and Encounter in Clinic A
    const patientA = await owner.patient.create({
      data: {
        clinicId: clinicAId,
        patientNumber: `P-${String(Math.floor(Math.random() * 900000) + 100000)}`,
        fullName: 'فيصل العتيبي',
        searchName: 'فيصل العتيبي',
        phone: '+966501112233',
        gender: 'MALE',
        dateOfBirth: new Date('1992-05-15'),
      },
    });
    patientAId = patientA.id;

    const encounterA = await owner.clinicalEncounter.create({
      data: {
        clinicId: clinicAId,
        patientId: patientAId,
        clinicianMembershipId: membershipDocAId,
        status: 'IN_PROGRESS',
      },
    });
    encounterAId = encounterA.id;
  });

  const getProofDocA = async () => verifiedSessions.issue(userDocAId, sessionDocAId);
  const getProofResidentA = async () => verifiedSessions.issue(userResidentAId, sessionResidentAId);
  const getProofDocB = async () => verifiedSessions.issue(userDocBId, sessionDocBId);

  after(async () => {
    if (app) await app.close();
    if (pool) await pool.end();
  });

  describe('1. Musculoskeletal Examination Workflows & Privileges', () => {
    let recordedExamId: string;

    it('allows authorized orthopedic surgeon to record a structured musculoskeletal exam', async () => {
      const proof = await getProofDocA();

      const exam = await orthoPtRepo.recordMusculoskeletalExam(
        proof,
        clinicAId,
        encounterAId,
        membershipDocAId,
        {
          anatomicalRegion: AnatomicalRegionEnum.KNEE,
          joint: 'Right Knee',
          laterality: JointLateralityEnum.RIGHT,
          reasonForExam: 'Severe right knee pain and clicking after sports injury',
          historyOfInjury: 'Twisting injury while playing football 3 days ago with audible pop',
          tendernessLocations: ['Medial joint line', 'Anterior joint line'],
          swellingGrade: 'MODERATE_2_PLUS',
          deformityNotes: 'Mild joint effusion, no obvious varus or valgus deformity',
          neurovascularIntact: true,
          motorStrengthMrcScale: 4,
          sensationFindings: 'Intact in L4, L5, S1 dermatomes bilaterally',
          specialManeuvers: [
            { name: 'Lachman test', result: 'POSITIVE', notes: 'Soft endpoint, 2+ anterior translation' },
            { name: 'McMurray test', result: 'POSITIVE', notes: 'Click and pain on external rotation and extension' },
            { name: 'Pivot shift', result: 'EQUIVOCAL', notes: 'Guarding due to acute pain' },
          ],
          clinicalAssessment: 'Suspected acute ACL rupture with concomitant medial meniscus tear',
        },
      );

      assert.ok(exam);
      assert.equal(exam.clinicId, clinicAId);
      assert.equal(exam.patientId, patientAId);
      assert.equal(exam.status, 'FINALIZED');
      assert.equal(exam.motorStrengthMrcScale, 4);
      assert.equal(exam.swellingGrade, 'MODERATE_2_PLUS');
      recordedExamId = exam.id;
    });

    it('rejects unprivileged resident from recording orthopedic examination', async () => {
      const residentProof = await getProofResidentA();

      await assert.rejects(
        orthoPtRepo.recordMusculoskeletalExam(
          residentProof,
          clinicAId,
          encounterAId,
          membershipResidentAId,
          {
            anatomicalRegion: AnatomicalRegionEnum.KNEE,
            joint: 'Right Knee',
            laterality: JointLateralityEnum.RIGHT,
            reasonForExam: 'Unprivileged attempt',
          },
        ),
        (err: any) => err.status === 403 && (err.message.includes('ORTHOPEDIC_EXAM_PERFORM') || err.message.includes('qualification')),
      );
    });

    it('lists musculoskeletal exams for patient with examiner details', async () => {
      const proof = await getProofDocA();
      const list = await orthoPtRepo.listMusculoskeletalExamsForPatient(proof, clinicAId, patientAId);
      assert.ok(list.length >= 1);
      const item = list.find((e) => e.id === recordedExamId);
      assert.ok(item);
      assert.equal(item.joint, 'Right Knee');
      assert.equal(item.examiner.role, 'DOCTOR');
    });

    it('marks examination as ENTERED_IN_ERROR with authorized privilege and audit trail', async () => {
      const proof = await getProofDocA();
      const updated = await orthoPtRepo.enterInErrorMusculoskeletalExam(
        proof,
        clinicAId,
        recordedExamId,
        membershipDocAId,
        {
          errorReason: 'Patient laterality recorded erroneously in initial draft; corrected exam filed separately',
          expectedVersion: 1,
        },
      );

      assert.equal(updated.status, 'ENTERED_IN_ERROR');
      assert.equal(updated.version, 2);
      assert.ok(updated.errorReason?.includes('Patient laterality recorded erroneously'));
    });
  });

  describe('2. Joint Range of Motion (ROM) & Real-Time Deficit Feedback', () => {
    it('records active knee range of motion with deficit evaluation against AAOS norms', async () => {
      const proof = await getProofDocA();

      const res = await orthoPtRepo.recordJointRom(
        proof,
        clinicAId,
        encounterAId,
        membershipDocAId,
        {
          anatomicalJoint: 'KNEE',
          movement: JointMovementEnum.FLEXION,
          laterality: JointLateralityEnum.RIGHT,
          motionType: RangeOfMotionTypeEnum.ACTIVE,
          startingDegrees: 0,
          endingDegrees: 90,
          contralateralDegrees: 140, // healthy left knee
          painOnsetDegrees: 75,
          painScaleVas: 6,
          measurementMethod: 'UNIVERSAL_GONIOMETER',
          notes: 'Pain on terminal flexion beyond 75 degrees',
        },
      );

      assert.ok(res);
      assert.equal(Number(res.endingDegrees), 90);
      assert.equal(res.status, 'FINALIZED');
      assert.ok(res.deficitEvaluation);
      assert.equal(res.deficitEvaluation.normalDegrees, 140);
      assert.equal(res.deficitEvaluation.deficitFromNormalDegrees, 50);
      assert.equal(res.deficitEvaluation.deficitFromContralateralDegrees, 50);
      assert.equal(res.deficitEvaluation.meetsFunctionalRequirement, false);
      assert.ok(res.deficitEvaluation.severityEn.includes('Moderate Motion Deficit'));
    });

    it('lists ROM measurements for patient with historical deficit metrics', async () => {
      const proof = await getProofDocA();
      const romList = await orthoPtRepo.listJointRomForPatient(proof, clinicAId, patientAId);
      assert.ok(romList.length >= 1);
      const kneeRom = romList.find((r) => r.anatomicalJoint === 'KNEE');
      assert.ok(kneeRom);
      assert.equal(kneeRom.movement, 'FLEXION');
      assert.equal(Number(kneeRom.endingDegrees), 90);
    });
  });

  describe('3. Physiotherapy Rehabilitation Episode & Status Lifecycle', () => {
    let episodeId: string;

    it('creates active rehabilitation episode with functional baseline and goals', async () => {
      const proof = await getProofDocA();

      const episode = await orthoPtRepo.createRehabilitationEpisode(
        proof,
        clinicAId,
        membershipDocAId,
        {
          patientId: patientAId,
          encounterId: encounterAId,
          referringClinicianMembershipId: membershipDocAId,
          rehabilitationGoal: 'Restore full active knee extension, flexion to >= 125°, and quad strength to grade 5/5',
          functionalBaseline: 'Patient is ambulating with crutches, unable to bear full weight, right knee ROM 0-90°',
          startDate: '2026-11-20',
          targetEndDate: '2027-02-20',
          visitFrequencyPerWeek: 3,
          plannedInterventions: [
            'Patellar mobilization and soft-tissue therapy',
            'Progressive quadriceps and hamstring closed-chain loading',
            'Cryotherapy post-exercise for effusion control',
            'Proprioceptive neuromuscular re-education',
          ],
        },
      );

      assert.ok(episode);
      assert.equal(episode.status, 'ACTIVE');
      assert.equal(episode.planVersion, 1);
      assert.equal(episode.visitFrequencyPerWeek, 3);
      episodeId = episode.id;
    });

    it('updates episode status with optimistic concurrency and discharge summary', async () => {
      const proof = await getProofDocA();

      const updated = await orthoPtRepo.updateRehabilitationEpisodeStatus(
        proof,
        clinicAId,
        episodeId,
        membershipDocAId,
        {
          status: RehabilitationEpisodeStatusEnum.COMPLETED,
          dischargeSummary: 'Goals achieved: ROM 0-135°, quad strength 5/5, normal gait without assist device',
          expectedVersion: 1,
        },
      );

      assert.equal(updated.status, 'COMPLETED');
      assert.equal(updated.version, 2);
      assert.ok(updated.dischargeSummary?.includes('Goals achieved'));
      assert.ok(updated.actualEndDate !== null);
    });

    it('rejects status update on optimistic version mismatch', async () => {
      const proof = await getProofDocA();

      await assert.rejects(
        orthoPtRepo.updateRehabilitationEpisodeStatus(
          proof,
          clinicAId,
          episodeId,
          membershipDocAId,
          {
            status: RehabilitationEpisodeStatusEnum.DISCHARGED,
            expectedVersion: 1, // Stale version (actual is 2)
          },
        ),
        (err: any) => err.status === 400 && err.message.includes('Optimistic concurrency failure'),
      );
    });
  });

  describe('4. Physiotherapy Session Documentation & VAS Delta Tracking', () => {
    let sessionId: string;

    it('records physiotherapy session with modalities, exercises, and pain reduction', async () => {
      const proof = await getProofDocA();

      const res = await orthoPtRepo.recordPhysiotherapySession(
        proof,
        clinicAId,
        encounterAId,
        membershipDocAId,
        {
          patientId: patientAId,
          treatmentModalities: ['THERAPEUTIC_EXERCISE', 'MANUAL_THERAPY', 'CRYOTHERAPY'],
          exerciseDetails: [
            { exercise: 'Terminal knee extension', sets: 3, reps: 15, resistanceKg: 2 },
            { exercise: 'Stationary bike', durationMinutes: 10, resistanceKg: 1 },
            { exercise: 'Prone hamstring curls', sets: 3, reps: 10, resistanceKg: 3 },
          ],
          sessionDurationMinutes: 45,
          patientReportedTolerance: 'WELL_TOLERATED',
          preSessionPainVas: 6,
          postSessionPainVas: 2,
          functionalProgressNotes: 'Patient completed all sets with good quad activation. Effusion stable.',
        },
      );

      assert.ok(res);
      assert.equal(res.status, 'FINALIZED');
      assert.equal(res.preSessionPainVas, 6);
      assert.equal(res.postSessionPainVas, 2);
      assert.equal(res.painDelta.delta, -4);
      assert.equal(res.painDelta.improved, true);
      sessionId = res.id;
    });

    it('lists physiotherapy sessions with pre/post VAS delta calculations', async () => {
      const proof = await getProofDocA();
      const sessions = await orthoPtRepo.listPhysiotherapySessionsForPatient(proof, clinicAId, patientAId);
      assert.ok(sessions.length >= 1);
      const session = sessions.find((s) => s.id === sessionId);
      assert.ok(session);
      assert.equal(session.painDelta.improved, true);
      assert.equal(session.painDelta.delta, -4);
    });

    it('enters physiotherapy session in error with justification', async () => {
      const proof = await getProofDocA();
      const updated = await orthoPtRepo.enterInErrorPhysiotherapySession(
        proof,
        clinicAId,
        sessionId,
        membershipDocAId,
        {
          errorReason: 'Duplicate entry submitted due to network reconnect; replaced by verified record',
          expectedVersion: 1,
        },
      );

      assert.equal(updated.status, 'ENTERED_IN_ERROR');
      assert.equal(updated.version, 2);
    });
  });

  describe('5. Database Security, Immutability & Multi-Tenant Isolation', () => {
    it('PostgreSQL trigger rejects direct in-place update of finalized orthopedic exam', async () => {
      // Create a finalized exam directly
      const exam = await owner.musculoskeletalExamination.create({
        data: {
          clinicId: clinicAId,
          patientId: patientAId,
          encounterId: encounterAId,
          anatomicalRegion: 'KNEE',
          joint: 'Left Knee',
          laterality: 'LEFT',
          reasonForExam: 'Immutability test',
          examinerMembershipId: membershipDocAId,
          status: 'FINALIZED',
        },
      });

      // Attempting direct modification without ENTERED_IN_ERROR must be blocked by the trigger
      await assert.rejects(
        owner.musculoskeletalExamination.update({
          where: { id: exam.id },
          data: { clinicalAssessment: 'Unauthorized alteration of medical facts' },
        }),
        /Finalized orthopedics and physiotherapy records cannot be altered/,
      );
    });

    it('enforces strict multi-tenant RLS isolation against cross-clinic access', async () => {
      const docBProof = await getProofDocB();

      // Doc B from Clinic B attempts to read Clinic A's patient exams -> must return empty list (RLS isolation)
      const listForB = await orthoPtRepo.listMusculoskeletalExamsForPatient(
        docBProof,
        clinicBId,
        patientAId, // Patient A belongs to Clinic A
      );
      assert.equal(listForB.length, 0);

      // Doc B attempts to read Clinic A's rehabilitation episodes -> must return empty list
      const episodesForB = await orthoPtRepo.listRehabilitationEpisodesForPatient(
        docBProof,
        clinicBId,
        patientAId,
      );
      assert.equal(episodesForB.length, 0);
    });

    it('verifies FORCE RLS on all 4 new tables under runtime role', async () => {
      const client = await pool.connect();
      try {
        const res = await client.query(`
          SELECT relname, relrowsecurity, relforcerowsecurity
          FROM pg_class
          WHERE relname IN (
            'MusculoskeletalExamination',
            'JointRangeOfMotionRecord',
            'PhysiotherapyRehabilitationEpisode',
            'PhysiotherapySessionRecord'
          )
        `);
        assert.equal(res.rows.length, 4);
        assert(res.rows.every((r) => r.relrowsecurity && r.relforcerowsecurity));
      } finally {
        client.release();
      }
    });
  });
});
