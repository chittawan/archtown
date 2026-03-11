import React, { useState, useEffect, useCallback, useRef, memo, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Layers,
  Plus,
  Pencil,
  Trash2,
  Save,
  GripVertical,
  FolderPlus,
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
import type { Cap, CapabilityLayout, ProjectInCap } from '../../lib/capabilityYaml';
import { nameToId, ensureUniqueId } from '../../lib/idUtils';
import { motion } from 'motion/react';
import { SortableProjectCard, projectDragId, PROJECT_PREFIX } from '../../components/capability/ProjectCard';
import { SaveStatusIndicator, type SaveStatusIndicatorRef } from '../../components/capability/SaveStatusIndicator';
import { AddCapModal } from './AddCapModal';
import { AddProjectModal } from './AddProjectModal';

const SortableProjectCardAny = SortableProjectCard as any;

export interface ProjectSummary {
  id: string;
  name: string;
  description?: string | null;
  summaryStatus: 'RED' | 'YELLOW' | 'GREEN' | null;
}

async function fetchProjectList(): Promise<ProjectSummary[]> {
  const res = await fetch('/api/projects');
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data.projects) ? data.projects : [];
}

const CAP_PREFIX = 'cap::';

function parseProjectDragId(id: string): { capId: string; projectId: string } | null {
  if (!id.startsWith(PROJECT_PREFIX)) return null;
  const rest = id.slice(PROJECT_PREFIX.length);
  const i = rest.indexOf('::');
  if (i === -1) return null;
  return { capId: rest.slice(0, i), projectId: rest.slice(i + 2) };
}

async function fetchLayout(): Promise<CapabilityLayout> {
  const res = await fetch('/api/capability');
  if (!res.ok) throw new Error('โหลด layout ไม่สำเร็จ');
  const data = await res.json();
  if (!data.layout) throw new Error('ข้อมูล layout ไม่ถูกต้อง');
  return data.layout;
}

async function saveLayout(layout: CapabilityLayout): Promise<boolean> {
  const res = await fetch('/api/capability/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ layout }),
  });
  const data = await res.json().catch(() => ({}));
  return !!data.ok;
}

function capWidthClass(cols?: 12 | 6 | 4 | 3): string {
  const value = cols && [12, 6, 4, 3].includes(cols) ? cols : 4;
  switch (value) {
    case 12: return 'col-span-12';
    case 6: return 'col-span-12 sm:col-span-6';
    case 4: return 'col-span-12 sm:col-span-4';
    case 3: return 'col-span-12 sm:col-span-3';
    default: return 'col-span-12';
  }
}

/** Cache ล่าสุดของ layout ใช้เพื่อไม่ให้แสดง "กำลังโหลด" ตอน remount (เช่น หลัง save) */
let lastLayoutCache: CapabilityLayout | null = null;
/** Cache ล่าสุดของรายชื่อโปรเจกต์ + summaryStatus เพื่อไม่ให้ status หายตอนกลับเข้าหน้า */
let lastProjectListCache: ProjectSummary[] | null = null;

const MemoizedCapCard = memo(function MemoizedCapCard({
  cap,
  capId,
  editingCapId,
  capNameInput,
  children,
}: {
  cap: Cap;
  capId: string;
  editingCapId: string | null;
  capNameInput: string;
  children: React.ReactNode;
}) {
  return <>{children}</>;
}, (prev, next) =>
  prev.capId === next.capId &&
  prev.cap === next.cap &&
  prev.editingCapId === next.editingCapId &&
  prev.capNameInput === next.capNameInput);

