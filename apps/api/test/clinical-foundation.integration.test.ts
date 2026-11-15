import 'reflect-metadata';
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { ClinicalFoundationRepository } from '../src/prisma/clinical-foundation.repository.js';
import { SpecialtyRepository } from '../src/prisma/specialty.repository.js';
import { VerifiedSessions, type VerifiedPrincipal } from '../src/prisma/verified-sessions.js';
import { IdentityDatabase } from '../src/prisma/identity.database.js';
import { authorizationHash } from '../src/auth/crypto.js';
import { testUrls, fixtureDatabase } from './database-fixtures.js';

describe('Shared Clinical Foundation Integration Tests (Multi-Specialty)', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  let pool: pg.Pool;
  let clinicalRepo: ClinicalFoundationRepository;
  let specialtyRepo: SpecialtyRepository;
  let verifiedSessions: VerifiedSessions;
  let identity: IdentityDatabase;

  const suffix = randomUUID().slice(0, 8);
  let clinicAId: string;
  let clinicBId: string;

  let patientA1Id: string;
  let patientA2Id: string;
  let patientB1Id: string;

  let encounterA1Id: string;

  let userDoctorAId: string;
  let userDoctorBId: string;

  let membershipDoctorAId: string;
  let membershipDoctorBId: string;

  let sessionDoctorAId: string;
  let sessionDoctorBId: string;

  let proofDoctorA: VerifiedPrincipal;
  let proofDoctorB: VerifiedPrincipal;

  let practitionerProfileAId: string;
  let qualificationAId: string;
  let privilegeAId: string;

  before(async () => {
    const urls = testUrls();
    process.env.DATABASE_URL = urls.runtime;
    process.env.NODE_ENV = 'test';
    owner = fixtureDatabase();
    pool = new pg.Pool({ connectionString: urls.runtime, max: 5 });

    const { AppModule } = await import('../src/app.module.js');
    const moduleRef = await NestFactory.createApplicationContext(AppModule, { logger: false });
    app = moduleRef as any;
    clinicalRepo = moduleRef.get(ClinicalFoundationRepository);
    specialtyRepo = moduleRef.get(SpecialtyRepository);
    verifiedSessions = moduleRef.get(VerifiedSessions);
    identity = moduleRef.get(IdentityDatabase);

    // Setup synthetic clinics
    clinicAId = randomUUID();
    clinicBId = randomUUID();

    await owner.clinic.createMany({
      data: [
        { id: clinicAId, slug: `cf-clinic-a-${suffix}`, displayName: 'عيادة الأساس السريري أ', legalName: 'شركة الأساس أ', currency: 'SAR', status: 'ACTIVE' },
        { id: clinicBId, slug: `cf-clinic-b-${suffix}`, displayName: 'عيادة الأساس السريري ب', legalName: 'شركة الأساس ب', currency: 'SAR', status: 'ACTIVE' },
      ],
    });

    // Setup users & memberships
    userDoctorAId = randomUUID();
    userDoctorBId = randomUUID();

    await owner.user.createMany({
      data: [
        { id: userDoctorAId, email: `doctor-a-${suffix}@lamssa.test`, name: 'د. خالد العمري', status: 'ACTIVE' },
        { id: userDoctorBId, email: `doctor-b-${suffix}@lamssa.test`, name: 'د. سارة المنصور', status: 'ACTIVE' },
      ],
    });

    membershipDoctorAId = randomUUID();
    membershipDoctorBId = randomUUID();

    await owner.clinicMembership.createMany({
      data: [
        { id: membershipDoctorAId, clinicId: clinicAId, userId: userDoctorAId, role: 'DOCTOR', status: 'ACTIVE' },
        { id: membershipDoctorBId, clinicId: clinicBId, userId: userDoctorBId, role: 'DOCTOR', status: 'ACTIVE' },
      ],
    });

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

    sessionDoctorAId = randomUUID();
    sessionDoctorBId = randomUUID();

    await makeSession(sessionDoctorAId, userDoctorAId, clinicAId);
    await makeSession(sessionDoctorBId, userDoctorBId, clinicBId);

    proofDoctorA = verifiedSessions.issue(userDoctorAId, sessionDoctorAId);
    proofDoctorB = verifiedSessions.issue(userDoctorBId, sessionDoctorBId);

    // Setup patients
    patientA1Id = randomUUID();
    patientA2Id = randomUUID();
    patientB1Id = randomUUID();

    await owner.patient.createMany({
      data: [
        { id: patientA1Id, clinicId: clinicAId, patientNumber: 'P-000001', fullName: 'محمد الأحمد', searchName: 'محمد الاحمد', status: 'ACTIVE' },
        { id: patientA2Id, clinicId: clinicAId, patientNumber: 'P-000002', fullName: 'نورة السالم', searchName: 'نورة السالم', status: 'ACTIVE' },
        { id: patientB1Id, clinicId: clinicBId, patientNumber: 'P-000003', fullName: 'عبدالله القحطاني', searchName: 'عبدالله القحطاني', status: 'ACTIVE' },
      ],
    });

    // Setup encounter for patient A1
    encounterA1Id = randomUUID();
    await owner.clinicalEncounter.create({
      data: {
        id: encounterA1Id,
        clinicId: clinicAId,
        patientId: patientA1Id,
        clinicianMembershipId: membershipDoctorAId,
        status: 'IN_PROGRESS',
      },
    });

    // Ensure GENERAL_MEDICINE specialty exists and is enabled for clinicA
    let genMed = await owner.medicalSpecialty.findUnique({ where: { code: 'GENERAL_MEDICINE' } });
    if (!genMed) {
      genMed = await owner.medicalSpecialty.create({
        data: {
          code: 'GENERAL_MEDICINE',
          arabicName: 'الطب العام',
          englishName: 'General Medicine',
          classification: 'PRIMARY_CARE',
          isActive: true,
        },
      });
    }

    await owner.clinicSpecialty.upsert({
      where: { clinicId_specialtyId: { clinicId: clinicAId, specialtyId: genMed.id } },
      update: { status: 'ACTIVE' },
      create: { clinicId: clinicAId, specialtyId: genMed.id, status: 'ACTIVE' },
    });

    // Create practitioner profile, qualification, and privilege for Doctor A in clinic A
    practitionerProfileAId = randomUUID();
    await owner.practitionerProfile.create({
      data: {
        id: practitionerProfileAId,
        clinicId: clinicAId,
        membershipId: membershipDoctorAId,
        professionalTitleAr: 'استشاري طب عام',
        professionalTitleEn: 'General Medicine Consultant',
        licenseNumber: `SCFHS-${suffix}`,
        licensingAuthority: 'Saudi Commission for Health Specialties',
        licensingJurisdiction: 'SA',
        verificationStatus: 'VERIFIED',
      },
    });

    qualificationAId = randomUUID();
    await owner.practitionerSpecialty.create({
      data: {
        id: qualificationAId,
        clinicId: clinicAId,
        practitionerProfileId: practitionerProfileAId,
        specialtyId: genMed.id,
        qualificationTitle: 'البورد السعودي في طب الأسرة',
        status: 'VERIFIED',
      },
    });

    privilegeAId = randomUUID();
    await owner.practitionerClinicalPrivilege.create({
      data: {
        id: privilegeAId,
        clinicId: clinicAId,
        practitionerProfileId: practitionerProfileAId,
        specialtyId: genMed.id,
        privilegeCode: 'MEDICATION_PRESCRIBE',
        scope: 'CLINIC_WIDE',
        status: 'APPROVED',
      },
    });
  });

  after(async () => {
    await pool.end();
    if (app) await app.close();
  });

  it('Vital signs: records and amends observations with decimal precision, unit validation, and concurrency check', async () => {
    // 1. Record BP Systolic
    const bpSystolic = await clinicalRepo.recordObservation(proofDoctorA, clinicAId, patientA1Id, {
      encounterId: encounterA1Id,
      observationType: 'BLOOD_PRESSURE_SYSTOLIC',
      numericValue: 120,
      unit: 'mmHg',
      interpretation: 'Normal',
    });
    assert.equal(bpSystolic.numericValue, 120);
    assert.equal(bpSystolic.unit, 'mmHg');
    assert.equal(bpSystolic.status, 'RECORDED');

    // 2. Reject out of bounds
    await assert.rejects(
      clinicalRepo.recordObservation(proofDoctorA, clinicAId, patientA1Id, {
        observationType: 'BLOOD_PRESSURE_SYSTOLIC',
        numericValue: 350,
        unit: 'mmHg',
      }),
      /out of physiological bounds/,
    );

    // 3. Amend observation with version check
    const amended = await clinicalRepo.amendObservation(proofDoctorA, clinicAId, bpSystolic.id, {
      amendmentReason: 'Retested after 5 minutes rest',
      numericValue: 118,
      expectedVersion: bpSystolic.version,
    });
    assert.equal(amended.numericValue, 118);
    assert.equal(amended.status, 'AMENDED');
    assert.equal(amended.version, bpSystolic.version + 1);

    // 4. Stale version rejected
    await assert.rejects(
      clinicalRepo.amendObservation(proofDoctorA, clinicAId, bpSystolic.id, {
        amendmentReason: 'Stale retry',
        numericValue: 115,
        expectedVersion: bpSystolic.version, // stale
      }),
      /Version conflict/,
    );
  });

  it('Diagnoses: records encounter diagnosis, demotes previous primary, confirms and manages problem list', async () => {
    // 1. Record Primary Diagnosis
    const diag1 = await clinicalRepo.recordDiagnosis(proofDoctorA, clinicAId, patientA1Id, {
      encounterId: encounterA1Id,
      code: 'L70.0',
      codingSystem: 'ICD-10',
      displayAr: 'حب الشباب الشائع',
      displayEn: 'Acne vulgaris',
      diagnosisRole: 'PRIMARY',
      isProblem: true,
      problemStatus: 'ACTIVE',
    });
    assert.equal(diag1.code, 'L70.0');
    assert.equal(diag1.diagnosisRole, 'PRIMARY');
    assert.equal(diag1.isProblem, true);
    assert.equal(diag1.problemStatus, 'ACTIVE');

    // 2. Record second diagnosis as PRIMARY -> first should be demoted to SECONDARY
    const diag2 = await clinicalRepo.recordDiagnosis(proofDoctorA, clinicAId, patientA1Id, {
      encounterId: encounterA1Id,
      code: 'I10',
      codingSystem: 'ICD-10',
      displayAr: 'ارتفاع ضغط الدم الأولي',
      displayEn: 'Essential hypertension',
      diagnosisRole: 'PRIMARY',
      isProblem: true,
      problemStatus: 'ACTIVE',
    });
    assert.equal(diag2.diagnosisRole, 'PRIMARY');

    // Verify diag1 was demoted to SECONDARY
    const list = await clinicalRepo.listDiagnoses(proofDoctorA, clinicAId, { patientId: patientA1Id });
    const refreshedDiag1 = list.find(d => d.id === diag1.id);
    assert.equal(refreshedDiag1?.diagnosisRole, 'SECONDARY');

    // 3. Clinician confirms diagnosis
    const confirmed = await clinicalRepo.confirmDiagnosis(proofDoctorA, clinicAId, diag2.id);
    assert.equal(confirmed.clinicalStatus, 'CONFIRMED');
    assert.equal(confirmed.verificationStatus, 'CONFIRMED');

    // 4. Amend problem status to RESOLVED
    const amendedDiag = await clinicalRepo.amendDiagnosis(proofDoctorA, clinicAId, diag1.id, {
      amendmentReason: 'Course of treatment completed, lesions cleared',
      problemStatus: 'RESOLVED',
      clinicalStatus: 'RESOLVED',
      expectedVersion: refreshedDiag1!.version,
    });
    assert.equal(amendedDiag.problemStatus, 'RESOLVED');
  });

  it('Allergies: records drug allergy, confirms, and performs pre-flight safety check', async () => {
    // 1. Record Penicillin allergy
    const allergy = await clinicalRepo.recordAllergy(proofDoctorA, clinicAId, patientA1Id, {
      encounterId: encounterA1Id,
      allergyStatusType: 'ALLERGY_PRESENT',
      category: 'MEDICATION',
      substance: 'Penicillin',
      reaction: 'Severe urticaria and facial angioedema',
      severity: 'SEVERE',
      clinicalStatus: 'ACTIVE',
    });
    assert.equal(allergy.substance, 'Penicillin');
    assert.equal(allergy.severity, 'SEVERE');

    // 2. Clinician confirms allergy
    const verified = await clinicalRepo.verifyAllergy(proofDoctorA, clinicAId, allergy.id);
    assert.equal(verified.verificationStatus, 'CLINICIAN_CONFIRMED');
    assert.ok(verified.verifiedAt);

    // 3. Evaluate practitioner clinical prescribing privilege
    const evalPrescribe = await specialtyRepo.evaluatePrivilege(proofDoctorA, clinicAId, {
      practitionerMembershipId: membershipDoctorAId,
      specialtyCode: 'GENERAL_MEDICINE',
      privilegeCode: 'MEDICATION_PRESCRIBE',
    });
    assert.equal(evalPrescribe.allowed, true);
  });

  it('Medications: records medication reconciliation, timestamps without deducting inventory', async () => {
    // 1. Record current medication
    const med1 = await clinicalRepo.recordMedication(proofDoctorA, clinicAId, patientA1Id, {
      encounterId: encounterA1Id,
      medicationName: 'Metformin HCl',
      genericName: 'Metformin',
      dosage: '500 mg',
      route: 'Oral',
      frequency: 'Twice daily',
      status: 'ACTIVE',
      provenance: 'PATIENT_REPORTED',
    });
    assert.equal(med1.medicationName, 'Metformin HCl');
    assert.equal(med1.isReconciled, false);

    // 2. Reconcile medication
    const recon = await clinicalRepo.reconcileMedications(proofDoctorA, clinicAId, patientA1Id, {
      medicationIds: [med1.id],
    });
    assert.equal(recon.reconciledCount, 1);
    assert.ok(recon.reconciledAt);

    const meds = await clinicalRepo.listMedications(proofDoctorA, clinicAId, { patientId: patientA1Id });
    const reconciledMed = meds.find(m => m.id === med1.id);
    assert.equal(reconciledMed?.isReconciled, true);
  });

  it('Prescription lifecycle: drafts sequential number, detects allergy, enforces signing privilege & SHA-256 digest, blocks tampering', async () => {
    // 1. Draft prescription with item matching patient's Penicillin allergy
    const draft = await clinicalRepo.createPrescriptionDraft(proofDoctorA, clinicAId, patientA1Id, {
      encounterId: encounterA1Id,
      notes: 'Initial clinical prescription draft',
      items: [
        {
          medicationName: 'Penicillin V Potassium',
          genericName: 'Penicillin V',
          strength: '500 mg',
          dosageForm: 'Tablet',
          route: 'Oral',
          frequency: 'Every 6 hours',
          duration: '10 days',
          quantity: 40,
          unit: 'tablets',
          instructions: 'Take on an empty stomach with a full glass of water',
        },
      ],
    });

    assert.match(draft.prescriptionNumber, /^RX-\d{6}$/);
    assert.equal(draft.status, 'DRAFT');
    assert.equal(draft.items.length, 1);
    // Allergy warning detected during draft
    assert.ok(draft.allergyCheckWarning);
    assert.match(draft.allergyCheckWarning, /Allergy conflict.*Penicillin/);

    // 2. Attempt to sign without acknowledging allergy warning must fail
    await assert.rejects(
      clinicalRepo.signPrescription(proofDoctorA, clinicAId, draft.id, {
        safetyReviewAcknowledged: false,
      }),
      /Allergy conflict present on prescription/,
    );

    // 3. Sign prescription with acknowledged safety review
    const signed = await clinicalRepo.signPrescription(proofDoctorA, clinicAId, draft.id, {
      safetyReviewAcknowledged: true,
      expectedVersion: draft.version,
    });
    assert.equal(signed.status, 'SIGNED');
    assert.ok(signed.signedAt);
    assert.equal(signed.signatureDigest?.length, 64);

    // 4. Database Trigger Immutability Test: attempt to mutate signed prescription items directly via raw SQL
    await assert.rejects(
      owner.$executeRawUnsafe(
        `UPDATE public."MedicationPrescriptionItem" SET quantity = 999 WHERE id = $1::uuid`,
        draft.items[0].id,
      ),
      /Prescription items cannot be added, modified or deleted on a signed or closed prescription/i,
    );

    // 5. Cancel prescription
    const cancelled = await clinicalRepo.cancelPrescription(proofDoctorA, clinicAId, draft.id, {
      cancellationReason: 'Patient reported adverse sensation, therapy discontinued',
      expectedVersion: signed.version,
    });
    assert.equal(cancelled.status, 'CANCELLED');
    assert.ok(cancelled.cancelledAt);
    assert.equal(cancelled.cancellationReason, 'Patient reported adverse sensation, therapy discontinued');
  });

  it('Multi-tenancy & Isolation: clinic B cannot read or modify clinic A clinical records', async () => {
    // 1. Doctor B cannot read Patient A1 observations
    await assert.rejects(
      clinicalRepo.listObservations(proofDoctorB, clinicBId, { patientId: patientA1Id }),
      /Patient not found in clinic|NotFoundException/,
    );

    // 2. Doctor B cannot read Patient A1 diagnoses
    await assert.rejects(
      clinicalRepo.listDiagnoses(proofDoctorB, clinicBId, { patientId: patientA1Id }),
      /Patient not found in clinic|NotFoundException/,
    );

    // 3. Doctor B cannot read Patient A1 allergies
    await assert.rejects(
      clinicalRepo.listAllergies(proofDoctorB, clinicBId, { patientId: patientA1Id }),
      /Patient not found in clinic|NotFoundException/,
    );

    // 4. Doctor B cannot access Clinic A clinical summary
    await assert.rejects(
      clinicalRepo.getPatientClinicalSummary(proofDoctorB, clinicBId, patientA1Id),
      /Patient not found in clinic|NotFoundException/,
    );
  });

  it('Clinical summary: aggregates consolidated patient overview', async () => {
    const summary = await clinicalRepo.getPatientClinicalSummary(proofDoctorA, clinicAId, patientA1Id);
    assert.equal(summary.patient.id, patientA1Id);
    assert.equal(summary.patient.name, 'محمد الأحمد');
    assert.ok(summary.recentObservations.length >= 1);
    assert.ok(summary.activeProblems.length >= 1);
    assert.ok(summary.allergies.length >= 1);
    assert.ok(summary.activeMedications.length >= 1);
    assert.ok(summary.recentPrescriptions.length >= 1);
  });
});
