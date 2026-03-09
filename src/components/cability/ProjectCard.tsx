import React from 'react';
import { GripVertical, Trash2 } from 'lucide-react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { ProjectInCab, ProjectStatus } from '../../lib/cabilityMarkdown';

export const PROJECT_PREFIX = 'project::';

export function projectDragId(cabId: string, projectId: string): string {
  return `${PROJECT_PREFIX}${cabId}::${projectId}`;
}

function cabWidthClass(cols?: 12 | 6 | 4 | 3): string {
  const value = cols && [12, 6, 4, 3].includes(cols) ? cols : 4;
  switch (value) {
    case 12:
      return 'col-span-12';
    case 6:
      return 'col-span-12 sm:col-span-6';
    case 4:
      return 'col-span-12 sm:col-span-4';
    case 3:
      return 'col-span-12 sm:col-span-3';
    default:
      return 'col-span-12';
  }
}

const STATUS_PILL: Record<ProjectStatus, string> = {
  RED: 'bg-red-500/10 text-red-600 dark:text-red-400',
  YELLOW: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  GREEN: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
};
const STATUS_ACCENT: Record<ProjectStatus, string> = {
  RED: 'border-l-red-500',
  YELLOW: 'border-l-amber-500',
  GREEN: 'border-l-emerald-500',
};
const STATUS_LABEL: Record<ProjectStatus, string> = {
  RED: '🔴',
  YELLOW: '🟡',
  GREEN: '🟢',
};

export interface SortableProjectCardProps {
  cabId: string;
  project: ProjectInCab;
  displayStatus: ProjectStatus | null;
  onRemove: () => void;
  onDoubleClick: () => void;
  onChangeCols: (cols: 12 | 6 | 4 | 3) => void;
}

export function SortableProjectCard({
  cabId,
  project,
  displayStatus,
  onRemove,
  onDoubleClick,
  onChangeCols,
}: SortableProjectCardProps) {
  const id = projectDragId(cabId, project.id);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });
  const style = { transform: CSS.Transform.toString(transform), transition };
  const projectWidthClass = cabWidthClass(project.cols);
  const accentClass = displayStatus ? STATUS_ACCENT[displayStatus] : 'border-l-[var(--color-border)]';

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group ${projectWidthClass} min-w-0`}
    >
      <div
        onDoubleClick={onDoubleClick}
        className={`
          relative rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]
          shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer select-none
          overflow-hidden border-l-4 ${accentClass}
          ${isDragging ? 'shadow-lg ring-2 ring-[var(--color-primary)]/30 opacity-95 z-10 scale-[1.02]' : 'hover:border-[var(--color-text-subtle)]/30'}
        `}
        title="ดับเบิลคลิกเพื่อเปิดโปรเจกต์"
      >
        <div className="flex flex-col w-full">
          {/* Row 1 — col-12: ชื่อ + คำแนะนำ */}
          <div className="flex items-center gap-3 px-4 pt-3 w-full">
            <button
              type="button"
              className="shrink-0 p-1 rounded-md text-[var(--color-text-subtle)]/70 hover:text-[var(--color-text)] hover:bg-[var(--color-overlay)] touch-none cursor-grab active:cursor-grabbing transition-colors"
              aria-label="ลากเพื่อย้ายหรือเรียงลำดับ"
              title="ลากเพื่อย้ายหรือเรียงลำดับ"
              {...attributes}
              {...listeners}
            >
              <GripVertical className="w-4 h-4" />
            </button>
            <div className="flex-1 min-w-0 w-full">
              <p className="text-sm font-medium text-[var(--color-text)] line-clamp-2 break-words leading-snug">
                {project.name}
              </p>
              <p className="mt-1 text-[10px] text-[var(--color-text-muted)]/80">
                ดับเบิลคลิกเพื่อเปิด
              </p>
            </div>
          </div>
          {/* Row 2 — ความกว้างการ์ด + ลบขวา (โชว์ตอนโฮเวอร์) | สถานะขวา */}
          <div className="flex items-center justify-start gap-2 px-4 pb-3 pt-1 w-full">
            <div className="flex items-center gap-1 shrink-0 ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
              <label className="sr-only" htmlFor={`project-cols-${cabId}-${project.id}`}>
                ความกว้างการ์ด
              </label>
              <select
                id={`project-cols-${cabId}-${project.id}`}
                value={project.cols ?? 4}
                onChange={(e) => {
                  e.stopPropagation();
                  onChangeCols(Number(e.target.value) as 12 | 6 | 4 | 3);
                }}
                onClick={(e) => e.stopPropagation()}
                title="ปรับความกว้างการ์ด"
                className="h-7 pl-2 pr-6 rounded-md border border-[var(--color-border)] bg-[var(--color-page)] text-[11px] text-[var(--color-text)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)] focus:border-transparent appearance-none cursor-pointer"
                style={{
                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%239ca3af'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`,
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'right 0.5rem center',
                  backgroundSize: '10px',
                }}
              >
                <option value={12}>เต็มแถว</option>
                <option value={6}>ครึ่งแถว</option>
                <option value={4}>1/3 แถว</option>
                <option value={3}>1/4 แถว</option>
              </select>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove();
                }}
                className="shrink-0 p-1.5 rounded-md text-[var(--color-text-muted)] hover:text-red-500 hover:bg-red-500/10 transition-colors"
                title="เอาออกจากกลุ่มนี้"
                aria-label="เอาโปรเจกต์ออกจากกลุ่ม"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
            {displayStatus && (
              <span
                className={`shrink-0 inline-flex px-2 py-0.5 rounded-md text-[10px] font-medium ${STATUS_PILL[displayStatus]}`}
              >
                {STATUS_LABEL[displayStatus]}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