export default function CapabilityManagePage() {
  const navigate = useNavigate();
  const [layout, setLayout] = useState<CapabilityLayout>(() => lastLayoutCache ?? { capOrder: [], caps: {} });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const saveStatusRef = useRef<SaveStatusIndicatorRef | null>(null);
  const [addCapOpen, setAddCapOpen] = useState(false);
  const [addProjectCapId, setAddProjectCapId] = useState<string | null>(null);
  const [addProjectMode, setAddProjectMode] = useState<'select' | 'new'>('select');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [editingCapId, setEditingCapId] = useState<string | null>(null);
  const [capNameInput, setCapNameInput] = useState('');
  const [newProjectName, setNewProjectName] = useState('');
  const [projectList, setProjectList] = useState<ProjectSummary[]>(() => lastProjectListCache ?? []);
  const [projectListLoading, setProjectListLoading] = useState(false);
  const [projectSearchQuery, setProjectSearchQuery] = useState('');
  const [projectSelectOpen, setProjectSelectOpen] = useState(false);
  const savedScrollYRef = useRef<number | null>(null);
  const layoutRef = useRef(layout);
  layoutRef.current = layout;

  const projectSummaryById = useMemo(() => {
    const map = new Map<string, ProjectSummary>();
    for (const p of projectList) {
      map.set(p.id, p);
    }
    return map;
  }, [projectList]);

  const filteredProjectList = useMemo(() => {
    const q = projectSearchQuery.trim().toLowerCase();
    if (!q) return projectList;
    return projectList.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.id.toLowerCase().includes(q) ||
        (p.summaryStatus && p.summaryStatus.toLowerCase().includes(q))
    );
  }, [projectList, projectSearchQuery]);

  const selectedProjectLabel = useMemo(() => {
    if (!selectedProjectId) return '';
    const p = projectSummaryById.get(selectedProjectId);
    if (!p) return '';
    return `${p.name}${p.summaryStatus ? ` (${p.summaryStatus})` : ''}`;
  }, [projectSummaryById, selectedProjectId]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor)
  );

  const loadLayout = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchLayout();
      lastLayoutCache = data;
      setLayout(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'โหลดไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadProjectList = useCallback(async () => {
    setProjectListLoading(true);
    try {
      const list = await fetchProjectList();
      lastProjectListCache = list;
      setProjectList(list);
    } finally {
      setProjectListLoading(false);
    }
  }, []);

  useEffect(() => {
    if (lastLayoutCache) {
      setLayout(lastLayoutCache);
      setLoading(false);
      return;
    }
    loadLayout();
  }, [loadLayout]);

  /** กดปุ่ม Capability ใน nav แล้วให้โหลดข้อมูลใหม่ */
  useEffect(() => {
    const onRefresh = () => {
      loadLayout();
      loadProjectList();
    };
    window.addEventListener('capability-refresh', onRefresh);
    return () => window.removeEventListener('capability-refresh', onRefresh);
  }, [loadLayout, loadProjectList]);

  useEffect(() => {
    loadProjectList();
  }, [loadProjectList]);

  /** โหลดข้อมูลใหม่เมื่อเข้า Capability โดยคลิกจาก nav (รวมตอนคลิกจากหน้าอื่น) */
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (sessionStorage.getItem('capability-refresh')) {
      sessionStorage.removeItem('capability-refresh');
      loadLayout();
      loadProjectList();
    }
  }, [loadLayout, loadProjectList]);

  useEffect(() => {
    if (addProjectCapId) {
      loadProjectList();
      setAddProjectMode('select');
      setSelectedProjectId(null);
      setNewProjectName('');
      setProjectSearchQuery('');
      setProjectSelectOpen(false);
    }
  }, [addProjectCapId, loadProjectList]);

  const restoreScrollIfNeeded = useCallback(() => {
    if (savedScrollYRef.current === null) return;
    const y = savedScrollYRef.current;
    savedScrollYRef.current = null;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.scrollTo(0, y);
      });
    });
  }, []);

  /**
   * บันทึก layout ไป server โดยไม่โหลดข้อมูลใหม่ (ไม่ refetch).
   * Caller ต้องอัปเดต UI (setLayout) ก่อนเรียก — ฟังก์ชันนี้ไม่เรียก setLayout เพื่อไม่ให้ re-render ทั้งหน้าหลัง save
   */
  const persistLayout = useCallback(async (next: CapabilityLayout) => {
    lastLayoutCache = next;
    saveStatusRef.current?.setSaveStatus('saving');
    try {
      const ok = await saveLayout(next);
      saveStatusRef.current?.setSaveStatus(ok ? 'ok' : 'error');
      if (ok) setTimeout(() => saveStatusRef.current?.setSaveStatus('idle'), 2000);
    } catch {
      saveStatusRef.current?.setSaveStatus('error');
    }
  }, []);

  const updateLayout = useCallback(
    (updater: (current: CapabilityLayout) => CapabilityLayout) => {
      const current = layoutRef.current;
      const next = updater(current);
      if (next === current) return;
      savedScrollYRef.current = window.scrollY;
      setLayout(next);
      persistLayout(next);
    },
    [persistLayout]
  );

  const handleCapColsChange = useCallback((capId: string, value: 12 | 6 | 4 | 3) => {
    updateLayout((layout) => {
      const cap = layout.caps[capId];
      if (!cap) return layout;
      return {
        ...layout,
        caps: {
          ...layout.caps,
          [capId]: { ...cap, cols: value },
        },
      };
    });
  }, [updateLayout]);

  const handleProjectColsChange = useCallback((capId: string, projectId: string, cols: 12 | 6 | 4 | 3) => {
    updateLayout((layout) => {
      const cap = layout.caps[capId];
      if (!cap) return layout;
      return {
        ...layout,
        caps: {
          ...layout.caps,
          [capId]: {
            ...cap,
            projects: cap.projects.map((p) =>
              p.id === projectId ? { ...p, cols } : p
            ),
          },
        },
      };
    });
  }, [updateLayout]);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over) return;
      const overId = String(over.id);

      const projectPayload = parseProjectDragId(String(active.id));
      if (projectPayload) {
        const { capId: sourceCapId, projectId } = projectPayload;
        const sourceCap = layout.caps[sourceCapId];
        const project = sourceCap?.projects.find((p) => p.id === projectId);
        if (!sourceCap || !project) return;

        if (overId.startsWith(CAP_PREFIX)) {
          const targetCapId = overId.slice(CAP_PREFIX.length);
          if (targetCapId === sourceCapId) return;
          const targetCap = layout.caps[targetCapId];
          if (!targetCap) return;
          updateLayout((current) => {
            const currentSource = current.caps[sourceCapId];
            const currentTarget = current.caps[targetCapId];
            if (!currentSource || !currentTarget) return current;
            const proj = currentSource.projects.find((p) => p.id === projectId);
            if (!proj) return current;
            return {
              ...current,
              caps: {
                ...current.caps,
                [sourceCapId]: {
                  ...currentSource,
                  projects: currentSource.projects.filter((p) => p.id !== projectId),
                },
                [targetCapId]: {
                  ...currentTarget,
                  projects: [...currentTarget.projects, proj],
                },
              },
            };
          });
          return;
        }

        const overProject = parseProjectDragId(overId);
        if (overProject) {
          const { capId: targetCapId } = overProject;
          const targetCap = layout.caps[targetCapId];
          if (!targetCap) return;
          const sourceProjects = sourceCap.projects.filter((p) => p.id !== projectId);
          const targetProjects = [...targetCap.projects];
          const overIndex = targetProjects.findIndex((p) => p.id === overProject.projectId);
          const insertIndex = overIndex >= 0 ? overIndex : targetProjects.length;
          if (sourceCapId === targetCapId) {
            const from = sourceCap.projects.findIndex((p) => p.id === projectId);
            if (from === -1) return;
            const reordered = arrayMove(
              sourceCap.projects.map((p) => p.id),
              from,
              insertIndex > from ? insertIndex - 1 : insertIndex
            );
            const ordered = reordered
              .map((id) => sourceCap.projects.find((p) => p.id === id))
              .filter(Boolean) as ProjectInCap[];
            updateLayout((current) => {
              const currentSource = current.caps[sourceCapId];
              if (!currentSource) return current;
              return {
                ...current,
                caps: {
                  ...current.caps,
                  [sourceCapId]: { ...currentSource, projects: ordered },
                },
              };
            });
          } else {
            targetProjects.splice(insertIndex, 0, project);
            updateLayout((current) => {
              const currentSource = current.caps[sourceCapId];
              const currentTarget = current.caps[targetCapId];
              if (!currentSource || !currentTarget) return current;
              return {
                ...current,
                caps: {
                  ...current.caps,
                  [sourceCapId]: { ...currentSource, projects: sourceProjects },
                  [targetCapId]: { ...currentTarget, projects: targetProjects },
                },
              };
            });
          }
        }
        return;
      }

      if (String(active.id).startsWith('sortable-cap-')) {
        const capId = String(active.id).replace(/^sortable-cap-/, '');
        const overStr = String(over.id);
        const overCapId = overStr.startsWith('sortable-cap-') ? overStr.replace(/^sortable-cap-/, '') : null;
        if (!overCapId || capId === overCapId) return;
        const from = layout.capOrder.indexOf(capId);
        const to = layout.capOrder.indexOf(overCapId);
        if (from === -1 || to === -1) return;
        const nextOrder = arrayMove(layout.capOrder, from, to);
        updateLayout((current) => ({
          ...current,
          capOrder: nextOrder,
        }));
      }
    },
    [layout, updateLayout]
  );

  const handleAddCap = (e: React.FormEvent) => {
    e.preventDefault();
    const name = capNameInput.trim();
    if (!name) return;
    const existing = Object.keys(layout.caps);
    const id = ensureUniqueId(nameToId(name), existing);
    const next: CapabilityLayout = {
      capOrder: [...layout.capOrder, id],
      caps: { ...layout.caps, [id]: { id, name, cols: 4, projects: [] } },
    };
    updateLayout(() => next);
    setCapNameInput('');
    setAddCapOpen(false);
  };

  const handleEditCap = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCapId) return;
    const name = capNameInput.trim();
    if (!name) return;
    const cap = layout.caps[editingCapId];
    if (!cap) return;
    const next = { ...layout, caps: { ...layout.caps, [editingCapId]: { ...cap, name } } };
    updateLayout(() => next);
    setEditingCapId(null);
    setCapNameInput('');
  };

  const handleDeleteCap = (capId: string) => {
    const cap = layout.caps[capId];
    const capName = cap?.name ?? capId;
    if (!confirm(`ลบกลุ่ม "${capName}" ใช่หรือไม่? โปรเจกต์ภายในจะถูกเอาออกจากกลุ่มนี้ (ไม่ลบข้อมูลโปรเจกต์)`)) return;
    const nextOrder = layout.capOrder.filter((id) => id !== capId);
    const { [capId]: _, ...restCaps } = layout.caps;
    const nextLayout = { capOrder: nextOrder, caps: restCaps };
    updateLayout(() => nextLayout);
    setEditingCapId(null);
  };

  const handleAddProject = (e: React.FormEvent) => {
    e.preventDefault();
    const capId = addProjectCapId;
    if (!capId) return;
    const cap = layout.caps[capId];
    if (!cap) return;
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
      id = nameToId(name);
    }
    const existingIds = cap.projects.map((p) => p.id);
    if (existingIds.includes(id)) return;
    const project: ProjectInCap = { id, name, cols: 4 };
    const next = {
      ...layout,
      caps: {
        ...layout.caps,
        [capId]: { ...cap, projects: [...cap.projects, project] },
      },
    };
    updateLayout(() => next);
    setSelectedProjectId(null);
    setNewProjectName('');
    setAddProjectCapId(null);
  };

  const handleRemoveProject = (capId: string, projectId: string) => {
    const cap = layout.caps[capId];
    if (!cap) return;
    const next = {
      ...layout,
      caps: {
        ...layout.caps,
        [capId]: {
          ...cap,
          projects: cap.projects.filter((p) => p.id !== projectId),
        },
      },
    };
    updateLayout(() => next);
  };

  const handleDoubleClickProject = useCallback(
    (project: ProjectInCap) => {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('projectName', project.name);
        localStorage.setItem('projectId', project.id);
      }
      navigate(`/project?id=${encodeURIComponent(project.id)}`);
    },
    [navigate]
  );

  useEffect(() => {
    function handleSummaryOpen(event: Event) {
      const custom = event as CustomEvent<
        | {
            capName: string;
            projectName: string;
          }
        | null
      >;
      const detail = custom.detail;
      if (!detail) return;

      const layout = layoutRef.current;
      const cap = Object.values<Cap>(layout.caps).find(
        (c) => c.name === detail.capName
      );
      if (!cap) return;
      const project = cap.projects.find((p) => p.name === detail.projectName);
      if (!project) return;

      handleDoubleClickProject(project);
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('summary-project-open', handleSummaryOpen as EventListener);
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('summary-project-open', handleSummaryOpen as EventListener);
      }
    };
  }, [handleDoubleClickProject]);

  function SortableCapCard({
    capId,
    cap,
    editingCapId: editingCapIdProp,
    capNameInput: capNameInputProp,
  }: {
    capId: string;
    cap: Cap;
    editingCapId: string | null;
    capNameInput: string;
  }) {
    if (!cap) return null;
    const isEditing = editingCapIdProp === capId;
    const {
      attributes,
      listeners,
      setNodeRef,
      transform,
      transition,
      isDragging,
    } = useSortable({ id: `sortable-cap-${capId}` as any });
    const { setNodeRef: setDropRef, isOver } = useDroppable({
      id: `${CAP_PREFIX}${capId}`,
    });
    const sortableProjectIds = cap.projects.map((p) => projectDragId(capId, p.id));
    const style = { transform: CSS.Transform.toString(transform), transition };
    const cols = cap.cols;

    return (
      <div
        ref={setNodeRef}
        style={style}
        className={`flex flex-col min-w-[220px] ${capWidthClass(cols)}`}
      >
        <div
          ref={setDropRef}
          className={`group/cap rounded-2xl border-2 border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden transition-all ${
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
            <h3 className="flex-1 font-semibold text-[var(--color-text)] truncate transition-[color,opacity] duration-200 ease-out">
              {isEditing ? (
                <input
                  type="text"
                  value={capNameInputProp}
                  onChange={(e) => setCapNameInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleEditCap(e as any)}
                  className="w-full bg-transparent border-b border-[var(--color-border)] focus:outline-none focus:border-[var(--color-primary)] text-[var(--color-text)]"
                  autoFocus
                />
              ) : (
                cap.name
              )}
            </h3>
            <div
              className={`flex items-center gap-1.5 transition-opacity ${
                isEditing ? 'opacity-100' : 'opacity-0 group-hover/cap:opacity-100'
              }`}
            >
              <div className="hidden sm:block">
                <label className="sr-only" htmlFor={`cap-cols-${capId}`}>
                  ความกว้างกล่องกลุ่ม
                </label>
                <select
                  id={`cap-cols-${capId}`}
                  value={cap.cols ?? 4}
                  onChange={(e) => {
                    handleCapColsChange(capId, Number(e.target.value) as 12 | 6 | 4 | 3);
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
              {isEditing ? (
                <>
                  <button
                    type="button"
                    onClick={(e) => handleEditCap(e as any)}
                    className="p-1 rounded-lg text-[var(--color-primary)] hover:bg-[var(--color-overlay)]"
                  >
                    <Save className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteCap(capId)}
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
                      setEditingCapId(capId);
                      setCapNameInput(cap.name);
                    }}
                    className="p-1 rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-primary)] hover:bg-[var(--color-overlay)]"
                    title="แก้ไขชื่อกลุ่ม"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setAddProjectCapId(capId)}
                    className="p-1.5 rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-primary)] hover:bg-[var(--color-overlay)]"
                    title="เพิ่มโปรเจกต์ในกลุ่มนี้"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </>
              )}
            </div>
          </div>
          <div className="p-3 min-h-0">
            <SortableContext items={sortableProjectIds} strategy={rectSortingStrategy}>
              <motion.div
                layout
                className="grid grid-cols-12 gap-2"
                transition={{
                  layout: {
                    duration: 0.4,
                    ease: [0.32, 0.72, 0, 1],
                  },
                }}
              >
                {cap.projects.map((project) => {
                  const summary = projectSummaryById.get(project.id);
                  const displayStatus = summary?.summaryStatus ?? project.status ?? null;
                  const description = summary?.description ?? null;
                  return (
                    <React.Fragment key={`${capId}-${project.id}`}>
                      <SortableProjectCardAny
                        capId={capId}
                        capName={cap.name}
                        project={project}
                        displayStatus={displayStatus}
                        description={description}
                        onRemove={() => handleRemoveProject(capId, project.id)}
                        onDoubleClick={() => handleDoubleClickProject(project)}
                        onChangeCols={(cols) => {
                          handleProjectColsChange(capId, project.id, cols);
                        }}
                      />
                    </React.Fragment>
                  );
                })}
              </motion.div>
            </SortableContext>
            {cap.projects.length === 0 && (
              <p className="text-sm text-[var(--color-text-muted)] italic py-2 text-center">
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
            ภาพรวมโปรเจกต์
          </h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            จัดกลุ่มโปรเจกต์— ดับเบิลคลิกที่การ์ดเพื่อเปิดโปรเจกต์ · ลากวางเพื่อจัดเรียงหรือย้ายระหว่างกลุ่ม
          </p>
        </div>
        <div className="flex items-center gap-3">
          <SaveStatusIndicator ref={saveStatusRef} onSettled={restoreScrollIfNeeded} />
          <button
            type="button"
            onClick={() => {
              setCapNameInput('');
              setAddCapOpen(true);
            }}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--color-primary)] text-white font-medium hover:opacity-90 transition-opacity shadow-[var(--shadow-card)]"
          >
            <Plus className="w-4 h-4" />
            เพิ่มกลุ่ม
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

      {loading && !lastLayoutCache ? (
        <div className="py-12 text-center text-[var(--color-text-muted)]">กำลังโหลด...</div>
      ) : layout.capOrder.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-[var(--color-border)] bg-[var(--color-surface)] p-12 text-center">
          <FolderPlus className="w-12 h-12 mx-auto text-[var(--color-text-subtle)] mb-4" />
          <p className="text-[var(--color-text-muted)] mb-2">ยังไม่มีกลุ่ม (Cap)</p>
          <p className="text-sm text-[var(--color-text-subtle)] mb-6">
            กด &quot;เพิ่มกลุ่ม (Cap)&quot; เพื่อสร้างกลุ่มแล้วเพิ่มโปรเจกต์
          </p>
          <button
            type="button"
            onClick={() => setAddCapOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--color-primary)] text-white font-medium"
          >
            <Plus className="w-4 h-4" />
            เพิ่มกลุ่ม (Cap)
          </button>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={layout.capOrder.map((id) => `sortable-cap-${id}`)}
            strategy={rectSortingStrategy}
          >
            <div className="grid grid-cols-12 gap-6">
              {layout.capOrder.map((capId) => {
                const cap = layout.caps[capId];
                if (!cap) return null;
                const isEditingThisCap = editingCapId === capId;
                const scopedEditingCapId = isEditingThisCap ? editingCapId : null;
                const scopedCapNameInput = isEditingThisCap ? capNameInput : '';
                return (
                  <MemoizedCapCard
                    key={capId}
                    capId={capId}
                    cap={cap}
                    editingCapId={scopedEditingCapId}
                    capNameInput={scopedCapNameInput}
                  >
                    <SortableCapCard
                      capId={capId}
                      cap={cap}
                      editingCapId={scopedEditingCapId}
                      capNameInput={scopedCapNameInput}
                    />
                  </MemoizedCapCard>
                );
              })}
            </div>
          </SortableContext>
        </DndContext>
      )}

      <AddCapModal
        isOpen={addCapOpen}
        capNameInput={capNameInput}
        onCapNameChange={setCapNameInput}
        onSubmit={handleAddCap}
        onClose={() => setAddCapOpen(false)}
      />

      <AddProjectModal
        capId={addProjectCapId}
        addProjectMode={addProjectMode}
        setAddProjectMode={setAddProjectMode}
        selectedProjectId={selectedProjectId}
        setSelectedProjectId={setSelectedProjectId}
        newProjectName={newProjectName}
        setNewProjectName={setNewProjectName}
        projectListLoading={projectListLoading}
        filteredProjectList={filteredProjectList}
        projectSearchQuery={projectSearchQuery}
        setProjectSearchQuery={setProjectSearchQuery}
        projectSelectOpen={projectSelectOpen}
        setProjectSelectOpen={setProjectSelectOpen}
        selectedProjectLabel={selectedProjectLabel}
        onSubmit={handleAddProject}
        onClose={() => setAddProjectCapId(null)}
      />
    </div>
  );
}
