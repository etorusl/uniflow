import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createApi } from '../../dist/api.js';
import { DatabaseService } from '../../dist/infrastructure/database.service.js';
import { JobsService, REMINDER_RECONCILE_QUEUE } from '../../dist/infrastructure/jobs.service.js';
import {
  enqueueReminderChange,
  reminderKey,
} from '../../dist/modules/notifications/reminder-changes.js';
import { ReminderWorker } from '../../dist/modules/notifications/reminder-worker.js';
import { PushTransports } from '../../dist/modules/notifications/push-transports.js';

test(
  'reminder planning and inbox respect deadline revisions, reopening, membership and transaction rollback',
  { timeout: 30_000 },
  async () => {
    const app = await createApi({ quiet: true });
    const db = app.get(DatabaseService);
    const jobs = app.get(JobsService);
    const worker = app.get(ReminderWorker);
    const emails = Array.from({ length: 2 }, () => `reminders-${randomUUID()}@uniflow.local`);
    const revisions = [];
    let groupId;
    try {
      await app.listen(0, '127.0.0.1');
      const url = `${await app.getUrl()}/api/v1`;
      const request = (method, path, body, token) =>
        fetch(`${url}${path}`, {
          method,
          headers: {
            'content-type': 'application/json',
            'x-uniflow-client': 'native',
            ...(token ? { authorization: `Bearer ${token}` } : {}),
          },
          body: body ? JSON.stringify(body) : undefined,
        });
      async function account(email) {
        const password = 'Reminders-test-password!';
        assert.equal(
          (
            await request('POST', '/auth/register', {
              email,
              password,
              displayName: 'Студент',
              timeZone: 'UTC',
            })
          ).status,
          200,
        );
        return (await request('POST', '/auth/login', { email, password })).json();
      }
      const a = await account(emails[0]);
      const b = await account(emails[1]);
      const userId = a.user.id;
      // Simulate a configured Android transport while exercising real subscriptions and sessions.
      const transport = app.get(PushTransports);
      const available = transport.available.bind(transport);
      transport.available = (kind) => kind === 'ANDROID';
      const token = { transport: 'ANDROID', address: 'test-android-token:session-rotation' };
      const register = (account, payload = token) =>
        request('POST', '/notifications/subscriptions', payload, account.token);
      const subscribed = (account) =>
        request('GET', '/notifications/settings', undefined, account.token)
          .then((response) => response.json())
          .then((settings) => settings.subscribed);
      assert.equal((await register(a)).status, 204);
      assert.deepEqual(await subscribed(a), ['ANDROID']);
      assert.equal((await register(b, { ...token, refreshOnly: true })).status, 204);
      assert.deepEqual(await subscribed(b), []);
      assert.equal(
        (await request('DELETE', '/notifications/subscriptions/ANDROID', undefined, a.token))
          .status,
        204,
      );
      assert.equal((await register(a, { ...token, refreshOnly: true })).status, 204);
      assert.deepEqual(await subscribed(a), []);
      assert.equal((await register(b)).status, 204);
      assert.deepEqual(await subscribed(b), ['ANDROID']);
      transport.available = available;
      async function reconcile(change) {
        const key = reminderKey(change);
        revisions.push(key);
        const { version } = await db.reminderRevision.findUniqueOrThrow({ where: { key } });
        await worker.reconcile({ change, version });
      }
      const notices = (taskId) => db.reminderNotice.findMany({ where: { taskId, userId } });
      const inbox = (account) =>
        request('GET', '/notifications/inbox', undefined, account.token).then((r) => r.json());

      const rolledBackId = randomUUID();
      const rolledBack = { type: 'TASK', taskId: rolledBackId };
      await assert.rejects(
        db.$transaction(async (tx) => {
          await enqueueReminderChange(tx, jobs, rolledBack);
          throw new Error('rollback');
        }),
        /rollback/,
      );
      assert.equal(await db.reminderRevision.count({ where: { key: reminderKey(rolledBack) } }), 0);
      const [jobCount] = await db.$queryRaw`
      SELECT COUNT(*)::int AS count FROM pgboss.job
      WHERE name = ${REMINDER_RECONCILE_QUEUE} AND data->'change'->>'taskId' = ${rolledBackId}`;
      assert.equal(jobCount.count, 0);

      const title = 'Не включать заголовок в уведомление';
      const values = {
        title,
        description: '',
        dueAt: new Date(Date.now() + 5 * 60_000).toISOString(),
      };
      const task = await request('POST', '/tasks', values, a.token).then((r) => r.json());
      assert.ok(task.id);
      await reconcile({ type: 'TASK', taskId: task.id });
      assert.equal((await notices(task.id)).length, 0);

      const preferences = await request(
        'PATCH',
        '/notifications/settings',
        { enabled: true, minutesBefore: 60 },
        a.token,
      );
      assert.equal(preferences.status, 200);
      assert.equal((await preferences.json()).enabled, true);
      await reconcile({ type: 'USER', userId });
      const [beforeMove] = await notices(task.id);
      assert.ok(beforeMove);
      assert.equal(
        (
          await request(
            'PATCH',
            `/tasks/${task.id}`,
            { ...values, dueAt: new Date(Date.now() + 6 * 60_000).toISOString() },
            a.token,
          )
        ).status,
        200,
      );
      await worker.publishNotice(beforeMove.id);
      assert.deepEqual(await inbox(a), { items: [], unreadCount: 0 });

      await reconcile({ type: 'TASK', taskId: task.id });
      const afterMove = (await notices(task.id)).find((item) => item.id !== beforeMove.id);
      assert.ok(afterMove);
      assert.equal(
        (await request('POST', `/tasks/${task.id}/complete`, undefined, a.token)).status,
        200,
      );
      await worker.publishNotice(afterMove.id);
      assert.equal((await inbox(a)).items.length, 0);
      assert.equal(
        (await request('POST', `/tasks/${task.id}/reopen`, undefined, a.token)).status,
        200,
      );
      await reconcile({ type: 'TASK', taskId: task.id });
      const reopened = (await notices(task.id)).find(
        (item) => ![beforeMove.id, afterMove.id].includes(item.id),
      );
      assert.ok(reopened);
      await Promise.all([worker.publishNotice(reopened.id), worker.publishNotice(reopened.id)]);
      const visible = await inbox(a);
      assert.equal(visible.unreadCount, 1);
      assert.equal(visible.items[0].taskId, task.id);
      assert.doesNotMatch(JSON.stringify(visible), new RegExp(title));
      assert.equal((await inbox(b)).items.length, 0);
      assert.equal(
        (await request('POST', `/notifications/inbox/${reopened.id}/read`, undefined, b.token))
          .status,
        404,
      );
      for (let i = 0; i < 2; i++)
        assert.equal(
          (await request('POST', `/notifications/inbox/${reopened.id}/read`, undefined, a.token))
            .status,
          204,
        );
      assert.equal((await inbox(a)).unreadCount, 0);

      const group = await db.studyGroup.create({
        data: {
          name: 'Группа напоминаний',
          subjectName: 'Материал',
          ownerId: b.user.id,
          members: { create: [{ userId }, { userId: b.user.id }] },
        },
      });
      groupId = group.id;
      const groupTask = await db.$transaction(async (tx) => {
        const created = await tx.groupTask.create({
          data: {
            groupId,
            authorId: b.user.id,
            mode: 'INDIVIDUAL',
            title,
            dueAt: new Date(Date.now() + 5 * 60_000),
          },
        });
        await enqueueReminderChange(tx, jobs, { type: 'GROUP_TASK', taskId: created.id });
        return created;
      });
      await reconcile({ type: 'GROUP_TASK', taskId: groupTask.id });
      const [groupNotice] = await notices(groupTask.id);
      await worker.publishNotice(groupNotice.id);
      assert.equal(
        (await inbox(a)).items.some((item) => item.id === groupNotice.id),
        true,
      );
      await db.$transaction(async (tx) => {
        await tx.groupMember.update({
          where: { groupId_userId: { groupId, userId } },
          data: { leftAt: new Date() },
        });
        const change = { type: 'GROUP_USER', groupId, userId };
        revisions.push(reminderKey(change));
        await enqueueReminderChange(tx, jobs, change);
      });
      assert.equal(
        (await inbox(a)).items.some((item) => item.id === groupNotice.id),
        false,
      );
      assert.equal(
        (await request('POST', `/notifications/inbox/${groupNotice.id}/read`, undefined, a.token))
          .status,
        404,
      );
    } finally {
      if (groupId) await db.studyGroup.delete({ where: { id: groupId } });
      await db.user.deleteMany({ where: { email: { in: emails } } });
      await db.reminderRevision.deleteMany({ where: { key: { in: revisions } } });
      await app.close();
    }
  },
);
