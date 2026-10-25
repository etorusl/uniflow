// Browser authentication uses an HttpOnly cookie. No session secret is exposed to JS.
export async function readSessionToken(): Promise<string | null> {
  return null;
}
export async function writeSessionToken(_token: string | null) {
  void _token;
}
