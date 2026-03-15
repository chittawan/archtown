import { useState, useEffect, useRef } from 'react';
import { Outlet, Link, useLocation, useSearchParams, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Sun, Moon, Users, Layers, PanelRightOpen, PanelRightClose, ListTodo, BarChart3, FolderKanban, User, LogOut, CloudUpload, Download, Loader2 } from 'lucide-react';
import SummaryStatusPanel from './SummaryStatusPanel.tsx';
import TodoPanel from './TodoPanel.tsx';
import { ComponentSearchModal } from './ComponentSearchModal.tsx';
import { DbStatusBar } from './DbStatusBar.tsx';
import { CloudSync } from './CloudSync.tsx';
import { isGoogleLoggedIn, logoutGoogle, redirectToGoogleLogin, getGoogleUserInfo, emailInitials } from '../../lib/googleAuth';
import { clearAppData } from '../../lib/clearAppData';
import { exportForSync } from '../../db/sync';
import { uploadToCloud, isSyncAvailable } from '../../db/cloudSync';
import { scheduleSyncToCloud } from '../../db/cloudSyncScheduler';

const navItems = [
  { path: '/capability', label: 'TownStation', icon: Layers },
  // { path: '/project', label: 'Projects', icon: FolderKanban }, // ซ่อนไว้ก่อน
  { path: '/tasks', label: 'Tasks', icon: ListTodo },
  { path: '/teams', label: 'Teams', icon: Users },
];

const RIGHT_PANEL_STORAGE_KEY = 'archtown-right-panel-open';
type RightPanelTab = 'summary' | 'todo';

/** รูปโปรไฟล์ Google — ถ้าโหลดไม่ได้ (ถูก block) แสดง initial แทน */
function GoogleAvatarPicture({ src, fallbackInitial }: { src: string; fallbackInitial: string | null }) {
  const [errored, setErrored] = useState(false);
  if (errored) {
    return (
      <span className="text-xs font-semibold text-[var(--color-text)]">
        {fallbackInitial ?? '?'}
      </span>
    );
  }
  return (
    <img
      src={src}
      alt=""
      className="w-full h-full object-cover"
      referrerPolicy="strict-origin-when-cross-origin"
      onError={() => setErrored(true)}
    />
  );
}

