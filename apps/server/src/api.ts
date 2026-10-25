import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import type { Request, Response, NextFunction } from 'express';
import { AppModule } from './app.module.js';
import { ApiExceptionFilter } from './common/api-error.js';
import { ENVIRONMENT, loadEnvironment, type Environment } from './infrastructure/environment.js';

export const openApiConfig = new DocumentBuilder()
  .setTitle('UniFlow API')
  .setDescription('Student planning and collaboration API')
  .setVersion('0.1.0')
  .addCookieAuth('uniflow_session')
  .addBearerAuth()
  .build();
export async function createApi() {
  loadEnvironment();
  const app = await NestFactory.create(AppModule, {
    logger: new Logger('API', { timestamp: true }),
  });
  const env = app.get<Environment>(ENVIRONMENT);
  app.setGlobalPrefix('api/v1');
  app.use(helmet());
  app.enableCors({
    origin: [env.WEB_ORIGIN, env.WEB_ORIGIN.replace('localhost', '127.0.0.1')],
    credentials: true,
  });
  const logger = new Logger('HTTP');
  app.use((request: Request, response: Response, next: NextFunction) => {
    const started = performance.now();
    response.setHeader('x-request-id', randomUUID());
    response.on('finish', () =>
      logger.log(
        JSON.stringify({
          method: request.method,
          path: request.path,
          status: response.statusCode,
          durationMs: Math.round(performance.now() - started),
          requestId: response.getHeader('x-request-id'),
        }),
      ),
    );
    next();
  });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.useGlobalFilters(new ApiExceptionFilter());
  if (env.NODE_ENV !== 'production')
    SwaggerModule.setup('api/docs', app, () => SwaggerModule.createDocument(app, openApiConfig), {
      jsonDocumentUrl: 'api/openapi.json',
    });
  app.enableShutdownHooks();
  return app;
}
