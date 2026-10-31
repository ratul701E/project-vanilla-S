import React from "react";
import { TrackToggle } from "../recording/TrackToggle";

interface IdleWorkspaceProps {
  micEnabled: boolean;
  systemAudioEnabled: boolean;
  onToggleTrack: (track: "mic" | "system") => void;
  onStartRecording: () => void;
}

export const IdleWorkspace: React.FC<IdleWorkspaceProps> = ({
  micEnabled,
  systemAudioEnabled,
  onToggleTrack,
  onStartRecording,
}) => {
  return (
    <div className="idle-workspace">
      <div className="idle-logo">Vanilla</div>
      <div className="idle-tagline">
        Offline, local-first meeting transcription. Private and crafted with classic precision.
      </div>

      {/* Pre-session Track Control Toggles */}
      <div className="idle-track-bar">
        <span className="idle-track-hint">Capture Channels:</span>
        <TrackToggle
          track="mic"
          enabled={micEnabled}
          onToggle={() => onToggleTrack("mic")}
          variant="idle"
        />
        <TrackToggle
          track="system"
          enabled={systemAudioEnabled}
          onToggle={() => onToggleTrack("system")}
          variant="idle"
        />
      </div>

      <button className="idle-start-btn" onClick={onStartRecording}>
        <span>⏺</span>
        <span>Start a new meeting</span>
      </button>
    </div>
  );
};
