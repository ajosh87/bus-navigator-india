# Bus Navigator

A voice-first transit companion for India — read bus signboards, talk to drivers, look up
routes and book monument tickets, in any of the 22 official Indian languages.

**Live:** https://bus-navigator-india.vercel.app

---

## About

This is an improved version of a project originally built at the **WeMakeDevs "Anakin
Skywalker" hackathon in Bengaluru**, where the theme was to build a **voice-based application
around the Anakin scraper and the Sarvam voice model APIs**.

The hackathon entry was a Streamlit prototype (still in this repo as `app.py`). This version
rebuilds it as a cross-platform React Native app with a real backend, a session-gated API
proxy, and a global voice command layer.

It was **vibe coded with [Claude Code](https://claude.com/claude-code)** — the entire
rewrite, from the design system through the auth layer to the transit map, was built
conversationally.

---

## Features

- **Scan** — point at a bus signboard in any Indian script and read it in your own language
- **Live** — two-way interpreted conversation with a driver, streamed as you speak
- **Speak** — phrasebook with categorised presets, translation and spoken playback
- **Routes & map** — BMTC route lookup, metro geography and live bus positions
- **Tickets** — voice-guided monument booking with UPI payment and a QR wallet
- **Voice commands** — a global mic that drives every screen: *"find route 500D"*,
  *"book a ticket to the Taj Mahal"*, *"what can I say"*

Every flow is reachable by voice, and each step can be read aloud — the app is meant to work
for someone who cannot read the screen.

---

## Tech stack

| Layer | Technology |
| --- | --- |
| App | React Native 0.74 · Expo SDK 51 · React Navigation · TypeScript |
| Web | React Native Web · Metro · static export |
| AI | Sarvam AI — Vision (OCR), Mayura (translation), Saaras (speech-to-text), Bulbul (text-to-speech) |
| Backend | Vercel Edge & Node Functions |
| Streaming | Cloudflare Workers WebSocket relay |
| Auth | scrypt password hashing · HMAC-SHA256 sessions in HttpOnly cookies |
| Maps | OpenStreetMap raster tiles, rendered on RN primitives (no map SDK) |
| Transit | GTFS-Realtime (Delhi Open Transit Data) |

---

## Architecture

No API key ever reaches the browser.

```
browser ──▶ /api/sarvam/*  ──▶ api.sarvam.ai      (key injected server-side)
        ──▶ /api/auth/*                            (scrypt + HMAC session cookie)
        ──▶ wss://relay/ws ──▶ api.sarvam.ai      (short-lived relay ticket)
```

- The REST proxy is session-gated with a path allowlist and per-IP throttling.
- Realtime streaming cannot be proxied through Vercel (no WebSocket support), so a Cloudflare
  Worker relays it, authenticated by a 60-second HMAC ticket scoped to that use.
- Sessions live in `HttpOnly; SameSite=Strict` cookies, so page scripts cannot read them.
- The app **fails closed**: with no credentials configured, login fails and the proxy denies.

---

## Getting started

```bash
npm install
npm run setup     # streams secrets straight to Vercel, nothing echoed or saved
npm run deploy
```

`npm run setup` prompts for an app password, a Sarvam key and an optional transit key.

For local development, run the app **with** its backend — the Expo dev server alone cannot
serve `/api`:

```bash
npm run dev:full  # vercel dev
```

### Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `AUTH_PASSWORD_HASH` | yes | scrypt hash of the sign-in password |
| `AUTH_SESSION_SECRET` | yes | HMAC key for session cookies (≥32 chars) |
| `AUTH_USERNAME` | no | defaults to `admin` |
| `SARVAM_API_KEY` | for AI | scanning, translation, speech |
| `STREAM_RELAY_URL` | for streaming | `wss://…workers.dev/ws` |
| `UPI_PAYEE_VPA` | for payments | UPI address for ticket payment |
| `OTD_API_KEY` | for live buses | Delhi Open Transit Data |

See `.env.example`. Never prefix a secret with `EXPO_PUBLIC_` — that inlines it into the
client bundle.

---

## A note on data honesty

Some things this app deliberately does **not** fake:

- **No Indian metro publishes live train positions.** Metro is shown as *scheduled*, with
  headways — never as tracked vehicles.
- **Live bus positions exist only for Delhi**, via Open Transit Data. Bengaluru has no public
  vehicle feed, and the map says so rather than showing an empty map that reads as "no buses".
- **Ticket bookings are this app's own records**, not government-issued tickets. No authorised
  ticketing API is connected, and the UI states that on every ticket.

For an app someone might rely on to catch a bus, inventing data is worse than showing none.
