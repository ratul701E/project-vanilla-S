import React from "react";
import { formatElapsed } from "../../utils/formatters";
import { Waveform } from "./Waveform";
import { TrackToggle } from "./TrackToggle";

interface RecordingWorkspaceProps {
  detectedLanguage: string;
  elapsed: number;
  isPaused: boolean;
  micEnabled: boolean;
  systemAudioEnabled: boolean;
  onToggleTrack: (track: "mic" | "system") => void;
  onTogglePause: () => void;
  onStopAndSave: () => void;
}

export const RecordingWorkspace: React.FC<RecordingWorkspaceProps> = ({
  detectedLanguage,
  elapsed,
  isPaused,
  micEnabled,
  systemAudioEnabled,
  onToggleTrack,
  onTogglePause,
  onStopAndSave,
}) => {
  return (
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
        <Waveform elapsed={elapsed} isPaused={isPaused} />

        {/* In/Out Audio Track Control Buttons */}
        <div className="track-controls-pills">
          <TrackToggle
            track="mic"
            enabled={micEnabled}
            onToggle={() => onToggleTrack("mic")}
            variant="recording"
          />
          <TrackToggle
            track="system"
            enabled={systemAudioEnabled}
            onToggle={() => onToggleTrack("system")}
            variant="recording"
          />
        </div>

        {/* Controls Bar */}
        <div className="recording-controls-bar">
          <button
            className="control-circle-btn"
            onClick={onTogglePause}
            title={isPaused ? "Resume" : "Pause"}
          >
            {isPaused ? "▶" : "❚❚"}
          </button>

          <button className="stop-save-btn" onClick={onStopAndSave}>
            <div className="stop-icon-square" />
            <span>Stop & save</span>
          </button>
        </div>
      </div>
    </div>
  );
};
