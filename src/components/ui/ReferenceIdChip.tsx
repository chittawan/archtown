import React from 'react';

export type ReferenceIdKind = 'project_id' | 'team_id' | 'topic_id' | 'sub_id' | 'detail_idx';

type Props = {
  kind: ReferenceIdKind;
  value: string;
  className?: string;
  /** ถ้า true ใช้ขนาดเล็กมาก (แถว Todo) */
  compact?: boolean;
};

/**
 * แสดง id สำหรับอ้างอิงกับทีม/AI — คลิกคัดลอกรูปแบบ `kind=value`
 */
export function ReferenceIdChip({ kind, value, className = '', compact }: Props) {
  const full = `${kind}=${value}`;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        void navigator.clipboard?.writeText(full);
      }}
      title={`${full} — คลิกเพื่อคัดลอก`}
      className={`inline-flex items-center gap-1 max-w-full rounded border border-[var(--color-border)] bg-[var(--color-overlay)] text-[var(--color-text-muted)] hover:bg-[var(--color-primary-muted)] hover:border-[var(--color-primary)]/40 transition-colors ${
        compact ? 'px-1 py-0 text-[9px]' : 'px-1.5 py-0.5 text-[10px]'
      } leading-none ${className}`}
    >
      <span className="text-[var(--color-text-subtle)] shrink-0">{kind}</span>
      <span className={`font-mono text-[var(--color-text)] truncate ${compact ? 'text-[9px]' : 'text-[10px]'}`}>
        {value}
      </span>
    </button>
  );
}
