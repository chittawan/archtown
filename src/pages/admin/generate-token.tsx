import { useEffect, useMemo, useState } from 'react';
import { Copy, KeyRound, CalendarClock, Loader2 } from 'lucide-react';
import { getGoogleUserId, getLoginKind } from '../../lib/googleAuth';

type GenerateStatus =
  | { state: 'idle' }
  | { state: 'loading' }
  | { state: 'error'; message: string }
  | { state: 'success'; token: string; googleId: string; expiresAt: string | null };

async function generateToken(input: { googleId: string; expiresAt: string | null; adminKey?: string }): Promise<{ token: string; googleId: string; expiresAt: string | null }> {
  const res = await fetch('/api/auth/token/generate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(input.adminKey ? { 'X-Admin-Key': input.adminKey } : {}),
    },
    body: JSON.stringify({ googleId: input.googleId, expiresAt: input.expiresAt }),
  });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; token?: string; googleId?: string; expiresAt?: string | null; error?: string };
  if (!res.ok || data.ok === false) throw new Error(data.error || `HTTP ${res.status}`);
  if (!data.token || !data.googleId) throw new Error('Invalid response');
  return { token: data.token, googleId: data.googleId, expiresAt: data.expiresAt ?? null };
}

type ExpirePreset = 'no-expire' | '1w' | '1m' | '3m' | '1y';

function computeExpiresAt(preset: ExpirePreset): string | null {
  if (preset === 'no-expire') return null;
  const now = new Date();
  const d = new Date(now);
  if (preset === '1w') d.setDate(d.getDate() + 7);
  if (preset === '1m') d.setMonth(d.getMonth() + 1);
  if (preset === '3m') d.setMonth(d.getMonth() + 3);
  if (preset === '1y') d.setFullYear(d.getFullYear() + 1);
  return d.toISOString();
}

export default function GenerateTokenPage() {
  const [googleId, setGoogleId] = useState('');
  const [expirePreset, setExpirePreset] = useState<ExpirePreset>('no-expire');
  const [adminKey, setAdminKey] = useState('');
  const [needsAdminKey, setNeedsAdminKey] = useState(false);
  const [status, setStatus] = useState<GenerateStatus>({ state: 'idle' });
  const loginKind = getLoginKind();

  useEffect(() => {
    // When logged in with Google, we can read `sub` from the Google id_token stored in sessionStorage.
    if (loginKind !== 'google') return;
    const id = getGoogleUserId();
    if (id) setGoogleId(id);
  }, [loginKind]);

  const canGenerate = useMemo(
    () => loginKind === 'google' && googleId.trim().length > 0 && status.state !== 'loading',
    [googleId, loginKind, status.state]
  );

  const onGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus({ state: 'loading' });
    try {
      if (loginKind !== 'google') throw new Error('ต้องล็อกอินด้วย Google ก่อนถึงจะ Generate Token ได้');
      const expiresAt = computeExpiresAt(expirePreset);
      const r = await generateToken({ googleId: googleId.trim(), expiresAt, adminKey: adminKey.trim() || undefined });
      setStatus({ state: 'success', token: r.token, googleId: r.googleId, expiresAt: r.expiresAt });
      setNeedsAdminKey(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Generate ไม่สำเร็จ';
      if (msg.toLowerCase().includes('unauthorized') || msg.includes('401')) {
        setNeedsAdminKey(true);
        setStatus({ state: 'error', message: 'Server ต้องการ Admin key (ARCHTOWN_ADMIN_KEY) เพื่อ Generate Token' });
        return;
      }
      setStatus({ state: 'error', message: msg });
    }
  };

  const copy = async () => {
    if (status.state !== 'success') return;
    try {
      await navigator.clipboard.writeText(status.token);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-card)] overflow-hidden">
        <div className="p-6 border-b border-[var(--color-border)]">
          <h2 className="text-xl font-semibold text-[var(--color-text)]">Generate AI Login Token</h2>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            Token นี้ใช้แทน “Login with Google” เพื่อระบุ <code className="px-1 py-0.5 rounded bg-[var(--color-overlay)]">googleId</code> สำหรับ Cloud Sync
          </p>
        </div>

        <form onSubmit={onGenerate} className="p-6 space-y-4">
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-overlay)] p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-[var(--color-text)]">
              <CalendarClock className="w-4 h-4" />
              Expire
            </div>
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">ค่าเริ่มต้นเป็น <span className="font-medium">No-expire</span></p>
            <div className="mt-3">
              <select
                value={expirePreset}
                onChange={(e) => setExpirePreset(e.target.value as ExpirePreset)}
                className="w-full px-3 py-2.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-page)] text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/40"
              >
                <option value="no-expire">No-expire</option>
                <option value="1w">1 Week</option>
                <option value="1m">1 Month</option>
                <option value="3m">3 Month</option>
                <option value="1y">1 Year</option>
              </select>
              <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                จะบันทึกหมดอายุเป็นเวลา UTC บน server (หรือไม่หมดอายุ)
              </p>
            </div>
          </div>

          {needsAdminKey && (
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-overlay)] p-4">
              <label className="block text-sm font-medium text-[var(--color-text)]">Admin key</label>
              <input
                value={adminKey}
                onChange={(e) => setAdminKey(e.target.value)}
                placeholder="ARCHTOWN_ADMIN_KEY"
                className="mt-2 w-full px-3 py-2.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-page)] text-[var(--color-text)] placeholder:text-[var(--color-text-subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/40"
                autoComplete="off"
                spellCheck={false}
              />
              <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                ใส่เฉพาะกรณี server ตั้งค่า <code className="px-1 py-0.5 rounded bg-[var(--color-page)]">ARCHTOWN_ADMIN_KEY</code>
              </p>
            </div>
          )}

          <button
            type="submit"
            disabled={!canGenerate}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--color-primary)] text-white font-medium hover:bg-[var(--color-primary-hover)] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {status.state === 'loading' ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
            Generate Token
          </button>

          {loginKind !== 'google' && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-800 dark:text-amber-200">
              ต้องล็อกอินด้วย Google ก่อน ถึงจะ Generate Token ได้
            </div>
          )}

          {status.state === 'error' && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-700 dark:text-red-300">
              {status.message}
            </div>
          )}

          {status.state === 'success' && (
            <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-page)] p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-[var(--color-text)]">Token (แสดงครั้งเดียว)</div>
                  <div className="mt-2 font-mono text-xs break-all text-[var(--color-text)] bg-[var(--color-overlay)] rounded-xl p-3">
                    {status.token}
                  </div>
                  <div className="mt-2 text-xs text-[var(--color-text-muted)]">
                    googleId: <code className="px-1 py-0.5 rounded bg-[var(--color-overlay)]">{status.googleId}</code>
                    {' · '}
                    expires: <code className="px-1 py-0.5 rounded bg-[var(--color-overlay)]">{status.expiresAt ?? 'no-expire'}</code>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={copy}
                  className="shrink-0 inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] hover:bg-[var(--color-overlay)]"
                >
                  <Copy className="w-4 h-4" />
                  Copy
                </button>
              </div>
              <p className="mt-3 text-xs text-[var(--color-text-muted)]">
                นำ Token นี้ไปกรอกที่หน้า <code className="px-1 py-0.5 rounded bg-[var(--color-overlay)]">/login</code> เพื่อเข้าสู่ระบบแบบปกติ
              </p>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}

