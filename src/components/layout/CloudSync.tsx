import { useState, useRef, useEffect } from 'react';
import { Cloud, CloudUpload, CloudDownload, Lock, Upload } from 'lucide-react';
import { uploadToCloud, downloadFromCloud, restoreFromJsonFile, type CloudSyncFailure } from '../../db/cloudSync';

/**
 * ปุ่ม Sync กับ Cloud: อัปโหลด/ดาวน์โหลด backup เพื่อเปิดได้ทุกที่
 * + Restore from JSON (อัปโหลดจากไฟล์ backup.json)
 * รองรับการเข้ารหัสด้วยรหัสผ่าน (เก็บเฉพาะในหน่วยความจำ)
 */
type ConflictInfo = { remoteVersion: number; remoteUpdatedAt: string | null };

export function CloudSync() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState<'upload' | 'download' | 'restore' | null>(null);
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);
  const [conflict, setConflict] = useState<ConflictInfo | null>(null);
  const [syncPassword, setSyncPassword] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const onOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('click', onOutside);
    return () => document.removeEventListener('click', onOutside);
  }, [open]);

  const handleUpload = async (force = false) => {
    setLoading('upload');
    setMessage(null);
    setConflict(null);
    const result = await uploadToCloud(force, syncPassword || undefined);
    setLoading(null);
    if (result.ok) {
      setMessage({ type: 'ok', text: 'อัปโหลดไป Cloud แล้ว' });
      setTimeout(() => setMessage(null), 2500);
    } else {
      const err = result as CloudSyncFailure;
      if (err.conflict && err.remoteVersion != null) {
        setConflict({
          remoteVersion: err.remoteVersion,
          remoteUpdatedAt: err.remoteUpdatedAt ?? null,
        });
      } else {
        setMessage({ type: 'error', text: err.error });
      }
    }
  };

  const handleOverwrite = async () => {
    await handleUpload(true);
    setConflict(null);
  };

  const handleDownload = async () => {
    setLoading('download');
    setMessage(null);
    const result = await downloadFromCloud(syncPassword || undefined);
    setLoading(null);
    if (result.ok) {
      setMessage({ type: 'ok', text: 'Restore จาก Cloud แล้ว — กำลังรีเฟรช' });
      window.dispatchEvent(new CustomEvent('capability-refresh'));
      window.dispatchEvent(new CustomEvent('project-summary-invalidate', { detail: {} }));
      setTimeout(() => {
        setMessage(null);
        window.location.reload();
      }, 1200);
    } else {
      const err = result as CloudSyncFailure;
      setMessage({ type: 'error', text: err.error });
    }
  };

  const handleRestoreFromJsonClick = () => {
    setMessage(null);
    fileInputRef.current?.click();
  };

  const handleRestoreFromJsonFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setLoading('restore');
    setMessage(null);
    try {
      const buffer = await file.arrayBuffer();
      const result = await restoreFromJsonFile(buffer, syncPassword || undefined);
      setLoading(null);
      if (result.ok) {
        setMessage({ type: 'ok', text: 'Restore จากไฟล์ JSON แล้ว — กำลังรีเฟรช' });
        window.dispatchEvent(new CustomEvent('capability-refresh'));
        window.dispatchEvent(new CustomEvent('project-summary-invalidate', { detail: {} }));
        setTimeout(() => {
          setMessage(null);
          window.location.reload();
        }, 1200);
      } else {
        const err = result as CloudSyncFailure;
        setMessage({ type: 'error', text: err.error });
      }
    } catch (err) {
      setLoading(null);
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'อ่านไฟล์ไม่สำเร็จ' });
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
          <div className="px-3 py-2 border-b border-[var(--color-border)]">
            <label className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)] mb-1">
              <Lock className="w-3.5 h-3.5" />
              รหัสผ่าน (ถ้าต้องการเข้ารหัส backup)
            </label>
            <input
              type="password"
              value={syncPassword}
              onChange={(e) => setSyncPassword(e.target.value)}
              placeholder="เว้นว่าง = ไม่เข้ารหัส"
              className="w-full px-2.5 py-1.5 text-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/50"
              autoComplete="off"
            />
          </div>
          <button
            type="button"
            onClick={() => handleUpload()}
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
            {loading === 'download' ? 'กำลังดาวน์โหลด...' : 'Restore จาก Cloud'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            className="sr-only"
            aria-hidden
            onChange={handleRestoreFromJsonFile}
          />
          <button
            type="button"
            onClick={handleRestoreFromJsonClick}
            disabled={!!loading}
            className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm text-[var(--color-text)] hover:bg-[var(--color-overlay)] disabled:opacity-50 border-t border-[var(--color-border)]"
          >
            <Upload className="w-4 h-4 shrink-0" />
            {loading === 'restore' ? 'กำลัง Restore...' : 'Upload from JSON (Restore จาก backup.json)'}
          </button>
          {conflict && (
            <div className="px-3 py-2 border-t border-[var(--color-border)] space-y-2">
              <p className="text-xs text-amber-600 dark:text-amber-400">
                Cloud มีข้อมูลใหม่กว่า ต้องการเขียนทับหรือไม่?
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleOverwrite}
                  disabled={!!loading}
                  className="flex-1 px-2 py-1.5 text-xs font-medium rounded-lg bg-amber-500/20 text-amber-700 dark:text-amber-400 hover:bg-amber-500/30 disabled:opacity-50"
                >
                  เขียนทับ
                </button>
                <button
                  type="button"
                  onClick={() => setConflict(null)}
                  className="flex-1 px-2 py-1.5 text-xs font-medium rounded-lg border border-[var(--color-border)] text-[var(--color-text)] hover:bg-[var(--color-overlay)]"
                >
                  ยกเลิก
                </button>
              </div>
            </div>
          )}
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
