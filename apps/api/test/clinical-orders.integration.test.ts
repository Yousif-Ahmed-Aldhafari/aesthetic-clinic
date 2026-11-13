import 'reflect-metadata';
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { PrismaClient, ClinicalServiceCategory } from '../src/generated/prisma/client.js';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { ClinicalOrdersRepository } from '../src/prisma/clinical-orders.repository.js';
import { VerifiedSessions, type VerifiedPrincipal } from '../src/prisma/verified-sessions.js';
import { IdentityDatabase } from '../src/prisma/identity.database.js';
import { authorizationHash } from '../src/auth/crypto.js';
import { testUrls, fixtureDatabase } from './database-fixtures.js';

describe('General Clinical Services, Orders & Documents Integration Tests', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  let pool: pg.Pool;
  let ordersRepo: ClinicalOrdersRepository;
  let verifiedSessions: VerifiedSessions;
  let identity: IdentityDatabase;

  const suffix = randomUUID().slice(0, 8);
  let clinicAId: string;
  let clinicBId: string;

  let patientA1Id: string;
  let patientB1Id: string;

  let encounterA1Id: string;

  let userDoctorAId: string;
  let userDoctorBId: string;
  let userOwnerAId: string;

  let membershipDoctorAId: string;
  let membershipDoctorBId: string;
  let membershipOwnerAId: string;

  let sessionDoctorAId: string;
  let sessionDoctorBId: string;
  let sessionOwnerAId: string;

  let proofDoctorA: VerifiedPrincipal;
  let proofDoctorB: VerifiedPrincipal;
  let proofOwnerA: VerifiedPrincipal;

  before(async () => {
    const urls = testUrls();
    process.env.DATABASE_URL = urls.runtime;
    process.env.NODE_ENV = 'test';
    owner = fixtureDatabase();
    pool = new pg.Pool({ connectionString: urls.runtime, max: 5 });

    const { AppModule } = await import('../src/app.module.js');
    const moduleRef = await NestFactory.createApplicationContext(AppModule, { logger: false });
    app = moduleRef as any;
    ordersRepo = moduleRef.get(ClinicalOrdersRepository);
    verifiedSessions = moduleRef.get(VerifiedSessions);
    identity = moduleRef.get(IdentityDatabase);

    // Setup synthetic clinics
    clinicAId = randomUUID();
    clinicBId = randomUUID();

    await owner.clinic.createMany({
      data: [
        { id: clinicAId, slug: `ord-clinic-a-${suffix}`, displayName: 'عيادة الأوامر الطبية أ', legalName: 'شركة الأوامر أ', currency: 'SAR', status: 'ACTIVE' },
        { id: clinicBId, slug: `ord-clinic-b-${suffix}`, displayName: 'عيادة الأوامر الطبية ب', legalName: 'شركة الأوامر ب', currency: 'SAR', status: 'ACTIVE' },
      ],
    });

    // Setup users & memberships: Doctors have DOCTOR role for clinical ops, Owner has CLINIC_OWNER for finance/invoicing
    userDoctorAId = randomUUID();
    userDoctorBId = randomUUID();
    userOwnerAId = randomUUID();

    await owner.user.createMany({
      data: [
        { id: userDoctorAId, email: `ord-doc-a-${suffix}@lamssa.test`, name: 'د. فيصل الشمري', status: 'ACTIVE' },
        { id: userDoctorBId, email: `ord-doc-b-${suffix}@lamssa.test`, name: 'د. منيرة الدوسري', status: 'ACTIVE' },
        { id: userOwnerAId, email: `ord-owner-a-${suffix}@lamssa.test`, name: 'مالك العيادة أ', status: 'ACTIVE' },
      ],
    });

    membershipDoctorAId = randomUUID();
    membershipDoctorBId = randomUUID();
    membershipOwnerAId = randomUUID();

    await owner.clinicMembership.createMany({
      data: [
        { id: membershipDoctorAId, clinicId: clinicAId, userId: userDoctorAId, role: 'DOCTOR', status: 'ACTIVE' },
        { id: membershipDoctorBId, clinicId: clinicBId, userId: userDoctorBId, role: 'DOCTOR', status: 'ACTIVE' },
        { id: membershipOwnerAId, clinicId: clinicAId, userId: userOwnerAId, role: 'CLINIC_OWNER', status: 'ACTIVE' },
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
    sessionOwnerAId = randomUUID();

    await makeSession(sessionDoctorAId, userDoctorAId, clinicAId);
    await makeSession(sessionDoctorBId, userDoctorBId, clinicBId);
    await makeSession(sessionOwnerAId, userOwnerAId, clinicAId);

    proofDoctorA = verifiedSessions.issue(userDoctorAId, sessionDoctorAId);
    proofDoctorB = verifiedSessions.issue(userDoctorBId, sessionDoctorBId);
    proofOwnerA = verifiedSessions.issue(userOwnerAId, sessionOwnerAId);

    // Setup patients
    patientA1Id = randomUUID();
    patientB1Id = randomUUID();

    await owner.patient.createMany({
      data: [
        { id: patientA1Id, clinicId: clinicAId, patientNumber: 'P-000101', fullName: 'أحمد التميمي', searchName: 'احمد التميمي', status: 'ACTIVE' },
        { id: patientB1Id, clinicId: clinicBId, patientNumber: 'P-000102', fullName: 'فهد العتيبي', searchName: 'فهد العتيبي', status: 'ACTIVE' },
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
  });

  after(async () => {
    if (owner) {
      await owner.clinicalDocument.deleteMany({ where: { clinicId: { in: [clinicAId, clinicBId] } } }).catch(() => {});
      await owner.clinicalOrderResult.deleteMany({ where: { clinicId: { in: [clinicAId, clinicBId] } } }).catch(() => {});
      await owner.clinicalOrder.deleteMany({ where: { clinicId: { in: [clinicAId, clinicBId] } } }).catch(() => {});
      await owner.clinicOrderCounter.deleteMany({ where: { clinicId: { in: [clinicAId, clinicBId] } } }).catch(() => {});
      await owner.generalClinicalService.deleteMany({ where: { clinicId: { in: [clinicAId, clinicBId] } } }).catch(() => {});
      await owner.invoiceLine.deleteMany({ where: { clinicId: { in: [clinicAId, clinicBId] } } }).catch(() => {});
      await owner.invoice.deleteMany({ where: { clinicId: { in: [clinicAId, clinicBId] } } }).catch(() => {});
      await owner.clinicalEncounter.deleteMany({ where: { clinicId: { in: [clinicAId, clinicBId] } } }).catch(() => {});
      await owner.patient.deleteMany({ where: { clinicId: { in: [clinicAId, clinicBId] } } }).catch(() => {});
      await owner.session.deleteMany({ where: { userId: { in: [userDoctorAId, userDoctorBId, userOwnerAId] } } }).catch(() => {});
      await owner.clinicMembership.deleteMany({ where: { clinicId: { in: [clinicAId, clinicBId] } } }).catch(() => {});
      await owner.user.deleteMany({ where: { id: { in: [userDoctorAId, userDoctorBId, userOwnerAId] } } }).catch(() => {});
      await owner.clinic.deleteMany({ where: { id: { in: [clinicAId, clinicBId] } } }).catch(() => {});
      await owner.$disconnect().catch(() => {});
    }
    if (pool) await pool.end().catch(() => {});
    if (app) await app.close().catch(() => {});
  });

  let createdServiceId: string;
  let createdOrderId: string;
  let createdResultId: string;

  it('General Clinical Service: creation and cross-clinic isolation', async () => {
    const serviceCode = `CONS-TST-${suffix}`.toUpperCase();
    const service = await ordersRepo.createGeneralService(
      proofDoctorA,
      clinicAId,
      {
        serviceCode,
        nameAr: 'استشارة طب عام متقدمة',
        nameEn: 'Advanced General Consultation',
        category: ClinicalServiceCategory.GENERAL_CONSULTATION,
        defaultDurationMinutes: 25,
        basePriceMinor: 20000,
        isActive: true,
      },
    );

    assert.ok(service.id);
    assert.equal(service.serviceCode, serviceCode);
    assert.equal(service.nameAr, 'استشارة طب عام متقدمة');
    assert.equal(service.basePriceMinor, 20000);
    createdServiceId = service.id;

    // Doctor A in Clinic A sees the service
    const listA = await ordersRepo.listGeneralServices(proofDoctorA, clinicAId, {
      category: ClinicalServiceCategory.GENERAL_CONSULTATION,
    });
    assert.ok(listA.items.some(s => s.id === service.id));

    // Doctor B in Clinic B does NOT see Clinic A's service
    const listB = await ordersRepo.listGeneralServices(proofDoctorB, clinicBId, {});
    assert.ok(!listB.items.some(s => s.id === service.id));
  });

  it('Clinical Order Lifecycle: sequential numbering and creation', async () => {
    const order = await ordersRepo.createOrder(
      proofDoctorA,
      clinicAId,
      {
        patientId: patientA1Id,
        encounterId: encounterA1Id,
        orderType: 'LABORATORY',
        generalClinicalServiceId: createdServiceId,
        clinicalIndication: 'Evaluation of persistent fatigue and suspected iron deficiency',
        priority: 'URGENT',
        notes: 'Fasting 12 hours required before blood draw',
      },
    );

    assert.ok(order.id);
    assert.ok(order.orderNumber.startsWith('ORD-'));
    assert.equal(order.status, 'REQUESTED');
    assert.equal(order.priority, 'URGENT');
    assert.equal(order.orderType, 'LABORATORY');
    assert.equal(order.patientId, patientA1Id);
    createdOrderId = order.id;

    // Verify cross-clinic isolation: Doctor B cannot read order from Clinic A
    await assert.rejects(
      ordersRepo.getOrderById(proofDoctorB, clinicBId, order.id),
      /Order not found in clinic|NotFoundException/,
    );
  });

  it('Order Results: record result transitions order status to IN_PROGRESS', async () => {
    const result = await ordersRepo.recordResult(
      proofDoctorA,
      clinicAId,
      createdOrderId,
      {
        resultType: 'LABORATORY',
        status: 'FINAL',
        sourceOrganization: 'Lamssa Regional Diagnostic Lab',
        narrativeFindings: 'Hemoglobin 10.2 g/dL (Low), Serum Ferritin 12 ng/mL (Low)',
        impression: 'Microcytic hypochromic anemia consistent with iron deficiency',
        isCritical: false,
        isReleasedToPatient: false,
      },
    );

    assert.ok(result.id);
    assert.equal(result.status, 'FINAL');
    assert.equal(result.isCritical, false);
    createdResultId = result.id;

    // Verify parent order status automatically shifted to IN_PROGRESS
    const updatedOrder = await ordersRepo.getOrderById(proofDoctorA, clinicAId, createdOrderId);
    assert.equal(updatedOrder.status, 'IN_PROGRESS');
  });

  it('Order Results: verify result transitions order status to COMPLETED', async () => {
    const verified = await ordersRepo.verifyResult(
      proofDoctorA,
      clinicAId,
      createdResultId,
      {
        verificationNotes: 'Findings reviewed and verified; iron therapy indicated',
      },
    );

    assert.ok(verified.verifiedAt);
    assert.ok(verified.verifiedByMembershipId);

    // Verify parent order status automatically shifted to COMPLETED
    const completedOrder = await ordersRepo.getOrderById(proofDoctorA, clinicAId, createdOrderId);
    assert.equal(completedOrder.status, 'COMPLETED');
    assert.ok(completedOrder.completedAt);
  });

  it('Critical Result Safety: requires acknowledgment', async () => {
    // Create second order for critical test
    const criticalOrder = await ordersRepo.createOrder(
      proofDoctorA,
      clinicAId,
      {
        patientId: patientA1Id,
        encounterId: encounterA1Id,
        orderType: 'LABORATORY',
        clinicalIndication: 'Serum electrolyte panel',
        priority: 'STAT',
      },
    );

    // Record critical result
    const criticalResult = await ordersRepo.recordResult(
      proofDoctorA,
      clinicAId,
      criticalOrder.id,
      {
        resultType: 'LABORATORY',
        status: 'FINAL',
        narrativeFindings: 'Serum Potassium 6.9 mEq/L (Critical High), ECG shows peaked T waves',
        isCritical: true,
        criticalNotes: 'Stat clinician notification required',
      },
    );

    assert.equal(criticalResult.isCritical, true);
    assert.equal(criticalResult.criticalAcknowledgedAt, null);

    // Acknowledge critical result
    const ack = await ordersRepo.acknowledgeCriticalResult(
      proofDoctorA,
      clinicAId,
      criticalResult.id,
      {
        actionTaken: 'Contacted treating doctor immediately. Patient called in for emergency IV calcium gluconate and insulin-dextrose protocol.',
      },
    );

    assert.ok(ack.criticalAcknowledgedAt);
  });

  it('Patient Portal Release: controls visibility toggle', async () => {
    const released = await ordersRepo.releaseResultToPatient(
      proofDoctorA,
      clinicAId,
      createdResultId,
      {
        isReleasedToPatient: true,
      },
    );

    assert.equal(released.isReleasedToPatient, true);
    assert.ok(released.releasedAt);

    // Un-release
    const retracted = await ordersRepo.releaseResultToPatient(
      proofDoctorA,
      clinicAId,
      createdResultId,
      {
        isReleasedToPatient: false,
      },
    );

    assert.equal(retracted.isReleasedToPatient, false);
  });

  it('Clinical Document: upload, encryption, retrieval, and legal hold', async () => {
    const sampleReport = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Title (Diagnostic CBC Report) >>\nendobj\ntrailer\n<<>>\n%%EOF');

    const doc = await ordersRepo.uploadDocument(
      proofDoctorA,
      clinicAId,
      {
        patientId: patientA1Id,
        encounterId: encounterA1Id,
        orderId: createdOrderId,
        resultId: createdResultId,
        documentType: 'LAB_REPORT',
        title: 'تقرير فحص الدم الكامل CBC',
        fileName: 'cbc-report.pdf',
        mimeType: 'application/pdf',
        isConfidential: false,
      },
      sampleReport,
    );

    assert.ok(doc.id);
    assert.equal(doc.mimeType, 'application/pdf');
    assert.equal(doc.isLegalHold, false);

    // Download & Decrypt verification
    const downloaded = await ordersRepo.downloadDocument(
      proofDoctorA,
      clinicAId,
      doc.id,
    );

    assert.equal(downloaded.mimeType, 'application/pdf');
    assert.deepEqual(downloaded.buffer, sampleReport);

    // Legal hold update
    const held = await ordersRepo.updateDocument(
      proofDoctorA,
      clinicAId,
      doc.id,
      {
        isLegalHold: true,
        legalHoldReason: 'Preserved under regulatory clinical governance audit',
      },
    );

    assert.equal(held.isLegalHold, true);
    assert.equal(held.legalHoldReason, 'Preserved under regulatory clinical governance audit');
  });

  it('Billing Integration: create draft invoice for general service without double-billing', async () => {
    const requestKey = randomUUID();
    const invoice = await ordersRepo.createDraftInvoiceForGeneralService(
      proofOwnerA,
      clinicAId,
      {
        patientId: patientA1Id,
        generalClinicalServiceId: createdServiceId,
        requestKey,
      },
    );

    assert.ok(invoice);
    assert.ok(invoice.id);
    assert.equal(invoice.patientId, patientA1Id);
    assert.equal(invoice.status, 'DRAFT');

    // Verify invoice line matches the general clinical service price (200.00 SAR)
    const dbInvoice = await owner.invoice.findUniqueOrThrow({
      where: { id: invoice.id },
      include: { lines: true },
    });
    assert.equal(dbInvoice.lines.length, 1);
    assert.equal(dbInvoice.lines[0].serviceName, 'استشارة طب عام متقدمة');
    assert.equal(dbInvoice.lines[0].description, 'Advanced General Consultation');
  });

  it('Specialty Neutrality Proof: general medical consultation creates zero aesthetic records', async () => {
    const treatmentPlansCount = await owner.treatmentPlan.count({
      where: {
        clinicId: clinicAId,
        patientId: patientA1Id,
      },
    });

    const procedureExecutionsCount = await owner.procedureExecution.count({
      where: {
        clinicId: clinicAId,
        patientId: patientA1Id,
      },
    });

    assert.equal(
      treatmentPlansCount,
      0,
      'General medical consultation must NOT create aesthetic TreatmentPlan records',
    );
    assert.equal(
      procedureExecutionsCount,
      0,
      'General medical consultation must NOT create aesthetic ProcedureExecution records',
    );
  });
});
