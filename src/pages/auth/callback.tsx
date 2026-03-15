import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Loader2, AlertCircle, CheckCircle } from 'lucide-react';

const AUTH_CODE_KEY = 'archtown_oauth_code';
const AUTH_ID_TOKEN_KEY = 'archtown_id_token';
const GOOGLE_OAUTH_NONCE_KEY = 'archtown_google_oauth_nonce';

function parseHashParams(hash: string): Record<string, string> {
  const params: Record<string, string> = {};
  const stripped = hash.startsWith('#') ? hash.slice(1) : hash;
  stripped.split('&').forEach((pair) => {
    const [key, value] = pair.split('=');
    if (key && value) params[decodeURIComponent(key)] = decodeURIComponent(value);
  });
  return params;
}

export default function AuthCallbackPage() {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState<string>('');

  useEffect(() => {
    // Implicit flow: id_token and optional error in hash
    const hash = window.location.hash;
    if (hash) {
      const params = parseHashParams(hash);
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
        const storedNonce = sessionStorage.getItem(GOOGLE_OAUTH_NONCE_KEY);
        if (storedNonce && nonce && storedNonce !== nonce) {
          setStatus('error');
          setErrorMessage('nonce ไม่ตรงกัน');
          return;
        }
        sessionStorage.removeItem(GOOGLE_OAUTH_NONCE_KEY);
        sessionStorage.setItem(AUTH_ID_TOKEN_KEY, idToken);
        setStatus('success');
        const t = setTimeout(() => {
          window.location.href = '/capability';
        }, 800);
        return () => clearTimeout(t);
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
      setStatus('success');
      const t = setTimeout(() => {
        window.location.href = '/capability';
      }, 800);
      return () => clearTimeout(t);
    }

    setStatus('error');
    setErrorMessage('ไม่พบ code หรือ error จาก Google');
  }, [searchParams]);

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
            <div className="mt-4 p-3 rounded-lg bg-[var(--color-overlay)] text-xs text-left w-full max-w-md">
              <p className="font-medium text-[var(--color-text)] mb-2">สิ่งที่ได้รับจาก Google (สำหรับตรวจสอบ):</p>
              <p><strong>Hash:</strong> <code className="break-all text-[0.65rem]">{window.location.hash || '(ว่าง)'}</code></p>
              <p className="mt-1"><strong>Query:</strong> <code className="break-all text-[0.65rem]">{window.location.search || '(ว่าง)'}</code></p>
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
