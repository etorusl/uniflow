import { ECDH } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { JWT } from 'google-auth-library';
import { generateRequestDetails } from 'web-push';
import { ENVIRONMENT, type Environment } from '../../infrastructure/environment.js';

const webPushEndpoints = new Map<string, RegExp>([
  ['fcm.googleapis.com', /^\/(?:fcm\/send|wp)\/[A-Za-z0-9_:.~-]+$/],
  ['updates.push.services.mozilla.com', /^\/wpush\/v[12]\/[A-Za-z0-9_:.~-]+$/],
]);

export function normalizeWebEndpoint(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (
      url.protocol === 'https:' &&
      !url.port &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      webPushEndpoints.get(url.hostname)?.test(url.pathname)
    )
      return url.href;
  } catch {
    return undefined;
  }
  return undefined;
}

export function validWebKeys(p256dh: string, auth: string) {
  if (!/^[A-Za-z0-9_-]{87}$/.test(p256dh) || !/^[A-Za-z0-9_-]{22}$/.test(auth)) return false;
  const key = Buffer.from(p256dh, 'base64url');
  const secret = Buffer.from(auth, 'base64url');
  if (key[0] !== 4 || key.toString('base64url') !== p256dh || secret.toString('base64url') !== auth)
    return false;
  try {
    ECDH.convertKey(key, 'prime256v1');
    return true;
  } catch {
    return false;
  }
}

export const validAndroidToken = (token: string) => /^[A-Za-z0-9_:.-]{20,1024}$/.test(token);

export interface PushDestination {
  transport: 'WEB' | 'ANDROID';
  address: string;
  p256dh: string | null;
  authSecret: string | null;
}

export interface PushMessage {
  title: string;
  body: string;
  path: string;
  tag: string;
  ttlSeconds: number;
  kind: 'PERSONAL' | 'GROUP';
  taskId: string;
  groupId: string | null;
}

export type PushResult =
  | { status: 'sent' }
  | { status: 'invalid' | 'retry' | 'failed' | 'unknown' | 'disabled'; reason: string };

export function classifyPushResponse(
  transport: PushDestination['transport'],
  http: number,
  code?: string,
): PushResult {
  if (http >= 200 && http < 300) return { status: 'sent' };
  if ((transport === 'WEB' && (http === 404 || http === 410)) || code === 'UNREGISTERED')
    return { status: 'invalid', reason: 'subscription_invalid' };
  if (http === 429 || (http >= 500 && http <= 599))
    return { status: 'retry', reason: `provider_${http}` };
  return { status: 'failed', reason: `provider_${http}` };
}

const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';

@Injectable()
export class PushTransports {
  private readonly fcm: { projectId: string; auth: JWT } | undefined;
  private readonly vapid: { subject: string; publicKey: string; privateKey: string } | undefined;

  constructor(@Inject(ENVIRONMENT) env: Environment) {
    if (env.FCM_PROJECT_ID && env.FCM_CLIENT_EMAIL && env.FCM_PRIVATE_KEY)
      this.fcm = {
        projectId: env.FCM_PROJECT_ID,
        auth: new JWT({
          email: env.FCM_CLIENT_EMAIL,
          key: env.FCM_PRIVATE_KEY.replace(/\\n/g, '\n'),
          scopes: [FCM_SCOPE],
        }),
      };
    if (env.WEB_PUSH_SUBJECT && env.WEB_PUSH_PUBLIC_KEY && env.WEB_PUSH_PRIVATE_KEY)
      this.vapid = {
        subject: env.WEB_PUSH_SUBJECT,
        publicKey: env.WEB_PUSH_PUBLIC_KEY,
        privateKey: env.WEB_PUSH_PRIVATE_KEY,
      };
  }

  capabilities() {
    return {
      androidAvailable: !!this.fcm,
      webAvailable: !!this.vapid,
      webPublicKey: this.vapid?.publicKey ?? null,
    };
  }

  available(transport: PushDestination['transport']) {
    return transport === 'WEB' ? !!this.vapid : !!this.fcm;
  }

  send(destination: PushDestination, message: PushMessage): Promise<PushResult> {
    return destination.transport === 'WEB'
      ? this.sendWeb(destination, message)
      : this.sendAndroid(destination, message);
  }

  private async sendWeb(destination: PushDestination, message: PushMessage): Promise<PushResult> {
    if (!this.vapid) return { status: 'disabled', reason: 'web_disabled' };
    const endpoint = normalizeWebEndpoint(destination.address);
    if (
      !endpoint ||
      !destination.p256dh ||
      !destination.authSecret ||
      !validWebKeys(destination.p256dh, destination.authSecret)
    )
      return { status: 'invalid', reason: 'subscription_invalid' };
    let details: ReturnType<typeof generateRequestDetails>;
    try {
      details = generateRequestDetails(
        { endpoint, keys: { p256dh: destination.p256dh, auth: destination.authSecret } },
        JSON.stringify({
          title: message.title,
          body: message.body,
          path: message.path,
          tag: message.tag,
        }),
        { TTL: message.ttlSeconds, vapidDetails: this.vapid },
      );
    } catch {
      return { status: 'failed', reason: 'web_configuration' };
    }
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: Object.fromEntries(
          Object.entries(details.headers).map(([key, value]) => [key, String(value)]),
        ),
        body: details.body ? new Uint8Array(details.body) : null,
        redirect: 'manual',
        signal: AbortSignal.timeout(8_000),
      });
      void response.body?.cancel().catch(() => undefined);
      return classifyPushResponse('WEB', response.status);
    } catch {
      return { status: 'unknown', reason: 'network_outcome_unknown' };
    }
  }

  private async sendAndroid(
    destination: PushDestination,
    message: PushMessage,
  ): Promise<PushResult> {
    if (!this.fcm) return { status: 'disabled', reason: 'android_disabled' };
    if (!validAndroidToken(destination.address))
      return { status: 'invalid', reason: 'subscription_invalid' };
    let token: string | null | undefined;
    try {
      token = (await this.fcm.auth.getAccessToken()).token;
    } catch {
      return { status: 'retry', reason: 'fcm_auth' };
    }
    if (!token) return { status: 'failed', reason: 'fcm_auth' };
    const endpoint = `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(this.fcm.projectId)}/messages:send`;
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          message: {
            token: destination.address,
            notification: { title: message.title, body: message.body },
            data: {
              path: message.path,
              kind: message.kind,
              taskId: message.taskId,
              ...(message.groupId ? { groupId: message.groupId } : {}),
            },
            android: {
              ttl: `${message.ttlSeconds}s`,
              notification: { channel_id: 'deadlines', tag: message.tag },
            },
          },
        }),
        redirect: 'manual',
        signal: AbortSignal.timeout(8_000),
      });
      if (response.ok) {
        void response.body?.cancel().catch(() => undefined);
        return { status: 'sent' };
      }
      const details: unknown = await response.json().catch(() => null);
      const result = details as { error?: { details?: Array<{ errorCode?: string }> } } | null;
      const code = Array.isArray(result?.error?.details)
        ? result.error.details.find((detail) => detail?.errorCode === 'UNREGISTERED')?.errorCode
        : undefined;
      return classifyPushResponse('ANDROID', response.status, code);
    } catch {
      return { status: 'unknown', reason: 'network_outcome_unknown' };
    }
  }
}
