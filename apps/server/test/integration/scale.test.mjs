import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { harness } from '../helpers/api.mjs';

test(
  'mixed task feed paginates a 3000-task fixture without duplicating personal or shared counts',
  { timeout: 30000 },
  async () => {
    const h = await harness();
    try {
      const a = await h.account('Большой список'),
        outsider = await h.account('Посторонний');
      const g = await h.json(a.token, 'POST', '/groups', {
        name: 'Объём',
        subjectName: 'Предмет',
        description: '',
      });
      const dueAt = new Date(Date.now() + 86400000);
      await h.db.task.createMany({
        data: Array.from({ length: 1000 }, (_, i) => ({
          id: randomUUID(),
          userId: a.id,
          title: `Личное ${i}`,
          dueAt,
        })),
      });
      await h.db.groupTask.createMany({
        data: Array.from({ length: 2000 }, (_, i) => ({
          id: randomUUID(),
          groupId: g.id,
          authorId: a.id,
          title: `Групповое ${i}`,
          dueAt,
          mode: i < 1500 ? 'INDIVIDUAL' : 'SHARED',
        })),
      });
      const started = performance.now();
      const page = await h.json(a.token, 'GET', '/tasks?scope=ALL&status=ALL&limit=20&page=50');
      const elapsed = Math.round(performance.now() - started);
      assert.equal(page.total, 3000);
      assert.equal(page.items.length, 20);
      assert.equal(new Set(page.items.map((t) => t.id)).size, 20);
      const repeated = await h.json(a.token, 'GET', '/tasks?scope=ALL&status=ALL&limit=20&page=50');
      assert.deepEqual(
        page.items.map((t) => t.id),
        repeated.items.map((t) => t.id),
      );
      assert.equal((await h.json(a.token, 'GET', '/statistics/me')).total, 2500);
      assert.equal((await h.json(a.token, 'GET', `/groups/${g.id}/statistics`)).total, 500);
      assert.equal((await h.json(outsider.token, 'GET', '/tasks?scope=ALL&status=ALL')).total, 0);
      console.log(
        JSON.stringify({
          fixture: 'mixed_task_feed',
          tasks: 3000,
          page: 50,
          pageSize: 20,
          durationMs: elapsed,
        }),
      );
    } finally {
      await h.close();
    }
  },
);
