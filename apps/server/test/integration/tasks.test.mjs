import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createApi } from '../../dist/api.js';
import { DatabaseService } from '../../dist/infrastructure/database.service.js';

test(
  'personal deadlines, idempotent completion, history and statistics respect ownership',
  { timeout: 30000 },
  async () => {
    const app = await createApi({ quiet: true });
    const db = app.get(DatabaseService);
    const emails = [
      `tasks-a-${randomUUID()}@uniflow.local`,
      `tasks-b-${randomUUID()}@uniflow.local`,
    ];
    try {
      await app.listen(0, '127.0.0.1');
      const base = `${await app.getUrl()}/api/v1`;
      const request = (method, path, body, token) =>
        fetch(base + path, {
          method,
          headers: {
            'content-type': 'application/json',
            'x-uniflow-client': 'native',
            ...(token ? { authorization: `Bearer ${token}` } : {}),
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
        });
      async function account(email) {
        const password = 'Personal-task-password!';
        await request('POST', '/auth/register', {
          email,
          password,
          displayName: 'Студент',
          timeZone: 'UTC',
        });
        return request('POST', '/auth/login', { email, password })
          .then((r) => r.json())
          .then((d) => d.token);
      }
      const a = await account(emails[0]),
        b = await account(emails[1]);
      const subject = await request(
        'POST',
        '/subjects',
        { name: 'Предмет', color: '#6554D9' },
        a,
      ).then((r) => r.json());
      const future = new Date(Date.now() + 86400000).toISOString(),
        past = new Date(Date.now() - 86400000).toISOString();
      const body = {
        title: 'Подготовить доклад',
        description: 'Проверить источники',
        dueAt: future,
        subjectId: subject.id,
      };
      const created = await request('POST', '/tasks', body, a);
      assert.equal(created.status, 200);
      const first = await created.json();
      assert.equal((await request('POST', '/tasks', body, b)).status, 404);
      assert.equal(
        (await request('GET', '/tasks?status=ALL', undefined, b).then((r) => r.json())).total,
        0,
      );
      assert.equal((await request('PATCH', `/tasks/${first.id}`, body, b)).status, 404);
      assert.equal(
        (await request('POST', `/tasks/${first.id}/complete`, undefined, b)).status,
        404,
      );
      assert.equal((await request('GET', `/tasks/${first.id}/history`, undefined, b)).status, 404);
      const completed = await Promise.all([
        request('POST', `/tasks/${first.id}/complete`, undefined, a),
        request('POST', `/tasks/${first.id}/complete`, undefined, a),
      ]);
      assert.deepEqual(
        completed.map((r) => r.status),
        [200, 200],
      );
      assert.equal((await completed[0].json()).status, 'COMPLETED_ON_TIME');
      assert.equal(await db.taskEvent.count({ where: { taskId: first.id } }), 1);
      const edited = await request('PATCH', `/tasks/${first.id}`, { ...body, dueAt: past }, a).then(
        (r) => r.json(),
      );
      assert.equal(edited.status, 'COMPLETED_ON_TIME');
      assert.equal(edited.deadlineRevision, 2);
      assert.equal(edited.deadlineAtCompletion, future);
      assert.equal(
        (await request('POST', `/tasks/${first.id}/reopen`, undefined, a).then((r) => r.json()))
          .status,
        'OVERDUE',
      );
      assert.equal(
        (await request('POST', `/tasks/${first.id}/complete`, undefined, a).then((r) => r.json()))
          .status,
        'COMPLETED_LATE',
      );
      const history = await request('GET', `/tasks/${first.id}/history`, undefined, a).then((r) =>
        r.json(),
      );
      assert.deepEqual(
        history.items.map((event) => event.kind),
        ['COMPLETED', 'REOPENED', 'COMPLETED'],
      );
      const overdue = await request(
        'POST',
        '/tasks',
        { ...body, title: 'Просроченное задание', dueAt: past, subjectId: null },
        a,
      ).then((r) => r.json());
      const onTime = await request(
        'POST',
        '/tasks',
        { ...body, title: 'Задание вовремя', subjectId: null },
        a,
      ).then((r) => r.json());
      await request('POST', `/tasks/${onTime.id}/complete`, undefined, a);
      assert.deepEqual(await request('GET', '/statistics/me', undefined, a).then((r) => r.json()), {
        total: 3,
        open: 1,
        completedOnTime: 1,
        completedLate: 1,
        overdue: 1,
        completionRate: 67,
      });
      assert.equal(
        (await request('GET', '/statistics/me', undefined, b).then((r) => r.json())).total,
        0,
      );
      assert.deepEqual(
        (
          await request('GET', '/tasks?status=OVERDUE', undefined, a).then((r) => r.json())
        ).items.map((item) => item.id),
        [overdue.id],
      );
      assert.equal(
        (await request('POST', '/tasks', { ...body, dueAt: '2026-10-25T12:00:00' }, a)).status,
        400,
      );
      assert.equal(
        (await request('POST', '/tasks', { ...body, dueAt: '2026-02-30T12:00:00Z' }, a)).status,
        400,
      );
      assert.equal((await request('DELETE', `/tasks/${overdue.id}`, undefined, b)).status, 404);
      assert.equal((await request('DELETE', `/subjects/${subject.id}`, undefined, a)).status, 204);
      assert.equal((await db.task.findUnique({ where: { id: first.id } })).subjectId, null);
    } finally {
      await db.user.deleteMany({ where: { email: { in: emails } } });
      await app.close();
    }
  },
);
