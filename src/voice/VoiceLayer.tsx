import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, type, space, radius, hairline, shadow, CONTENT_MAX_WIDTH } from '../theme';
import { LANGUAGES } from '../languages';
import { useApiKey } from '../ApiKeyContext';
import { translate, speechToText, synthesize, playAudio } from '../api';
import { useRecorder } from '../useRecorder';
import { unlockAudio, stopPlayback } from '../audio';
import { navigationRef } from '../navigationRef';
import { matchIntent, VoiceIntent } from './intents';

/**
 * Global "say what you want" control.
 *
 * Sits above every tab so any feature is reachable by voice, which is the whole
 * point for someone who cannot read the screen. The pipeline is:
 *
 *   speech → Saaras (in their language) → Mayura (to English) → intent match
 *          → navigate → Bulbul (back in their language)
 *
 * Translating to English before matching means one rule set serves all 22
 * languages; see intents.ts.
 */

type Phase = 'idle' | 'listening' | 'thinking' | 'acting';

/** How long a finished result stays on screen before clearing itself. */
const PANEL_LINGER_MS = 7000;

/**
 * Turns transport-level failures into something a traveller can act on.
 * "Failed to fetch" is what fetch() throws when the network is unreachable —
 * accurate, and meaningless to the person holding the phone.
 */
function humanError(e: unknown): string {
  const raw = e instanceof Error ? e.message : typeof e === 'string' ? e : '';

  if (/failed to fetch|network request failed|load failed|networkerror/i.test(raw)) {
    return 'No connection to the server. Check your network and try again.';
  }
  if (/abort|timeout|timed out/i.test(raw)) {
    return 'That took too long. Try again.';
  }
  if (/not signed in|401/i.test(raw)) {
    return 'Your session ended. Sign in again.';
  }
  return raw ? raw.slice(0, 140) : 'Voice command failed.';
}

