import { useRef, useState } from 'react';
import type { Team, Topic, Status } from '../../types';
import html2pdf from 'html2pdf.js';

/** PDF-safe badge: icon only, no background/border for clean print */
function PdfStatusBadge({ status }: { status: Status }) {
  const config: Record<Status, { icon: string }> = {
    GREEN: { icon: '🟢' },
    YELLOW: { icon: '🟡' },
    RED: { icon: '🔴' },
  };
  const c = config[status];
  return (
    <span
      className="inline-flex items-center justify-center px-1.5 py-1 rounded text-sm w-9"
      title={status === 'GREEN' ? 'Normal' : status === 'YELLOW' ? 'Manageable' : 'Critical'}
    >
      {c.icon}
    </span>
  );
}

function getTopicStatus(topic: Topic): Status {
  if (topic.subTopics.length === 0) return 'GREEN';
  if (topic.subTopics.some((st) => st.status === 'RED')) return 'RED';
  if (topic.subTopics.some((st) => st.status === 'YELLOW')) return 'YELLOW';
  return 'GREEN';
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

  const handleSavePdf = async () => {
    if (!pdfRef.current || isSavingPdf) return;
    setIsSavingPdf(true);
    const contentDiv = pdfRef.current.querySelector<HTMLDivElement>('.px-10.pb-10');
    const savedPaddingTop = contentDiv?.style.paddingTop ?? '';
    if (contentDiv) contentDiv.style.paddingTop = '2.5rem'; // ปกติสำหรับ PDF (เทียบ p-10)
    await new Promise((r) => setTimeout(r, 100));
    const filename = `${(projectName || 'Project').replace(/[^\p{L}\p{N}\s_-]/gu, '_')}_Summary.pdf`;
    try {
      await html2pdf()
        .set({
          margin: 12,
          filename,
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: { scale: 2 },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        })
        .from(pdfRef.current)
        .save();
    } finally {
      if (contentDiv) contentDiv.style.paddingTop = savedPaddingTop;
      setIsSavingPdf(false);
    }
  };
  const redCount = teams.flatMap((t) => t.topics.flatMap((top) => top.subTopics)).filter((s) => s.status === 'RED').length;
  const yellowCount = teams.flatMap((t) => t.topics.flatMap((top) => top.subTopics)).filter((s) => s.status === 'YELLOW').length;
  const greenCount = teams.flatMap((t) => t.topics.flatMap((top) => top.subTopics)).filter((s) => s.status === 'GREEN').length;
  const dateStr = new Date().toLocaleDateString('th-TH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  // คำนวณ padding-top ตามความยาวของ project (จำนวนแถวตาราง + จำนวน subTopics)
  const totalTableRows = teams.reduce((acc, t) => acc + t.topics.length, 0);
  const totalSubTopics = teams.reduce(
    (acc, t) => acc + t.topics.reduce((a, top) => a + top.subTopics.length, 0),
    0
  );
  const contentUnits = totalTableRows + totalSubTopics * 0.5;
  const PADDING_TOP_BASE = 200;
  const PADDING_TOP_MAX = 1200;
  const PX_PER_UNIT = 100;
  const paddingTopPx = Math.min(
    PADDING_TOP_MAX,
    Math.max(PADDING_TOP_BASE, PADDING_TOP_BASE + contentUnits * PX_PER_UNIT)
  );

  return (
    <div
      ref={pdfRef}
      className={`summary-view-print summary-pdf-safe max-w-4xl mx-auto rounded-xl overflow-hidden print:shadow-none print:max-w-none print:rounded-none ${isSavingPdf ? 'summary-hide-buttons' : ''}`}
      style={{
        backgroundColor: '#ffffff',
        color: '#1a1d1e',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        fontSize: '18px',
        lineHeight: 1.6,
        boxShadow: '0 4px 24px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
      }}
    >
      <div
        className="px-10 pb-10 sm:px-12 sm:pb-12 print:p-10"
        style={{ paddingTop: paddingTopPx }}
      >
        {/* Document header */}
        <header className="mb-10 print:mb-8">
          <div className="flex items-start justify-between gap-8">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold uppercase tracking-widest mb-2" style={{ color: '#2d4a3e', letterSpacing: '0.12em', fontSize: 13 }}>
                Executive Summary
              </p>
              <h1
                className="text-2xl sm:text-3xl font-semibold tracking-tight"
                style={{ color: '#1a1d1e', fontFamily: 'Georgia, "Times New Roman", serif', letterSpacing: '-0.02em', lineHeight: 1.35, fontSize: '1.5rem' }}
              >
                Project Status Summary
              </h1>
              <p className="mt-1.5" style={{ color: '#6b7280', fontSize: '1rem' }}>
                สำหรับผู้บริหาร
              </p>
              <div className="mt-4 h-0.5 w-12 rounded-full" style={{ backgroundColor: '#2d4a3e' }} />
            </div>
            <div className="flex items-center gap-3 no-print shrink-0">
              <button
                type="button"
                onClick={handleSavePdf}
                disabled={isSavingPdf}
                className="inline-flex items-center px-5 py-3 text-base text-white font-semibold rounded-lg transition-colors bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] disabled:opacity-60 disabled:cursor-not-allowed disabled:bg-[var(--color-text-muted)]"
              >
                {isSavingPdf ? 'กำลังบันทึก...' : 'Save to PDF'}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="inline-flex items-center px-5 py-3 text-base border font-medium rounded-lg transition-colors border-[var(--color-border)] text-[var(--color-text)] hover:bg-[var(--color-overlay)]"
              >
                ปิด
              </button>
            </div>
          </div>
        </header>

        {/* Project & date */}
        <div className="mb-10 print:mb-8 pb-6" style={{ borderBottom: '1px solid #e8eaeb' }}>
          <h2 className="text-lg font-semibold" style={{ color: '#1a1d1e', fontSize: '1.25rem' }}>
            {projectName || 'Project'}
          </h2>
          <p className="mt-1" style={{ color: '#6b7280', fontSize: '1rem' }}>
            วันที่สรุป: {dateStr}
          </p>
        </div>

        {/* Overall status */}
        <p className="font-semibold uppercase tracking-wider mb-2" style={{ color: '#6b7280', fontSize: 14 }}>
          สรุปภาพรวมสถานะ
        </p>
        <div
          className="flex items-center rounded-lg py-3.5 px-4 mb-8 print:mb-6"
          style={{ backgroundColor: '#f8fafc', border: '1px solid #e5e7eb' }}
        >
          <div className="flex-1 flex items-center justify-center gap-2.5">
            <PdfStatusBadge status="RED" />
            <span className="font-semibold tabular-nums" style={{ color: '#1a1d1e', fontSize: '1rem' }}>{redCount}</span>
            <span style={{ color: '#6b7280', fontSize: '0.9375rem' }}>Critical</span>
          </div>
          <div className="flex-shrink-0 w-px self-stretch" style={{ backgroundColor: '#e5e7eb' }} />
          <div className="flex-1 flex items-center justify-center gap-2.5">
            <PdfStatusBadge status="YELLOW" />
            <span className="font-semibold tabular-nums" style={{ color: '#1a1d1e', fontSize: '1rem' }}>{yellowCount}</span>
            <span style={{ color: '#6b7280', fontSize: '0.9375rem' }}>Manageable</span>
          </div>
          <div className="flex-shrink-0 w-px self-stretch" style={{ backgroundColor: '#e5e7eb' }} />
          <div className="flex-1 flex items-center justify-center gap-2.5">
            <PdfStatusBadge status="GREEN" />
            <span className="font-semibold tabular-nums" style={{ color: '#1a1d1e', fontSize: '1rem' }}>{greenCount}</span>
            <span style={{ color: '#6b7280', fontSize: '0.9375rem' }}>Normal</span>
          </div>
        </div>

        {/* Table section */}
        <p className="font-semibold uppercase tracking-wider mb-3" style={{ color: '#6b7280', fontSize: 14 }}>
          รายละเอียดตามทีมและหัวข้อ
        </p>
        <div className="overflow-x-auto rounded-xl border" style={{ borderColor: '#e5e7eb' }}>
          <table className="w-full border-collapse" style={{ fontSize: '1rem' }}>
            <thead>
              <tr style={{ backgroundColor: '#f1f5f9' }}>
                <th className="text-left py-4 px-4 font-semibold" style={{ color: '#374151', borderBottom: '2px solid #e2e8f0', fontSize: 15 }}>ทีม</th>
                <th className="text-left py-4 px-4 font-semibold" style={{ color: '#374151', borderBottom: '2px solid #e2e8f0', fontSize: 15 }}>หัวข้อใหญ่</th>
                <th className="text-left py-4 px-4 font-semibold" style={{ color: '#374151', borderBottom: '2px solid #e2e8f0', fontSize: 15 }}>สถานะ</th>
                <th className="text-center py-4 px-3 font-semibold" style={{ color: '#374151', borderBottom: '2px solid #e2e8f0', fontSize: 14 }}>Critical</th>
                <th className="text-center py-4 px-3 font-semibold" style={{ color: '#374151', borderBottom: '2px solid #e2e8f0', fontSize: 14 }}>Manageable</th>
                <th className="text-center py-4 px-3 font-semibold" style={{ color: '#374151', borderBottom: '2px solid #e2e8f0', fontSize: 14 }}>Normal</th>
              </tr>
            </thead>
            <tbody>
              {teams.flatMap((team) =>
                team.topics.map((topic, topicIndex) => ({
                  team,
                  topic,
                  topicIndex,
                }))
              ).map(({ team, topic, topicIndex }, rowIndex) => {
                  const topicStatus = getTopicStatus(topic);
                  const r = topic.subTopics.filter((s) => s.status === 'RED').length;
                  const y = topic.subTopics.filter((s) => s.status === 'YELLOW').length;
                  const g = topic.subTopics.filter((s) => s.status === 'GREEN').length;
                  return (
                    <tr
                      key={`${team.id}-${topic.id}`}
                      style={{
                        borderBottom: '1px solid #e5e7eb',
                        backgroundColor: rowIndex % 2 === 0 ? '#ffffff' : '#fafbfc',
                      }}
                    >
                      <td className="py-4 px-4 font-medium" style={{ color: '#1a1d1e', fontSize: '1rem' }}>
                        {topicIndex === 0 ? team.name : ''}
                      </td>
                      <td className="py-4 px-4" style={{ color: '#374151', fontSize: '1rem' }}>{topic.title}</td>
                      <td className="py-4 px-4">
                        <PdfStatusBadge status={topicStatus} />
                      </td>
                      <td className="py-4 px-3 text-center tabular-nums" style={{ color: '#64748b', fontSize: '1rem' }}>{r}</td>
                      <td className="py-4 px-3 text-center tabular-nums" style={{ color: '#64748b', fontSize: '1rem' }}>{y}</td>
                      <td className="py-4 px-3 text-center tabular-nums" style={{ color: '#64748b', fontSize: '1rem' }}>{g}</td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>

        {redCount > 0 && (
          <>
            <p className="font-semibold uppercase tracking-wider mt-10 mb-3 print:mt-8" style={{ color: '#6b7280', fontSize: 14 }}>
              รายการ Critical
            </p>
            <div
              className="p-6 rounded-xl"
              style={{ border: '1px solid #fecaca', borderLeft: '4px solid #dc2626', backgroundColor: '#fefafa' }}
            >
              <p className="font-semibold mb-3" style={{ color: '#991b1b', fontSize: '1rem' }}>
                {redCount} รายการที่ต้องดำเนินการ
              </p>
              <ul className="space-y-2" style={{ color: '#374151', fontSize: '1rem', lineHeight: 1.6 }}>
                {teams.flatMap((team) =>
                  team.topics.flatMap((topic) =>
                    topic.subTopics
                      .filter((s) => s.status === 'RED')
                      .map((s) => (
                        <li key={s.id} className="flex items-start gap-2">
                          <span style={{ color: '#dc2626' }}>•</span>
                          <span>{team.name} → {topic.title} → {s.title}</span>
                        </li>
                      ))
                  )
                )}
              </ul>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
