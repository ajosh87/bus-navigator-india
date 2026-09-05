/**
 * Turns transport-level failures into something a traveller can act on.
 *
 * `fetch()` throws "Failed to fetch" when the network is unreachable — accurate
 * for a developer, meaningless to the person holding the phone, and it was
 * surfacing verbatim in toasts across the app.
 */
export function humanError(e: unknown, fallback = 'Something went wrong'): string {
  const raw = e instanceof Error ? e.message : typeof e === 'string' ? e : '';

  if (/failed to fetch|network request failed|load failed|networkerror/i.test(raw)) {
    return 'No connection to the server. Check your network and try again.';
  }
  if (/abort|timed? ?out/i.test(raw)) {
    return 'That took too long. Try again.';
  }
  if (/not signed in|\b401\b/i.test(raw)) {
    return 'Your session ended. Sign in again.';
  }
  if (/\b429\b|rate limit/i.test(raw)) {
    return 'Too many requests just now. Wait a moment and retry.';
  }
  return raw ? raw.slice(0, 140) : fallback;
}
