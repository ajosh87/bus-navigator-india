import type { IncomingMessage, ServerResponse } from 'node:http';
import GtfsRealtimeBindings from 'gtfs-realtime-bindings';

import { parseCookie, verifySession, COOKIE_NAME } from '../_lib/auth';

/**
 * Live bus positions, decoded server-side.
 *
 * GTFS-Realtime is protobuf, so decoding here keeps a ~1MB parser out of the
 * client bundle and keeps the feed key server-side.
 *
 * Node runtime rather than Edge: the protobuf decoder needs Buffer and is
 * heavier than the Edge CPU budget comfortably allows.
 *
 * Only Delhi is wired up, because it is the only Indian city in this app's
 * scope that publishes a public real-time vehicle feed. Requests for anywhere
 * else return 501 with `configured: false` so the UI can say so plainly rather
 * than showing an empty map that looks like "no buses running".
 */

const serverEnv = process.env as Record<string, string | undefined>;

/** Overridable so a feed URL change does not require a code change. */
const DEFAULT_OTD_FEED =
  'https://otd.delhi.gov.in/api/realtime/VehiclePositions.pb';

interface FeedConfig {
  url: string;
  key: string | undefined;
  source: string;
}

function feedFor(city: string): FeedConfig | null {
  if (city !== 'delhi') return null;
  return {
    url: serverEnv.OTD_FEED_URL?.trim() || DEFAULT_OTD_FEED,
    key: serverEnv.OTD_API_KEY?.trim(),
    source: 'Delhi Open Transit Data (GTFS-Realtime)',
  };
}

function send(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  // Positions go stale in seconds; never let a CDN hold them.
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(body));
}

function header(req: IncomingMessage, name: string): string {
  const v = req.headers[name];
  return Array.isArray(v) ? (v[0] ?? '') : (v ?? '');
}

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (req.method !== 'GET') return send(res, 405, { error: 'Method not allowed' });

  const session = await verifySession(parseCookie(header(req, 'cookie'), COOKIE_NAME));
  if (!session) return send(res, 401, { error: 'Not signed in' });

  const city = new URL(req.url ?? '/', 'http://localhost').searchParams.get('city') ?? '';
  const feed = feedFor(city);

  if (!feed) {
    return send(res, 501, {
      error:
        `No public real-time vehicle feed exists for "${city}". ` +
        'Only Delhi publishes one; elsewhere the map shows routes and stops only.',
      configured: false,
    });
  }

  if (!feed.key) {
    return send(res, 503, {
      error:
        'Live buses need an Open Transit Data key. Register free at ' +
        'otd.delhi.gov.in and set OTD_API_KEY.',
      configured: false,
    });
  }

  const url = `${feed.url}?key=${encodeURIComponent(feed.key)}`;

  let upstream: Response;
  try {
    upstream = await fetch(url, { headers: { accept: 'application/x-protobuf' } });
  } catch {
    return send(res, 502, { error: 'Could not reach the transit feed', configured: true });
  }

  if (!upstream.ok) {
    return send(res, 502, {
      error: `Transit feed returned ${upstream.status}`,
      configured: true,
    });
  }

  let vehicles: unknown[];
  try {
    const buf = new Uint8Array(await upstream.arrayBuffer());
    const message =
      GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(buf);

    vehicles = message.entity
      .filter((e) => e.vehicle?.position)
      .map((e) => {
        const v = e.vehicle!;
        const p = v.position!;
        return {
          id: v.vehicle?.id ?? e.id,
          lat: p.latitude,
          lon: p.longitude,
          bearing: typeof p.bearing === 'number' ? p.bearing : undefined,
          routeId: v.trip?.routeId ?? undefined,
          updatedAt: v.timestamp ? Number(v.timestamp) * 1000 : undefined,
        };
      })
      // A feed can carry thousands; trim to what a map can usefully draw.
      .slice(0, 800);
  } catch {
    return send(res, 502, {
      error: 'Transit feed was not valid GTFS-Realtime',
      configured: true,
    });
  }

  send(res, 200, { vehicles, source: feed.source, fetchedAt: Date.now() });
}
