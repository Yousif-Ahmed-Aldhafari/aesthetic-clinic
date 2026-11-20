import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { OphthalmologyEntRepository } from '../src/prisma/ophthalmology-ent.repository.js';
import { VerifiedSessions } from '../src/prisma/verified-sessions.js';
import { IdentityDatabase } from '../src/prisma/identity.database.js';
import { authorizationHash } from '../src/auth/crypto.js';
import { testUrls, fixtureDatabase } from './database-fixtures.js';

describe('Ophthalmology & ENT Specialty Integration & Security Tests', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  let pool: pg.Pool;
  let ophthEntRepo: OphthalmologyEntRepository;
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
    try {
    const urls = testUrls();
    process.env.DATABASE_URL = urls.runtime;
    process.env.NODE_ENV = 'test';
    owner = fixtureDatabase();
    pool = new pg.Pool({ connectionString: urls.runtime, max: 5 });

    const { AppModule } = await import('../src/app.module.js');
    app = await NestFactory.create(AppModule, { logger: false });
    await app.init();

    ophthEntRepo = app.get(OphthalmologyEntRepository);
    verifiedSessions = app.get(VerifiedSessions);
    identity = app.get(IdentityDatabase);

    // 1. Create Clinics A & B
    const clinicA = await owner.clinic.create({
      data: {
        slug: `ophth-clinic-a-${suffix}`,
        legalName: 'مجمع عيادات النور التخصصية',
        displayName: 'عيادات النور للعيون والأنف والأذن',
        currency: 'SAR',
        timezone: 'Asia/Riyadh',
        status: 'ACTIVE',
      },
    });
    clinicAId = clinicA.id;

    const clinicB = await owner.clinic.create({
      data: {
        slug: `ophth-clinic-b-${suffix}`,
        legalName: 'عيادة الأفق الطبية',
        displayName: 'الأفق التخصصي',
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

    // 2. Enable OPHTHALMOLOGY & ENT for Clinic A
    const ophthSpecialty = await owner.medicalSpecialty.findUniqueOrThrow({ where: { code: 'OPHTHALMOLOGY' } });
    await owner.clinicSpecialty.create({
      data: { clinicId: clinicAId, specialtyId: ophthSpecialty.id, status: 'ACTIVE' },
    });
    await owner.branchSpecialty.create({
      data: { clinicId: clinicAId, branchId: branchAId, specialtyId: ophthSpecialty.id, status: 'ACTIVE' },
    });

    const entSpecialty = await owner.medicalSpecialty.findUniqueOrThrow({ where: { code: 'ENT' } });
    await owner.clinicSpecialty.create({
      data: { clinicId: clinicAId, specialtyId: entSpecialty.id, status: 'ACTIVE' },
    });
    await owner.branchSpecialty.create({
      data: { clinicId: clinicAId, branchId: branchAId, specialtyId: entSpecialty.id, status: 'ACTIVE' },
    });

    // 3. Create Users & Memberships
    const userDocA = await owner.user.create({
      data: {
        name: 'د. طارق الحكيم - استشاري عيون وأنف وأذن',
        email: `ophth-doc-a-${suffix}@example.invalid`,
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
        name: 'د. رامي المقيم',
        email: `ophth-resident-a-${suffix}@example.invalid`,
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
        name: 'د. ناصر في عيادة ب',
        email: `ophth-doc-b-${suffix}@example.invalid`,
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
        professionalTitleAr: 'استشاري طب وجراحة العيون والأنف والأذن',
        professionalTitleEn: 'Senior Consultant Ophthalmologist & Otolaryngologist',
        licenseNumber: `OPH-ENT-${suffix}`,
        licensingAuthority: 'Saudi Commission for Health Specialties (SCFHS)',
        licenseExpirationDate: new Date(Date.now() + 365 * 86400000),
        verificationStatus: 'VERIFIED',
      },
    });

    const qualOphth = await owner.practitionerSpecialty.create({
      data: {
        clinicId: clinicAId,
        practitionerProfileId: profileDocA.id,
        specialtyId: ophthSpecialty.id,
        qualificationTitle: 'Fellowship in Ophthalmology',
        status: 'VERIFIED',
        effectiveDate: new Date(Date.now() - 365 * 86400000),
      },
    });

    const qualEnt = await owner.practitionerSpecialty.create({
      data: {
        clinicId: clinicAId,
        practitionerProfileId: profileDocA.id,
        specialtyId: entSpecialty.id,
        qualificationTitle: 'Board in Otolaryngology',
        status: 'VERIFIED',
        effectiveDate: new Date(Date.now() - 365 * 86400000),
      },
    });

    // Grant Privileges to Doc A
    const privilegesToGrant = [
      { specialtyId: ophthSpecialty.id, qualId: qualOphth.id, code: 'REFRACTION_MEASURE' },
      { specialtyId: ophthSpecialty.id, qualId: qualOphth.id, code: 'OPHTHALMIC_EXAM_DOCUMENT' },
      { specialtyId: ophthSpecialty.id, qualId: qualOphth.id, code: 'OPHTHALMIC_RECORD_FINALIZE' },
      { specialtyId: entSpecialty.id, qualId: qualEnt.id, code: 'ENT_EXAM_DOCUMENT' },
      { specialtyId: entSpecialty.id, qualId: qualEnt.id, code: 'AUDIOMETRY_RECORD' },
      { specialtyId: entSpecialty.id, qualId: qualEnt.id, code: 'ENT_PROCEDURE_PERFORM' },
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
          effectiveDate: new Date(Date.now() - 365 * 86400000),
        },
      });
    }

    // 6. Create Patient & Encounter
    const patientA = await owner.patient.create({
      data: {
        clinicId: clinicAId,
        patientNumber: `P-${String(Math.floor(Math.random() * 900000) + 100000)}`,
        fullName: 'طارق عبد الله الزهراني',
        searchName: 'طارق عبد الله الزهراني',
        phone: '+966501112233',
        gender: 'MALE',
        dateOfBirth: new Date('1988-04-12'),
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
    } catch (err) {
      console.error('BEFORE HOOK ERROR:', err);
      throw err;
    }
  });

  after(async () => {
    if (pool) await pool.end();
    if (owner) {
      await owner.audiometryAssessmentRecord.deleteMany({ where: { clinicId: { in: [clinicAId, clinicBId] } } });
      await owner.entExaminationRecord.deleteMany({ where: { clinicId: { in: [clinicAId, clinicBId] } } });
      await owner.ophthalmicExaminationRecord.deleteMany({ where: { clinicId: { in: [clinicAId, clinicBId] } } });
      await owner.ophthalmicRefractionRecord.deleteMany({ where: { clinicId: { in: [clinicAId, clinicBId] } } });
      await owner.clinicalEncounter.deleteMany({ where: { clinicId: { in: [clinicAId, clinicBId] } } });
      await owner.patient.deleteMany({ where: { clinicId: { in: [clinicAId, clinicBId] } } });
      await owner.practitionerClinicalPrivilege.deleteMany({ where: { clinicId: { in: [clinicAId, clinicBId] } } });
      await owner.practitionerSpecialty.deleteMany({ where: { clinicId: { in: [clinicAId, clinicBId] } } });
      await owner.practitionerProfile.deleteMany({ where: { clinicId: { in: [clinicAId, clinicBId] } } });
      await owner.branchSpecialty.deleteMany({ where: { clinicId: { in: [clinicAId, clinicBId] } } });
      await owner.clinicSpecialty.deleteMany({ where: { clinicId: { in: [clinicAId, clinicBId] } } });
      await owner.branchMembership.deleteMany({ where: { clinicId: { in: [clinicAId, clinicBId] } } });
      await owner.session.deleteMany({ where: { id: { in: [sessionDocAId, sessionResidentAId, sessionDocBId] } } });
      await owner.clinicMembership.deleteMany({ where: { id: { in: [membershipDocAId, membershipResidentAId, membershipDocBId] } } });
      await owner.user.deleteMany({ where: { id: { in: [userDocAId, userResidentAId, userDocBId] } } });
      await owner.clinic.deleteMany({ where: { id: { in: [clinicAId, clinicBId] } } });
      await owner.$disconnect();
    }
    if (app) await app.close();
  });

  const getProofDocA = async () => verifiedSessions.issue(userDocAId, sessionDocAId);
  const getProofResidentA = async () => verifiedSessions.issue(userResidentAId, sessionResidentAId);
  const getProofDocB = async () => verifiedSessions.issue(userDocBId, sessionDocBId);

  // =========================================================================
  // TEST SUITE 1: OPHTHALMIC REFRACTION RECORDING & VALIDATION
  // =========================================================================

  describe('1. Ophthalmic Refraction Records', () => {
    it('successfully records complete subjective refraction with calculated spherical equivalent', async () => {
      const proof = await getProofDocA();
      const record = await ophthEntRepo.recordRefraction(proof, clinicAId, encounterAId, membershipDocAId, {
        acuityScale: 'SNELLEN_METERS_6_6',
        pupillaryDistanceMm: 63.5,
        odSphereDiopters: -2.5,
        odCylinderDiopters: -0.75,
        odAxisDegrees: 90,
        odReadingAddDiopters: 1.75,
        odUncorrectedVisualAcuity: '6/18',
        odCorrectedVisualAcuity: '6/6',
        osSphereDiopters: -2.0,
        osCylinderDiopters: -0.5,
        osAxisDegrees: 85,
        osReadingAddDiopters: 1.75,
        osUncorrectedVisualAcuity: '6/12',
        osCorrectedVisualAcuity: '6/6',
        ouVisualAcuity: '6/6',
        notes: 'Subjective refraction with trial frame acceptance',
      });

      assert.ok(record.id);
      assert.equal(record.status, 'FINALIZED');
      assert.equal(Number(record.odSphereDiopters), -2.5);
      assert.equal(Number(record.odCylinderDiopters), -0.75);
      assert.equal(record.odAxisDegrees, 90);

      const list = await ophthEntRepo.listRefractionsForPatient(proof, clinicAId, patientAId);
      assert.ok(list.length >= 1);
      const saved = list.find((r) => r.id === record.id);
      assert.ok(saved);
      // Spherical Equivalent: -2.50 + (-0.75 / 2) = -2.875 -> -2.87
      assert.equal(saved.odSphericalEquivalent, -2.87);
      // OS SE: -2.00 + (-0.50 / 2) = -2.25
      assert.equal(saved.osSphericalEquivalent, -2.25);
    });

    it('rejects non-standard diopter increments (requires 0.25 step)', async () => {
      const proof = await getProofDocA();
      await assert.rejects(
        ophthEntRepo.recordRefraction(proof, clinicAId, encounterAId, membershipDocAId, {
          odSphereDiopters: -2.33,
        }),
        /0.25 diopter increments/,
      );
    });

    it('rejects cylinder diopters when axis degree is omitted', async () => {
      const proof = await getProofDocA();
      await assert.rejects(
        ophthEntRepo.recordRefraction(proof, clinicAId, encounterAId, membershipDocAId, {
          odCylinderDiopters: -1.0,
        }),
        /Axis is required when cylinder diopters are specified/,
      );
    });
  });

  // =========================================================================
  // TEST SUITE 2: OPHTHALMIC EXAMINATION & TONOMETRY
  // =========================================================================

  describe('2. Ophthalmic Examination & Tonometry', () => {
    it('records slit lamp examination and normal IOP without alarm flags', async () => {
      const proof = await getProofDocA();
      const result = await ophthEntRepo.recordOphthalmicExam(proof, clinicAId, encounterAId, membershipDocAId, {
        tonometryMethod: 'GOLDMANN_APPLANATION',
        odIntraocularPressureMmHg: 15.0,
        osIntraocularPressureMmHg: 16.0,
        odCorneaFindings: 'Clear, no epithelial defect',
        osCorneaFindings: 'Clear, no epithelial defect',
        odLensCondition: 'Clear',
        osLensCondition: 'Clear',
        odCupToDiscRatio: 0.35,
        osCupToDiscRatio: 0.35,
        clinicalNotes: 'Routine anterior and posterior segment examination normal',
      });

      assert.ok(result.id);
      assert.equal(result.iopEvaluation.isElevatedOd, false);
      assert.equal(result.iopEvaluation.isElevatedOs, false);
      assert.equal(result.iopEvaluation.isAsymmetric, false);
      assert.equal(result.cdrEvaluation.isSuspiciousOd, false);
    });

    it('detects ocular hypertension and inter-eye asymmetry alerts', async () => {
      const proof = await getProofDocA();
      const result = await ophthEntRepo.recordOphthalmicExam(proof, clinicAId, encounterAId, membershipDocAId, {
        tonometryMethod: 'GOLDMANN_APPLANATION',
        odIntraocularPressureMmHg: 27.5,
        osIntraocularPressureMmHg: 16.0,
        odCupToDiscRatio: 0.7,
        osCupToDiscRatio: 0.35,
      });

      assert.ok(result.id);
      assert.equal(result.iopEvaluation.isElevatedOd, true);
      assert.equal(result.iopEvaluation.isAsymmetric, true);
      assert.equal(result.cdrEvaluation.isSuspiciousOd, true);
      assert.equal(result.cdrEvaluation.isAsymmetric, true);
      assert.ok(result.iopEvaluation.advisoryAlertsAr.some((a: string) => a.includes('ارتفاع ضغط العين')));
      assert.ok(result.iopEvaluation.clinicalDisclaimerAr.includes('تنبيه سريري استشاري'));
    });
  });

  // =========================================================================
  // TEST SUITE 3: ENT EXAMINATION & AUDIOMETRY
  // =========================================================================

  describe('3. ENT Examination & Audiometry Assessment', () => {
    it('records otoscopy, rhinoscopy, and oropharyngeal examination', async () => {
      const proof = await getProofDocA();
      const record = await ophthEntRepo.recordEntExam(proof, clinicAId, encounterAId, membershipDocAId, {
        rightTympanicMembrane: 'INTACT_TRANSLUCENT',
        leftTympanicMembrane: 'INTACT_TRANSLUCENT',
        nasalSeptumDeformity: 'DEVIATED_LEFT',
        turbinateHypertrophy: 'HYPERTROPHIC_RIGHT',
        tonsilSizeGrade: 'GRADE_2_EXTENDING_TO_PILLARS',
        nasalPolypsPresent: false,
        clinicalNotes: 'Mild allergic rhinitis with septal deviation to the left',
      });

      assert.ok(record.id);
      assert.equal(record.status, 'FINALIZED');
      assert.equal(record.tonsilSizeGrade, 'GRADE_2_EXTENDING_TO_PILLARS');
      assert.equal(record.nasalSeptumDeformity, 'DEVIATED_LEFT');
    });

    it('records pure-tone audiometry with WHO hearing impairment classification', async () => {
      const proof = await getProofDocA();
      // Frequencies: [125, 250, 500, 1000, 2000, 4000, 8000]
      // Right Ear: Moderate hearing loss (avg 45 dB) with Conductive pattern (bone = 15 dB, gap = 30 dB)
      const rightAir = [30, 35, 40, 45, 45, 50, 55];
      const rightBone = [15, 15, 15, 15, 15];
      // Left Ear: Normal hearing (avg 15 dB)
      const leftAir = [10, 10, 10, 15, 15, 20, 20];
      const leftBone = [10, 10, 10, 10, 10];

      const record = await ophthEntRepo.recordAudiometry(proof, clinicAId, encounterAId, membershipDocAId, {
        rightAirThresholdsDb: rightAir,
        leftAirThresholdsDb: leftAir,
        rightBoneThresholdsDb: rightBone,
        leftBoneThresholdsDb: leftBone,
        rightTympanogramType: 'TYPE_B_FLAT_EFFUSION',
        leftTympanogramType: 'TYPE_A_NORMAL_COMPLIANCE',
        clinicalImpression: 'Right otitis media with effusion causing conductive hearing loss',
      });

      assert.ok(record.id);
      assert.equal(record.analytics.right?.grade, 'MODERATE');
      assert.equal(record.analytics.right?.type, 'CONDUCTIVE');
      assert.equal(record.analytics.left?.grade, 'NORMAL');
      assert.equal(record.analytics.left?.type, 'NORMAL');
    });
  });

  // =========================================================================
  // TEST SUITE 4: CLINICAL IMMUTABILITY SAFEGUARDS
  // =========================================================================

  describe('4. Clinical Immutability & Status Transitions', () => {
    it('prevents direct tampering of finalized records via PostgreSQL immutability trigger', async () => {
      const proof = await getProofDocA();
      const refraction = await ophthEntRepo.recordRefraction(proof, clinicAId, encounterAId, membershipDocAId, {
        odSphereDiopters: -1.0,
      });

      // Attempt direct SQL UPDATE on finalized record without ENTERED_IN_ERROR
      await assert.rejects(
        () =>
          owner.$executeRawUnsafe(
            `UPDATE public."OphthalmicRefractionRecord" SET "odSphereDiopters" = -5.0 WHERE "id" = '${refraction.id}'::uuid`,
          ),
        /Finalized specialty records cannot be altered/,
      );
    });

    it('allows transitioning finalized record to ENTERED_IN_ERROR with mandatory rationale', async () => {
      const proof = await getProofDocA();
      const refraction = await ophthEntRepo.recordRefraction(proof, clinicAId, encounterAId, membershipDocAId, {
        odSphereDiopters: -1.5,
      });

      const updated = await ophthEntRepo.enterInErrorRefraction(proof, clinicAId, refraction.id, membershipDocAId, {
        errorReason: 'Patient accommodated during testing; re-refraction under cycloplegia indicated',
      });

      assert.equal(updated.status, 'ENTERED_IN_ERROR');
      assert.ok(updated.errorReason?.includes('cycloplegia'));
    });
  });

  // =========================================================================
  // TEST SUITE 5: MULTI-TENANT ISOLATION & PRIVILEGE GATES
  // =========================================================================

  describe('5. Multi-Tenant Isolation & Privilege Gates', () => {
    it('denies practitioner in Clinic B from viewing Clinic A records (RLS Boundary)', async () => {
      const proofB = await getProofDocB();
      await assert.rejects(
        ophthEntRepo.listRefractionsForPatient(proofB, clinicAId, patientAId),
        /(Forbidden|NotFound)/,
      );
    });

    it('denies resident without clinical privileges from documenting refraction', async () => {
      const proofRes = await getProofResidentA();
      await assert.rejects(
        ophthEntRepo.recordRefraction(proofRes, clinicAId, encounterAId, membershipResidentAId, {
          odSphereDiopters: -2.0,
        }),
        /(ForbiddenException|Practitioner profile required|Insufficient clinical privileges)/,
      );
    });

    it('denies resident without clinical privileges from documenting audiometry', async () => {
      const proofRes = await getProofResidentA();
      await assert.rejects(
        ophthEntRepo.recordAudiometry(proofRes, clinicAId, encounterAId, membershipResidentAId, {
          rightAirThresholdsDb: [20, 20, 20, 20, 20, 20, 20],
          leftAirThresholdsDb: [20, 20, 20, 20, 20, 20, 20],
        }),
        /(ForbiddenException|Practitioner profile required|Insufficient clinical privileges)/,
      );
    });
  });
});
