import { Logger } from '@nestjs/common';
import { createApi } from './api.js';
import { ENVIRONMENT, type Environment } from './infrastructure/environment.js';

try {
  const app = await createApi();
  const env = app.get<Environment>(ENVIRONMENT);
  await app.listen(env.API_PORT, env.API_HOST);
  Logger.log(`API listening at http://${env.API_HOST}:${env.API_PORT}/api/v1`, 'Bootstrap');
} catch (error) {
  console.error(
    error instanceof Error && error.message.startsWith('Invalid environment')
      ? error.message
      : 'API startup failed. Check configuration, migrations and local services.',
  );
  process.exitCode = 1;
}
