import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Layers,
  Plus,
  Pencil,
  Trash2,
  Save,
  GripVertical,
  FolderPlus,
  FolderKanban,
  Search,
  ChevronDown,
} from 'lucide-react';
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
  useDroppable,
} from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import {
  SortableContext,
  useSortable,
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Cab, CabilityLayout, ProjectInCab } from '../../lib/cabilityMarkdown';
import { slugFromName, ensureUniqueSlug } from '../../lib/teamMarkdown';
import { SortableProjectCard, projectDragId, PROJECT_PREFIX } from '../../components/cability/ProjectCard';

/** ใช้ id ให้ตรงกับชื่อไฟล์ใน data/projects (เหมือน save-project) */
function toCamelCase(s: string): string {
  return s
    .trim()
    .replace(/[^\p{L}\p{N}\s_-]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((word, i) =>
      i === 0 ? word.toLowerCase() : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    )
    .join('') || 'project';
}

export interface ProjectSummary {
  id: string;
  name: string;
  summaryStatus: 'RED' | 'YELLOW' | 'GREEN' | null;
}

async function fetchProjectList(): Promise<ProjectSummary[]> {
  const res = await fetch('/api/projects');
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data.projects) ? data.projects : [];
}

const CAB_PREFIX = 'cab::';

function parseProjectDragId(id: string): { cabId: string; projectId: string } | null {
  if (!id.startsWith(PROJECT_PREFIX)) return null;
  const rest = id.slice(PROJECT_PREFIX.length);
  const i = rest.indexOf('::');
  if (i === -1) return null;
  return { cabId: rest.slice(0, i), projectId: rest.slice(i + 2) };
}

async function fetchLayout(): Promise<CabilityLayout> {
  const res = await fetch('/api/cability');
  if (!res.ok) throw new Error('โหลด layout ไม่สำเร็จ');
  const data = await res.json();
  if (!data.layout) throw new Error('ข้อมูล layout ไม่ถูกต้อง');
  return data.layout;
}

async function saveLayout(layout: CabilityLayout): Promise<boolean> {
  const res = await fetch('/api/cability/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ layout }),
  });
  const data = await res.json().catch(() => ({}));
  return !!data.ok;
}

