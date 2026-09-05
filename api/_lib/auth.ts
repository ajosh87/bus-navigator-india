/**
 * Session signing and verification, shared by the auth endpoints and the proxy.
 *
 * Files under api/ whose name starts with `_` are not routed by Vercel, so this
 * is a library rather than an endpoint.
 *
 * Design notes, since these are the parts that usually go wrong:
 *
 * - WebCrypto only, so the identical code runs on both the Edge runtime (the
 *   proxy) and the Node runtime (login, which additionally needs scrypt).
 * - The token has NO algorithm field. JWT's `alg` header is the root of the
 *   algorithm-confusion family of bugs; here the algorithm is fixed by the
 *   verifier and cannot be influenced by the token.
 * - Verification goes through `crypto.subtle.verify`, which compares in
 *   constant time. Never compare signatures with `===`.
 * - Fails closed: a missing or short secret makes every verification fail
 *   rather than silently leaving the app open.
 */

const TOKEN_VERSION = 'v1';
export const COOKIE_NAME = 'bn_session';
export const SESSION_TTL_SECONDS = 12 * 60 * 60;

/**
 * A custom header the browser will not attach to a cross-site form POST, and
 * which a cross-origin fetch cannot set without a CORS grant we never give.
 * Defence in depth behind SameSite=Strict.
 */
export const CSRF_HEADER = 'x-app-request';

const serverEnv = process.env as Record<string, string | undefined>;

/**
 * What a token is allowed to do. Included in the signed payload and checked on
 * verify, so a long-lived session cookie cannot be replayed as a relay ticket
 * or vice versa.
 */
export type Audience = 'session' | 'relay';

/** Relay tickets are handed to a third-party Worker, so they expire fast. */
export const RELAY_TICKET_TTL_SECONDS = 60;

export interface SessionPayload {
  /** Subject — the account identifier. */
  sub: string;
  /** Issued at, seconds since epoch. */
  iat: number;
  /** Expiry, seconds since epoch. */
  exp: number;
  /** Token audience; absent is treated as 'session'. */
  aud?: Audience;
}

// ─── base64url (no Buffer on Edge) ───────────────────────────────────────────

function bytesToB64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64UrlToBytes(s: string): Uint8Array {
  const padded = s.replace(/-/g, '+').replace(/_/g, '/')
    + '='.repeat((4 - (s.length % 4)) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const encoder = new TextEncoder();

// ─── signing ─────────────────────────────────────────────────────────────────

/** A short secret is treated as no secret at all. */
function readSecret(): string | null {
  const secret = serverEnv.AUTH_SESSION_SECRET;
  if (!secret || secret.length < 32) return null;
  return secret;
}

export function authConfigured(): boolean {
  return Boolean(readSecret() && serverEnv.AUTH_PASSWORD_HASH);
}

async function hmacKey(secret: string, usage: 'sign' | 'verify'): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    [usage],
  );
}

async function mint(sub: string, aud: Audience, ttl: number): Promise<string | null> {
  const secret = readSecret();
  if (!secret) return null;

  const now = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = { sub, iat: now, exp: now + ttl, aud };

  const body = `${TOKEN_VERSION}.${bytesToB64Url(encoder.encode(JSON.stringify(payload)))}`;
  const key = await hmacKey(secret, 'sign');
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(body));

  return `${body}.${bytesToB64Url(new Uint8Array(sig))}`;
}

export function createSession(sub: string): Promise<string | null> {
  return mint(sub, 'session', SESSION_TTL_SECONDS);
}

/**
 * A short-lived bearer token the browser can hand to the streaming relay.
 *
 * The session itself lives in an HttpOnly cookie that JavaScript cannot read,
 * and SameSite=Strict means it is never sent to the Worker's origin anyway — so
 * the relay needs its own credential. Scoping it to 'relay' and 60 seconds
 * limits the blast radius if one leaks.
 */
