import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { loadEnvironment } from '../infrastructure/environment.js';
import { InfrastructureModule } from '../infrastructure/infrastructure.module.js';
import { StorageService } from '../infrastructure/storage.service.js';

loadEnvironment();
const app = await NestFactory.createApplicationContext(InfrastructureModule, { logger: false });
try {
  await app.get(StorageService).initializeBucket();
  console.log('Private storage bucket is ready.');
} finally {
  await app.close();
}
