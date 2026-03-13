import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ListTodo, CalendarDays, Check, Circle, AlertTriangle, GanttChart } from 'lucide-react';
import Calendar from 'react-calendar';
import Timeline, { TimelineMarkers, TodayMarker } from 'react-calendar-timeline';
import 'react-calendar/dist/Calendar.css';
import 'react-calendar-timeline/style.css';
import './TasksCalendar.css';
import './TasksTimeline.css';
import type { Team, SubTopicDetail } from '../../types';

type ProjectData = {
  id: string;
  projectName: string;
  description?: string;
  teams: Team[];
};

type FlatTask = {
  id: string;
  projectId: string;
  projectName: string;
  teamName: string;
  topicTitle: string;
  subTopicTitle: string;
  detailIdx: number;
  text: string;
  done: boolean;
  dueDate?: string;
};

type DueBucket = 'overdue' | 'near' | 'mid' | 'far' | 'none';

type ProjectsById = Record<string, ProjectData>;

async function fetchProjectsIndex(): Promise<{ id: string; name: string }[]> {
  const res = await fetch('/api/projects');
  if (!res.ok) return [];
  const data = await res.json().catch(() => ({}));
  if (!Array.isArray(data.projects)) return [];
  return data.projects.map((p: any) => ({
    id: String(p.id ?? ''),
    name: String(p.name ?? p.projectName ?? p.id ?? ''),
  }));
}

async function fetchProject(id: string): Promise<ProjectData | null> {
  const res = await fetch(`/api/projects/${encodeURIComponent(id)}`);
  if (!res.ok) return null;
  const json = await res.json().catch(() => null);
  const data = json?.data;
  if (!data || !Array.isArray(data.teams)) return null;
  return {
    id: json.id ?? id,
    projectName: data.projectName ?? json.id ?? id,
    description: data.description,
    teams: data.teams,
  };
}

function buildFlatTasks(projects: ProjectsById): FlatTask[] {
  const items: FlatTask[] = [];
  for (const projectId of Object.keys(projects)) {
    const project = projects[projectId];
    project.teams.forEach((team, teamIdx) => {
      team.topics.forEach((topic, topicIdx) => {
        topic.subTopics.forEach((subTopic, subIdx) => {
          if ((subTopic.subTopicType ?? 'todos') !== 'todos') return;
          (subTopic.details ?? []).forEach((detail, detailIdx) => {
            const text = detail.text?.trim() ?? '';
            if (!text) return;
            const done = detail.status === 'done' || !!detail.done;
            items.push({
              id: `${project.id}::${teamIdx}::${topicIdx}::${subIdx}::${detailIdx}`,
              projectId: project.id,
              projectName: project.projectName,
              teamName: team.name,
              topicTitle: topic.title,
              subTopicTitle: subTopic.title,
              detailIdx,
              text,
              done,
              dueDate: detail.dueDate,
            });
          });
        });
      });
    });
  }
  return items;
}

