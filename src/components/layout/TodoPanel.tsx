import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Circle, ListTodo, ExternalLink } from 'lucide-react';
import type { Team, SubTopicDetail } from '../../types';

export interface FlatTodoItem {
  teamName: string;
  topicTitle: string;
  subTopicTitle: string;
  text: string;
  done: boolean;
  dueDate?: string;
  projectId: string;
  projectName: string;
}

interface ProjectData {
  id?: string;
  projectName: string;
  description?: string;
  teams: Team[];
}

async function fetchProject(projectId: string): Promise<ProjectData | null> {
  const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}`);
  if (!res.ok) return null;
  const json = await res.json();
  const data = json?.data;
  if (!data || !Array.isArray(data.teams)) return null;
  return {
    id: json.id ?? projectId,
    projectName: data.projectName ?? json.id ?? projectId,
    description: data.description,
    teams: data.teams,
  };
}

function flattenProjectToTodos(projectId: string, projectName: string, teams: Team[]): FlatTodoItem[] {
  const items: FlatTodoItem[] = [];
  for (const team of teams) {
    for (const topic of team.topics) {
      for (const sub of topic.subTopics) {
        const details = sub.details ?? [];
        for (const d of details) {
          const detail = d as SubTopicDetail;
          items.push({
            teamName: team.name,
            topicTitle: topic.title,
            subTopicTitle: sub.title,
            text: detail.text,
            done: detail.done,
            dueDate: detail.dueDate,
            projectId,
            projectName,
          });
        }
      }
    }
  }
  return items;
}

function formatDueDate(iso?: string): string {
  if (!iso || !iso.trim()) return '';
  try {
    const d = new Date(iso.trim());
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return '';
  }
}

export default function TodoPanel({ projectId }: { projectId: string | null }) {
  const navigate = useNavigate();
  const [items, setItems] = useState<FlatTodoItem[]>([]);
  const [projectName, setProjectName] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!projectId) {
      setItems([]);
      setProjectName('');
      setError(false);
      return;
    }
    setLoading(true);
    setError(false);
    fetchProject(projectId)
      .then((data) => {
        if (!data) {
          setItems([]);
          setProjectName('');
          setError(true);
          return;
        }
        const flat = flattenProjectToTodos(data.id ?? projectId, data.projectName, data.teams);
        setItems(flat);
        setProjectName(data.projectName);
      })
      .catch(() => {
        setItems([]);
        setError(true);
      })
      .finally(() => setLoading(false));
  }, [projectId]);

  useEffect(() => {
    if (!projectId || typeof window === 'undefined') return;
    const handler = () => {
      fetchProject(projectId).then((data) => {
        if (data) {
          setItems(flattenProjectToTodos(data.id ?? projectId, data.projectName, data.teams));
          setProjectName(data.projectName);
        }
      });
    };
    window.addEventListener('project-summary-invalidate', handler);
    return () => window.removeEventListener('project-summary-invalidate', handler);
  }, [projectId]);

  if (!projectId) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <ListTodo className="w-10 h-10 text-[var(--color-text-subtle)] mb-3" />
        <p className="text-sm text-[var(--color-text-muted)]">
          เปิดโปรเจกต์เพื่อดู Todo
        </p>
        <p className="text-xs text-[var(--color-text-subtle)] mt-1">
          ไปที่ Capability แล้วดับเบิลคลิกที่การ์ดโปรเจกต์ หรือเปิด URL /project?id=...
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="py-4 text-sm text-[var(--color-text-muted)]">
        กำลังโหลด...
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-4 text-sm text-[var(--color-text-muted)]">
        โหลดโปรเจกต์ไม่สำเร็จ
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <ListTodo className="w-10 h-10 text-[var(--color-text-subtle)] mb-3" />
        <p className="text-sm text-[var(--color-text-muted)]">
          ยังไม่มี Task ในโปรเจกต์นี้
        </p>
        <button
          type="button"
          onClick={() => navigate(`/project?id=${encodeURIComponent(projectId)}`)}
          className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-[var(--color-primary)] hover:underline"
        >
          <ExternalLink className="w-4 h-4" />
          เปิดโปรเจกต์เพื่อเพิ่ม Task
        </button>
      </div>
    );
  }

  const doneCount = items.filter((i) => i.done).length;
  const notDoneCount = items.length - doneCount;

  const openProject = () => {
    navigate(`/project?id=${encodeURIComponent(projectId)}`);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between text-xs text-[var(--color-text-muted)]">
        <span>{projectName}</span>
        <span>
          ทำแล้ว {doneCount} / ทั้งหมด {items.length}
        </span>
      </div>
      <ul className="space-y-2">
        {items.map((item, idx) => (
          <li
            key={`${item.teamName}-${item.topicTitle}-${item.subTopicTitle}-${idx}`}
            className="group text-sm border border-[var(--color-border)] rounded-lg px-3 py-2 bg-[var(--color-page)] hover:bg-[var(--color-overlay)] transition-colors"
          >
            <button
              type="button"
              onClick={openProject}
              className="w-full text-left flex items-start gap-2"
            >
              <span className="shrink-0 mt-0.5 text-[var(--color-text-subtle)]">
                {item.done ? (
                  <Check className="w-4 h-4 text-emerald-500" />
                ) : (
                  <Circle className="w-4 h-4" />
                )}
              </span>
              <span className="flex-1 min-w-0">
                <span
                  className={`block truncate ${item.done ? 'line-through text-[var(--color-text-muted)]' : 'text-[var(--color-text)]'}`}
                >
                  {item.text || '(ไม่มีข้อความ)'}
                </span>
                <span className="block text-[10px] text-[var(--color-text-subtle)] mt-0.5">
                  {item.teamName} → {item.topicTitle} → {item.subTopicTitle}
                </span>
                {item.dueDate && (
                  <span className="inline-block mt-1 text-[10px] text-[var(--color-text-muted)]">
                    Due: {formatDueDate(item.dueDate)}
                  </span>
                )}
              </span>
              <ExternalLink className="w-3.5 h-3.5 shrink-0 text-[var(--color-text-subtle)] opacity-0 group-hover:opacity-100 transition-opacity mt-0.5" />
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={openProject}
        className="inline-flex items-center justify-center gap-1.5 w-full py-2 text-xs font-medium text-[var(--color-primary)] hover:bg-[var(--color-primary-muted)] rounded-lg transition-colors border border-[var(--color-border)]"
      >
        <ExternalLink className="w-3.5 h-3.5" />
        เปิดโปรเจกต์เพื่อแก้ไข Task
      </button>
    </div>
  );
}
