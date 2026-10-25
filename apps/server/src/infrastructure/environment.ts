import { existsSync } from 'node:fs';
import { dirname, join, parse } from 'node:path';
import { z } from 'zod';

export const ENVIRONMENT = Symbol('ENVIRONMENT');
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_HOST: z.string().default('127.0.0.1'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  WEB_ORIGIN: z.url(),
  DATABASE_URL: z.string().refine((value) => {
    try {
      return ['postgres:', 'postgresql:'].includes(new URL(value).protocol);
    } catch {
      return false;
    }
  }, 'Expected a valid PostgreSQL URL'),
  S3_ENDPOINT: z.url(),
  S3_REGION: z.string().min(1),
  S3_BUCKET: z.string().min(3),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
  SMTP_HOST: z.string().min(1),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535),
  SMTP_FROM: z.string().min(1),
  SMTP_SECURE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
});
export type Environment = z.infer<typeof schema>;
export function workspaceRoot() {
  let current = process.cwd();
  while (!existsSync(join(current, 'pnpm-workspace.yaml'))) {
    if (current === parse(current).root)
      throw new Error('Run this command inside the UniFlow workspace.');
    current = dirname(current);
  }
  return current;
}
export function loadEnvironment() {
  const path = join(workspaceRoot(), '.env');
  if (existsSync(path)) process.loadEnvFile(path);
}
export function parseEnvironment(input: NodeJS.ProcessEnv): Environment {
  const result = schema.safeParse(input);
  if (!result.success)
    throw new Error(
      `Invalid environment configuration:\n${result.error.issues.map((issue) => `- ${issue.path.join('.')}: ${issue.message}`).join('\n')}\nSee .env.example; run pnpm env:init for local settings.`,
    );
  return result.data;
}
