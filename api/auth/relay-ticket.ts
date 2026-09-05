import {
  requireSession, createRelayTicket, csrfOk, json,
  RELAY_TICKET_TTL_SECONDS, CSRF_HEADER,
} from '../_lib/auth';

/**
 * Mints a short-lived, relay-scoped bearer token for a signed-in user.
 *
 * The streaming relay is a Cloudflare Worker on a different origin, so it can
 * see neither our HttpOnly session cookie (SameSite=Strict) nor our environment.
 * It shares only AUTH_SESSION_SECRET, which is enough to verify this ticket's
 * HMAC — so the relay can authenticate callers without a database and without
 * ever holding a long-lived credential.
 */

export const config = { runtime: 'edge' };

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (!csrfOk(req)) return json({ error: `Missing ${CSRF_HEADER} header` }, 403);

  const session = await requireSession(req);
  if (!session) return json({ error: 'Not signed in' }, 401);

  const ticket = await createRelayTicket(session.sub);
  if (!ticket) return json({ error: 'Session signing is not configured' }, 503);

  return json({ ticket, expiresIn: RELAY_TICKET_TTL_SECONDS });
}
