import React, { useState } from 'react';
import { FileText } from 'lucide-react';
import type { TodoItemStatus } from '../../types';

/** สีตามสถานะรายการ — สไตล์เดียวกับ SortableSubTopicCard */
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

function getDaysLeft(dueDate?: string): string | null {
  if (!dueDate) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate + 'T00:00:00');
  const diffMs = due.getTime() - today.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return `${Math.abs(diffDays)} วัน`;
  if (diffDays === 0) return 'วันนี้';
  return `อีก ${diffDays} วัน`;
}

function isOverdue(dueDate?: string): boolean {
  if (!dueDate) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate + 'T00:00:00');
  return due.getTime() < today.getTime();
}

export type TaskRowCardProps = {
  index: number;
  text: string;
  status: TodoItemStatus;
  dueDate?: string;
  description?: string;
  onTextChange: (value: string) => void;
  onStatusChange: (status: TodoItemStatus) => void;
  onDueDateChange: (dueDate: string | undefined) => void;
  onDescriptionChange: (value: string | undefined) => void;
};

/** การ์ดแถวรายการ (Task) — สไตล์เดียวกับแถวใน SortableSubTopicCard */
export function TaskRowCard({
  index,
  text,
  status,
  dueDate,
  description,
  onTextChange,
  onStatusChange,
  onDueDateChange,
  onDescriptionChange,
}: TaskRowCardProps) {
  const statusStyle = getStatusStyles(status);
  const [noteOpen, setNoteOpen] = useState(false);

  return (
    <div className={`group flex items-start gap-2 pl-2.5 py-1.5 min-w-0 text-slate-800 dark:text-[var(--color-text)] ${statusStyle.row}`}>
      <div className="flex-1 min-w-0 flex flex-col gap-0.5 overflow-hidden">
        <div className="flex items-center gap-2 min-h-[30px] min-w-0">
          <span
            className={`text-xs font-medium w-5 flex-shrink-0 text-right tabular-nums ${
              status === 'done'
                ? 'text-emerald-500 dark:!text-emerald-100'
                : status === 'doing'
                  ? 'text-blue-400 dark:!text-blue-100'
                  : 'text-slate-800 dark:!text-slate-100'
            }`}
          >
            {index}.
          </span>
          <input
            type="text"
            value={text}
            onChange={(e) => onTextChange(e.target.value)}
            placeholder={`รายการ ${index}`}
            className={`flex-1 min-w-0 text-sm bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] !text-slate-800 ${
              status === 'done'
                ? 'dark:!text-emerald-100'
                : status === 'doing'
                  ? 'dark:!text-blue-100'
                  : 'dark:!text-slate-100'
            }`}
          />
          <select
            value={status}
            onChange={(e) => onStatusChange(e.target.value as TodoItemStatus)}
            className={`shrink-0 text-[11px] border rounded px-2 py-1 font-medium focus:outline-none focus:ring-2 focus:ring-offset-1 min-w-[5rem] ${statusStyle.select}`}
            title="สถานะรายการ"
          >
            <option value="todo">รอทำ</option>
            <option value="doing">กำลังทำ</option>
            <option value="done">เสร็จ</option>
          </select>
          <div className="flex items-center gap-1.5 shrink-0 text-[10px] leading-tight w-[110px] sm:w-[140px] justify-start">
            <input
              type="date"
              value={dueDate ?? ''}
              onChange={(e) => onDueDateChange(e.target.value || undefined)}
              title="Due date"
              className={`shrink-0 text-[11px] bg-[var(--color-surface)] border rounded px-1.5 py-1 !text-slate-800 dark:!text-[var(--color-text)] focus:outline-none focus:ring-2 ${
                isOverdue(dueDate)
                  ? 'border-red-500 !text-red-500 focus:ring-red-500 dark:!text-red-400'
                  : 'border-[var(--color-border)] focus:ring-[var(--color-primary)]'
              }`}
            />
            {getDaysLeft(dueDate) && (
              <span
                className={`whitespace-nowrap ${isOverdue(dueDate) ? 'text-red-600 dark:text-red-400' : 'text-slate-800 dark:text-[var(--color-text)]'}`}
              >
                {getDaysLeft(dueDate)}
              </span>
            )}
          </div>
        </div>
        {/* Description / Memo — ลด indent บนมือถือ */}
        {(description != null && description !== '') || noteOpen ? (
          <div className="ml-4 sm:ml-7 min-w-0 w-[calc(100%-1rem)] sm:w-[calc(100%-1.75rem)]">
            <textarea
              rows={Math.min(8, Math.max(2, (description ?? '').split('\n').length))}
              value={description ?? ''}
              onChange={(e) => onDescriptionChange(e.target.value || undefined)}
              onBlur={(e) => {
                const v = e.target.value.trim();
                onDescriptionChange(v || undefined);
                if (!v) setNoteOpen(false);
              }}
              placeholder="Memo / Note... (รองรับหลายบรรทัด)"
              className="w-full min-w-0 text-[11px] bg-[var(--color-surface)]/60 border border-[var(--color-border)] rounded px-2 py-1.5 text-slate-600 dark:text-[var(--color-text-muted)] placeholder:text-slate-500 dark:placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] resize-y min-h-[52px] whitespace-pre-wrap"
              title="Note (multiline)"
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setNoteOpen(true)}
            className="inline-flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-[var(--color-text-subtle)] hover:text-[var(--color-primary)] rounded px-2 py-1 hover:bg-[var(--color-overlay)] ml-4 sm:ml-7 shrink-0"
            title="เพิ่ม memo / note"
          >
            <FileText className="w-3.5 h-3.5" />
            เพิ่ม Note
          </button>
        )}
      </div>
    </div>
  );
}
