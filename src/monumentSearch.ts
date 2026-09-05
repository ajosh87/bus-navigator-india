import { MONUMENTS, Monument } from './monuments';

/**
 * Fuzzy, alias-aware monument search.
 *
 * Substring matching was fine for a typed search box and useless for speech.
 * Recognition returns "kutub meenar", "thaj mahal", "lal kila", "bangalore
 * palace" — none of which contain the catalogue spelling as a substring, so
 * every one of them found nothing.
 *
 * Pure functions, no React or RN imports, so the ranking is testable directly.
 */

export interface SearchHit {
  monument: Monument;
  /** 0–100. Higher is a better match. */
  score: number;
  /** Which field produced the match, for debugging and for reading back. */
  matchedOn: 'name' | 'alias' | 'city' | 'state' | 'fuzzy';
}

/**
 * Alternative names people actually say: older spellings, local-language names,
 * and the pre-renaming city names still in everyday use.
 */
export const ALIASES: Record<string, string[]> = {
  'taj-mahal':      ['taj', 'tajmahal', 'taj mehal', 'tajmahal agra'],
  'red-fort':       ['lal qila', 'lal kila', 'laal quila', 'delhi fort'],
  'qutub-minar':    ['qutb minar', 'kutub minar', 'qutab minar', 'kutb minar'],
  'humayuns-tomb':  ['humayun tomb', 'humayoon tomb', 'humayun ka maqbara'],
  'agra-fort':      ['lal qila agra', 'agra ka qila'],
  'fatehpur-sikri': ['fatehpur', 'buland darwaza'],
  'ajanta':         ['ajanta caves', 'ajintha'],
  'ellora':         ['ellora caves', 'verul', 'kailasa temple'],
  'konark':         ['sun temple', 'konarak', 'black pagoda'],
  'hampi':          ['vijayanagara', 'virupaksha'],
  'mysore-palace':  ['mysuru palace', 'amba vilas'],
  'mahabalipuram':  ['mamallapuram', 'shore temple', 'mahabalipuram temple'],
  'charminar':      ['char minar', 'chaar minar'],
  'golconda':       ['golconda fort', 'golkonda', 'golla konda'],
  'gateway-of-india': ['gateway', 'mumbai gateway'],
  'amber-fort':     ['amer fort', 'amber palace', 'amer palace'],
  'hawa-mahal':     ['palace of winds', 'hawamahal'],
  'city-palace-udaipur': ['udaipur palace'],
  'mehrangarh':     ['mehrangarh fort', 'jodhpur fort'],
  'victoria-memorial': ['victoria', 'kolkata victoria'],
  'sanchi':         ['sanchi stupa', 'great stupa'],
  'khajuraho':      ['khajuraho temples'],
  'elephanta':      ['elephanta caves', 'gharapuri'],
  'golden-temple':  ['harmandir sahib', 'darbar sahib', 'swarn mandir', 'golden temple amritsar'],
  'jantar-mantar-jaipur': ['jantar mantar', 'jantar mantar jaipur'],
  'jantar-mantar-delhi':  ['jantar mantar delhi'],
  'itmad-ud-daulah': ['baby taj', 'itimad ud daulah', 'etmaduddaula'],
  'bara-imambara':  ['imambara', 'bhulbhulaiya', 'lucknow maze'],
  'residency-lucknow': ['lucknow residency'],
  'brihadeeswarar': ['big temple', 'thanjavur temple', 'tanjore temple', 'peruvudaiyar'],
  'meenakshi-temple': ['meenakshi', 'madurai temple', 'minakshi'],
  'padmanabhaswamy': ['padmanabha', 'ananthapadmanabhaswamy', 'trivandrum temple'],
  'mattancherry-palace': ['dutch palace', 'kochi palace', 'cochin palace'],
  'statue-of-unity': ['sardar patel statue', 'unity statue'],
  'rani-ki-vav':    ['rani ki vav patan', 'queens stepwell', 'patan stepwell'],
  'sabarmati-ashram': ['gandhi ashram', 'sabarmati'],
  'chhatrapati-shivaji-terminus': ['cst', 'vt station', 'victoria terminus'],
  'shaniwar-wada':  ['shaniwarwada', 'peshwa palace'],
  'aga-khan-palace': ['gandhi memorial pune'],
  'bibi-ka-maqbara': ['mini taj', 'deccan taj'],
  'daulatabad':     ['daulatabad fort', 'devagiri'],
  'basilica-bom-jesus': ['bom jesus', 'old goa church', 'st francis xavier'],
  'aguada-fort':    ['fort aguada'],
  'lotus-temple':   ['bahai temple', 'kamal mandir'],
  'akshardham-delhi': ['akshardham', 'swaminarayan akshardham'],
  'national-museum-delhi': ['national museum'],
  'indian-museum':  ['kolkata museum', 'jadu ghar'],
  'salar-jung':     ['salarjung museum'],
  'chowmahalla':    ['chowmahalla palace', 'nizam palace'],
  'ramappa':        ['ramappa temple', 'rudreswara'],
  'tipu-palace':    ['tipu palace', 'tipu sultan palace'],
  'bangalore-palace': ['bengaluru palace'],
  'lalbagh':        ['lal bagh', 'lalbagh garden', 'glass house'],
  'badami-caves':   ['badami', 'badami temples'],
  'belur':          ['chennakeshava', 'belur temple'],
  'halebidu':       ['hoysaleswara', 'halebid', 'halebeedu'],
  'gwalior-fort':   ['gwalior', 'gwalior ka qila'],
  'bhimbetka':      ['bhim betka', 'rock shelters'],
  'nalanda':        ['nalanda university', 'nalanda ruins'],
  'mahabodhi':      ['bodh gaya', 'bodhgaya', 'bodhi tree'],
  'kamakhya':       ['kamakhya devi', 'guwahati temple'],
  'kaziranga':      ['kaziranga park', 'rhino park'],
  'udayagiri-khandagiri': ['udayagiri caves', 'khandagiri'],
  'jallianwala-bagh': ['jallianwala', 'jallianwala bagh amritsar'],
  'shalimar-bagh':  ['shalimar garden', 'srinagar garden'],
  'purana-qila':    ['old fort', 'purana quila'],
  'safdarjung-tomb': ['safdarjang tomb'],
  'india-gate':     ['war memorial delhi'],
  'chittorgarh':    ['chittor fort', 'chittaurgarh'],
  'kumbhalgarh':    ['kumbalgarh', 'great wall of india'],
  'jaisalmer-fort': ['sonar quila', 'golden fort'],
  'nahargarh-fort': ['nahargarh'],
  'albert-hall-museum': ['albert hall'],
  'city-palace-jaipur': ['jaipur palace'],
  'umaid-bhawan':   ['umaid bhawan palace'],
  'thanjavur-palace': ['tanjore palace', 'maratha palace'],
  'fort-st-george': ['fort saint george', 'chennai fort'],
  'bekal-fort':     ['bekal'],
  'somnath':        ['somnath mandir', 'somanath'],
  'champaner':      ['pavagadh', 'champaner pavagadh'],
  'raigad-fort':    ['raigad', 'shivaji fort'],
  'sarnath':        ['dhamek stupa', 'saranath'],
  'orchha':         ['orchha fort', 'urchha'],
  'mandu':          ['mandav', 'mandu fort'],
  'leh-palace':     ['leh'],
  'thiksey':        ['thiksey gompa', 'thikse'],
  'rumtek':         ['rumtek gompa'],
  'lepakshi':       ['veerabhadra temple', 'hanging pillar'],
  'ranakpur':       ['ranakpur temple', 'adinath temple'],
  'pattadakal':     ['pattadakallu'],
};

