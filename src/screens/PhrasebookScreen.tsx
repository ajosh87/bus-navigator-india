import React, { useState } from 'react';
import {
  View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';

import { colors, type, space, radius, hairline } from '../theme';
import {
  Screen, Header, Card, SectionLabel, Button, IconButton, Chip,
  Field, EmptyState, LanguageSheet, useToast,
} from '../ui';
import { LANGUAGES, LANG_OPTIONS, NATIVE_NAMES, PHRASE_GROUPS } from '../languages';
import { useApiKey } from '../ApiKeyContext';
import { translate, speechToText, textToSpeech } from '../api';
import { useRecorder } from '../useRecorder';

export default function PhrasebookScreen() {
  const { apiKey, aiEnabled, langPrefs, setLangPrefs } = useApiKey();
  const { recordState, toggleRecording } = useRecorder();
  const nav = useNavigation<any>();
  const toast = useToast();

  const [group, setGroup]             = useState(PHRASE_GROUPS[0].id);
  const [phrase, setPhrase]           = useState('');
  const [translation, setTranslation] = useState('');
  const [loading, setLoading]         = useState(false);
  const [playing, setPlaying]         = useState(false);
  const [picker, setPicker]           = useState<null | 'mine' | 'local'>(null);

  const mine  = langPrefs.mine;
  const local = langPrefs.local;

  const doTranslate = async (text: string) => {
    const t = text.trim();
    if (!t) return;
    setLoading(true);
    setTranslation('');
    try {
      const out = await translate(t, LANGUAGES[mine], LANGUAGES[local], apiKey);
      setTranslation(out);
    } catch (e: any) {
      toast(e?.message?.slice(0, 90) ?? 'Translation failed', 'error');
    } finally {
      setLoading(false);
    }
  };

  const play = async () => {
    if (!translation) return;
    setPlaying(true);
    try {
      await textToSpeech(translation, LANGUAGES[local], apiKey);
    } catch {
      toast('Playback failed', 'error');
    } finally {
      setPlaying(false);
    }
  };

  const mic = async () => {
    const result = await toggleRecording();
    if (!result) return;               // just started recording
    setLoading(true);
    try {
      const transcript = await speechToText(result.uri, result.mimeType, LANGUAGES[mine], apiKey);
      if (!transcript.trim()) {
        toast('Nothing heard — try again', 'error');
        return;
      }
      setPhrase(transcript);
      await doTranslate(transcript);
    } catch (e: any) {
      toast(e?.message?.slice(0, 90) ?? 'Could not transcribe', 'error');
    } finally {
      setLoading(false);
    }
  };

  const swap = () => {
    setLangPrefs({ mine: local, local: mine });
    setPhrase(translation);
    setTranslation('');
  };

  const recording = recordState === 'recording';
  const activeGroup = PHRASE_GROUPS.find((g) => g.id === group) ?? PHRASE_GROUPS[0];

  if (!aiEnabled) {
    return (
      <Screen scroll>
        <Header title="Speak" subtitle="Say it in their language" />
        <EmptyState
          icon="cloud-off"
          title="Translation is offline"
          body="This deployment has no Sarvam key configured on the server, so translation and speech are unavailable."
          action={<Button label="Open Settings" icon="settings" onPress={() => nav.navigate('Settings')} />}
        />
      </Screen>
    );
  }

  return (
    <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen
        scroll
        overlay={
          <LanguageSheet
            visible={picker !== null}
            title={picker === 'mine' ? 'Language you speak' : 'Language they speak'}
            selected={picker === 'mine' ? mine : local}
            languages={LANG_OPTIONS}
            onSelect={(name) => {
              if (picker === 'mine') setLangPrefs({ ...langPrefs, mine: name });
              else setLangPrefs({ ...langPrefs, local: name });
              setPicker(null);
              setTranslation('');
            }}
            onClose={() => setPicker(null)}
          />
        }
      >
        <Header title="Speak" subtitle="Say it in their language" />

        {/* Language pair */}
        <View style={s.pair}>
          <Pressable style={s.pairSide} onPress={() => setPicker('mine')}>
            <Text style={[type.overline, { color: colors.textTertiary }]}>YOU SPEAK</Text>
            <View style={s.pairVal}>
              <Text style={[type.h3, { color: colors.text }]}>{mine}</Text>
              <Feather name="chevron-down" size={13} color={colors.textTertiary} style={{ marginLeft: 4 }} />
            </View>
            <Text style={[type.meta, { color: colors.textTertiary }]}>{NATIVE_NAMES[mine]}</Text>
          </Pressable>

          <Pressable style={s.swap} onPress={swap}>
            <Feather name="repeat" size={15} color={colors.amber} />
          </Pressable>

          <Pressable style={[s.pairSide, { alignItems: 'flex-end' }]} onPress={() => setPicker('local')}>
            <Text style={[type.overline, { color: colors.textTertiary }]}>THEY SPEAK</Text>
            <View style={s.pairVal}>
              <Text style={[type.h3, { color: colors.text }]}>{local}</Text>
              <Feather name="chevron-down" size={13} color={colors.textTertiary} style={{ marginLeft: 4 }} />
            </View>
            <Text style={[type.meta, { color: colors.textTertiary }]}>{NATIVE_NAMES[local]}</Text>
          </Pressable>
        </View>

        {/* Presets — the fastest path to a usable phrase */}
        <SectionLabel>Common phrases</SectionLabel>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.groupRow}
        >
          {PHRASE_GROUPS.map((g) => (
            <Chip
              key={g.id}
              label={g.label}
              icon={g.icon as any}
              selected={g.id === group}
              onPress={() => setGroup(g.id)}
            />
          ))}
        </ScrollView>

        <View style={s.phraseList}>
          {activeGroup.phrases.map((p) => {
            const active = phrase === p;
            return (
              <Pressable
                key={p}
                onPress={() => { setPhrase(p); setTranslation(''); doTranslate(p); }}
                style={({ pressed }) => [
                  s.phraseRow,
                  active && s.phraseRowActive,
                  pressed && { opacity: 0.7 },
                ]}
              >
                <Text style={[type.body, { color: active ? colors.amber : colors.text, flex: 1 }]}>
                  {p}
                </Text>
                <Feather
                  name="arrow-right"
                  size={14}
                  color={active ? colors.amber : colors.textTertiary}
                />
              </Pressable>
            );
          })}
        </View>

        {/* Compose — mic sits inline, not buried at the bottom */}
        <SectionLabel>Or say it yourself</SectionLabel>
        <View style={s.compose}>
          <Field
            value={phrase}
            onChangeText={(t) => { setPhrase(t); setTranslation(''); }}
            placeholder={`Type in ${mine}…`}
            multiline
            right={
              phrase.length > 0 ? (
                <Pressable onPress={() => { setPhrase(''); setTranslation(''); }} style={{ padding: 4 }}>
                  <Feather name="x" size={15} color={colors.textTertiary} />
                </Pressable>
              ) : undefined
            }
          />

          <View style={s.composeActions}>
            <Pressable
              onPress={mic}
              disabled={recordState === 'processing' || loading}
              style={[s.micBtn, recording && s.micBtnRec]}
            >
              {recordState === 'processing'
                ? <ActivityIndicator size="small" color={colors.text} />
                : <Feather
                    name={recording ? 'square' : 'mic'}
                    size={18}
                    color={recording ? colors.white : colors.text}
                  />
              }
            </Pressable>

            <Button
              label={recording ? 'Listening…' : 'Translate'}
              onPress={() => doTranslate(phrase)}
              loading={loading}
              disabled={!phrase.trim() || recording}
              style={s.flex}
            />
          </View>

          {recording && (
            <Text style={[type.meta, s.recHint]}>
              Recording — tap the square to stop
            </Text>
          )}
        </View>

        {/* Result — playback is the payoff, so it gets a full-width button */}
        {!!translation && (
          <Card style={s.result}>
            <View style={s.resultHead}>
              <Text style={[type.overline, { color: colors.amber }]}>{local.toUpperCase()}</Text>
              <Text style={[type.meta, { color: colors.textTertiary }]}>{NATIVE_NAMES[local]}</Text>
            </View>

            <Text style={[type.h2, { color: colors.text, marginTop: space.md, marginBottom: space.xl }]}>
              {translation}
            </Text>

            <Button
              label={playing ? 'Playing…' : 'Play to driver'}
              icon="volume-2"
              onPress={play}
              loading={playing}
            />
          </Card>
        )}

      </Screen>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1 },

  pair: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: space.xl, marginBottom: space.sm,
  },
  pairSide: { flex: 1 },
  pairVal:  { flexDirection: 'row', alignItems: 'center', marginVertical: 2 },
  swap: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: colors.amberSoft,
    borderWidth: hairline, borderColor: colors.amberLine,
    alignItems: 'center', justifyContent: 'center',
    marginHorizontal: space.md,
  },

  groupRow: { paddingHorizontal: space.xl, gap: space.sm, paddingBottom: space.lg },

  phraseList: {
    marginHorizontal: space.xl, marginBottom: space.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: hairline, borderColor: colors.line,
    overflow: 'hidden',
  },
  phraseRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: space.lg, paddingVertical: space.lg,
    borderBottomWidth: hairline, borderBottomColor: colors.lineSoft,
  },
  phraseRowActive: { backgroundColor: colors.amberSoft },

  compose: { paddingHorizontal: space.xl, marginBottom: space.lg },
  composeActions: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginTop: space.md },
  micBtn: {
    width: 50, height: 50, borderRadius: 25,
    backgroundColor: colors.surfaceHi,
    borderWidth: hairline, borderColor: colors.line,
    alignItems: 'center', justifyContent: 'center',
  },
  micBtnRec: { backgroundColor: colors.danger, borderColor: colors.danger },
  recHint: { color: colors.danger, textAlign: 'center', marginTop: space.md },

  result: { backgroundColor: colors.amberSoft, borderColor: colors.amberLine },
  resultHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
