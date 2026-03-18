import React, { useEffect, useRef, useState } from 'react';
import { GripVertical, ChevronDown, ChevronRight, Plus, Check, Circle, ListTodo, BarChart3, FileText } from 'lucide-react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Status, SubTopic, SubTopicType, TodoItemStatus } from '../../types';
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
  subTopicType: SubTopicType;
  onSubTopicTypeChange: (type: SubTopicType) => void;
  onAddDetail: () => void;
  onUpdateDetail: (index: number, value: string) => void;
  onUpdateDetailDueDate: (index: number, dueDate: string | undefined) => void;
  onUpdateDetailDescription: (index: number, description: string | undefined) => void;
  onUpdateDetailStatus: (index: number, status: TodoItemStatus) => void;
  onRemoveDetail: (index: number) => void;
  onToggleDetailDone: (index: number) => void;
  isTodoSectionOpen: boolean;
  onTodoSectionToggle: () => void;
};

const TYPE_OPTIONS: { value: SubTopicType; label: string; icon: typeof ListTodo }[] = [
  { value: 'todos', label: 'Todos', icon: ListTodo },
  { value: 'status', label: 'Tracking Status', icon: BarChart3 },
];

const MIN_DESC_HEIGHT = 36;
const MAX_DESC_HEIGHT = 200;

/** Textarea ที่ขยายความสูงตามจำนวนบรรทัดอัตโนมัติ */
function AutoResizeDescriptionTextarea({
  value,
  onChange,
  onBlur,
  onKeyDown,
  placeholder,
  title,
  className,
}: {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onBlur: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  placeholder: string;
  title: string;
  className: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    const sh = el.scrollHeight;
    if (sh <= MAX_DESC_HEIGHT) {
      el.style.height = `${Math.max(MIN_DESC_HEIGHT, sh)}px`;
      el.style.overflowY = 'hidden';
    } else {
      el.style.height = `${MAX_DESC_HEIGHT}px`;
      el.style.overflowY = 'auto';
    }
  }, [value]);
  return (
    <textarea
      ref={ref}
      value={value}
      onChange={onChange}
      onBlur={onBlur}
      onKeyDown={onKeyDown}
      placeholder={placeholder}
      title={title}
      rows={1}
      className={className}
    />
  );
}

/** สีตามสถานะรายการ — สไตล์ Notion, รองรับ dark mode ให้ contrast ชัด */
function getStatusStyles(status: TodoItemStatus): { row: string; select: string } {
  switch (status) {
    case 'doing':
      return {
        row:
          'border-l-2 border-l-blue-400 dark:border-l-blue-400 bg-blue-50/40 dark:bg-blue-950/40 rounded-r-md ' +
          'dark:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03)]',
        select:
          'bg-blue-50 dark:bg-blue-950/70 border-blue-200 dark:border-blue-700 text-blue-800 dark:text-blue-200 ' +
          'focus:outline-none focus:ring-2 focus:ring-blue-400/50 dark:focus:ring-blue-400/40 focus:ring-offset-1 dark:focus:ring-offset-2',
      };
    case 'done':
      return {
        row:
          'border-l-2 border-l-emerald-400 dark:border-l-emerald-400 bg-emerald-50/40 dark:bg-emerald-950/40 rounded-r-md ' +
          'dark:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03)]',
        select:
          'bg-emerald-50 dark:bg-emerald-950/70 border-emerald-200 dark:border-emerald-700 text-emerald-800 dark:text-emerald-200 ' +
          'focus:outline-none focus:ring-2 focus:ring-emerald-400/50 dark:focus:ring-emerald-400/40 focus:ring-offset-1 dark:focus:ring-offset-2',
      };
    default:
      return {
        row:
          'border-l-2 border-l-slate-200 dark:border-l-slate-500 bg-slate-50/30 dark:bg-slate-800/30 rounded-r-md ' +
          'dark:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]',
        select:
          'bg-slate-50 dark:bg-slate-900/90 dark:border-slate-600 border-slate-200 text-slate-600 dark:text-slate-300 ' +
          'focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/40 dark:focus:ring-[var(--color-primary)]/30 focus:ring-offset-1 dark:focus:ring-offset-2',
      };
  }
}

function detailItemId(topicId: string, subTopicId: string, index: number) {
  return `detail__${topicId}__${subTopicId}__${index}`;
}

function detailListId(teamId: string, topicId: string, subTopicId: string) {
  return `detail-list-${teamId}-${topicId}-${subTopicId}`;
}

