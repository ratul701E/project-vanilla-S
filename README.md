# Vanilla — Offline, Local-First Meeting Transcription

> **100% private. No cloud. No subscription. Your audio never leaves your device.**

Vanilla is a cross-platform desktop (and Android) application for capturing and transcribing meetings entirely on-device using **OpenAI Whisper** (via `whisper.cpp`). It records both your microphone and system audio simultaneously, runs automatic speech recognition locally, and stores all transcripts as plain Markdown files — no account required, no internet needed.

Built with **Tauri v2** (Rust backend) and **React + TypeScript** (frontend), Vanilla targets Windows, macOS, Linux, and Android (arm64).

---

## ✨ Features

| Feature | Detail |
|---|---|
| 🔒 **Fully local / offline** | Audio capture, Whisper inference, and storage are entirely on-device |
| 🎙️ **Dual-track capture** | Records **microphone** (Voice) and **system loopback** (Participant) as independent tracks |
| 🤖 **On-device Whisper ASR** | Uses `whisper-rs` (whisper.cpp bindings) with the GGML `base` model |
| 🌍 **Auto language detection** | Detects English, Bangla, and EN/BN code-switching automatically |
| 👥 **Speaker attribution** | Segments are tagged as `You` (mic) or `Participant` (system audio) and merged chronologically |
| 📝 **Markdown export** | Transcripts saved as `.md` files with a sidecar `.json` for structured re-reads |
| 🎚️ **Real-time audio meter** | Live 20 Hz RMS waveform visualizer during recording |
| 🗂️ **Meeting history** | Full capture log with rename, delete, and detail view |
| 📱 **Android APK support** | Cross-compiled via `cargo-ndk` for arm64-v8a with Gradle assembly and APK signing |
| 📋 **Copy & export** | One-click copy transcript to clipboard or export as Markdown file |

---

## 🏗️ Tech Stack

### Frontend
| Technology | Role |
|---|---|
| **React 19** | UI component framework |
| **TypeScript 6** | Type-safe frontend code |
| **Vite 8** | Build tool and dev server |
| **Lucide React** | Icon library |
| **Tauri IPC** (`@tauri-apps/api`) | Frontend ↔ Rust command bridge |

### Backend (Rust / Tauri v2)
| Crate | Role |
|---|---|
| **tauri 2** | App shell, window management, IPC handler, event emitter |
| **cpal 0.15** | Cross-platform audio capture (mic input + system loopback) |
| **whisper-rs 0.16** | Rust bindings for whisper.cpp (on-device ASR inference) |
| **tokio** | Async runtime for concurrent recording and telemetry tasks |
| **serde / serde_json** | Serialization for IPC payloads and JSON storage |
| **chrono** | Timestamps, duration calculation, meeting ID generation |

### Android Build Chain
| Tool | Role |
|---|---|
| **cargo-ndk** | Cross-compiles Rust + Whisper for `arm64-v8a` |
| **Android NDK 28** | Native toolchain (`aarch64-linux-android`) |
| **Gradle** | Assembles the Android APK (`assembleArm64Debug/Release`) |
| **apksigner** | Signs release APKs with a Java keystore |
| **ADB** | Auto-installs to a connected device after build |

---

## 📁 Project Structure

