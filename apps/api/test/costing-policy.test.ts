import 'reflect-metadata';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import {
  CreateLandedCostDto,
  ApproveLandedCostDto,
  CostLayerQueryDto,
  ValuationQueryDto,
  CreateCostAdjustmentDto,
  DecideCostAdjustmentDto,
  LandedCostAllocationMethod,
  InventoryCostStatus,
  InventoryCategory,
} from '../src/costing/costing.dto.js';
import { permissionsFor } from '../src/auth/permissions.js';
import { decimalToMinor, minorToDecimalString } from '../src/prisma/costing.repository.js';
import { Prisma } from '../src/generated/prisma/client.js';

describe('Inventory Costing & Valuation Policies', () => {
  describe('Minor Unit Math Helpers', () => {
    it('decimalToMinor converts decimal strings and Prisma Decimals accurately', () => {
      assert.equal(decimalToMinor('12.50', 2), 1250n);
      assert.equal(decimalToMinor('0.00', 2), 0n);
      assert.equal(decimalToMinor(new Prisma.Decimal('150.75'), 2), 15075n);
      assert.equal(decimalToMinor('100.123', 3), 100123n);
      assert.equal(decimalToMinor(undefined, 2), 0n);
      assert.equal(decimalToMinor(null, 2), 0n);
    });

    it('minorToDecimalString formats positive, negative and zero amounts', () => {
      assert.equal(minorToDecimalString(1250n, 2), '12.50');
      assert.equal(minorToDecimalString(0n, 2), '0.00');
      assert.equal(minorToDecimalString(5n, 2), '0.05');
      assert.equal(minorToDecimalString(-1250n, 2), '-12.50');
      assert.equal(minorToDecimalString(100123n, 3), '100.123');
    });
  });

  describe('Deterministic Landed Cost Allocation Math', () => {
    it('exact allocation by value with deterministic remainder attribution', () => {
      // Net landed cost: 100.00 SAR (10,000 minor units)
      // Line 1: Qty 10 @ 20.00 = 200.00 (weight 200)
      // Line 2: Qty 20 @ 30.00 = 600.00 (weight 600)
      // Total value: 800.00
      // Line 1 share: floor(10000 * 200 / 800) = 2500
      // Line 2 share: 10000 - 2500 = 7500 (remainder 0)
      const netLandedMinor = 10000n;
      const w1 = new Prisma.Decimal('200.00');
      const w2 = new Prisma.Decimal('600.00');
      const totalW = w1.plus(w2);

      const alloc1 = BigInt(new Prisma.Decimal(netLandedMinor.toString()).mul(w1).div(totalW).floor().toString());
      const alloc2 = netLandedMinor - alloc1;

      assert.equal(alloc1, 2500n);
      assert.equal(alloc2, 7500n);
      assert.equal(alloc1 + alloc2, netLandedMinor);
    });

    it('allocates remainder to the last line when divisions have repeating decimals', () => {
      // Net landed cost: 100.00 SAR (10,000 minor units) across 3 equal lines of 1 unit
      // Line 1: floor(10000 / 3) = 3333
      // Line 2: floor(10000 / 3) = 3333
      // Line 3: 10000 - (3333 + 3333) = 3334 (with remainder 1)
      const netLandedMinor = 10000n;
      const w = new Prisma.Decimal('1.0000');
      const totalW = new Prisma.Decimal('3.0000');

      const alloc1 = BigInt(new Prisma.Decimal(netLandedMinor.toString()).mul(w).div(totalW).floor().toString());
      const alloc2 = BigInt(new Prisma.Decimal(netLandedMinor.toString()).mul(w).div(totalW).floor().toString());
      const alloc3 = netLandedMinor - (alloc1 + alloc2);

      assert.equal(alloc1, 3333n);
      assert.equal(alloc2, 3333n);
      assert.equal(alloc3, 3334n);
      assert.equal(alloc1 + alloc2 + alloc3, netLandedMinor, 'Allocations must sum exactly to net landed charges');
    });

    it('exact allocation by quantity distributes proportionally to received units', () => {
      // Net landed cost: 50.00 SAR (5,000 minor units)
      // Line 1: 30 units
      // Line 2: 70 units
      // Total units: 100
      // Line 1 share: floor(5000 * 30 / 100) = 1500
      // Line 2 share: 5000 - 1500 = 3500
      const netLandedMinor = 5000n;
      const q1 = new Prisma.Decimal('30.0000');
      const q2 = new Prisma.Decimal('70.0000');
      const totalQ = q1.plus(q2);

      const alloc1 = BigInt(new Prisma.Decimal(netLandedMinor.toString()).mul(q1).div(totalQ).floor().toString());
      const alloc2 = netLandedMinor - alloc1;

      assert.equal(alloc1, 1500n);
      assert.equal(alloc2, 3500n);
      assert.equal(alloc1 + alloc2, netLandedMinor);
    });
  });

  describe('DTO Validation Rules', () => {
    it('CreateLandedCostDto: accepts valid landed charges and UUID references', async () => {
      const dto = plainToInstance(CreateLandedCostDto, {
        goodsReceiptId: '00000000-0000-4000-8000-000000000001',
        freightCost: '150.00',
        customsDuty: '45.50',
        insuranceCost: '10.00',
        handlingCost: '15.00',
        otherCharges: '5.00',
        discountCredit: '20.00',
        allocationMethod: LandedCostAllocationMethod.BY_VALUE,
        notes: 'Air freight from Riyadh hub',
      });
      const errors = await validate(dto);
      assert.equal(errors.length, 0);
    });

    it('CreateLandedCostDto: rejects invalid decimal formats and negative values', async () => {
      const dto = plainToInstance(CreateLandedCostDto, {
        goodsReceiptId: 'invalid-uuid',
        freightCost: '-50.00',
        customsDuty: 'abc',
      });
      const errors = await validate(dto);
      assert(errors.length >= 3);
    });

    it('ApproveLandedCostDto: enforces positive integer version', async () => {
      const valid = plainToInstance(ApproveLandedCostDto, { expectedVersion: 1 });
      assert.equal((await validate(valid)).length, 0);

      const invalid = plainToInstance(ApproveLandedCostDto, { expectedVersion: 0 });
      assert((await validate(invalid)).length > 0);
    });

    it('CostLayerQueryDto: validates pagination bounds and status filter', async () => {
      const dto = plainToInstance(CostLayerQueryDto, {
        productId: '00000000-0000-4000-8000-000000000002',
        costStatus: InventoryCostStatus.VERIFIED,
        limit: 25,
        offset: 0,
      });
      assert.equal((await validate(dto)).length, 0);

      const invalid = plainToInstance(CostLayerQueryDto, { limit: 0, offset: -1 });
      assert((await validate(invalid)).length >= 2);
    });

    it('ValuationQueryDto: validates ISO8601 date and category enum', async () => {
      const valid = plainToInstance(ValuationQueryDto, {
        asOfDate: '2026-11-11T00:00:00.000Z',
        category: InventoryCategory.INJECTABLE,
      });
      assert.equal((await validate(valid)).length, 0);

      const invalid = plainToInstance(ValuationQueryDto, { asOfDate: 'not-a-date' });
      assert((await validate(invalid)).length > 0);
    });

    it('CreateCostAdjustmentDto: enforces positive newUnitLandedCost and reason', async () => {
      const valid = plainToInstance(CreateCostAdjustmentDto, {
        costLayerId: '00000000-0000-4000-8000-000000000003',
        reason: 'Supplier retroactive rebate applied',
        newUnitLandedCost: '185.00',
      });
      assert.equal((await validate(valid)).length, 0);

      const invalid = plainToInstance(CreateCostAdjustmentDto, {
        costLayerId: 'bad-uuid',
        reason: 'a', // too short
        newUnitLandedCost: 'negative',
      });
      assert((await validate(invalid)).length >= 3);
    });

    it('DecideCostAdjustmentDto: restricts decision to APPROVED or REJECTED', async () => {
      const validApprove = plainToInstance(DecideCostAdjustmentDto, { decision: 'APPROVED' });
      assert.equal((await validate(validApprove)).length, 0);

      const validReject = plainToInstance(DecideCostAdjustmentDto, { decision: 'REJECTED' });
      assert.equal((await validate(validReject)).length, 0);

      const invalid = plainToInstance(DecideCostAdjustmentDto, { decision: 'PENDING' });
      assert((await validate(invalid)).length > 0);
    });
  });

  describe('RBAC & Privilege Boundaries', () => {
    it('CLINIC_OWNER and CLINIC_ADMIN have full costing permissions', () => {
      const ownerPerms = permissionsFor('CLINIC_OWNER');
      const adminPerms = permissionsFor('CLINIC_ADMIN');

      for (const p of ['inventory.costing.read', 'inventory.costing.manage', 'inventory.costing.approve'] as const) {
        assert(ownerPerms.includes(p), `Owner must have ${p}`);
        assert(adminPerms.includes(p), `Admin must have ${p}`);
      }
    });

    it('ACCOUNTANT has costing read and manage, but not approve (segregation of duties)', () => {
      const perms = permissionsFor('ACCOUNTANT');
      assert(perms.includes('inventory.costing.read'), 'Accountant must have costing read');
      assert(perms.includes('inventory.costing.manage'), 'Accountant must have costing manage');
      assert(!perms.includes('inventory.costing.approve'), 'Accountant must NOT have costing approve');
    });

    it('DOCTOR and RECEPTIONIST have NO costing permissions', () => {
      const doctorPerms = permissionsFor('DOCTOR');
      const receptionistPerms = permissionsFor('RECEPTIONIST');

      for (const p of ['inventory.costing.read', 'inventory.costing.manage', 'inventory.costing.approve'] as const) {
        assert(!doctorPerms.includes(p), `Doctor must NOT have ${p}`);
        assert(!receptionistPerms.includes(p), `Receptionist must NOT have ${p}`);
      }
    });
  });
});
