import 'reflect-metadata';
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { PrismaClient, Prisma } from '../src/generated/prisma/client.js';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { CostingRepository } from '../src/prisma/costing.repository.js';
import { InventoryRepository } from '../src/prisma/inventory.repository.js';
import { BranchRepository } from '../src/prisma/branch.repository.js';
import { VerifiedSessions } from '../src/prisma/verified-sessions.js';
import { IdentityDatabase } from '../src/prisma/identity.database.js';
import { TenantDatabaseService } from '../src/prisma/tenant-database.service.js';
import { authorizationHash } from '../src/auth/crypto.js';
import { testUrls, fixtureDatabase } from './database-fixtures.js';

describe('Advanced Inventory Costing, FIFO Valuation & Accounting Integration Tests', { concurrency: 1 }, () => {
  let app: INestApplication;
  let owner: PrismaClient;
  let pool: pg.Pool;
  let costingRepo: CostingRepository;
  let inventoryRepo: InventoryRepository;
  let branchRepo: BranchRepository;
  let verifiedSessions: VerifiedSessions;
  let identity: IdentityDatabase;
  let tenantDb: TenantDatabaseService;

  const suffix = randomUUID().slice(0, 8);
  let clinicAId: string;
  let clinicBId: string;
  let branchA1Id: string;
  let branchA2Id: string;
  let branchB1Id: string;
  let locA1Id: string;
  let locA2Id: string;

  let userOwnerAId: string;
  let userAdminAId: string;
  let userAccountantAId: string;
  let userDoctorAId: string;
  let userOwnerBId: string;

  let sessionOwnerAId: string;
  let sessionAdminAId: string;
  let sessionAccountantAId: string;

  let supplierAId: string;
  let productAId: string;
  let productBId: string;
  let productCId: string;

  before(async () => {
    const urls = testUrls();
    process.env.DATABASE_URL = urls.runtime;
    process.env.NODE_ENV = 'test';
    owner = fixtureDatabase();
    pool = new pg.Pool({ connectionString: urls.runtime, max: 5 });

    const { AppModule } = await import('../src/app.module.js');
    const moduleRef = await NestFactory.createApplicationContext(AppModule, { logger: false });
    app = moduleRef as any;
    costingRepo = moduleRef.get(CostingRepository);
    inventoryRepo = moduleRef.get(InventoryRepository);
    branchRepo = moduleRef.get(BranchRepository);
    verifiedSessions = moduleRef.get(VerifiedSessions);
    identity = moduleRef.get(IdentityDatabase);
    tenantDb = moduleRef.get(TenantDatabaseService);

    // Create Clinic A
    const clinicA = await owner.clinic.create({
      data: {
        legalName: `عيادة التكاليف أ ${suffix}`,
        displayName: `عيادة التكاليف أ ${suffix}`,
        slug: `costing-a-${suffix}`,
        currency: 'SAR',
        timezone: 'Asia/Riyadh',
        status: 'ACTIVE',
      },
    });
    clinicAId = clinicA.id;

    // Create Clinic B
    const clinicB = await owner.clinic.create({
      data: {
        legalName: `عيادة التكاليف ب ${suffix}`,
        displayName: `عيادة التكاليف ب ${suffix}`,
        slug: `costing-b-${suffix}`,
        currency: 'SAR',
        timezone: 'Asia/Riyadh',
        status: 'ACTIVE',
      },
    });
    clinicBId = clinicB.id;

    // Auto-provisioned MAIN branches
    const branchA1 = await owner.clinicBranch.findUniqueOrThrow({
      where: { clinicId_code: { clinicId: clinicAId, code: 'MAIN' } },
    });
    branchA1Id = branchA1.id;

    const branchB1 = await owner.clinicBranch.findUniqueOrThrow({
      where: { clinicId_code: { clinicId: clinicBId, code: 'MAIN' } },
    });
    branchB1Id = branchB1.id;

    // Create Second Branch for Clinic A
    const branchA2 = await owner.clinicBranch.create({
      data: {
        clinicId: clinicAId,
        code: 'NORTH',
        nameAr: 'فرع الشمال',
        nameEn: 'North Branch',
        timezone: 'Asia/Riyadh',
        status: 'ACTIVE',
      },
    });
    branchA2Id = branchA2.id;

    // Users and Memberships for Clinic A
    const uOwnerA = await owner.user.create({
      data: { name: 'مالك تكاليف أ', email: `owner-cost-a-${suffix}@example.invalid`, status: 'ACTIVE' },
    });
    userOwnerAId = uOwnerA.id;
    await owner.clinicMembership.create({
      data: { clinicId: clinicAId, userId: userOwnerAId, role: 'CLINIC_OWNER', status: 'ACTIVE' },
    });

    const uAdminA = await owner.user.create({
      data: { name: 'مدير تكاليف أ', email: `admin-cost-a-${suffix}@example.invalid`, status: 'ACTIVE' },
    });
    userAdminAId = uAdminA.id;
    await owner.clinicMembership.create({
      data: { clinicId: clinicAId, userId: userAdminAId, role: 'CLINIC_ADMIN', status: 'ACTIVE' },
    });

    const uAcctA = await owner.user.create({
      data: { name: 'محاسب أ', email: `acct-cost-a-${suffix}@example.invalid`, status: 'ACTIVE' },
    });
    userAccountantAId = uAcctA.id;
    await owner.clinicMembership.create({
      data: { clinicId: clinicAId, userId: userAccountantAId, role: 'ACCOUNTANT', status: 'ACTIVE' },
    });

    const uDocA = await owner.user.create({
      data: { name: 'طبيب أ', email: `doc-cost-a-${suffix}@example.invalid`, status: 'ACTIVE' },
    });
    userDoctorAId = uDocA.id;
    await owner.clinicMembership.create({
      data: { clinicId: clinicAId, userId: userDoctorAId, role: 'DOCTOR', status: 'ACTIVE' },
    });

    // Users for Clinic B
    const uOwnerB = await owner.user.create({
      data: { name: 'مالك تكاليف ب', email: `owner-cost-b-${suffix}@example.invalid`, status: 'ACTIVE' },
    });
    userOwnerBId = uOwnerB.id;
    await owner.clinicMembership.create({
      data: { clinicId: clinicBId, userId: userOwnerBId, role: 'CLINIC_OWNER', status: 'ACTIVE' },
    });

    // Sessions
    const dummyHash = '0'.repeat(64);
    const expiresAt = new Date(Date.now() + 3600000);

    const authOwnerA = await identity.userById(userOwnerAId);
    assert.ok(authOwnerA);
    const sOwnerA = await owner.session.create({
      data: {
        userId: userOwnerAId,
        selectedClinicId: clinicAId,
        selectedBranchId: branchA1Id,
        tokenHash: `token-cost-owner-a-${suffix}`.padEnd(64, '0'),
        csrfHash: dummyHash,
        authorizationHash: authorizationHash(authOwnerA),
        expiresAt,
      },
    });
    sessionOwnerAId = sOwnerA.id;

    const authAdminA = await identity.userById(userAdminAId);
    assert.ok(authAdminA);
    const sAdminA = await owner.session.create({
      data: {
        userId: userAdminAId,
        selectedClinicId: clinicAId,
        selectedBranchId: branchA1Id,
        tokenHash: `token-cost-admin-a-${suffix}`.padEnd(64, '0'),
        csrfHash: dummyHash,
        authorizationHash: authorizationHash(authAdminA),
        expiresAt,
      },
    });
    sessionAdminAId = sAdminA.id;

    const authAcctA = await identity.userById(userAccountantAId);
    assert.ok(authAcctA);
    const sAcctA = await owner.session.create({
      data: {
        userId: userAccountantAId,
        selectedClinicId: clinicAId,
        selectedBranchId: branchA1Id,
        tokenHash: `token-cost-acct-a-${suffix}`.padEnd(64, '0'),
        csrfHash: dummyHash,
        authorizationHash: authorizationHash(authAcctA),
        expiresAt,
      },
    });
    sessionAccountantAId = sAcctA.id;

    const authDocA = await identity.userById(userDoctorAId);
    assert.ok(authDocA);
    await owner.session.create({
      data: {
        userId: userDoctorAId,
        selectedClinicId: clinicAId,
        selectedBranchId: branchA1Id,
        tokenHash: `token-cost-doc-a-${suffix}`.padEnd(64, '0'),
        csrfHash: dummyHash,
        authorizationHash: authorizationHash(authDocA),
        expiresAt,
      },
    });

    const authOwnerB = await identity.userById(userOwnerBId);
    assert.ok(authOwnerB);
    await owner.session.create({
      data: {
        userId: userOwnerBId,
        selectedClinicId: clinicBId,
        selectedBranchId: branchB1Id,
        tokenHash: `token-cost-owner-b-${suffix}`.padEnd(64, '0'),
        csrfHash: dummyHash,
        authorizationHash: authorizationHash(authOwnerB),
        expiresAt,
      },
    });

    // Inventory Locations
    const locA1 = await owner.inventoryLocation.create({
      data: {
        clinicId: clinicAId,
        branchId: branchA1Id,
        code: 'MAIN-A1',
        nameAr: 'مستودع أ1 الرئيسي',
        type: 'MAIN_STORE',
      },
    });
    locA1Id = locA1.id;

    const locA2 = await owner.inventoryLocation.create({
      data: {
        clinicId: clinicAId,
        branchId: branchA2Id,
        code: 'MAIN-A2',
        nameAr: 'مستودع أ2 الفرعي',
        type: 'MAIN_STORE',
      },
    });
    locA2Id = locA2.id;

    // Supplier
    const supA = await owner.inventorySupplier.create({
      data: {
        clinicId: clinicAId,
        code: `SUP-RYD-${suffix}`,
        nameAr: 'مورد الأدوية والمستلزمات الرياض',
        contactPerson: 'أحمد التوريد',
        phone: '+966501112233',
      },
    });
    supplierAId = supA.id;

    // Products
    const prodA = await owner.inventoryProduct.create({
      data: {
        clinicId: clinicAId,
        sku: `SKU-BOTOX-${suffix}`,
        nameAr: 'بوتوكس أليرجان 100 وحدة',
        category: 'INJECTABLE',
        requiresBatchTracking: true,
        unit: 'VIAL',
      },
    });
    productAId = prodA.id;

    const prodB = await owner.inventoryProduct.create({
      data: {
        clinicId: clinicAId,
        sku: `SKU-FILLER-${suffix}`,
        nameAr: 'فيلر جوفيديرم الترا',
        category: 'INJECTABLE',
        requiresBatchTracking: true,
        unit: 'SYRINGE',
      },
    });
    productBId = prodB.id;

    const prodC = await owner.inventoryProduct.create({
      data: {
        clinicId: clinicAId,
        sku: `SKU-NEEDLE-${suffix}`,
        nameAr: 'إبر ميزوثيرابي 30G',
        category: 'CONSUMABLE',
        requiresBatchTracking: false,
        unit: 'PIECE',
      },
    });
    productCId = prodC.id;
  });

  after(async () => {
    if (app) await app.close();
    if (pool) await pool.end();
    if (owner) await owner.$disconnect();
  });

  describe('1. Landed Cost Drafting & Deterministic Minor-Unit Allocation', () => {
    let goodsReceiptId: string;
    let landedCostId: string;

    it('creates purchase order and goods receipt with multiple items', async () => {
      const pOwner = verifiedSessions.issue(userOwnerAId, sessionOwnerAId);

      // Create Purchase Order
      const po = await inventoryRepo.createPurchaseOrder(pOwner, clinicAId, {
        supplierId: supplierAId,
        destinationLocationId: locA1Id,
        currency: 'SAR',
        expectedDeliveryDate: '2026-12-01',
        lines: [
          { productId: productAId, orderedQuantity: '10.0000', unitCost: '200.00' },
          { productId: productBId, orderedQuantity: '20.0000', unitCost: '600.00' },
        ],
      });
      assert.ok(po.id);

      // Approve PO
      await inventoryRepo.approvePurchaseOrder(pOwner, clinicAId, po.id, { expectedVersion: po.version });

      // Receive Goods
      const gr = await inventoryRepo.receiveGoods(pOwner, clinicAId, {
        purchaseOrderId: po.id,
        destinationLocationId: locA1Id,
        deliveryNoteNumber: `DN-${suffix}`,
        lines: [
          {
            purchaseOrderLineId: po.lines[0].id,
            receivedQuantity: '10.0000',
            batchNumber: `LOT-BTX-${suffix}`,
            expirationDate: '2027-11-11',
            disposition: 'ACCEPTED',
          },
          {
            purchaseOrderLineId: po.lines[1].id,
            receivedQuantity: '20.0000',
            batchNumber: `LOT-FLR-${suffix}`,
            expirationDate: '2027-12-31',
            disposition: 'ACCEPTED',
          },
        ],
      });
      assert.ok(gr.id);
      goodsReceiptId = gr.id;

      // Verify basic purchase cost layers were created on receipt
      const layers = await costingRepo.listCostLayers(pOwner, clinicAId, { limit: 10 });
      assert(layers.total >= 2);
    });

    it('drafts a landed cost with freight, customs and discount by value', async () => {
      const pOwner = verifiedSessions.issue(userOwnerAId, sessionOwnerAId);

      // Line 1 Value = 10 * 200 = 2,000 SAR
      // Line 2 Value = 20 * 600 = 12,000 SAR
      // Total Value = 14,000 SAR
      // Charges: freight=1000, customs=400, handling=100, discount=100
      // Net Landed = 1400.00 SAR (140,000 minor units)
      // Line 1 share: floor(140000 * 2/14) = 20000 minor units = 200.00 SAR
      // Line 2 share: 140000 - 20000 = 120000 minor units = 1200.00 SAR
      const drafted = await costingRepo.draftLandedCost(pOwner, clinicAId, {
        goodsReceiptId,
        freightCost: '1000.00',
        customsDuty: '400.00',
        handlingCost: '100.00',
        discountCredit: '100.00',
        allocationMethod: 'BY_VALUE' as any,
        notes: 'شحن جوي مبرد مع تخليص جمركي سريع',
      });

      assert.equal(drafted.status, 'DRAFT');
      assert.equal(drafted.totalLandedCostMinor, 140000n);
      assert.equal(drafted.allocationLines.length, 2);

      landedCostId = drafted.id;
    });

    it('segregation of duties: ACCOUNTANT cannot approve landed cost', async () => {
      const pAcct = verifiedSessions.issue(userAccountantAId, sessionAccountantAId);

      await assert.rejects(
        () => costingRepo.approveLandedCost(pAcct, clinicAId, landedCostId, { expectedVersion: 1 }),
        /Forbidden/
      );
    });

    it('CLINIC_OWNER approves landed cost and updates cost layers with exact landed unit costs', async () => {
      const pOwner = verifiedSessions.issue(userOwnerAId, sessionOwnerAId);

      const approved = await costingRepo.approveLandedCost(pOwner, clinicAId, landedCostId, { expectedVersion: 1 });
      assert.equal(approved.status, 'APPROVED');
      assert.ok(approved.approvedAt);

      // Verify layers for Product A and Product B
      const layerA = await owner.inventoryCostLayer.findFirstOrThrow({
        where: { clinicId: clinicAId, productId: productAId },
      });
      // Original purchase cost: 200.00 (20000 minor), Landed addition: 20.00 (2000 minor) -> 220.00 (22000 minor)
      assert.equal(layerA.unitAcquisitionCostMinor, 20000n);
      assert.equal(layerA.unitLandedCostMinor, 22000n);
      assert.equal(layerA.costStatus, 'VERIFIED');
      assert.equal(layerA.remainingQuantity.toNumber(), 10);

      const layerB = await owner.inventoryCostLayer.findFirstOrThrow({
        where: { clinicId: clinicAId, productId: productBId },
      });
      // Original purchase cost: 600.00 (60000 minor), Landed addition: 60.00 (6000 minor) -> 660.00 (66000 minor)
      assert.equal(layerB.unitAcquisitionCostMinor, 60000n);
      assert.equal(layerB.unitLandedCostMinor, 66000n);
      assert.equal(layerB.costStatus, 'VERIFIED');
      assert.equal(layerB.remainingQuantity.toNumber(), 20);
    });
  });

  describe('2. FIFO Cost Depletion & Clinical Consumption', () => {
    let layer1Id: string;
    let layer2Id: string;

    before(async () => {
      // Create two manual cost layers for Product C to test strict FIFO depletion
      // Layer 1: 10 units @ 10.00 SAR (1000 minor) on 2026-11-01
      const l1 = await owner.inventoryCostLayer.create({
        data: {
          clinicId: clinicAId,
          branchId: branchA1Id,
          locationId: locA1Id,
          productId: productCId,
          layerDate: new Date('2026-11-01T08:00:00.000Z'),
          initialQuantity: new Prisma.Decimal('10.0000'),
          remainingQuantity: new Prisma.Decimal('10.0000'),
          unitAcquisitionCostMinor: 1000n,
          unitLandedCostMinor: 1000n,
          totalRemainingCostMinor: 10000n,
          costStatus: 'VERIFIED',
          sourceProvenance: 'GOODS_RECEIPT',
          currency: 'SAR',
        },
      });
      layer1Id = l1.id;

      // Layer 2: 10 units @ 15.00 SAR (1500 minor) on 2026-11-05
      const l2 = await owner.inventoryCostLayer.create({
        data: {
          clinicId: clinicAId,
          branchId: branchA1Id,
          locationId: locA1Id,
          productId: productCId,
          layerDate: new Date('2026-11-05T08:00:00.000Z'),
          initialQuantity: new Prisma.Decimal('10.0000'),
          remainingQuantity: new Prisma.Decimal('10.0000'),
          unitAcquisitionCostMinor: 1500n,
          unitLandedCostMinor: 1500n,
          totalRemainingCostMinor: 15000n,
          costStatus: 'VERIFIED',
          sourceProvenance: 'GOODS_RECEIPT',
          currency: 'SAR',
        },
      });
      layer2Id = l2.id;
    });

    it('depletes layers strictly in FIFO order across layer boundaries', async () => {
      const pOwner = verifiedSessions.issue(userOwnerAId, sessionOwnerAId);

      // Consume 14 units: 10 units from Layer 1 (@ 1000) + 4 units from Layer 2 (@ 1500)
      // Total cost = 10*1000 + 4*1500 = 10000 + 6000 = 16000 minor units (160.00 SAR)
      await tenantDb.withClinicContext(pOwner, clinicAId, ['inventory.costing.manage'], async (tx) => {
        const result = await costingRepo.allocateFifoConsumption(tx, clinicAId, {
          productId: productCId,
          branchId: branchA1Id,
          quantity: new Prisma.Decimal('14.0000'),
          notes: 'صرف روتيني للعيادة',
        });

        assert.equal(result.totalAllocatedCostMinor, 16000n);
        assert.equal(result.remainingUnallocatedQty?.toNumber(), 0);
        assert.equal(result.movements.length, 2);
      });

      // Layer 1 should be completely exhausted
      const l1After = await owner.inventoryCostLayer.findUniqueOrThrow({ where: { id: layer1Id } });
      assert.equal(l1After.remainingQuantity.toNumber(), 0);
      assert.equal(l1After.costStatus, 'EXHAUSTED');

      // Layer 2 should have 6 units remaining
      const l2After = await owner.inventoryCostLayer.findUniqueOrThrow({ where: { id: layer2Id } });
      assert.equal(l2After.remainingQuantity.toNumber(), 6);
      assert.equal(l2After.costStatus, 'VERIFIED');
    });

    it('returns remainingUnallocatedQty when requesting more than available layers', async () => {
      const pOwner = verifiedSessions.issue(userOwnerAId, sessionOwnerAId);

      // Remaining across Product C layers is 6. Requesting 10 at Branch A1 leaves 4 unallocated.
      await tenantDb.withClinicContext(pOwner, clinicAId, ['inventory.costing.manage'], async (tx) => {
        const result = await costingRepo.allocateFifoConsumption(tx, clinicAId, {
          productId: productCId,
          branchId: branchA1Id,
          quantity: new Prisma.Decimal('10.0000'),
          notes: 'طلب كمية تتجاوز الطبقات المتاحة في الفرع الأول',
        });

        assert.equal(result.remainingUnallocatedQty?.toNumber(), 4);
        assert.equal(result.totalAllocatedCostMinor, 9000n); // 6 units @ 1500
      });
    });
  });

  describe('3. Inter-Branch Transfer Cost Preservation & Restitution', () => {
    let transferId: string;
    let originalUnitCostMinor: bigint;

    it('depletes source branch layers and preserves landed cost during transfer', async () => {
      const pOwner = verifiedSessions.issue(userOwnerAId, sessionOwnerAId);

      // Check current layer for Product A at Branch A1
      const layerA = await owner.inventoryCostLayer.findFirstOrThrow({
        where: { clinicId: clinicAId, branchId: branchA1Id, productId: productAId },
      });
      originalUnitCostMinor = layerA.unitLandedCostMinor; // 22000n

      // Ensure balance exists at source location for transfer
      await owner.inventoryBalance.upsert({
        where: {
          clinicId_productId_locationId: {
            clinicId: clinicAId,
            productId: productAId,
            locationId: locA1Id,
          },
        },
        create: {
          clinicId: clinicAId,
          productId: productAId,
          locationId: locA1Id,
          onHandQuantity: new Prisma.Decimal('10.0000'),
        },
        update: {
          onHandQuantity: new Prisma.Decimal('10.0000'),
        },
      });

      // Dispatch inter-branch transfer of 3 units from Branch A1 to Branch A2
      const xfer = await branchRepo.dispatchTransfer(pOwner, clinicAId, {
        sourceBranchId: branchA1Id,
        destinationBranchId: branchA2Id,
        sourceLocationId: locA1Id,
        destinationLocationId: locA2Id,
        productId: productAId,
        batchId: layerA.batchId ?? undefined,
        quantity: '3.0000',
        notes: 'تحويل بوتوكس لفرع الشمال',
      });
      assert.ok(xfer.id);
      transferId = xfer.id;

      // Verify source layer depleted by 3
      const layerAAfter = await owner.inventoryCostLayer.findUniqueOrThrow({ where: { id: layerA.id } });
      assert.equal(layerAAfter.remainingQuantity.toNumber(), 7);

      // Verify TRANSFER_OUT cost movement recorded
      const mov = await owner.inventoryCostMovement.findFirst({
        where: {
          clinicId: clinicAId,
          movementType: 'TRANSFER_OUT',
          transferId,
        },
      });
      assert.ok(mov);
      assert.equal(mov.quantity.toNumber(), 3);
    });

    it('receiving transfer creates destination layer with exact historical landed unit cost', async () => {
      const pOwner = verifiedSessions.issue(userOwnerAId, sessionOwnerAId);

      const xfer = await owner.interBranchTransfer.findUniqueOrThrow({ where: { id: transferId } });
      await branchRepo.receiveTransfer(pOwner, clinicAId, transferId, {
        expectedVersion: xfer.version,
      });

      // Verify destination layer created at Branch A2
      const destLayer = await owner.inventoryCostLayer.findFirstOrThrow({
        where: {
          clinicId: clinicAId,
          branchId: branchA2Id,
          productId: productAId,
          sourceProvenance: 'TRANSFER_IN',
        },
      });

      assert.equal(destLayer.remainingQuantity.toNumber(), 3);
      assert.equal(destLayer.unitLandedCostMinor, originalUnitCostMinor);
      assert.equal(destLayer.costStatus, 'VERIFIED');
    });

    it('transfer cancellation restores layer at source branch with original unit cost', async () => {
      const pOwner = verifiedSessions.issue(userOwnerAId, sessionOwnerAId);

      const layerA = await owner.inventoryCostLayer.findFirstOrThrow({
        where: { clinicId: clinicAId, branchId: branchA1Id, productId: productAId },
      });

      // Dispatch transfer of 2 units
      const xfer2 = await branchRepo.dispatchTransfer(pOwner, clinicAId, {
        sourceBranchId: branchA1Id,
        destinationBranchId: branchA2Id,
        sourceLocationId: locA1Id,
        destinationLocationId: locA2Id,
        productId: productAId,
        batchId: layerA.batchId ?? undefined,
        quantity: '2.0000',
        notes: 'تحويل سيتم إلغاؤه',
      });

      // Cancel transfer
      await branchRepo.cancelTransfer(pOwner, clinicAId, xfer2.id, {
        expectedVersion: xfer2.version,
        reason: 'إلغاء الطلب من قبل الفرع المستلم',
      });

      // Verify source layer quantity was restored back to 7.0000
      const restoredLayer = await owner.inventoryCostLayer.findUniqueOrThrow({
        where: { id: layerA.id },
      });

      assert.equal(restoredLayer.remainingQuantity.toNumber(), 7);
      assert.equal(restoredLayer.unitLandedCostMinor, originalUnitCostMinor);
    });
  });

  describe('4. Opening Balance Backfill & Segregated Approval', () => {
    let unverifiedLayerId: string;
    let productDId: string;

    before(async () => {
      // Create separate product for opening balance backfill
      const prodD = await owner.inventoryProduct.create({
        data: {
          clinicId: clinicAId,
          sku: `SKU-SERUM-${suffix}`,
          nameAr: 'سيروم هيالورونيك',
          category: 'SKINCARE',
          requiresBatchTracking: false,
          unit: 'PIECE',
        },
      });
      productDId = prodD.id;

      // Simulate existing balance with on-hand units but no cost layers
      await owner.inventoryBalance.create({
        data: {
          clinicId: clinicAId,
          productId: productDId,
          locationId: locA2Id,
          onHandQuantity: new Prisma.Decimal('50.0000'),
        },
      });
    });

    it('initializes opening balance cost layers with UNVERIFIED_COST status', async () => {
      const pAdmin = verifiedSessions.issue(userAdminAId, sessionAdminAId);

      const result = await costingRepo.initializeOpeningBalances(pAdmin, clinicAId, {
        defaultUnitCost: '8.50',
      });

      assert(result.createdLayersCount >= 1);

      const unverified = await owner.inventoryCostLayer.findFirst({
        where: {
          clinicId: clinicAId,
          productId: productDId,
          costStatus: 'UNVERIFIED_COST',
        },
      });
      assert.ok(unverified);
      assert.equal(unverified.unitLandedCostMinor, 850n); // 8.50 SAR in minor units
      unverifiedLayerId = unverified.id;
    });

    it('approving opening balances elevates status to VERIFIED', async () => {
      const pOwner = verifiedSessions.issue(userOwnerAId, sessionOwnerAId);

      const res = await costingRepo.approveOpeningBalances(pOwner, clinicAId, {
        notes: 'اعتماد محاسبي رسمي للأرصدة الافتتاحية',
      });

      assert(res.approvedCount >= 1);

      const verified = await owner.inventoryCostLayer.findUniqueOrThrow({
        where: { id: unverifiedLayerId },
      });
      assert.equal(verified.costStatus, 'VERIFIED');
    });
  });

  describe('5. Cost Revaluation Adjustment Workflow', () => {
    let activeLayerId: string;
    let adjustmentId: string;

    before(async () => {
      const layer = await owner.inventoryCostLayer.findFirstOrThrow({
        where: { clinicId: clinicAId, productId: productBId, costStatus: 'VERIFIED' },
      });
      activeLayerId = layer.id;
    });

    it('creates a cost adjustment in PENDING status', async () => {
      const pAcct = verifiedSessions.issue(userAccountantAId, sessionAccountantAId);

      const adj = await costingRepo.createCostAdjustment(pAcct, clinicAId, {
        costLayerId: activeLayerId,
        newUnitLandedCost: '680.00',
        reason: 'تعديل فروقات جمركية مؤخرة للمنتج',
      });

      assert.equal(adj.status, 'PENDING');
      assert.equal(adj.previousUnitCostMinor, 66000n);
      assert.equal(adj.newUnitCostMinor, 68000n);
      adjustmentId = adj.id;
    });

    it('rejecting adjustment marks status REJECTED without modifying layer', async () => {
      const pOwner = verifiedSessions.issue(userOwnerAId, sessionOwnerAId);

      const rejected = await costingRepo.decideCostAdjustment(pOwner, clinicAId, adjustmentId, {
        decision: 'REJECTED',
        notes: 'مستندات التخليص الجمركي غير مكتملة',
      });

      assert.equal(rejected.status, 'REJECTED');

      const layer = await owner.inventoryCostLayer.findUniqueOrThrow({ where: { id: activeLayerId } });
      assert.equal(layer.unitLandedCostMinor, 66000n);
    });

    it('approving adjustment updates layer unitLandedCost and creates ADJUSTMENT cost movement', async () => {
      const pAdmin = verifiedSessions.issue(userAdminAId, sessionAdminAId);

      // Create new adjustment
      const adj2 = await costingRepo.createCostAdjustment(pAdmin, clinicAId, {
        costLayerId: activeLayerId,
        newUnitLandedCost: '675.00',
        reason: 'تعديل التكلفة بعد مراجعة الفاتورة النهائية',
      });

      const pOwner = verifiedSessions.issue(userOwnerAId, sessionOwnerAId);

      const approved = await costingRepo.decideCostAdjustment(pOwner, clinicAId, adj2.id, {
        decision: 'APPROVED',
      });

      assert.equal(approved.status, 'APPROVED');

      // Verify layer updated
      const layerAfter = await owner.inventoryCostLayer.findUniqueOrThrow({ where: { id: activeLayerId } });
      assert.equal(layerAfter.unitLandedCostMinor, 67500n);

      // Verify ADJUSTMENT cost movement created
      const mov = await owner.inventoryCostMovement.findFirst({
        where: {
          clinicId: clinicAId,
          costLayerId: activeLayerId,
          movementType: 'ADJUSTMENT',
        },
      });
      assert.ok(mov);
    });
  });

  describe('6. Real-time Valuation Reporting & Snapshots', () => {
    it('generates real-time valuation report with verified, unverified and in-transit separation', async () => {
      const pOwner = verifiedSessions.issue(userOwnerAId, sessionOwnerAId);

      const report = await costingRepo.getValuationReport(pOwner, clinicAId, {});
      assert.ok(report.asOfDate);
      assert.equal(report.currency, 'SAR');
      assert.equal(report.valuationMethod, 'FIFO_ACTUAL_LANDED_COST');
      assert(parseFloat(report.summary.totalValuation) > 0);
      assert(report.products.length >= 2);
    });

    it('creates immutable valuation snapshot with auto-increment sequence', async () => {
      const pOwner = verifiedSessions.issue(userOwnerAId, sessionOwnerAId);

      const snap = await costingRepo.createValuationSnapshot(pOwner, clinicAId, {
        notes: 'إقفال نهاية الشهر المحاسبي',
      });

      assert.ok(snap.id);
      assert.ok(snap.snapshotNumber.startsWith('VS-'));
      assert(snap.totalValueMinor > 0n);
      assert.equal(snap.status, 'PROVISIONAL');
    });
  });

  describe('7. Multi-Tenant FORCE RLS & Database Boundary Security', () => {
    it('restricted runtime user cannot access any costing rows without app.current_clinic_id', async () => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('RESET ALL');

        // Querying InventoryCostLayer without tenant context must yield 0 rows
        const res = await client.query('SELECT * FROM "InventoryCostLayer"');
        assert.equal(res.rows.length, 0);

        // Querying InventoryLandedCost without tenant context must yield 0 rows
        const resLanded = await client.query('SELECT * FROM "InventoryLandedCost"');
        assert.equal(resLanded.rows.length, 0);

        await client.query('ROLLBACK');
      } finally {
        client.release();
      }
    });

    it('cross-clinic isolation: Clinic B context strictly cannot see Clinic A costing records', async () => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(`SET LOCAL "app.current_clinic_id" = '${clinicBId}'`);

        // Clinic B querying layers must find 0 Clinic A layers
        const res = await client.query('SELECT * FROM "InventoryCostLayer"');
        assert.equal(res.rows.length, 0);

        // Clinic B querying landed costs must find 0 Clinic A records
        const resLanded = await client.query('SELECT * FROM "InventoryLandedCost"');
        assert.equal(resLanded.rows.length, 0);

        await client.query('ROLLBACK');
      } finally {
        client.release();
      }
    });
  });
});
