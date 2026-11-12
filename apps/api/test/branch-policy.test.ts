import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import {
  CreateBranchDto,
  UpdateBranchDto,
  AssignStaffBranchDto,
  SwitchBranchDto,
  DispatchTransferDto,
  ReceiveTransferDto,
  CancelTransferDto,
} from '../src/branches/branch.dto.js';
import { permissionsFor } from '../src/auth/permissions.js';

describe('Branch Policy & DTO Validation', () => {
  it('CreateBranchDto: validates code, Arabic name, and transforms code to uppercase', async () => {
    const valid = plainToInstance(CreateBranchDto, {
      code: '  north-01  ',
      nameAr: 'فرع الشمال',
      nameEn: 'North Branch',
      phone: '+967770001122',
      timezone: 'Asia/Aden',
    });
    const errors = await validate(valid);
    assert.equal(errors.length, 0);
    assert.equal(valid.code, 'NORTH-01');
    assert.equal(valid.nameAr, 'فرع الشمال');

    // Invalid code characters
    const invalidCode = plainToInstance(CreateBranchDto, {
      code: 'branch@#$!',
      nameAr: 'فرع غير صالح',
    });
    const codeErrors = await validate(invalidCode);
    assert.ok(codeErrors.some((e) => e.property === 'code'));

    // Missing Arabic name
    const missingName = plainToInstance(CreateBranchDto, {
      code: 'VALID-01',
      nameAr: '',
    });
    const nameErrors = await validate(missingName);
    assert.ok(nameErrors.some((e) => e.property === 'nameAr'));
  });

  it('UpdateBranchDto: requires expectedVersion and validates status enum', async () => {
    const valid = plainToInstance(UpdateBranchDto, {
      nameAr: 'الفرع الرئيسي المحدّث',
      status: 'INACTIVE',
      expectedVersion: 2,
    });
    const errors = await validate(valid);
    assert.equal(errors.length, 0);

    // Missing or non-positive expectedVersion
    const invalidVersion = plainToInstance(UpdateBranchDto, {
      expectedVersion: 0,
    });
    const verErrors = await validate(invalidVersion);
    assert.ok(verErrors.some((e) => e.property === 'expectedVersion'));

    // Invalid status
    const invalidStatus = plainToInstance(UpdateBranchDto, {
      status: 'UNKNOWN_STATUS' as any,
      expectedVersion: 1,
    });
    const statusErrors = await validate(invalidStatus);
    assert.ok(statusErrors.some((e) => e.property === 'status'));
  });

  it('AssignStaffBranchDto and SwitchBranchDto: validate UUIDs', async () => {
    const validAssign = plainToInstance(AssignStaffBranchDto, {
      membershipId: 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d',
      isPrimary: true,
    });
    assert.equal((await validate(validAssign)).length, 0);

    const invalidAssign = plainToInstance(AssignStaffBranchDto, {
      membershipId: 'not-a-uuid',
    });
    assert.ok((await validate(invalidAssign)).some((e) => e.property === 'membershipId'));

    const validSwitch = plainToInstance(SwitchBranchDto, {
      branchId: 'b2c3d4e5-f6a1-4b2c-9d3e-4f5a6b7c8d9e',
    });
    assert.equal((await validate(validSwitch)).length, 0);

    const invalidSwitch = plainToInstance(SwitchBranchDto, {
      branchId: '12345',
    });
    assert.ok((await validate(invalidSwitch)).some((e) => e.property === 'branchId'));
  });

  it('DispatchTransferDto: validates branches, locations, product, and positive quantity', async () => {
    const valid = plainToInstance(DispatchTransferDto, {
      sourceBranchId: '11111111-1111-4111-8111-111111111111',
      destinationBranchId: '22222222-2222-4222-8222-222222222222',
      sourceLocationId: '33333333-3333-4333-8333-333333333333',
      destinationLocationId: '44444444-4444-4444-8444-444444444444',
      productId: '55555555-5555-4555-8555-555555555555',
      quantity: '10.5000',
      notes: 'تحويل دوري بين الفروع',
    });
    assert.equal((await validate(valid)).length, 0);

    const invalid = plainToInstance(DispatchTransferDto, {
      sourceBranchId: 'invalid-id',
      destinationBranchId: '22222222-2222-4222-8222-222222222222',
      sourceLocationId: '33333333-3333-4333-8333-333333333333',
      destinationLocationId: '44444444-4444-4444-8444-444444444444',
      productId: '55555555-5555-4555-8555-555555555555',
      quantity: '',
    });
    const errors = await validate(invalid);
    assert.ok(errors.some((e) => e.property === 'sourceBranchId'));
    assert.ok(errors.some((e) => e.property === 'quantity'));
  });

  it('ReceiveTransferDto & CancelTransferDto: enforce optimistic concurrency', async () => {
    const validReceive = plainToInstance(ReceiveTransferDto, {
      expectedVersion: 1,
      notes: 'تم استلام الشحنة سليمة',
    });
    assert.equal((await validate(validReceive)).length, 0);

    const invalidReceive = plainToInstance(ReceiveTransferDto, {
      expectedVersion: 0,
    });
    assert.ok((await validate(invalidReceive)).some((e) => e.property === 'expectedVersion'));

    const validCancel = plainToInstance(CancelTransferDto, {
      expectedVersion: 1,
      reason: 'خطأ في الكمية المطلوبة',
    });
    assert.equal((await validate(validCancel)).length, 0);
  });

  it('Role Permissions: owners and admins manage branches; staff have read-only branch scope', () => {
    const ownerPerms = permissionsFor('CLINIC_OWNER');
    assert.ok(ownerPerms.includes('branches.read'));
    assert.ok(ownerPerms.includes('branches.manage'));
    assert.ok(ownerPerms.includes('inventory.transfers.manage'));

    const adminPerms = permissionsFor('CLINIC_ADMIN');
    assert.ok(adminPerms.includes('branches.read'));
    assert.ok(adminPerms.includes('branches.manage'));
    assert.ok(adminPerms.includes('inventory.transfers.manage'));

    const doctorPerms = permissionsFor('DOCTOR');
    assert.ok(doctorPerms.includes('branches.read'));
    assert.ok(!doctorPerms.includes('branches.manage'), 'Doctors must not manage branch configurations');

    const receptionistPerms = permissionsFor('RECEPTIONIST');
    assert.ok(receptionistPerms.includes('branches.read'));
    assert.ok(!receptionistPerms.includes('branches.manage'), 'Receptionists must not manage branches');

    const accountantPerms = permissionsFor('ACCOUNTANT');
    assert.ok(accountantPerms.includes('branches.read'));
    assert.ok(!accountantPerms.includes('branches.manage'), 'Accountants must not manage branches');
  });
});
