import type { Team, Topic, SubTopic, SubTopicDetail, Status } from '../types';

const STATUSES: Status[] = ['GREEN', 'YELLOW', 'RED'];

function genId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Export project name + teams to markdown.
 * Format:
 *   # Project Name
 *   ## Team Name
 *   ### Topic Title
 *   #### SubTopic Title (GREEN|YELLOW|RED)
 *   - [ ] Todo item
 *   - [x] Done item
 */
export function exportToMarkdown(projectName: string, teams: Team[]): string {
  const lines: string[] = [];
  lines.push(`# ${projectName.trim() || 'Project'}`);
  lines.push('');

  for (const team of teams) {
    lines.push(`## ${team.name.replace(/\n/g, ' ')}`);
    for (const topic of team.topics) {
      lines.push(`### ${topic.title.replace(/\n/g, ' ')}`);
      for (const sub of topic.subTopics) {
        lines.push(`#### ${sub.title.replace(/\n/g, ' ')} (${sub.status})`);
        for (const d of sub.details ?? []) {
          const checkbox = d.done ? '[x]' : '[ ]';
          lines.push(`- ${checkbox} ${(d.text || '').replace(/\n/g, ' ')}`);
        }
      }
    }
    lines.push('');
  }

  return lines.join('\n').trimEnd();
}

/**
 * Parse markdown into project name and teams (with generated ids).
 */
export function importFromMarkdown(md: string): { projectName: string; teams: Team[] } {
  const lines = md.split(/\r?\n/).map((l) => l.trimEnd());
  let projectName = 'Project';
  const teams: Team[] = [];
  let currentTeam: Team | null = null;
  let currentTopic: Topic | null = null;
  let currentSubTopic: SubTopic | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;

    const h1 = line.match(/^#\s+(.+)$/);
    const h2 = line.match(/^##\s+(.+)$/);
    const h3 = line.match(/^###\s+(.+)$/);
    const h4 = line.match(/^####\s+(.+?)\s*\((GREEN|YELLOW|RED)\)\s*$/);
    const todo = line.match(/^-\s+\[([ xX])\]\s*(.*)$/);

    if (h1) {
      projectName = h1[1].trim();
      currentTeam = null;
      currentTopic = null;
      currentSubTopic = null;
      continue;
    }
    if (h2) {
      const name = h2[1].trim();
      currentTeam = {
        id: genId('t'),
        name,
        topics: [],
      };
      teams.push(currentTeam);
      currentTopic = null;
      currentSubTopic = null;
      continue;
    }
    if (h3) {
      const title = h3[1].trim();
      if (!currentTeam) {
        currentTeam = { id: genId('t'), name: 'Team', topics: [] };
        teams.push(currentTeam);
      }
      currentTopic = {
        id: genId('top'),
        title,
        subTopics: [],
      };
      currentTeam.topics.push(currentTopic);
      currentSubTopic = null;
      continue;
    }
    if (h4) {
      const title = h4[1].trim();
      const status = h4[2] as Status;
      if (!currentTopic) {
        if (!currentTeam) {
          currentTeam = { id: genId('t'), name: 'Team', topics: [] };
          teams.push(currentTeam);
        }
        currentTopic = { id: genId('top'), title: 'Topic', subTopics: [] };
        currentTeam!.topics.push(currentTopic);
      }
      currentSubTopic = {
        id: genId('sub'),
        title,
        status: STATUSES.includes(status) ? status : 'GREEN',
        details: [],
      };
      currentTopic.subTopics.push(currentSubTopic);
      continue;
    }
    if (todo && currentSubTopic) {
      const done = todo[1].toLowerCase() === 'x';
      const text = todo[2].trim();
      const detail: SubTopicDetail = { text, done };
      currentSubTopic.details = currentSubTopic.details ?? [];
      currentSubTopic.details.push(detail);
    }
  }

  return { projectName, teams };
}