export function VoiceLayer() {
  const { apiKey, aiEnabled, langPrefs } = useApiKey();
  const { listen, cancel, prewarm } = useRecorder();
  const insets = useSafeAreaInsets();

  const [phase, setPhase] = useState<Phase>('idle');
  const [currentTab, setCurrentTab] = useState<string | null>(null);
  const [heard, setHeard] = useState('');
  const [reply, setReply] = useState('');
  const [error, setError] = useState<string | null>(null);

  const busy = useRef(false);

  const key = apiKey || undefined;
  const langCode = LANGUAGES[langPrefs.mine] ?? 'en-IN';

  // Track the focused tab so the button can stand aside where a screen owns
  // the microphone itself.
  useEffect(() => {
    if (!navigationRef.isReady()) return;
    setCurrentTab(navigationRef.getCurrentRoute()?.name ?? null);
    const unsub = navigationRef.addListener('state', () => {
      setCurrentTab(navigationRef.getCurrentRoute()?.name ?? null);
    });
    return unsub;
  }, []);

  const execute = useCallback((intent: VoiceIntent) => {
    if (!navigationRef.isReady()) return;
    // The container ref is untyped here (no route param list is declared), and
    // its overloads reject a dynamic name/params pair.
    const go = (name: string, params?: object) =>
      (navigationRef.navigate as unknown as (n: string, p?: object) => void)(name, params);

    switch (intent.kind) {
      case 'navigate': go(intent.tab); break;
      case 'route':    go('Routes', { routeNo: intent.routeNo, mode: 'search' }); break;
      case 'map':      go('Routes', { mode: 'map' }); break;
      case 'book':     go('Tickets', { monumentId: intent.monumentId, startBooking: true }); break;
      case 'tickets':  go('Tickets', {}); break;
      // These three used to navigate and stop there, leaving the user on an
      // idle screen having asked for something specific. Each now carries the
      // instruction with it.
      case 'live':     go('Live', { autoStart: true }); break;
      case 'scan':     go('Scan', { openCamera: true, mode: 'signboard' }); break;
      case 'translate': go('Speak', { phrase: intent.phrase }); break;
      // 'help' and 'unknown' are answered by voice alone.
      default: break;
    }
  }, []);

  /** Says a line back in the traveller's own language. */
  const speak = useCallback(async (english: string) => {
    try {
      const text = langCode === 'en-IN'
        ? english
        : await translate(english, 'en-IN', langCode, key);
      const audio = await synthesize(text, langCode, key);
      if (audio) await playAudio(audio, `${langCode}:${text}`);
    } catch {
      /* narration is an aid; a failure here must not break the action */
    }
  }, [langCode, key]);

  const run = useCallback(async () => {
    // Cancelling must be checked before the busy guard. `busy.current` is true
    // for the whole run, so testing it first made this branch unreachable and
    // left the stop button inert while the mic was open.
    if (phase === 'listening') {
      cancel();
      return;
    }

    if (busy.current) return;

    busy.current = true;
    setError(null);
    setHeard('');
    setReply('');

    try {
      await unlockAudio();
      stopPlayback();

      // Checked separately so a blocked microphone is reported, rather than
      // looking identical to "you said nothing" — which made the button appear
      // to do nothing at all.
      if (!(await prewarm())) {
        setError('Microphone unavailable. Allow mic access, then try again.');
        setPhase('idle');
        return;
      }

      setPhase('listening');
      const clip = await listen({ silenceMs: 700, noSpeechMs: 8000, maxMs: 12000 });
      if (!clip) {
        setError('I did not hear anything.');
        setPhase('idle');
        return;
      }

      setPhase('thinking');
      const transcript = await speechToText(clip.uri, clip.mimeType, langCode, key);
      if (!transcript.trim()) {
        setError('I did not catch that.');
        setPhase('idle');
        return;
      }
      setHeard(transcript);

      const english = langCode === 'en-IN'
        ? transcript
        : await translate(transcript, langCode, 'en-IN', key);

      const intent = matchIntent(english);
      setReply(intent.speak);

      setPhase('acting');
      execute(intent);
      await speak(intent.speak);
    } catch (e: unknown) {
      setError(humanError(e));
    } finally {
      busy.current = false;
      setPhase('idle');
    }
  }, [phase, cancel, listen, prewarm, langCode, key, execute, speak]);

  const dismiss = useCallback(() => {
    setHeard('');
    setReply('');
    setError(null);
  }, []);

  /**
   * The panel used to persist for the rest of the session once anything was
   * shown, sitting permanently over the tab bar. It now clears itself, and can
   * be dismissed by hand.
   */
  useEffect(() => {
    if (phase !== 'idle') return;
    if (!heard && !reply && !error) return;
    const timer = setTimeout(dismiss, PANEL_LINGER_MS);
    return () => clearTimeout(timer);
  }, [phase, heard, reply, error, dismiss]);

  if (!aiEnabled) return null;

  // Live owns the microphone for the whole conversation and has its own,
  // larger control. A second floating mic beside it competed for the same
  // device and left two contradictory buttons on screen.
  if (currentTab === 'Live') return null;

  const active = phase !== 'idle';
  const showPanel = active || !!heard || !!error;

  return (
    <View
      pointerEvents="box-none"
      style={[s.host, { bottom: insets.bottom + 84 }]}
    >
      <View style={s.inner} pointerEvents="box-none">
        {showPanel && (
          <View style={s.panel}>
            <View style={s.panelHead}>
              <Feather
                name={error ? 'alert-circle' : 'mic'}
                size={12}
                color={error ? colors.danger : colors.amber}
              />
              <Text
                style={[
                  type.overline,
                  { color: error ? colors.danger : colors.amber, marginLeft: 6, flex: 1 },
                ]}
              >
                {error ? 'DIDN’T WORK'
                  : phase === 'listening' ? 'LISTENING'
                  : phase === 'thinking' ? 'THINKING'
                  : phase === 'acting' ? 'DOING IT'
                  : 'HEARD'}
              </Text>

              {/* Always dismissable — never trap the UI behind a stuck message. */}
              {!active && (
                <Pressable onPress={dismiss} hitSlop={10} style={{ padding: 2 }}>
                  <Feather name="x" size={14} color={colors.textTertiary} />
                </Pressable>
              )}
            </View>

            {!!heard && (
              <Text style={[type.body, { color: colors.text, marginTop: 6 }]} numberOfLines={2}>
                “{heard}”
              </Text>
            )}
            {!!reply && (
              <Text style={[type.meta, { color: colors.textSecondary, marginTop: 4 }]} numberOfLines={2}>
                {reply}
              </Text>
            )}
            {!!error && (
              <Text style={[type.meta, { color: colors.textSecondary, marginTop: 4 }]}>
                {error} Try “find route 500D” or “what can I say”.
              </Text>
            )}
            {phase === 'idle' && !error && !heard && (
              <Text style={[type.meta, { color: colors.textTertiary, marginTop: 4 }]}>
                Say “what can I say” for examples.
              </Text>
            )}
            {phase === 'listening' && !heard && (
              <Text style={[type.meta, { color: colors.textTertiary, marginTop: 4 }]}>
                Speak now — I’ll stop when you pause.
              </Text>
            )}
          </View>
        )}

        <Pressable
          onPress={run}
          style={[s.fab, active && s.fabActive]}
          accessibilityLabel="Voice command"
        >
          {phase === 'thinking' || phase === 'acting' ? (
            <ActivityIndicator size="small" color={colors.textInverse} />
          ) : (
            <Feather
              name={phase === 'listening' ? 'square' : 'mic'}
              size={20}
              color={phase === 'listening' ? colors.white : colors.textInverse}
            />
          )}
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  host: {
    position: 'absolute', left: 0, right: 0,
    alignItems: 'center',
  },
  inner: {
    width: '100%', maxWidth: CONTENT_MAX_WIDTH,
    paddingHorizontal: space.xl,
    alignItems: 'flex-end',
  },

  panel: {
    alignSelf: 'stretch',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: hairline, borderColor: colors.line,
    padding: space.lg,
    marginBottom: space.md,
    ...shadow(2),
  },
  panelHead: { flexDirection: 'row', alignItems: 'center' },

  fab: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: colors.amber,
    alignItems: 'center', justifyContent: 'center',
    ...shadow(2),
  },
  fabActive: { backgroundColor: colors.danger },
});
