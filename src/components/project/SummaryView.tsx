import { useEffect, useMemo, useRef, useState } from 'react';
import type { Team, Topic, Status, SubTopic, SubTopicDetail } from '../../types';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

function PdfStatusBadge({
  status,
  size = 14,
  muted,
  mutedHint,
}: {
  status: Status;
  size?: number;
  muted?: boolean;
  /** ข้อความต่อท้ายใน title เมื่อ muted (เช่น ไม่ระบุวัน / ยังไม่ถึงกำหนด) */
  mutedHint?: string;
}) {
  const icons: Record<Status, string> = { GREEN: '🟢', YELLOW: '🟡', RED: '🔴' };
  const baseTitle = status === 'GREEN' ? 'Normal' : status === 'YELLOW' ? 'Manageable' : 'Critical';
  if (muted) {
    const dot = Math.max(8, Math.round(size * 0.65));
    const hint = mutedHint ?? 'ไม่ระบุหรือยังไม่ถึงกำหนด';
    return (
      <span
        title={`${baseTitle} — ${hint}`}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: size + 8,
          height: size + 8,
          lineHeight: 1,
          verticalAlign: 'middle',
        }}
      >
        <span
          style={{
            width: dot,
            height: dot,
            borderRadius: '50%',
            backgroundColor: '#d1d5db',
            flexShrink: 0,
          }}
        />
      </span>
    );
  }
  return (
    <span
      title={baseTitle}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size + 8,
        height: size + 8,
        lineHeight: 1,
        fontSize: size,
        verticalAlign: 'middle',
      }}
    >
      {icons[status]}
    </span>
  );
}

function detailEffectiveStatus(d: SubTopicDetail): 'todo' | 'doing' | 'done' {
  return d.status ?? (d.done ? 'done' : 'todo');
}

function getTopicStatus(topic: Topic): Status {
  if (topic.subTopics.length === 0) return 'GREEN';
  if (topic.subTopics.some((st) => st.status === 'RED')) return 'RED';
  if (topic.subTopics.some((st) => st.status === 'YELLOW')) return 'YELLOW';
  return 'GREEN';
}

function getTeamStatus(team: Team): Status {
  const statuses = team.topics.map(getTopicStatus);
  if (statuses.includes('RED')) return 'RED';
  if (statuses.includes('YELLOW')) return 'YELLOW';
  return 'GREEN';
}

const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const SERIF = 'Georgia, "Times New Roman", serif';
const statusLabel = (s: Status) => s === 'RED' ? 'Critical' : s === 'YELLOW' ? 'Manageable' : 'Normal';
const statusColor = (s: Status) => s === 'RED' ? '#dc2626' : s === 'YELLOW' ? '#d97706' : '#16a34a';

const DETAIL_CARD_THEME: Record<
  Status,
  {
    border: string;
    borderLeft: string;
    headerBg: string;
    headerBorder: string;
    titleColor: string;
    noteBorderLeft: string;
    rowBorderBottom: string;
  }
> = {
  RED: {
    border: '1px solid #fecaca',
    borderLeft: '3px solid #dc2626',
    headerBg: '#fef2f2',
    headerBorder: '1px solid #fee2e2',
    titleColor: '#991b1b',
    noteBorderLeft: '2px solid #e5e7eb',
    rowBorderBottom: '1px solid #f9fafb',
  },
  YELLOW: {
    border: '1px solid #fde68a',
    borderLeft: '3px solid #f59e0b',
    headerBg: '#fffbeb',
    headerBorder: '1px solid #fef3c7',
    titleColor: '#92400e',
    noteBorderLeft: '2px solid #fde68a',
    rowBorderBottom: '1px solid #fffbeb',
  },
  GREEN: {
    border: '1px solid #bbf7d0',
    borderLeft: '3px solid #16a34a',
    headerBg: '#f0fdf4',
    headerBorder: '1px solid #d1fae5',
    titleColor: '#166534',
    noteBorderLeft: '2px solid #bbf7d0',
    rowBorderBottom: '1px solid #ecfdf5',
  },
};

function notePipeBorderLeft(
  taskStatus: 'todo' | 'doing' | 'done' | undefined,
  themeBorderLeft: string,
): string {
  if (taskStatus === 'todo') return '2px solid #d1d5db';
  if (taskStatus === 'doing') return '2px solid #60a5fa';
  if (taskStatus === 'done') return themeBorderLeft;
  return themeBorderLeft;
}

function DetailDescriptionNote({
  description,
  noteBorderLeft,
  taskStatus,
}: {
  description: string;
  noteBorderLeft: string;
  /** สถานะรายการ Todo — ยังไม่ done ใช้แถบเทา/น้ำเงิน; done ใช้สีตามธีมหัวข้อ */
  taskStatus?: 'todo' | 'doing' | 'done';
}) {
  const raw = description.trim();
  if (!raw) return null;
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const bulletLines = lines
    .filter((l) => l.startsWith('- '))
    .map((l) => l.slice(2).trim())
    .filter(Boolean);
  const textLines = lines.filter((l) => !l.startsWith('- '));
  const noteTextRaw = textLines.join('\n');
  const noteText = noteTextRaw.replace(/^\s*note\s*[:：-]?\s*/i, '').trim();
  const pipeBorder = notePipeBorderLeft(taskStatus, noteBorderLeft);
  return (
    <span style={{ display: 'block', marginTop: 4, color: '#6b7280' }}>
      <span
        style={{
          display: 'block',
          paddingLeft: 10,
          borderLeft: pipeBorder,
          lineHeight: 1.65,
          fontStyle: 'italic',
        }}
      >
        <span
          style={{
            display: 'block',
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: '0.08em',
            color: '#9ca3af',
            textTransform: 'uppercase',
            marginBottom: 1,
            fontStyle: 'normal',
          }}
        >
          Note
        </span>
        {noteText && (
          <span style={{ display: 'block', whiteSpace: 'pre-wrap' }}>
            {noteText}
          </span>
        )}
        {bulletLines.length > 0 && (
          <ul style={{ margin: noteText ? '6px 0 0' : '0', padding: 0, lineHeight: 1.6, fontSize: 10, color: '#4b5563', listStyle: 'none' }}>
            {bulletLines.map((t, i) => (
              <li key={i}>
                <span style={{ color: '#9ca3af' }}>- </span>
                {t}
              </li>
            ))}
          </ul>
        )}
      </span>
    </span>
  );
}

