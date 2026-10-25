import createClient from 'openapi-fetch';
import type { paths } from './schema.js';

export function createApiClient(baseUrl: string) {
  return createClient<paths>({ baseUrl: baseUrl.replace(/\/$/, ''), credentials: 'include' });
}
export type { paths, components } from './schema.js';
