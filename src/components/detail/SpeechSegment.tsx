import React from "react";
import { TranscriptSegment } from "../../types/meeting";
import { renderBilingualText } from "../../utils/text";

interface SpeechSegmentProps {
  segment: TranscriptSegment;
}

export const SpeechSegment: React.FC<SpeechSegmentProps> = ({ segment }) => {
  const isYou = segment.speaker.toLowerCase() === "you";

  return (
    <div
      className={`speech-segment ${
        isYou ? "speech-segment-you" : "speech-segment-participant"
      }`}
    >
      <div className={`speaker-avatar ${isYou ? "spk-you" : "spk-participant"}`}>
        {isYou ? "👤" : "👥"}
      </div>

      <div className="speech-content">
        <div className="speech-header">
          <span className="speech-speaker-name">
            {segment.speaker}
            <span
              className={`speaker-tag ${
                isYou ? "tag-you" : "tag-participant"
              }`}
            >
              {isYou ? "You (Mic)" : "Participant (System)"}
            </span>
          </span>
          <span className="speech-timecode">{segment.timestamp}</span>
        </div>

        <div className="speech-body">{renderBilingualText(segment.text)}</div>
      </div>
    </div>
  );
};