```
project-vanilla-S/
├── src/                          # React / TypeScript frontend
│   ├── App.tsx                   # Root component — state machine, all IPC calls
│   ├── App.css                   # Global styles
│   ├── types/
│   │   └── meeting.ts            # Shared TypeScript types (MeetingRecord, TranscriptSegment…)
│   ├── utils/
│   │   └── formatters.ts         # Date, duration, elapsed time formatters
│   └── components/
│       ├── idle/
│       │   └── IdleWorkspace.tsx # Start screen: mode picker + audio source controls
│       ├── recording/
│       │   ├── RecordingWorkspace.tsx  # Active recording UI (timer, waveform, controls)
│       │   ├── Waveform.tsx            # Animated real-time audio waveform
│       │   └── TrackToggle.tsx         # Mic / System track on-off pill button
│       ├── detail/
│       │   └── MeetingDetailWorkspace.tsx  # Transcript viewer, rename, export, delete
│       ├── sidebar/
│       │   ├── Sidebar.tsx         # Collapsible session history sidebar
│       │   └── MeetingListItem.tsx  # Individual meeting row with delete action
│       └── common/
│           ├── TranscribingOverlay.tsx  # Full-screen "Transcribing…" blocking overlay
│           ├── ErrorBanner.tsx          # Dismissible error notification bar
│           ├── Toast.tsx                # 3-second ephemeral feedback toast
│           └── Icons.tsx               # Shared icon wrappers
│
├── src-tauri/                    # Rust / Tauri backend
│   ├── Cargo.toml                # Rust dependencies
│   ├── tauri.conf.json           # Tauri app config (window size, bundle targets, CSP)
│   └── src/
│       ├── main.rs               # Binary entry point
│       ├── lib.rs                # Library root: registers state, commands, plugins
│       ├── commands.rs           # All #[tauri::command] handlers (IPC layer)
│       ├── audio/
│       │   └── recorder.rs       # CPAL dual-track recorder (mic + system loopback)
│       ├── whisper/
│       │   └── engine.rs         # Whisper inference engine (transcribe_track, resample)
│       └── storage/
│           ├── history.rs        # meetings_index.json CRUD + language classifier
│           └── local_files.rs    # Markdown + JSON sidecar file I/O
│
├── build-android.ps1             # 3-step automated Android build script
├── sign-android.ps1              # APK signing + ADB install script
├── vite.config.ts                # Vite + Tauri plugin config
├── tsconfig.json                 # TypeScript config
└── package.json                  # npm scripts & JS dependencies
```

---

## 🚀 Getting Started

### Prerequisites

| Requirement | Version / Notes |
|---|---|
| **Node.js** | 20+ |
| **pnpm** | 9+ (`npm i -g pnpm`) |
| **Rust** | 1.80+ (`rustup`) |
| **Tauri CLI v2** | Installed via `pnpm tauri` |
| **Whisper model** | `ggml-base.bin` placed in the app data directory (see below) |

### Install Whisper Model

Vanilla requires a local GGML-format Whisper model at:

```
%APPDATA%\com.projectvanillas.app\models\ggml-base.bin   # Windows
~/Library/Application Support/com.projectvanillas.app/models/ggml-base.bin  # macOS
~/.local/share/com.projectvanillas.app/models/ggml-base.bin  # Linux
```

