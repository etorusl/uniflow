import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { root } from './environment.mjs';

const filename = join(root, '.local/dev-process.json');
function startedAt(pid) {
  if (!Number.isInteger(pid) || pid <= 1) return null;
  try {
    return execFileSync('ps', ['-p', String(pid), '-o', 'lstart='], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}
function readState() {
  try {
    return JSON.parse(readFileSync(filename, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}
const previous = readState();
const running = previous && previous.startedAt && startedAt(previous.pid) === previous.startedAt;
if (process.argv.includes('stop')) {
  if (!running) {
    console.log('UniFlow dev is not running.');
  } else {
    process.kill(previous.pid, 'SIGTERM');
    for (
      let attempt = 0;
      attempt < 100 && startedAt(previous.pid) === previous.startedAt;
      attempt++
    )
      await delay(100);
    if (startedAt(previous.pid) === previous.startedAt)
      throw new Error('UniFlow is still stopping. Check the terminal running pnpm dev.');
    console.log('UniFlow web, API, worker and watchers stopped. Infrastructure is unchanged.');
  }
} else {
  if (running) throw new Error('UniFlow dev is already running. Use pnpm dev:stop first.');
  mkdirSync(join(root, '.local'), { recursive: true });
  const state = { pid: process.pid, startedAt: startedAt(process.pid) };
  writeFileSync(filename, JSON.stringify(state), { mode: 0o600 });
  const child = spawn(
    'pnpm',
    [
      'exec',
      'concurrently',
      '--kill-others',
      '-n',
      'server,web',
      'pnpm --filter @uniflow/server dev',
      'pnpm dev:web',
    ],
    { cwd: root, env: process.env, stdio: 'inherit', detached: true },
  );
  let stopping = false;
  function stop(signal) {
    if (stopping) return;
    stopping = true;
    try {
      process.kill(-child.pid, signal);
    } catch (error) {
      if (error.code !== 'ESRCH') throw error;
    }
    setTimeout(() => {
      try {
        process.kill(-child.pid, 'SIGKILL');
      } catch (error) {
        if (error.code !== 'ESRCH') throw error;
      }
    }, 8000).unref();
  }
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => stop(signal));
  function cleanup() {
    if (readState()?.pid === process.pid) unlinkSync(filename);
  }
  child.on('error', (error) => {
    cleanup();
    console.error(error.message);
    process.exitCode = 1;
  });
  child.on('exit', (code) => {
    cleanup();
    process.exitCode = stopping ? 0 : (code ?? 1);
  });
}
