import { useState, useEffect } from 'react';
import { Database } from 'lucide-react';
import { getDbStatus } from '../../db/archtownDb';

/**
 * แถบแสดงสถานะ DB: ใช้ OPFS (เก็บถาวร) หรือหน่วยความจำ (รีเฟรชแล้วหาย) และจำนวนโปรเจกต์
 * ใช้ตรวจสอบว่าเปิดแอปแล้วมีข้อมูลหรือยัง และ save ทำงานหรือไม่
 */
export function DbStatusBar() {
  const [status, setStatus] = useState<{ opfsUsed: boolean; projectCount: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = () => {
    getDbStatus()
      .then(setStatus)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  };

  useEffect(() => {
    let cancelled = false;
    getDbStatus()
      .then((s) => {
        if (!cancelled) setStatus(s);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    const onInvalidate = () => fetchStatus();
    window.addEventListener('project-summary-invalidate', onInvalidate);
    window.addEventListener('capability-refresh', onInvalidate);
    return () => {
      cancelled = true;
      window.removeEventListener('project-summary-invalidate', onInvalidate);
      window.removeEventListener('capability-refresh', onInvalidate);
    };
  }, []);

  if (error) {
    return (
      <span
        className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400"
        title={`โหลดสถานะไม่สำเร็จ: ${error}`}
      >
        <Database className="w-3.5 h-3.5" />
        <span>DB: ผิดพลาด</span>
      </span>
    );
  }
  if (!status) {
    return (
      <span className="flex items-center gap-1.5 text-xs text-[var(--color-text-subtle)]" title="กำลังโหลดสถานะข้อมูล">
        <Database className="w-3.5 h-3.5 animate-pulse" />
        <span>...</span>
      </span>
    );
  }

  const storageLabel = status.opfsUsed ? 'OPFS (เก็บถาวร)' : 'หน่วยความจำ (รีเฟรชแล้วหาย)';
  const title = status.opfsUsed
    ? 'ข้อมูลเก็บใน OPFS — บันทึกแล้วอยู่ถาวร'
    : 'เบราว์เซอร์ไม่รองรับ OPFS — ข้อมูลอยู่ในหน่วยความจำ จะหายเมื่อรีเฟรช ใช้ "นำเข้าจาก YAML" ที่หน้าแรกเพื่อโหลดข้อมูล';

  return (
    <span
      className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)]"
      title={title}
    >
      <Database className="w-3.5 h-3.5 shrink-0" />
      <span className="hidden sm:inline">{storageLabel}</span>
      <span className="text-[var(--color-text-subtle)]">·</span>
      <span>โปรเจกต์ {status.projectCount}</span>
    </span>
  );
}
