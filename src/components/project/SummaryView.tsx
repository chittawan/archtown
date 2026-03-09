import { useRef, useState } from 'react';
import type { Team, Topic, Status } from '../../types';
import html2pdf from 'html2pdf.js';

/** PDF-safe badge: inline hex colors so html2canvas does not hit oklch */
function PdfStatusBadge({ status }: { status: Status }) {
  const config: Record<Status, { bg: string; text: string; border: string; icon: string; defaultText: string }> = {
    GREEN: { bg: '#d1fae5', text: '#065f46', border: '#a7f3d0', icon: '🟢', defaultText: 'Normal' },
    YELLOW: { bg: '#fef3c7', text: '#92400e', border: '#fde68a', icon: '🟡', defaultText: 'Manageable' },
    RED: { bg: '#ffe4e6', text: '#9f1239', border: '#fecdd3', icon: '🔴', defaultText: 'Critical' },
  };
  const c = config[status];
  return (
    <span
      className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border"
      style={{ backgroundColor: c.bg, color: c.text, borderColor: c.border }}
    >
      <span className="mr-1">{c.icon}</span>
      {c.defaultText}
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
    // Let DOM update to hide buttons (no-print when saving)
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

  return (
    <div
      ref={pdfRef}
      className={`summary-view-print summary-pdf-safe max-w-4xl mx-auto rounded-2xl shadow-xl overflow-hidden print:shadow-none print:max-w-none print:rounded-none ${isSavingPdf ? 'summary-hide-buttons' : ''}`}
      style={{ backgroundColor: '#ffffff', color: '#111827', fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}
    >
      <div className="p-8 sm:p-10 print:p-8">
        {/* Report header */}
        <div className="flex items-start justify-between gap-6 mb-8 print:mb-6">
          <div className="flex-1 min-w-0">
            <div className="border-b-2 pb-3 mb-1" style={{ borderColor: '#2d4a3e', width: 48 }} />
            <h1 className="text-2xl font-bold tracking-tight" style={{ color: '#111827', letterSpacing: '-0.025em' }}>
              Project Status Summary
            </h1>
            <p className="text-sm font-medium mt-1" style={{ color: '#6b7280' }}>
              สำหรับผู้บริหาร
            </p>
          </div>
          <div className="flex items-center gap-3 no-print">
            <button
              type="button"
              onClick={handleSavePdf}
              disabled={isSavingPdf}
              className="inline-flex items-center px-4 py-2.5 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
              style={{ backgroundColor: isSavingPdf ? '#9ca3af' : '#2d4a3e' }}
            >
              {isSavingPdf ? 'กำลังบันทึก...' : 'Save to PDF'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center px-4 py-2.5 border text-sm font-medium rounded-lg transition-colors"
              style={{ borderColor: '#d1d5db', color: '#374151' }}
            >
              ปิด
            </button>
          </div>
        </div>

        {/* Project & date */}
        <div className="mb-8 print:mb-6" style={{ paddingBottom: 24, borderBottom: '1px solid #e5e7eb' }}>
          <p className="text-lg font-semibold" style={{ color: '#111827' }}>
            {projectName || 'Project'}
          </p>
          <p className="text-sm mt-1" style={{ color: '#6b7280' }}>
            วันที่สรุป: {dateStr}
          </p>
        </div>

        {/* Overall status */}
        <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: '#6b7280' }}>
          สรุปภาพรวมสถานะ
        </p>
        <div
          className="flex flex-wrap gap-6 p-5 rounded-lg mb-8 print:mb-6"
          style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0' }}
        >
          <div className="flex items-center gap-3">
            <PdfStatusBadge status="RED" />
            <span className="text-sm font-semibold" style={{ color: '#111827' }}>{redCount} รายการ</span>
          </div>
          <div className="flex items-center gap-3">
            <PdfStatusBadge status="YELLOW" />
            <span className="text-sm font-semibold" style={{ color: '#111827' }}>{yellowCount} รายการ</span>
          </div>
          <div className="flex items-center gap-3">
            <PdfStatusBadge status="GREEN" />
            <span className="text-sm font-semibold" style={{ color: '#111827' }}>{greenCount} รายการ</span>
          </div>
        </div>

        {/* Table section */}
        <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: '#6b7280' }}>
          รายละเอียดตามทีมและหัวข้อ
        </p>
        <div className="overflow-x-auto rounded-lg border" style={{ borderColor: '#e5e7eb' }}>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr style={{ backgroundColor: '#f3f4f6' }}>
                <th className="text-left py-3.5 px-4 font-semibold" style={{ color: '#374151', borderBottom: '2px solid #e5e7eb' }}>ทีม</th>
                <th className="text-left py-3.5 px-4 font-semibold" style={{ color: '#374151', borderBottom: '2px solid #e5e7eb' }}>หัวข้อใหญ่</th>
                <th className="text-left py-3.5 px-4 font-semibold" style={{ color: '#374151', borderBottom: '2px solid #e5e7eb' }}>สถานะ</th>
                <th className="text-center py-3.5 px-3 font-semibold" style={{ color: '#374151', borderBottom: '2px solid #e5e7eb', fontSize: 11 }}>Critical</th>
                <th className="text-center py-3.5 px-3 font-semibold" style={{ color: '#374151', borderBottom: '2px solid #e5e7eb', fontSize: 11 }}>Manageable</th>
                <th className="text-center py-3.5 px-3 font-semibold" style={{ color: '#374151', borderBottom: '2px solid #e5e7eb', fontSize: 11 }}>Normal</th>
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
                        backgroundColor: rowIndex % 2 === 0 ? '#ffffff' : '#fafafa',
                      }}
                    >
                      <td className="py-3 px-4 font-medium" style={{ color: '#111827' }}>
                        {topicIndex === 0 ? team.name : ''}
                      </td>
                      <td className="py-3 px-4" style={{ color: '#374151' }}>{topic.title}</td>
                      <td className="py-3 px-4">
                        <PdfStatusBadge status={topicStatus} />
                      </td>
                      <td className="py-3 px-3 text-center tabular-nums" style={{ color: '#6b7280' }}>{r}</td>
                      <td className="py-3 px-3 text-center tabular-nums" style={{ color: '#6b7280' }}>{y}</td>
                      <td className="py-3 px-3 text-center tabular-nums" style={{ color: '#6b7280' }}>{g}</td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>

        {redCount > 0 && (
          <>
            <p className="text-xs font-semibold uppercase tracking-wider mt-8 mb-3 print:mt-6" style={{ color: '#6b7280' }}>
              รายการ Critical
            </p>
            <div
              className="p-5 rounded-lg"
              style={{ border: '1px solid #fecaca', borderLeft: '4px solid #dc2626', backgroundColor: '#fef2f2' }}
            >
              <p className="text-sm font-semibold mb-3" style={{ color: '#991b1b' }}>
                {redCount} รายการ Critical
              </p>
              <ul className="space-y-2" style={{ color: '#374151', fontSize: 13 }}>
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
