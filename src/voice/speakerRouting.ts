/**
 * Works out who just spoke, from the language they spoke in.
 *
 * Sarvam's realtime socket has no speaker diarization — that exists only on the
 * batch API (verified against docs.sarvam.ai, September 2026). But it does
 * support `language_code=auto`, and it reports the detected language on every
 * final transcript. In a two-person conversation where the whole premise is
 * that the parties speak *different* languages, the detected language is a
 * better speaker label than acoustic diarization would be: it survives a noisy
 * bus station, two similar voices, and a phone lying between them.
 *
 * Where it cannot work — both parties sharing a language, an unconfident
 * detection, a third language — it says so instead of guessing, and the caller
 * keeps the previous speaker. Silently mis-attributing a turn is worse than
 * admitting uncertainty: it translates into the wrong language and plays the
 * result at the wrong person.
 *
 * Pure, so every branch below is unit-tested.
 */

export type Side = 'mine' | 'local';

export type AttributionReason =
  /** The detected language matched exactly one party. */
  | 'matched'
  /** Both parties speak this language, so it identifies nobody. */
  | 'shared-language'
  /** The model was not sure enough to act on. */
  | 'low-confidence'
  /** Detected a language neither party is speaking. */
  | 'unknown-language'
  /** No language came back at all. */
  | 'undetected';

export interface Attribution {
  side: Side;
  reason: AttributionReason;
  /** False when `side` is carried over rather than actually determined. */
  confident: boolean;
  /** Normalised detection, for display. */
  language?: string;
}

/**
 * Below this, a detection is treated as no detection.
 *
 * Short interjections — "haan", "kitna?", "theek" — are exactly where language
 * ID is weakest and also where a wrong answer is most disruptive, because they
 * arrive mid-exchange.
 */
export const DEFAULT_MIN_CONFIDENCE = 0.6;

/**
 * Normalises a language tag to the `xx-IN` form the app uses elsewhere.
 *
 * The docs list `auto` alongside BCP-47 codes but do not state which form the
 * detected `language` field takes, so both a bare `hi` and a full `hi-IN` are
 * accepted rather than assuming one and silently matching nothing.
 */
export function normaliseLang(code?: string | null): string | undefined {
  if (!code) return undefined;
  const raw = code.trim().toLowerCase();
  if (!raw || raw === 'auto' || raw === 'unknown') return undefined;

  const base = raw.split(/[-_]/)[0];
  if (!base) return undefined;

  const region = raw.includes('-') || raw.includes('_')
    ? raw.split(/[-_]/)[1]
    : 'in';

  return `${base}-${region.toUpperCase()}`;
}

/** Same language, ignoring region: "hi" and "hi-IN" are one language. */
export function sameLanguage(a?: string, b?: string): boolean {
  const na = normaliseLang(a);
  const nb = normaliseLang(b);
  if (!na || !nb) return false;
  return na.split('-')[0] === nb.split('-')[0];
}

export interface AttributionInput {
  /** The `language` field from transcript.final. */
  detected?: string | null;
  /** The `language_confidence` field, 0–1. Absent is treated as acceptable. */
  confidence?: number | null;
  /** BCP-47 code for the language the app's owner speaks. */
  mineCode: string;
  /** BCP-47 code for the other party. */
  localCode: string;
  /** Who spoke last; used whenever the detection cannot decide. */
  lastSide: Side;
  minConfidence?: number;
}

export function attributeSpeaker(input: AttributionInput): Attribution {
  const {
    detected, confidence, mineCode, localCode, lastSide,
    minConfidence = DEFAULT_MIN_CONFIDENCE,
  } = input;

  const language = normaliseLang(detected);

  // Checked before the detection is even looked at: when both parties share a
  // language, no detector can tell them apart, and pretending otherwise would
  // flip the direction on every other turn.
  if (sameLanguage(mineCode, localCode)) {
    return { side: lastSide, reason: 'shared-language', confident: false, language };
  }

  if (!language) {
    return { side: lastSide, reason: 'undetected', confident: false };
  }

  if (typeof confidence === 'number' && confidence < minConfidence) {
    return { side: lastSide, reason: 'low-confidence', confident: false, language };
  }

  if (sameLanguage(language, mineCode)) {
    return { side: 'mine', reason: 'matched', confident: true, language };
  }
  if (sameLanguage(language, localCode)) {
    return { side: 'local', reason: 'matched', confident: true, language };
  }

  return { side: lastSide, reason: 'unknown-language', confident: false, language };
}

/**
 * Whether automatic attribution can work for this language pair at all.
 *
 * The UI uses this to fall back to the manual toggle rather than offering a
 * switch that cannot do anything.
 */
export function canAutoDetect(mineCode: string, localCode: string): boolean {
  return !sameLanguage(mineCode, localCode);
}

/** A short note for the turn, explaining any attribution that was not certain. */
export function explainAttribution(a: Attribution, langName?: string): string | undefined {
  switch (a.reason) {
    case 'matched':
      return undefined;
    case 'shared-language':
      return 'Both sides speak the same language — tap to say who is talking.';
    case 'low-confidence':
      return 'Not sure who said that — tap to correct it.';
    case 'unknown-language':
      return langName
        ? `That sounded like ${langName}, which neither of you selected.`
        : 'That was not a language either of you selected.';
    case 'undetected':
      return 'Could not tell the language of that.';
  }
}
