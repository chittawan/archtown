import React, { useState, useEffect, useCallback } from 'react';
import {
  Users,
  Plus,
  ChevronRight,
  ChevronDown,
  Pencil,
  Trash2,
  FolderPlus,
  Save,
  Download,
  FileText,
} from 'lucide-react';
import type { OrgTeam } from '../../types';
import {
  orgTeamToMarkdown,
  markdownToOrgTeam,
  slugFromName,
  ensureUniqueSlug,
} from '../../lib/teamMarkdown';

type TeamMap = Map<string, OrgTeam>;

function buildRootIds(teams: TeamMap): string[] {
  const ids = Array.from(teams.keys());
  return ids.filter((id) => {
    const t = teams.get(id);
    return t && !t.parentId;
  });
}

function getChildIds(team: OrgTeam, teams: TeamMap): string[] {
  return team.childIds.filter((id) => teams.has(id));
}

async function fetchTeamIds(): Promise<string[]> {
  const res = await fetch('/api/teams');
  if (!res.ok) return [];
  const data = await res.json().catch(() => ({}));
  return Array.isArray(data.ids) ? data.ids : [];
}

async function fetchTeam(id: string): Promise<{ id: string; markdown: string } | null> {
  const res = await fetch(`/api/teams/${encodeURIComponent(id)}`);
  if (!res.ok) return null;
  const data = await res.json().catch(() => ({}));
  return data.markdown != null ? { id: data.id || id, markdown: data.markdown } : null;
}

async function saveTeamApi(id: string, markdown: string): Promise<boolean> {
  const res = await fetch('/api/teams/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, markdown }),
  });
  if (!res.ok) return false;
  const data = await res.json().catch(() => ({}));
  return !!data.ok;
}

