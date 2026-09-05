import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator, Platform, Linking,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRoute } from '@react-navigation/native';

import { colors, type, space, radius, hairline, shadow } from '../theme';
import {
  Screen, Header, Card, SectionLabel, Button, IconButton,
  Field, Banner, EmptyState, useToast,
} from '../ui';
import { QrCode } from '../QrCode';
import { LANGUAGES } from '../languages';
import { MONUMENTS, Monument, Party, findMonuments, isClosedOn, quote } from '../monuments';
import {
  Ticket, localProvider, upiIntent, loadTickets, saveTicket, updateTicket, removeTicket,
} from '../booking';
import { CameraView, useCameraPermissions } from 'expo-camera';

import { useApiKey } from '../ApiKeyContext';
import { useSettings } from '../settingsStore';
import {
  parseOfficialTicket, describeCapture, describeAmount,
} from '../ticketing/officialTicket';
import { translate, speechToText, synthesize, playAudio } from '../api';
import { useRecorder } from '../useRecorder';
import { unlockAudio } from '../audio';

type Step = 'site' | 'when' | 'party' | 'review' | 'pay' | 'capture' | 'done';

const STEP_ORDER: Step[] = ['site', 'when', 'party', 'review', 'pay', 'capture', 'done'];

const NUMBER_WORDS: Record<string, number> = {
  zero: 0, none: 0, one: 1, a: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19, twenty: 20,
};

/** Pull a count out of free text: digits first, then English number words. */
function parseCount(text: string): number | null {
  const digits = text.match(/\d+/);
  if (digits) {
    const n = parseInt(digits[0], 10);
    if (n >= 0 && n <= 50) return n;
  }
  for (const word of text.toLowerCase().split(/[^a-z]+/)) {
    if (word in NUMBER_WORDS) return NUMBER_WORDS[word];
  }
  return null;
}

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function prettyDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

