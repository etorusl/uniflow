import { randomBytes } from 'node:crypto';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { androidEnvironment } from './android-environment.mjs';
import { loadEnvironment, root } from './environment.mjs';

loadEnvironment();
const env = androidEnvironment();
// The local release uses ADB reverse. Rebuilds update the same separately installed app.
delete env.GOOGLE_SERVICES_JSON;
const api = new URL(env.EXPO_PUBLIC_API_URL);
if (api.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(api.hostname))
  throw new Error(
    'Set EXPO_PUBLIC_API_URL to the local HTTP API for the standalone Android build.',
  );
const client = join(root, 'apps/client');
const android = join(client, 'android');
const local = join(root, '.local');
const keystore = join(local, 'uniflow-local.p12');
const passwordFile = join(local, 'uniflow-local-signing.key');
const artifact = join(local, 'uniflow-local-release.apk');
const metadata = join(local, 'uniflow-local-release.json');
const applicationId = 'com.uniflow.app.local';
const adb = join(env.ANDROID_HOME, 'platform-tools', 'adb');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { env, stdio: 'inherit', ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited unsuccessfully (${result.status}).`);
  return result.stdout;
}

const action = process.argv[2];
if (action === 'build') {
  mkdirSync(local, { recursive: true, mode: 0o700 });
  if (!existsSync(passwordFile)) {
    if (existsSync(keystore))
      throw new Error('Local keystore exists, but its signing password file is missing.');
    writeFileSync(passwordFile, randomBytes(32).toString('hex'), { mode: 0o600, flag: 'wx' });
  }
  env.UNIFLOW_RELEASE_KEYSTORE = keystore;
  env.UNIFLOW_RELEASE_PASSWORD = readFileSync(passwordFile, 'utf8').trim();
  if (!existsSync(keystore)) {
    run(
      'keytool',
      [
        '-genkeypair',
        '-keystore',
        keystore,
        '-storetype',
        'PKCS12',
        '-alias',
        'uniflow-local',
        '-storepass:env',
        'UNIFLOW_RELEASE_PASSWORD',
        '-keypass:env',
        'UNIFLOW_RELEASE_PASSWORD',
        '-keyalg',
        'RSA',
        '-keysize',
        '2048',
        '-validity',
        '3650',
        '-dname',
        'CN=UniFlow Local',
        '-noprompt',
      ],
      { env },
    );
  }
  chmodSync(keystore, 0o600);
  run('pnpm', ['exec', 'expo', 'prebuild', '--platform', 'android', '--no-install'], {
    cwd: client,
  });
  const architecture = env.UNIFLOW_ANDROID_ARCH;
  const gradle = ['assembleRelease', '--max-workers=2'];
  if (architecture) gradle.push(`-PreactNativeArchitectures=${architecture}`);
  run(join(android, 'gradlew'), gradle, { cwd: android });
  copyFileSync(join(android, 'app/build/outputs/apk/release/app-release.apk'), artifact);
  writeFileSync(metadata, JSON.stringify({ api: api.origin }), { mode: 0o600 });
  console.log(`Signed standalone APK: ${artifact}`);
} else if (action === 'open') {
  if (!existsSync(artifact) || !existsSync(metadata))
    throw new Error('Run pnpm android:release to build the local APK first.');
  if (JSON.parse(readFileSync(metadata, 'utf8')).api !== api.origin)
    throw new Error(
      'The API address changed since the APK was built. Run pnpm android:release again.',
    );
  const args = env.ANDROID_SERIAL ? ['-s', env.ANDROID_SERIAL] : [];
  const port = Number(api.port || 80);
  run(adb, [...args, 'reverse', `tcp:${port}`, `tcp:${port}`]);
  run(adb, [...args, 'install', '-r', artifact]);
  run(adb, [
    ...args,
    'shell',
    'am',
    'start',
    '-n',
    `${applicationId}/com.uniflow.app.MainActivity`,
  ]);
} else {
  throw new Error('Usage: node scripts/android-release.mjs build|open');
}
