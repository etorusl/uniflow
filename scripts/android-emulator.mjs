import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, openSync, closeSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { androidEnvironment } from './android-environment.mjs';
import { root } from './environment.mjs';

const env = androidEnvironment();
const adb = join(env.ANDROID_HOME, 'platform-tools/adb');
const emulator = join(env.ANDROID_HOME, 'emulator/emulator');
const run = (file, args) =>
  execFileSync(file, args, { env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
function devices() {
  return run(adb, ['devices'])
    .split(/\r?\n/)
    .filter((line) => /^emulator-\d+\tdevice$/.test(line))
    .map((line) => line.split('\t')[0]);
}
const avds = run(emulator, ['-list-avds']).trim().split(/\r?\n/).filter(Boolean);
const action = process.argv[2];
if (action === 'list') {
  console.log(avds.join('\n') || 'No AVDs. Create a virtual device in Android Studio.');
} else if (action === 'stop') {
  const connected = devices();
  const serial = env.ANDROID_SERIAL ?? (connected.length === 1 ? connected[0] : undefined);
  if (!serial || !connected.includes(serial))
    throw new Error('Select one running emulator with ANDROID_SERIAL. See pnpm android:devices.');
  console.log(run(adb, ['-s', serial, 'emu', 'kill']).trim());
  for (let attempt = 0; attempt < 100 && devices().includes(serial); attempt++) await delay(100);
  if (devices().includes(serial)) throw new Error('Emulator is still shutting down.');
  console.log('Android emulator stopped. Installed apps and their data are preserved.');
} else if (action === 'start') {
  const avd = env.ANDROID_AVD ?? (avds.length === 1 ? avds[0] : undefined);
  if (!avd || !avds.includes(avd))
    throw new Error('Select an AVD with ANDROID_AVD. See pnpm android:avds.');
  function findDevice() {
    return devices().find(
      (serial) => run(adb, ['-s', serial, 'emu', 'avd', 'name']).split(/\r?\n/)[0] === avd,
    );
  }
  if (findDevice()) {
    console.log(
      `${avd} is already running. For a headless instance, stop it and start it again to show a window.`,
    );
  } else {
    mkdirSync(join(root, '.local'), { recursive: true });
    const log = join(root, '.local/android-emulator.log');
    const fd = openSync(log, 'a', 0o600);
    const child = spawn(
      emulator,
      [
        '-avd',
        avd,
        '-no-snapshot',
        '-no-boot-anim',
        '-no-audio',
        '-memory',
        '2048',
        '-cores',
        '2',
        '-gpu',
        'swiftshader',
      ],
      { env, detached: true, stdio: ['ignore', fd, fd] },
    );
    closeSync(fd);
    let failure;
    child.on('error', (error) => {
      failure = error.message;
    });
    child.on('exit', (code) => {
      failure = `Emulator exited (${code}).`;
    });
    child.unref();
    console.log(`Opening ${avd}. Waiting for Android to boot… Log: ${log}`);
    let booted = false;
    for (let attempt = 0; attempt < 180; attempt++) {
      if (failure) throw new Error(`${failure} Check ${log}`);
      const serial = findDevice();
      if (
        serial &&
        run(adb, ['-s', serial, 'shell', 'getprop', 'sys.boot_completed']).trim() === '1'
      ) {
        booted = true;
        console.log(`${avd} is ready (${serial}). Run pnpm android:open.`);
        break;
      }
      await delay(1000);
    }
    if (!booted) throw new Error(`Android did not finish booting. Check ${log}`);
  }
} else {
  throw new Error('Usage: node scripts/android-emulator.mjs list|start|stop');
}
