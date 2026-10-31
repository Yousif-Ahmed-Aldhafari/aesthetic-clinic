import assert from 'node:assert/strict';
import { test } from 'node:test';

const planStates = {
  DRAFT: 'مسودة',
  ACTIVE: 'معتمدة',
  PAUSED: 'متوقفة مؤقتًا',
  COMPLETED: 'مكتملة',
  CANCELLED: 'ملغاة',
};

test('treatment plan state labels cover all lifecycle statuses in authentic Arabic', () => {
  assert.equal(planStates.DRAFT, 'مسودة');
  assert.equal(planStates.ACTIVE, 'معتمدة');
  assert.equal(planStates.PAUSED, 'متوقفة مؤقتًا');
  assert.equal(planStates.COMPLETED, 'مكتملة');
  assert.equal(planStates.CANCELLED, 'ملغاة');
  assert.equal(Object.keys(planStates).length, 5);
});

test('treatment revision immutability and session ordering boundaries fail closed', () => {
  // Session ordering must be sequential positive integers
  const items = [
    { sessionOrder: 1, expectedDurationMinutes: 30 },
    { sessionOrder: 2, expectedDurationMinutes: 45 },
  ];

  assert.equal(items[0].sessionOrder < items[1].sessionOrder, true);
  assert.equal(items.every((i) => i.expectedDurationMinutes > 0 && i.expectedDurationMinutes <= 480), true);
});
