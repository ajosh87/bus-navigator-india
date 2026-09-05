"""
Pan-India Bus & Street Navigator
Powered by Sarvam AI — Vision 1.5 · Mayura v1 · Saaras v3 · Bulbul v1
"""

from __future__ import annotations

import base64
import io
import os

import requests
import streamlit as st
from PIL import Image

try:
    from audio_recorder_streamlit import audio_recorder
    _AUDIO_OK = True
except ImportError:
    _AUDIO_OK = False


# ─── Language Registry ────────────────────────────────────────────────────────

LANGUAGES: dict[str, str] = {
    "Kannada": "kn-IN",
    "Hindi": "hi-IN",
    "Tamil": "ta-IN",
    "Telugu": "te-IN",
    "Malayalam": "ml-IN",
    "Marathi": "mr-IN",
    "Bengali": "bn-IN",
    "Gujarati": "gu-IN",
    "Punjabi": "pa-IN",
    "Odia": "or-IN",
    "Assamese": "as-IN",
    "Urdu": "ur-IN",
    "Konkani": "kok-IN",
    "Nepali": "ne-IN",
    "Sanskrit": "sa-IN",
    "Maithili": "mai-IN",
    "Bodo": "brx-IN",
    "Dogri": "doi-IN",
    "Kashmiri": "ks-IN",
    "Manipuri": "mni-IN",
    "Santali": "sat-IN",
    "Sindhi": "sd-IN",
    "English": "en-IN",
}

LANG_NAMES = list(LANGUAGES.keys())

QUICK_PHRASES = [
    "Does this bus stop at Silk Board?",
    "How much for two tickets to Majestic?",
    "Please tell me when my bus stop arrives.",
    "Do you take UPI QR payment or pass?",
]

SARVAM_BASE = "https://api.sarvam.ai"

# ─── Demo route data (fallback when BMTC API is unreachable) ──────────────────

DEMO_ROUTES: dict[str, dict] = {
    "500D": {
        "origin": "Kempegowda Bus Station (Majestic)",
        "dest": "Electronic City",
        "stops": [
            "Majestic", "Town Hall", "KR Market", "Lalbagh",
            "Jayanagar 4th Block", "JP Nagar", "Bannerghatta Road",
            "Silk Board", "HSR Layout", "Electronic City Phase 1",
            "Electronic City Phase 2",
        ],
    },
    "335E": {
        "origin": "Shivajinagar",
        "dest": "Marathahalli",
        "stops": [
            "Shivajinagar", "Trinity Circle", "Domlur", "Indiranagar",
            "Domlur Flyover", "Sony World Junction", "Marathahalli Bridge",
            "Marathahalli",
        ],
    },
    "KIA-9": {
        "origin": "Kempegowda Bus Station",
        "dest": "Kempegowda International Airport",
        "stops": [
            "Majestic", "Yeshwantpur", "Hebbal",
            "Bellary Road", "Devanahalli", "KIAL",
        ],
    },
    "201R": {
        "origin": "Kempegowda Bus Station",
        "dest": "Rajarajeshwari Nagar",
        "stops": [
            "Majestic", "Vidhana Soudha", "Rajajinagar",
            "Chord Road", "Nagarbhavi", "RR Nagar",
        ],
    },
    "G1": {
        "origin": "Garia Station",
        "dest": "Airport Gate 2",
        "stops": [
            "Garia Station", "Narendrapur", "Sonarpur", "Barasat",
            "Madhyamgram", "Kolkata Airport Gate 2",
        ],
    },
}


# ─── Session / auth helpers ───────────────────────────────────────────────────

def get_api_key() -> str:
    return st.session_state.get("sarvam_api_key") or os.getenv("SARVAM_API_KEY", "")


def _auth() -> dict:
    return {"api-subscription-key": get_api_key()}


def _require_key() -> bool:
    """Return True if key present, else show warning and return False."""
    if get_api_key():
        return True
    st.warning(
        "⚠️  **Sarvam AI API key required.** "
        "Enter it in the sidebar to use AI features.",
        icon="🔑",
    )
    return False


# ─── Sarvam API wrappers ──────────────────────────────────────────────────────

def sarvam_digitise(image_bytes: bytes) -> dict:
    """Sarvam Vision 1.5 — extract text from any regional-script image."""
    r = requests.post(
        f"{SARVAM_BASE}/digitise",
        headers=_auth(),
        files={"file": ("capture.jpg", image_bytes, "image/jpeg")},
        timeout=30,
    )
    r.raise_for_status()
    return r.json()


def sarvam_translate(text: str, source: str, target: str) -> str:
    """Sarvam Mayura v1 — translate between any two Indian language codes."""
    r = requests.post(
        f"{SARVAM_BASE}/translate",
        headers={**_auth(), "Content-Type": "application/json"},
        json={
            "input": text,
            "source_language_code": source,
            "target_language_code": target,
            "model": "mayura:v1",
            "enable_preprocessing": True,
        },
        timeout=20,
    )
    r.raise_for_status()
    return r.json().get("translated_text", "")


