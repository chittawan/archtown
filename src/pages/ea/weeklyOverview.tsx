import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { BarChart3, ChevronDown, ChevronRight, RefreshCw } from 'lucide-react';
import { getGoogleUserId } from '../../lib/googleAuth';
import { eaApiHeaders } from '../../lib/eaApiHeaders';

type SubtopicTotals = { RED: number; YELLOW: number; GREEN: number };

type OverviewRow = {
  project_id: string;
  project_name: string;
  weeks_defined: number;
  snapshots_count: number;
  latest?: {
    ts: string;
    week_no: number;
    week_label: string;
    subtopic_totals: SubtopicTotals;
  };
};

type SummaryDetail = {
  project_id: string;
  project_name: string;
  weeks: { week_no: number; label: string; start: string; end: string }[];
  snapshots_count: number;
  latest?: {
    ts: string;
    week_no: number;
    week_label: string;
    week_start: string;
    week_end: string;
    subtopic_totals: SubtopicTotals;
    by_team: Record<string, SubtopicTotals>;
  };
};

function TotalsBadges({ t }: { t: SubtopicTotals }) {
  return (
    <div className="flex flex-wrap gap-2 text-xs font-medium">
      {t.RED > 0 && (
        <span className="rounded-md bg-red-500/15 px-2 py-0.5 text-red-600 dark:text-red-400">RED {t.RED}</span>
      )}
      {t.YELLOW > 0 && (
        <span className="rounded-md bg-amber-500/15 px-2 py-0.5 text-amber-700 dark:text-amber-400">YELLOW {t.YELLOW}</span>
      )}
      <span className="rounded-md bg-emerald-500/15 px-2 py-0.5 text-emerald-700 dark:text-emerald-400">GREEN {t.GREEN}</span>
    </div>
  );
}

