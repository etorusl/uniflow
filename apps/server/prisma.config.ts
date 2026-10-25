import { defineConfig } from 'prisma/config';
import { loadEnvironment, parseEnvironment } from './src/infrastructure/environment.js';

loadEnvironment();
const environment = parseEnvironment(process.env);
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: environment.DATABASE_URL },
});
