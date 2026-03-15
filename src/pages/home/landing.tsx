import { useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { LayoutDashboard, ArrowRight, Upload } from 'lucide-react';
import { importYamlFiles } from '../../db/importYaml';

const GOOGLE_CLIENT_ID = '60952350427-4ofd51gm33p3dg0hfub8n1pqqk90grho.apps.googleusercontent.com';

const GOOGLE_OAUTH_NONCE_KEY = 'archtown_google_oauth_nonce';

function buildGoogleRedirectUrl(clientId: string): string {
  const redirectUri = `${typeof window !== 'undefined' ? window.location.origin : ''}/auth/callback`;
  const nonce = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  sessionStorage.setItem(GOOGLE_OAUTH_NONCE_KEY, nonce);
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'id_token',
    scope: 'openid email profile',
    nonce,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

function handleGoogleRedirectLogin(): void {
  window.location.href = buildGoogleRedirectUrl(GOOGLE_CLIENT_ID);
}

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

        {/* Primary: Google Sign-in (redirect flow — ใช้ได้เสมอ) */}
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-card)]">
          <p className="text-center text-sm font-medium text-[var(--color-text-muted)] mb-4">
            เข้าสู่ระบบเพื่อบันทึกและ sync ข้อมูล
          </p>
          <button
            type="button"
            onClick={handleGoogleRedirectLogin}
            className="w-full flex items-center justify-center gap-2.5 py-3.5 px-4 rounded-xl border-2 border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] font-medium hover:border-[var(--color-primary)] hover:bg-[var(--color-overlay)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-page)] transition-all duration-200"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" aria-hidden>
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            <span>ลงชื่อเข้าใช้ด้วย Google</span>
          </button>
          {(import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV && typeof window !== 'undefined' && (
            <div className="mt-3 p-2 rounded-lg bg-[var(--color-overlay)] text-xs text-[var(--color-text-muted)] text-left space-y-1">
              <p className="font-medium text-[var(--color-text)]">ตรวจสอบค่า (สำหรับไล่สาเหตุ)</p>
              <p><strong>Origin:</strong> <code className="break-all">{window.location.origin}</code></p>
              <p><strong>Client ID:</strong> <code className="break-all text-[0.65rem]">{GOOGLE_CLIENT_ID}</code></p>
              <p><strong>Redirect URI:</strong> <code className="break-all">{window.location.origin}/auth/callback</code></p>
            </div>
          )}
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
