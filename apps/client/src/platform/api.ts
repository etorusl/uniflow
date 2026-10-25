import { createApiClient } from '@uniflow/api-client';

export const api = createApiClient(process.env.EXPO_PUBLIC_API_URL ?? 'http://127.0.0.1:3000');
