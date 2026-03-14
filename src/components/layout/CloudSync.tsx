import { useState, useRef, useEffect } from 'react';
import { Cloud, CloudUpload, CloudDownload } from 'lucide-react';
import { uploadToCloud, downloadFromCloud } from '../../db/cloudSync';

/**
 * ปุ่ม Sync กับ Cloud: อัปโหลด/ดาวน์โหลด backup เพื่อเปิดได้ทุกที่
 */
export function CloudSync() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState<'upload' | 'download' | null>(null);
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('click', onOutside);
    return () => document.removeEventListener('click', onOutside);
  }, [open]);

  const handleUpload = async () => {
    setLoading('upload');
    setMessage(null);
    const result = await uploadToCloud();
    setLoading(null);
    setMessage(result.ok ? { type: 'ok', text: 'อัปโหลดไป Cloud แล้ว' } : { type: 'error', text: result.error });
    if (result.ok) setTimeout(() => setMessage(null), 2500);
  };

  const handleDownload = async () => {
    setLoading('download');
    setMessage(null);
    const result = await downloadFromCloud();
    setLoading(null);
    if (result.ok) {
      setMessage({ type: 'ok', text: 'ดึงข้อมูลจาก Cloud แล้ว — กำลังรีเฟรช' });
      window.dispatchEvent(new CustomEvent('capability-refresh'));
      window.dispatchEvent(new CustomEvent('project-summary-invalidate', { detail: {} }));
      setTimeout(() => {
        setMessage(null);
        window.location.reload();
      }, 1200);
    } else {
      setMessage({ type: 'error', text: result.error });
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded-lg p-2 text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-overlay)] transition-colors"
        title="Sync กับ Cloud — เปิดได้ทุกที่"
        aria-label="Cloud Sync"
      >
        <Cloud className="w-5 h-5" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 py-1 w-56 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-modal)] z-50">
          <p className="px-3 py-2 text-xs text-[var(--color-text-muted)] border-b border-[var(--color-border)]">
            Sync กับ Cloud — เปิดได้ทุกที่
          </p>
          <button
            type="button"
            onClick={handleUpload}
            disabled={!!loading}
            className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm text-[var(--color-text)] hover:bg-[var(--color-overlay)] disabled:opacity-50"
          >
            <CloudUpload className="w-4 h-4 shrink-0" />
            {loading === 'upload' ? 'กำลังอัปโหลด...' : 'อัปโหลดไป Cloud'}
          </button>
          <button
            type="button"
            onClick={handleDownload}
            disabled={!!loading}
            className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm text-[var(--color-text)] hover:bg-[var(--color-overlay)] disabled:opacity-50"
          >
            <CloudDownload className="w-4 h-4 shrink-0" />
            {loading === 'download' ? 'กำลังดาวน์โหลด...' : 'ดาวน์โหลดจาก Cloud'}
          </button>
          {message && (
            <p
              className={`px-3 py-2 text-xs border-t border-[var(--color-border)] ${
                message.type === 'ok' ? 'text-[var(--color-primary)]' : 'text-red-600 dark:text-red-400'
              }`}
            >
              {message.text}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
