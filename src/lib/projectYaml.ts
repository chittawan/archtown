/**
 * Project data as YAML. Used by server (vite config) to read/write data/projects/*.yaml.
 * IDs are generated on load so YAML can omit them for brevity.
 */
import yaml from 'js-yaml';
import type { Team, Topic, SubTopic, SubTopicDetail, Status, SubTopicType, TodoItemStatus } from '../types';

const STATUSES: Status[] = ['GREEN', 'YELLOW', 'RED'];

function genId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

const TODO_ITEM_STATUSES: TodoItemStatus[] = ['todo', 'doing', 'done'];

function ensureTodoItemStatus(s: unknown): TodoItemStatus {
  return TODO_ITEM_STATUSES.includes(s as TodoItemStatus) ? (s as TodoItemStatus) : 'todo';
}

function ensureSubTopicType(s: unknown): SubTopicType {
  return s === 'status' ? 'status' : 'todos';
}

/** YAML-friendly shape (no ids); ids are added when parsing */
interface ProjectYamlTeam {
  name: string;
  topics: Array<{
    title: string;
    subTopics: Array<{
      title: string;
      status: Status;
      subTopicType?: SubTopicType;
      details?: Array<{ text: string; description?: string; status?: TodoItemStatus; done?: boolean; dueDate?: string }>;
    }>;
  }>;
}

interface ProjectYamlRoot {
  id?: string;
  name: string;
  description?: string;
  teams: ProjectYamlTeam[];
}

export interface ProjectData {
  id?: string;
  projectName: string;
  description?: string;
  teams: Team[];
}

function ensureStatus(s: unknown): Status {
  return STATUSES.includes(s as Status) ? (s as Status) : 'GREEN';
}

/** Parse YAML string into project data with generated ids */
export function yamlToProject(yamlStr: string): ProjectData {
  const raw = yaml.load(yamlStr) as ProjectYamlRoot | null;
  if (!raw || typeof raw !== 'object') {
    return { projectName: 'Project', teams: [] };
  }
  const projectName = typeof raw.name === 'string' ? raw.name.trim() : 'Project';
  const id = typeof raw.id === 'string' ? raw.id.trim() : undefined;
  const description =
    typeof raw.description === 'string' && raw.description.trim()
      ? raw.description.trim()
      : undefined;
  const teams: Team[] = [];
  const teamsList = Array.isArray(raw.teams) ? raw.teams : [];
  for (const t of teamsList) {
    const name = typeof t.name === 'string' ? t.name : 'Team';
    const topics: Topic[] = [];
    const topicList = Array.isArray(t.topics) ? t.topics : [];
    for (const top of topicList) {
      const title = typeof top.title === 'string' ? top.title : 'Topic';
      const subTopics: SubTopic[] = [];
      const subList = Array.isArray(top.subTopics) ? top.subTopics : [];
      for (const sub of subList) {
        const subTitle = typeof sub.title === 'string' ? sub.title : 'SubTopic';
        const status = ensureStatus(sub.status);
        const subTopicType = ensureSubTopicType((sub as { subTopicType?: SubTopicType }).subTopicType);
        const details: SubTopicDetail[] = [];
        const detailList = Array.isArray(sub.details) ? sub.details : [];
        for (const d of detailList) {
          const dueDate =
            typeof (d as { dueDate?: string })?.dueDate === 'string' &&
            (d as { dueDate: string }).dueDate.trim()
              ? (d as { dueDate: string }).dueDate.trim()
              : undefined;
          const hasStatus = typeof (d as { status?: TodoItemStatus }).status === 'string';
          const legacyDone = Boolean((d as { done?: boolean }).done);
          const description =
            typeof (d as { description?: string })?.description === 'string'
              ? (d as { description: string }).description.trim() || undefined
              : undefined;
          details.push({
            text: typeof d?.text === 'string' ? d.text : '',
            ...(description && { description }),
            ...(hasStatus
              ? { status: ensureTodoItemStatus((d as { status: TodoItemStatus }).status) }
              : { status: (legacyDone ? 'done' : 'todo') as TodoItemStatus }),
            ...(dueDate && { dueDate }),
          });
        }
        subTopics.push({
          id: genId('sub'),
          title: subTitle,
          status,
          subTopicType,
          details,
        });
      }
      topics.push({
        id: genId('top'),
        title,
        subTopics,
      });
    }
    teams.push({
      id: genId('t'),
      name,
      topics,
    });
  }
  return { id, projectName, description, teams };
}

/** Serialize project data to YAML; id ใช้เชื่อมกับ capability */
export function projectToYaml(data: ProjectData): string {
  const root: ProjectYamlRoot = {
    ...(data.id && { id: data.id }),
    name: data.projectName.trim() || 'Project',
    ...(data.description && { description: data.description }),
    teams: data.teams.map((t) => ({
      name: t.name,
      topics: t.topics.map((top) => ({
        title: top.title,
        subTopics: top.subTopics.map((sub) => ({
          title: sub.title,
          status: sub.status,
          ...(sub.subTopicType && sub.subTopicType !== 'todos' && { subTopicType: sub.subTopicType }),
          details: (sub.details ?? []).map((d) => {
            const status = d.status ?? (d.done ? 'done' : 'todo');
            return {
              text: d.text,
              ...(d.description && { description: d.description }),
              status,
              ...(d.dueDate && { dueDate: d.dueDate }),
            };
          }),
        })),
      })),
    })),
  };
  return yaml.dump(root, { lineWidth: -1, noRefs: true });
}