def sarvam_stt(audio_bytes: bytes, language_code: str) -> str:
    """Sarvam Saaras v3 — speech-to-text for any Indian language."""
    r = requests.post(
        f"{SARVAM_BASE}/speech-to-text",
        headers=_auth(),
        files={"file": ("recording.wav", audio_bytes, "audio/wav")},
        data={"model": "saaras:v3", "language_code": language_code},
        timeout=30,
    )
    r.raise_for_status()
    return r.json().get("transcript", "")


def sarvam_tts(text: str, target_language_code: str) -> bytes | None:
    """Sarvam Bulbul v1 — text-to-speech; returns WAV bytes or None on error."""
    try:
        r = requests.post(
            f"{SARVAM_BASE}/text-to-speech",
            headers={**_auth(), "Content-Type": "application/json"},
            json={
                "inputs": [text],
                "target_language_code": target_language_code,
                "model": "bulbul:v1",
                "speaker": "anushka",
                "pace": 1.0,
                "enable_preprocessing": True,
            },
            timeout=20,
        )
        r.raise_for_status()
        audios = r.json().get("audios", [])
        if audios:
            return base64.b64decode(audios[0])
    except Exception:
        pass
    return None


def bmtc_search(route_no: str) -> dict:
    """BMTC route lookup via Amnex staging WebAPI."""
    r = requests.post(
        "https://bmtcmobileapistaging.amnex.com/WebAPI/SearchRoute_v2",
        json={"routeNo": route_no},
        timeout=15,
    )
    r.raise_for_status()
    return r.json()


# ─── Module 1 — Signboard & QR Scanner ───────────────────────────────────────

def render_scanner_tab() -> None:
    st.header("📷 Bus Signboard & Conductor QR Scanner")
    st.caption(
        "Point your camera at any regional bus destination board "
        "or a conductor's UPI / pass QR code."
    )

    scan_mode = st.radio(
        "What are you scanning?",
        ["🚌 Bus Signboard (regional script)", "💳 Conductor Payment / Pass QR"],
        horizontal=True,
        key="scan_mode",
    )

    c1, c2 = st.columns(2)
    with c1:
        src_choice = st.selectbox(
            "Signboard script language",
            ["Auto-detect (default: Kannada)", *LANG_NAMES],
            key="scan_src",
            help="Best guess for the script printed on the board.",
        )
    with c2:
        pref_lang = st.selectbox(
            "Translate result into",
            LANG_NAMES,
            index=LANG_NAMES.index("English"),
            key="scan_pref",
        )

    img_data = st.camera_input(
        "Capture signboard / QR code",
        key="cam_capture",
    )

    if img_data is None:
        st.info("👆 Click the camera button above to take a photo.")
        return

    image = Image.open(img_data).convert("RGB")
    st.image(image, caption="Captured", use_container_width=True)

    if not _require_key():
        return

    buf = io.BytesIO()
    image.save(buf, format="JPEG", quality=88)

    with st.spinner("Sending to Sarvam Vision 1.5 (digitise)…"):
        try:
            result = sarvam_digitise(buf.getvalue())
        except requests.HTTPError as exc:
            st.error(f"Vision API {exc.response.status_code}: {exc.response.text[:400]}")
            return
        except Exception as exc:
            st.error(f"Network error: {exc}")
            return

    extracted: str = (
        result.get("text")
        or result.get("extracted_text")
        or result.get("digitised_text")
        or ""
    )

    if not extracted:
        st.warning(
            "No text detected. Try again with better lighting or hold the camera steadier."
        )
        return

    st.subheader("Extracted text")
    st.code(extracted, language=None)

    if "Signboard" in scan_mode:
        src_code = (
            "kn-IN"
            if src_choice.startswith("Auto")
            else LANGUAGES[src_choice]
        )
        tgt_code = LANGUAGES[pref_lang]

        cols = st.columns(2)

        with cols[0]:
            with st.spinner("→ English"):
                try:
                    en = sarvam_translate(extracted, src_code, "en-IN")
                    st.success(f"**English**\n\n{en}")
                except Exception as exc:
                    st.error(f"Translation error: {exc}")

        if tgt_code != "en-IN":
            with cols[1]:
                with st.spinner(f"→ {pref_lang}"):
                    try:
                        loc = sarvam_translate(extracted, src_code, tgt_code)
                        st.info(f"**{pref_lang}**\n\n{loc}")
                    except Exception as exc:
                        st.error(f"Translation error: {exc}")

    else:
        # QR / payment mode
        st.subheader("Payment Details")
        lines = [l.strip() for l in extracted.splitlines() if l.strip()]
        if lines:
            for ln in lines:
                st.write(f"• {ln}")
        else:
            st.info("No structured payment data found. Try scanning the QR closer.")


