import { useState, useRef, useEffect } from 'react';
import { Cloud, Upload, Download } from 'lucide-react';
import { restoreFromJsonFile, getLastSyncedAt, uploadToCloud, isSyncAvailable, type CloudSyncFailure } from '../../db/cloudSync';
import { exportForSync } from '../../db/sync';
import { getAutoSyncEnabled, setAutoSyncEnabled, scheduleSyncToCloud } from '../../db/cloudSyncScheduler';
import { isOpfsUsed } from '../../db/archtownDb';

/**
 * เมนู Backup & Sync: ดาวน์โหลด/นำเข้าจากไฟล์ + Auto sync ขึ้น Cloud (เมื่อใช้ OPFS)
 */
function formatLastSynced(updated_at: string): string {
  try {
    const d = new Date(updated_at);
    return d.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return updated_at;
  }
}

export function CloudSync() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState<'restore' | 'export' | null>(null);
  const [syncingToCloud, setSyncingToCloud] = useState(false);
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);
  const [autoSync, setAutoSync] = useState(getAutoSyncEnabled);
  const [lastSynced, setLastSynced] = useState<{ version: number; updated_at: string } | null>(() => getLastSyncedAt());
  const dropdownRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setLastSynced(getLastSyncedAt());
    const onOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('click', onOutside);
    return () => document.removeEventListener('click', onOutside);
  }, [open]);

  useEffect(() => {
    const onSkipped = (e: Event) => {
      const ev = e as CustomEvent<{ message?: string }>;
      setMessage({ type: 'error', text: ev.detail?.message ?? 'Cloud มีข้อมูลใหม่กว่า ไม่ได้อัปโหลด' });
      setTimeout(() => setMessage(null), 4000);
    };
    window.addEventListener('cloud-sync-skipped-conflict', onSkipped);
    return () => window.removeEventListener('cloud-sync-skipped-conflict', onSkipped);
  }, []);

  const syncStartedAtRef = useRef<number>(0);
  const MIN_SPIN_MS = 700;

  useEffect(() => {
    const onStart = () => {
      syncStartedAtRef.current = Date.now();
      setSyncingToCloud(true);
    };
    const onFinish = () => {
      const elapsed = Date.now() - syncStartedAtRef.current;
      const remaining = Math.max(0, MIN_SPIN_MS - elapsed);
      if (remaining > 0) {
        setTimeout(() => setSyncingToCloud(false), remaining);
      } else {
        setSyncingToCloud(false);
      }
    };
    window.addEventListener('cloud-sync-started', onStart);
    window.addEventListener('cloud-sync-finished', onFinish);
    return () => {
      window.removeEventListener('cloud-sync-started', onStart);
      window.removeEventListener('cloud-sync-finished', onFinish);
    };
  }, []);

  const handleAutoSyncChange = (enabled: boolean) => {
    setAutoSyncEnabled(enabled);
    setAutoSync(enabled);
    if (enabled) scheduleSyncToCloud();
  };

  const handleTriggerSyncToCloud = async () => {
    if (!isOpfsUsed()) return;
    if (loading || syncingToCloud) return;
    setMessage(null);
    const available = await isSyncAvailable();
    if (!available) {
      setMessage({ type: 'error', text: 'ไม่สามารถ sync ขึ้น Cloud ได้ (ตรวจสอบการล็อกอิน)' });
      setTimeout(() => setMessage(null), 4000);
      return;
    }
    window.dispatchEvent(new CustomEvent('cloud-sync-started'));
    try {
      const result = await uploadToCloud(false);
      setLastSynced(getLastSyncedAt());
      if (result.ok) {
        setMessage({ type: 'ok', text: 'Sync ขึ้น Cloud แล้ว' });
        setTimeout(() => setMessage(null), 2500);
      } else {
        const r = result as { error?: string; conflict?: boolean };
        if (r.conflict) setMessage({ type: 'error', text: 'Cloud มีข้อมูลใหม่กว่า ไม่ได้อัปโหลด' });
        else setMessage({ type: 'error', text: r.error ?? 'Sync ไม่สำเร็จ' });
        setTimeout(() => setMessage(null), 4000);
      }
    } catch (e) {
      setMessage({ type: 'error', text: e instanceof Error ? e.message : 'Sync ไม่สำเร็จ' });
      setTimeout(() => setMessage(null), 4000);
    } finally {
      window.dispatchEvent(new CustomEvent('cloud-sync-finished'));
    }
  };

  const handleDownloadBackupJson = async () => {
    setLoading('export');
    setMessage(null);
    try {
      const blob = await exportForSync();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'backup.json';
      a.click();
      URL.revokeObjectURL(url);
      setMessage({ type: 'ok', text: 'ดาวน์โหลด backup.json แล้ว' });
      setTimeout(() => setMessage(null), 2500);
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'ส่งออกไม่สำเร็จ' });
    } finally {
      setLoading(null);
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
      const result = await restoreFromJsonFile(buffer);
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
        title={loading || syncingToCloud ? 'กำลัง sync...' : 'Backup & Sync'}
        aria-label={loading || syncingToCloud ? 'กำลัง sync' : 'Backup & Sync'}
      >
        <Cloud className={`w-5 h-5 ${loading || syncingToCloud ? 'animate-cloud-sync' : ''}`} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 py-1 w-56 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-modal)] z-50">
          <p className="px-3 py-2 text-xs text-[var(--color-text-muted)] border-b border-[var(--color-border)]">
            Backup & Sync
          </p>
          {isOpfsUsed() && (
            <div className="px-3 py-2 border-b border-[var(--color-border)] flex items-center justify-between gap-2">
              <span className="text-xs text-[var(--color-text-muted)]">Sync ขึ้น Cloud อัตโนมัติ</span>
              <button
                type="button"
                role="switch"
                aria-checked={autoSync}
                onClick={() => handleAutoSyncChange(!autoSync)}
                className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border border-[var(--color-border)] transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/50 ${
                  autoSync ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-bg)]'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow ring-0 transition translate-x-0.5 mt-0.5 ${
                    autoSync ? 'translate-x-4' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>
          )}
          <button
            type="button"
            onClick={handleDownloadBackupJson}
            disabled={!!loading}
            className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm text-[var(--color-text)] hover:bg-[var(--color-overlay)] disabled:opacity-50"
          >
            <Download className="w-4 h-4 shrink-0" />
            {loading === 'export' ? 'กำลังส่งออก...' : 'ดาวน์โหลด backup.json'}
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
            {loading === 'restore' ? 'กำลังนำเข้า...' : 'นำเข้าจากไฟล์ backup.json'}
          </button>
          {(lastSynced || isOpfsUsed()) && (
            <button
              type="button"
              onClick={handleTriggerSyncToCloud}
              disabled={!!loading || syncingToCloud}
              className="w-full px-3 py-1.5 text-xs text-left text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-overlay)] border-t border-[var(--color-border)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="กดเพื่อ sync ขึ้น Cloud ตอนนี้"
            >
              {lastSynced
                ? `Sync ขึ้น Cloud ล่าสุด: ${formatLastSynced(lastSynced.updated_at)}`
                : 'กดเพื่อ sync ขึ้น Cloud'}
            </button>
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
