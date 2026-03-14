import { useState, useEffect, useRef } from 'react';
import { Outlet, Link, useLocation, useSearchParams, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Sun, Moon, Users, Layers, PanelRightOpen, PanelRightClose, ListTodo, BarChart3, FolderKanban } from 'lucide-react';
import SummaryStatusPanel from './SummaryStatusPanel.tsx';
import TodoPanel from './TodoPanel.tsx';
import { ComponentSearchModal } from './ComponentSearchModal.tsx';
import { DbStatusBar } from './DbStatusBar.tsx';
import { CloudSync } from './CloudSync.tsx';

const navItems = [
  { path: '/capability', label: 'TownStation', icon: Layers },
  // { path: '/project', label: 'Projects', icon: FolderKanban }, // ซ่อนไว้ก่อน
  { path: '/tasks', label: 'Tasks', icon: ListTodo },
  { path: '/teams', label: 'Teams', icon: Users },
];

const RIGHT_PANEL_STORAGE_KEY = 'archtown-right-panel-open';
type RightPanelTab = 'summary' | 'todo';

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
    return document.documentElement.classList.contains('dark');
  });
  const [componentSearchOpen, setComponentSearchOpen] = useState(false);
  const cmdKChordRef = useRef(false);

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
    </div>
  );
}
