import React, { useState, useEffect, useRef, useMemo, useReducer } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, ChevronDown, ChevronRight, Users, FolderPlus, Download, Upload, FileText, FolderKanban, Save } from 'lucide-react';
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  useDroppable,
} from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Team, Topic, SubTopic, Status, SubTopicType, TodoItemStatus } from '../../types';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { LongPressDeleteButton } from '../../components/ui/LongPressDeleteButton';
import { SortableTopicRow } from '../../components/project/SortableTopicRow';
import { SubtopicDroppableArea } from '../../components/project/SubtopicDroppableArea';
import { SummaryView } from '../../components/project/SummaryView';
import { projectToYaml, yamlToProject, type ProjectData } from '../../lib/projectYaml';
import { nameToId } from '../../lib/idUtils';
import { useTeamModal } from './hooks/useTeamModal';
import { useTopicModal } from './hooks/useTopicModal';
import { useSubTopicModal } from './hooks/useSubTopicModal';
import { TeamModal } from './TeamModal';
import { TopicModal } from './TopicModal';
import { SubTopicModal } from './SubTopicModal';

const INITIAL_DATA: Team[] = [];

type TeamsAction =
  | { type: 'setAll'; teams: Team[] }
  | { type: 'update'; updater: (state: Team[]) => Team[] };

function teamsReducer(state: Team[], action: TeamsAction): Team[] {
  switch (action.type) {
    case 'setAll':
      return action.teams;
    case 'update':
      return action.updater(state);
    default:
      return state;
  }
}

