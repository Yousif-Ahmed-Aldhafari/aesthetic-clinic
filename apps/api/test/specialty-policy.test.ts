import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import {
  CreatePractitionerProfileDto,
  UpdatePractitionerProfileDto,
  AddQualificationDto,
  RequestClinicalPrivilegeDto,
  RejectQualificationDto,
  RejectPrivilegeDto,
} from '../src/specialties/specialty.dto.js';
import { permissionsFor } from '../src/auth/permissions.js';

describe('Specialty Policy & Credentialing DTO Validation', () => {
  it('CreatePractitionerProfileDto: validates titles, membership UUID, and license details', async () => {
    const valid = plainToInstance(CreatePractitionerProfileDto, {
      membershipId: 'a0000000-0000-4000-8000-000000000001',
      professionalTitleAr: 'استشاري طب الأسرة',
      professionalTitleEn: 'Family Medicine Consultant',
      licenseNumber: 'SCFHS-12345678',
      licensingAuthority: 'Saudi Commission for Health Specialties',
      licensingJurisdiction: 'sa',
      licenseExpirationDate: '2028-12-31T23:59:59.000Z',
    });
    const errors = await validate(valid);
    assert.equal(errors.length, 0);
    assert.equal(valid.licensingJurisdiction, 'SA');

    // Missing membershipId
    const invalidId = plainToInstance(CreatePractitionerProfileDto, {
      membershipId: 'not-a-uuid',
      professionalTitleAr: 'طبيب',
      professionalTitleEn: 'Doctor',
    });
    const idErrors = await validate(invalidId);
    assert.ok(idErrors.some((e) => e.property === 'membershipId'));

    // Too short titles
    const shortTitle = plainToInstance(CreatePractitionerProfileDto, {
      membershipId: 'a0000000-0000-4000-8000-000000000001',
      professionalTitleAr: 'ا',
      professionalTitleEn: 'D',
    });
    const titleErrors = await validate(shortTitle);
    assert.ok(titleErrors.some((e) => e.property === 'professionalTitleAr'));
    assert.ok(titleErrors.some((e) => e.property === 'professionalTitleEn'));
  });

  it('UpdatePractitionerProfileDto: allows partial updates with expectedVersion', async () => {
    const valid = plainToInstance(UpdatePractitionerProfileDto, {
      expectedVersion: 2,
      professionalTitleAr: 'استشاري أول',
      licenseNumber: 'SCFHS-87654321',
    });
    const errors = await validate(valid);
    assert.equal(errors.length, 0);

    const invalidVersion = plainToInstance(UpdatePractitionerProfileDto, {
      expectedVersion: 0,
    });
    const versionErrors = await validate(invalidVersion);
    assert.ok(versionErrors.some((e) => e.property === 'expectedVersion'));
  });

  it('AddQualificationDto: validates specialty code and qualification title', async () => {
    const valid = plainToInstance(AddQualificationDto, {
      specialtyCode: '  general_medicine  ',
      qualificationTitle: 'البورد السعودي في طب الأسرة',
      qualificationLevel: 'CONSULTANT',
      effectiveDate: '2024-01-01T00:00:00.000Z',
    });
    const errors = await validate(valid);
    assert.equal(errors.length, 0);
    assert.equal(valid.specialtyCode, 'GENERAL_MEDICINE');

    const empty = plainToInstance(AddQualificationDto, {
      specialtyCode: '',
      qualificationTitle: '',
    });
    const emptyErrors = await validate(empty);
    assert.ok(emptyErrors.some((e) => e.property === 'specialtyCode'));
    assert.ok(emptyErrors.some((e) => e.property === 'qualificationTitle'));
  });

  it('RequestClinicalPrivilegeDto: validates privilege code enum and scope', async () => {
    const valid = plainToInstance(RequestClinicalPrivilegeDto, {
      specialtyCode: 'PEDIATRICS',
      privilegeCode: 'MEDICATION_PRESCRIBE',
      scope: 'CLINIC_WIDE',
    });
    const errors = await validate(valid);
    assert.equal(errors.length, 0);

    const invalidPrivilege = plainToInstance(RequestClinicalPrivilegeDto, {
      specialtyCode: 'PEDIATRICS',
      privilegeCode: 'UNAUTHORIZED_SURGERY' as any,
    });
    const privErrors = await validate(invalidPrivilege);
    assert.ok(privErrors.some((e) => e.property === 'privilegeCode'));

    const invalidScope = plainToInstance(RequestClinicalPrivilegeDto, {
      specialtyCode: 'PEDIATRICS',
      privilegeCode: 'CLINICAL_ENCOUNTER_DOCUMENT',
      scope: 'INVALID_SCOPE' as any,
    });
    const scopeErrors = await validate(invalidScope);
    assert.ok(scopeErrors.some((e) => e.property === 'scope'));
  });

  it('RejectQualificationDto & RejectPrivilegeDto require non-empty reasons', async () => {
    const validQ = plainToInstance(RejectQualificationDto, { reason: 'وثيقة الترخيص غير واضحة' });
    assert.equal((await validate(validQ)).length, 0);

    const invalidQ = plainToInstance(RejectQualificationDto, { reason: 'لا' });
    assert.ok((await validate(invalidQ)).length > 0);

    const validP = plainToInstance(RejectPrivilegeDto, { reason: 'يتطلب إشرافاً سريرياً إضافياً' });
    assert.equal((await validate(validP)).length, 0);

    const invalidP = plainToInstance(RejectPrivilegeDto, { reason: '  ' });
    assert.ok((await validate(invalidP)).length > 0);
  });

  it('Role permissions strictly isolate specialty management and clinical authorization', () => {
    // CLINIC_OWNER and CLINIC_ADMIN can manage facility specialties and view profiles
    assert.ok(permissionsFor('CLINIC_OWNER').includes('specialties.manage'));
    assert.ok(permissionsFor('CLINIC_ADMIN').includes('specialties.manage'));
    assert.ok(permissionsFor('CLINIC_OWNER').includes('practitioners.profiles.read'));
    assert.ok(permissionsFor('CLINIC_ADMIN').includes('practitioners.profiles.read'));

    // DOCTOR cannot manage clinic-level specialty enablement
    assert.ok(!permissionsFor('DOCTOR').includes('specialties.manage'));
    // DOCTOR can request qualifications and privileges
    assert.ok(permissionsFor('DOCTOR').includes('practitioners.profiles.manage'));
    assert.ok(permissionsFor('DOCTOR').includes('privileges.request'));

    // RECEPTIONIST and ACCOUNTANT can only read enabled specialties
    assert.ok(permissionsFor('RECEPTIONIST').includes('specialties.read'));
    assert.ok(!permissionsFor('RECEPTIONIST').includes('specialties.manage'));
    assert.ok(!permissionsFor('RECEPTIONIST').includes('practitioners.profiles.manage'));
    assert.ok(!permissionsFor('RECEPTIONIST').includes('privileges.request'));

    assert.ok(permissionsFor('ACCOUNTANT').includes('specialties.read'));
    assert.ok(!permissionsFor('ACCOUNTANT').includes('specialties.manage'));
    assert.ok(!permissionsFor('ACCOUNTANT').includes('practitioners.profiles.manage'));

    // Section 9 Invariant: Neither CLINIC_OWNER, CLINIC_ADMIN nor DOCTOR has automatic credentials.verify or privileges.approve
    assert.ok(!permissionsFor('CLINIC_OWNER').includes('credentials.verify'));
    assert.ok(!permissionsFor('CLINIC_ADMIN').includes('credentials.verify'));
    assert.ok(!permissionsFor('DOCTOR').includes('credentials.verify'));
    assert.ok(!permissionsFor('CLINIC_OWNER').includes('privileges.approve'));
    assert.ok(!permissionsFor('CLINIC_ADMIN').includes('privileges.approve'));
    assert.ok(!permissionsFor('DOCTOR').includes('privileges.approve'));
  });
});
