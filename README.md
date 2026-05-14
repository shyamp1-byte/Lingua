# Lingua

> Real-time translated captions for any audio on your Mac.

Lingua is a macOS desktop app that overlays live, translated subtitles on top of any video, lecture, meeting, or podcast — without touching the source app. Play content in one language; read it in another, instantly.

After each session, Lingua generates an AI summary, key points, and a full transcript — stored locally and browsable by date.

---

## Download

**[Download for Mac (Apple Silicon)](https://github.com/shyamp1-byte/Lingua/releases/latest)**

Requires macOS 12+ · Apple Silicon (M1 or later)

**First launch:** macOS will block the app since it's unsigned. Fix with one Terminal command:
```bash
xattr -dr com.apple.quarantine /Applications/Lingua.app
```
Or: System Settings → Privacy & Security → Open Anyway.

---

## Features

- **System audio capture** — captures what your Mac plays (YouTube, Zoom, Netflix, podcasts) via ScreenCaptureKit. Your own voice is never picked up
- **Real-time translation** — each caption is translated by DeepL into your chosen language (33 languages supported)
- **Transparent overlay** — captions float over your screen without blocking clicks or focus on other windows
- **Global hotkey** — `⌘⇧L` starts and stops captions from any app without switching windows
- **Draggable overlay** — reposition the caption overlay anywhere on screen; position is remembered across sessions
- **Session history** — every session is saved locally with start time, duration, and word count
- **AI summaries** — GPT-4o-mini generates a title, 2–3 sentence summary, and key bullet points in your chosen language, with a toggle to English
- **Full transcripts** — original and translated text stored per session, accessible from the history calendar
- **Zero cloud storage** — all data lives in `~/.lingua/` on your machine

---

## Tech Stack

| Layer | Technology |
|---|---|
| Desktop shell | [Tauri 2](https://tauri.app) (Rust) |
| Frontend | React + TypeScript (Vite) |
| Backend | FastAPI (Python, bundled as sidecar) |
| Speech-to-text | [Deepgram Nova-3](https://deepgram.com) |
| Translation | [DeepL API](https://www.deepl.com/pro-api) |
| AI summaries | [OpenAI GPT-4o-mini](https://platform.openai.com) |
| Storage | SQLite via aiosqlite |
| Audio capture | ScreenCaptureKit (Rust) |

---

## API Keys

Enter keys in ⚙ Settings on first launch. All have free tiers.

| Key | Required | Where to get it |
|---|---|---|
| `DEEPGRAM_API_KEY` | Yes | [console.deepgram.com](https://console.deepgram.com) — 200 hrs/month free |
| `DEEPL_API_KEY` | Yes | [deepl.com/pro-api](https://www.deepl.com/pro-api) — 500k chars/month free |
| `OPENAI_API_KEY` | No | [platform.openai.com](https://platform.openai.com) — AI summaries only |

Keys are stored at `~/.lingua/settings.json` and never leave your machine.

---

## Developer Setup

### Prerequisites

- macOS (Apple Silicon)
- [Rust](https://rustup.rs) + Cargo
- [Node.js](https://nodejs.org) 18+
- [Python](https://python.org) 3.11+

### 1. Clone the repo

```bash
git clone https://github.com/shyamp1-byte/Lingua.git
cd Lingua
```

### 2. Build the sidecar binary

The Python backend runs as a bundled subprocess. Build it with PyInstaller:

```bash
cd server
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt pyinstaller
pyinstaller lingua-server.spec
cp dist/lingua-server ../client/src-tauri/binaries/lingua-server-aarch64-apple-darwin
chmod +x ../client/src-tauri/binaries/lingua-server-aarch64-apple-darwin
```

### 3. Configure Cargo rpath

```bash
mkdir -p client/src-tauri/.cargo
cat > client/src-tauri/.cargo/config.toml << 'EOF'
[target.aarch64-apple-darwin]
rustflags = ["-C", "link-arg=-Wl,-rpath,/usr/lib/swift"]
EOF
```

### 4. Start the frontend

```bash
cd client
npm install
npm run tauri dev
```

The app will auto-open Settings on first launch — enter your API keys there.

---

## Usage

1. Launch the app — the Lingua control panel appears
2. Select your target language from the dropdown
3. Click **Start Captions** or press `⌘⇧L`
4. Play any audio through your Mac
5. Translated captions appear in a transparent overlay on your screen
6. Click **Stop Captions** or press `⌘⇧L` again to end the session
7. Open the **History** tab to browse past sessions, read AI summaries, and view transcripts

---

## Supported Languages

Arabic, Bulgarian, Chinese (Simplified), Chinese (Traditional), Czech, Danish, Dutch, English (US/UK), Estonian, Finnish, French, German, Greek, Hungarian, Indonesian, Italian, Japanese, Korean, Latvian, Lithuanian, Norwegian, Polish, Portuguese (Brazilian/European), Romanian, Russian, Slovak, Slovenian, Spanish, Swedish, Turkish, Ukrainian

---

## Architecture

```
System audio → ScreenCaptureKit (Rust, 16kHz PCM)
  → WebSocket to FastAPI sidecar (bundled, port 8000)
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

The app uses two Tauri windows: the control panel (normal window) and the overlay (transparent, always-on-top, click-through). Audio never touches disk — raw PCM bytes stream directly to Deepgram over a WebSocket.

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
│   │   │   ├── Settings.tsx       # API key configuration
│   │   │   └── LanguageSelector.tsx
│   │   ├── store/session.ts       # Zustand state
│   │   └── types/index.ts         # Language codes + shared types
│   └── src-tauri/
│       ├── src/lib.rs             # ScreenCaptureKit capture + sidecar management
│       ├── binaries/              # Sidecar binary (gitignored, built by CI)
│       └── tauri.conf.json        # Window config
└── server/                  # FastAPI backend (bundled as sidecar)
    ├── main.py
    ├── lingua-server.spec         # PyInstaller build spec
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

