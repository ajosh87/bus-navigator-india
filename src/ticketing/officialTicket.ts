/**
 * Capturing the ticket the ticketing authority actually issued.
 *
 * The app cannot issue a real ticket, and pretending otherwise would put
 * someone in a queue holding something a gate scanner rejects. What it can do
 * is hold the real one: the issued ticket carries a QR (on a PDF, an email, or
 * a printout), and the gate reads that QR. So we capture the payload verbatim
 * and reproduce it on demand.
 *
 * Verbatim is the whole contract here — any normalisation, trimming or
 * re-encoding risks a code the scanner refuses. Parsing below is only ever used
 * for what we show the traveller, never for what we render into the QR.
 */

export type TicketPayloadKind =
  /** A verification or ticket URL. */
  | 'url'
  /** Structured data the issuer encoded, e.g. JSON. */
  | 'structured'
  /** A booking reference or opaque token. */
  | 'reference';

export interface OfficialTicket {
  /** Exactly what was scanned. Reproduced byte-for-byte at the gate. */
  payload: string;
  kind: TicketPayloadKind;
  /** Best-effort human-readable reference, for reading aloud. Never the QR source. */
  reference: string | null;
  /** Host, when the payload is a URL — lets the UI show who issued it. */
  issuerHost: string | null;
  capturedAt: number;
}

/** Booking references: letters and digits, long enough not to be a stray word. */
const REFERENCE = /\b[A-Z0-9][A-Z0-9-]{5,23}\b/;

/**
 * Inspects a scanned ticket QR for display purposes.
 *
 * Returns null for payloads too short to be a ticket, so an accidental scan of
 * some other code does not get filed as one.
 */
export function parseOfficialTicket(raw: string): OfficialTicket | null {
  const payload = raw ?? '';
  if (payload.trim().length < 6) return null;

  let kind: TicketPayloadKind = 'reference';
  let issuerHost: string | null = null;
  let reference: string | null = null;

  const trimmed = payload.trim();

  if (/^https?:\/\//i.test(trimmed)) {
    kind = 'url';
    try {
      const url = new URL(trimmed);
      issuerHost = url.hostname.toLowerCase();
      // Booking refs usually ride in the query or the last path segment.
      const fromQuery = [...url.searchParams.values()]
        .map((v) => v.match(REFERENCE)?.[0])
        .find(Boolean);
      const lastSegment = url.pathname.split('/').filter(Boolean).pop() ?? '';
      reference = fromQuery ?? lastSegment.match(REFERENCE)?.[0] ?? null;
    } catch {
      issuerHost = null;
    }
  } else if (/^[\s]*[[{]/.test(trimmed)) {
    kind = 'structured';
    try {
      const data = JSON.parse(trimmed);
      // Issuers name this field every possible way; take the first that looks right.
      for (const key of ['ticketId', 'ticket_no', 'bookingId', 'booking_id', 'ref', 'id', 'pnr']) {
        const v = (data as Record<string, unknown>)?.[key];
        if (typeof v === 'string' && v.trim()) { reference = v.trim(); break; }
        if (typeof v === 'number') { reference = String(v); break; }
      }
    } catch {
      // Looked like JSON but was not; still a valid opaque payload.
      kind = 'reference';
    }
  } else {
    reference = trimmed.toUpperCase().match(REFERENCE)?.[0] ?? null;
  }

  return {
    payload,                     // untouched
    kind,
    reference,
    issuerHost,
    capturedAt: Date.now(),
  };
}

/** Spoken confirmation after a capture, in plain language. */
export function describeCapture(t: OfficialTicket): string {
  if (t.reference) {
    // Spaced out so a speech engine reads it as characters, not a word.
    return `Ticket saved. Your reference is ${t.reference.split('').join(' ')}.`;
  }
  if (t.issuerHost) return `Ticket from ${t.issuerHost} saved.`;
  return 'Ticket saved. Show this code at the gate.';
}

/** Reads an amount aloud unambiguously before any payment is approved. */
export function describeAmount(rupees: number, what: string): string {
  return `You are about to pay ${rupees} rupees for ${what}. Say yes, or tap confirm, to continue.`;
}
