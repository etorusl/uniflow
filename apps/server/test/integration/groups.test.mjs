import assert from 'node:assert/strict';
import { test } from 'node:test';
import { harness } from '../helpers/api.mjs';

test(
  'closed groups serialize membership, invitations and ownership and enforce the role matrix',
  { timeout: 60000 },
  async () => {
    const h = await harness();
    try {
      const owner = await h.account('Владелец'),
        mod = await h.account('Модератор'),
        a = await h.account('Анна'),
        b = await h.account('Борис'),
        outsider = await h.account('Посторонний');
      const g = await h.json(owner.token, 'POST', '/groups', {
        name: 'Математика',
        subjectName: 'Алгебра',
        description: 'Закрытая группа',
      });
      const root = `/groups/${g.id}`;
      assert.equal(g.role, 'OWNER');
      for (const suffix of ['', '/members', '/invitations', '/history'])
        assert.equal((await h.request(outsider.token, 'GET', root + suffix)).status, 404);
      assert.equal((await h.request(owner.token, 'POST', root + '/leave')).status, 400);
      const invite = await h.json(owner.token, 'POST', root + '/invitations', {
        maxUses: 3,
        expiresInDays: 1,
      });
      assert.match(invite.code, /^[0-9A-F]{24}$/);
      const stored = await h.db.groupInvitation.findUniqueOrThrow({ where: { id: invite.id } });
      assert.notEqual(stored.tokenHash, invite.code);
      const joins = await Promise.all([
        h.request(a.token, 'POST', '/groups/join', { code: invite.code }),
        h.request(a.token, 'POST', '/groups/join', { code: invite.code }),
      ]);
      assert.deepEqual(
        joins.map((r) => r.status),
        [200, 200],
      );
      assert.equal(
        (await h.db.groupInvitation.findUniqueOrThrow({ where: { id: invite.id } })).uses,
        1,
      );
      await h.json(mod.token, 'POST', '/groups/join', { code: invite.code });
      await h.json(b.token, 'POST', '/groups/join', { code: invite.code });
      assert.equal(
        (await h.request(outsider.token, 'POST', '/groups/join', { code: invite.code })).status,
        400,
      );
      assert.equal(
        (await h.request(a.token, 'PATCH', root + `/members/${a.id}`, { role: 'MODERATOR' }))
          .status,
        403,
      );
      await h.json(owner.token, 'PATCH', root + `/members/${mod.id}`, { role: 'MODERATOR' }, 204);
      assert.equal((await h.request(a.token, 'POST', root + '/invitations', {})).status, 403);
      const people = await h.json(a.token, 'GET', root + '/members?limit=2');
      assert.equal(people.total, 4);
      assert.equal(people.items.length, 2);
      assert.ok(people.items.every((m) => !('email' in m) && !('subjectId' in m)));
      assert.equal(
        (await h.request(mod.token, 'DELETE', root + `/members/${owner.id}`)).status,
        403,
      );
      assert.equal(
        (
          await h.request(mod.token, 'PATCH', root, {
            name: 'Нельзя',
            subjectName: 'Нельзя',
            description: '',
          })
        ).status,
        403,
      );
      const subject = await h.json(a.token, 'POST', '/subjects', {
        name: 'Личный',
        color: '#6554D9',
      });
      assert.equal(
        (await h.request(b.token, 'PATCH', root + '/me/subject', { subjectId: subject.id })).status,
        404,
      );
      await h.json(a.token, 'PATCH', root + '/me/subject', { subjectId: subject.id });
      assert.equal((await h.json(owner.token, 'GET', root)).subjectId, null);
      const expired = await h.json(mod.token, 'POST', root + '/invitations', {});
      await h.db.groupInvitation.update({
        where: { id: expired.id },
        data: { expiresAt: new Date(0) },
      });
      assert.equal(
        (await h.request(outsider.token, 'POST', '/groups/join', { code: expired.code })).status,
        400,
      );
      const revoked = await h.json(mod.token, 'POST', root + '/invitations', {});
      await h.json(mod.token, 'DELETE', root + `/invitations/${revoked.id}`, undefined, 204);
      assert.equal(
        (await h.request(outsider.token, 'POST', '/groups/join', { code: revoked.code })).status,
        400,
      );
      const limited = await h.json(mod.token, 'POST', root + '/invitations', { maxUses: 1 });
      await h.json(a.token, 'POST', root + '/leave', undefined, 204);
      assert.equal((await h.request(a.token, 'GET', root)).status, 404);
      const racers = await Promise.all([
        h.request(a.token, 'POST', '/groups/join', { code: limited.code }),
        h.request(outsider.token, 'POST', '/groups/join', { code: limited.code }),
      ]);
      assert.deepEqual(racers.map((r) => r.status).sort(), [200, 400]);
      assert.equal(
        (await h.db.groupInvitation.findUniqueOrThrow({ where: { id: limited.id } })).uses,
        1,
      );
      const removed = racers[0].status === 200 ? a : outsider;
      await h.json(mod.token, 'DELETE', root + `/members/${removed.id}`, undefined, 204);
      const fresh = await h.json(mod.token, 'POST', root + '/invitations', {});
      assert.equal(
        (await h.request(removed.token, 'POST', '/groups/join', { code: fresh.code })).status,
        400,
      );
      const transfers = await Promise.all([
        h.request(owner.token, 'POST', root + '/transfer-ownership', { userId: mod.id }),
        h.request(owner.token, 'POST', root + '/transfer-ownership', { userId: b.id }),
      ]);
      assert.deepEqual(transfers.map((r) => r.status).sort(), [204, 403]);
      const newOwner = (await h.json(mod.token, 'GET', root)).role === 'OWNER' ? mod : b;
      assert.equal((await h.json(owner.token, 'GET', root)).role, 'MEMBER');
      const history = await h.json(newOwner.token, 'GET', root + '/history?limit=1');
      assert.ok(history.total > 5);
      assert.equal(history.items.length, 1);
      await h.json(newOwner.token, 'DELETE', root, undefined, 204);
      for (const person of [owner, mod, b])
        assert.equal((await h.request(person.token, 'GET', root)).status, 404);
      assert.equal(
        (await h.request(owner.token, 'POST', '/groups/join', { code: fresh.code })).status,
        400,
      );
      assert.equal((await h.json(owner.token, 'GET', '/groups')).total, 0);
    } finally {
      await h.close();
    }
  },
);