export default function TicketsScreen() {
  const { apiKey, aiEnabled, langPrefs, upi } = useApiKey();
  const settings = useSettings();
  const toast = useToast();
  const { listen, recordState } = useRecorder();

  const key = apiKey || undefined;
  const lang = langPrefs.mine;
  const langCode = LANGUAGES[lang] ?? 'en-IN';

  const [mode, setMode]       = useState<'wallet' | 'booking'>('wallet');
  const [step, setStep]       = useState<Step>('site');
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [openQr, setOpenQr]   = useState<string | null>(null);

  // Draft booking
  const [site, setSite]       = useState<Monument | null>(null);
  const [date, setDate]       = useState<string>(isoDate(new Date()));
  const [party, setParty]     = useState<Party>({
    adults: 1, children: 0, foreign: false, includeSurcharge: false,
  });
  const [visitor, setVisitor] = useState('');
  const [search, setSearch]   = useState('');
  const [draft, setDraft]     = useState<Ticket | null>(null);

  // Benign processing chrome, kept deliberately quiet.
  const [status, setStatus]   = useState<string | null>(null);
  const [speaking, setSpeak]  = useState(false);

  /**
   * Payment is the one step that must not be quiet. The amount is spoken and
   * has to be acknowledged before the payment code is shown at all, so a
   * non-reading user cannot approve a sum they never heard.
   */
  const [amountAcknowledged, setAcknowledged] = useState(false);
  const [scanningTicket, setScanningTicket]   = useState(false);
  const [camPermission, requestCamPermission] = useCameraPermissions();

  const spokenFor = useRef<Step | null>(null);

  useEffect(() => { void loadTickets().then(setTickets); }, []);

  // "book a ticket to the Taj Mahal" arrives here as navigation params.
  const params = useRoute().params as
    | { monumentId?: string; startBooking?: boolean }
    | undefined;
  const handledParams = useRef<string | null>(null);

  useEffect(() => {
    if (!params?.startBooking) return;
    const token = `${params.monumentId ?? ''}`;
    if (handledParams.current === token) return;
    handledParams.current = token;

    const preset = params.monumentId
      ? MONUMENTS.find((m) => m.id === params.monumentId)
      : undefined;

    setMode('booking');
    spokenFor.current = null;
    setDraft(null);
    setAcknowledged(false);
    setScanningTicket(false);
    setSearch('');
    setParty({ adults: 1, children: 0, foreign: false, includeSurcharge: false });
    setDate(isoDate(new Date()));

    if (preset) {
      setSite(preset);
      setStep('when');       // monument already chosen, skip ahead
    } else {
      setSite(null);
      setStep('site');
    }
  }, [params]);

  // ── voice ──────────────────────────────────────────────────────────────────

  /** Speak an English sentence in the traveller's own language. */
  const say = useCallback(async (english: string) => {
    if (!aiEnabled) return;
    setSpeak(true);
    try {
      const text = langCode === 'en-IN'
        ? english
        : await translate(english, 'en-IN', langCode, key);
      const audio = await synthesize(text, langCode, key);
      if (audio) await playAudio(audio, `${langCode}:${text}`);
    } catch {
      /* silent: narration is an aid, not the mechanism */
    } finally {
      setSpeak(false);
    }
  }, [aiEnabled, langCode, key]);

  /** Capture one spoken answer and hand back English text to parse. */
  const askByVoice = useCallback(async (): Promise<string | null> => {
    if (!aiEnabled) { toast('Voice needs the AI backend configured', 'error'); return null; }
    await unlockAudio();
    const clip = await listen({ silenceMs: 700, noSpeechMs: 9000, maxMs: 12000 });
    if (!clip) return null;

    setStatus('Listening back…');
    try {
      const heard = await speechToText(clip.uri, clip.mimeType, langCode, key);
      if (!heard.trim()) { toast('Did not catch that', 'error'); return null; }
      if (langCode === 'en-IN') return heard;
      return await translate(heard, langCode, 'en-IN', key);
    } catch (e: any) {
      toast(e?.message?.slice(0, 90) ?? 'Could not understand', 'error');
      return null;
    } finally {
      setStatus(null);
    }
  }, [aiEnabled, listen, langCode, key, toast]);

  // ── step narration ─────────────────────────────────────────────────────────

  const prompt = useCallback((s: Step): string => {
    switch (s) {
      case 'site':  return 'Which monument would you like to visit?';
      case 'when':  return `When would you like to visit ${site?.name ?? 'the monument'}?`;
      case 'party': return 'How many adults are travelling?';
      case 'review': {
        if (!site) return '';
        const { total } = quote(site, party);
        const kids = party.children === 1 ? '1 child' : `${party.children} children`;
        return `${site.name} in ${site.city}, on ${prettyDate(date)}, for ${party.adults} adult${party.adults === 1 ? '' : 's'}${party.children ? ` and ${kids}` : ''}. The total is ${total} rupees. Is that correct?`;
      }
      case 'pay': {
        const amount = draft?.amount ?? 0;
        if (!amountAcknowledged) {
          return describeAmount(amount, draft?.monumentName ?? 'this visit');
        }
        return `Please pay ${amount} rupees. Open your bank app, scan the code on screen, and enter your own UPI PIN. This app never sees your PIN.`;
      }
      case 'capture':
        return 'Now point the camera at the QR code on the ticket you were issued, so I can keep it for the gate.';
      case 'done': return 'Your booking is saved. Show the code at the gate.';
    }
  }, [site, party, date, draft, amountAcknowledged]);

  // Read each new step aloud once, so a non-reading user is never stranded.
  useEffect(() => {
    if (mode !== 'booking' || !settings.narrateSteps) return;
    if (spokenFor.current === step) return;
    spokenFor.current = step;
    const line = prompt(step);
    if (line) void say(line);
  }, [mode, step, prompt, say, settings.narrateSteps]);

  // ── actions ────────────────────────────────────────────────────────────────

  const startBooking = () => {
    setMode('booking');
    setStep('site');
    spokenFor.current = null;
    setSite(null);
    setDraft(null);
    setAcknowledged(false);
    setScanningTicket(false);
    setSearch('');
    setParty({ adults: 1, children: 0, foreign: false, includeSurcharge: false });
    setDate(isoDate(new Date()));
  };

  const pickSiteByVoice = async () => {
    const heard = await askByVoice();
    if (!heard) return;
    const matches = findMonuments(heard);
    if (matches.length === 0) {
      await say(`I could not find a monument called ${heard}. Please try again.`);
      return;
    }
    setSite(matches[0]);
    setSearch('');
    spokenFor.current = null;
    setStep('when');
  };

  const pickPartyByVoice = async () => {
    const heard = await askByVoice();
    if (!heard) return;
    const n = parseCount(heard);
    if (n === null || n < 1) {
      await say('Please say how many adults, for example: two.');
      return;
    }
    setParty((p) => ({ ...p, adults: Math.min(n, 20) }));
    spokenFor.current = null;
    setStep('review');
  };

  const reserve = async () => {
    if (!site) return;
    setStatus('Reserving…');
    try {
      const ticket = await localProvider.reserve({
        monument: site,
        date,
        party,
        visitorName: visitor.trim() || 'Guest',
      });
      setDraft(ticket);
      await saveTicket(ticket);
      setTickets(await loadTickets());
      spokenFor.current = null;
      setStep(ticket.amount === 0 ? 'done' : 'pay');
    } catch (e: any) {
      toast(e?.message ?? 'Could not reserve', 'error');
    } finally {
      setStatus(null);
    }
  };

  const attestPaid = async () => {
    if (!draft) return;
    await updateTicket(draft.id, {
      status: 'paid',
      paymentVerified: false,
    });
    const next = await loadTickets();
    setTickets(next);
    setDraft(next.find((t) => t.id === draft.id) ?? draft);
    spokenFor.current = null;
    // Paying is not the end: the ticket the authority issued still has to be
    // captured, or there is nothing valid to show at the gate.
    setStep('capture');
  };

  /**
   * Stores the QR from the issued ticket. The payload is kept verbatim — it is
   * reproduced at the gate, and any reformatting risks a code the scanner
   * rejects.
   */
  const onTicketScanned = useCallback(async ({ data }: { data: string }) => {
    if (!draft || !scanningTicket) return;

    const captured = parseOfficialTicket(data);
    if (!captured) {
      toast('That code is too short to be a ticket', 'error');
      return;
    }

    setScanningTicket(false);
    await updateTicket(draft.id, {
      officialTicket: captured,
      official: true,
      issuer: captured.issuerHost ?? 'Ticketing authority',
    });

    const next = await loadTickets();
    setTickets(next);
    setDraft(next.find((t) => t.id === draft.id) ?? draft);
    spokenFor.current = null;
    setStep('done');

    void say(describeCapture(captured));
  }, [draft, scanningTicket, say, toast]);

  const discard = async (id: string) => {
    setTickets(await removeTicket(id));
    toast('Booking removed', 'info');
  };

  const stepIndex = STEP_ORDER.indexOf(step);
  const upiLink = draft && upi
    ? upiIntent(upi, draft.amount, `${draft.monumentName} ${draft.date}`, draft.paymentRef)
    : null;

  // ── wallet ─────────────────────────────────────────────────────────────────

  if (mode === 'wallet') {
    return (
      <Screen scroll>
        <Header
          title="Tickets"
          subtitle="Book by voice · show at the gate"
          right={<IconButton icon="plus" tone="amber" onPress={startBooking} />}
        />

        <Banner
          tone="warning"
          text="Bookings here are this app’s own records, not government-issued tickets. No authorised ticketing API is connected yet."
        />

        {tickets.length === 0 ? (
          <EmptyState
            icon="bookmark"
            title="No bookings yet"
            body="Plan a monument visit by voice — the concierge reads every step aloud and shows a code for the gate."
            action={<Button label="Book by voice" icon="mic" onPress={startBooking} />}
          />
        ) : (
          <>
            <SectionLabel>Your bookings</SectionLabel>
            {tickets.map((t) => (
              <Card key={t.id} padded={false} style={s.ticketCard}>
                <View style={s.ticketHead}>
                  <View style={s.flex}>
                    <Text style={[type.h3, { color: colors.text }]}>{t.monumentName}</Text>
                    <Text style={[type.meta, { color: colors.textSecondary, marginTop: 3 }]}>
                      {t.city} · {prettyDate(t.date)}
                    </Text>
                    <Text style={[type.meta, { color: colors.textTertiary, marginTop: 2 }]}>
                      {t.party.adults} adult{t.party.adults === 1 ? '' : 's'}
                      {t.party.children ? ` · ${t.party.children} child` : ''}
                      {' · '}₹{t.amount}
                    </Text>
                  </View>
                  <View style={[s.statusPill, t.officialTicket && s.statusPillPaid]}>
                    <Text
                      style={[
                        type.overline,
                        { color: t.officialTicket ? colors.success : colors.warning },
                      ]}
                    >
                      {/* Whether the gate can scan it matters more than whether
                          we were told it was paid. */}
                      {t.officialTicket ? 'TICKETED' : t.status === 'paid' ? 'NO TICKET YET' : 'UNPAID'}
                    </Text>
                  </View>
                </View>

                {openQr === t.id && (
                  <View style={s.qrPane}>
                    <QrCode
                      value={t.officialTicket?.payload ?? t.qrPayload}
                      size={180}
                      label={
                        t.officialTicket
                          ? t.officialTicket.reference
                            ? `Ref ${t.officialTicket.reference}`
                            : 'Issued ticket'
                          : `Ref ${t.id}`
                      }
                    />
                    {t.officialTicket ? (
                      <Text style={[type.meta, s.qrCaveat, { color: colors.success }]}>
                        Issued ticket{t.officialTicket.issuerHost ? ` from ${t.officialTicket.issuerHost}` : ''} — show this at the gate.
                      </Text>
                    ) : settings.showQrCaveats ? (
                      <Text style={[type.meta, s.qrCaveat]}>
                        Issued by {t.issuer}. Not an ASI ticket — carry official ID and expect
                        to buy at the counter.
                      </Text>
                    ) : null}
                  </View>
                )}

                <View style={s.ticketActions}>
                  <Pressable style={s.ticketAction} onPress={() => setOpenQr(openQr === t.id ? null : t.id)}>
                    <Feather
                      name={openQr === t.id ? 'chevron-up' : 'maximize'}
                      size={14}
                      color={colors.teal}
                    />
                    <Text style={[type.meta, { color: colors.teal, marginLeft: 6 }]}>
                      {openQr === t.id ? 'Hide code' : 'Show code'}
                    </Text>
                  </Pressable>

                  <Pressable
                    style={s.ticketAction}
                    onPress={() => say(
                      `${t.monumentName} in ${t.city}, on ${prettyDate(t.date)}, for ${t.party.adults} adults. Amount ${t.amount} rupees. Status ${t.status}.`,
                    )}
                  >
                    <Feather name="volume-2" size={14} color={colors.teal} />
                    <Text style={[type.meta, { color: colors.teal, marginLeft: 6 }]}>Read aloud</Text>
                  </Pressable>

                  <Pressable style={s.ticketAction} onPress={() => discard(t.id)}>
                    <Feather name="trash-2" size={14} color={colors.textTertiary} />
                  </Pressable>
                </View>
              </Card>
            ))}
          </>
        )}
      </Screen>
    );
  }

  // ── booking flow ───────────────────────────────────────────────────────────

  return (
    <Screen scroll>
      <Header
        title="Book a visit"
        subtitle={`Step ${stepIndex + 1} of ${STEP_ORDER.length}`}
        right={<IconButton icon="x" onPress={() => setMode('wallet')} />}
      />

      {/* Progress — minimal on purpose */}
      <View style={s.progress}>
        {STEP_ORDER.map((sName, i) => (
          <View
            key={sName}
            style={[s.progressSeg, i <= stepIndex && s.progressSegDone]}
          />
        ))}
      </View>

      {/* Spoken prompt, with a replay control */}
      <View style={s.promptRow}>
        <Text style={[type.h3, { color: colors.text, flex: 1 }]}>{prompt(step)}</Text>
        <IconButton
          icon={speaking ? 'loader' : 'volume-2'}
          tone="amber"
          size={38}
          onPress={() => say(prompt(step))}
          disabled={speaking || !aiEnabled}
        />
      </View>

      {/* Quiet status line for benign processing */}
      {!!status && (
        <View style={s.statusLine}>
          <ActivityIndicator size="small" color={colors.textTertiary} />
          <Text style={[type.meta, { color: colors.textTertiary, marginLeft: 8 }]}>{status}</Text>
        </View>
      )}

      {step === 'site' && (
        <>
          <View style={{ paddingHorizontal: space.xl, marginBottom: space.lg }}>
            <Button
              label={recordState === 'recording' ? 'Listening…' : 'Say the monument name'}
              icon="mic"
              onPress={pickSiteByVoice}
              loading={recordState === 'recording'}
              disabled={!aiEnabled}
            />
          </View>

          <SectionLabel>Or choose from the list</SectionLabel>
          <View style={{ paddingHorizontal: space.xl, marginBottom: space.md }}>
            <Field
              value={search}
              onChangeText={setSearch}
              placeholder="Search monuments or cities"
              icon="search"
            />
          </View>

          {findMonuments(search).slice(0, 8).map((m) => (
            <Pressable
              key={m.id}
              onPress={() => { setSite(m); spokenFor.current = null; setStep('when'); }}
              style={({ pressed }) => [s.siteRow, pressed && { backgroundColor: colors.surfaceHi }]}
            >
              <View style={s.flex}>
                <Text style={[type.label, { color: colors.text }]}>{m.name}</Text>
                <Text style={[type.meta, { color: colors.textTertiary, marginTop: 2 }]}>
                  {m.city}, {m.state} · ₹{m.feeIndian} · {m.authority}
                </Text>
              </View>
              <Feather name="chevron-right" size={16} color={colors.textTertiary} />
            </Pressable>
          ))}
        </>
      )}

      {step === 'when' && !!site && (
        <>
          <View style={s.dateRow}>
            {[0, 1, 2, 3].map((offset) => {
              const d = new Date();
              d.setDate(d.getDate() + offset);
              const iso = isoDate(d);
              const closed = isClosedOn(site, d);
              const active = date === iso;
              return (
                <Pressable
                  key={iso}
                  onPress={() => setDate(iso)}
                  style={[s.dateCard, active && s.dateCardActive, closed && { opacity: 0.45 }]}
                >
                  <Text style={[type.overline, { color: active ? colors.amber : colors.textTertiary }]}>
                    {offset === 0 ? 'TODAY' : offset === 1 ? 'TOMORROW' : d.toLocaleDateString(undefined, { weekday: 'short' }).toUpperCase()}
                  </Text>
                  <Text style={[type.h3, { color: active ? colors.text : colors.textSecondary, marginTop: 4 }]}>
                    {d.getDate()}
                  </Text>
                  {closed && (
                    <Text style={[type.meta, { color: colors.danger, marginTop: 2 }]}>shut</Text>
                  )}
                </Pressable>
              );
            })}
          </View>

          {isClosedOn(site, new Date(`${date}T00:00:00`)) && (
            <Banner tone="danger" text={`${site.name} is closed that day. Pick another date.`} />
          )}

          <View style={{ paddingHorizontal: space.xl }}>
            <Button
              label="Continue"
              icon="arrow-right"
              onPress={() => { spokenFor.current = null; setStep('party'); }}
              disabled={isClosedOn(site, new Date(`${date}T00:00:00`))}
            />
          </View>
        </>
      )}

      {step === 'party' && !!site && (
        <>
          <View style={{ paddingHorizontal: space.xl, marginBottom: space.lg }}>
            <Button
              label={recordState === 'recording' ? 'Listening…' : 'Say how many adults'}
              icon="mic"
              onPress={pickPartyByVoice}
              loading={recordState === 'recording'}
              disabled={!aiEnabled}
            />
          </View>

          <Card>
            <Counter
              label="Adults"
              value={party.adults}
              min={1}
              onChange={(n) => setParty((p) => ({ ...p, adults: n }))}
            />
            <Counter
              label={`Children (under ${site.freeUnderAge}, free)`}
              value={party.children}
              min={0}
              onChange={(n) => setParty((p) => ({ ...p, children: n }))}
            />

            <Toggle
              label="Foreign national"
              hint={`₹${site.feeForeign} instead of ₹${site.feeIndian} per adult`}
              value={party.foreign}
              onChange={(v) => setParty((p) => ({ ...p, foreign: v }))}
            />

            {!!site.surcharge && (
              <Toggle
                label={site.surcharge.label}
                hint={`Adds ₹${site.surcharge.amount} per adult`}
                value={party.includeSurcharge}
                onChange={(v) => setParty((p) => ({ ...p, includeSurcharge: v }))}
              />
            )}
          </Card>

          <View style={{ paddingHorizontal: space.xl }}>
            <Button
              label="Continue"
              icon="arrow-right"
              onPress={() => { spokenFor.current = null; setStep('review'); }}
            />
          </View>
        </>
      )}

      {step === 'review' && !!site && (
        <>
          <Card>
            <Text style={[type.h2, { color: colors.text }]}>{site.name}</Text>
            <Text style={[type.meta, { color: colors.textSecondary, marginTop: 3 }]}>
              {site.city}, {site.state} · {prettyDate(date)} · {site.opens}–{site.closes}
            </Text>
            <Text style={[type.meta, { color: colors.textTertiary, marginTop: space.sm }]}>
              {site.blurb}
            </Text>

            <View style={s.rule} />

            {quote(site, party).lines.map((l) => (
              <View key={l.label} style={s.quoteRow}>
                <Text style={[type.body, { color: colors.textSecondary, flex: 1 }]}>
                  {l.label} × {l.qty}
                </Text>
                <Text style={[type.body, { color: colors.text }]}>
                  {l.total === 0 ? 'Free' : `₹${l.total}`}
                </Text>
              </View>
            ))}

            <View style={s.rule} />

            <View style={s.quoteRow}>
              <Text style={[type.h3, { color: colors.text, flex: 1 }]}>Total</Text>
              <Text style={[type.h2, { color: colors.amber }]}>
                ₹{quote(site, party).total}
              </Text>
            </View>
          </Card>

          <SectionLabel>Visitor name</SectionLabel>
          <View style={{ paddingHorizontal: space.xl, marginBottom: space.md }}>
            <Field
              value={visitor}
              onChangeText={setVisitor}
              placeholder="Name for the booking"
              icon="user"
            />
            <Text style={[type.meta, { color: colors.textTertiary, marginTop: space.sm }]}>
              Stored only on this device. Never uploaded.
            </Text>
          </View>

          <View style={{ paddingHorizontal: space.xl, gap: space.md }}>
            <Button label="Confirm and reserve" icon="check" onPress={reserve} />
            <Button
              label="Change something"
              variant="secondary"
              onPress={() => { spokenFor.current = null; setStep('site'); }}
            />
          </View>
        </>
      )}

      {step === 'pay' && !!draft && (
        <>
          {/* Payment is the one thing that must never be understated. */}
          <Card style={s.payCard}>
            <Text style={[type.overline, { color: colors.amber }]}>AMOUNT TO PAY</Text>
            <Text style={[s.payAmount]}>₹{draft.amount}</Text>
            <Text style={[type.meta, { color: colors.textSecondary, textAlign: 'center' }]}>
              {draft.monumentName} · {prettyDate(draft.date)}
            </Text>

            <View style={s.rule} />

            {!amountAcknowledged ? (
              // The payment code is withheld until the amount has been heard
              // and acknowledged. This is the one gate that must not be quiet.
              <View style={{ width: '100%', gap: space.md, marginTop: space.lg }}>
                <Button
                  label={speaking ? 'Reading it out…' : 'Read the amount to me'}
                  variant="secondary"
                  icon="volume-2"
                  onPress={() => say(describeAmount(draft.amount, draft.monumentName))}
                  loading={speaking}
                  disabled={!aiEnabled}
                />
                <Button
                  label={`Confirm ₹${draft.amount}`}
                  icon="check"
                  onPress={() => setAcknowledged(true)}
                />
                <Button
                  label="Go back"
                  variant="ghost"
                  onPress={() => { spokenFor.current = null; setStep('review'); }}
                />
              </View>
            ) : upiLink ? (
              <>
                <QrCode value={upiLink} size={190} label="Scan with any UPI app" />
                <Text style={[type.meta, s.payHelp]}>
                  Open Google Pay, PhonePe, Paytm or your bank app, scan this code, and
                  enter your own UPI PIN. This app never sees your PIN or card details.
                </Text>

                {Platform.OS === 'web' && (
                  <Button
                    label="Open a UPI app on this device"
                    variant="secondary"
                    icon="external-link"
                    onPress={() => Linking.openURL(upiLink).catch(() =>
                      toast('No UPI app found here — scan the code with your phone', 'info'),
                    )}
                    style={{ marginTop: space.lg }}
                  />
                )}
              </>
            ) : (
              <Banner
                tone="warning"
                text="No UPI payee configured for this deployment, so payment cannot be collected. Set UPI_PAYEE_VPA to enable it."
              />
            )}
          </Card>

          <Card>
            <Text style={[type.label, { color: colors.text }]}>After you have paid</Text>
            <Text style={[type.meta, { color: colors.textSecondary, marginTop: 4 }]}>
              This app cannot confirm settlement on its own — that needs a payment gateway
              webhook. Marking it paid records your word for it, and your bank’s own SMS is
              the real receipt. Keep it.
            </Text>
            <Button
              label="I have paid"
              icon="check-circle"
              onPress={attestPaid}
              disabled={!upiLink}
              style={{ marginTop: space.lg }}
            />
            <Button
              label="Pay at the counter instead"
              variant="ghost"
              onPress={() => { spokenFor.current = null; setStep('done'); }}
              style={{ marginTop: space.sm }}
            />
          </Card>
        </>
      )}

      {step === 'capture' && !!draft && (
        <>
          <Card>
            <Text style={[type.label, { color: colors.text }]}>
              Capture the ticket you were issued
            </Text>
            <Text style={[type.meta, { color: colors.textSecondary, marginTop: 4 }]}>
              The gate scans the QR printed on your ticket — on the PDF, the email, or a
              printout. Point the camera at it and I will keep it for you.
            </Text>

            {scanningTicket ? (
              <View style={s.captureStage}>
                <CameraView
                  style={s.captureFill}
                  facing="back"
                  barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                  onBarcodeScanned={onTicketScanned}
                />
                <View style={s.captureHint}>
                  <Text style={[type.meta, { color: colors.white }]}>
                    Point at the ticket’s QR code
                  </Text>
                </View>
              </View>
            ) : null}

            <View style={{ gap: space.md, marginTop: space.lg }}>
              <Button
                label={scanningTicket ? 'Stop scanning' : 'Scan the ticket QR'}
                icon={scanningTicket ? 'x' : 'camera'}
                variant={scanningTicket ? 'secondary' : 'primary'}
                onPress={async () => {
                  if (scanningTicket) { setScanningTicket(false); return; }
                  if (!camPermission?.granted) {
                    const res = await requestCamPermission();
                    if (!res.granted) { toast('Camera blocked', 'error'); return; }
                  }
                  setScanningTicket(true);
                }}
              />
              <Button
                label="I don’t have it yet"
                variant="ghost"
                onPress={() => { spokenFor.current = null; setStep('done'); }}
              />
            </View>
          </Card>

          <Banner
            tone="info"
            text="Until the issued ticket is captured, this booking is only a reminder — the gate cannot scan it."
          />
        </>
      )}

      {step === 'done' && !!draft && (
        <>
          <Card style={{ alignItems: 'center' }}>
            <View style={[s.doneMark, !draft.officialTicket && s.doneMarkPending]}>
              <Feather
                name={draft.officialTicket ? 'check' : 'clock'}
                size={22}
                color={colors.textInverse}
              />
            </View>
            <Text style={[type.h2, { color: colors.text, marginTop: space.lg }]}>
              {draft.officialTicket ? 'Ticket saved' : 'Booking saved'}
            </Text>
            <Text style={[type.meta, { color: colors.textSecondary, marginTop: 4, textAlign: 'center' }]}>
              {draft.monumentName} · {prettyDate(draft.date)} · ₹{draft.amount}
            </Text>

            <View style={{ marginTop: space.xl }}>
              {/* The issued ticket's own code when we have it; ours only until then. */}
              <QrCode
                value={draft.officialTicket?.payload ?? draft.qrPayload}
                size={190}
                label={
                  draft.officialTicket
                    ? draft.officialTicket.reference
                      ? `Ref ${draft.officialTicket.reference}`
                      : draft.officialTicket.issuerHost ?? 'Issued ticket'
                    : `Ref ${draft.id}`
                }
              />
            </View>
          </Card>

          {draft.officialTicket ? (
            <Banner
              tone="success"
              text={`Issued ticket stored${draft.officialTicket.issuerHost ? ` from ${draft.officialTicket.issuerHost}` : ''}. Show this code at the gate.`}
            />
          ) : (
            <Banner
              tone="warning"
              text="This is not a government-issued ticket. Carry photo ID and be ready to buy at the counter."
            />
          )}

          <View style={{ paddingHorizontal: space.xl, gap: space.md }}>
            {!draft.officialTicket && (
              <Button
                label="Capture the issued ticket"
                icon="camera"
                onPress={() => { spokenFor.current = null; setStep('capture'); }}
              />
            )}
            <Button label="Read this to me" variant="secondary" icon="volume-2" onPress={() => say(prompt('done'))} />
            <Button label="Back to my tickets" onPress={() => setMode('wallet')} />
          </View>
        </>
      )}
    </Screen>
  );
}

