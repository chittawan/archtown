import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, KeyRound, User } from 'lucide-react';
import { redirectToGoogleLogin, setTokenLoginIdentity } from '../../lib/googleAuth';
import { prepareAfterLogin } from '../../lib/prepareAfterLogin';

type LoginStatus =
  | { state: 'idle' }
  | { state: 'loading'; progress: number; label: string }
  | { state: 'error'; message: string }
  | { state: 'success' };

async function loginWithToken(token: string): Promise<{
  googleId: string;
  expiresAt?: string | null;
  tokenId?: string;
}> {
  const res = await fetch('/api/auth/token/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    googleId?: string;
    expiresAt?: string | null;
    tokenId?: string;
    error?: string;
  };
  if (!res.ok || data.ok === false) throw new Error(data.error || `HTTP ${res.status}`);
  if (!data.googleId) throw new Error('Invalid response');
  return { googleId: data.googleId, expiresAt: data.expiresAt ?? null, tokenId: data.tokenId };
}

export default function LoginPage() {
  const [token, setToken] = useState('');
  const [status, setStatus] = useState<LoginStatus>({ state: 'idle' });
  const tokenInputRef = useRef<HTMLInputElement>(null);

  const canSubmit = useMemo(() => token.trim().length >= 10 && status.state !== 'loading', [token, status.state]);

  useEffect(() => {
    if (status.state === 'loading') return;
    tokenInputRef.current?.focus();
  }, [status.state]);

  const onSubmitToken = async (e: React.FormEvent) => {
    e.preventDefault();
    const t = token.trim();
    if (!t) return;
    setStatus({ state: 'loading', progress: 0, label: 'กำลังตรวจสอบ Token...' });
    try {
      const result = await loginWithToken(t);
      setTokenLoginIdentity({
        googleId: result.googleId,
        token: t,
        tokenId: result.tokenId,
      });
      await prepareAfterLogin((s) => setStatus({ state: 'loading', progress: s.progress, label: s.label }));
      setStatus({ state: 'success' });
      window.location.href = '/capability';
    } catch (err) {
      setStatus({ state: 'error', message: err instanceof Error ? err.message : 'เข้าสู่ระบบไม่สำเร็จ' });
    }
  };

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4">
      <div className="w-full max-w-lg">
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-card)] overflow-hidden">
          <div className="p-6 border-b border-[var(--color-border)]">
            <h2 className="text-xl font-semibold text-[var(--color-text)]">Login</h2>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">
              ใช้ได้ทั้ง <span className="font-medium text-[var(--color-text)]">AI Login Token</span> หรือ <span className="font-medium text-[var(--color-text)]">Google</span> (สำหรับ Cloud Sync)
            </p>
          </div>

          <div className="p-6 space-y-6">
            <form onSubmit={onSubmitToken} className="space-y-3">
              <label className="block text-sm font-medium text-[var(--color-text)]">
                AI Login Token
              </label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <KeyRound className="w-4 h-4 text-[var(--color-text-subtle)] absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    ref={tokenInputRef}
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder="วาง Token ที่ได้รับ (เช่น atkn_...)"
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-page)] text-[var(--color-text)] placeholder:text-[var(--color-text-subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/40"
                    autoComplete="off"
                    spellCheck={false}
                  />
                </div>
                <button
                  type="submit"
                  disabled={!canSubmit}
                  className="px-4 py-2.5 rounded-xl bg-[var(--color-primary)] text-white font-medium hover:bg-[var(--color-primary-hover)] disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
                >
                  {status.state === 'loading' ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  เข้าสู่ระบบ
                </button>
              </div>
              <p className="text-xs text-[var(--color-text-muted)]">
                Token จะผูกกับ <code className="px-1 py-0.5 rounded bg-[var(--color-overlay)]">googleId</code> เพื่อให้เข้าถึงข้อมูล Cloud ของ user นั้นได้
              </p>
            </form>

            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-[var(--color-border)]" />
              <span className="text-xs text-[var(--color-text-subtle)]">หรือ</span>
              <div className="h-px flex-1 bg-[var(--color-border)]" />
            </div>

            <button
              type="button"
              onClick={() => redirectToGoogleLogin()}
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

            {status.state === 'loading' && (
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-overlay)] p-4">
                <div className="flex items-center gap-2 text-sm text-[var(--color-primary)]">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {status.label}
                </div>
                <div className="mt-3 h-2 rounded-full bg-[var(--color-page)] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[var(--color-primary)] transition-all duration-300 ease-out"
                    style={{ width: `${Math.max(5, status.progress)}%` }}
                  />
                </div>
                <div className="mt-2 text-xs text-[var(--color-text-muted)]">{status.progress}%</div>
              </div>
            )}

            {status.state === 'error' && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-700 dark:text-red-300">
                {status.message}
              </div>
            )}

            <div className="text-xs text-[var(--color-text-muted)]">
              ต้องการสร้าง Token? ไปที่{' '}
              <Link className="text-[var(--color-primary)] hover:underline" to="/admin/generate-token">
                Generate Token
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
