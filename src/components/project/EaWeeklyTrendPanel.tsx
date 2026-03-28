import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { LineChart, Camera, Plus, Trash2, X } from 'lucide-react';
import { eaApiHeaders } from '../../lib/eaApiHeaders';

/** จำนวนสัปดาห์ล่าสุดที่โหลดจาก API — ใช้ slice ฝั่ง client เพื่อไม่ให้ตารางกว้างเกินเมื่อมีหลายเดือน/ปี */
type EaTimelineWeekSpan = 8 | 13 | 26 | 52 | 'all';

const TIMELINE_SPAN_OPTIONS: { value: EaTimelineWeekSpan; label: string }[] = [
  { value: 8, label: 'ล่าสุด 8 สัปดาห์' },
  { value: 13, label: '13 (~3 เดือน)' },
  { value: 26, label: '26 (~ครึ่งปี)' },
  { value: 52, label: '52 (~1 ปี)' },
  { value: 'all', label: 'ทั้งหมด' },
];

/** เมื่อคอลัมน์มากพอ ให้หัวตาราง/ช่องแคบลงอัตโนมัติ */
const TIMELINE_COMPACT_AT_COLUMNS = 14;

function timelineSpanStorageKey(projectId: string): string {
  return `archtown-ea-timeline-week-span:${projectId}`;
}

function parseStoredTimelineSpan(raw: string | null): EaTimelineWeekSpan | null {
  if (raw === 'all') return 'all';
  if (raw === '8' || raw === '13' || raw === '26' || raw === '52') return Number(raw) as EaTimelineWeekSpan;
  return null;
}

function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getCalendarWeekMondayToSunday(ref: Date = new Date()): { start: string; end: string } {
  const d = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
  const dow = d.getDay();
  const offsetToMonday = dow === 0 ? -6 : 1 - dow;
  d.setDate(d.getDate() + offsetToMonday);
  const start = toYmd(d);
  const endD = new Date(d);
  endD.setDate(endD.getDate() + 6);
  return { start, end: toYmd(endD) };
}

function addDaysFromYmd(ymd: string, days: number): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  if (!m) return null;
  const dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  dt.setDate(dt.getDate() + days);
  return toYmd(dt);
}

type TeamBuckets = {
  RED: unknown[];
  YELLOW: unknown[];
  GREEN: unknown[];
};

export type EaHistorySnapshot = {
  ts: string;
  week_no: number;
  week_label: string;
  week_start?: string;
  week_end?: string;
  teams: Record<string, TeamBuckets>;
};

function emptyTeamBuckets(): TeamBuckets {
  return { RED: [], YELLOW: [], GREEN: [] };
}

function subtopicIdFromEaItem(item: unknown): string {
  if (item && typeof item === 'object' && 'subtopic_id' in item) {
    return String((item as { subtopic_id: unknown }).subtopic_id ?? '');
  }
  return '';
}

function pushUniqueSubtopicItem(arr: unknown[], item: unknown) {
  const id = subtopicIdFromEaItem(item);
  if (!id) {
    arr.push(item);
    return;
  }
  if (arr.some((x) => subtopicIdFromEaItem(x) === id)) return;
  arr.push(item);
}

function mergeTeamBucketsInto(target: TeamBuckets, source: TeamBuckets) {
  for (const st of ['RED', 'YELLOW', 'GREEN'] as const) {
    for (const item of source[st] ?? []) {
      pushUniqueSubtopicItem(target[st], item);
    }
  }
}

/**
 * รวมข้อมูลทีมจาก snapshot ทุกคีย์ที่เป็นทีมเดียวกัน (เช่น ชื่อเก่า vs team id vs ชื่อปัจจุบัน)
 * เมื่อมี subtopic→team map จะจับคู่ตาม subtopic_id จากโปรเจกต์ปัจจุบัน
 */
function bucketsForTeamRow(
  snap: EaHistorySnapshot,
  teamId: string,
  teamDisplayName: string,
  subtopicToTeam?: Map<string, string>,
): TeamBuckets {
  const out = emptyTeamBuckets();
  const directId = snap.teams?.[teamId];
  const directName = snap.teams?.[teamDisplayName];
  if (directId) mergeTeamBucketsInto(out, directId);
  if (directName) mergeTeamBucketsInto(out, directName);

  if (subtopicToTeam?.size) {
    for (const buckets of Object.values(snap.teams ?? {})) {
      if (!buckets) continue;
      for (const st of ['RED', 'YELLOW', 'GREEN'] as const) {
        for (const item of buckets[st] ?? []) {
          const sid = subtopicIdFromEaItem(item);
          if (sid && subtopicToTeam.get(sid) === teamId) {
            pushUniqueSubtopicItem(out[st], item);
          }
        }
      }
    }
  }
  return out;
}

function teamTotalsFromBuckets(b: TeamBuckets | undefined): { RED: number; YELLOW: number; GREEN: number } {
  if (!b) return { RED: 0, YELLOW: 0, GREEN: 0 };
  return {
    RED: Array.isArray(b.RED) ? b.RED.length : 0,
    YELLOW: Array.isArray(b.YELLOW) ? b.YELLOW.length : 0,
    GREEN: Array.isArray(b.GREEN) ? b.GREEN.length : 0,
  };
}

function formatWeekRange(start?: string, end?: string): string {
  if (!start?.trim() || !end?.trim()) return '';
  try {
    const a = new Date(`${start}T12:00:00`);
    const b = new Date(`${end}T12:00:00`);
    if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return `${start} – ${end}`;
    const o: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };
    return `${a.toLocaleDateString('th-TH', o)} – ${b.toLocaleDateString('th-TH', o)}`;
  } catch {
    return `${start} – ${end}`;
  }
}

