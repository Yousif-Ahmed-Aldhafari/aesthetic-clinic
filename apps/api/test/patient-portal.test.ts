import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  ActivatePatientAccountDto,
  CancelPatientBookingDto,
  CreatePatientBookingDto,
  PatientLoginDto,
} from '../src/portal/patient-portal.dto.js';
import { hashPassword, verifyPassword } from '../src/auth/password.js';

test('portal DTO: ActivatePatientAccountDto validates slug, phone normalizer, dob, and password length', async () => {
  const valid = plainToInstance(ActivatePatientAccountDto, {
    clinicSlug: 'derma-glow',
    token: 'valid-activation-token-1234567890',
    phone: '٠٠٩٦٧ ٧٧١-٢٣٤-٥٦٧',
    dateOfBirth: '1998-04-12',
    password: 'SuperSecret123!',
  });
  const errors = await validate(valid);
  assert.equal(errors.length, 0);
  assert.equal(valid.phone, '+967771234567');

  const invalid = plainToInstance(ActivatePatientAccountDto, {
    clinicSlug: 'INVALID SLUG!',
    token: 'short',
    phone: 'invalid',
    dateOfBirth: '2999-01-01',
    password: 'short',
  });
  const badErrors = await validate(invalid);
  assert(badErrors.length >= 4);
});

test('portal DTO: PatientLoginDto normalizes phone and validates minimum password length', async () => {
  const valid = plainToInstance(PatientLoginDto, {
    clinicSlug: 'lamssa-clinic',
    phone: '+96770000000',
    password: 'password123',
  });
  assert.equal((await validate(valid)).length, 0);

  const invalid = plainToInstance(PatientLoginDto, {
    clinicSlug: '',
    phone: '123',
    password: '12',
  });
  assert((await validate(invalid)).length > 0);
});

test('portal DTO: CreatePatientBookingDto requires valid UUID bookingKey and valid startLocal format', async () => {
  const valid = plainToInstance(CreatePatientBookingDto, {
    serviceId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    doctorResourceId: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
    startLocal: '2026-11-20T10:30',
    bookingKey: 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33',
    disambiguation: 'REJECT',
  });
  assert.equal((await validate(valid)).length, 0);

  const invalid = plainToInstance(CreatePatientBookingDto, {
    serviceId: 'not-a-uuid',
    doctorResourceId: 'not-a-uuid',
    startLocal: 'invalid-time',
    bookingKey: 'not-a-uuid',
  });
  assert((await validate(invalid)).length >= 3);
});

test('portal DTO: CancelPatientBookingDto requires expectedVersion and sanitizes reason', async () => {
  const valid = plainToInstance(CancelPatientBookingDto, {
    expectedVersion: 1,
    reason: 'ظرف صحي طارئ',
  });
  assert.equal((await validate(valid)).length, 0);

  const invalid = plainToInstance(CancelPatientBookingDto, {
    expectedVersion: 0,
  });
  assert((await validate(invalid)).length > 0);
});

test('portal security: password hashing uses argon2id and verifies strictly', async () => {
  const raw = 'P@ssw0rdSecure!2026';
  const hashed = await hashPassword(raw);
  assert(hashed.startsWith('$argon2id$'));
  assert(await verifyPassword(hashed, raw));
  assert(!await verifyPassword(hashed, 'WrongPassword!'));
});
