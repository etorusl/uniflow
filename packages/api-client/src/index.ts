import createClient from 'openapi-fetch';
import type { paths } from './schema.js';

export function createApiClient(baseUrl: string) {
  return createClient<paths>({
    baseUrl: baseUrl.replace(/\/$/, ''),
    credentials: 'include',
    async fetch(request) {
      const controller = new AbortController();
      const abort = () => controller.abort();
      if (request.signal?.aborted) abort();
      else request.signal?.addEventListener('abort', abort, { once: true });
      const timer = setTimeout(abort, 20_000);
      try {
        return await fetch(request, { signal: controller.signal });
      } finally {
        clearTimeout(timer);
        request.signal?.removeEventListener('abort', abort);
      }
    },
  });
}
export type { paths, components } from './schema.js';
