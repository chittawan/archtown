import React, { useState, useEffect, useRef } from 'react';
import { Plus, ChevronDown, ChevronRight, Trash2, Users, FolderPlus, FilePlus, GripVertical, Check, Circle, X, Download, Upload, FileText } from 'lucide-react';
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

const INITIAL_DATA: Team[] = [
  {
    id: 't1',
    name: 'Infra (Network)',
    topics: [
      {
        id: 'top1',
        title: 'Network & Connectivity',
        subTopics: [
          { id: 'sub1', title: 'Network Topology & Firewall', status: 'GREEN', details: [] },
          { id: 'sub2', title: 'VPN & Load Balancer', status: 'GREEN', details: [] },
        ],
      },
      {
        id: 'top2',
        title: 'Server / Cloud Resource & Cost',
        subTopics: [
          { id: 'sub3', title: 'Cloud Spending vs Budget', status: 'YELLOW', details: [] },
          { id: 'sub4', title: 'Resource Utilization', status: 'GREEN', details: [] },
        ],
      },
    ],
  },
  {
    id: 't2',
    name: 'Platform Core',
    topics: [
      {
        id: 'top3',
        title: 'Traffic & Performance',
        subTopics: [
          { id: 'sub5', title: 'Request Volume & Latency', status: 'RED', details: [] },
        ],
      },
    ],
  },
];

