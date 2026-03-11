import React, { useState, useRef } from 'react';
import { Trash2 } from 'lucide-react';

type LongPressDeleteButtonProps = {
  onDelete: () => void;
  title: string;
  className?: string;
  iconClassName?: string;
  ariaLabel?: string;
};

const REMOVE_HOLD_MS = 1000;

export function LongPressDeleteButton({
  onDelete,
  title,
  className = '',
  iconClassName = 'w-4 h-4',
  ariaLabel,
}: LongPressDeleteButtonProps) {
  const [progress, setProgress] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startRef = useRef(0);
  const rafRef = useRef<number>(0);

  const clear = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
    setProgress(0);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    clear();
    startRef.current = Date.now();
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }
      setProgress(0);
      onDelete();
    }, REMOVE_HOLD_MS);
    const tick = () => {
      const elapsed = Date.now() - startRef.current;
      const p = Math.min(100, (elapsed / REMOVE_HOLD_MS) * 100);
      setProgress(p);
      if (p < 100 && timerRef.current != null) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
  };

  return (
    <button
      type="button"
      onPointerDown={onPointerDown}
      onPointerUp={clear}
      onPointerLeave={clear}
      onPointerCancel={clear}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      className={`relative p-1.5 rounded-md text-[var(--color-text-subtle)] hover:text-red-500 hover:bg-red-500/10 dark:hover:bg-red-500/20 overflow-hidden transition-colors ${className}`}
      title={`${title} — กดค้าง 1 วินาที`}
      aria-label={ariaLabel ?? `กดค้าง 1 วินาทีเพื่อ${title}`}
    >
      {progress > 0 && (
        <span
          className="absolute inset-0 bg-red-500/30 rounded-md ease-linear"
          style={{ width: `${progress}%`, transition: 'none' }}
        />
      )}
      <span className="relative z-10 block">
        <Trash2 className={iconClassName} />
      </span>
    </button>
  );
}

