import { scryptSync, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

import {
  authConfigured, createSession, buildSessionCookie, CSRF_HEADER,
} from '../_lib/auth';

/**
 * Password login.
 *
 * Runs on the Node runtime rather than Edge because it needs scrypt: a
 * memory-hard KDF costs ~100ms of CPU, well beyond the Edge budget, and PBKDF2
 * at OWASP-recommended iteration counts has the same problem.
 *
 * Note the handler signature — Vercel's Node runtime passes Node's
 * IncomingMessage, not a Web Request, so `req.headers` is a plain object.
 *
 * Stored hash format: scrypt$N$r$p$<saltB64>$<hashB64>
 * Generate one with: node scripts/hash-password.js
 */

const serverEnv = process.env as Record<string, string | undefined>;

/** Attempts per window per IP. Best-effort only — see the note below. */
const MAX_ATTEMPTS = 8;
const WINDOW_MS = 10 * 60 * 1000;

/**
 * Serverless instances are ephemeral and per-region, so this slows a casual
 * attacker but is not a real lockout. Durable throttling needs a shared store
 * (Vercel KV / Upstash); scrypt's cost is the actual brute-force defence.
 */
const attempts = new Map<string, number[]>();

function tooManyAttempts(ip: string): boolean {
  const now = Date.now();
  const recent = (attempts.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  attempts.set(ip, recent);
  if (attempts.size > 2000) attempts.clear();
  return recent.length > MAX_ATTEMPTS;
}

interface ParsedHash { N: number; r: number; p: number; salt: Buffer; hash: Buffer }

function parseHash(stored: string | undefined): ParsedHash | null {
  if (!stored) return null;
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return null;

  const parsed: ParsedHash = {
    N: Number(parts[1]), r: Number(parts[2]), p: Number(parts[3]),
    salt: Buffer.from(parts[4], 'base64'),
    hash: Buffer.from(parts[5], 'base64'),
  };
  if (![parsed.N, parsed.r, parsed.p].every(Number.isFinite)) return null;
  if (parsed.salt.length === 0 || parsed.hash.length === 0) return null;
  return parsed;
}

function verifyPassword(password: string, stored: ParsedHash): boolean {
  const derived = scryptSync(password, stored.salt, stored.hash.length, {
    N: stored.N, r: stored.r, p: stored.p,
    maxmem: 256 * 1024 * 1024,   // scryptSync throws past the default ceiling
  });
  if (derived.length !== stored.hash.length) return false;
  return timingSafeEqual(derived, stored.hash);
}

function header(req: IncomingMessage, name: string): string {
  const v = req.headers[name];
  return Array.isArray(v) ? (v[0] ?? '') : (v ?? '');
}

function send(res: ServerResponse, status: number, body: unknown, cookie?: string): void {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  res.setHeader('cache-control', 'no-store');
  if (cookie) res.setHeader('set-cookie', cookie);
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage & { body?: unknown }): Promise<any> {
  // Vercel may hand us a parsed object, a string, a Buffer, or nothing at all.
  // Buffer must be tested before the object branch — `typeof buf === 'object'`
  // is true, so returning it unparsed leaves username/password undefined and
  // every login fails with a misleading "Invalid credentials".
  if (Buffer.isBuffer(req.body)) {
    const raw = req.body.toString('utf8');
    return raw ? JSON.parse(raw) : {};
  }
  if (typeof req.body === 'string') {
    return req.body ? JSON.parse(req.body) : {};
  }
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

  // SameSite=Strict already blocks cross-site cookie use; this rejects anything
  // that did not originate from our own fetch.
  if (header(req, CSRF_HEADER) !== '1') {
    return send(res, 403, { error: `Missing ${CSRF_HEADER} header` });
  }

  if (!authConfigured()) {
    return send(res, 503, {
      error:
        'Login is not configured. Set AUTH_SESSION_SECRET and AUTH_PASSWORD_HASH ' +
        'in the project environment (see scripts/hash-password.js).',
    });
  }

  const ip =
    header(req, 'x-real-ip') ||
    header(req, 'x-forwarded-for').split(',')[0].trim() ||
    'unknown';

  if (tooManyAttempts(ip)) {
    return send(res, 429, { error: 'Too many attempts. Try again in a few minutes.' });
  }

  let username = '';
  let password = '';
  try {
    const body = await readBody(req);
    username = typeof body?.username === 'string' ? body.username : '';
    password = typeof body?.password === 'string' ? body.password : '';
  } catch {
    return send(res, 400, { error: 'Invalid request body' });
  }

  const stored = parseHash(serverEnv.AUTH_PASSWORD_HASH);
  if (!stored) {
    return send(res, 503, { error: 'AUTH_PASSWORD_HASH is malformed on the server.' });
  }

  const expectedUser = serverEnv.AUTH_USERNAME ?? 'admin';

  // Always run the KDF, even when the username is already wrong, so response
  // time never reveals which half of the credentials failed.
  let passwordOk = false;
  try {
    passwordOk = password ? verifyPassword(password, stored) : false;
  } catch {
    return send(res, 500, { error: 'Could not verify credentials' });
  }

  const userBuf = Buffer.from(username);
  const expectedBuf = Buffer.from(expectedUser);
  const userOk =
    userBuf.length === expectedBuf.length && timingSafeEqual(userBuf, expectedBuf);

  // One generic message for every failure — never say which part was wrong.
  if (!passwordOk || !userOk) {
    return send(res, 401, { error: 'Invalid credentials' });
  }

  const token = await createSession(expectedUser);
  if (!token) return send(res, 500, { error: 'Could not start a session' });

  attempts.delete(ip);

  const secure =
    header(req, 'x-forwarded-proto') === 'https' ||
    !/^(localhost|127\.0\.0\.1)/.test(header(req, 'host'));

  send(
    res, 200,
    { authenticated: true, user: expectedUser },
    buildSessionCookie(token, secure),
  );
}
