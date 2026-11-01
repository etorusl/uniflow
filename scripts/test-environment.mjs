import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { loadEnvironment, root } from './environment.mjs';

loadEnvironment();
const kind = process.argv[2];
if (!['integration', 'e2e'].includes(kind)) throw new Error('Choose integration or e2e.');
const { Client } = createRequire(join(root, 'apps/server/package.json'))('pg');
const database = `uniflow_test_${randomUUID().replaceAll('-', '')}`;
const target = new URL(process.env.DATABASE_URL);
const adminUrl = new URL(target);
adminUrl.pathname = '/postgres';
const admin = new Client({ connectionString: adminUrl.toString() });
await admin.connect();
let child;
let interrupted = false;
function stop(signal) {
  interrupted = true;
  child?.kill(signal);
}
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => stop(signal));
async function run(args, env) {
  if (interrupted) throw new Error('Test run interrupted.');
  await new Promise((resolve, reject) => {
    child = spawn('pnpm', args, { cwd: root, env, stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', (code) => {
      child = undefined;
      if (code === 0) resolve();
      else reject(new Error(`Test command failed (${code ?? 'signal'}).`));
    });
  });
}
try {
  await admin.query(`CREATE DATABASE "${database}"`);
  target.pathname = '/' + database;
  const env = {
    ...process.env,
    DATABASE_URL: target.toString(),
    NODE_ENV: 'test',
    UNIFLOW_ISOLATED_TESTS: '1',
  };
  console.log(`Using isolated ${kind} database; working data is unchanged.`);
  await run(['db:migrate'], env);
  await run(
    kind === 'e2e'
      ? ['exec', 'playwright', 'test', ...process.argv.slice(3)]
      : ['--filter', '@uniflow/server', 'test:integration'],
    env,
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Test run failed.');
  process.exitCode = 1;
} finally {
  // The identifier is generated above, never taken from a user's database URL.
  try {
    await admin.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
  } finally {
    await admin.end();
  }
}
