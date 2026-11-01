import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { cp, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { loadEnvironment, root } from './environment.mjs';
import { DatabaseService } from '../apps/server/dist/infrastructure/database.service.js';
import { parseEnvironment } from '../apps/server/dist/infrastructure/environment.js';
import { hashToken } from '../apps/server/dist/modules/auth/tokens.js';
import { hashPassword } from '../apps/server/dist/modules/auth/password.js';
import { createApi } from '../apps/server/dist/api.js';

loadEnvironment();
const { Client } = createRequire(join(root, 'apps/server/package.json'))('pg');
const id = randomUUID().replaceAll('-', ''),
  database = `uniflow_upgrade_${id}`;
const scratch = join(root, 'apps/server/.local', `migration-check-${id}`),
  migrations = join(scratch, 'migrations');
const config = join(scratch, 'prisma.config.ts');
const target = new URL(process.env.DATABASE_URL),
  adminUrl = new URL(target);
adminUrl.pathname = '/postgres';
target.pathname = '/' + database;
const env = { ...process.env, DATABASE_URL: target.toString() };
const admin = new Client({ connectionString: adminUrl.toString() });
await admin.connect();
let db, app;
async function migrate() {
  await new Promise((resolve, reject) => {
    const child = spawn(
      'pnpm',
      ['--filter', '@uniflow/server', 'exec', 'prisma', 'migrate', 'deploy', '--config', config],
      { cwd: root, env, stdio: 'inherit' },
    );
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error('Migration verification failed.'));
    });
  });
}
try {
  await admin.query(`CREATE DATABASE "${database}"`);
  await mkdir(migrations, { recursive: true });
  await writeFile(
    config,
    `import { defineConfig } from 'prisma/config';\nexport default defineConfig({schema:${JSON.stringify(join(root, 'apps/server/prisma/schema.prisma'))},migrations:{path:${JSON.stringify(migrations)}},datasource:{url:process.env.DATABASE_URL}});\n`,
  );
  const source = join(root, 'apps/server/prisma/migrations');
  const entries = (await readdir(source, { withFileTypes: true }))
    .filter((x) => x.isDirectory())
    .map((x) => x.name)
    .sort();
  await cp(join(source, 'migration_lock.toml'), join(migrations, 'migration_lock.toml'));
  for (const name of entries.filter((x) => x <= '20261025121915_personal_tasks'))
    await cp(join(source, name), join(migrations, name), { recursive: true });
  await migrate();
  db = new DatabaseService(parseEnvironment(env));
  const token = randomBytes(32).toString('base64url');
  const user = await db.user.create({
    data: {
      email: `upgrade-${id}@uniflow.local`,
      displayName: 'Проверка обновления',
      timeZone: 'Asia/Novosibirsk',
      passwordHash: await hashPassword('Migration-test-password!'),
    },
  });
  const subject = await db.subject.create({
    data: { userId: user.id, name: 'История', color: '#6554D9' },
  });
  const semester = await db.semester.create({
    data: {
      userId: user.id,
      name: 'Осень',
      startDate: new Date('2026-09-01'),
      endDate: new Date('2027-01-31'),
      weekStartDate: new Date('2026-08-31'),
      timeZone: user.timeZone,
    },
  });
  const entry = await db.scheduleEntry.create({
    data: {
      userId: user.id,
      semesterId: semester.id,
      subjectId: subject.id,
      dayOfWeek: 1,
      startTime: '09:00',
      endTime: '10:30',
      parity: 'ODD',
    },
  });
  const dueAt = new Date('2026-10-25T12:00:00Z'),
    completedAt = new Date('2026-10-25T11:00:00Z');
  const task = await db.task.create({
    data: {
      userId: user.id,
      subjectId: subject.id,
      title: 'Сохранённое задание',
      description: 'Не потерять при обновлении',
      dueAt,
      completedAt,
      deadlineAtCompletion: dueAt,
      history: { create: { kind: 'COMPLETED', createdAt: completedAt, deadlineSnapshot: dueAt } },
    },
  });
  await db.session.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + 86400000),
    },
  });
  await db.$disconnect();
  for (const name of entries.filter((x) => x > '20261025121915_personal_tasks'))
    await cp(join(source, name), join(migrations, name), { recursive: true });
  await migrate();
  db = new DatabaseService(parseEnvironment(env));
  const after = await db.task.findUniqueOrThrow({
    where: { id: task.id },
    include: { history: true },
  });
  assert.equal(after.description, task.description);
  assert.equal(after.completedAt.toISOString(), completedAt.toISOString());
  assert.equal(after.deadlineAtCompletion.toISOString(), dueAt.toISOString());
  assert.equal(after.history.length, 1);
  assert.equal(
    (await db.scheduleEntry.findUniqueOrThrow({ where: { id: entry.id } })).parity,
    'ODD',
  );
  process.env.DATABASE_URL = target.toString();
  app = await createApi({ quiet: true });
  await app.listen(0, '127.0.0.1');
  const response = await fetch(`${await app.getUrl()}/api/v1/auth/session`, {
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).user.id, user.id);
  assert.equal(await db.group.count(), 0);
  assert.equal(await db.attachment.count(), 0);
  console.log(
    'Upgrade verified: existing account, active session, timetable, task, deadline snapshot and completion history survive all new migrations.',
  );
} finally {
  await app?.close();
  await db?.$disconnect();
  try {
    await admin.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
  } finally {
    await admin.end();
    await rm(scratch, { recursive: true, force: true });
  }
}
