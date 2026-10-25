import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const root = fileURLToPath(new URL('../', import.meta.url));
export function loadEnvironment() {
  const filename = fileURLToPath(new URL('../.env', import.meta.url));
  if (!existsSync(filename)) throw new Error('Missing .env. Run pnpm env:init first.');
  process.loadEnvFile(filename);
}