Download a model from [ggerganov/whisper.cpp releases](https://github.com/ggerganov/whisper.cpp):

```sh
# Example: download the base model (~142 MB)
curl -L -o ggml-base.bin https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin
```

### Desktop Development

```sh
# Install JS dependencies
pnpm install

# Start Tauri dev mode (hot-reload frontend + native backend)
pnpm tauri dev
```

### Desktop Build (Release)

```sh
pnpm tauri build
```

The installer/binary is placed in `src-tauri/target/release/bundle/`.

---

## 📱 Android Build

> **Windows only** — requires Android Studio, NDK 28, and JDK 17 (Eclipse Adoptium).

### Prerequisites (Android)

| Tool | Required Version / Path |
|---|---|
| **JDK 17** | `C:\Program Files\Eclipse Adoptium\jdk-17.0.20.101-hotspot` |
| **Android SDK** | `%LOCALAPPDATA%\Android\Sdk` |
| **Android NDK** | `%LOCALAPPDATA%\Android\Sdk\ndk\28.2.13676358` |
| **cargo-ndk** | `cargo install cargo-ndk` |
| **Rust target** | `rustup target add aarch64-linux-android` |

> These paths are hard-coded in `build-android.ps1`. Edit the script if your SDK/JDK lives elsewhere.

### Build & Run (Debug)

```powershell
# Full build: frontend → Rust/Whisper native libs → Gradle APK assembly
pnpm android

# Or directly:
powershell -ExecutionPolicy Bypass -File .\build-android.ps1
```

A connected ADB device is auto-detected and the APK is installed automatically.

### Build Release APK

```powershell
pnpm android:release
# Then sign (keystore is auto-created on first run):
pnpm android:sign
```

Signed APK is placed at:
```
src-tauri\gen\android\app\build\outputs\apk\arm64\release\app-arm64-release-signed.apk
```

---

## 🎛️ Recording Modes

Vanilla ships three preset audio capture modes selectable from the idle screen:

| Mode | Mic (Voice) | System (Participant) | Use Case |
|---|:---:|:---:|---|
| **Everyone** | ✅ | ✅ | In-person meetings + remote callers via speaker |
| **Participants** | ❌ | ✅ | Record remote call audio only (system audio) |
| **Solo** | ✅ | ❌ | Record only your voice (dictation, notes) |

Both tracks can also be toggled individually at any time — before or during a recording session.

---

## 🔊 Audio Pipeline

```
┌─────────────────────────────────────────────────────────┐
│                    CPAL Audio Recorder                   │
│                                                          │
│  Default Input Device        Default Output Device       │
│  (Microphone)                (System Loopback)           │
│        │                             │                   │
│  PCM f32 mono buffer          PCM f32 mono buffer        │
│  mic_buffer: Vec<f32>         system_buffer: Vec<f32>    │
│        │                             │                   │
│  RMS level → mic_level        RMS level → system_level   │
│  (AtomicU32, 20 Hz)           (AtomicU32, 20 Hz)         │
└──────────────┬──────────────────────┬────────────────────┘
               │   on Stop & Save     │
               ▼                      ▼
     whisper::engine::transcribe_track("You")
     whisper::engine::transcribe_track("Participant")
               │                      │
               └──────────┬───────────┘
                          ▼
              Chronological merge & sort
                          │
                          ▼
              storage::local_files::save_transcript_segments()
              → transcript_<date>.md
              → transcript_<date>.json  (sidecar)
                          │
                          ▼
              storage::history::add_meeting()
              → meetings_index.json
```

---

## 📝 Data Storage

All data is stored in the OS-native app data directory (never the cloud):

| File | Description |
|---|---|
| `models/ggml-base.bin` | Whisper GGML model (user-supplied) |
| `meetings_index.json` | Master index of all meeting records (title, date, duration, language) |
| `transcripts/transcript_<datetime>.md` | Human-readable Markdown transcript |
| `transcripts/transcript_<datetime>.json` | Structured JSON sidecar for in-app re-reads |

---

## 🛠️ Available Scripts

| Command | Action |
|---|---|
| `pnpm dev` | Vite dev server (frontend only) |
| `pnpm build` | TypeScript check + Vite production build |
| `pnpm tauri dev` | Full Tauri desktop dev mode |
| `pnpm tauri build` | Release desktop binary |
| `pnpm android` | Debug Android APK build |
| `pnpm android:release` | Release Android APK build |
| `pnpm android:sign` | Sign and install release APK |

---

## 🗺️ Roadmap

- [ ] Real-time Whisper streaming transcription (chunked inference during capture)
- [ ] Speaker diarization (multi-speaker separation beyond mic/system)
- [ ] Whisper model downloader UI (in-app, no manual file placement)
- [ ] macOS / Linux tested builds
- [ ] Search across all past transcripts
- [ ] AI meeting summary (local LLM integration)

---

## 📄 License

Private repository — all rights reserved.

---

> Built with [Tauri](https://tauri.app) · [whisper.cpp](https://github.com/ggerganov/whisper.cpp) · [React](https://react.dev) · [cpal](https://github.com/RustAudio/cpal)
