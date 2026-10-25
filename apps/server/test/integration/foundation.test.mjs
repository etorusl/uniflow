import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { once } from 'node:events';
import { createApi } from '../../dist/api.js';
import { StorageService } from '../../dist/infrastructure/storage.service.js';

test(
  'API checks real services, errors follow the contract, and a separate worker executes jobs',
  { timeout: 60000 },
  async () => {
    const app = await createApi();
    let worker;
    try {
      await app.init();
      await app.get(StorageService).initializeBucket();
      await app.listen(0, '127.0.0.1');
      const base = await app.getUrl();
      const health = await fetch(`${base}/api/v1/health/ready`);
      assert.equal(health.status, 200);
      assert.equal((await health.json()).status, 'ok');
      const missing = await fetch(`${base}/api/v1/missing`);
      assert.equal(missing.status, 404);
      const error = (await missing.json()).error;
      assert.equal(error.code, 'NOT_FOUND');
      assert.equal(error.requestId, missing.headers.get('x-request-id'));
      assert.equal('stack' in error, false);
      const schema = await fetch(`${base}/api/openapi.json`);
      assert.equal(schema.status, 200);
      assert.ok((await schema.json()).paths['/api/v1/health/ready']);
      worker = spawn(process.execPath, ['dist/worker.js'], { stdio: ['ignore', 'pipe', 'pipe'] });
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Worker did not start')), 15000);
        worker.stdout.on('data', (data) => {
          if (data.toString().includes('Worker is ready')) {
            clearTimeout(timer);
            resolve();
          }
        });
        worker.once('exit', (code) => {
          clearTimeout(timer);
          reject(new Error(`Worker exited: ${code}`));
        });
      });
      const probe = await promisify(execFile)(process.execPath, ['dist/cli/queue-probe.js'], {
        timeout: 35000,
      });
      assert.match(probe.stdout, /Queue probe passed/);
    } finally {
      if (worker && worker.exitCode === null) {
        worker.kill('SIGTERM');
        await once(worker, 'exit');
      }
      await app.close();
    }
  },
);