function SortableDetailRow({
  id,
  children,
  className,
  disabled,
}: {
  id: string;
  children: (args: { dragHandle: React.ReactNode; isDragging: boolean }) => React.ReactNode;
  className?: string;
  disabled?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({
      id,
      disabled,
      data: { type: 'detail' as const, detailId: id },
    });
  const style = { transform: CSS.Transform.toString(transform), transition };
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`${className ?? ''} ${isDragging ? 'opacity-80 shadow-lg z-20 relative' : ''}`}
    >
      {children({
        isDragging,
        dragHandle: (
          <button
            type="button"
            className="flex-shrink-0 p-1 -ml-1 rounded text-[var(--color-text-subtle)] hover:text-[var(--color-text-muted)] touch-none cursor-grab active:cursor-grabbing mt-0.5"
            title="ลากเพื่อเรียงลำดับรายการ"
            aria-label="ลากเพื่อเรียงลำดับรายการ"
            {...attributes}
            {...listeners}
            onClick={(e) => e.stopPropagation()}
          >
            <GripVertical className="w-4 h-4" />
          </button>
        ),
      })}
    </div>
  );
}

export function SortableSubTopicCard({
  teamId,
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
  subTopicType,
  onSubTopicTypeChange,
  onAddDetail,
  onUpdateDetail,
  onUpdateDetailDueDate,
  onUpdateDetailDescription,
  onUpdateDetailStatus,
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
  const type = subTopicType ?? 'todos';
  const [draftDetailText, setDraftDetailText] = useState<Record<number, string>>({});
  const [draftDetailDescription, setDraftDetailDescription] = useState<Record<number, string>>({});
  /** index ของ detail ที่เปิด Note/memo อยู่ (Notion-style: กดปุ่มถึงแสดง) */
  const [openNoteIndex, setOpenNoteIndex] = useState<number | null>(null);
  const [localTitle, setLocalTitle] = useState(editTitleValue);
  const prevIsEditingTitle = useRef(false);
  const isDone = (item: { status?: TodoItemStatus; done?: boolean }) =>
    item.status === 'done' || (item.status == null && item.done);

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

  const getDetailDescriptionDisplayValue = (index: number) =>
    draftDetailDescription[index] !== undefined
      ? draftDetailDescription[index]
      : details[index]?.description ?? '';

  const flushDetailDescriptionDraft = (index: number) => {
    const value = getDetailDescriptionDisplayValue(index).trim();
    onUpdateDetailDescription(index, value || undefined);
    setDraftDetailDescription((prev) => {
      const next = { ...prev };
      delete next[index];
      return next;
    });
    if (!value) setOpenNoteIndex(null);
  };

  const getDaysLeft = (dueDate?: string): string | null => {
    if (!dueDate) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(dueDate + 'T00:00:00');
    const diffMs = due.getTime() - today.getTime();
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return `${Math.abs(diffDays)} วัน`;
    if (diffDays === 0) return 'วันนี้';
    return `อีก ${diffDays} วัน`;
  };

  const isOverdue = (dueDate?: string): boolean => {
    if (!dueDate) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(dueDate + 'T00:00:00');
    return due.getTime() < today.getTime();
  };

  const isOverdueAndNotDone = (dueDate?: string, done?: boolean) => {
    if (!dueDate || done) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(dueDate + 'T00:00:00');
    return due.getTime() < today.getTime();
  };

  const detailIds = details.map((_, index) => detailItemId(topicId, subTopic.id, index));
  const { setNodeRef: setDetailListRef, isOver: isOverDetailList } = useDroppable({
    id: detailListId(teamId, topicId, subTopic.id),
    data: { type: 'detail-list' as const, topicId, subTopicId: subTopic.id },
  });

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group/subtopic flex flex-col bg-[var(--color-surface)] rounded-lg border border-[var(--color-border)] shadow-[var(--shadow-card)] overflow-hidden ${isDragging ? 'opacity-80 shadow-lg z-10' : ''}`}
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
          <div className="opacity-0 group-hover/subtopic:opacity-100 transition-opacity pointer-events-none group-hover/subtopic:pointer-events-auto">
            <LongPressDeleteButton
              onDelete={onDelete}
              title="ลบหัวข้อย่อย"
            />
          </div>
        </div>
      </div>
      <div className="border-t border-[var(--color-border)] bg-[var(--color-page)]/50">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onTodoSectionToggle}
            className="flex-1 min-w-0 px-4 py-3 flex items-center justify-start gap-2 text-left hover:bg-[var(--color-overlay)] transition-colors"
          >
            {isTodoSectionOpen ? (
              <ChevronDown className="w-4 h-4 text-[var(--color-text-subtle)] flex-shrink-0" />
            ) : (
              <ChevronRight className="w-4 h-4 text-[var(--color-text-subtle)] flex-shrink-0" />
            )}
            <span className="text-xs font-medium text-[var(--color-text-muted)] truncate">
              {type === 'todos' ? 'Todo / Task' : 'Tracking Status'}
              {type === 'todos' && details.length > 0 && (
                <span className="ml-1.5 text-[var(--color-text-subtle)]">
                  — {details.length} รายการ
                </span>
              )}
            </span>
          </button>
          <div className="flex rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-0.5 mr-3 shrink-0" role="group" aria-label="ประเภทหัวข้อย่อย">
            {TYPE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onSubTopicTypeChange(opt.value);
                }}
                className={`inline-flex items-center gap-1 px-2 py-1.5 text-[10px] font-medium rounded-md transition-colors ${
                  type === opt.value
                    ? 'bg-[var(--color-primary)] text-white shadow-sm'
                    : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-overlay)]'
                }`}
                title={opt.value === 'todos' ? 'รายการ Todo (text, status, dueDate)' : 'ติดตามแค่สถานะ RED/YELLOW/GREEN'}
              >
                <opt.icon className="w-3.5 h-3.5" />
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        {isTodoSectionOpen && (
          <div className="px-4 pb-3 pt-0">
            {type === 'todos' ? (
              <div
                ref={setDetailListRef}
                className={`space-y-1.5 rounded-lg transition-colors ${isOverDetailList ? 'ring-2 ring-[var(--color-primary)]/40 bg-[var(--color-primary-muted)]/20' : ''}`}
              >
                <SortableContext items={detailIds} strategy={verticalListSortingStrategy}>
                  {details.map((item, index) => {
                    const itemStatus = (item.status ?? (item.done ? 'done' : 'todo')) as TodoItemStatus;
                    const statusStyle = getStatusStyles(itemStatus);
                    const rowId = detailItemId(topicId, subTopic.id, index);
                    return (
                      <SortableDetailRow
                        key={rowId}
                        id={rowId}
                        className={`group flex items-start gap-2 pl-2.5 py-1.5 text-slate-800 dark:text-[var(--color-text)] ${statusStyle.row}`}
                      >
                        {({ dragHandle }) => (
                          <>
                            {dragHandle}
                            <button
                              type="button"
                              onClick={() => onToggleDetailDone(index)}
                              className="flex-shrink-0 p-0.5 rounded text-emerald-600 dark:text-slate-300 hover:text-[var(--color-primary)] dark:hover:text-emerald-300 mt-0.5"
                              title={isDone(item) ? 'ยกเลิกทำแล้ว' : 'ทำแล้ว'}
                            >
                              {isDone(item) ? (
                                <Check className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />
                              ) : (
                                <Circle className="w-4 h-4" />
                              )}
                            </button>
                            <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                              {/* บรรทัดเดียว: หัวข้อ + ชื่อ task + วันที่ */}
                              <div className="flex items-center gap-2 min-h-[30px]">
                                <span
                                  className={`text-xs font-medium w-5 flex-shrink-0 text-right tabular-nums ${
                                    itemStatus === 'done'
                                      ? 'text-emerald-500 dark:!text-emerald-100'
                                      : itemStatus === 'doing'
                                        ? 'text-blue-400 dark:!text-blue-100'
                                        : 'text-slate-800 dark:!text-slate-100'
                                  }`}
                                >
                                  {index + 1}.
                                </span>
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
                                    isDone(item)
                                      ? 'line-through !text-slate-500 dark:!text-emerald-100'
                                      : itemStatus === 'doing'
                                        ? '!text-slate-800 dark:!text-blue-100'
                                        : '!text-slate-800 dark:!text-slate-100'
                                  }`}
                                />
                                <div className="flex items-center gap-1.5 shrink-0 text-[10px] leading-tight w-[140px] justify-start">
                                  <input
                                    type="date"
                                    value={item.dueDate ?? ''}
                                    onChange={(e) =>
                                      onUpdateDetailDueDate(index, e.target.value || undefined)
                                    }
                                    title="Due date"
                                    className={`shrink-0 text-[11px] bg-[var(--color-surface)] border rounded px-1.5 py-1 !text-slate-800 dark:!text-[var(--color-text)] focus:outline-none focus:ring-2 ${
                                      isOverdueAndNotDone(item.dueDate, isDone(item))
                                        ? 'border-red-500 !text-red-500 dark:!text-red-400 focus:ring-red-500 dark:focus:ring-red-400'
                                        : 'border-[var(--color-border)] focus:ring-[var(--color-primary)]'
                                    }`}
                                  />
                                  {getDaysLeft(item.dueDate) && (
                                    <span
                                      className={`whitespace-nowrap ${
                                        isOverdue(item.dueDate)
                                          ? 'text-red-600 dark:text-red-400'
                                          : 'text-slate-800 dark:text-[var(--color-text)]'
                                      }`}
                                    >
                                      {getDaysLeft(item.dueDate)}
                                    </span>
                                  )}
                                </div>
                              </div>
                              {/* Note — textarea auto height ตามบรรทัด */}
                              {(item.description != null && item.description !== '') ||
                              openNoteIndex === index ? (
                                <AutoResizeDescriptionTextarea
                                  value={getDetailDescriptionDisplayValue(index)}
                                  onChange={(e) =>
                                    setDraftDetailDescription((prev) => ({
                                      ...prev,
                                      [index]: e.target.value,
                                    }))
                                  }
                                  onBlur={() => flushDetailDescriptionDraft(index)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Escape')
                                      (e.target as HTMLTextAreaElement).blur();
                                  }}
                                  placeholder="Memo / Note..."
                                  title="Note"
                                  className="w-full min-w-0 text-[11px] leading-tight bg-[var(--color-surface)]/60 border border-[var(--color-border)] rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] text-slate-600 dark:!text-slate-300 overflow-x-hidden ml-7 placeholder:text-slate-500 dark:placeholder:text-slate-400"
                                />
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setOpenNoteIndex(index)}
                                  className="inline-flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-[var(--color-text-subtle)] hover:text-[var(--color-primary)] rounded px-2 py-1 hover:bg-[var(--color-overlay)] ml-7"
                                  title="เพิ่ม memo / note"
                                >
                                  <FileText className="w-3.5 h-3.5" />
                                  เพิ่ม Note
                                </button>
                              )}
                            </div>
                            <div className="opacity-0 group-hover:opacity-100 hover:opacity-100 focus-within:opacity-100 transition-opacity shrink-0 pointer-events-none group-hover:pointer-events-auto hover:pointer-events-auto focus-within:pointer-events-auto text-amber-600 dark:text-amber-400 mt-0.5">
                              <LongPressDeleteButton
                                onDelete={() => onRemoveDetail(index)}
                                title="ลบรายการ"
                                className="p-1"
                                iconClassName="w-3.5 h-3.5"
                              />
                            </div>
                          </>
                        )}
                      </SortableDetailRow>
                    );
                  })}
                </SortableContext>
                <button
                  type="button"
                  onClick={onAddDetail}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--color-primary)] hover:text-[var(--color-primary-hover)] mt-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  เพิ่ม Task / รายการ
                </button>
              </div>
            ) : (
              <div
                ref={setDetailListRef}
                className={`space-y-1.5 rounded-lg transition-colors ${isOverDetailList ? 'ring-2 ring-[var(--color-primary)]/40 bg-[var(--color-primary-muted)]/20' : ''}`}
              >
                {details.length > 0 && (
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-medium text-slate-600 dark:!text-slate-200 uppercase tracking-wide">
                      รายการติดตาม ({details.length})
                    </span>
                    <SortableContext items={detailIds} strategy={verticalListSortingStrategy}>
                      {details.map((item, index) => {
                        const itemStatus = (item.status ?? (item.done ? 'done' : 'todo')) as TodoItemStatus;
                        const statusStyle = getStatusStyles(itemStatus);
                        const rowId = detailItemId(topicId, subTopic.id, index);
                        return (
                          <SortableDetailRow
                            key={rowId}
                            id={rowId}
                            className={`group flex items-start gap-2 pl-2.5 py-1.5 text-slate-800 dark:text-[var(--color-text)] ${statusStyle.row}`}
                          >
                            {({ dragHandle }) => (
                              <>
                                {dragHandle}
                                <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                                  {/* บรรทัดเดียว: หัวข้อ + ชื่อรายการ + สถานะ + วันที่ */}
                                  <div className="flex items-center gap-2 min-h-[30px]">
                                    <span
                                      className={`text-xs font-medium w-5 flex-shrink-0 text-right tabular-nums ${
                                        itemStatus === 'done'
                                          ? 'text-emerald-500 dark:!text-emerald-100'
                                          : itemStatus === 'doing'
                                            ? 'text-blue-400 dark:!text-blue-100'
                                            : 'text-slate-800 dark:!text-slate-100'
                                      }`}
                                    >
                                      {index + 1}.
                                    </span>
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
                                      placeholder={`รายการ ${index + 1}`}
                                      className={`flex-1 min-w-0 text-sm bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] !text-slate-800 ${
                                        itemStatus === 'done'
                                          ? 'dark:!text-emerald-100'
                                          : itemStatus === 'doing'
                                            ? 'dark:!text-blue-100'
                                            : 'dark:!text-slate-100'
                                      }`}
                                    />
                                    <select
                                      value={itemStatus}
                                      onChange={(e) =>
                                        onUpdateDetailStatus(index, e.target.value as TodoItemStatus)
                                      }
                                      className={`shrink-0 text-[11px] border rounded px-2 py-1 font-medium focus:outline-none focus:ring-2 focus:ring-offset-1 min-w-[5rem] ${statusStyle.select}`}
                                      title="สถานะรายการ (ใช้ค่าเดียวกับ Todo)"
                                    >
                                      <option value="todo">รอทำ</option>
                                      <option value="doing">กำลังทำ</option>
                                      <option value="done">เสร็จ</option>
                                    </select>
                                    <div className="flex items-center gap-1.5 shrink-0 text-[10px] leading-tight w-[140px] justify-start">
                                      <input
                                        type="date"
                                        value={item.dueDate ?? ''}
                                        onChange={(e) =>
                                          onUpdateDetailDueDate(index, e.target.value || undefined)
                                        }
                                        title="Due date"
                                        className={`shrink-0 text-[11px] bg-[var(--color-surface)] border rounded px-1.5 py-1 !text-slate-800 dark:!text-[var(--color-text)] focus:outline-none focus:ring-2 ${
                                          isOverdue(item.dueDate)
                                            ? 'border-red-500 !text-red-500 focus:ring-red-500 dark:!text-red-400'
                                            : 'border-[var(--color-border)] focus:ring-[var(--color-primary)]'
                                        }`}
                                      />
                                      {getDaysLeft(item.dueDate) && (
                                        <span
                                          className={`whitespace-nowrap ${
                                            isOverdue(item.dueDate)
                                              ? 'text-red-600 dark:text-red-400'
                                              : 'text-slate-800 dark:text-[var(--color-text)]'
                                          }`}
                                        >
                                          {getDaysLeft(item.dueDate)}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  {/* Note — textarea auto height ตามบรรทัด */}
                                  {(item.description != null && item.description !== '') ||
                                  openNoteIndex === index ? (
                                    <AutoResizeDescriptionTextarea
                                      value={getDetailDescriptionDisplayValue(index)}
                                      onChange={(e) =>
                                        setDraftDetailDescription((prev) => ({
                                          ...prev,
                                          [index]: e.target.value,
                                        }))
                                      }
                                      onBlur={() => flushDetailDescriptionDraft(index)}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Escape')
                                          (e.target as HTMLTextAreaElement).blur();
                                      }}
                                      placeholder="Memo / Note..."
                                      title="Note"
                                      className="w-full min-w-0 text-[11px] leading-tight bg-[var(--color-surface)]/60 border border-[var(--color-border)] rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] text-slate-600 dark:!text-slate-300 overflow-x-hidden ml-7 placeholder:text-slate-500 dark:placeholder:text-slate-400"
                                    />
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => setOpenNoteIndex(index)}
                                      className="inline-flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-[var(--color-text-subtle)] hover:text-[var(--color-primary)] rounded px-2 py-1 hover:bg-[var(--color-overlay)] ml-7"
                                      title="เพิ่ม memo / note"
                                    >
                                      <FileText className="w-3.5 h-3.5" />
                                      เพิ่ม Note
                                    </button>
                                  )}
                                </div>
                                <div className="opacity-0 group-hover:opacity-100 hover:opacity-100 focus-within:opacity-100 transition-opacity shrink-0 pointer-events-none group-hover:pointer-events-auto hover:pointer-events-auto focus-within:pointer-events-auto text-amber-600 dark:text-amber-400 mt-0.5">
                                  <LongPressDeleteButton
                                    onDelete={() => onRemoveDetail(index)}
                                    title="ลบรายการ"
                                    className="p-1"
                                    iconClassName="w-3.5 h-3.5"
                                  />
                                </div>
                              </>
                            )}
                          </SortableDetailRow>
                        );
                      })}
                    </SortableContext>
                    <button
                      type="button"
                      onClick={onAddDetail}
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--color-primary)] hover:text-[var(--color-primary-hover)] mt-1"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      เพิ่มรายการติดตาม
                    </button>
                  </div>
                )}
                {details.length === 0 && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={onAddDetail}
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--color-primary)] hover:text-[var(--color-primary-hover)]"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      เพิ่มรายการติดตาม
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

