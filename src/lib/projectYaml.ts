/**
 * Project data as YAML. Used by server (vite config) to read/write data/projects/*.yaml.
 * IDs are generated on load so YAML can omit them for brevity.
 */
import yaml from 'js-yaml';
import type { Team, Topic, SubTopic, SubTopicDetail, Status } from '../types';

const STATUSES: Status[] = ['GREEN', 'YELLOW', 'RED'];

function genId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** YAML-friendly shape (no ids); ids are added when parsing */
interface ProjectYamlTeam {
  name: string;
  topics: Array<{
    title: string;
    subTopics: Array<{
      title: string;
      status: Status;
      details?: Array<{ text: string; done: boolean }>;
    }>;
  }>;
}

interface ProjectYamlRoot {
  name: string;
  teams: ProjectYamlTeam[];
}

export interface ProjectData {
  projectName: string;
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
        const details: SubTopicDetail[] = [];
        const detailList = Array.isArray(sub.details) ? sub.details : [];
        for (const d of detailList) {
          details.push({
            text: typeof d?.text === 'string' ? d.text : '',
            done: Boolean(d?.done),
          });
        }
        subTopics.push({
          id: genId('sub'),
          title: subTitle,
          status,
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
  return { projectName, teams };
}

/** Serialize project data to YAML (ids omitted in file for brevity) */
export function projectToYaml(data: ProjectData): string {
  const root: ProjectYamlRoot = {
    name: data.projectName.trim() || 'Project',
    teams: data.teams.map((t) => ({
      name: t.name,
      topics: t.topics.map((top) => ({
        title: top.title,
        subTopics: top.subTopics.map((sub) => ({
          title: sub.title,
          status: sub.status,
          details: (sub.details ?? []).map((d) => ({ text: d.text, done: d.done })),
        })),
      })),
    })),
  };
  return yaml.dump(root, { lineWidth: -1, noRefs: true });
}
