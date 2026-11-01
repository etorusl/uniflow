import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createApi } from '../../dist/api.js';
import { DatabaseService } from '../../dist/infrastructure/database.service.js';

export async function harness() {
  const app = await createApi({ quiet: true });
  await app.listen(0, '127.0.0.1');
  const base = `${await app.getUrl()}/api/v1`;
  const db = app.get(DatabaseService);
  const users = [];
  const request = (token, method, path, body) =>
    fetch(base + path, {
      method,
      headers: {
        'content-type': 'application/json',
        'x-uniflow-client': 'native',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  async function json(token, method, path, body, status = 200) {
    const response = await request(token, method, path, body);
    const data = response.status === 204 ? null : await response.json();
    assert.equal(response.status, status, JSON.stringify(data));
    return data;
  }
  async function account(name = 'Студент') {
    const email = `collaboration-${randomUUID()}@uniflow.local`,
      password = 'Collaboration-test-password!';
    await json(null, 'POST', '/auth/register', {
      email,
      password,
      displayName: name,
      timeZone: 'UTC',
    });
    const session = await json(null, 'POST', '/auth/login', { email, password });
    users.push(session.user.id);
    return { ...session.user, token: session.token, email, password };
  }
  async function close() {
    try {
      await db.group.deleteMany({ where: { ownerId: { in: users } } });
      await db.user.deleteMany({ where: { id: { in: users } } });
    } finally {
      await app.close();
    }
  }
  return { app, db, base, request, json, account, close, users };
}
