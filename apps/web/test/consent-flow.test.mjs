import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isConsentEligibleForProcedure, validateSignerInformation } from '../src/features/consent/consent-logic.ts';

test('isConsentEligibleForProcedure strictly enforces ACTIVE status, PROCEDURE purpose, and procedure match', () => {
  const procId = 'catalog-uuid-1';
  const now = '2026-10-30T10:00:00.000Z';

  // Valid active procedure consent
  assert.equal(
    isConsentEligibleForProcedure({ status: 'ACTIVE', purpose: 'PROCEDURE', procedureCatalogId: procId, expiresAt: '2027-10-30T10:00:00.000Z' }, procId, now),
    true
  );

  // Marketing purpose can NEVER satisfy procedure execution
  assert.equal(
    isConsentEligibleForProcedure({ status: 'ACTIVE', purpose: 'MARKETING_PHOTOGRAPHY', procedureCatalogId: procId }, procId, now),
    false
  );

  // Clinical photography purpose can NEVER satisfy procedure execution
  assert.equal(
    isConsentEligibleForProcedure({ status: 'ACTIVE', purpose: 'CLINICAL_PHOTOGRAPHY', procedureCatalogId: procId }, procId, now),
    false
  );

  // Mismatched procedure catalog ID
  assert.equal(
    isConsentEligibleForProcedure({ status: 'ACTIVE', purpose: 'PROCEDURE', procedureCatalogId: 'other-catalog-uuid' }, procId, now),
    false
  );

  // Withdrawn or Draft status
  assert.equal(
    isConsentEligibleForProcedure({ status: 'WITHDRAWN', purpose: 'PROCEDURE', procedureCatalogId: procId }, procId, now),
    false
  );
  assert.equal(
    isConsentEligibleForProcedure({ status: 'DRAFT', purpose: 'PROCEDURE', procedureCatalogId: procId }, procId, now),
    false
  );

  // Expired consent
  assert.equal(
    isConsentEligibleForProcedure({ status: 'ACTIVE', purpose: 'PROCEDURE', procedureCatalogId: procId, expiresAt: '2026-10-01T00:00:00.000Z' }, procId, now),
    false
  );
});

test('validateSignerInformation enforces relationship requirement for non-patient capacities', () => {
  // Valid patient
  assert.deepEqual(validateSignerInformation({ capacity: 'PATIENT', name: 'أحمد علي' }), { valid: true });

  // Missing name
  assert.equal(validateSignerInformation({ capacity: 'PATIENT', name: ' ' }).valid, false);

  // Guardian without relationship description fails
  assert.equal(validateSignerInformation({ capacity: 'GUARDIAN', name: 'خالد محمد', relationshipDescription: '' }).valid, false);

  // Guardian with valid relationship succeeds
  assert.deepEqual(validateSignerInformation({ capacity: 'GUARDIAN', name: 'خالد محمد', relationshipDescription: 'والد المريضة' }), { valid: true });
});
