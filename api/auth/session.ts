import { authConfigured, requireSession, json } from '../_lib/auth';

/**
 * Tells the client whether the session cookie is currently valid.
 *
 * The cookie is HttpOnly, so the client cannot inspect it directly — this is
 * the only way for the UI to learn its own auth state.
 */

export const config = { runtime: 'edge' };

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'GET') return json({ error: 'Method not allowed' }, 405);

  const session = await requireSession(req);

  return json({
    authenticated: Boolean(session),
    user: session?.sub ?? null,
    /** False means nobody can log in until the env vars are set. */
    configured: authConfigured(),
    expiresAt: session ? session.exp * 1000 : null,
  });
}
