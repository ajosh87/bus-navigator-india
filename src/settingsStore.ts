import { useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * App settings live in a module-level store rather than React context, because
 * `api.ts` and `realtime.ts` are plain modules that need to read them without
 * every caller threading options through.
 */

const STORAGE_KEY = '@settings';

export type TtsModel      = 'bulbul:v3' | 'bulbul:v2';
export type SttModel      = 'saaras:v3' | 'saaras:v2.5';
export type RealtimeModel = 'saaras:v3-realtime' | 'saaras:v4-realtime';
export type StreamType    = 'fast' | 'balanced';

export interface Settings {
  // Voice output
  ttsModel: TtsModel;
  ttsSpeaker: string;
  ttsPace: number;

  // Speech recognition
  sttModel: SttModel;
  realtimeModel: RealtimeModel;
  streamType: StreamType;
  /** Silence that ends a spoken turn, in ms. */
  silenceMs: number;

  // Translation
  enablePreprocessing: boolean;

  // Behaviour
  narrateSteps: boolean;
  autoSpeakTranslation: boolean;
  showQrCaveats: boolean;
}

/**
 * Speaker names are tied to the model version — a v2 name on v3 is rejected,
 * which is how the original bulbul:v1 + anushka pairing broke silently.
 */
export const SPEAKERS: Record<TtsModel, string[]> = {
  'bulbul:v3': [
    'shubh', 'aditya', 'ritu', 'priya', 'neha', 'rahul',
    'pooja', 'rohan', 'simran', 'kavya', 'amit', 'dev', 'ishita',
  ],
  'bulbul:v2': [
    'anushka', 'manisha', 'vidya', 'arya', 'abhilash', 'karun', 'hitesh',
  ],
};

export const DEFAULTS: Settings = {
  ttsModel: 'bulbul:v3',
  ttsSpeaker: 'shubh',
  ttsPace: 1.0,

  sttModel: 'saaras:v3',
  realtimeModel: 'saaras:v3-realtime',
  streamType: 'fast',
  silenceMs: 700,

  enablePreprocessing: true,

  narrateSteps: true,
  autoSpeakTranslation: true,
  showQrCaveats: true,
};

let current: Settings = { ...DEFAULTS };
let loaded = false;
const listeners = new Set<() => void>();

function emit() {
  for (const fn of listeners) fn();
}

/** Synchronous read for non-React modules. */
export function getSettings(): Settings {
  return current;
}

export async function loadSettings(): Promise<Settings> {
  if (loaded) return current;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      current = coerce({ ...DEFAULTS, ...parsed });
    }
  } catch { /* fall back to defaults */ }
  loaded = true;
  emit();
  return current;
}

export async function patchSettings(patch: Partial<Settings>): Promise<void> {
  current = coerce({ ...current, ...patch });
  emit();
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch { /* storage unavailable; keep the in-memory value */ }
}

export async function resetSettings(): Promise<void> {
  current = { ...DEFAULTS };
  emit();
  await AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
}

/** Keeps invariants that the UI could otherwise violate. */
function coerce(s: Settings): Settings {
  const speakers = SPEAKERS[s.ttsModel] ?? SPEAKERS['bulbul:v3'];
  return {
    ...s,
    // A speaker from the other model version would be rejected by the API.
    ttsSpeaker: speakers.includes(s.ttsSpeaker) ? s.ttsSpeaker : speakers[0],
    ttsPace: Math.min(2, Math.max(0.5, Number(s.ttsPace) || 1)),
    silenceMs: Math.min(2000, Math.max(300, Math.round(Number(s.silenceMs) || 700))),
  };
}

/**
 * Hoisted so its identity is stable. An inline arrow here would be a new
 * function every render, and useSyncExternalStore resubscribes whenever the
 * subscribe identity changes.
 */
function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => { listeners.delete(onChange); };
}

export function useSettings(): Settings {
  return useSyncExternalStore(subscribe, getSettings, getSettings);
}
