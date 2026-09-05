import { Platform } from 'react-native';

/**
 * Web audio playback.
 *
 * The previous approach — `new Audio('data:audio/wav;base64,…').play()` — failed
 * for two reasons: multi-megabyte data URLs are slow to parse, and `play()` is
 * treated as an autoplay attempt once an `await` has severed it from the user
 * gesture. A single AudioContext, unlocked on first interaction, avoids both and
 * starts playback in a few ms instead of a few hundred.
 */

let ctx: AudioContext | null = null;
let active: AudioBufferSourceNode | null = null;

/** Decoded clips keyed by text+voice, so a repeated phrase replays instantly. */
const cache = new Map<string, AudioBuffer>();
const CACHE_MAX = 24;

export function getContext(): AudioContext | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as any).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  return ctx;
}

/**
 * Resume the context. Must be reached from a real user gesture at least once,
 * or every later `play()` is blocked. Cheap and idempotent — call it freely.
 */
export async function unlockAudio(): Promise<void> {
  const c = getContext();
  if (c && c.state === 'suspended') {
    try { await c.resume(); } catch {}
  }
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function stopPlayback(): void {
  if (active) {
    try { active.stop(); } catch {}
    active = null;
  }
}

export class AudioPlaybackError extends Error {
  constructor(message: string, readonly blocked = false) {
    super(message);
    this.name = 'AudioPlaybackError';
  }
}

/**
 * Play base64 audio. Resolves when playback *finishes* so callers can chain
 * turns in a conversation. Falls back to an <audio> element when the browser
 * cannot decode the buffer directly.
 */
export async function playBase64(b64: string, cacheKey?: string): Promise<void> {
  if (!b64) return;
  const c = getContext();

  // Fallback path: no Web Audio available.
  if (!c) return playViaElement(b64);

  await unlockAudio();
  if (c.state === 'suspended') {
    throw new AudioPlaybackError('Audio is blocked until you tap the page', true);
  }

  let buffer = cacheKey ? cache.get(cacheKey) : undefined;

  if (!buffer) {
    const bytes = base64ToBytes(b64);
    try {
      // decodeAudioData detaches the buffer, so hand it a private copy.
      buffer = await c.decodeAudioData(bytes.buffer.slice(0) as ArrayBuffer);
    } catch {
      return playViaElement(b64);   // unknown container — let the browser try
    }
    if (cacheKey) {
      if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
      cache.set(cacheKey, buffer);
    }
  }

  stopPlayback();

  return new Promise<void>((resolve, reject) => {
    try {
      const src = c.createBufferSource();
      src.buffer = buffer!;
      src.connect(c.destination);
      src.onended = () => { if (active === src) active = null; resolve(); };
      active = src;
      src.start(0);
    } catch (e: any) {
      reject(new AudioPlaybackError(e?.message ?? 'Playback failed'));
    }
  });
}

/** Blob URL beats a data URL: no megabyte-long string for the parser to chew. */
function playViaElement(b64: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let url: string;
    try {
      const bytes = base64ToBytes(b64);
      const ab = new ArrayBuffer(bytes.length);
      new Uint8Array(ab).set(bytes);
      url = URL.createObjectURL(new Blob([ab], { type: 'audio/wav' }));
    } catch (e: any) {
      reject(new AudioPlaybackError('Could not build audio blob'));
      return;
    }

    const el = new Audio(url);
    const done = (err?: Error) => {
      URL.revokeObjectURL(url);
      err ? reject(err) : resolve();
    };
    el.onended = () => done();
    el.onerror = () => done(new AudioPlaybackError('Browser could not decode the audio'));
    el.play().catch((e) =>
      done(
        new AudioPlaybackError(
          e?.name === 'NotAllowedError'
            ? 'Audio is blocked until you tap the page'
            : e?.message ?? 'Playback failed',
          e?.name === 'NotAllowedError',
        ),
      ),
    );
  });
}
