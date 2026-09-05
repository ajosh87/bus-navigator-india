import { authConfigured, requireSession, json } from './_lib/auth';

/**
 * Deployment capabilities.
 *
 * Split by audience: the login screen needs to know whether credentials are
 * configured before anyone can sign in, but the relay URL and the UPI payee are
 * operational details that only help an attacker. Those are withheld until
 * there is a valid session.
 */

export const config = { runtime: 'edge' };

// Expo types the global `env` to its own client-side shape, which omits
// server-only variables.
const serverEnv = process.env as Record<string, string | undefined>;

export default async function handler(req: Request): Promise<Response> {
  const publicFields = {
    proxy: true,
    /** Whether anyone can sign in at all. Safe to expose: the login screen
     *  needs it to explain an unconfigured deployment. */
    authConfigured: authConfigured(),
  };

  const session = await requireSession(req);
  if (!session) return json(publicFields);

  return json({
    ...publicFields,
    keyConfigured: Boolean(serverEnv.SARVAM_API_KEY),
    // e.g. wss://bus-navigator-relay.<subdomain>.workers.dev/ws
    relayUrl: serverEnv.STREAM_RELAY_URL?.trim() || null,
    upi: serverEnv.UPI_PAYEE_VPA?.trim()
      ? {
          vpa: serverEnv.UPI_PAYEE_VPA.trim(),
          name: serverEnv.UPI_PAYEE_NAME?.trim() || 'Ticket Concierge',
        }
      : null,
  });
}
