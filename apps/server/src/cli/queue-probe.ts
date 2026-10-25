import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';
import { NestFactory } from '@nestjs/core';
import { DatabaseService } from '../infrastructure/database.service.js';
import { loadEnvironment } from '../infrastructure/environment.js';
import { InfrastructureModule } from '../infrastructure/infrastructure.module.js';
import { JobsService, PROBE_QUEUE } from '../infrastructure/jobs.service.js';

loadEnvironment();
const app = await NestFactory.createApplicationContext(InfrastructureModule, { logger: false });
const db = app.get(DatabaseService);
const id = randomUUID();
try {
  await db.jobProbe.create({ data: { id } });
  await app.get(JobsService).boss.send(PROBE_QUEUE, { id }, { retryLimit: 2, expireInSeconds: 30 });
  const deadline = Date.now() + 25_000;
  let completed = false;
  while (Date.now() < deadline) {
    if ((await db.jobProbe.findUnique({ where: { id } }))?.completedAt) {
      completed = true;
      break;
    }
    await setTimeout(250);
  }
  if (!completed) throw new Error('Queue probe timed out. Start the separate worker first.');
  console.log('Queue probe passed: a separate worker processed a PostgreSQL-backed job.');
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Queue probe failed.');
  process.exitCode = 1;
} finally {
  await db.jobProbe.deleteMany({ where: { id } });
  await app.close();
}
