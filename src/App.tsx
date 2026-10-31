import React, { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import "./App.css";

// ── Types ──────────────────────────────────────────────────────
import {
  MeetingRecord,
  TranscriptSegment,
  MeetingDetail,
  LiveLanguagePayload,
  StopAndTranscribeResult,
  TrackState,
} from "./types/meeting";

export type { MeetingRecord, TranscriptSegment, MeetingDetail };

// ── Components ────────────────────────────────────────────────
import { Sidebar } from "./components/sidebar/Sidebar";
import { RecordingWorkspace } from "./components/recording/RecordingWorkspace";
import { MeetingDetailWorkspace } from "./components/detail/MeetingDetailWorkspace";
import { IdleWorkspace } from "./components/idle/IdleWorkspace";
import { TranscribingOverlay } from "./components/common/TranscribingOverlay";
import { ErrorBanner } from "./components/common/ErrorBanner";
import { Toast } from "./components/common/Toast";
import { formatDateMeta } from "./utils/formatters";

// ── Main Application Component ───────────────────────────────
export default function App() {
  // App views: "recording" | "detail" | "idle"
  const [view, setView] = useState<"recording" | "detail" | "idle">("idle");
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  // Audio track states (In / Out)
  const [micEnabled, setMicEnabled] = useState(true);
  const [systemAudioEnabled, setSystemAudioEnabled] = useState(true);

  // History & active detail
  const [history, setHistory] = useState<MeetingRecord[]>([]);
  const [selectedMeetingId, setSelectedMeetingId] = useState<string | null>(null);
  const [currentDetail, setCurrentDetail] = useState<MeetingDetail | null>(null);

  // Live language telemetry
  const [detectedLanguage, setDetectedLanguage] = useState<string>("Bangla");

  // Sidebar toggle
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Feedback notifications
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // ── Sync initial audio track states ──
  useEffect(() => {
    invoke<TrackState>("get_track_state")
      .then((state) => {
        setMicEnabled(state.mic_enabled);
        setSystemAudioEnabled(state.system_enabled);
      })
      .catch((err) => console.warn("Failed to query track state:", err));
  }, []);

  // ── Action: Toggle Track In/Out ──
  const handleToggleTrack = async (track: "mic" | "system") => {
    const nextState = track === "mic" ? !micEnabled : !systemAudioEnabled;
    if (track === "mic") {
      setMicEnabled(nextState);
    } else {
      setSystemAudioEnabled(nextState);
    }

    try {
      await invoke("set_track_state", { track, enabled: nextState });
      showToast(
        `${track === "mic" ? "Microphone (In)" : "Speaker (Out)"} ${
          nextState ? "Enabled" : "Muted"
        }`
      );
    } catch (err) {
      console.warn("Failed to set track state:", err);
    }
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
      const result = await invoke<StopAndTranscribeResult>("stop_and_transcribe");

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
    const text = Array.isArray(currentDetail.transcript)
      ? currentDetail.transcript
          .map((s) => `[${s.timestamp}] ${s.speaker}: ${s.text}`)
          .join("\n\n")
      : String(currentDetail.transcript);
    navigator.clipboard.writeText(text);
    showToast("Transcript copied to clipboard.");
  };

  // ── Action: Export Markdown ──
  const handleExportMarkdown = () => {
    if (!currentDetail) return;
    const dialogue = Array.isArray(currentDetail.transcript)
      ? currentDetail.transcript
          .map((s) => `**[${s.timestamp}] ${s.speaker}:** ${s.text}`)
          .join("\n\n")
      : String(currentDetail.transcript);

    const md = `# ${currentDetail.record.title}\n\n- **Date:** ${formatDateMeta(
      currentDetail.record.created_at
    )}\n- **Duration:** ${currentDetail.record.duration}\n- **Language:** ${
      currentDetail.record.language_detected
    }\n\n---\n\n## Transcript\n\n${dialogue}\n`;

    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${currentDetail.record.title.replace(/\s+/g, "_")}.md`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("Markdown exported.");
  };

  return (
    <div className="vanilla-app">
      {/* ── Left Sidebar ── */}
      <Sidebar
        isOpen={sidebarOpen}
        isRecording={isRecording}
        history={history}
        selectedMeetingId={selectedMeetingId}
        onStartRecording={handleStartRecording}
        onViewRecording={() => setView("recording")}
        onSelectMeeting={handleSelectMeeting}
        onDeleteMeeting={handleDeleteMeeting}
        onSettingsClick={() => showToast("Vanilla Local-First Studio v0.1.0")}
      />

      {/* ── Right Main Canvas ── */}
      <main className="main-canvas">
        {/* Top Header / Breadcrumb Bar */}
        <div className="canvas-header-bar">
          <button
            className="sidebar-toggle-btn"
            onClick={() => setSidebarOpen((prev) => !prev)}
            title="Toggle Sidebar"
          >
            ◫
          </button>
        </div>

        {/* Error notification banner */}
        <ErrorBanner
          message={errorMessage}
          onDismiss={() => setErrorMessage(null)}
        />

        {/* Canvas Workspace Body */}
        <div className="canvas-content">
          {isTranscribing && <TranscribingOverlay />}

          {!isTranscribing && view === "recording" && (
            <RecordingWorkspace
              detectedLanguage={detectedLanguage}
              elapsed={elapsed}
              isPaused={isPaused}
              micEnabled={micEnabled}
              systemAudioEnabled={systemAudioEnabled}
              onToggleTrack={handleToggleTrack}
              onTogglePause={() => setIsPaused((prev) => !prev)}
              onStopAndSave={handleStopAndSave}
            />
          )}

          {!isTranscribing && view === "detail" && currentDetail && (
            <MeetingDetailWorkspace
              detail={currentDetail}
              onTitleChange={(val) => {
                setCurrentDetail((prev) =>
                  prev
                    ? {
                        ...prev,
                        record: { ...prev.record, title: val },
                      }
                    : null
                );
              }}
              onRename={handleRenameMeeting}
              onCopyTranscript={handleCopyTranscript}
              onExportMarkdown={handleExportMarkdown}
              onDelete={handleDeleteMeeting}
            />
          )}

          {!isTranscribing && view === "idle" && (
            <IdleWorkspace
              micEnabled={micEnabled}
              systemAudioEnabled={systemAudioEnabled}
              onToggleTrack={handleToggleTrack}
              onStartRecording={handleStartRecording}
            />
          )}
        </div>
      </main>

      {/* ── Toast Notification ── */}
      <Toast message={toastMessage} />
    </div>
  );
}
