import React, { useMemo } from "react";
import { MeetingDetail } from "../../types/meeting";
import { formatDateMeta } from "../../utils/formatters";
import {
  CalendarIcon,
  ClockIcon,
  GlobeIcon,
  CopyIcon,
  FileTextIcon,
  TrashIcon,
  ArrowLeftIcon,
} from "../common/Icons";
import { SpeakerTimelineGroup, SpeakerGroupData } from "./SpeakerTimelineGroup";

interface MeetingDetailWorkspaceProps {
  detail: MeetingDetail;
  onTitleChange: (newTitle: string) => void;
  onRename: (newTitle: string) => void;
  onCopyTranscript: () => void;
  onExportMarkdown: () => void;
  onDelete: (e: React.MouseEvent, id: string) => void;
  onBack?: () => void;
}

export const MeetingDetailWorkspace: React.FC<MeetingDetailWorkspaceProps> = ({
  detail,
  onTitleChange,
  onRename,
  onCopyTranscript,
  onExportMarkdown,
  onDelete,
  onBack,
}) => {
  const { record, transcript } = detail;

  // Group consecutive utterances by speaker
  const speakerGroups = useMemo<SpeakerGroupData[]>(() => {
    if (!transcript || transcript.length === 0) return [];

    const groups: SpeakerGroupData[] = [];

    for (const seg of transcript) {
      const rawSpeaker = seg.speaker?.trim() || "Speaker";
      const isYou =
        rawSpeaker.toLowerCase() === "you" ||
        rawSpeaker.toLowerCase().includes("mic");

      const timestamp = seg.timestamp || "00:00";
      const text = seg.text || "";

      const lastGroup = groups[groups.length - 1];
      const isSameSpeaker =
        lastGroup &&
        lastGroup.speaker.toLowerCase() === rawSpeaker.toLowerCase();

      if (isSameSpeaker) {
        lastGroup.utterances.push({ timestamp, text });
        const firstTs = lastGroup.utterances[0].timestamp;
        const lastTs = timestamp;
        lastGroup.timeRange =
          firstTs === lastTs ? firstTs : `${firstTs} – ${lastTs}`;
      } else {
        groups.push({
          speaker: rawSpeaker,
          isYou,
          timeRange: timestamp,
          utterances: [{ timestamp, text }],
        });
      }
    }

    return groups;
  }, [transcript]);

  return (
    <div className="detail-workspace-page">
      {/* Optional Top Back Action inside canvas */}
      {onBack && (
        <div className="detail-canvas-back-bar">
          <button
            className="detail-back-button"
            onClick={onBack}
            title="Navigate to main page"
          >
            <ArrowLeftIcon size={14} />
            <span>Back to Recordings</span>
          </button>
        </div>
      )}

      {/* Main Container */}
      <div className="detail-main-container">
        {/* Meeting Header & Metadata Section */}
        <section className="detail-header-section">
          {/* Title (editable on click / focus) */}
          <input
            className="detail-title-input"
            value={record.title}
            onChange={(e) => onTitleChange(e.target.value)}
            onBlur={(e) => onRename(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                (e.target as HTMLInputElement).blur();
              }
            }}
            title="Click to rename meeting"
            placeholder="Meeting Title"
          />

          {/* Metadata directly underneath title */}
          <div className="detail-metadata-row">
            <div className="meta-item">
              <CalendarIcon size={13} className="meta-icon" />
              <span>{formatDateMeta(record.created_at)}</span>
            </div>
            <span className="meta-bullet">•</span>
            <div className="meta-item">
              <ClockIcon size={13} className="meta-icon" />
              <span>{record.duration || "0m 00s"}</span>
            </div>
            <span className="meta-bullet">•</span>
            <div className="meta-item">
              <GlobeIcon size={13} className="meta-icon" />
              <span>{record.language_detected || "English"}</span>
            </div>
          </div>

          {/* Action buttons right below metadata */}
          <div className="detail-actions-row">
            <button
              className="detail-action-btn"
              onClick={onCopyTranscript}
              title="Copy transcript to clipboard"
            >
              <CopyIcon size={13} className="action-icon" />
              <span>Copy transcript</span>
            </button>

            <button
              className="detail-action-btn"
              onClick={onExportMarkdown}
              title="Export as Markdown file"
            >
              <FileTextIcon size={13} className="action-icon" />
              <span>Export Markdown</span>
            </button>

            <button
              className="detail-action-btn btn-delete"
              onClick={(e) => onDelete(e, record.id)}
              title="Delete meeting"
            >
              <TrashIcon size={13} className="action-icon text-rose-400" />
              <span>Delete</span>
            </button>
          </div>
        </section>

        {/* Continuous Vertical Timeline Stream */}
        <section className="timeline-stream-section" data-purpose="transcript-feed">
          {/* Subtle continuous vertical spine line */}
          <div className="timeline-vertical-spine" />

          {speakerGroups.length === 0 ? (
            <div className="empty-timeline-hint">
              <p>No speech detected in this recording.</p>
            </div>
          ) : (
            speakerGroups.map((group, idx) => (
              <SpeakerTimelineGroup key={idx} group={group} />
            ))
          )}
        </section>
      </div>
    </div>
  );
};
