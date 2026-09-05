import { Monument } from '../monuments';
import { resolveSpoken } from '../monumentSearch';

/**
 * Turns one spoken answer into one booking decision.
 *
 * The booking flow used to need a tap between every step: the voice button
 * filled in a field, and a thumb had to press Continue. That is unusable for
 * the person this app is for. Everything here is pure so the parsing can be
 * tested without a microphone — which matters, because a misread "no" at the
 * review step would confirm a payment the traveller declined.
 *
 * Input has already been translated to English by the caller, so one rule set
 * covers all 22 languages. Native affirmatives are still matched directly:
 * translation of a bare "haan" is unreliable, and it is the single most
 * important word in the flow.
 */

export type BookingStep = 'site' | 'when' | 'party' | 'review' | 'pay' | 'capture' | 'done';

export type Control = 'cancel' | 'back' | 'repeat' | 'help';

export interface PartyPatch {
  adults?: number;
  children?: number;
  foreign?: boolean;
}

export type Turn =
  | { kind: 'control'; control: Control }
  | { kind: 'site'; monument: Monument }
  | { kind: 'choose'; options: Monument[] }
  | { kind: 'date'; iso: string }
  | { kind: 'party'; patch: PartyPatch }
  | { kind: 'yes' }
  | { kind: 'no' }
  | { kind: 'ready' }
  | { kind: 'skip' }
  | { kind: 'unclear' };

const NUMBER_WORDS: Record<string, number> = {
  zero: 0, none: 0, no: 0, nil: 0,
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14,
  fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
  twenty: 20,
  // Recognisers routinely return these for Hindi counting.
  ek: 1, do: 2, teen: 3, char: 4, panch: 5, chah: 6, saat: 7, aath: 8,
};

const YES_WORDS = [
  'yes', 'yeah', 'yep', 'yup', 'correct', 'right', 'ok', 'okay', 'sure',
  'confirm', 'confirmed', 'proceed', 'go ahead', 'that is right', 'thats right',
  'perfect', 'fine', 'done', 'agreed', 'please do',
  // The pay step asks for exactly these words, so they have to be understood.
  'paid', 'i paid', 'i have paid', 'payment done', 'payment complete',
  'money sent', 'transferred', 'ho gaya', 'kar diya',
  // Native affirmatives, which survive a failed translation.
  'haan', 'han', 'ha ji', 'ji haan', 'theek hai', 'thik hai', 'sari', 'houdu',
  'aama', 'avunu', 'hoy', 'hou', 'ho ji', 'sheri', 'aahe',
];

const NO_WORDS = [
  'no', 'nope', 'not right', 'incorrect', 'wrong', 'change', 'cancel that',
  'not correct', 'that is wrong', 'thats wrong', 'nahi', 'nahin', 'illa',
  'ille', 'kadu', 'ledu', 'nako', 'nathi',
  // Listed here because NO is tested first: without them "I have not paid"
  // would match "paid" and be taken as confirmation.
  'not paid', 'have not paid', 'havent paid', 'not yet', 'not done',
  'still paying', 'wait',
];

