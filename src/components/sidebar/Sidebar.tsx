import React from "react";
import { MeetingRecord } from "../../types/meeting";
import { MeetingListItem } from "./MeetingListItem";
import { Plus } from "lucide-react";

interface SidebarProps {
  isOpen: boolean;
  isRecording: boolean;
  history: MeetingRecord[];
  selectedMeetingId: string | null;
  onStartRecording: () => void;
  onViewRecording: () => void;
  onSelectMeeting: (id: string) => void;
  onDeleteMeeting: (e: React.MouseEvent, id: string) => void;
  onSettingsClick: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  isOpen,
  isRecording,
  history,
  selectedMeetingId,
  onStartRecording,
  onViewRecording,
  onSelectMeeting,
  onDeleteMeeting,
  onSettingsClick,
}) => {
  return (
    <aside className={`sidebar ${isOpen ? "expanded" : "collapsed"}`}>
      <div className="sidebar-header">
        <div className="logo-row">
          <div className="logo-group">
            {/* <span className="logo-mark">V</span> */}
            <span className="logo-text">Vanilla</span>
          </div>
          <span className="version-pill">Local</span>
        </div>

        {isRecording ? (
          <button
            className="sidebar-action-btn recording-active"
            onClick={onViewRecording}
          >
            <div className="status-indicator-dot" />
            <span>Recording in progress</span>
          </button>
        ) : (
          <button
            className="sidebar-action-btn new-meeting"
            onClick={onStartRecording}
          >
            <Plus size={14} />
            <span>New meeting</span>
          </button>
        )}
      </div>

      {/* Section Header */}
      <div className="sidebar-section-header">
        <span className="sidebar-section-title">All Captures</span>
        {history.length > 0 && (
          <span className="sidebar-section-badge">{history.length}</span>
        )}
      </div>

      {/* History Meetings List */}
      <div className="meetings-list-container">
        {history.length === 0 ? (
          <div className="empty-list-hint">
            No captures recorded yet.<br />Click <strong>+ New meeting</strong> to start.
          </div>
        ) : (
          history.map((item) => (
            <MeetingListItem
              key={item.id}
              item={item}
              isSelected={selectedMeetingId === item.id}
              onSelect={onSelectMeeting}
              onDelete={onDeleteMeeting}
            />
          ))
        )}
      </div>

      {/* Footer */}
      <div className="sidebar-footer">
        <button className="settings-btn" onClick={onSettingsClick}>
          <span>⚙</span>
          <span>Settings</span>
        </button>
      </div>
    </aside>
  );
};
