import 'reflect-metadata';
import { writeFile } from 'node:fs/promises';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import { AppModule } from '../app.module.js';
import { openApiConfig } from '../api.js';
import { loadEnvironment } from '../infrastructure/environment.js';

loadEnvironment();
// Creating the document does not initialize providers or connect to services.
const app = await NestFactory.create(AppModule, { logger: false });
app.setGlobalPrefix('api/v1');
try {
  await writeFile(
    'openapi.json',
    JSON.stringify(SwaggerModule.createDocument(app, openApiConfig), null, 2) + '\n',
  );
} finally {
  await app.close();
}
