/**
 * Streaming speech recognition over Sarvam's realtime WebSocket.
 *
 * The REST path costs a full round trip *after* the speaker stops: upload the
 * whole clip, transcribe, then translate. Streaming overlaps all of that with
 * the speaking itself, and `mode: 'translate'` collapses transcribe+translate
 * into one pass, so the only work left after the last syllable is TTS.
 *
 * Browsers cannot set headers on a WebSocket handshake, so the key rides in the
 * subprotocol, which Sarvam accepts and echoes back.
 */

import { getSettings } from './settingsStore';
import { appFetch } from './http';

const WS_BASE = 'wss://api.sarvam.ai/speech-to-text-realtime/ws';

/** Must match TICKET_PROTOCOL_PREFIX in worker/src/index.ts. */
const RELAY_TICKET_PROTOCOL = 'relay-ticket.';

/** 16 kHz mono is what the model wants; asking the AudioContext for that rate
 *  lets the browser resample natively instead of us doing it in JS. */
const SAMPLE_RATE = 16000;

/** Batch ~100 ms per frame: small enough to stay responsive, large enough to
 *  avoid flooding the socket with 8 ms packets. */
const FRAME_SAMPLES = 1600;

/** ~12 level updates a second is plenty for a meter and cheap for React. */
const LEVEL_INTERVAL_MS = 80;

const WORKLET_SRC = `
class PcmTap extends AudioWorkletProcessor {
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch && ch.length) this.port.postMessage(new Float32Array(ch));
    return true;
  }
}
registerProcessor('pcm-tap', PcmTap);
`;

export type RealtimeMode = 'transcribe' | 'translate';

/** What `language_code=auto` reports back about an utterance. */
export interface DetectedLanguage {
  /** e.g. "hi-IN". Absent when the session pinned a language. */
  language?: string;
  /** 0-1. Absent on partials, and when the session pinned a language. */
  confidence?: number;
}

export interface RealtimeCallbacks {
  /** Interim text — replaces the previous partial. */
  onPartial?: (text: string) => void;
  /**
   * A settled utterance. `language` and `confidence` are only populated when
   * the session was opened with `languageCode: 'auto'`.
   */
  onFinal?: (text: string, detected?: DetectedLanguage) => void;
  onSpeechStart?: () => void;
  onSpeechEnd?: () => void;
  onLevel?: (level: number) => void;
  onOpen?: () => void;
  onClose?: (reason?: string) => void;
  onError?: (err: Error) => void;
}

export interface RealtimeConfig extends RealtimeCallbacks {
  /**
   * Cloudflare Worker relay (wss://…/ws) that injects the key server-side.
   * When set, no credential is sent from the browser and `apiKey` is ignored.
   */
  relayUrl?: string | null;
  /** Only needed when connecting straight to Sarvam without a relay. */
  apiKey?: string;
  /** BCP-47 code, or 'auto' to let the model detect. */
  languageCode: string;
  mode?: RealtimeMode;
  model?: string;
  /** 'fast' trades a little accuracy for the lowest time-to-first-token. */
  streamType?: 'fast' | 'balanced';
  silenceDurationMs?: number;
}

