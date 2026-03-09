import React, { useState, useEffect } from 'react';
import { Plus, ChevronDown, ChevronRight, Trash2, LayoutDashboard, Users, FolderPlus, FilePlus, Sun, Moon, GripVertical } from 'lucide-react';
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
import { Team, Topic, SubTopic, Status } from './types';

const INITIAL_DATA: Team[] = [
  {
    id: 't1',
    name: 'Infra (Network)',
    topics: [
      {
        id: 'top1',
        title: 'Network & Connectivity',
        subTopics: [
          { id: 'sub1', title: 'Network Topology & Firewall', status: 'GREEN' },
          { id: 'sub2', title: 'VPN & Load Balancer', status: 'GREEN' }
        ]
      },
      {
        id: 'top2',
        title: 'Server / Cloud Resource & Cost',
        subTopics: [
          { id: 'sub3', title: 'Cloud Spending vs Budget', status: 'YELLOW' },
          { id: 'sub4', title: 'Resource Utilization', status: 'GREEN' }
        ]
      }
    ]
  },
  {
    id: 't2',
    name: 'Platform Core',
    topics: [
      {
        id: 'top3',
        title: 'Traffic & Performance',
        subTopics: [
          { id: 'sub5', title: 'Request Volume & Latency', status: 'RED' }
        ]
      }
    ]
  }
];

