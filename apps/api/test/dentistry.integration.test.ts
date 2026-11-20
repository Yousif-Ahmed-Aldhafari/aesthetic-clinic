import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { DentistryRepository } from '../src/prisma/dentistry.repository.js';
import { VerifiedSessions } from '../src/prisma/verified-sessions.js';
import { IdentityDatabase } from '../src/prisma/identity.database.js';
import { authorizationHash } from '../src/auth/crypto.js';
import { testUrls, fixtureDatabase } from './database-fixtures.js';

describe('Dentistry & Oral Health Module Integration & Security Tests', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  let pool: pg.Pool;
  let dentistryRepo: DentistryRepository;
  let verifiedSessions: VerifiedSessions;
  let identity: IdentityDatabase;

  const suffix = randomUUID().slice(0, 8);
  let clinicAId: string;
  let clinicBId: string;
  let branchAId: string;
  let branchBId: string;

  let userDentistAId: string;
  let userNonDentistAId: string;
  let userDentistBId: string;
  let userAdminAId: string;

  let membershipDentistAId: string;
  let membershipNonDentistAId: string;
  let membershipDentistBId: string;
  let membershipAdminAId: string;

  let sessionDentistAId: string;
  let sessionNonDentistAId: string;
  let sessionDentistBId: string;
  let sessionAdminAId: string;

  let patientAId: string;
  let patientBId: string;

  let encounterAId: string;
  let encounterBId: string;

  let generalServiceAId: string;
  let consentTemplateAId: string;
  let inventoryProductAId: string;
  let inventoryLocationAId: string;
  let inventoryBatchAId: string;

  before(async () => {
    const urls = testUrls();
    process.env.DATABASE_URL = urls.runtime;
    process.env.NODE_ENV = 'test';
    owner = fixtureDatabase();
    pool = new pg.Pool({ connectionString: urls.runtime, max: 5 });

    const { AppModule } = await import('../src/app.module.js');
    const moduleRef = await NestFactory.createApplicationContext(AppModule, { logger: false });
    app = moduleRef as any;
    dentistryRepo = moduleRef.get(DentistryRepository);
    verifiedSessions = moduleRef.get(VerifiedSessions);
    identity = moduleRef.get(IdentityDatabase);

    // 1. Clinics & Branches
    clinicAId = randomUUID();
    clinicBId = randomUUID();

    await owner.clinic.createMany({
      data: [
        { id: clinicAId, slug: `dental-a-${suffix}`, displayName: 'عيادة أسنان أ', legalName: 'شركة أسنان أ', currency: 'SAR', status: 'ACTIVE' },
        { id: clinicBId, slug: `dental-b-${suffix}`, displayName: 'عيادة أسنان ب', legalName: 'شركة أسنان ب', currency: 'SAR', status: 'ACTIVE' },
      ],
    });

    const branchA = await owner.clinicBranch.findFirstOrThrow({ where: { clinicId: clinicAId, code: 'MAIN' } });
    branchAId = branchA.id;
    const branchB = await owner.clinicBranch.findFirstOrThrow({ where: { clinicId: clinicBId, code: 'MAIN' } });
    branchBId = branchB.id;

    // 2. Users
    userDentistAId = randomUUID();
    userNonDentistAId = randomUUID();
    userDentistBId = randomUUID();
    userAdminAId = randomUUID();

    await owner.user.createMany({
      data: [
        { id: userDentistAId, email: `dentist-a-${suffix}@test.lamssa.local`, name: 'د. طبيب الأسنان أ', status: 'ACTIVE' },
        { id: userNonDentistAId, email: `general-a-${suffix}@test.lamssa.local`, name: 'د. ممارس غير مرخص أسنان', status: 'ACTIVE' },
        { id: userDentistBId, email: `dentist-b-${suffix}@test.lamssa.local`, name: 'د. طبيب عيادة ب', status: 'ACTIVE' },
        { id: userAdminAId, email: `admin-a-${suffix}@test.lamssa.local`, name: 'مدير عيادة أ', status: 'ACTIVE' },
      ],
    });

    // 3. Memberships
    membershipDentistAId = randomUUID();
    membershipNonDentistAId = randomUUID();
    membershipDentistBId = randomUUID();
    membershipAdminAId = randomUUID();

    await owner.clinicMembership.createMany({
      data: [
        { id: membershipDentistAId, clinicId: clinicAId, userId: userDentistAId, role: 'DOCTOR', status: 'ACTIVE' },
        { id: membershipNonDentistAId, clinicId: clinicAId, userId: userNonDentistAId, role: 'DOCTOR', status: 'ACTIVE' },
        { id: membershipDentistBId, clinicId: clinicBId, userId: userDentistBId, role: 'DOCTOR', status: 'ACTIVE' },
        { id: membershipAdminAId, clinicId: clinicAId, userId: userAdminAId, role: 'CLINIC_OWNER', status: 'ACTIVE' },
      ],
    });

    // 4. Branch Memberships
    await owner.branchMembership.createMany({
      data: [
        { clinicId: clinicAId, branchId: branchAId, membershipId: membershipDentistAId, isPrimary: true, active: true },
        { clinicId: clinicAId, branchId: branchAId, membershipId: membershipNonDentistAId, isPrimary: true, active: true },
        { clinicId: clinicBId, branchId: branchBId, membershipId: membershipDentistBId, isPrimary: true, active: true },
        { clinicId: clinicAId, branchId: branchAId, membershipId: membershipAdminAId, isPrimary: true, active: true },
      ],
    });

    // 5. Sessions
    sessionDentistAId = randomUUID();
    sessionNonDentistAId = randomUUID();
    sessionDentistBId = randomUUID();
    sessionAdminAId = randomUUID();

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

    await makeSession(sessionDentistAId, userDentistAId, clinicAId, branchAId);
    await makeSession(sessionNonDentistAId, userNonDentistAId, clinicAId, branchAId);
    await makeSession(sessionDentistBId, userDentistBId, clinicBId, branchBId);
    await makeSession(sessionAdminAId, userAdminAId, clinicAId, branchAId);

    // 6. Enable DENTISTRY specialty for Clinic A and Clinic B
    const dentalSpecialty = await owner.medicalSpecialty.findUniqueOrThrow({
      where: { code: 'DENTISTRY' },
    });

    await owner.clinicSpecialty.createMany({
      data: [
        { clinicId: clinicAId, specialtyId: dentalSpecialty.id, status: 'ACTIVE' },
        { clinicId: clinicBId, specialtyId: dentalSpecialty.id, status: 'ACTIVE' },
      ],
    });

    await owner.branchSpecialty.createMany({
      data: [
        { clinicId: clinicAId, branchId: branchAId, specialtyId: dentalSpecialty.id, status: 'ACTIVE' },
        { clinicId: clinicBId, branchId: branchBId, specialtyId: dentalSpecialty.id, status: 'ACTIVE' },
      ],
    });

    // 7. Practitioner Profiles & Clinical Privileges
    const profileDentistAId = randomUUID();
    await owner.practitionerProfile.create({
      data: {
        id: profileDentistAId,
        clinicId: clinicAId,
        membershipId: membershipDentistAId,
        licenseNumber: `DENT-LIC-${suffix}`,
        professionalTitleAr: 'طبيب أسنان',
        professionalTitleEn: 'Dentist',
        verificationStatus: 'VERIFIED',
        isMedicalDirector: false,
      },
    });

    const practitionerSpecialtyDentistAId = randomUUID();
    await owner.practitionerSpecialty.create({
      data: {
        id: practitionerSpecialtyDentistAId,
        clinicId: clinicAId,
        practitionerProfileId: profileDentistAId,
        specialtyId: dentalSpecialty.id,
        qualificationTitle: 'BDS',
        status: 'VERIFIED',
      },
    });

    // Grant all dental clinical privileges to Dentist A
    const dentalPrivileges = [
      'DENTAL_EXAMINATION_RECORD',
      'DENTAL_PROCEDURE_PLAN',
      'DENTAL_PROCEDURE_APPROVE',
      'DENTAL_PROCEDURE_PERFORM',
    ] as const;

    for (const code of dentalPrivileges) {
      await owner.practitionerClinicalPrivilege.create({
        data: {
          clinicId: clinicAId,
          practitionerProfileId: profileDentistAId,
          specialtyId: dentalSpecialty.id,
          privilegeCode: code,
          scope: 'CLINIC_WIDE',
          status: 'APPROVED',
          practitionerSpecialtyId: practitionerSpecialtyDentistAId,
        },
      });
    }

    // Dentist B privileges
    const profileDentistBId = randomUUID();
    await owner.practitionerProfile.create({
      data: {
        id: profileDentistBId,
        clinicId: clinicBId,
        membershipId: membershipDentistBId,
        licenseNumber: `DENT-LIC-B-${suffix}`,
        professionalTitleAr: 'طبيب أسنان',
        professionalTitleEn: 'Dentist',
        verificationStatus: 'VERIFIED',
        isMedicalDirector: false,
      },
    });
    const practitionerSpecialtyDentistBId = randomUUID();
    await owner.practitionerSpecialty.create({
      data: {
        id: practitionerSpecialtyDentistBId,
        clinicId: clinicBId,
        practitionerProfileId: profileDentistBId,
        specialtyId: dentalSpecialty.id,
        qualificationTitle: 'BDS',
        status: 'VERIFIED',
      },
    });
    for (const code of dentalPrivileges) {
      await owner.practitionerClinicalPrivilege.create({
        data: {
          clinicId: clinicBId,
          practitionerProfileId: profileDentistBId,
          specialtyId: dentalSpecialty.id,
          privilegeCode: code,
          scope: 'CLINIC_WIDE',
          status: 'APPROVED',
          practitionerSpecialtyId: practitionerSpecialtyDentistBId,
        },
      });
    }

    // 8. Patients & Encounters
    patientAId = randomUUID();
    patientBId = randomUUID();

    const patNumA = `P-${String(Math.floor(Math.random() * 900000) + 100000)}`;
    const patNumB = `P-${String(Math.floor(Math.random() * 900000) + 100000)}`;

    await owner.patient.createMany({
      data: [
        { id: patientAId, clinicId: clinicAId, patientNumber: patNumA, fullName: 'سارة أحمد الأسنان', searchName: 'سارة احمد الاسنان', status: 'ACTIVE' },
        { id: patientBId, clinicId: clinicBId, patientNumber: patNumB, fullName: 'خالد محمد مريض ب', searchName: 'خالد محمد مريض ب', status: 'ACTIVE' },
      ],
    });

    encounterAId = randomUUID();
    encounterBId = randomUUID();

    await owner.clinicalEncounter.createMany({
      data: [
        { id: encounterAId, clinicId: clinicAId, patientId: patientAId, clinicianMembershipId: membershipDentistAId, status: 'IN_PROGRESS' },
        { id: encounterBId, clinicId: clinicBId, patientId: patientBId, clinicianMembershipId: membershipDentistBId, status: 'IN_PROGRESS' },
      ],
    });

    // 9. General Clinical Service for Dentistry
    generalServiceAId = randomUUID();
    await owner.generalClinicalService.create({
      data: {
        id: generalServiceAId,
        clinicId: clinicAId,
        branchId: branchAId,
        serviceCode: `DENT-SRV-${suffix}`,
        nameAr: 'حشوة ضوئية كومبوزيت للأسنان الخلفية',
        nameEn: 'Posterior Composite Restoration',
        category: 'MINOR_PROCEDURE',
        basePriceMinor: 45000n, // 450.00 SAR
        defaultDurationMinutes: 45,
        isActive: true,
      },
    });

    // 10. Consent Template
    consentTemplateAId = randomUUID();
    const consentVersionAId = randomUUID();
    await owner.consentTemplate.create({
      data: {
        id: consentTemplateAId,
        clinicId: clinicAId,
        purpose: 'PROCEDURE',
        title: 'إقرار موافقة على علاج وترميم الأسنان',
        active: true,
        versions: {
          create: {
            id: consentVersionAId,
            versionNumber: 1,
            status: 'PUBLISHED',
            titleAr: 'إقرار موافقة على علاج وترميم الأسنان',
            bodyAr: 'أوافق بموجب هذا على إجراء الترميم والعلاج السني الموصى به...',
            risksTextAr: 'قد يحدث حساسية مؤقتة في الأسنان المعالجة',
            alternativesTextAr: 'المراقبة بدون علاج أو حشوة مؤقتة',
            contentDigestSha256: '0000000000000000000000000000000000000000000000000000000000000000',
            publishedAt: new Date(),
            publishedByMembershipId: membershipDentistAId,
          },
        },
      },
    });

    // 11. Inventory Product, Location, Batch & Balances for consumable testing
    inventoryProductAId = randomUUID();
    await owner.inventoryProduct.create({
      data: {
        id: inventoryProductAId,
        clinicId: clinicAId,
        sku: `COMPOSITE-A2-${suffix}`,
        nameAr: 'مادة حشو الأسنان كومبوزيت A2',
        nameEn: 'Composite Resin Syringe A2',
        category: 'CONSUMABLE',
        unit: 'PIECE',
        isActive: true,
      },
    });

    inventoryLocationAId = randomUUID();
    await owner.inventoryLocation.create({
      data: {
        id: inventoryLocationAId,
        clinicId: clinicAId,
        branchId: branchAId,
        code: 'ROOM-1',
        nameAr: 'خزانة عيادة الأسنان 1',
        nameEn: 'Dental Operatory Cabinet 1',
        type: 'TREATMENT_ROOM',
        isActive: true,
      },
    });

    inventoryBatchAId = randomUUID();
    await owner.inventoryBatch.create({
      data: {
        id: inventoryBatchAId,
        clinicId: clinicAId,
        productId: inventoryProductAId,
        batchNumber: `BATCH-DENT-${suffix}`,
        expirationDate: new Date('2030-01-01'),
        initialQuantity: 100,
        status: 'AVAILABLE',
      },
    });

    await owner.inventoryBalance.create({
      data: {
        clinicId: clinicAId,
        productId: inventoryProductAId,
        locationId: inventoryLocationAId,
        onHandQuantity: 50,
      },
    });

    await owner.inventoryBatchBalance.create({
      data: {
        clinicId: clinicAId,
        batchId: inventoryBatchAId,
        productId: inventoryProductAId,
        locationId: inventoryLocationAId,
        onHandQuantity: 50,
      },
    });
  });

  after(async () => {
    await pool.end();
    if (app) await app.close();
    await owner.$disconnect();
  });

  // =========================================================================
  // 1. ODONTOGRAM LIFECYCLE & IMMUTABILITY TESTS
  // =========================================================================

  let activeOdontogramId: string;

  it('1. Dentist can create a versioned dental odontogram draft during active encounter', async () => {
    const proof = verifiedSessions.issue(userDentistAId, sessionDentistAId);

    const created = await dentistryRepo.createOdontogram(proof, clinicAId, membershipDentistAId, {
      patientId: patientAId,
      encounterId: encounterAId,
      dentitionType: 'PERMANENT',
      numberingSystem: 'FDI_ISO_3950',
      chartType: 'BASELINE',
      generalOralCondition: 'صحة فموية جيدة مع وجود نخر بسيط في الضرس 16',
      notes: 'خطة علاجية لترميم الأسنان الخلفية',
    });

    assert.ok(created.id);
    assert.equal(created.clinicId, clinicAId);
    assert.equal(created.patientId, patientAId);
    assert.equal(created.status, 'DRAFT');
    assert.equal(created.version, 1);
    activeOdontogramId = created.id;
  });

  it('2. Clinician without active DENTAL_EXAMINATION_RECORD privilege is denied odontogram creation', async () => {
    const proof = verifiedSessions.issue(userNonDentistAId, sessionNonDentistAId);

    await assert.rejects(
      async () => {
        await dentistryRepo.createOdontogram(proof, clinicAId, membershipNonDentistAId, {
          patientId: patientAId,
          encounterId: encounterAId,
        });
      },
      /lacks required privilege DENTAL_EXAMINATION_RECORD/i,
      'Clinician lacking dental exam privilege must be rejected',
    );
  });

  it('3. Dentist can record tooth findings with surface validation (posterior occlusal vs anterior incisal)', async () => {
    const proof = verifiedSessions.issue(userDentistAId, sessionDentistAId);

    // Posterior tooth 16: Occlusal surface is VALID
    const validPosterior = await dentistryRepo.upsertToothFindings(
      proof,
      clinicAId,
      activeOdontogramId,
      membershipDentistAId,
      [
        {
          toothNumberFdi: 16,
          condition: 'CARIES',
          surfacesAffected: ['OCCLUSAL', 'MESIAL'],
          clinicalDescription: 'تسوس نشط في السطح الإطباقي والأنسي',
          severity: 'MODERATE',
        },
      ],
    );
    assert.equal(validPosterior.length, 1);
    assert.equal(validPosterior[0].toothNumberFdi, 16);
    assert.deepEqual(validPosterior[0].surfacesAffected, ['OCCLUSAL', 'MESIAL']);

    // Anterior tooth 11: Occlusal surface MUST FAIL CLOSED (must use INCISAL)
    await assert.rejects(
      async () => {
        await dentistryRepo.upsertToothFindings(
          proof,
          clinicAId,
          activeOdontogramId,
          membershipDentistAId,
          [
            {
              toothNumberFdi: 11,
              condition: 'FRACTURE',
              surfacesAffected: ['OCCLUSAL'], // INVALID FOR ANTERIOR
            },
          ],
        );
      },
      /Surface validation error.*anterior tooth and cannot have an OCCLUSAL surface/i,
      'Anterior tooth cannot have occlusal surface',
    );

    // Anterior tooth 11: Incisal surface is VALID
    const validAnterior = await dentistryRepo.upsertToothFindings(
      proof,
      clinicAId,
      activeOdontogramId,
      membershipDentistAId,
      [
        {
          toothNumberFdi: 11,
          condition: 'FRACTURE',
          surfacesAffected: ['INCISAL'],
          clinicalDescription: 'كسر في الحافة القاطعة من الصنف الأول',
        },
      ],
    );
    assert.equal(validAnterior.length, 1);
    assert.equal(validAnterior[0].toothNumberFdi, 11);
  });

  it('4. Dentist can record 6-site periodontal measurements with exact CAL calculation (CAL = PD + GM)', async () => {
    const proof = verifiedSessions.issue(userDentistAId, sessionDentistAId);

    // Tooth 16:
    // PD = [4, 3, 4, 3, 3, 4] mm
    // GM = [2, 1, 2, 0, -1, 1] mm (Recession > 0, Normal = 0, Hyperplasia < 0)
    // Expected CAL = PD + GM = [6, 4, 6, 3, 2, 5] mm
    const perio = await dentistryRepo.recordPeriodontalRecord(
      proof,
      clinicAId,
      activeOdontogramId,
      membershipDentistAId,
      {
        toothNumberFdi: 16,
        probingDepthsMm: [4, 3, 4, 3, 3, 4],
        gingivalMarginMm: [2, 1, 2, 0, -1, 1],
        bleedingOnProbing: [true, false, true, false, false, true],
        suppuration: [false, false, false, false, false, false],
        furcationGrade: 'CLASS_I',
        mobilityGrade: 'GRADE_1',
        plaquePresent: true,
        notes: 'التهاب دواعم سني معتدل مع نزف عند السبر',
      },
    );

    assert.equal(perio.toothNumberFdi, 16);
    assert.deepEqual(perio.clinicalAttachmentMm, [6, 4, 6, 3, 2, 5]);
    assert.equal(perio.furcationGrade, 'CLASS_I');
    assert.equal(perio.mobilityGrade, 'GRADE_1');
  });

  it('5. Finalizing odontogram seals chart with cryptographic SHA-256 digest and enforces immutability trigger', async () => {
    const proof = verifiedSessions.issue(userDentistAId, sessionDentistAId);

    const chart = await dentistryRepo.getOdontogramById(proof, clinicAId, activeOdontogramId);
    const finalized = await dentistryRepo.finalizeOdontogram(
      proof,
      clinicAId,
      activeOdontogramId,
      membershipDentistAId,
      chart.version,
    );

    assert.equal(finalized.status, 'FINALIZED');
    assert.ok(finalized.finalizedAt);
    assert.ok(finalized.contentDigest);
    assert.equal(finalized.contentDigest.length, 64); // Valid SHA-256 hex digest

    // Verify immutability: PostgreSQL database trigger throws 42501 when trying to update findings on finalized chart
    const finding = finalized.findings[0];
    assert.ok(finding, 'Finalized chart must have findings from earlier test');
    await assert.rejects(
      async () => {
        await owner.dentalToothFinding.update({
          where: { clinicId_id: { clinicId: clinicAId, id: finding.id } },
          data: { condition: 'EXTRACTION_HISTORY' },
        });
      },
      /Cannot modify findings or periodontal records of a finalized dental chart/i,
      'PostgreSQL trigger must block updates to findings on finalized chart',
    );

    // Verify immutability: trigger blocks deletion of periodontal records on finalized chart
    const perio = finalized.periodontalRecords[0];
    assert.ok(perio, 'Finalized chart must have periodontal record from earlier test');
    await assert.rejects(
      async () => {
        await owner.dentalPeriodontalRecord.delete({
          where: { clinicId_id: { clinicId: clinicAId, id: perio.id } },
        });
      },
      /Cannot modify findings or periodontal records of a finalized dental chart/i,
      'PostgreSQL trigger must block deletions of periodontal records on finalized chart',
    );

    // Verify immutability: trigger blocks direct modification of finalized odontogram
    await assert.rejects(
      async () => {
        await owner.dentalOdontogram.update({
          where: { clinicId_id: { clinicId: clinicAId, id: activeOdontogramId } },
          data: { notes: 'تعديل مباشر غير مسموح' },
        });
      },
      /Finalized dental odontogram records are immutable/i,
      'PostgreSQL trigger must block direct modification to finalized odontogram',
    );
  });

  it('6. Amending a finalized chart marks prior as SUPERSEDED, clones active findings into draft amendment, and preserves audit trail', async () => {
    const proof = verifiedSessions.issue(userDentistAId, sessionDentistAId);

    const amendment = await dentistryRepo.amendOdontogram(
      proof,
      clinicAId,
      activeOdontogramId,
      membershipDentistAId,
      {
        amendmentReason: 'تحديث حالة السن 16 بعد ظهور تسوس ثانوي وتآكل حشوة سابقة',
      },
    );

    assert.ok(amendment.id);
    assert.equal(amendment.status, 'DRAFT');
    assert.equal(amendment.chartType, 'AMENDMENT');
    assert.equal(amendment.version, 3); // Prior was 1, incremented to 2 on supersede, amendment starts at version 3

    // Verify prior chart is now SUPERSEDED and references amendment
    const prior = await dentistryRepo.getOdontogramById(proof, clinicAId, activeOdontogramId);
    assert.equal(prior.status, 'SUPERSEDED');
    assert.equal(prior.supersededById, amendment.id);

    // Verify findings were cloned into the new draft amendment
    const amendmentDetails = await dentistryRepo.getOdontogramById(proof, clinicAId, amendment.id);
    assert.equal(amendmentDetails.findings.length, prior.findings.length);
    assert.equal(amendmentDetails.periodontalRecords.length, prior.periodontalRecords.length);

    // On the draft amendment, findings CAN be updated
    const updatedFindings = await dentistryRepo.upsertToothFindings(
      proof,
      clinicAId,
      amendment.id,
      membershipDentistAId,
      [
        {
          toothNumberFdi: 16,
          condition: 'ROOT_CANAL',
          clinicalDescription: 'التهاب عصب سني يتطلب علاج جذور',
        },
      ],
    );
    assert.equal(updatedFindings[0].condition, 'ROOT_CANAL');
  });

  // =========================================================================
  // 2. DENTAL TREATMENT STAGING, BILLING & INVENTORY TESTS
  // =========================================================================

  let stage1Id: string;

  it('7. Dentist can plan staged treatment linked to clinical service and odontogram', async () => {
    const proof = verifiedSessions.issue(userDentistAId, sessionDentistAId);

    const stage = await dentistryRepo.createTreatmentStage(proof, clinicAId, membershipDentistAId, {
      odontogramId: activeOdontogramId,
      patientId: patientAId,
      encounterId: encounterAId,
      serviceId: generalServiceAId,
      toothNumberFdi: 16,
      surfaces: ['OCCLUSAL', 'MESIAL'],
      stageOrder: 1,
      clinicalIndication: 'ترميم ضرس 16 بحشوة تجميلية بعد تنظيف التسوس',
      estimatedDurationMinutes: 45,
      estimatedCost: 450.0,
      consentTemplateId: consentTemplateAId,
    });

    assert.ok(stage.id);
    assert.equal(stage.status, 'PROPOSED');
    assert.equal(stage.toothNumberFdi, 16);
    assert.equal(stage.serviceId, generalServiceAId);
    stage1Id = stage.id;
  });

  it('8. Treatment stage approval requires DENTAL_PROCEDURE_APPROVE privilege and optimistic locking', async () => {
    const proofDentist = verifiedSessions.issue(userDentistAId, sessionDentistAId);
    const proofNonDentist = verifiedSessions.issue(userNonDentistAId, sessionNonDentistAId);

    // Clinician without privilege is rejected
    await assert.rejects(
      async () => {
        await dentistryRepo.approveTreatmentStage(proofNonDentist, clinicAId, stage1Id, membershipNonDentistAId, 1);
      },
      /lacks required privilege DENTAL_PROCEDURE_APPROVE/i,
      'Clinician lacking approve privilege must be rejected',
    );

    // Concurrent modification conflict when version is stale
    await assert.rejects(
      async () => {
        await dentistryRepo.approveTreatmentStage(proofDentist, clinicAId, stage1Id, membershipDentistAId, 999);
      },
      /Concurrent modification conflict/i,
      'Stale version must trigger ConflictException',
    );

    // Authorized approval
    const approved = await dentistryRepo.approveTreatmentStage(proofDentist, clinicAId, stage1Id, membershipDentistAId, 1);
    assert.equal(approved.status, 'APPROVED');
    assert.ok(approved.approvedAt);
    assert.equal(approved.version, 2);
  });

  it('9. Procedure stage completion requires verified informed consent (fails closed if unconsented)', async () => {
    const proofDentist = verifiedSessions.issue(userDentistAId, sessionDentistAId);

    // Attempt completion without active consent: MUST FAIL CLOSED
    await assert.rejects(
      async () => {
        await dentistryRepo.completeTreatmentStage(
          proofDentist,
          clinicAId,
          stage1Id,
          membershipDentistAId,
          {
            expectedVersion: 2,
            completionNotes: 'تم حفر وتنظيف النخر ووضع الحشوة',
          },
        );
      },
      /Procedure cannot be completed without active patient informed consent/i,
      'Fail closed if informed consent is not verified',
    );

    // Create verified active consent for this patient and template
    const consentTemplateVersion = await owner.consentTemplateVersion.findFirstOrThrow({
      where: { clinicId: clinicAId, templateId: consentTemplateAId },
    });
    const verifiedConsent = await owner.patientConsent.create({
      data: {
        clinicId: clinicAId,
        patientId: patientAId,
        templateVersionId: consentTemplateVersion.id,
        purpose: 'PROCEDURE',
        status: 'ACTIVE',
        preparedByMembershipId: membershipDentistAId,
        verifiedByMembershipId: membershipDentistAId,
        verifiedAt: new Date(),
        validFrom: new Date(),
        expiresAt: new Date(Date.now() + 86400000),
      },
    });

    // Attempt completion WITH verified consent: SUCCESS
    const completed = await dentistryRepo.completeTreatmentStage(
      proofDentist,
      clinicAId,
      stage1Id,
      membershipDentistAId,
      {
        expectedVersion: 2,
        patientConsentId: verifiedConsent.id,
        completionNotes: 'تم تنظيف النخر بنجاح ووضع ترميم ضوئي نانوهجين مع فحص الإطباق',
      },
    );

    assert.equal(completed.status, 'COMPLETED');
    assert.ok(completed.completedAt);
    assert.equal(completed.patientConsentId, verifiedConsent.id);
  });

  it('10. Billing integration generates invoice line with 15% VAT and links to stage', async () => {
    const proofAdmin = verifiedSessions.issue(userAdminAId, sessionAdminAId);

    const billingResult = await dentistryRepo.billTreatmentStage(
      proofAdmin,
      clinicAId,
      stage1Id,
      membershipAdminAId,
    );

    assert.ok(billingResult.invoiceId);
    assert.ok(billingResult.invoiceLine.id);
    assert.equal(billingResult.stage.invoiceLineId, billingResult.invoiceLine.id);

    // Verify invoice calculation
    const invoice = await owner.invoice.findUniqueOrThrow({
      where: { id: billingResult.invoiceId },
      include: { lines: true },
    });

    assert.equal(invoice.status, 'DRAFT');
    assert.equal(invoice.lines.length, 1);
    assert.equal(invoice.lines[0].grossMinor, 45000n); // 450.00 SAR
    assert.equal(invoice.lines[0].taxBasisPoints, 1500); // 15%
    assert.equal(invoice.lines[0].taxMinor, 6750n); // 67.50 SAR
    assert.equal(invoice.lines[0].totalMinor, 51750n); // 517.50 SAR
    assert.equal(invoice.totalMinor, 51750n);

    // Double billing prevention: attempting to bill stage again must fail
    await assert.rejects(
      async () => {
        await dentistryRepo.billTreatmentStage(proofAdmin, clinicAId, stage1Id, membershipAdminAId);
      },
      /Dental treatment stage has already been billed/i,
      'Double billing must be rejected',
    );
  });

  it('11. Inventory consumption decrements batch and stock balances and records stock movement', async () => {
    const proof = verifiedSessions.issue(userDentistAId, sessionDentistAId);

    const initialBatchBal = await owner.inventoryBatchBalance.findUniqueOrThrow({
      where: {
        clinicId_locationId_batchId: {
          clinicId: clinicAId,
          locationId: inventoryLocationAId,
          batchId: inventoryBatchAId,
        },
      },
    });
    assert.equal(Number(initialBatchBal.onHandQuantity), 50);

    const consumptionResult = await dentistryRepo.consumeStageMaterials(
      proof,
      clinicAId,
      stage1Id,
      membershipDentistAId,
      {
        productId: inventoryProductAId,
        batchId: inventoryBatchAId,
        locationId: inventoryLocationAId,
        quantity: 1,
        wasteQuantity: 0.25,
        idempotencyKey: `idemp-dent-cons-${suffix}`,
        notes: 'استهلاك أنبوبة كومبوزيت A2 في حشوة الضرس 16',
      },
    );

    assert.ok(consumptionResult.movement.id);
    assert.equal(consumptionResult.movement.movementType, 'ISSUE');
    assert.equal(consumptionResult.movement.reasonCode, 'CLINICAL_USE');

    // Verify balance decremented by 1.25 (1 + 0.25 waste)
    const updatedBatchBal = await owner.inventoryBatchBalance.findUniqueOrThrow({
      where: {
        clinicId_locationId_batchId: {
          clinicId: clinicAId,
          locationId: inventoryLocationAId,
          batchId: inventoryBatchAId,
        },
      },
    });
    assert.equal(Number(updatedBatchBal.onHandQuantity), 48.75);

    const updatedStockBal = await owner.inventoryBalance.findUniqueOrThrow({
      where: {
        clinicId_productId_locationId: {
          clinicId: clinicAId,
          productId: inventoryProductAId,
          locationId: inventoryLocationAId,
        },
      },
    });
    assert.equal(Number(updatedStockBal.onHandQuantity), 48.75);
  });

  // =========================================================================
  // 3. MULTI-TENANT ISOLATION TESTS
  // =========================================================================

  it('12. Cross-clinic confinement: Clinic B clinician cannot read or modify Clinic A dental charts', async () => {
    const proofB = verifiedSessions.issue(userDentistBId, sessionDentistBId);

    // Attempt to access Clinic A's odontogram using Clinic B credentials
    await assert.rejects(
      async () => {
        await dentistryRepo.getOdontogramById(proofB, clinicBId, activeOdontogramId);
      },
      /Dental odontogram not found/i,
      'Cross-clinic access must return NotFoundException',
    );

    // Attempt to mutate findings on Clinic A chart with Clinic B credentials
    await assert.rejects(
      async () => {
        await dentistryRepo.upsertToothFindings(proofB, clinicBId, activeOdontogramId, membershipDentistBId, [
          { toothNumberFdi: 21, condition: 'CARIES' },
        ]);
      },
      /Odontogram not found/i,
      'Cross-clinic finding modification must fail',
    );
  });
});
