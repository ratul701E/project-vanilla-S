import React from "react";

interface TrackToggleProps {
  track: "mic" | "system";
  enabled: boolean;
  onToggle: () => void;
  variant?: "recording" | "idle";
}

export const TrackToggle: React.FC<TrackToggleProps> = ({
  track,
  enabled,
  onToggle,
  variant = "recording",
}) => {
  const isMic = track === "mic";
  const activeClass = isMic ? "active-in" : "active-out";
  const icon = isMic ? (enabled ? "🎙️" : "🔇") : (enabled ? "🔊" : "🔈");
  const label = isMic ? "Mic (In)" : "Speaker (Out)";
  const statusText = enabled ? "ON" : variant === "recording" ? "MUTED" : "OFF";
  const title = `${enabled ? "Mute" : "Enable"} ${isMic ? "Microphone" : "Speaker"} (${isMic ? "In" : "Out"})`;

  return (
    <button
      className={`track-pill-btn ${enabled ? activeClass : "muted-track"}`}
      onClick={onToggle}
      title={title}
    >
      <span className="track-indicator-dot" />
      <span className="track-icon">{icon}</span>
      <span className="track-label">
        {label} <strong>{statusText}</strong>
      </span>
    </button>
  );
};
