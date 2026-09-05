import { appFetch } from '../http';

/**
 * Reads an official ticketing page through the server-side Anakin proxy, then
 * boils it down to the handful of facts worth saying out loud.
 *
 * A monument page runs to thousands of words. Narrating all of it would be
 * useless to the person this feature exists for, so `summarisePage` pulls out
 * fees, opening hours and closed days and leaves the rest.
 */

export interface ScrapedPage {
  url: string;
  host: string;
  markdown: string;
  json: unknown | null;
  cached: boolean;
  durationMs: number | null;
}

export class ScrapeUnavailable extends Error {
  constructor(message: string, readonly configured: boolean) {
    super(message);
    this.name = 'ScrapeUnavailable';
  }
}

export async function fetchPage(
  url: string,
  opts: { extract?: boolean; useBrowser?: boolean } = {},
): Promise<ScrapedPage> {
  const res = await appFetch('/api/scrape/page', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, extract: opts.extract === true, useBrowser: opts.useBrowser === true }),
  });

  const body = await res.text();
  let json: any = null;
  try { json = JSON.parse(body); } catch { /* handled below */ }

  if (!res.ok) {
    throw new ScrapeUnavailable(
      json?.error ?? `Could not read that page (${res.status})`,
      json?.configured !== false,
    );
  }
  return json as ScrapedPage;
}

// ─── summarising ─────────────────────────────────────────────────────────────

export interface PageSummary {
  fees: string[];
  timings: string[];
  closed: string[];
  /** One paragraph suitable for text-to-speech, or '' if nothing was found. */
  spoken: string;
}

/** Turns markdown into plain prose a speech engine will not stumble over. */
function despoil(line: string): string {
  return line
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')        // images
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')      // links → their text
    .replace(/[*_`>#|]+/g, ' ')                   // markdown punctuation
    .replace(/\s+/g, ' ')
    .trim();
}

const FEE = /(₹|\bRs\.?\b|\bINR\b|entry fee|ticket price|admission fee)/i;
const TIME = /(\b\d{1,2}[:.]\d{2}\s*(a\.?m\.?|p\.?m\.?)|sunrise|sunset|\bopen(?:s|ing)?\b[^.]{0,40}\d)/i;
const CLOSED = /(closed on|closed every|remains closed|weekly holiday)/i;

/** Drops navigation, cookie banners and other page furniture. */
const NOISE = /(cookie|privacy policy|terms of use|sign in|log in|newsletter|copyright|all rights reserved|skip to)/i;

function collect(lines: string[], pattern: RegExp, limit: number): string[] {
  const out: string[] = [];
  const seen = new Set<string>();

  for (const raw of lines) {
    const line = despoil(raw);
    if (line.length < 6 || line.length > 200) continue;
    if (NOISE.test(line)) continue;
    if (!pattern.test(line)) continue;

    const key = line.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    // Trim trailing punctuation: these get joined with ". ", and a line that
    // already ends in a full stop otherwise reads as ".." to a speech engine.
    out.push(line.replace(/[.;,:\s]+$/, ''));
    if (out.length >= limit) break;
  }
  return out;
}

export function summarisePage(markdown: string): PageSummary {
  const lines = (markdown ?? '').split('\n');

  const fees    = collect(lines, FEE, 3);
  const timings = collect(lines, TIME, 2);
  const closed  = collect(lines, CLOSED, 1);

  const parts: string[] = [];
  if (fees.length)    parts.push(`Ticket prices: ${fees.join('. ')}`);
  if (timings.length) parts.push(`Opening hours: ${timings.join('. ')}`);
  if (closed.length)  parts.push(closed.join('. '));

  return {
    fees,
    timings,
    closed,
    spoken: parts.join('. '),
  };
}
