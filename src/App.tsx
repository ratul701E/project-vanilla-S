import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";

// ─── Types ────────────────────────────────────────────────────
type AppStatus = "idle" | "recording" | "transcribing" | "done";

interface TranscriptionResult {
  transcript: string;
  file_path: string;
}

// ─── Helpers ──────────────────────────────────────────────────
function formatElapsed(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return [h, m, s].map((v) => String(v).padStart(2, "0")).join(":");
}

const STATUS_LABELS: Record<AppStatus, string> = {
  idle: "Ready",
  recording: "Recording",
  transcribing: "Transcribing",
  done: "Complete",
};

// ─── Component ────────────────────────────────────────────────
function App() {
  const [status, setStatus] = useState<AppStatus>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [filePath, setFilePath] = useState("");
  const [error, setError] = useState<string | null>(null);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Timer management ──
  const startTimer = useCallback(() => {
    setElapsed(0);
    timerRef.current = setInterval(() => {
      setElapsed((prev) => prev + 1);
    }, 1000);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => stopTimer();
  }, [stopTimer]);

  // ── Actions ──
  const handleStart = async () => {
    setError(null);
    try {
      await invoke<string>("start_meeting");
      setStatus("recording");
      setTranscript("");
      setFilePath("");
      startTimer();
    } catch (err) {
      setError(String(err));
    }
  };

  const handleStop = async () => {
    stopTimer();
    setStatus("transcribing");
    setError(null);
    try {
      const result = await invoke<TranscriptionResult>("stop_and_transcribe");
      setTranscript(result.transcript);
      setFilePath(result.file_path);
      setStatus("done");
    } catch (err) {
      setError(String(err));
      setStatus("idle");
    }
  };

  const handleNewMeeting = () => {
    setStatus("idle");
    setTranscript("");
    setFilePath("");
    setElapsed(0);
    setError(null);
  };

  // ── Render helpers ──
  const renderContent = () => {
    switch (status) {
      case "idle":
        return (
          <div className="empty-state">
            <div className="empty-icon">🎙️</div>
            <div className="empty-title">No active meeting</div>
            <div className="empty-subtitle">
              Click <strong>Start Meeting</strong> to begin capturing audio.
              Your speech will be transcribed locally using Whisper — 100%
              offline, nothing leaves your machine.
            </div>
          </div>
        );

      case "recording":
        return (
          <div className="recording-indicator">
            <div className="waveform">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="waveform-bar" />
              ))}
            </div>
            <div className="recording-label">Listening to your microphone…</div>
          </div>
        );

      case "transcribing":
        return (
          <div className="transcribing-state">
            <div className="spinner" />
            <div className="transcribing-label">
              Running Whisper inference — this may take a moment…
            </div>
          </div>
        );

      case "done":
        return (
          <div className="transcript-section">
            <div className="transcript-header">
              <div className="transcript-title">
                <span className="transcript-title-icon">✓</span>
                Transcript
              </div>
              <button
                className="new-meeting-btn"
                onClick={handleNewMeeting}
                id="new-meeting-btn"
              >
                + New Meeting
              </button>
            </div>
            <div className="transcript-body" id="transcript-body">
              {transcript}
            </div>
            {filePath && (
              <div className="file-path-bar">
                📄 <span title={filePath}>{filePath}</span>
              </div>
            )}
          </div>
        );
    }
  };

  return (
    <div className="app">
      {/* ── Header ── */}
      <header className="header">
        <div className="header-left">
          <div className="app-icon">🎤</div>
          <div>
            <div className="app-title">Vanilla-S</div>
            <div className="app-subtitle">Offline Meeting Notes</div>
          </div>
        </div>
        <div className={`status-badge ${status}`}>
          <div className="status-dot" />
          {STATUS_LABELS[status]}
        </div>
      </header>

      {/* ── Main Card ── */}
      <div className={`main-card ${status}`}>
        {/* Control Bar */}
        <div className="control-bar">
          <div className={`timer ${status}`}>
            {formatElapsed(elapsed)}
          </div>

          {status === "idle" && (
            <button
              className="action-btn start"
              onClick={handleStart}
              id="start-btn"
            >
              <span className="btn-icon">⏺</span>
              Start Meeting
            </button>
          )}

          {status === "recording" && (
            <button
              className="action-btn stop"
              onClick={handleStop}
              id="stop-btn"
            >
              <span className="btn-icon">⏹</span>
              Stop & Transcribe
            </button>
          )}

          {status === "transcribing" && (
            <button className="action-btn stop" disabled id="transcribing-btn">
              <span className="btn-icon">⏳</span>
              Processing…
            </button>
          )}

          {status === "done" && (
            <button
              className="action-btn start"
              onClick={handleNewMeeting}
              id="done-new-btn"
            >
              <span className="btn-icon">🔄</span>
              New Meeting
            </button>
          )}
        </div>

        {/* Content Area */}
        <div className="content-area">{renderContent()}</div>
      </div>

      {/* ── Error Toast ── */}
      {error && (
        <div className="error-toast" id="error-toast">
          ⚠️ {error}
          <button
            className="error-dismiss"
            onClick={() => setError(null)}
            id="error-dismiss-btn"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}

export default App;
