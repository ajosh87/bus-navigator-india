// Web recorder with voice-activity detection.
//
// Manually tapping "stop" is often the single biggest chunk of perceived latency
// in a speech round trip, so this endpoints automatically: once it has heard
// speech, a short run of silence ends the turn. The mic stream is also kept warm
// between turns — re-acquiring it costs a few hundred ms every time.
import { useCallback, useEffect, useRef, useState } from 'react';

export type RecordState = 'idle' | 'recording' | 'processing';

export interface AudioResult {
  uri: string;
  mimeType: string;
  /** Milliseconds of audio captured. */
  durationMs: number;
  /** True when VAD ended the turn rather than an explicit stop. */
  auto: boolean;
}

export interface ListenOptions {
  /** Silence needed to end a turn, after speech has been heard. */
  silenceMs?: number;
  /** Give up if no speech is heard at all. */
  noSpeechMs?: number;
  /** Hard cap on a single turn. */
  maxMs?: number;
  /** Disable endpointing and wait for an explicit stop(). */
  manual?: boolean;
}

export interface RecorderHook {
  recordState: RecordState;
  /** Live input level, 0–1, for meters and waveforms. */
  level: number;
  /** True once VAD has actually heard speech this turn. */
  heardSpeech: boolean;
  listen: (opts?: ListenOptions) => Promise<AudioResult | null>;
  stop: () => void;
  cancel: () => void;
  toggleRecording: () => Promise<AudioResult | null>;
  /** Warm the mic so the first turn isn't slower than the rest. */
  prewarm: () => Promise<boolean>;
}

const SPEECH_ON  = 0.022;   // RMS to count as speech
const SPEECH_OFF = 0.012;   // hysteresis, avoids chattering on trailing consonants

/**
 * The VAD loop runs every animation frame, but publishing the level that often
 * means a React re-render per frame in whichever screen is listening. ~12/s is
 * indistinguishable on a meter and far cheaper.
 */
const LEVEL_INTERVAL_MS = 80;

function pickMime(): string {
  const prefs = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/mp4',
  ];
  for (const m of prefs) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) return m;
  }
  return '';
}

export function useRecorder(): RecorderHook {
  const [recordState, setState] = useState<RecordState>('idle');
  const [level, setLevel]       = useState(0);
  const [heardSpeech, setHeard] = useState(false);

  const stream   = useRef<MediaStream | null>(null);
  const ctx      = useRef<AudioContext | null>(null);
  const analyser = useRef<AnalyserNode | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks   = useRef<Blob[]>([]);
  const raf      = useRef<number | null>(null);
  const finish   = useRef<((r: AudioResult | null) => void) | null>(null);
  const cancelled = useRef(false);
  // Guarding on `recordState` would read a stale value when listen() is called
  // back-to-back in a conversation loop, so track it in a ref instead.
  const busy = useRef(false);

  const getStream = useCallback(async (): Promise<MediaStream | null> => {
    if (stream.current?.active) return stream.current;
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      });
      stream.current = s;

      const Ctor = window.AudioContext ?? (window as any).webkitAudioContext;
      const c = new Ctor();
      const src = c.createMediaStreamSource(s);
      const an = c.createAnalyser();
      an.fftSize = 1024;
      an.smoothingTimeConstant = 0.25;
      src.connect(an);
      ctx.current = c;
      analyser.current = an;
      return s;
    } catch {
      return null;
    }
  }, []);

  const prewarm = useCallback(async () => !!(await getStream()), [getStream]);

  const teardownLoop = () => {
    if (raf.current !== null) {
      cancelAnimationFrame(raf.current);
      raf.current = null;
    }
  };

  const stop = useCallback(() => {
    teardownLoop();
    const mr = recorder.current;
    if (mr && mr.state !== 'inactive') mr.stop();
  }, []);

  const cancel = useCallback(() => {
    cancelled.current = true;
    stop();
  }, [stop]);

  const listen = useCallback(
    async (opts: ListenOptions = {}): Promise<AudioResult | null> => {
      const {
        silenceMs = 850,
        noSpeechMs = 7000,
        maxMs = 20000,
        manual = false,
      } = opts;

      if (busy.current) return null;
      busy.current = true;

      const s = await getStream();
      if (!s) { busy.current = false; return null; }

      // A suspended context yields an all-zero analyser, which reads as silence.
      if (ctx.current?.state === 'suspended') {
        try { await ctx.current.resume(); } catch {}
      }

      cancelled.current = false;
      setHeard(false);
      chunks.current = [];

      const mime = pickMime();
      const mr = new MediaRecorder(s, mime ? { mimeType: mime } : undefined);
      recorder.current = mr;
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunks.current.push(e.data); };

      const startedAt = Date.now();
      let speech = false;
      let quietSince: number | null = null;
      let autoStopped = false;

      const done = new Promise<AudioResult | null>((resolve) => {
        finish.current = resolve;
        mr.onstop = () => {
          teardownLoop();
          setState('idle');
          setLevel(0);
          recorder.current = null;
          busy.current = false;

          if (cancelled.current) { resolve(null); return; }

          const type = mr.mimeType || mime || 'audio/webm';
          const blob = new Blob(chunks.current, { type });
          if (blob.size < 1200) { resolve(null); return; }   // effectively empty

          resolve({
            uri: URL.createObjectURL(blob),
            mimeType: type,
            durationMs: Date.now() - startedAt,
            auto: autoStopped,
          });
        };
      });

      mr.start(100);           // 100ms timeslice keeps chunks flowing
      setState('recording');

      const an = analyser.current!;
      const buf = new Float32Array(an.fftSize);
      let lastLevelAt = 0;

      const tick = () => {
        if (!recorder.current || recorder.current.state === 'inactive') return;

        an.getFloatTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
        const rms = Math.sqrt(sum / buf.length);

        const now = Date.now();
        const elapsed = now - startedAt;

        if (now - lastLevelAt >= LEVEL_INTERVAL_MS) {
          lastLevelAt = now;
          setLevel(Math.min(1, rms * 12));
        }

        if (!manual) {
          if (!speech && rms > SPEECH_ON) {
            speech = true;
            setHeard(true);
          }

          if (speech) {
            if (rms < SPEECH_OFF) {
              quietSince ??= now;
              if (now - quietSince >= silenceMs) {
                autoStopped = true;
                stop();
                return;
              }
            } else {
              quietSince = null;
            }
          } else if (elapsed > noSpeechMs) {
            autoStopped = true;
            cancelled.current = true;   // nothing was said; discard
            stop();
            return;
          }
        }

        if (elapsed > maxMs) {
          autoStopped = true;
          stop();
          return;
        }

        raf.current = requestAnimationFrame(tick);
      };
      raf.current = requestAnimationFrame(tick);

      return done;
    },
    [getStream, stop],
  );

  /** Back-compat: first call starts a manual turn, second ends it. */
  const toggleRecording = useCallback(async (): Promise<AudioResult | null> => {
    if (busy.current) { stop(); return null; }
    return listen();
  }, [listen, stop]);

  useEffect(() => {
    return () => {
      teardownLoop();
      recorder.current?.state !== 'inactive' && recorder.current?.stop();
      stream.current?.getTracks().forEach((t) => t.stop());
      ctx.current?.close().catch(() => {});
    };
  }, []);

  return { recordState, level, heardSpeech, listen, stop, cancel, toggleRecording, prewarm };
}
