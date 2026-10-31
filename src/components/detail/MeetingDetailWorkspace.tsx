import React from "react";
import { MeetingDetail } from "../../types/meeting";
import { formatDateMeta } from "../../utils/formatters";
import { SpeechSegment } from "./SpeechSegment";

interface MeetingDetailWorkspaceProps {
  detail: MeetingDetail;
  onTitleChange: (newTitle: string) => void;
  onRename: (newTitle: string) => void;
  onCopyTranscript: () => void;
  onExportMarkdown: () => void;
  onDelete: (e: React.MouseEvent, id: string) => void;
}

export const MeetingDetailWorkspace: React.FC<MeetingDetailWorkspaceProps> = ({
  detail,
  onTitleChange,
  onRename,
  onCopyTranscript,
  onExportMarkdown,
  onDelete,
}) => {
  const { record, transcript } = detail;

  return (
    <div className="meeting-detail-workspace">
      {/* Header Section */}
      <div className="detail-header-section">
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
        />

        <div className="detail-meta-row">
          <span className="meta-item">{formatDateMeta(record.created_at)}</span>
          <span className="meta-item">🕒 {record.duration}</span>
          <span className="meta-item">🌐 {record.language_detected}</span>
        </div>

        {/* Actions Bar */}
        <div className="detail-actions-bar">
          <button className="detail-btn" onClick={onCopyTranscript}>
            <span>📋</span>
            <span>Copy transcript</span>
          </button>

          <button className="detail-btn" onClick={onExportMarkdown}>
            <span>📥</span>
            <span>Export Markdown</span>
          </button>

          <button
            className="detail-btn"
            onClick={(e) => onDelete(e, record.id)}
          >
            <span>🗑</span>
            <span>Delete</span>
          </button>
        </div>
      </div>

      {/* Conversation Feed */}
      <div className="conversation-feed">
        {!transcript || transcript.length === 0 ? (
          <div className="empty-transcript-hint">
            No speech detected in this recording.
          </div>
        ) : (
          transcript.map((segment, idx) => (
            <SpeechSegment key={idx} segment={segment} />
          ))
        )}
      </div>
    </div>
  );
};
