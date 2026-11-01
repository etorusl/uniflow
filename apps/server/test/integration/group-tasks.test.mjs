import assert from 'node:assert/strict';
import { test } from 'node:test';
import { harness } from '../helpers/api.mjs';

test(
  'individual and shared group tasks retain separate rights, histories and statistics through membership changes',
  { timeout: 60000 },
  async () => {
    const h = await harness();
    try {
      const owner = await h.account('Владелец'),
        mod = await h.account('Модератор'),
        a = await h.account('Анна'),
        b = await h.account('Борис'),
        late = await h.account('Поздний участник');
      const g = await h.json(owner.token, 'POST', '/groups', {
        name: 'Команда',
        subjectName: 'Физика',
        description: '',
      });
      const root = `/groups/${g.id}`,
        tasks = root + '/tasks';
      const invite = await h.json(owner.token, 'POST', root + '/invitations', {});
      for (const u of [mod, a, b])
        await h.json(u.token, 'POST', '/groups/join', { code: invite.code });
      await h.json(owner.token, 'PATCH', root + `/members/${mod.id}`, { role: 'MODERATOR' }, 204);
      const future = new Date(Date.now() + 86400000).toISOString(),
        past = new Date(Date.now() - 86400000).toISOString();
      const input = {
        title: 'Индивидуальное',
        description: 'Каждому своё',
        dueAt: future,
        mode: 'INDIVIDUAL',
      };
      const individual = await h.json(a.token, 'POST', tasks, input);
      const shared = await h.json(a.token, 'POST', tasks, {
        ...input,
        title: 'Общий проект',
        mode: 'SHARED',
      });
      const own = tasks + '/' + individual.id,
        common = tasks + '/' + shared.id;
      assert.equal((await h.request(late.token, 'GET', tasks)).status, 404);
      assert.equal((await h.request(late.token, 'POST', own + '/complete')).status, 404);
      for (const method of ['PATCH', 'DELETE'])
        assert.equal(
          (
            await h.request(
              b.token,
              method,
              common,
              method === 'PATCH'
                ? { title: 'Чужое', description: '', dueAt: future, version: 1 }
                : undefined,
            )
          ).status,
          403,
        );
      assert.equal(
        (
          await h.request(mod.token, 'PATCH', common, {
            title: 'Чужое',
            description: '',
            dueAt: future,
            version: 1,
          })
        ).status,
        403,
      );
      assert.equal((await h.request(b.token, 'POST', common + '/complete')).status, 403);
      const races = await Promise.all([
        h.request(a.token, 'POST', own + '/complete'),
        h.request(a.token, 'POST', own + '/complete'),
      ]);
      assert.deepEqual(
        races.map((r) => r.status),
        [200, 200],
      );
      assert.equal((await h.json(b.token, 'GET', own)).status, 'OPEN');
      assert.equal((await h.json(a.token, 'GET', own)).status, 'COMPLETED_ON_TIME');
      await h.json(b.token, 'POST', own + '/complete');
      assert.equal(await h.db.groupCompletion.count({ where: { taskId: individual.id } }), 2);
      assert.equal((await h.json(a.token, 'GET', own + '/history')).total, 1);
      assert.equal((await h.json(b.token, 'GET', own + '/history')).total, 1);
      assert.equal((await h.json(owner.token, 'GET', own + '/history')).total, 0);
      assert.equal((await h.json(a.token, 'GET', '/statistics/me')).total, 1);
      const commonRaces = await Promise.all([
        h.request(mod.token, 'POST', common + '/complete'),
        h.request(owner.token, 'POST', common + '/complete'),
      ]);
      assert.deepEqual(
        commonRaces.map((r) => r.status),
        [200, 200],
      );
      assert.equal((await h.json(b.token, 'GET', common)).status, 'COMPLETED_ON_TIME');
      assert.equal(await h.db.groupTaskEvent.count({ where: { taskId: shared.id } }), 1);
      assert.equal((await h.json(b.token, 'GET', '/statistics/me')).total, 1);
      assert.equal((await h.json(b.token, 'GET', root + '/statistics')).completedOnTime, 1);
      const update = {
        title: input.title,
        description: input.description,
        dueAt: past,
        version: 1,
      };
      const edits = await Promise.all([
        h.request(a.token, 'PATCH', own, update),
        h.request(a.token, 'PATCH', own, update),
      ]);
      assert.deepEqual(edits.map((r) => r.status).sort(), [200, 409]);
      const edited = await h.json(a.token, 'GET', own);
      assert.equal(edited.deadlineRevision, 2);
      assert.equal(edited.deadlineAtCompletion, future);
      assert.equal(edited.status, 'COMPLETED_ON_TIME');
      assert.equal(
        (await h.request(a.token, 'PATCH', own, { ...update, version: 2, mode: 'SHARED' })).status,
        400,
      );
      await h.json(a.token, 'POST', own + '/reopen');
      assert.equal((await h.json(a.token, 'POST', own + '/complete')).status, 'COMPLETED_LATE');
      const history = await h.json(a.token, 'GET', own + '/history?limit=1&page=2');
      assert.equal(history.total, 3);
      assert.equal(history.items.length, 1);
      const feed = await h.json(a.token, 'GET', '/tasks?scope=ALL&status=ALL&limit=1');
      assert.equal(feed.total, 2);
      assert.equal(feed.items[0].scope, 'GROUP');
      assert.equal((await h.json(a.token, 'GET', '/tasks?status=ALL')).total, 0);
      assert.equal(
        (await h.json(a.token, 'GET', `/tasks?scope=GROUP&status=COMPLETED&groupId=${g.id}`)).total,
        2,
      );
      assert.equal((await h.json(a.token, 'GET', '/statistics/me')).completedLate, 1);
      await h.json(b.token, 'POST', root + '/leave', undefined, 204);
      assert.equal((await h.json(b.token, 'GET', '/statistics/me')).total, 0);
      assert.equal((await h.request(b.token, 'GET', own + '/history')).status, 404);
      await h.json(b.token, 'POST', '/groups/join', { code: invite.code });
      assert.equal((await h.json(b.token, 'GET', own)).status, 'COMPLETED_ON_TIME');
      assert.equal((await h.json(b.token, 'GET', '/statistics/me')).total, 1);
      await h.json(late.token, 'POST', '/groups/join', { code: invite.code });
      assert.equal((await h.json(late.token, 'GET', '/statistics/me')).total, 0);
      assert.equal((await h.json(late.token, 'GET', '/tasks?scope=GROUP&status=ALL')).total, 1);
      await h.json(late.token, 'POST', own + '/complete');
      assert.equal((await h.json(late.token, 'GET', '/statistics/me')).completedLate, 1);
      await h.json(a.token, 'POST', root + '/leave', undefined, 204);
      assert.equal((await h.request(a.token, 'PATCH', own, { ...update, version: 2 })).status, 404);
      assert.equal((await h.request(a.token, 'POST', common + '/reopen')).status, 404);
      await h.json(mod.token, 'POST', common + '/reopen');
      await h.json(mod.token, 'DELETE', own, undefined, 204);
      assert.equal((await h.request(b.token, 'GET', own)).status, 404);
      assert.equal((await h.json(b.token, 'GET', '/statistics/me')).total, 0);
      assert.ok((await h.db.groupTaskEvent.count({ where: { taskId: individual.id } })) > 0);
      await h.json(owner.token, 'DELETE', root, undefined, 204);
      assert.equal((await h.json(b.token, 'GET', '/tasks?scope=GROUP&status=ALL')).total, 0);
      assert.equal((await h.request(b.token, 'GET', root + '/statistics')).status, 404);
    } finally {
      await h.close();
    }
  },
);