export default function ProjectManagePage() {
  const [teams, setTeams] = useState<Team[]>(INITIAL_DATA);
  const [expandedTopics, setExpandedTopics] = useState<Set<string>>(
    new Set(['top1', 'top2', 'top3'])
  );
  const [isTeamModalOpen, setIsTeamModalOpen] = useState(false);
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
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'RED'>('ALL');
  const [expandHoldProgress, setExpandHoldProgress] = useState(0);
  const expandHoldTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const expandHoldStartRef = useRef<number>(0);
  const expandHoldRafRef = useRef<number>(0);
  const expandDidLongPressRef = useRef(false);
  const [isSummaryViewOpen, setIsSummaryViewOpen] = useState(false);

  useEffect(() => {
    if (projectName) localStorage.setItem('projectName', projectName);
  }, [projectName]);

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
    setStatusFilter('ALL');
  };

  const collapseAllTopicsWithTodos = () => {
    setExpandedTopics(new Set());
    setOpenTodoSectionIds(new Set());
    setStatusFilter('ALL');
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

  function getFilteredTeams(teamsData: Team[], filter: 'ALL' | 'RED'): Team[] {
    if (filter === 'ALL') return teamsData;
    return teamsData
      .map((team) => ({
        ...team,
        topics: team.topics
          .filter((topic) => topic.subTopics.some((s) => s.status === 'RED'))
          .map((topic) => ({
            ...topic,
            subTopics: topic.subTopics.filter((s) => s.status === 'RED'),
          }))
          .filter((topic) => topic.subTopics.length > 0),
      }))
      .filter((team) => team.topics.length > 0);
  }

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
    setStatusFilter('RED');
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
        setStatusFilter('ALL');
      } catch (_) {
        console.error('Import failed');
      }
    };
    reader.readAsText(file, 'UTF-8');
    e.target.value = '';
  };

  const handleAddTeam = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTeamName.trim()) return;
    setTeams([
      ...teams,
      { id: `t-${Date.now()}`, name: newTeamName, topics: [] },
    ]);
    setNewTeamName('');
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
          className={`px-6 py-4 flex items-center justify-between hover:bg-[var(--color-overlay)] transition-colors cursor-pointer ${isExpanded ? 'bg-[var(--color-overlay)]' : ''}`}
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
            <StatusBadge status={topicStatus} label="Summary" />
            <div
              className="flex items-center space-x-2"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => onAddSubTopic()}
                className="inline-flex items-center px-2.5 py-1.5 bg-[var(--color-primary-muted)] text-[var(--color-primary)] hover:bg-[var(--color-primary-muted-hover)] dark:text-[var(--color-primary)] text-xs font-medium rounded-md transition-colors"
              >
                <FilePlus className="w-3.5 h-3.5 mr-1" />
                เพิ่มหัวข้อย่อย
              </button>
              <button
                onClick={() => onDeleteTopic()}
                className="p-1.5 text-[var(--color-text-subtle)] hover:text-rose-600 hover:bg-rose-500/10 dark:hover:bg-rose-500/20 rounded-md transition-colors"
                title="ลบหัวข้อใหญ่"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
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
    onSaveEditTitle: () => void;
    onCancelEditTitle: () => void;
    onAddDetail: () => void;
    onUpdateDetail: (index: number, value: string) => void;
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
                value={editTitleValue}
                onChange={(e) => onEditTitleChange(e.target.value)}
                onBlur={() => onSaveEditTitle()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onSaveEditTitle();
                  if (e.key === 'Escape') onCancelEditTitle();
                }}
                className="text-sm font-medium text-[var(--color-text)] bg-[var(--color-page)] border border-[var(--color-border-strong)] rounded px-2 py-1 flex-1 min-w-0 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                autoFocus
              />
            ) : (
              <button
                type="button"
                onClick={() => onStartEditTitle()}
                className="text-sm font-medium text-[var(--color-text)] truncate text-left flex-1 min-w-0 hover:bg-[var(--color-overlay)] rounded px-1 -mx-1 py-0.5"
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
            <button
              onClick={onDelete}
              className="p-1.5 text-[var(--color-text-subtle)] hover:text-rose-600 hover:bg-rose-500/10 dark:hover:bg-rose-500/20 rounded-md transition-colors"
              title="ลบหัวข้อย่อย"
            >
              <Trash2 className="w-4 h-4" />
            </button>
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
              Task ย่อย / รายการ (Todo)
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
                    <span className="text-xs font-medium text-[var(--color-text-subtle)] w-5 flex-shrink-0">
                      {index + 1}.
                    </span>
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
                    <button
                      type="button"
                      onClick={() => onRemoveDetail(index)}
                      className="p-1 text-[var(--color-text-subtle)] hover:text-rose-600 hover:bg-rose-500/10 rounded"
                      title="ลบรายการ"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
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
    onSaveEditSubTopicTitle: () => void;
    onCancelEditSubTopicTitle: () => void;
    onAddDetail: (topicId: string, subTopicId: string) => void;
    onUpdateDetail: (
      topicId: string,
      subTopicId: string,
      index: number,
      value: string
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
    <>
      <div className="mb-4 flex items-center justify-between gap-4 flex-wrap">
        <div className="min-w-0 flex-1">
          {isEditingProjectName ? (
            <input
              type="text"
              value={projectNameInput}
              onChange={(e) => setProjectNameInput(e.target.value)}
              onBlur={() => {
                if (projectNameInput.trim())
                  setProjectName(projectNameInput.trim());
                setIsEditingProjectName(false);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  if (projectNameInput.trim())
                    setProjectName(projectNameInput.trim());
                  setIsEditingProjectName(false);
                }
                if (e.key === 'Escape') {
                  setProjectNameInput(projectName);
                  setIsEditingProjectName(false);
                }
              }}
              className="text-xl font-semibold text-[var(--color-text)] bg-[var(--color-surface)] border border-[var(--color-border-strong)] rounded-lg px-3 py-2 w-full max-w-md focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              placeholder="ชื่อโปรเจกต์"
              autoFocus
            />
          ) : (
            <button
              type="button"
              onClick={() => {
                setProjectNameInput(projectName);
                setIsEditingProjectName(true);
              }}
              className="text-xl font-semibold text-[var(--color-text)] hover:text-[var(--color-primary)] transition-colors text-left"
            >
              {projectName || 'คลิกเพื่อเพิ่มชื่อโปรเจกต์'}
            </button>
          )}
        </div>
        <button
          onClick={exportProject}
          className="inline-flex items-center px-3 py-2 text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-overlay)] border border-[var(--color-border)] rounded-lg text-sm font-medium transition-colors flex-shrink-0"
          title="Export เป็นไฟล์ Markdown"
        >
          <Download className="w-4 h-4 mr-1.5" />
          Export
        </button>
        <button
          type="button"
          onClick={() => importFileInputRef.current?.click()}
          className="inline-flex items-center px-3 py-2 text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-overlay)] border border-[var(--color-border)] rounded-lg text-sm font-medium transition-colors flex-shrink-0"
          title="Import จากไฟล์ Markdown"
        >
          <Upload className="w-4 h-4 mr-1.5" />
          Import
        </button>
        <input
          ref={importFileInputRef}
          type="file"
          accept=".md,text/markdown,text/plain"
          className="hidden"
          onChange={importProject}
        />
        <button
          type="button"
          onClick={() => setIsSummaryViewOpen(true)}
          className="inline-flex items-center px-3 py-2 text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-overlay)] border border-[var(--color-border)] rounded-lg text-sm font-medium transition-colors flex-shrink-0"
          title="Summary View สำหรับผู้บริหาร — พิมพ์เป็น PDF ได้"
        >
          <FileText className="w-4 h-4 mr-1.5" />
          Summary View
        </button>
        <button
          onClick={() => setIsTeamModalOpen(true)}
          className="inline-flex items-center px-4 py-2 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white text-sm font-medium rounded-lg transition-colors shadow-sm flex-shrink-0"
        >
          <Users className="w-4 h-4 mr-2" />
          เพิ่มทีม (Add Team)
        </button>
      </div>

      <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-4 mb-8 flex flex-wrap gap-4 items-center text-sm shadow-[var(--shadow-card)]">
        <span className="font-medium text-[var(--color-text-muted)] mr-2">
          Status Legend:
        </span>
        <StatusBadge status="GREEN" />
        <StatusBadge status="YELLOW" />
        <StatusBadge status="RED" />
        {statusFilter === 'RED' && (
          <button
            type="button"
            onClick={() => setStatusFilter('ALL')}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-rose-600 dark:text-rose-400 bg-rose-100 dark:bg-rose-900/40 hover:bg-rose-200 dark:hover:bg-rose-800/50 px-2 py-1 rounded transition-colors"
            title="แสดงทั้งหมด"
          >
            แสดงเฉพาะ RED
            <X className="w-3.5 h-3.5" />
          </button>
        )}
        <div className="flex items-center gap-2 ml-auto">
          <button
            type="button"
            onClick={collapseAllTopics}
            onDoubleClick={collapseAllTopicsWithTodos}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-overlay)] rounded-lg border border-[var(--color-border)] transition-colors"
            title="คลิก: หุบหัวข้อใหญ่ทั้งหมด | Double-click: หุบหัวข้อใหญ่ + หุบ Todo ทั้งหมด"
          >
            <ChevronRight className="w-4 h-4" />
            หุบ All
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
              คลาย All
            </span>
          </button>
        </div>
      </div>

      {teams.length === 0 ? (
        <div className="text-center py-12 bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] border-dashed">
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
              className="inline-flex items-center px-4 py-2 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white text-sm font-medium rounded-lg transition-colors shadow-sm"
            >
              <Plus className="w-4 h-4 mr-2" />
              สร้างทีมแรก
            </button>
          </div>
        </div>
      ) : (() => {
        const filteredTeams = getFilteredTeams(teams, statusFilter);
        if (filteredTeams.length === 0) {
          return (
            <div className="text-center py-12 bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)]">
              <p className="text-sm font-medium text-[var(--color-text)]">
                ไม่มีหัวข้อสถานะแดง
              </p>
              <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                กด หุบ All เพื่อแสดงทั้งหมด
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
              <div className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] overflow-hidden shadow-[var(--shadow-card)]">
                <div className="bg-[var(--color-overlay)] px-6 py-4 border-b border-[var(--color-border)] flex items-center justify-between">
                  {editingTeamId === team.id ? (
                    <input
                      type="text"
                      value={editTeamName}
                      onChange={(e) => setEditTeamName(e.target.value)}
                      onBlur={() => {
                        updateTeamName(team.id, editTeamName);
                        setEditingTeamId(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          updateTeamName(team.id, editTeamName);
                          setEditingTeamId(null);
                        }
                        if (e.key === 'Escape') {
                          setEditTeamName(team.name);
                          setEditingTeamId(null);
                        }
                      }}
                      className="text-lg font-semibold text-[var(--color-text)] bg-[var(--color-surface)] border border-[var(--color-border-strong)] rounded-lg px-2 py-1 flex-1 max-w-md focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                      autoFocus
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setEditTeamName(team.name);
                        setEditingTeamId(team.id);
                      }}
                      className="text-lg font-semibold text-[var(--color-text)] flex items-center hover:bg-[var(--color-overlay)] rounded px-1 -mx-1 transition-colors text-left"
                    >
                      <Users className="w-5 h-5 mr-2 text-[var(--color-text-muted)] flex-shrink-0" />
                      {team.name}
                    </button>
                  )}
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => {
                        setSelectedTeamId(team.id);
                        setIsTopicModalOpen(true);
                      }}
                      className="inline-flex items-center px-3 py-1.5 bg-[var(--color-surface)] border border-[var(--color-border-strong)] hover:bg-[var(--color-primary-muted)] text-[var(--color-text)] text-sm font-medium rounded-lg transition-colors"
                    >
                      <FolderPlus className="w-4 h-4 mr-1.5" />
                      เพิ่มหัวข้อใหญ่
                    </button>
                    <button
                      onClick={() => deleteTeam(team.id)}
                      className="p-1.5 text-[var(--color-text-subtle)] hover:text-rose-600 hover:bg-rose-500/10 dark:hover:bg-rose-500/20 rounded-lg transition-colors"
                      title="ลบทีม"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <div className="divide-y divide-[var(--color-border)]">
                  {team.topics.length === 0 ? (
                    <div className="px-6 py-8 text-center text-[var(--color-text-muted)] text-sm">
                      ยังไม่มีหัวข้อใหญ่ในทีมนี้
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
                              onSaveEditSubTopicTitle={() => {
                                if (editingSubTopic) {
                                  updateSubTopicTitle(
                                    editingSubTopic.teamId,
                                    editingSubTopic.topicId,
                                    editingSubTopic.subTopicId,
                                    editSubTopicTitle
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
                เพิ่มทีมใหม่ (Add New Team)
              </h3>
            </div>
            <form onSubmit={handleAddTeam} className="p-6">
              <div className="mb-4">
                <label
                  htmlFor="teamName"
                  className="block text-sm font-medium text-[var(--color-text-muted)] mb-1"
                >
                  ชื่อทีม (Team Name)
                </label>
                <input
                  type="text"
                  id="teamName"
                  value={newTeamName}
                  onChange={(e) => setNewTeamName(e.target.value)}
                  className="w-full px-3 py-2 border border-[var(--color-border-strong)] rounded-lg bg-[var(--color-page)] text-[var(--color-text)] placeholder-[var(--color-text-subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:border-[var(--color-primary)]"
                  placeholder="e.g., Infra, Platform Core"
                  autoFocus
                />
              </div>
              <div className="flex justify-end space-x-3 mt-6">
                <button
                  type="button"
                  onClick={() => setIsTeamModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-[var(--color-text)] bg-[var(--color-surface)] border border-[var(--color-border-strong)] rounded-lg hover:bg-[var(--color-overlay)]"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={!newTeamName.trim()}
                  className="px-4 py-2 text-sm font-medium text-white bg-[var(--color-primary)] rounded-lg hover:bg-[var(--color-primary-hover)] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  บันทึก
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
                เพิ่มหัวข้อใหญ่ (Add New Topic)
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
    </>
  );
}
