import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { BranchRepository } from '../src/prisma/branch.repository.js';
import { VerifiedSessions } from '../src/prisma/verified-sessions.js';
import { IdentityDatabase } from '../src/prisma/identity.database.js';
import { authorizationHash } from '../src/auth/crypto.js';
import { testUrls, fixtureDatabase } from './database-fixtures.js';

describe('Multi-Branch Organization & Management Integration Tests', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  let pool: pg.Pool;
  let branchRepo: BranchRepository;
  let verifiedSessions: VerifiedSessions;
  let identity: IdentityDatabase;

  const suffix = randomUUID().slice(0, 8);
  let clinicAId: string;
  let clinicBId: string;
  let userOwnerAId: string;
  let userDoctorAId: string;
  let userAdminAId: string;
  let userOwnerBId: string;
  let membershipDoctorAId: string;
  let sessionOwnerAId: string;
  let sessionDoctorAId: string;
  let sessionAdminAId: string;
  let mainBranchAId: string;
  let mainBranchBId: string;
  let doctorResourceId: string;
  let patientAId: string;
  let serviceAId: string;
  let productAId: string;
  let locMainAId: string;

  before(async () => {
    const urls = testUrls();
    process.env.DATABASE_URL = urls.runtime;
    process.env.NODE_ENV = 'test';
    owner = fixtureDatabase();
    pool = new pg.Pool({ connectionString: urls.runtime, max: 5 });

    const { AppModule } = await import('../src/app.module.js');
    const moduleRef = await NestFactory.createApplicationContext(AppModule, { logger: false });
    app = moduleRef as any;
    branchRepo = moduleRef.get(BranchRepository);
    verifiedSessions = moduleRef.get(VerifiedSessions);
    identity = moduleRef.get(IdentityDatabase);

    // Create Clinic A
    const clinicA = await owner.clinic.create({
      data: {
        legalName: `عيادة الفروع أ ${suffix}`,
        displayName: `عيادة الفروع أ ${suffix}`,
        slug: `branch-a-${suffix}`,
        currency: 'YER',
        timezone: 'Asia/Aden',
        status: 'ACTIVE',
      },
    });
    clinicAId = clinicA.id;

    // Create Clinic B
    const clinicB = await owner.clinic.create({
      data: {
        legalName: `عيادة الفروع ب ${suffix}`,
        displayName: `عيادة الفروع ب ${suffix}`,
        slug: `branch-b-${suffix}`,
        currency: 'SAR',
        timezone: 'Asia/Riyadh',
        status: 'ACTIVE',
      },
    });
    clinicBId = clinicB.id;

    // Find auto-provisioned MAIN branches
    const branchA = await owner.clinicBranch.findUniqueOrThrow({
      where: { clinicId_code: { clinicId: clinicAId, code: 'MAIN' } },
    });
    mainBranchAId = branchA.id;

    const branchB = await owner.clinicBranch.findUniqueOrThrow({
      where: { clinicId_code: { clinicId: clinicBId, code: 'MAIN' } },
    });
    mainBranchBId = branchB.id;

    // Users and Memberships
    const userOwnerA = await owner.user.create({
      data: { name: 'مالك العيادة أ', email: `owner-a-${suffix}@example.invalid`, status: 'ACTIVE' },
    });
    userOwnerAId = userOwnerA.id;
    await owner.clinicMembership.create({
      data: { clinicId: clinicAId, userId: userOwnerAId, role: 'CLINIC_OWNER', status: 'ACTIVE' },
    });

    const userAdminA = await owner.user.create({
      data: { name: 'مدير العيادة أ', email: `admin-a-${suffix}@example.invalid`, status: 'ACTIVE' },
    });
    userAdminAId = userAdminA.id;
    await owner.clinicMembership.create({
      data: { clinicId: clinicAId, userId: userAdminAId, role: 'CLINIC_ADMIN', status: 'ACTIVE' },
    });

    const userDoctorA = await owner.user.create({
      data: { name: 'طبيب العيادة أ', email: `doctor-a-${suffix}@example.invalid`, status: 'ACTIVE' },
    });
    userDoctorAId = userDoctorA.id;
    const memDoctorA = await owner.clinicMembership.create({
      data: { clinicId: clinicAId, userId: userDoctorAId, role: 'DOCTOR', status: 'ACTIVE' },
    });
    membershipDoctorAId = memDoctorA.id;

    const userOwnerB = await owner.user.create({
      data: { name: 'مالك العيادة ب', email: `owner-b-${suffix}@example.invalid`, status: 'ACTIVE' },
    });
    userOwnerBId = userOwnerB.id;
    await owner.clinicMembership.create({
      data: { clinicId: clinicBId, userId: userOwnerBId, role: 'CLINIC_OWNER', status: 'ACTIVE' },
    });

    // Create staff sessions with valid cryptographic authorization hashes
    const dummyHash = '0'.repeat(64);
    const expiresAt = new Date(Date.now() + 3600000);

    const uOwnerA = await identity.userById(userOwnerAId);
    assert.ok(uOwnerA);
    const sOwnerA = await owner.session.create({
      data: {
        userId: userOwnerAId,
        selectedClinicId: clinicAId,
        selectedBranchId: mainBranchAId,
        tokenHash: `token-owner-a-${suffix}`.padEnd(64, '0'),
        csrfHash: dummyHash,
        authorizationHash: authorizationHash(uOwnerA),
        expiresAt,
      },
    });
    sessionOwnerAId = sOwnerA.id;

    const uAdminA = await identity.userById(userAdminAId);
    assert.ok(uAdminA);
    const sAdminA = await owner.session.create({
      data: {
        userId: userAdminAId,
        selectedClinicId: clinicAId,
        selectedBranchId: mainBranchAId,
        tokenHash: `token-admin-a-${suffix}`.padEnd(64, '0'),
        csrfHash: dummyHash,
        authorizationHash: authorizationHash(uAdminA),
        expiresAt,
      },
    });
    sessionAdminAId = sAdminA.id;

    const uDoctorA = await identity.userById(userDoctorAId);
    assert.ok(uDoctorA);
    const sDoctorA = await owner.session.create({
      data: {
        userId: userDoctorAId,
        selectedClinicId: clinicAId,
        selectedBranchId: mainBranchAId,
        tokenHash: `token-doctor-a-${suffix}`.padEnd(64, '0'),
        csrfHash: dummyHash,
        authorizationHash: authorizationHash(uDoctorA),
        expiresAt,
      },
    });
    sessionDoctorAId = sDoctorA.id;

    // Doctor resource & patient & service
    const docResource = await owner.bookableResource.create({
      data: {
        clinicId: clinicAId,
        branchId: mainBranchAId,
        kind: 'DOCTOR',
        label: 'عيادة الدكتورة ليلى',
        doctorMembershipId: membershipDoctorAId,
      },
    });
    doctorResourceId = docResource.id;

    const patA = await owner.patient.create({
      data: {
        clinicId: clinicAId,
        fullName: 'المريضة سارة أحمد',
        searchName: 'المريضة سارة أحمد',
        phone: '+967771234567',
        patientNumber: 'P-990001',
        dateOfBirth: new Date('1995-05-15'),
      },
    });
    patientAId = patA.id;

    const srvA = await owner.clinicService.create({
      data: { clinicId: clinicAId, name: 'جلسة فراكشنال ليزر', durationMinutes: 30 },
    });
    serviceAId = srvA.id;

    // Product & Location in Clinic A
    const locA = await owner.inventoryLocation.create({
      data: {
        clinicId: clinicAId,
        branchId: mainBranchAId,
        code: 'MAIN',
        nameAr: 'المستودع الرئيسي',
        type: 'MAIN_STORE',
      },
    });
    locMainAId = locA.id;

    const prodA = await owner.inventoryProduct.create({
      data: {
        clinicId: clinicAId,
        sku: `SKU-BTLX-${suffix}`,
        nameAr: 'بوتوكس 100 وحدة',
        unit: 'VIAL',
        category: 'INJECTABLE',
        requiresBatchTracking: false,
      },
    });
    productAId = prodA.id;

    // Initial stock balance: 50 vials at locMainA
    await owner.inventoryBalance.create({
      data: {
        clinicId: clinicAId,
        productId: productAId,
        locationId: locMainAId,
        onHandQuantity: 50,
      },
    });
  });

  after(async () => {
    try {
      await owner.$executeRawUnsafe('ALTER TABLE public."InventoryStockMovement" DISABLE TRIGGER inventory_movement_immutability_guard').catch(() => {});
      await owner.$executeRawUnsafe('ALTER TABLE public."InventoryBalance" DISABLE TRIGGER inventory_balance_integrity_guard').catch(() => {});

      await owner.interBranchTransfer.deleteMany({ where: { clinicId: { in: [clinicAId, clinicBId] } } });
      await owner.branchMembership.deleteMany({ where: { clinicId: { in: [clinicAId, clinicBId] } } });
      await owner.appointment.deleteMany({ where: { clinicId: { in: [clinicAId, clinicBId] } } });
      await owner.bookableResource.deleteMany({ where: { clinicId: { in: [clinicAId, clinicBId] } } });
      await owner.clinicService.deleteMany({ where: { clinicId: { in: [clinicAId, clinicBId] } } });
      await owner.inventoryStockMovement.deleteMany({ where: { clinicId: { in: [clinicAId, clinicBId] } } }).catch(() => {});
      await owner.inventoryBalance.deleteMany({ where: { clinicId: { in: [clinicAId, clinicBId] } } }).catch(() => {});
      await owner.inventoryLocation.deleteMany({ where: { clinicId: { in: [clinicAId, clinicBId] } } }).catch(() => {});
      await owner.inventoryProduct.deleteMany({ where: { clinicId: { in: [clinicAId, clinicBId] } } }).catch(() => {});
      await owner.session.deleteMany({ where: { selectedClinicId: { in: [clinicAId, clinicBId] } } });
      await owner.clinicBranch.deleteMany({ where: { clinicId: { in: [clinicAId, clinicBId] } } });
      await owner.patient.deleteMany({ where: { clinicId: { in: [clinicAId, clinicBId] } } });
      await owner.clinicMembership.deleteMany({ where: { clinicId: { in: [clinicAId, clinicBId] } } });
      await owner.clinic.deleteMany({ where: { id: { in: [clinicAId, clinicBId] } } });
      await owner.user.deleteMany({ where: { id: { in: [userOwnerAId, userAdminAId, userDoctorAId, userOwnerBId] } } });
    } finally {
      await owner.$executeRawUnsafe('ALTER TABLE public."InventoryStockMovement" ENABLE TRIGGER inventory_movement_immutability_guard').catch(() => {});
      await owner.$executeRawUnsafe('ALTER TABLE public."InventoryBalance" ENABLE TRIGGER inventory_balance_integrity_guard').catch(() => {});
      if (app) await app.close();
      await pool.end();
      await owner.$disconnect();
    }
  });

  it('Branch Creation: clinic owner creates second branch with unique code per clinic', async () => {
    const proofOwnerA = verifiedSessions.issue(userOwnerAId, sessionOwnerAId);

    const northBranch = await branchRepo.createBranch(proofOwnerA, clinicAId, {
      code: 'north',
      nameAr: 'فرع الشمال - صنعاء',
      nameEn: 'North Sanaa Branch',
      phone: '+96777112233',
      timezone: 'Asia/Aden',
      operatingHours: { sunday: { open: '09:00', close: '21:00' } },
    });

    assert.equal(northBranch.code, 'NORTH');
    assert.equal(northBranch.nameAr, 'فرع الشمال - صنعاء');
    assert.equal(northBranch.status, 'ACTIVE');

    // Duplicate code in Clinic A fails closed
    await assert.rejects(
      () =>
        branchRepo.createBranch(proofOwnerA, clinicAId, {
          code: 'NORTH',
          nameAr: 'فرع مكرر',
        }),
      /BRANCH_CODE_ALREADY_EXISTS/,
    );

    // Same code 'NORTH' in Clinic B is allowed (per-tenant uniqueness)
    const memOwnerB = await owner.clinicMembership.findFirstOrThrow({
      where: { clinicId: clinicBId, role: 'CLINIC_OWNER' },
    });
    assert.ok(memOwnerB.id);
    const uOwnerB = await identity.userById(userOwnerBId);
    assert.ok(uOwnerB);
    const sOwnerB = await owner.session.create({
      data: {
        userId: userOwnerBId,
        selectedClinicId: clinicBId,
        tokenHash: `token-owner-b-${suffix}`.padEnd(64, '0'),
        csrfHash: '0'.repeat(64),
        authorizationHash: authorizationHash(uOwnerB),
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
    const proofOwnerB = verifiedSessions.issue(userOwnerBId, sOwnerB.id);

    const bBranchNorth = await branchRepo.createBranch(proofOwnerB, clinicBId, {
      code: 'NORTH',
      nameAr: 'فرع الرياض الشمالي',
    });
    assert.equal(bBranchNorth.code, 'NORTH');
    assert.notEqual(bBranchNorth.id, northBranch.id);
  });

  it('Branch Staff Assignment & Primary Designation', async () => {
    const proofOwnerA = verifiedSessions.issue(userOwnerAId, sessionOwnerAId);
    const northBranch = await owner.clinicBranch.findUniqueOrThrow({
      where: { clinicId_code: { clinicId: clinicAId, code: 'NORTH' } },
    });

    // Assign doctor to Main branch as primary
    await branchRepo.assignStaff(proofOwnerA, clinicAId, mainBranchAId, {
      membershipId: membershipDoctorAId,
      isPrimary: true,
    });

    // Assign doctor to North branch as non-primary
    const assignment = await branchRepo.assignStaff(proofOwnerA, clinicAId, northBranch.id, {
      membershipId: membershipDoctorAId,
      isPrimary: false,
    });
    assert.equal(assignment.branchId, northBranch.id);
    assert.equal(assignment.isPrimary, false);

    // List branch staff
    const staffList = await branchRepo.listBranchStaff(proofOwnerA, clinicAId, northBranch.id);
    assert.ok(staffList.items.some((s) => s.membershipId === membershipDoctorAId));

    // Set as primary branch
    await branchRepo.setPrimaryBranch(proofOwnerA, clinicAId, northBranch.id, membershipDoctorAId);
    const updatedStaff = await branchRepo.listBranchStaff(proofOwnerA, clinicAId, northBranch.id);
    const docAssignment = updatedStaff.items.find((s) => s.membershipId === membershipDoctorAId);
    assert.equal(docAssignment?.isPrimary, true);

    // Verify main branch is no longer primary
    const mainStaff = await branchRepo.listBranchStaff(proofOwnerA, clinicAId, mainBranchAId);
    const mainDocAssignment = mainStaff.items.find((s) => s.membershipId === membershipDoctorAId);
    assert.equal(mainDocAssignment?.isPrimary, false);
  });

  it('Branch Switching Validation: staff can only switch to assigned branches; admin can switch freely', async () => {
    const proofDoctorA = verifiedSessions.issue(userDoctorAId, sessionDoctorAId);
    const proofAdminA = verifiedSessions.issue(userAdminAId, sessionAdminAId);
    const northBranch = await owner.clinicBranch.findUniqueOrThrow({
      where: { clinicId_code: { clinicId: clinicAId, code: 'NORTH' } },
    });

    // Doctor can switch to North branch (since assigned)
    const docSwitch = await branchRepo.validateBranchSwitch(proofDoctorA, clinicAId, northBranch.id);
    assert.equal(docSwitch.success, true);
    assert.equal(docSwitch.selectedBranchId, northBranch.id);

    // Create South branch without assigning doctor
    const proofOwnerA = verifiedSessions.issue(userOwnerAId, sessionOwnerAId);
    const southBranch = await branchRepo.createBranch(proofOwnerA, clinicAId, {
      code: 'SOUTH',
      nameAr: 'فرع الجنوب',
    });

    // Remove doctor from South branch if any
    await owner.branchMembership.deleteMany({
      where: { clinicId: clinicAId, branchId: southBranch.id, membershipId: membershipDoctorAId },
    });

    // Doctor switching to South branch is denied (403 Forbidden)
    await assert.rejects(
      () => branchRepo.validateBranchSwitch(proofDoctorA, clinicAId, southBranch.id),
      /NOT_ASSIGNED_TO_BRANCH/,
    );

    // Admin can switch to South branch freely
    const adminSwitch = await branchRepo.validateBranchSwitch(proofAdminA, clinicAId, southBranch.id);
    assert.equal(adminSwitch.success, true);
    assert.equal(adminSwitch.selectedBranchId, southBranch.id);
  });

  it('Cross-Branch Scheduling Conflict Prevention: doctor cannot be double booked across branches', async () => {
    const northBranch = await owner.clinicBranch.findUniqueOrThrow({
      where: { clinicId_code: { clinicId: clinicAId, code: 'NORTH' } },
    });

    const startAt = new Date('2026-11-20T10:00:00Z');
    const endAt = new Date('2026-11-20T10:30:00Z');

    // Appointment at MAIN branch
    await owner.appointment.create({
      data: {
        clinicId: clinicAId,
        branchId: mainBranchAId,
        patientId: patientAId,
        serviceId: serviceAId,
        doctorResourceId,
        bookingKey: randomUUID(),
        requestHash: '1'.repeat(64),
        startAt,
        endAt,
        status: 'SCHEDULED',
      },
    });

    // Attempting overlapping appointment for the same doctor at NORTH branch fails via GiST exclusion
    const overlappingStart = new Date('2026-11-20T10:15:00Z');
    const overlappingEnd = new Date('2026-11-20T10:45:00Z');

    await assert.rejects(
      () =>
        owner.appointment.create({
          data: {
            clinicId: clinicAId,
            branchId: northBranch.id,
            patientId: patientAId,
            serviceId: serviceAId,
            doctorResourceId,
            bookingKey: randomUUID(),
            requestHash: '2'.repeat(64),
            startAt: overlappingStart,
            endAt: overlappingEnd,
            status: 'SCHEDULED',
          },
        }),
      (err: any) => {
        // Must fail with PostgreSQL exclusion constraint violation (code 23P01)
        return err.code === '23P01' || err.message?.includes('exclusion') || err.message?.includes('Appointment');
      },
    );
  });

  it('Inter-Branch Stock Transfer: dispatch deducts stock, receipt credits stock, no negative balances', async () => {
    const proofOwnerA = verifiedSessions.issue(userOwnerAId, sessionOwnerAId);
    const northBranch = await owner.clinicBranch.findUniqueOrThrow({
      where: { clinicId_code: { clinicId: clinicAId, code: 'NORTH' } },
    });

    // Create a warehouse location in North branch
    const locNorth = await owner.inventoryLocation.create({
      data: {
        clinicId: clinicAId,
        branchId: northBranch.id,
        code: `STORE-NORTH-${suffix}`,
        nameAr: 'مستودع فرع الشمال',
        type: 'MAIN_STORE',
      },
    });

    // Dispatch 20 vials from Main branch to North branch
    const transfer = await branchRepo.dispatchTransfer(proofOwnerA, clinicAId, {
      sourceBranchId: mainBranchAId,
      destinationBranchId: northBranch.id,
      sourceLocationId: locMainAId,
      destinationLocationId: locNorth.id,
      productId: productAId,
      quantity: 20,
      notes: 'إمداد أولي لفرع الشمال',
    });

    assert.equal(transfer.status, 'DISPATCHED');
    assert.equal(transfer.quantity, '20');

    // Verify source balance decremented to 30
    const srcBal = await owner.inventoryBalance.findUniqueOrThrow({
      where: { clinicId_productId_locationId: { clinicId: clinicAId, productId: productAId, locationId: locMainAId } },
    });
    assert.equal(Number(srcBal.onHandQuantity), 30);

    // Destination balance should not be credited yet (in-transit)
    const dstBalPre = await owner.inventoryBalance.findUnique({
      where: { clinicId_productId_locationId: { clinicId: clinicAId, productId: productAId, locationId: locNorth.id } },
    });
    assert.equal(dstBalPre ? Number(dstBalPre.onHandQuantity) : 0, 0);

    // Confirm receipt at North branch
    const received = await branchRepo.receiveTransfer(proofOwnerA, clinicAId, transfer.id, {
      expectedVersion: transfer.version,
      notes: 'تم فحص الشحنة واستلامها بالكامل',
    });
    assert.equal(received.status, 'RECEIVED');

    // Verify destination balance credited to 20
    const dstBalPost = await owner.inventoryBalance.findUniqueOrThrow({
      where: { clinicId_productId_locationId: { clinicId: clinicAId, productId: productAId, locationId: locNorth.id } },
    });
    assert.equal(Number(dstBalPost.onHandQuantity), 20);

    // Attempting to dispatch more stock than available fails closed
    await assert.rejects(
      () =>
        branchRepo.dispatchTransfer(proofOwnerA, clinicAId, {
          sourceBranchId: mainBranchAId,
          destinationBranchId: northBranch.id,
          sourceLocationId: locMainAId,
          destinationLocationId: locNorth.id,
          productId: productAId,
          quantity: 100, // exceeds remaining 30
        }),
      /INSUFFICIENT_STOCK/,
    );
  });

  it('Cross-Clinic Inter-Branch Isolation: cross-clinic transfers are strictly blocked', async () => {
    const proofOwnerA = verifiedSessions.issue(userOwnerAId, sessionOwnerAId);

    // Location in Clinic B
    const locB = await owner.inventoryLocation.create({
      data: {
        clinicId: clinicBId,
        branchId: mainBranchBId,
        code: `MAIN-B-${suffix}`,
        nameAr: 'مستودع العيادة ب',
        type: 'MAIN_STORE',
      },
    });

    // Attempting transfer from Clinic A to Clinic B fails
    await assert.rejects(
      () =>
        branchRepo.dispatchTransfer(proofOwnerA, clinicAId, {
          sourceBranchId: mainBranchAId,
          destinationBranchId: mainBranchBId,
          sourceLocationId: locMainAId,
          destinationLocationId: locB.id,
          productId: productAId,
          quantity: 5,
        }),
      /DESTINATION_BRANCH_NOT_FOUND_OR_INACTIVE/,
    );
  });

  it('FORCE RLS Database Isolation: restricted runtime role cannot cross clinic tenant boundaries', async () => {
    const client = await pool.connect();
    try {
      // Set Clinic A context
      await client.query('BEGIN');
      await client.query(`
        SELECT set_config('lamssa.clinic_id', $1, true),
               set_config('lamssa.user_id', $2, true),
               set_config('lamssa.session_id', $3, true)
      `, [clinicAId, userOwnerAId, sessionOwnerAId]);

      // Query ClinicBranches under Clinic A
      const resA = await client.query('SELECT id, "clinicId", code FROM "ClinicBranch"');
      assert.ok(resA.rows.length >= 2);
      assert.ok(resA.rows.every((r) => r.clinicId === clinicAId));

      // Cannot see Clinic B branches
      const resB = await client.query('SELECT id FROM "ClinicBranch" WHERE "clinicId" = $1', [clinicBId]);
      assert.equal(resB.rows.length, 0, 'RLS must deny Clinic B branch visibility to Clinic A session');

      // Inter-branch transfers cannot be viewed cross-clinic
      const resTransfers = await client.query('SELECT id, "clinicId" FROM "InterBranchTransfer"');
      assert.ok(resTransfers.rows.every((r) => r.clinicId === clinicAId));

      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  });
});
