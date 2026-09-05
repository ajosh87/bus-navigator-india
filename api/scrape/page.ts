import type { IncomingMessage, ServerResponse } from 'node:http';

import { parseCookie, verifySession, COOKIE_NAME, CSRF_HEADER } from '../_lib/auth';
import { checkDestination } from '../../src/ticketing/destination';

/**
 * Server-side page scraping via Anakin.
 *
 * The Anakin key stays here for the same reason the Sarvam key does — a static
 * client cannot hold a credential. Beyond that, this endpoint is deliberately
 * narrow: it will only fetch hosts that pass the same trust check the QR
 * scanner uses. Without that restriction an authenticated user could turn it
 * into an open scraping proxy on this deployment's credits, or point it at
 * internal addresses (SSRF). `checkDestination` already rejects raw IPs,
 * non-https schemes and unrecognised hosts, which covers both.
 *
 * Node runtime, not Edge: Anakin's inline endpoint holds the connection while
 * it works, which is far longer than the Edge CPU budget allows.
 */

// Vercel caps Hobby functions at 60s; Anakin may hold for ~90s, so we abort
// first and report a partial result rather than being killed mid-flight.
export const config = { maxDuration: 60 };

const ANAKIN_SCRAPE = 'https://api.anakin.io/v1/url-scraper/scrape';
const ABORT_AFTER_MS = 45_000;

const serverEnv = process.env as Record<string, string | undefined>;

function send(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(body));
}

function header(req: IncomingMessage, name: string): string {
  const v = req.headers[name];
  return Array.isArray(v) ? (v[0] ?? '') : (v ?? '');
}

async function readBody(req: IncomingMessage & { body?: unknown }): Promise<any> {
  // Buffer must be tested before the object branch — typeof Buffer is 'object'.
  if (Buffer.isBuffer(req.body)) {
    const raw = req.body.toString('utf8');
    return raw ? JSON.parse(raw) : {};
  }
  if (typeof req.body === 'string') return req.body ? JSON.parse(req.body) : {};
  if (req.body && typeof req.body === 'object') return req.body;

  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

export default async function handler(
  req: IncomingMessage & { body?: unknown },
  res: ServerResponse,
): Promise<void> {
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });
  if (header(req, CSRF_HEADER) !== '1') {
    return send(res, 403, { error: `Missing ${CSRF_HEADER} header` });
  }

  const session = await verifySession(parseCookie(header(req, 'cookie'), COOKIE_NAME));
  if (!session) return send(res, 401, { error: 'Not signed in' });

  let url = '';
  let extract = false;
  let useBrowser = false;
  try {
    const body = await readBody(req);
    url = typeof body?.url === 'string' ? body.url.trim() : '';
    extract = body?.extract === true;
    useBrowser = body?.useBrowser === true;
  } catch {
    return send(res, 400, { error: 'Invalid request body' });
  }

  if (!url) return send(res, 400, { error: 'No url supplied' });

  // The same gate the scanner shows the user, enforced again on the server —
  // the client-side verdict is advisory, this one is authoritative.
  const verdict = checkDestination(url);
  if (verdict.verdict !== 'official') {
    return send(res, 403, {
      error:
        `Refusing to read ${verdict.host || 'that address'}: it is not a recognised ` +
        'official site.',
      verdict: verdict.verdict,
      host: verdict.host,
    });
  }

  // Checked after the destination, deliberately. A hostile URL should be
  // rejected on its own merits rather than masked behind a config error, so the
  // guard's behaviour does not silently change the day a key is added.
  const key = serverEnv.ANAKIN_API_KEY?.trim();
  if (!key) {
    return send(res, 503, {
      error:
        'Page reading needs an Anakin key. Get one free at anakin.io and set ANAKIN_API_KEY.',
      configured: false,
    });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ABORT_AFTER_MS);

  let upstream: Response;
  try {
    upstream = await fetch(ANAKIN_SCRAPE, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'X-API-Key': key },
      body: JSON.stringify({
        url: verdict.url,
        country: 'in',            // route through India, as the sites are Indian
        useBrowser,
        generateJson: extract,
      }),
      signal: controller.signal,
    });
  } catch (e: any) {
    return send(res, e?.name === 'AbortError' ? 504 : 502, {
      error: e?.name === 'AbortError'
        ? 'The page took too long to read.'
        : 'Could not reach the page reader.',
    });
  } finally {
    clearTimeout(timer);
  }

  // 202 means Anakin gave up holding the connection and handed back a job id.
  if (upstream.status === 202) {
    const queued = await upstream.json().catch(() => null);
    return send(res, 504, {
      error: 'The page is still being read. Try again in a moment.',
      jobId: queued?.id ?? null,
    });
  }

  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => '');
    return send(res, 502, {
      error: `Page reader returned ${upstream.status}`,
      detail: detail.slice(0, 200),
    });
  }

  const job = await upstream.json().catch(() => null);
  if (!job) return send(res, 502, { error: 'Page reader sent an unreadable response' });

  // A failed scrape still comes back as HTTP 200 with status:"failed", so the
  // status field is the real success check — not res.ok.
  if (job.status !== 'completed') {
    return send(res, 502, {
      error: job.error || `Page could not be read (${job.status ?? 'unknown status'})`,
      status: job.status ?? null,
    });
  }

  send(res, 200, {
    url: job.url ?? verdict.url,
    host: verdict.host,
    markdown: typeof job.markdown === 'string' ? job.markdown : '',
    json: job.generatedJson ?? null,
    cached: job.cached === true,
    durationMs: typeof job.durationMs === 'number' ? job.durationMs : null,
  });
}
