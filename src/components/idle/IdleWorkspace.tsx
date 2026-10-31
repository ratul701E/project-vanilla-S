import React from "react";
import { Mic, Volume2, AudioLines, MicOff, VolumeX } from "lucide-react";

export type RecordingMode = "everyone" | "participants" | "solo";

interface IdleWorkspaceProps {
  micEnabled: boolean;
  systemAudioEnabled: boolean;
  onToggleTrack: (track: "mic" | "system") => void;
  onSetMode?: (mode: RecordingMode) => void;
  onStartRecording: () => void;
}

export const IdleWorkspace: React.FC<IdleWorkspaceProps> = ({
  micEnabled,
  systemAudioEnabled,
  onToggleTrack,
  onSetMode,
  onStartRecording,
}) => {
  const modes: { id: RecordingMode; label: string }[] = [
    { id: "everyone", label: "Everyone" },
    { id: "participants", label: "Participants" },
    { id: "solo", label: "Solo" },
  ];

  // Derive active preset mode if track states match one of the presets
  const activeMode: RecordingMode | null =
    micEnabled && systemAudioEnabled
      ? "everyone"
      : !micEnabled && systemAudioEnabled
      ? "participants"
      : micEnabled && !systemAudioEnabled
      ? "solo"
      : null;

  const handleModeClick = (modeId: RecordingMode) => {
    if (onSetMode) {
      onSetMode(modeId);
    } else {
      if (modeId === "everyone") {
        if (!micEnabled) onToggleTrack("mic");
        if (!systemAudioEnabled) onToggleTrack("system");
      } else if (modeId === "participants") {
        if (micEnabled) onToggleTrack("mic");
        if (!systemAudioEnabled) onToggleTrack("system");
      } else if (modeId === "solo") {
        if (!micEnabled) onToggleTrack("mic");
        if (systemAudioEnabled) onToggleTrack("system");
      }
    }
  };

  const getSourceDescription = () => {
    if (micEnabled && systemAudioEnabled) {
      return "Capturing both voice and system sound";
    }
    if (!micEnabled && systemAudioEnabled) {
      return "Capturing system sound only";
    }
    if (micEnabled && !systemAudioEnabled) {
      return "Capturing your microphone voice only";
    }
    return "All audio sources disabled";
  };

  return (
    <div className="idle-workspace">
      {/* Background Glow Effect */}
      <div className="idle-glow-bg" />

      {/* Main Content */}
      <div className="idle-content">
        {/* Header */}
        <div className="idle-header">
          <h1 className="idle-title ">Vanilla</h1>
          <p className="idle-subtitle">
            Offline, local-first meeting transcription.
          </p>
        </div>

        {/* Control Panel */}
        <div className="idle-control-card">
          {/* Mode Selection Tabs */}
          <div className="idle-modes-bar">
            {modes.map((mode) => {
              const isActive = activeMode === mode.id;
              return (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => handleModeClick(mode.id)}
                  className={`idle-mode-tab ${isActive ? "active" : "inactive"}`}
                >
                  {mode.label}
                </button>
              );
            })}
          </div>

          {/* Audio Source Indicator */}
          <div className="idle-source-indicator">
            <div className="idle-source-group">
              {/* Voice Icon */}
              <button
                type="button"
                onClick={() => onToggleTrack("mic")}
                className={`idle-source-item voice ${micEnabled ? "active" : "muted"}`}
                title={
                  micEnabled
                    ? "Voice (Mic) is active. Click to mute."
                    : "Voice (Mic) is muted. Click to enable."
                }
              >
                {micEnabled ? (
                  <Mic size={13} strokeWidth={2.4} />
                ) : (
                  <MicOff size={13} strokeWidth={2.4} />
                )}
                <span className="idle-source-text">Voice</span>
              </button>

              {/* Connecting Line */}
              <div
                className={`idle-source-line ${
                  micEnabled && systemAudioEnabled
                    ? "both-active"
                    : micEnabled
                    ? "mic-only"
                    : systemAudioEnabled
                    ? "system-only"
                    : "none-active"
                }`}
              />

              {/* System Icon */}
              <button
                type="button"
                onClick={() => onToggleTrack("system")}
                className={`idle-source-item system ${systemAudioEnabled ? "active" : "muted"}`}
                title={
                  systemAudioEnabled
                    ? "System audio is active. Click to mute."
                    : "System audio is muted. Click to enable."
                }
              >
                {systemAudioEnabled ? (
                  <Volume2 size={13} strokeWidth={2.4} />
                ) : (
                  <VolumeX size={13} strokeWidth={2.4} />
                )}
                <span className="idle-source-text">System</span>
              </button>
            </div>

            <span className="idle-source-hint">{getSourceDescription()}</span>
          </div>

          {/* Start Recording Button */}
          <button
            type="button"
            className="idle-start-recording-btn"
            onClick={onStartRecording}
          >
            <AudioLines />
            <span>Start Capturing</span>
          </button>
        </div>
      </div>
    </div>
  );
};
