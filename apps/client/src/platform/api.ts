import { createApiClient } from '@uniflow/api-client';
import { Platform } from 'react-native';
import { readSessionToken } from './session-storage';

export const apiBaseUrl = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000').replace(
  /\/$/,
  '',
);
export const api = createApiClient(apiBaseUrl);
let csrf: string | undefined;
export function setCsrfToken(token: string | undefined) {
  csrf = token;
}
export async function apiRequestHeaders(method: string): Promise<Record<string, string>> {
  if (Platform.OS !== 'web') {
    const token = await readSessionToken();
    return token
      ? { 'x-uniflow-client': 'native', authorization: `Bearer ${token}` }
      : { 'x-uniflow-client': 'native' };
  }
  return csrf && !['GET', 'HEAD', 'OPTIONS'].includes(method) ? { 'x-csrf-token': csrf } : {};
}
api.use({
  async onRequest({ request }) {
    for (const [name, value] of Object.entries(await apiRequestHeaders(request.method)))
      request.headers.set(name, value);
    return request;
  },
});
export function resultData<T>(result: { data?: T; error?: unknown; response: Response }): T {
  if (!result.response.ok || !result.data) {
    const error = result.error as { error?: { message?: string } } | undefined;
    throw new Error(error?.error?.message ?? 'Не удалось выполнить запрос. Попробуйте ещё раз.');
  }
  return result.data;
}
export function errorMessage(error: unknown) {
  return error instanceof Error && !/fetch|network|load failed/i.test(error.message)
    ? error.message
    : 'Не удалось связаться с UniFlow. Проверьте соединение.';
}
export function ensureSuccess(result: { response: Response; error?: unknown }) {
  if (!result.response.ok) {
    const error = result.error as { error?: { message?: string } } | undefined;
    throw new Error(error?.error?.message ?? 'Не удалось сохранить изменения.');
  }
}