/** Cities that are still commonly said by their former names. */
const CITY_ALIASES: Record<string, string[]> = {
  bengaluru: ['bangalore'],
  mumbai:    ['bombay'],
  kolkata:   ['calcutta'],
  chennai:   ['madras'],
  mysuru:    ['mysore'],
  pune:      ['poona'],
  varanasi:  ['banaras', 'benares', 'kashi'],
  prayagraj: ['allahabad'],
};

/** Words that carry no signal and only distort token matching. */
const STOPWORDS = new Set([
  'the', 'a', 'an', 'of', 'at', 'in', 'to', 'for', 'and',
  'monument', 'ticket', 'tickets', 'visit', 'book', 'please', 'show', 'me',
]);

export function normalise(text: string): string {
  return (text ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')      // strip diacritics
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Single letters are dropped: "Humayun's Tomb" normalises to "humayun s tomb",
 * and that orphaned "s" can never be matched by anything a person says.
 */
function tokens(text: string): string[] {
  return normalise(text).split(' ').filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

/**
 * Words that name a *kind* of place rather than a particular one. They are
 * worth points when they match but are never required, so "Golconda" finds
 * Golconda Fort while a bare "fort" finds nothing.
 */
const GENERIC = new Set([
  'fort', 'tomb', 'temple', 'temples', 'palace', 'cave', 'caves', 'museum',
  'stupa', 'monastery', 'gompa', 'memorial', 'garden', 'ashram', 'basilica',
  'terminus', 'park', 'national', 'shelters', 'rock', 'summer', 'amman', 'city',
]);

/** True when `needle` appears in `haystack` on word boundaries. */
function containsWord(haystack: string, needle: string): boolean {
  if (!needle) return false;
  const i = haystack.indexOf(needle);
  if (i < 0) return false;
  const before = i === 0 ? ' ' : haystack[i - 1];
  const after = i + needle.length >= haystack.length ? ' ' : haystack[i + needle.length];
  return before === ' ' && after === ' ';
}

/** Levenshtein distance, bounded so long mismatches bail out early. */
function editDistance(a: string, b: string, max = 4): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;

  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    let rowBest = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      if (curr[j] < rowBest) rowBest = curr[j];
    }
    if (rowBest > max) return max + 1;    // no path can recover
    prev = curr;
  }
  return prev[b.length];
}

