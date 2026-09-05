/**
 * Verifies the relay tickets minted by /api/auth/relay-ticket.
 *
 * Deliberately a standalone copy rather than an import: the Worker is a
 * separate deployment with its own bundle and cannot reach api/_lib. It shares
 * only AUTH_SESSION_SECRET, which is enough to check the HMAC — the Worker
 * never holds a password hash or a long-lived credential.
 *
 * The token format must stay in step with api/_lib/auth.ts:
 *   v1.<base64url(payload)>.<base64url(hmac-sha256)>
 */

const TOKEN_VERSION = 'v1';
const EXPECTED_AUDIENCE = 'relay';

export interface TicketPayload {
  sub: string;
  iat: number;
  exp: number;
  aud?: string;
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

export async function verifyTicket(
  token: string | null | undefined,
  secret: string | undefined,
): Promise<TicketPayload | null> {
  // Fail closed: no secret configured means no caller can be authenticated.
  if (!token || !secret || secret.length < 32) return null;

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

  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  );

  // subtle.verify compares in constant time — never do this with ===.
  const ok = await crypto.subtle.verify(
    'HMAC',
    key,
    signature as unknown as ArrayBuffer,
    encoder.encode(`${version}.${payloadPart}`),
  ).catch(() => false);
  if (!ok) return null;

  let payload: TicketPayload;
  try {
    payload = JSON.parse(new TextDecoder().decode(b64UrlToBytes(payloadPart)));
  } catch {
    return null;
  }

  if (typeof payload?.sub !== 'string' || typeof payload?.exp !== 'number') return null;
  // A session cookie is signed with the same key, so the audience check is what
  // stops one being replayed here.
  if (payload.aud !== EXPECTED_AUDIENCE) return null;
  if (Math.floor(Date.now() / 1000) >= payload.exp) return null;

  return payload;
}
