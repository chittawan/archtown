import React, { useRef, useState } from 'react';
import { LONG_PRESS_HOLD_MS } from './LongPressDeleteButton';

export type ReferenceIdKind = 'project_id' | 'team_id' | 'topic_id' | 'sub_id' | 'detail_idx';

type Props = {
  kind: ReferenceIdKind;
  value: string;
  className?: string;
  /** ถ้า true ใช้ขนาดเล็กมาก (แถว Todo) */
  compact?: boolean;
  /** กดค้าง 1 วินาที: คัดลอกสายอ้างอิง ลำดับจากลูกไป parent */
  longPressReferenceChain?: Array<{ kind: ReferenceIdKind; value: string }>;
};

function chainToClipboardText(chain: Array<{ kind: ReferenceIdKind; value: string }>) {
  return chain.map((p) => `${p.kind}=${p.value}`).join(' ');
}

/**
 * แสดง id สำหรับอ้างอิงกับทีม/AI — คลิกคัดลอกรูปแบบ `kind=value`
 */
export function ReferenceIdChip({
  kind,
  value,
  className = '',
  compact,
  longPressReferenceChain,
}: Props) {
  const full = `${kind}=${value}`;
  const chain =
    longPressReferenceChain != null && longPressReferenceChain.length > 0
      ? longPressReferenceChain
      : null;
  const hasLongPress = chain != null;
  const chainText = chain ? chainToClipboardText(chain) : '';

  const [progress, setProgress] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startRef = useRef(0);
  const rafRef = useRef<number>(0);
  const didLongPressRef = useRef(false);

  const clearHold = () => {
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
    if (!hasLongPress) return;
    e.stopPropagation();
    didLongPressRef.current = false;
    clearHold();
    startRef.current = Date.now();
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }
      setProgress(0);
      didLongPressRef.current = true;
      void navigator.clipboard?.writeText(chainText);
    }, LONG_PRESS_HOLD_MS);
    const tick = () => {
      const elapsed = Date.now() - startRef.current;
      const p = Math.min(100, (elapsed / LONG_PRESS_HOLD_MS) * 100);
      setProgress(p);
      if (p < 100 && timerRef.current != null) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
  };

  const titleBase = hasLongPress
    ? `${full} — คลิกเพื่อคัดลอก | กดค้าง 1 วินาที: คัดลอกสายอ้างอิงเต็ม`
    : `${full} — คลิกเพื่อคัดลอก`;

  const ariaBase = hasLongPress
    ? `คลิกเพื่อคัดลอก ${full}; กดค้าง 1 วินาทีเพื่อคัดลอกสายอ้างอิงเต็ม`
    : `คลิกเพื่อคัดลอก ${full}`;

  return (
    <button
      type="button"
      onPointerDown={hasLongPress ? onPointerDown : undefined}
      onPointerUp={hasLongPress ? clearHold : undefined}
      onPointerLeave={hasLongPress ? clearHold : undefined}
      onPointerCancel={hasLongPress ? clearHold : undefined}
      onClick={(e) => {
        e.stopPropagation();
        if (didLongPressRef.current) {
          didLongPressRef.current = false;
          return;
        }
        void navigator.clipboard?.writeText(full);
      }}
      title={titleBase}
      aria-label={ariaBase}
      className={`inline-flex items-center gap-1 max-w-full rounded border border-[var(--color-border)] bg-[var(--color-overlay)] text-[var(--color-text-muted)] hover:bg-[var(--color-primary-muted)] hover:border-[var(--color-primary)]/40 transition-colors ${
        hasLongPress ? 'relative overflow-hidden' : ''
      } ${compact ? 'px-1 py-0 text-[9px]' : 'px-1.5 py-0.5 text-[10px]'} leading-none ${className}`}
    >
      {hasLongPress && progress > 0 && (
        <span
          className="absolute inset-0 bg-[var(--color-primary)]/25 rounded ease-linear"
          style={{ width: `${progress}%`, transition: 'none' }}
          aria-hidden
        />
      )}
      <span className="relative z-10 inline-flex items-center gap-1 min-w-0 max-w-full">
        <span className="text-[var(--color-text-subtle)] shrink-0">{kind}</span>
        <span className={`font-mono text-[var(--color-text)] truncate ${compact ? 'text-[9px]' : 'text-[10px]'}`}>
          {value}
        </span>
      </span>
    </button>
  );
}