export default function App() {
  const [teams, setTeams] = useState<Team[]>(INITIAL_DATA);
  const [expandedTopics, setExpandedTopics] = useState<Set<string>>(new Set(['top1', 'top2', 'top3']));
  const [isDark, setIsDark] = useState(() => {
    if (typeof window === 'undefined') return false;
    return document.documentElement.classList.contains('dark');
  });

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

  // Modals state
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

  useEffect(() => {
    if (projectName) localStorage.setItem('projectName', projectName);
  }, [projectName]);

  const getTopicStatus = (topic: Topic): Status => {
    if (topic.subTopics.length === 0) return 'GREEN';
    if (topic.subTopics.some(st => st.status === 'RED')) return 'RED';
    if (topic.subTopics.some(st => st.status === 'YELLOW')) return 'YELLOW';
    return 'GREEN';
  };

  const toggleTopic = (topicId: string) => {
    setExpandedTopics(prev => {
      const next = new Set(prev);
      if (next.has(topicId)) {
        next.delete(topicId);
      } else {
        next.add(topicId);
      }
      return next;
    });
  };

  const handleAddTeam = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTeamName.trim()) return;
    const newTeam: Team = {
      id: `t-${Date.now()}`,
      name: newTeamName,
      topics: []
    };
    setTeams([...teams, newTeam]);
    setNewTeamName('');
    setIsTeamModalOpen(false);
  };

  const handleAddTopic = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTopicTitle.trim() || !selectedTeamId) return;
    
    setTeams(teams.map(team => {
      if (team.id === selectedTeamId) {
        return {
          ...team,
          topics: [...team.topics, {
            id: `top-${Date.now()}`,
            title: newTopicTitle,
            subTopics: []
          }]
        };
      }
      return team;
    }));
    
    setNewTopicTitle('');
    setIsTopicModalOpen(false);
    setSelectedTeamId(null);
  };

  const handleAddSubTopic = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubTopicTitle.trim() || !selectedTeamId || !selectedTopicId) return;
    
    setTeams(teams.map(team => {
      if (team.id === selectedTeamId) {
        return {
          ...team,
          topics: team.topics.map(topic => {
            if (topic.id === selectedTopicId) {
              return {
                ...topic,
                subTopics: [...topic.subTopics, {
                  id: `sub-${Date.now()}`,
                  title: newSubTopicTitle,
                  status: 'GREEN'
                }]
              };
            }
            return topic;
          })
        };
      }
      return team;
    }));
    
    // Auto expand the topic when adding a subtopic
    setExpandedTopics(prev => new Set(prev).add(selectedTopicId));
    
    setNewSubTopicTitle('');
    setIsSubTopicModalOpen(false);
    setSelectedTeamId(null);
    setSelectedTopicId(null);
  };

  const updateSubTopicStatus = (teamId: string, topicId: string, subTopicId: string, newStatus: Status) => {
    setTeams(teams.map(team => {
      if (team.id === teamId) {
        return {
          ...team,
          topics: team.topics.map(topic => {
            if (topic.id === topicId) {
              return {
                ...topic,
                subTopics: topic.subTopics.map(st => {
                  if (st.id === subTopicId) {
                    return { ...st, status: newStatus };
                  }
                  return st;
                })
              };
            }
            return topic;
          })
        };
      }
      return team;
    }));
  };

  const deleteTeam = (teamId: string) => {
    setTeams(teams.filter(t => t.id !== teamId));
  };

  const deleteTopic = (teamId: string, topicId: string) => {
    setTeams(teams.map(team => {
      if (team.id === teamId) {
        return {
          ...team,
          topics: team.topics.filter(t => t.id !== topicId)
        };
      }
      return team;
    }));
  };

  const deleteSubTopic = (teamId: string, topicId: string, subTopicId: string) => {
    setTeams(teams.map(team => {
      if (team.id === teamId) {
        return {
          ...team,
          topics: team.topics.map(topic => {
            if (topic.id === topicId) {
              return {
                ...topic,
                subTopics: topic.subTopics.filter(st => st.id !== subTopicId)
              };
            }
            return topic;
          })
        };
      }
      return team;
    }));
  };

  const updateTeamName = (teamId: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setTeams(teams.map(t => t.id === teamId ? { ...t, name: trimmed } : t));
  };

  const updateTopicTitle = (teamId: string, topicId: string, title: string) => {
    const trimmed = title.trim();
    if (!trimmed) return;
    setTeams(teams.map(t => {
      if (t.id !== teamId) return t;
      return { ...t, topics: t.topics.map(topic => topic.id === topicId ? { ...topic, title: trimmed } : topic) };
    }));
  };

  const updateSubTopicTitle = (teamId: string, topicId: string, subTopicId: string, title: string) => {
    const trimmed = title.trim();
    if (!trimmed) return;
    setTeams(teams.map(t => {
      if (t.id !== teamId) return t;
      return {
        ...t,
        topics: t.topics.map(topic =>
          topic.id === topicId
            ? { ...topic, subTopics: topic.subTopics.map(s => s.id === subTopicId ? { ...s, title: trimmed } : s) }
            : topic
        )
      };
    }));
  };

  const [editingTeamId, setEditingTeamId] = useState<string | null>(null);
  const [editTeamName, setEditTeamName] = useState('');
  const [editingTopic, setEditingTopic] = useState<{ teamId: string; topicId: string } | null>(null);
  const [editTopicTitle, setEditTopicTitle] = useState('');
  const [editingSubTopic, setEditingSubTopic] = useState<{ teamId: string; topicId: string; subTopicId: string } | null>(null);
  const [editSubTopicTitle, setEditSubTopicTitle] = useState('');

  const reorderTopics = (teamId: string, fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;
    setTeams(teams.map(team => {
      if (team.id !== teamId) return team;
      return { ...team, topics: arrayMove(team.topics, fromIndex, toIndex) };
    }));
  };

  const moveOrReorderSubTopic = (
    teamId: string,
    sourceTopicId: string,
    subTopic: SubTopic,
    targetTopicId: string,
    targetIndex: number
  ) => {
    setTeams(teams.map(t => {
      if (t.id !== teamId) return t;
      if (sourceTopicId === targetTopicId) {
        const topic = t.topics.find(topic => topic.id === sourceTopicId);
        if (!topic) return t;
        const fromIndex = topic.subTopics.findIndex(s => s.id === subTopic.id);
        if (fromIndex === -1 || fromIndex === targetIndex) return t;
        const newSubTopics = arrayMove(topic.subTopics, fromIndex, targetIndex);
        return {
          ...t,
          topics: t.topics.map(topic =>
            topic.id === sourceTopicId ? { ...topic, subTopics: newSubTopics } : topic
          )
        };
      }
      const withoutSource = t.topics.map(topic =>
        topic.id === sourceTopicId
          ? { ...topic, subTopics: topic.subTopics.filter(s => s.id !== subTopic.id) }
          : topic
      );
      const targetTopic = withoutSource.find(topic => topic.id === targetTopicId);
      if (!targetTopic) return t;
      const insertIndex = Math.min(targetIndex, targetTopic.subTopics.length);
      const newSubTopics = [...targetTopic.subTopics];
      newSubTopics.splice(insertIndex, 0, subTopic);
      return {
        ...t,
        topics: withoutSource.map(topic =>
          topic.id === targetTopicId ? { ...topic, subTopics: newSubTopics } : topic
        )
      };
    }));
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor)
  );

  const handleDragEnd = (teamId: string) => (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const team = teams.find(t => t.id === teamId);
    if (!team) return;

    if (active.data.current?.type === 'topic') {
      const fromIndex = team.topics.findIndex(t => t.id === active.id);
      const toIndex = team.topics.findIndex(t => t.id === over.id);
      if (fromIndex !== -1 && toIndex !== -1) reorderTopics(teamId, fromIndex, toIndex);
      return;
    }

    if (active.data.current?.type === 'subtopic') {
      const { topicId: sourceTopicId, subTopic } = active.data.current as { topicId: string; subTopic: SubTopic };
      const overId = String(over.id);
      let targetTopicId: string;
      let targetIndex: number;
      if (overId.startsWith('subtopic-list-')) {
        const targetTopic = team.topics.find(t => overId === `subtopic-list-${teamId}-${t.id}`);
        if (!targetTopic) return;
        targetTopicId = targetTopic.id;
        targetIndex = targetTopic.subTopics.length;
      } else if (overId.startsWith('sub__')) {
        const parts = overId.slice(5).split('__');
        if (parts.length < 2) return;
        targetTopicId = parts[0];
        const overSubId = parts[1];
        const targetTopic = team.topics.find(t => t.id === targetTopicId);
        const pos = targetTopic?.subTopics.findIndex(s => s.id === overSubId) ?? -1;
        targetIndex = pos >= 0 ? pos : (targetTopic?.subTopics.length ?? 0);
      } else {
        return;
      }
      const targetTopic = team.topics.find(t => t.id === targetTopicId);
      if (!targetTopic) return;
      moveOrReorderSubTopic(teamId, sourceTopicId, subTopic, targetTopicId, targetIndex);
    }
  };

  const StatusBadge = ({ status, label }: { status: Status, label?: string }) => {
    const config = {
      GREEN: { bg: 'bg-emerald-100 dark:bg-emerald-900/40', text: 'text-emerald-800 dark:text-emerald-200', border: 'border-emerald-200 dark:border-emerald-700/60', icon: '🟢', defaultText: 'ปกติ (Normal)' },
      YELLOW: { bg: 'bg-amber-100 dark:bg-amber-900/40', text: 'text-amber-800 dark:text-amber-200', border: 'border-amber-200 dark:border-amber-700/60', icon: '🟡', defaultText: 'จัดการได้ (Manageable)' },
      RED: { bg: 'bg-rose-100 dark:bg-rose-900/40', text: 'text-rose-800 dark:text-rose-200', border: 'border-rose-200 dark:border-rose-700/60', icon: '🔴', defaultText: 'ต้องการ Support (Needs Support)' }
    };
    const c = config[status];

    return (
      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${c.bg} ${c.text} ${c.border}`}>
        <span className="mr-1">{c.icon}</span>
        {label || c.defaultText}
      </span>
    );
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
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
      id: topic.id,
      data: { type: 'topic' as const },
    });
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
              onClick={e => e.stopPropagation()}
              {...attributes}
              {...listeners}
              aria-label="ลากเพื่อเรียงลำดับ"
            >
              <GripVertical className="w-5 h-5" />
            </button>
            <button className="p-1 mr-2 text-[var(--color-text-subtle)] hover:text-[var(--color-text-muted)] rounded">
              {isExpanded ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
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
                onClick={(e) => { e.stopPropagation(); onStartEditTitle(); }}
              >
                {topic.title}
              </h3>
            )}
          </div>
          <div className="flex items-center space-x-4 flex-shrink-0">
            <StatusBadge status={topicStatus} label="Summary" />
            <div className="flex items-center space-x-2" onClick={e => e.stopPropagation()}>
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
    teamId,
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
  }: {
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
  }) {
    const id = `sub__${topicId}__${subTopic.id}`;
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
      id,
      data: { type: 'subtopic' as const, topicId, subTopic },
    });
    const style = { transform: CSS.Transform.toString(transform), transition };
    return (
      <div
        ref={setNodeRef}
        style={style}
        className={`flex items-center justify-between bg-[var(--color-surface)] px-4 py-3 rounded-lg border border-[var(--color-border)] shadow-[var(--shadow-card)] ${isDragging ? 'opacity-80 shadow-lg z-10' : ''}`}
      >
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
            {(['GREEN', 'YELLOW', 'RED'] as Status[]).map(s => (
              <button
                key={s}
                onClick={() => onUpdateStatus(s)}
                className={`w-[7.5rem] min-w-[7.5rem] px-3 py-1 text-xs font-medium rounded-md transition-all ${
                  subTopic.status === s
                    ? s === 'GREEN' ? 'bg-emerald-500 text-white shadow-sm'
                    : s === 'YELLOW' ? 'bg-amber-500 text-white shadow-sm'
                    : 'bg-rose-500 text-white shadow-sm'
                    : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-border-strong)]'
                }`}
              >
                {s === 'GREEN' ? 'ปกติ' : s === 'YELLOW' ? 'จัดการได้' : 'ต้องการ Support'}
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
  }: {
    teamId: string;
    topic: Topic;
    isExpanded: boolean;
    updateSubTopicStatus: (topicId: string, subTopicId: string, s: Status) => void;
    deleteSubTopic: (topicId: string, subTopicId: string) => void;
    editingSubTopic: { teamId: string; topicId: string; subTopicId: string } | null;
    editSubTopicTitle: string;
    onEditSubTopicTitleChange: (v: string) => void;
    onStartEditSubTopicTitle: (topicId: string, subTopicId: string) => void;
    onSaveEditSubTopicTitle: () => void;
    onCancelEditSubTopicTitle: () => void;
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
            items={topic.subTopics.map(s => `sub__${topic.id}__${s.id}`)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-2 pl-10">
              {topic.subTopics.map(subTopic => (
                <SortableSubTopicCard
                  key={subTopic.id}
                  teamId={teamId}
                  topicId={topic.id}
                  subTopic={subTopic}
                  onUpdateStatus={status => updateSubTopicStatus(topic.id, subTopic.id, status)}
                  onDelete={() => deleteSubTopic(topic.id, subTopic.id)}
                  isEditingTitle={editingSubTopic?.teamId === teamId && editingSubTopic?.topicId === topic.id && editingSubTopic?.subTopicId === subTopic.id}
                  editTitleValue={editSubTopicTitle}
                  onEditTitleChange={onEditSubTopicTitleChange}
                  onStartEditTitle={() => onStartEditSubTopicTitle(topic.id, subTopic.id)}
                  onSaveEditTitle={onSaveEditSubTopicTitle}
                  onCancelEditTitle={onCancelEditSubTopicTitle}
                />
              ))}
            </div>
          </SortableContext>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--color-page)] text-[var(--color-text)] font-sans transition-colors">
      {/* Header */}
      <header className="bg-[var(--color-surface)] border-b border-[var(--color-border)] sticky top-0 z-10 shadow-[var(--shadow-card)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="bg-[var(--color-primary)] p-2 rounded-lg">
              <LayoutDashboard className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-xl font-semibold text-[var(--color-text)]">ArchTown</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsDark(d => !d)}
              className="p-2 rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-overlay)] transition-colors"
              title={isDark ? 'สลับเป็น Light' : 'สลับเป็น Dark'}
              aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
            >
              {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
            <button
              onClick={() => setIsTeamModalOpen(true)}
              className="inline-flex items-center px-4 py-2 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white text-sm font-medium rounded-lg transition-colors shadow-sm"
            >
              <Users className="w-4 h-4 mr-2" />
              เพิ่มทีม (Add Team)
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Project Name */}
        <div className="mb-4">
          {isEditingProjectName ? (
            <div className="flex items-center gap-2">
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
                className="text-xl font-semibold text-[var(--color-text)] bg-[var(--color-surface)] border border-[var(--color-border-strong)] rounded-lg px-3 py-2 w-full max-w-md focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                placeholder="ชื่อโปรเจกต์"
                autoFocus
              />
            </div>
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

        {/* Legend */}
        <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-4 mb-8 flex flex-wrap gap-4 items-center text-sm shadow-[var(--shadow-card)]">
          <span className="font-medium text-[var(--color-text-muted)] mr-2">Status Legend:</span>
          <StatusBadge status="GREEN" />
          <StatusBadge status="YELLOW" />
          <StatusBadge status="RED" />
        </div>

        {teams.length === 0 ? (
          <div className="text-center py-12 bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] border-dashed">
            <Users className="mx-auto h-12 w-12 text-[var(--color-text-subtle)]" />
            <h3 className="mt-2 text-sm font-semibold text-[var(--color-text)]">ยังไม่มีทีม</h3>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">เริ่มต้นโดยการสร้างทีมใหม่เพื่อเพิ่มหัวข้อการประชุม</p>
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
        ) : (
          <div className="space-y-8">
            {teams.map(team => (
              <DndContext
                key={team.id}
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd(team.id)}
              >
                <div className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] overflow-hidden shadow-[var(--shadow-card)]">
                  {/* Team Header */}
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

                  {/* Topics List */}
                  <div className="divide-y divide-[var(--color-border)]">
                    {team.topics.length === 0 ? (
                      <div className="px-6 py-8 text-center text-[var(--color-text-muted)] text-sm">
                        ยังไม่มีหัวข้อใหญ่ในทีมนี้
                      </div>
                    ) : (
                      <SortableContext
                        items={team.topics.map(t => t.id)}
                        strategy={verticalListSortingStrategy}
                      >
                        {team.topics.map(topic => {
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
                                onDeleteTopic={() => deleteTopic(team.id, topic.id)}
                                isEditingTitle={editingTopic?.teamId === team.id && editingTopic?.topicId === topic.id}
                                editTitleValue={editTopicTitle}
                                onEditTitleChange={setEditTopicTitle}
                                onStartEditTitle={() => {
                                  setEditTopicTitle(topic.title);
                                  setEditingTopic({ teamId: team.id, topicId: topic.id });
                                }}
                                onSaveEditTitle={() => {
                                  updateTopicTitle(team.id, topic.id, editTopicTitle);
                                  setEditingTopic(null);
                                }}
                                onCancelEditTitle={() => {
                                  setEditingTopic(null);
                                }}
                              />
                              <SubtopicDroppableArea
                                teamId={team.id}
                                topic={topic}
                                isExpanded={isExpanded}
                                updateSubTopicStatus={(topicId, subTopicId, s) => updateSubTopicStatus(team.id, topicId, subTopicId, s)}
                                deleteSubTopic={(topicId, subTopicId) => deleteSubTopic(team.id, topicId, subTopicId)}
                                editingSubTopic={editingSubTopic}
                                editSubTopicTitle={editSubTopicTitle}
                                onEditSubTopicTitleChange={setEditSubTopicTitle}
                                onStartEditSubTopicTitle={(topicId, subTopicId) => {
                                  const sub = team.topics.find(t => t.id === topicId)?.subTopics.find(s => s.id === subTopicId);
                                  if (sub) {
                                    setEditSubTopicTitle(sub.title);
                                    setEditingSubTopic({ teamId: team.id, topicId, subTopicId });
                                  }
                                }}
                                onSaveEditSubTopicTitle={() => {
                                  if (editingSubTopic) {
                                    updateSubTopicTitle(editingSubTopic.teamId, editingSubTopic.topicId, editingSubTopic.subTopicId, editSubTopicTitle);
                                    setEditingSubTopic(null);
                                  }
                                }}
                                onCancelEditSubTopicTitle={() => setEditingSubTopic(null)}
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
        )}
      </main>

      {/* Modals */}
      
      {/* Add Team Modal */}
      {isTeamModalOpen && (
        <div className="fixed inset-0 bg-[var(--color-modal-backdrop)] backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--color-surface)] rounded-2xl shadow-[var(--shadow-modal)] w-full max-w-md overflow-hidden border border-[var(--color-border)]">
            <div className="px-6 py-4 border-b border-[var(--color-border)]">
              <h3 className="text-lg font-semibold text-[var(--color-text)]">เพิ่มทีมใหม่ (Add New Team)</h3>
            </div>
            <form onSubmit={handleAddTeam} className="p-6">
              <div className="mb-4">
                <label htmlFor="teamName" className="block text-sm font-medium text-[var(--color-text-muted)] mb-1">
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

      {/* Add Topic Modal */}
      {isTopicModalOpen && (
        <div className="fixed inset-0 bg-[var(--color-modal-backdrop)] backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--color-surface)] rounded-2xl shadow-[var(--shadow-modal)] w-full max-w-md overflow-hidden border border-[var(--color-border)]">
            <div className="px-6 py-4 border-b border-[var(--color-border)]">
              <h3 className="text-lg font-semibold text-[var(--color-text)]">เพิ่มหัวข้อใหญ่ (Add New Topic)</h3>
              <p className="text-sm text-[var(--color-text-muted)] mt-1">
                สำหรับทีม: {teams.find(t => t.id === selectedTeamId)?.name}
              </p>
            </div>
            <form onSubmit={handleAddTopic} className="p-6">
              <div className="mb-4">
                <label htmlFor="topicTitle" className="block text-sm font-medium text-[var(--color-text-muted)] mb-1">
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

      {/* Add SubTopic Modal */}
      {isSubTopicModalOpen && (
        <div className="fixed inset-0 bg-[var(--color-modal-backdrop)] backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--color-surface)] rounded-2xl shadow-[var(--shadow-modal)] w-full max-w-md overflow-hidden border border-[var(--color-border)]">
            <div className="px-6 py-4 border-b border-[var(--color-border)]">
              <h3 className="text-lg font-semibold text-[var(--color-text)]">เพิ่มหัวข้อย่อย (Add Sub-Topic)</h3>
              <p className="text-sm text-[var(--color-text-muted)] mt-1">
                ภายใต้หัวข้อ: {teams.find(t => t.id === selectedTeamId)?.topics.find(top => top.id === selectedTopicId)?.title}
              </p>
            </div>
            <form onSubmit={handleAddSubTopic} className="p-6">
              <div className="mb-4">
                <label htmlFor="subTopicTitle" className="block text-sm font-medium text-[var(--color-text-muted)] mb-1">
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

    </div>
  );
}