# ─── Module 2 — Driver Phrasebook ────────────────────────────────────────────

def render_phrasebook_tab() -> None:
    st.header("🗣️ All-India Driver Phrasebook")
    st.caption(
        "Type or speak a phrase in your language — "
        "get it translated and played aloud for the driver."
    )

    c1, c2 = st.columns(2)
    with c1:
        native_lang = st.selectbox(
            "Your language (source)",
            LANG_NAMES,
            index=LANG_NAMES.index("English"),
            key="pb_native",
        )
    with c2:
        city_lang = st.selectbox(
            "Driver's language (target)",
            LANG_NAMES,
            index=LANG_NAMES.index("Kannada"),
            key="pb_city",
        )

    src_code = LANGUAGES[native_lang]
    tgt_code = LANGUAGES[city_lang]

    # ── Quick-phrase buttons ──────────────────────────────────────────────────
    st.divider()
    st.subheader("⚡ Quick Phrases")
    q_cols = st.columns(2)
    for i, phrase in enumerate(QUICK_PHRASES):
        if q_cols[i % 2].button(phrase, key=f"qp_{i}", use_container_width=True):
            st.session_state["pb_phrase"] = phrase

    # ── Text translation ──────────────────────────────────────────────────────
    st.divider()
    st.subheader("✍️ Type a Phrase")

    phrase_val = st.session_state.get("pb_phrase", "")
    user_text = st.text_area(
        f"Phrase in {native_lang}",
        value=phrase_val,
        height=90,
        placeholder="e.g. Does this bus go to Majestic?",
        key="pb_text_area",
    )
    # Keep session state in sync with manual edits
    if user_text != phrase_val:
        st.session_state["pb_phrase"] = user_text

    if st.button("Translate & Speak 🔊", type="primary", key="pb_translate_btn"):
        if not _require_key():
            pass
        elif user_text.strip():
            _translate_and_speak(user_text.strip(), src_code, tgt_code, city_lang)
        else:
            st.warning("Enter or select a phrase first.")

    # Display last translation for easy reference
    if st.session_state.get("pb_last_result"):
        with st.container(border=True):
            st.markdown(
                f"**Last translation ({st.session_state['pb_last_lang']}):** "
                f"{st.session_state['pb_last_result']}"
            )
            if st.session_state.get("pb_last_audio"):
                st.audio(st.session_state["pb_last_audio"], format="audio/wav")
                st.caption("▶ Play this to the driver")

    # ── Voice input ───────────────────────────────────────────────────────────
    st.divider()
    st.subheader("🎙️ Speak a Phrase")

    if not _AUDIO_OK:
        st.info(
            "Install `audio-recorder-streamlit` to enable voice input:\n"
            "```\npip install audio-recorder-streamlit\n```"
        )
        return

    st.caption(f"Speak in **{native_lang}** — click the mic to start / stop recording")
    audio_bytes = audio_recorder(
        pause_threshold=2.0,
        icon_size="2x",
        key="pb_recorder",
    )

    if audio_bytes:
        st.audio(audio_bytes, format="audio/wav")
        if not _require_key():
            return

        with st.spinner(f"Transcribing in {native_lang} via Saaras v3…"):
            try:
                transcript = sarvam_stt(audio_bytes, language_code=src_code)
            except Exception as exc:
                st.error(f"Speech-to-text error: {exc}")
                return

        if transcript:
            st.info(f"**Heard:** {transcript}")
            st.session_state["pb_phrase"] = transcript
            _translate_and_speak(transcript, src_code, tgt_code, city_lang)
        else:
            st.warning("Could not transcribe audio. Please try again.")


def _translate_and_speak(
    text: str, src: str, tgt: str, tgt_lang_name: str
) -> None:
    with st.spinner(f"Translating to {tgt_lang_name} (Mayura v1)…"):
        try:
            translated = sarvam_translate(text, src, tgt)
        except Exception as exc:
            st.error(f"Translation failed: {exc}")
            return

    st.success(f"**{tgt_lang_name}:** {translated}")
    st.session_state["pb_last_result"] = translated
    st.session_state["pb_last_lang"] = tgt_lang_name

    with st.spinner("Generating speech (Bulbul v1)…"):
        audio = sarvam_tts(translated, tgt)

    st.session_state["pb_last_audio"] = audio
    if audio:
        st.audio(audio, format="audio/wav")
        st.caption("▶ Play this to the driver")
    else:
        st.caption("(Audio not available for this language/key combination.)")


# ─── Module 3 — Route Finder ──────────────────────────────────────────────────

