import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export const SESSION_COOKIE = 'uniflow_session';
export const SESSION_DAYS = 30;
export function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}
export function csrfToken(token: string) {
  return createHmac('sha256', token).update('uniflow-csrf').digest('hex');
}
export function sameToken(actual: string | undefined, expected: string) {
  if (!actual || !/^[a-f0-9]{64}$/.test(actual)) return false;
  return timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(expected, 'hex'));
}
