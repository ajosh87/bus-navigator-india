import { appFetch } from './http';
import type { LatLon } from './MapView';

/**
 * Transit geography and the live-vehicle client.
 *
 * Two things are worth being explicit about, because conflating them would
 * mislead someone standing at a bus stop:
 *
 *  - **Bus positions can be live.** Delhi's Open Transit Data portal publishes
 *    a GTFS-Realtime vehicle feed. Our server decodes it (see
 *    api/transit/vehicles.ts) so the key stays off the client.
 *  - **Metro positions are never live.** No Indian metro publishes real-time
 *    train locations. What follows is station geography and headways only, and
 *    the UI must present it as scheduled rather than tracked.
 *
 * Coordinates are approximate, hand-placed for map display. They are good
 * enough to orient someone, not to navigate by.
 */

export interface Stop extends LatLon {
  name: string;
}

export interface City {
  id: string;
  name: string;
  center: LatLon;
  /** True only where a public real-time vehicle feed actually exists. */
  liveBuses: boolean;
}

export const CITIES: City[] = [
  { id: 'delhi',     name: 'Delhi',     center: { lat: 28.6330, lon: 77.2190 }, liveBuses: true  },
  { id: 'bengaluru', name: 'Bengaluru', center: { lat: 12.9756, lon: 77.5729 }, liveBuses: false },
];

// ─── bus route geometry (Bengaluru demo routes) ──────────────────────────────

export const ROUTE_STOPS: Record<string, Stop[]> = {
  '500D': [
    { name: 'Majestic',                 lat: 12.9776, lon: 77.5713 },
    { name: 'Town Hall',                lat: 12.9648, lon: 77.5760 },
    { name: 'KR Market',                lat: 12.9611, lon: 77.5760 },
    { name: 'Lalbagh',                  lat: 12.9507, lon: 77.5848 },
    { name: 'Jayanagar 4th Block',      lat: 12.9250, lon: 77.5938 },
    { name: 'JP Nagar',                 lat: 12.9063, lon: 77.5857 },
    { name: 'Bannerghatta Road',        lat: 12.8916, lon: 77.5975 },
    { name: 'Silk Board',               lat: 12.9172, lon: 77.6229 },
    { name: 'HSR Layout',               lat: 12.9116, lon: 77.6389 },
    { name: 'Electronic City Phase 1',  lat: 12.8452, lon: 77.6602 },
  ],
  '335E': [
    { name: 'Shivajinagar',        lat: 12.9857, lon: 77.6057 },
    { name: 'Trinity Circle',      lat: 12.9730, lon: 77.6200 },
    { name: 'Domlur',              lat: 12.9616, lon: 77.6387 },
    { name: 'Indiranagar',         lat: 12.9784, lon: 77.6408 },
    { name: 'Sony World Junction', lat: 12.9698, lon: 77.6410 },
    { name: 'Marathahalli Bridge', lat: 12.9560, lon: 77.6980 },
    { name: 'Marathahalli',        lat: 12.9591, lon: 77.6974 },
  ],
  'KIA-9': [
    { name: 'Majestic',      lat: 12.9776, lon: 77.5713 },
    { name: 'Yeshwantpur',   lat: 13.0284, lon: 77.5540 },
    { name: 'Hebbal',        lat: 13.0358, lon: 77.5970 },
    { name: 'Bellary Road',  lat: 13.0800, lon: 77.5900 },
    { name: 'Devanahalli',   lat: 13.2470, lon: 77.7120 },
    { name: 'KIAL',          lat: 13.1986, lon: 77.7066 },
  ],
  '201R': [
    { name: 'Majestic',       lat: 12.9776, lon: 77.5713 },
    { name: 'Vidhana Soudha', lat: 12.9794, lon: 77.5912 },
    { name: 'Rajajinagar',    lat: 12.9916, lon: 77.5551 },
    { name: 'Chord Road',     lat: 12.9800, lon: 77.5400 },
    { name: 'Nagarbhavi',     lat: 12.9600, lon: 77.5100 },
    { name: 'RR Nagar',       lat: 12.9260, lon: 77.5190 },
  ],
};

// ─── metro (scheduled only — never live) ─────────────────────────────────────

export interface MetroLine {
  id: string;
  name: string;
  cityId: string;
  colorHex: string;
  /** Typical peak headway, for display. */
  headway: string;
  stations: Stop[];
}

