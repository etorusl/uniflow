import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, join } from 'node:path';
import { root } from './environment.mjs';

export function androidEnvironment() {
  const env = { ...process.env };
  const sdk =
    env.ANDROID_HOME ??
    env.ANDROID_SDK_ROOT ??
    [join(root, '.local/android-sdk'), join(homedir(), 'Library/Android/sdk')].find(existsSync);
  if (!sdk) throw new Error('Set ANDROID_HOME to your Android SDK directory. See README.');
  env.ANDROID_HOME = sdk;
  env.ANDROID_SDK_ROOT = sdk;
  env.EXPO_PACKAGER_PROXY_URL ??= 'http://127.0.0.1:8081';
  const javaHome = [
    '/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home',
    '/usr/local/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home',
  ].find(existsSync);
  if (!env.JAVA_HOME && javaHome) env.JAVA_HOME = javaHome;
  for (const [key, directory] of [
    ['ANDROID_USER_HOME', '.local/android-user'],
    ['ANDROID_AVD_HOME', '.local/android-avd'],
  ]) {
    if (!env[key] && existsSync(join(root, directory))) env[key] = join(root, directory);
  }
  env.PATH = [
    ...(env.JAVA_HOME ? [join(env.JAVA_HOME, 'bin')] : []),
    join(sdk, 'platform-tools'),
    join(sdk, 'emulator'),
    env.PATH,
  ].join(delimiter);
  return env;
}
