import AsyncStorage from '@react-native-async-storage/async-storage';

import { MONUMENTS, Monument, Party, quote } from './monuments';

/**
 * Booking is behind a provider interface so the concierge UI never knows who
 * actually issues the ticket.
 *
 * The bundled provider issues a *local reservation record* — a plan for a visit
 * plus a payment reference. It is deliberately NOT presented as a government
 * ticket, because it isn't one: no authorised ticketing API is wired up. Swap in
 * a provider from an authorised reseller and `official` becomes true, at which
 * point the QR is the real gate credential.
 */

const STORE_KEY = '@tickets';

export type TicketStatus =
  | 'reserved'          // held, nothing paid
  | 'awaiting_payment'  // UPI QR shown, settlement not verified
  | 'paid'              // payment attested (see `paymentVerified`)
  | 'cancelled';

export interface Ticket {
  id: string;
  monumentId: string;
  monumentName: string;
  city: string;
  /** ISO date of the visit, YYYY-MM-DD. */
  date: string;
  party: Party;
  visitorName: string;
  amount: number;
  status: TicketStatus;
  /** Who issued this record. */
  issuer: string;
  /** True only when an authorised ticketing API issued it. */
  official: boolean;
  /** UPI transaction reference, also embedded in the payment QR. */
  paymentRef: string;
  /**
   * False whenever payment was merely asserted by the user. Verifying
   * settlement needs a gateway webhook; without one this app cannot know.
   */
  paymentVerified: boolean;
  /** What the gate QR encodes. */
  qrPayload: string;
  createdAt: number;
}

export interface BookingRequest {
  monument: Monument;
  date: string;
  party: Party;
  visitorName: string;
}

export interface BookingProvider {
  id: string;
  label: string;
  /** True when this provider books against a real ticketing authority. */
  official: boolean;
  reserve(req: BookingRequest): Promise<Ticket>;
}

const REF_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';   // Crockford-ish, no I/L/O/U

/**
 * Ticket ids are shown at a gate and payment refs ride in the UPI `tr` field,
 * so they must not be guessable. Math.random is seeded per context and gives
 * roughly 30 bits — enough to enumerate or collide.
 */
function randomRef(prefix: string): string {
  const bytes = new Uint8Array(10);

  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
    // Only reached on a runtime with no WebCrypto at all; still better than a
    // single Math.random draw, and loudly non-silent in review.
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }

  let out = '';
  for (const b of bytes) out += REF_ALPHABET[b % REF_ALPHABET.length];
  return `${prefix}${out}`;
}

/** Bundled provider — local records only, no authority behind them. */
export const localProvider: BookingProvider = {
  id: 'local',
  label: 'On-device reservation',
  official: false,

  async reserve(req: BookingRequest): Promise<Ticket> {
    const { total } = quote(req.monument, req.party);
    const id = randomRef('BN');
    const paymentRef = randomRef('UPI');

    const ticket: Ticket = {
      id,
      monumentId: req.monument.id,
      monumentName: req.monument.name,
      city: req.monument.city,
      date: req.date,
      party: req.party,
      visitorName: req.visitorName,
      amount: total,
      status: total === 0 ? 'paid' : 'reserved',
      issuer: 'Bus Navigator (unofficial reservation)',
      official: false,
      paymentRef,
      paymentVerified: false,
      qrPayload: JSON.stringify({
        v: 1,
        ref: id,
        site: req.monument.id,
        date: req.date,
        pax: req.party.adults + req.party.children,
        amt: total,
        unofficial: true,
      }),
      createdAt: Date.now(),
    };

    return ticket;
  },
};

// ─── UPI ─────────────────────────────────────────────────────────────────────

export interface UpiPayee {
  vpa: string;
  name: string;
}

/**
 * Builds a UPI intent URI. Encoding this as a QR lets the visitor pay from
 * their own bank app, authenticating with their own PIN — no card number, CVV
 * or PIN is ever seen by this app.
 */
export function upiIntent(
  payee: UpiPayee, amount: number, note: string, ref: string,
): string {
  const params = new URLSearchParams({
    pa: payee.vpa,
    pn: payee.name,
    am: amount.toFixed(2),
    cu: 'INR',
    tn: note.slice(0, 50),
    tr: ref,
  });
  return `upi://pay?${params.toString()}`;
}

// ─── on-device storage ───────────────────────────────────────────────────────
// Per the chosen data policy: tickets and visitor names live only here, and are
// never sent through the proxy or logged anywhere.

export async function loadTickets(): Promise<Ticket[]> {
  try {
    const raw = await AsyncStorage.getItem(STORE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Ticket[]) : [];
  } catch {
    return [];
  }
}

export async function saveTicket(ticket: Ticket): Promise<Ticket[]> {
  const all = await loadTickets();
  const next = [ticket, ...all.filter((t) => t.id !== ticket.id)];
  await AsyncStorage.setItem(STORE_KEY, JSON.stringify(next));
  return next;
}

export async function updateTicket(
  id: string, patch: Partial<Ticket>,
): Promise<Ticket[]> {
  const all = await loadTickets();
  const next = all.map((t) => (t.id === id ? { ...t, ...patch } : t));
  await AsyncStorage.setItem(STORE_KEY, JSON.stringify(next));
  return next;
}

export async function removeTicket(id: string): Promise<Ticket[]> {
  const all = await loadTickets();
  const next = all.filter((t) => t.id !== id);
  await AsyncStorage.setItem(STORE_KEY, JSON.stringify(next));
  return next;
}

export function monumentFor(id: string): Monument | undefined {
  return MONUMENTS.find((m) => m.id === id);
}
