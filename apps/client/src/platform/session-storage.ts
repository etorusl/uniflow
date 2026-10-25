import * as SecureStore from 'expo-secure-store';

const key = 'uniflow.session';
let cached: string | null | undefined;
export async function readSessionToken() {
  if (cached === undefined) cached = await SecureStore.getItemAsync(key);
  return cached;
}
export async function writeSessionToken(token: string | null) {
  if (token) await SecureStore.setItemAsync(key, token);
  else await SecureStore.deleteItemAsync(key);
  cached = token;
}