/** คีย์ YYYY-MM จาก week_start ของ snapshot (หรือจาก ts) — ใช้จัดกลุ่มหัวคอลัมน์ตามเดือน */
function monthKeyFromEaColumn(col: { snapshot: EaHistorySnapshot }): string {
  const start = col.snapshot.week_start?.trim();
  if (start && /^\d{4}-\d{2}-\d{2}$/.test(start)) {
    return start.slice(0, 7);
  }
  const d = new Date(col.snapshot.ts);
  if (Number.isNaN(d.getTime())) return 'unknown';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabelThForEa(monthKey: string, compact: boolean): string {
  if (monthKey === 'unknown') return '—';
  const y = Number(monthKey.slice(0, 4));
  const m = Number(monthKey.slice(5, 7));
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return monthKey;
  const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString('th-TH', {
    month: compact ? 'short' : 'long',
    year: compact ? '2-digit' : 'numeric',
  });
}

type EaWeekColumn = {
  key: string;
  label: string;
  range: string;
  titleLine: string;
  snapshot: EaHistorySnapshot;
};

function buildEaMonthHeaderSegments(
  cols: EaWeekColumn[],
  compact: boolean,
): { key: string; label: string; colSpan: number }[] {
  if (!cols.length) return [];
  const segments: { key: string; label: string; colSpan: number }[] = [];
  let i = 0;
  while (i < cols.length) {
    const mk = monthKeyFromEaColumn(cols[i]);
    let span = 1;
    let j = i + 1;
    while (j < cols.length && monthKeyFromEaColumn(cols[j]) === mk) {
      span++;
      j++;
    }
    segments.push({
      key: `${mk}-${i}`,
      label: monthLabelThForEa(mk, compact),
      colSpan: span,
    });
    i = j;
  }
  return segments;
}

function weekColumnFullHeaderTitle(col: {
  titleLine: string;
  range: string;
  snapshot: EaHistorySnapshot;
}): string {
  const ts = new Date(col.snapshot.ts).toLocaleString('th-TH');
  return [col.titleLine, col.range || null, ts].filter(Boolean).join('\n');
}

function teamHealthSummaryTh(totals: { RED: number; YELLOW: number; GREEN: number }): string {
  const { RED, YELLOW, GREEN } = totals;
  const sum = RED + YELLOW + GREEN;
  if (sum === 0) return 'ไม่มี subtopic ในช่วง snapshot นี้';
  if (RED > 0) return `มีประเด็นแดง ${RED} รายการ — เหลือง ${YELLOW} · เขียว ${GREEN}`;
  if (YELLOW > 0) return `เฝ้าระวัง (เหลือง) ${YELLOW} รายการ — เขียว ${GREEN}`;
  return `ราบรื่น — เขียว ${GREEN} รายการ`;
}

/** ภาพรวมระดับทีม/โปรเจกต์แบบ Summary View (worst subtopic ในช่องนั้น) */
type SummaryRollup = 'empty' | 'RED' | 'YELLOW' | 'GREEN';

function summaryRollupFromSubtopicCounts(totals: {
  RED: number;
  YELLOW: number;
  GREEN: number;
}): SummaryRollup {
  const n = totals.RED + totals.YELLOW + totals.GREEN;
  if (n === 0) return 'empty';
  if (totals.RED > 0) return 'RED';
  if (totals.YELLOW > 0) return 'YELLOW';
  return 'GREEN';
}

/** คำศัพท์เดียวกับ SummaryView (PDF) */
const SUMMARY_VIEW_HEADLINE: Record<Exclude<SummaryRollup, 'empty'>, string> = {
  RED: 'Critical',
  YELLOW: 'Manageable',
  GREEN: 'Normal',
};

const SUMMARY_VIEW_EMOJI: Record<Exclude<SummaryRollup, 'empty'>, string> = {
  RED: '🔴',
  YELLOW: '🟡',
  GREEN: '🟢',
};

function historyModeTooltip(
  contextLine: string,
  totals: { RED: number; YELLOW: number; GREEN: number },
): string {
  const rollup = summaryRollupFromSubtopicCounts(totals);
  const en =
    rollup === 'empty' ? 'No items' : `${SUMMARY_VIEW_HEADLINE[rollup]} (Summary View roll-up)`;
  return `${contextLine}\n${en}\n${teamHealthSummaryTh(totals)}`;
}

/** หัวข้อไทยสำหรับกล่องข้อมูล hover ของไอคอนสรุปภาพรวม (แดง / เหลือง / เขียว) */
function summaryRollupTitleTh(rollup: Exclude<SummaryRollup, 'empty'>): string {
  if (rollup === 'RED') return 'ภาพรวม: มีประเด็นแดง';
  if (rollup === 'YELLOW') return 'ภาพรวม: เฝ้าระวัง (เหลือง)';
  return 'ภาพรวม: ราบรื่น (เขียว)';
}

type EaTooltipAnchor = { top: number; left: number };

const EA_TOOLTIP_PANEL_CLASS =
  'pointer-events-none fixed z-[300] max-w-[min(18rem,calc(100vw-1.5rem))] rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-2 text-left shadow-[var(--shadow-modal)]';

function eaClampedTooltipAnchor(el: HTMLElement): EaTooltipAnchor {
  const r = el.getBoundingClientRect();
  const leftRaw = r.left + r.width / 2;
  const margin = 12;
  const estHalf = 140;
  const left = Math.max(margin + estHalf, Math.min(leftRaw, window.innerWidth - margin - estHalf));
  const top = Math.min(r.bottom + 6, window.innerHeight - 24);
  return { top, left };
}

function EaTooltipPortal({
  anchor,
  children,
}: {
  anchor: EaTooltipAnchor | null;
  children: React.ReactNode;
}) {
  if (!anchor || typeof document === 'undefined') return null;
  return createPortal(
    <div
      data-ea-tooltip-portal
      role="tooltip"
      className={EA_TOOLTIP_PANEL_CLASS}
      style={{
        top: anchor.top,
        left: anchor.left,
        transform: 'translateX(-50%)',
      }}
    >
      {children}
    </div>,
    document.body,
  );
}

/** หนึ่งบล็อกต่อหนึ่งรายการใน snapshot — เรียงตามที่จัดเก็บ: แดงก่อน แล้วเหลือง แล้วเขียว */
type StoredSubtopicBlock = {
  key: string;
  status: 'RED' | 'YELLOW' | 'GREEN';
  /** หัวข้อหลักในกล่องข้อมูล hover */
  title: string;
  /** บรรทัดเดียว — fallback native title / aria */
  hover: string;
};

function parseSubtopicItem(item: unknown, fallbackIdx: number): { id: string; title: string } {
  if (item && typeof item === 'object') {
    const o = item as Record<string, unknown>;
    const id = String(o.subtopic_id ?? fallbackIdx);
    const title = String(o.title ?? '').trim() || id;
    return { id, title };
  }
  return { id: String(fallbackIdx), title: `รายการ ${fallbackIdx}` };
}

function statusLabelTh(s: 'RED' | 'YELLOW' | 'GREEN'): string {
  return s === 'RED' ? 'แดง' : s === 'YELLOW' ? 'เหลือง' : 'เขียว';
}

function blocksFromTeamBuckets(
  buckets: TeamBuckets | undefined,
  teamNameForHover: string | null,
): StoredSubtopicBlock[] {
  if (!buckets) return [];
  const out: StoredSubtopicBlock[] = [];
  const push = (arr: unknown[] | undefined, status: 'RED' | 'YELLOW' | 'GREEN') => {
    if (!Array.isArray(arr)) return;
    arr.forEach((item, i) => {
      const { id, title } = parseSubtopicItem(item, i);
      const prefix = teamNameForHover ? `${teamNameForHover} — ` : '';
      const displayTitle = `${prefix}${title}`;
      out.push({
        key: `${status}-${id}-${out.length}`,
        status,
        title: displayTitle,
        hover: `${displayTitle} (${statusLabelTh(status)})`,
      });
    });
  };
  push(buckets.RED, 'RED');
  push(buckets.YELLOW, 'YELLOW');
  push(buckets.GREEN, 'GREEN');
  return out;
}

type EaBlockTip = {
  key: string;
  top: number;
  left: number;
  title: string;
  status: 'RED' | 'YELLOW' | 'GREEN';
};

function StatusBlocksGrid({ blocks, compact }: { blocks: StoredSubtopicBlock[]; compact?: boolean }) {
  const [activeTip, setActiveTip] = useState<EaBlockTip | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!activeTip) return;
    const clear = () => setActiveTip(null);
    window.addEventListener('scroll', clear, true);
    return () => window.removeEventListener('scroll', clear, true);
  }, [activeTip]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onFocusOut = (e: FocusEvent) => {
      const rel = e.relatedTarget as Node | null;
      if (rel && el.contains(rel)) return;
      setActiveTip(null);
    };
    el.addEventListener('focusout', onFocusOut);
    return () => el.removeEventListener('focusout', onFocusOut);
  }, []);

  if (blocks.length === 0) return null;
  const size = compact ? 'size-[8px]' : 'size-[10px]';
  const maxW = compact ? 'max-w-[4.5rem]' : 'max-w-[7.5rem]';

  const showTip = (b: StoredSubtopicBlock, el: HTMLElement) => {
    const { top, left } = eaClampedTooltipAnchor(el);
    setActiveTip({
      key: b.key,
      top,
      left,
      title: b.title,
      status: b.status,
    });
  };

  const baseBlock =
    'shrink-0 cursor-default rounded-none border border-[var(--color-border)] transition-[transform,box-shadow] duration-150 ease-out hover:z-20 hover:scale-[1.35] hover:shadow-md hover:ring-2 hover:ring-[var(--color-primary)] hover:ring-offset-1 hover:ring-offset-[var(--color-page)] focus-visible:z-20 focus-visible:scale-[1.35] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--color-page)]';

  const activeRing =
    'z-20 scale-[1.35] shadow-md ring-2 ring-[var(--color-primary)] ring-offset-1 ring-offset-[var(--color-page)]';

  return (
    <>
      <div
        ref={wrapRef}
        className={`flex w-full ${maxW} flex-wrap justify-center gap-px`}
        onMouseLeave={(e) => {
          const rel = e.relatedTarget as Node | null;
          if (rel && e.currentTarget.contains(rel)) return;
          setActiveTip(null);
        }}
      >
        {blocks.map((b) => (
          <span
            key={b.key}
            role="img"
            aria-label={b.hover}
            title={b.hover}
            tabIndex={0}
            className={`${size} ${baseBlock} ${
              b.status === 'RED'
                ? 'bg-red-500'
                : b.status === 'YELLOW'
                  ? 'bg-amber-500'
                  : 'bg-emerald-500'
            } ${activeTip?.key === b.key ? activeRing : ''}`}
            onMouseEnter={(e) => showTip(b, e.currentTarget)}
            onFocus={(e) => showTip(b, e.currentTarget)}
          />
        ))}
      </div>
      <EaTooltipPortal anchor={activeTip ? { top: activeTip.top, left: activeTip.left } : null}>
        {activeTip ? (
          <>
            <p className="text-xs font-semibold leading-snug text-[var(--color-text)] [overflow-wrap:anywhere]">
              {activeTip.title}
            </p>
            <p
              className={`mt-1.5 text-[10px] font-semibold tracking-wide ${
                activeTip.status === 'RED'
                  ? 'text-red-600 dark:text-red-400'
                  : activeTip.status === 'YELLOW'
                    ? 'text-amber-700 dark:text-amber-300'
                    : 'text-emerald-700 dark:text-emerald-300'
              }`}
            >
              สถานะ · {statusLabelTh(activeTip.status)}
            </p>
          </>
        ) : null}
      </EaTooltipPortal>
    </>
  );
}

