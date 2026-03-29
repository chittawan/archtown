import type { Team } from '../types';
import { genDetailRowId } from './idUtils';

/** ใส่ `id` ให้ทุก detail ที่ยังไม่มี — อ้างอิง stable id แทน index */
export function ensureSubTopicDetailIds(teams: Team[]): Team[] {
  return teams.map((team) => ({
    ...team,
    topics: team.topics.map((topic) => ({
      ...topic,
      subTopics: topic.subTopics.map((sub) => ({
        ...sub,
        details: (sub.details ?? []).map((d) => ({
          ...d,
          id: typeof d.id === 'string' && d.id.trim() ? d.id.trim() : genDetailRowId(),
        })),
      })),
    })),
  }));
}