function getDueBucket(dueDate?: string): DueBucket {
  if (!dueDate) return 'none';
  const d = new Date(dueDate);
  if (Number.isNaN(d.getTime())) return 'none';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  const diffDays = Math.round((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return 'overdue';
  if (diffDays <= 3) return 'near';
  if (diffDays <= 14) return 'mid';
  return 'far';
}

function formatThaiDate(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('th-TH', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatRelativeThaiDay(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  const diffDays = Math.round(
    (d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  );
  if (diffDays === 0) return 'วันนี้';
  if (diffDays > 0) return `อีก ${diffDays} วัน`;
  return `${Math.abs(diffDays)} วันที่แล้ว`;
}

const SAVE_DEBOUNCE_MS = 700;

export default function TasksOverviewPage() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<ProjectsById>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [focusTodayOnly, setFocusTodayOnly] = useState(false);
  const [calendarViewMode, setCalendarViewMode] = useState<'calendar' | 'timeline'>('timeline');
  const [savingProjects, setSavingProjects] = useState<Set<string>>(new Set());
  const saveTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    let cancelled = false;
    async function loadAll() {
      setLoading(true);
      setError(null);
      try {
        const index = await fetchProjectsIndex();
        if (!index.length) {
          if (!cancelled) {
            setProjects({});
            setLoading(false);
          }
          return;
        }
        const results = await Promise.all(
          index.map((p) => fetchProject(p.id).then((data) => data).catch(() => null))
        );
        if (cancelled) return;
        const next: ProjectsById = {};
        results.forEach((p) => {
          if (p && p.id) next[p.id] = p;
        });
        setProjects(next);
      } catch {
        if (!cancelled) {
          setError('โหลด Task จากโปรเจกต์ไม่สำเร็จ');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadAll();
    return () => {
      cancelled = true;
    };
  }, []);

  const allTasks = useMemo(() => buildFlatTasks(projects), [projects]);

  const visibleTasks = useMemo(() => {
    const base = showDone ? allTasks : allTasks.filter((t) => !t.done);
    if (!focusTodayOnly) return base;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return base.filter((t) => {
      if (!t.dueDate) return false;
      const d = new Date(t.dueDate);
      if (Number.isNaN(d.getTime())) return false;
      d.setHours(0, 0, 0, 0);
      return d.getTime() === today.getTime();
    });
  }, [allTasks, showDone, focusTodayOnly]);

  const groupedByBucket = useMemo(() => {
    const buckets: Record<DueBucket, FlatTask[]> = {
      overdue: [],
      near: [],
      mid: [],
      far: [],
      none: [],
    };
    visibleTasks.forEach((task) => {
      const bucket = getDueBucket(task.dueDate);
      buckets[bucket].push(task);
    });
    (Object.keys(buckets) as DueBucket[]).forEach((b) => {
      buckets[b].sort((a, b2) => {
        const da = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
        const db = b2.dueDate ? new Date(b2.dueDate).getTime() : Infinity;
        if (da !== db) return da - db;
        return a.projectName.localeCompare(b2.projectName);
      });
    });
    return buckets;
  }, [visibleTasks]);

  const tasksWithDue = useMemo(
    () => visibleTasks.filter((t) => t.dueDate).sort((a, b) => {
      const da = new Date(a.dueDate as string).getTime();
      const db = new Date(b.dueDate as string).getTime();
      return da - db;
    }),
    [visibleTasks]
  );

  const tasksByDate = useMemo(() => {
    const map = new Map<string, FlatTask[]>();
    tasksWithDue.forEach((task) => {
      if (!task.dueDate) return;
      const key = task.dueDate.slice(0, 10);
      const arr = map.get(key) ?? [];
      arr.push(task);
      map.set(key, arr);
    });
    return map;
  }, [tasksWithDue]);

  const { timelineGroups, timelineItems, defaultTimeStart, defaultTimeEnd } = useMemo(() => {
    const projectIds = new Set<string>();
    tasksWithDue.forEach((t) => projectIds.add(t.projectId));
    const projectNames = new Map<string, string>();
    tasksWithDue.forEach((t) => projectNames.set(t.projectId, t.projectName));
    const groups = Array.from(projectIds).map((id) => ({
      id,
      title: projectNames.get(id) ?? id,
    }));
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 28);
    const items = tasksWithDue.map((task) => {
      if (!task.dueDate) return null;
      const d = new Date(task.dueDate);
      if (Number.isNaN(d.getTime())) return null;
      d.setHours(0, 0, 0, 0);
      const startMs = d.getTime();
      const endMs = startMs + 24 * 60 * 60 * 1000; /* แถบยาวทั้งวัน เพื่อให้เห็น label ได้มากขึ้น */
      const fullLabel = `${task.text} · ${task.projectName}`;
      return {
        id: task.id,
        group: task.projectId,
        title: task.text,
        start_time: startMs,
        end_time: endMs,
        className: getDueBucket(task.dueDate) === 'overdue' ? 'rct-item-overdue' : getDueBucket(task.dueDate) === 'near' ? 'rct-item-near' : undefined,
        itemProps: { title: fullLabel },
      };
    }).filter(Boolean) as { id: string; group: string; title: string; start_time: number; end_time: number; className?: string; itemProps?: { title: string } }[];
    return {
      timelineGroups: groups,
      timelineItems: items,
      defaultTimeStart: start.getTime() - 7 * dayMs,
      defaultTimeEnd: end.getTime(),
    };
  }, [tasksWithDue]);

  const saveProject = useCallback((project: ProjectData) => {
    setSavingProjects((prev) => new Set(prev).add(project.id));
    fetch('/api/save-project', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectName: project.projectName,
        data: {
          id: project.id,
          projectName: project.projectName,
          description: project.description,
          teams: project.teams,
        },
      }),
    })
      .then((res) => res.json().catch(() => ({})))
      .then((resData) => {
        if (resData?.ok && typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('project-summary-invalidate', {
              detail: { projectId: project.id },
            })
          );
        }
      })
      .finally(() => {
        setSavingProjects((prev) => {
          const next = new Set(prev);
          next.delete(project.id);
          return next;
        });
      });
  }, []);

  const scheduleSave = useCallback(
    (projectId: string) => {
      const timers = saveTimersRef.current;
      const existing = timers.get(projectId);
      if (existing) clearTimeout(existing);
      const timeout = setTimeout(() => {
        timers.delete(projectId);
        const project = projects[projectId];
        if (project) saveProject(project);
      }, SAVE_DEBOUNCE_MS);
      timers.set(projectId, timeout);
    },
    [projects, saveProject]
  );

  const updateTaskDetail = useCallback(
    (task: FlatTask, patch: Partial<SubTopicDetail>) => {
      const [projectId, teamIdxStr, topicIdxStr, subIdxStr] = task.id.split('::');
      const teamIdx = Number(teamIdxStr);
      const topicIdx = Number(topicIdxStr);
      const subIdx = Number(subIdxStr);
      const detailIdx = task.detailIdx;
      setProjects((prev) => {
        const project = prev[projectId];
        if (!project) return prev;
        const nextTeams = project.teams.map((team, ti) => {
          if (ti !== teamIdx) return team;
          return {
            ...team,
            topics: team.topics.map((topic, toIdx) => {
              if (toIdx !== topicIdx) return topic;
              return {
                ...topic,
                subTopics: topic.subTopics.map((sub, si) => {
                  if (si !== subIdx) return sub;
                  const details = [...(sub.details ?? [])];
                  if (!details[detailIdx]) return sub;
                  details[detailIdx] = { ...details[detailIdx], ...patch };
                  return { ...sub, details };
                }),
              };
            }),
          };
        });
        const nextProject: ProjectData = { ...project, teams: nextTeams };
        return { ...prev, [projectId]: nextProject };
      });
      scheduleSave(projectId);
    },
    [scheduleSave]
  );

  const openProject = (projectId: string) => {
    navigate(`/project?id=${encodeURIComponent(projectId)}`);
  };

  const totalTasks = allTasks.length;
  const totalOpenTasks = allTasks.filter((t) => !t.done).length;

  return (
    <div className="max-w-6xl mx-auto">
      <header className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--color-text)] flex items-center gap-2">
            <ListTodo className="w-7 h-7 text-[var(--color-primary)]" />
            Task Overview
          </h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            มุมมองรวม Daily Task จากทุกโปรเจกต์ — เน้นงานที่ใกล้ถึงกำหนด (ใกล้ / กลาง / ไกล) และจัดการได้จากหน้าเดียว
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="px-3 py-1.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-xs text-[var(--color-text-muted)] flex items-center gap-2">
            <span>
              ค้างอยู่ {totalOpenTasks} จาก {totalTasks} Task
            </span>
            {savingProjects.size > 0 && (
              <span className="inline-flex items-center gap-1 text-[var(--color-text-muted)]">
                <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                กำลังบันทึก...
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => setFocusTodayOnly((v) => !v)}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors ${
              focusTodayOnly
                ? 'bg-[var(--color-primary)] text-white border-[var(--color-primary)]'
                : 'bg-[var(--color-surface)] text-[var(--color-text-muted)] border-[var(--color-border)] hover:text-[var(--color-text)]'
            }`}
          >
            โฟกัสวันนี้
          </button>
          <button
            type="button"
            onClick={() => setShowDone((v) => !v)}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors ${
              showDone
                ? 'bg-[var(--color-overlay)] text-[var(--color-text)] border-[var(--color-border-strong)]'
                : 'bg-[var(--color-surface)] text-[var(--color-text-muted)] border-[var(--color-border)] hover:text-[var(--color-text)]'
            }`}
          >
            แสดงที่ทำแล้ว
          </button>
        </div>
      </header>

      {loading ? (
        <div className="py-12 text-center text-[var(--color-text-muted)] text-sm">
          กำลังโหลด Task จากทุกโปรเจกต์...
        </div>
      ) : error ? (
        <div className="py-6 px-4 rounded-2xl border border-red-500/40 bg-red-500/10 text-sm text-[var(--color-text)] flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 text-red-500" />
          <div>
            <p className="font-medium">เกิดข้อผิดพลาดในการโหลด Task</p>
            <p className="text-[var(--color-text-muted)] mt-1">{error}</p>
          </div>
        </div>
      ) : totalTasks === 0 ? (
        <div className="py-12 rounded-2xl border-2 border-dashed border-[var(--color-border)] bg-[var(--color-surface)] text-center">
          <ListTodo className="w-12 h-12 mx-auto text-[var(--color-text-subtle)] mb-3" />
          <p className="text-sm text-[var(--color-text-muted)]">
            ยังไม่มี Task ในโปรเจกต์ใดเลย
          </p>
        </div>
      ) : (
        <>
          <section className="mb-8">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-[var(--color-text-muted)] uppercase tracking-wide">
                <CalendarDays className="w-4 h-4 text-[var(--color-primary)]" />
                ปฏิทิน / Timeline (ตาม Due date)
              </h2>
              <div className="flex rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-0.5">
                <button
                  type="button"
                  onClick={() => setCalendarViewMode('calendar')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    calendarViewMode === 'calendar'
                      ? 'bg-[var(--color-primary)] text-white shadow-sm'
                      : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-overlay)]'
                  }`}
                >
                  <CalendarDays className="w-3.5 h-3.5" />
                  ปฏิทิน
                </button>
                <button
                  type="button"
                  onClick={() => setCalendarViewMode('timeline')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    calendarViewMode === 'timeline'
                      ? 'bg-[var(--color-primary)] text-white shadow-sm'
                      : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-overlay)]'
                  }`}
                >
                  <GanttChart className="w-3.5 h-3.5" />
                  Timeline
                </button>
              </div>
            </div>
            <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 overflow-x-auto">
              {tasksWithDue.length === 0 ? (
                <p className="text-xs text-[var(--color-text-muted)]">
                  ยังไม่มี Task ที่กำหนด Due date
                </p>
              ) : calendarViewMode === 'calendar' ? (
                <div className="tasks-calendar-wrapper max-w-2xl mx-auto">
                  <Calendar
                    locale="th-TH"
                    minDetail="month"
                    maxDetail="month"
                    view="month"
                    next2Label={null}
                    prev2Label={null}
                    tileContent={({ date, view }) => {
                      if (view !== 'month') return null;
                      const key = date.toISOString().slice(0, 10);
                      const dayTasks = tasksByDate.get(key) ?? [];
                      if (dayTasks.length === 0) return null;
                      const dots = dayTasks.slice(0, 6).map((task) => {
                        const bucket = getDueBucket(task.dueDate);
                        const dotClass =
                          bucket === 'overdue'
                            ? 'tasks-calendar-dot--overdue'
                            : bucket === 'near'
                            ? 'tasks-calendar-dot--near'
                            : bucket === 'mid'
                            ? 'tasks-calendar-dot--mid'
                            : 'tasks-calendar-dot--far';
                        return (
                          <span
                            key={task.id}
                            className={`tasks-calendar-dot ${dotClass}`}
                            title={`${task.text} · ${task.projectName}`}
                          />
                        );
                      });
                      return (
                        <div className="tasks-calendar-tile-content">
                          {dots}
                          {dayTasks.length > 6 && (
                            <span className="tasks-calendar-more">+{dayTasks.length - 6}</span>
                          )}
                        </div>
                      );
                    }}
                  />
                </div>
              ) : (
                <TimelineView
                  timelineGroups={timelineGroups}
                  timelineItems={timelineItems}
                  defaultTimeStart={defaultTimeStart}
                  defaultTimeEnd={defaultTimeEnd}
                  tasksWithDue={tasksWithDue}
                  onOpenProject={openProject}
                />
              )}
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-sm font-semibold text-[var(--color-text-muted)] uppercase tracking-wide">
              กลุ่มตามความใกล้ของ Due date
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <TaskColumn
                title="เลยกำหนด"
                subtitle="ต้องจัดการก่อนอื่น"
                colorClass="border-rose-500/70"
                headerBg="bg-rose-500/10"
                pillBg="bg-rose-500/20 text-rose-600 dark:text-rose-300"
                tasks={groupedByBucket.overdue}
                onUpdate={updateTaskDetail}
                onOpenProject={openProject}
              />
              <TaskColumn
                title="ใกล้"
                subtitle="ภายใน 3 วัน"
                colorClass="border-amber-500/70"
                headerBg="bg-amber-500/10"
                pillBg="bg-amber-500/20 text-amber-700 dark:text-amber-300"
                tasks={groupedByBucket.near}
                onUpdate={updateTaskDetail}
                onOpenProject={openProject}
              />
              <TaskColumn
                title="กลาง"
                subtitle="4–14 วัน"
                colorClass="border-sky-500/70"
                headerBg="bg-sky-500/10"
                pillBg="bg-sky-500/20 text-sky-700 dark:text-sky-300"
                tasks={groupedByBucket.mid}
                onUpdate={updateTaskDetail}
                onOpenProject={openProject}
              />
              <TaskColumn
                title="ไกล / ยังไม่กำหนด"
                subtitle="มากกว่า 14 วัน หรือไม่มี Due date"
                colorClass="border-emerald-500/60"
                headerBg="bg-emerald-500/10"
                pillBg="bg-emerald-500/20 text-emerald-700 dark:text-emerald-300"
                tasks={[...groupedByBucket.far, ...groupedByBucket.none]}
                onUpdate={updateTaskDetail}
                onOpenProject={openProject}
              />
            </div>
          </section>
        </>
      )}
    </div>
  );
}