export default function TeamsManagePage() {
  const [teams, setTeams] = useState<TeamMap>(new Map());
  const [loading, setLoading] = useState(true);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [createParentId, setCreateParentId] = useState<string | null>(null);
  const [editingTeam, setEditingTeam] = useState<OrgTeam | null>(null);
  const [formName, setFormName] = useState('');
  const [formOwner, setFormOwner] = useState('');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'ok' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  const loadTeams = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const ids = await fetchTeamIds();
      const next = new Map<string, OrgTeam>();
      for (const id of ids) {
        const raw = await fetchTeam(id);
        if (raw) {
          const team = markdownToOrgTeam(raw.id, raw.markdown);
          next.set(team.id, team);
        }
      }
      setTeams(next);
    } catch (e) {
      setError('โหลดรายการทีมไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTeams();
  }, [loadTeams]);

  const saveTeam = useCallback(
    async (team: OrgTeam) => {
      setSaveStatus('saving');
      const md = orgTeamToMarkdown(team);
      const ok = await saveTeamApi(team.id, md);
      setSaveStatus(ok ? 'ok' : 'error');
      if (ok) {
        setTeams((prev) => new Map(prev).set(team.id, team));
      }
      setTimeout(() => setSaveStatus('idle'), 2000);
      return ok;
    },
    []
  );

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const openCreate = (parentId: string | null) => {
    setCreateParentId(parentId);
    setFormName('');
    setFormOwner('');
    setIsCreateOpen(true);
  };

  const openEdit = (team: OrgTeam) => {
    setEditingTeam(team);
    setFormName(team.name);
    setFormOwner(team.owner);
    setIsEditOpen(true);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = formName.trim();
    if (!name) return;
    const existingIds = Array.from(teams.keys()) as string[];
    const baseSlug = slugFromName(name);
    const id = ensureUniqueSlug(baseSlug, existingIds);
    const newTeam: OrgTeam = {
      id,
      name,
      owner: formOwner.trim(),
      parentId: createParentId,
      childIds: [],
    };
    const ok = await saveTeam(newTeam);
    if (!ok) {
      downloadTeamMarkdown(newTeam);
    }
    if (createParentId) {
      const parent = teams.get(createParentId);
      if (parent) {
        const updatedParent: OrgTeam = {
          ...parent,
          childIds: [...parent.childIds, id],
        };
        await saveTeam(updatedParent);
      }
    }
    setIsCreateOpen(false);
    setCreateParentId(null);
    if (createParentId) {
      setExpandedIds((prev) => {
        const next = new Set(prev);
        next.add(createParentId);
        return next;
      });
    }
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTeam) return;
    const name = formName.trim();
    if (!name) return;
    const updated: OrgTeam = {
      ...editingTeam,
      name,
      owner: formOwner.trim(),
    };
    await saveTeam(updated);
    setIsEditOpen(false);
    setEditingTeam(null);
  };

  const removeChildFromParent = async (parentId: string, childId: string) => {
    const parent = teams.get(parentId);
    if (!parent) return;
    const updated: OrgTeam = {
      ...parent,
      childIds: parent.childIds.filter((c) => c !== childId),
    };
    await saveTeam(updated);
    setTeams((prev) => {
      const next = new Map(prev);
      next.set(parentId, updated);
      return next;
    });
  };

  const deleteTeam = async (team: OrgTeam) => {
    if (!confirm(`ลบทีม "${team.name}" และจะเอา out ของลูกออกจากทีมแม่?`)) return;
    if (team.parentId) {
      await removeChildFromParent(team.parentId, team.id);
    }
    setTeams((prev) => {
      const next = new Map(prev);
      next.delete(team.id);
      return next;
    });
    setIsEditOpen(false);
    setEditingTeam(null);
  };

  const downloadTeamMarkdown = (team: OrgTeam) => {
    const md = orgTeamToMarkdown(team);
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${team.id}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const rootIds = buildRootIds(teams);

  function TeamNode({ team, depth = 0 }: { team: OrgTeam; depth?: number }) {
    const childIds = getChildIds(team, teams);
    const hasChildren = childIds.length > 0;
    const isExpanded = expandedIds.has(team.id);

    return (
      <div className="flex flex-col">
        <div
          className="flex items-center gap-2 py-2 px-3 rounded-lg hover:bg-[var(--color-overlay)] transition-colors group"
          style={{ paddingLeft: `${depth * 20 + 8}px` }}
        >
          <button
            type="button"
            onClick={() => hasChildren && toggleExpand(team.id)}
            className="p-1 rounded text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
            aria-label={isExpanded ? 'ย่อ' : 'ขยาย'}
          >
            {hasChildren ? (
              isExpanded ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )
            ) : (
              <span className="w-4 h-4 inline-block" />
            )}
          </button>
          <div className="flex-1 min-w-0 flex items-center gap-3">
            <Users className="w-4 h-4 text-[var(--color-primary)] shrink-0" />
            <div className="min-w-0">
              <span className="font-medium text-[var(--color-text)] truncate block">
                {team.name}
              </span>
              {team.owner && (
                <span className="text-sm text-[var(--color-text-muted)] truncate block">
                  Owner: {team.owner}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              type="button"
              onClick={() => openCreate(team.id)}
              className="p-2 rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-primary)] hover:bg-[var(--color-overlay)]"
              title="เพิ่มทีมลูก"
            >
              <FolderPlus className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => openEdit(team)}
              className="p-2 rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-primary)] hover:bg-[var(--color-overlay)]"
              title="แก้ไข"
            >
              <Pencil className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => downloadTeamMarkdown(team)}
              className="p-2 rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-primary)] hover:bg-[var(--color-overlay)]"
              title="ดาวน์โหลด .md"
            >
              <Download className="w-4 h-4" />
            </button>
          </div>
        </div>
        {hasChildren && isExpanded && (
          <div className="border-l-2 border-[var(--color-border)] ml-4">
            {childIds.map((cid) => {
              const child = teams.get(cid);
              return child ? (
                <TeamNode key={child.id} team={child} depth={depth + 1} />
              ) : null;
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--color-text)] flex items-center gap-2">
            <Users className="w-7 h-7 text-[var(--color-primary)]" />
            จัดการทีม
          </h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            สร้างทีม กำหนด Owner และจัดลำดับทีมลูก (Parent-Child) — 1 ทีม = 1 ไฟล์ Markdown
          </p>
        </div>
        <div className="flex items-center gap-2">
          {saveStatus === 'saving' && (
            <span className="text-sm text-[var(--color-text-muted)]">กำลังบันทึก...</span>
          )}
          {saveStatus === 'ok' && (
            <span className="text-sm text-[var(--color-primary)] flex items-center gap-1">
              <Save className="w-4 h-4" /> บันทึกแล้ว
            </span>
          )}
          <button
            type="button"
            onClick={() => openCreate(null)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--color-primary)] text-white font-medium hover:bg-[var(--color-primary-hover)] transition-colors shadow-[var(--shadow-card)]"
          >
            <Plus className="w-4 h-4" />
            สร้างทีม
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-[var(--color-text)]">
          {error}
          <button
            type="button"
            onClick={loadTeams}
            className="ml-2 underline"
          >
            โหลดใหม่
          </button>
        </div>
      )}

      {loading ? (
        <div className="py-12 text-center text-[var(--color-text-muted)]">
          กำลังโหลด...
        </div>
      ) : rootIds.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-[var(--color-border)] bg-[var(--color-surface)] p-12 text-center">
          <FileText className="w-12 h-12 mx-auto text-[var(--color-text-subtle)] mb-4" />
          <p className="text-[var(--color-text-muted)] mb-2">ยังไม่มีทีม</p>
          <p className="text-sm text-[var(--color-text-subtle)] mb-6">
            สร้างทีมแรกหรืออัปโหลดไฟล์ .md จากโฟลเดอร์ data/teams
          </p>
          <button
            type="button"
            onClick={() => openCreate(null)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--color-primary)] text-white font-medium"
          >
            <Plus className="w-4 h-4" />
            สร้างทีม
          </button>
        </div>
      ) : (
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-card)] overflow-hidden">
          {rootIds.map((id) => {
            const team = teams.get(id);
            return team ? <TeamNode key={team.id} team={team} /> : null;
          })}
        </div>
      )}

      {/* Modal สร้างทีม */}
      {isCreateOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--color-modal-backdrop)]"
          onClick={() => setIsCreateOpen(false)}
        >
          <div
            className="bg-[var(--color-surface)] rounded-2xl shadow-[var(--shadow-modal)] w-full max-w-md border border-[var(--color-border)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-[var(--color-border)]">
              <h2 className="text-lg font-semibold text-[var(--color-text)]">
                {createParentId ? 'เพิ่มทีมลูก' : 'สร้างทีมใหม่'}
              </h2>
              {createParentId && (
                <p className="text-sm text-[var(--color-text-muted)] mt-1">
                  ทีมแม่: {teams.get(createParentId)?.name ?? createParentId}
                </p>
              )}
            </div>
            <form onSubmit={handleCreate} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-[var(--color-text)] mb-1">
                  ชื่อทีม
                </label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-page)] text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                  placeholder="เช่น Engineering, Backend"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--color-text)] mb-1">
                  Owner
                </label>
                <input
                  type="text"
                  value={formOwner}
                  onChange={(e) => setFormOwner(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-page)] text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                  placeholder="ชื่อผู้รับผิดชอบ"
                />
              </div>
              <div className="flex gap-2 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-[var(--color-border)] text-[var(--color-text)] hover:bg-[var(--color-overlay)]"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={!formName.trim()}
                  className="px-4 py-2.5 rounded-xl bg-[var(--color-primary)] text-white font-medium hover:bg-[var(--color-primary-hover)] disabled:opacity-50"
                >
                  สร้าง
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal แก้ไขทีม */}
      {isEditOpen && editingTeam && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--color-modal-backdrop)]"
          onClick={() => setIsEditOpen(false)}
        >
          <div
            className="bg-[var(--color-surface)] rounded-2xl shadow-[var(--shadow-modal)] w-full max-w-md border border-[var(--color-border)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-[var(--color-border)] flex items-center justify-between">
              <h2 className="text-lg font-semibold text-[var(--color-text)]">แก้ไขทีม</h2>
              <span className="text-xs text-[var(--color-text-muted)] font-mono">
                {editingTeam.id}.md
              </span>
            </div>
            <form onSubmit={handleEdit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-[var(--color-text)] mb-1">
                  ชื่อทีม
                </label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-page)] text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                  placeholder="ชื่อทีม"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--color-text)] mb-1">
                  Owner
                </label>
                <input
                  type="text"
                  value={formOwner}
                  onChange={(e) => setFormOwner(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-page)] text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                  placeholder="ชื่อ Owner"
                />
              </div>
              {editingTeam.childIds.length > 0 && (
                <p className="text-sm text-[var(--color-text-muted)]">
                  ทีมลูก: {editingTeam.childIds.join(', ')}
                </p>
              )}
              <div className="flex gap-2 justify-between pt-2">
                <button
                  type="button"
                  onClick={() => deleteTeam(editingTeam)}
                  className="px-4 py-2.5 rounded-xl border border-red-500/50 text-red-600 dark:text-red-400 hover:bg-red-500/10"
                >
                  <Trash2 className="w-4 h-4 inline mr-1" />
                  ลบทีม
                </button>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setIsEditOpen(false)}
                    className="px-4 py-2.5 rounded-xl border border-[var(--color-border)] text-[var(--color-text)] hover:bg-[var(--color-overlay)]"
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="submit"
                    disabled={!formName.trim()}
                    className="px-4 py-2.5 rounded-xl bg-[var(--color-primary)] text-white font-medium hover:bg-[var(--color-primary-hover)] disabled:opacity-50"
                  >
                    บันทึก
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
