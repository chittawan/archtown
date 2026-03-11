import { useState, useEffect } from 'react';
import { AlertTriangle, AlertCircle } from 'lucide-react';

interface SummaryItem {
  capName: string;
  projectName: string;
  taskName: string;
}

interface SummaryData {
  critical: SummaryItem[];
  warning: SummaryItem[];
}

interface GroupedSummaryItem {
  capName: string;
  projectName: string;
  tasks: string[];
}

async function fetchSummary(projectId?: string): Promise<SummaryData> {
  const url = projectId ? `/api/capability/summary?projectId=${encodeURIComponent(projectId)}` : '/api/capability/summary';
  const res = await fetch(url);
  if (!res.ok) return { critical: [], warning: [] };
  const data = await res.json();
  return {
    critical: Array.isArray(data.critical) ? data.critical : [],
    warning: Array.isArray(data.warning) ? data.warning : [],
  };
}

export default function SummaryStatusPanel({ projectId }: { projectId?: string }) {
  const [data, setData] = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchSummary(projectId)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  /** Refetch when project page saves (status change etc.) so Summary stays in sync */
  useEffect(() => {
    if (!projectId || typeof window === 'undefined') return;
    const handler = (e: Event) => {
      const ev = e as CustomEvent<{ projectId: string }>;
      if (ev.detail?.projectId === projectId) {
        fetchSummary(projectId).then(setData);
      }
    };
    window.addEventListener('project-summary-invalidate', handler);
    return () => window.removeEventListener('project-summary-invalidate', handler);
  }, [projectId]);

  if (loading) {
    return (
      <div className="p-4 text-sm text-[var(--color-text-muted)]">
        กำลังโหลด...
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-4 text-sm text-[var(--color-text-muted)]">
        โหลดสรุปไม่สำเร็จ
      </div>
    );
  }

  const hasCritical = data.critical.length > 0;
  const hasWarning = data.warning.length > 0;

  const groupByCapAndProject = (items: SummaryItem[]): GroupedSummaryItem[] => {
    const map = new Map<string, GroupedSummaryItem>();
    for (const item of items) {
      const key = `${item.capName}:::${item.projectName}`;
      const existing = map.get(key);
      if (existing) {
        if (!existing.tasks.includes(item.taskName)) {
          existing.tasks.push(item.taskName);
        }
      } else {
        map.set(key, {
          capName: item.capName,
          projectName: item.projectName,
          tasks: [item.taskName],
        });
      }
    }
    return Array.from(map.values());
  };

  const groupedCritical = groupByCapAndProject(data.critical);
  const groupedWarning = groupByCapAndProject(data.warning);

  const dispatchOpen = (capName: string, projectName: string) => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(
      new CustomEvent('summary-project-open', {
        detail: { capName, projectName },
      })
    );
  };

  const dispatchHover = (detail: { capName: string; projectName: string } | null) => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent('summary-project-hover', { detail }));
  };

  if (!hasCritical && !hasWarning) {
    return (
      <div className="p-4 text-sm text-[var(--color-text-muted)]">
        ไม่มีรายการ Critical / Warning
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* TOP: Critical / Warning headers */}
      <div className="grid grid-cols-2 gap-2 border-b border-[var(--color-border)] pb-2">
        <div className="flex items-center gap-1.5 text-red-600 dark:text-red-400 font-semibold text-sm">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          Critical ({data.critical.length})
        </div>
        <div className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400 font-semibold text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          Warning ({data.warning.length})
        </div>
      </div>

      {/* List: Cap → Project → Task name */}
      <div className="flex flex-col gap-4">
        {hasCritical && (
          <section>
            <h4 className="text-xs font-semibold text-red-600 dark:text-red-400 uppercase tracking-wide mb-2">
              Critical
            </h4>
            <ul className="space-y-2">
              {groupedCritical.map((item, i) => (
                <li
                  key={`c-${i}`}
                  role="button"
                  tabIndex={0}
                  title="ดับเบิลคลิกเพื่อเปิดโปรเจกต์"
                  className="group text-sm border-l-2 border-red-500/50 pl-2 py-0.5 rounded-sm cursor-pointer
                    hover:bg-red-500/5 hover:border-red-500/80 hover:shadow-sm
                    focus:outline-none focus:ring-1 focus:ring-red-500/40 focus:ring-offset-1 focus:ring-offset-[var(--color-surface)]
                    transition-colors duration-150"
                  onDoubleClick={() => dispatchOpen(item.capName, item.projectName)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      dispatchOpen(item.capName, item.projectName);
                    }
                  }}
                  onMouseEnter={() => dispatchHover({ capName: item.capName, projectName: item.projectName })}
                  onMouseLeave={() => dispatchHover(null)}
                >
                  <span className="font-medium text-[var(--color-text)] group-hover:text-red-600 dark:group-hover:text-red-400">
                    {item.capName}
                  </span>
                  <span className="block text-[var(--color-text-muted)]">
                    {item.projectName}
                  </span>
                  <ul className="mt-0.5 space-y-0.5 list-disc list-inside text-red-600 dark:text-red-400">
                    {item.tasks.map((task, idx) => (
                      <li key={idx} className="text-xs truncate">
                        {task}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </section>
        )}
        {hasWarning && (
          <section>
            <h4 className="text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wide mb-2">
              Warning
            </h4>
            <ul className="space-y-2">
              {groupedWarning.map((item, i) => (
                <li
                  key={`w-${i}`}
                  role="button"
                  tabIndex={0}
                  title="ดับเบิลคลิกเพื่อเปิดโปรเจกต์"
                  className="group text-sm border-l-2 border-amber-500/50 pl-2 py-0.5 rounded-sm cursor-pointer
                    hover:bg-amber-500/5 hover:border-amber-500/80 hover:shadow-sm
                    focus:outline-none focus:ring-1 focus:ring-amber-500/40 focus:ring-offset-1 focus:ring-offset-[var(--color-surface)]
                    transition-colors duration-150"
                  onDoubleClick={() => dispatchOpen(item.capName, item.projectName)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      dispatchOpen(item.capName, item.projectName);
                    }
                  }}
                  onMouseEnter={() => dispatchHover({ capName: item.capName, projectName: item.projectName })}
                  onMouseLeave={() => dispatchHover(null)}
                >
                  <span className="font-medium text-[var(--color-text)] group-hover:text-amber-600 dark:group-hover:text-amber-400">
                    {item.capName}
                  </span>
                  <span className="block text-[var(--color-text-muted)]">
                    {item.projectName}
                  </span>
                  <ul className="mt-0.5 space-y-0.5 list-disc list-inside text-amber-600 dark:text-amber-400">
                    {item.tasks.map((task, idx) => (
                      <li key={idx} className="text-xs truncate">
                        {task}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
