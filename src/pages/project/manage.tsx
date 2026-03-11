import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, ChevronDown, ChevronRight, Trash2, Users, FolderPlus, FilePlus, GripVertical, Check, Circle, Download, Upload, FileText, FolderKanban, Save } from 'lucide-react';
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
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Team, Topic, SubTopic, Status } from '../../types';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { SummaryView } from '../../components/project/SummaryView';
import { exportToMarkdown, importFromMarkdown } from '../../lib/projectMarkdown';
import { nameToId, ensureUniqueId } from '../../lib/idUtils';

const REMOVE_HOLD_MS = 1000;

/** ปุ่มลบแบบกดค้าง 1 วินาที (แนวทางเดียวกับ capability/ProjectCard) */
function LongPressDeleteButton({
  onDelete,
  title,
  className = '',
  iconClassName = 'w-4 h-4',
  ariaLabel,
}: {
  onDelete: () => void;
  title: string;
  className?: string;
  iconClassName?: string;
  ariaLabel?: string;
}) {
  const [progress, setProgress] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startRef = useRef(0);
  const rafRef = useRef<number>(0);

  const clear = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
    setProgress(0);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    clear();
    startRef.current = Date.now();
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }
      setProgress(0);
      onDelete();
    }, REMOVE_HOLD_MS);
    const tick = () => {
      const elapsed = Date.now() - startRef.current;
      const p = Math.min(100, (elapsed / REMOVE_HOLD_MS) * 100);
      setProgress(p);
      if (p < 100 && timerRef.current != null) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
  };

  return (
    <button
      type="button"
      onPointerDown={onPointerDown}
      onPointerUp={clear}
      onPointerLeave={clear}
      onPointerCancel={clear}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      className={`relative p-1.5 rounded-md text-[var(--color-text-subtle)] hover:text-red-500 hover:bg-red-500/10 dark:hover:bg-red-500/20 overflow-hidden transition-colors ${className}`}
      title={`${title} — กดค้าง 1 วินาที`}
      aria-label={ariaLabel ?? `กดค้าง 1 วินาทีเพื่อ${title}`}
    >
      {progress > 0 && (
        <span
          className="absolute inset-0 bg-red-500/30 rounded-md ease-linear"
          style={{ width: `${progress}%`, transition: 'none' }}
        />
      )}
      <span className="relative z-10 block">
        <Trash2 className={iconClassName} />
      </span>
    </button>
  );
}

const INITIAL_DATA: Team[] = [
];

