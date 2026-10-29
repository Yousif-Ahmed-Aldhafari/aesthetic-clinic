import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { permissionsFor } from '../src/auth/permissions.js';
import {
  AddTreatmentItemDto,
  CatalogDto,
  ChangeTreatmentStatusDto,
  CreateExecutionDto,
  CreateTreatmentPlanDto,
  ExecutionStatusDto,
  ReviseTreatmentPlanDto,
  UpdateCatalogDto,
  UpdateTreatmentItemDto,
  UpdateTreatmentRevisionDto,
} from '../src/treatments/treatment-input.js';
import { ConsentEligibilityService } from '../src/treatments/consent-eligibility.service.js';

test('treatment and procedure permissions are doctor-only and excluded from administrative and finance roles', () => {
  const doctor = permissionsFor('DOCTOR');
  const clinicalPerms = [
    'clinical.treatment-plans.read',
    'clinical.treatment-plans.create',
    'clinical.treatment-plans.update',
    'clinical.treatment-plans.approve',
    'clinical.procedure-catalog.read',
    'clinical.procedure-catalog.manage',
    'clinical.procedures.read',
    'clinical.procedures.document',
    'clinical.procedures.perform',
  ] as const;

  for (const perm of clinicalPerms) {
    assert(doctor.includes(perm), `DOCTOR role must include ${perm}`);
  }

  for (const role of ['CLINIC_OWNER', 'CLINIC_ADMIN', 'RECEPTIONIST', 'ACCOUNTANT'] as const) {
    const rolePerms = permissionsFor(role);
    for (const perm of clinicalPerms) {
      assert(!rolePerms.includes(perm as any), `${role} must not possess ${perm}`);
    }
  }
});

test('treatment plan DTOs reject mass assignment, invalid UUIDs, and bounds violations', async () => {
  const patientId = randomUUID();
  const valid = plainToInstance(CreateTreatmentPlanDto, {
    patientId,
    title: 'خطة علاج تجميلية وهمية',
    clinicalPurpose: 'غرض سريري وهمي لتحسين مظهر البشرة',
  });
  assert.equal((await validate(valid, { whitelist: true, forbidNonWhitelisted: true })).length, 0);

  const massAssign = plainToInstance(CreateTreatmentPlanDto, {
    patientId,
    title: 'خطة علاج',
    clinicalPurpose: 'غرض سريري',
    forgedField: 'malicious',
  });
  assert((await validate(massAssign, { whitelist: true, forbidNonWhitelisted: true })).length > 0);

  const shortTitle = plainToInstance(CreateTreatmentPlanDto, {
    patientId,
    title: 'x',
    clinicalPurpose: 'غرض سريري',
  });
  assert((await validate(shortTitle, { whitelist: true, forbidNonWhitelisted: true })).length > 0);

  const invalidPatient = plainToInstance(CreateTreatmentPlanDto, {
    patientId: 'not-a-uuid',
    title: 'خطة علاج',
    clinicalPurpose: 'غرض سريري',
  });
  assert((await validate(invalidPatient, { whitelist: true, forbidNonWhitelisted: true })).length > 0);

  const updateDto = plainToInstance(UpdateTreatmentRevisionDto, {
    expectedVersion: 0,
    title: 'تعديل',
    clinicalPurpose: 'غرض',
  });
  assert((await validate(updateDto, { whitelist: true, forbidNonWhitelisted: true })).length > 0);
});

