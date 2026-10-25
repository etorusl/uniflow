import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { loadEnvironment, root } from './environment.mjs';
import { androidEnvironment } from './android-environment.mjs';

loadEnvironment();
if (!process.env.EXPO_PUBLIC_API_URL) throw new Error('Set EXPO_PUBLIC_API_URL in .env.');
const child = spawn('pnpm', ['exec', 'expo', ...process.argv.slice(2)], {
  cwd: join(root, 'apps/client'),
  env: process.argv.includes('run:android') ? androidEnvironment() : process.env,
  stdio: 'inherit',
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('error', (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
