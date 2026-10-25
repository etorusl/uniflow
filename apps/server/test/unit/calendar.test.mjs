import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  calendarDate,
  localInstant,
  matchesWeek,
  weekNumber,
} from '../../dist/modules/schedule/calendar.js';

test('academic parity follows the configured Monday across calendar years', () => {
  assert.equal(weekNumber('2026-09-07', '2026-08-31'), 2);
  assert.equal(matchesWeek('2026-09-07', 1, 'EVEN', '2026-08-31'), true);
  assert.equal(matchesWeek('2026-09-14', 1, 'EVEN', '2026-08-31'), false);
  assert.equal(weekNumber('2027-01-04', '2026-12-28'), 2);
  assert.throws(() => calendarDate('2026-02-30'));
});
test('wall-clock time uses IANA offsets and rejects missing DST times', () => {
  assert.equal(
    localInstant('2026-10-25', '09:00', 'Asia/Novosibirsk').toISO(),
    '2026-10-25T02:00:00.000Z',
  );
  assert.throws(() => localInstant('2026-03-08', '02:30', 'America/New_York'), /не существует/);
  assert.equal(
    localInstant('2026-11-01', '01:30', 'America/New_York').toISO(),
    '2026-11-01T05:30:00.000Z',
  );
});
