import { useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { GoogleLogin } from '@react-oauth/google';
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

      <div className="relative z-10 w-full max-w-[400px] mx-auto">
        {/* Hero */}
        <div className="text-center mb-10">
          <div
            className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[var(--color-primary)] text-white mb-6"
            style={{ boxShadow: 'var(--shadow-modal)' }}
          >
            <LayoutDashboard className="w-7 h-7" strokeWidth={2} />
          </div>
          <h1 className="text-3xl font-semibold text-[var(--color-text)] tracking-tight">
            ArchTown
          </h1>
          <p className="mt-2 text-[var(--color-text-muted)] text-base leading-relaxed">
            จัดการโปรเจกต์และความสามารถ
          </p>
        </div>

        {/* Primary: Google Sign-in card */}
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-card)]">
          <p className="text-center text-sm font-medium text-[var(--color-text-muted)] mb-4">
            เข้าสู่ระบบเพื่อบันทึกและ sync ข้อมูล
          </p>
          <div className="flex justify-center [&>div]:!min-w-0">
            <GoogleLogin
              onSuccess={(credentialResponse) => {
                console.log(credentialResponse);
                window.location.href = '/capability';
              }}
              onError={() => {
                console.log('Login Failed');
              }}
              theme="outline"
              size="large"
              text="signin_with"
              shape="rectangular"
              width="100%"
              containerProps={{
                className: 'w-full max-w-[280px] mx-auto',
              }}
            />
          </div>
        </div>

        {/* Divider */}
        <div className="flex items-center gap-4 my-6">
          <span className="flex-1 h-px bg-[var(--color-border)]" />
          <span className="text-xs font-medium text-[var(--color-text-subtle)] uppercase tracking-wider">
            หรือ
          </span>
          <span className="flex-1 h-px bg-[var(--color-border)]" />
        </div>

        {/* Secondary actions */}
        <div className="flex flex-col gap-3">
          <Link
            to="/capability"
            className="group flex items-center justify-center gap-2.5 w-full py-3.5 px-4 rounded-xl border-2 border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] font-medium hover:border-[var(--color-primary)] hover:bg-[var(--color-overlay)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-page)] transition-all duration-200"
          >
            <span>เข้าระบบโดยไม่ล็อกอิน</span>
            <ArrowRight className="w-4 h-4 opacity-70 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
          </Link>
          <label className="flex items-center justify-center gap-2.5 w-full py-3.5 px-4 rounded-xl border-2 border-dashed border-[var(--color-border)] bg-transparent text-[var(--color-text-muted)] font-medium cursor-pointer hover:border-[var(--color-primary)] hover:text-[var(--color-text)] hover:bg-[var(--color-overlay)] focus-within:ring-2 focus-within:ring-[var(--color-primary)] focus-within:ring-offset-2 focus-within:ring-offset-[var(--color-page)] transition-all duration-200">
            <Upload className="w-4 h-4" />
            <span>{importing ? 'กำลังนำเข้า...' : 'นำเข้าจาก YAML'}</span>
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
          <div className="mt-6 p-4 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] text-left text-sm shadow-[var(--shadow-card)]">
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

      </div>
    </div>
  );
}
