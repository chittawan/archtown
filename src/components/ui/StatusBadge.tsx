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

export function StatusBadge({
  status,
  label,
}: {
  status: Status;
  label?: string;
}) {
  const c = config[status];
  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${c.bg} ${c.text} ${c.border}`}
    >
      <span className="mr-1">{c.icon}</span>
      {label ?? c.defaultText}
    </span>
  );
}
