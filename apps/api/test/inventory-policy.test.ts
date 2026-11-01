import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BadRequestException } from '@nestjs/common';
import { permissionsFor } from '../src/auth/permissions.js';
import { validateDecimalString } from '../src/inventory/inventory-input.js';

test('validateDecimalString accepts valid fixed-precision strings up to 4 decimal places', () => {
  assert.equal(validateDecimalString('10', 'quantity'), '10');
  assert.equal(validateDecimalString('10.5', 'quantity'), '10.5');
  assert.equal(validateDecimalString('10.50', 'quantity'), '10.50');
  assert.equal(validateDecimalString('10.500', 'quantity'), '10.500');
  assert.equal(validateDecimalString('10.5000', 'quantity'), '10.5000');
  assert.equal(validateDecimalString('0', 'quantity', { allowZero: true }), '0');
  assert.equal(validateDecimalString('0.0000', 'quantity', { allowZero: true }), '0.0000');
  assert.equal(validateDecimalString(25, 'quantity'), '25');
});

test('validateDecimalString rejects negative, zero (when forbidden), floating-point artifacts, and excess precision', () => {
  // Reject negative
  assert.throws(() => validateDecimalString('-5', 'quantity'), BadRequestException);
  assert.throws(() => validateDecimalString('-0.0001', 'quantity'), BadRequestException);

  // Reject zero when allowZero is false (default)
  assert.throws(() => validateDecimalString('0', 'quantity'), BadRequestException);
  assert.throws(() => validateDecimalString('0.0000', 'quantity'), BadRequestException);

  // Reject more than 4 decimal places
  assert.throws(() => validateDecimalString('1.12345', 'quantity'), BadRequestException);
  assert.throws(() => validateDecimalString('10.00001', 'quantity'), BadRequestException);

  // Reject non-numeric, scientific notation, and malformed inputs
  assert.throws(() => validateDecimalString('abc', 'quantity'), BadRequestException);
  assert.throws(() => validateDecimalString('1e5', 'quantity'), BadRequestException);
  assert.throws(() => validateDecimalString('10,5', 'quantity'), BadRequestException);
  assert.throws(() => validateDecimalString('', 'quantity'), BadRequestException);
  assert.throws(() => validateDecimalString(null as any, 'quantity'), BadRequestException);
  assert.throws(() => validateDecimalString(undefined as any, 'quantity'), BadRequestException);

  // Reject excessive quantities (> 100,000,000)
  assert.throws(() => validateDecimalString('100000001', 'quantity'), BadRequestException);
});

test('inventory permissions are granted to clinic owner and admin, strictly restricted for doctors, and denied to finance/reception', () => {
  const allInventoryPerms = [
    'inventory.products.read',
    'inventory.products.manage',
    'inventory.locations.read',
    'inventory.locations.manage',
    'inventory.stock.read',
    'inventory.stock.receive',
    'inventory.stock.issue',
    'inventory.stock.adjust',
    'inventory.stock.transfer',
    'inventory.movements.read',
    'inventory.reconcile',
  ] as const;

  // CLINIC_OWNER and CLINIC_ADMIN must have all inventory permissions
  for (const role of ['CLINIC_OWNER', 'CLINIC_ADMIN'] as const) {
    const rolePerms = permissionsFor(role);
    for (const perm of allInventoryPerms) {
      assert(rolePerms.includes(perm), `${role} must possess permission ${perm}`);
    }
  }

  // DOCTOR has read-only visibility for clinical context
  const doctorPerms = permissionsFor('DOCTOR');
  assert(doctorPerms.includes('inventory.products.read'), 'Doctor can view product catalog');
  assert(doctorPerms.includes('inventory.locations.read'), 'Doctor can view stock locations');
  assert(doctorPerms.includes('inventory.stock.read'), 'Doctor can view stock levels');

  // Doctor must NOT have modification or ledger administrative permissions
  const doctorForbiddenPerms = [
    'inventory.products.manage',
    'inventory.locations.manage',
    'inventory.stock.receive',
    'inventory.stock.issue',
    'inventory.stock.adjust',
    'inventory.stock.transfer',
    'inventory.reconcile',
  ] as const;
  for (const perm of doctorForbiddenPerms) {
    assert(!doctorPerms.includes(perm as any), `DOCTOR must NOT possess ${perm}`);
  }

  // RECEPTIONIST and ACCOUNTANT must NOT have inventory management or stock modification permissions
  for (const role of ['RECEPTIONIST', 'ACCOUNTANT'] as const) {
    const rolePerms = permissionsFor(role);
    for (const perm of allInventoryPerms) {
      assert(!rolePerms.includes(perm as any), `${role} must NOT possess ${perm}`);
    }
  }
});

test('inventory permissions never grant clinical notes or clinical photography permissions', () => {
  const adminPerms = permissionsFor('CLINIC_ADMIN');
  const clinicalConfidentialPerms = [
    'clinical.encounters.read',
    'clinical.encounters.create',
    'clinical.encounters.sign',
    'clinical.history.read',
    'clinical.history.update',
    'clinical.treatment-plans.read',
    'clinical.treatment-plans.create',
    'clinical.treatment-plans.approve',
    'clinical.procedures.document',
    'clinical.procedures.perform',
    'clinical.photos.read',
    'clinical.photos.upload',
  ] as const;

  for (const perm of clinicalConfidentialPerms) {
    assert(!adminPerms.includes(perm as any), `Administrative inventory roles must never grant confidential clinical permission ${perm}`);
  }
});

