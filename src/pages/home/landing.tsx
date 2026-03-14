import { useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { LayoutDashboard, ArrowRight, Upload } from 'lucide-react';
import { importYamlFiles } from '../../db/importYaml';

export default function LandingPage() {
  const [importResult, setImportResult] = useState<{ projects: number; teams: number; caps: number; capabilityOrder: boolean; errors: string[] } | null>(null);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImportYaml = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList?.length) return;
    setImporting(true);
    setImportResult(null);
    const files: Array<{ path: string; content: string }> = [];
    try {
      for (let i = 0; i < fileList.length; i++) {
        const file = fileList.item(i);
        if (!file?.name.endsWith('.yaml') && !file?.name.endsWith('.yml')) continue;
        const content = await file.text();
        files.push({ path: file.name, content });
      }
      const result = await importYamlFiles(files);
      setImportResult({
        projects: result.projects,
        teams: result.teams,
        caps: result.caps,
        capabilityOrder: result.capabilityOrder,
        errors: result.errors,
      });
    } catch (err) {
      setImportResult({
        projects: 0,
        teams: 0,
        caps: 0,
        capabilityOrder: false,
        errors: [err instanceof Error ? err.message : String(err)],
      });
    } finally {
      setImporting(false);
      e.target.value = '';
    }
  };

  return (
    <div className="min-h-screen bg-[var(--color-page)] text-[var(--color-text)] font-sans flex flex-col items-center justify-center px-4 relative overflow-hidden">
      <div
        className="absolute inset-0 opacity-[0.4] dark:opacity-[0.15]"
        style={{
          background:
            'radial-gradient(ellipse 80% 60% at 50% 20%, var(--color-primary-muted), transparent 60%)',
        }}
      />
      <div className="absolute bottom-0 left-0 right-0 h-1/3 bg-gradient-to-t from-[var(--color-overlay)] to-transparent pointer-events-none" />

      <div className="relative z-10 text-center max-w-xl mx-auto">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[var(--color-primary)] text-white mb-8 shadow-[var(--shadow-modal)]">
          <LayoutDashboard className="w-8 h-8" />
        </div>
        <h1 className="text-3xl sm:text-4xl font-semibold text-[var(--color-text)] tracking-tight">
          ArchTown
        </h1>
        <p className="mt-3 text-[var(--color-text-muted)] text-lg">
          จัดการโปรเจกต์และความสามารถ — เข้าระบบเพื่อเริ่มต้น
        </p>

        <div className="mt-12 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            to="/capability"
            className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-[var(--color-primary)] text-white font-medium hover:bg-[var(--color-primary-hover)] transition-colors shadow-[var(--shadow-card)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-page)]"
          >
            เข้าระบบ
            <ArrowRight className="w-5 h-5" />
          </Link>
          <label className="inline-flex items-center gap-2 px-5 py-3 rounded-xl border-2 border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] font-medium cursor-pointer hover:bg-[var(--color-overlay)] transition-colors">
            <Upload className="w-5 h-5" />
            {importing ? 'กำลังนำเข้า...' : 'นำเข้าจาก YAML'}
            <input
              ref={fileInputRef}
              type="file"
              accept=".yaml,.yml"
              multiple
              className="sr-only"
              onChange={handleImportYaml}
              disabled={importing}
            />
          </label>
        </div>

        {importResult && (
          <div className="mt-6 p-4 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] text-left text-sm">
            <p className="font-medium text-[var(--color-text)]">ผลการนำเข้า</p>
            <p className="mt-1 text-[var(--color-text-muted)]">
              โปรเจกต์ {importResult.projects} · ทีม {importResult.teams} · กลุ่มความสามารถ {importResult.caps}
              {importResult.capabilityOrder ? ' · ลำดับ Cap' : ''}
            </p>
            {importResult.errors.length > 0 && (
              <ul className="mt-2 text-red-600 dark:text-red-400 list-disc list-inside">
                {importResult.errors.slice(0, 5).map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
                {importResult.errors.length > 5 && <li>... และอีก {importResult.errors.length - 5} รายการ</li>}
              </ul>
            )}
            {(importResult.projects > 0 || importResult.teams > 0 || importResult.caps > 0) && (
              <Link to="/capability" className="mt-3 inline-block text-[var(--color-primary)] font-medium hover:underline">
                ไปที่ TownStation →
              </Link>
            )}
          </div>
        )}

        <p className="mt-8 text-sm text-[var(--color-text-subtle)]">
          หน้า Login กำลังพัฒนา (Coming soon)
        </p>
      </div>
    </div>
  );
}
