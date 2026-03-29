import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Loader2, AlertCircle, CheckCircle } from 'lucide-react';
import { prepareAfterLogin } from '../../lib/prepareAfterLogin';
import { formatUnknownError } from '../../lib/formatUnknownError';
import { AUTH_ID_TOKEN_KEY, OAUTH_FRAGMENT_CONSUMED_KEY } from '../../lib/googleAuth';

const AUTH_CODE_KEY = 'archtown_oauth_code';
const GOOGLE_OAUTH_NONCE_KEY = 'archtown_google_oauth_nonce';

function stripUrlHash(): void {
  if (!window.location.hash) return;
  const { pathname, search } = window.location;
  window.history.replaceState(null, '', `${pathname}${search}`);
}

/**
 * Parse OAuth/OpenID fragment (e.g. id_token=...&authuser=0). Use URLSearchParams so values
 * may contain "=" (JWT padding) — manual split on "=" breaks tokens.
 */
function parseFragmentParams(hash: string): Record<string, string> {
  const stripped = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!stripped) return {};
  const usp = new URLSearchParams(stripped);
  const params: Record<string, string> = {};
  usp.forEach((value, key) => {
    if (key) params[key] = value;
  });
  return params;
}

/** React 18 StrictMode (dev) mounts twice; share one prepare so SQLite/sync is not started twice. */
let prepareAfterLoginShared: Promise<void> | null = null;

