import React, { useEffect, useRef, useState } from 'react';
import { GripVertical, ChevronDown, ChevronRight, Plus, Check, Circle } from 'lucide-react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Status, SubTopic } from '../../types';
import { LongPressDeleteButton } from '../ui/LongPressDeleteButton';

type SortableSubTopicCardProps = {
  teamId: string;
  topicId: string;
  subTopic: SubTopic;
  onUpdateStatus: (s: Status) => void;
  onDelete: () => void;
  isEditingTitle: boolean;
  editTitleValue: string;
  onEditTitleChange: (v: string) => void;
  onStartEditTitle: () => void;
  onSaveEditTitle: (finalTitle?: string) => void;
  onCancelEditTitle: () => void;
  onAddDetail: () => void;
  onUpdateDetail: (index: number, value: string) => void;
  onUpdateDetailDueDate: (index: number, dueDate: string | undefined) => void;
  onRemoveDetail: (index: number) => void;
  onToggleDetailDone: (index: number) => void;
  isTodoSectionOpen: boolean;
  onTodoSectionToggle: () => void;
};

export function SortableSubTopicCard({
  topicId,
  subTopic,
  onUpdateStatus,
  onDelete,
  isEditingTitle,
  editTitleValue,
  onEditTitleChange,
  onStartEditTitle,
  onSaveEditTitle,
  onCancelEditTitle,
  onAddDetail,
  onUpdateDetail,
  onUpdateDetailDueDate,
  onRemoveDetail,
  onToggleDetailDone,
  isTodoSectionOpen,
  onTodoSectionToggle,
}: SortableSubTopicCardProps) {
  const id = `sub__${topicId}__${subTopic.id}`;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({
      id,
      data: { type: 'subtopic' as const, topicId, subTopic },
    });
  const style = { transform: CSS.Transform.toString(transform), transition };
  const details = subTopic.details ?? [];
  const [draftDetailText, setDraftDetailText] = useState<Record<number, string>>({});
  const [localTitle, setLocalTitle] = useState(editTitleValue);
  const prevIsEditingTitle = useRef(false);

  useEffect(() => {
    if (isEditingTitle && !prevIsEditingTitle.current) {
      setLocalTitle(editTitleValue);
    }
    prevIsEditingTitle.current = isEditingTitle;
  }, [isEditingTitle, editTitleValue]);

  const handleSaveEditTitle = () => {
    onEditTitleChange(localTitle);
    onSaveEditTitle(localTitle);
  };

  const getDetailDisplayValue = (index: number, item: { text: string }) =>
    draftDetailText[index] !== undefined ? draftDetailText[index] : item.text;

  const flushDetailDraft = (index: number) => {
    const value =
      draftDetailText[index] !== undefined
        ? draftDetailText[index]
        : details[index]?.text ?? '';
    onUpdateDetail(index, value);
    setDraftDetailText((prev) => {
      const next = { ...prev };
      delete next[index];
      return next;
    });
  };

  const getDaysLeft = (dueDate?: string) => {
    if (!dueDate) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(dueDate + 'T00:00:00');
    const diffMs = due.getTime() - today.getTime();
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return null;
    if (diffDays === 0) return 'วันนี้';
    return `อีก ${diffDays} วัน`;
  };

  const isOverdueAndNotDone = (dueDate?: string, done?: boolean) => {
    if (!dueDate || done) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(dueDate + 'T00:00:00');
    return due.getTime() < today.getTime();
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex flex-col bg-[var(--color-surface)] rounded-lg border border-[var(--color-border)] shadow-[var(--shadow-card)] overflow-hidden ${isDragging ? 'opacity-80 shadow-lg z-10' : ''}`}
    >
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <button
            className="p-1 text-[var(--color-text-subtle)] hover:text-[var(--color-text-muted)] rounded touch-none cursor-grab active:cursor-grabbing flex-shrink-0"
            {...attributes}
            {...listeners}
            aria-label="ลากเพื่อเรียงหรือย้าย"
          >
            <GripVertical className="w-4 h-4" />
          </button>
          {isEditingTitle ? (
            <input
              type="text"
              value={localTitle}
              onChange={(e) => setLocalTitle(e.target.value)}
              onBlur={() => handleSaveEditTitle()}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveEditTitle();
                if (e.key === 'Escape') onCancelEditTitle();
              }}
              className="text-sm font-medium text-[var(--color-text)] bg-[var(--color-page)] border border-[var(--color-border-strong)] rounded px-2 py-1 flex-1 min-w-0 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              autoFocus
            />
          ) : (
            <button
              type="button"
              onClick={() => onStartEditTitle()}
              className="flex-1 min-w-0 text-sm font-medium text-[var(--color-text)] truncate text-left hover:bg-[var(--color-overlay)] rounded px-1 -mx-1 py-0.5"
            >
              {subTopic.title}
            </button>
          )}
        </div>
        <div className="flex items-center space-x-3 flex-shrink-0">
          <div className="flex bg-[var(--color-overlay)] p-1 rounded-lg">
            {(['GREEN', 'YELLOW', 'RED'] as Status[]).map((s) => (
              <button
                key={s}
                onClick={() => onUpdateStatus(s)}
                className={`w-[7.5rem] min-w-[7.5rem] px-3 py-1 text-xs font-medium rounded-md transition-all ${
                  subTopic.status === s
                    ? s === 'GREEN'
                      ? 'bg-emerald-500 text-white shadow-sm'
                      : s === 'YELLOW'
                        ? 'bg-amber-500 text-white shadow-sm'
                        : 'bg-rose-500 text-white shadow-sm'
                    : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-border-strong)]'
                }`}
              >
                {s === 'GREEN'
                  ? 'ปกติ'
                  : s === 'YELLOW'
                    ? 'จัดการได้'
                    : 'ต้องการ Support'}
              </button>
            ))}
          </div>
          <LongPressDeleteButton
            onDelete={onDelete}
            title="ลบหัวข้อย่อย"
          />
        </div>
      </div>
      <div className="border-t border-[var(--color-border)] bg-[var(--color-page)]/50">
        <button
          type="button"
          onClick={onTodoSectionToggle}
          className="w-full px-4 py-3 flex items-center justify-start gap-2 text-left hover:bg-[var(--color-overlay)] transition-colors"
        >
          {isTodoSectionOpen ? (
            <ChevronDown className="w-4 h-4 text-[var(--color-text-subtle)] flex-shrink-0" />
          ) : (
            <ChevronRight className="w-4 h-4 text-[var(--color-text-subtle)] flex-shrink-0" />
          )}
          <span className="text-xs font-medium text-[var(--color-text-muted)]">
            Todo / Task
            {details.length > 0 && (
              <span className="ml-1.5 text-[var(--color-text-subtle)]">
                — {details.length} รายการ
              </span>
            )}
          </span>
        </button>
        {isTodoSectionOpen && (
          <div className="px-4 pb-3 pt-0">
            <div className="space-y-1.5">
              {details.map((item, index) => (
                <div key={index} className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onToggleDetailDone(index)}
                    className="flex-shrink-0 p-0.5 rounded text-[var(--color-text-subtle)] hover:text-[var(--color-primary)]"
                    title={item.done ? 'ยกเลิกทำแล้ว' : 'ทำแล้ว'}
                  >
                    {item.done ? (
                      <Check className="w-4 h-4 text-emerald-500" />
                    ) : (
                      <Circle className="w-4 h-4" />
                    )}
                  </button>
                  <span className="text-xs font-medium text-[var(--color-text-subtle)] w-5 flex-shrink-0 text-right">
                    {index + 1}.
                  </span>
                  <div className="flex-1 min-w-0 flex items-center gap-2">
                    <input
                      type="text"
                      value={getDetailDisplayValue(index, item)}
                      onChange={(e) =>
                        setDraftDetailText((prev) => ({
                          ...prev,
                          [index]: e.target.value,
                        }))
                      }
                      onBlur={() => flushDetailDraft(index)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          flushDetailDraft(index);
                          (e.target as HTMLInputElement).blur();
                        }
                      }}
                      placeholder={`Task ${index + 1}`}
                      className={`flex-1 min-w-0 text-sm bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] ${
                        item.done ? 'line-through text-[var(--color-text-subtle)]' : 'text-[var(--color-text)]'
                      }`}
                    />
                    <div className="flex items-center gap-1.5 shrink-0 text-[10px] leading-tight w-[180px] justify-start">
                      <input
                        type="date"
                        value={item.dueDate ?? ''}
                        onChange={(e) =>
                          onUpdateDetailDueDate(index, e.target.value || undefined)
                        }
                        title="Due date"
                        className={`shrink-0 text-[11px] bg-[var(--color-surface)] border rounded px-1.5 py-1 text-[var(--color-text)] focus:outline-none focus:ring-2 ${
                          isOverdueAndNotDone(item.dueDate, item.done)
                            ? 'border-red-500 text-red-500 focus:ring-red-500'
                            : 'border-[var(--color-border)] focus:ring-[var(--color-primary)]'
                        }`}
                      />
                      {getDaysLeft(item.dueDate) && (
                        <span className="text-[var(--color-text-subtle)] whitespace-nowrap">
                          {getDaysLeft(item.dueDate)}
                        </span>
                      )}
                    </div>
                  </div>
                  <LongPressDeleteButton
                    onDelete={() => onRemoveDetail(index)}
                    title="ลบรายการ"
                    className="p-1"
                    iconClassName="w-3.5 h-3.5"
                  />
                </div>
              ))}
              <button
                type="button"
                onClick={onAddDetail}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--color-primary)] hover:text-[var(--color-primary-hover)] mt-1"
              >
                <Plus className="w-3.5 h-3.5" />
                เพิ่ม Task / รายการ
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

