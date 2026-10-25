import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createApi } from '../../dist/api.js';
import { DatabaseService } from '../../dist/infrastructure/database.service.js';

test(
  'catalog and schedule isolate users, apply parity, and move only one occurrence',
  { timeout: 30000 },
  async () => {
    const app = await createApi({ quiet: true });
    const db = app.get(DatabaseService);
    const emails = [
      `schedule-a-${randomUUID()}@uniflow.local`,
      `schedule-b-${randomUUID()}@uniflow.local`,
    ];
    try {
      await app.listen(0, '127.0.0.1');
      const base = `${await app.getUrl()}/api/v1`;
      async function request(method, path, body, token) {
        return fetch(base + path, {
          method,
          headers: {
            'content-type': 'application/json',
            ...(token ? { authorization: `Bearer ${token}` } : {}),
            'x-uniflow-client': 'native',
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
        });
      }
      async function account(email) {
        const body = {
          email,
          password: 'Schedule-test-password!',
          displayName: 'Студент',
          timeZone: 'Asia/Novosibirsk',
        };
        assert.equal((await request('POST', '/auth/register', body)).status, 200);
        return (
          await request('POST', '/auth/login', { email, password: body.password }).then(
            (response) => response.json(),
          )
        ).token;
      }
      const a = await account(emails[0]),
        b = await account(emails[1]);
      assert.equal((await request('GET', '/subjects')).status, 401);
      const subject = await request(
        'POST',
        '/subjects',
        { name: 'Математика', color: '#6554D9' },
        a,
      ).then((response) => response.json());
      const teacher = await request(
        'POST',
        '/teachers',
        { name: 'Преподаватель', email: 'teacher@uniflow.local' },
        a,
      ).then((response) => response.json());
      const semester = await request(
        'POST',
        '/semesters',
        {
          name: 'Осень',
          startDate: '2026-09-01',
          endDate: '2026-12-31',
          weekStartDate: '2026-08-31',
          timeZone: 'Asia/Novosibirsk',
        },
        a,
      ).then((response) => response.json());
      assert.equal(
        (await request('GET', '/subjects', undefined, b).then((response) => response.json())).total,
        0,
      );
      assert.equal(
        (await request('PATCH', `/subjects/${subject.id}`, { name: 'Чужое', color: '#6554D9' }, b))
          .status,
        404,
      );
      const body = {
        semesterId: semester.id,
        subjectId: subject.id,
        teacherId: teacher.id,
        dayOfWeek: 1,
        startTime: '09:00',
        endTime: '10:30',
        parity: 'EVEN',
        room: '201',
      };
      assert.equal((await request('POST', '/schedule/entries', body, b)).status, 404);
      const created = await request('POST', '/schedule/entries', body, a);
      assert.equal(created.status, 200);
      const entry = await created.json();
      const read = (from, to) =>
        request('GET', `/schedule/occurrences?from=${from}&to=${to}`, undefined, a).then(
          (response) => response.json(),
        );
      const initial = await read('2026-09-07', '2026-09-28');
      assert.deepEqual(
        initial.items.map((item) => item.originalDate),
        ['2026-09-07', '2026-09-21'],
      );
      assert.equal(initial.items[0].startsAt, '2026-09-07T02:00:00.000Z');
      assert.equal(
        (
          await request(
            'PUT',
            `/schedule/entries/${entry.id}/exceptions/2026-09-07`,
            { cancelled: true },
            b,
          )
        ).status,
        404,
      );
      assert.equal(
        (
          await request(
            'PUT',
            `/schedule/entries/${entry.id}/exceptions/2026-09-07`,
            { cancelled: true },
            a,
          )
        ).status,
        204,
      );
      assert.deepEqual(
        (await read('2026-09-07', '2026-09-28')).items.map((item) => item.cancelled),
        [true, false],
      );
      assert.equal(
        (
          await request(
            'PUT',
            `/schedule/entries/${entry.id}/exceptions/2026-09-07`,
            {
              cancelled: false,
              replacementDate: '2026-09-09',
              startTime: '12:00',
              endTime: '13:30',
            },
            a,
          )
        ).status,
        204,
      );
      const moved = await read('2026-09-09', '2026-09-09');
      assert.equal(moved.items.length, 1);
      assert.equal(moved.items[0].moved, true);
      assert.equal(moved.items[0].startsAt, '2026-09-09T05:00:00.000Z');
      assert.equal((await read('2026-09-21', '2026-09-21')).items[0].moved, false);
      assert.equal((await request('DELETE', `/subjects/${subject.id}`, undefined, a)).status, 409);
      assert.equal(
        (await request('PATCH', `/schedule/entries/${entry.id}`, { ...body, room: '101' }, a))
          .status,
        200,
      );
      assert.equal((await read('2026-09-07', '2026-09-07')).items[0].moved, false);
      assert.equal((await read('2026-09-09', '2026-09-09')).items.length, 0);
      assert.equal((await request('GET', '/subjects?page=0', undefined, a)).status, 400);
      assert.equal(
        (
          await request(
            'POST',
            '/schedule/entries',
            { ...body, startTime: '11:00', endTime: '10:00' },
            a,
          )
        ).status,
        400,
      );
      assert.equal(
        (await request('DELETE', `/semesters/${semester.id}`, undefined, a)).status,
        204,
      );
      assert.equal(
        (
          await request('GET', '/schedule/entries', undefined, a).then((response) =>
            response.json(),
          )
        ).total,
        0,
      );
    } finally {
      await db.scheduleEntry.deleteMany({ where: { user: { email: { in: emails } } } });
      await db.user.deleteMany({ where: { email: { in: emails } } });
      await app.close();
    }
  },
);