function int16ToBase64(pcm: Int16Array): string {
  const bytes = new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

function floatToInt16(f: Float32Array): Int16Array {
  const out = new Int16Array(f.length);
  for (let i = 0; i < f.length; i++) {
    const s = Math.max(-1, Math.min(1, f[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

export class RealtimeSession {
  private ws: WebSocket | null = null;
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private node: AudioWorkletNode | ScriptProcessorNode | null = null;
  private srcNode: MediaStreamAudioSourceNode | null = null;

  /**
   * Preallocated accumulator. A plain number[] with per-sample push and
   * splice(0, FRAME_SAMPLES) meant ~16k boxed pushes and an O(n) shift every
   * frame, on the one path that must never stall.
   */
  private readonly pending = new Float32Array(FRAME_SAMPLES);
  private pendingCount = 0;

  private queue: string[] = [];      // frames captured before the socket opened

  /** Level updates are throttled to this interval to spare React re-renders. */
  private lastLevelAt = 0;
  private open = false;
  private closed = false;

  constructor(private cfg: RealtimeConfig) {}

  get isOpen() { return this.open; }

  async start(): Promise<void> {
    const s = getSettings();
    const {
      relayUrl, apiKey, languageCode, mode = 'translate',
      model = s.realtimeModel,
      streamType = s.streamType,
      silenceDurationMs = s.silenceMs,
    } = this.cfg;

    if (!relayUrl && !apiKey) {
      throw new Error('Streaming needs either a relay URL or a personal key');
    }

    const qs = new URLSearchParams({
      language_code: languageCode,
      model,
      mode,
      stream_type: streamType,
      endpointing: 'vad',
      encoding: 'linear16',
      sample_rate: String(SAMPLE_RATE),
      silence_duration_ms: String(silenceDurationMs),
    });

    await this.startMic();
    if (this.closed) return;

    if (relayUrl) {
      // The relay attaches the Sarvam key itself, but it still has to know the
      // caller is signed in — our session cookie is HttpOnly and SameSite=Strict,
      // so it never reaches the Worker's origin. Trade it for a 60-second
      // relay-scoped ticket and offer that as a subprotocol.
      const ticket = await this.fetchRelayTicket();
      if (this.closed) return;
      this.ws = new WebSocket(
        `${relayUrl}?${qs}`,
        [`${RELAY_TICKET_PROTOCOL}${ticket}`],
      );
    } else {
      // Direct: a browser cannot set headers on a handshake, so the key rides
      // in the subprotocol, which Sarvam accepts and echoes back.
      this.ws = new WebSocket(`${WS_BASE}?${qs}`, [`api-subscription-key.${apiKey}`]);
    }

    this.ws.onopen = () => {
      this.open = true;
      for (const frame of this.queue) this.sendFrame(frame);
      this.queue = [];
      this.cfg.onOpen?.();
    };

    this.ws.onmessage = (ev) => this.handleMessage(ev);

    this.ws.onerror = () => {
      this.cfg.onError?.(new Error('Realtime connection failed'));
    };

    this.ws.onclose = (ev) => {
      this.open = false;
      this.cfg.onClose?.(ev.reason || undefined);
    };
  }

  private handleMessage(ev: MessageEvent) {
    let msg: any;
    try { msg = JSON.parse(typeof ev.data === 'string' ? ev.data : ''); }
    catch { return; }
    if (!msg) return;

    const kind = msg.event ?? msg.type ?? '';
    // Field naming varies across event types; check the plausible spots. Only
    // strings are accepted — with return_timestamps the transcript can arrive
    // as an object, which would otherwise be handed to React and to translate().
    const candidate =
      msg.transcript ??
      msg.data?.transcript ??
      msg.text ??
      msg.data?.text ??
      '';
    const text = typeof candidate === 'string' ? candidate : '';
    // The field is `language`, not `language_code` — verified against
    // docs.sarvam.ai. Reading the wrong name meant auto-detection could never
    // have worked even once it was switched on. The older spellings are kept
    // as fallbacks only because this payload shape is not versioned.
    const detected: DetectedLanguage = {
      language:
        msg.language ??
        msg.data?.language ??
        msg.language_code ??
        msg.data?.language_code,
      confidence:
        typeof msg.language_confidence === 'number'
          ? msg.language_confidence
          : typeof msg.data?.language_confidence === 'number'
            ? msg.data.language_confidence
            : undefined,
    };

    switch (kind) {
      case 'transcript.partial':
        if (text) this.cfg.onPartial?.(text);
        break;
      case 'transcript.final':
        if (text) this.cfg.onFinal?.(text, detected);
        break;
      case 'vad.speech_start':
        this.cfg.onSpeechStart?.();
        break;
      case 'vad.speech_end':
        this.cfg.onSpeechEnd?.();
        break;
      case 'error':
        this.cfg.onError?.(new Error(msg.message ?? msg.error ?? 'Realtime error'));
        break;
      default:
        // Unknown event carrying text still counts as a final result.
        if (text && /final/i.test(kind)) this.cfg.onFinal?.(text, detected);
    }
  }

  private async startMic(): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
      },
    });
    if (this.closed) { this.stopMic(); return; }

    const Ctor = window.AudioContext ?? (window as any).webkitAudioContext;
    // Requesting 16 kHz makes the browser resample for us.
    this.ctx = new Ctor({ sampleRate: SAMPLE_RATE });
    if (this.ctx!.state === 'suspended') await this.ctx!.resume();

    this.srcNode = this.ctx!.createMediaStreamSource(this.stream);

    const onSamples = (chunk: Float32Array) => {
      let peak = 0;

      for (let i = 0; i < chunk.length; i++) {
        const a = chunk[i] < 0 ? -chunk[i] : chunk[i];
        if (a > peak) peak = a;

        this.pending[this.pendingCount++] = chunk[i];

        if (this.pendingCount === FRAME_SAMPLES) {
          const b64 = int16ToBase64(floatToInt16(this.pending));
          this.pendingCount = 0;
          if (this.open) this.sendFrame(b64);
          else if (this.queue.length < 60) this.queue.push(b64);
        }
      }

      // An AudioWorklet fires ~125×/s; forwarding every one drove a React
      // setState per callback and re-rendered the whole transcript.
      const now = Date.now();
      if (now - this.lastLevelAt >= LEVEL_INTERVAL_MS) {
        this.lastLevelAt = now;
        this.cfg.onLevel?.(Math.min(1, peak * 1.8));
      }
    };

    let usedWorklet = false;
    if (this.ctx!.audioWorklet) {
      try {
        const url = URL.createObjectURL(
          new Blob([WORKLET_SRC], { type: 'application/javascript' }),
        );
        await this.ctx!.audioWorklet.addModule(url);
        URL.revokeObjectURL(url);
        const wn = new AudioWorkletNode(this.ctx!, 'pcm-tap');
        wn.port.onmessage = (e) => onSamples(e.data as Float32Array);
        this.srcNode.connect(wn);
        // Worklets need a sink to be pulled; a muted gain keeps it silent.
        const mute = this.ctx!.createGain();
        mute.gain.value = 0;
        wn.connect(mute).connect(this.ctx!.destination);
        this.node = wn;
        usedWorklet = true;
      } catch {
        usedWorklet = false;
      }
    }

    if (!usedWorklet) {
      const sp = this.ctx!.createScriptProcessor(4096, 1, 1);
      sp.onaudioprocess = (e) => onSamples(new Float32Array(e.inputBuffer.getChannelData(0)));
      this.srcNode.connect(sp);
      const mute = this.ctx!.createGain();
      mute.gain.value = 0;
      sp.connect(mute).connect(this.ctx!.destination);
      this.node = sp;
    }
  }

  /** Exchanges the session cookie for a short-lived relay-scoped ticket. */
  private async fetchRelayTicket(): Promise<string> {
    const res = await appFetch('/api/auth/relay-ticket', { method: 'POST' });
    if (!res.ok) {
      const detail = await res.json().catch(() => null);
      throw new Error(detail?.error ?? `Could not authorise streaming (${res.status})`);
    }
    const json = await res.json();
    if (typeof json?.ticket !== 'string' || !json.ticket) {
      throw new Error('Relay ticket was missing from the response');
    }
    return json.ticket;
  }

  private sendFrame(audio: string) {
    try {
      this.ws?.send(JSON.stringify({ event: 'audio_input', audio }));
    } catch { /* socket closing */ }
  }

  private stopMic() {
    try { this.node?.disconnect(); } catch {}
    try { this.srcNode?.disconnect(); } catch {}
    this.stream?.getTracks().forEach((t) => t.stop());
    this.ctx?.close().catch(() => {});
    this.node = null;
    this.srcNode = null;
    this.stream = null;
    this.ctx = null;
  }

  stop() {
    this.closed = true;
    this.open = false;
    this.stopMic();
    try { this.ws?.close(); } catch {}
    this.ws = null;
  }
}
