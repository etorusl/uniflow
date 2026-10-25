import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseEnvironment } from '../../dist/infrastructure/environment.js';

const valid = {
  WEB_ORIGIN: 'http://localhost:8081',
  DATABASE_URL: 'postgresql://test:test@localhost:5432/uniflow',
  S3_ENDPOINT: 'http://localhost:8333',
  S3_REGION: 'us-east-1',
  S3_BUCKET: 'uniflow',
  S3_ACCESS_KEY_ID: 'test',
  S3_SECRET_ACCESS_KEY: 'test',
  SMTP_HOST: 'localhost',
  SMTP_PORT: '1025',
  SMTP_FROM: 'test@uniflow.local',
};
test('environment validates ports and parses booleans without truthy-string coercion', () => {
  assert.equal(parseEnvironment({ ...valid, SMTP_SECURE: 'false' }).SMTP_SECURE, false);
  assert.equal(parseEnvironment({ ...valid, SMTP_SECURE: 'true' }).SMTP_SECURE, true);
  assert.throws(() => parseEnvironment({ ...valid, API_PORT: '70000' }), /API_PORT/);
  assert.throws(
    () => parseEnvironment({ ...valid, DATABASE_URL: 'https://example.com' }),
    /PostgreSQL/,
  );
});
test('invalid configuration reports names without exposing secret input', () => {
  assert.throws(
    () => parseEnvironment({ ...valid, DATABASE_URL: 'secret-invalid-connection-string' }),
    (error) =>
      error.message.includes('DATABASE_URL') &&
      !error.message.includes('secret-invalid-connection-string'),
  );
});