export default function ProjectManagePage() {
  const [searchParams] = useSearchParams();
  const projectIdFromUrl = searchParams.get('id');
  const [projectId, setProjectId] = useState<string | null>(projectIdFromUrl);
  const [teams, dispatchTeams] = useReducer(teamsReducer, INITIAL_DATA);
  const [projectLoadState, setProjectLoadState] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle');
  // เริ่มต้นให้หัวข้อใหญ่ทั้งหมด "หุบ" ไว้ก่อน
  const [expandedTopics, setExpandedTopics] = useState<Set<string>>(
    () => new Set()
  );
  const [projectName, setProjectName] = useState(() => {
    if (typeof window === 'undefined') return 'Performance Management';
    return localStorage.getItem('projectName') ?? 'Performance Management';
  });
  const [projectDescription, setProjectDescription] = useState('');
  const [isEditingProjectName, setIsEditingProjectName] = useState(false);
  const [projectNameInput, setProjectNameInput] = useState(projectName);
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

  const updateTeams = (updater: (state: Team[]) => Team[]) => {
    dispatchTeams({ type: 'update', updater });
  };

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
      dispatchTeams({ type: 'setAll', teams: detail.teams ?? [] });
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
        const {
          projectName: name,
          description: desc,
          teams: nextTeams,
        } = payload;
        setProjectName(name || '');
        setProjectNameInput(name || '');
        setProjectDescription(desc ?? '');
        dispatchTeams({ type: 'setAll', teams: nextTeams });
        // เข้ามาครั้งแรกให้หุบหมด (ไม่ auto-expand หัวข้อใหญ่)
        setExpandedTopics(new Set());
        setProjectLoadState('loaded');
      })
      .catch(() => setProjectLoadState('error'));
  }, [projectIdFromUrl, projectLoadState]);

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

  const filteredTeams = useMemo(
    () => getFilteredTeams(teams, statusFilter),
    [teams, statusFilter]
  );

  const updateSubTopicDetails = (
    state: Team[],
    teamId: string,
    topicId: string,
    subTopicId: string,
    updater: (details: NonNullable<SubTopic['details']>) => NonNullable<SubTopic['details']>
  ): Team[] =>
    state.map((t) =>
      t.id !== teamId
        ? t
        : {
            ...t,
            topics: t.topics.map((topic) =>
              topic.id !== topicId
                ? topic
                : {
                    ...topic,
                    subTopics: topic.subTopics.map((s) =>
                      s.id !== subTopicId
                        ? s
                        : {
                            ...s,
                            details: updater(s.details ?? []),
                          }
                    ),
                  }
            ),
          }
    );

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
    const fileId = projectId || nameToId(projectName || 'project') || 'project';
    const yamlStr = projectToYaml({
      id: fileId,
      projectName: projectName || 'Project',
      description: projectDescription.trim() || undefined,
      teams,
    });
    const blob = new Blob([yamlStr], { type: 'application/x-yaml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(projectName || 'project').replace(/[^\p{L}\p{N}\s_-]/gu, '_')}.yaml`;
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

  const downloadAsYaml = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'application/x-yaml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}.yaml`;
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
        const yamlStr = projectToYaml({
          id: fileId,
          projectName: name,
          description: projectDescription.trim() || undefined,
          teams,
        });
        downloadAsYaml(yamlStr, fileId);
        setSaveStatus('ok');
        setTimeout(() => setSaveStatus('idle'), 2000);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('project-summary-invalidate', { detail: { projectId: fileId } }));
        }
      }
    } catch {
      const yamlStr = projectToYaml({
        id: fileId,
        projectName: name,
        description: projectDescription.trim() || undefined,
        teams,
      });
      downloadAsYaml(yamlStr, fileId);
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
        const data = yamlToProject(text);
        setProjectName(data.projectName || projectName);
        dispatchTeams({ type: 'setAll', teams: data.teams });
        const allTopicIds = data.teams.flatMap((t) =>
          t.topics.map((top) => top.id)
        );
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

  const updateSubTopicStatus = (
    teamId: string,
    topicId: string,
    subTopicId: string,
    newStatus: Status
  ) => {
    updateTeams((prev) =>
      prev.map((team) =>
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
    updateTeams((prev) => prev.filter((t) => t.id !== teamId));
  };

  const deleteTopic = (teamId: string, topicId: string) => {
    updateTeams((prev) =>
      prev.map((team) =>
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
    updateTeams((prev) =>
      prev.map((team) =>
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
    updateTeams((prev) =>
      prev.map((t) => (t.id === teamId ? { ...t, name: trimmed } : t))
    );
  };

  const teamModal = useTeamModal({
    teams,
    updateTeamName,
    updateTeams,
  });
  const topicModal = useTopicModal({ teams, updateTeams });
  const subTopicModal = useSubTopicModal({
    teams,
    updateTeams,
    setExpandedTopics,
  });

  const updateTopicTitle = (
    teamId: string,
    topicId: string,
    title: string
  ) => {
    const trimmed = title.trim();
    if (!trimmed) return;
    updateTeams((prev) =>
      prev.map((t) =>
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
    updateTeams((prev) =>
      prev.map((t) =>
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
    updateTeams((prev) =>
      updateSubTopicDetails(prev, teamId, topicId, subTopicId, (details) => [
        ...details,
        { text: '', status: 'todo' as TodoItemStatus },
      ])
    );
  };

  const updateSubTopicDetail = (
    teamId: string,
    topicId: string,
    subTopicId: string,
    index: number,
    text: string
  ) => {
    updateTeams((prev) =>
      updateSubTopicDetails(prev, teamId, topicId, subTopicId, (details) => {
        const next = [...details];
        if (next[index]) next[index] = { ...next[index], text };
        return next;
      })
    );
  };

  const updateSubTopicDetailDueDate = (
    teamId: string,
    topicId: string,
    subTopicId: string,
    index: number,
    dueDate: string | undefined
  ) => {
    updateTeams((prev) =>
      updateSubTopicDetails(prev, teamId, topicId, subTopicId, (details) => {
        const next = [...details];
        if (next[index])
          next[index] = {
            ...next[index],
            dueDate: dueDate && dueDate.trim() ? dueDate.trim() : undefined,
          };
        return next;
      })
    );
  };

  const updateSubTopicDetailDescription = (
    teamId: string,
    topicId: string,
    subTopicId: string,
    index: number,
    description: string | undefined
  ) => {
    updateTeams((prev) =>
      updateSubTopicDetails(prev, teamId, topicId, subTopicId, (details) => {
        const next = [...details];
        if (next[index])
          next[index] = {
            ...next[index],
            description: description && description.trim() ? description.trim() : undefined,
          };
        return next;
      })
    );
  };

  const removeSubTopicDetail = (
    teamId: string,
    topicId: string,
    subTopicId: string,
    index: number
  ) => {
    updateTeams((prev) =>
      updateSubTopicDetails(prev, teamId, topicId, subTopicId, (details) =>
        details.filter((_, i) => i !== index)
      )
    );
  };

  const toggleSubTopicDetailDone = (
    teamId: string,
    topicId: string,
    subTopicId: string,
    index: number
  ) => {
    updateTeams((prev) =>
      updateSubTopicDetails(prev, teamId, topicId, subTopicId, (details) => {
        const next = [...details];
        if (next[index]) {
          const s = next[index].status ?? (next[index].done ? 'done' : 'todo');
          next[index] = { ...next[index], status: s === 'done' ? 'todo' : 'done', done: undefined };
        }
        return next;
      })
    );
  };

  const updateSubTopicDetailStatus = (
    teamId: string,
    topicId: string,
    subTopicId: string,
    index: number,
    itemStatus: TodoItemStatus
  ) => {
    updateTeams((prev) =>
      updateSubTopicDetails(prev, teamId, topicId, subTopicId, (details) => {
        const next = [...details];
        if (next[index]) next[index] = { ...next[index], status: itemStatus, done: undefined };
        return next;
      })
    );
  };

  const updateSubTopicType = (
    teamId: string,
    topicId: string,
    subTopicId: string,
    subTopicType: SubTopicType
  ) => {
    updateTeams((prev) =>
      prev.map((t) =>
        t.id !== teamId
          ? t
          : {
              ...t,
              topics: t.topics.map((topic) =>
                topic.id !== topicId
                  ? topic
                  : {
                      ...topic,
                      subTopics: topic.subTopics.map((s) =>
                        s.id !== subTopicId ? s : { ...s, subTopicType }
                      ),
                    }
              ),
            }
      )
    );
  };

  const reorderTopics = (teamId: string, fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;
    updateTeams((prev) =>
      prev.map((team) =>
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
    updateTeams((prev) =>
      prev.map((t) => {
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

  // ใช้แค่ mouse ลาก — ไม่ใช้ KeyboardSensor เพื่อให้ Enter/Space ใช้ใน textarea ได้
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
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
          {false && (
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
          )}
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
            onClick={() => teamModal.open()}
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
              onClick={() => teamModal.open()}
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
                      teamModal.openForEdit(team.id, team.name);
                    }}
                    className="text-lg font-semibold text-[var(--color-text)] flex items-center hover:bg-[var(--color-overlay)] rounded-lg px-1 -mx-1 py-0.5 transition-colors text-left w-fit"
                  >
                    <Users className="w-5 h-5 mr-2 text-[var(--color-text-muted)] flex-shrink-0" />
                    {team.name}
                  </button>
                  <div className="flex items-center gap-2 opacity-0 group-hover/team:opacity-100 transition-opacity">
                    <button
                      onClick={() => topicModal.open(team.id)}
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
                                onAddSubTopic={() =>
                                  subTopicModal.open(team.id, topic.id)
                                }
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
                              onUpdateDetailDescription={(topicId, subTopicId, index, description) =>
                                updateSubTopicDetailDescription(
                                  team.id,
                                  topicId,
                                  subTopicId,
                                  index,
                                  description
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
                              onUpdateDetailStatus={(topicId, subTopicId, index, status) =>
                                updateSubTopicDetailStatus(
                                  team.id,
                                  topicId,
                                  subTopicId,
                                  index,
                                  status
                                )
                              }
                              onSubTopicTypeChange={(topicId, subTopicId, subTopicType) =>
                                updateSubTopicType(team.id, topicId, subTopicId, subTopicType)
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

      <TeamModal {...teamModal} />
      <TopicModal {...topicModal} />
      <SubTopicModal {...subTopicModal} />

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
