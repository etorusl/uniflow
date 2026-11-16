import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { DeleteObjectCommand, HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { createApi } from '../../dist/api.js';
import { DatabaseService } from '../../dist/infrastructure/database.service.js';
import { StorageService } from '../../dist/infrastructure/storage.service.js';
import { FilesCleanupService } from '../../dist/modules/files/files-cleanup.service.js';

test(
  'private attachments and group materials enforce ownership and clean up S3',
  { timeout: 45000 },
  async () => {
    const app = await createApi({ quiet: true });
    const db = app.get(DatabaseService);
    const storage = app.get(StorageService);
    const bucket = storage.env.S3_BUCKET;
    const emails = Array.from({ length: 3 }, () => `files-${randomUUID()}@uniflow.local`);
    let groupId;
    const objectKeys = new Set();
    try {
      await app.init();
      await storage.initializeBucket();
      await app.listen(0, '127.0.0.1');
      const base = `${await app.getUrl()}/api/v1`;
      const request = (method, path, token, body) =>
        fetch(base + path, {
          method,
          headers: {
            ...(body instanceof FormData || body === undefined
              ? {}
              : { 'content-type': 'application/json' }),
            'x-uniflow-client': 'native',
            ...(token ? { authorization: `Bearer ${token}` } : {}),
          },
          body: body instanceof FormData || body === undefined ? body : JSON.stringify(body),
        });
      async function json(response, status) {
        const body = await response.json();
        assert.equal(response.status, status, JSON.stringify(body));
        return body;
      }
      async function createAccount(email) {
        const password = 'Attachment-test-password!';
        await json(
          await request('POST', '/auth/register', undefined, {
            email,
            password,
            displayName: 'Attachment test',
            timeZone: 'UTC',
          }),
          200,
        );
        const result = await json(
          await request('POST', '/auth/login', undefined, { email, password }),
          200,
        );
        assert.ok(result.token);
        return { id: result.user.id, token: result.token };
      }
      const [owner, member, outsider] = await Promise.all(emails.map(createAccount));
      const dueAt = new Date(Date.now() + 86400000).toISOString();
      const taskInput = { title: 'Тестовое задание', description: '', dueAt };
      const task = await json(await request('POST', '/tasks', owner.token, taskInput), 200);
      const personalPath = `/files/targets/task/${task.id}`;
      const data = 'Проверка содержимого\n';
      function multipart(bytes = data, name = 'Конспект.txt') {
        const form = new FormData();
        form.append('file', new Blob([bytes], { type: 'text/plain' }), name);
        return form;
      }
      async function upload(path, token, form = multipart()) {
        const metadata = await json(await request('POST', path, token, form), 201);
        assert.equal('objectKey' in metadata, false);
        const row = await db.attachment.findUniqueOrThrow({ where: { id: metadata.id } });
        objectKeys.add(row.objectKey);
        assert.equal(row.state, 'READY');
        return metadata;
      }
      const personal = await upload(personalPath, owner.token);
      assert.equal(personal.name, 'Конспект.txt');
      assert.equal(personal.mimeType, 'text/plain');
      assert.equal(personal.size, Buffer.byteLength(data));
      const personalContent = `/files/${personal.id}/content`;
      const downloaded = await request('GET', personalContent, owner.token);
      assert.equal(downloaded.status, 200);
      assert.equal(await downloaded.text(), data);
      assert.match(downloaded.headers.get('content-disposition'), /^attachment;/);
      assert.equal(downloaded.headers.get('cache-control'), 'private, no-store');
      assert.equal((await request('GET', personalContent)).status, 401);
      assert.equal((await request('GET', personalContent, outsider.token)).status, 404);
      assert.equal((await request('POST', personalPath, outsider.token, multipart())).status, 404);
      assert.equal((await request('POST', personalPath, owner.token, multipart(''))).status, 400);
      assert.equal(
        (await request('POST', personalPath, owner.token, multipart(Uint8Array.of(0, 255, 0))))
          .status,
        415,
      );
      const oversized = Buffer.alloc(10 * 1024 * 1024 + 1, 'a');
      assert.equal(
        (await request('POST', personalPath, owner.token, multipart(oversized))).status,
        413,
      );
      assert.deepEqual((await json(await request('GET', personalPath, owner.token), 200)).items, [
        personal,
      ]);

      const group = await json(
        await request('POST', '/groups', owner.token, {
          name: 'Файлы группы',
          subjectName: 'Тест',
        }),
        201,
      );
      groupId = group.id;
      const invitation = await json(
        await request('POST', `/groups/${groupId}/invitations`, owner.token, {}),
        201,
      );
      await json(
        await request('POST', '/groups/join', member.token, { code: invitation.code }),
        200,
      );
      const groupTask = await json(
        await request('POST', `/groups/${groupId}/tasks`, owner.token, {
          ...taskInput,
          mode: 'INDIVIDUAL',
        }),
        201,
      );
      const groupTaskPath = `/files/targets/group-task/${groupTask.id}`;
      const groupFile = await upload(groupTaskPath, owner.token);
      assert.equal((await request('POST', groupTaskPath, member.token, multipart())).status, 403);
      const memberDownload = await request('GET', `/files/${groupFile.id}/content`, member.token);
      assert.equal(memberDownload.status, 200);
      assert.equal(await memberDownload.text(), data);

      const materialsPath = `/groups/${groupId}/materials`;
      const materialInput = { title: 'Новый материал', description: 'Отдельная публикация' };
      const material = await json(
        await request('POST', materialsPath, member.token, materialInput),
        201,
      );
      const materialFile = await upload(`/files/targets/material/${material.id}`, member.token);
      const materialContent = `/files/${materialFile.id}/content`;
      const materialPath = `${materialsPath}/${material.id}`;
      const visibleMaterials = await json(await request('GET', materialsPath, owner.token), 200);
      assert.equal(visibleMaterials.total, 1);
      assert.equal(visibleMaterials.items[0].attachmentCount, 1);
      assert.equal((await request('GET', materialsPath, outsider.token)).status, 404);
      assert.equal((await request('PATCH', materialPath, owner.token, materialInput)).status, 403);
      assert.equal((await request('DELETE', `/files/${materialFile.id}`, owner.token)).status, 403);
      assert.equal((await request('POST', `/groups/${groupId}/leave`, member.token)).status, 204);
      assert.equal((await request('GET', materialContent, member.token)).status, 404);
      assert.equal(
        (await request('GET', `/files/${groupFile.id}/content`, member.token)).status,
        404,
      );
      const ownerDownload = await request('GET', materialContent, owner.token);
      assert.equal(ownerDownload.status, 200);
      assert.equal(await ownerDownload.text(), data);
      assert.equal((await request('DELETE', materialPath, owner.token)).status, 204);
      assert.equal((await request('GET', materialContent, owner.token)).status, 404);
      assert.equal(
        (await request('DELETE', `/groups/${groupId}/tasks/${groupTask.id}`, owner.token)).status,
        204,
      );
      assert.equal(
        (await request('GET', `/files/${groupFile.id}/content`, owner.token)).status,
        404,
      );
      assert.equal((await request('DELETE', `/files/${personal.id}`, owner.token)).status, 204);
      assert.equal((await request('DELETE', `/files/${personal.id}`, owner.token)).status, 204);
      assert.equal((await request('GET', personalContent, owner.token)).status, 404);

      const staleKey = `attachments/${randomUUID()}`;
      objectKeys.add(staleKey);
      await storage.client.send(
        new PutObjectCommand({ Bucket: bucket, Key: staleKey, Body: data }),
      );
      await db.attachment.create({
        data: {
          uploaderId: owner.id,
          taskId: task.id,
          objectKey: staleKey,
          name: 'pending.txt',
          mimeType: 'text/plain',
          size: Buffer.byteLength(data),
          createdAt: new Date(Date.now() - 31 * 60000),
        },
      });
      await app.get(FilesCleanupService).cleanup();
      for (const key of objectKeys) {
        assert.equal(await db.attachment.findUnique({ where: { objectKey: key } }), null);
        await assert.rejects(
          storage.client.send(new HeadObjectCommand({ Bucket: bucket, Key: key })),
          (error) => error.$metadata?.httpStatusCode === 404,
        );
      }
    } finally {
      for (const key of objectKeys) {
        await storage.client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
      }
      await db.attachment.deleteMany({ where: { objectKey: { in: [...objectKeys] } } });
      if (groupId) await db.studyGroup.deleteMany({ where: { id: groupId } });
      await db.user.deleteMany({ where: { email: { in: emails } } });
      await app.close();
    }
  },
);
