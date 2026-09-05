import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import {
  MONUMENTS, Monument, Party, isClosedOn, isFreeEntry, monumentById, quote,
} from '../monuments';
import { findMonuments } from '../monumentSearch';
import {
  Ticket, localProvider, upiIntent, loadTickets, saveTicket, updateTicket, removeTicket,
} from '../booking';
import { CameraView, useCameraPermissions } from 'expo-camera';

import { useApiKey } from '../ApiKeyContext';
import { useSettings } from '../settingsStore';
import {
  parseOfficialTicket, describeCapture, describeAmount,
} from '../ticketing/officialTicket';
import {
  interpret, describeOptions, parseAmendTarget, parseOrdinalChoice,
} from '../ticketing/conversation';
import { translate, speechToText, synthesize, playAudio } from '../api';
import { useRecorder } from '../useRecorder';
import { unlockAudio } from '../audio';
import { humanError } from '../errors';

type Step = 'site' | 'when' | 'party' | 'review' | 'pay' | 'capture' | 'done';

const STEP_ORDER: Step[] = ['site', 'when', 'party', 'review', 'pay', 'capture', 'done'];

const MONUMENT_COUNT = MONUMENTS.length;

const WEEKDAY_NAMES = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
];

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
  const { listen, cancel, recordState } = useRecorder();

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

  /**
   * `talking` is a ref, not state: the loop tests it between every await and
   * must see the Stop control's write immediately, which a re-render would
   * not guarantee. `conversing` exists only so the button can redraw.
   */
  const talking = useRef(false);
  const [conversing, setConversing] = useState(false);
  const pendingConverse = useRef<Step | null>(null);

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

    const preset = params.monumentId ? monumentById(params.monumentId) : undefined;

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
      pendingConverse.current = 'when';
    } else {
      setSite(null);
      setStep('site');
      pendingConverse.current = 'site';
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
      toast(humanError(e, 'Could not understand'), 'error');
      return null;
    } finally {
      setStatus(null);
    }
  }, [aiEnabled, listen, langCode, key, toast]);

  // ── step narration ─────────────────────────────────────────────────────────

  /**
   * The question for a step, built from values passed in rather than read from
   * state. The conversation loop runs ahead of React's re-renders, so it needs
   * to ask about the answer it just received, not the one on screen.
   */
  const promptFor = useCallback((s: Step, ctx: {
    site: Monument | null;
    date: string;
    party: Party;
    draft: Ticket | null;
    acknowledged: boolean;
  }): string => {
    switch (s) {
      case 'site':  return 'Which monument would you like to visit?';
      case 'when': {
        const name = ctx.site?.name ?? 'the monument';
        // Saying the closed day up front saves a rejected answer and a retry.
        const shut = ctx.site?.closedDay !== undefined
          ? ` It is closed on ${WEEKDAY_NAMES[ctx.site.closedDay]}s.`
          : '';
        return `When would you like to visit ${name}?${shut}`;
      }
      case 'party':
        return 'How many people are coming? You can say, for example, two adults and one child.';
      case 'review': {
        if (!ctx.site) return '';
        const { total } = quote(ctx.site, ctx.party);
        const kids = ctx.party.children === 1 ? '1 child' : `${ctx.party.children} children`;
        // The nationality is spoken here on purpose: it is the difference
        // between 50 rupees and 1100 at the Taj, and it is never asked about
        // directly, so review is the only place it can be caught.
        const rate = ctx.party.foreign ? ' at the foreign national rate' : ' at the Indian national rate';
        return `${ctx.site.name} in ${ctx.site.city}, on ${prettyDate(ctx.date)}, for ${ctx.party.adults} adult${ctx.party.adults === 1 ? '' : 's'}${ctx.party.children ? ` and ${kids}` : ''}${rate}. The total is ${total} rupees. Shall I reserve it?`;
      }
      case 'pay': {
        const amount = ctx.draft?.amount ?? 0;
        if (!ctx.acknowledged) {
          return `${describeAmount(amount, ctx.draft?.monumentName ?? 'this visit')} Shall I show the payment code?`;
        }
        return `Please pay ${amount} rupees. Open your bank app, scan the code on screen, and enter your own UPI PIN. This app never sees your PIN. Say “I have paid” when it is done.`;
      }
      case 'capture':
        return 'Now point the camera at the QR code on the ticket you were issued, so I can keep it for the gate. Say “ready” when you have it in front of you.';
      case 'done': return 'Your booking is saved. Show the code at the gate.';
    }
  }, []);

  /** The prompt for what is currently on screen. */
  const prompt = useCallback(
    (s: Step) => promptFor(s, { site, date, party, draft, acknowledged: amountAcknowledged }),
    [promptFor, site, date, party, draft, amountAcknowledged],
  );

  /** What to offer when someone says "I don't know". */
  const helpFor = (s: Step): string => {
    switch (s) {
      case 'site':  return 'Say the name of a monument, like Taj Mahal, or a city, like Jaipur.';
      case 'when':  return 'Say a day, like today, tomorrow, next Sunday, or the twelfth of March.';
      case 'party': return 'Say how many are coming, like two adults, or just me.';
      case 'review': return 'Say yes to reserve it, or no to change something.';
      case 'pay':   return 'Say yes to see the payment code, or cancel to stop.';
      case 'capture': return 'Say ready to open the camera, or skip if you do not have the ticket yet.';
      default: return 'Say cancel to stop.';
    }
  };

  // Read each new step aloud once, so a non-reading user is never stranded.
  useEffect(() => {
    if (mode !== 'booking' || !settings.narrateSteps) return;
    if (spokenFor.current === step) return;
    spokenFor.current = step;
    const line = prompt(step);
    if (line) void say(line);
  }, [mode, step, prompt, say, settings.narrateSteps]);

  // ── actions ────────────────────────────────────────────────────────────────

  const startBooking = (handsFree = true) => {
    setMode('booking');
    setStep('site');
    if (handsFree) pendingConverse.current = 'site';
    spokenFor.current = null;
    setSite(null);
    setDraft(null);
    setAcknowledged(false);
    setScanningTicket(false);
    setSearch('');
    setParty({ adults: 1, children: 0, foreign: false, includeSurcharge: false });
    setDate(isoDate(new Date()));
  };

  /** Reserves from explicit values, so the conversation need not wait on state. */
  const reserveWith = useCallback(async (
    m: Monument, when: string, who: Party, name: string,
  ): Promise<Ticket | null> => {
    setStatus('Reserving…');
    try {
      const ticket = await localProvider.reserve({
        monument: m,
        date: when,
        party: who,
        visitorName: name.trim() || 'Guest',
      });
      setDraft(ticket);
      await saveTicket(ticket);
      setTickets(await loadTickets());
      return ticket;
    } catch (e: any) {
      toast(e?.message ?? 'Could not reserve', 'error');
      return null;
    } finally {
      setStatus(null);
    }
  }, [toast]);

  const reserve = async () => {
    if (!site) return;
    const ticket = await reserveWith(site, date, party, visitor);
    if (!ticket) return;
    spokenFor.current = null;
    setStep(ticket.amount === 0 ? 'done' : 'pay');
  };

  const attestPaidFor = useCallback(async (ticket: Ticket) => {
    await updateTicket(ticket.id, { status: 'paid', paymentVerified: false });
    const next = await loadTickets();
    setTickets(next);
    setDraft(next.find((t) => t.id === ticket.id) ?? ticket);
  }, []);

  const attestPaid = async () => {
    if (!draft) return;
    await attestPaidFor(draft);
    spokenFor.current = null;
    // Paying is not the end: the ticket the authority issued still has to be
    // captured, or there is nothing valid to show at the gate.
    setStep('capture');
  };

  /** Opens the ticket camera, asking for permission the first time. */
  const openTicketCamera = useCallback(async (): Promise<boolean> => {
    if (!camPermission?.granted) {
      const res = await requestCamPermission();
      if (!res.granted) { toast('Camera blocked', 'error'); return false; }
    }
    setScanningTicket(true);
    return true;
  }, [camPermission, requestCamPermission, toast]);

  // ── the conversation ───────────────────────────────────────────────────────

  /**
   * Runs the whole booking as a spoken exchange: ask, listen, act, ask again.
   *
   * The loop keeps its own copies of the draft rather than reading state,
   * because it advances several steps between renders — reading `site` here
   * would give the value from before the answer that just set it.
   *
   * It stops on "cancel", on three answers it cannot understand, when the
   * camera takes over at capture, and whenever `talking.current` is cleared by
   * the Stop control.
   */
  const converse = useCallback(async (from: Step) => {
    if (!aiEnabled) { toast('Voice needs the AI backend configured', 'error'); return; }
    if (talking.current) return;

    talking.current = true;
    // Claim the opening step, or the narration effect reads the same question
    // aloud underneath us.
    spokenFor.current = from;
    setConversing(true);
    await unlockAudio();

    let curStep: Step  = from;
    let curSite        = site;
    let curDate        = date;
    let curParty       = party;
    let curDraft       = draft;
    let acknowledged   = amountAcknowledged;
    let override: string | null = null;
    let options: Monument[] = [];
    let awaitingAmend  = false;
    let misses         = 0;

    const goTo = (next: Step) => {
      curStep = next;
      spokenFor.current = next;   // the narration effect must not repeat us
      setStep(next);
      misses = 0;
      options = [];
      awaitingAmend = false;
    };

    try {
      while (talking.current && curStep !== 'done') {
        const line = override ?? promptFor(curStep, {
          site: curSite, date: curDate, party: curParty,
          draft: curDraft, acknowledged,
        });
        override = null;

        await say(line);
        if (!talking.current) break;

        const heard = await askByVoice();
        if (!talking.current) break;

        if (!heard) {
          misses += 1;
          if (misses >= 3) {
            await say('I will stop listening now. Tap the microphone when you are ready.');
            break;
          }
          override = 'I did not hear you. ' + helpFor(curStep);
          continue;
        }

        const turn = interpret(curStep, heard, new Date());

        if (turn.kind === 'control') {
          if (turn.control === 'cancel') {
            await say('Stopped. Nothing has been booked.');
            setMode('wallet');
            break;
          }
          if (turn.control === 'help') { override = helpFor(curStep); continue; }
          if (turn.control === 'repeat') continue;
          if (turn.control === 'back') {
            const i = STEP_ORDER.indexOf(curStep);
            goTo(STEP_ORDER[Math.max(0, i - 1)]);
            continue;
          }
        }

        // "No, change the date" → the next answer says which step to revisit.
        if (awaitingAmend) {
          const target = parseAmendTarget(heard);
          if (target) { goTo(target); continue; }
          override = 'Say monument, date, or people.';
          continue;
        }

        const acceptSite = async (m: Monument) => {
          if (isFreeEntry(m)) {
            // Nothing to sell. Say so plainly instead of walking someone
            // through a payment for a site they can walk into.
            await say(`${m.name} is free to enter, so there is no ticket to book. It is open from ${m.opens} to ${m.closes}.`);
            override = 'Which other monument would you like to book?';
            return;
          }
          curSite = m;
          setSite(m);
          setSearch('');
          goTo('when');
        };

        // A list was read back; "the second one" answers it.
        if (options.length > 0) {
          const picked = parseOrdinalChoice(heard, options);
          if (picked) { options = []; await acceptSite(picked); continue; }
        }

        switch (turn.kind) {
          case 'site':
            await acceptSite(turn.monument);
            break;

          case 'choose':
            options = turn.options;
            override = describeOptions(turn.options);
            break;

          case 'date': {
            const when = new Date(`${turn.iso}T00:00:00`);
            if (turn.iso < isoDate(new Date())) {
              override = 'That day has already gone. Which day would you like?';
              break;
            }
            if (curSite && isClosedOn(curSite, when)) {
              override = `${curSite.name} is closed on ${WEEKDAY_NAMES[curSite.closedDay!]}s. Which other day?`;
              break;
            }
            curDate = turn.iso;
            setDate(turn.iso);
            goTo('party');
            break;
          }

          case 'party':
            curParty = { ...curParty, ...turn.patch };
            setParty(curParty);
            goTo('review');
            break;

          case 'yes': {
            if (curStep === 'review') {
              if (!curSite) { goTo('site'); break; }
              const ticket = await reserveWith(curSite, curDate, curParty, visitor);
              if (!ticket) { override = 'I could not reserve that. Shall I try again?'; break; }
              curDraft = ticket;
              if (ticket.amount === 0) { goTo('done'); break; }
              goTo('pay');
            } else if (curStep === 'pay') {
              if (!acknowledged) {
                acknowledged = true;
                setAcknowledged(true);
                override = promptFor('pay', {
                  site: curSite, date: curDate, party: curParty,
                  draft: curDraft, acknowledged: true,
                });
              } else if (curDraft) {
                await attestPaidFor(curDraft);
                goTo('capture');
              }
            }
            break;
          }

          case 'no':
            if (curStep === 'review') {
              awaitingAmend = true;
              override = 'What should I change — the monument, the date, or the number of people?';
            } else if (curStep === 'pay') {
              if (!acknowledged) { goTo('review'); }
              else {
                override = 'No problem. Say “I have paid” once it is done, or say cancel to stop.';
              }
            }
            break;

          case 'ready':
            if (await openTicketCamera()) {
              await say('Camera is open. Hold the ticket steady.');
              // The scan callback finishes the booking, so the loop ends here
              // rather than talking over someone lining up a QR code.
              talking.current = false;
            } else {
              override = 'I could not open the camera. Say skip to finish without the ticket.';
            }
            break;

          case 'skip':
            goTo('done');
            break;

          default:
            misses += 1;
            if (misses >= 3) {
              await say('Let us try this by tapping instead.');
              talking.current = false;
              break;
            }
            override = `Sorry, I did not understand. ${helpFor(curStep)}`;
        }
      }

      if (talking.current && curStep === 'done') {
        await say('All done. Your booking is saved — show the code at the gate.');
      }
    } finally {
      talking.current = false;
      setConversing(false);
    }
  }, [
    aiEnabled, toast, site, date, party, draft, amountAcknowledged, visitor,
    promptFor, say, askByVoice, reserveWith, attestPaidFor, openTicketCamera,
  ]);

  const stopConversing = useCallback(() => {
    talking.current = false;
    setConversing(false);
    cancel();
  }, [cancel]);

  // Arriving from "book a ticket to the Taj Mahal" is an explicit invitation
  // to talk, so the conversation picks up where the command left off. Any
  // other entry waits to be asked.
  useEffect(() => {
    if (!pendingConverse.current) return;
    const at = pendingConverse.current;
    pendingConverse.current = null;
    if (!settings.handsFreeBooking || !aiEnabled) return;
    void converse(at);
  }, [step, settings.handsFreeBooking, aiEnabled, converse]);

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

  /**
   * Fuzzy ranking over the whole catalogue on every keystroke is worth
   * memoising — it was previously evaluated twice per render.
   */
  const results = useMemo(() => findMonuments(search).slice(0, 12), [search]);

  /**
   * Choosing by tap has to refuse the same things the conversation refuses.
   * Free sites were bookable here while the spoken path turned them down.
   */
  const pickSite = (m: Monument) => {
    if (isFreeEntry(m)) {
      toast(`${m.name} is free to enter — no ticket needed`, 'info');
      void say(`${m.name} is free to enter, so there is no ticket to book. It is open from ${m.opens} to ${m.closes}.`);
      return;
    }
    setSite(m);
    spokenFor.current = null;
    setStep('when');
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
          right={<IconButton icon="plus" tone="amber" onPress={() => startBooking(false)} />}
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
            action={<Button label="Book by voice" icon="mic" onPress={() => startBooking()} />}
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

      {/* One control for the whole flow: the conversation moves the steps. */}
      <View style={s.talkRow}>
        <Pressable
          onPress={() => (conversing ? stopConversing() : converse(step))}
          disabled={!aiEnabled || step === 'done'}
          style={[
            s.talkBtn,
            conversing && s.talkBtnLive,
            (!aiEnabled || step === 'done') && { opacity: 0.4 },
          ]}
        >
          <Feather
            name={conversing ? 'square' : 'mic'}
            size={16}
            color={conversing ? colors.white : colors.textInverse}
          />
          <Text
            style={[
              type.label,
              { color: conversing ? colors.white : colors.textInverse, marginLeft: 8 },
            ]}
          >
            {conversing
              ? recordState === 'recording' ? 'Listening — say it now' : 'Stop'
              : 'Talk me through it'}
          </Text>
        </Pressable>

        {conversing ? (
          <Text style={[type.meta, s.talkHint]}>
            Say “go back”, “repeat”, or “cancel” at any time.
          </Text>
        ) : (
          <Text style={[type.meta, s.talkHint]}>
            Or use the controls below — both work.
          </Text>
        )}
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
          <SectionLabel>Or choose from the list</SectionLabel>
          <View style={{ paddingHorizontal: space.xl, marginBottom: space.md }}>
            <Field
              value={search}
              onChangeText={setSearch}
              placeholder="Search monuments or cities"
              icon="search"
            />
          </View>

          <Text style={[type.meta, s.resultCount]}>
            {search.trim()
              ? results.length === 0
                ? 'Nothing matched. Try a city, or say it out loud.'
                : `${results.length} match${results.length === 1 ? '' : 'es'}`
              : `${MONUMENT_COUNT} sites across India — type or say a name to narrow it`}
          </Text>

          {results.map((m) => (
            <Pressable
              key={m.id}
              onPress={() => pickSite(m)}
              style={({ pressed }) => [s.siteRow, pressed && { backgroundColor: colors.surfaceHi }]}
            >
              <View style={s.flex}>
                <Text style={[type.label, { color: colors.text }]}>{m.name}</Text>
                <Text style={[type.meta, { color: colors.textTertiary, marginTop: 2 }]}>
                  {m.city}, {m.state} · {isFreeEntry(m) ? 'Free entry' : `₹${m.feeIndian}`} · {m.authority}
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

  resultCount: {
    color: colors.textTertiary,
    paddingHorizontal: space.xl,
    marginBottom: space.sm,
  },

  talkRow: { paddingHorizontal: space.xl, marginBottom: space.lg },
  talkBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    height: 52, borderRadius: radius.lg,
    backgroundColor: colors.amber,
    ...shadow(1),
  },
  talkBtnLive: { backgroundColor: colors.danger },
  talkHint: {
    color: colors.textTertiary, textAlign: 'center', marginTop: space.sm,
  },

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