export default function ProjectManagePage() {
  const [searchParams] = useSearchParams();
  const projectIdFromUrl = searchParams.get('id');
  const [projectId, setProjectId] = useState<string | null>(projectIdFromUrl);
  const [teams, setTeams] = useState<Team[]>(INITIAL_DATA);
  const [projectLoadState, setProjectLoadState] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle');
  // เริ่มต้นให้หัวข้อใหญ่ทั้งหมด "หุบ" ไว้ก่อน
  const [expandedTopics, setExpandedTopics] = useState<Set<string>>(
    () => new Set()
  );
  const [isTeamModalOpen, setIsTeamModalOpen] = useState(false);
  const [orgTeamsForSelect, setOrgTeamsForSelect] = useState<{ id: string; name: string }[]>([]);
  const [loadingOrgTeams, setLoadingOrgTeams] = useState(false);
  const [selectedOrgTeamId, setSelectedOrgTeamId] = useState<string | null>(null);
  const [isTopicModalOpen, setIsTopicModalOpen] = useState(false);
  const [isSubTopicModalOpen, setIsSubTopicModalOpen] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
  const [newTopicTitle, setNewTopicTitle] = useState('');
  const [newSubTopicTitle, setNewSubTopicTitle] = useState('');
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState(() => {
    if (typeof window === 'undefined') return 'Performance Management';
    return localStorage.getItem('projectName') ?? 'Performance Management';
  });
  const [projectDescription, setProjectDescription] = useState('');
  const [isEditingProjectName, setIsEditingProjectName] = useState(false);
  const [projectNameInput, setProjectNameInput] = useState(projectName);
  const [editingTeamId, setEditingTeamId] = useState<string | null>(null);
  const [editTeamName, setEditTeamName] = useState('');
  const [editingTopic, setEditingTopic] = useState<{ teamId: string; topicId: string } | null>(
    null
  );
  const [editTopicTitle, setEditTopicTitle] = useState('');
  const [editingSubTopic, setEditingSubTopic] = useState<{
    teamId: string;
    topicId: string;
    subTopicId: string;
  } | null>(null);
  const [editSubTopicTitle, setEditSubTopicTitle] = useState('');
  const [openTodoSectionIds, setOpenTodoSectionIds] = useState<Set<string>>(
    () => new Set()
  );
  const [statusFilter, setStatusFilter] = useState<Set<Status>>(() => new Set());
  const [expandHoldProgress, setExpandHoldProgress] = useState(0);
  const expandHoldTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const expandHoldStartRef = useRef<number>(0);
  const expandHoldRafRef = useRef<number>(0);
  const expandDidLongPressRef = useRef(false);
  const [isSummaryViewOpen, setIsSummaryViewOpen] = useState(false);

  useEffect(() => {
    if (projectName) localStorage.setItem('projectName', projectName);
  }, [projectName]);

  useEffect(() => {
    setProjectId(projectIdFromUrl);
  }, [projectIdFromUrl]);

  // Sync จาก TodoPanel (แผงขวา) → อัปเดต teams บนหน้า Project ให้ตรงกันแบบ realtime
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = (event: Event) => {
      const custom = event as CustomEvent<{ projectId?: string | null; teams: Team[] }>;
      const detail = custom.detail;
      if (!detail?.projectId || !projectIdFromUrl) return;
      if (detail.projectId !== projectIdFromUrl) return;
      setTeams(detail.teams ?? []);
    };
    window.addEventListener('project-todos-updated', handler as EventListener);
    return () => {
      window.removeEventListener('project-todos-updated', handler as EventListener);
    };
  }, [projectIdFromUrl]);

  /** โหลดข้อมูลโปรเจกต์จาก data/projects/ เมื่อเปิดจาก Capability (มี ?id= ใน URL) */
  useEffect(() => {
    if (!projectIdFromUrl || projectLoadState !== 'idle') return;
    setProjectLoadState('loading');
    fetch(`/api/projects/${encodeURIComponent(projectIdFromUrl)}`)
      .then((res) => {
        if (!res.ok) throw new Error(res.status === 404 ? 'Not found' : 'Failed to load');
        return res.json();
      })
      .then((data: { id?: string; data?: { projectName: string; description?: string; teams: Team[] } }) => {
        const payload = data?.data;
        if (!payload) {
          setProjectLoadState('idle');
          return;
        }
        if (data.id) setProjectId(data.id);
        const { projectName: name, description: desc, teams: nextTeams } = payload;
        setProjectName(name || '');
        setProjectNameInput(name || '');
        setProjectDescription(desc ?? '');
        setTeams(nextTeams);
        // เข้ามาครั้งแรกให้หุบหมด (ไม่ auto-expand หัวข้อใหญ่)
        setExpandedTopics(new Set());
        setProjectLoadState('loaded');
      })
      .catch(() => setProjectLoadState('error'));
  }, [projectIdFromUrl, projectLoadState]);

  useEffect(() => {
    if (!isTeamModalOpen && !editingTeamId) return;
    setLoadingOrgTeams(true);
    if (!editingTeamId) {
      setSelectedOrgTeamId(null);
      setNewTeamName('');
    }
    fetch('/api/teams')
      .then((res) => (res.ok ? res.json() : { ids: [] }))
      .then((data: { ids?: string[] }) => {
        const ids = Array.isArray(data.ids) ? data.ids : [];
        return Promise.all(
          ids.map((id: string) =>
            fetch(`/api/teams/${encodeURIComponent(id)}`)
              .then((r) => (r.ok ? r.json() : null))
              .then((raw: { id?: string; data?: { name: string }; markdown?: string } | null) =>
                raw != null && raw.data != null
                  ? { id: raw.id ?? id, name: raw.data.name }
                  : null
              )
          )
        );
      })
      .then((list) => setOrgTeamsForSelect(list.filter(Boolean) as { id: string; name: string }[]))
      .catch(() => setOrgTeamsForSelect([]))
      .finally(() => setLoadingOrgTeams(false));
  }, [isTeamModalOpen, editingTeamId]);

  // เมื่อเปิด modal แก้ไขชื่อทีม และโหลดรายชื่อทีมเสร็จ ให้เลือกทีมที่ชื่อตรงกับทีมที่กำลังแก้
  useEffect(() => {
    if (!editingTeamId || orgTeamsForSelect.length === 0) return;
    const team = teams.find((t) => t.id === editingTeamId);
    if (!team) return;
    const org = orgTeamsForSelect.find((o) => o.name === team.name);
    setSelectedOrgTeamId(org?.id ?? null);
  }, [editingTeamId, orgTeamsForSelect, teams]);

  const getTopicStatus = (topic: Topic): Status => {
    if (topic.subTopics.length === 0) return 'GREEN';
    if (topic.subTopics.some((st) => st.status === 'RED')) return 'RED';
    if (topic.subTopics.some((st) => st.status === 'YELLOW')) return 'YELLOW';
    return 'GREEN';
  };

  const toggleTopic = (topicId: string) => {
    setExpandedTopics((prev) => {
      const next = new Set(prev);
      if (next.has(topicId)) next.delete(topicId);
      else next.add(topicId);
      return next;
    });
  };

  const collapseAllTopics = () => {
    setExpandedTopics(new Set());
    setStatusFilter(new Set());
  };

  const collapseAllTopicsWithTodos = () => {
    setExpandedTopics(new Set());
    setOpenTodoSectionIds(new Set());
    setStatusFilter(new Set());
  };

  const expandAllTopics = () => {
    const allTopicIds = teams.flatMap((t) => t.topics.map((topic) => topic.id));
    setExpandedTopics(new Set(allTopicIds));
  };

  const toggleTodoSectionOpen = (subTopicId: string) => {
    setOpenTodoSectionIds((prev) => {
      const next = new Set(prev);
      if (next.has(subTopicId)) next.delete(subTopicId);
      else next.add(subTopicId);
      return next;
    });
  };

  const expandAllTopicsWithTodos = () => {
    expandAllTopics();
    const allSubTopicIds = teams.flatMap((t) =>
      t.topics.flatMap((top) => top.subTopics.map((s) => s.id))
    );
    setOpenTodoSectionIds(new Set(allSubTopicIds));
  };

  function getFilteredTeams(teamsData: Team[], selected: Set<Status>): Team[] {
    if (selected.size === 0) return teamsData;
    return teamsData
      .map((team) => ({
        ...team,
        topics: team.topics
          .filter((topic) => topic.subTopics.some((s) => selected.has(s.status)))
          .map((topic) => ({
            ...topic,
            subTopics: topic.subTopics.filter((s) => selected.has(s.status)),
          }))
          .filter((topic) => topic.subTopics.length > 0),
      }))
      .filter((team) => team.topics.length > 0);
  }

  const toggleStatusFilter = (status: Status) => {
    setStatusFilter((prev) => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  };

  /** จำนวนหัวข้อย่อยแยกตามสถานะ (ใช้แสดง Summary ใน Status Legend) */
  const statusCounts = useMemo(() => {
    const counts: Record<Status, number> = { GREEN: 0, YELLOW: 0, RED: 0 };
    teams.forEach((team) => {
      team.topics.forEach((topic) => {
        topic.subTopics.forEach((st) => {
          counts[st.status]++;
        });
      });
    });
    return counts;
  }, [teams]);

  const expandAllRedWithTodos = () => {
    const topicIdsWithRed = teams.flatMap((t) =>
      t.topics
        .filter((topic) => topic.subTopics.some((s) => s.status === 'RED'))
        .map((topic) => topic.id)
    );
    const redSubTopicIds = teams.flatMap((t) =>
      t.topics.flatMap((topic) =>
        topic.subTopics.filter((s) => s.status === 'RED').map((s) => s.id)
      )
    );
    setStatusFilter(new Set(['RED']));
    setExpandedTopics(new Set(topicIdsWithRed));
    setOpenTodoSectionIds(new Set(redSubTopicIds));
  };

  const clearExpandHold = () => {
    if (expandHoldTimerRef.current) {
      clearTimeout(expandHoldTimerRef.current);
      expandHoldTimerRef.current = null;
    }
    if (expandHoldRafRef.current) {
      cancelAnimationFrame(expandHoldRafRef.current);
      expandHoldRafRef.current = 0;
    }
    setExpandHoldProgress(0);
  };

  const handleExpandAllPointerDown = () => {
    expandDidLongPressRef.current = false;
    clearExpandHold();
    expandHoldStartRef.current = Date.now();
    expandHoldTimerRef.current = setTimeout(() => {
      expandHoldTimerRef.current = null;
      expandDidLongPressRef.current = true;
      expandAllRedWithTodos();
      setExpandHoldProgress(0);
      if (expandHoldRafRef.current) {
        cancelAnimationFrame(expandHoldRafRef.current);
        expandHoldRafRef.current = 0;
      }
    }, 1000);
    const tick = () => {
      const elapsed = Date.now() - expandHoldStartRef.current;
      const progress = Math.min(100, (elapsed / 1000) * 100);
      setExpandHoldProgress(progress);
      if (progress < 100 && expandHoldTimerRef.current != null) {
        expandHoldRafRef.current = requestAnimationFrame(tick);
      }
    };
    expandHoldRafRef.current = requestAnimationFrame(tick);
  };

  const handleExpandAllPointerUp = () => {
    clearExpandHold();
  };

  const handleExpandAllClick = (e: React.MouseEvent) => {
    if (expandDidLongPressRef.current) {
      e.preventDefault();
      expandDidLongPressRef.current = false;
      return;
    }
    expandAllTopics();
  };

  const handleExpandAllDoubleClick = (e: React.MouseEvent) => {
    if (expandDidLongPressRef.current) {
      e.preventDefault();
      expandDidLongPressRef.current = false;
      return;
    }
    expandAllTopicsWithTodos();
  };

  const exportProject = () => {
    const md = exportToMarkdown(projectName, teams);
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(projectName || 'project').replace(/[^\p{L}\p{N}\s_-]/gu, '_')}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  /** บันทึกลง data/projects/{projectName}.md ผ่าน API (dev) หรือ fallback เป็นดาวน์โหลด */
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'ok' | 'error'>('idle');
  const skipSaveAfterLoadRef = useRef(true);

  /**
   * Auto-save:
   * - มี ?id= ใน URL เท่านั้น (projectIdFromUrl)
   * - ทำงานเมื่อโหลดสำเร็จ (loaded) หรือโหลดไม่เจอไฟล์ (error → โปรเจกต์ใหม่)
   * - ข้ามครั้งแรกหลัง loaded เพื่อไม่ให้ save ทันทีหลังโหลดจากไฟล์
   */
  useEffect(() => {
    if (!projectIdFromUrl) return;
    if (projectLoadState === 'idle' || projectLoadState === 'loading') return;
    if (projectLoadState === 'loaded' && skipSaveAfterLoadRef.current) {
      skipSaveAfterLoadRef.current = false;
      return;
    }
    const t = setTimeout(() => saveProjectToData(), 700);
    return () => clearTimeout(t);
  }, [teams, projectName, projectDescription, projectLoadState, projectIdFromUrl]);

  const downloadAsMarkdown = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const saveProjectToData = async () => {
    const name = (projectName || 'project').trim();
    /** ไม่ใช้ชื่อจาก localStorage เป็น fileId เมื่อเปิด /project โดยไม่มี ?id= — ใช้ 'project' เพื่อไม่ให้ไปบันทึกทับไฟล์อื่น */
    const fileId =
      projectId ||
      (projectLoadState === 'loaded' ? nameToId(name) : null) ||
      'project';
    const data = { id: fileId, projectName: name, description: projectDescription.trim() || undefined, teams };
    setSaveStatus('saving');
    try {
      const res = await fetch('/api/save-project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectName: name, data }),
      });
      const resData = await res.json().catch(() => ({}));
      if (res.ok && resData.ok) {
        if (resData.id) setProjectId(resData.id);
        setSaveStatus('ok');
        setTimeout(() => setSaveStatus('idle'), 2000);
        const savedId = resData.id || fileId;
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('project-summary-invalidate', { detail: { projectId: savedId } }));
        }
      } else {
        const md = exportToMarkdown(projectName, teams);
        downloadAsMarkdown(md, fileId);
        setSaveStatus('ok');
        setTimeout(() => setSaveStatus('idle'), 2000);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('project-summary-invalidate', { detail: { projectId: fileId } }));
        }
      }
    } catch {
      const md = exportToMarkdown(projectName, teams);
      downloadAsMarkdown(md, fileId);
      setSaveStatus('ok');
      setTimeout(() => setSaveStatus('idle'), 2000);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('project-summary-invalidate', { detail: { projectId: fileId } }));
      }
    }
  };

  const importFileInputRef = useRef<HTMLInputElement>(null);

  const importProject = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      try {
        const { projectName: name, teams: nextTeams } = importFromMarkdown(text);
        setProjectName(name || projectName);
        setTeams(nextTeams);
        const allTopicIds = nextTeams.flatMap((t) => t.topics.map((top) => top.id));
        setExpandedTopics(new Set(allTopicIds));
        setOpenTodoSectionIds(new Set());
        setStatusFilter(new Set());
      } catch (_) {
        console.error('Import failed');
      }
    };
    reader.readAsText(file, 'UTF-8');
    e.target.value = '';
  };

  const handleAddTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingTeamId) {
      const name = selectedOrgTeamId
        ? (orgTeamsForSelect.find((o) => o.id === selectedOrgTeamId)?.name ?? newTeamName.trim())
        : newTeamName.trim();
      if (name.trim()) {
        updateTeamName(editingTeamId, name.trim());
      }
      setEditingTeamId(null);
      setIsTeamModalOpen(false);
      setSelectedOrgTeamId(null);
      setNewTeamName('');
      return;
    }
    const projectTeamIds = new Set(teams.map((t) => t.id));
    if (selectedOrgTeamId) {
      const org = orgTeamsForSelect.find((o) => o.id === selectedOrgTeamId);
      if (org) {
        let id = org.id;
        if (projectTeamIds.has(id)) id = `${id}-${Date.now()}`;
        setTeams([...teams, { id, name: org.name, topics: [] }]);
      }
      setSelectedOrgTeamId(null);
    } else if (newTeamName.trim()) {
      const name = newTeamName.trim();
      const existingOrgIds = orgTeamsForSelect.map((o) => o.id);
      const id = ensureUniqueId(nameToId(name) || 'team', existingOrgIds);
      const orgTeam = {
        id,
        name,
        owner: '',
        parentId: null as string | null,
        childIds: [] as string[],
      };
      const res = await fetch('/api/teams/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, data: orgTeam }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        setOrgTeamsForSelect((prev) => [...prev, { id, name }]);
      }
      setTeams([...teams, { id, name, topics: [] }]);
      setNewTeamName('');
    } else return;
    setIsTeamModalOpen(false);
  };

  const handleAddTopic = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTopicTitle.trim() || !selectedTeamId) return;
    setTeams(
      teams.map((team) =>
        team.id === selectedTeamId
          ? {
              ...team,
              topics: [
                ...team.topics,
                {
                  id: `top-${Date.now()}`,
                  title: newTopicTitle,
                  subTopics: [],
                },
              ],
            }
          : team
      )
    );
    setNewTopicTitle('');
    setIsTopicModalOpen(false);
    setSelectedTeamId(null);
  };

  const handleAddSubTopic = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubTopicTitle.trim() || !selectedTeamId || !selectedTopicId) return;
    setTeams(
      teams.map((team) =>
        team.id === selectedTeamId
          ? {
              ...team,
              topics: team.topics.map((topic) =>
                topic.id === selectedTopicId
                  ? {
                      ...topic,
                      subTopics: [
                        ...topic.subTopics,
                        {
                          id: `sub-${Date.now()}`,
                          title: newSubTopicTitle,
                          status: 'GREEN',
                          details: [],
                        },
                      ],
                    }
                  : topic
              ),
            }
          : team
      )
    );
    setExpandedTopics((prev) => new Set(prev).add(selectedTopicId));
    setNewSubTopicTitle('');
    setIsSubTopicModalOpen(false);
    setSelectedTeamId(null);
    setSelectedTopicId(null);
  };

  const updateSubTopicStatus = (
    teamId: string,
    topicId: string,
    subTopicId: string,
    newStatus: Status
  ) => {
    setTeams(
      teams.map((team) =>
        team.id === teamId
          ? {
              ...team,
              topics: team.topics.map((topic) =>
                topic.id === topicId
                  ? {
                      ...topic,
                      subTopics: topic.subTopics.map((st) =>
                        st.id === subTopicId ? { ...st, status: newStatus } : st
                      ),
                    }
                  : topic
              ),
            }
          : team
      )
    );
  };

  const deleteTeam = (teamId: string) => {
    setTeams(teams.filter((t) => t.id !== teamId));
  };

  const deleteTopic = (teamId: string, topicId: string) => {
    setTeams(
      teams.map((team) =>
        team.id === teamId
          ? { ...team, topics: team.topics.filter((t) => t.id !== topicId) }
          : team
      )
    );
  };

  const deleteSubTopic = (
    teamId: string,
    topicId: string,
    subTopicId: string
  ) => {
    setTeams(
      teams.map((team) =>
        team.id === teamId
          ? {
              ...team,
              topics: team.topics.map((topic) =>
                topic.id === topicId
                  ? {
                      ...topic,
                      subTopics: topic.subTopics.filter((st) => st.id !== subTopicId),
                    }
                  : topic
              ),
            }
          : team
      )
    );
  };

  const updateTeamName = (teamId: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setTeams(
      teams.map((t) => (t.id === teamId ? { ...t, name: trimmed } : t))
    );
  };

  const updateTopicTitle = (
    teamId: string,
    topicId: string,
    title: string
  ) => {
    const trimmed = title.trim();
    if (!trimmed) return;
    setTeams(
      teams.map((t) =>
        t.id !== teamId
          ? t
          : {
              ...t,
              topics: t.topics.map((topic) =>
                topic.id === topicId ? { ...topic, title: trimmed } : topic
              ),
            }
      )
    );
  };

  const updateSubTopicTitle = (
    teamId: string,
    topicId: string,
    subTopicId: string,
    title: string
  ) => {
    const trimmed = title.trim();
    if (!trimmed) return;
    setTeams(
      teams.map((t) =>
        t.id !== teamId
          ? t
          : {
              ...t,
              topics: t.topics.map((topic) =>
                topic.id === topicId
                  ? {
                      ...topic,
                      subTopics: topic.subTopics.map((s) =>
                        s.id === subTopicId ? { ...s, title: trimmed } : s
                      ),
                    }
                  : topic
              ),
            }
      )
    );
  };

  const addSubTopicDetail = (
    teamId: string,
    topicId: string,
    subTopicId: string
  ) => {
    setTeams(
      teams.map((t) =>
        t.id !== teamId
          ? t
          : {
              ...t,
              topics: t.topics.map((topic) =>
                topic.id === topicId
                  ? {
                      ...topic,
                      subTopics: topic.subTopics.map((s) =>
                        s.id === subTopicId
                          ? {
                              ...s,
                              details: [...(s.details ?? []), { text: '', done: false }],
                            }
                          : s
                      ),
                    }
                  : topic
              ),
            }
      )
    );
  };

  const updateSubTopicDetail = (
    teamId: string,
    topicId: string,
    subTopicId: string,
    index: number,
    text: string
  ) => {
    setTeams(
      teams.map((t) =>
        t.id !== teamId
          ? t
          : {
              ...t,
              topics: t.topics.map((topic) =>
                topic.id === topicId
                  ? {
                      ...topic,
                      subTopics: topic.subTopics.map((s) => {
                        if (s.id !== subTopicId) return s;
                        const next = [...(s.details ?? [])];
                        if (next[index]) next[index] = { ...next[index], text };
                        return { ...s, details: next };
                      }),
                    }
                  : topic
              ),
            }
      )
    );
  };

  const updateSubTopicDetailDueDate = (
    teamId: string,
    topicId: string,
    subTopicId: string,
    index: number,
    dueDate: string | undefined
  ) => {
    setTeams(
      teams.map((t) =>
        t.id !== teamId
          ? t
          : {
              ...t,
              topics: t.topics.map((topic) =>
                topic.id !== topicId
                  ? topic
                  : {
                      ...topic,
                      subTopics: topic.subTopics.map((s) => {
                        if (s.id !== subTopicId) return s;
                        const next = [...(s.details ?? [])];
                        if (next[index])
                          next[index] = {
                            ...next[index],
                            dueDate: dueDate && dueDate.trim() ? dueDate.trim() : undefined,
                          };
                        return { ...s, details: next };
                      }),
                    }
              ),
            }
      )
    );
  };

  const removeSubTopicDetail = (
    teamId: string,
    topicId: string,
    subTopicId: string,
    index: number
  ) => {
    setTeams(
      teams.map((t) =>
        t.id !== teamId
          ? t
          : {
              ...t,
              topics: t.topics.map((topic) =>
                topic.id === topicId
                  ? {
                      ...topic,
                      subTopics: topic.subTopics.map((s) => {
                        if (s.id !== subTopicId) return s;
                        const next = (s.details ?? []).filter((_, i) => i !== index);
                        return { ...s, details: next };
                      }),
                    }
                  : topic
              ),
            }
      )
    );
  };

  const toggleSubTopicDetailDone = (
    teamId: string,
    topicId: string,
    subTopicId: string,
    index: number
  ) => {
    setTeams(
      teams.map((t) =>
        t.id !== teamId
          ? t
          : {
              ...t,
              topics: t.topics.map((topic) =>
                topic.id === topicId
                  ? {
                      ...topic,
                      subTopics: topic.subTopics.map((s) => {
                        if (s.id !== subTopicId) return s;
                        const next = [...(s.details ?? [])];
                        if (next[index])
                          next[index] = { ...next[index], done: !next[index].done };
                        return { ...s, details: next };
                      }),
                    }
                  : topic
              ),
            }
      )
    );
  };

  const reorderTopics = (teamId: string, fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;
    setTeams(
      teams.map((team) =>
        team.id !== teamId
          ? team
          : { ...team, topics: arrayMove(team.topics, fromIndex, toIndex) }
      )
    );
  };

  const moveOrReorderSubTopic = (
    teamId: string,
    sourceTopicId: string,
    subTopic: SubTopic,
    targetTopicId: string,
    targetIndex: number
  ) => {
    setTeams(
      teams.map((t) => {
        if (t.id !== teamId) return t;
        if (sourceTopicId === targetTopicId) {
          const topic = t.topics.find((topic) => topic.id === sourceTopicId);
          if (!topic) return t;
          const fromIndex = topic.subTopics.findIndex((s) => s.id === subTopic.id);
          if (fromIndex === -1 || fromIndex === targetIndex) return t;
          const newSubTopics = arrayMove(
            topic.subTopics,
            fromIndex,
            targetIndex
          );
          return {
            ...t,
            topics: t.topics.map((topic) =>
              topic.id === sourceTopicId
                ? { ...topic, subTopics: newSubTopics }
                : topic
            ),
          };
        }
        const withoutSource = t.topics.map((topic) =>
          topic.id === sourceTopicId
            ? {
                ...topic,
                subTopics: topic.subTopics.filter((s) => s.id !== subTopic.id),
              }
            : topic
        );
        const targetTopic = withoutSource.find(
          (topic) => topic.id === targetTopicId
        );
        if (!targetTopic) return t;
        const insertIndex = Math.min(
          targetIndex,
          targetTopic.subTopics.length
        );
        const newSubTopics = [...targetTopic.subTopics];
        newSubTopics.splice(insertIndex, 0, subTopic);
        return {
          ...t,
          topics: withoutSource.map((topic) =>
            topic.id === targetTopicId
              ? { ...topic, subTopics: newSubTopics }
              : topic
          ),
        };
      })
    );
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor)
  );

  const handleDragEnd = (teamId: string) => (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const team = teams.find((t) => t.id === teamId);
    if (!team) return;
    if (active.data.current?.type === 'topic') {
      const fromIndex = team.topics.findIndex((t) => t.id === active.id);
      const toIndex = team.topics.findIndex((t) => t.id === over.id);
      if (fromIndex !== -1 && toIndex !== -1)
        reorderTopics(teamId, fromIndex, toIndex);
      return;
    }
    if (active.data.current?.type === 'subtopic') {
      const { topicId: sourceTopicId, subTopic } = active.data.current as {
        topicId: string;
        subTopic: SubTopic;
      };
      const overId = String(over.id);
      let targetTopicId: string;
      let targetIndex: number;
      if (overId.startsWith('subtopic-list-')) {
        const targetTopic = team.topics.find(
          (t) => overId === `subtopic-list-${teamId}-${t.id}`
        );
        if (!targetTopic) return;
        targetTopicId = targetTopic.id;
        targetIndex = targetTopic.subTopics.length;
      } else if (overId.startsWith('sub__')) {
        const parts = overId.slice(5).split('__');
        if (parts.length < 2) return;
        targetTopicId = parts[0];
        const overSubId = parts[1];
        const targetTopic = team.topics.find((t) => t.id === targetTopicId);
        const pos =
          targetTopic?.subTopics.findIndex((s) => s.id === overSubId) ?? -1;
        targetIndex =
          pos >= 0 ? pos : (targetTopic?.subTopics.length ?? 0);
      } else {
        return;
      }
      const targetTopic = team.topics.find((t) => t.id === targetTopicId);
      if (!targetTopic) return;
      moveOrReorderSubTopic(
        teamId,
        sourceTopicId,
        subTopic,
        targetTopicId,
        targetIndex
      );
    }
  };

  function SortableTopicRow({
    teamId,
    topic,
    isExpanded,
    onToggle,
    topicStatus,
    onAddSubTopic,
    onDeleteTopic,
    isEditingTitle,
    editTitleValue,
    onEditTitleChange,
    onStartEditTitle,
    onSaveEditTitle,
    onCancelEditTitle,
  }: {
    teamId: string;
    topic: Topic;
    isExpanded: boolean;
    onToggle: () => void;
    topicStatus: Status;
    onAddSubTopic: () => void;
    onDeleteTopic: () => void;
    isEditingTitle: boolean;
    editTitleValue: string;
    onEditTitleChange: (v: string) => void;
    onStartEditTitle: () => void;
    onSaveEditTitle: () => void;
    onCancelEditTitle: () => void;
  }) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
      useSortable({ id: topic.id, data: { type: 'topic' as const } });
    const style = { transform: CSS.Transform.toString(transform), transition };
    return (
      <div
        ref={setNodeRef}
        style={style}
        className={`flex flex-col ${isDragging ? 'opacity-60 z-20' : ''}`}
      >
        <div
          className={`group/topic px-6 py-4 flex items-center justify-between hover:bg-[var(--color-overlay)] transition-colors cursor-pointer border-l-4 border-l-transparent ${isExpanded ? 'bg-[var(--color-overlay)] border-l-[var(--color-primary)]' : ''}`}
          onClick={onToggle}
        >
          <div className="flex items-center flex-1 min-w-0">
            <button
              className="p-1 mr-2 text-[var(--color-text-subtle)] hover:text-[var(--color-text-muted)] rounded touch-none cursor-grab active:cursor-grabbing"
              onClick={(e) => e.stopPropagation()}
              {...attributes}
              {...listeners}
              aria-label="ลากเพื่อเรียงลำดับ"
            >
              <GripVertical className="w-5 h-5" />
            </button>
            <button className="p-1 mr-2 text-[var(--color-text-subtle)] hover:text-[var(--color-text-muted)] rounded">
              {isExpanded ? (
                <ChevronDown className="w-5 h-5" />
              ) : (
                <ChevronRight className="w-5 h-5" />
              )}
            </button>
            {isEditingTitle ? (
              <input
                type="text"
                value={editTitleValue}
                onChange={(e) => onEditTitleChange(e.target.value)}
                onBlur={() => onSaveEditTitle()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onSaveEditTitle();
                  if (e.key === 'Escape') onCancelEditTitle();
                }}
                onClick={(e) => e.stopPropagation()}
                className="text-base font-medium text-[var(--color-text)] bg-[var(--color-surface)] border border-[var(--color-border-strong)] rounded px-2 py-0.5 flex-1 min-w-0 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                autoFocus
              />
            ) : (
              <h3
                className="text-base font-medium text-[var(--color-text)] cursor-text flex-1 min-w-0"
                onClick={(e) => {
                  e.stopPropagation();
                  onStartEditTitle();
                }}
              >
                {topic.title}
              </h3>
            )}
          </div>
          <div className="flex items-center space-x-4 flex-shrink-0">
            <div
              className="flex items-center space-x-2 opacity-0 group-hover/topic:opacity-100 transition-opacity"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => onAddSubTopic()}
                className="inline-flex items-center px-2.5 py-1.5 bg-[var(--color-primary-muted)] text-[var(--color-primary)] hover:bg-[var(--color-primary-muted-hover)] dark:text-[var(--color-primary)] text-xs font-medium rounded-md transition-colors"
              >
                <FilePlus className="w-3.5 h-3.5 mr-1" />
                เพิ่มหัวข้อย่อย
              </button>
              <LongPressDeleteButton
                onDelete={onDeleteTopic}
                title="ลบหัวข้อใหญ่"
              />
            </div>
            <StatusBadge status={topicStatus} variant="compact" />
          </div>
        </div>
      </div>
    );
  }

  function SortableSubTopicCard({
    topicId,
    subTopic,
    onUpdateStatus,
    onDelete,
    isEditingTitle,
    editTitleValue,
    onEditTitleChange,
    onStartEditTitle,
    onSaveEditTitle,
    onCancelEditTitle,
    onAddDetail,
    onUpdateDetail,
    onUpdateDetailDueDate,
    onRemoveDetail,
    onToggleDetailDone,
    isTodoSectionOpen,
    onTodoSectionToggle,
  }: {
    key?: React.Key;
    teamId: string;
    topicId: string;
    subTopic: SubTopic;
    onUpdateStatus: (s: Status) => void;
    onDelete: () => void;
    isEditingTitle: boolean;
    editTitleValue: string;
    onEditTitleChange: (v: string) => void;
    onStartEditTitle: () => void;
    onSaveEditTitle: (finalTitle?: string) => void;
    onCancelEditTitle: () => void;
    onAddDetail: () => void;
    onUpdateDetail: (index: number, value: string) => void;
    onUpdateDetailDueDate: (index: number, dueDate: string | undefined) => void;
    onRemoveDetail: (index: number) => void;
    onToggleDetailDone: (index: number) => void;
    isTodoSectionOpen: boolean;
    onTodoSectionToggle: () => void;
  }) {
    const id = `sub__${topicId}__${subTopic.id}`;
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
      useSortable({
        id,
        data: { type: 'subtopic' as const, topicId, subTopic },
      });
    const style = { transform: CSS.Transform.toString(transform), transition };
    const details = subTopic.details ?? [];
    const [draftDetailText, setDraftDetailText] = useState<Record<number, string>>({});
    // Local state for title while editing so parent doesn't re-render on every keystroke (avoids cursor jumping)
    const [localTitle, setLocalTitle] = useState(editTitleValue);
    const prevIsEditingTitle = useRef(false);
    useEffect(() => {
      // Only sync from parent when we first enter edit mode; avoid overwriting while user types (cursor jump to end)
      if (isEditingTitle && !prevIsEditingTitle.current) {
        setLocalTitle(editTitleValue);
      }
      prevIsEditingTitle.current = isEditingTitle;
    }, [isEditingTitle, editTitleValue]);
    const handleSaveEditTitle = () => {
      onEditTitleChange(localTitle);
      onSaveEditTitle(localTitle);
    };
    const getDetailDisplayValue = (index: number, item: { text: string }) =>
      draftDetailText[index] !== undefined ? draftDetailText[index] : item.text;
    const flushDetailDraft = (index: number) => {
      const value =
        draftDetailText[index] !== undefined
          ? draftDetailText[index]
          : details[index]?.text ?? '';
      onUpdateDetail(index, value);
      setDraftDetailText((prev) => {
        const next = { ...prev };
        delete next[index];
        return next;
      });
    };
    const getDaysLeft = (dueDate?: string) => {
      if (!dueDate) return null;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const due = new Date(dueDate + 'T00:00:00');
      const diffMs = due.getTime() - today.getTime();
      const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
      if (diffDays < 0) return null;
      if (diffDays === 0) return 'วันนี้';
      return `อีก ${diffDays} วัน`;
    };
    const isOverdueAndNotDone = (dueDate?: string, done?: boolean) => {
      if (!dueDate || done) return false;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const due = new Date(dueDate + 'T00:00:00');
      return due.getTime() < today.getTime();
    };
    return (
      <div
        ref={setNodeRef}
        style={style}
        className={`flex flex-col bg-[var(--color-surface)] rounded-lg border border-[var(--color-border)] shadow-[var(--shadow-card)] overflow-hidden ${isDragging ? 'opacity-80 shadow-lg z-10' : ''}`}
      >
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <button
              className="p-1 text-[var(--color-text-subtle)] hover:text-[var(--color-text-muted)] rounded touch-none cursor-grab active:cursor-grabbing flex-shrink-0"
              {...attributes}
              {...listeners}
              aria-label="ลากเพื่อเรียงหรือย้าย"
            >
              <GripVertical className="w-4 h-4" />
            </button>
            {isEditingTitle ? (
              <input
                type="text"
                value={localTitle}
                onChange={(e) => setLocalTitle(e.target.value)}
                onBlur={() => handleSaveEditTitle()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveEditTitle();
                  if (e.key === 'Escape') onCancelEditTitle();
                }}
                className="text-sm font-medium text-[var(--color-text)] bg-[var(--color-page)] border border-[var(--color-border-strong)] rounded px-2 py-1 flex-1 min-w-0 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                autoFocus
              />
            ) : (
              <button
                type="button"
                onClick={() => onStartEditTitle()}
                className="flex-1 min-w-0 text-sm font-medium text-[var(--color-text)] truncate text-left hover:bg-[var(--color-overlay)] rounded px-1 -mx-1 py-0.5"
              >
                {subTopic.title}
              </button>
            )}
          </div>
          <div className="flex items-center space-x-3 flex-shrink-0">
            <div className="flex bg-[var(--color-overlay)] p-1 rounded-lg">
              {(['GREEN', 'YELLOW', 'RED'] as Status[]).map((s) => (
                <button
                  key={s}
                  onClick={() => onUpdateStatus(s)}
                  className={`w-[7.5rem] min-w-[7.5rem] px-3 py-1 text-xs font-medium rounded-md transition-all ${
                    subTopic.status === s
                      ? s === 'GREEN'
                        ? 'bg-emerald-500 text-white shadow-sm'
                        : s === 'YELLOW'
                          ? 'bg-amber-500 text-white shadow-sm'
                          : 'bg-rose-500 text-white shadow-sm'
                      : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-border-strong)]'
                  }`}
                >
                  {s === 'GREEN'
                    ? 'ปกติ'
                    : s === 'YELLOW'
                      ? 'จัดการได้'
                      : 'ต้องการ Support'}
                </button>
              ))}
            </div>
            <LongPressDeleteButton
              onDelete={onDelete}
              title="ลบหัวข้อย่อย"
            />
          </div>
        </div>
        <div className="border-t border-[var(--color-border)] bg-[var(--color-page)]/50">
          <button
            type="button"
            onClick={onTodoSectionToggle}
            className="w-full px-4 py-3 flex items-center justify-start gap-2 text-left hover:bg-[var(--color-overlay)] transition-colors"
          >
            {isTodoSectionOpen ? (
              <ChevronDown className="w-4 h-4 text-[var(--color-text-subtle)] flex-shrink-0" />
            ) : (
              <ChevronRight className="w-4 h-4 text-[var(--color-text-subtle)] flex-shrink-0" />
            )}
            <span className="text-xs font-medium text-[var(--color-text-muted)]">
              Todo / Task
              {details.length > 0 && (
                <span className="ml-1.5 text-[var(--color-text-subtle)]">
                  — {details.length} รายการ
                </span>
              )}
            </span>
          </button>
          {isTodoSectionOpen && (
            <div className="px-4 pb-3 pt-0">
              <div className="space-y-1.5">
                {details.map((item, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onToggleDetailDone(index)}
                      className="flex-shrink-0 p-0.5 rounded text-[var(--color-text-subtle)] hover:text-[var(--color-primary)]"
                      title={item.done ? 'ยกเลิกทำแล้ว' : 'ทำแล้ว'}
                    >
                      {item.done ? (
                        <Check className="w-4 h-4 text-emerald-500" />
                      ) : (
                        <Circle className="w-4 h-4" />
                      )}
                    </button>
                    <span className="text-xs font-medium text-[var(--color-text-subtle)] w-5 flex-shrink-0 text-right">
                      {index + 1}.
                    </span>
                    <div className="flex-1 min-w-0 flex items-center gap-2">
                      <input
                        type="text"
                        value={getDetailDisplayValue(index, item)}
                        onChange={(e) =>
                          setDraftDetailText((prev) => ({
                            ...prev,
                            [index]: e.target.value,
                          }))
                        }
                        onBlur={() => flushDetailDraft(index)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            flushDetailDraft(index);
                            (e.target as HTMLInputElement).blur();
                          }
                        }}
                        placeholder={`Task ${index + 1}`}
                        className={`flex-1 min-w-0 text-sm bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] ${item.done ? 'line-through text-[var(--color-text-subtle)]' : 'text-[var(--color-text)]'}`}
                      />
                      <div className="flex items-center gap-1.5 shrink-0 text-[10px] leading-tight w-[180px] justify-start">
                        <input
                          type="date"
                          value={item.dueDate ?? ''}
                          onChange={(e) =>
                            onUpdateDetailDueDate(index, e.target.value || undefined)
                          }
                          title="Due date"
                          className={`shrink-0 text-[11px] bg-[var(--color-surface)] border rounded px-1.5 py-1 text-[var(--color-text)] focus:outline-none focus:ring-2 ${
                            isOverdueAndNotDone(item.dueDate, item.done)
                              ? 'border-red-500 text-red-500 focus:ring-red-500'
                              : 'border-[var(--color-border)] focus:ring-[var(--color-primary)]'
                          }`}
                        />
                        {getDaysLeft(item.dueDate) && (
                          <span className="text-[var(--color-text-subtle)] whitespace-nowrap">
                            {getDaysLeft(item.dueDate)}
                          </span>
                        )}
                      </div>
                    </div>
                    <LongPressDeleteButton
                      onDelete={() => onRemoveDetail(index)}
                      title="ลบรายการ"
                      className="p-1"
                      iconClassName="w-3.5 h-3.5"
                    />
                  </div>
                ))}
                <button
                  type="button"
                  onClick={onAddDetail}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--color-primary)] hover:text-[var(--color-primary-hover)] mt-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  เพิ่ม Task / รายการ
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  function SubtopicDroppableArea({
    teamId,
    topic,
    isExpanded,
    updateSubTopicStatus,
    deleteSubTopic,
    editingSubTopic,
    editSubTopicTitle,
    onEditSubTopicTitleChange,
    onStartEditSubTopicTitle,
    onSaveEditSubTopicTitle,
    onCancelEditSubTopicTitle,
    onAddDetail,
    onUpdateDetail,
    onUpdateDetailDueDate,
    onRemoveDetail,
    onToggleDetailDone,
    openTodoSectionIds,
    onTodoSectionToggle,
  }: {
    teamId: string;
    topic: Topic;
    isExpanded: boolean;
    updateSubTopicStatus: (
      topicId: string,
      subTopicId: string,
      s: Status
    ) => void;
    deleteSubTopic: (topicId: string, subTopicId: string) => void;
    editingSubTopic: {
      teamId: string;
      topicId: string;
      subTopicId: string;
    } | null;
    editSubTopicTitle: string;
    onEditSubTopicTitleChange: (v: string) => void;
    onStartEditSubTopicTitle: (topicId: string, subTopicId: string) => void;
    onSaveEditSubTopicTitle: (finalTitle?: string) => void;
    onCancelEditSubTopicTitle: () => void;
    onAddDetail: (topicId: string, subTopicId: string) => void;
    onUpdateDetail: (
      topicId: string,
      subTopicId: string,
      index: number,
      value: string
    ) => void;
    onUpdateDetailDueDate: (
      topicId: string,
      subTopicId: string,
      index: number,
      dueDate: string | undefined
    ) => void;
    onRemoveDetail: (
      topicId: string,
      subTopicId: string,
      index: number
    ) => void;
    onToggleDetailDone: (
      topicId: string,
      subTopicId: string,
      index: number
    ) => void;
    openTodoSectionIds: Set<string>;
    onTodoSectionToggle: (subTopicId: string) => void;
  }) {
    const { setNodeRef, isOver } = useDroppable({
      id: `subtopic-list-${teamId}-${topic.id}`,
    });
    if (!isExpanded) return null;
    return (
      <div
        ref={setNodeRef}
        className={`border-t border-[var(--color-border)] px-6 py-3 transition-colors ${isOver ? 'bg-[var(--color-primary-muted)]/50' : 'bg-[var(--color-overlay)]'}`}
      >
        {topic.subTopics.length === 0 ? (
          <div className="pl-10 py-3 text-sm text-[var(--color-text-muted)] italic min-h-[44px]">
            ยังไม่มีหัวข้อย่อย — ลากหัวข้อย่อยจากหัวข้ออื่นมาวางที่นี่ได้
          </div>
        ) : (
          <SortableContext
            items={topic.subTopics.map((s) => `sub__${topic.id}__${s.id}`)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-2 pl-10">
              {topic.subTopics.map((subTopic) => (
                <SortableSubTopicCard
                  key={subTopic.id}
                  teamId={teamId}
                  topicId={topic.id}
                  subTopic={subTopic}
                  isTodoSectionOpen={openTodoSectionIds.has(subTopic.id)}
                  onTodoSectionToggle={() => onTodoSectionToggle(subTopic.id)}
                  onUpdateStatus={(status) =>
                    updateSubTopicStatus(topic.id, subTopic.id, status)
                  }
                  onDelete={() => deleteSubTopic(topic.id, subTopic.id)}
                  isEditingTitle={
                    editingSubTopic?.teamId === teamId &&
                    editingSubTopic?.topicId === topic.id &&
                    editingSubTopic?.subTopicId === subTopic.id
                  }
                  editTitleValue={editSubTopicTitle}
                  onEditTitleChange={onEditSubTopicTitleChange}
                  onStartEditTitle={() =>
                    onStartEditSubTopicTitle(topic.id, subTopic.id)
                  }
                  onSaveEditTitle={onSaveEditSubTopicTitle}
                  onCancelEditTitle={onCancelEditSubTopicTitle}
                  onAddDetail={() => onAddDetail(topic.id, subTopic.id)}
                  onUpdateDetail={(index, value) =>
                    onUpdateDetail(topic.id, subTopic.id, index, value)
                  }
                  onUpdateDetailDueDate={(index, dueDate) =>
                    onUpdateDetailDueDate(topic.id, subTopic.id, index, dueDate)
                  }
                  onRemoveDetail={(index) =>
                    onRemoveDetail(topic.id, subTopic.id, index)
                  }
                  onToggleDetailDone={(index) =>
                    onToggleDetailDone(topic.id, subTopic.id, index)
                  }
                />
              ))}
            </div>
          </SortableContext>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      {projectLoadState === 'loading' && (
        <div className="mb-4 text-sm text-[var(--color-text-muted)]">กำลังโหลดโปรเจกต์...</div>
      )}
      {projectLoadState === 'error' && projectIdFromUrl && (
        <div className="mb-4 text-sm text-amber-600 dark:text-amber-400">โหลดข้อมูลจาก data/projects ไม่ได้ — แก้ไขหรือสร้างโปรเจกต์ได้ตามปกติ</div>
      )}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold text-[var(--color-text)] flex items-center gap-2">
            <FolderKanban className="w-7 h-7 text-[var(--color-primary)] shrink-0" />
            {isEditingProjectName ? (
              <input
                type="text"
                value={projectNameInput}
                onChange={(e) => setProjectNameInput(e.target.value)}
                onBlur={() => {
                  if (projectNameInput.trim()) setProjectName(projectNameInput.trim());
                  setIsEditingProjectName(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    if (projectNameInput.trim()) setProjectName(projectNameInput.trim());
                    setIsEditingProjectName(false);
                  }
                  if (e.key === 'Escape') {
                    setProjectNameInput(projectName);
                    setIsEditingProjectName(false);
                  }
                }}
                placeholder="ชื่อโปรเจกต์"
                className="flex-1 min-w-0 bg-transparent border-b border-[var(--color-border)] focus:outline-none focus:border-[var(--color-primary)] text-[var(--color-text)] py-0.5"
                autoFocus
              />
            ) : (
              <button
                type="button"
                onClick={() => {
                  setProjectNameInput(projectName);
                  setIsEditingProjectName(true);
                }}
                className="text-left hover:text-[var(--color-primary)] transition-colors truncate max-w-full"
              >
                {projectName || 'คลิกเพื่อเพิ่มชื่อโปรเจกต์'}
              </button>
            )}
          </h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            ลากวางเพื่อจัดเรียง · Import/Export · Summary View พิมพ์ PDF ได้
          </p>
        </div>

        {/* ขวา: Save status + ปุ่ม */}
        <div className="flex flex-wrap items-center gap-3 shrink-0">
          {saveStatus === 'saving' && (
            <span className="text-sm text-[var(--color-text-muted)] flex items-center gap-1.5">
              <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
              กำลังบันทึก...
            </span>
          )}
          {saveStatus === 'ok' && (
            <span className="text-sm text-[var(--color-primary)] flex items-center gap-1.5">
              <Save className="w-4 h-4" />
              บันทึกแล้ว
            </span>
          )}
          <div className="flex items-center gap-1.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]/60 px-1.5 py-1">
            <button
              type="button"
              onClick={() => importFileInputRef.current?.click()}
              className="inline-flex items-center px-3 py-2 text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-overlay)] border-0 rounded-lg text-sm font-medium transition-colors"
              title="Import จากไฟล์ Markdown"
            >
              <Upload className="w-4 h-4 sm:mr-1.5" />
              <span className="hidden sm:inline">Import</span>
            </button>
            <button
              onClick={exportProject}
              className="inline-flex items-center px-3 py-2 text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-overlay)] border-0 rounded-lg text-sm font-medium transition-colors"
              title="Export เป็นไฟล์ Markdown"
            >
              <Download className="w-4 h-4 sm:mr-1.5" />
              <span className="hidden sm:inline">Export</span>
            </button>
          </div>
          <input
            ref={importFileInputRef}
            type="file"
            accept=".md,.markdown,text/markdown,text/x-markdown,text/plain"
            className="hidden"
            onChange={importProject}
          />
          <div className="h-6 w-px bg-[var(--color-border)] hidden sm:block" aria-hidden />
          <button
            type="button"
            onClick={() => setIsSummaryViewOpen(true)}
            className="inline-flex items-center px-3 py-2 text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-overlay)] border border-[var(--color-border)] rounded-xl text-sm font-medium transition-colors"
            title="Summary View สำหรับผู้บริหาร — พิมพ์เป็น PDF ได้"
          >
            <FileText className="w-4 h-4 mr-1.5" />
            Summary View
          </button>
          <div className="h-6 w-px bg-[var(--color-border)] hidden sm:block" aria-hidden />
          <button
            onClick={() => setIsTeamModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--color-primary)] text-white font-medium hover:opacity-90 transition-opacity shadow-[var(--shadow-card)]"
          >
            <Plus className="w-4 h-4" />
            เพิ่มทีม
          </button>
        </div>
      </div>

      {/* คำอธิบายโปรเจกต์ — แนว Notion */}
      <div className="mb-6">
        <textarea
          id="projectDescription"
          value={projectDescription}
          onChange={(e) => setProjectDescription(e.target.value)}
          placeholder="เพิ่มคำอธิบายโปรเจกต์ (Description)..."
          rows={2}
          className="w-full px-4 py-2.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] placeholder-[var(--color-text-subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/50 focus:border-[var(--color-primary)] resize-y min-h-[3.5rem] text-sm transition-colors"
        />
      </div>

      <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-4 mb-8 flex flex-wrap gap-3 items-center text-sm shadow-[var(--shadow-card)]">
        <span className="font-medium text-[var(--color-text-muted)] mr-1 shrink-0">
          Status:
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setStatusFilter(new Set())}
            className={`inline-flex items-center justify-between w-[7.5rem] h-8 px-3 rounded-md text-xs font-medium border transition-colors shrink-0 ${
              statusFilter.size === 0
                ? 'ring-1.5 ring-[var(--color-primary)] ring-offset-1 ring-offset-[var(--color-surface)] bg-[var(--color-primary-muted)] text-[var(--color-primary)] border-[var(--color-primary)]'
                : 'bg-[var(--color-overlay)] text-[var(--color-text-muted)] border-[var(--color-border)] hover:bg-[var(--color-overlay)]/80 hover:text-[var(--color-text)]'
            }`}
            title="แสดงทั้งหมด"
          >
            <span>ทั้งหมด</span>
            <span className="text-[11px] text-[var(--color-text-muted)] tabular-nums">
              {statusCounts.GREEN + statusCounts.YELLOW + statusCounts.RED}
            </span>
          </button>
          <button
            type="button"
            onClick={() => toggleStatusFilter('GREEN')}
            className={`inline-flex items-center justify-between w-[7.5rem] h-8 px-3 rounded-md border transition-colors shrink-0 ${
              statusFilter.has('GREEN')
                ? 'ring-1.5 ring-[var(--color-primary)] ring-offset-1 ring-offset-[var(--color-surface)] bg-emerald-100 dark:bg-emerald-900/40 border-emerald-200 dark:border-emerald-700/60'
                : 'bg-emerald-100 dark:bg-emerald-900/40 border-emerald-200 dark:border-emerald-700/60 hover:opacity-90'
            }`}
            title="กรองเฉพาะสถานะ ปกติ"
          >
            <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-800 dark:text-emerald-200">
              <span>🟢</span> ปกติ
            </span>
            <span className="text-[11px] text-emerald-700/80 dark:text-emerald-300/80 tabular-nums">
              {statusCounts.GREEN}
            </span>
          </button>
          <button
            type="button"
            onClick={() => toggleStatusFilter('YELLOW')}
            className={`inline-flex items-center justify-between w-[7.5rem] h-8 px-3 rounded-md border transition-colors shrink-0 ${
              statusFilter.has('YELLOW')
                ? 'ring-1.5 ring-[var(--color-primary)] ring-offset-1 ring-offset-[var(--color-surface)] bg-amber-100 dark:bg-amber-900/40 border-amber-200 dark:border-amber-700/60'
                : 'bg-amber-100 dark:bg-amber-900/40 border-amber-200 dark:border-amber-700/60 hover:opacity-90'
            }`}
            title="กรองเฉพาะสถานะ จัดการได้"
          >
            <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-800 dark:text-amber-200">
              <span>🟡</span> จัดการได้
            </span>
            <span className="text-[11px] text-amber-700/80 dark:text-amber-300/80 tabular-nums">
              {statusCounts.YELLOW}
            </span>
          </button>
          <button
            type="button"
            onClick={() => toggleStatusFilter('RED')}
            className={`inline-flex items-center justify-between w-[7.5rem] h-8 px-3 rounded-md border transition-colors shrink-0 ${
              statusFilter.has('RED')
                ? 'ring-1.5 ring-[var(--color-primary)] ring-offset-1 ring-offset-[var(--color-surface)] bg-rose-100 dark:bg-rose-900/40 border-rose-200 dark:border-rose-700/60'
                : 'bg-rose-100 dark:bg-rose-900/40 border-rose-200 dark:border-rose-700/60 hover:opacity-90'
            }`}
            title="กรองเฉพาะสถานะ ต้องการ Support"
          >
            <span className="inline-flex items-center gap-1 text-xs font-medium text-rose-800 dark:text-rose-200">
              <span>🔴</span> ต้องการ Support
            </span>
            <span className="text-[11px] text-rose-700/80 dark:text-rose-300/80 tabular-nums">
              {statusCounts.RED}
            </span>
          </button>
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <button
            type="button"
            onClick={collapseAllTopics}
            onDoubleClick={collapseAllTopicsWithTodos}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-overlay)] rounded-lg border border-[var(--color-border)] transition-colors"
            title="คลิก: หุบหัวข้อใหญ่ทั้งหมด | Double-click: หุบหัวข้อใหญ่ + หุบ Todo ทั้งหมด"
          >
            <ChevronRight className="w-4 h-4" />
            หุบทั้งหมด
          </button>
          <button
            type="button"
            onClick={handleExpandAllClick}
            onDoubleClick={handleExpandAllDoubleClick}
            onPointerDown={handleExpandAllPointerDown}
            onPointerUp={handleExpandAllPointerUp}
            onPointerLeave={handleExpandAllPointerUp}
            className="relative inline-flex items-center gap-1.5 px-3 py-1.5 text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-overlay)] rounded-lg border border-[var(--color-border)] transition-colors overflow-hidden"
            title="คลิก: คลายหัวข้อใหญ่ทั้งหมด | Double-click: คลายหัวข้อใหญ่ + เปิด Todo ทั้งหมด | กดค้าง 1 วินาที: แสดงเฉพาะ RED + คลาย Todo"
          >
            <span
              className="absolute inset-y-0 left-0 bg-[var(--color-primary)] opacity-25 rounded-lg ease-linear"
              style={{ width: `${expandHoldProgress}%`, transition: 'none' }}
            />
            <span className="relative z-10 flex items-center gap-1.5">
              <ChevronDown className="w-4 h-4" />
              คลายทั้งหมด
            </span>
          </button>
        </div>
      </div>

      {teams.length === 0 ? (
        <div className="text-center py-12 bg-[var(--color-surface)] rounded-2xl border-2 border-dashed border-[var(--color-border)]">
          <Users className="mx-auto h-12 w-12 text-[var(--color-text-subtle)]" />
          <h3 className="mt-2 text-sm font-semibold text-[var(--color-text)]">
            ยังไม่มีทีม
          </h3>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            เริ่มต้นโดยการสร้างทีมใหม่เพื่อเพิ่มหัวข้อการประชุม
          </p>
          <div className="mt-6">
            <button
              onClick={() => setIsTeamModalOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--color-primary)] text-white font-medium hover:opacity-90 transition-opacity shadow-[var(--shadow-card)]"
            >
              <Plus className="w-4 h-4" />
              สร้างทีมแรก
            </button>
          </div>
        </div>
      ) : (() => {
        const filteredTeams = getFilteredTeams(teams, statusFilter);
        if (filteredTeams.length === 0) {
          const labels = statusFilter.has('GREEN') ? ['เขียว'] : [];
          if (statusFilter.has('YELLOW')) labels.push('เหลือง');
          if (statusFilter.has('RED')) labels.push('แดง');
          return (
            <div className="text-center py-12 bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)]">
              <p className="text-sm font-medium text-[var(--color-text)]">
                {statusFilter.size === 0
                  ? 'ไม่มีทีมหรือหัวข้อ'
                  : `ไม่มีหัวข้อที่ตรงกับสถานะที่เลือก${labels.length ? ` (${labels.join(', ')})` : ''}`}
              </p>
              <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                กดปุ่มสถานะเพื่อเลือก/ยกเลิกหลายสถานะ หรือกด &quot;ทั้งหมด&quot; เพื่อแสดงทั้งหมด
              </p>
            </div>
          );
        }
        return (
        <div className="space-y-8">
          {filteredTeams.map((team) => (
            <DndContext
              key={team.id}
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd(team.id)}
            >
              <div className="group/team bg-[var(--color-surface)] rounded-2xl border-2 border-[var(--color-border)] overflow-hidden shadow-[var(--shadow-card)] transition-all">
                <div className="bg-[var(--color-overlay)] px-6 py-4 border-b border-[var(--color-border)] flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => {
                      setEditTeamName(team.name);
                      setNewTeamName(team.name);
                      setEditingTeamId(team.id);
                      setIsTeamModalOpen(true);
                    }}
                    className="text-lg font-semibold text-[var(--color-text)] flex items-center hover:bg-[var(--color-overlay)] rounded-lg px-1 -mx-1 py-0.5 transition-colors text-left w-fit"
                  >
                    <Users className="w-5 h-5 mr-2 text-[var(--color-text-muted)] flex-shrink-0" />
                    {team.name}
                  </button>
                  <div className="flex items-center gap-2 opacity-0 group-hover/team:opacity-100 transition-opacity">
                    <button
                      onClick={() => {
                        setSelectedTeamId(team.id);
                        setIsTopicModalOpen(true);
                      }}
                      className="inline-flex items-center px-3 py-1.5 bg-[var(--color-surface)] border border-[var(--color-border-strong)] hover:bg-[var(--color-primary-muted)] text-[var(--color-text)] text-sm font-medium rounded-xl transition-colors"
                    >
                      <FolderPlus className="w-4 h-4 mr-1.5" />
                      เพิ่ม Session
                    </button>
                    <LongPressDeleteButton
                      onDelete={() => deleteTeam(team.id)}
                      title="ลบทีม"
                      className="rounded-lg"
                    />
                  </div>
                </div>
                <div className="divide-y divide-[var(--color-border)]">
                  {team.topics.length === 0 ? (
                    <div className="px-6 py-8 text-center text-[var(--color-text-muted)] text-sm">
                      ยังไม่มี Session ในหัวข้อหลักนี้
                    </div>
                  ) : (
                    <SortableContext
                      items={team.topics.map((t) => t.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      {team.topics.map((topic) => {
                        const topicStatus = getTopicStatus(topic);
                        const isExpanded = expandedTopics.has(topic.id);
                        return (
                          <div key={topic.id} className="flex flex-col">
                            <SortableTopicRow
                              teamId={team.id}
                              topic={topic}
                              isExpanded={isExpanded}
                              onToggle={() => toggleTopic(topic.id)}
                              topicStatus={topicStatus}
                              onAddSubTopic={() => {
                                setSelectedTeamId(team.id);
                                setSelectedTopicId(topic.id);
                                setIsSubTopicModalOpen(true);
                              }}
                              onDeleteTopic={() =>
                                deleteTopic(team.id, topic.id)
                              }
                              isEditingTitle={
                                editingTopic?.teamId === team.id &&
                                editingTopic?.topicId === topic.id
                              }
                              editTitleValue={editTopicTitle}
                              onEditTitleChange={setEditTopicTitle}
                              onStartEditTitle={() => {
                                setEditTopicTitle(topic.title);
                                setEditingTopic({
                                  teamId: team.id,
                                  topicId: topic.id,
                                });
                              }}
                              onSaveEditTitle={() => {
                                updateTopicTitle(
                                  team.id,
                                  topic.id,
                                  editTopicTitle
                                );
                                setEditingTopic(null);
                              }}
                              onCancelEditTitle={() => setEditingTopic(null)}
                            />
                            <SubtopicDroppableArea
                              teamId={team.id}
                              topic={topic}
                              isExpanded={isExpanded}
                              openTodoSectionIds={openTodoSectionIds}
                              onTodoSectionToggle={toggleTodoSectionOpen}
                              updateSubTopicStatus={(topicId, subTopicId, s) =>
                                updateSubTopicStatus(
                                  team.id,
                                  topicId,
                                  subTopicId,
                                  s
                                )
                              }
                              deleteSubTopic={(topicId, subTopicId) =>
                                deleteSubTopic(team.id, topicId, subTopicId)
                              }
                              editingSubTopic={editingSubTopic}
                              editSubTopicTitle={editSubTopicTitle}
                              onEditSubTopicTitleChange={setEditSubTopicTitle}
                              onStartEditSubTopicTitle={(topicId, subTopicId) => {
                                const sub = team.topics
                                  .find((t) => t.id === topicId)
                                  ?.subTopics.find((s) => s.id === subTopicId);
                                if (sub) {
                                  setEditSubTopicTitle(sub.title);
                                  setEditingSubTopic({
                                    teamId: team.id,
                                    topicId,
                                    subTopicId,
                                  });
                                }
                              }}
                              onSaveEditSubTopicTitle={(finalTitle) => {
                                if (editingSubTopic) {
                                  updateSubTopicTitle(
                                    editingSubTopic.teamId,
                                    editingSubTopic.topicId,
                                    editingSubTopic.subTopicId,
                                    finalTitle ?? editSubTopicTitle
                                  );
                                  setEditingSubTopic(null);
                                }
                              }}
                              onCancelEditSubTopicTitle={() =>
                                setEditingSubTopic(null)
                              }
                              onAddDetail={(topicId, subTopicId) =>
                                addSubTopicDetail(team.id, topicId, subTopicId)
                              }
                              onUpdateDetail={(topicId, subTopicId, index, value) =>
                                updateSubTopicDetail(
                                  team.id,
                                  topicId,
                                  subTopicId,
                                  index,
                                  value
                                )
                              }
                              onUpdateDetailDueDate={(topicId, subTopicId, index, dueDate) =>
                                updateSubTopicDetailDueDate(
                                  team.id,
                                  topicId,
                                  subTopicId,
                                  index,
                                  dueDate
                                )
                              }
                              onRemoveDetail={(topicId, subTopicId, index) =>
                                removeSubTopicDetail(
                                  team.id,
                                  topicId,
                                  subTopicId,
                                  index
                                )
                              }
                              onToggleDetailDone={(topicId, subTopicId, index) =>
                                toggleSubTopicDetailDone(
                                  team.id,
                                  topicId,
                                  subTopicId,
                                  index
                                )
                              }
                            />
                          </div>
                        );
                      })}
                    </SortableContext>
                  )}
                </div>
              </div>
            </DndContext>
          ))}
        </div>
        );
      })()}

      {isTeamModalOpen && (
        <div className="fixed inset-0 bg-[var(--color-modal-backdrop)] backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--color-surface)] rounded-2xl shadow-[var(--shadow-modal)] w-full max-w-md overflow-hidden border border-[var(--color-border)]">
            <div className="px-6 py-4 border-b border-[var(--color-border)]">
              <h3 className="text-lg font-semibold text-[var(--color-text)]">
                {editingTeamId ? 'แก้ไขชื่อทีม' : 'เพิ่มทีม (Add Team)'}
              </h3>
              <p className="text-sm text-[var(--color-text-muted)] mt-0.5">
                {editingTeamId ? 'เลือกจาก data/teams หรือพิมพ์ชื่อที่ต้องการ' : 'เลือกจาก data/teams หรือสร้างทีมใหม่'}
              </p>
            </div>
            <form onSubmit={handleAddTeam} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1">
                  เลือกจากทีมที่มี (data/teams)
                </label>
                {loadingOrgTeams ? (
                  <div className="py-3 text-sm text-[var(--color-text-muted)]">
                    กำลังโหลดรายการทีม...
                  </div>
                ) : (
                  <select
                    value={selectedOrgTeamId ?? ''}
                    onChange={(e) => {
                      setSelectedOrgTeamId(e.target.value || null);
                      if (e.target.value) {
                        const org = orgTeamsForSelect.find((o) => o.id === e.target.value);
                        if (org) setNewTeamName(org.name);
                        else if (!editingTeamId) setNewTeamName('');
                      }
                    }}
                    className="w-full px-3 py-2 border border-[var(--color-border-strong)] rounded-lg bg-[var(--color-page)] text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                  >
                    <option value="">-- เลือกทีม --</option>
                    {editingTeamId
                      ? orgTeamsForSelect.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.name} ({o.id})
                          </option>
                        ))
                      : orgTeamsForSelect
                          .filter((o) => !teams.some((t) => t.id === o.id))
                          .map((o) => (
                            <option key={o.id} value={o.id}>
                              {o.name} ({o.id})
                            </option>
                          ))}
                    {!editingTeamId && orgTeamsForSelect.length > 0 &&
                      orgTeamsForSelect.every((o) => teams.some((t) => t.id === o.id)) && (
                      <option value="" disabled>
                        ทุกทีมถูกเพิ่มแล้ว
                      </option>
                    )}
                  </select>
                )}
              </div>
              <div className="relative">
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-full border-t border-[var(--color-border)]" />
                <span className="relative block text-center">
                  <span className="bg-[var(--color-surface)] px-2 text-xs text-[var(--color-text-muted)]">
                    หรือสร้างทีมใหม่
                  </span>
                </span>
              </div>
              <div>
                <label
                  htmlFor="teamName"
                  className="block text-sm font-medium text-[var(--color-text-muted)] mb-1"
                >
                  {editingTeamId ? 'หรือชื่อที่แสดง' : 'ชื่อทีมใหม่'}
                </label>
                <input
                  type="text"
                  id="teamName"
                  value={newTeamName}
                  onChange={(e) => {
                    setNewTeamName(e.target.value);
                    if (e.target.value.trim()) setSelectedOrgTeamId(null);
                  }}
                  className="w-full px-3 py-2 border border-[var(--color-border-strong)] rounded-lg bg-[var(--color-page)] text-[var(--color-text)] placeholder-[var(--color-text-subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:border-[var(--color-primary)]"
                  placeholder="e.g., Infra, Platform Core"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsTeamModalOpen(false);
                    setEditingTeamId(null);
                  }}
                  className="px-4 py-2 text-sm font-medium text-[var(--color-text)] bg-[var(--color-surface)] border border-[var(--color-border-strong)] rounded-lg hover:bg-[var(--color-overlay)]"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={!selectedOrgTeamId && !newTeamName.trim()}
                  className="px-4 py-2 text-sm font-medium text-white bg-[var(--color-primary)] rounded-lg hover:bg-[var(--color-primary-hover)] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {editingTeamId ? 'บันทึก' : 'เพิ่มทีม'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isTopicModalOpen && (
        <div className="fixed inset-0 bg-[var(--color-modal-backdrop)] backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--color-surface)] rounded-2xl shadow-[var(--shadow-modal)] w-full max-w-md overflow-hidden border border-[var(--color-border)]">
            <div className="px-6 py-4 border-b border-[var(--color-border)]">
              <h3 className="text-lg font-semibold text-[var(--color-text)]">
                เพิ่ม Session (Add New Topic)
              </h3>
              <p className="text-sm text-[var(--color-text-muted)] mt-1">
                สำหรับทีม:{' '}
                {teams.find((t) => t.id === selectedTeamId)?.name}
              </p>
            </div>
            <form onSubmit={handleAddTopic} className="p-6">
              <div className="mb-4">
                <label
                  htmlFor="topicTitle"
                  className="block text-sm font-medium text-[var(--color-text-muted)] mb-1"
                >
                  ชื่อเรื่อง (Topic Title)
                </label>
                <input
                  type="text"
                  id="topicTitle"
                  value={newTopicTitle}
                  onChange={(e) => setNewTopicTitle(e.target.value)}
                  className="w-full px-3 py-2 border border-[var(--color-border-strong)] rounded-lg bg-[var(--color-page)] text-[var(--color-text)] placeholder-[var(--color-text-subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:border-[var(--color-primary)]"
                  placeholder="e.g., Network & Connectivity"
                  autoFocus
                />
              </div>
              <div className="flex justify-end space-x-3 mt-6">
                <button
                  type="button"
                  onClick={() => {
                    setIsTopicModalOpen(false);
                    setSelectedTeamId(null);
                  }}
                  className="px-4 py-2 text-sm font-medium text-[var(--color-text)] bg-[var(--color-surface)] border border-[var(--color-border-strong)] rounded-lg hover:bg-[var(--color-overlay)]"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={!newTopicTitle.trim()}
                  className="px-4 py-2 text-sm font-medium text-white bg-[var(--color-primary)] rounded-lg hover:bg-[var(--color-primary-hover)] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  บันทึก
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isSubTopicModalOpen && (
        <div className="fixed inset-0 bg-[var(--color-modal-backdrop)] backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--color-surface)] rounded-2xl shadow-[var(--shadow-modal)] w-full max-w-md overflow-hidden border border-[var(--color-border)]">
            <div className="px-6 py-4 border-b border-[var(--color-border)]">
              <h3 className="text-lg font-semibold text-[var(--color-text)]">
                เพิ่มหัวข้อย่อย (Add Sub-Topic)
              </h3>
              <p className="text-sm text-[var(--color-text-muted)] mt-1">
                ภายใต้หัวข้อ:{' '}
                {teams
                  .find((t) => t.id === selectedTeamId)
                  ?.topics.find((top) => top.id === selectedTopicId)?.title}
              </p>
            </div>
            <form onSubmit={handleAddSubTopic} className="p-6">
              <div className="mb-4">
                <label
                  htmlFor="subTopicTitle"
                  className="block text-sm font-medium text-[var(--color-text-muted)] mb-1"
                >
                  ชื่อหัวข้อย่อย (Sub-Topic Title)
                </label>
                <input
                  type="text"
                  id="subTopicTitle"
                  value={newSubTopicTitle}
                  onChange={(e) => setNewSubTopicTitle(e.target.value)}
                  className="w-full px-3 py-2 border border-[var(--color-border-strong)] rounded-lg bg-[var(--color-page)] text-[var(--color-text)] placeholder-[var(--color-text-subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:border-[var(--color-primary)]"
                  placeholder="e.g., Firewall Rules Update"
                  autoFocus
                />
              </div>
              <div className="flex justify-end space-x-3 mt-6">
                <button
                  type="button"
                  onClick={() => {
                    setIsSubTopicModalOpen(false);
                    setSelectedTeamId(null);
                    setSelectedTopicId(null);
                  }}
                  className="px-4 py-2 text-sm font-medium text-[var(--color-text)] bg-[var(--color-surface)] border border-[var(--color-border-strong)] rounded-lg hover:bg-[var(--color-overlay)]"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={!newSubTopicTitle.trim()}
                  className="px-4 py-2 text-sm font-medium text-white bg-[var(--color-primary)] rounded-lg hover:bg-[var(--color-primary-hover)] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  บันทึก
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isSummaryViewOpen && (
        <div
          className="summary-view-modal fixed inset-0 bg-[var(--color-modal-backdrop)] backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-auto"
          onClick={(e) => e.target === e.currentTarget && setIsSummaryViewOpen(false)}
        >
          <SummaryView
            projectName={projectName}
            teams={teams}
            onClose={() => setIsSummaryViewOpen(false)}
          />
        </div>
      )}
    </div>
  );
}