export const METRO_LINES: MetroLine[] = [
  {
    id: 'dmrc-yellow',
    name: 'Yellow Line',
    cityId: 'delhi',
    colorHex: '#F5C518',
    headway: 'every 2–5 min',
    stations: [
      { name: 'Samaypur Badli',     lat: 28.7450, lon: 77.1380 },
      { name: 'Rohini West',        lat: 28.7180, lon: 77.1100 },
      { name: 'Kashmere Gate',      lat: 28.6675, lon: 77.2280 },
      { name: 'Chandni Chowk',      lat: 28.6580, lon: 77.2300 },
      { name: 'New Delhi',          lat: 28.6420, lon: 77.2210 },
      { name: 'Rajiv Chowk',        lat: 28.6330, lon: 77.2190 },
      { name: 'Central Secretariat',lat: 28.6150, lon: 77.2120 },
      { name: 'Hauz Khas',          lat: 28.5440, lon: 77.2060 },
      { name: 'Saket',              lat: 28.5210, lon: 77.2010 },
      { name: 'HUDA City Centre',   lat: 28.4595, lon: 77.0725 },
    ],
  },
  {
    id: 'dmrc-blue',
    name: 'Blue Line',
    cityId: 'delhi',
    colorHex: '#3B82F6',
    headway: 'every 3–6 min',
    stations: [
      { name: 'Dwarka Sector 21',   lat: 28.5520, lon: 77.0580 },
      { name: 'Janakpuri West',     lat: 28.6290, lon: 77.0780 },
      { name: 'Rajouri Garden',     lat: 28.6490, lon: 77.1200 },
      { name: 'Rajiv Chowk',        lat: 28.6330, lon: 77.2190 },
      { name: 'Mandi House',        lat: 28.6255, lon: 77.2340 },
      { name: 'Yamuna Bank',        lat: 28.6230, lon: 77.2760 },
      { name: 'Noida City Centre',  lat: 28.5745, lon: 77.3560 },
    ],
  },
  {
    id: 'bmrcl-purple',
    name: 'Purple Line',
    cityId: 'bengaluru',
    colorHex: '#A855F7',
    headway: 'every 4–8 min',
    stations: [
      { name: 'Byappanahalli',  lat: 12.9906, lon: 77.6483 },
      { name: 'Indiranagar',    lat: 12.9784, lon: 77.6408 },
      { name: 'Trinity',        lat: 12.9730, lon: 77.6200 },
      { name: 'MG Road',        lat: 12.9756, lon: 77.6068 },
      { name: 'Cubbon Park',    lat: 12.9793, lon: 77.5960 },
      { name: 'Vidhana Soudha', lat: 12.9794, lon: 77.5912 },
      { name: 'Majestic',       lat: 12.9756, lon: 77.5729 },
      { name: 'Magadi Road',    lat: 12.9740, lon: 77.5540 },
      { name: 'Mysore Road',    lat: 12.9500, lon: 77.5250 },
    ],
  },
  {
    id: 'bmrcl-green',
    name: 'Green Line',
    cityId: 'bengaluru',
    colorHex: '#22C55E',
    headway: 'every 5–10 min',
    stations: [
      { name: 'Nagasandra',      lat: 13.0480, lon: 77.5000 },
      { name: 'Yeshwantpur',     lat: 13.0284, lon: 77.5540 },
      { name: 'Majestic',        lat: 12.9756, lon: 77.5729 },
      { name: 'National College', lat: 12.9450, lon: 77.5730 },
      { name: 'Jayanagar',       lat: 12.9250, lon: 77.5830 },
      { name: 'Silk Institute',  lat: 12.8600, lon: 77.5300 },
    ],
  },
];

// ─── live vehicles ───────────────────────────────────────────────────────────

export interface Vehicle {
  id: string;
  lat: number;
  lon: number;
  /** Degrees clockwise from north, when the feed supplies it. */
  bearing?: number;
  routeId?: string;
  /** Feed timestamp in ms, for staleness display. */
  updatedAt?: number;
}

export interface VehicleFeed {
  vehicles: Vehicle[];
  /** Where the data came from, for honest labelling in the UI. */
  source: string;
  /** Server time the feed was fetched, ms. */
  fetchedAt: number;
}

export class FeedUnavailable extends Error {
  constructor(message: string, readonly configured: boolean) {
    super(message);
    this.name = 'FeedUnavailable';
  }
}

/**
 * Live bus positions for a city, via our own decoding endpoint.
 *
 * Throws FeedUnavailable rather than returning an empty list, so the UI can
 * distinguish "no buses right now" from "this city has no feed at all".
 */
export async function fetchVehicles(cityId: string): Promise<VehicleFeed> {
  const res = await appFetch(`/api/transit/vehicles?city=${encodeURIComponent(cityId)}`);
  const body = await res.text();

  let json: any = null;
  try { json = JSON.parse(body); } catch { /* handled below */ }

  if (!res.ok) {
    throw new FeedUnavailable(
      json?.error ?? `Live feed unavailable (${res.status})`,
      Boolean(json?.configured),
    );
  }
  if (!json || !Array.isArray(json.vehicles)) {
    throw new FeedUnavailable('Live feed returned an unreadable response', true);
  }

  return {
    vehicles: json.vehicles as Vehicle[],
    source: String(json.source ?? 'unknown'),
    fetchedAt: Number(json.fetchedAt) || Date.now(),
  };
}

export function cityById(id: string): City {
  return CITIES.find((c) => c.id === id) ?? CITIES[0];
}

export function metroLinesFor(cityId: string): MetroLine[] {
  return METRO_LINES.filter((l) => l.cityId === cityId);
}