type SummaryDetailMode = 'summary' | 'timeline';

type SummaryTimelineEntry = {
  id: string;
  sortDate: number | null;
  dueDateRaw: string | null;
  team: Team;
  topic: Topic;
  sub: SubTopic;
  detail?: SubTopicDetail;
};

/** กลุ่มแสดงผล: รายการ Todo ที่ due date เดียวกัน + หัวข้อย่อยเดียวกัน รวมเป็นการ์ดเดียว (แบบ Summary) */
type SummaryTimelineDisplayGroup = {
  id: string;
  dueDateRaw: string | null;
  sortDate: number | null;
  team: Team;
  topic: Topic;
  sub: SubTopic;
  details: SubTopicDetail[];
};

function mergeTimelineEntriesForSameSubSameDue(entries: SummaryTimelineEntry[]): SummaryTimelineDisplayGroup[] {
  const groups: SummaryTimelineDisplayGroup[] = [];
  let i = 0;
  while (i < entries.length) {
    const e = entries[i]!;
    if (!e.detail) {
      groups.push({
        id: `solo-${e.id}`,
        dueDateRaw: e.dueDateRaw,
        sortDate: e.sortDate,
        team: e.team,
        topic: e.topic,
        sub: e.sub,
        details: [],
      });
      i++;
      continue;
    }

    const details: SubTopicDetail[] = [e.detail];
    let j = i + 1;
    while (j < entries.length) {
      const n = entries[j]!;
      if (!n.detail) break;
      if (n.sub.id !== e.sub.id) break;
      if ((n.dueDateRaw ?? '') !== (e.dueDateRaw ?? '') || n.sortDate !== e.sortDate) break;
      details.push(n.detail);
      j++;
    }
    groups.push({
      id: `merged-${e.sub.id}-${e.dueDateRaw ?? 'undated'}-${i}`,
      dueDateRaw: e.dueDateRaw,
      sortDate: e.sortDate,
      team: e.team,
      topic: e.topic,
      sub: e.sub,
      details,
    });
    i = j;
  }
  return groups;
}

function buildSummaryTimelineEntries(teams: Team[]): SummaryTimelineEntry[] {
  const out: SummaryTimelineEntry[] = [];
  for (const team of teams) {
    for (const topic of team.topics) {
      for (const sub of topic.subTopics) {
        if (sub.details.length === 0) {
          out.push({
            id: `sub-${sub.id}`,
            sortDate: null,
            dueDateRaw: null,
            team,
            topic,
            sub,
          });
        } else {
          sub.details.forEach((detail, idx) => {
            const raw = detail.dueDate?.trim() ?? '';
            const ok = /^\d{4}-\d{2}-\d{2}$/.test(raw);
            const ts = ok
              ? Date.UTC(Number(raw.slice(0, 4)), Number(raw.slice(5, 7)) - 1, Number(raw.slice(8, 10)))
              : null;
            out.push({
              id: `sub-${sub.id}-d-${idx}`,
              sortDate: ts,
              dueDateRaw: ok ? raw : null,
              team,
              topic,
              sub,
              detail,
            });
          });
        }
      }
    }
  }
  out.sort((a, b) => {
    if (a.sortDate != null && b.sortDate != null) return a.sortDate - b.sortDate;
    if (a.sortDate != null) return -1;
    if (b.sortDate != null) return 1;
    const ka = `${a.team.name}\t${a.topic.title}\t${a.sub.title}\t${a.detail?.text ?? ''}`;
    const kb = `${b.team.name}\t${b.topic.title}\t${b.sub.title}\t${b.detail?.text ?? ''}`;
    return ka.localeCompare(kb, 'th');
  });
  return out;
}

