import { Platform } from 'react-native';

/**
 * Single entry point for calls to our own backend, so credentials and the CSRF
 * header cannot be forgotten at an individual call site.
 */

/** Native builds have no same-origin server, so they need the deployed host. */
const DEPLOYED_ORIGIN = 'https://bus-navigator-india.vercel.app';

export const API_ORIGIN = Platform.OS === 'web' ? '' : DEPLOYED_ORIGIN;

/**
 * Mirrors CSRF_HEADER in api/_lib/auth.ts. A cross-site form POST cannot set a
 * custom header, and a cross-origin fetch cannot either without a CORS grant
 * the proxy never issues.
 */
export const CSRF_HEADER = 'x-app-request';

/**
 * Set by the proxy on any response it forwarded from Sarvam. A 401 carrying it
 * is an upstream credential problem, not our session expiring.
 */
const UPSTREAM_MARKER = 'x-proxy-upstream';

/** Notified whenever the backend rejects us, so the UI can return to login. */
type Listener = () => void;
const unauthorizedListeners = new Set<Listener>();

export function onUnauthorized(fn: Listener): () => void {
  unauthorizedListeners.add(fn);
  return () => unauthorizedListeners.delete(fn);
}

export function reportUnauthorized(): void {
  for (const fn of unauthorizedListeners) fn();
}

export async function appFetch(path: string, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  headers.set(CSRF_HEADER, '1');

  const res = await fetch(`${API_ORIGIN}${path}`, {
    ...init,
    // The session lives in an HttpOnly cookie, so it has to ride along.
    credentials: 'include',
    headers,
  });

  // A dropped or expired session should bounce the whole app back to login
  // rather than surfacing as an inscrutable failure inside one feature — but
  // only when the 401 is ours. Sarvam rejecting a personal key is forwarded
  // with the same status, and must not sign the user out.
  if (res.status === 401 && !res.headers.get(UPSTREAM_MARKER)) reportUnauthorized();

  return res;
}
