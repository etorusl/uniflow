import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { PutObjectCommand, HeadObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { harness } from '../helpers/api.mjs';
import { FilesService } from '../../dist/modules/files/files.service.js';
import { StorageService } from '../../dist/infrastructure/storage.service.js';

test(
  'private attachments and materials enforce parent rights, limits and retryable S3 cleanup',
  { timeout: 60000 },
  async () => {
    const h = await harness();
    const files = h.app.get(FilesService),
      storage = h.app.get(StorageService);
    const originalSend = storage.client.send.bind(storage.client);
    const seeded = [];
    try {
      const a = await h.account('Автор'),
        b = await h.account('Участник'),
        mod = await h.account('Модератор'),
        outsider = await h.account('Посторонний');
      const dueAt = new Date(Date.now() + 86400000).toISOString();
      const personal = await h.json(a.token, 'POST', '/tasks', {
        title: 'Личное',
        description: '',
        dueAt,
      });
      const g = await h.json(a.token, 'POST', '/groups', {
        name: 'Файлы',
        subjectName: 'История',
        description: '',
      });
      const root = `/groups/${g.id}`,
        invite = await h.json(a.token, 'POST', root + '/invitations', {});
      for (const u of [b, mod])
        await h.json(u.token, 'POST', '/groups/join', { code: invite.code });
      await h.json(a.token, 'PATCH', root + `/members/${mod.id}`, { role: 'MODERATOR' }, 204);
      const task = await h.json(a.token, 'POST', root + '/tasks', {
        title: 'Доклад',
        description: '',
        dueAt,
        mode: 'SHARED',
      });
      const material = await h.json(b.token, 'POST', root + '/materials', {
        title: 'Конспект',
        body: 'Полезные ссылки и файлы',
      });
      assert.equal((await h.json(b.token, 'GET', root + '/materials?limit=1')).total, 1);
      assert.equal((await h.json(b.token, 'GET', '/statistics/me')).total, 0);
      assert.equal((await h.json(b.token, 'GET', root + '/statistics')).total, 1);
      assert.equal((await h.request(outsider.token, 'GET', root + '/materials')).status, 404);
      assert.equal(
        (
          await h.request(mod.token, 'PATCH', root + `/materials/${material.id}`, {
            title: 'Нет',
            body: '',
            version: 1,
          })
        ).status,
        403,
      );
      const edits = await Promise.all([
        h.request(b.token, 'PATCH', root + `/materials/${material.id}`, {
          title: 'Новый конспект',
          body: 'Текст',
          version: 1,
        }),
        h.request(b.token, 'PATCH', root + `/materials/${material.id}`, {
          title: 'Правка',
          body: 'Текст',
          version: 1,
        }),
      ]);
      assert.deepEqual(edits.map((r) => r.status).sort(), [200, 409]);
      const text = Buffer.from('Lecture notes: chapter one.');
      async function upload(
        token,
        parentType,
        parentId,
        bytes = text,
        name = 'notes.txt',
        status = 200,
        extra = false,
      ) {
        const body = new FormData();
        body.append('parentType', parentType);
        body.append('parentId', parentId);
        body.append('file', new Blob([bytes], { type: 'application/octet-stream' }), name);
        if (extra) body.append('objectKey', 'unsafe');
        const response = await fetch(h.base + '/files', {
          method: 'POST',
          headers: { authorization: `Bearer ${token}`, 'x-uniflow-client': 'native' },
          body,
        });
        const data = await response.json();
        assert.equal(response.status, status, JSON.stringify(data));
        return data;
      }
      const own = await upload(a.token, 'PERSONAL_TASK', personal.id);
      assert.equal(own.mimeType, 'text/plain');
      assert.equal(own.byteSize, text.length);
      assert.ok(!('objectKey' in own));
      const content = await h.request(a.token, 'GET', `/files/${own.id}/content`);
      assert.deepEqual(Buffer.from(await content.arrayBuffer()), text);
      assert.equal(content.headers.get('x-content-type-options'), 'nosniff');
      assert.match(content.headers.get('content-disposition'), /^attachment;/);
      for (const path of [
        `/files/${own.id}`,
        `/files/${own.id}/content`,
        `/files?parentType=PERSONAL_TASK&parentId=${personal.id}`,
      ])
        assert.equal((await h.request(b.token, 'GET', path)).status, 404);
      await upload(b.token, 'PERSONAL_TASK', personal.id, text, 'notes.txt', 404);
      const groupFile = await upload(a.token, 'GROUP_TASK', task.id);
      assert.equal((await h.request(b.token, 'GET', `/files/${groupFile.id}/content`)).status, 200);
      await upload(mod.token, 'GROUP_TASK', task.id, text, 'notes.txt', 403);
      const concurrentTask = await h.json(a.token, 'POST', root + '/tasks', {
        title: 'Конкурентная загрузка',
        description: '',
        dueAt,
        mode: 'INDIVIDUAL',
      });
      const concurrent = await Promise.all([
        upload(a.token, 'GROUP_TASK', concurrentTask.id),
        h.request(a.token, 'POST', root + `/tasks/${concurrentTask.id}/complete`),
      ]);
      assert.equal(concurrent[1].status, 200);
      const matFile = await upload(b.token, 'MATERIAL', material.id);
      assert.equal((await h.request(a.token, 'GET', `/files/${matFile.id}`)).status, 200);
      assert.equal(
        (await h.request(outsider.token, 'GET', `/files/${matFile.id}/content`)).status,
        404,
      );
      const object = await h.db.attachment.findUniqueOrThrow({ where: { id: own.id } });
      const direct = await fetch(
        `${storage.env.S3_ENDPOINT}/${storage.env.S3_BUCKET}/${object.objectKey}`,
      );
      assert.equal(direct.status, 403);
      await upload(a.token, 'PERSONAL_TASK', personal.id, Buffer.alloc(0), 'empty.txt', 400);
      await upload(
        a.token,
        'PERSONAL_TASK',
        personal.id,
        Buffer.from('not a jpeg'),
        'fake.jpg',
        400,
      );
      await upload(
        a.token,
        'PERSONAL_TASK',
        personal.id,
        Buffer.alloc(10 * 1024 * 1024 + 1),
        'huge.txt',
        413,
      );
      await upload(a.token, 'PERSONAL_TASK', personal.id, text, 'notes.txt', 400, true);
      for (let i = 0; i < 9; i++)
        await upload(a.token, 'PERSONAL_TASK', personal.id, text, `note-${i}.txt`);
      await upload(a.token, 'PERSONAL_TASK', personal.id, text, 'eleventh.txt', 400);
      assert.equal(
        (
          await h.json(
            a.token,
            'GET',
            `/files?parentType=PERSONAL_TASK&parentId=${personal.id}&limit=3`,
          )
        ).total,
        10,
      );
      const quotaTask = await h.json(a.token, 'POST', '/tasks', {
        title: 'Квота',
        description: '',
        dueAt,
      });
      for (let i = 0; i < 20; i++)
        seeded.push(
          await h.db.attachment.create({
            data: {
              uploaderId: a.id,
              objectKey: `quota-${randomUUID()}`,
              filename: 'quota.txt',
              mimeType: 'text/plain',
              byteSize: 10 * 1024 * 1024,
              status: 'PENDING',
              expiresAt: new Date(Date.now() + 3600000),
            },
          }),
        );
      await upload(a.token, 'PERSONAL_TASK', quotaTask.id, text, 'quota.txt', 400);
      await h.db.attachment.deleteMany({ where: { id: { in: seeded.map((x) => x.id) } } });
      const groupQuota = Array.from({ length: 50 }, () => ({
        id: randomUUID(),
        uploaderId: outsider.id,
        groupId: g.id,
        objectKey: `quota-${randomUUID()}`,
        filename: 'quota.txt',
        mimeType: 'text/plain',
        byteSize: 10 * 1024 * 1024,
        status: 'PENDING',
        expiresAt: new Date(Date.now() + 3600000),
      }));
      await h.db.attachment.createMany({ data: groupQuota });
      seeded.push(...groupQuota);
      await upload(a.token, 'GROUP_TASK', task.id, text, 'quota.txt', 400);
      await h.db.attachment.deleteMany({ where: { id: { in: groupQuota.map((x) => x.id) } } });
      const failedKeys = [];
      storage.client.send = async (command) => {
        if (command instanceof PutObjectCommand) {
          failedKeys.push(command.input.Key);
          throw new Error('Injected storage outage');
        }
        return originalSend(command);
      };
      await upload(a.token, 'PERSONAL_TASK', quotaTask.id, text, 'failed.txt', 500);
      storage.client.send = originalSend;
      const failed = await h.db.attachment.findFirstOrThrow({
        where: { objectKey: failedKeys[0] },
      });
      assert.equal(failed.status, 'DELETING');
      await files.cleanup();
      await files.cleanup();
      assert.equal(await h.db.attachment.findUnique({ where: { id: failed.id } }), null);
      const deletingObject = await h.db.attachment.findUniqueOrThrow({
        where: { id: groupFile.id },
      });
      storage.client.send = async (command) => {
        if (command.constructor.name === 'DeleteObjectCommand')
          throw new Error('Injected deletion outage');
        return originalSend(command);
      };
      await h.json(mod.token, 'DELETE', `/files/${groupFile.id}`, undefined, 500);
      assert.equal(
        (await h.db.attachment.findUniqueOrThrow({ where: { id: groupFile.id } })).status,
        'DELETING',
      );
      assert.equal((await h.request(a.token, 'GET', `/files/${groupFile.id}/content`)).status, 404);
      storage.client.send = originalSend;
      await files.cleanup();
      await assert.rejects(
        originalSend(
          new HeadObjectCommand({ Bucket: storage.env.S3_BUCKET, Key: deletingObject.objectKey }),
        ),
        (e) => e.$metadata.httpStatusCode === 404,
      );
      await h.json(b.token, 'POST', root + '/leave', undefined, 204);
      assert.equal((await h.request(b.token, 'GET', `/files/${matFile.id}/content`)).status, 404);
      assert.equal(
        (
          await h.request(b.token, 'PATCH', root + `/materials/${material.id}`, {
            title: 'Нет',
            body: '',
            version: 2,
          })
        ).status,
        404,
      );
      await h.json(mod.token, 'DELETE', root + `/materials/${material.id}`, undefined, 204);
      assert.equal((await h.request(a.token, 'GET', `/files/${matFile.id}`)).status, 404);
      await files.cleanup();
      assert.equal(await h.db.attachment.findUnique({ where: { id: matFile.id } }), null);
      await h.json(a.token, 'DELETE', `/files/${own.id}`, undefined, 204);
      await h.json(a.token, 'DELETE', `/files/${own.id}`, undefined, 204);
      await h.json(a.token, 'DELETE', `/tasks/${personal.id}`, undefined, 204);
      await files.cleanup();
      assert.equal(await h.db.attachment.count({ where: { personalTaskId: personal.id } }), 0);
      await assert.rejects(
        originalSend(
          new GetObjectCommand({ Bucket: storage.env.S3_BUCKET, Key: object.objectKey }),
        ),
        (e) => e.$metadata.httpStatusCode === 404,
      );
    } finally {
      storage.client.send = originalSend;
      await h.db.attachment.deleteMany({ where: { id: { in: seeded.map((x) => x.id) } } });
      await h.close();
    }
  },
);