export default function EaWeeklyOverviewPage() {
  const [searchParams] = useSearchParams();
  const focusProject = searchParams.get('project');
  const lastDeepLinkRef = useRef<string | null>(null);

  const [rows, setRows] = useState<OverviewRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [detailById, setDetailById] = useState<Record<string, SummaryDetail | 'loading' | 'error'>>({});

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/ea/overview', { headers: eaApiHeaders(), credentials: 'include' });
      const data = (await res.json()) as { ok?: boolean; projects?: OverviewRow[]; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? `HTTP ${res.status}`);
        setRows([]);
        return;
      }
      setRows(Array.isArray(data.projects) ? data.projects : []);
    } catch (e) {
      setError(String(e));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDetailForProject = useCallback(async (projectId: string) => {
    setDetailById((m) => ({ ...m, [projectId]: 'loading' }));
    try {
      const res = await fetch(`/api/ea/${encodeURIComponent(projectId)}/summary`, {
        headers: eaApiHeaders(),
        credentials: 'include',
      });
      const data = (await res.json()) as Partial<SummaryDetail> & { ok?: boolean; error?: string };
      if (!res.ok || data.ok === false) {
        setDetailById((m) => ({ ...m, [projectId]: 'error' }));
        return;
      }
      setDetailById((m) => ({
        ...m,
        [projectId]: {
          project_id: String(data.project_id ?? projectId),
          project_name: String(data.project_name ?? projectId),
          weeks: Array.isArray(data.weeks) ? data.weeks : [],
          snapshots_count: typeof data.snapshots_count === 'number' ? data.snapshots_count : 0,
          latest: data.latest,
        },
      }));
    } catch {
      setDetailById((m) => ({ ...m, [projectId]: 'error' }));
    }
  }, []);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  useEffect(() => {
    lastDeepLinkRef.current = null;
  }, [focusProject]);

  useEffect(() => {
    if (!focusProject || rows === null || loading) return;
    if (!rows.some((r) => r.project_id === focusProject)) return;
    if (lastDeepLinkRef.current === focusProject) return;
    lastDeepLinkRef.current = focusProject;
    setExpanded(focusProject);
    void loadDetailForProject(focusProject);
  }, [focusProject, rows, loading, loadDetailForProject]);

  useEffect(() => {
    if (!focusProject || expanded !== focusProject || !rows?.length) return;
    const t = window.setTimeout(() => {
      document.getElementById(`ea-overview-row-${focusProject}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 120);
    return () => window.clearTimeout(t);
  }, [focusProject, expanded, rows]);

  const toggleDetail = async (projectId: string) => {
    if (expanded === projectId) {
      setExpanded(null);
      return;
    }
    setExpanded(projectId);
    const existing = detailById[projectId];
    if (existing && existing !== 'loading' && existing !== 'error') return;
    await loadDetailForProject(projectId);
  };

  const loggedIn = !!getGoogleUserId();

  return (
    <div className="min-h-full bg-[var(--color-page)] text-[var(--color-text)]">
      <div className="mx-auto max-w-4xl px-4 py-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <BarChart3 className="h-8 w-8 text-[var(--color-text-muted)]" />
            <div>
              <h1 className="text-xl font-semibold tracking-tight">EA — สรุปรายสัปดาห์</h1>
              <p className="text-sm text-[var(--color-text-muted)]">
                ดู snapshot ล่าสุดต่อโปรเจกต์จากคลาวด์ — ข้อมูลจาก{' '}
                <code className="rounded bg-[var(--color-overlay)] px-1">GET /api/ea/overview</code>
                {focusProject ? (
                  <>
                    {' '}
                    · กำลังโฟกัส <code className="rounded bg-[var(--color-overlay)] px-1">{focusProject}</code>
                  </>
                ) : null}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void loadOverview()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-overlay)] px-3 py-2 text-sm font-medium hover:bg-[var(--color-page)] disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            รีเฟรช
          </button>
        </div>

        {!loggedIn && (
          <div className="mb-6 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-200">
            ล็อกอินก่อนเพื่อส่ง <code className="px-1">X-Google-User-Id</code> ที่ถูกต้อง — ตอนนี้ใช้โหมด guest อาจไม่มีข้อมูลบนคลาวด์
          </div>
        )}

        {error && (
          <div className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-800 dark:text-red-200">
            {error}
          </div>
        )}

        {loading && rows === null ? (
          <p className="text-sm text-[var(--color-text-muted)]">กำลังโหลด…</p>
        ) : rows?.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)]">
            ยังไม่มีโปรเจกต์ในสำรองคลาวด์ หรือยังไม่ได้ตั้งค่า week — ใช้{' '}
            <Link to="/ai/context" className="text-[var(--color-accent)] underline">
              เอกสาร API
            </Link>{' '}
            สำหรับ <code className="px-1">PUT /api/ea/:projectId/weeks</code>
          </p>
        ) : (
          <ul className="space-y-3">
            {rows?.map((row) => {
              const open = expanded === row.project_id;
              const detail = detailById[row.project_id];
              return (
                <li
                  key={row.project_id}
                  id={`ea-overview-row-${row.project_id}`}
                  className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-overlay)]"
                >
                  <button
                    type="button"
                    onClick={() => void toggleDetail(row.project_id)}
                    className="flex w-full items-start gap-3 px-4 py-4 text-left hover:bg-[var(--color-page)]/50"
                  >
                    {open ? <ChevronDown className="mt-0.5 h-5 w-5 shrink-0" /> : <ChevronRight className="mt-0.5 h-5 w-5 shrink-0" />}
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">{row.project_name}</div>
                      <div className="mt-1 text-xs text-[var(--color-text-muted)]">
                        {row.weeks_defined} week ที่กำหนด · {row.snapshots_count} snapshot
                      </div>
                      {row.latest && (
                        <div className="mt-2">
                          <div className="text-xs text-[var(--color-text-muted)]">
                            ล่าสุด {row.latest.week_label} · {new Date(row.latest.ts).toLocaleString()} (UTC: {row.latest.ts})
                          </div>
                          <div className="mt-2">
                            <TotalsBadges t={row.latest.subtopic_totals} />
                          </div>
                        </div>
                      )}
                    </div>
                  </button>
                  {open && (
                    <div className="border-t border-[var(--color-border)] bg-[var(--color-page)]/40 px-4 py-4 text-sm">
                      {detail === 'loading' && <p className="text-[var(--color-text-muted)]">กำลังโหลดรายละเอียด…</p>}
                      {detail === 'error' && <p className="text-red-600 dark:text-red-400">โหลดสรุปไม่สำเร็จ</p>}
                      {detail && detail !== 'loading' && detail !== 'error' && (
                        <div className="space-y-4">
                          <div>
                            <div className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Weeks</div>
                            {detail.weeks.length === 0 ? (
                              <p className="mt-1 text-[var(--color-text-muted)]">ยังไม่ได้กำหนด week</p>
                            ) : (
                              <ul className="mt-2 space-y-1 text-xs">
                                {detail.weeks.map((w) => (
                                  <li key={w.week_no}>
                                    <span className="font-medium">{w.label}</span> · {w.start} → {w.end}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                          {detail.latest && (
                            <div>
                              <div className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                                รายทีม (snapshot ล่าสุด)
                              </div>
                              <div className="mt-2 space-y-2">
                                {Object.entries(detail.latest.by_team).map(([team, t]) => (
                                  <div key={team} className="flex flex-wrap items-center gap-2">
                                    <span className="w-36 shrink-0 font-medium">{team}</span>
                                    <TotalsBadges t={t} />
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
