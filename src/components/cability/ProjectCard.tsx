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
  description?: string | null;
  onRemove: () => void;
  onDoubleClick: () => void;
  onChangeCols: (cols: 12 | 6 | 4 | 3) => void;
}

export function SortableProjectCard({
  cabId,
  cabName,
  project,
  displayStatus,
  description,
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
  const descriptionText =
    typeof description === 'string' && description.trim() ? description.trim() : '';
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
          relative rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]
          shadow-none hover:bg-[var(--color-overlay)] hover:shadow-sm transition-all duration-150 cursor-pointer select-none
          overflow-hidden border-l-2 ${accentClass}
          ${
            isDragging
              ? 'shadow-md ring-2 ring-[var(--color-primary)]/25 opacity-95 z-10 scale-[1.01]'
              : ''
          }
          ${
            highlightedFromSummary && !isDragging
              ? 'ring-1 ring-[var(--color-primary)]/70 bg-[var(--color-primary-muted)]/20 scale-[1.005]'
              : ''
          }
        `}
        title="ดับเบิลคลิกเพื่อเปิดโปรเจกต์"
      >
        <div className="flex flex-col w-full">
          {/* Compact row: Grip | Label area (hover → ปุ่มทับ) | Status เสมอ */}
          <div className="flex items-center gap-2 px-3 py-2 w-full min-h-[72px]">
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
            <div className="flex-1 min-w-0 relative flex items-center">
              {/* Label — แสดงชื่อ + description จาก project */}
              <div className="flex flex-col min-w-0 py-0.5 pointer-events-none">
                <p className="text-sm font-medium text-[var(--color-text)] line-clamp-2 break-words leading-snug">
                  {project.name}
                </p>
                {descriptionText && (
                  <p className="mt-0.5 text-[10px] text-[var(--color-text-muted)]/90 line-clamp-2 break-words">
                    {descriptionText}
                  </p>
                )}
              </div>
              {/* ปุ่มทับ label อีกชั้น — โชว์ตอน hover, ชิดขวา */}
              <div
                className="absolute inset-0 flex items-center justify-end gap-1.5 opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-opacity"
              >
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
                  onDoubleClick={(e) => e.stopPropagation()}
                  title="ปรับความกว้างการ์ด"
                  className="h-7 px-2 rounded-md border border-transparent bg-transparent hover:bg-[var(--color-overlay)] text-[11px] text-[var(--color-text-subtle)] hover:text-[var(--color-text)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)] focus:border-[var(--color-primary)] appearance-none cursor-pointer"
                  style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%239ca3af'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`,
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: 'right 0.35rem center',
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
                  onPointerDown={handleRemovePointerDown}
                  onPointerUp={clearRemoveHold}
                  onPointerLeave={clearRemoveHold}
                  onPointerCancel={clearRemoveHold}
                  onClick={(e) => e.stopPropagation()}
                  onDoubleClick={(e) => e.stopPropagation()}
                  className="relative shrink-0 p-1.5 rounded-md text-[var(--color-text-subtle)] hover:text-red-500 hover:bg-red-500/5 transition-colors overflow-hidden"
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
                    <Trash2 className="w-3.5 h-3.5" />
                  </span>
                </button>
              </div>
            </div>
            {/* Status แสดงเสมอ — มีค่าก็แสดง pill, ไม่มีก็แสดง placeholder */}
            <span
              className={`shrink-0 inline-flex items-center min-w-[1.25rem] justify-end ${
                displayStatus
                  ? `px-1.5 py-0.5 rounded text-[9px] font-medium ${STATUS_PILL[displayStatus]}`
                  : 'text-[var(--color-text-muted)]/50 text-[10px]'
              }`}
            >
              {displayStatus ? STATUS_LABEL[displayStatus] : '—'}
            </span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
