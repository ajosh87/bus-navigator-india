/**
 * Trust check for whatever a scanned QR code points at.
 *
 * This is the load-bearing safety step in any scan-then-book flow. Sticking a
 * fake QR over a real one is the most common payment scam in India, and a user
 * who cannot read the screen cannot sanity-check a domain for themselves — so
 * the check has to happen here, and its result has to be spoken aloud.
 *
 * Pure functions, no React or RN imports, so this can be unit tested directly.
 */

export type Verdict =
  /** A government or explicitly recognised ticketing host. */
  | 'official'
  /** A UPI payment request rather than a web page. */
  | 'payment'
  /** Reachable but unrecognised — usable only with explicit consent. */
  | 'unknown'
  /** Actively suspicious. Never open automatically. */
  | 'dangerous';

export interface DestinationCheck {
  verdict: Verdict;
  /** Lower-cased host, or '' when the payload is not a URL. */
  host: string;
  url: string;
  /** Why, phrased for reading aloud in the traveller's language. */
  reason: string;
  /** True only for 'official'. Everything else needs a human decision. */
  safeToProceed: boolean;
  /** Specific problems found, for the on-screen detail. */
  warnings: string[];
}

/**
 * Government second-level domains. India's public bodies live under these, so
 * matching the suffix covers every state and department without enumerating
 * them — and crucially cannot be registered by an attacker.
 */
const GOVERNMENT_SUFFIXES = ['.gov.in', '.nic.in'];

/**
 * Non-government hosts explicitly recognised as ticketing endpoints.
 * Deliberately short: every entry here is a domain we are asserting is safe to
 * send someone's money and identity to, so it should be added only with a
 * source, never guessed.
 */
const RECOGNISED_HOSTS: string[] = [
  'asi.payumoney.com',      // Archaeological Survey of India monument ticketing
  'irctc.co.in',            // Indian Railways
];

function isGovernment(host: string): boolean {
  return GOVERNMENT_SUFFIXES.some((s) => host === s.slice(1) || host.endsWith(s));
}

function isRecognised(host: string): boolean {
  return RECOGNISED_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
}

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

/**
 * Inspects a scanned payload and decides whether it may be acted on.
 *
 * Returns a verdict rather than a boolean because the three unsafe outcomes
 * need different handling: a payment request needs the payee read out, an
 * unknown host needs consent, and a spoofed host needs a hard stop.
 */
export function checkDestination(raw: string): DestinationCheck {
  const text = (raw ?? '').trim();

  const base: DestinationCheck = {
    verdict: 'dangerous',
    host: '',
    url: text,
    reason: '',
    safeToProceed: false,
    warnings: [],
  };

  if (!text) {
    return { ...base, reason: 'That code was empty.' };
  }

  // UPI payment requests are not web pages and must never be auto-followed.
  if (/^upi:\/\//i.test(text)) {
    const params = new URLSearchParams(text.slice(text.indexOf('?') + 1));
    const payee = params.get('pn') || params.get('pa') || 'an unknown account';
    const amount = params.get('am');
    return {
      ...base,
      verdict: 'payment',
      reason: amount
        ? `This code asks you to pay ${amount} rupees to ${payee}. Only continue if that is who you meant to pay.`
        : `This code asks you to pay ${payee}. Only continue if that is who you meant to pay.`,
      warnings: ['Payment request — confirm the payee before approving'],
    };
  }

  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return {
      ...base,
      verdict: 'unknown',
      reason: 'That code is not a website link.',
      warnings: ['Not a URL'],
    };
  }

  const host = url.hostname.toLowerCase();
  const warnings: string[] = [];

  if (!/^https?:$/i.test(url.protocol)) {
    return {
      ...base,
      host,
      reason: `That code opens ${url.protocol} rather than a website. Not opening it.`,
      warnings: [`Unsupported scheme: ${url.protocol}`],
    };
  }

  // Credentials in the authority section: https://asi.gov.in@evil.example.com
  // reads as the government site to a human but resolves to the attacker.
  if (url.username || url.password) {
    return {
      ...base,
      host,
      reason: 'That link is disguised to look like another website. Not opening it.',
      warnings: ['Embedded credentials in URL — classic spoofing pattern'],
    };
  }

  // Punycode: xn--80ak6aa92e.com renders as a lookalike of a real domain.
  if (host.split('.').some((label) => label.startsWith('xn--'))) {
    return {
      ...base,
      host,
      reason: 'That web address uses lookalike characters. Not opening it.',
      warnings: ['Punycode host — possible homograph attack'],
    };
  }

  if (IPV4.test(host)) {
    return {
      ...base,
      host,
      reason: 'That link points at a bare address rather than a named website. Not opening it.',
      warnings: ['Raw IP address host'],
    };
  }

  const insecure = url.protocol.toLowerCase() === 'http:';
  if (insecure) warnings.push('Not encrypted (http, not https)');

  if (isGovernment(host) || isRecognised(host)) {
    // A government host reached over plain http still must not carry an ID or
    // a payment, so it is downgraded rather than trusted.
    if (insecure) {
      return {
        ...base,
        verdict: 'unknown',
        host,
        reason: `${host} is a government site, but this link is not encrypted. Do not enter personal details.`,
        warnings,
      };
    }
    return {
      verdict: 'official',
      host,
      url: url.toString(),
      reason: `This is the official site, ${host}.`,
      safeToProceed: true,
      warnings,
    };
  }

  return {
    ...base,
    verdict: 'unknown',
    host,
    reason:
      `This code opens ${host}, which is not a recognised official ticketing site. ` +
      'It may be a sticker placed over the real one. Do not pay here unless you are sure.',
    warnings: [...warnings, 'Host not on the recognised list'],
  };
}

/** One-line label for the UI badge. */
export function verdictLabel(v: Verdict): string {
  switch (v) {
    case 'official':  return 'OFFICIAL SITE';
    case 'payment':   return 'PAYMENT REQUEST';
    case 'unknown':   return 'NOT RECOGNISED';
    case 'dangerous': return 'BLOCKED';
  }
}
