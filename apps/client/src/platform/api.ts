import { createApiClient } from '@uniflow/api-client';
import { Platform } from 'react-native';
import { readSessionToken } from './session-storage';

export const api = createApiClient(process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000');
let csrf: string | undefined;
export function setCsrfToken(token: string | undefined) {
  csrf = token;
}
api.use({
  async onRequest({ request }) {
    if (Platform.OS !== 'web') {
      request.headers.set('x-uniflow-client', 'native');
      const token = await readSessionToken();
      if (token) request.headers.set('authorization', `Bearer ${token}`);
    } else if (csrf && !['GET', 'HEAD', 'OPTIONS'].includes(request.method))
      request.headers.set('x-csrf-token', csrf);
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