function ratio(a: string, b: string): number {
  const longest = Math.max(a.length, b.length);
  if (longest === 0) return 1;
  const d = editDistance(a, b, Math.max(2, Math.floor(longest * 0.4)));
  return 1 - d / longest;
}

/** "meenar" → "menar". Doubling a vowel is the commonest transliteration slip. */
function collapse(word: string): string {
  return word.replace(/(.)\1+/g, '$1');
}

/** 0–1 similarity between two words, forgiving of doubled letters. */
function similarity(a: string, b: string): number {
  const direct = ratio(a, b);
  const ca = collapse(a);
  const cb = collapse(b);
  if (ca === a && cb === b) return direct;
  return Math.max(direct, ratio(ca, cb));
}

function aliasesFor(m: Monument): string[] {
  const out = [...(ALIASES[m.id] ?? [])];
  const city = normalise(m.city);
  for (const [canonical, alts] of Object.entries(CITY_ALIASES)) {
    if (city === canonical) out.push(...alts);
  }
  return out;
}

function scoreOne(queryTokens: string[], query: string, m: Monument): SearchHit | null {
  const name = normalise(m.name);
  const city = normalise(m.city);
  const state = normalise(m.state);
  const alias = aliasesFor(m).map(normalise);

  if (name === query) return { monument: m, score: 100, matchedOn: 'name' };
  if (alias.includes(query)) return { monument: m, score: 96, matchedOn: 'alias' };
  if (name.startsWith(query)) return { monument: m, score: 92, matchedOn: 'name' };
  if (name.includes(query)) return { monument: m, score: 86, matchedOn: 'name' };
  // The utterance wrapping the name: "book tickets for the taj mahal".
  if (containsWord(query, name)) return { monument: m, score: 90, matchedOn: 'name' };
  if (alias.some((a) => a.includes(query) || containsWord(query, a))) {
    return { monument: m, score: 82, matchedOn: 'alias' };
  }
  if (city === query) return { monument: m, score: 78, matchedOn: 'city' };
  if (city.includes(query)) return { monument: m, score: 70, matchedOn: 'city' };
  if (state.includes(query)) return { monument: m, score: 58, matchedOn: 'state' };

  if (queryTokens.length === 0) return null;

  /**
   * Fuzzy matching runs from the *record* outwards, not from the query.
   *
   * Asking "does every spoken word appear in this record?" fails on the way
   * people actually talk — "i want to visit red fort" carries four words the
   * catalogue has never heard of. Asking instead "is this monument's name
   * present in what they said?" tolerates filler, and still refuses a bare
   * "fort", because a generic word covers none of the distinctive ones.
   */
  const labels = [tokens(m.name), ...alias.map(tokens)].filter((l) => l.length > 0);
  const cityTokens = new Set(tokens(m.city));

  let best: SearchHit | null = null;

  for (const label of labels) {
    // A word is optional if it names a category, or repeats the city — nobody
    // has to say "Delhi" to mean Jantar Mantar, Delhi.
    const required = label.filter((t) => !GENERIC.has(t) && !cityTokens.has(t));
    const optional = label.filter((t) => GENERIC.has(t) || cityTokens.has(t));
    const mustMatch = required.length > 0 ? required : label;

    const closeness = (labelToken: string): number => {
      let top = 0;
      for (const qt of queryTokens) {
        const sim = qt.startsWith(labelToken) || labelToken.startsWith(qt)
          ? Math.max(0.85, similarity(qt, labelToken))
          : similarity(qt, labelToken);
        if (sim > top) top = sim;
      }
      return top;
    };

    let sum = 0;
    let ok = true;
    for (const t of mustMatch) {
      const c = closeness(t);
      // A single distinctive word left unaccounted for sinks the match.
      if (c < 0.72) { ok = false; break; }
      sum += c;
    }
    if (!ok) continue;

    const core = sum / mustMatch.length;
    const extras = optional.filter((t) => closeness(t) >= 0.8).length;

    // Capped below the substring tier so a real name match always wins, and
    // nudged up by specificity: two matched words beat one.
    // Floored at 40 so a *confident* fuzzy match lands near the alias tier:
    // "charminaar" is not a weak guess, it is a doubled vowel.
    const score = Math.min(
      79,
      Math.round(40 + core * 38 + Math.min(mustMatch.length - 1, 2) * 3 + Math.min(extras, 2) * 2),
    );

    if (!best || score > best.score) {
      best = { monument: m, score, matchedOn: 'fuzzy' };
    }
  }
  if (best) return best;

  // "monuments in hyderabad" never reaches the whole-string city test above,
  // because the whole string is not a city. Try the place words on their own.
  const places: [SearchHit['matchedOn'], string][] = [
    ...[...cityTokens].map((t): [SearchHit['matchedOn'], string] => ['city', t]),
    ...tokens(m.state).map((t): [SearchHit['matchedOn'], string] => ['state', t]),
  ];

  for (const [field, placeToken] of places) {
    if (queryTokens.some((qt) => similarity(qt, placeToken) >= 0.85)) {
      return { monument: m, score: field === 'city' ? 60 : 50, matchedOn: field };
    }
  }

  return null;
}