function rollupStatusTipClass(rollup: Exclude<SummaryRollup, 'empty'>): string {
  if (rollup === 'RED') return 'text-red-600 dark:text-red-400';
  if (rollup === 'YELLOW') return 'text-amber-700 dark:text-amber-300';
  return 'text-emerald-700 dark:text-emerald-300';
}

/** โทนเดียวกับ StatusBadge compact บนหน้าโปรเจกต์ */
function summaryRollupChipPillClass(rollup: Exclude<SummaryRollup, 'empty'>): string {
  if (rollup === 'RED') return 'bg-red-500/10 text-red-600 dark:text-red-400';
  if (rollup === 'YELLOW') return 'bg-amber-500/10 text-amber-600 dark:text-amber-400';
  return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400';
}

/** ไอคอนสรุปภาพรวม (🔴🟡🟢) — chip มุมโค้งคล้าย Status บนหน้าโปรเจกต์ + tooltip */
function SummaryRollupWithTip({
  rollup,
  totals,
  contextLine,
  compact,
}: {
  rollup: Exclude<SummaryRollup, 'empty'>;
  totals: { RED: number; YELLOW: number; GREEN: number };
  contextLine: string;
  compact?: boolean;
}) {
  const [tipAnchor, setTipAnchor] = useState<EaTooltipAnchor | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!tipAnchor) return;
    const clear = () => setTipAnchor(null);
    window.addEventListener('scroll', clear, true);
    return () => window.removeEventListener('scroll', clear, true);
  }, [tipAnchor]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onFocusOut = (e: FocusEvent) => {
      const rel = e.relatedTarget as Node | null;
      if (rel && el.contains(rel)) return;
      setTipAnchor(null);
    };
    el.addEventListener('focusout', onFocusOut);
    return () => el.removeEventListener('focusout', onFocusOut);
  }, []);

  const chipBase =
    'inline-flex shrink-0 cursor-default items-center justify-center rounded px-1.5 py-0.5 font-medium leading-none outline-none transition-[transform,box-shadow] duration-150 ease-out hover:z-20 hover:scale-105 hover:ring-2 hover:ring-[var(--color-primary)]/35 hover:ring-offset-1 hover:ring-offset-[var(--color-page)] focus-visible:z-20 focus-visible:scale-105 focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--color-page)]';
  const chipSize = compact
    ? 'min-h-[1.125rem] min-w-[1.25rem] text-[9px]'
    : 'min-h-[1.25rem] min-w-[1.25rem] text-sm';
  const chipActive =
    'z-20 scale-105 shadow-sm ring-2 ring-[var(--color-primary)] ring-offset-1 ring-offset-[var(--color-page)]';

  return (
    <>
      <div
        ref={wrapRef}
        className={`flex items-center justify-center ${compact ? 'min-h-4' : 'min-h-[1.35rem]'}`}
        onMouseLeave={(e) => {
          const rel = e.relatedTarget as Node | null;
          if (rel && e.currentTarget.contains(rel)) return;
          setTipAnchor(null);
        }}
      >
        <span
          role="img"
          aria-label={historyModeTooltip(contextLine, totals)}
          tabIndex={0}
          className={`${chipBase} ${chipSize} ${summaryRollupChipPillClass(rollup)} ${tipAnchor ? chipActive : ''}`}
          onMouseEnter={(e) => setTipAnchor(eaClampedTooltipAnchor(e.currentTarget))}
          onFocus={(e) => setTipAnchor(eaClampedTooltipAnchor(e.currentTarget))}
        >
          {SUMMARY_VIEW_EMOJI[rollup]}
        </span>
      </div>
      <EaTooltipPortal anchor={tipAnchor}>
        <p className="whitespace-pre-line text-[10px] leading-snug text-[var(--color-text-muted)]">{contextLine}</p>
        <p className="mt-2 text-xs font-semibold leading-snug text-[var(--color-text)]">{summaryRollupTitleTh(rollup)}</p>
        <p className={`mt-1 text-[10px] font-semibold tracking-wide ${rollupStatusTipClass(rollup)}`}>
          {SUMMARY_VIEW_HEADLINE[rollup]} · Summary View
        </p>
        <p className="mt-2 text-[11px] leading-snug text-[var(--color-text)]">{teamHealthSummaryTh(totals)}</p>
        <p className="mt-2 text-[10px] leading-relaxed text-[var(--color-text-subtle)]">
          ไอคอนนี้สะท้อนสถานะหนักสุดในช่อง: แดง {'>'} เหลือง {'>'} เขียว (เหมือนสรุปใน Summary View)
        </p>
      </EaTooltipPortal>
    </>
  );
}

