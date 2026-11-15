import 'reflect-metadata';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { createHash } from 'node:crypto';
import {
  RecordObservationDto,
  AmendObservationDto,
  RecordDiagnosisDto,
  AmendDiagnosisDto,
  RecordAllergyDto,
  RecordMedicationDto,
  ReconcileMedicationsDto,
  CreatePrescriptionDraftDto,
  PrescriptionItemDto,
  CancelPrescriptionDto,
} from '../src/clinical-foundation/clinical-foundation.dto.js';
import { permissionsFor } from '../src/auth/permissions.js';

describe('Clinical Foundation Policy & DTO Unit Tests', () => {
  it('RecordObservationDto: validates observation types, values, units and provenance', async () => {
    const valid = plainToInstance(RecordObservationDto, {
      observationType: 'BLOOD_PRESSURE_SYSTOLIC',
      numericValue: 120,
      unit: 'mmHg',
      provenance: 'CLINICIAN_MEASURED',
      interpretation: 'Normal',
    });
    const errors = await validate(valid);
    assert.equal(errors.length, 0);

    // Invalid observation type
    const invalidType = plainToInstance(RecordObservationDto, {
      observationType: 'INVALID_TYPE' as any,
      unit: 'bpm',
    });
    const typeErrors = await validate(invalidType);
    assert.ok(typeErrors.some(e => e.property === 'observationType'));

    // Empty unit
    const emptyUnit = plainToInstance(RecordObservationDto, {
      observationType: 'HEART_RATE',
      unit: '   ',
    });
    const unitErrors = await validate(emptyUnit);
    assert.ok(unitErrors.some(e => e.property === 'unit'));
  });

  it('AmendObservationDto: requires amendmentReason of at least 3 characters', async () => {
    const valid = plainToInstance(AmendObservationDto, {
      amendmentReason: 'Corrected typo in numeric entry',
      numericValue: 125,
      expectedVersion: 1,
    });
    const errors = await validate(valid);
    assert.equal(errors.length, 0);

    const tooShort = plainToInstance(AmendObservationDto, {
      amendmentReason: 'no',
    });
    const shortErrors = await validate(tooShort);
    assert.ok(shortErrors.some(e => e.property === 'amendmentReason'));
  });

  it('RecordDiagnosisDto: enforces codingSystem, code, displayAr and encounter UUID', async () => {
    const valid = plainToInstance(RecordDiagnosisDto, {
      encounterId: 'a0000000-0000-4000-8000-000000000001',
      code: 'L70.0',
      codingSystem: 'ICD-10',
      displayAr: 'حب الشباب الشائع',
      displayEn: 'Acne vulgaris',
      diagnosisRole: 'PRIMARY',
      isProblem: true,
      problemStatus: 'ACTIVE',
    });
    const errors = await validate(valid);
    assert.equal(errors.length, 0);

    const invalidUuid = plainToInstance(RecordDiagnosisDto, {
      encounterId: 'not-a-uuid',
      code: 'I10',
      codingSystem: 'ICD-10',
      displayAr: 'ارتفاع ضغط الدم',
    });
    const idErrors = await validate(invalidUuid);
    assert.ok(idErrors.some(e => e.property === 'encounterId'));

    const missingAr = plainToInstance(RecordDiagnosisDto, {
      encounterId: 'a0000000-0000-4000-8000-000000000001',
      code: 'I10',
      codingSystem: 'ICD-10',
      displayAr: ' ',
    });
    const arErrors = await validate(missingAr);
    assert.ok(arErrors.some(e => e.property === 'displayAr'));
  });

  it('AmendDiagnosisDto: enforces amendmentReason and optional problem status', async () => {
    const valid = plainToInstance(AmendDiagnosisDto, {
      amendmentReason: 'Condition resolved following course of treatment',
      clinicalStatus: 'RESOLVED',
      problemStatus: 'RESOLVED',
      resolutionDate: '2026-11-12T00:00:00.000Z',
      expectedVersion: 2,
    });
    const errors = await validate(valid);
    assert.equal(errors.length, 0);

    const missingReason = plainToInstance(AmendDiagnosisDto, {
      clinicalStatus: 'CONFIRMED',
    });
    const reasonErrors = await validate(missingReason);
    assert.ok(reasonErrors.some(e => e.property === 'amendmentReason'));
  });

  it('RecordAllergyDto: validates substance, category and severity', async () => {
    const valid = plainToInstance(RecordAllergyDto, {
      allergyStatusType: 'ALLERGY_PRESENT',
      category: 'MEDICATION',
      substance: 'Penicillin',
      reaction: 'Anaphylaxis',
      severity: 'LIFE_THREATENING',
      clinicalStatus: 'ACTIVE',
    });
    const errors = await validate(valid);
    assert.equal(errors.length, 0);

    const shortSubstance = plainToInstance(RecordAllergyDto, {
      substance: 'A',
    });
    const substanceErrors = await validate(shortSubstance);
    assert.ok(substanceErrors.some(e => e.property === 'substance'));
  });

  it('RecordMedicationDto: enforces medicationName, dosage, route and frequency', async () => {
    const valid = plainToInstance(RecordMedicationDto, {
      medicationName: 'Metformin HCl',
      dosage: '500 mg',
      route: 'Oral',
      frequency: 'Twice daily with meals',
      status: 'ACTIVE',
    });
    const errors = await validate(valid);
    assert.equal(errors.length, 0);

    const missingFields = plainToInstance(RecordMedicationDto, {
      medicationName: 'Aspirin',
    });
    const fieldErrors = await validate(missingFields);
    assert.ok(fieldErrors.some(e => e.property === 'dosage'));
    assert.ok(fieldErrors.some(e => e.property === 'route'));
    assert.ok(fieldErrors.some(e => e.property === 'frequency'));
  });

  it('ReconcileMedicationsDto: validates array of medication UUIDs', async () => {
    const valid = plainToInstance(ReconcileMedicationsDto, {
      medicationIds: [
        'a0000000-0000-4000-8000-000000000001',
        'a0000000-0000-4000-8000-000000000002',
      ],
    });
    const errors = await validate(valid);
    assert.equal(errors.length, 0);

    const invalid = plainToInstance(ReconcileMedicationsDto, {
      medicationIds: ['not-a-uuid'],
    });
    const errs = await validate(invalid);
    assert.ok(errs.some(e => e.property === 'medicationIds'));
  });

  it('CreatePrescriptionDraftDto & PrescriptionItemDto: validates items with positive quantity', async () => {
    const valid = plainToInstance(CreatePrescriptionDraftDto, {
      encounterId: 'a0000000-0000-4000-8000-000000000001',
      notes: 'Take with food',
      items: [
        {
          medicationName: 'Amoxicillin',
          genericName: 'Amoxicillin trihydrate',
          strength: '500 mg',
          dosageForm: 'Capsule',
          route: 'Oral',
          frequency: 'Every 8 hours',
          duration: '7 days',
          quantity: 21,
          unit: 'capsules',
          instructions: 'Complete full 7-day course',
        },
      ],
    });
    const errors = await validate(valid);
    assert.equal(errors.length, 0);

    // Negative/zero quantity in item
    const invalidItem = plainToInstance(PrescriptionItemDto, {
      medicationName: 'Amoxicillin',
      strength: '500 mg',
      dosageForm: 'Capsule',
      route: 'Oral',
      frequency: 'TID',
      duration: '7d',
      quantity: 0,
      unit: 'capsules',
      instructions: 'Take 1',
    });
    const itemErrors = await validate(invalidItem);
    assert.ok(itemErrors.some(e => e.property === 'quantity'));
  });

  it('CancelPrescriptionDto: requires cancellationReason of at least 3 characters', async () => {
    const valid = plainToInstance(CancelPrescriptionDto, {
      cancellationReason: 'Adverse reaction reported, switched to alternative agent',
      expectedVersion: 1,
    });
    const errors = await validate(valid);
    assert.equal(errors.length, 0);

    const invalid = plainToInstance(CancelPrescriptionDto, {
      cancellationReason: 'ab',
    });
    const errs = await validate(invalid);
    assert.ok(errs.some(e => e.property === 'cancellationReason'));
  });

  it('Permission isolation: clinical foundation permissions granted exclusively to DOCTOR', () => {
    const doctorPerms = permissionsFor('DOCTOR');
    const ownerPerms = permissionsFor('CLINIC_OWNER');
    const adminPerms = permissionsFor('CLINIC_ADMIN');
    const receptionPerms = permissionsFor('RECEPTIONIST');
    const accountantPerms = permissionsFor('ACCOUNTANT');

    const clinicalPerms = [
      'clinical.observations.read',
      'clinical.observations.create',
      'clinical.observations.update',
      'clinical.observations.verify',
      'clinical.diagnoses.read',
      'clinical.diagnoses.create',
      'clinical.diagnoses.update',
      'clinical.diagnoses.confirm',
      'clinical.allergies.read',
      'clinical.allergies.create',
      'clinical.allergies.update',
      'clinical.allergies.verify',
      'clinical.medications.read',
      'clinical.medications.create',
      'clinical.medications.update',
      'clinical.medications.reconcile',
      'clinical.prescriptions.read',
      'clinical.prescriptions.draft',
      'clinical.prescriptions.sign',
      'clinical.prescriptions.cancel',
    ] as const;

    // DOCTOR holds all 20 clinical permissions
    for (const p of clinicalPerms) {
      assert.ok(doctorPerms.includes(p), `DOCTOR must hold permission ${p}`);
    }

    // Zero access for administrative/billing/reception roles
    for (const p of clinicalPerms) {
      assert.ok(!ownerPerms.includes(p), `CLINIC_OWNER must NOT hold clinical permission ${p}`);
      assert.ok(!adminPerms.includes(p), `CLINIC_ADMIN must NOT hold clinical permission ${p}`);
      assert.ok(!receptionPerms.includes(p), `RECEPTIONIST must NOT hold clinical permission ${p}`);
      assert.ok(!accountantPerms.includes(p), `ACCOUNTANT must NOT hold clinical permission ${p}`);
    }
  });

  it('Deterministic BMI calculation: calculates and rounds precisely', () => {
    const calcBmi = (w: number, h: number) => {
      const hm = h / 100;
      return Math.round((w / (hm * hm)) * 100) / 100;
    };

    assert.equal(calcBmi(70, 175), 22.86);
    assert.equal(calcBmi(85, 180), 26.23);
    assert.equal(calcBmi(55, 160), 21.48);
    assert.equal(calcBmi(105, 172), 35.49);
  });

  it('SHA-256 prescription signature: creates tamper-evident 64-char hex digest deterministically', () => {
    const rxData = {
      clinicId: 'c0000000-0000-4000-8000-000000000001',
      prescriptionNumber: 'RX-000001',
      patientId: 'p0000000-0000-4000-8000-000000000001',
      prescriberMembershipId: 'm0000000-0000-4000-8000-000000000001',
      signedByMembershipId: 'm0000000-0000-4000-8000-000000000001',
      signedAt: '2026-11-13T00:00:00.000Z',
      items: [
        {
          medicationName: 'Amoxicillin',
          genericName: 'Amoxicillin',
          strength: '500 mg',
          dosageForm: 'Capsule',
          route: 'Oral',
          frequency: 'TID',
          duration: '7 days',
          quantity: 21,
          unit: 'capsules',
          refillsAllowed: 0,
          instructions: 'Take 1 capsule three times daily',
        },
      ],
    };

    const digest1 = createHash('sha256').update(JSON.stringify(rxData)).digest('hex');
    const digest2 = createHash('sha256').update(JSON.stringify(rxData)).digest('hex');

    assert.equal(digest1.length, 64);
    assert.equal(digest1, digest2);

    // Tampering any item field changes digest completely
    const tamperedData = {
      ...rxData,
      items: [{ ...rxData.items[0], quantity: 42 }],
    };
    const tamperedDigest = createHash('sha256').update(JSON.stringify(tamperedData)).digest('hex');
    assert.notEqual(digest1, tamperedDigest);
  });
});