export default function AuthCallbackPage() {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<'loading' | 'preparing' | 'success' | 'error'>('loading');
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState('');
  const [errorMessage, setErrorMessage] = useState<string>('');

  useEffect(() => {
    // StrictMode remount: hash ถูก strip แล้วแต่ token / auth code เก็บไว้แล้ว
    if (sessionStorage.getItem(OAUTH_FRAGMENT_CONSUMED_KEY) === '1') {
      const hasToken = !!sessionStorage.getItem(AUTH_ID_TOKEN_KEY);
      const hasCode = !!sessionStorage.getItem(AUTH_CODE_KEY);
      if (hasToken || hasCode) {
        stripUrlHash();
        setStatus('preparing');
        return;
      }
    }

    // Implicit flow: id_token and optional error in hash
    const hash = window.location.hash;
    if (hash) {
      const params = parseFragmentParams(hash);
      const hashError = params.error;
      const hashErrorDescription = params.error_description || hashError;
      const idToken = params.id_token;
      const nonce = params.nonce;

      if (hashError) {
        setStatus('error');
        setErrorMessage(hashErrorDescription || hashError);
        return;
      }

      if (idToken) {
        const trimmed = idToken.trim();
        if (!trimmed) {
          setStatus('error');
          setErrorMessage('id_token ว่าง');
          return;
        }
        const storedNonce = sessionStorage.getItem(GOOGLE_OAUTH_NONCE_KEY);
        if (storedNonce && nonce && storedNonce !== nonce) {
          setStatus('error');
          setErrorMessage('nonce ไม่ตรงกัน');
          return;
        }
        sessionStorage.removeItem(GOOGLE_OAUTH_NONCE_KEY);
        sessionStorage.setItem(AUTH_ID_TOKEN_KEY, trimmed);
        sessionStorage.setItem(OAUTH_FRAGMENT_CONSUMED_KEY, '1');
        stripUrlHash();
        setStatus('preparing');
        return;
      }
    }

    // Auth code flow: code and error in query
    const code = searchParams.get('code');
    const error = searchParams.get('error');
    const errorDescription = searchParams.get('error_description') || '';

    if (error) {
      setStatus('error');
      setErrorMessage(errorDescription || error);
      return;
    }

    if (code) {
      sessionStorage.setItem(AUTH_CODE_KEY, code);
      sessionStorage.setItem(OAUTH_FRAGMENT_CONSUMED_KEY, '1');
      setStatus('preparing');
      return;
    }

    setStatus('error');
    setErrorMessage('ไม่พบ code หรือ error จาก Google');
  }, [searchParams]);

  useEffect(() => {
    if (status !== 'preparing') return;

    if (!prepareAfterLoginShared) {
      prepareAfterLoginShared = prepareAfterLogin((s) => {
        setProgressLabel(s.label);
        setProgress(s.progress);
      });
    }

    void prepareAfterLoginShared
      .then(() => {
        setStatus('success');
      })
      .catch((err) => {
        prepareAfterLoginShared = null;
        sessionStorage.removeItem(OAUTH_FRAGMENT_CONSUMED_KEY);
        sessionStorage.removeItem(AUTH_ID_TOKEN_KEY);
        sessionStorage.removeItem(AUTH_CODE_KEY);
        setStatus('error');
        setErrorMessage(formatUnknownError(err, 'โหลดข้อมูลไม่สำเร็จ'));
        console.error('[auth/callback] prepareAfterLogin failed', err);
      });
  }, [status]);

  // แยกจาก effect ด้านบน: เมื่อ status เปลี่ยน preparing→success React จะรัน cleanup ของ effect เดิม
  // ถ้าใส่ setTimeout ไว้ในนั้น cleanup จะ clearTimeout ทิ้ง — หน้าค้างที่ “สำเร็จ” โดยไม่ไป /capability
  useEffect(() => {
    if (status !== 'success') return;
    const t = setTimeout(() => {
      window.location.href = '/capability';
    }, 400);
    return () => clearTimeout(t);
  }, [status]);

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

      <div className="relative z-10 text-center max-w-md mx-auto">
        {status === 'loading' && (
          <>
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[var(--color-primary)] text-white mb-6 shadow-[var(--shadow-modal)]">
              <Loader2 className="w-8 h-8 animate-spin" />
            </div>
            <h1 className="text-xl font-semibold text-[var(--color-text)]">
              กำลังเข้าสู่ระบบ...
            </h1>
            <p className="mt-2 text-[var(--color-text-muted)]">
              รอสักครู่
            </p>
          </>
        )}

        {status === 'preparing' && (
          <>
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[var(--color-primary)] text-white mb-6 shadow-[var(--shadow-modal)]">
              <Loader2 className="w-8 h-8 animate-spin" />
            </div>
            <h1 className="text-xl font-semibold text-[var(--color-text)]">
              กำลังโหลด
            </h1>
            <p className="mt-2 text-sm text-[var(--color-text-muted)] min-h-[1.25rem]">
              {progressLabel || 'กำลังโหลดและเตรียมข้อมูล'}
            </p>
            <div className="mt-6 w-full max-w-[280px] mx-auto">
              <div className="h-2 rounded-full bg-[var(--color-overlay)] overflow-hidden">
                <div
                  className="h-full rounded-full bg-[var(--color-primary)] transition-all duration-300 ease-out"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="mt-2 text-sm font-medium text-[var(--color-text-muted)]">
                {progress}%
              </p>
            </div>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[var(--color-primary)] text-white mb-6 shadow-[var(--shadow-modal)]">
              <CheckCircle className="w-8 h-8" />
            </div>
            <h1 className="text-xl font-semibold text-[var(--color-text)]">
              เข้าสู่ระบบสำเร็จ
            </h1>
            <p className="mt-2 text-[var(--color-text-muted)]">
              กำลังพาคุณไปหน้า TownStation
            </p>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-red-500/20 text-red-600 dark:text-red-400 mb-6">
              <AlertCircle className="w-8 h-8" />
            </div>
            <h1 className="text-xl font-semibold text-[var(--color-text)]">
              เข้าสู่ระบบไม่สำเร็จ
            </h1>
            <p className="mt-2 text-[var(--color-text-muted)]">
              {errorMessage}
            </p>
            <div className="mt-4 p-3 rounded-lg bg-[var(--color-overlay)] text-xs text-left w-full max-w-md space-y-2">
              <p className="font-medium text-[var(--color-text)]">สิ่งที่ได้รับจาก Google (สำหรับตรวจสอบ):</p>
              <p>
                <strong>Hash:</strong>{' '}
                <code className="break-all text-[0.65rem]">{window.location.hash || '(ว่าง)'}</code>
              </p>
              <p>
                <strong>Query:</strong>{' '}
                <code className="break-all text-[0.65rem]">{window.location.search || '(ว่าง)'}</code>
              </p>
              {!window.location.hash && !window.location.search ? (
                <p className="text-[var(--color-text-muted)] pt-1 border-t border-[var(--color-border)]">
                  Hash/Query ว่างเป็นปกติหลังระบบอ่าน token แล้ว (หรือหลัง refresh) — ถ้าเข้าไม่ได้
                  ให้กลับหน้าแรกแล้วล็อกอิน Google ใหม่
                </p>
              ) : null}
            </div>
            <Link
              to="/"
              className="mt-6 inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-[var(--color-primary)] text-white font-medium hover:bg-[var(--color-primary-hover)] transition-colors"
            >
              กลับหน้าแรก
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
