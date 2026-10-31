import React from "react";
import { UserIcon } from "../common/Icons";
import { renderBilingualText } from "../../utils/text";

export interface UtteranceItem {
  timestamp: string;
  text: string;
}

export interface SpeakerGroupData {
  speaker: string;
  isYou: boolean;
  timeRange: string;
  utterances: UtteranceItem[];
}

interface SpeakerTimelineGroupProps {
  group: SpeakerGroupData;
}

export const SpeakerTimelineGroup: React.FC<SpeakerTimelineGroupProps> = ({ group }) => {
  const { speaker, isYou, timeRange, utterances } = group;

  const badgeText = isYou ? "YOU (MIC)" : `${speaker.toUpperCase()} (SYSTEM)`;

  return (
    <div className={`speaker-timeline-group ${isYou ? "speaker-you" : "speaker-participant"}`}>
      {/* Speaker Header Node */}
      <div className="speaker-header-node">
        <div className={`speaker-avatar-circle ${isYou ? "avatar-you" : "avatar-participant"}`}>
          <UserIcon size={14} />
        </div>

        <div className="speaker-info-row">
          <span className="speaker-name">{speaker}</span>
          <span className={`speaker-badge ${isYou ? "badge-you" : "badge-participant"}`}>
            {badgeText}
          </span>
        </div>

        {timeRange && <span className="speaker-timerange">{timeRange}</span>}
      </div>

      {/* Utterances Stream */}
      <div className="utterances-stream">
        {utterances.map((utt, index) => (
          <div key={index} className="utterance-row">
            {/* Timeline Dot */}
            <div className={`timeline-dot ${isYou ? "dot-you" : "dot-participant"}`} />

            {/* Timecode */}
            <span className={`utterance-timestamp ${isYou ? "ts-you" : "ts-participant"}`}>
              {utt.timestamp}
            </span>

            {/* Utterance Text */}
            <p className="utterance-text">{renderBilingualText(utt.text)}</p>
          </div>
        ))}
      </div>
    </div>
  );
};