// ─── small controls ──────────────────────────────────────────────────────────

function Counter({
  label, value, min, onChange,
}: {
  label: string; value: number; min: number; onChange: (n: number) => void;
}) {
  return (
    <View style={s.counterRow}>
      <Text style={[type.body, { color: colors.text, flex: 1 }]}>{label}</Text>
      <IconButton icon="minus" size={34} onPress={() => onChange(Math.max(min, value - 1))} />
      <Text style={[type.h3, s.counterValue]}>{value}</Text>
      <IconButton icon="plus" size={34} onPress={() => onChange(Math.min(20, value + 1))} />
    </View>
  );
}

function Toggle({
  label, hint, value, onChange,
}: {
  label: string; hint: string; value: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <Pressable style={s.toggleRow} onPress={() => onChange(!value)}>
      <View style={s.flex}>
        <Text style={[type.body, { color: colors.text }]}>{label}</Text>
        <Text style={[type.meta, { color: colors.textTertiary, marginTop: 2 }]}>{hint}</Text>
      </View>
      <View style={[s.switchTrack, value && s.switchTrackOn]}>
        <View style={[s.switchKnob, value && s.switchKnobOn]} />
      </View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1 },

  progress: { flexDirection: 'row', gap: 4, paddingHorizontal: space.xl, marginBottom: space.lg },
  progressSeg: {
    flex: 1, height: 3, borderRadius: 2, backgroundColor: colors.surfaceHi,
  },
  progressSegDone: { backgroundColor: colors.amber },

  promptRow: {
    flexDirection: 'row', alignItems: 'center', gap: space.md,
    paddingHorizontal: space.xl, marginBottom: space.lg,
  },
  statusLine: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: space.xl, marginBottom: space.md,
  },

  siteRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: space.xl, paddingVertical: space.md,
    borderBottomWidth: hairline, borderBottomColor: colors.lineSoft,
  },

  dateRow: { flexDirection: 'row', gap: space.md, paddingHorizontal: space.xl, marginBottom: space.lg },
  dateCard: {
    flex: 1, alignItems: 'center', paddingVertical: space.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.line,
  },
  dateCardActive: { borderColor: colors.amberLine, backgroundColor: colors.amberSoft },

  counterRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.sm },
  counterValue: { color: colors.text, minWidth: 34, textAlign: 'center' },

  toggleRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: space.md,
    borderTopWidth: hairline, borderTopColor: colors.lineSoft,
    marginTop: space.sm,
  },
  switchTrack: {
    width: 44, height: 26, borderRadius: 13,
    backgroundColor: colors.surfaceHi,
    borderWidth: hairline, borderColor: colors.line,
    justifyContent: 'center', paddingHorizontal: 3,
  },
  switchTrackOn: { backgroundColor: colors.amberSoft, borderColor: colors.amberLine },
  switchKnob: {
    width: 18, height: 18, borderRadius: 9, backgroundColor: colors.textTertiary,
  },
  switchKnobOn: { backgroundColor: colors.amber, alignSelf: 'flex-end' },

  rule: { height: hairline, backgroundColor: colors.line, marginVertical: space.lg },
  quoteRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 5 },

  payCard: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.amberLine },
  payAmount: {
    ...type.display,
    fontSize: 44, lineHeight: 50,
    color: colors.text,
    marginTop: space.sm, marginBottom: space.xs,
  },
  payHelp: {
    ...type.meta,
    color: colors.textSecondary, textAlign: 'center',
    marginTop: space.lg, maxWidth: 300,
  },

  ticketCard: { overflow: 'hidden' },
  ticketHead: { flexDirection: 'row', alignItems: 'flex-start', padding: space.lg },
  statusPill: {
    paddingHorizontal: space.md, paddingVertical: 5,
    borderRadius: radius.full,
    backgroundColor: colors.warningSoft,
  },
  statusPillPaid: { backgroundColor: colors.successSoft },
  qrPane: { alignItems: 'center', paddingBottom: space.lg, paddingHorizontal: space.lg },
  qrCaveat: {
    ...type.meta,
    color: colors.textTertiary, textAlign: 'center',
    marginTop: space.md, maxWidth: 280,
  },
  ticketActions: {
    flexDirection: 'row', alignItems: 'center', gap: space.xl,
    paddingHorizontal: space.lg, paddingVertical: space.md,
    borderTopWidth: hairline, borderTopColor: colors.lineSoft,
    backgroundColor: colors.surfaceHi,
  },
  ticketAction: { flexDirection: 'row', alignItems: 'center' },

  doneMark: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: colors.success,
    alignItems: 'center', justifyContent: 'center',
    ...shadow(1),
  },
  doneMarkPending: { backgroundColor: colors.warning },

  captureStage: {
    height: 240, marginTop: space.lg,
    borderRadius: radius.lg, overflow: 'hidden',
    backgroundColor: colors.ink,
    borderWidth: hairline, borderColor: colors.line,
  },
  captureFill: { flex: 1 },
  captureHint: {
    position: 'absolute', bottom: space.md, alignSelf: 'center',
    paddingHorizontal: space.lg, paddingVertical: 6,
    backgroundColor: 'rgba(8,10,14,0.78)',
    borderRadius: radius.full,
  },
});
