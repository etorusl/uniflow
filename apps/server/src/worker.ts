import 'reflect-metadata';
import { Logger, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DatabaseService } from './infrastructure/database.service.js';
import { loadEnvironment } from './infrastructure/environment.js';
import { InfrastructureModule } from './infrastructure/infrastructure.module.js';
import {
  JobsService,
  PROBE_QUEUE,
  AUTH_EMAIL_QUEUE,
  CLEANUP_QUEUE,
} from './infrastructure/jobs.service.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { AuthMailService, type AuthEmailJob } from './modules/auth/auth-mail.service.js';

loadEnvironment();
@Module({ imports: [InfrastructureModule, AuthModule] })
class WorkerModule {}
const app = await NestFactory.createApplicationContext(WorkerModule);
app.enableShutdownHooks();
const db = app.get(DatabaseService);
await app.get(JobsService).boss.work<{ id: string }>(PROBE_QUEUE, async (jobs) => {
  for (const job of jobs)
    await db.jobProbe.updateMany({
      where: { id: job.data.id, completedAt: null },
      data: { completedAt: new Date() },
    });
});
await app.get(JobsService).boss.work<AuthEmailJob>(AUTH_EMAIL_QUEUE, async (jobs) => {
  for (const job of jobs) await app.get(AuthMailService).send(job.data);
});
await app.get(JobsService).boss.work(CLEANUP_QUEUE, async () => {
  const now = new Date();
  await db.session.deleteMany({ where: { expiresAt: { lt: now } } });
  await db.actionToken.deleteMany({ where: { expiresAt: { lt: now } } });
  await db.authRateLimit.deleteMany({ where: { windowEndsAt: { lt: now } } });
});
await app.get(JobsService).boss.schedule(CLEANUP_QUEUE, '0 3 * * *');
Logger.log('Worker is ready; no HTTP server is started.', 'Worker');
