import React from "react";
import { MeetingRecord } from "../../types/meeting";
import { formatDateMeta } from "../../utils/formatters";
import { Trash } from "lucide-react";

interface MeetingListItemProps {
  item: MeetingRecord;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onDelete: (e: React.MouseEvent, id: string) => void;
}

export const MeetingListItem: React.FC<MeetingListItemProps> = ({
  item,
  isSelected,
  onSelect,
  onDelete,
}) => {
  return (
    <div
      className={`meeting-list-item ${isSelected ? "selected" : ""}`}
      onClick={() => onSelect(item.id)}
    >
      <div className="item-content">
        <span className="item-title">{item.title}</span>
        <span className="item-meta">
          {formatDateMeta(item.created_at)} · {item.duration}
        </span>
      </div>

      <div className="item-actions">
        <button
          className="item-delete-btn"
          title="Delete meeting"
          onClick={(e) => onDelete(e, item.id)}
        >
          <Trash size={16} strokeWidth={1.8} />
        </button>
      </div>
    </div>
  );
};