export function createRelayTicket(sub: string): Promise<string | null> {
  return mint(sub, 'relay', RELAY_TICKET_TTL_SECONDS);
}

export async function verifySession(
  token: string | null,
  expectedAud: Audience = 'session',
): Promise<SessionPayload | null> {
  const secret = readSecret();
  if (!secret || !token) return null;

  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [version, payloadPart, sigPart] = parts;
  if (version !== TOKEN_VERSION) return null;

  let signature: Uint8Array;
  try {
    signature = b64UrlToBytes(sigPart);
  } catch {
    return null;
  }

  const body = `${version}.${payloadPart}`;
  const key = await hmacKey(secret, 'verify');

  // Constant-time by construction — do not hand-roll this comparison.
  const ok = await crypto.subtle.verify(
    'HMAC',
    key,
    signature as unknown as ArrayBuffer,
    encoder.encode(body),
  ).catch(() => false);
  if (!ok) return null;

  let payload: SessionPayload;
  try {
    payload = JSON.parse(new TextDecoder().decode(b64UrlToBytes(payloadPart)));
  } catch {
    return null;
  }

  if (typeof payload?.sub !== 'string' || typeof payload?.exp !== 'number') return null;
  // A validly signed token for the wrong purpose is still a rejection, so a
  // 12-hour session cookie cannot be replayed as a relay ticket.
  if ((payload.aud ?? 'session') !== expectedAud) return null;
  // Signature valid but expired is still a rejection.
  if (Math.floor(Date.now() / 1000) >= payload.exp) return null;

  return payload;
}

// ─── cookies ─────────────────────────────────────────────────────────────────

/**
 * The two Vercel runtimes hand handlers different request objects — Edge gets a
 * Web `Request`, Node gets an `IncomingMessage` whose `headers` is a plain
 * object. Everything below therefore works on primitives, with thin `Request`
 * wrappers for the Edge endpoints.
 */

export function parseCookie(header: string | null | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return null;
}

/** `vercel dev` serves plain http, where a Secure cookie would be dropped. */
export function buildSessionCookie(token: string, secure: boolean): string {
  const attrs = [
    `${COOKIE_NAME}=${token}`,
    'Path=/',
    'HttpOnly',                       // unreadable from JS, so XSS cannot lift it
    'SameSite=Strict',                // not sent on any cross-site request
    `Max-Age=${SESSION_TTL_SECONDS}`,
  ];
  if (secure) attrs.push('Secure');
  return attrs.join('; ');
}

export function buildClearedCookie(secure: boolean): string {
  const attrs = [`${COOKIE_NAME}=`, 'Path=/', 'HttpOnly', 'SameSite=Strict', 'Max-Age=0'];
  if (secure) attrs.push('Secure');
  return attrs.join('; ');
}

// ─── Edge (Web Request) wrappers ─────────────────────────────────────────────

function isSecureRequest(req: Request): boolean {
  if (req.headers.get('x-forwarded-proto') === 'https') return true;
  try {
    return new URL(req.url).protocol === 'https:';
  } catch {
    return true;
  }
}

export function readCookie(req: Request, name: string): string | null {
  return parseCookie(req.headers.get('cookie'), name);
}

export function sessionCookie(req: Request, token: string): string {
  return buildSessionCookie(token, isSecureRequest(req));
}

export function clearedCookie(req: Request): string {
  return buildClearedCookie(isSecureRequest(req));
}

export async function requireSession(req: Request): Promise<SessionPayload | null> {
  return verifySession(readCookie(req, COOKIE_NAME));
}

export function csrfOk(req: Request): boolean {
  return req.headers.get(CSRF_HEADER) === '1';
}

/**
 * `extra` is deliberately a plain record rather than HeadersInit: this spreads
 * into an object literal, and spreading a `Headers` instance yields nothing
 * (its data lives behind accessors), which would silently drop a Set-Cookie.
 */
export function json(
  body: unknown,
  status = 200,
  extra?: Record<string, string>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
      ...(extra ?? {}),
    },
  });
}
