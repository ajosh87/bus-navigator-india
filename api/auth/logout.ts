import { clearedCookie, csrfOk, json, CSRF_HEADER } from '../_lib/auth';

/**
 * Clears the session cookie.
 *
 * POST rather than GET so a stray link or prefetch cannot log someone out, and
 * it carries the same CSRF header requirement as login.
 */

export const config = { runtime: 'edge' };

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (!csrfOk(req)) return json({ error: `Missing ${CSRF_HEADER} header` }, 403);

  return json(
    { authenticated: false },
    200,
    { 'set-cookie': clearedCookie(req) },
  );
}
