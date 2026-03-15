import { useEffect, useState, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Loader2, AlertCircle, CheckCircle } from 'lucide-react';
import { ensureDb } from '../../db/client';
import * as archtownDb from '../../db/archtownDb';
import { isSyncAvailable, downloadFromCloud } from '../../db/cloudSync';

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
  const [status, setStatus] = useState<'loading' | 'preparing' | 'success' | 'error'>('loading');
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState('');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const preparedRef = useRef(false);

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
      setStatus('preparing');
      return;
    }

    setStatus('error');
    setErrorMessage('ไม่พบ code หรือ error จาก Google');
  }, [searchParams]);

  useEffect(() => {
    if (status !== 'preparing' || preparedRef.current) return;
    preparedRef.current = true;

    (async () => {
      try {
        setProgressLabel('กำลังเตรียมฐานข้อมูล...');
        setProgress(10);
        await ensureDb();
        setProgress(25);

        const syncOk = await isSyncAvailable();
        if (syncOk) {
          setProgressLabel('กำลัง Restore ข้อมูลล่าสุดจาก Cloud...');
          const result = await downloadFromCloud();
          if (result.ok) {
            setProgress(50);
          }
          // ถ้าไม่ ok (404, เข้ารหัส ฯลฯ) ข้ามไปเตรียมข้อมูล local ต่อ
        }
        setProgressLabel('กำลังโหลดและเตรียมข้อมูล...');
        setProgress(55);
        await archtownDb.listProjects();
        setProgress(75);
        await archtownDb.getCapabilityLayout();
        setProgress(100);
        setProgressLabel('พร้อมแล้ว');
        setStatus('success');
        const t = setTimeout(() => {
          window.location.href = '/capability';
        }, 400);
        return () => clearTimeout(t);
      } catch {
        setStatus('error');
        setErrorMessage('โหลดข้อมูลไม่สำเร็จ');
        preparedRef.current = false;
      }
    })();
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
