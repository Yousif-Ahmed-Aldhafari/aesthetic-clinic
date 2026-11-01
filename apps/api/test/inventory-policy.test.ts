import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BadRequestException } from '@nestjs/common';
import { permissionsFor } from '../src/auth/permissions.js';
import {
  validateDecimalString,
  validateDateString,
  isBatchExpired,
  getClinicLocalDateString,
} from '../src/inventory/inventory-input.js';

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
    'inventory.batches.read',
    'inventory.batches.manage',
    'inventory.batches.quarantine',
    'inventory.batches.recall',
    'inventory.clinical-consumption.record',
    'inventory.clinical-consumption.read',
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

test('validateDateString enforces ISO YYYY-MM-DD format and valid calendar dates', () => {
  assert.equal(validateDateString('2026-11-01', 'expirationDate'), '2026-11-01');
  assert.equal(validateDateString('2027-12-31', 'expirationDate'), '2027-12-31');
  assert.equal(validateDateString('2024-02-29', 'expirationDate'), '2024-02-29'); // Leap year

  // Invalid formats
  assert.throws(() => validateDateString('01-11-2026', 'expirationDate'), BadRequestException);
  assert.throws(() => validateDateString('2026/11/01', 'expirationDate'), BadRequestException);
  assert.throws(() => validateDateString('2026-1-1', 'expirationDate'), BadRequestException);
  assert.throws(() => validateDateString('', 'expirationDate'), BadRequestException);
  assert.throws(() => validateDateString(12345 as any, 'expirationDate'), BadRequestException);

  // Impossible calendar dates
  assert.throws(() => validateDateString('2026-02-29', 'expirationDate'), BadRequestException); // Non-leap year
  assert.throws(() => validateDateString('2026-04-31', 'expirationDate'), BadRequestException); // April has 30 days
  assert.throws(() => validateDateString('2026-13-01', 'expirationDate'), BadRequestException); // Month 13
  assert.throws(() => validateDateString('2026-00-10', 'expirationDate'), BadRequestException); // Month 0
});

test('isBatchExpired accurately respects clinic-local calendar dates and midnight boundary', () => {
  const tz = 'Asia/Aden'; // UTC+3

  // Expiration date: 2026-11-01
  const expDate = '2026-11-01';

  // 1. Same calendar day at 12:00 local time -> NOT expired
  // UTC 2026-11-01 09:00:00 is Asia/Aden 2026-11-01 12:00:00
  const sameDayNoon = new Date('2026-11-01T09:00:00.000Z');
  assert.equal(isBatchExpired(expDate, tz, sameDayNoon), false, 'Batch must remain usable throughout its expiration date');

  // 2. Same calendar day at 23:55 local time -> NOT expired
  // UTC 2026-11-01 20:55:00 is Asia/Aden 2026-11-01 23:55:00
  const sameDayEnd = new Date('2026-11-01T20:55:00.000Z');
  assert.equal(isBatchExpired(expDate, tz, sameDayEnd), false, 'Batch must remain usable until 23:59:59 on expiration date');

  // 3. Immediately after midnight in clinic timezone -> EXPIRED
  // UTC 2026-11-01 21:05:00 is Asia/Aden 2026-11-02 00:05:00
  // Note: UTC is still 2026-11-01, but clinic local date has struck 2026-11-02!
  const nextDayMidnight = new Date('2026-11-01T21:05:00.000Z');
  assert.equal(getClinicLocalDateString(nextDayMidnight, tz), '2026-11-02');
  assert.equal(isBatchExpired(expDate, tz, nextDayMidnight), true, 'Batch must expire as soon as midnight strikes in clinic local timezone');

  // 4. Also works with Date objects as input
  assert.equal(isBatchExpired(new Date('2026-11-01T00:00:00.000Z'), tz, sameDayNoon), false);
  assert.equal(isBatchExpired(new Date('2026-11-01T00:00:00.000Z'), tz, nextDayMidnight), true);
});

test('batch and clinical consumption permissions are correctly assigned by role', () => {
  const batchPerms = [
    'inventory.batches.read',
    'inventory.batches.manage',
    'inventory.batches.quarantine',
    'inventory.batches.recall',
    'inventory.clinical-consumption.read',
  ] as const;

  for (const role of ['CLINIC_OWNER', 'CLINIC_ADMIN'] as const) {
    const rolePerms = permissionsFor(role);
    for (const perm of batchPerms) {
      assert(rolePerms.includes(perm), `${role} must possess permission ${perm}`);
    }
  }

  const doctorPerms = permissionsFor('DOCTOR');
  assert(doctorPerms.includes('inventory.batches.read'), 'DOCTOR must have inventory.batches.read');
  assert(doctorPerms.includes('inventory.clinical-consumption.record'), 'DOCTOR must have inventory.clinical-consumption.record');
  assert(doctorPerms.includes('inventory.clinical-consumption.read'), 'DOCTOR must have inventory.clinical-consumption.read');

  // Doctor must NOT have batch administrative management or quarantine/recall permissions
  assert(!doctorPerms.includes('inventory.batches.manage' as any));
  assert(!doctorPerms.includes('inventory.batches.quarantine' as any));
  assert(!doctorPerms.includes('inventory.batches.recall' as any));

  // Receptionist and accountant cannot perform clinical consumption or manage batches
  for (const role of ['RECEPTIONIST', 'ACCOUNTANT'] as const) {
    const rolePerms = permissionsFor(role);
    assert(!rolePerms.includes('inventory.batches.read' as any));
    assert(!rolePerms.includes('inventory.batches.manage' as any));
    assert(!rolePerms.includes('inventory.clinical-consumption.record' as any));
  }
});