export default function AppLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isProjectPage = location.pathname === '/project';
  const projectIdFromUrl = isProjectPage ? searchParams.get('id') : null;
  const [rightPanelTab, setRightPanelTab] = useState<RightPanelTab>('summary');
  const [rightPanelOpen, setRightPanelOpen] = useState(() => {
    if (typeof window === 'undefined') return true;
    const stored = localStorage.getItem(RIGHT_PANEL_STORAGE_KEY);
    if (stored === 'false') return false;
    if (stored === 'true') return true;
    return true;
  });
  const [isDark, setIsDark] = useState(() => {
    if (typeof window === 'undefined') return false;
    const stored = localStorage.getItem('theme');
    if (stored === 'dark') return true;
    if (stored === 'light') return false;
    return document.documentElement.classList.contains('dark');
  });
  const [componentSearchOpen, setComponentSearchOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [googleUser, setGoogleUser] = useState(false);
  const googleUserInfo = googleUser ? getGoogleUserInfo() : { picture: undefined, email: undefined };
  const [logoutModalOpen, setLogoutModalOpen] = useState(false);
  const [logoutBackingUp, setLogoutBackingUp] = useState(false);
  const [syncAvailable, setSyncAvailable] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const cmdKChordRef = useRef(false);

  useEffect(() => {
    setGoogleUser(isGoogleLoggedIn());
  }, []);

  useEffect(() => {
    const onDataSaved = () => scheduleSyncToCloud();
    window.addEventListener('archtown-data-saved', onDataSaved);
    return () => window.removeEventListener('archtown-data-saved', onDataSaved);
  }, []);

  useEffect(() => {
    if (!logoutModalOpen) return;
    isSyncAvailable().then(setSyncAvailable);
  }, [logoutModalOpen]);

  useEffect(() => {
    if (!userMenuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener('click', onDocClick, true);
    return () => document.removeEventListener('click', onDocClick, true);
  }, [userMenuOpen]);

  /** Shortcut: ⌘K then S = Component Search; 1/2/3 = ไปหน้า capability/tasks/teams; C/D = project collapse/expand */
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/i.test(navigator.platform);
      const mod = isMac ? e.metaKey : e.ctrlKey;

      if (cmdKChordRef.current) {
        if (e.key === 's' || e.key === 'S') {
          setComponentSearchOpen(true);
          cmdKChordRef.current = false;
          e.preventDefault();
          return;
        }
        if (e.key === '1') {
          navigate('/capability');
          cmdKChordRef.current = false;
          e.preventDefault();
          return;
        }
        if (e.key === '2') {
          navigate('/tasks');
          cmdKChordRef.current = false;
          e.preventDefault();
          return;
        }
        if (e.key === '3') {
          navigate('/teams');
          cmdKChordRef.current = false;
          e.preventDefault();
          return;
        }
        if (e.key === 'c') {
          window.dispatchEvent(new CustomEvent('archtown-cmdk-c'));
          cmdKChordRef.current = false;
          e.preventDefault();
          return;
        }
        if (e.key === 'd') {
          window.dispatchEvent(new CustomEvent('archtown-cmdk-d'));
          cmdKChordRef.current = false;
          e.preventDefault();
          return;
        }
        cmdKChordRef.current = false;
        return;
      }

      if (mod && e.key === 'k') {
        cmdKChordRef.current = true;
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [navigate]);

  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      root.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [isDark]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(RIGHT_PANEL_STORAGE_KEY, String(rightPanelOpen));
  }, [rightPanelOpen]);

  return (
    <div className="min-h-screen bg-[var(--color-page)] text-[var(--color-text)] font-sans transition-colors">
      <header className="bg-[var(--color-surface)] border-b border-[var(--color-border)] sticky top-0 z-20 shadow-[var(--shadow-card)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-6">
            <Link to="/" className="flex items-center space-x-3">
              <div className="bg-[var(--color-primary)] p-2 rounded-lg">
                <LayoutDashboard className="w-5 h-5 text-white" />
              </div>
              <h1 className="text-xl font-semibold text-[var(--color-text)]">ArchTown</h1>
            </Link>
            <nav className="hidden sm:flex items-center gap-1">
              {navItems.map(({ path, label, icon: Icon }) => {
                const isActive = location.pathname === path;
                const isCapability = path === '/capability';
                return (
                  <Link
                    key={path}
                    to={path}
                    onClick={() => {
                      if (isCapability) {
                        sessionStorage.setItem('capability-refresh', '1');
                        setTimeout(() => {
                          window.dispatchEvent(new CustomEvent('capability-refresh'));
                        }, 0);
                      }
                    }}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-[var(--color-primary-muted)] text-[var(--color-primary)]'
                        : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-overlay)]'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {label}
                  </Link>
                );
              })}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <DbStatusBar />
            <CloudSync />
            <div className="relative" ref={userMenuRef}>
              <button
                type="button"
                onClick={() => setUserMenuOpen((o) => !o)}
                className="flex items-center justify-center p-2 rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-overlay)] transition-colors"
                title={googleUser ? 'บัญชี Google' : 'Guest'}
                aria-label={googleUser ? 'Google account menu' : 'Guest menu'}
                aria-expanded={userMenuOpen}
              >
                <div className="w-8 h-8 rounded-full bg-[var(--color-overlay)] flex items-center justify-center border border-[var(--color-border)] overflow-hidden shrink-0">
                  {googleUser ? (
                    googleUserInfo.picture ? (
                      <GoogleAvatarPicture
                        src={googleUserInfo.picture}
                        fallbackInitial={googleUserInfo.email ? emailInitials(googleUserInfo.email) : null}
                      />
                    ) : googleUserInfo.email ? (
                      <span className="text-xs font-semibold text-[var(--color-text)]">
                        {emailInitials(googleUserInfo.email)}
                      </span>
                    ) : (
                      <User className="w-4 h-4" />
                    )
                  ) : (
                    <span className="text-xs font-semibold text-[var(--color-text)]">G</span>
                  )}
                </div>
              </button>
              {userMenuOpen && (
                <div
                  className="absolute right-0 top-full mt-1 py-1 min-w-[180px] rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-modal)] z-50"
                  role="menu"
                >
                  {googleUser ? (
                    <>
                      <div className="px-3 py-2 text-xs text-[var(--color-text-muted)] border-b border-[var(--color-border)]">
                        ลงชื่อเข้าใช้ด้วย Google แล้ว
                      </div>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setUserMenuOpen(false);
                          setLogoutModalOpen(true);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[var(--color-text)] hover:bg-[var(--color-overlay)] text-left"
                      >
                        <LogOut className="w-4 h-4" />
                        Logout
                      </button>
                    </>
                  ) : (
                    <>
                      <div className="px-3 py-2 text-xs text-[var(--color-text-muted)] border-b border-[var(--color-border)]">
                        กำลังใช้เป็น Guest
                      </div>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setUserMenuOpen(false);
                          redirectToGoogleLogin();
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[var(--color-text)] hover:bg-[var(--color-overlay)] text-left"
                      >
                        <User className="w-4 h-4" />
                        Sync with Google
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => setRightPanelOpen((o) => !o)}
              className="p-2 rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-overlay)] transition-colors"
              title={rightPanelOpen ? 'ปิดแผงขวา' : 'เปิดแผงขวา'}
              aria-label={rightPanelOpen ? 'Close right panel' : 'Open right panel'}
            >
              {rightPanelOpen ? <PanelRightClose className="w-5 h-5" /> : <PanelRightOpen className="w-5 h-5" />}
            </button>
            <button
              type="button"
              onClick={() => setIsDark((d) => !d)}
              className="p-2 rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-overlay)] transition-colors"
              title={isDark ? 'สลับเป็น Light' : 'สลับเป็น Dark'}
              aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
            >
              {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </header>
      <div className="flex flex-1 min-h-0 w-full max-w-[1920px] mx-auto">
        <main className={`flex-1 min-w-0 px-4 sm:px-6 lg:px-8 py-8 transition-[margin] ${rightPanelOpen ? 'lg:mr-0' : ''}`}>
          <Outlet />
        </main>
        {rightPanelOpen && (
          <>
            {/* Backdrop on small screens: tap to close panel */}
            <div
              className="fixed inset-0 top-16 bg-black/20 z-20 lg:hidden"
              aria-hidden
              onClick={() => setRightPanelOpen(false)}
            />
            <aside
              className="flex flex-col w-[320px] shrink-0 border-l border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden fixed lg:relative inset-y-0 right-0 top-16 lg:top-auto z-30 lg:z-auto"
              aria-label="Summary status"
            >
            <div className="sticky top-16 h-[calc(100vh-4rem)] overflow-y-auto flex flex-col">
              <div className="p-4 border-b border-[var(--color-border)] bg-[var(--color-overlay)] shrink-0">
                <div className="flex rounded-lg p-0.5 bg-[var(--color-page)] border border-[var(--color-border)]">
                  <button
                    type="button"
                    onClick={() => setRightPanelTab('summary')}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                      rightPanelTab === 'summary'
                        ? 'bg-[var(--color-surface)] text-[var(--color-primary)] shadow-sm border border-[var(--color-border)]'
                        : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
                    }`}
                  >
                    <BarChart3 className="w-4 h-4" />
                    Summary
                  </button>
                  <button
                    type="button"
                    onClick={() => setRightPanelTab('todo')}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                      rightPanelTab === 'todo'
                        ? 'bg-[var(--color-surface)] text-[var(--color-primary)] shadow-sm border border-[var(--color-border)]'
                        : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
                    }`}
                  >
                    <ListTodo className="w-4 h-4" />
                    Todo
                  </button>
                </div>
                <p className="text-xs text-[var(--color-text-muted)] mt-2">
                  {rightPanelTab === 'summary'
                    ? (projectIdFromUrl
                        ? 'Critical / Warning ของโปรเจกต์นี้'
                        : 'Critical / Warning ตาม Cap → Project → Task')
                    : (projectIdFromUrl
                        ? 'Task ทั้งหมดของโปรเจกต์นี้ (ทำแล้ว / ยังไม่ทำ)'
                        : 'เปิดโปรเจกต์เพื่อดู Todo')}
                </p>
              </div>
              <div className="p-4 flex-1 min-h-0 overflow-auto">
                {rightPanelTab === 'summary' ? (
                  location.pathname === '/capability' ? (
                    <SummaryStatusPanel />
                  ) : projectIdFromUrl ? (
                    <SummaryStatusPanel projectId={projectIdFromUrl} />
                  ) : (
                    <p className="text-sm text-[var(--color-text-muted)]">
                      {isProjectPage
                        ? 'เปิดโปรเจกต์เพื่อดูสรุป Critical / Warning ของโปรเจกต์นี้'
                        : 'เปิดหน้าหลัก Capability เพื่อดูสรุป Critical / Warning'}
                    </p>
                  )
                ) : (
                  <TodoPanel projectId={projectIdFromUrl} />
                )}
              </div>
            </div>
          </aside>
          </>
        )}
      </div>
      <ComponentSearchModal
        open={componentSearchOpen}
        onClose={() => setComponentSearchOpen(false)}
      />

      {logoutModalOpen && (
        <LogoutBackupModal
          syncAvailable={syncAvailable}
          backingUp={logoutBackingUp}
          setBackingUp={setLogoutBackingUp}
          onClose={() => setLogoutModalOpen(false)}
          onLogoutComplete={() => {
            setGoogleUser(false);
            setLogoutModalOpen(false);
            setLogoutBackingUp(false);
            // Reload หน้าเพื่อให้ Guest ไม่เห็นข้อมูลของ user ที่ logout แล้ว
            window.location.href = '/';
          }}
        />
      )}
    </div>
  );
}

