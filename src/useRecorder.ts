// Native recorder (expo-av). Mirrors the web hook's interface; endpointing uses
// expo-av's metering rather than an AnalyserNode.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Audio } from 'expo-av';

export type RecordState = 'idle' | 'recording' | 'processing';

export interface AudioResult {
  uri: string;
  mimeType: string;
  durationMs: number;
  auto: boolean;
}

export interface ListenOptions {
  silenceMs?: number;
  noSpeechMs?: number;
  maxMs?: number;
  manual?: boolean;
}

export interface RecorderHook {
  recordState: RecordState;
  level: number;
  heardSpeech: boolean;
  listen: (opts?: ListenOptions) => Promise<AudioResult | null>;
  stop: () => void;
  cancel: () => void;
  toggleRecording: () => Promise<AudioResult | null>;
  prewarm: () => Promise<boolean>;
}

/** expo-av reports dBFS; map roughly onto the web hook's 0–1 scale. */
const dbToLevel = (db: number) => Math.max(0, Math.min(1, (db + 60) / 60));

const SPEECH_ON  = 0.22;
const SPEECH_OFF = 0.13;

export function useRecorder(): RecorderHook {
  const [recordState, setState] = useState<RecordState>('idle');
  const [level, setLevel]       = useState(0);
  const [heardSpeech, setHeard] = useState(false);

  const rec       = useRef<Audio.Recording | null>(null);
  const stopFlag  = useRef(false);
  const cancelled = useRef(false);
  // Ref rather than state: a conversation loop calls listen() back-to-back and
  // would otherwise read a stale recordState.
  const busy      = useRef(false);

  const prewarm = useCallback(async () => {
    const perm = await Audio.requestPermissionsAsync();
    return perm.granted;
  }, []);

  const stop   = useCallback(() => { stopFlag.current = true; }, []);
  const cancel = useCallback(() => { cancelled.current = true; stopFlag.current = true; }, []);

  const listen = useCallback(
    async (opts: ListenOptions = {}): Promise<AudioResult | null> => {
      const { silenceMs = 850, noSpeechMs = 7000, maxMs = 20000, manual = false } = opts;
      if (busy.current) return null;
      busy.current = true;

      const perm = await Audio.requestPermissionsAsync();
      if (!perm.granted) { busy.current = false; return null; }

      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });

      stopFlag.current = false;
      cancelled.current = false;
      setHeard(false);

      const { recording } = await Audio.Recording.createAsync({
        ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
        isMeteringEnabled: true,
      });
      rec.current = recording;
      setState('recording');

      const startedAt = Date.now();
      let speech = false;
      let quietSince: number | null = null;
      let auto = false;

      // expo-av has no callback stream, so poll the meter.
      await new Promise<void>((resolve) => {
        const iv = setInterval(async () => {
          const st = await recording.getStatusAsync().catch(() => null);
          const now = Date.now();
          const elapsed = now - startedAt;

          if (st?.isRecording && typeof st.metering === 'number') {
            const lv = dbToLevel(st.metering);
            setLevel(lv);

            if (!manual) {
              if (!speech && lv > SPEECH_ON) { speech = true; setHeard(true); }
              if (speech) {
                if (lv < SPEECH_OFF) {
                  quietSince ??= now;
                  if (now - quietSince >= silenceMs) { auto = true; stopFlag.current = true; }
                } else {
                  quietSince = null;
                }
              } else if (elapsed > noSpeechMs) {
                auto = true; cancelled.current = true; stopFlag.current = true;
              }
            }
          }

          if (elapsed > maxMs) { auto = true; stopFlag.current = true; }

          if (stopFlag.current) { clearInterval(iv); resolve(); }
        }, 120);
      });

      setState('processing');
      await recording.stopAndUnloadAsync().catch(() => {});
      const uri = recording.getURI() ?? '';
      rec.current = null;
      setState('idle');
      setLevel(0);
      busy.current = false;

      if (cancelled.current || !uri) return null;
      return { uri, mimeType: 'audio/wav', durationMs: Date.now() - startedAt, auto };
    },
    [],
  );

  const toggleRecording = useCallback(async (): Promise<AudioResult | null> => {
    if (busy.current) { stop(); return null; }
    return listen();
  }, [listen, stop]);

  useEffect(() => () => { rec.current?.stopAndUnloadAsync().catch(() => {}); }, []);

  return { recordState, level, heardSpeech, listen, stop, cancel, toggleRecording, prewarm };
}
