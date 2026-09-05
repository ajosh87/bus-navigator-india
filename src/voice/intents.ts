import { DEMO_ROUTES } from '../languages';
import { MONUMENTS } from '../monuments';
import { bestMonument } from '../monumentSearch';

/**
 * Intent matching for spoken commands.
 *
 * Rules are written against English only. Callers translate the transcript to
 * English first (Mayura already does this for every supported language), so one
 * rule set covers all 22 languages instead of 22 keyword tables that would drift
 * apart. The cost is one extra round trip on non-English input.
 *
 * Pure functions with no React or RN imports, so the matching is testable on
 * its own.
 */

export type TabName = 'Tickets' | 'Scan' | 'Live' | 'Speak' | 'Routes' | 'Settings';

export type VoiceIntent =
  | { kind: 'navigate'; tab: TabName; speak: string }
  | { kind: 'route';    routeNo: string; speak: string }
  | { kind: 'map';      speak: string }
  | { kind: 'book';     monumentId?: string; monumentName?: string; speak: string }
  | { kind: 'tickets';  speak: string }
  | { kind: 'live';     speak: string }
  | { kind: 'scan';     speak: string }
  | { kind: 'translate'; phrase: string; speak: string }
  | { kind: 'help';     speak: string }
  | { kind: 'unknown';  heard: string; speak: string };

const NUMBER_WORDS: Record<string, string> = {
  zero: '0', one: '1', two: '2', three: '3', four: '4', five: '5',
  six: '6', seven: '7', eight: '8', nine: '9',
  ten: '10', eleven: '11', twelve: '12', hundred: '00',
};

/** Strips punctuation and collapses whitespace, keeping it comparable. */
function normalise(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, ' ').replace(/\s+/g, ' ').trim();
}

/** "5 0 0 d" / "500 d" / "kia 9" all need to reach "500D" / "KIA-9". */
function compact(text: string): string {
  return text.replace(/[\s-]/g, '').toUpperCase();
}

const KNOWN_ROUTES = Object.keys(DEMO_ROUTES);

/**
 * Recognises a route number. Known routes are matched first, because speech
 * recognition renders them inconsistently ("500 D", "five hundred D") and an
 * exact catalogue hit is far more reliable than a generic pattern.
 */
