import React from 'react';
import { ChevronDown, ChevronRight, FilePlus, GripVertical } from 'lucide-react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Topic, Status } from '../../types';
import { StatusBadge } from '../ui/StatusBadge';
import { LongPressDeleteButton } from '../ui/LongPressDeleteButton';
import { ReferenceIdChip } from '../ui/ReferenceIdChip';

type SortableTopicRowProps = {
  teamId: string;
  topic: Topic;
  isExpanded: boolean;
  onToggle: () => void;
  topicStatus: Status;
  onAddSubTopic: () => void;
  onDeleteTopic: () => void;
  isEditingTitle: boolean;
  editTitleValue: string;
  onEditTitleChange: (v: string) => void;
  onStartEditTitle: () => void;
  onSaveEditTitle: () => void;
  onCancelEditTitle: () => void;
};

export function SortableTopicRow({
  topic,
  isExpanded,
  onToggle,
  topicStatus,
  onAddSubTopic,
  onDeleteTopic,
  isEditingTitle,
  editTitleValue,
  onEditTitleChange,
  onStartEditTitle,
  onSaveEditTitle,
  onCancelEditTitle,
}: SortableTopicRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: topic.id, data: { type: 'topic' as const } });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex flex-col ${isDragging ? 'opacity-60 z-20' : ''}`}
    >
      <div
        className={`group/topic px-6 py-4 flex items-start justify-between gap-3 hover:bg-[var(--color-overlay)] transition-colors cursor-pointer border-l-4 border-l-transparent ${isExpanded ? 'bg-[var(--color-overlay)] border-l-[var(--color-primary)]' : ''}`}
        onClick={onToggle}
      >
        <div className="flex flex-col gap-1.5 flex-1 min-w-0">
          <div className="flex items-center min-w-0">
            <button
              className="p-1 mr-2 text-[var(--color-text-subtle)] hover:text-[var(--color-text-muted)] rounded touch-none cursor-grab active:cursor-grabbing"
              onClick={(e) => e.stopPropagation()}
              {...attributes}
              {...listeners}
              aria-label="ลากเพื่อเรียงลำดับ"
            >
              <GripVertical className="w-5 h-5" />
            </button>
            <button className="p-1 mr-2 text-[var(--color-text-subtle)] hover:text-[var(--color-text-muted)] rounded">
              {isExpanded ? (
                <ChevronDown className="w-5 h-5" />
              ) : (
                <ChevronRight className="w-5 h-5" />
              )}
            </button>
            {isEditingTitle ? (
              <input
                type="text"
                value={editTitleValue}
                onChange={(e) => onEditTitleChange(e.target.value)}
                onBlur={() => onSaveEditTitle()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onSaveEditTitle();
                  if (e.key === 'Escape') onCancelEditTitle();
                }}
                onClick={(e) => e.stopPropagation()}
                className="text-base font-medium text-[var(--color-text)] bg-[var(--color-surface)] border border-[var(--color-border-strong)] rounded px-2 py-0.5 flex-1 min-w-0 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                autoFocus
              />
            ) : (
              <h3
                className="text-base font-medium text-[var(--color-text)] cursor-text flex-1 min-w-0 truncate"
                onClick={(e) => {
                  e.stopPropagation();
                  onStartEditTitle();
                }}
              >
                {topic.title}
              </h3>
            )}
          </div>
          <div className="pl-10 sm:pl-12" onClick={(e) => e.stopPropagation()}>
            <ReferenceIdChip kind="topic_id" value={topic.id} />
          </div>
        </div>
        <div className="flex items-center space-x-4 flex-shrink-0 pt-0.5">
          <div
            className="flex items-center space-x-2 opacity-100 md:opacity-0 md:group-hover/topic:opacity-100 transition-opacity"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => onAddSubTopic()}
              className="inline-flex items-center px-2.5 py-1.5 bg-[var(--color-primary-muted)] text-[var(--color-primary)] hover:bg-[var(--color-primary-muted-hover)] dark:text-[var(--color-primary)] text-xs font-medium rounded-md transition-colors"
            >
              <FilePlus className="w-3.5 h-3.5 mr-1" />
              เพิ่มหัวข้อย่อย
            </button>
            <LongPressDeleteButton
              onDelete={onDeleteTopic}
              title="ลบหัวข้อใหญ่"
            />
          </div>
          <StatusBadge status={topicStatus} variant="compact" />
        </div>
      </div>
    </div>
  );
}

