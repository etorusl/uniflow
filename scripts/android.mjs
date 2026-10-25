import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { androidEnvironment } from './android-environment.mjs';
import { loadEnvironment } from './environment.mjs';

loadEnvironment();
const env = androidEnvironment();
const adb = join(
  env.ANDROID_HOME,
  'platform-tools',
  process.platform === 'win32' ? 'adb.exe' : 'adb',
);
const run = (args) => execFileSync(adb, args, { env, encoding: 'utf8' });
const devices = run(['devices']);
const action = process.argv[2];
if (action === 'devices') {
  console.log(devices.trim());
} else if (['connect', 'open', 'close'].includes(action)) {
  const connected = devices
    .split(/\r?\n/)
    .filter((line) => /\tdevice$/.test(line))
    .map((line) => line.split('\t')[0]);
  const serial = env.ANDROID_SERIAL ?? (connected.length === 1 ? connected[0] : undefined);
  if (!serial || !connected.includes(serial))
    throw new Error('Connect one authorized Android device, or select it with ANDROID_SERIAL.');
  if (action === 'close') {
    run(['-s', serial, 'shell', 'am', 'force-stop', 'com.uniflow.app']);
    console.log(`UniFlow closed on ${serial}. Emulator and server keep running.`);
  } else {
    const api = new URL(env.EXPO_PUBLIC_API_URL);
    const ports = new Set([8081]);
    if (['localhost', '127.0.0.1', '[::1]'].includes(api.hostname)) {
      ports.add(Number(api.port || (api.protocol === 'https:' ? 443 : 80)));
    }
    for (const port of ports) run(['-s', serial, 'reverse', `tcp:${port}`, `tcp:${port}`]);
    console.log(
      `Android ${serial}: localhost ports ${[...ports].join(', ')} connected to this computer.`,
    );
    if (action === 'open') {
      if (!run(['-s', serial, 'shell', 'pm', 'path', 'com.uniflow.app']).trim())
        throw new Error('UniFlow is not installed. Run pnpm dev:android first.');
      try {
        const response = await fetch('http://127.0.0.1:8081/status', {
          signal: AbortSignal.timeout(3000),
        });
        if (!response.ok) throw new Error('Metro is unavailable.');
      } catch {
        throw new Error('Start pnpm dev before opening the Android development build.');
      }
      console.log(
        run([
          '-s',
          serial,
          'shell',
          'am',
          'start',
          '-a',
          'android.intent.action.VIEW',
          '-d',
          `uniflow://expo-development-client/?url=${encodeURIComponent('http://127.0.0.1:8081')}`,
          'com.uniflow.app',
        ]).trim(),
      );
    }
  }
} else {
  throw new Error('Usage: node scripts/android.mjs devices|connect|open|close');
}