type TimelineViewProps = {
  timelineGroups: { id: string; title: string }[];
  timelineItems: { id: string; group: string; title: string; start_time: number; end_time: number; className?: string; itemProps?: { title: string } }[];
  defaultTimeStart: number;
  defaultTimeEnd: number;
  tasksWithDue: FlatTask[];
  onOpenProject: (projectId: string) => void;
};

const TIMELINE_KEYS = {
  groupIdKey: 'id',
  groupTitleKey: 'title',
  groupLabelKey: 'title',
  groupRightTitleKey: 'title',
  itemIdKey: 'id',
  itemTitleKey: 'title',
  itemDivTitleKey: 'title',
  itemGroupKey: 'group',
  itemTimeStartKey: 'start_time',
  itemTimeEndKey: 'end_time',
};

function TimelineView({
  timelineGroups,
  timelineItems,
  defaultTimeStart,
  defaultTimeEnd,
  tasksWithDue,
  onOpenProject,
}: TimelineViewProps) {
  const handleItemDoubleClick = useCallback(
    (itemId: string | number) => {
      const task = tasksWithDue.find((t) => t.id === String(itemId));
      if (task) onOpenProject(task.projectId);
    },
    [tasksWithDue, onOpenProject]
  );

  if (timelineGroups.length === 0 || timelineItems.length === 0) {
    return (
      <p className="text-xs text-[var(--color-text-muted)] py-4">
        ไม่มี Task ที่มี Due date ในโปรเจกต์ใด — เลือกโหมดปฏิทินหรือเพิ่ม Due date ให้ Task
      </p>
    );
  }

  return (
    <div className="tasks-timeline-wrapper h-[360px] min-w-0">
      <Timeline
        groups={timelineGroups}
        items={timelineItems}
        keys={TIMELINE_KEYS}
        defaultTimeStart={defaultTimeStart}
        defaultTimeEnd={defaultTimeEnd}
        sidebarWidth={180}
        rightSidebarWidth={0}
        lineHeight={36}
        itemHeightRatio={0.75}
        minZoom={24 * 60 * 60 * 1000}
        maxZoom={31 * 24 * 60 * 60 * 1000}
        timeSteps={{
          second: 1,
          minute: 15,
          hour: 1,
          day: 1,
          month: 1,
          year: 1,
        }}
        stackItems
        canMove={false}
        canResize={false}
        canChangeGroup={false}
        onItemDoubleClick={(itemId) => handleItemDoubleClick(itemId)}
      >
        <TimelineMarkers>
          <TodayMarker />
        </TimelineMarkers>
      </Timeline>
    </div>
  );
}

