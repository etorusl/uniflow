import { mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { loadEnvironment, root } from './environment.mjs';

loadEnvironment();
if (!process.env.S3_ACCESS_KEY_ID || !process.env.S3_SECRET_ACCESS_KEY)
  throw new Error('S3 credentials are required in .env.');
mkdirSync(join(root, '.local'), { recursive: true, mode: 0o700 });
writeFileSync(
  join(root, '.local/seaweedfs-s3.json'),
  JSON.stringify({
    identities: [
      {
        name: 'uniflow',
        credentials: [
          { accessKey: process.env.S3_ACCESS_KEY_ID, secretKey: process.env.S3_SECRET_ACCESS_KEY },
        ],
        actions: ['Admin', 'Read', 'Write', 'List', 'Tagging'],
      },
    ],
  }),
  { mode: 0o600 },
);
const plugin = spawnSync('docker', ['compose', 'version'], { stdio: 'ignore' });
const command = plugin.status === 0 ? 'docker' : 'docker-compose';
const args = [
  ...(plugin.status === 0 ? ['compose'] : []),
  '--project-name',
  'uniflow',
  '--project-directory',
  root,
  '--env-file',
  join(root, '.env'),
  '-f',
  join(root, 'infra/compose/compose.yaml'),
  ...process.argv.slice(2),
];
const result = spawnSync(command, args, { stdio: 'inherit', cwd: root });
if (result.error)
  console.error(
    'Docker Compose is unavailable. Install Docker Desktop or Docker/Colima and start the Docker daemon.',
  );
if (result.status !== 0 && process.argv[2] === 'up') {
  const base = args.slice(0, args.length - process.argv.slice(2).length);
  spawnSync(command, [...base, 'ps', '--all'], { stdio: 'inherit', cwd: root });
  spawnSync(command, [...base, 'logs', '--no-color', '--tail', '80', 'seaweedfs'], {
    stdio: 'inherit',
    cwd: root,
  });
  spawnSync('docker', ['inspect', '--format', '{{json .State.Health}}', 'uniflow-seaweedfs-1'], {
    stdio: 'inherit',
    cwd: root,
  });
}
process.exit(result.status ?? 1);
