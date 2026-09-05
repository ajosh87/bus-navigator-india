import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';

import { colors, type, space, radius, hairline, shadow } from '../theme';
import { Screen, Header, Button, EmptyState, LanguageSheet, Banner, useToast } from '../ui';
import { LANGUAGES, LANG_OPTIONS, NATIVE_NAMES } from '../languages';
import { useApiKey } from '../ApiKeyContext';
import { useSettings } from '../settingsStore';
import { translate, speechToText, synthesize, playAudio } from '../api';
import { RealtimeSession } from '../realtime';
import { unlockAudio, stopPlayback } from '../audio';
import { useRecorder } from '../useRecorder';

type Side  = 'mine' | 'local';
type Stage = 'idle' | 'listening' | 'transcribing' | 'translating' | 'speaking';

interface Turn {
  id: number;
  from: Side;
  source: string;
  translated?: string;
  failed?: boolean;
}

let seq = 0;

const STAGE_LABEL: Record<Stage, string> = {
  idle:          '',
  listening:     'Listening',
  transcribing:  'Transcribing',
  translating:   'Translating',
  speaking:      'Speaking',
};

export default function LiveScreen() {
  const { apiKey, aiEnabled, canStream, relayUrl, langPrefs, setLangPrefs } = useApiKey();
  const settings = useSettings();
  const nav = useNavigation<any>();
  const toast = useToast();
  const { listen, cancel: cancelRec, level: micLevel } = useRecorder();

  const [live, setLive]       = useState(false);
  const [connecting, setConn] = useState(false);
  const [speaker, setSpeaker] = useState<Side>('local');
  const [partial, setPartial] = useState('');
  const [turns, setTurns]     = useState<Turn[]>([]);
  const [wsLevel, setWsLevel] = useState(0);
  const [stage, setStage]     = useState<Stage>('idle');
  const [picker, setPicker]   = useState<null | Side>(null);

  const session  = useRef<RealtimeSession | null>(null);
  const looping  = useRef(false);
  const scroller = useRef<ScrollView>(null);

  const speakerRef = useRef<Side>(speaker);
  speakerRef.current = speaker;

  const mine  = langPrefs.mine;
  const local = langPrefs.local;

  const fromLang = speaker === 'mine' ? mine  : local;
  const toLang   = speaker === 'mine' ? local : mine;

  const key = apiKey || undefined;
  const level = canStream ? wsLevel : micLevel;

  const teardown = useCallback(() => {
    looping.current = false;
    session.current?.stop();
    session.current = null;
    cancelRec();
    stopPlayback();
    setLive(false);
    setConn(false);
    setWsLevel(0);
    setPartial('');
    setStage('idle');
  }, [cancelRec]);

  useEffect(() => () => teardown(), [teardown]);

  /** Translate a settled utterance and speak it. Shared by both paths. */
  const deliver = useCallback(
    async (text: string, from: Side, alreadyTranslated: boolean) => {
      const srcName = from === 'mine' ? mine  : local;
      const tgtName = from === 'mine' ? local : mine;
      const id = ++seq;

      setPartial('');
      setTurns((t) => [...t, { id, from, source: text }]);

      try {
        setStage('translating');
        const out = alreadyTranslated
          ? text
          : await translate(text, LANGUAGES[srcName], LANGUAGES[tgtName], key);

        setTurns((t) => t.map((x) => (x.id === id ? { ...x, translated: out } : x)));

        if (settings.autoSpeakTranslation) {
          setStage('speaking');
          const b64 = await synthesize(out, LANGUAGES[tgtName], key);
          if (b64) await playAudio(b64, `${LANGUAGES[tgtName]}:${out}`);
        }
      } catch (e: any) {
        setTurns((t) => t.map((x) => (x.id === id ? { ...x, failed: true } : x)));
        toast(e?.message?.slice(0, 90) ?? 'Could not translate that', 'error');
      }
    },
    [key, mine, local, toast, settings.autoSpeakTranslation],
  );

  // ── Path A: realtime streaming, through the Cloudflare relay when one is
  //    configured, otherwise straight to Sarvam with a personal key. ──
  const startStreaming = useCallback(async () => {
    setConn(true);
    const targetIsEnglish = LANGUAGES[toLang] === 'en-IN';

    const s = new RealtimeSession({
      relayUrl,
      apiKey,
      languageCode: LANGUAGES[fromLang],
      // Sarvam's translate mode emits English, so it only saves a round trip
      // when English is where we were heading anyway.
      mode: targetIsEnglish ? 'translate' : 'transcribe',
      streamType: 'fast',
      onOpen:    () => { setConn(false); setLive(true); setStage('listening'); },
      onLevel:   setWsLevel,
      onPartial: (t) => { setPartial(t); setStage('listening'); },
      onFinal:   async (text) => {
        await deliver(text, speakerRef.current, targetIsEnglish);
        if (looping.current) setStage('listening');
      },
      onError:   (e) => { toast(e.message, 'error'); teardown(); },
      onClose:   () => { setLive(false); setConn(false); setWsLevel(0); },
    });

    session.current = s;
    looping.current = true;
    try {
      await s.start();
    } catch (e: any) {
      toast(
        e?.name === 'NotAllowedError'
          ? 'Microphone blocked — allow it in your browser'
          : e?.message ?? 'Could not start listening',
        'error',
      );
      teardown();
    }
  }, [relayUrl, apiKey, fromLang, toLang, deliver, teardown, toast]);

  // ── Path B: proxied REST, one round trip per utterance. Slower than
  //    streaming, but the key stays on the server. ──
  const startRestLoop = useCallback(async () => {
    looping.current = true;
    setLive(true);

    try {
      while (looping.current) {
        setStage('listening');
        const clip = await listen({ silenceMs: 600, noSpeechMs: 15000, maxMs: 15000 });
        if (!looping.current) break;
        if (!clip) continue;                 // silence or a discarded turn

        const from = speakerRef.current;
        const srcName = from === 'mine' ? mine : local;

        try {
          setStage('transcribing');
          const transcript = await speechToText(
            clip.uri, clip.mimeType, LANGUAGES[srcName], key,
          );
          if (!looping.current) break;
          if (!transcript.trim()) continue;

          await deliver(transcript, from, false);
        } catch (e: any) {
          toast(e?.message?.slice(0, 90) ?? 'Could not transcribe', 'error');
          // Keep listening — one bad turn shouldn't end the conversation.
        }
      }
    } finally {
      setLive(false);
      setStage('idle');
      setPartial('');
    }
  }, [listen, deliver, key, mine, local, toast]);

  const start = useCallback(async () => {
    if (!aiEnabled) return;
    // Must run inside the tap so the browser lets us play audio later.
    await unlockAudio();
    if (canStream) void startStreaming();
    else void startRestLoop();
  }, [aiEnabled, canStream, startStreaming, startRestLoop]);

  /** Flipping who speaks changes the recognition language, so restart. */
  const flipTo = useCallback((side: Side) => {
    if (side === speaker) return;
    const wasLive = live || connecting;
    setSpeaker(side);
    if (wasLive) {
      teardown();
      setTimeout(() => { void start(); }, 80);
    }
  }, [speaker, live, connecting, teardown, start]);

  const replay = useCallback(async (turn: Turn) => {
    if (!turn.translated) return;
    const tgt = turn.from === 'mine' ? local : mine;
    try {
      stopPlayback();
      const b64 = await synthesize(turn.translated, LANGUAGES[tgt], key);
      await playAudio(b64, `${LANGUAGES[tgt]}:${turn.translated}`);
    } catch {
      toast('Playback failed', 'error');
    }
  }, [key, mine, local, toast]);

  if (!aiEnabled) {
    return (
      <Screen scroll>
        <Header title="Live" subtitle="Two-way conversation" />
        <EmptyState
          icon="cloud-off"
          title="Live mode is offline"
          body="This deployment has no Sarvam key configured on the server, so speech recognition is unavailable."
          action={<Button label="Open Settings" icon="settings" onPress={() => nav.navigate('Settings')} />}
        />
      </Screen>
    );
  }

  return (
    <Screen
      overlay={
        <LanguageSheet
          visible={picker !== null}
          title={picker === 'mine' ? 'Language you speak' : 'Language they speak'}
          selected={picker === 'mine' ? mine : local}
          languages={LANG_OPTIONS}
          onSelect={(name) => {
            setLangPrefs({ ...langPrefs, [picker === 'mine' ? 'mine' : 'local']: name } as any);
            setPicker(null);
            if (live) teardown();
          }}
          onClose={() => setPicker(null)}
        />
      }
    >
      <Header
        title="Live"
        subtitle="Two-way conversation"
        right={
          <View style={[s.modeTag, canStream && s.modeTagFast]}>
            <Feather
              name={canStream ? 'zap' : 'shield'}
              size={11}
              color={canStream ? colors.amber : colors.teal}
            />
            <Text
              style={[
                type.overline,
                { color: canStream ? colors.amber : colors.teal, marginLeft: 4 },
              ]}
            >
              {canStream ? 'STREAMING' : 'PROXIED'}
            </Text>
          </View>
        }
      />

      {/* Who is speaking — drives the recognition language */}
      <View style={s.sides}>
        {(['mine', 'local'] as Side[]).map((side) => {
          const name = side === 'mine' ? mine : local;
          const active = speaker === side;
          return (
            <Pressable
              key={side}
              onPress={() => flipTo(side)}
              style={[s.side, active && s.sideActive]}
            >
              <Text style={[type.overline, { color: active ? colors.amber : colors.textTertiary }]}>
                {side === 'mine' ? 'YOU' : 'THEM'}
              </Text>
              <Text style={[type.h3, { color: active ? colors.text : colors.textSecondary, marginTop: 3 }]}>
                {name}
              </Text>
              <Text style={[type.meta, { color: colors.textTertiary }]}>{NATIVE_NAMES[name]}</Text>
              <Pressable onPress={() => setPicker(side)} style={s.changeBtn} hitSlop={8}>
                <Text style={[type.meta, { color: colors.teal }]}>change</Text>
              </Pressable>
            </Pressable>
          );
        })}
      </View>

      <Banner
        tone="info"
        text={`Tap ${speaker === 'mine' ? 'THEM' : 'YOU'} above when the other person takes a turn.`}
      />

      {/* Transcript */}
      <ScrollView
        ref={scroller}
        style={s.flex}
        contentContainerStyle={s.log}
        onContentSizeChange={() => scroller.current?.scrollToEnd({ animated: true })}
        showsVerticalScrollIndicator={false}
      >
        {turns.length === 0 && !partial && stage === 'idle' && (
          <View style={s.hint}>
            <Feather name="radio" size={20} color={colors.textTertiary} />
            <Text style={[type.body, s.hintText]}>
              Start listening, then speak normally. Each sentence is translated and
              played out loud as soon as you pause.
            </Text>
          </View>
        )}

        {turns.map((t) => (
          <View key={t.id} style={[s.bubble, t.from === 'mine' ? s.bubbleMine : s.bubbleThem]}>
            <Text style={[type.overline, { color: colors.textTertiary }]}>
              {t.from === 'mine' ? 'YOU' : 'THEM'}
            </Text>
            <Text style={[type.body, { color: colors.textSecondary, marginTop: 5 }]}>
              {t.source}
            </Text>

            {t.translated ? (
              <>
                <View style={s.bubbleRule} />
                <Text style={[type.h3, { color: colors.text }]}>{t.translated}</Text>
                <Pressable onPress={() => replay(t)} style={s.replay} hitSlop={6}>
                  <Feather name="volume-2" size={13} color={colors.teal} />
                  <Text style={[type.meta, { color: colors.teal, marginLeft: 5 }]}>Replay</Text>
                </Pressable>
              </>
            ) : t.failed ? (
              <Text style={[type.meta, { color: colors.danger, marginTop: 6 }]}>
                Translation failed
              </Text>
            ) : (
              <View style={s.working}>
                <ActivityIndicator size="small" color={colors.amber} />
                <Text style={[type.meta, { color: colors.textTertiary, marginLeft: 8 }]}>
                  translating…
                </Text>
              </View>
            )}
          </View>
        ))}

        {/* Interim text, updating as they speak (streaming only) */}
        {!!partial && (
          <View style={[s.bubble, s.bubblePartial]}>
            <Text style={[type.overline, { color: colors.amber }]}>HEARING…</Text>
            <Text style={[type.body, { color: colors.text, marginTop: 5 }]}>{partial}</Text>
          </View>
        )}
      </ScrollView>

      {/* Control */}
      <View style={s.controls}>
        <Pressable
          onPress={live || connecting ? teardown : start}
          style={[s.mic, live && s.micLive]}
        >
          {live && (
            <View
              style={[
                s.pulse,
                {
                  transform: [{ scale: 1 + Math.min(level, 1) * 0.45 }],
                  opacity: 0.18 + level * 0.4,
                },
              ]}
            />
          )}
          {connecting
            ? <ActivityIndicator color={colors.textInverse} />
            : <Feather
                name={live ? 'square' : 'mic'}
                size={26}
                color={live ? colors.white : colors.textInverse}
              />
          }
        </Pressable>

        <Text style={[type.meta, s.status]}>
          {connecting ? 'Connecting…'
            : live
              ? `${STAGE_LABEL[stage] || 'Listening'} · ${fromLang} → ${toLang}`
              : `Tap to start · ${fromLang} → ${toLang}`}
        </Text>

        {turns.length > 0 && !live && (
          <Pressable onPress={() => setTurns([])} style={{ paddingVertical: space.sm }}>
            <Text style={[type.meta, { color: colors.textTertiary }]}>Clear conversation</Text>
          </Pressable>
        )}
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1 },

  modeTag: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: space.md, paddingVertical: 5,
    backgroundColor: colors.tealSoft,
    borderRadius: radius.full,
    borderWidth: hairline, borderColor: colors.line,
  },
  modeTagFast: { backgroundColor: colors.amberSoft, borderColor: colors.amberLine },

  sides: { flexDirection: 'row', gap: space.md, paddingHorizontal: space.xl, marginBottom: space.lg },
  side: {
    flex: 1, padding: space.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.line,
  },
  sideActive: { borderColor: colors.amberLine, backgroundColor: colors.amberSoft },
  changeBtn: { marginTop: space.sm },

  log:  { paddingHorizontal: space.xl, paddingBottom: space.lg, gap: space.md },
  hint: { alignItems: 'center', paddingVertical: space.huge, paddingHorizontal: space.lg },
  hintText: { color: colors.textSecondary, textAlign: 'center', marginTop: space.md, maxWidth: 300 },

  bubble: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: hairline, borderColor: colors.line,
    padding: space.lg,
  },
  bubbleMine:    { borderLeftWidth: 2.5, borderLeftColor: colors.teal },
  bubbleThem:    { borderLeftWidth: 2.5, borderLeftColor: colors.amber },
  bubblePartial: { borderStyle: 'dashed', borderColor: colors.amberLine },
  bubbleRule:    { height: hairline, backgroundColor: colors.line, marginVertical: space.md },
  replay:  { flexDirection: 'row', alignItems: 'center', marginTop: space.md },
  working: { flexDirection: 'row', alignItems: 'center', marginTop: space.md },

  controls: {
    alignItems: 'center',
    paddingTop: space.lg, paddingBottom: space.lg,
    borderTopWidth: hairline, borderTopColor: colors.lineSoft,
    backgroundColor: colors.background,
  },
  mic: {
    width: 68, height: 68, borderRadius: 34,
    backgroundColor: colors.amber,
    alignItems: 'center', justifyContent: 'center',
    ...shadow(2),
  },
  micLive: { backgroundColor: colors.danger },
  pulse: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 34,
    backgroundColor: colors.danger,
  },
  status: { color: colors.textSecondary, marginTop: space.md, textAlign: 'center' },
});
