import React, { useState } from 'react';
import {
  View, Text, StyleSheet, Pressable, KeyboardAvoidingView, Platform, Linking,
} from 'react-native';
import { Feather } from '@expo/vector-icons';

import { colors, type, space, radius, hairline } from '../theme';
import {
  Screen, Header, Card, SectionLabel, Button, Field, Banner, Divider,
  SettingRow, Switch, Segmented, Stepper, LanguageSheet, useToast,
} from '../ui';
import { LANGUAGES, LANG_OPTIONS, NATIVE_NAMES } from '../languages';
import { useApiKey } from '../ApiKeyContext';
import { useAuth } from '../AuthContext';
import {
  useSettings, patchSettings, resetSettings, SPEAKERS, TtsModel, SttModel,
  RealtimeModel, StreamType,
} from '../settingsStore';
import { translate, synthesize, playAudio } from '../api';
import { unlockAudio } from '../audio';
import { humanError } from '../errors';

export default function SettingsScreen() {
  const { apiKey, setApiKey, proxyKeyConfigured, aiEnabled, relayUrl, upi, langPrefs, setLangPrefs } =
    useApiKey();
  const s = useSettings();
  const { user, signOut } = useAuth();
  const toast = useToast();

  const [draft, setDraft]   = useState(apiKey);
  const [masked, setMasked] = useState(true);
  const [testing, setTest]  = useState(false);
  const [preview, setPrev]  = useState(false);
  const [advanced, setAdv]  = useState(apiKey.length > 0);
  const [picker, setPicker] = useState<null | 'mine' | 'local'>(null);

  const key = apiKey || undefined;
  const dirty = draft.trim() !== apiKey;

  const saveKey = () => {
    setApiKey(draft.trim());
    toast(draft.trim() ? 'Personal key saved' : 'Personal key removed', 'success');
  };

  const testConnection = async () => {
    setTest(true);
    try {
      await translate('bus', 'en-IN', 'kn-IN', draft.trim() || key);
      toast('Working — translation came back', 'success');
    } catch (e: any) {
      toast(humanError(e, 'Request failed'), 'error');
    } finally {
      setTest(false);
    }
  };

  /** Hear the selected voice before committing to it. */
  const previewVoice = async () => {
    setPrev(true);
    try {
      await unlockAudio();
      const audio = await synthesize(
        'Namaste. This is how the announcements will sound.', 'en-IN', key,
      );
      if (!audio) throw new Error('No audio returned');
      await playAudio(audio);
    } catch (e: any) {
      toast(humanError(e, 'Could not play the sample'), 'error');
    } finally {
      setPrev(false);
    }
  };

  const speakerOptions = SPEAKERS[s.ttsModel].map((v) => ({ value: v, label: v }));

  return (
    <KeyboardAvoidingView style={st.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen
        scroll
        overlay={
          <LanguageSheet
            visible={picker !== null}
            title={picker === 'mine' ? 'Language you speak' : 'Language spoken locally'}
            selected={picker === 'mine' ? langPrefs.mine : langPrefs.local}
            languages={LANG_OPTIONS}
            onSelect={(name) => {
              setLangPrefs({
                ...langPrefs,
                [picker === 'mine' ? 'mine' : 'local']: name,
              } as any);
              setPicker(null);
            }}
            onClose={() => setPicker(null)}
          />
        }
      >
        <Header title="Settings" subtitle="Voices, models, services" />

        <Banner
          tone={aiEnabled ? 'success' : 'warning'}
          text={
            apiKey
              ? 'Using your personal key — requests bill to your own Sarvam account.'
              : proxyKeyConfigured
                ? 'AI features live, served through this app’s own backend.'
                : 'AI features offline — no key configured on the server. Route search still works.'
          }
        />

        {/* ── Languages ── */}
        <SectionLabel>Languages</SectionLabel>
        <Card>
          <SettingRow
            label="You speak"
            hint={`${langPrefs.mine} · ${NATIVE_NAMES[langPrefs.mine] ?? ''}`}
            onPress={() => setPicker('mine')}
            right={<Feather name="chevron-right" size={16} color={colors.textTertiary} />}
          />
          <SettingRow
            label="Spoken locally"
            hint={`${langPrefs.local} · ${NATIVE_NAMES[langPrefs.local] ?? ''}`}
            onPress={() => setPicker('local')}
            right={<Feather name="chevron-right" size={16} color={colors.textTertiary} />}
            last
          />
        </Card>

        {/* ── Voice output ── */}
        <SectionLabel>Voice output</SectionLabel>
        <Card>
          <SettingRow
            label="Model"
            hint="Speaker names differ per version"
            right={
              <Segmented<TtsModel>
                value={s.ttsModel}
                options={[
                  { value: 'bulbul:v3', label: 'v3' },
                  { value: 'bulbul:v2', label: 'v2' },
                ]}
                onChange={(v) => patchSettings({ ttsModel: v })}
              />
            }
          />

          <View style={st.voiceBlock}>
            <Text style={[type.body, { color: colors.text }]}>Voice</Text>
            <Text style={[type.meta, { color: colors.textTertiary, marginTop: 3, marginBottom: space.md }]}>
              {SPEAKERS[s.ttsModel].length} voices available on {s.ttsModel}
            </Text>
            <Segmented
              value={s.ttsSpeaker}
              options={speakerOptions}
              onChange={(v) => patchSettings({ ttsSpeaker: v })}
            />
          </View>

          <SettingRow
            label="Speaking pace"
            hint="Slower is easier to follow in noise"
            right={
              <Stepper
                value={s.ttsPace}
                min={0.5} max={2} step={0.1}
                format={(n) => `${n.toFixed(1)}×`}
                onChange={(n) => patchSettings({ ttsPace: n })}
              />
            }
          />

          <Divider />
          <Button
            label={preview ? 'Playing…' : 'Preview this voice'}
            variant="secondary"
            icon="volume-2"
            onPress={previewVoice}
            loading={preview}
            disabled={!aiEnabled}
          />
        </Card>

        {/* ── Speech recognition ── */}
        <SectionLabel>Speech recognition</SectionLabel>
        <Card>
          <SettingRow
            label="Recogniser"
            hint="Used for recorded turns"
            right={
              <Segmented<SttModel>
                value={s.sttModel}
                options={[
                  { value: 'saaras:v3', label: 'v3' },
                  { value: 'saaras:v2.5', label: 'v2.5' },
                ]}
                onChange={(v) => patchSettings({ sttModel: v })}
              />
            }
          />
          <SettingRow
            label="Realtime model"
            hint="Used by Live streaming"
            right={
              <Segmented<RealtimeModel>
                value={s.realtimeModel}
                options={[
                  { value: 'saaras:v3-realtime', label: 'v3' },
                  { value: 'saaras:v4-realtime', label: 'v4' },
                ]}
                onChange={(v) => patchSettings({ realtimeModel: v })}
              />
            }
          />
          <SettingRow
            label="Latency mode"
            hint="Fast reacts sooner; balanced is more accurate"
            right={
              <Segmented<StreamType>
                value={s.streamType}
                options={[
                  { value: 'fast', label: 'Fast' },
                  { value: 'balanced', label: 'Balanced' },
                ]}
                onChange={(v) => patchSettings({ streamType: v })}
              />
            }
          />
          <SettingRow
            label="End-of-speech pause"
            hint="Silence before a turn is considered finished"
            right={
              <Stepper
                value={s.silenceMs}
                min={300} max={2000} step={100}
                format={(n) => `${n} ms`}
                onChange={(n) => patchSettings({ silenceMs: n })}
              />
            }
            last
          />
        </Card>

        {/* ── Translation ── */}
        <SectionLabel>Translation</SectionLabel>
        <Card>
          <SettingRow
            label="Text preprocessing"
            hint="Expands numbers and abbreviations before translating"
            right={
              <Switch
                value={s.enablePreprocessing}
                onChange={(v) => patchSettings({ enablePreprocessing: v })}
              />
            }
            last
          />
        </Card>

        {/* ── Behaviour ── */}
        <SectionLabel>Behaviour</SectionLabel>
        <Card>
          <SettingRow
            label="Read steps aloud"
            hint="Narrates each booking step automatically"
            right={
              <Switch
                value={s.narrateSteps}
                onChange={(v) => patchSettings({ narrateSteps: v })}
              />
            }
          />
          <SettingRow
            label="Hands-free booking"
            hint="Runs the whole booking as a conversation — asks, listens, then moves on. Turn this off if you would rather tap between steps."
            right={
              <Switch
                value={s.handsFreeBooking}
                onChange={(v) => patchSettings({ handsFreeBooking: v })}
              />
            }
          />
          <SettingRow
            label="Detect who is speaking"
            hint="In Live, works out who is talking from the language they use, so you do not have to tap YOU or THEM. Needs the two of you to have different languages selected."
            right={
              <Switch
                value={s.autoDetectSpeaker}
                onChange={(v) => patchSettings({ autoDetectSpeaker: v })}
              />
            }
          />
          <SettingRow
            label="Speak translations"
            hint="Plays the translation as soon as it arrives in Live"
            right={
              <Switch
                value={s.autoSpeakTranslation}
                onChange={(v) => patchSettings({ autoSpeakTranslation: v })}
              />
            }
          />
          <SettingRow
            label="Show ticket disclaimers"
            hint="Keep this on unless an official ticketing API is connected"
            right={
              <Switch
                value={s.showQrCaveats}
                onChange={(v) => patchSettings({ showQrCaveats: v })}
              />
            }
            last
          />
        </Card>

        {/* ── Services ── */}
        <SectionLabel>Services</SectionLabel>
        <Card padded={false}>
          <ServiceRow
            icon="shield"
            label="Sarvam proxy"
            value={proxyKeyConfigured ? 'Key configured' : 'No key on server'}
            ok={proxyKeyConfigured}
            detail="Holds the API key server-side so it never reaches this browser."
          />
          <ServiceRow
            icon="zap"
            label="Streaming relay"
            value={relayUrl ? 'Connected' : 'Not configured'}
            ok={!!relayUrl}
            detail={
              relayUrl
                ? 'Live streams speech as you talk, with the key held by the relay.'
                : 'Live falls back to one request per sentence. See worker/ to enable streaming.'
            }
          />
          <ServiceRow
            icon="credit-card"
            label="UPI payee"
            value={upi ? upi.vpa : 'Not configured'}
            ok={!!upi}
            detail="Ticket payments open your own bank app; no card details are handled here."
            last
          />
        </Card>

        {/* ── Credentials ── */}
        <SectionLabel>Credentials</SectionLabel>
        <Card>
          <Button
            label="Test connection"
            variant="secondary"
            icon="activity"
            onPress={testConnection}
            loading={testing}
          />

          <Divider />

          <Pressable style={st.disclose} onPress={() => setAdv((a) => !a)}>
            <View style={st.flex}>
              <Text style={[type.body, { color: colors.text }]}>Use a personal key</Text>
              <Text style={[type.meta, { color: colors.textTertiary, marginTop: 3 }]}>
                {relayUrl
                  ? 'Optional. Spends your own Sarvam quota instead of this deployment’s.'
                  : 'Optional. Spends your own quota, and enables Live streaming without a relay.'}
              </Text>
            </View>
            <Feather
              name={advanced ? 'chevron-up' : 'chevron-down'}
              size={17}
              color={colors.textTertiary}
            />
          </Pressable>

          {advanced && (
            <View style={{ marginTop: space.lg }}>
              <Banner
                tone="warning"
                text="A personal key is stored on this device and sent with each request, so anyone using this browser can read it."
              />
              <Field
                value={draft}
                onChangeText={setDraft}
                placeholder="sk_..."
                icon="key"
                secure={masked}
                autoCapitalize="none"
                right={
                  <Pressable onPress={() => setMasked((m) => !m)} style={{ padding: 4 }}>
                    <Feather name={masked ? 'eye' : 'eye-off'} size={16} color={colors.textTertiary} />
                  </Pressable>
                }
              />
              <View style={{ gap: space.md, marginTop: space.lg }}>
                <Button
                  label={dirty ? 'Save key' : 'Saved'}
                  icon={dirty ? undefined : 'check'}
                  onPress={saveKey}
                  disabled={!dirty}
                />
                {apiKey.length > 0 && (
                  <Button
                    label="Remove key"
                    variant="danger"
                    icon="trash-2"
                    onPress={() => { setApiKey(''); setDraft(''); toast('Key removed', 'info'); }}
                  />
                )}
              </View>
              <Pressable
                style={st.link}
                onPress={() => Linking.openURL('https://dashboard.sarvam.ai')}
              >
                <Feather name="external-link" size={13} color={colors.teal} />
                <Text style={[type.meta, { color: colors.teal, marginLeft: 6 }]}>
                  Get a key at dashboard.sarvam.ai
                </Text>
              </Pressable>
            </View>
          )}
        </Card>

        {/* ── Account ── */}
        <SectionLabel>Account</SectionLabel>
        <Card>
          <SettingRow
            label="Signed in"
            hint={user ? `as ${user}` : 'Session active'}
            right={<Feather name="check-circle" size={17} color={colors.success} />}
            last
          />
          <Divider />
          <Button label="Sign out" variant="secondary" icon="log-out" onPress={signOut} />
        </Card>

        {/* ── Reset ── */}
        <View style={{ paddingHorizontal: space.xl, marginTop: space.sm }}>
          <Button
            label="Reset all settings"
            variant="ghost"
            icon="rotate-ccw"
            onPress={async () => { await resetSettings(); toast('Settings reset to defaults', 'info'); }}
          />
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}

function ServiceRow({
  icon, label, value, ok, detail, last,
}: {
  icon: any; label: string; value: string; ok: boolean; detail: string; last?: boolean;
}) {
  return (
    <View style={[st.svcRow, !last && st.svcBorder]}>
      <View style={[st.svcIcon, ok ? st.svcIconOk : st.svcIconOff]}>
        <Feather name={icon} size={15} color={ok ? colors.success : colors.textTertiary} />
      </View>
      <View style={st.flex}>
        <View style={st.svcHead}>
          <Text style={[type.label, { color: colors.text, flex: 1 }]}>{label}</Text>
          <Text
            style={[type.meta, { color: ok ? colors.success : colors.warning }]}
            numberOfLines={1}
          >
            {value}
          </Text>
        </View>
        <Text style={[type.meta, { color: colors.textTertiary, marginTop: 3 }]}>{detail}</Text>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  flex: { flex: 1 },

  voiceBlock: {
    paddingVertical: space.md,
    borderBottomWidth: hairline, borderBottomColor: colors.lineSoft,
  },

  disclose: { flexDirection: 'row', alignItems: 'center' },
  link: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: space.md, marginTop: space.xs,
  },

  svcRow: { flexDirection: 'row', alignItems: 'flex-start', padding: space.lg },
  svcBorder: { borderBottomWidth: hairline, borderBottomColor: colors.lineSoft },
  svcHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  svcIcon: {
    width: 32, height: 32, borderRadius: radius.md,
    alignItems: 'center', justifyContent: 'center',
    marginRight: space.lg,
  },
  svcIconOk:  { backgroundColor: colors.successSoft },
  svcIconOff: { backgroundColor: colors.surfaceHi },
});
