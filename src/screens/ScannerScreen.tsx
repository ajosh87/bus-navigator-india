import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, Pressable, Image, ActivityIndicator, Platform, Linking,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Feather } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';

import { colors, type, space, radius, hairline, shadow } from '../theme';
import {
  Screen, Header, Card, SectionLabel, Button, IconButton,
  Banner, EmptyState, LanguageSheet, useToast, Skeleton,
} from '../ui';
import { LANGUAGES, LANG_OPTIONS, NATIVE_NAMES } from '../languages';
import { useApiKey } from '../ApiKeyContext';
import { digitise, translate, textToSpeech } from '../api';
import { checkDestination, verdictLabel, DestinationCheck } from '../ticketing/destination';
import { fetchPage, summarisePage, PageSummary } from '../ticketing/scrape';
import { humanError } from '../errors';

type Mode   = 'signboard' | 'qr';
type Source = 'idle' | 'camera' | 'preview';

/** Opens the browser file picker and returns an object URL. Web only. */
function pickImageWeb(): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = () => {
      const file = input.files?.[0];
      resolve(file ? URL.createObjectURL(file) : null);
    };
    input.click();
  });
}

export default function ScannerScreen() {
  const { apiKey, aiEnabled, langPrefs, setLangPrefs } = useApiKey();
  const nav = useNavigation<any>();
  const toast = useToast();

  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);

  const [mode, setMode]       = useState<Mode>('signboard');
  const [source, setSource]   = useState<Source>('idle');
  const [imageUri, setImage]  = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [speaking, setSpeak]  = useState(false);
  const [picker, setPicker]   = useState<null | 'src' | 'tgt'>(null);

  const [extracted, setExtracted] = useState('');
  const [english, setEnglish]     = useState('');
  const [localised, setLocalised] = useState('');

  /** Verdict on a decoded QR destination — the gate before anything opens. */
  const [scanned, setScanned] = useState<DestinationCheck | null>(null);
  const announced = useRef<string | null>(null);

  const [pageSummary, setPageSummary] = useState<PageSummary | null>(null);
  const [reading, setReading] = useState(false);

  const srcLang = langPrefs.local;  // script on the board
  const tgtLang = langPrefs.mine;   // language the traveller reads

  const clearResults = () => {
    setExtracted(''); setEnglish(''); setLocalised('');
    setScanned(null);
    setPageSummary(null);
    announced.current = null;
  };

  /**
   * Reads the verified page and narrates only the facts that matter — fees,
   * hours, closed days. Narrating the whole page would be useless to someone
   * who cannot read it themselves.
   */
  const readPageAloud = useCallback(async () => {
    if (!scanned?.safeToProceed) return;
    setReading(true);
    setPageSummary(null);
    try {
      const page = await fetchPage(scanned.url);
      const summary = summarisePage(page.markdown);
      setPageSummary(summary);

      if (!summary.spoken) {
        toast('Could not find prices or timings on that page', 'info');
        return;
      }
      if (!aiEnabled) return;

      const spoken = LANGUAGES[tgtLang] === 'en-IN'
        ? summary.spoken
        : await translate(summary.spoken, 'en-IN', LANGUAGES[tgtLang], apiKey || undefined);
      await textToSpeech(spoken, LANGUAGES[tgtLang], apiKey || undefined);
    } catch (e: any) {
      toast(humanError(e, 'Could not read that page'), 'error');
    } finally {
      setReading(false);
    }
  }, [scanned, aiEnabled, tgtLang, apiKey, toast]);

  /**
   * Handles a decoded QR.
   *
   * The verdict is spoken before anything is opened, because the person most
   * helped by this app cannot read the domain on screen — and a sticker placed
   * over a real code is the most common way that gets exploited.
   */
  const onQrScanned = useCallback(({ data }: { data: string }) => {
    if (announced.current === data) return;   // camera fires continuously
    announced.current = data;

    const verdict = checkDestination(data);
    setScanned(verdict);

    if (!aiEnabled) return;
    (async () => {
      try {
        const line = verdict.reason;
        const spoken = LANGUAGES[tgtLang] === 'en-IN'
          ? line
          : await translate(line, 'en-IN', LANGUAGES[tgtLang], apiKey || undefined);
        await textToSpeech(spoken, LANGUAGES[tgtLang], apiKey || undefined);
      } catch {
        /* the on-screen verdict still stands if narration fails */
      }
    })();
  }, [aiEnabled, tgtLang, apiKey]);

  const reset = () => {
    setSource('idle');
    setImage(null);
    clearResults();
  };

  const openCamera = async () => {
    if (!permission?.granted) {
      const res = await requestPermission();
      if (!res.granted) {
        toast('Camera blocked — upload a photo instead', 'error');
        return;
      }
    }
    clearResults();
    setImage(null);
    setSource('camera');
  };

  // "scan this board" used to land here on the idle chooser, having asked for
  // exactly one thing. Open the camera in the mode that was requested.
  const params = useRoute().params as
    | { openCamera?: boolean; mode?: Mode }
    | undefined;
  const handledOpen = useRef<string | null>(null);

  useEffect(() => {
    if (!params?.openCamera) return;
    const token = params.mode ?? 'signboard';
    if (handledOpen.current === token) return;
    handledOpen.current = token;

    if (params.mode) setMode(params.mode);
    void openCamera();
  }, [params]); // eslint-disable-line react-hooks/exhaustive-deps

  const uploadPhoto = async () => {
    const uri = await pickImageWeb();
    if (!uri) return;
    clearResults();
    setImage(uri);
    setSource('preview');
    analyse(uri);
  };

  const shoot = async () => {
    if (!cameraRef.current) return;
    const photo = await cameraRef.current.takePictureAsync({ quality: 0.85 });
    if (!photo?.uri) { toast('Capture failed — try again', 'error'); return; }
    setImage(photo.uri);
    setSource('preview');
    analyse(photo.uri);
  };

  const analyse = async (uri: string) => {
    setLoading(true);
    clearResults();
    try {
      const text = await digitise(uri, apiKey);
      if (!text.trim()) {
        toast('No text found — try a closer, brighter shot', 'error');
        return;
      }
      setExtracted(text);

      if (mode === 'qr') return;

      const from = LANGUAGES[srcLang] ?? 'kn-IN';
      const [en, loc] = await Promise.all([
        translate(text, from, 'en-IN', apiKey),
        LANGUAGES[tgtLang] !== 'en-IN'
          ? translate(text, from, LANGUAGES[tgtLang], apiKey)
          : Promise.resolve(''),
      ]);
      setEnglish(en);
      setLocalised(loc);
    } catch (e: any) {
      toast(humanError(e, 'Scan failed'), 'error');
    } finally {
      setLoading(false);
    }
  };

  const speak = async () => {
    if (!extracted) return;
    setSpeak(true);
    try {
      await textToSpeech(extracted, LANGUAGES[srcLang], apiKey);
    } catch (e: any) {
      toast('Playback failed', 'error');
    } finally {
      setSpeak(false);
    }
  };

  // ── say so plainly instead of failing after a capture ──
  if (!aiEnabled) {
    return (
      <Screen scroll>
        <Header title="Scan" subtitle="Bus boards · payment QR" />
        <EmptyState
          icon="cloud-off"
          title="Scanning is offline"
          body="This deployment has no Sarvam key configured on the server, so signboard reading is unavailable. Route search still works."
          action={
            <View style={{ gap: space.md }}>
              <Button label="Browse routes" icon="map" onPress={() => nav.navigate('Routes')} />
              <Button label="Open Settings" variant="secondary" icon="settings" onPress={() => nav.navigate('Settings')} />
            </View>
          }
        />
      </Screen>
    );
  }

  return (
    <Screen
      scroll
      overlay={
        <LanguageSheet
          visible={picker !== null}
          title={picker === 'src' ? 'Script on the board' : 'Language you read'}
          selected={picker === 'src' ? srcLang : tgtLang}
          languages={LANG_OPTIONS}
          onSelect={(name) => {
            if (picker === 'src') setLangPrefs({ ...langPrefs, local: name });
            else setLangPrefs({ ...langPrefs, mine: name });
            setPicker(null);
          }}
          onClose={() => setPicker(null)}
        />
      }
    >
      <Header
        title="Scan"
        subtitle="Bus boards · payment QR"
        right={
          source !== 'idle' ? <IconButton icon="rotate-ccw" onPress={reset} /> : undefined
        }
      />

      {/* Mode */}
      <View style={s.segment}>
        {([['signboard', 'Signboard'], ['qr', 'Payment QR']] as const).map(([m, label]) => (
          <Pressable
            key={m}
            onPress={() => { setMode(m); clearResults(); }}
            style={[s.segmentItem, mode === m && s.segmentItemActive]}
          >
            <Text style={[type.label, { color: mode === m ? colors.textInverse : colors.textSecondary }]}>
              {label}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Languages */}
      {mode === 'signboard' && (
        <View style={s.langRow}>
          <Pressable style={s.langBtn} onPress={() => setPicker('src')}>
            <Text style={[type.overline, { color: colors.textTertiary }]}>BOARD SCRIPT</Text>
            <View style={s.langVal}>
              <Text style={[type.label, { color: colors.text }]}>{srcLang}</Text>
              <Feather name="chevron-down" size={13} color={colors.textTertiary} style={{ marginLeft: 4 }} />
            </View>
            <Text style={[type.meta, { color: colors.textTertiary }]}>{NATIVE_NAMES[srcLang]}</Text>
          </Pressable>

          <View style={s.langArrow}>
            <Feather name="arrow-right" size={14} color={colors.amber} />
          </View>

          <Pressable style={[s.langBtn, { alignItems: 'flex-end' }]} onPress={() => setPicker('tgt')}>
            <Text style={[type.overline, { color: colors.textTertiary }]}>YOU READ</Text>
            <View style={s.langVal}>
              <Text style={[type.label, { color: colors.text }]}>{tgtLang}</Text>
              <Feather name="chevron-down" size={13} color={colors.textTertiary} style={{ marginLeft: 4 }} />
            </View>
            <Text style={[type.meta, { color: colors.textTertiary }]}>{NATIVE_NAMES[tgtLang]}</Text>
          </Pressable>
        </View>
      )}

      {/* Source: idle → choose, camera → live, preview → image */}
      {source === 'idle' && (
        <Card style={s.chooser}>
          <View style={s.chooserIcon}>
            <Feather name={mode === 'qr' ? 'grid' : 'camera'} size={22} color={colors.amber} />
          </View>
          <Text style={[type.h3, { color: colors.text, marginTop: space.lg }]}>
            {mode === 'qr' ? 'Scan a payment QR' : 'Capture the board'}
          </Text>
          <Text style={[type.meta, s.chooserBody]}>
            {mode === 'qr'
              ? 'Read the conductor’s UPI QR and check the payee before paying.'
              : 'Fill the frame with the destination board for the cleanest read.'}
          </Text>

          <View style={{ width: '100%', gap: space.md, marginTop: space.xl }}>
            <Button label="Open camera" icon="camera" onPress={openCamera} />
            {Platform.OS === 'web' && (
              <Button label="Upload a photo" variant="secondary" icon="upload" onPress={uploadPhoto} />
            )}
          </View>
        </Card>
      )}

      {source === 'camera' && (
        <View style={s.stage}>
          <CameraView
            ref={cameraRef}
            style={s.fill}
            facing="back"
            // QR mode decodes on-device: instant, offline, and far more reliable
            // than running OCR over a barcode.
            barcodeScannerSettings={mode === 'qr' ? { barcodeTypes: ['qr'] } : undefined}
            onBarcodeScanned={mode === 'qr' ? onQrScanned : undefined}
          />
          <View style={s.reticle} pointerEvents="none">
            {(['tl', 'tr', 'bl', 'br'] as const).map((c) => (
              <View key={c} style={[s.corner, s[c]]} />
            ))}
          </View>

          {mode === 'signboard' && (
            <Pressable style={s.shutterWrap} onPress={shoot}>
              <View style={s.shutterRing}>
                <View style={s.shutterCore} />
              </View>
            </Pressable>
          )}

          {mode === 'qr' && !scanned && (
            <View style={s.hintStrip}>
              <Text style={[type.meta, { color: colors.white }]}>
                Point at the code — it reads automatically
              </Text>
            </View>
          )}
        </View>
      )}

      {source === 'preview' && !!imageUri && (
        <View style={s.stage}>
          <Image source={{ uri: imageUri }} style={s.fill} resizeMode="cover" />
          {loading && (
            <View style={s.scanOverlay}>
              <ActivityIndicator color={colors.amber} />
              <Text style={[type.meta, { color: colors.white, marginTop: space.md }]}>
                Reading the board…
              </Text>
            </View>
          )}
        </View>
      )}

      {/* QR destination verdict — shown before anything can be opened */}
      {!!scanned && (
        <>
          <SectionLabel>Where this code goes</SectionLabel>
          <Card style={scanned.verdict === 'official' ? s.verdictOk : s.verdictWarn}>
            <View style={s.verdictHead}>
              <Feather
                name={
                  scanned.verdict === 'official' ? 'shield'
                    : scanned.verdict === 'payment' ? 'credit-card'
                    : scanned.verdict === 'unknown' ? 'alert-triangle'
                    : 'x-octagon'
                }
                size={15}
                color={scanned.verdict === 'official' ? colors.success : colors.warning}
              />
              <Text
                style={[
                  type.overline,
                  {
                    color: scanned.verdict === 'official' ? colors.success : colors.warning,
                    marginLeft: 7,
                  },
                ]}
              >
                {verdictLabel(scanned.verdict)}
              </Text>
            </View>

            {!!scanned.host && (
              <Text style={[type.h3, { color: colors.text, marginTop: space.md }]}>
                {scanned.host}
              </Text>
            )}

            <Text style={[type.body, { color: colors.textSecondary, marginTop: space.sm }]}>
              {scanned.reason}
            </Text>

            {scanned.warnings.length > 0 && (
              <View style={s.warnList}>
                {scanned.warnings.map((w) => (
                  <View key={w} style={s.warnRow}>
                    <Feather name="alert-circle" size={11} color={colors.textTertiary} />
                    <Text style={[type.meta, { color: colors.textTertiary, marginLeft: 6, flex: 1 }]}>
                      {w}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {/* What the page actually says, once read */}
            {!!pageSummary?.spoken && (
              <View style={s.pageFacts}>
                {pageSummary.fees.map((f) => (
                  <FactRow key={f} icon="credit-card" text={f} />
                ))}
                {pageSummary.timings.map((t) => (
                  <FactRow key={t} icon="clock" text={t} />
                ))}
                {pageSummary.closed.map((c) => (
                  <FactRow key={c} icon="slash" text={c} />
                ))}
              </View>
            )}

            <View style={{ gap: space.md, marginTop: space.xl }}>
              {scanned.safeToProceed ? (
                <>
                  <Button
                    label={reading ? 'Reading the page…' : 'Read this page aloud'}
                    icon="volume-2"
                    onPress={readPageAloud}
                    loading={reading}
                  />
                  <Button
                    label="Open official site"
                    variant="secondary"
                    icon="external-link"
                    onPress={() => Linking.openURL(scanned.url).catch(() =>
                      toast('Could not open that link', 'error'),
                    )}
                  />
                </>
              ) : (
                // Never a one-tap open for anything unverified. Reading the
                // address aloud is the safer default.
                <Button
                  label="Read the address aloud"
                  variant="secondary"
                  icon="volume-2"
                  disabled={!aiEnabled || !scanned.host}
                  onPress={() => {
                    void textToSpeech(
                      scanned.host.split('').join(' '),
                      'en-IN',
                      apiKey || undefined,
                    ).catch(() => toast('Playback failed', 'error'));
                  }}
                />
              )}
              <Button label="Scan another" variant="ghost" icon="rotate-ccw" onPress={reset} />
            </View>
          </Card>
        </>
      )}

      {/* Results */}
      {loading && source === 'preview' && (
        <View style={{ paddingHorizontal: space.xl, gap: space.md, marginTop: space.lg }}>
          <Skeleton height={64} />
          <Skeleton height={64} />
        </View>
      )}

      {!loading && !!extracted && (
        <>
          <SectionLabel>{mode === 'qr' ? 'QR contents' : 'Result'}</SectionLabel>

          {mode === 'qr' ? (
            <Card>
              {extracted.split('\n').filter(Boolean).map((line, i) => (
                <View key={i} style={s.qrRow}>
                  <Feather name="chevron-right" size={13} color={colors.textTertiary} />
                  <Text style={[type.body, { color: colors.text, flex: 1, marginLeft: space.sm }]}>
                    {line}
                  </Text>
                </View>
              ))}
              <Banner
                tone="warning"
                text="Confirm the payee name matches the conductor before you pay."
              />
            </Card>
          ) : (
            <>
              {/* Original */}
              <Card>
                <View style={s.resHead}>
                  <Text style={[type.overline, { color: colors.textTertiary }]}>
                    ON THE BOARD · {srcLang.toUpperCase()}
                  </Text>
                  <Pressable onPress={speak} disabled={speaking} style={s.speakBtn}>
                    {speaking
                      ? <ActivityIndicator size="small" color={colors.teal} />
                      : <>
                          <Feather name="volume-2" size={13} color={colors.teal} />
                          <Text style={[type.meta, { color: colors.teal, marginLeft: 5 }]}>Say it</Text>
                        </>
                    }
                  </Pressable>
                </View>
                <Text style={[type.bodyLg, { color: colors.textSecondary, marginTop: space.md }]}>
                  {extracted}
                </Text>
              </Card>

              {/* Primary translation */}
              {!!english && (
                <Card style={s.primaryCard}>
                  <Text style={[type.overline, { color: colors.amber }]}>ENGLISH</Text>
                  <Text style={[type.h2, { color: colors.text, marginTop: space.md }]}>
                    {english}
                  </Text>
                </Card>
              )}

              {!!localised && (
                <Card>
                  <Text style={[type.overline, { color: colors.textTertiary }]}>
                    {tgtLang.toUpperCase()}
                  </Text>
                  <Text style={[type.bodyLg, { color: colors.text, marginTop: space.md }]}>
                    {localised}
                  </Text>
                </Card>
              )}
            </>
          )}

          <View style={{ paddingHorizontal: space.xl, marginTop: space.xs }}>
            <Button label="Scan another" variant="secondary" icon="rotate-ccw" onPress={reset} />
          </View>
        </>
      )}

    </Screen>
  );
}

function FactRow({ icon, text }: { icon: any; text: string }) {
  return (
    <View style={s.factRow}>
      <Feather name={icon} size={12} color={colors.textTertiary} style={{ marginTop: 3 }} />
      <Text style={[type.meta, { color: colors.textSecondary, marginLeft: 8, flex: 1 }]}>
        {text}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.ink },

  segment: {
    flexDirection: 'row',
    marginHorizontal: space.xl, marginBottom: space.lg,
    backgroundColor: colors.surfaceHi,
    borderRadius: radius.full,
    padding: 3,
    borderWidth: hairline, borderColor: colors.line,
  },
  segmentItem: {
    flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: radius.full,
  },
  segmentItemActive: { backgroundColor: colors.amber },

  langRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: space.xl, marginBottom: space.lg,
  },
  langBtn:   { flex: 1 },
  langVal:   { flexDirection: 'row', alignItems: 'center', marginVertical: 3 },
  langArrow: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: colors.amberSoft,
    alignItems: 'center', justifyContent: 'center',
    marginHorizontal: space.md,
  },

  chooser:      { alignItems: 'center', paddingVertical: space.xxl },
  chooserIcon: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: colors.amberSoft,
    alignItems: 'center', justifyContent: 'center',
  },
  chooserBody: {
    color: colors.textSecondary, textAlign: 'center',
    marginTop: space.sm, maxWidth: 260,
  },

  stage: {
    marginHorizontal: space.xl, marginBottom: space.lg,
    height: 300, borderRadius: radius.xl, overflow: 'hidden',
    backgroundColor: colors.ink,
    borderWidth: hairline, borderColor: colors.line,
    position: 'relative',
    ...shadow(2),
  },
  reticle: { ...StyleSheet.absoluteFillObject, margin: space.xxl },
  corner: {
    position: 'absolute', width: 26, height: 26,
    borderColor: colors.amber,
  },
  tl: { top: 0,    left: 0,  borderTopWidth: 2.5, borderLeftWidth: 2.5,  borderTopLeftRadius: 6 },
  tr: { top: 0,    right: 0, borderTopWidth: 2.5, borderRightWidth: 2.5, borderTopRightRadius: 6 },
  bl: { bottom: 0, left: 0,  borderBottomWidth: 2.5, borderLeftWidth: 2.5,  borderBottomLeftRadius: 6 },
  br: { bottom: 0, right: 0, borderBottomWidth: 2.5, borderRightWidth: 2.5, borderBottomRightRadius: 6 },

  shutterWrap: { position: 'absolute', bottom: space.lg, alignSelf: 'center' },
  shutterRing: {
    width: 62, height: 62, borderRadius: 31,
    borderWidth: 3, borderColor: colors.white,
    alignItems: 'center', justifyContent: 'center',
  },
  shutterCore: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.white },

  scanOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(8,10,14,0.72)',
    alignItems: 'center', justifyContent: 'center',
  },

  hintStrip: {
    position: 'absolute', bottom: space.lg, alignSelf: 'center',
    paddingHorizontal: space.lg, paddingVertical: 7,
    backgroundColor: 'rgba(8,10,14,0.78)',
    borderRadius: radius.full,
  },

  verdictOk:   { borderColor: 'rgba(52,211,153,0.35)' },
  verdictWarn: { borderColor: colors.amberLine, backgroundColor: colors.surface },
  verdictHead: { flexDirection: 'row', alignItems: 'center' },
  warnList:    { marginTop: space.md, gap: 5 },
  warnRow:     { flexDirection: 'row', alignItems: 'center' },

  pageFacts: {
    marginTop: space.lg, paddingTop: space.lg, gap: space.sm,
    borderTopWidth: hairline, borderTopColor: colors.lineSoft,
  },
  factRow: { flexDirection: 'row', alignItems: 'flex-start' },

  resHead:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  speakBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: 2 },
  primaryCard: { backgroundColor: colors.amberSoft, borderColor: colors.amberLine },
  qrRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 5 },
});