type TaskColumnProps = {
  title: string;
  subtitle: string;
  colorClass: string;
  headerBg: string;
  pillBg: string;
  tasks: FlatTask[];
  onUpdate: (task: FlatTask, patch: Partial<SubTopicDetail>) => void;
  onOpenProject: (projectId: string) => void;
};

function TaskColumn({
  title,
  subtitle,
  colorClass,
  headerBg,
  pillBg,
  tasks,
  onUpdate,
  onOpenProject,
}: TaskColumnProps) {
  return (
    <div className={`flex flex-col rounded-2xl border bg-[var(--color-surface)] shadow-[var(--shadow-card)] ${colorClass}`}>
      <div className={`px-3 py-2 border-b border-[var(--color-border)] ${headerBg}`}>
        <h3 className="text-sm font-semibold text-[var(--color-text)]">{title}</h3>
        <p className="text-[11px] text-[var(--color-text-muted)]">{subtitle}</p>
      </div>
      <div className="flex-1 min-h-[120px] max-h-[420px] overflow-y-auto p-2 space-y-2">
        {tasks.length === 0 ? (
          <p className="text-xs text-[var(--color-text-muted)] italic px-2 py-1.5">
            ยังไม่มี Task ในกลุ่มนี้
          </p>
        ) : (
          tasks.map((task) => {
            const dueLabel = formatThaiDate(task.dueDate);
            const relativeLabel = formatRelativeThaiDay(task.dueDate);
            const bucket = getDueBucket(task.dueDate);
            const accent =
              bucket === 'overdue'
                ? 'text-rose-600 dark:text-rose-300'
                : bucket === 'near'
                ? 'text-amber-600 dark:text-amber-300'
                : bucket === 'mid'
                ? 'text-sky-600 dark:text-sky-300'
                : bucket === 'far'
                ? 'text-emerald-600 dark:text-emerald-300'
                : 'text-[var(--color-text-muted)]';

            return (
              <article
                key={task.id}
                className="group/item rounded-xl border border-[var(--color-border)] bg-[var(--color-page)] px-2.5 py-2 text-xs flex flex-col gap-1.5 hover:border-[var(--color-primary)] hover:bg-[var(--color-overlay)] transition-colors"
              >
                <div className="flex items-start gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      onUpdate(task, {
                        status: task.done ? 'todo' : 'done',
                      })
                    }
                    className="mt-0.5 p-0.5 rounded text-[var(--color-text-subtle)] hover:text-[var(--color-primary)] shrink-0"
                    title={task.done ? 'ยกเลิกทำแล้ว' : 'ทำแล้ว'}
                  >
                    {task.done ? (
                      <Check className="w-4 h-4 text-emerald-500" />
                    ) : (
                      <Circle className="w-4 h-4" />
                    )}
                  </button>
                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-[11px] leading-snug break-words ${
                        task.done
                          ? 'line-through text-[var(--color-text-muted)]'
                          : 'text-[var(--color-text)]'
                      }`}
                    >
                      {task.text}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${pillBg}`}
                      >
                        {task.projectName}
                      </span>
                      <span
                        role="button"
                        tabIndex={0}
                        title="ดับเบิลคลิกเพื่อเปิดโปรเจกต์"
                        onDoubleClick={() => onOpenProject(task.projectId)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            onOpenProject(task.projectId);
                          }
                        }}
                        className="text-[10px] text-[var(--color-text-muted)] cursor-pointer hover:text-[var(--color-primary)]"
                      >
                        {task.teamName} · {task.topicTitle} → {task.subTopicTitle}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 pt-0.5">
                  <input
                    type="date"
                    value={task.dueDate ?? ''}
                    onChange={(e) =>
                      onUpdate(task, {
                        dueDate: e.target.value || undefined,
                      })
                    }
                    className="text-[10px] bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-1.5 py-0.5 text-[var(--color-text)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
                  />
                  {dueLabel && (
                    <span
                      className={`text-[10px] ${accent}`}
                      title={dueLabel}
                    >
                      {relativeLabel || dueLabel}
                    </span>
                  )}
                </div>
              </article>
            );
          })
        )}
      </div>
    </div>
  );
}
