import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadEnvironment, root } from './environment.mjs';

loadEnvironment();
const check = process.argv.includes('--check');
const files = ['apps/server/openapi.json', 'packages/api-client/src/schema.d.ts'];
const before = files.map((name) =>
  existsSync(join(root, name)) ? readFileSync(join(root, name), 'utf8') : null,
);
function run(args) {
  const result = spawnSync('pnpm', args, { cwd: root, stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`API generation failed: pnpm ${args.join(' ')}`);
}
try {
  run(['--filter', '@uniflow/server', 'openapi']);
  run([
    '--filter',
    '@uniflow/api-client',
    'exec',
    'openapi-typescript',
    '../../apps/server/openapi.json',
    '-o',
    'src/schema.d.ts',
  ]);
  if (
    check &&
    files.some((name, index) => readFileSync(join(root, name), 'utf8') !== before[index])
  )
    throw new Error(
      'API contract is stale. Run pnpm api:generate and commit the updated schema and client.',
    );
  console.log(check ? 'API contract is current.' : 'API schema and typed client generated.');
} finally {
  if (check)
    for (const [index, name] of files.entries())
      if (before[index] !== null) writeFileSync(join(root, name), before[index]);
}
