import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout } from 'node:timers/promises';
import { test } from 'node:test';
import { createApi } from '../../dist/api.js';
import { DatabaseService } from '../../dist/infrastructure/database.service.js';
import { ENVIRONMENT } from '../../dist/infrastructure/environment.js';
import { RateLimitService } from '../../dist/modules/auth/rate-limit.service.js';
import { hashToken } from '../../dist/modules/auth/tokens.js';

test(
  'accounts support immediate login, cookie CSRF, native sessions and single-use recovery',
  { timeout: 60000 },
  async () => {
    const app = await createApi({ quiet: true });
    let worker;
    const email = `accounts-${randomUUID()}@uniflow.local`;
    const password = 'Test-password-2026!';
    const newPassword = 'Replacement-password-2026!';
    const db = app.get(DatabaseService);
    try {
      await app.listen(0, '127.0.0.1');
      const base = await app.getUrl();
      const origin = app.get(ENVIRONMENT).WEB_ORIGIN;
      async function post(path, body, headers = {}) {
        return fetch(`${base}/api/v1/auth/${path}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', origin, ...headers },
          body: JSON.stringify(body),
        });
      }
      const registration = await post('register', {
        email: email.toUpperCase(),
        password,
        displayName: 'Студент',
        timeZone: 'Asia/Novosibirsk',
      });
      assert.equal(registration.status, 200);
      const duplicate = await post('register', {
        email,
        password,
        displayName: 'Другой',
        timeZone: 'UTC',
      });
      assert.equal(duplicate.status, 409);
      assert.equal((await post('login', { email, password: 'wrong-password' })).status, 401);
      const login = await post('login', { email, password }, { 'x-uniflow-client': 'native' });
      assert.equal(login.status, 200);
      const native = await login.json();
      assert.ok(native.token);
      assert.equal('passwordHash' in native.user, false);
      assert.equal('emailVerified' in native.user, false);
      const stored = await db.session.findUnique({ where: { tokenHash: hashToken(native.token) } });
      assert.ok(stored);
      assert.notEqual(stored.tokenHash, native.token);
      assert.equal(
        (
          await fetch(`${base}/api/v1/auth/session`, {
            headers: { authorization: `Bearer ${native.token}` },
          })
        ).status,
        200,
      );

      const browserLogin = await post('login', { email, password });
      const cookie = browserLogin.headers.get('set-cookie').split(';')[0];
      assert.match(browserLogin.headers.get('set-cookie'), /HttpOnly/i);
      assert.match(browserLogin.headers.get('set-cookie'), /SameSite=Lax/i);
      const browser = await browserLogin.json();
      assert.equal(browser.token, undefined);
      async function profile(headers) {
        return fetch(`${base}/api/v1/users/me`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json', cookie, ...headers },
          body: JSON.stringify({ displayName: 'Новое имя', timeZone: 'Europe/Moscow' }),
        });
      }
      assert.equal((await profile({ origin })).status, 403);
      assert.equal(
        (await profile({ origin: 'https://untrusted.example', 'x-csrf-token': browser.csrfToken }))
          .status,
        403,
      );
      const saved = await profile({ origin, 'x-csrf-token': browser.csrfToken });
      assert.equal(saved.status, 200);
      assert.equal((await saved.json()).displayName, 'Новое имя');
      await db.session.update({
        where: { id: stored.id },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      assert.equal(
        (
          await fetch(`${base}/api/v1/auth/session`, {
            headers: { authorization: `Bearer ${native.token}` },
          })
        ).status,
        401,
      );

      worker = spawn(process.execPath, ['dist/worker.js'], { stdio: ['ignore', 'pipe', 'pipe'] });
      await new Promise((resolve, reject) => {
        const timeout = globalThis.setTimeout(
          () => reject(new Error('Worker did not start')),
          15000,
        );
        worker.stdout.on('data', (data) => {
          if (data.toString().includes('Worker is ready')) {
            clearTimeout(timeout);
            resolve();
          }
        });
        worker.once('exit', (code) => {
          clearTimeout(timeout);
          reject(new Error(`Worker exited: ${code}`));
        });
      });
      assert.equal((await post('forgot-password', { email })).status, 200);
      const mailpitPort = process.env.MAILPIT_PORT ?? '8025';
      let token;
      for (let attempt = 0; attempt < 60; attempt++) {
        const search = await fetch(
          `http://127.0.0.1:${mailpitPort}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`,
        ).then((response) => response.json());
        if (search.messages?.[0]?.ID) {
          const message = await fetch(
            `http://127.0.0.1:${mailpitPort}/api/v1/message/${search.messages[0].ID}`,
          ).then((response) => response.json());
          token = message.Text?.match(/reset-password\?token=([A-Za-z0-9_-]{43})/)?.[1];
          if (token) break;
        }
        await setTimeout(250);
      }
      assert.ok(token, 'Recovery email should be delivered by the worker to Mailpit');
      const action = await db.actionToken.findUnique({ where: { tokenHash: hashToken(token) } });
      assert.ok(action);
      assert.notEqual(action.tokenHash, token);
      assert.equal((await post('reset-password', { token, password: newPassword })).status, 200);
      assert.equal((await post('reset-password', { token, password: newPassword })).status, 400);
      assert.equal(
        (await fetch(`${base}/api/v1/auth/session`, { headers: { cookie } })).status,
        401,
      );
      assert.equal((await post('login', { email, password })).status, 401);
      const renewed = await post(
        'login',
        { email, password: newPassword },
        { 'x-uniflow-client': 'native' },
      );
      assert.equal(renewed.status, 200);
      const renewedToken = (await renewed.json()).token;
      assert.equal(
        (
          await fetch(`${base}/api/v1/auth/logout`, {
            method: 'POST',
            headers: { authorization: `Bearer ${renewedToken}` },
          })
        ).status,
        200,
      );
      assert.equal(
        (
          await fetch(`${base}/api/v1/auth/session`, {
            headers: { authorization: `Bearer ${renewedToken}` },
          })
        ).status,
        401,
      );

      const rateKey = `test-${randomUUID()}`;
      const limiter = app.get(RateLimitService);
      await limiter.consume(rateKey, 1, 60);
      await assert.rejects(limiter.consume(rateKey, 1, 60), (error) => error.getStatus() === 429);
      await db.authRateLimit.delete({ where: { key: hashToken(rateKey) } });
    } finally {
      if (worker && worker.exitCode === null) {
        worker.kill('SIGTERM');
        await once(worker, 'exit');
      }
      await db.user.deleteMany({ where: { email } });
      await app.close();
    }
  },
);
