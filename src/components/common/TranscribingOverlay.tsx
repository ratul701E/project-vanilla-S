import React from "react";

export const TranscribingOverlay: React.FC = () => {
  return (
    <div className="transcribing-overlay">
      <div className="classic-spinner" />
      <div className="transcribing-label">Transcribing audio locally…</div>
      <div className="transcribing-sub">
        Processing speech using local Whisper model. Private and offline.
      </div>
    </div>
  );
};