function HistoryModeCellBlock({
  blocks,
  totals,
  contextLine,
  compact,
}: {
  blocks: StoredSubtopicBlock[];
  totals: { RED: number; YELLOW: number; GREEN: number };
  contextLine: string;
  compact?: boolean;
}) {
  const rollup = summaryRollupFromSubtopicCounts(totals);
  const gap = compact ? 'gap-1' : 'gap-1.5';
  const maxW = compact ? 'max-w-[4.5rem]' : 'max-w-[7.5rem]';
  const emptyCls = compact
    ? 'min-h-[1rem] text-[10px]'
    : 'min-h-[1.25rem] text-xs';

  return (
    <div
      className={`mx-auto flex w-full ${maxW} flex-col items-center ${gap}`}
      role="group"
      aria-label={historyModeTooltip(contextLine, totals)}
    >
      {rollup === 'empty' ? (
        <span
          className={`text-center font-medium tabular-nums leading-none text-[var(--color-text-subtle)] ${emptyCls}`}
          aria-label="ไม่มีข้อมูล"
          title="ไม่มีข้อมูล"
        >
          –
        </span>
      ) : (
        <>
          <SummaryRollupWithTip rollup={rollup} totals={totals} contextLine={contextLine} compact={compact} />
          <StatusBlocksGrid blocks={blocks} compact={compact} />
        </>
      )}
    </div>
  );
}

export type EaTeamOrderEntry = { id: string; name: string };

type Props = {
  projectId: string | null | undefined;
  refreshKey?: number;
  /** ทีมตามลำดับโปรเจกต์ (id + ชื่อปัจจุบัน) — แถวใช้ id เป็นคีย์ แสดงชื่อล่าสุด */
  teamOrder?: readonly EaTeamOrderEntry[];
  /** subtopic_id → team_id — รวม snapshot ที่คีย์เป็นชื่อเก่า/ทีมเดียวกันเข้าแถวเดียว */
  subtopicToTeamId?: ReadonlyMap<string, string> | Record<string, string>;
};

function labelForTeamRow(rowKey: string, teamOrder: readonly EaTeamOrderEntry[] | undefined): string {
  const hit = teamOrder?.find((t) => t.id === rowKey);
  return hit?.name ?? rowKey;
}

/**
 * ลำดับแถว: คีย์เป็น team id เมื่อมี teamOrder
 * - มี subtopic map: เฉพาะทีมในโปรเจกต์ (ไม่แยกแถวซ้ำจากชื่อเก่า)
 * - ไม่มี map: ต่อท้ายด้วยคีย์ใน snapshot ที่ไม่ใช่ id/ชื่อของทีมในโปรเจกต์
 */
function teamRowKeysSorted(
  snapshots: EaHistorySnapshot[],
  teamOrder: readonly EaTeamOrderEntry[] | undefined,
  subtopicToTeam?: Map<string, string>,
): string[] {
  const set = new Set<string>();
  for (const s of snapshots) {
    for (const name of Object.keys(s.teams ?? {})) {
      if (name) set.add(name);
    }
  }
  if (!teamOrder?.length) {
    return [...set].sort((a, b) => a.localeCompare(b, 'th'));
  }
  const inOrder: string[] = [];
  const seen = new Set<string>();
  for (const t of teamOrder) {
    if (!t.id || seen.has(t.id)) continue;
    seen.add(t.id);
    inOrder.push(t.id);
  }
  if (subtopicToTeam?.size) {
    return inOrder;
  }
  const idSet = new Set(teamOrder.map((t) => t.id));
  const nameSet = new Set(teamOrder.map((t) => t.name));
  const extras: string[] = [];
  for (const k of set) {
    if (idSet.has(k) || nameSet.has(k)) continue;
    extras.push(k);
  }
  extras.sort((a, b) => a.localeCompare(b, 'th'));
  return [...inOrder, ...extras];
}

function toSubtopicTeamMap(
  raw: ReadonlyMap<string, string> | Record<string, string> | undefined,
): Map<string, string> | undefined {
  if (!raw) return undefined;
  if (raw instanceof Map) return raw.size ? raw : undefined;
  const e = Object.entries(raw);
  return e.length ? new Map(e) : undefined;
}