def render_route_tab() -> None:
    st.header("🗺️ Transit Route & Timetable Finder")
    st.caption(
        "BMTC Bengaluru routes via Amnex Open API. "
        "Falls back to curated data when the live API is offline."
    )

    # Popular shortcut buttons
    st.markdown("**Popular routes:**")
    pop_cols = st.columns(len(DEMO_ROUTES))
    for i, rt in enumerate(DEMO_ROUTES):
        if pop_cols[i].button(rt, key=f"pop_{rt}", use_container_width=True):
            st.session_state["_route_query"] = rt

    st.divider()
    route_no = st.text_input(
        "Or enter a bus route number",
        value=st.session_state.pop("_route_query", ""),
        placeholder="e.g. 500D, 335E, KIA-9",
        key="route_input",
    ).strip().upper()

    if st.button("Search Route 🔍", type="primary", key="route_search_btn"):
        if not route_no:
            st.warning("Enter a route number to search.")
        else:
            _lookup_route(route_no)


def _lookup_route(route_no: str) -> None:
    with st.spinner(f"Fetching route {route_no}…"):
        try:
            data = bmtc_search(route_no)
            _render_live_result(data, route_no)
        except Exception:
            st.info("ℹ️ BMTC live API unavailable — showing curated route data.")
            _render_demo(route_no)


def _render_live_result(data: dict, route_no: str) -> None:
    routes = (
        data.get("Data")
        or data.get("routes")
        or data.get("data")
        or []
    )
    if not routes:
        _render_demo(route_no)
        return

    for route in routes:
        origin = route.get("fromStop") or route.get("Origin", "—")
        dest = route.get("toStop") or route.get("Destination", "—")
        stops = route.get("stops") or route.get("Stops") or []

        st.subheader(f"Route {route_no}: {origin} → {dest}")
        if stops:
            for idx, stop in enumerate(stops, 1):
                name = (
                    stop
                    if isinstance(stop, str)
                    else stop.get("StopName") or stop.get("name", str(stop))
                )
                st.write(f"`{idx:02d}` {name}")
        else:
            st.info("Stop details not returned by the API for this route.")


def _render_demo(route_no: str) -> None:
    demo = DEMO_ROUTES.get(
        route_no,
        {
            "origin": "Origin Terminal",
            "dest": "Destination Terminal",
            "stops": ["Terminal A", "Interchange Stop", "City Centre", "Terminal B"],
        },
    )
    st.subheader(f"Route {route_no}: {demo['origin']} → {demo['dest']}")
    st.markdown("**Stops:**")
    for i, stop in enumerate(demo["stops"], 1):
        st.write(f"`{i:02d}` {stop}")


# ─── Sidebar ──────────────────────────────────────────────────────────────────

def render_sidebar() -> None:
    with st.sidebar:
        st.markdown("## 🚌 Bus Navigator")
        st.caption("Pan-India Public Transit Assistant")
        st.divider()

        st.subheader("🔑 API Configuration")
        stored_key = st.session_state.get("sarvam_api_key", os.getenv("SARVAM_API_KEY", ""))
        key_input = st.text_input(
            "Sarvam AI API Key",
            value=stored_key,
            type="password",
            placeholder="Paste your key here…",
            help="Get your free key at sarvam.ai",
        )
        if key_input:
            st.session_state["sarvam_api_key"] = key_input

        if get_api_key():
            st.success("✅ Key active — all AI features enabled")
        else:
            st.error("❌ No key — AI features disabled")
            st.markdown(
                "Get a free key at [sarvam.ai](https://sarvam.ai) "
                "and paste it above."
            )

        st.divider()
        st.markdown(
            """
**Supported Networks**
BMTC · BEST · DTC · MTC
TSRTC · KSRTC · PMPML · WBTC

**AI Capabilities**
Sarvam Vision 1.5 — digitise
Sarvam Mayura v1 — translate
Sarvam Saaras v3 — speech-to-text
Sarvam Bulbul v1 — text-to-speech

**All 22 official Indian languages + English**
"""
        )


# ─── Entry point ──────────────────────────────────────────────────────────────

def main() -> None:
    st.set_page_config(
        page_title="Pan-India Bus & Street Navigator",
        page_icon="🚌",
        layout="wide",
        initial_sidebar_state="expanded",
    )

    render_sidebar()

    st.title("🇮🇳 Pan-India Bus & Street Navigator")
    st.caption(
        "Commute confidently on BMTC · BEST · DTC · MTC and more — "
        "decode regional signboards, talk to drivers in their language, find your route."
    )

    tab1, tab2, tab3 = st.tabs([
        "📷  Signboard & QR Scanner",
        "🗣️  Driver Phrasebook",
        "🗺️  Route Finder",
    ])

    with tab1:
        render_scanner_tab()
    with tab2:
        render_phrasebook_tab()
    with tab3:
        render_route_tab()


if __name__ == "__main__":
    main()
