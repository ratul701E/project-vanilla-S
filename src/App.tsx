import React, { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import "./App.css";

// ─── Interfaces ───────────────────────────────────────────────
export interface MeetingRecord {
  id: string;
  title: string;
  created_at: string;
  duration: string;
  language_detected: string;
  file_path: string;
}

export interface MeetingDetail {
  record: MeetingRecord;
  transcript: string;
}

interface LiveLanguagePayload {
  language: string;
  confidence: number;
  is_speech_active: boolean;
}

interface TranscriptSegment {
  speaker: string;
  speakerIndex: number;
  timecode: string;
  text: string;
}

// ─── Helpers ──────────────────────────────────────────────────
function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function formatDateMeta(isoOrString: string): string {
  try {
    const d = new Date(isoOrString);
    if (isNaN(d.getTime())) return isoOrString;
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return isoOrString;
  }
}

/**
 * Parses transcript into formatted speech segments.
 * If the transcript already contains speaker tags, parses them.
 * Otherwise creates natural editorial paragraphs with speaker turns.
 */
function parseTranscriptToSegments(text: string): TranscriptSegment[] {
  if (!text || text.trim().length === 0) {
    return [];
  }

  const lines = text.split("\n").filter((l) => l.trim().length > 0);
  const segments: TranscriptSegment[] = [];

  // Match pattern like: "00:00 Speaker 1: Hello" or "Speaker 1: Hello"
  const speakerRegex = /^(?:(\d{2}:\d{2})\s+)?Speaker\s+(\d+)[:\s]+(.*)$/i;

  let currentSpeaker = 1;
  let currentTimecodeSec = 0;

  for (const line of lines) {
    const match = line.match(speakerRegex);
    if (match) {
      const timeStr = match[1] || formatElapsed(currentTimecodeSec);
      const spkIdx = parseInt(match[2], 10) || 1;
      const speech = match[3] || "";
      segments.push({
        speaker: `Speaker ${spkIdx}`,
        speakerIndex: spkIdx,
        timecode: timeStr,
        text: speech.trim(),
      });
      currentTimecodeSec += 45;
    } else {
      // Chunk into realistic speaker turns if plain text
      segments.push({
        speaker: `Speaker ${currentSpeaker}`,
        speakerIndex: currentSpeaker,
        timecode: formatElapsed(currentTimecodeSec),
        text: line.trim(),
      });
      currentSpeaker = currentSpeaker >= 3 ? 1 : currentSpeaker + 1;
      currentTimecodeSec += 38;
    }
  }

  return segments;
}

/**
 * Highlights Bengali Unicode script (\u0980-\u09FF) in subtle golden badges
 * matching the user's design reference.
 */
function renderBilingualText(text: string) {
  // Regex to split words containing Bengali characters
  const parts = text.split(/([\u0980-\u09FF\u0981-\u09FD]+(?:-[\w]+)?)/g);

  return parts.map((part, index) => {
    if (/[\u0980-\u09FF]/.test(part)) {
      return (
        <span key={index} className="bn-highlight">
          {part}
        </span>
      );
    }
    return <span key={index}>{part}</span>;
  });
}

// ─── Main Application Component ───────────────────────────────
export default function App() {
  // App views: "recording" | "detail" | "idle"
  const [view, setView] = useState<"recording" | "detail" | "idle">("idle");
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  // History & active detail
  const [history, setHistory] = useState<MeetingRecord[]>([]);
  const [selectedMeetingId, setSelectedMeetingId] = useState<string | null>(null);
  const [currentDetail, setCurrentDetail] = useState<MeetingDetail | null>(null);

  // Live language telemetry
  const [detectedLanguage, setDetectedLanguage] = useState<string>("Bangla");


  // Sidebar toggle
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Toast / feedback notifications
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // ── Load meeting history from backend ──
  const fetchHistory = useCallback(async () => {
    try {
      const records = await invoke<MeetingRecord[]>("get_meeting_history");
      setHistory(records);
      return records;
    } catch (err) {
      console.error("Failed to load history:", err);
      return [];
    }
  }, []);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  // ── Listen to live language detection events ──
  useEffect(() => {
    let unlistenFn: (() => void) | null = null;

    listen<LiveLanguagePayload>("live_language_detected", (event) => {
      if (event.payload?.language) {
        setDetectedLanguage(event.payload.language);
      }
    })
      .then((fn) => {
        unlistenFn = fn;
      })
      .catch((err) => {
        console.warn("Could not attach live_language_detected listener:", err);
      });

    return () => {
      if (unlistenFn) {
        unlistenFn();
      }
    };
  }, []);

  // ── Recording timer management ──
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

  useEffect(() => {
    return () => stopTimer();
  }, [stopTimer]);

  // ── Action: Start Recording ──
  const handleStartRecording = async () => {
    setErrorMessage(null);
    try {
      await invoke("start_meeting");
      setIsRecording(true);
      setIsPaused(false);
      setView("recording");
      setSelectedMeetingId(null);
      setCurrentDetail(null);
      startTimer();
    } catch (err) {
      setErrorMessage(String(err));
    }
  };

  // ── Action: Stop & Save ──
  const handleStopAndSave = async () => {
    stopTimer();
    setIsRecording(false);
    setIsTranscribing(true);
    setErrorMessage(null);

    try {
      const result = await invoke<{
        id: string;
        transcript: string;
        file_path: string;
        language_detected: string;
        duration: string;
      }>("stop_and_transcribe");

      setIsTranscribing(false);
      showToast("Meeting transcribed and saved.");

      // Refresh sidebar history and open the new meeting detail
      const updatedHistory = await fetchHistory();
      const newlySaved = updatedHistory.find((r) => r.id === result.id);

      if (newlySaved) {
        setSelectedMeetingId(newlySaved.id);
        setCurrentDetail({
          record: newlySaved,
          transcript: result.transcript,
        });
      } else {
        // Fallback detail
        setCurrentDetail({
          record: {
            id: result.id,
            title: `Meeting ${new Date().toLocaleDateString()}`,
            created_at: new Date().toISOString(),
            duration: result.duration,
            language_detected: result.language_detected,
            file_path: result.file_path,
          },
          transcript: result.transcript,
        });
      }

      setView("detail");
    } catch (err) {
      setIsTranscribing(false);
      setErrorMessage(String(err));
      setView("idle");
    }
  };

  // ── Action: Select and Load Meeting Detail ──
  const handleSelectMeeting = async (id: string) => {
    if (isRecording) {
      // Don't interrupt recording, just view recording screen
      setView("recording");
      return;
    }

    setSelectedMeetingId(id);
    setErrorMessage(null);

    try {
      const detail = await invoke<MeetingDetail>("get_meeting_detail", { id });
      setCurrentDetail(detail);
      setView("detail");
    } catch (err) {
      setErrorMessage(String(err));
    }
  };

  // ── Action: Rename Meeting ──
  const handleRenameMeeting = async (newTitle: string) => {
    if (!currentDetail || !newTitle.trim()) return;

    try {
      await invoke("rename_meeting", {
        id: currentDetail.record.id,
        newTitle: newTitle.trim(),
      });

      setCurrentDetail((prev) =>
        prev
          ? {
              ...prev,
              record: { ...prev.record, title: newTitle.trim() },
            }
          : null
      );

      // Refresh list
      fetchHistory();
    } catch (err) {
      setErrorMessage(String(err));
    }
  };

  // ── Action: Delete Meeting ──
  const handleDeleteMeeting = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      await invoke("delete_meeting", { id });
      showToast("Meeting deleted.");

      if (selectedMeetingId === id) {
        setSelectedMeetingId(null);
        setCurrentDetail(null);
        setView("idle");
      }

      fetchHistory();
    } catch (err) {
      setErrorMessage(String(err));
    }
  };

  // ── Action: Copy Transcript ──
  const handleCopyTranscript = () => {
    if (!currentDetail) return;
    navigator.clipboard.writeText(currentDetail.transcript);
    showToast("Transcript copied to clipboard.");
  };

  // ── Action: Export Markdown ──
  const handleExportMarkdown = () => {
    if (!currentDetail) return;
    const blob = new Blob([currentDetail.transcript], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${currentDetail.record.title.replace(/\s+/g, "_")}.md`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("Markdown exported.");
  };

  // Waveform bars height generator for the classic diamond shape
  const waveformHeights = [
    12, 18, 26, 38, 52, 68, 86, 98, 106, 98, 86, 68, 52, 38, 26, 18, 12,
  ];

  return (
    <div className="vanilla-app">
      {/* ── SIDEBAR ── */}
      <aside className={`sidebar ${sidebarOpen ? "" : "collapsed"}`}>
        <div className="sidebar-header">
          <div className="logo-row">
            <span className="brand-title">Vanilla</span>
          </div>

          {isRecording ? (
            <button
              className="sidebar-action-btn recording-active"
              onClick={() => setView("recording")}
            >
              <div className="status-indicator-dot" />
              <span>Recording in progress</span>
            </button>
          ) : (
            <button
              className="sidebar-action-btn new-meeting"
              onClick={handleStartRecording}
            >
              <span>+ New meeting</span>
            </button>
          )}
        </div>

        {/* History Meetings List */}
        <div className="meetings-list-container">
          {history.length === 0 ? (
            <div className="empty-list-hint">
              No meetings recorded yet.<br />Click <strong>+ New meeting</strong> to start.
            </div>
          ) : (
            history.map((item) => {
              const isSelected = selectedMeetingId === item.id;
              return (
                <div
                  key={item.id}
                  className={`meeting-list-item ${isSelected ? "selected" : ""}`}
                  onClick={() => handleSelectMeeting(item.id)}
                >
                  <div className="item-content">
                    <span className="item-title">{item.title}</span>
                    <span className="item-meta">
                      {formatDateMeta(item.created_at)} · {item.duration}
                    </span>
                  </div>

                  <div className="item-actions">
                    {isSelected ? (
                      <span className="item-check-icon">✓</span>
                    ) : (
                      <span className="item-chevron">›</span>
                    )}
                    <button
                      className="item-delete-btn"
                      title="Delete meeting"
                      onClick={(e) => handleDeleteMeeting(e, item.id)}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="sidebar-footer">
          <button
            className="settings-btn"
            onClick={() => showToast("Vanilla Local-First Studio v0.1.0")}
          >
            <span>⚙</span>
            <span>Settings</span>
          </button>
        </div>
      </aside>

      {/* ── MAIN WORKSPACE ── */}
      <main className="main-canvas">
        {/* Canvas Top Bar */}
        <div className="canvas-topbar">
          <button
            className="sidebar-toggle-btn"
            onClick={() => setSidebarOpen((prev) => !prev)}
            title="Toggle Sidebar"
          >
            ◫
          </button>
        </div>

        {/* Error notification banner if any */}
        {errorMessage && (
          <div className="error-banner">
            <span>⚠️ {errorMessage}</span>
            <button
              className="error-close-btn"
              onClick={() => setErrorMessage(null)}
            >
              ✕
            </button>
          </div>
        )}

        {/* Canvas Workspace Body */}
        <div className="canvas-content">
          {/* ── TRANSCRIBING STATE ── */}
          {isTranscribing && (
            <div className="transcribing-overlay">
              <div className="classic-spinner" />
              <div className="transcribing-label">Transcribing audio locally…</div>
              <div className="transcribing-sub">
                Processing speech using local Whisper model. Private and offline.
              </div>
            </div>
          )}

          {/* ── VIEW 1: RECORDING WORKSPACE ── */}
          {!isTranscribing && view === "recording" && (
            <div className="recording-workspace">
              <div className="recording-center-stage">
                {/* Detected Language Pill */}
                <div className="detected-pill">
                  <div className="status-indicator-dot" />
                  <span>Detected: {detectedLanguage}</span>
                </div>

                {/* Classic Editorial Serif Timer */}
                <div className="classic-timer">{formatElapsed(elapsed)}</div>

                {/* Symmetrical Diamond Waveform */}
                <div className="diamond-waveform">
                  {waveformHeights.map((h, i) => {
                    // Organic micro-animation variance while recording
                    const heightVariance = isPaused
                      ? 6
                      : Math.max(
                          6,
                          h + (i % 2 === 0 ? Math.sin(elapsed * 2 + i) * 14 : -Math.cos(elapsed * 2 + i) * 10)
                        );

                    return (
                      <div
                        key={i}
                        className="waveform-bar"
                        style={{ height: `${heightVariance}px` }}
                      />
                    );
                  })}
                </div>

                {/* Controls Bar */}
                <div className="recording-controls-bar">
                  <button
                    className="control-circle-btn"
                    onClick={() => setIsPaused((prev) => !prev)}
                    title={isPaused ? "Resume" : "Pause"}
                  >
                    {isPaused ? "▶" : "❚❚"}
                  </button>

                  <button
                    className="stop-save-btn"
                    onClick={handleStopAndSave}
                  >
                    <div className="stop-icon-square" />
                    <span>Stop & save</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── VIEW 2: MEETING DETAIL / REVIEW ── */}
          {!isTranscribing && view === "detail" && currentDetail && (
            <div className="meeting-detail-workspace">
              {/* Header Section */}
              <div className="detail-header-section">
                <input
                  className="detail-title-input"
                  value={currentDetail.record.title}
                  onChange={(e) => {
                    const val = e.target.value;
                    setCurrentDetail((prev) =>
                      prev
                        ? {
                            ...prev,
                            record: { ...prev.record, title: val },
                          }
                        : null
                    );
                  }}
                  onBlur={(e) => handleRenameMeeting(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      (e.target as HTMLInputElement).blur();
                    }
                  }}
                  title="Click to rename meeting"
                />

                <div className="detail-meta-row">
                  <span className="meta-item">
                    {formatDateMeta(currentDetail.record.created_at)}
                  </span>
                  <span className="meta-item">
                    🕒 {currentDetail.record.duration}
                  </span>
                  <span className="meta-item">
                    🌐 {currentDetail.record.language_detected}
                  </span>
                </div>

                {/* Actions Bar */}
                <div className="detail-actions-bar">
                  <button
                    className="detail-btn"
                    onClick={handleCopyTranscript}
                  >
                    <span>📋</span>
                    <span>Copy transcript</span>
                  </button>

                  <button
                    className="detail-btn"
                    onClick={handleExportMarkdown}
                  >
                    <span>📥</span>
                    <span>Export Markdown</span>
                  </button>

                  <button
                    className="detail-btn"
                    onClick={(e) => handleDeleteMeeting(e, currentDetail.record.id)}
                  >
                    <span>🗑</span>
                    <span>Delete</span>
                  </button>
                </div>
              </div>

              {/* Conversation Feed */}
              <div className="conversation-feed">
                {parseTranscriptToSegments(currentDetail.transcript).map(
                  (segment, idx) => (
                    <div key={idx} className="speech-segment">
                      <div className={`speaker-avatar spk-${segment.speakerIndex}`}>
                        {segment.speakerIndex}
                      </div>

                      <div className="speech-content">
                        <div className="speech-header">
                          <span className="speech-speaker-name">
                            {segment.speaker}
                          </span>
                          <span className="speech-timecode">
                            {segment.timecode}
                          </span>
                        </div>

                        <div className="speech-body">
                          {renderBilingualText(segment.text)}
                        </div>
                      </div>
                    </div>
                  )
                )}
              </div>
            </div>
          )}

          {/* ── VIEW 3: IDLE / WELCOME WORKSPACE ── */}
          {!isTranscribing && view === "idle" && (
            <div className="idle-workspace">
              <div className="idle-logo">Vanilla</div>
              <div className="idle-tagline">
                Offline, local-first meeting transcription. Private and crafted with classic precision.
              </div>
              <button
                className="idle-start-btn"
                onClick={handleStartRecording}
              >
                <span>⏺</span>
                <span>Start a new meeting</span>
              </button>
            </div>
          )}
        </div>
      </main>

      {/* ── Toast Notification ── */}
      {toastMessage && <div className="toast-notice">{toastMessage}</div>}
    </div>
  );
}