export function EaWeeklyTrendPanel({ projectId, refreshKey = 0, teamOrder, subtopicToTeamId }: Props) {
  const [snapshots, setSnapshots] = useState<EaHistorySnapshot[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);

  const [eaSnapshotModalOpen, setEaSnapshotModalOpen] = useState(false);
  const [eaSnapshotWeeks, setEaSnapshotWeeks] = useState<
    { week_no: number; label: string; start: string; end: string }[]
  >([]);
  const [eaSnapshotWeekNo, setEaSnapshotWeekNo] = useState<number | ''>('');
  const [eaSnapshotLoadingWeeks, setEaSnapshotLoadingWeeks] = useState(false);
  const [eaSnapshotSaving, setEaSnapshotSaving] = useState(false);
  const [eaSnapshotMsg, setEaSnapshotMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [eaWeeksDraft, setEaWeeksDraft] = useState<
    { week_no: number; label: string; start: string; end: string }[]
  >([]);
  const [eaWeeksRevision, setEaWeeksRevision] = useState(0);
  const [eaWeeksUpdatedAt, setEaWeeksUpdatedAt] = useState<string | null>(null);
  const [eaWeeksSaving, setEaWeeksSaving] = useState(false);
  const [timelineWeekSpan, setTimelineWeekSpan] = useState<EaTimelineWeekSpan>(13);

  useEffect(() => {
    const p = projectId?.trim();
    if (!p || typeof window === 'undefined') return;
    try {
      const stored = parseStoredTimelineSpan(localStorage.getItem(timelineSpanStorageKey(p)));
      if (stored !== null) setTimelineWeekSpan(stored);
    } catch {
      /* ignore */
    }
  }, [projectId]);

  const persistTimelineWeekSpan = (v: EaTimelineWeekSpan) => {
    setTimelineWeekSpan(v);
    const p = projectId?.trim();
    if (!p || typeof window === 'undefined') return;
    try {
      localStorage.setItem(timelineSpanStorageKey(p), String(v));
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    if (!projectId?.trim()) {
      setSnapshots(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/ea/${encodeURIComponent(projectId)}/history`, {
      headers: eaApiHeaders(),
      credentials: 'include',
    })
      .then(async (res) => {
        const data = (await res.json()) as {
          ok?: boolean;
          snapshots?: EaHistorySnapshot[];
          total_files?: number;
          display_mode?: string;
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok || data.ok === false) {
          setError(data.error ?? `HTTP ${res.status}`);
          setSnapshots([]);
          return;
        }
        setSnapshots(Array.isArray(data.snapshots) ? data.snapshots : []);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(String(e));
          setSnapshots([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, refreshKey, historyRefreshKey]);

  useEffect(() => {
    const pid = projectId?.trim();
    if (!eaSnapshotModalOpen || !pid) return;
    setEaSnapshotMsg(null);
    setEaSnapshotLoadingWeeks(true);
    setEaSnapshotWeekNo('');
    setEaSnapshotWeeks([]);
    setEaWeeksDraft([]);
    setEaWeeksRevision(0);
    setEaWeeksUpdatedAt(null);
    let cancelled = false;
    fetch(`/api/ea/${encodeURIComponent(pid)}/weeks`, {
      headers: eaApiHeaders(),
      credentials: 'include',
    })
      .then(async (res) => {
        const data = (await res.json()) as {
          weeks?: unknown[];
          weeks_revision?: number;
          updated_at?: string;
          ok?: boolean;
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok || data.ok === false) {
          setEaSnapshotMsg({ type: 'err', text: data.error ?? `HTTP ${res.status}` });
          return;
        }
        const raw = Array.isArray(data.weeks) ? data.weeks : [];
        const weeks = raw
          .filter((w): w is Record<string, unknown> => !!w && typeof w === 'object')
          .map((w) => ({
            week_no: Number(w.week_no),
            label: String(w.label ?? ''),
            start: String(w.start ?? ''),
            end: String(w.end ?? ''),
          }))
          .filter((w) => Number.isInteger(w.week_no) && w.week_no >= 1)
          .sort((a, b) => a.week_no - b.week_no);
        setEaSnapshotWeeks(weeks);
        setEaWeeksRevision(typeof data.weeks_revision === 'number' ? data.weeks_revision : 0);
        setEaWeeksUpdatedAt(typeof data.updated_at === 'string' ? data.updated_at : null);
        setEaWeeksDraft(
          weeks.length > 0
            ? weeks.map((w) => ({ ...w }))
            : [{ week_no: 1, label: 'W1', ...getCalendarWeekMondayToSunday() }],
        );
        if (weeks.length) setEaSnapshotWeekNo(weeks[weeks.length - 1].week_no);
      })
      .catch(() => {
        if (!cancelled) setEaSnapshotMsg({ type: 'err', text: 'โหลดรายการ week ไม่สำเร็จ' });
      })
      .finally(() => {
        if (!cancelled) setEaSnapshotLoadingWeeks(false);
      });
    return () => {
      cancelled = true;
    };
  }, [eaSnapshotModalOpen, projectId]);

  const subtopicTeamMap = useMemo(() => toSubtopicTeamMap(subtopicToTeamId), [subtopicToTeamId]);

  const teamRowKeys = useMemo(
    () => (snapshots?.length ? teamRowKeysSorted(snapshots, teamOrder, subtopicTeamMap) : []),
    [snapshots, teamOrder, subtopicTeamMap],
  );

  const allWeekColumns = useMemo(() => {
    if (!snapshots?.length) return [];
    return snapshots.map((s) => {
      const label = s.week_label || `W${s.week_no}`;
      const range = formatWeekRange(s.week_start, s.week_end);
      const titleLine = `${label}${range ? ` · ${range}` : ''} · snapshot ${s.ts}`;
      return {
        key: `${s.week_no}-${s.ts}`,
        label,
        range,
        titleLine,
        snapshot: s,
      };
    });
  }, [snapshots]);

  const displayWeekColumns = useMemo(() => {
    if (!allWeekColumns.length) return [];
    if (timelineWeekSpan === 'all') return allWeekColumns;
    return allWeekColumns.slice(-timelineWeekSpan);
  }, [allWeekColumns, timelineWeekSpan]);

  const timelineCompact = displayWeekColumns.length >= TIMELINE_COMPACT_AT_COLUMNS;

  const monthHeaderSegments = useMemo(
    () => buildEaMonthHeaderSegments(displayWeekColumns, timelineCompact),
    [displayWeekColumns, timelineCompact],
  );

  /** แต่ละคอลัมน์สัปดาห์อยู่แถบเดือนที่ k — ใช้สลับสีเข้ม/อ่อนให้ตรงกับหัวเดือน */
  const weekColumnMonthStripeIndex = useMemo(() => {
    const n = displayWeekColumns.length;
    const out: number[] = new Array(n);
    let seg = 0;
    let countInSeg = 0;
    for (let i = 0; i < n; i++) {
      out[i] = seg;
      countInSeg++;
      const span = monthHeaderSegments[seg]?.colSpan ?? 1;
      if (countInSeg >= span) {
        seg++;
        countInSeg = 0;
      }
    }
    return out;
  }, [displayWeekColumns, monthHeaderSegments]);

  const pid = projectId?.trim() ?? '';

  const saveEaWeeksDraft = async () => {
    if (!pid) return;
    const dateRe = /^\d{4}-\d{2}-\d{2}$/;
    const cleaned = eaWeeksDraft
      .map((row, i) => ({
        week_no: Number(row.week_no) > 0 ? Number(row.week_no) : i + 1,
        label: row.label.trim(),
        start: row.start.trim(),
        end: row.end.trim(),
      }))
      .filter((row) => row.label && row.start && row.end);
    if (cleaned.length === 0) {
      setEaSnapshotMsg({
        type: 'err',
        text: 'กรอกอย่างน้อยหนึ่งสัปดาห์ (label, start, end เป็น YYYY-MM-DD)',
      });
      return;
    }
    const seen = new Set<number>();
    for (const row of cleaned) {
      if (seen.has(row.week_no)) {
        setEaSnapshotMsg({ type: 'err', text: `week_no ซ้ำ: ${row.week_no}` });
        return;
      }
      seen.add(row.week_no);
      if (!dateRe.test(row.start) || !dateRe.test(row.end)) {
        setEaSnapshotMsg({ type: 'err', text: 'วันที่ต้องเป็นรูปแบบ YYYY-MM-DD' });
        return;
      }
    }
    cleaned.sort((a, b) => a.week_no - b.week_no);
    setEaWeeksSaving(true);
    setEaSnapshotMsg(null);
    try {
      const res = await fetch(`/api/ea/${encodeURIComponent(pid)}/weeks`, {
        method: 'PUT',
        headers: { ...eaApiHeaders(), 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ weeks: cleaned }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        weeks?: typeof cleaned;
        weeks_revision?: number;
        updated_at?: string;
        error?: string;
      };
      if (!res.ok || data.ok === false) {
        setEaSnapshotMsg({ type: 'err', text: data.error ?? `HTTP ${res.status}` });
        return;
      }
      const wks = Array.isArray(data.weeks) ? data.weeks : cleaned;
      setEaSnapshotWeeks(wks);
      setEaWeeksDraft(wks.map((x) => ({ week_no: x.week_no, label: x.label, start: x.start, end: x.end })));
      const rev = typeof data.weeks_revision === 'number' ? data.weeks_revision : eaWeeksRevision + 1;
      setEaWeeksRevision(rev);
      setEaWeeksUpdatedAt(typeof data.updated_at === 'string' ? data.updated_at : null);
      if (wks.length) setEaSnapshotWeekNo(wks[wks.length - 1].week_no);
      setEaSnapshotMsg({
        type: 'ok',
        text: `บันทึกกำหนดสัปดาห์แล้ว — revision ${rev}`,
      });
    } catch (e) {
      setEaSnapshotMsg({ type: 'err', text: String(e) });
    } finally {
      setEaWeeksSaving(false);
    }
  };

  const saveEaSnapshotFromModal = async () => {
    if (!pid) return;
    if (eaSnapshotWeekNo === '' || typeof eaSnapshotWeekNo !== 'number') {
      setEaSnapshotMsg({ type: 'err', text: 'เลือกสัปดาห์ก่อนบันทึก' });
      return;
    }
    setEaSnapshotSaving(true);
    setEaSnapshotMsg(null);
    try {
      const res = await fetch(`/api/ea/${encodeURIComponent(pid)}/snapshot`, {
        method: 'POST',
        headers: { ...eaApiHeaders(), 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ week_no: eaSnapshotWeekNo }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || data.ok === false) {
        setEaSnapshotMsg({ type: 'err', text: data.error ?? `HTTP ${res.status}` });
        return;
      }
      setEaSnapshotMsg({ type: 'ok', text: 'บันทึก snapshot บนคลาวด์แล้ว — ตารางด้านล่างจะอัปเดต' });
      setHistoryRefreshKey((k) => k + 1);
      window.setTimeout(() => {
        setEaSnapshotModalOpen(false);
        setEaSnapshotMsg(null);
      }, 900);
    } catch (e) {
      setEaSnapshotMsg({ type: 'err', text: String(e) });
    } finally {
      setEaSnapshotSaving(false);
    }
  };

  if (!projectId?.trim()) return null;

  const stickyCell =
    'sticky left-0 z-10 border-r border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-left shadow-[4px_0_12px_-4px_rgba(0,0,0,0.12)] dark:shadow-[4px_0_12px_-4px_rgba(0,0,0,0.35)]';

  const timelineSectionBlurb =
    'แต่ละแถวเป็นหนึ่งทีม · แต่ละช่อง: สัญลักษณ์ภาพรวม + สี่เหลี่ยมชิดกันต่อหัวข้อย่อย (ลำดับแดง→เหลือง→เขียวใน snapshot) · เลือกช่วงสัปดาห์ล่าสุดได้เมื่อมีข้อมูลยาวหลายเดือน · ชี้หัวคอลัมน์/สี่เหลี่ยมเพื่อรายละเอียด';

  return (
    <div className="relative mb-6 rounded-lg border border-[var(--color-border)]/80 bg-[var(--color-surface)] p-3 sm:p-4">
      <button
        type="button"
        onClick={() => setEaSnapshotModalOpen(true)}
        className="absolute right-2.5 top-2.5 z-10 inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-[var(--color-text-subtle)] transition-colors hover:bg-[var(--color-overlay)] hover:text-[var(--color-text)] sm:right-3 sm:top-3 sm:px-2.5 sm:py-1.5 sm:text-xs"
        title="บันทึกสรุป EA รายสัปดาห์ขึ้นคลาวด์ (ต้องกำหนด week ไว้ก่อน)"
      >
        <Camera className="h-3.5 w-3.5 shrink-0 opacity-80 sm:h-4 sm:w-4" />
        สรุป EA
      </button>
      <div className="min-w-0 pr-[5.75rem] sm:pr-24">
        <div className="flex items-start gap-2 min-w-0">
          <LineChart className="mt-px h-4 w-4 shrink-0 text-[var(--color-text-subtle)]" aria-hidden />
          <div className="min-w-0">
            <h2
              className="text-xs font-medium tracking-tight text-[var(--color-text)] sm:text-sm"
              title={timelineSectionBlurb}
            >
              Timeline EA · รายทีม
            </h2>
            <p className="mt-0.5 text-[11px] leading-snug text-[var(--color-text-subtle)] sm:text-xs">
              History · hover หัวคอลัมน์และจุดสีเพื่อรายละเอียด
            </p>
          </div>
        </div>
      </div>

      <p className="mt-2 text-[10px] leading-relaxed text-[var(--color-text-subtle)] sm:text-[11px]">
        <span aria-hidden>🔴</span> แดง · <span aria-hidden>🟡</span> เหลือง · <span aria-hidden>🟢</span> เขียว — ภาพรวมช่องตาม Summary View
      </p>

      {loading && <p className="mt-4 text-sm text-[var(--color-text-muted)]">กำลังโหลดประวัติ EA…</p>}
      {error && !loading && (
        <p className="mt-4 text-sm text-amber-700 dark:text-amber-300">
          ยังโหลดประวัติไม่ได้: {error} — ลองซิงค์คลาวด์หรือกำหนดสัปดาห์จากปุ่ม &quot;สรุป EA&quot; ในการ์ดนี้
        </p>
      )}
      {!loading && !error && allWeekColumns.length === 0 && (
        <p className="mt-4 text-sm text-[var(--color-text-muted)]">
          ยังไม่มี snapshot รายสัปดาห์ — กำหนดสัปดาห์และบันทึก snapshot จากปุ่ม &quot;สรุป EA&quot; มุมขวาบนการ์ดนี้
        </p>
      )}
      {!loading && !error && allWeekColumns.length > 0 && (
        <div className="mt-4 flex flex-col gap-0 overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]/50 shadow-[inset_0_1px_0_0_var(--color-border)] dark:bg-[var(--color-page)]/40 dark:shadow-[inset_0_1px_0_0_var(--color-border-strong)]">
          <div className="flex flex-col gap-2 rounded-t-[inherit] border-b border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between dark:bg-[var(--color-surface-elevated)]/85">
            <label className="flex flex-wrap items-center gap-2 text-xs text-[var(--color-text)]">
              <span className="shrink-0 font-medium text-[var(--color-text-muted)]">ช่วงที่แสดง</span>
              <select
                value={String(timelineWeekSpan)}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === 'all') persistTimelineWeekSpan('all');
                  else persistTimelineWeekSpan(Number(v) as 8 | 13 | 26 | 52);
                }}
                className="max-w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-page)] px-2 py-1.5 text-xs text-[var(--color-text)] transition-colors dark:bg-[var(--color-surface)]"
              >
                {TIMELINE_SPAN_OPTIONS.map((o) => (
                  <option key={String(o.value)} value={String(o.value)}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <p className="text-[11px] leading-snug text-[var(--color-text-muted)]">
              แสดง{' '}
              <span className="font-medium tabular-nums text-[var(--color-text)]">{displayWeekColumns.length}</span>
              {' / '}
              <span className="tabular-nums">{allWeekColumns.length}</span> สัปดาห์
              {timelineWeekSpan !== 'all' && allWeekColumns.length > displayWeekColumns.length
                ? ' · โฟกัสช่วงล่าสุด (เลือก “ทั้งหมด” เมื่อต้องการเห็นย้อนหลังเต็ม)'
                : null}
              {timelineCompact ? ' · มุมมองแคบอัตโนมัติ' : null}
              {' · เลื่อนแนวตั้ง/แนวนอน'}
            </p>
          </div>
          <div className="ea-timeline-scroll max-h-[min(70vh,560px)] min-h-0 overflow-auto overscroll-contain">
            <table className="w-max min-w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)]">
                  <th
                    rowSpan={2}
                    className="sticky left-0 top-0 z-[32] w-[min(28vw,11rem)] max-w-[11rem] border-r border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-left align-middle text-xs font-semibold text-[var(--color-text-muted)] shadow-[4px_0_12px_-4px_rgba(0,0,0,0.08)] dark:bg-[var(--color-surface)] dark:shadow-[4px_0_12px_-4px_rgba(0,0,0,0.45)]"
                  >
                    ทีม / สัปดาห์
                  </th>
                  {monthHeaderSegments.map((seg, monthIdx) => {
                    const stripeEven = monthIdx % 2 === 0;
                    return (
                      <th
                        key={seg.key}
                        colSpan={seg.colSpan}
                        scope="colgroup"
                        className={`box-border border-b border-r border-[var(--color-border)] text-center align-middle font-semibold tracking-wide text-[var(--color-text-muted)] ${
                          stripeEven
                            ? 'bg-[var(--color-primary-muted)] dark:bg-[var(--color-surface-elevated)]'
                            : 'bg-[var(--color-page)] dark:bg-[var(--color-surface)]'
                        } ${
                          timelineCompact
                            ? 'min-h-[1.75rem] px-0.5 py-1 text-[9px] leading-tight'
                            : 'min-h-10 px-2 py-1.5 text-[10px] leading-snug'
                        }`}
                      >
                        {seg.label}
                      </th>
                    );
                  })}
                </tr>
                <tr className="border-b border-[var(--color-border)]">
                  {displayWeekColumns.map((col, colIdx) => {
                    const stripeEven = (weekColumnMonthStripeIndex[colIdx] ?? 0) % 2 === 0;
                    return (
                    <th
                      key={col.key}
                      title={weekColumnFullHeaderTitle(col)}
                      className={`box-border border-b border-r border-[var(--color-border)] text-center align-bottom font-normal ${
                        stripeEven
                          ? 'bg-[var(--color-primary-muted)]/55 dark:bg-[var(--color-surface-elevated)]'
                          : 'bg-[var(--color-surface)] dark:bg-[var(--color-surface)]'
                      } ${
                        timelineCompact
                          ? 'min-w-[3.25rem] max-w-[4rem] px-0.5 py-1.5'
                          : 'min-w-[7rem] max-w-[7.75rem] px-2 py-2'
                      }`}
                    >
                      <div
                        className={`flex flex-col items-center ${timelineCompact ? 'gap-0 pb-0' : 'gap-0.5 pb-1'}`}
                      >
                        <span
                          className={`font-semibold leading-tight text-[var(--color-text)] ${
                            timelineCompact ? 'text-[10px]' : 'text-xs'
                          }`}
                        >
                          {col.label}
                        </span>
                        {!timelineCompact && col.range ? (
                          <span className="text-[10px] leading-tight text-[var(--color-text-muted)]">{col.range}</span>
                        ) : null}
                      </div>
                    </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {teamRowKeys.map((rowKey) => {
                  const teamLabel = labelForTeamRow(rowKey, teamOrder);
                  return (
                    <tr key={rowKey} className="border-b border-[var(--color-border)] last:border-0">
                      <td
                        className={`${stickyCell} z-10 max-w-[11rem] truncate text-xs font-medium text-[var(--color-text)]`}
                        title={teamLabel}
                      >
                        {teamLabel}
                      </td>
                      {displayWeekColumns.map((col) => {
                        const merged = bucketsForTeamRow(col.snapshot, rowKey, teamLabel, subtopicTeamMap);
                        const t = teamTotalsFromBuckets(merged);
                        const contextLine = `${col.titleLine}\nทีม ${teamLabel}`;
                        const blocks = blocksFromTeamBuckets(merged, teamLabel);
                        return (
                          <td
                            key={`${rowKey}-${col.key}`}
                            className={`align-middle text-center ${
                              timelineCompact
                                ? 'min-w-[3.25rem] max-w-[4rem] px-0.5 py-1'
                                : 'min-w-[7rem] max-w-[7.75rem] px-2 py-2'
                            }`}
                          >
                            <HistoryModeCellBlock
                              blocks={blocks}
                              totals={t}
                              contextLine={contextLine}
                              compact={timelineCompact}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!loading && !error && allWeekColumns.length > 0 && teamRowKeys.length === 0 && (
        <p className="mt-2 text-xs text-[var(--color-text-muted)]">
          ยังไม่พบชื่อทีมใน snapshot — ตรวจสอบว่าโปรเจกต์มีทีมและหัวข้อในสำรองคลาวด์
        </p>
      )}

      {eaSnapshotModalOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 px-4 py-6"
          onClick={(e) =>
            e.target === e.currentTarget && !eaSnapshotSaving && !eaWeeksSaving && setEaSnapshotModalOpen(false)
          }
          role="presentation"
        >
          <div
            className="relative max-h-[min(90vh,720px)] w-full max-w-2xl overflow-y-auto rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-labelledby="ea-snapshot-modal-title"
          >
            <button
              type="button"
              onClick={() => !eaSnapshotSaving && !eaWeeksSaving && setEaSnapshotModalOpen(false)}
              className="absolute right-3 top-3 rounded-lg p-1.5 text-[var(--color-text-muted)] hover:bg-[var(--color-overlay)] hover:text-[var(--color-text)]"
              aria-label="ปิด"
            >
              <X className="h-5 w-5" />
            </button>
            <h2 id="ea-snapshot-modal-title" className="pr-10 text-lg font-semibold text-[var(--color-text)]">
              สรุป EA บนคลาวด์
            </h2>
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">
              กำหนดสัปดาห์บนคลาวด์ (แต่ละครั้งที่บันทึกจะเป็น revision ใหม่) แล้วเลือกสัปดาห์เพื่อ snapshot จากสำรองคลาวด์ — โปรเจกต์{' '}
              <code className="rounded bg-[var(--color-overlay)] px-1">{pid}</code>
            </p>

            {eaSnapshotLoadingWeeks ? (
              <p className="mt-4 text-sm text-[var(--color-text-muted)]">กำลังโหลดรายการ week…</p>
            ) : (
              <div className="mt-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="text-xs font-medium text-[var(--color-text-muted)]">กำหนดสัปดาห์ (คลาวด์)</span>
                    <p className="mt-0.5 text-[11px] text-[var(--color-text-subtle)]">
                      ช่วงวันที่: เลือกจากปฏิทิน — ค่าเริ่มต้นเป็นสัปดาห์ปัจจุบัน (จันทร์–อาทิตย์)
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--color-text-muted)]">
                    {eaWeeksRevision > 0 ? (
                      <span className="rounded-full border border-[var(--color-border)] bg-[var(--color-overlay)] px-2.5 py-0.5 font-medium text-[var(--color-text)]">
                        Revision {eaWeeksRevision}
                      </span>
                    ) : (
                      <span>ยังไม่เคยบันทึกกำหนดสัปดาห์</span>
                    )}
                    {eaWeeksUpdatedAt && (
                      <span className="text-[var(--color-text-subtle)]" title={eaWeeksUpdatedAt}>
                        อัปเดตล่าสุด {new Date(eaWeeksUpdatedAt).toLocaleString()}
                      </span>
                    )}
                  </div>
                </div>
                <div className="overflow-x-auto rounded-xl border border-[var(--color-border)]">
                  <table className="w-full min-w-[520px] border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b border-[var(--color-border)] bg-[var(--color-overlay)] text-xs text-[var(--color-text-muted)]">
                        <th className="px-2 py-2 font-medium">week</th>
                        <th className="px-2 py-2 font-medium">label</th>
                        <th className="px-2 py-2 font-medium">เริ่ม</th>
                        <th className="px-2 py-2 font-medium">สิ้นสุด</th>
                        <th className="w-10 px-1 py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {eaWeeksDraft.map((row, index) => (
                        <tr key={index} className="border-b border-[var(--color-border)] last:border-0">
                          <td className="p-1.5 align-middle">
                            <input
                              type="number"
                              min={1}
                              value={row.week_no > 0 ? row.week_no : ''}
                              onChange={(e) => {
                                const v = e.target.value;
                                setEaWeeksDraft((rows) =>
                                  rows.map((r, i) =>
                                    i === index ? { ...r, week_no: v === '' ? 0 : Number(v) } : r,
                                  ),
                                );
                              }}
                              className="w-14 rounded-lg border border-[var(--color-border)] bg-[var(--color-page)] px-2 py-1.5 text-sm text-[var(--color-text)]"
                            />
                          </td>
                          <td className="p-1.5 align-middle">
                            <input
                              type="text"
                              value={row.label}
                              onChange={(e) =>
                                setEaWeeksDraft((rows) =>
                                  rows.map((r, i) => (i === index ? { ...r, label: e.target.value } : r)),
                                )
                              }
                              className="w-full min-w-[4rem] rounded-lg border border-[var(--color-border)] bg-[var(--color-page)] px-2 py-1.5 text-sm text-[var(--color-text)]"
                              placeholder="W1"
                            />
                          </td>
                          <td className="p-1.5 align-middle">
                            <input
                              type="date"
                              value={row.start}
                              onChange={(e) =>
                                setEaWeeksDraft((rows) =>
                                  rows.map((r, i) => (i === index ? { ...r, start: e.target.value } : r)),
                                )
                              }
                              className="w-full min-w-[9.5rem] rounded-lg border border-[var(--color-border)] bg-[var(--color-page)] px-2 py-1.5 text-sm text-[var(--color-text)] [color-scheme:light] dark:[color-scheme:dark]"
                            />
                          </td>
                          <td className="p-1.5 align-middle">
                            <input
                              type="date"
                              value={row.end}
                              onChange={(e) =>
                                setEaWeeksDraft((rows) =>
                                  rows.map((r, i) => (i === index ? { ...r, end: e.target.value } : r)),
                                )
                              }
                              className="w-full min-w-[9.5rem] rounded-lg border border-[var(--color-border)] bg-[var(--color-page)] px-2 py-1.5 text-sm text-[var(--color-text)] [color-scheme:light] dark:[color-scheme:dark]"
                            />
                          </td>
                          <td className="p-1 align-middle text-center">
                            <button
                              type="button"
                              disabled={eaWeeksDraft.length <= 1}
                              onClick={() =>
                                setEaWeeksDraft((rows) => (rows.length <= 1 ? rows : rows.filter((_, i) => i !== index)))
                              }
                              className="rounded-lg p-1.5 text-[var(--color-text-muted)] hover:bg-[var(--color-overlay)] hover:text-red-600 disabled:opacity-30"
                              aria-label="ลบแถว"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={eaWeeksSaving || eaSnapshotLoadingWeeks}
                    onClick={() =>
                      setEaWeeksDraft((rows) => {
                        const maxNo = rows.reduce((m, r) => Math.max(m, Number(r.week_no) > 0 ? Number(r.week_no) : 0), 0);
                        const dateRe = /^\d{4}-\d{2}-\d{2}$/;
                        const last = rows[rows.length - 1];
                        let start = '';
                        let end = '';
                        if (last && dateRe.test(last.end)) {
                          const nextStart = addDaysFromYmd(last.end, 1);
                          const nextEnd = nextStart ? addDaysFromYmd(nextStart, 6) : null;
                          if (nextStart && nextEnd) {
                            start = nextStart;
                            end = nextEnd;
                          }
                        }
                        if (!start || !end) {
                          const w = getCalendarWeekMondayToSunday();
                          start = w.start;
                          end = w.end;
                        }
                        return [...rows, { week_no: maxNo + 1, label: `W${rows.length + 1}`, start, end }];
                      })
                    }
                    className="inline-flex items-center gap-1 rounded-xl border border-[var(--color-border)] px-3 py-2 text-xs font-medium text-[var(--color-text)] hover:bg-[var(--color-overlay)] disabled:opacity-50"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    เพิ่มสัปดาห์
                  </button>
                  <button
                    type="button"
                    disabled={eaWeeksSaving || eaSnapshotLoadingWeeks}
                    onClick={() => void saveEaWeeksDraft()}
                    className="rounded-xl bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
                  >
                    {eaWeeksSaving ? 'กำลังบันทึก…' : eaWeeksRevision > 0 ? 'บันทึก revision ใหม่' : 'บันทึกกำหนดสัปดาห์'}
                  </button>
                </div>

                <div className="border-t border-[var(--color-border)] pt-4">
                  <label htmlFor="ea-week-select" className="block text-xs font-medium text-[var(--color-text-muted)]">
                    เลือกสัปดาห์สำหรับ snapshot
                  </label>
                  <p className="mt-0.5 text-[11px] text-[var(--color-text-subtle)]">
                    ใช้เฉพาะสัปดาห์ที่บันทึกแล้วด้านบน — ตารางแสดง snapshot ล่าสุดต่อ week
                  </p>
                  {eaSnapshotWeeks.length === 0 ? (
                    <p className="mt-2 text-sm text-[var(--color-text-muted)]">
                      ยังไม่มี week ที่บันทึกบนคลาวด์ — กรอกตารางแล้วกดบันทึกกำหนดสัปดาห์ก่อน
                    </p>
                  ) : (
                    <select
                      id="ea-week-select"
                      value={eaSnapshotWeekNo === '' ? '' : String(eaSnapshotWeekNo)}
                      onChange={(e) => {
                        const v = e.target.value;
                        setEaSnapshotWeekNo(v === '' ? '' : Number(v));
                      }}
                      className="mt-1.5 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-page)] px-3 py-2.5 text-sm text-[var(--color-text)]"
                    >
                      {eaSnapshotWeeks.map((w) => (
                        <option key={w.week_no} value={w.week_no}>
                          {w.label} (week {w.week_no}) · {w.start} → {w.end}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>
            )}

            {eaSnapshotMsg && (
              <p
                className={`mt-3 text-sm ${eaSnapshotMsg.type === 'ok' ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-600 dark:text-red-400'}`}
              >
                {eaSnapshotMsg.text}
              </p>
            )}

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                disabled={eaSnapshotSaving || eaWeeksSaving}
                onClick={() => setEaSnapshotModalOpen(false)}
                className="rounded-xl border border-[var(--color-border)] px-4 py-2 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-overlay)] disabled:opacity-50"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                disabled={
                  eaSnapshotSaving ||
                  eaWeeksSaving ||
                  eaSnapshotLoadingWeeks ||
                  eaSnapshotWeeks.length === 0 ||
                  eaSnapshotWeekNo === ''
                }
                onClick={() => void saveEaSnapshotFromModal()}
                className="rounded-xl bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                {eaSnapshotSaving ? 'กำลังบันทึก…' : 'บันทึก snapshot'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
