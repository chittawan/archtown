import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, FolderKanban } from 'lucide-react';
import { StatusBadge } from '../ui/StatusBadge';
import type { ProjectSummary } from '../../types';
import { apiGet } from '../../lib/api';

async function fetchProjectList(): Promise<ProjectSummary[]> {
  try {
    const data = await apiGet<{ projects?: ProjectSummary[] }>('/api/projects');
    return Array.isArray(data?.projects) ? data.projects : [];
  } catch {
    return [];
  }
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function highlightMatch(text: string, search: string): React.ReactNode {
  if (!search.trim()) return text;
  const parts = text.split(new RegExp(`(${escapeRegExp(search.trim())})`, 'gi'));
  return parts.map((part, i) =>
    part.toLowerCase() === search.trim().toLowerCase() ? (
      <mark
        key={i}
        className="bg-amber-200 dark:bg-amber-600/50 text-[var(--color-text)] rounded px-0.5"
      >
        {part}
      </mark>
    ) : (
      part
    )
  );
}

interface ComponentSearchModalProps {
  open: boolean;
  onClose: () => void;
}

export function ComponentSearchModal({ open, onClose }: ComponentSearchModalProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [projectList, setProjectList] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const filteredList = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return projectList;
    return projectList.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.id.toLowerCase().includes(q) ||
        (p.summaryStatus && p.summaryStatus.toLowerCase().includes(q))
    );
  }, [projectList, query]);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetchProjectList()
      .then(setProjectList)
      .finally(() => setLoading(false));
  }, [open]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    const el = listRef.current;
    if (!el || selectedIndex < 0) return;
    const child = el.children[selectedIndex] as HTMLElement | undefined;
    child?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selectedIndex]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        e.preventDefault();
        return;
      }
      if (e.key === 'ArrowDown' || (e.key === 'Tab' && !e.shiftKey)) {
        setSelectedIndex((i) => (i + 1) % Math.max(1, filteredList.length));
        e.preventDefault();
        return;
      }
      if (e.key === 'ArrowUp' || (e.key === 'Tab' && e.shiftKey)) {
        setSelectedIndex((i) =>
          i <= 0 ? Math.max(0, filteredList.length - 1) : i - 1
        );
        e.preventDefault();
        return;
      }
      if ((e.key === 'Enter' || e.key === ' ') && filteredList[selectedIndex]) {
        const p = filteredList[selectedIndex];
        navigate(`/project?id=${encodeURIComponent(p.id)}`);
        onClose();
        e.preventDefault();
      }
    },
    [filteredList, selectedIndex, navigate, onClose]
  );

  const handleSelect = useCallback(
    (p: ProjectSummary) => {
      navigate(`/project?id=${encodeURIComponent(p.id)}`);
      onClose();
    },
    [navigate, onClose]
  );

  if (!open) return null;

  const q = query.trim();

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-label="Component Search - ค้นหาโปรเจกต์"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      onKeyDown={handleKeyDown}
    >
      <div
        className="w-full max-w-xl rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] shadow-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--color-border)]">
          <Search className="w-5 h-5 text-[var(--color-text-muted)] shrink-0" />
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ค้นหาชื่อโปรเจกต์..."
            className="flex-1 bg-transparent text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] outline-none text-base"
            aria-label="ค้นหาชื่อโปรเจกต์"
          />
          <kbd className="hidden sm:inline text-xs text-[var(--color-text-muted)] px-1.5 py-0.5 rounded border border-[var(--color-border)]">
            Esc
          </kbd>
        </div>
        <div
          ref={listRef}
          className="max-h-[60vh] overflow-y-auto"
          role="listbox"
          aria-label="รายการโปรเจกต์"
        >
          {loading ? (
            <div className="px-4 py-8 text-center text-[var(--color-text-muted)] text-sm">
              กำลังโหลด...
            </div>
          ) : filteredList.length === 0 ? (
            <div className="px-4 py-8 text-center text-[var(--color-text-muted)] text-sm">
              {projectList.length === 0
                ? 'ไม่มีโปรเจกต์'
                : 'ไม่พบโปรเจกต์ที่ตรงกับคำค้น'}
            </div>
          ) : (
            filteredList.map((p, i) => (
              <button
                key={p.id}
                type="button"
                role="option"
                aria-selected={i === selectedIndex}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left border-b border-[var(--color-border)] last:border-b-0 transition-colors ${
                  i === selectedIndex
                    ? 'bg-[var(--color-primary-muted)] text-[var(--color-primary)]'
                    : 'text-[var(--color-text)] hover:bg-[var(--color-overlay)]'
                }`}
                onClick={() => handleSelect(p)}
                onMouseEnter={() => setSelectedIndex(i)}
              >
                <FolderKanban className="w-5 h-5 text-[var(--color-text-muted)] shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">
                    {q ? highlightMatch(p.name, query) : p.name}
                  </div>
                  {p.id !== p.name && (
                    <div className="text-xs text-[var(--color-text-muted)] truncate mt-0.5">
                      {q ? highlightMatch(p.id, query) : p.id}
                    </div>
                  )}
                </div>
                {p.summaryStatus && (
                  <StatusBadge status={p.summaryStatus} compact />
                )}
              </button>
            ))
          )}
        </div>
        <div className="px-4 py-2 border-t border-[var(--color-border)] bg-[var(--color-overlay)] text-xs text-[var(--color-text-muted)] flex items-center justify-between">
          <span>⌘K S — Component Search</span>
          <span>Enter/Space เลือก · Tab/↑↓ เลือกรายการ</span>
        </div>
      </div>
    </div>
  );
}
