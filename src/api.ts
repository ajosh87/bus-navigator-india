import { Platform } from 'react-native';

import { getSettings } from './settingsStore';
import { appFetch } from './http';

/**
 * Requests go to our own /api/sarvam proxy, which holds the Sarvam key
 * server-side and requires a signed-in session. Nothing here carries a
 * credential of its own — the `personalKey` arguments below are an opt-in
 * override for callers who would rather spend their own quota, and are simply
 * forwarded for the proxy to prefer.
 */
const BASE = '/api/sarvam';

const BMTC = 'https://bmtcmobileapistaging.amnex.com/WebAPI/SearchRoute_v2';


// ─── helpers ──────────────────────────────────────────────────────────────────

function authHeaders(personalKey?: string): Record<string, string> {
  return personalKey ? { 'x-user-key': personalKey } : {};
}

function onExpoDevServer(): boolean {
  return (
    Platform.OS === 'web' &&
    typeof location !== 'undefined' &&
    ['localhost', '127.0.0.1', '0.0.0.0'].includes(location.hostname)
  );
}

/**
 * Reads a response body exactly once, then either throws a legible error or
 * returns the parsed JSON.
 *
 * Doing this in one place matters: the Expo dev server has no serverless
 * functions, so /api/sarvam/* falls through to the SPA and returns index.html
 * with a 200. Calling res.json() on that produced a bare "unexpected token"
 * parse error that said nothing about the real problem.
 */
async function parseResponse(res: Response, label: string): Promise<any> {
  const body = await res.text().catch(() => '');

  if (!res.ok) {
    // Our proxy answers with {"error": "<sentence>"}; Sarvam nests its own
    // under {"error": {"message": …}}. Either reads better than a status code.
    let message: string | null = null;
    try {
      const parsed = JSON.parse(body);
      message =
        typeof parsed?.error === 'string'          ? parsed.error :
        typeof parsed?.error?.message === 'string' ? parsed.error.message :
        null;
    } catch { /* not JSON */ }
    throw new Error(message ?? `HTTP ${res.status}: ${body.slice(0, 160)}`);
  }

  try {
    return JSON.parse(body);
  } catch {
    if (/^\s*<(!doctype|html)/i.test(body)) {
      throw new Error(
        onExpoDevServer()
          ? `${label} reached the Expo dev server, which cannot run /api. Start the backend too: npm run dev:full`
          : `${label} got an HTML page instead of JSON — the /api route is not being served.`,
      );
    }
    throw new Error(`${label} returned an unreadable response: ${body.slice(0, 80)}`);
  }
}

// ─── Sarvam Vision 1.5 ───────────────────────────────────────────────────────

export async function digitise(imageUri: string, personalKey?: string): Promise<string> {
  const form = new FormData();

  if (Platform.OS === 'web') {
    // expo-camera returns a data URL on web; fetch it as a blob
    const fetchRes = await fetch(imageUri);
    const blob = await fetchRes.blob();
    form.append('file', blob, 'capture.jpg');
  } else {
    form.append('file', { uri: imageUri, type: 'image/jpeg', name: 'capture.jpg' } as any);
  }

  const res = await appFetch(`${BASE}/digitise`, {
    method: 'POST',
    headers: authHeaders(personalKey),
    body: form,
  });
  const json = await parseResponse(res, 'Signboard scan');
  return (json.text ?? json.extracted_text ?? json.digitised_text ?? '') as string;
}

// ─── Sarvam Mayura v1 ────────────────────────────────────────────────────────

export async function translate(
  text: string, source: string, target: string, personalKey?: string,
): Promise<string> {
  const res = await appFetch(`${BASE}/translate`, {
    method: 'POST',
    headers: { ...authHeaders(personalKey), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      input: text,
      source_language_code: source,
      target_language_code: target,
      model: 'mayura:v1',
      enable_preprocessing: getSettings().enablePreprocessing,
    }),
  });
  const json = await parseResponse(res, 'Translation');
  return (json.translated_text ?? '') as string;
}

// ─── Sarvam Saaras v3 (STT) ──────────────────────────────────────────────────

export interface Transcription {
  transcript: string;
  /** Only set when `languageCode` was AUTO_DETECT_REST. */
  language?: string;
  /** 0-1. Only set when the language was detected rather than given. */
  confidence?: number;
}