export function normaliseSpeech(text: string): string {
  return (text ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Whole-word containment, so "no" never matches inside "Konark". */
function has(text: string, phrase: string): boolean {
  return new RegExp(`(^| )${phrase.replace(/\s+/g, ' ')}( |$)`).test(text);
}

function hasAny(text: string, phrases: string[]): boolean {
  return phrases.some((p) => has(text, p));
}

/** Digits first, then number words. Returns null when there is no count. */
export function parseCount(text: string): number | null {
  const t = normaliseSpeech(text);
  const digits = t.match(/\d+/);
  if (digits) {
    const n = parseInt(digits[0], 10);
    if (n >= 0 && n <= 50) return n;
  }
  for (const word of t.split(' ')) {
    if (word in NUMBER_WORDS) return NUMBER_WORDS[word];
  }
  return null;
}

export function parseYesNo(text: string): 'yes' | 'no' | null {
  const t = normaliseSpeech(text);
  if (!t) return null;
  // Checked first: "no, that's wrong" also contains "that". A false positive
  // here confirms a booking the traveller just rejected.
  if (hasAny(t, NO_WORDS)) return 'no';
  if (hasAny(t, YES_WORDS)) return 'yes';
  return null;
}

const CONTROL_PHRASES: [Control, string[]][] = [
  ['cancel', ['cancel', 'stop', 'quit', 'exit', 'never mind', 'nevermind',
              'forget it', 'stop booking', 'cancel booking', 'band karo', 'bas']],
  ['back',   ['go back', 'back', 'previous', 'undo', 'change that', 'peeche']],
  ['repeat', ['repeat', 'say again', 'again', 'what did you say', 'pardon',
              'come again', 'phir se']],
  ['help',   ['help', 'what can i say', 'what do i say', 'i dont know',
              'i do not know', 'options']],
];

export function parseControl(text: string): Control | null {
  const t = normaliseSpeech(text);
  for (const [control, phrases] of CONTROL_PHRASES) {
    if (hasAny(t, phrases)) return control;
  }
  return null;
}

// ── dates ────────────────────────────────────────────────────────────────────

const WEEKDAYS = [
  'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday',
];

const MONTHS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  out.setDate(out.getDate() + n);
  return out;
}

/**
 * Parses the ways people say a visit date out loud.
 *
 * `today` is injected rather than read from the clock so the behaviour is
 * reproducible in tests — date code that reads `new Date()` internally is
 * date code nobody can verify.
 */
export function parseDate(text: string, today: Date = new Date()): string | null {
  const t = normaliseSpeech(text);
  if (!t) return null;

  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  if (has(t, 'day after tomorrow') || has(t, 'parso')) return iso(addDays(base, 2));
  if (has(t, 'tomorrow') || has(t, 'kal')) return iso(addDays(base, 1));
  if (has(t, 'today') || has(t, 'aaj') || has(t, 'right now') || has(t, 'now')) {
    return iso(base);
  }
  if (has(t, 'next week')) return iso(addDays(base, 7));
  if (has(t, 'this weekend')) {
    const delta = (6 - base.getDay() + 7) % 7 || 7;   // upcoming Saturday
    return iso(addDays(base, delta));
  }

  const inDays = t.match(/in (\d+|\w+) days?/);
  if (inDays) {
    const n = parseCount(inDays[1]);
    if (n !== null && n > 0 && n <= 365) return iso(addDays(base, n));
  }

  // "next friday" / "on saturday" — always the next such day still to come.
  for (let i = 0; i < WEEKDAYS.length; i++) {
    if (!has(t, WEEKDAYS[i]) && !has(t, WEEKDAYS[i].slice(0, 3))) continue;
    let delta = (i - base.getDay() + 7) % 7;
    if (delta === 0) delta = 7;                  // "friday" said on a Friday
    if (has(t, 'next')) delta += delta <= 6 ? 0 : 7;
    return iso(addDays(base, delta));
  }

  // "12 march", "march 12", "the 12th"
  for (let mi = 0; mi < MONTHS.length; mi++) {
    const month = MONTHS[mi];
    if (!has(t, month) && !has(t, month.slice(0, 3))) continue;
    const day = t.match(/(\d{1,2})/);
    if (!day) continue;
    const dayNum = parseInt(day[1], 10);
    if (dayNum < 1 || dayNum > 31) continue;
    let year = base.getFullYear();
    if (mi < base.getMonth() || (mi === base.getMonth() && dayNum < base.getDate())) {
      year += 1;                                  // a month already past means next year
    }
    return iso(new Date(year, mi, dayNum));
  }

  const ordinal = t.match(/(?:^| )(?:on )?(?:the )?(\d{1,2})(?:st|nd|rd|th)(?: |$)/);
  if (ordinal) {
    const dayNum = parseInt(ordinal[1], 10);
    if (dayNum >= 1 && dayNum <= 31) {
      const thisMonth = new Date(base.getFullYear(), base.getMonth(), dayNum);
      if (thisMonth.getDate() === dayNum && thisMonth >= base) return iso(thisMonth);
      const next = new Date(base.getFullYear(), base.getMonth() + 1, dayNum);
      if (next.getDate() === dayNum) return iso(next);
    }
  }

  return null;
}

// ── party size ───────────────────────────────────────────────────────────────

const ADULT_WORDS = ['adult', 'adults', 'grown', 'grownups', 'people', 'person',
  'persons', 'of us', 'members', 'passengers', 'log'];
const CHILD_WORDS = ['child', 'children', 'kid', 'kids', 'baby', 'babies',
  'infant', 'infants', 'bachche', 'bacche'];

/** Finds a count that sits next to one of `nouns`, e.g. "two adults". */
function countNear(t: string, nouns: string[]): number | null {
  const words = t.split(' ');
  for (let i = 0; i < words.length; i++) {
    const n = parseCount(words[i]);
    if (n === null) continue;
    // Look a short way ahead: "two adults", "two small kids".
    for (let j = i + 1; j <= Math.min(i + 3, words.length - 1); j++) {
      if (nouns.includes(words[j])) return n;
    }
  }
  // "adults: two" and "children two" read the other way round.
  for (let i = 0; i < words.length; i++) {
    if (!nouns.includes(words[i])) continue;
    for (let j = i + 1; j <= Math.min(i + 2, words.length - 1); j++) {
      const n = parseCount(words[j]);
      if (n !== null) return n;
    }
  }
  return null;
}

/**
 * Reads a party out of one sentence: "two adults and a child", "just me",
 * "we are four", "three foreigners".
 */
export function parseParty(text: string): PartyPatch | null {
  const t = normaliseSpeech(text);
  if (!t) return null;

  const patch: PartyPatch = {};

  if (hasAny(t, ['foreigner', 'foreigners', 'foreign', 'foreign national',
                 'not indian', 'from abroad', 'tourist visa'])) {
    patch.foreign = true;
  } else if (hasAny(t, ['indian', 'indians', 'local', 'domestic', 'bharatiya'])) {
    patch.foreign = false;
  }

  if (hasAny(t, ['just me', 'only me', 'myself', 'alone', 'by myself', 'solo',
                 'akela', 'just myself'])) {
    patch.adults = 1;
    patch.children = 0;
    return patch;
  }

  const children = countNear(t, CHILD_WORDS);
  if (children !== null) patch.children = Math.min(children, 20);

  const adults = countNear(t, ADULT_WORDS);
  if (adults !== null) {
    patch.adults = Math.min(Math.max(adults, 1), 20);
    return patch;
  }

  // A bare number means adults: "two" in answer to "how many adults?".
  // Skip it when the only number in the sentence was already spent on children.
  const bare = parseCount(t);
  if (bare !== null && bare >= 1 && children === null) {
    patch.adults = Math.min(bare, 20);
  }

  return Object.keys(patch).length > 0 ? patch : null;
}

/** "change the date" → which step to jump back to. */
export function parseAmendTarget(text: string): BookingStep | null {
  const t = normaliseSpeech(text);
  if (hasAny(t, ['monument', 'place', 'site', 'destination', 'where', 'somewhere else'])) {
    return 'site';
  }
  if (hasAny(t, ['date', 'day', 'when', 'time', 'tomorrow', 'today'])) return 'when';
  if (hasAny(t, ['people', 'person', 'adults', 'adult', 'children', 'child',
                 'kids', 'how many', 'number', 'party'])) {
    return 'party';
  }
  return null;
}

// ── the one entry point the screen calls ─────────────────────────────────────

/**
 * Interprets one utterance in the context of the step it answers.
 *
 * Control words win everywhere: a traveller saying "stop" must be obeyed at
 * any point, including while a payment amount is on screen.
 */
export function interpret(step: BookingStep, heard: string, today: Date = new Date()): Turn {
  const t = normaliseSpeech(heard);
  if (!t) return { kind: 'unclear' };

  const control = parseControl(t);
  if (control) return { kind: 'control', control };

  switch (step) {
    case 'site': {
      const { exact, options } = resolveSpoken(heard);
      if (exact) return { kind: 'site', monument: exact };
      if (options.length > 0) return { kind: 'choose', options };
      return { kind: 'unclear' };
    }

    case 'when': {
      const date = parseDate(heard, today);
      return date ? { kind: 'date', iso: date } : { kind: 'unclear' };
    }

    case 'party': {
      const patch = parseParty(heard);
      return patch ? { kind: 'party', patch } : { kind: 'unclear' };
    }

    case 'review':
    case 'pay': {
      const answer = parseYesNo(heard);
      if (answer === 'yes') return { kind: 'yes' };
      if (answer === 'no') return { kind: 'no' };
      return { kind: 'unclear' };
    }

    case 'capture': {
      if (hasAny(t, ['skip', 'later', 'not now', 'no code', 'no qr'])) {
        return { kind: 'skip' };
      }
      if (hasAny(t, ['ready', 'scan', 'go', 'start', 'open camera', 'yes', 'ok', 'okay'])) {
        return { kind: 'ready' };
      }
      const answer = parseYesNo(heard);
      if (answer === 'yes') return { kind: 'ready' };
      if (answer === 'no') return { kind: 'skip' };
      return { kind: 'unclear' };
    }

    default:
      return { kind: 'unclear' };
  }
}

/**
 * Checked before the bare number words below, because "the second one"
 * contains "one" — matching that first picks the wrong item every time.
 */
const ORDINALS: [string[], number][] = [
  [['first', '1st', 'former'], 0],
  [['second', '2nd', 'latter'], 1],
  [['third', '3rd'], 2],
];

const BARE_ORDINALS: [string[], number][] = [
  [['one'], 0], [['two'], 1], [['three'], 2],
];

/**
 * "the second one" after a list has been read out.
 *
 * Only consulted when options are already on offer, so the bare number words
 * cannot be mistaken for a party size.
 */
export function parseOrdinalChoice<T>(text: string, options: T[]): T | null {
  const t = normaliseSpeech(text);
  for (const group of [ORDINALS, BARE_ORDINALS]) {
    for (const [words, index] of group) {
      if (index < options.length && hasAny(t, words)) return options[index];
    }
  }
  if (hasAny(t, ['last', 'bottom'])) return options[options.length - 1] ?? null;
  return null;
}

/** Reads a short list of choices back as a question. */
export function describeOptions(options: Monument[]): string {
  const names = options.slice(0, 3).map((m) => `${m.name} in ${m.city}`);
  if (names.length === 1) return `Did you mean ${names[0]}?`;
  const last = names.pop();
  return `Did you mean ${names.join(', ')}, or ${last}?`;
}