export function extractRoute(text: string): string | null {
  const words = normalise(text).split(' ');

  // Spoken digits sometimes come back as words.
  const digitised = words
    .map((w) => (w in NUMBER_WORDS ? NUMBER_WORDS[w] : w))
    .join(' ');

  const haystack = compact(digitised);

  for (const route of KNOWN_ROUTES) {
    if (haystack.includes(compact(route))) return route;
  }

  // Generic BMTC-ish shape: digits with an optional letter suffix.
  const m = digitised.match(/\b(\d{1,4})\s?([a-z])?\b/);
  if (m) return `${m[1]}${m[2] ? m[2].toUpperCase() : ''}`;

  return null;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Word-boundary matching, tolerating a trailing plural.
 *
 * Substring matching is wrong here in a way that bites immediately: "book"
 * appears inside "phrasebook" and "bookings", so `includes` sent "show me the
 * phrasebook" into the ticket-booking flow.
 */
function has(text: string, ...phrases: string[]): boolean {
  return phrases.some((p) => new RegExp(`\\b${escapeRegex(p)}s?\\b`).test(text));
}

const TAB_WORDS: { tab: TabName; words: string[] }[] = [
  { tab: 'Tickets',  words: ['ticket', 'booking', 'my bookings', 'pass'] },
  { tab: 'Scan',     words: ['scan', 'camera', 'photo', 'signboard', 'sign board', 'board'] },
  { tab: 'Live',     words: ['live', 'conversation', 'interpreter'] },
  { tab: 'Speak',    words: ['speak', 'phrase', 'phrasebook', 'translate'] },
  { tab: 'Routes',   words: ['route', 'bus', 'map', 'metro', 'stop'] },
  { tab: 'Settings', words: ['setting', 'voice', 'preference', 'sign out', 'log out'] },
];

/**
 * Maps an English transcript onto an action.
 *
 * Order matters: the most specific intents are tested first, so "book a ticket
 * to the Taj Mahal" does not degrade into a bare tab switch.
 */
export function matchIntent(englishText: string): VoiceIntent {
  const text = normalise(englishText);

  if (!text) {
    return { kind: 'unknown', heard: '', speak: 'I did not catch that. Please try again.' };
  }

  // ── help ──
  if (has(text, 'what can i say', 'what can you do', 'help me', 'commands')) {
    return {
      kind: 'help',
      speak:
        'You can say: find route 500D, show the map, book a ticket to the Taj Mahal, ' +
        'start a live conversation, or open settings.',
    };
  }

  // ── existing bookings ──
  // Checked before booking, so "show my bookings" is not read as "make a booking".
  if (has(text, 'my ticket', 'my booking', 'show ticket', 'show my')) {
    return { kind: 'tickets', speak: 'Here are your bookings.' };
  }

  // ── new booking ──
  if (has(text, 'book', 'buy a ticket', 'reserve', 'visit')) {
    // "book a ticket to X" — try to name the monument. City names are
    // deliberately not matched here: with ten sites in Delhi, "book something
    // in Delhi" would pick whichever one happens to be listed first.
    const byName = MONUMENTS.find((m) => has(text, m.name.toLowerCase()));

    // bestMonument returns null unless one match is clearly ahead, so a bare
    // "book a ticket" opens the picker instead of silently choosing a site.
    const remainder = text
      .replace(/\b(book|books|a|an|the|ticket|tickets|to|for|visit|reserve|please)\b/g, '')
      .trim();
    const named = byName ?? (remainder.length >= 3 ? bestMonument(remainder) : null) ?? undefined;

    if (named) {
      return {
        kind: 'book',
        monumentId: named.id,
        monumentName: named.name,
        speak: `Booking a visit to ${named.name}.`,
      };
    }
    return { kind: 'book', speak: 'Opening ticket booking.' };
  }

  // ── live conversation ──
  if (has(text, 'talk to', 'conversation', 'interpret', 'live mode', 'translate for me')) {
    return { kind: 'live', speak: 'Starting a live conversation.' };
  }

  // ── scanning ──
  if (has(text, 'scan', 'read the board', 'read this', 'what does this say')) {
    return { kind: 'scan', speak: 'Opening the scanner.' };
  }

  // ── map ──
  if (has(text, 'map', 'where is the bus', 'show me the metro', 'nearby')) {
    return { kind: 'map', speak: 'Opening the transit map.' };
  }

  // ── route lookup ──
  if (has(text, 'route', 'bus number', 'which bus', 'where does', 'goes to')) {
    const routeNo = extractRoute(text);
    if (routeNo) {
      return { kind: 'route', routeNo, speak: `Looking up route ${routeNo}.` };
    }
    return { kind: 'navigate', tab: 'Routes', speak: 'Which route number?' };
  }

  // A bare route number with no other cue, e.g. just "500D".
  const bare = extractRoute(text);
  if (bare && text.split(' ').length <= 3) {
    return { kind: 'route', routeNo: bare, speak: `Looking up route ${bare}.` };
  }

  // ── phrase translation: "how do I say X" ──
  const sayMatch = englishText.match(/how do (?:i|you) say (.+)/i);
  if (sayMatch) {
    const phrase = sayMatch[1].replace(/[?.!]+$/, '').trim();
    if (phrase) {
      return { kind: 'translate', phrase, speak: `Translating: ${phrase}` };
    }
  }

  // ── plain tab switching ──
  for (const { tab, words } of TAB_WORDS) {
    if (has(text, ...words)) {
      return { kind: 'navigate', tab, speak: `Opening ${tab}.` };
    }
  }

  return {
    kind: 'unknown',
    heard: englishText,
    speak: 'Sorry, I did not understand that. Say "what can I say" for examples.',
  };
}
