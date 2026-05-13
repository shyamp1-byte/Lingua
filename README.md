# Lingua

> Real-time translated captions for any audio on your screen.

Lingua is a macOS desktop app that overlays live, translated subtitles on top of any video, lecture, meeting, or podcast — without touching the source app. Speak or play content in one language; read it in another, instantly.

After each session, Lingua generates an AI summary, key points, and a full transcript — stored locally and browsable by date.

---

## Features

- **Live captioning** — streams audio from your microphone to Deepgram's Nova-3 model for near-instant transcription
- **Real-time translation** — each caption is translated by DeepL into your chosen language (33 languages supported)
- **Transparent overlay** — captions float over your screen without blocking clicks or focus on other windows
- **Session history** — every session is saved locally with start time, duration, and word count
- **AI summaries** — GPT-4o-mini generates a title, 2–3 sentence summary, and key bullet points in your chosen language, with a toggle to English
- **Full transcripts** — original and translated text stored per session, accessible from the history calendar
- **Zero cloud storage** — all data lives in `~/.lingua/sessions.db` on your machine

---

## Tech Stack

| Layer | Technology |
|---|---|
| Desktop shell | [Tauri 2](https://tauri.app) (Rust) |
| Frontend | React + TypeScript (Vite) |
| Backend | FastAPI (Python) |
| Speech-to-text | [Deepgram Nova-3](https://deepgram.com) |
| Translation | [DeepL API](https://www.deepl.com/pro-api) |
| AI summaries | [OpenAI GPT-4o-mini](https://platform.openai.com) |
| Storage | SQLite via aiosqlite |
| Audio capture | cpal (Rust) |

---

## Prerequisites

- macOS (Apple Silicon or Intel)
- [Rust](https://rustup.rs) + Cargo
- [Node.js](https://nodejs.org) 18+
- [Python](https://python.org) 3.11+
- API keys (see below)

---

## Setup

### 1. Clone the repo

```bash
git clone https://github.com/your-username/Lingua.git
cd Lingua
```

### 2. Configure API keys

```bash
cd server
cp .env.example .env
```

Open `server/.env` and fill in your keys:

| Key | Required | Where to get it |
|---|---|---|
| `DEEPGRAM_API_KEY` | Yes | [console.deepgram.com](https://console.deepgram.com) — free tier available |
| `DEEPL_API_KEY` | No | [deepl.com/pro-api](https://www.deepl.com/pro-api) — free tier: 500k chars/month |
| `OPENAI_API_KEY` | No | [platform.openai.com](https://platform.openai.com) — needed for AI summaries only |

> Without `DEEPL_API_KEY`, captions will display in the original spoken language without translation.  
> Without `OPENAI_API_KEY`, session summaries will not be generated.

### 3. Start the backend

```bash
cd server
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload
```

### 4. Start the frontend

```bash
cd client
npm install
npm run tauri dev
```

---

## Usage

1. Launch the app — the Lingua control panel appears
2. Select your target language from the dropdown
3. Click **Start Captions**
4. Play any audio through your system or speak into your microphone
5. Translated captions appear in a transparent overlay at the bottom of your screen
6. Click **Stop Captions** to end the session
7. Open the **History** tab to browse past sessions, read AI summaries, and view transcripts

---

## Supported Languages

Arabic, Bulgarian, Chinese (Simplified), Chinese (Traditional), Czech, Danish, Dutch, English (US/UK), Estonian, Finnish, French, German, Greek, Hungarian, Indonesian, Italian, Japanese, Korean, Latvian, Lithuanian, Norwegian, Polish, Portuguese (Brazilian/European), Romanian, Russian, Slovak, Slovenian, Spanish, Swedish, Turkish, Ukrainian

---

## Architecture

```
Mic → cpal (Rust, 16kHz PCM)
  → WebSocket to FastAPI backend
    → Deepgram Nova-3 (streaming STT)
      → DeepL (real-time translation)
        → WebSocket back to Tauri
          → Overlay window (captions)
          → Control panel (live preview)

On session end:
  → SQLite: save transcript + metadata
  → OpenAI: generate summary in target language + English
  → SQLite: update with AI-generated fields
```

The app uses two Tauri windows: the control panel (normal window) and the overlay (transparent, always-on-top, click-through). Audio never touches disk — raw PCM bytes stream directly from mic to Deepgram over a WebSocket.

---

## Project Structure

```
Lingua/
├── client/                  # Tauri + React frontend
│   ├── src/
│   │   ├── components/
│   │   │   ├── ControlPanel.tsx   # Main UI (tabs, start/stop, live preview)
│   │   │   ├── Overlay.tsx        # Transparent caption overlay
│   │   │   ├── History.tsx        # Session history + calendar
│   │   │   └── LanguageSelector.tsx
│   │   ├── store/session.ts       # Zustand state
│   │   └── types/index.ts         # Language codes + shared types
│   └── src-tauri/
│       ├── src/lib.rs             # Audio capture + Tauri commands
│       └── tauri.conf.json        # Window config
└── server/                  # FastAPI backend
    ├── main.py
    ├── .env.example
    └── app/
        ├── api/
        │   ├── ws.py              # WebSocket caption pipeline
        │   └── sessions.py        # REST endpoints for history
        ├── services/
        │   ├── speech/            # Deepgram client
        │   ├── translation/       # DeepL client
        │   ├── ai/                # OpenAI summarizer
        │   └── storage/           # SQLite (db.py)
        └── core/config.py         # Settings / env loading
```

---

## License

MIT