test('treatment item DTOs enforce session duration and ordering constraints', async () => {
  const procedureCatalogId = randomUUID();
  const valid = plainToInstance(AddTreatmentItemDto, {
    procedureCatalogId,
    sessionOrder: 1,
    expectedDurationMinutes: 45,
  });
  assert.equal((await validate(valid, { whitelist: true, forbidNonWhitelisted: true })).length, 0);

  const durationTooShort = plainToInstance(AddTreatmentItemDto, {
    procedureCatalogId,
    sessionOrder: 1,
    expectedDurationMinutes: 2,
  });
  assert((await validate(durationTooShort, { whitelist: true, forbidNonWhitelisted: true })).length > 0);

  const durationTooLong = plainToInstance(AddTreatmentItemDto, {
    procedureCatalogId,
    sessionOrder: 1,
    expectedDurationMinutes: 999,
  });
  assert((await validate(durationTooLong, { whitelist: true, forbidNonWhitelisted: true })).length > 0);

  const invalidTarget = plainToInstance(AddTreatmentItemDto, {
    procedureCatalogId,
    sessionOrder: 0,
    targetAt: 'not-an-iso-date',
    expectedDurationMinutes: 30,
  });
  assert((await validate(invalidTarget, { whitelist: true, forbidNonWhitelisted: true })).length > 0);

  const updateItemDto = plainToInstance(UpdateTreatmentItemDto, {
    procedureCatalogId,
    sessionOrder: 1,
    expectedDurationMinutes: 30,
    expectedVersion: 0,
  });
  assert((await validate(updateItemDto, { whitelist: true, forbidNonWhitelisted: true })).length > 0);
});

test('procedure catalog DTOs enforce arabic naming, duration limits and versioning', async () => {
  const valid = plainToInstance(CatalogDto, {
    nameAr: 'جلسة نضارة للبشرة',
    category: 'عناية بالبشرة',
    defaultDurationMinutes: 30,
  });
  assert.equal((await validate(valid, { whitelist: true, forbidNonWhitelisted: true })).length, 0);

  const shortName = plainToInstance(CatalogDto, {
    nameAr: 'أ',
    category: 'عناية',
  });
  assert((await validate(shortName, { whitelist: true, forbidNonWhitelisted: true })).length > 0);

  const updateCatalog = plainToInstance(UpdateCatalogDto, {
    nameAr: 'جلسة تقشير سطحي',
    category: 'تقشير',
    active: true,
    expectedVersion: 0,
  });
  assert((await validate(updateCatalog, { whitelist: true, forbidNonWhitelisted: true })).length > 0);
});

test('revision, status and execution DTOs enforce strict transitions and fail closed', async () => {
  const validRevision = plainToInstance(ReviseTreatmentPlanDto, {
    expectedVersion: 1,
    reason: 'تعديل الاستجابة السريرية ومراجعة عدد الجلسات',
  });
  assert.equal((await validate(validRevision, { whitelist: true, forbidNonWhitelisted: true })).length, 0);

  const weakRevision = plainToInstance(ReviseTreatmentPlanDto, {
    expectedVersion: 1,
    reason: 'no',
  });
  assert((await validate(weakRevision, { whitelist: true, forbidNonWhitelisted: true })).length > 0);

  const validStatus = plainToInstance(ChangeTreatmentStatusDto, {
    expectedVersion: 1,
    status: 'ACTIVE',
  });
  assert.equal((await validate(validStatus, { whitelist: true, forbidNonWhitelisted: true })).length, 0);

  const invalidStatus = plainToInstance(ChangeTreatmentStatusDto, {
    expectedVersion: 1,
    status: 'UNKNOWN_STATUS' as any,
  });
  assert((await validate(invalidStatus, { whitelist: true, forbidNonWhitelisted: true })).length > 0);

  const executionStatus = plainToInstance(ExecutionStatusDto, {
    expectedVersion: 1,
    status: 'FORGED' as any,
  });
  assert((await validate(executionStatus, { whitelist: true, forbidNonWhitelisted: true })).length > 0);

  const createExecution = plainToInstance(CreateExecutionDto, {
    treatmentPlanItemId: 'not-a-uuid',
  });
  assert((await validate(createExecution, { whitelist: true, forbidNonWhitelisted: true })).length > 0);
});

test('ConsentEligibilityService fails closed requiring verified informed consent', async () => {
  const service = new ConsentEligibilityService();
  const result = await service.check('test-clinic', 'test-patient', 'test-execution');
  assert.equal(result.eligible, false);
  assert.equal(result.reason, 'VERIFIED_CONSENT_REQUIRED');
});