function LogoutBackupModal({
  syncAvailable,
  backingUp,
  setBackingUp,
  onClose,
  onLogoutComplete,
}: {
  syncAvailable: boolean;
  backingUp: boolean;
  setBackingUp: (v: boolean) => void;
  onClose: () => void;
  onLogoutComplete: () => void;
}) {
  const runLogout = async () => {
    await clearAppData();
    logoutGoogle();
    onLogoutComplete();
  };

  const handleUploadCloud = async () => {
    setBackingUp(true);
    try {
      const result = await uploadToCloud();
      if (result.ok) {
        await runLogout();
      } else {
        setBackingUp(false);
        alert('error' in result ? result.error : 'อัปโหลดไม่สำเร็จ');
      }
    } catch (e) {
      setBackingUp(false);
      alert(e instanceof Error ? e.message : 'อัปโหลดไม่สำเร็จ');
    }
  };

  const handleDownloadFile = async () => {
    setBackingUp(true);
    try {
      const blob = await exportForSync();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `archtown-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      await runLogout();
    } catch (e) {
      setBackingUp(false);
      alert(e instanceof Error ? e.message : 'สำรองข้อมูลไม่สำเร็จ');
    }
  };

  const handleSkip = async () => {
    await runLogout();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" aria-modal role="dialog">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl shadow-[var(--shadow-modal)] max-w-md w-full p-5">
        <h2 className="text-lg font-semibold text-[var(--color-text)]">
          สำรองข้อมูลก่อนออกจากระบบ
        </h2>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          ต้องการสำรองข้อมูลก่อนล้างและออกจากระบบหรือไม่ (เผื่อมีการเปลี่ยน user)
        </p>
        {backingUp && (
          <div className="mt-4 flex items-center gap-2 text-sm text-[var(--color-primary)]">
            <Loader2 className="w-4 h-4 animate-spin" />
            กำลังสำรองข้อมูล...
          </div>
        )}
        <div className="mt-4 flex flex-col gap-2">
          {syncAvailable && (
            <button
              type="button"
              disabled={backingUp}
              onClick={handleUploadCloud}
              className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] font-medium hover:bg-[var(--color-overlay)] disabled:opacity-50"
            >
              <CloudUpload className="w-4 h-4" />
              อัปโหลดไป Cloud
            </button>
          )}
          <button
            type="button"
            disabled={backingUp}
            onClick={handleDownloadFile}
            className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] font-medium hover:bg-[var(--color-overlay)] disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            ดาวน์โหลดไฟล์ backup
          </button>
          <button
            type="button"
            disabled={backingUp}
            onClick={handleSkip}
            className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border border-[var(--color-border)] text-[var(--color-text-muted)] font-medium hover:bg-[var(--color-overlay)] hover:text-[var(--color-text)] disabled:opacity-50"
          >
            <LogOut className="w-4 h-4" />
            ข้ามและออก
          </button>
        </div>
        <button
          type="button"
          onClick={onClose}
          disabled={backingUp}
          className="mt-4 w-full py-2 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)] disabled:opacity-50"
        >
          ยกเลิก
        </button>
      </div>
    </div>
  );
}
