import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const parameters = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(password, salt, 64, parameters, (error, key) => (error ? reject(error) : resolve(key))),
  );
}
export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  return `scrypt-v1$${salt.toString('base64url')}$${(await derive(password, salt)).toString('base64url')}`;
}
export async function verifyPassword(password: string, stored: string) {
  const [version, encodedSalt, encodedHash] = stored.split('$');
  if (version !== 'scrypt-v1' || !encodedSalt || !encodedHash) return false;
  const salt = Buffer.from(encodedSalt, 'base64url');
  const expected = Buffer.from(encodedHash, 'base64url');
  if (salt.length !== 16 || expected.length !== 64) return false;
  return timingSafeEqual(await derive(password, salt), expected);
}
export const DUMMY_PASSWORD_HASH = `scrypt-v1$${Buffer.alloc(16).toString('base64url')}$${Buffer.alloc(64).toString('base64url')}`;
