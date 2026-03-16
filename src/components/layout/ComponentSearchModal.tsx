import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, FolderKanban, X } from 'lucide-react';
import { StatusBadge } from '../ui/StatusBadge';
import type { ProjectForSearch } from '../../db/repositories/project.repository';
import * as archtownDb from '../../db/archtownDb';

async function fetchProjectsForSearch(): Promise<ProjectForSearch[]> {
  try {
    const { projects } = await archtownDb.listProjectsForSearch();
    return projects ?? [];
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

/** Format full path "Team · Topic > SubTopic" (skip empty parts). */
function formatContextPath(ctx: { teamName: string; topicTitle: string; subTopicTitle: string }): string {
  const parts: string[] = [];
  if (ctx.teamName.trim()) parts.push(ctx.teamName.trim());
  if (ctx.topicTitle.trim()) parts.push(ctx.topicTitle.trim());
  if (ctx.subTopicTitle.trim()) parts.push(ctx.subTopicTitle.trim());
  if (parts.length <= 1) return parts.join(' · ');
  return parts.slice(0, 2).join(' · ') + ' > ' + parts.slice(2).join(' > ');
}

/** Format "Topic > SubTopic" only (for line 3). */
function formatTopicSubTopic(ctx: { topicTitle: string; subTopicTitle: string }): string {
  const t = ctx.topicTitle.trim();
  const s = ctx.subTopicTitle.trim();
  if (t && s) return `${t} > ${s}`;
  return t || s;
}

/** Return true if query matches this context (team/topic/subtopic). */
function contextMatches(
  ctx: { teamName: string; topicTitle: string; subTopicTitle: string },
  q: string
): boolean {
  if (!q) return true;
  const lower = q.toLowerCase();
  return (
    ctx.teamName.toLowerCase().includes(lower) ||
    ctx.topicTitle.toLowerCase().includes(lower) ||
    ctx.subTopicTitle.toLowerCase().includes(lower)
  );
}

interface ComponentSearchModalProps {
  open: boolean;
  onClose: () => void;
}

export function ComponentSearchModal({ open, onClose }: ComponentSearchModalProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [projectList, setProjectList] = useState<ProjectForSearch[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const filteredList = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return projectList;
    return projectList.filter((p) => {
      if (p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q)) return true;
      if (p.summaryStatus && p.summaryStatus.toLowerCase().includes(q)) return true;
      return p.context.some((ctx) => contextMatches(ctx, q));
    });
  }, [projectList, query]);

  /** For display: pick context(s) that match the query, or first context. */
  const getDisplayContexts = useCallback(
    (p: ProjectForSearch): { teamName: string; topicTitle: string; subTopicTitle: string }[] => {
      const q = query.trim().toLowerCase();
      if (!q || p.context.length === 0) return p.context.slice(0, 2);
      const matched = p.context.filter((ctx) => contextMatches(ctx, q));
      return matched.length > 0 ? matched.slice(0, 2) : p.context.slice(0, 1);
    },
    [query]
  );

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetchProjectsForSearch()
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
      if (e.key === 'Enter' && filteredList[selectedIndex]) {
        const p = filteredList[selectedIndex];
        navigate(`/project?id=${encodeURIComponent(p.id)}`);
        onClose();
        e.preventDefault();
      }
    },
    [filteredList, selectedIndex, navigate, onClose]
  );

  const handleSelect = useCallback(
    (p: ProjectForSearch) => {
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
          <div className="flex-1 relative flex items-center">
            <input
              ref={inputRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ค้นหาโปรเจกต์, ทีม, หัวข้อ หรือหัวข้อย่อย..."
              className="w-full bg-transparent text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] outline-none text-base pr-8 [&::-webkit-search-cancel-button]:hidden [&::-webkit-search-decoration]:hidden"
              aria-label="ค้นหาโปรเจกต์"
            />
            {query.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  inputRef.current?.focus();
                }}
                className="absolute right-0 p-1.5 rounded-md text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-overlay)] transition-colors"
                aria-label="ล้างคำค้น"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
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
                : 'ไม่พบโปรเจกต์หรือหัวข้อที่ตรงกับคำค้น'}
            </div>
          ) : (
            filteredList.map((p, i) => {
              const displayContexts = getDisplayContexts(p);
              return (
                <button
                  key={p.id}
                  type="button"
                  role="option"
                  aria-selected={i === selectedIndex}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left border-b border-[var(--color-border)] last:border-b-0 transition-colors ${
                    i === selectedIndex
                      ? 'bg-[var(--color-primary-muted)] text-[var(--color-primary)]'
                      : 'text-[var(--color-text)] hover:bg-[var(--color-overlay)]'
                  }`}
                  onClick={() => handleSelect(p)}
                  onMouseEnter={() => setSelectedIndex(i)}
                >
                  <FolderKanban className="w-5 h-5 text-[var(--color-text-muted)] shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    {/* บรรทัด 1: ชื่อโปรเจกต์ + id ด้านบนขวา */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-medium truncate min-w-0">
                        {q ? highlightMatch(p.name, query) : p.name}
                      </div>
                      <span className="text-xs text-[var(--color-text-muted)] shrink-0 tabular-nums">
                        {q ? highlightMatch(p.id, query) : p.id}
                      </span>
                    </div>
                    {/* บรรทัด 2: ชื่อทีม */}
                    {displayContexts.length > 0 && (() => {
                      const teamNames = [...new Set(displayContexts.map((c) => c.teamName.trim()).filter(Boolean))];
                      return teamNames.length > 0 ? (
                        <div className="text-xs text-[var(--color-text-muted)] mt-1 truncate">
                          {teamNames.map((name, idx) => (
                            <span key={idx}>
                              {idx > 0 && ' · '}
                              {q ? highlightMatch(name, query) : name}
                            </span>
                          ))}
                        </div>
                      ) : null;
                    })()}
                    {/* บรรทัด 3: หัวข้อ > หัวข้อย่อย (project_sub_topics) */}
                    {displayContexts.length > 0 && (() => {
                      const topicLines = displayContexts
                        .map((ctx) => formatTopicSubTopic(ctx))
                        .filter(Boolean);
                      return topicLines.length > 0 ? (
                        <div className="text-xs text-[var(--color-text-muted)] mt-0.5 truncate">
                          {topicLines.map((line, idx) => (
                            <span key={idx}>
                              {idx > 0 && ' · '}
                              {q ? highlightMatch(line, query) : line}
                            </span>
                          ))}
                        </div>
                      ) : null;
                    })()}
                  </div>
                  {p.summaryStatus && (
                    <StatusBadge status={p.summaryStatus} variant="compact" />
                  )}
                </button>
              );
            })
          )}
        </div>
        <div className="px-4 py-2 border-t border-[var(--color-border)] bg-[var(--color-overlay)] text-xs text-[var(--color-text-muted)] flex items-center justify-between">
          <span>⌘K S — ค้นหาโปรเจกต์ / ทีม / หัวข้อ / หัวข้อย่อย</span>
          <span>Enter เลือก · ↑↓ เลือกรายการ · Space เว้นวรรค</span>
        </div>
      </div>
    </div>
  );
}
