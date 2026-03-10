import React, { useEffect, useRef, useState } from 'react';
import { GripVertical, Trash2 } from 'lucide-react';
import { motion } from 'motion/react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { ProjectInCab, ProjectStatus } from '../../lib/cabilityMarkdown';

const REMOVE_HOLD_MS = 1000;

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
  cabName: string;
  project: ProjectInCab;
  displayStatus: ProjectStatus | null;
  onRemove: () => void;
  onDoubleClick: () => void;
  onChangeCols: (cols: 12 | 6 | 4 | 3) => void;
}

export function SortableProjectCard({
  cabId,
  cabName,
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
  const [highlightedFromSummary, setHighlightedFromSummary] = useState(false);
  const [removeHoldProgress, setRemoveHoldProgress] = useState(0);
  const removeHoldTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const removeHoldStartRef = useRef(0);
  const removeHoldRafRef = useRef<number>(0);

  const clearRemoveHold = () => {
    if (removeHoldTimerRef.current) {
      clearTimeout(removeHoldTimerRef.current);
      removeHoldTimerRef.current = null;
    }
    if (removeHoldRafRef.current) {
      cancelAnimationFrame(removeHoldRafRef.current);
      removeHoldRafRef.current = 0;
    }
    setRemoveHoldProgress(0);
  };

  const handleRemovePointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    clearRemoveHold();
    removeHoldStartRef.current = Date.now();
    removeHoldTimerRef.current = setTimeout(() => {
      removeHoldTimerRef.current = null;
      if (removeHoldRafRef.current) {
        cancelAnimationFrame(removeHoldRafRef.current);
        removeHoldRafRef.current = 0;
      }
      setRemoveHoldProgress(0);
      onRemove();
    }, REMOVE_HOLD_MS);
    const tick = () => {
      const elapsed = Date.now() - removeHoldStartRef.current;
      const progress = Math.min(100, (elapsed / REMOVE_HOLD_MS) * 100);
      setRemoveHoldProgress(progress);
      if (progress < 100 && removeHoldTimerRef.current != null) {
        removeHoldRafRef.current = requestAnimationFrame(tick);
      }
    };
    removeHoldRafRef.current = requestAnimationFrame(tick);
  };

  useEffect(() => {
    function handleHover(event: Event) {
      const custom = event as CustomEvent<
        | {
            cabName: string;
            projectName: string;
          }
        | null
      >;
      const detail = custom.detail;
      if (!detail) {
        setHighlightedFromSummary(false);
        return;
      }
      const matches =
        detail.projectName === project.name &&
        detail.cabName === cabName;
      setHighlightedFromSummary(matches);
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('summary-project-hover', handleHover as EventListener);
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('summary-project-hover', handleHover as EventListener);
      }
    };
  }, [cabName, project.name]);

  return (
    <motion.div
      ref={setNodeRef}
      style={style}
      className={`group ${projectWidthClass} min-w-0`}
      layout={!isDragging}
      transition={{
        layout: {
          duration: 0.4,
          ease: [0.32, 0.72, 0, 1],
        },
      }}
    >
      <div
        onDoubleClick={onDoubleClick}
        className={`
          relative rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]
          shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer select-none
          overflow-hidden border-l-4 ${accentClass}
          ${
            isDragging
              ? 'shadow-lg ring-2 ring-[var(--color-primary)]/30 opacity-95 z-10 scale-[1.02]'
              : ''
          }
          ${
            highlightedFromSummary && !isDragging
              ? 'ring-2 ring-[var(--color-primary)]/80 bg-[var(--color-primary-muted)]/30 scale-[1.01]'
              : ''
          }
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
          <div className="flex items-center justify-start gap-1.5 px-4 pb-2 pt-0.5 w-full">
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
                className="h-6 pl-1.5 pr-5 rounded border border-[var(--color-border)] bg-[var(--color-page)] text-[10px] text-[var(--color-text)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)] focus:border-transparent appearance-none cursor-pointer"
                style={{
                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%239ca3af'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`,
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'right 0.25rem center',
                  backgroundSize: '8px',
                }}
              >
                <option value={12}>เต็มแถว</option>
                <option value={6}>ครึ่งแถว</option>
                <option value={4}>1/3 แถว</option>
                <option value={3}>1/4 แถว</option>
              </select>
              <button
                type="button"
                onPointerDown={handleRemovePointerDown}
                onPointerUp={clearRemoveHold}
                onPointerLeave={clearRemoveHold}
                onPointerCancel={clearRemoveHold}
                onClick={(e) => e.stopPropagation()}
                className="relative shrink-0 p-1 rounded text-[var(--color-text-muted)] hover:text-red-500 hover:bg-red-500/10 transition-colors overflow-hidden"
                title="กดค้าง 1 วินาทีเพื่อเอาออกจากกลุ่มนี้"
                aria-label="กดค้าง 1 วินาทีเพื่อเอาโปรเจกต์ออกจากกลุ่ม"
              >
                {removeHoldProgress > 0 && (
                  <span
                    className="absolute inset-0 bg-red-500/30 rounded ease-linear"
                    style={{ width: `${removeHoldProgress}%`, transition: 'none' }}
                  />
                )}
                <span className="relative z-10 block">
                  <Trash2 className="w-3 h-3" />
                </span>
              </button>
            </div>
            {displayStatus && (
              <span
                className={`shrink-0 inline-flex px-1.5 py-0 rounded text-[9px] font-medium ${STATUS_PILL[displayStatus]}`}
              >
                {STATUS_LABEL[displayStatus]}
              </span>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
