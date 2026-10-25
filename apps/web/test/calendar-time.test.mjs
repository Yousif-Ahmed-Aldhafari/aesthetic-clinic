import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addDays, clinicToday, instantLabel, minuteText, timeLabel, weekdays, weekStart } from '../src/features/appointments/calendar-time.ts';
import { RequestScope } from '../src/lib/request-scope.ts';

test('clinicToday returns ISO date strictly in the specified clinic timezone', () => {
  // 2026-10-25 00:30 UTC is 2026-10-25 03:30 in Asia/Aden, but 2026-10-24 20:30 in America/New_York
  const sample = new Date('2026-10-25T00:30:00Z');
  assert.equal(clinicToday('Asia/Aden', sample), '2026-10-25');
  assert.equal(clinicToday('America/New_York', sample), '2026-10-24');
});

test('addDays handles positive, negative and month/year transitions in UTC', () => {
  assert.equal(addDays('2026-02-28', 1), '2026-03-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2027-01-01', -1), '2026-12-31');
  assert.equal(addDays('2026-10-25', 7), '2026-11-01');
});

test('weekStart anchors to the preceding Saturday across all seven weekdays', () => {
  // 2026-10-24 is Saturday
  assert.equal(weekStart('2026-10-24'), '2026-10-24');
  // 2026-10-25 is Sunday
  assert.equal(weekStart('2026-10-25'), '2026-10-24');
  // 2026-10-26 is Monday
  assert.equal(weekStart('2026-10-26'), '2026-10-24');
  // 2026-10-30 is Friday
  assert.equal(weekStart('2026-10-30'), '2026-10-24');
  // 2026-10-31 is the next Saturday
  assert.equal(weekStart('2026-10-31'), '2026-10-31');
});

test('minuteText formats minutes to HH:MM with zero padding', () => {
  assert.equal(minuteText(0), '00:00');
  assert.equal(minuteText(540), '09:00');
  assert.equal(minuteText(720), '12:00');
  assert.equal(minuteText(1080), '18:00');
  assert.equal(minuteText(1440), '24:00');
});

test('weekdays list maps all 7 days with Saturday as the first business day', () => {
  assert.equal(weekdays.length, 7);
  assert.equal(weekdays[0].value, 6);
  assert.equal(weekdays[0].label, 'السبت');
  assert.equal(weekdays[6].value, 5);
  assert.equal(weekdays[6].label, 'الجمعة');
});

test('scheduling request scopes maintain independent cancellation lifecycles', () => {
  const gates = {
    catalog: new RequestScope(),
    list: new RequestScope(),
    profile: new RequestScope(),
    write: new RequestScope(),
  };
  const catalogReq = gates.catalog.start();
  const listReq = gates.list.start();
  const writeReq = gates.write.start();

  // Switching calendar date or view cancels only the list query
  gates.list.cancel();
  assert.equal(listReq.signal.aborted, true);
  assert.equal(listReq.current(), false);
  assert.equal(catalogReq.signal.aborted, false);
  assert.equal(catalogReq.current(), true);
  assert.equal(writeReq.signal.aborted, false);
  assert.equal(writeReq.current(), true);

  // Switching clinic cancels all scopes
  Object.values(gates).forEach(g => g.cancel());
  assert.equal(catalogReq.signal.aborted, true);
  assert.equal(writeReq.signal.aborted, true);
});

