import type { Status } from '../../types';

const config: Record<
  Status,
  { bg: string; text: string; border: string; icon: string; defaultText: string }
> = {
  GREEN: {
    bg: 'bg-emerald-100 dark:bg-emerald-900/40',
    text: 'text-emerald-800 dark:text-emerald-200',
    border: 'border-emerald-200 dark:border-emerald-700/60',
    icon: '🟢',
    defaultText: 'ปกติ',
  },
  YELLOW: {
    bg: 'bg-amber-100 dark:bg-amber-900/40',
    text: 'text-amber-800 dark:text-amber-200',
    border: 'border-amber-200 dark:border-amber-700/60',
    icon: '🟡',
    defaultText: 'จัดการได้',
  },
  RED: {
    bg: 'bg-rose-100 dark:bg-rose-900/40',
    text: 'text-rose-800 dark:text-rose-200',
    border: 'border-rose-200 dark:border-rose-700/60',
    icon: '🔴',
    defaultText: 'ต้องการ Support',
  },
};

/** สไตล์แบบ compact (ไอคอนเท่านั้น) ใช้ร่วมกับ ProjectCard ใน Capability */
const configCompact: Record<Status, { pill: string }> = {
  GREEN: { pill: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
  YELLOW: { pill: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' },
  RED: { pill: 'bg-red-500/10 text-red-600 dark:text-red-400' },
};

export function StatusBadge({
  status,
  label,
  variant = 'default',
}: {
  status: Status;
  label?: string;
  variant?: 'default' | 'compact';
}) {
  const c = config[status];
  const showText = variant === 'default' && label !== '';
  if (variant === 'compact') {
    const compact = configCompact[status];
    return (
      <span
        className={`shrink-0 inline-flex items-center min-w-[1.25rem] justify-center px-1.5 py-0.5 rounded text-[9px] font-medium ${compact.pill}`}
      >
        {c.icon}
      </span>
    );
  }
  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${c.bg} ${c.text} ${c.border}`}
    >
      <span className={showText ? 'mr-1' : ''}>{c.icon}</span>
      {showText ? (label ?? c.defaultText) : null}
    </span>
  );
}
