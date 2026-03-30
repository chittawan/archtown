import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, LineChart, Plus, Trash2, X } from 'lucide-react';
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

function eaItemSubtopicId(item: unknown): string {
  if (item && typeof item === 'object' && 'subtopic_id' in item) {
    return String((item as { subtopic_id: unknown }).subtopic_id ?? '');
  }
  return '';
}

/** แยกงาน (detail) ไม่รวมหลายรายการใต้ subtopic เดียว; snapshot เก่าใช้ subtopic_id เท่านั้น */
function eaItemDedupeKey(item: unknown): string {
  if (item && typeof item === 'object') {
    const o = item as Record<string, unknown>;
    if (typeof o.detail_id === 'string' && o.detail_id.trim()) return `d:${o.detail_id}`;
    const st = typeof o.subtopic_id === 'string' ? o.subtopic_id : '';
    if (st) return `st:${st}`;
  }
  return '';
}

function pushUniqueEaItem(arr: unknown[], item: unknown) {
  const id = eaItemDedupeKey(item);
  if (!id) {
    arr.push(item);
    return;
  }
  if (arr.some((x) => eaItemDedupeKey(x) === id)) return;
  arr.push(item);
}

function mergeTeamBucketsInto(target: TeamBuckets, source: TeamBuckets) {
  for (const st of ['RED', 'YELLOW', 'GREEN'] as const) {
    for (const item of source[st] ?? []) {
      pushUniqueEaItem(target[st], item);
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
          const sid = eaItemSubtopicId(item);
          if (sid && subtopicToTeam.get(sid) === teamId) {
            pushUniqueEaItem(out[st], item);
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

/** แสดง topic_id ใน tooltip ให้อ่านง่าย — คง suffix ที่มนุษย์ตั้ง หรือย่อเมื่อยาว */
function simplifyTopicIdForTooltip(raw: string): string {
  const t = raw.trim();
  if (!t) return '';
  const m = /^top-\d+-([a-z0-9]+)$/i.exec(t);
  if (m) return m[1];
  if (t.length <= 16) return t;
  return `${t.slice(0, 5)}…${t.slice(-4)}`;
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
  if (sum === 0) return 'ไม่มีงานในช่วง snapshot นี้';
  if (RED > 0) return `มีประเด็นแดง ${RED} รายการ — เหลือง ${YELLOW} · เขียว ${GREEN}`;
  if (YELLOW > 0) return `เฝ้าระวัง (เหลือง) ${YELLOW} รายการ — เขียว ${GREEN}`;
  return `ราบรื่น — เขียว ${GREEN} รายการ`;
}

/** บรรทัดสรุปใต้ไอคอนภาพรวม — แยกคำว่า “หัวข้อย่อย” vs “รายการงาน” */
function teamCellBreakdownTh(
  totals: { RED: number; YELLOW: number; GREEN: number },
  bySubtopicStatus: boolean,
): string {
  const { RED, YELLOW, GREEN } = totals;
  const sum = RED + YELLOW + GREEN;
  if (sum === 0) {
    return bySubtopicStatus ? 'ไม่มีหัวข้อย่อยในช่วง snapshot นี้' : 'ไม่มีงานในช่วง snapshot นี้';
  }
  if (bySubtopicStatus) {
    if (RED > 0) return `สรุปสถานะหัวข้อย่อย: แดง ${RED} — เหลือง ${YELLOW} · เขียว ${GREEN}`;
    if (YELLOW > 0) return `สรุปสถานะหัวข้อย่อย: เหลือง ${YELLOW} — เขียว ${GREEN}`;
    return `สรุปสถานะหัวข้อย่อย: เขียว ${GREEN}`;
  }
  return teamHealthSummaryTh(totals);
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
  rollupExplicit?: SummaryRollup,
  subtopicBreakdown?: boolean,
): string {
  const rollup = rollupExplicit ?? summaryRollupFromSubtopicCounts(totals);
  const en =
    rollup === 'empty' ? 'No items' : `${SUMMARY_VIEW_HEADLINE[rollup as Exclude<SummaryRollup, 'empty'>]} (Summary View roll-up)`;
  return `${contextLine}\n${en}\n${teamCellBreakdownTh(totals, !!subtopicBreakdown)}`;
}

/** หัวข้อไทยสำหรับกล่องข้อมูล hover ของไอคอนสรุปภาพรวม (แดง / เหลือง / เขียว) */
function summaryRollupTitleTh(rollup: Exclude<SummaryRollup, 'empty'>): string {
  if (rollup === 'RED') return 'ภาพรวม: มีประเด็นแดง';
  if (rollup === 'YELLOW') return 'ภาพรวม: เฝ้าระวัง (เหลือง)';
  return 'ภาพรวม: ราบรื่น (เขียว)';
}

type EaTooltipAnchor = { top: number; left: number };

const EA_TOOLTIP_PANEL_BASE =
  'fixed z-[300] max-w-[min(18rem,calc(100vw-1.5rem))] rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-2 text-left shadow-[var(--shadow-modal)]';
const EA_TOOLTIP_PANEL_CLASS = `${EA_TOOLTIP_PANEL_BASE} pointer-events-none`;

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
  interactive,
}: {
  anchor: EaTooltipAnchor | null;
  children: React.ReactNode;
  /** true = เลือกข้อความได้ (คลิก pin บล็อก timeline) */
  interactive?: boolean;
}) {
  if (!anchor || typeof document === 'undefined') return null;
  return createPortal(
    <div
      data-ea-tooltip-portal
      {...(interactive ? { 'data-ea-block-tip-panel': '' } : {})}
      role={interactive ? 'dialog' : 'tooltip'}
      aria-label={interactive ? 'รายละเอียด topic — คลิกนอกกล่องหรือกด Esc เพื่อปิด' : undefined}
      className={
        interactive
          ? `${EA_TOOLTIP_PANEL_BASE} pointer-events-auto cursor-auto select-text`
          : EA_TOOLTIP_PANEL_CLASS
      }
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

type EaSubtopicRowTip = {
  title: string;
  /** null = snapshot ไม่มี subtopic_status สำหรับหัวข้อย่อยนี้ — ไม่ถือเป็นสีใดโดยปริยาย */
  rowStatus: 'RED' | 'YELLOW' | 'GREEN' | null;
};

type EaAttentionItemTip = {
  health: 'RED' | 'YELLOW';
  /** ชื่องาน / ข้อความ todo หลัก */
  taskTitle: string;
  /** health_note หรือรายละเอียดรอง */
  note: string;
};

/** สรุปสำหรับผู้บริหารในกล่อง hover/pin ของจุดสีราย topic */
type EaBlockManagerBrief = {
  /** จำนวนรายการตามสุขภาพงาน — ไอคอนเท่านั้น ไม่มีป้ายสี */
  healthInventory: string;
  /** อ่านสำหรับผู้ใช้ screen reader (มีคำว่า แดง/เหลือง/เขียว) */
  healthInventorySpoken: string;
  subtopicRows: EaSubtopicRowTip[];
  progress: {
    todo: number;
    doing: number;
    done: number;
    total: number;
    hasTaskStatus: boolean;
  };
  attentionItems: EaAttentionItemTip[];
  attentionEmpty: string | null;
  /** snapshot เก่า / ไม่มี topic ในข้อมูล */
  snapshotContextLine?: string;
};

/** หนึ่งบล็อก = หนึ่ง topic (รวมทุก subtopic ใต้ topic เดียวกัน); snapshot ไม่มี topic_id = หนึ่งบล็อกต่อหนึ่ง subtopic */
type StoredSubtopicBlock = {
  key: string;
  status: 'RED' | 'YELLOW' | 'GREEN';
  topicTitle: string;
  topicId: string;
  /** snapshot ไม่มี topic — บล็อกนี้คือหัวข้อย่อยเดี่ยว */
  orphanSubtopicTitle?: string;
  orphanSubtopicId?: string;
  /** บรรทัดเดียว — aria-label */
  hover: string;
  /** topic_id แบบย่อสำหรับ tooltip */
  topicIdShort: string;
  managerBrief: EaBlockManagerBrief;
};

function healthNoteFromEaItem(item: unknown): string {
  if (item && typeof item === 'object' && 'health_note' in item) {
    return String((item as { health_note: unknown }).health_note ?? '').trim();
  }
  return '';
}

function taskStatusFromEaItem(item: unknown): 'todo' | 'doing' | 'done' | null {
  if (item && typeof item === 'object' && 'task_status' in item) {
    const s = String((item as { task_status: unknown }).task_status).trim();
    if (s === 'todo' || s === 'doing' || s === 'done') return s;
  }
  return null;
}

function worstHealthFromDetailCounts(byHealth: {
  RED: number;
  YELLOW: number;
  GREEN: number;
}): 'RED' | 'YELLOW' | 'GREEN' {
  if (byHealth.RED > 0) return 'RED';
  if (byHealth.YELLOW > 0) return 'YELLOW';
  return 'GREEN';
}

/** สีบล็อก: สรุป project_sub_topics.status ต่อหัวข้อย่อย (ไม่ใช่สุขภาพงานรายการ) — จากฟิลด์ subtopic_status ใน snapshot */
function rollupSubtopicStatusesForBlock(
  subtopicIds: readonly string[],
  statusBySubId: Map<string, 'RED' | 'YELLOW' | 'GREEN'>,
): 'RED' | 'YELLOW' | 'GREEN' | null {
  if (!subtopicIds.length || !statusBySubId.size) return null;
  for (const id of subtopicIds) {
    if (!statusBySubId.has(id)) return null;
  }
  let hasYellow = false;
  for (const id of subtopicIds) {
    const s = statusBySubId.get(id)!;
    if (s === 'RED') return 'RED';
    if (s === 'YELLOW') hasYellow = true;
  }
  return hasYellow ? 'YELLOW' : 'GREEN';
}

function eaItemSubtopicRowStatus(item: unknown): 'RED' | 'YELLOW' | 'GREEN' | null {
  if (!item || typeof item !== 'object') return null;
  const s = (item as Record<string, unknown>).subtopic_status;
  if (s === 'RED' || s === 'YELLOW' || s === 'GREEN') return s;
  return null;
}

function collectUniqueSubtopicIdsFromBuckets(buckets: TeamBuckets | undefined): string[] {
  const set = new Set<string>();
  if (!buckets) return [];
  for (const col of ['RED', 'YELLOW', 'GREEN'] as const) {
    for (const item of buckets[col] ?? []) {
      const sid = eaItemSubtopicId(item);
      if (sid) set.add(sid);
    }
  }
  return [...set];
}

function subtopicRowStatusMapFromBuckets(buckets: TeamBuckets | undefined): Map<string, 'RED' | 'YELLOW' | 'GREEN'> {
  const m = new Map<string, 'RED' | 'YELLOW' | 'GREEN'>();
  if (!buckets) return m;
  for (const col of ['RED', 'YELLOW', 'GREEN'] as const) {
    for (const item of buckets[col] ?? []) {
      const sid = eaItemSubtopicId(item);
      const rs = eaItemSubtopicRowStatus(item);
      if (sid && rs) m.set(sid, rs);
    }
  }
  return m;
}

function histogramSubtopicRowStatus(
  subtopicIds: readonly string[],
  statusBySubId: Map<string, 'RED' | 'YELLOW' | 'GREEN'>,
): { RED: number; YELLOW: number; GREEN: number } {
  const out = { RED: 0, YELLOW: 0, GREEN: 0 };
  for (const id of subtopicIds) {
    const s = statusBySubId.get(id);
    if (s === 'RED') out.RED++;
    else if (s === 'YELLOW') out.YELLOW++;
    else if (s === 'GREEN') out.GREEN++;
  }
  return out;
}

/** ไอคอนภาพรวมช่อง: สรุปจากสถานะหัวข้อย่อย (subtopic_status) เมื่อ snapshot มีครบ — ไม่งั้นใช้จำนวนรายการตามสุขภาพงาน */
function teamCellSummaryRollupAndTotals(buckets: TeamBuckets | undefined): {
  rollup: SummaryRollup;
  totals: { RED: number; YELLOW: number; GREEN: number };
  usesSubtopicRowStatus: boolean;
} {
  const t = teamTotalsFromBuckets(buckets);
  const n = t.RED + t.YELLOW + t.GREEN;
  if (n === 0) return { rollup: 'empty', totals: t, usesSubtopicRowStatus: false };
  const ids = collectUniqueSubtopicIdsFromBuckets(buckets);
  const statusMap = subtopicRowStatusMapFromBuckets(buckets);
  const fromRow = rollupSubtopicStatusesForBlock(ids, statusMap);
  if (fromRow !== null) {
    return {
      rollup: fromRow,
      totals: histogramSubtopicRowStatus(ids, statusMap),
      usesSubtopicRowStatus: true,
    };
  }
  return {
    rollup: summaryRollupFromSubtopicCounts(t),
    totals: t,
    usesSubtopicRowStatus: false,
  };
}

function parseSubtopicItem(item: unknown, fallbackIdx: number): { id: string; title: string } {
  if (item && typeof item === 'object') {
    const o = item as Record<string, unknown>;
    const detailId = typeof o.detail_id === 'string' ? o.detail_id.trim() : '';
    const text = String(o.text ?? '').trim();
    const subTitle = String(o.subtopic_title ?? '').trim();
    const legacyTitle = String(o.title ?? '').trim();
    const id = detailId || String(o.subtopic_id ?? fallbackIdx);
    let title = text;
    if (text && subTitle) title = `${subTitle} — ${text}`;
    else if (!title) title = subTitle || legacyTitle || id;
    return { id, title };
  }
  return { id: String(fallbackIdx), title: `รายการ ${fallbackIdx}` };
}

function statusLabelTh(s: 'RED' | 'YELLOW' | 'GREEN'): string {
  return s === 'RED' ? 'แดง' : s === 'YELLOW' ? 'เหลือง' : 'เขียว';
}

/** สถานะสุขภาพงาน / สีบล็อก — แสดงใน UI โดยไม่ต้องมีคำว่า แดง/เหลือง/เขียว คู่กับไอคอน */
function statusHealthIcon(s: 'RED' | 'YELLOW' | 'GREEN'): string {
  return s === 'RED' ? '🔴' : s === 'YELLOW' ? '🟡' : '🟢';
}

/** `t:topicId` รวมทุก subtopic ใต้ topic · `s:subtopicId` = snapshot ไม่มี topic_id */
function eaItemTopicGroupKey(item: unknown): string | null {
  const sid = eaItemSubtopicId(item);
  if (!sid) return null;
  if (item && typeof item === 'object') {
    const tid = String((item as Record<string, unknown>).topic_id ?? '').trim();
    if (tid) return `t:${tid}`;
  }
  return `s:${sid}`;
}

function orderIndexOrLarge(order: readonly string[] | undefined, id: string): number {
  if (!order?.length || !id) return -1;
  const i = order.indexOf(id);
  return i;
}

/** ลำดับ topic ตามการเดินหัวข้อย่อยในโปรเจกต์ (ตรงกับ sort_order ใน DB เมื่อโหลดผ่าน getProject) */
function derivedTopicRankFromSubtopicOrder(
  topicId: string,
  subtopicOrder: readonly string[] | undefined,
  subtopicToTopicId: Map<string, string> | undefined,
): number {
  if (!topicId || !subtopicOrder?.length || !subtopicToTopicId?.size) return -1;
  for (let i = 0; i < subtopicOrder.length; i++) {
    if (subtopicToTopicId.get(subtopicOrder[i]) === topicId) return i;
  }
  return -1;
}

function toSubtopicToTopicMap(
  raw: ReadonlyMap<string, string> | Record<string, string> | undefined,
): Map<string, string> | undefined {
  if (!raw) return undefined;
  if (raw instanceof Map) return raw.size ? raw : undefined;
  const e = Object.entries(raw);
  return e.length ? new Map(e) : undefined;
}

function compareTimelineBlocksByDisplayOrder(
  a: {
    groupKey: string;
    topicId: string;
    topicTitle: string;
  },
  b: {
    groupKey: string;
    topicId: string;
    topicTitle: string;
  },
  projectTopicOrder: readonly string[] | undefined,
  projectSubtopicOrder: readonly string[] | undefined,
  subtopicToTopicId: Map<string, string> | undefined,
): number {
  const useExplicitTopic = !!projectTopicOrder?.length;
  const useDerivedTopic =
    !useExplicitTopic &&
    !!projectSubtopicOrder?.length &&
    !!subtopicToTopicId?.size;

  const rank = (x: typeof a): number => {
    if (x.groupKey.startsWith('s:')) {
      const sid = x.groupKey.slice(2);
      const j = orderIndexOrLarge(projectSubtopicOrder, sid);
      return j >= 0 ? 500_000 + j : 950_000;
    }
    const tid = x.topicId;
    if (useExplicitTopic) {
      const i = orderIndexOrLarge(projectTopicOrder, tid);
      return i >= 0 ? i : 800_000;
    }
    if (useDerivedTopic) {
      const d = derivedTopicRankFromSubtopicOrder(tid, projectSubtopicOrder, subtopicToTopicId);
      return d >= 0 ? d : 800_000;
    }
    return 800_000;
  };

  const ra = rank(a);
  const rb = rank(b);
  if (ra !== rb) return ra - rb;

  if (a.groupKey.startsWith('s:') && b.groupKey.startsWith('s:')) {
    return a.groupKey.localeCompare(b.groupKey, 'th');
  }
  const ta = a.topicTitle.trim() || a.topicId || a.groupKey;
  const tb = b.topicTitle.trim() || b.topicId || b.groupKey;
  const tc = ta.localeCompare(tb, 'th');
  if (tc !== 0) return tc;
  return a.groupKey.localeCompare(b.groupKey, 'th');
}

function buildSubtopicRowsForTip(
  titleBySubId: Map<string, string>,
  statusBySubId: Map<string, 'RED' | 'YELLOW' | 'GREEN'>,
  projectSubtopicOrder?: readonly string[] | null,
): EaSubtopicRowTip[] {
  if (titleBySubId.size === 0) return [];
  const ids = [...titleBySubId.keys()];
  ids.sort((a, b) => {
    const ia = orderIndexOrLarge(projectSubtopicOrder, a);
    const ib = orderIndexOrLarge(projectSubtopicOrder, b);
    const fa = ia >= 0 ? ia : 50_000;
    const fb = ib >= 0 ? ib : 50_000;
    if (fa !== fb) return fa - fb;
    return a.localeCompare(b, 'th');
  });
  return ids.map((id) => ({
    title: titleBySubId.get(id) || id,
    rowStatus: statusBySubId.has(id) ? (statusBySubId.get(id) ?? null) : null,
  }));
}

function blocksFromTeamBuckets(
  buckets: TeamBuckets | undefined,
  teamNameForHover: string | null,
  /** ลำดับ topic_id ตามโปรเจกต์ (= sort_order ใน DB) */
  projectTopicOrder?: readonly string[] | null,
  /** ลำดับ subtopic — เรียงบล็อกแบบ s:…, สรุปหัวข้อย่อยใต้ topic, และสำรองลำดับ topic */
  projectSubtopicOrder?: readonly string[] | null,
  /** subtopic_id → topic_id — ใช้สร้างลำดับ topic เมื่อไม่มี projectTopicOrder */
  subtopicToTopicId?: Map<string, string> | undefined,
): StoredSubtopicBlock[] {
  if (!buckets) return [];
  type RagTodoLine = { health: 'RED' | 'YELLOW'; taskTitle: string; note: string };
  type Agg = {
    groupKey: string;
    topicId: string;
    topicTitle: string;
    byHealth: { RED: number; YELLOW: number; GREEN: number };
    todo: number;
    doing: number;
    done: number;
    ragTodos: RagTodoLine[];
    subtopicTitles: Map<string, string>;
    /** subtopic_id → project_sub_topics.status (จาก snapshot) */
    subtopicRowStatus: Map<string, 'RED' | 'YELLOW' | 'GREEN'>;
  };
  const byGroup = new Map<string, Agg>();

  const bump = (item: unknown, healthBucket: 'RED' | 'YELLOW' | 'GREEN') => {
    const gk = eaItemTopicGroupKey(item);
    if (!gk) return;
    const sid = eaItemSubtopicId(item);
    let row = byGroup.get(gk);
    if (!row) {
      const o = item && typeof item === 'object' ? (item as Record<string, unknown>) : null;
      const st = o ? String(o.subtopic_title ?? '').trim() : '';
      const tid = o ? String(o.topic_id ?? '').trim() : '';
      const tt = o ? String(o.topic_title ?? '').trim() : '';
      row = {
        groupKey: gk,
        topicId: tid,
        topicTitle: gk.startsWith('s:') ? st || sid || '' : tt,
        byHealth: { RED: 0, YELLOW: 0, GREEN: 0 },
        todo: 0,
        doing: 0,
        done: 0,
        ragTodos: [],
        subtopicTitles: new Map(),
        subtopicRowStatus: new Map(),
      };
      byGroup.set(gk, row);
    }
    if (sid) {
      const o = item && typeof item === 'object' ? (item as Record<string, unknown>) : null;
      const st = o ? String(o.subtopic_title ?? '').trim() : '';
      row.subtopicTitles.set(sid, st || sid);
      const rowSt = eaItemSubtopicRowStatus(item);
      if (rowSt) row.subtopicRowStatus.set(sid, rowSt);
    }
    row.byHealth[healthBucket]++;
    const ts = taskStatusFromEaItem(item);
    if (ts === 'todo') row.todo++;
    else if (ts === 'doing') row.doing++;
    else if (ts === 'done') row.done++;
    if (healthBucket === 'RED' || healthBucket === 'YELLOW') {
      const tsItem = taskStatusFromEaItem(item);
      if (tsItem === 'todo') {
        // งานยังรอทำ — ไม่นำไปแสดงใน「ต้องจับตา」(ยังไม่ถือว่าเป็นประเด็นติดตาม)
      } else {
        const o = item && typeof item === 'object' ? (item as Record<string, unknown>) : null;
        const t = o ? String(o.text ?? '').trim() : '';
        const subTitle = o ? String(o.subtopic_title ?? '').trim() : '';
        const taskTitle =
          t && subTitle && t !== subTitle
            ? `${subTitle} · ${t}`
            : t || subTitle || '(ไม่มีชื่องาน)';
        row.ragTodos.push({
          health: healthBucket,
          taskTitle,
          note: healthNoteFromEaItem(item),
        });
      }
    }
    if (item && typeof item === 'object') {
      const o = item as Record<string, unknown>;
      const ttl = String(o.topic_title ?? '').trim();
      if (ttl) row.topicTitle = ttl;
      const tti = String(o.topic_id ?? '').trim();
      if (tti) row.topicId = tti;
    }
  };

  for (const st of ['RED', 'YELLOW', 'GREEN'] as const) {
    for (const item of buckets[st] ?? []) bump(item, st);
  }

  const rows = [...byGroup.values()].sort((a, b) =>
    compareTimelineBlocksByDisplayOrder(
      a,
      b,
      projectTopicOrder ?? undefined,
      projectSubtopicOrder ?? undefined,
      subtopicToTopicId,
    ),
  );

  return rows.map((r) => {
    const idsInCell = [...r.subtopicTitles.keys()];
    const fromSubtopicRow = rollupSubtopicStatusesForBlock(idsInCell, r.subtopicRowStatus);
    const worst = fromSubtopicRow ?? worstHealthFromDetailCounts(r.byHealth);
    const teamPrefix = teamNameForHover ? `${teamNameForHover} · ` : '';
    const isOrphan = r.groupKey.startsWith('s:');
    const orphanSid = isOrphan ? r.groupKey.slice(2) : '';
    const orphanTitle = isOrphan ? r.subtopicTitles.get(orphanSid) || orphanSid : '';

    const { RED, YELLOW, GREEN } = r.byHealth;
    const detailCount = RED + YELLOW + GREEN;
    const healthInventory = `${statusHealthIcon('RED')} ${RED} · ${statusHealthIcon('YELLOW')} ${YELLOW} · ${statusHealthIcon('GREEN')} ${GREEN}`;
    const healthInventorySpoken = `สุขภาพงานรายการ: แดง ${RED} · เหลือง ${YELLOW} · เขียว ${GREEN}`;
    const taskTotal = r.todo + r.doing + r.done;
    const progress = {
      todo: r.todo,
      doing: r.doing,
      done: r.done,
      total: taskTotal > 0 ? taskTotal : detailCount,
      hasTaskStatus: taskTotal > 0,
    };

    const topicIdLine =
      r.topicId || r.topicTitle.trim()
        ? `topic_id: ${r.topicId || '—'} · ชื่อหัวข้อหลัก: ${r.topicTitle.trim() || '—'}`
        : 'topic: ไม่มีใน snapshot เก่า (หนึ่งบล็อกต่อหนึ่งหัวข้อย่อย — ถ่าย snapshot ใหม่เพื่อรวมเป็น topic)';

    const attentionItems: EaAttentionItemTip[] = r.ragTodos.map((x) => ({
      health: x.health,
      taskTitle: x.taskTitle,
      note: x.note,
    }));
    const attentionEmpty =
      r.ragTodos.length === 0
        ? 'ไม่มีรายการที่ต้องจับตาในช่องนี้'
        : null;

    const snapshotContextLine =
      !isOrphan && !r.topicId.trim() && !r.topicTitle.trim() ? topicIdLine : undefined;

    const subtopicRows = buildSubtopicRowsForTip(
      r.subtopicTitles,
      r.subtopicRowStatus,
      projectSubtopicOrder,
    );

    const managerBrief: EaBlockManagerBrief = {
      healthInventory,
      healthInventorySpoken,
      subtopicRows,
      progress,
      attentionItems,
      attentionEmpty,
      ...(snapshotContextLine ? { snapshotContextLine } : {}),
    };

    const topicHead = r.topicTitle.trim() || (r.topicId ? r.topicId : '') || '—';
    const shortHover = isOrphan
      ? `${teamPrefix}หัวข้อย่อย (ไม่มี topic ใน snapshot): ${orphanTitle} · subtopic_id ${orphanSid} · ${statusLabelTh(worst)}`
      : `${teamPrefix}หัวข้อหลัก: ${topicHead} · topic_id ${r.topicId || '—'} · ${statusLabelTh(worst)}`;

    const topicIdShort = simplifyTopicIdForTooltip(isOrphan ? orphanSid : r.topicId);

    return {
      key: isOrphan ? `st-${orphanSid}` : `tp-${r.groupKey.slice(2)}`,
      status: worst,
      topicTitle: r.topicTitle,
      topicId: r.topicId,
      orphanSubtopicTitle: isOrphan ? orphanTitle : undefined,
      orphanSubtopicId: isOrphan ? orphanSid : undefined,
      hover: shortHover,
      topicIdShort,
      managerBrief,
    };
  });
}

type EaBlockTip = {
  key: string;
  top: number;
  left: number;
  topicTitle: string;
  topicId: string;
  orphanSubtopicTitle?: string;
  orphanSubtopicId?: string;
  status: 'RED' | 'YELLOW' | 'GREEN';
  topicIdShort: string;
  managerBrief: EaBlockManagerBrief;
};

function blockTipFromElement(b: StoredSubtopicBlock, el: HTMLElement): EaBlockTip {
  const { top, left } = eaClampedTooltipAnchor(el);
  return {
    key: b.key,
    top,
    left,
    topicTitle: b.topicTitle,
    topicId: b.topicId,
    orphanSubtopicTitle: b.orphanSubtopicTitle,
    orphanSubtopicId: b.orphanSubtopicId,
    status: b.status,
    topicIdShort: b.topicIdShort,
    managerBrief: b.managerBrief,
  };
}

function subtopicStatusDotClass(s: 'RED' | 'YELLOW' | 'GREEN' | null): string {
  if (s === 'RED') return 'bg-red-500';
  if (s === 'YELLOW') return 'bg-amber-500';
  if (s === 'GREEN') return 'bg-emerald-500';
  return 'bg-[var(--color-border)]';
}

function StatusBlocksGrid({
  blocks,
  compact,
  weekBadgeLabel,
  weekDateRange,
}: {
  blocks: StoredSubtopicBlock[];
  compact?: boolean;
  weekBadgeLabel: string;
  weekDateRange: string;
}) {
  const [hoverTip, setHoverTip] = useState<EaBlockTip | null>(null);
  const [pinnedTip, setPinnedTip] = useState<EaBlockTip | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const displayTip = pinnedTip ?? hoverTip;
  const isPinned = pinnedTip !== null;

  useEffect(() => {
    if (isPinned || !hoverTip) return;
    const clear = () => setHoverTip(null);
    window.addEventListener('scroll', clear, true);
    return () => window.removeEventListener('scroll', clear, true);
  }, [hoverTip, isPinned]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onFocusOut = (e: FocusEvent) => {
      if (pinnedTip) return;
      const rel = e.relatedTarget as Node | null;
      if (rel && el.contains(rel)) return;
      setHoverTip(null);
    };
    el.addEventListener('focusout', onFocusOut);
    return () => el.removeEventListener('focusout', onFocusOut);
  }, [pinnedTip]);

  useEffect(() => {
    if (!pinnedTip) return;
    const onDocDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t)) return;
      if ((t as Element).closest?.('[data-ea-block-tip-panel]')) return;
      setPinnedTip(null);
    };
    document.addEventListener('mousedown', onDocDown);
    return () => document.removeEventListener('mousedown', onDocDown);
  }, [pinnedTip]);

  useEffect(() => {
    if (!pinnedTip) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPinnedTip(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [pinnedTip]);

  if (blocks.length === 0) return null;
  const size = compact ? 'size-[8px]' : 'size-[10px]';
  const maxW = compact ? 'max-w-[4.5rem]' : 'max-w-[7.5rem]';

  const showHoverTip = (b: StoredSubtopicBlock, el: HTMLElement) => {
    if (pinnedTip) return;
    setHoverTip(blockTipFromElement(b, el));
  };

  const baseBlock =
    'static left-auto top-auto shrink-0 cursor-pointer rounded-none border border-[var(--color-border)] transition-[transform,box-shadow] duration-150 ease-out hover:z-20 hover:scale-[1.35] hover:shadow-md hover:ring-2 hover:ring-[var(--color-primary)] hover:ring-offset-1 hover:ring-offset-[var(--color-page)] focus-visible:z-20 focus-visible:scale-[1.35] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--color-page)] p-0';

  const activeRing =
    'z-20 scale-[1.35] shadow-md ring-2 ring-[var(--color-primary)] ring-offset-1 ring-offset-[var(--color-page)]';

  return (
    <>
      <div
        ref={wrapRef}
        className={`flex w-full ${maxW} flex-wrap justify-center gap-px`}
        onMouseLeave={(e) => {
          if (pinnedTip) return;
          const rel = e.relatedTarget as Node | null;
          if (rel && e.currentTarget.contains(rel)) return;
          setHoverTip(null);
        }}
      >
        {blocks.map((b) => (
          <button
            key={b.key}
            type="button"
            aria-label={b.hover}
            aria-pressed={pinnedTip?.key === b.key}
            title="คลิกเพื่อเปิดรายละเอียดค้างไว้ (คัดลอกได้)"
            style={{ position: 'static', left: 'auto', top: 'auto' }}
            className={`${size} ${baseBlock} ${
              b.status === 'RED'
                ? 'bg-red-500'
                : b.status === 'YELLOW'
                  ? 'bg-amber-500'
                  : 'bg-emerald-500'
            } ${displayTip?.key === b.key ? activeRing : ''}`}
            onMouseEnter={(e) => showHoverTip(b, e.currentTarget)}
            onFocus={(e) => showHoverTip(b, e.currentTarget)}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              const el = e.currentTarget;
              if (pinnedTip?.key === b.key) {
                setPinnedTip(null);
                return;
              }
              setPinnedTip(blockTipFromElement(b, el));
              setHoverTip(null);
            }}
          />
        ))}
      </div>
      <EaTooltipPortal
        anchor={displayTip ? { top: displayTip.top, left: displayTip.left } : null}
        interactive={isPinned}
      >
        {displayTip ? (
          <>
            {isPinned ? (
              <p className="mb-2 text-[10px] leading-snug text-[var(--color-text-subtle)]">
                คลิกนอกกล่อง กด Esc หรือคลิกจุดสีเดิมอีกครั้งเพื่อปิด · เลือกข้อความเพื่อคัดลอก
              </p>
            ) : null}
            {displayTip.managerBrief.snapshotContextLine ? (
              <p className="mb-2 text-[10px] leading-snug text-[var(--color-text-muted)] [overflow-wrap:anywhere]">
                {displayTip.managerBrief.snapshotContextLine}
              </p>
            ) : null}
            <div className="flex items-start gap-2 border-b border-[var(--color-border)] pb-2">
              <span
                className={`mt-1 size-2 shrink-0 rounded-full ${
                  displayTip.status === 'RED'
                    ? 'bg-red-500'
                    : displayTip.status === 'YELLOW'
                      ? 'bg-amber-500'
                      : 'bg-emerald-500'
                }`}
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold leading-snug text-[var(--color-text)] [overflow-wrap:anywhere]">
                  {displayTip.orphanSubtopicId
                    ? displayTip.orphanSubtopicTitle || displayTip.orphanSubtopicId
                    : displayTip.topicTitle.trim()
                      ? displayTip.topicTitle
                      : displayTip.topicId.trim()
                        ? '(ไม่มีชื่อหัวข้อหลักใน snapshot)'
                        : '—'}
                </p>
                {displayTip.topicIdShort ? (
                  <p className="mt-0.5 font-mono text-[10px] leading-snug text-[var(--color-text-muted)] [overflow-wrap:anywhere]">
                    ID · {displayTip.topicIdShort}
                  </p>
                ) : null}
                {displayTip.orphanSubtopicId ? (
                  <p className="mt-0.5 text-[9px] leading-snug text-[var(--color-text-subtle)]">
                    หัวข้อย่อย (snapshot ไม่มี topic)
                  </p>
                ) : null}
              </div>
              <span className="shrink-0 rounded-md border border-[var(--color-border)] bg-[var(--color-page)] px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-[var(--color-text-muted)]">
                {weekBadgeLabel}
              </span>
            </div>
            {displayTip.managerBrief.subtopicRows.length > 0 ? (
              <div className="mt-2 border-b border-[var(--color-border)] pb-2">
                <p className="text-[10px] font-medium uppercase tracking-wide text-[var(--color-text-subtle)]">
                  Subtopics
                </p>
                <ul className="mt-1.5 list-none space-y-1.5 pl-0">
                  {displayTip.managerBrief.subtopicRows.map((row, i) => (
                    <li key={i} className="flex items-start gap-2 text-[10px] leading-snug text-[var(--color-text)]">
                      <span
                        className={`mt-0.5 size-2 shrink-0 rounded-sm ${subtopicStatusDotClass(row.rowStatus)}`}
                        title={
                          row.rowStatus
                            ? statusLabelTh(row.rowStatus)
                            : 'ไม่มี subtopic_status ใน snapshot'
                        }
                        aria-label={
                          row.rowStatus
                            ? statusLabelTh(row.rowStatus)
                            : 'ไม่มีสถานะหัวข้อย่อยใน snapshot'
                        }
                      />
                      <span className="[overflow-wrap:anywhere]">{row.title}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <div className="mt-2 border-b border-[var(--color-border)] pb-2">
              <p className="text-[10px] font-medium uppercase tracking-wide text-[var(--color-text-subtle)]">
                Health ของงาน
              </p>
              <p
                className="mt-1 text-[11px] font-medium leading-snug text-[var(--color-text)] [overflow-wrap:anywhere]"
                aria-label={displayTip.managerBrief.healthInventorySpoken}
              >
                {displayTip.managerBrief.healthInventory}
              </p>
            </div>
            <div className="mt-2 border-b border-[var(--color-border)] pb-2">
              <p className="text-[10px] font-medium uppercase tracking-wide text-[var(--color-text-subtle)]">
                ความคืบหน้า
              </p>
              {displayTip.managerBrief.progress.hasTaskStatus &&
              displayTip.managerBrief.progress.total > 0 ? (
                <>
                  <div className="mt-1.5 flex items-center gap-2">
                    <div
                      className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-[var(--color-border)]"
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={displayTip.managerBrief.progress.total}
                      aria-valuenow={displayTip.managerBrief.progress.done}
                      aria-label={`ความคืบหน้า ${displayTip.managerBrief.progress.done} จาก ${displayTip.managerBrief.progress.total} เสร็จ`}
                    >
                      <div
                        className="h-full rounded-full bg-emerald-500 transition-[width] duration-300"
                        style={{
                          width: `${Math.min(100, (100 * displayTip.managerBrief.progress.done) / displayTip.managerBrief.progress.total)}%`,
                        }}
                      />
                    </div>
                    <span className="shrink-0 text-[10px] tabular-nums leading-none text-[var(--color-text-muted)]">
                      {displayTip.managerBrief.progress.done}/{displayTip.managerBrief.progress.total} เสร็จ
                    </span>
                  </div>
                  <p className="mt-1.5 flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] leading-snug">
                    <span className="text-[var(--color-text-muted)]">
                      รอ {displayTip.managerBrief.progress.todo}
                    </span>
                    <span className="text-amber-600 dark:text-amber-400">
                      กำลังทำ {displayTip.managerBrief.progress.doing}
                    </span>
                    <span className="text-emerald-600 dark:text-emerald-400">
                      เสร็จ {displayTip.managerBrief.progress.done}
                    </span>
                  </p>
                </>
              ) : (
                <p className="mt-1 text-[10px] leading-snug text-[var(--color-text-muted)]">
                  {displayTip.managerBrief.progress.total > 0
                    ? 'ยังไม่มีฟิลด์สถานะรายการใน snapshot — อ้างอิงจำนวนใน Health ด้านบน'
                    : '—'}
                </p>
              )}
            </div>
            <div className="mt-2">
              <p className="text-[10px] font-medium uppercase tracking-wide text-[var(--color-text-subtle)]">
                ต้องจับตา
              </p>
              {displayTip.managerBrief.attentionItems.length ? (
                <ul className="mt-1.5 list-none space-y-2 pl-0">
                  {displayTip.managerBrief.attentionItems.map((item, i) => (
                    <li key={i} className="[overflow-wrap:anywhere]">
                      <div className="flex items-start gap-2">
                        <span
                          className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md ring-1 ring-inset ${
                            item.health === 'RED'
                              ? 'bg-red-500/12 text-red-600 ring-red-500/25 dark:bg-red-950/70 dark:text-red-400 dark:ring-red-400/20'
                              : 'bg-amber-500/12 text-amber-600 ring-amber-500/25 dark:bg-amber-950/70 dark:text-amber-400 dark:ring-amber-400/20'
                          }`}
                          role="img"
                          aria-label={
                            item.health === 'RED'
                              ? 'สถานะแดง — ต้องจับตา'
                              : 'สถานะเหลือง — เฝ้าระวัง'
                          }
                        >
                          <AlertTriangle className="size-3.5 shrink-0" strokeWidth={2.5} aria-hidden />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold leading-snug text-[var(--color-text)]">
                            {item.taskTitle}
                          </p>
                          {item.note ? (
                            <p className="mt-0.5 text-[10px] leading-snug text-[var(--color-text-muted)]">
                              {item.note}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : displayTip.managerBrief.attentionEmpty ? (
                <p className="mt-1 text-[10px] leading-snug text-[var(--color-text-muted)]">
                  {displayTip.managerBrief.attentionEmpty}
                </p>
              ) : null}
            </div>
            <div className="-mx-2.5 -mb-2 mt-3 border-t border-[var(--color-border)] bg-[var(--color-page)] px-2.5 py-1.5">
              <p className="text-[9px] leading-snug text-[var(--color-text-muted)] [overflow-wrap:anywhere]">
                สีจุดมาจาก subtopic status · {weekBadgeLabel}: {weekDateRange || '—'}
              </p>
            </div>
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
  usesSubtopicRowStatus,
}: {
  rollup: Exclude<SummaryRollup, 'empty'>;
  totals: { RED: number; YELLOW: number; GREEN: number };
  contextLine: string;
  compact?: boolean;
  /** true = ตัวเลขเป็นจำนวนหัวข้อย่อยตาม subtopic_status; false = จำนวนรายการตามสุขภาพงาน */
  usesSubtopicRowStatus: boolean;
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
          aria-label={historyModeTooltip(contextLine, totals, rollup, usesSubtopicRowStatus)}
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
        <p className="mt-2 text-[11px] leading-snug text-[var(--color-text)]">
          {teamCellBreakdownTh(totals, usesSubtopicRowStatus)}
        </p>
        <p className="mt-2 text-[10px] leading-relaxed text-[var(--color-text-subtle)]">
          {usesSubtopicRowStatus
            ? 'ไอคอนนี้สรุปจากสถานะหัวข้อย่อย (sub_topic) ในช่อง: แดง > เหลือง > เขียว — สอดคล้องจุดสีราย topic'
            : 'ไอคอนนี้สะท้อนสถานะหนักสุดจากสุขภาพงานรายการ (snapshot เก่าไม่มี subtopic_status)'}
        </p>
      </EaTooltipPortal>
    </>
  );
}

function HistoryModeCellBlock({
  blocks,
  merged,
  contextLine,
  compact,
  weekBadgeLabel,
  weekDateRange,
}: {
  blocks: StoredSubtopicBlock[];
  merged: TeamBuckets;
  contextLine: string;
  compact?: boolean;
  weekBadgeLabel: string;
  weekDateRange: string;
}) {
  const { rollup, totals, usesSubtopicRowStatus } = teamCellSummaryRollupAndTotals(merged);
  const gap = compact ? 'gap-1' : 'gap-1.5';
  const maxW = compact ? 'max-w-[4.5rem]' : 'max-w-[7.5rem]';
  const emptyCls = compact
    ? 'min-h-[1rem] text-[10px]'
    : 'min-h-[1.25rem] text-xs';

  return (
    <div
      className={`mx-auto flex w-full ${maxW} flex-col items-center ${gap}`}
      role="group"
      aria-label={historyModeTooltip(contextLine, totals, rollup, usesSubtopicRowStatus)}
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
          <SummaryRollupWithTip
            rollup={rollup}
            totals={totals}
            contextLine={contextLine}
            compact={compact}
            usesSubtopicRowStatus={usesSubtopicRowStatus}
          />
          <StatusBlocksGrid
            blocks={blocks}
            compact={compact}
            weekBadgeLabel={weekBadgeLabel}
            weekDateRange={weekDateRange}
          />
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
  /** team_id → ลำดับ topic_id ตามโปรเจกต์ — เรียงบล็อก (หนึ่งบล็อก = หนึ่ง topic) */
  topicOrderByTeamId?: ReadonlyMap<string, readonly string[]> | Record<string, readonly string[]>;
  /** team_id → ลำดับ subtopic_id — เรียงบล็อกแบบ snapshot เก่า (ไม่มี topic) และข้อความสรุปหัวข้อย่อยใต้ topic */
  subtopicOrderByTeamId?: ReadonlyMap<string, readonly string[]> | Record<string, readonly string[]>;
  /** subtopic_id → topic_id — สำรองลำดับ topic จากลำดับ subtopic ตาม DB เมื่อไม่ส่ง topicOrder */
  subtopicToTopicId?: ReadonlyMap<string, string> | Record<string, string>;
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

function stringListForTeam(
  raw:
    | ReadonlyMap<string, readonly string[]>
    | Record<string, readonly string[]>
    | undefined,
  teamId: string,
): readonly string[] | undefined {
  if (!raw) return undefined;
  const list = raw instanceof Map ? raw.get(teamId) : raw[teamId];
  return list?.length ? list : undefined;
}

export function EaWeeklyTrendPanel({
  projectId,
  refreshKey = 0,
  teamOrder,
  subtopicToTeamId,
  topicOrderByTeamId,
  subtopicOrderByTeamId,
  subtopicToTopicId,
}: Props) {
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
  const subtopicTopicLookup = useMemo(() => toSubtopicToTopicMap(subtopicToTopicId), [subtopicToTopicId]);

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
    'แต่ละแถวเป็นหนึ่งทีม · แต่ละช่อง: สัญลักษณ์ภาพรวม + สี่เหลี่ยมชิดกัน (หนึ่งสี่เหลี่ยม = หนึ่ง topic — สีสรุปจากสถานะหัวข้อย่อยใน snapshot ณ เวลาบันทึก ไม่ใช่สุขภาพงาน; snapshot เก่าไม่มีฟิลด์นี้จึงใช้สีจากสุขภาพงาน) · ลำดับตามหัวข้อในโปรเจกต์ · ชี้หัวคอลัมน์/สี่เหลี่ยมเพื่อรายละเอียด';

  return (
    <div className="mb-6 rounded-lg border border-[var(--color-border)]/80 bg-[var(--color-surface)] p-3 sm:p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="min-w-0">
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
        <button
          type="button"
          onClick={() => setEaSnapshotModalOpen(true)}
          className="inline-flex shrink-0 items-center self-start px-3 py-2 text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-overlay)] border border-[var(--color-border)] rounded-xl text-sm font-medium transition-colors sm:self-auto"
          title="บันทึกสรุป EA รายสัปดาห์ขึ้นคลาวด์ (ต้องกำหนด week ไว้ก่อน)"
        >
          <LineChart className="h-4 w-4 mr-1.5 shrink-0" aria-hidden />
          สรุป EA
        </button>
      </div>

      <p className="mt-2 text-[10px] leading-relaxed text-[var(--color-text-subtle)] sm:text-[11px]">
        <span aria-hidden>🔴</span> แดง · <span aria-hidden>🟡</span> เหลือง · <span aria-hidden>🟢</span> เขียว — ไอคอนภาพรวมช่องสรุปจากสถานะหัวข้อย่อยใน snapshot (ถ้ามี subtopic_status) สอดคล้องจุดสีราย topic
      </p>

      {loading && <p className="mt-4 text-sm text-[var(--color-text-muted)]">กำลังโหลดประวัติ EA…</p>}
      {error && !loading && (
        <p className="mt-4 text-sm text-amber-700 dark:text-amber-300">
          ยังโหลดประวัติไม่ได้: {error} — ลองซิงค์คลาวด์หรือกำหนดสัปดาห์จากปุ่ม &quot;สรุป EA&quot; ในการ์ดนี้
        </p>
      )}
      {!loading && !error && allWeekColumns.length === 0 && (
        <p className="mt-4 text-sm text-[var(--color-text-muted)]">
          ยังไม่มี snapshot รายสัปดาห์ — กำหนดสัปดาห์และบันทึก snapshot จากปุ่ม &quot;สรุป EA&quot; ทางขวาของหัวการ์ดนี้
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
                        const contextLine = `${col.titleLine}\nทีม ${teamLabel}`;
                        const blocks = blocksFromTeamBuckets(
                          merged,
                          teamLabel,
                          stringListForTeam(topicOrderByTeamId, rowKey),
                          stringListForTeam(subtopicOrderByTeamId, rowKey),
                          subtopicTopicLookup,
                        );
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
                              merged={merged}
                              contextLine={contextLine}
                              compact={timelineCompact}
                              weekBadgeLabel={col.label}
                              weekDateRange={col.range}
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