/** Transcribe, and report what language it decided the audio was in. */
export async function transcribe(
  audioUri: string,    // native: file URI  |  web: blob object URL
  mimeType: string,    // 'audio/wav' on native, 'audio/webm' on web
  languageCode: string,
  personalKey?: string,
): Promise<Transcription> {
  const form = new FormData();

  if (Platform.OS === 'web') {
    const fetchRes = await fetch(audioUri);
    const blob = await fetchRes.blob();
    form.append('file', blob, 'recording.webm');
  } else {
    form.append('file', { uri: audioUri, type: mimeType, name: 'recording.wav' } as any);
  }

  form.append('model', getSettings().sttModel);
  form.append('language_code', languageCode);

  const res = await appFetch(`${BASE}/speech-to-text`, {
    method: 'POST',
    headers: authHeaders(personalKey),
    body: form,
  });
  const json = await parseResponse(res, 'Speech recognition');
  return {
    transcript: (json.transcript ?? '') as string,
    // Populated when `language_code` was AUTO_DETECT_REST. Note the field
    // names differ from the realtime socket, which returns `language` and
    // `language_confidence` — the two Sarvam APIs disagree, so neither set of
    // names can be assumed from the other.
    language: (json.language_code ?? undefined) as string | undefined,
    confidence: typeof json.language_probability === 'number'
      ? json.language_probability
      : undefined,
  };
}

/** Transcript only, for the callers that already know the language. */
export async function speechToText(
  audioUri: string,
  mimeType: string,
  languageCode: string,
  personalKey?: string,
): Promise<string> {
  const { transcript } = await transcribe(audioUri, mimeType, languageCode, personalKey);
  return transcript;
}

/**
 * Ask the REST recogniser to identify the language itself.
 *
 * Deliberately *not* the same token as the realtime socket, which wants
 * `'auto'`. Sending the wrong one is accepted as a literal language code and
 * fails in a way that looks like a recognition problem.
 */
export const AUTO_DETECT_REST = 'unknown';

// ─── Sarvam Bulbul (TTS) ─────────────────────────────────────────────────────

/** Returns base64 audio without playing it, so callers can prefetch and cache. */
export async function synthesize(
  text: string, targetLangCode: string, personalKey?: string,
): Promise<string> {
  const s = getSettings();
  const res = await appFetch(`${BASE}/text-to-speech`, {
    method: 'POST',
    headers: { ...authHeaders(personalKey), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      inputs: [text],
      target_language_code: targetLangCode,
      // bulbul:v1 was retired — it returns no audio, which is why playback
      // silently failed. Speakers are version-specific, so the settings store
      // keeps the model and speaker consistent with each other.
      model: s.ttsModel,
      speaker: s.ttsSpeaker,
      pace: s.ttsPace,
      enable_preprocessing: s.enablePreprocessing,
    }),
  });
  const json = await parseResponse(res, 'Speech synthesis');
  return (json.audios?.[0] ?? '') as string;
}

export async function textToSpeech(
  text: string, targetLangCode: string, personalKey?: string,
): Promise<void> {
  const base64Audio = await synthesize(text, targetLangCode, personalKey);
  if (!base64Audio) throw new Error('Sarvam returned no audio');
  await playAudio(base64Audio, `${targetLangCode}:${text}`);
}

/** Plays base64 audio on either platform. Resolves when playback finishes. */
export async function playAudio(base64Audio: string, cacheKey?: string): Promise<void> {
  if (Platform.OS === 'web') {
    const { playBase64 } = require('./audio');
    await playBase64(base64Audio, cacheKey);
    return;
  }

  // Native: expo-file-system + expo-av, required lazily to keep them out of web.
  const FileSystem = require('expo-file-system');
  const { Audio }  = require('expo-av');

  const uri = FileSystem.cacheDirectory + `tts_${Date.now()}.wav`;
  await FileSystem.writeAsStringAsync(uri, base64Audio, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const { sound } = await Audio.Sound.createAsync({ uri }, { shouldPlay: true });
  await new Promise<void>((resolve) => {
    sound.setOnPlaybackStatusUpdate((st: any) => {
      if (st.didJustFinish) { sound.unloadAsync(); resolve(); }
    });
  });
}

// ─── BMTC Amnex ──────────────────────────────────────────────────────────────

export interface RouteResult {
  origin: string;
  dest: string;
  stops: string[];
  fare?: string;
  frequency?: string;
}

export async function searchBmtcRoute(routeNo: string): Promise<RouteResult[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  let res: Response;
  try {
    res = await fetch(BMTC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ routeNo }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
  const json = await parseResponse(res, 'Route lookup');
  const raw: any[] = json.Data ?? json.routes ?? json.data ?? [];

  return raw.map((r) => ({
    origin: r.fromStop ?? r.Origin ?? '—',
    dest:   r.toStop  ?? r.Destination ?? '—',
    stops:  (r.stops ?? r.Stops ?? []).map((s: any) =>
      typeof s === 'string' ? s : (s.StopName ?? s.name ?? String(s))
    ),
  }));
}

