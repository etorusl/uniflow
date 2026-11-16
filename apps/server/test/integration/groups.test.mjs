import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createApi } from '../../dist/api.js';
import { DatabaseService } from '../../dist/infrastructure/database.service.js';

test(
  'group memberships, invitations, task modes and history preserve their access boundaries',
  { timeout: 45_000 },
  async () => {
    const app = await createApi({ quiet: true });
    const db = app.get(DatabaseService);
    const emails = [];
    const groupIds = [];
    try {
      await app.listen(0, '127.0.0.1');
      const base = `${await app.getUrl()}/api/v1`;
      async function request(account, method, path, body) {
        const response = await fetch(base + path, {
          method,
          headers: {
            'content-type': 'application/json',
            'x-uniflow-client': 'native',
            ...(account ? { authorization: `Bearer ${account.token}` } : {}),
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
        return {
          status: response.status,
          data: response.status === 204 ? null : await response.json(),
        };
      }
      async function expectStatus(account, method, path, body, status) {
        const response = await request(account, method, path, body);
        assert.equal(
          response.status,
          status,
          `${method} ${path}: ${JSON.stringify(response.data)}`,
        );
        return response.data;
      }
      async function account(displayName) {
        const email = `groups-${randomUUID()}@uniflow.local`;
        emails.push(email);
        const password = 'Test-group-password!2026';
        await expectStatus(
          null,
          'POST',
          '/auth/register',
          { email, password, displayName, timeZone: 'UTC' },
          200,
        );
        const login = await expectStatus(null, 'POST', '/auth/login', { email, password }, 200);
        return { id: login.user.id, token: login.token };
      }

      const owner = await account('Группы владелец');
      const moderator = await account('Группы модератор');
      const a = await account('Группы участник А');
      const b = await account('Группы участник Б');
      const outsider = await account('Группы посторонний');

      const group = await expectStatus(
        owner,
        'POST',
        '/groups',
        { name: 'Практикум', subjectName: 'Физика' },
        201,
      );
      groupIds.push(group.id);
      const path = `/groups/${group.id}`;
      assert.equal(group.role, 'OWNER');
      await expectStatus(owner, 'POST', path + '/leave', {}, 409);
      await expectStatus(outsider, 'GET', path, undefined, 404);

      const invitation = await expectStatus(
        owner,
        'POST',
        path + '/invitations',
        { maxUses: 4 },
        201,
      );
      assert.equal(new URL(invitation.url).searchParams.get('invite'), invitation.code);
      assert.equal(
        (await db.groupInvitation.findUniqueOrThrow({ where: { id: invitation.id } })).tokenHash ===
          invitation.code,
        false,
      );
      const join = (actor, token = invitation.code, status = 200) =>
        expectStatus(actor, 'POST', '/groups/join', { code: token }, status);
      await Promise.all([join(a), join(a), join(b), join(moderator)]);
      assert.equal(
        (await db.groupInvitation.findUniqueOrThrow({ where: { id: invitation.id } })).uses,
        3,
      );
      assert.equal((await expectStatus(a, 'GET', '/groups', undefined, 200)).total, 1);
      const members = await expectStatus(a, 'GET', path + '/members', undefined, 200);
      assert.equal(members.total, 4);
      assert.ok(members.items.every((person) => !('email' in person)));
      await expectStatus(a, 'PATCH', path + `/members/${a.id}`, { role: 'MODERATOR' }, 403);
      await expectStatus(
        owner,
        'PATCH',
        path + `/members/${moderator.id}`,
        { role: 'MODERATOR' },
        204,
      );
      await expectStatus(moderator, 'DELETE', path + `/members/${owner.id}`, undefined, 403);
      await expectStatus(
        moderator,
        'DELETE',
        path + `/invitations/${invitation.id}`,
        undefined,
        403,
      );
      const modInvite = await expectStatus(moderator, 'POST', path + '/invitations', {}, 201);
      await expectStatus(
        moderator,
        'DELETE',
        path + `/invitations/${modInvite.id}`,
        undefined,
        204,
      );
      await join(outsider, modInvite.code, 404);

      const expired = await expectStatus(owner, 'POST', path + '/invitations', {}, 201);
      await db.groupInvitation.update({
        where: { id: expired.id },
        data: {
          createdAt: new Date(Date.now() - 60_000),
          expiresAt: new Date(Date.now() - 30_000),
        },
      });
      await join(outsider, expired.code, 404);

      const deadline = new Date(Date.now() + 86_400_000).toISOString();
      const old = new Date(Date.now() - 86_400_000).toISOString();
      const draft = {
        title: 'Подготовить лабораторную',
        description: 'Сдать отчёт',
        dueAt: deadline,
      };
      const individual = await expectStatus(
        a,
        'POST',
        path + '/tasks',
        { ...draft, mode: 'INDIVIDUAL' },
        201,
      );
      const shared = await expectStatus(
        a,
        'POST',
        path + '/tasks',
        { ...draft, title: 'Загрузить презентацию', mode: 'SHARED' },
        201,
      );
      const one = path + `/tasks/${individual.id}`;
      const all = path + `/tasks/${shared.id}`;
      await expectStatus(outsider, 'GET', one, undefined, 404);
      await expectStatus(moderator, 'PATCH', one, draft, 403);
      await expectStatus(a, 'PATCH', one, { ...draft, mode: 'SHARED' }, 400);
      await expectStatus(b, 'POST', all + '/complete', {}, 403);
      await Promise.all([
        expectStatus(a, 'POST', one + '/complete', {}, 200),
        expectStatus(a, 'POST', one + '/complete', {}, 200),
      ]);
      assert.equal((await expectStatus(a, 'GET', one + '/history', undefined, 200)).total, 1);
      assert.equal((await expectStatus(b, 'GET', one + '/history', undefined, 200)).total, 0);
      assert.equal((await expectStatus(b, 'GET', one, undefined, 200)).completedAt, null);
      const edited = await expectStatus(a, 'PATCH', one, { ...draft, dueAt: old }, 200);
      assert.equal(edited.deadlineRevision, 2);
      assert.equal(edited.status, 'COMPLETED_ON_TIME');
      assert.equal(edited.deadlineAtCompletion, deadline);
      assert.equal(
        (await expectStatus(b, 'POST', one + '/complete', {}, 200)).status,
        'COMPLETED_LATE',
      );
      await expectStatus(moderator, 'POST', all + '/complete', {}, 200);
      assert.equal((await expectStatus(b, 'GET', all, undefined, 200)).status, 'COMPLETED_ON_TIME');
      assert.equal(
        (await expectStatus(a, 'GET', path + '/statistics', undefined, 200)).completedOnTime,
        1,
      );
      assert.equal((await expectStatus(a, 'GET', '/statistics/me', undefined, 200)).total, 1);
      assert.equal(
        (await expectStatus(b, 'GET', '/statistics/me', undefined, 200)).completedLate,
        1,
      );
      const completed = await expectStatus(
        a,
        'GET',
        '/groups/tasks?status=COMPLETED&mode=INDIVIDUAL',
        undefined,
        200,
      );
      assert.deepEqual(
        completed.items.map((task) => task.id),
        [individual.id],
      );

      await expectStatus(a, 'POST', path + '/leave', {}, 204);
      await expectStatus(a, 'GET', one, undefined, 404);
      assert.equal((await expectStatus(a, 'GET', '/statistics/me', undefined, 200)).total, 0);
      await join(a);
      assert.equal((await expectStatus(a, 'GET', one, undefined, 200)).status, 'COMPLETED_ON_TIME');
      await join(outsider, invitation.code, 404);
      await expectStatus(
        owner,
        'POST',
        path + '/transfer-ownership',
        { userId: moderator.id },
        200,
      );
      assert.equal((await expectStatus(owner, 'GET', path, undefined, 200)).role, 'MODERATOR');
      assert.equal((await expectStatus(moderator, 'GET', path, undefined, 200)).role, 'OWNER');
      await expectStatus(owner, 'DELETE', path + `/members/${a.id}`, undefined, 204);
      await join(a, invitation.code, 404);
      const fresh = await expectStatus(moderator, 'POST', path + '/invitations', {}, 201);
      await join(a, fresh.code, 404);
      await expectStatus(moderator, 'POST', path + `/members/${a.id}/unblock`, {}, 204);
      await join(a, fresh.code);
      await expectStatus(moderator, 'POST', all + '/reopen', {}, 200);
      assert.equal((await expectStatus(b, 'GET', all, undefined, 200)).completedAt, null);
      await expectStatus(moderator, 'DELETE', one, undefined, 204);
      assert.equal((await expectStatus(b, 'GET', '/statistics/me', undefined, 200)).total, 0);
      await expectStatus(moderator, 'DELETE', path, undefined, 204);
      await expectStatus(owner, 'GET', path, undefined, 404);
      await join(outsider, fresh.code, 404);
    } finally {
      await db.studyGroup.deleteMany({ where: { id: { in: groupIds } } });
      await db.user.deleteMany({ where: { email: { in: emails } } });
      await app.close();
    }
  },
);
