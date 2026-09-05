/**
 * WebSocket relay for Sarvam's realtime speech API.
 *
 * Why this exists: the Vercel proxy keeps the Sarvam key off the client for
 * every REST call, but Vercel cannot proxy a WebSocket on any runtime. Without
 * a relay, realtime streaming would require shipping the key to the browser —
 * so streaming was only available to users who pasted in their own key.
 *
 * A browser connects here with no credentials. This Worker opens its own
 * outbound socket to Sarvam, attaching the key from a secret, and pipes frames
 * both ways verbatim. Cloudflare bills one request per connection (messages are
 * free), so this comfortably fits the Workers free plan.
 *
 * Deploy:
 *   cd worker
 *   npx wrangler secret put SARVAM_API_KEY
 *   npx wrangler deploy
 */

/**
 * https://, not wss:// — the Workers fetch API rejects the wss scheme outright
 * ("Fetch API cannot load"). An outbound WebSocket is an https request carrying
 * `Upgrade: websocket`, and the response comes back with a `webSocket` property.
 */
import { verifyTicket } from './ticket';

const UPSTREAM = 'https://api.sarvam.ai/speech-to-text-realtime/ws';

export interface Env {
  SARVAM_API_KEY?: string;
  /**
   * Shared with the Vercel deployment so this Worker can verify relay tickets.
   * Set with: wrangler secret put AUTH_SESSION_SECRET
   */
  AUTH_SESSION_SECRET?: string;
  /** Comma-separated origins allowed to open a relay socket. */
  ALLOWED_ORIGINS?: string;
}

/** Subprotocol carrying the relay ticket, since a browser cannot set headers. */
const TICKET_PROTOCOL_PREFIX = 'relay-ticket.';

/**
 * Query parameters forwarded upstream. An allowlist rather than a blanket
 * copy, so a caller cannot smuggle in unexpected upstream options.
 */
const FORWARDED = new Set([
  'language_code',
  'model',
  'mode',
  'stream_type',
  'endpointing',
  'encoding',
  'sample_rate',
  'silence_duration_ms',
  'prefix_padding_ms',
  'return_timestamps',
  'threshold',
]);

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

/**
 * Only 1000 and 3000–4999 may be sent explicitly; codes like 1006 (abnormal
 * closure) are synthesised by the runtime and throw if you pass them on.
 */
function safeCloseCode(code: number | undefined): number {
  if (code === 1000) return 1000;
  if (code && code >= 3000 && code <= 4999) return code;
  return 1011;
}

/**
 * Secondary check only. Origin is trivially forged by any non-browser client,
 * so it narrows browser-based abuse but proves nothing on its own — the relay
 * ticket is what actually authenticates a caller.
 *
 * Fails closed when unconfigured: a missing ALLOWED_ORIGINS should make the
 * relay unusable, not world-readable.
 */
function originAllowed(req: Request, env: Env): boolean {
  const list = (env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (list.length === 0) return false;

  const origin = req.headers.get('Origin');
  if (!origin) return false;
  return list.includes(origin);
}

/** Reads the ticket out of the Sec-WebSocket-Protocol header. */
function ticketFrom(req: Request): string | null {
  const offered = req.headers.get('Sec-WebSocket-Protocol');
  if (!offered) return null;
  for (const raw of offered.split(',')) {
    const proto = raw.trim();
    if (proto.startsWith(TICKET_PROTOCOL_PREFIX)) {
      return proto.slice(TICKET_PROTOCOL_PREFIX.length);
    }
  }
  return null;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);

    if (url.pathname === '/health') {
      return json({
        relay: true,
        keyConfigured: Boolean(env.SARVAM_API_KEY),
        authConfigured: Boolean(env.AUTH_SESSION_SECRET),
      });
    }

    if (url.pathname !== '/ws') return json({ error: 'Not found' }, 404);

    if (req.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return json({ error: 'Expected a WebSocket upgrade' }, 426);
    }

    if (!originAllowed(req, env)) {
      return json({ error: 'Origin not allowed' }, 403);
    }

    // The real gate. Without this the relay was open to anyone who learned its
    // URL, since Origin can be set freely by curl or wscat.
    const ticket = await verifyTicket(ticketFrom(req), env.AUTH_SESSION_SECRET);
    if (!ticket) {
      return json({ error: 'Missing or invalid relay ticket' }, 401);
    }

    if (!env.SARVAM_API_KEY) {
      return json(
        { error: 'Relay has no SARVAM_API_KEY. Run: wrangler secret put SARVAM_API_KEY' },
        503,
      );
    }

    const params = new URLSearchParams();
    for (const [k, v] of url.searchParams) {
      if (FORWARDED.has(k)) params.set(k, v);
    }
    if (!params.has('language_code')) params.set('language_code', 'auto');

    // Workers can set real headers on an outbound upgrade, so the browser-only
    // subprotocol auth trick isn't needed here.
    let upstreamRes: Response;
    try {
      upstreamRes = await fetch(`${UPSTREAM}?${params.toString()}`, {
        headers: {
          Upgrade: 'websocket',
          'API-SUBSCRIPTION-KEY': env.SARVAM_API_KEY,
        },
      });
    } catch (e) {
      return json(
        { error: 'Could not reach Sarvam AI', detail: String(e).slice(0, 300) },
        502,
      );
    }

    const upstream = upstreamRes.webSocket;
    if (!upstream) {
      const detail = await upstreamRes.text().catch(() => '');
      return json(
        {
          error: `Sarvam refused the upgrade (${upstreamRes.status})`,
          detail: detail.slice(0, 200),
        },
        502,
      );
    }

    // Build and accept our own end first. If WebSocketPair throws (for example
    // at a concurrency ceiling), accepting upstream beforehand would strand an
    // open socket to Sarvam with no reference left to close it.
    let client: WebSocket;
    let server: WebSocket;
    try {
      const pair = new WebSocketPair();
      client = pair[0];
      server = pair[1];
      server.accept();
      upstream.accept();
    } catch (e) {
      try { upstream.close(1011, 'relay setup failed'); } catch {}
      return json({ error: 'Could not set up the relay', detail: String(e).slice(0, 200) }, 500);
    }

    let closed = false;
    const shutdown = (code?: number, reason?: string) => {
      if (closed) return;
      closed = true;
      const c = safeCloseCode(code);
      try { server.close(c, reason?.slice(0, 120)); } catch {}
      try { upstream.close(c, reason?.slice(0, 120)); } catch {}
    };

    // Browser → Sarvam
    server.addEventListener('message', (event) => {
      try { upstream.send(event.data); } catch { shutdown(1011, 'upstream send failed'); }
    });

    // Sarvam → browser
    upstream.addEventListener('message', (event) => {
      try { server.send(event.data); } catch { shutdown(1011, 'client send failed'); }
    });

    server.addEventListener('close',   (e) => shutdown(e.code, e.reason));
    upstream.addEventListener('close', (e) => shutdown(e.code, e.reason));
    server.addEventListener('error',   () => shutdown(1011, 'client error'));
    upstream.addEventListener('error', () => shutdown(1011, 'upstream error'));

    // A browser that offered a subprotocol fails the handshake unless the
    // server echoes one back.
    return new Response(null, {
      status: 101,
      webSocket: client,
      headers: { 'Sec-WebSocket-Protocol': `${TICKET_PROTOCOL_PREFIX}${ticketFrom(req)}` },
    });
  },
};