/**
 * What an untouched search box shows first.
 *
 * The catalogue is stored grouped by region, which reads well as a file and
 * badly as a default list — the first screenful was ten sites in Delhi. These
 * lead instead, and the rest follow in catalogue order.
 */
const FEATURED = [
  'taj-mahal', 'red-fort', 'amber-fort', 'gateway-of-india', 'mysore-palace',
  'charminar', 'victoria-memorial', 'hampi', 'khajuraho', 'qutub-minar',
  'golden-temple', 'konark',
];

let browseCache: Monument[] | null = null;

function browseOrder(): Monument[] {
  if (browseCache) return browseCache;
  const byId = new Map(MONUMENTS.map((m) => [m.id, m]));
  const lead = FEATURED.map((id) => byId.get(id)).filter((m): m is Monument => !!m);
  const seen = new Set(lead.map((m) => m.id));
  browseCache = [...lead, ...MONUMENTS.filter((m) => !seen.has(m.id))];
  return browseCache;
}

/**
 * Ranked monument search.
 *
 * An empty query browses the catalogue in listing order, which is what the
 * search box wants when it is untouched. Callers acting on a *spoken* answer
 * must therefore reject blank input rather than accepting the first result.
 */
export function searchMonuments(query: string, limit = 8): SearchHit[] {
  const q = normalise(query);
  if (!q) {
    return browseOrder()
      .slice(0, limit)
      .map((m) => ({ monument: m, score: 0, matchedOn: 'name' as const }));
  }

  // "the" is not a search. Without this, "The Residency" wins on a prefix
  // match and a stray filler word books a monument in Lucknow.
  const qTokens = tokens(query);
  if (qTokens.length === 0) return [];

  return MONUMENTS
    .map((m) => scoreOne(qTokens, q, m))
    .filter((h): h is SearchHit => h !== null && h.score >= 40)
    .sort((a, b) => b.score - a.score || a.monument.name.localeCompare(b.monument.name))
    .slice(0, limit);
}

/** Monuments only, for callers that do not care about the ranking metadata. */
export function findMonuments(query: string, limit = 40): Monument[] {
  return searchMonuments(query, limit).map((h) => h.monument);
}

/**
 * The single best match, or null when nothing is clearly ahead.
 *
 * Voice callers must use this rather than `findMonuments(...)[0]`: taking the
 * top of a weak result list is how a bare "fort" ends up booking whichever
 * fort happens to sort first.
 */
export function bestMonument(query: string): Monument | null {
  return resolveSpoken(query).exact;
}

/**
 * Splits results into a confident winner and the runners-up.
 *
 * The conversation needs this distinction: one clear match can be acted on,
 * while a close field has to be read back as a question.
 */
export function resolveSpoken(query: string): {
  exact: Monument | null;
  options: Monument[];
} {
  const hits = searchMonuments(query, 4);
  if (hits.length === 0) return { exact: null, options: [] };

  const [top, second] = hits;
  const decisive = top.score >= 75 && (!second || top.score - second.score >= 12);

  return {
    exact: decisive ? top.monument : null,
    options: hits.map((h) => h.monument),
  };
}
