import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isPhotographyConsentActive, validateComparisonPair } from '../src/features/clinical-photos/photo-logic.ts';

test('isPhotographyConsentActive strictly enforces CLINICAL_PHOTOGRAPHY purpose and ACTIVE status', () => {
  const now = '2026-10-30T10:00:00.000Z';

  // Valid active clinical photography consent
  assert.equal(
    isPhotographyConsentActive(
      {
        purpose: 'CLINICAL_PHOTOGRAPHY',
        status: 'ACTIVE',
        validFrom: '2026-10-01T00:00:00.000Z',
        expiresAt: '2027-10-01T00:00:00.000Z',
      },
      now,
    ),
    true,
  );

  // PROCEDURE consent must NEVER satisfy clinical photography
  assert.equal(
    isPhotographyConsentActive(
      {
        purpose: 'PROCEDURE',
        status: 'ACTIVE',
        validFrom: '2026-10-01T00:00:00.000Z',
        expiresAt: '2027-10-01T00:00:00.000Z',
      },
      now,
    ),
    false,
  );

  // MARKETING_PHOTOGRAPHY consent must NEVER satisfy clinical photography
  assert.equal(
    isPhotographyConsentActive(
      {
        purpose: 'MARKETING_PHOTOGRAPHY',
        status: 'ACTIVE',
        validFrom: '2026-10-01T00:00:00.000Z',
        expiresAt: '2027-10-01T00:00:00.000Z',
      },
      now,
    ),
    false,
  );

  // Withdrawn consent
  assert.equal(
    isPhotographyConsentActive(
      {
        purpose: 'CLINICAL_PHOTOGRAPHY',
        status: 'ACTIVE',
        withdrawal: { id: 'withdrawal-uuid' },
      },
      now,
    ),
    false,
  );

  // Expired consent
  assert.equal(
    isPhotographyConsentActive(
      {
        purpose: 'CLINICAL_PHOTOGRAPHY',
        status: 'ACTIVE',
        expiresAt: '2026-10-15T00:00:00.000Z',
      },
      now,
    ),
    false,
  );

  // Future validFrom
  assert.equal(
    isPhotographyConsentActive(
      {
        purpose: 'CLINICAL_PHOTOGRAPHY',
        status: 'ACTIVE',
        validFrom: '2026-11-01T00:00:00.000Z',
      },
      now,
    ),
    false,
  );
});

test('validateComparisonPair enforces distinct assets, non-archived state, and correct chronological order', () => {
  const p1 = { id: 'photo-1', category: 'BEFORE', isArchived: false };
  const p2 = { id: 'photo-2', category: 'AFTER', isArchived: false };
  const pFollow = { id: 'photo-3', category: 'FOLLOW_UP', isArchived: false };
  const pArchived = { id: 'photo-4', category: 'BEFORE', isArchived: true };

  // Valid Before -> After
  assert.deepEqual(validateComparisonPair(p1, p2), { valid: true });

  // Valid Before -> Follow up
  assert.deepEqual(validateComparisonPair(p1, pFollow), { valid: true });

  // Identical photo
  assert.equal(validateComparisonPair(p1, p1).valid, false);

  // Inverted order (AFTER -> BEFORE)
  assert.equal(validateComparisonPair(p2, p1).valid, false);

  // Archived photo
  assert.equal(validateComparisonPair(pArchived, p2).valid, false);
});
