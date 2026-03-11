import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Circle, ListTodo, ExternalLink } from 'lucide-react';
import type { Team, SubTopicDetail } from '../../types';

interface ProjectData {
  id?: string;
  projectName: string;
  description?: string;
  teams: Team[];
}

interface TodoGroup {
  /** Full breadcrumb for tooltip */
  headerLabel: string;
  /** Session name only (subTopic title) */
  sessionTitle: string;
  /** Topic title (ใช้แทน label Session) */
  topicTitle: string;
  teamIdx: number;
  topicIdx: number;
  subTopicIdx: number;
  details: { detailIdx: number; text: string; done: boolean; dueDate?: string }[];
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

function buildTodoGroups(teams: Team[]): TodoGroup[] {
  const groups: TodoGroup[] = [];
  teams.forEach((team, teamIdx) => {
    team.topics.forEach((topic, topicIdx) => {
      topic.subTopics.forEach((sub, subTopicIdx) => {
        const details = sub.details ?? [];
        if (details.length === 0) return;
        const headerLabel = `${team.name} → ${topic.title} → ${sub.title}`;
        groups.push({
          headerLabel,
          sessionTitle: sub.title,
          topicTitle: topic.title,
          teamIdx,
          topicIdx,
          subTopicIdx,
          details: details.map((d, detailIdx) => ({
            detailIdx,
            text: d.text,
            done: d.done,
            dueDate: d.dueDate,
          })),
        });
      });
    });
  });
  return groups;
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

const SAVE_DEBOUNCE_MS = 600;

export default function TodoPanel({ projectId }: { projectId: string | null }) {
  const navigate = useNavigate();
  const [projectData, setProjectData] = useState<ProjectData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'ok'>('idle');
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadProject = useCallback(() => {
    if (!projectId) return Promise.resolve(null);
    return fetchProject(projectId);
  }, [projectId]);

  useEffect(() => {
    if (!projectId) {
      setProjectData(null);
      setError(false);
      return;
    }
    setLoading(true);
    setError(false);
    loadProject()
      .then((data) => {
        if (!data) {
          setProjectData(null);
          setError(true);
          return;
        }
        setProjectData(data);
      })
      .catch(() => {
        setProjectData(null);
        setError(true);
      })
      .finally(() => setLoading(false));
  }, [projectId, loadProject]);

  useEffect(() => {
    if (!projectId || typeof window === 'undefined') return;
    const handler = () => {
      loadProject().then((data) => {
        if (data) setProjectData(data);
      });
    };
    window.addEventListener('project-summary-invalidate', handler);
    return () => window.removeEventListener('project-summary-invalidate', handler);
  }, [projectId, loadProject]);

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, []);

  const saveProject = useCallback(() => {
    if (!projectData?.id || !projectId) return;
    const payload = {
      projectName: projectData.projectName,
      data: {
        id: projectData.id,
        projectName: projectData.projectName,
        description: projectData.description,
        teams: projectData.teams,
      },
    };
    setSaveStatus('saving');
    fetch('/api/save-project', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .then((res) => res.json().catch(() => ({})))
      .then((resData) => {
        if (resData?.ok) {
          setSaveStatus('ok');
          setTimeout(() => setSaveStatus('idle'), 1500);
          window.dispatchEvent(new CustomEvent('project-summary-invalidate', { detail: { projectId: projectData.id } }));
        } else {
          setSaveStatus('idle');
        }
      })
      .catch(() => setSaveStatus('idle'));
  }, [projectData, projectId]);

  const scheduleSave = useCallback(() => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      saveTimeoutRef.current = null;
      saveProject();
    }, SAVE_DEBOUNCE_MS);
  }, [saveProject]);

  const updateDetail = useCallback(
    (
      teamIdx: number,
      topicIdx: number,
      subTopicIdx: number,
      detailIdx: number,
      patch: Partial<SubTopicDetail>
    ) => {
      setProjectData((prev) => {
        if (!prev) return prev;
        const nextTeams = prev.teams.map((team, ti) => {
          if (ti !== teamIdx) return team;
          return {
            ...team,
            topics: team.topics.map((topic, toi) => {
              if (toi !== topicIdx) return topic;
              return {
                ...topic,
                subTopics: topic.subTopics.map((sub, si) => {
                  if (si !== subTopicIdx) return sub;
                  const nextDetails = [...(sub.details ?? [])];
                  if (!nextDetails[detailIdx]) return sub;
                  nextDetails[detailIdx] = { ...nextDetails[detailIdx], ...patch };
                  return { ...sub, details: nextDetails };
                }),
              };
            }),
          };
        });
        const next = { ...prev, teams: nextTeams };
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('project-todos-updated', {
              detail: {
                projectId: next.id,
                teams: nextTeams,
              },
            })
          );
        }
        return next;
      });
      scheduleSave();
    },
    [scheduleSave]
  );

  const getTaskDisplayValue = (
    draft: Record<string, string>,
    draftKey: string,
    fallback: string
  ) => (draft[draftKey] !== undefined ? draft[draftKey] : fallback);

  const [draftDetailText, setDraftDetailText] = useState<Record<string, string>>(
    {}
  );

  const flushTaskDraft = (
    draftKey: string,
    group: TodoGroup,
    detailIdx: number
  ) => {
    const original =
      group.details.find((d) => d.detailIdx === detailIdx)?.text ?? '';
    const value = getTaskDisplayValue(draftDetailText, draftKey, original);
    updateDetail(
      group.teamIdx,
      group.topicIdx,
      group.subTopicIdx,
      detailIdx,
      { text: value }
    );
    setDraftDetailText((prev) => {
      if (!(draftKey in prev)) return prev;
      const next = { ...prev };
      delete next[draftKey];
      return next;
    });
  };

  if (!projectId) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <ListTodo className="w-10 h-10 text-[var(--color-text-subtle)] mb-3" />
        <p className="text-sm text-[var(--color-text-muted)]">เปิดโปรเจกต์เพื่อดู Todo</p>
        <p className="text-xs text-[var(--color-text-subtle)] mt-1">
          ไปที่ Capability แล้วดับเบิลคลิกที่การ์ดโปรเจกต์ หรือเปิด URL /project?id=...
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="py-4 text-sm text-[var(--color-text-muted)]">กำลังโหลด...</div>
    );
  }

  if (error || !projectData) {
    return (
      <div className="py-4 text-sm text-[var(--color-text-muted)]">โหลดโปรเจกต์ไม่สำเร็จ</div>
    );
  }

  const groups = buildTodoGroups(projectData.teams);
  const totalItems = groups.reduce((n, g) => n + g.details.length, 0);
  const doneCount = groups.reduce(
    (n, g) => n + g.details.filter((d) => d.done).length,
    0
  );

  if (totalItems === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <ListTodo className="w-10 h-10 text-[var(--color-text-subtle)] mb-3" />
        <p className="text-sm text-[var(--color-text-muted)]">ยังไม่มี Task ในโปรเจกต์นี้</p>
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

  const openProject = () => navigate(`/project?id=${encodeURIComponent(projectId)}`);

  return (
    <div className="flex flex-col gap-3">
      {/* หัวข้อหลัก */}
      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-overlay)] px-3 py-2">
        <span className="text-[10px] font-medium text-[var(--color-text-muted)] uppercase tracking-wide block">
          หัวข้อหลัก
        </span>
        <p className="text-sm font-semibold text-[var(--color-text)] mt-0.5 truncate" title={projectData.projectName}>
          {projectData.projectName}
        </p>
        <div className="flex items-center gap-1.5 mt-1.5 text-[10px] text-[var(--color-text-muted)]">
          {saveStatus === 'saving' && <span className="animate-pulse">กำลังบันทึก...</span>}
          {saveStatus === 'ok' && <span className="text-emerald-600">บันทึกแล้ว</span>}
          <span>ทำแล้ว {doneCount} / ทั้งหมด {totalItems}</span>
        </div>
      </div>
      {/* Session → Todo/Task */}
      <div className="space-y-4">
        {groups.map((group, groupIdx) => (
          <section
            key={groupIdx}
            className="rounded-lg border border-[var(--color-border)] bg-[var(--color-page)] overflow-hidden border-l-4 border-l-[var(--color-primary)]"
          >
            <div className="px-3 py-2 bg-[var(--color-overlay)] border-b border-[var(--color-border)]">
              <span className="text-[10px] font-medium text-[var(--color-text-muted)] uppercase tracking-wide block">
                {group.topicTitle}
              </span>
              <h3
                className="text-xs font-semibold text-[var(--color-text)] truncate mt-0.5"
                title={group.headerLabel}
              >
                {group.sessionTitle}
              </h3>
            </div>
            <div className="px-2 py-1.5 border-b border-[var(--color-border)] bg-[var(--color-page)]">
              <span className="text-[10px] font-medium text-[var(--color-text-muted)] uppercase tracking-wide">
                Todo / Task
              </span>
            </div>
            <ul className="divide-y divide-[var(--color-border)]">
              {group.details.map((d) => {
                const draftKey = `${group.teamIdx}-${group.topicIdx}-${group.subTopicIdx}-${d.detailIdx}`;
                const textValue = getTaskDisplayValue(
                  draftDetailText,
                  draftKey,
                  d.text
                );
                return (
                  <li
                    key={d.detailIdx}
                    className="group/item flex items-start gap-2 px-3 py-2 hover:bg-[var(--color-overlay)] transition-colors"
                  >
                    <button
                      type="button"
                      onClick={() =>
                        updateDetail(
                          group.teamIdx,
                          group.topicIdx,
                          group.subTopicIdx,
                          d.detailIdx,
                          { done: !d.done }
                        )
                      }
                      className="shrink-0 mt-1.5 p-0.5 rounded text-[var(--color-text-subtle)] hover:text-[var(--color-primary)]"
                      title={d.done ? 'ยกเลิกทำแล้ว' : 'ทำแล้ว'}
                    >
                      {d.done ? (
                        <Check className="w-4 h-4 text-emerald-500" />
                      ) : (
                        <Circle className="w-4 h-4" />
                      )}
                    </button>
                    <div className="flex-1 min-w-0 flex flex-col gap-1">
                      <textarea
                        rows={2}
                        value={textValue}
                        onChange={(e) => {
                          const value = e.target.value;
                          setDraftDetailText((prev) => ({
                            ...prev,
                            [draftKey]: value,
                          }));
                          // realtime update underlying project data so left/right stay in sync
                          updateDetail(
                            group.teamIdx,
                            group.topicIdx,
                            group.subTopicIdx,
                            d.detailIdx,
                            { text: value }
                          );
                        }}
                        onBlur={() =>
                          flushTaskDraft(draftKey, group, d.detailIdx)
                        }
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            flushTaskDraft(draftKey, group, d.detailIdx);
                            (e.target as HTMLTextAreaElement).blur();
                          }
                        }}
                        className={`w-full text-sm bg-transparent border-0 border-b border-transparent hover:border-[var(--color-border)] focus:border-[var(--color-primary)] focus:outline-none px-0 py-0.5 resize-none break-words ${
                          d.done
                            ? 'line-through text-[var(--color-text-muted)]'
                            : 'text-[var(--color-text)]'
                        }`}
                        placeholder="Task"
                      />
                      <div className="flex items-center gap-2 flex-wrap">
                        <input
                          type="date"
                          value={d.dueDate ?? ''}
                          onChange={(e) =>
                            updateDetail(
                              group.teamIdx,
                              group.topicIdx,
                              group.subTopicIdx,
                              d.detailIdx,
                              { dueDate: e.target.value || undefined }
                            )
                          }
                          className="text-[10px] bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-1.5 py-0.5 text-[var(--color-text)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
                          title="Due date"
                        />
                        {d.dueDate && (
                          <span className="text-[10px] text-[var(--color-text-muted)]">
                            {formatDueDate(d.dueDate)}
                          </span>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
      <button
        type="button"
        onClick={openProject}
        className="inline-flex items-center justify-center gap-1.5 w-full py-2 text-xs font-medium text-[var(--color-primary)] hover:bg-[var(--color-primary-muted)] rounded-lg transition-colors border border-[var(--color-border)]"
      >
        <ExternalLink className="w-3.5 h-3.5" />
        เปิดโปรเจกต์เพื่อจัดการเต็มรูปแบบ
      </button>
    </div>
  );
}
