import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DatabaseService } from './infrastructure/database.service.js';
import { loadEnvironment } from './infrastructure/environment.js';
import { InfrastructureModule } from './infrastructure/infrastructure.module.js';
import { JobsService, PROBE_QUEUE } from './infrastructure/jobs.service.js';

loadEnvironment();
const app = await NestFactory.createApplicationContext(InfrastructureModule);
app.enableShutdownHooks();
const db = app.get(DatabaseService);
await app.get(JobsService).boss.work<{ id: string }>(PROBE_QUEUE, async (jobs) => {
  for (const job of jobs)
    await db.jobProbe.updateMany({
      where: { id: job.data.id, completedAt: null },
      data: { completedAt: new Date() },
    });
});
Logger.log('Worker is ready; no HTTP server is started.', 'Worker');
