import { useRef, useState } from 'react';
import type { Team, Topic, Status } from '../../types';
import html2pdf from 'html2pdf.js';

function PdfStatusBadge({ status }: { status: Status }) {
  const icons: Record<Status, string> = { GREEN: '🟢', YELLOW: '🟡', RED: '🔴' };
  return <span title={status}>{icons[status]}</span>;
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

  const allSubs = teams.flatMap((t) => t.topics.flatMap((tp) => tp.subTopics));
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
    const filename = `${(projectName || 'Project').replace(/[^\p{L}\p{N}\s_-]/gu, '_')}_Summary.pdf`;
    try {
      await html2pdf()
        .set({
          margin: [8, 10, 8, 10],
          filename,
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' },
          pagebreak: { mode: ['css', 'legacy'], avoid: '.no-break' },
        } as Record<string, unknown>)
        .from(pdfRef.current)
        .save();
    } finally {
      setIsSavingPdf(false);
    }
  };

  return (
    <div className="relative">
      {/* Floating action buttons */}
      <div className={`fixed top-5 right-5 z-[60] flex items-center gap-2 ${isSavingPdf ? 'hidden' : ''}`}>
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
              <span style={{ fontSize: 22 }}>
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
                  <th style={{ textAlign: 'left', padding: '7px 10px', fontWeight: 600, color: '#374151', borderBottom: '2px solid #e2e8f0', fontSize: 11 }}>ทีม</th>
                  <th style={{ textAlign: 'center', padding: '7px 8px', fontWeight: 600, color: '#374151', borderBottom: '2px solid #e2e8f0', fontSize: 11, width: 60 }}>สถานะ</th>
                  <th style={{ textAlign: 'center', padding: '7px 8px', fontWeight: 600, color: '#374151', borderBottom: '2px solid #e2e8f0', fontSize: 11, width: 60 }}>รายการ</th>
                  <th style={{ textAlign: 'center', padding: '7px 6px', fontWeight: 600, color: '#dc2626', borderBottom: '2px solid #e2e8f0', fontSize: 11, width: 45 }}>🔴</th>
                  <th style={{ textAlign: 'center', padding: '7px 6px', fontWeight: 600, color: '#d97706', borderBottom: '2px solid #e2e8f0', fontSize: 11, width: 45 }}>🟡</th>
                  <th style={{ textAlign: 'center', padding: '7px 6px', fontWeight: 600, color: '#16a34a', borderBottom: '2px solid #e2e8f0', fontSize: 11, width: 45 }}>🟢</th>
                </tr>
              </thead>
              <tbody>
                {teams.map((team, i) => {
                  const ts = getTeamStatus(team);
                  const subs = team.topics.flatMap((t) => t.subTopics);
                  return (
                    <tr key={team.id} style={{ borderBottom: '1px solid #f0f0f0', backgroundColor: i % 2 === 0 ? '#fff' : '#fafbfc' }}>
                      <td style={{ padding: '6px 10px', fontWeight: 500, fontSize: 12 }}>{team.name}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'center' }}><PdfStatusBadge status={ts} /></td>
                      <td style={{ padding: '6px 8px', textAlign: 'center', color: '#6b7280', fontSize: 12 }}>{subs.length}</td>
                      <td style={{ padding: '6px 6px', textAlign: 'center', color: '#64748b', fontSize: 12 }}>{subs.filter((s) => s.status === 'RED').length}</td>
                      <td style={{ padding: '6px 6px', textAlign: 'center', color: '#64748b', fontSize: 12 }}>{subs.filter((s) => s.status === 'YELLOW').length}</td>
                      <td style={{ padding: '6px 6px', textAlign: 'center', color: '#64748b', fontSize: 12 }}>{subs.filter((s) => s.status === 'GREEN').length}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Brief alert at bottom of slide 1 */}
          {hasIssues && (
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
              <span style={{ color: '#6b7280', marginLeft: 6 }}>— รายละเอียดหน้าถัดไป</span>
            </div>
          )}
        </div>

        {/* ═══════════ PAGE BREAK ═══════════ */}
        <div className="html2pdf__page-break" />
        <div className="no-print" style={{ borderTop: '2px dashed #d1d5db', margin: '0 32px', position: 'relative' }}>
          <span style={{
            position: 'absolute', top: -9, left: '50%', transform: 'translateX(-50%)',
            fontSize: 10, color: '#9ca3af', backgroundColor: '#fff', padding: '0 10px', whiteSpace: 'nowrap',
          }}>
            — หน้าถัดไป —
          </span>
        </div>

        {/* ═══════════════════════════════════════════════════
            SLIDE 2 — Detail by Topic + Issue Lists
            ═══════════════════════════════════════════════════ */}
        <div style={{ padding: '24px 32px 20px' }}>
          <div style={{ height: 2, backgroundColor: '#2d4a3e', borderRadius: 1, width: 32, marginBottom: 12 }} />
          <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em', color: '#2d4a3e', marginBottom: 2 }}>
            Detail Status
          </div>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: '#1a1d1e', margin: '0 0 12px', fontFamily: SERIF }}>
            รายละเอียดตามทีมและหัวข้อ
          </h2>

          {/* Full topic table */}
          <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden', marginBottom: 18 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr style={{ backgroundColor: '#f1f5f9' }}>
                  <th style={{ textAlign: 'left', padding: '6px 10px', fontWeight: 600, color: '#374151', borderBottom: '2px solid #e2e8f0', fontSize: 10 }}>ทีม</th>
                  <th style={{ textAlign: 'left', padding: '6px 10px', fontWeight: 600, color: '#374151', borderBottom: '2px solid #e2e8f0', fontSize: 10 }}>หัวข้อใหญ่</th>
                  <th style={{ textAlign: 'center', padding: '6px 8px', fontWeight: 600, color: '#374151', borderBottom: '2px solid #e2e8f0', fontSize: 10 }}>สถานะ</th>
                  <th style={{ textAlign: 'center', padding: '6px 6px', fontWeight: 600, color: '#374151', borderBottom: '2px solid #e2e8f0', fontSize: 10 }}>🔴</th>
                  <th style={{ textAlign: 'center', padding: '6px 6px', fontWeight: 600, color: '#374151', borderBottom: '2px solid #e2e8f0', fontSize: 10 }}>🟡</th>
                  <th style={{ textAlign: 'center', padding: '6px 6px', fontWeight: 600, color: '#374151', borderBottom: '2px solid #e2e8f0', fontSize: 10 }}>🟢</th>
                </tr>
              </thead>
              <tbody>
                {teams.flatMap((team) =>
                  team.topics.map((topic, topicIndex) => ({ team, topic, topicIndex }))
                ).map(({ team, topic, topicIndex }, rowIndex) => {
                  const topicStatus = getTopicStatus(topic);
                  const r = topic.subTopics.filter((s) => s.status === 'RED').length;
                  const y = topic.subTopics.filter((s) => s.status === 'YELLOW').length;
                  const g = topic.subTopics.filter((s) => s.status === 'GREEN').length;
                  return (
                    <tr key={`${team.id}-${topic.id}`} style={{ borderBottom: '1px solid #f0f0f0', backgroundColor: rowIndex % 2 === 0 ? '#fff' : '#fafbfc' }}>
                      <td style={{ padding: '5px 10px', fontWeight: topicIndex === 0 ? 500 : 400, color: '#1a1d1e', fontSize: 11 }}>
                        {topicIndex === 0 ? team.name : ''}
                      </td>
                      <td style={{ padding: '5px 10px', color: '#374151', fontSize: 11 }}>{topic.title}</td>
                      <td style={{ padding: '5px 8px', textAlign: 'center' }}><PdfStatusBadge status={topicStatus} /></td>
                      <td style={{ padding: '5px 6px', textAlign: 'center', color: '#64748b', fontSize: 11 }}>{r}</td>
                      <td style={{ padding: '5px 6px', textAlign: 'center', color: '#64748b', fontSize: 11 }}>{y}</td>
                      <td style={{ padding: '5px 6px', textAlign: 'center', color: '#64748b', fontSize: 11 }}>{g}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Critical items */}
          {redCount > 0 && (
            <div className="no-break" style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#991b1b', marginBottom: 5 }}>
                🔴 รายการ Critical — {redCount} รายการ
              </div>
              <div style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid #fecaca', borderLeft: '3px solid #dc2626', backgroundColor: '#fef2f2' }}>
                <ul style={{ margin: 0, padding: '0 0 0 14px', fontSize: 11, lineHeight: 1.8, color: '#374151' }}>
                  {teams.flatMap((team) =>
                    team.topics.flatMap((topic) =>
                      topic.subTopics
                        .filter((s) => s.status === 'RED')
                        .map((s) => (
                          <li key={s.id}>
                            <span style={{ fontWeight: 600 }}>{team.name}</span>
                            <span style={{ color: '#9ca3af' }}> → </span>
                            {topic.title}
                            <span style={{ color: '#9ca3af' }}> → </span>
                            <span style={{ color: '#dc2626', fontWeight: 500 }}>{s.title}</span>
                          </li>
                        ))
                    )
                  )}
                </ul>
              </div>
            </div>
          )}

          {/* Manageable items */}
          {yellowCount > 0 && (
            <div className="no-break">
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#92400e', marginBottom: 5 }}>
                🟡 รายการ Manageable — {yellowCount} รายการ
              </div>
              <div style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid #fde68a', borderLeft: '3px solid #f59e0b', backgroundColor: '#fffbeb' }}>
                <ul style={{ margin: 0, padding: '0 0 0 14px', fontSize: 11, lineHeight: 1.8, color: '#374151' }}>
                  {teams.flatMap((team) =>
                    team.topics.flatMap((topic) =>
                      topic.subTopics
                        .filter((s) => s.status === 'YELLOW')
                        .map((s) => (
                          <li key={s.id}>
                            <span style={{ fontWeight: 600 }}>{team.name}</span>
                            <span style={{ color: '#9ca3af' }}> → </span>
                            {topic.title}
                            <span style={{ color: '#9ca3af' }}> → </span>
                            <span style={{ color: '#d97706', fontWeight: 500 }}>{s.title}</span>
                          </li>
                        ))
                    )
                  )}
                </ul>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
