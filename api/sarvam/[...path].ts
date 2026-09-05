/**
 * Server-side proxy for the Sarvam AI REST API.
 *
 * The key lives in the SARVAM_API_KEY environment variable and never reaches
 * the browser. The client posts to /api/sarvam/<endpoint> with no credentials
 * and this function attaches the key on the way out.
 *
 * Deliberately NOT CORS-enabled: same-origin requests from our own page need no
 * CORS headers, and adding `access-control-allow-origin: *` would turn this into
 * a free Sarvam gateway for any website. Cross-origin browser calls therefore
 * fail by design.
 */

import { requireSession, csrfOk, CSRF_HEADER } from '../_lib/auth';

export const config = { runtime: 'edge' };

const UPSTREAM = 'https://api.sarvam.ai';

/** Explicit allowlist — never proxy an arbitrary upstream path. */
const ALLOWED = new Set([
  'digitise',
  'translate',
  'speech-to-text',
  'speech-to-text-translate',
  'text-to-speech',
]);

/** Requests per window, per IP, when using the shared server key. */
const LIMIT = 40;
const WINDOW_MS = 60_000;

/**
 * Best-effort throttle. Edge isolates are per-region and short-lived, so this
 * only slows down casual abuse — a shared quota on a public URL needs a durable
 * store (Vercel KV, Upstash) to be enforced properly.
 */
const hits = new Map<string, number[]>();

// Expo types the global `env` to its own client-side shape, which omits
// server-only variables.
const serverEnv = process.env as Record<string, string | undefined>;

/**
 * Drops only entries whose newest hit has aged out. Clearing the whole map
 * instead would let one caller reset everybody's window — including their own —
 * simply by spraying enough distinct forwarded-for values to hit the cap.
 */
function evictStale(now: number): void {
  for (const [key, times] of hits) {
    if (times.length === 0 || now - times[times.length - 1] >= WINDOW_MS) {
      hits.delete(key);
    }
  }
}

function throttled(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);

  if (hits.size > 5000) evictStale(now);
  return recent.length > LIMIT;
}

function fail(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return fail('Method not allowed', 405);

  // Authorisation happens here, on the server. The UI also hides itself behind
  // a login screen, but that is only cosmetic — this is the check that counts,
  // and it is what stops an anonymous caller spending the Sarvam quota.
  const session = await requireSession(req);
  if (!session) return fail('Not signed in', 401);

  if (!csrfOk(req)) return fail(`Missing ${CSRF_HEADER} header`, 403);

  const { pathname } = new URL(req.url);
  const endpoint = pathname.replace(/^\/api\/sarvam\//, '').replace(/\/+$/, '');

  if (!ALLOWED.has(endpoint)) return fail(`Unsupported endpoint: ${endpoint}`, 404);

  // A caller may supply their own key to use their own quota instead of ours.
  const ownKey = req.headers.get('x-user-key')?.trim();
  const key = ownKey || serverEnv.SARVAM_API_KEY;

  if (!key) {
    return fail(
      'This deployment has no SARVAM_API_KEY set. Add it in the Vercel project ' +
      'environment variables, or supply a personal key in Settings.',
      503,
    );
  }

  if (!ownKey) {
    const ip =
      req.headers.get('x-real-ip') ??
      req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
      'unknown';
    if (throttled(ip)) return fail('Rate limit exceeded — try again in a minute.', 429);
  }

  const headers = new Headers({ 'api-subscription-key': key });
  // Preserve the multipart boundary / json content type from the client.
  const contentType = req.headers.get('content-type');
  if (contentType) headers.set('content-type', contentType);

  let upstream: Response;
  try {
    upstream = await fetch(`${UPSTREAM}/${endpoint}`, {
      method: 'POST',
      headers,
      body: await req.arrayBuffer(),
    });
  } catch {
    return fail('Could not reach Sarvam AI', 502);
  }

  const out = new Headers({
    'cache-control': 'no-store',
    // Marks this status as Sarvam's, not ours. Without it a 401 from an invalid
    // personal key is indistinguishable from an expired session, and the client
    // signs the user out mid-conversation.
    'x-proxy-upstream': '1',
  });
  const upstreamType = upstream.headers.get('content-type');
  if (upstreamType) out.set('content-type', upstreamType);

  return new Response(upstream.body, { status: upstream.status, headers: out });
}
