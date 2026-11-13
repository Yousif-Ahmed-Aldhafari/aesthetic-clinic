import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { SpecialtyRepository } from '../src/prisma/specialty.repository.js';
import { VerifiedSessions } from '../src/prisma/verified-sessions.js';
import { IdentityDatabase } from '../src/prisma/identity.database.js';
import { authorizationHash } from '../src/auth/crypto.js';
import { testUrls, fixtureDatabase } from './database-fixtures.js';

describe('Medical Specialty Registry, Qualifications & Clinical Privilege Engine Integration Tests', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  let pool: pg.Pool;
  let specialtyRepo: SpecialtyRepository;
  let verifiedSessions: VerifiedSessions;
  let identity: IdentityDatabase;

  const suffix = randomUUID().slice(0, 8);
  let clinicAId: string;
  let clinicBId: string;
  let branchA1Id: string;
  let branchA2Id: string;
  let branchB1Id: string;

  let userOwnerAId: string;
  let userDoctorA1Id: string;
  let userDoctorA2Id: string;
  let userAdminAId: string;
  let userOwnerBId: string;

  let membershipOwnerAId: string;
  let membershipDoctorA1Id: string;
  let membershipDoctorA2Id: string;
  let membershipAdminAId: string;
  let membershipOwnerBId: string;

  let sessionOwnerAId: string;
  let sessionDoctorA1Id: string;
  let sessionDoctorA2Id: string;
  let sessionAdminAId: string;
  let sessionOwnerBId: string;

  before(async () => {
    const urls = testUrls();
    process.env.DATABASE_URL = urls.runtime;
    process.env.NODE_ENV = 'test';
    owner = fixtureDatabase();
    pool = new pg.Pool({ connectionString: urls.runtime, max: 5 });

    const { AppModule } = await import('../src/app.module.js');
    const moduleRef = await NestFactory.createApplicationContext(AppModule, { logger: false });
    app = moduleRef as any;
    specialtyRepo = moduleRef.get(SpecialtyRepository);
    verifiedSessions = moduleRef.get(VerifiedSessions);
    identity = moduleRef.get(IdentityDatabase);

    // Setup synthetic clinics
    clinicAId = randomUUID();
    clinicBId = randomUUID();

    await owner.clinic.createMany({
      data: [
        { id: clinicAId, slug: `specialty-a-${suffix}`, displayName: 'عيادة التخصصات أ', legalName: 'شركة عيادة التخصصات أ', currency: 'SAR', status: 'ACTIVE' },
        { id: clinicBId, slug: `specialty-b-${suffix}`, displayName: 'عيادة التخصصات ب', legalName: 'شركة عيادة التخصصات ب', currency: 'SAR', status: 'ACTIVE' },
      ],
    });

    branchA1Id = randomUUID();
    branchA2Id = randomUUID();
    branchB1Id = randomUUID();

    await owner.clinicBranch.createMany({
      data: [
        { id: branchA1Id, clinicId: clinicAId, code: 'MAIN-A', nameAr: 'الفرع الرئيسي أ', status: 'ACTIVE' },
        { id: branchA2Id, clinicId: clinicAId, code: 'NORTH-A', nameAr: 'فرع الشمال أ', status: 'ACTIVE' },
        { id: branchB1Id, clinicId: clinicBId, code: 'MAIN-B', nameAr: 'الفرع الرئيسي ب', status: 'ACTIVE' },
      ],
    });

    // Create synthetic users
    userOwnerAId = randomUUID();
    userDoctorA1Id = randomUUID(); // Will become Medical Director
    userDoctorA2Id = randomUUID(); // Regular Doctor
    userAdminAId = randomUUID();
    userOwnerBId = randomUUID();

    await owner.user.createMany({
      data: [
        { id: userOwnerAId, email: `owner-a-${suffix}@test.lamssa.local`, name: 'مالك أ', status: 'ACTIVE' },
        { id: userDoctorA1Id, email: `doctor-dir-${suffix}@test.lamssa.local`, name: 'د. المدير الطبي', status: 'ACTIVE' },
        { id: userDoctorA2Id, email: `doctor-reg-${suffix}@test.lamssa.local`, name: 'د. ممارس عام', status: 'ACTIVE' },
        { id: userAdminAId, email: `admin-a-${suffix}@test.lamssa.local`, name: 'مدير إداري أ', status: 'ACTIVE' },
        { id: userOwnerBId, email: `owner-b-${suffix}@test.lamssa.local`, name: 'مالك ب', status: 'ACTIVE' },
      ],
    });

    // Create clinic memberships
    membershipOwnerAId = randomUUID();
    membershipDoctorA1Id = randomUUID();
    membershipDoctorA2Id = randomUUID();
    membershipAdminAId = randomUUID();
    membershipOwnerBId = randomUUID();

    await owner.clinicMembership.createMany({
      data: [
        { id: membershipOwnerAId, clinicId: clinicAId, userId: userOwnerAId, role: 'CLINIC_OWNER', status: 'ACTIVE' },
        { id: membershipDoctorA1Id, clinicId: clinicAId, userId: userDoctorA1Id, role: 'DOCTOR', status: 'ACTIVE' },
        { id: membershipDoctorA2Id, clinicId: clinicAId, userId: userDoctorA2Id, role: 'DOCTOR', status: 'ACTIVE' },
        { id: membershipAdminAId, clinicId: clinicAId, userId: userAdminAId, role: 'CLINIC_ADMIN', status: 'ACTIVE' },
        { id: membershipOwnerBId, clinicId: clinicBId, userId: userOwnerBId, role: 'CLINIC_OWNER', status: 'ACTIVE' },
      ],
    });

    // Assign branch memberships
    await owner.branchMembership.createMany({
      data: [
        { clinicId: clinicAId, branchId: branchA1Id, membershipId: membershipDoctorA1Id, isPrimary: true, active: true },
        { clinicId: clinicAId, branchId: branchA1Id, membershipId: membershipDoctorA2Id, isPrimary: true, active: true },
        { clinicId: clinicAId, branchId: branchA2Id, membershipId: membershipDoctorA2Id, isPrimary: false, active: true },
      ],
    });

    // Create sessions
    sessionOwnerAId = randomUUID();
    sessionDoctorA1Id = randomUUID();
    sessionDoctorA2Id = randomUUID();
    sessionAdminAId = randomUUID();
    sessionOwnerBId = randomUUID();

    const makeSession = async (sessionId: string, userId: string, clinicId: string, branchId?: string) => {
      const u = await identity.loadUser(owner, userId);
      const hash = authorizationHash(u!);
      const token = randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '');
      await owner.session.create({
        data: {
          id: sessionId,
          userId,
          selectedClinicId: clinicId,
          selectedBranchId: branchId ?? null,
          tokenHash: token,
          csrfHash: token,
          authorizationHash: hash,
          expiresAt: new Date(Date.now() + 86400000),
        },
      });
    };

    await makeSession(sessionOwnerAId, userOwnerAId, clinicAId);
    await makeSession(sessionDoctorA1Id, userDoctorA1Id, clinicAId, branchA1Id);
    await makeSession(sessionDoctorA2Id, userDoctorA2Id, clinicAId, branchA1Id);
    await makeSession(sessionAdminAId, userAdminAId, clinicAId);
    await makeSession(sessionOwnerBId, userOwnerBId, clinicBId);

    // Run migration compatibility backfill for test clinics and branches
    await owner.$executeRawUnsafe(`
      INSERT INTO public."ClinicSpecialty" ("id", "clinicId", "specialtyId", "status", "enabledAt")
      SELECT gen_random_uuid(), c.id, s.id, 'ACTIVE', c."createdAt"
      FROM public."Clinic" c
      CROSS JOIN public."MedicalSpecialty" s
      WHERE s.code = 'AESTHETICS' AND c.id IN ('${clinicAId}', '${clinicBId}')
      ON CONFLICT ("clinicId", "specialtyId") DO NOTHING;

      INSERT INTO public."BranchSpecialty" ("id", "clinicId", "branchId", "specialtyId", "status", "enabledAt")
      SELECT gen_random_uuid(), b."clinicId", b.id, s.id, 'ACTIVE', b."createdAt"
      FROM public."ClinicBranch" b
      CROSS JOIN public."MedicalSpecialty" s
      WHERE s.code = 'AESTHETICS' AND b."clinicId" IN ('${clinicAId}', '${clinicBId}')
      ON CONFLICT ("branchId", "specialtyId") DO NOTHING;
    `);
  });

  after(async () => {
    await pool.end();
    if (app) await app.close();
    await owner.$disconnect();
  });

  it('1. Global specialty reference catalog is initialized and immutable under runtime credentials', async () => {
    const proof = verifiedSessions.issue(userOwnerAId, sessionOwnerAId);
    const catalog = await specialtyRepo.listCatalog(proof, clinicAId);

    assert.ok(catalog.items.length >= 10);
    const codes = catalog.items.map((i) => i.code);
    assert.ok(codes.includes('AESTHETICS'));
    assert.ok(codes.includes('GENERAL_MEDICINE'));
    assert.ok(codes.includes('DERMATOLOGY'));
    assert.ok(codes.includes('DENTISTRY'));
    assert.ok(codes.includes('PEDIATRICS'));

    // Attempt direct SQL modification of MedicalSpecialty using runtime credentials
    await assert.rejects(
      async () => {
        await pool.query('INSERT INTO public."MedicalSpecialty" ("code", "arabicName", "englishName") VALUES (\'FORGED\', \'مزوّر\', \'Forged\')');
      },
      /permission denied/i,
      'Restricted runtime role must be denied INSERT on MedicalSpecialty',
    );
  });

  it('2. Backward compatibility backfill enables AESTHETICS for existing clinics and branches', async () => {
    // Check that migration backfill populated AESTHETICS for clinicA and branchA1
    const proof = verifiedSessions.issue(userOwnerAId, sessionOwnerAId);
    const clinicSpecs = await specialtyRepo.listClinicSpecialties(proof, clinicAId);
    const aes = clinicSpecs.items.find((s) => s.specialty.code === 'AESTHETICS');
    assert.ok(aes, 'AESTHETICS should be enabled for clinicA');
    assert.equal(aes.status, 'ACTIVE');

    const branchSpecs = await specialtyRepo.listBranchSpecialties(proof, clinicAId, branchA1Id);
    const branchAes = branchSpecs.items.find((s) => s.specialty.code === 'AESTHETICS');
    assert.ok(branchAes, 'AESTHETICS should be enabled for branchA1');
    assert.equal(branchAes.status, 'ACTIVE');
  });

  it('3. Clinic specialty enablement and disablement lifecycle', async () => {
    const proofOwner = verifiedSessions.issue(userOwnerAId, sessionOwnerAId);

    // Enable GENERAL_MEDICINE
    const enabled = await specialtyRepo.enableClinicSpecialty(proofOwner, clinicAId, 'GENERAL_MEDICINE');
    assert.equal(enabled.specialty.code, 'GENERAL_MEDICINE');
    assert.equal(enabled.status, 'ACTIVE');

    // Doctor cannot enable specialties (requires specialties.manage)
    const proofDoc = verifiedSessions.issue(userDoctorA1Id, sessionDoctorA1Id);
    await assert.rejects(
      async () => {
        await specialtyRepo.enableClinicSpecialty(proofDoc, clinicAId, 'PEDIATRICS');
      },
      /ForbiddenException/i,
    );

    // Disable GENERAL_MEDICINE
    const disabled = await specialtyRepo.disableClinicSpecialty(proofOwner, clinicAId, 'GENERAL_MEDICINE');
    assert.equal(disabled.status, 'INACTIVE');
    assert.ok(disabled.disabledAt !== null);

    // Re-enable for subsequent tests
    await specialtyRepo.enableClinicSpecialty(proofOwner, clinicAId, 'GENERAL_MEDICINE');
    await specialtyRepo.enableClinicSpecialty(proofOwner, clinicAId, 'PEDIATRICS');
  });

  it('4. Branch specialty subset constraints: cannot enable branch specialty if parent clinic disabled', async () => {
    const proofOwner = verifiedSessions.issue(userOwnerAId, sessionOwnerAId);

    // GENERAL_MEDICINE is enabled on clinicA -> BranchA1 can enable it
    const branchMed = await specialtyRepo.enableBranchSpecialty(proofOwner, clinicAId, branchA1Id, 'GENERAL_MEDICINE');
    assert.equal(branchMed.status, 'ACTIVE');

    // DENTISTRY is NOT enabled on clinicA -> BranchA1 cannot enable it
    await assert.rejects(
      async () => {
        await specialtyRepo.enableBranchSpecialty(proofOwner, clinicAId, branchA1Id, 'DENTISTRY');
      },
      /Cannot enable specialty on branch when disabled for the parent clinic/i,
    );
  });

  it('5. Cross-clinic tenant isolation enforced across specialty configs and practitioner profiles', async () => {
    const proofOwnerB = verifiedSessions.issue(userOwnerBId, sessionOwnerBId);

    // Owner B cannot enable specialties on Clinic A
    await assert.rejects(
      async () => {
        await specialtyRepo.enableClinicSpecialty(proofOwnerB, clinicAId, 'ORTHOPEDICS');
      },
      /ForbiddenException|NotFoundException/i,
    );

    // Direct SQL without session variable setting yields 0 rows for ClinicSpecialty
    const directRes = await pool.query('SELECT * FROM public."ClinicSpecialty" WHERE "clinicId" = $1', [clinicAId]);
    assert.equal(directRes.rows.length, 0, 'FORCE RLS must isolate tenant tables without setting lamssa.clinic_id');
  });

  it('6. Practitioner profile creation, license entry, and Medical Director designation', async () => {
    const proofOwnerA = verifiedSessions.issue(userOwnerAId, sessionOwnerAId);
    const proofDoc1 = verifiedSessions.issue(userDoctorA1Id, sessionDoctorA1Id);

    // Doctor A1 creates own profile
    const profile1 = await specialtyRepo.upsertPractitionerProfile(proofDoc1, clinicAId, {
      membershipId: membershipDoctorA1Id,
      professionalTitleAr: 'استشاري طب الأسرة والمدير الطبي',
      professionalTitleEn: 'Family Medicine Consultant & Medical Director',
      licenseNumber: 'DOC-SCFHS-001',
      licensingAuthority: 'Saudi Commission for Health Specialties',
      licensingJurisdiction: 'SA',
      licenseExpirationDate: '2029-01-01T00:00:00.000Z',
    });

    assert.equal(profile1.verificationStatus, 'PENDING_VERIFICATION');
    assert.equal(profile1.isMedicalDirector, false);

    // Doctor A2 creates own profile
    const proofDoc2 = verifiedSessions.issue(userDoctorA2Id, sessionDoctorA2Id);
    await specialtyRepo.upsertPractitionerProfile(proofDoc2, clinicAId, {
      membershipId: membershipDoctorA2Id,
      professionalTitleAr: 'أخصائي طب عام',
      professionalTitleEn: 'General Practitioner',
      licenseNumber: 'DOC-SCFHS-002',
      licensingAuthority: 'Saudi Commission for Health Specialties',
      licensingJurisdiction: 'SA',
      licenseExpirationDate: '2028-06-01T00:00:00.000Z',
    });

    // Owner designates Doctor A1 as Medical Director
    const directorProfile = await specialtyRepo.designateMedicalDirector(proofOwnerA, clinicAId, membershipDoctorA1Id);
    assert.equal(directorProfile.isMedicalDirector, true);
    assert.equal(directorProfile.verificationStatus, 'VERIFIED');
  });

  it('7. Practitioner qualification verification and anti-self-approval enforcement', async () => {
    const proofDoc1 = verifiedSessions.issue(userDoctorA1Id, sessionDoctorA1Id);
    const proofDoc2 = verifiedSessions.issue(userDoctorA2Id, sessionDoctorA2Id);

    // Doctor A2 adds a GENERAL_MEDICINE qualification
    const qualDoc2 = await specialtyRepo.addPractitionerQualification(proofDoc2, clinicAId, membershipDoctorA2Id, {
      specialtyCode: 'GENERAL_MEDICINE',
      qualificationTitle: 'ماجستير طب الأسرة والمجتمع',
      qualificationLevel: 'SPECIALIST',
    });
    assert.equal(qualDoc2.status, 'PENDING_VERIFICATION');

    // Doctor A2 tries to verify own qualification -> REJECTED (Section 9 Anti-self-approval)
    await assert.rejects(
      async () => {
        await specialtyRepo.verifyPractitionerQualification(proofDoc2, clinicAId, qualDoc2.id);
      },
      /Only an active verified Medical Director can verify medical qualifications/i,
    );

    // Doctor A1 (Medical Director) adds a qualification
    const qualDoc1 = await specialtyRepo.addPractitionerQualification(proofDoc1, clinicAId, membershipDoctorA1Id, {
      specialtyCode: 'GENERAL_MEDICINE',
      qualificationTitle: 'البورد في طب الأسرة',
      qualificationLevel: 'CONSULTANT',
    });

    // Doctor A1 tries to verify their OWN qualification -> REJECTED (Section 9 Anti-self-approval)
    await assert.rejects(
      async () => {
        await specialtyRepo.verifyPractitionerQualification(proofDoc1, clinicAId, qualDoc1.id);
      },
      /Self-approval of credentials is prohibited/i,
    );

    // Doctor A1 (Medical Director) verifies Doctor A2's qualification -> SUCCEEDS
    const verifiedQual2 = await specialtyRepo.verifyPractitionerQualification(proofDoc1, clinicAId, qualDoc2.id);
    assert.equal(verifiedQual2.status, 'VERIFIED');
    assert.equal(verifiedQual2.verifiedByMembershipId, membershipDoctorA1Id);
  });

  it('8. Clinical privilege engine: approval, anti-self-approval, and qualification dependency', async () => {
    const proofDoc1 = verifiedSessions.issue(userDoctorA1Id, sessionDoctorA1Id);
    const proofDoc2 = verifiedSessions.issue(userDoctorA2Id, sessionDoctorA2Id);

    // Doctor A2 requests MEDICATION_PRESCRIBE for GENERAL_MEDICINE
    const privRequest = await specialtyRepo.requestClinicalPrivilege(proofDoc2, clinicAId, membershipDoctorA2Id, {
      specialtyCode: 'GENERAL_MEDICINE',
      privilegeCode: 'MEDICATION_PRESCRIBE',
      scope: 'CLINIC_WIDE',
    });
    assert.equal(privRequest.status, 'REQUESTED');

    // Doctor A1 (Medical Director) approves Doctor A2's privilege -> SUCCEEDS (qualification is verified)
    const approvedPriv = await specialtyRepo.approveClinicalPrivilege(proofDoc1, clinicAId, privRequest.id);
    assert.equal(approvedPriv.status, 'APPROVED');
    assert.equal(approvedPriv.approvedByMembershipId, membershipDoctorA1Id);

    // Doctor A2 requests privilege for PEDIATRICS (in which they have NO verified qualification)
    const privPedRequest = await specialtyRepo.requestClinicalPrivilege(proofDoc2, clinicAId, membershipDoctorA2Id, {
      specialtyCode: 'PEDIATRICS',
      privilegeCode: 'CLINICAL_PROCEDURE_PERFORM',
      scope: 'CLINIC_WIDE',
    });

    // Attempting to approve privilege without verified qualification -> REJECTED
    await assert.rejects(
      async () => {
        await specialtyRepo.approveClinicalPrivilege(proofDoc1, clinicAId, privPedRequest.id);
      },
      /Practitioner must have a VERIFIED qualification in this specialty before privilege approval/i,
    );
  });

  it('9. Runtime clinical privilege evaluation and aesthetic backward-compatibility policy', async () => {
    const proofDoc2 = verifiedSessions.issue(userDoctorA2Id, sessionDoctorA2Id);

    // Doctor A2 has approved privilege for GENERAL_MEDICINE prescribing -> ALLOWED
    const evalPrescribe = await specialtyRepo.evaluatePrivilege(proofDoc2, clinicAId, {
      practitionerMembershipId: membershipDoctorA2Id,
      specialtyCode: 'GENERAL_MEDICINE',
      privilegeCode: 'MEDICATION_PRESCRIBE',
      branchId: branchA1Id,
    });
    assert.equal(evalPrescribe.allowed, true);

    // Doctor A2 has NO privilege for DIAGNOSTIC_LAB_ORDER in GENERAL_MEDICINE -> DENIED
    const evalLab = await specialtyRepo.evaluatePrivilege(proofDoc2, clinicAId, {
      practitionerMembershipId: membershipDoctorA2Id,
      specialtyCode: 'GENERAL_MEDICINE',
      privilegeCode: 'DIAGNOSTIC_LAB_ORDER',
      branchId: branchA1Id,
    });
    assert.equal(evalLab.allowed, false);

    // Aesthetic Backward-Compatibility:
    // Doctor A2 executing an aesthetic procedure without formal privilege registration -> ALLOWED under compatibility
    const evalAestheticProc = await specialtyRepo.evaluatePrivilege(proofDoc2, clinicAId, {
      practitionerMembershipId: membershipDoctorA2Id,
      specialtyCode: 'AESTHETICS',
      privilegeCode: 'CLINICAL_PROCEDURE_PERFORM',
      branchId: branchA1Id,
      isAestheticExecution: true,
    });
    assert.equal(evalAestheticProc.allowed, true);
    assert.equal(evalAestheticProc.isCompatibility, true);

    // But aesthetic doctor attempting general medical prescribing without privilege -> DENIED
    const evalAestheticPrescribe = await specialtyRepo.evaluatePrivilege(proofDoc2, clinicAId, {
      practitionerMembershipId: membershipDoctorA2Id,
      specialtyCode: 'AESTHETICS',
      privilegeCode: 'MEDICATION_PRESCRIBE',
      branchId: branchA1Id,
    });
    assert.equal(evalAestheticPrescribe.allowed, false);
  });

  it('10. Clinical credential records are protected against hard deletion', async () => {
    // Attempting DELETE on PractitionerProfile or PractitionerSpecialty under runtime role fails
    await assert.rejects(
      async () => {
        await pool.query('DELETE FROM public."PractitionerProfile" WHERE "clinicId" = $1', [clinicAId]);
      },
      /permission denied/i,
      'Restricted runtime credentials must be denied DELETE on PractitionerProfile',
    );

    await assert.rejects(
      async () => {
        await pool.query('DELETE FROM public."PractitionerClinicalPrivilege" WHERE "clinicId" = $1', [clinicAId]);
      },
      /permission denied/i,
      'Restricted runtime credentials must be denied DELETE on PractitionerClinicalPrivilege',
    );
  });
});
