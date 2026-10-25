import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hashPassword, verifyPassword } from '../../dist/modules/auth/password.js';

test('password hashes are salted and verification rejects a different password', async () => {
  const password = 'Long-test-password-2026';
  const first = await hashPassword(password);
  const second = await hashPassword(password);
  assert.notEqual(first, second);
  assert.equal(first.includes(password), false);
  assert.equal(await verifyPassword(password, first), true);
  assert.equal(await verifyPassword('different-password', first), false);
  assert.equal(await verifyPassword(password, 'malformed'), false);
});