export default function CapabilityManagePage() {
  const navigate = useNavigate();
  const [layout, setLayout] = useState<CabilityLayout>({ cabOrder: [], cabs: {} });
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'ok' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [addCabOpen, setAddCabOpen] = useState(false);
  const [addProjectCabId, setAddProjectCabId] = useState<string | null>(null);
  const [addProjectMode, setAddProjectMode] = useState<'select' | 'new'>('select');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [editingCabId, setEditingCabId] = useState<string | null>(null);
  const [cabNameInput, setCabNameInput] = useState('');
  const [newProjectName, setNewProjectName] = useState('');
  const [projectList, setProjectList] = useState<ProjectSummary[]>([]);
  const [projectListLoading, setProjectListLoading] = useState(false);
  const [projectSearchQuery, setProjectSearchQuery] = useState('');
  const [projectSelectOpen, setProjectSelectOpen] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor)
  );

  const loadLayout = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchLayout();
      setLayout(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'โหลดไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLayout();
  }, [loadLayout]);

  const loadProjectList = useCallback(async () => {
    setProjectListLoading(true);
    try {
      const list = await fetchProjectList();
      setProjectList(list);
    } finally {
      setProjectListLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProjectList();
  }, [loadProjectList]);

  useEffect(() => {
    if (addProjectCabId) {
      loadProjectList();
      setAddProjectMode('select');
      setSelectedProjectId(null);
      setNewProjectName('');
      setProjectSearchQuery('');
      setProjectSelectOpen(false);
    }
  }, [addProjectCabId, loadProjectList]);

  const persistLayout = useCallback(async (next: CabilityLayout) => {
    setLayout(next);
    setSaveStatus('saving');
    try {
      const ok = await saveLayout(next);
      setSaveStatus(ok ? 'ok' : 'error');
      if (ok) setTimeout(() => setSaveStatus('idle'), 2000);
    } catch {
      setSaveStatus('error');
    }
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over) return;
      const overId = String(over.id);

      const projectPayload = parseProjectDragId(String(active.id));
      if (projectPayload) {
        const { cabId: sourceCabId, projectId } = projectPayload;
        const sourceCab = layout.cabs[sourceCabId];
        const project = sourceCab?.projects.find((p) => p.id === projectId);
        if (!sourceCab || !project) return;

        if (overId.startsWith(CAB_PREFIX)) {
          const targetCabId = overId.slice(CAB_PREFIX.length);
          if (targetCabId === sourceCabId) return;
          const targetCab = layout.cabs[targetCabId];
          if (!targetCab) return;
          const next = { ...layout, cabs: { ...layout.cabs } };
          next.cabs[sourceCabId] = {
            ...sourceCab,
            projects: sourceCab.projects.filter((p) => p.id !== projectId),
          };
          next.cabs[targetCabId] = {
            ...targetCab,
            projects: [...targetCab.projects, project],
          };
          persistLayout(next);
          return;
        }

        const overProject = parseProjectDragId(overId);
        if (overProject) {
          const { cabId: targetCabId } = overProject;
          const targetCab = layout.cabs[targetCabId];
          if (!targetCab) return;
          const sourceProjects = sourceCab.projects.filter((p) => p.id !== projectId);
          const targetProjects = [...targetCab.projects];
          const overIndex = targetProjects.findIndex((p) => p.id === overProject.projectId);
          const insertIndex = overIndex >= 0 ? overIndex : targetProjects.length;
          if (sourceCabId === targetCabId) {
            const from = sourceCab.projects.findIndex((p) => p.id === projectId);
            if (from === -1) return;
            const reordered = arrayMove(
              sourceCab.projects.map((p) => p.id),
              from,
              insertIndex > from ? insertIndex - 1 : insertIndex
            );
            const ordered = reordered
              .map((id) => sourceCab.projects.find((p) => p.id === id))
              .filter(Boolean) as ProjectInCab[];
            const next = { ...layout, cabs: { ...layout.cabs } };
            next.cabs[sourceCabId] = { ...sourceCab, projects: ordered };
            persistLayout(next);
          } else {
            targetProjects.splice(insertIndex, 0, project);
            const next = { ...layout, cabs: { ...layout.cabs } };
            next.cabs[sourceCabId] = { ...sourceCab, projects: sourceProjects };
            next.cabs[targetCabId] = { ...targetCab, projects: targetProjects };
            persistLayout(next);
          }
        }
        return;
      }

      if (String(active.id).startsWith('sortable-cab-')) {
        const cabId = String(active.id).replace(/^sortable-cab-/, '');
        const overStr = String(over.id);
        const overCabId = overStr.startsWith('sortable-cab-') ? overStr.replace(/^sortable-cab-/, '') : null;
        if (!overCabId || cabId === overCabId) return;
        const from = layout.cabOrder.indexOf(cabId);
        const to = layout.cabOrder.indexOf(overCabId);
        if (from === -1 || to === -1) return;
        const nextOrder = arrayMove(layout.cabOrder, from, to);
        persistLayout({ ...layout, cabOrder: nextOrder });
      }
    },
    [layout, persistLayout]
  );

  const handleAddCab = (e: React.FormEvent) => {
    e.preventDefault();
    const name = cabNameInput.trim();
    if (!name) return;
    const existing = Object.keys(layout.cabs);
    const id = ensureUniqueSlug(slugFromName(name), existing);
    const next: CabilityLayout = {
      cabOrder: [...layout.cabOrder, id],
      cabs: { ...layout.cabs, [id]: { id, name, cols: 4, projects: [] } },
    };
    persistLayout(next);
    setCabNameInput('');
    setAddCabOpen(false);
  };

  const handleEditCab = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCabId) return;
    const name = cabNameInput.trim();
    if (!name) return;
    const cab = layout.cabs[editingCabId];
    if (!cab) return;
    const next = { ...layout, cabs: { ...layout.cabs } };
    next.cabs[editingCabId] = { ...cab, name };
    persistLayout(next);
    setEditingCabId(null);
    setCabNameInput('');
  };

  const handleDeleteCab = (cabId: string) => {
    const cab = layout.cabs[cabId];
    const cabName = cab?.name ?? cabId;
    if (!confirm(`ลบกลุ่ม "${cabName}" ใช่หรือไม่? โปรเจกต์ภายในจะถูกเอาออกจากกลุ่มนี้ (ไม่ลบข้อมูลโปรเจกต์)`)) return;
    const nextOrder = layout.cabOrder.filter((id) => id !== cabId);
    const { [cabId]: _, ...restCabs } = layout.cabs;
    persistLayout({ cabOrder: nextOrder, cabs: restCabs });
    setEditingCabId(null);
  };

  const handleAddProject = (e: React.FormEvent) => {
    e.preventDefault();
    const cabId = addProjectCabId;
    if (!cabId) return;
    const cab = layout.cabs[cabId];
    if (!cab) return;
    let id: string;
    let name: string;
    if (addProjectMode === 'select' && selectedProjectId) {
      const existing = projectList.find((p) => p.id === selectedProjectId);
      if (!existing) return;
      id = existing.id;
      name = existing.name;
    } else {
      name = newProjectName.trim();
      if (!name) return;
      id = toCamelCase(name);
    }
    const existingIds = cab.projects.map((p) => p.id);
    if (existingIds.includes(id)) return;
    const project: ProjectInCab = { id, name, cols: 4 };
    const next = { ...layout, cabs: { ...layout.cabs } };
    next.cabs[cabId] = { ...cab, projects: [...cab.projects, project] };
    persistLayout(next);
    setSelectedProjectId(null);
    setNewProjectName('');
    setAddProjectCabId(null);
  };

  const handleRemoveProject = (cabId: string, projectId: string) => {
    const cab = layout.cabs[cabId];
    if (!cab) return;
    const next = { ...layout, cabs: { ...layout.cabs } };
    next.cabs[cabId] = {
      ...cab,
      projects: cab.projects.filter((p) => p.id !== projectId),
    };
    persistLayout(next);
  };

  const handleDoubleClickProject = (project: ProjectInCab) => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('projectName', project.name);
      localStorage.setItem('projectId', project.id);
    }
    navigate(`/project?id=${encodeURIComponent(project.id)}`);
  };

  function cabWidthClass(cols?: 12 | 6 | 4 | 3): string {
    const value = cols && [12, 6, 4, 3].includes(cols) ? cols : 4;
    switch (value) {
      case 12:
        return 'col-span-12';
      case 6:
        return 'col-span-12 sm:col-span-6';
      case 4:
        return 'col-span-12 sm:col-span-4';
      case 3:
        return 'col-span-12 sm:col-span-3';
      default:
        return 'col-span-12';
    }
  }

  function SortableCabCard({ cabId }: { cabId: string; key?: React.Key }) {
    const cab = layout.cabs[cabId];
    if (!cab) return null;
    const {
      attributes,
      listeners,
      setNodeRef,
      transform,
      transition,
      isDragging,
    } = useSortable({ id: `sortable-cab-${cabId}` as any });
    const { setNodeRef: setDropRef, isOver } = useDroppable({
      id: `${CAB_PREFIX}${cabId}`,
    });
    const sortableProjectIds = cab.projects.map((p) => projectDragId(cabId, p.id));
    const style = { transform: CSS.Transform.toString(transform), transition };
    const cols = cab.cols;

    return (
      <div
        ref={setNodeRef}
        style={style}
        className={`flex flex-col min-w-[220px] ${cabWidthClass(cols)}`}
      >
        <div
          ref={setDropRef}
          className={`group/cab rounded-2xl border-2 border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden transition-all ${
            isDragging ? 'opacity-90 shadow-xl ring-2 ring-[var(--color-primary)]' : ''
          } ${isOver ? 'ring-2 ring-[var(--color-primary)] bg-[var(--color-primary-muted)]/30' : ''}`}
        >
          <div className="flex items-center gap-2 px-4 py-2 border-b border-[var(--color-border)] bg-[var(--color-overlay)]">
            <button
              type="button"
              className="p-1 rounded text-[var(--color-text-subtle)] hover:text-[var(--color-text)] touch-none cursor-grab active:cursor-grabbing"
              aria-label="ลากเพื่อเรียงลำดับกลุ่ม"
            title="ลากเพื่อเรียงลำดับกลุ่ม"
              {...attributes}
              {...listeners}
            >
              <GripVertical className="w-4 h-4" />
            </button>
            <h3 className="flex-1 font-semibold text-[var(--color-text)] truncate">
              {editingCabId === cabId ? (
                <input
                  type="text"
                  value={cabNameInput}
                  onChange={(e) => setCabNameInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleEditCab(e as any)}
                  className="w-full bg-transparent border-b border-[var(--color-border)] focus:outline-none focus:border-[var(--color-primary)] text-[var(--color-text)]"
                  autoFocus
                />
              ) : (
                cab.name
              )}
            </h3>
            <div
              className={`flex items-center gap-1.5 transition-opacity ${
                editingCabId === cabId ? 'opacity-100' : 'opacity-0 group-hover/cab:opacity-100'
              }`}
            >
              <div className="hidden sm:block">
                <label className="sr-only" htmlFor={`cab-cols-${cabId}`}>
                  ความกว้างกล่องกลุ่ม
                </label>
                <select
                  id={`cab-cols-${cabId}`}
                  value={cab.cols ?? 4}
                  onChange={(e) => {
                    const value = Number(e.target.value) as 12 | 6 | 4 | 3;
                    const next = { ...layout, cabs: { ...layout.cabs } };
                    next.cabs[cabId] = { ...cab, cols: value };
                    persistLayout(next);
                  }}
                  title="ปรับความกว้างกล่องกลุ่ม"
                  className="text-[10px] px-1.5 py-0.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
                >
                  <option value={12}>เต็มแถว</option>
                  <option value={6}>ครึ่งแถว</option>
                  <option value={4}>1/3 แถว</option>
                  <option value={3}>1/4 แถว</option>
                </select>
              </div>
              {editingCabId === cabId ? (
                <>
                  <button
                    type="button"
                    onClick={(e) => handleEditCab(e as any)}
                    className="p-1 rounded-lg text-[var(--color-primary)] hover:bg-[var(--color-overlay)]"
                  >
                    <Save className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteCab(cabId)}
                    className="p-1 rounded-lg text-red-500 hover:bg-red-500/10"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingCabId(cabId);
                      setCabNameInput(cab.name);
                    }}
                    className="p-1 rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-primary)] hover:bg-[var(--color-overlay)]"
                    title="แก้ไขชื่อกลุ่ม"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setAddProjectCabId(cabId)}
                    className="p-1.5 rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-primary)] hover:bg-[var(--color-overlay)]"
                    title="เพิ่มโปรเจกต์ในกลุ่มนี้"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </>
              )}
            </div>
          </div>
          <div className="p-3 min-h-[100px]">
            <SortableContext items={sortableProjectIds} strategy={rectSortingStrategy}>
              <div className="grid grid-cols-12 gap-2">
                {cab.projects.map((project) => {
                  const summary = projectList.find((p) => p.id === project.id);
                  const displayStatus = summary?.summaryStatus ?? project.status ?? null;
                  return (
                    <React.Fragment key={`${cabId}-${project.id}`}>
                      <SortableProjectCard
                        cabId={cabId}
                        project={project}
                        displayStatus={displayStatus}
                        onRemove={() => handleRemoveProject(cabId, project.id)}
                        onDoubleClick={() => handleDoubleClickProject(project)}
                        onChangeCols={(cols) => {
                          const next = { ...layout, cabs: { ...layout.cabs } };
                          const currentCab = next.cabs[cabId];
                          if (!currentCab) return;
                          next.cabs[cabId] = {
                            ...currentCab,
                            projects: currentCab.projects.map((p) =>
                              p.id === project.id ? { ...p, cols } : p
                            ),
                          };
                          persistLayout(next);
                        }}
                      />
                    </React.Fragment>
                  );
                })}
              </div>
            </SortableContext>
            {cab.projects.length === 0 && (
              <p className="text-sm text-[var(--color-text-muted)] italic py-6 text-center">
                ยังไม่มีโปรเจกต์ในกลุ่มนี้ — กด <span className="font-medium not-italic text-[var(--color-primary)]">+</span> เพื่อเพิ่ม หรือลากการ์ดจากกลุ่มอื่นมาวาง
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--color-text)] flex items-center gap-2">
            <Layers className="w-7 h-7 text-[var(--color-primary)]" />
            ภาพรวมโปรเจกต์ (Capability)
          </h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            จัดกลุ่มโปรเจกต์ตาม Cab — ดับเบิลคลิกที่การ์ดเพื่อเปิดโปรเจกต์ · ลากวางเพื่อจัดเรียงหรือย้ายระหว่างกลุ่ม
          </p>
        </div>
        <div className="flex items-center gap-3">
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
            onClick={() => {
              setCabNameInput('');
              setAddCabOpen(true);
            }}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--color-primary)] text-white font-medium hover:opacity-90 transition-opacity shadow-[var(--shadow-card)]"
          >
            <Plus className="w-4 h-4" />
            เพิ่มกลุ่ม (Cab)
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-[var(--color-text)]">
          {error}
          <button type="button" onClick={loadLayout} className="ml-2 underline">
            โหลดใหม่
          </button>
        </div>
      )}

      {loading ? (
        <div className="py-12 text-center text-[var(--color-text-muted)]">กำลังโหลด...</div>
      ) : layout.cabOrder.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-[var(--color-border)] bg-[var(--color-surface)] p-12 text-center">
          <FolderPlus className="w-12 h-12 mx-auto text-[var(--color-text-subtle)] mb-4" />
          <p className="text-[var(--color-text-muted)] mb-2">ยังไม่มีกลุ่ม (Cab)</p>
          <p className="text-sm text-[var(--color-text-subtle)] mb-6">
            กด &quot;เพิ่มกลุ่ม (Cab)&quot; เพื่อสร้างกลุ่มแล้วเพิ่มโปรเจกต์
          </p>
          <button
            type="button"
            onClick={() => setAddCabOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--color-primary)] text-white font-medium"
          >
            <Plus className="w-4 h-4" />
            เพิ่มกลุ่ม (Cab)
          </button>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={layout.cabOrder.map((id) => `sortable-cab-${id}`)}
            strategy={rectSortingStrategy}
          >
            <div className="grid grid-cols-12 gap-6">
              {layout.cabOrder.map((cabId) => (
                <SortableCabCard key={cabId} cabId={cabId} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {addCabOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setAddCabOpen(false)}>
          <div
            className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-6 shadow-xl max-w-sm w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-[var(--color-text)] mb-4">เพิ่มกลุ่ม (Cab)</h3>
            <form onSubmit={handleAddCab}>
              <input
                type="text"
                value={cabNameInput}
                onChange={(e) => setCabNameInput(e.target.value)}
                placeholder="ชื่อ Cab (เช่น Business Management)"
                className="w-full px-4 py-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-page)] text-[var(--color-text)] placeholder-[var(--color-text-subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] mb-4"
                autoFocus
              />
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setAddCabOpen(false)}
                  className="px-4 py-2 rounded-xl border border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[var(--color-overlay)]"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-[var(--color-primary)] text-white font-medium hover:opacity-90"
                >
                  สร้าง
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {addProjectCabId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setAddProjectCabId(null)}
        >
          <div
            className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-6 shadow-xl max-w-sm w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-[var(--color-text)] mb-4 flex items-center gap-2">
              <FolderKanban className="w-5 h-5" />
              เพิ่มโปรเจกต์ในกลุ่มนี้
            </h3>
            <p className="text-sm text-[var(--color-text-muted)] mb-3">
              เลือกโปรเจกต์ที่มีอยู่ หรือสร้างชื่อใหม่
            </p>
            <form onSubmit={handleAddProject}>
              <div className="flex gap-2 mb-3">
                <button
                  type="button"
                  onClick={() => setAddProjectMode('select')}
                  className={`flex-1 py-2 rounded-xl border text-sm font-medium transition-colors ${
                    addProjectMode === 'select'
                      ? 'border-[var(--color-primary)] bg-[var(--color-primary-muted)] text-[var(--color-primary)]'
                      : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[var(--color-overlay)]'
                  }`}
                >
                  เลือกจากรายการ
                </button>
                <button
                  type="button"
                  onClick={() => setAddProjectMode('new')}
                  className={`flex-1 py-2 rounded-xl border text-sm font-medium transition-colors ${
                    addProjectMode === 'new'
                      ? 'border-[var(--color-primary)] bg-[var(--color-primary-muted)] text-[var(--color-primary)]'
                      : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[var(--color-overlay)]'
                  }`}
                >
                  สร้างใหม่
                </button>
              </div>
              {addProjectMode === 'select' ? (
                <div className="mb-4 relative">
                  <label className="block text-sm text-[var(--color-text-muted)] mb-1">
                    เลือกโปรเจกต์
                  </label>
                  <input type="hidden" name="selectedProjectId" value={selectedProjectId ?? ''} required />
                  <div
                    className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-page)] focus-within:ring-2 focus-within:ring-[var(--color-primary)] focus-within:border-transparent"
                    onBlur={(e) => {
                      if (!e.currentTarget.contains(e.relatedTarget)) setProjectSelectOpen(false);
                    }}
                  >
                    <div className="flex items-center gap-2 px-4 py-2 min-h-[42px]">
                      <Search className="w-4 h-4 shrink-0 text-[var(--color-text-subtle)]" />
                      <input
                        type="text"
                        value={projectSelectOpen ? projectSearchQuery : (selectedProjectId ? (() => { const p = projectList.find((x) => x.id === selectedProjectId); return p ? `${p.name}${p.summaryStatus ? ` (${p.summaryStatus})` : ''}` : ''; })() : '')}
                        onChange={(e) => {
                          setProjectSearchQuery(e.target.value);
                          setProjectSelectOpen(true);
                          if (!e.target.value) setSelectedProjectId(null);
                        }}
                        onFocus={() => setProjectSelectOpen(true)}
                        placeholder="— เลือกโปรเจกต์ — พิมพ์เพื่อค้นหา..."
                        className="flex-1 min-w-0 bg-transparent text-[var(--color-text)] placeholder-[var(--color-text-subtle)] focus:outline-none text-sm"
                        aria-invalid={!selectedProjectId}
                        aria-describedby="project-list"
                      />
                      <button
                        type="button"
                        onClick={() => setProjectSelectOpen((o) => !o)}
                        className="shrink-0 p-1 rounded-md text-[var(--color-text-subtle)] hover:bg-[var(--color-overlay)]"
                        aria-label={projectSelectOpen ? 'ปิดรายการ' : 'เปิดรายการ'}
                      >
                        <ChevronDown className={`w-4 h-4 transition-transform ${projectSelectOpen ? 'rotate-180' : ''}`} />
                      </button>
                    </div>
                    {projectSelectOpen && (
                      <ul
                        id="project-list"
                        className="max-h-48 overflow-y-auto border-t border-[var(--color-border)] py-1"
                        role="listbox"
                      >
                        {projectListLoading ? (
                          <li className="px-4 py-2 text-sm text-[var(--color-text-muted)]">กำลังโหลด...</li>
                        ) : (() => {
                          const q = projectSearchQuery.trim().toLowerCase();
                          const filtered = q
                            ? projectList.filter(
                                (p) =>
                                  p.name.toLowerCase().includes(q) ||
                                  p.id.toLowerCase().includes(q) ||
                                  (p.summaryStatus && p.summaryStatus.toLowerCase().includes(q))
                              )
                            : projectList;
                          return filtered.length === 0 ? (
                            <li className="px-4 py-2 text-sm text-[var(--color-text-muted)]">ไม่พบโปรเจกต์</li>
                          ) : (
                            filtered.map((p) => {
                              const label = `${p.name}${p.summaryStatus ? ` (${p.summaryStatus})` : ''}`;
                              return (
                                <li
                                  key={p.id}
                                  role="option"
                                  aria-selected={selectedProjectId === p.id}
                                  className={`px-4 py-2 text-sm cursor-pointer hover:bg-[var(--color-overlay)] ${
                                    selectedProjectId === p.id ? 'bg-[var(--color-primary-muted)] text-[var(--color-primary)]' : 'text-[var(--color-text)]'
                                  }`}
                                  onMouseDown={(e) => {
                                    e.preventDefault();
                                    setSelectedProjectId(p.id);
                                    setProjectSearchQuery('');
                                    setProjectSelectOpen(false);
                                  }}
                                >
                                  {label}
                                </li>
                              );
                            })
                          );
                        })()}
                      </ul>
                    )}
                  </div>
                </div>
              ) : (
                <div className="mb-4">
                  <label className="block text-sm text-[var(--color-text-muted)] mb-1">
                    ชื่อโปรเจกต์ (จะสร้างเมื่อเข้าไปบันทึกครั้งแรก)
                  </label>
                  <input
                    type="text"
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                    placeholder="เช่น Performance Management"
                    className="w-full px-4 py-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-page)] text-[var(--color-text)] placeholder-[var(--color-text-subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                  />
                </div>
              )}
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setAddProjectCabId(null)}
                  className="px-4 py-2 rounded-xl border border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[var(--color-overlay)]"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={
                    addProjectMode === 'select' ? !selectedProjectId : !newProjectName.trim()
                  }
                  className="px-4 py-2 rounded-xl bg-[var(--color-primary)] text-white font-medium hover:opacity-90 disabled:opacity-50 disabled:pointer-events-none"
                >
                  เพิ่ม
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
