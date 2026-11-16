import assert from 'node:assert/strict';
import { createECDH, randomBytes } from 'node:crypto';
import { test } from 'node:test';
import { generateVAPIDKeys } from 'web-push';
import {
  PushTransports,
  classifyPushResponse,
  normalizeWebEndpoint,
  validAndroidToken,
  validWebKeys,
} from '../../dist/modules/notifications/push-transports.js';

test('subscription validation only accepts supported Web Push destinations and canonical keys', () => {
  const endpoint = 'https://fcm.googleapis.com/fcm/send/Aa_bb-9';
  assert.equal(normalizeWebEndpoint(endpoint), endpoint);
  assert.equal(
    normalizeWebEndpoint('https://updates.push.services.mozilla.com/wpush/v2/Aa_b9'),
    'https://updates.push.services.mozilla.com/wpush/v2/Aa_b9',
  );
  for (const rejected of [
    'http://fcm.googleapis.com/fcm/send/Aabb',
    'https://fcm.googleapis.com@127.0.0.1/fcm/send/Aabb',
    'https://fcm.googleapis.com:8080/fcm/send/Aabb',
    'https://fcm.googleapis.com/anything/Aabb',
    'https://fcm.googleapis.com.invalid/fcm/send/Aabb',
    'https://fcm.googleapis.com/fcm/send/Aabb?next=example',
  ])
    assert.equal(normalizeWebEndpoint(rejected), undefined);

  const key = createECDH('prime256v1').generateKeys().toString('base64url');
  const auth = randomBytes(16).toString('base64url');
  assert.equal(validWebKeys(key, auth), true);
  assert.equal(validWebKeys(key, `${auth}=`), false);
  assert.equal(
    validWebKeys(Buffer.concat([Buffer.from([4]), Buffer.alloc(64)]).toString('base64url'), auth),
    false,
  );
  assert.equal(validAndroidToken('token:for-uniflow-Android123'), true);
  assert.equal(validAndroidToken('ExponentPushToken[uniflow]'), false);
});

test('provider statuses distinguish delivery, retryable failure and invalid subscriptions', async () => {
  assert.equal(classifyPushResponse('WEB', 201).status, 'sent');
  assert.equal(classifyPushResponse('WEB', 410).status, 'invalid');
  assert.equal(classifyPushResponse('ANDROID', 404, 'UNREGISTERED').status, 'invalid');
  assert.equal(classifyPushResponse('ANDROID', 404).status, 'failed');
  assert.equal(classifyPushResponse('WEB', 429).status, 'retry');
  assert.equal(classifyPushResponse('ANDROID', 503).status, 'retry');
  assert.equal(classifyPushResponse('WEB', 307).status, 'failed');

  const transport = new PushTransports({});
  assert.deepEqual(transport.capabilities(), {
    androidAvailable: false,
    webAvailable: false,
    webPublicKey: null,
  });
  assert.equal((await transport.send({ transport: 'ANDROID' }, {})).status, 'disabled');
});

test('Web Push encrypts the payload, signs the request and rejects redirects', async (context) => {
  const vapid = generateVAPIDKeys();
  const browserKey = createECDH('prime256v1').generateKeys().toString('base64url');
  const authSecret = randomBytes(16).toString('base64url');
  const address = 'https://fcm.googleapis.com/fcm/send/an-active-test-subscription';
  const transport = new PushTransports({
    WEB_PUSH_SUBJECT: 'mailto:test@uniflow.local',
    WEB_PUSH_PUBLIC_KEY: vapid.publicKey,
    WEB_PUSH_PRIVATE_KEY: vapid.privateKey,
  });
  const send = context.mock.method(
    globalThis,
    'fetch',
    async () =>
      new Response(null, {
        status: 307,
        headers: { location: 'https://example.invalid/' },
      }),
  );
  const result = await transport.send(
    { transport: 'WEB', address, p256dh: browserKey, authSecret },
    {
      title: 'UniFlow',
      body: 'Private test string',
      path: '/tasks',
      tag: 'test',
      ttlSeconds: 30,
      kind: 'PERSONAL',
      taskId: 'test-id',
      groupId: null,
    },
  );
  assert.equal(result.status, 'failed');
  assert.equal(send.mock.callCount(), 1);
  const [url, init] = send.mock.calls[0].arguments;
  assert.equal(url, address);
  assert.equal(init.method, 'POST');
  assert.equal(init.redirect, 'manual');
  const headers = new Headers(init.headers);
  assert.match(headers.get('authorization'), /^vapid /i);
  assert.equal(headers.get('content-encoding'), 'aes128gcm');
  assert.doesNotMatch(Buffer.from(init.body).toString('utf8'), /Private test string/);
});