function formatTimelineDueLabel(dueDateRaw: string | null): string {
  if (!dueDateRaw) return 'ไม่ระบุวันที่';
  const [y, m, d] = dueDateRaw.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** due ยังอยู่ในอนาคต (หลังวันนี้ ตาม local calendar) — จุด/ป้ายวันใช้สีเทา */
function isTimelineDueDateFutureOnly(dueDateRaw: string | null): boolean {
  if (!dueDateRaw || !/^\d{4}-\d{2}-\d{2}$/.test(dueDateRaw)) return false;
  const [y, m, d] = dueDateRaw.split('-').map(Number);
  const due = new Date(y, m - 1, d);
  due.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return due.getTime() > today.getTime();
}

const TIMELINE_FUTURE_MUTED = '#9ca3af';

/** ธีมการ์ด Timeline เมื่อ due ยังอยู่ในอนาคต */
const TIMELINE_FUTURE_CARD_THEME = {
  border: '1px solid #e5e7eb',
  borderLeft: '3px solid #9ca3af',
  headerBg: '#f3f4f6',
  headerBorder: '1px solid #e5e7eb',
  titleColor: '#6b7280',
  noteBorderLeft: '2px solid #d1d5db',
  rowBorderBottom: '1px solid #f3f4f6',
} as const;

/** คีย์วัน — แสดงป้ายวันครั้งเดียวเมื่อวันเดียวกันกับแถวก่อน */
function timelineDayKey(dueDateRaw: string | null): string {
  if (dueDateRaw) return `date:${dueDateRaw}`;
  return 'undated';
}

function SummaryDetailTimeline({ teams }: { teams: Team[] }) {
  const groups = useMemo(
    () => mergeTimelineEntriesForSameSubSameDue(buildSummaryTimelineEntries(teams)),
    [teams],
  );
  const lineLeftPx = 100;

  if (groups.length === 0) {
    return (
      <div
        style={{
          padding: '24px 16px',
          textAlign: 'center',
          fontSize: 13,
          color: '#6b7280',
          border: '1px dashed #e5e7eb',
          borderRadius: 8,
          backgroundColor: '#fafafa',
        }}
      >
        ยังไม่มีรายการในสรุปโครงการ — เพิ่มหัวข้อย่อยหรือรายการ Todo พร้อม Due date
      </div>
    );
  }

  return (
    <div style={{ position: 'relative' }}>
      <div
        aria-hidden
        style={{
          position: 'absolute',
          left: lineLeftPx,
          top: 18,
          bottom: 18,
          width: 2,
          backgroundColor: '#e5e7eb',
          borderRadius: 1,
        }}
      />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        {groups.map((g, index) => {
          const dueUndated = !g.dueDateRaw;
          const dueFuture = isTimelineDueDateFutureOnly(g.dueDateRaw);
          const dueMuted = dueUndated || dueFuture;
          const dotBorder = dueMuted ? TIMELINE_FUTURE_MUTED : statusColor(g.sub.status);
          const dk = timelineDayKey(g.dueDateRaw);
          const prevDk = index > 0 ? timelineDayKey(groups[index - 1]!.dueDateRaw) : null;
          const showDateLabel = prevDk === null || dk !== prevDk;
          const t = dueMuted ? TIMELINE_FUTURE_CARD_THEME : DETAIL_CARD_THEME[g.sub.status];
          const badgeMutedHint = dueUndated ? 'ไม่ระบุวันครบกำหนด' : 'ยังไม่ถึงวันครบกำหนด';

          return (
            <div
              key={g.id}
              className="no-break"
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 0,
                paddingBottom: 18,
              }}
            >
              <div
                style={{
                  width: 88,
                  flexShrink: 0,
                  textAlign: 'right',
                  paddingRight: 14,
                  paddingTop: 2,
                  fontSize: 11,
                  fontWeight: showDateLabel && g.dueDateRaw ? 700 : showDateLabel ? 500 : 400,
                  color: showDateLabel
                    ? g.dueDateRaw
                      ? dueFuture
                        ? TIMELINE_FUTURE_MUTED
                        : '#374151'
                      : TIMELINE_FUTURE_MUTED
                    : undefined,
                  lineHeight: 1.35,
                }}
              >
                {showDateLabel ? formatTimelineDueLabel(g.dueDateRaw) : ''}
              </div>
              <div
                style={{
                  width: 24,
                  flexShrink: 0,
                  display: 'flex',
                  justifyContent: 'center',
                  paddingTop: 4,
                  position: 'relative',
                  zIndex: 1,
                }}
              >
                <div
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: '50%',
                    border: `3px solid ${dotBorder}`,
                    backgroundColor: '#ffffff',
                    boxShadow: '0 0 0 2px #fff',
                  }}
                />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                {g.details.length === 0 ? (
                  <div
                    style={{
                      border: dueMuted ? TIMELINE_FUTURE_CARD_THEME.border : '1px solid #e5e7eb',
                      borderLeft: dueMuted ? TIMELINE_FUTURE_CARD_THEME.borderLeft : undefined,
                      borderRadius: 8,
                      padding: '10px 12px',
                      backgroundColor: dueMuted ? TIMELINE_FUTURE_CARD_THEME.headerBg : '#fafbfc',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
                      <PdfStatusBadge status={g.sub.status} size={11} muted={dueMuted} mutedHint={badgeMutedHint} />
                      <span style={{ fontSize: 10, color: '#6b7280' }}>
                        {g.team.name} → {g.topic.title} → <span style={{ fontWeight: 600, color: '#374151' }}>{g.sub.title}</span>
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: '#4b5563', fontStyle: 'italic' }}>
                      หัวข้อย่อย (ไม่มีรายการ Todo) — ติดตามสถานะหัวข้อ
                    </div>
                  </div>
                ) : (
                  <div
                    style={{
                      borderRadius: 6,
                      overflow: 'hidden',
                      border: t.border,
                      borderLeft: t.borderLeft,
                      backgroundColor: '#fff',
                    }}
                  >
                    <div
                      style={{
                        padding: '7px 12px',
                        backgroundColor: t.headerBg,
                        borderBottom: t.headerBorder,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      <PdfStatusBadge status={g.sub.status} size={12} muted={dueMuted} mutedHint={badgeMutedHint} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ fontSize: 10, color: '#6b7280' }}>{g.team.name} → {g.topic.title} → </span>
                        <span style={{ fontSize: 11, fontWeight: 600, color: t.titleColor }}>{g.sub.title}</span>
                      </div>
                      <span style={{ fontSize: 9, color: '#9ca3af', flexShrink: 0 }}>
                        {g.details.filter((d) => detailEffectiveStatus(d) === 'done').length}/{g.details.length} done
                      </span>
                    </div>
                    <div style={{ padding: '4px 12px 6px' }}>
                      {g.details.map((d, idx) => {
                        const st = detailEffectiveStatus(d);
                        return (
                          <div
                            key={idx}
                            style={{
                              display: 'flex',
                              alignItems: 'flex-start',
                              gap: 6,
                              padding: '3px 0',
                              fontSize: 10,
                              color: '#374151',
                              borderBottom: idx < g.details.length - 1 ? t.rowBorderBottom : 'none',
                            }}
                          >
                            <span
                              style={{
                                color: st === 'done' ? '#16a34a' : st === 'doing' ? '#2563eb' : '#9ca3af',
                                fontWeight: 700,
                                flexShrink: 0,
                                width: 12,
                                textAlign: 'center',
                                lineHeight: '16px',
                              }}
                            >
                              {st === 'done' ? '✓' : st === 'doing' ? '●' : '○'}
                            </span>
                            <span
                              style={{
                                flex: 1,
                                color: st === 'done' ? '#4b5563' : '#374151',
                              }}
                            >
                              <span>{d.text}</span>
                              {d.description && (
                                <DetailDescriptionNote
                                  description={d.description}
                                  noteBorderLeft={t.noteBorderLeft}
                                  taskStatus={st}
                                />
                              )}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SummarySubTopicDetailCard({ team, topic, sub }: { team: Team; topic: Topic; sub: SubTopic }) {
  const t = DETAIL_CARD_THEME[sub.status];
  return (
    <div
      className="no-break"
      style={{
        marginBottom: 8,
        borderRadius: 6,
        overflow: 'hidden',
        border: t.border,
        borderLeft: t.borderLeft,
        backgroundColor: '#fff',
      }}
    >
      <div
        style={{
          padding: '7px 12px',
          backgroundColor: t.headerBg,
          borderBottom: sub.details.length > 0 ? t.headerBorder : 'none',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <PdfStatusBadge status={sub.status} size={12} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: 10, color: '#6b7280' }}>{team.name} → {topic.title} → </span>
          <span style={{ fontSize: 11, fontWeight: 600, color: t.titleColor }}>{sub.title}</span>
        </div>
        {sub.details.length > 0 && (
          <span style={{ fontSize: 9, color: '#9ca3af', flexShrink: 0 }}>
            {sub.details.filter((d) => detailEffectiveStatus(d) === 'done').length}/{sub.details.length} done
          </span>
        )}
      </div>
      {sub.details.length > 0 && (
        <div style={{ padding: '4px 12px 6px' }}>
          {sub.details.map((d, idx) => {
            const st = detailEffectiveStatus(d);
            return (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 6,
                  padding: '3px 0',
                  fontSize: 10,
                  color: '#374151',
                  borderBottom: idx < sub.details.length - 1 ? t.rowBorderBottom : 'none',
                }}
              >
                <span
                  style={{
                    color: st === 'done' ? '#16a34a' : st === 'doing' ? '#2563eb' : '#9ca3af',
                    fontWeight: 700,
                    flexShrink: 0,
                    width: 12,
                    textAlign: 'center',
                    lineHeight: '16px',
                  }}
                >
                  {st === 'done' ? '✓' : st === 'doing' ? '●' : '○'}
                </span>
                <span
                  style={{
                    flex: 1,
                    color: st === 'done' ? '#4b5563' : '#374151',
                  }}
                >
                  <span>{d.text}</span>
                  {d.description && (
                    <DetailDescriptionNote
                      description={d.description}
                      noteBorderLeft={t.noteBorderLeft}
                      taskStatus={st}
                    />
                  )}
                </span>
                {d.dueDate && (
                  <span style={{ flexShrink: 0, fontSize: 9, color: '#6b7280' }}>
                    {d.dueDate}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function SummaryView({
  projectName,
  teams,
  onClose,
}: {
  projectName: string;
  teams: Team[];
  onClose: () => void;
}) {
  const pdfRef = useRef<HTMLDivElement>(null);
  const [isSavingPdf, setIsSavingPdf] = useState(false);
  const [detailMode, setDetailMode] = useState<SummaryDetailMode>('summary');
  const [filterStartDate, setFilterStartDate] = useState<string>('');
  const [filterEndDate, setFilterEndDate] = useState<string>('');
  const [filterIncludeUndated, setFilterIncludeUndated] = useState<boolean>(true);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSavingPdf) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, isSavingPdf]);

  const filteredTeams = useMemo(() => {
    const hasStart = !!filterStartDate;
    const hasEnd = !!filterEndDate;
    if (!hasStart && !hasEnd && filterIncludeUndated) return teams;

    const inRange = (due?: string | null): boolean => {
      if (!due) return filterIncludeUndated;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) return filterIncludeUndated;
      const v = due;
      if (hasStart && v < filterStartDate) return false;
      if (hasEnd && v > filterEndDate) return false;
      return true;
    };

    return teams
      .map((team) => ({
        ...team,
        topics: team.topics
          .map((topic) => ({
            ...topic,
            subTopics: topic.subTopics
              .map((sub) => ({
                ...sub,
                details: sub.details.filter((d) => inRange(d.dueDate)),
              }))
              // คง subTopic แบบ status ไว้แม้ไม่มี detail หลังกรอง (เพราะไม่มี due-date)
              .filter((sub) => sub.details.length > 0 || sub.subTopicType === 'status'),
          }))
          .filter((topic) => topic.subTopics.length > 0),
      }))
      .filter((team) => team.topics.length > 0);
  }, [teams, filterStartDate, filterEndDate, filterIncludeUndated]);

  const allSubs = filteredTeams.flatMap((t) => t.topics.flatMap((tp) => tp.subTopics));
  const redCount = allSubs.filter((s) => s.status === 'RED').length;
  const yellowCount = allSubs.filter((s) => s.status === 'YELLOW').length;
  const greenCount = allSubs.filter((s) => s.status === 'GREEN').length;
  const totalCount = allSubs.length;
  const overallStatus: Status = redCount > 0 ? 'RED' : yellowCount > 0 ? 'YELLOW' : 'GREEN';

  const dateStr = new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
  const timeStr = new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });

  const redPct = totalCount > 0 ? (redCount / totalCount) * 100 : 0;
  const yellowPct = totalCount > 0 ? (yellowCount / totalCount) * 100 : 0;
  const greenPct = totalCount > 0 ? (greenCount / totalCount) * 100 : 0;

  const hasIssues = redCount > 0 || yellowCount > 0;

  const handleSavePdf = async () => {
    if (!pdfRef.current || isSavingPdf) return;
    setIsSavingPdf(true);
    await new Promise((r) => setTimeout(r, 150));
    const baseName = (projectName || 'Project').replace(/[^\p{L}\p{N}\s_-]/gu, '_');
    const modeSuffix = detailMode === 'timeline' ? 'Timeline' : 'Summary';
    const now = new Date();
    const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    const filename = `${baseName}_${modeSuffix}_${ymd}.pdf`;
    try {
      const el = pdfRef.current;
      const scale = 2;
      const canvas = await html2canvas(el, { scale, useCORS: true });
      const imgData = canvas.toDataURL('image/jpeg', 0.98);
      const marginH = 10;
      const marginV = 8;
      const pxToMm = 0.264583;
      const imgWidthMm = canvas.width / scale * pxToMm;
      const imgHeightMm = canvas.height / scale * pxToMm;
      const pageWidth = imgWidthMm + marginH * 2;
      const pageHeight = imgHeightMm + marginV * 2;

      const pdf = new jsPDF({
        unit: 'mm',
        format: [pageWidth, pageHeight],
        orientation: pageWidth > pageHeight ? 'landscape' : 'portrait',
      });
      pdf.addImage(imgData, 'JPEG', marginH, marginV, imgWidthMm, imgHeightMm);
      pdf.save(filename);
    } finally {
      setIsSavingPdf(false);
    }
  };

  return (
    <div className="relative">
      {/* Floating action buttons */}
      <div className={`fixed top-5 right-5 z-[60] flex flex-wrap items-center justify-end gap-2 max-w-[calc(100vw-2rem)] ${isSavingPdf ? 'hidden' : ''}`}>
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-white/95 shadow-md px-3 py-2">
          <span className="text-[11px] font-medium text-gray-500 whitespace-nowrap">ช่วงวันที่</span>
          <input
            type="date"
            value={filterStartDate}
            onChange={(e) => setFilterStartDate(e.target.value)}
            className="h-8 rounded-md border border-gray-200 px-2 text-[11px] text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-[#2d4a3e]/40"
            aria-label="วันที่เริ่มต้น (กรองรายงาน)"
          />
          <span className="text-[11px] text-gray-400">ถึง</span>
          <input
            type="date"
            value={filterEndDate}
            onChange={(e) => setFilterEndDate(e.target.value)}
            className="h-8 rounded-md border border-gray-200 px-2 text-[11px] text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-[#2d4a3e]/40"
            aria-label="วันที่สิ้นสุด (กรองรายงาน)"
          />
          <label className="flex items-center gap-1.5 ml-1 text-[11px] text-gray-600 whitespace-nowrap cursor-pointer select-none">
            <input
              type="checkbox"
              checked={filterIncludeUndated}
              onChange={(e) => setFilterIncludeUndated(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-gray-300 text-[#2d4a3e] focus:ring-[#2d4a3e]"
            />
            รวมรายการไม่ระบุวัน
          </label>
        </div>
        <div className="flex rounded-lg border border-gray-200 bg-white/95 shadow-md overflow-hidden">
          <button
            type="button"
            onClick={() => setDetailMode('summary')}
            className={`px-3 py-2 text-xs sm:text-sm font-medium transition-colors ${
              detailMode === 'summary'
                ? 'bg-[#2d4a3e] text-white'
                : 'text-gray-600 hover:bg-gray-50'
            }`}
            title="ตารางสรุป + การ์ดรายละเอียดตามสถานะ"
          >
            Summary
          </button>
          <button
            type="button"
            onClick={() => setDetailMode('timeline')}
            className={`px-3 py-2 text-xs sm:text-sm font-medium transition-colors border-l border-gray-200 ${
              detailMode === 'timeline'
                ? 'bg-[#2d4a3e] text-white'
                : 'text-gray-600 hover:bg-gray-50'
            }`}
            title="เรียงตาม Due date (แนวตั้ง)"
          >
            Timeline
          </button>
        </div>
        <button
          type="button"
          onClick={handleSavePdf}
          disabled={isSavingPdf}
          className="px-4 py-2 text-sm text-white font-semibold rounded-lg shadow-lg bg-[#2d4a3e] hover:bg-[#1f3a2e] disabled:opacity-60 transition-colors"
        >
          {isSavingPdf ? 'กำลังบันทึก...' : '📄 Save PDF'}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 text-sm font-medium rounded-lg shadow-lg bg-white/95 hover:bg-white text-gray-700 border border-gray-200 transition-colors"
        >
          ✕ ปิด
        </button>
      </div>

      {/* PDF Content */}
      <div
        ref={pdfRef}
        className={`summary-view-print summary-pdf-safe max-w-5xl mx-auto rounded-xl overflow-hidden print:shadow-none print:max-w-none print:rounded-none ${isSavingPdf ? 'summary-hide-buttons' : ''}`}
        style={{
          backgroundColor: '#ffffff',
          color: '#1a1d1e',
          fontFamily: FONT,
          boxShadow: '0 4px 24px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
        }}
      >
        {/* ═══════════════════════════════════════════════════
            SLIDE 1 — Executive Dashboard (fits one A4 landscape)
            ═══════════════════════════════════════════════════ */}
        <div style={{ padding: '24px 32px 20px' }}>
          {/* Accent bar */}
          <div style={{ height: 3, background: 'linear-gradient(90deg, #2d4a3e, #4a7c6b)', borderRadius: 2, marginBottom: 16 }} />

          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em', color: '#2d4a3e', marginBottom: 2 }}>
                Executive Summary
              </div>
              <h1 style={{ fontSize: 20, fontWeight: 700, color: '#1a1d1e', margin: 0, lineHeight: 1.25, fontFamily: SERIF }}>
                {projectName || 'Project'}
              </h1>
            </div>
            <div style={{ textAlign: 'right', fontSize: 11, lineHeight: 1.5 }}>
              <div style={{ color: '#374151', fontWeight: 600 }}>{dateStr}</div>
              <div style={{ color: '#9ca3af' }}>เวลา {timeStr}</div>
            </div>
          </div>

          {/* KPI row */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
            {/* Overall status card */}
            <div style={{
              flex: '0 0 auto', padding: '10px 18px', borderRadius: 8,
              background: overallStatus === 'RED' ? '#fef2f2' : overallStatus === 'YELLOW' ? '#fffbeb' : '#f0fdf4',
              border: `1.5px solid ${overallStatus === 'RED' ? '#fecaca' : overallStatus === 'YELLOW' ? '#fde68a' : '#bbf7d0'}`,
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <span style={{ fontSize: 22, lineHeight: 1, display: 'inline-block', verticalAlign: 'middle' }}>
                {overallStatus === 'RED' ? '🔴' : overallStatus === 'YELLOW' ? '🟡' : '🟢'}
              </span>
              <div>
                <div style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#6b7280' }}>
                  Overall Status
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, color: statusColor(overallStatus) }}>
                  {statusLabel(overallStatus)}
                </div>
              </div>
            </div>

            {/* Count cards */}
            {([
              { count: redCount, label: 'Critical', status: 'RED' as Status, bg: '#fef2f2', border: '#fecaca' },
              { count: yellowCount, label: 'Manageable', status: 'YELLOW' as Status, bg: '#fffbeb', border: '#fde68a' },
              { count: greenCount, label: 'Normal', status: 'GREEN' as Status, bg: '#f0fdf4', border: '#bbf7d0' },
            ]).map((kpi) => (
              <div key={kpi.label} style={{
                flex: 1, padding: '8px 12px', borderRadius: 8, textAlign: 'center',
                border: `1px solid ${kpi.border}`, backgroundColor: kpi.bg,
              }}>
                <div style={{ fontSize: 26, fontWeight: 800, color: statusColor(kpi.status), lineHeight: 1 }}>
                  {kpi.count}
                </div>
                <div style={{ fontSize: 10, fontWeight: 600, color: '#6b7280', marginTop: 2 }}>{kpi.label}</div>
              </div>
            ))}

            {/* Total */}
            <div style={{
              flex: '0 0 auto', padding: '8px 18px', borderRadius: 8, textAlign: 'center',
              border: '1px solid #e5e7eb', backgroundColor: '#f9fafb',
            }}>
              <div style={{ fontSize: 26, fontWeight: 800, color: '#374151', lineHeight: 1 }}>{totalCount}</div>
              <div style={{ fontSize: 10, fontWeight: 600, color: '#6b7280', marginTop: 2 }}>Total</div>
            </div>
          </div>

          {/* Health bar */}
          <div style={{ display: 'flex', height: 5, borderRadius: 3, overflow: 'hidden', backgroundColor: '#f3f4f6', marginBottom: 16 }}>
            {redPct > 0 && <div style={{ width: `${redPct}%`, backgroundColor: '#dc2626' }} />}
            {yellowPct > 0 && <div style={{ width: `${yellowPct}%`, backgroundColor: '#f59e0b' }} />}
            {greenPct > 0 && <div style={{ width: `${greenPct}%`, backgroundColor: '#16a34a' }} />}
          </div>

          {/* Team summary table */}
          <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#6b7280', marginBottom: 5 }}>
            สรุปสถานะรายทีม
          </div>
          <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden', marginBottom: 14 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ backgroundColor: '#f8fafc' }}>
                  <th style={{ textAlign: 'left', padding: '7px 10px', fontWeight: 600, color: '#374151', borderBottom: '2px solid #e2e8f0', fontSize: 11, verticalAlign: 'middle' }}>ทีม</th>
                  <th style={{ textAlign: 'center', padding: '7px 8px', fontWeight: 600, color: '#374151', borderBottom: '2px solid #e2e8f0', fontSize: 11, width: 60, verticalAlign: 'middle' }}>สถานะ</th>
                  <th style={{ textAlign: 'center', padding: '7px 8px', fontWeight: 600, color: '#374151', borderBottom: '2px solid #e2e8f0', fontSize: 11, width: 60, verticalAlign: 'middle' }}>รายการ</th>
                  <th style={{ textAlign: 'center', padding: '7px 6px', fontWeight: 600, color: '#dc2626', borderBottom: '2px solid #e2e8f0', fontSize: 11, width: 45, verticalAlign: 'middle' }}>🔴</th>
                  <th style={{ textAlign: 'center', padding: '7px 6px', fontWeight: 600, color: '#d97706', borderBottom: '2px solid #e2e8f0', fontSize: 11, width: 45, verticalAlign: 'middle' }}>🟡</th>
                  <th style={{ textAlign: 'center', padding: '7px 6px', fontWeight: 600, color: '#16a34a', borderBottom: '2px solid #e2e8f0', fontSize: 11, width: 45, verticalAlign: 'middle' }}>🟢</th>
                </tr>
              </thead>
              <tbody>
                {filteredTeams.map((team, i) => {
                  const ts = getTeamStatus(team);
                  const subs = team.topics.flatMap((t) => t.subTopics);
                  return (
                    <tr key={team.id} style={{ borderBottom: '1px solid #f0f0f0', backgroundColor: i % 2 === 0 ? '#fff' : '#fafbfc' }}>
                      <td style={{ padding: '6px 10px', fontWeight: 500, fontSize: 12, verticalAlign: 'middle' }}>{team.name}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'center', verticalAlign: 'middle', lineHeight: 0 }}><PdfStatusBadge status={ts} /></td>
                      <td style={{ padding: '6px 8px', textAlign: 'center', color: '#6b7280', fontSize: 12, verticalAlign: 'middle' }}>{subs.length}</td>
                      <td style={{ padding: '6px 6px', textAlign: 'center', color: '#64748b', fontSize: 12, verticalAlign: 'middle' }}>{subs.filter((s) => s.status === 'RED').length}</td>
                      <td style={{ padding: '6px 6px', textAlign: 'center', color: '#64748b', fontSize: 12, verticalAlign: 'middle' }}>{subs.filter((s) => s.status === 'YELLOW').length}</td>
                      <td style={{ padding: '6px 6px', textAlign: 'center', color: '#64748b', fontSize: 12, verticalAlign: 'middle' }}>{subs.filter((s) => s.status === 'GREEN').length}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Brief alert at bottom of slide 1 */}
          {hasIssues ? (
            <div style={{
              padding: '8px 14px', borderRadius: 6, fontSize: 11,
              border: `1px solid ${redCount > 0 ? '#fecaca' : '#fde68a'}`,
              borderLeft: `3px solid ${redCount > 0 ? '#dc2626' : '#f59e0b'}`,
              backgroundColor: redCount > 0 ? '#fef2f2' : '#fffbeb',
              color: redCount > 0 ? '#991b1b' : '#92400e',
            }}>
              <span style={{ fontWeight: 700 }}>
                {redCount > 0 && `⚠ ${redCount} Critical`}
                {redCount > 0 && yellowCount > 0 && ', '}
                {yellowCount > 0 && `${yellowCount} Manageable`}
              </span>
              <span style={{ color: '#6b7280', marginLeft: 6 }}>— รายละเอียดด้านล่าง</span>
            </div>
          ) : totalCount > 0 ? (
            <div style={{
              padding: '8px 14px', borderRadius: 6, fontSize: 11,
              border: '1px solid #bbf7d0',
              borderLeft: '3px solid #16a34a',
              backgroundColor: '#f0fdf4',
              color: '#166534',
            }}>
              <span style={{ fontWeight: 700 }}>✓ สถานะโดยรวมปกติ</span>
              <span style={{ color: '#6b7280', marginLeft: 6 }}>— รายละเอียดรายการด้านล่าง</span>
            </div>
          ) : null}
        </div>

        {/* Section divider */}
        <div style={{ borderTop: '2px dashed #d1d5db', margin: '0 32px', position: 'relative' }}>
          <span style={{
            position: 'absolute', top: -9, left: '50%', transform: 'translateX(-50%)',
            fontSize: 10, color: '#9ca3af', backgroundColor: '#fff', padding: '0 10px', whiteSpace: 'nowrap',
          }}>
            {detailMode === 'summary' ? 'รายละเอียด · Summary' : 'รายละเอียด · Timeline'}
          </span>
        </div>

        {/* ═══════════════════════════════════════════════════
            SLIDE 2 — Detail by Topic + Issue Lists
            ═══════════════════════════════════════════════════ */}
        <div style={{ padding: '24px 32px 20px' }}>
          <div style={{ height: 2, backgroundColor: '#2d4a3e', borderRadius: 1, width: 32, marginBottom: 12 }} />
          <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em', color: '#2d4a3e', marginBottom: 2 }}>
            {detailMode === 'summary' ? 'Detail Status' : 'Timeline View'}
          </div>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: '#1a1d1e', margin: '0 0 12px', fontFamily: SERIF }}>
            {detailMode === 'summary'
              ? 'รายละเอียดตามทีมและหัวข้อ'
              : 'ไทม์ไลน์ตาม Due date และลำดับหัวข้อ'}
          </h2>
          {detailMode === 'timeline' && (
            <p style={{ fontSize: 11, color: '#6b7280', margin: '-8px 0 16px', lineHeight: 1.5 }}>
              แต่ละแถว = รายการ Todo (ถ้ามี) หรือหัวข้อย่อยที่ไม่มี Todo — เรียงจากวันครบกำหนด (รูปแบบ YYYY-MM-DD) ก่อน แล้วตามด้วยรายการที่ไม่ระบุวัน
            </p>
          )}

          {detailMode === 'summary' ? (
            <>
          {/* Full topic table */}
              <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden', marginBottom: 18 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f1f5f9' }}>
                      <th style={{ textAlign: 'left', padding: '6px 10px', fontWeight: 600, color: '#374151', borderBottom: '2px solid #e2e8f0', fontSize: 10, verticalAlign: 'middle' }}>ทีม</th>
                      <th style={{ textAlign: 'left', padding: '6px 10px', fontWeight: 600, color: '#374151', borderBottom: '2px solid #e2e8f0', fontSize: 10, verticalAlign: 'middle' }}>หัวข้อใหญ่</th>
                      <th style={{ textAlign: 'center', padding: '6px 8px', fontWeight: 600, color: '#374151', borderBottom: '2px solid #e2e8f0', fontSize: 10, verticalAlign: 'middle' }}>สถานะ</th>
                      <th style={{ textAlign: 'center', padding: '6px 6px', fontWeight: 600, color: '#374151', borderBottom: '2px solid #e2e8f0', fontSize: 10, verticalAlign: 'middle' }}>🔴</th>
                      <th style={{ textAlign: 'center', padding: '6px 6px', fontWeight: 600, color: '#374151', borderBottom: '2px solid #e2e8f0', fontSize: 10, verticalAlign: 'middle' }}>🟡</th>
                      <th style={{ textAlign: 'center', padding: '6px 6px', fontWeight: 600, color: '#374151', borderBottom: '2px solid #e2e8f0', fontSize: 10, verticalAlign: 'middle' }}>🟢</th>
                    </tr>
                  </thead>
              <tbody>
                {filteredTeams.flatMap((team) =>
                      team.topics.map((topic, topicIndex) => ({ team, topic, topicIndex }))
                    ).map(({ team, topic, topicIndex }, rowIndex) => {
                      const topicStatus = getTopicStatus(topic);
                      const r = topic.subTopics.filter((s) => s.status === 'RED').length;
                      const y = topic.subTopics.filter((s) => s.status === 'YELLOW').length;
                      const g = topic.subTopics.filter((s) => s.status === 'GREEN').length;
                      return (
                        <tr key={`${team.id}-${topic.id}`} style={{ borderBottom: '1px solid #f0f0f0', backgroundColor: rowIndex % 2 === 0 ? '#fff' : '#fafbfc' }}>
                          <td style={{ padding: '5px 10px', fontWeight: topicIndex === 0 ? 500 : 400, color: '#1a1d1e', fontSize: 11, verticalAlign: 'middle' }}>
                            {topicIndex === 0 ? team.name : ''}
                          </td>
                          <td style={{ padding: '5px 10px', color: '#374151', fontSize: 11, verticalAlign: 'middle' }}>{topic.title}</td>
                          <td style={{ padding: '5px 8px', textAlign: 'center', verticalAlign: 'middle', lineHeight: 0 }}><PdfStatusBadge status={topicStatus} /></td>
                          <td style={{ padding: '5px 6px', textAlign: 'center', color: '#64748b', fontSize: 11, verticalAlign: 'middle' }}>{r}</td>
                          <td style={{ padding: '5px 6px', textAlign: 'center', color: '#64748b', fontSize: 11, verticalAlign: 'middle' }}>{y}</td>
                          <td style={{ padding: '5px 6px', textAlign: 'center', color: '#64748b', fontSize: 11, verticalAlign: 'middle' }}>{g}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

          {/* Critical items — In-Detail Investigation */}
          {redCount > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#991b1b', marginBottom: 8 }}>
                    🔴 Critical Issues — {redCount} รายการที่ต้องดำเนินการ
                  </div>
              {filteredTeams.flatMap((team) =>
                    team.topics.flatMap((topic) =>
                      topic.subTopics
                        .filter((s) => s.status === 'RED')
                        .map((sub) => (
                          <SummarySubTopicDetailCard key={sub.id} team={team} topic={topic} sub={sub} />
                        ))
                    )
                  )}
                </div>
              )}

          {/* Manageable items */}
          {yellowCount > 0 && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#92400e', marginBottom: 8 }}>
                    🟡 Manageable Issues — {yellowCount} รายการที่ต้องติดตาม
                  </div>
              {filteredTeams.flatMap((team) =>
                    team.topics.flatMap((topic) =>
                      topic.subTopics
                        .filter((s) => s.status === 'YELLOW')
                        .map((sub) => (
                          <SummarySubTopicDetailCard key={sub.id} team={team} topic={topic} sub={sub} />
                        ))
                    )
                  )}
                </div>
              )}

          {/* Normal — แสดงรายละเอียดเหมือน Critical / Manageable */}
          {greenCount > 0 && (
                <div style={{ marginTop: redCount > 0 || yellowCount > 0 ? 14 : 0 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#166534', marginBottom: 8 }}>
                    🟢 Normal — {greenCount} รายการสถานะปกติ
                  </div>
              {filteredTeams.flatMap((team) =>
                    team.topics.flatMap((topic) =>
                      topic.subTopics
                        .filter((s) => s.status === 'GREEN')
                        .map((sub) => (
                          <SummarySubTopicDetailCard key={sub.id} team={team} topic={topic} sub={sub} />
                        ))
                    )
                  )}
                </div>
              )}
            </>
          ) : (
            <SummaryDetailTimeline teams={filteredTeams} />
          )}
        </div>
      </div>
    </div>
  );
}
