import { execFileSync } from 'node:child_process';
import { existsSync, openSync, fstatSync, readSync, closeSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { root } from './environment.mjs';

const project = resolve(root, 'apps/client/android');
const gradleHome = process.env.GRADLE_USER_HOME ?? join(homedir(), '.gradle');
const ps = (args) =>
  execFileSync('ps', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
function identity(pid) {
  try {
    return ps(['-p', String(pid), '-o', 'lstart=', '-o', 'command=']).trim();
  } catch {
    return null;
  }
}
function latestProject(filename) {
  const fd = openSync(filename, 'r');
  try {
    let end = fstatSync(fd).size;
    let suffix = '';
    while (end > 0) {
      const start = Math.max(0, end - 64 * 1024);
      const buffer = Buffer.alloc(end - start);
      const read = readSync(fd, buffer, 0, buffer.length, start);
      const text = buffer.subarray(0, read).toString('utf8');
      const project = [...(text + suffix).matchAll(/currentDir=([^}\r\n]+)/g)].at(-1)?.[1];
      if (project) return project;
      suffix = text.slice(0, 8192);
      end = start;
    }
    return undefined;
  } finally {
    closeSync(fd);
  }
}
const processes = ps(['-ax', '-o', 'pid=', '-o', 'ppid=', '-o', 'command='])
  .split('\n')
  .flatMap((line) => {
    const match = line.match(/^\s*(\d+)\s+(\d+)\s+(.+)$/);
    return match ? [{ pid: Number(match[1]), parent: Number(match[2]), command: match[3] }] : [];
  });
const daemons = processes.filter((entry) => {
  const version = entry.command.match(
    /org\.gradle\.launcher\.daemon\.bootstrap\.GradleDaemon\s+([\d.]+)\s*$/,
  )?.[1];
  if (!version) return false;
  const log = join(gradleHome, 'daemon', version, `daemon-${entry.pid}.out.log`);
  if (!existsSync(log)) return false;
  const lastProject = latestProject(log);
  return lastProject && resolve(lastProject) === project;
});
const selected = [
  ...processes.filter(
    (entry) =>
      /org\.jetbrains\.kotlin\.daemon\.KotlinCompileDaemon\b/.test(entry.command) &&
      daemons.some((daemon) => entry.parent === daemon.pid),
  ),
  ...daemons,
]
  .map((entry) => ({ ...entry, identity: identity(entry.pid) }))
  .filter((entry) => entry.identity);
if (!selected.length) {
  console.log('No Android build daemons whose latest build belongs to UniFlow.');
} else {
  for (const entry of selected) {
    if (identity(entry.pid) === entry.identity) {
      try {
        process.kill(entry.pid, 'SIGTERM');
      } catch (error) {
        if (error.code !== 'ESRCH') throw error;
      }
    }
  }
  for (let attempt = 0; attempt < 100; attempt++) {
    if (selected.every((entry) => identity(entry.pid) !== entry.identity)) break;
    await delay(100);
  }
  const remaining = selected.filter((entry) => identity(entry.pid) === entry.identity);
  if (remaining.length)
    throw new Error(
      `Build processes still stopping: ${remaining.map((entry) => entry.pid).join(', ')}`,
    );
  console.log(
    `Stopped ${selected.length} UniFlow Gradle/Kotlin daemon(s). Build caches and app data are preserved.`,
  );
}
