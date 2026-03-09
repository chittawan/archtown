import type { OrgTeam } from '../types';

/**
 * รูปแบบ Markdown ต่อ 1 ทีม (1 ไฟล์):
 * # ชื่อทีม
 * Owner: ชื่อ Owner
 * Parent: parent-slug
 *
 * ## Child Teams
 * - child-slug-1
 * - child-slug-2
 */

const CHILD_HEADER = '## Child Teams';

export function orgTeamToMarkdown(team: OrgTeam): string {
  const lines: string[] = [];
  lines.push(`# ${(team.name || '').trim() || 'Team'}`);
  lines.push(`Owner: ${(team.owner || '').trim() || '-'}`);
  if (team.parentId) {
    lines.push(`Parent: ${team.parentId}`);
  }
  lines.push('');
  if (team.childIds.length > 0) {
    lines.push(CHILD_HEADER);
    for (const cid of team.childIds) {
      lines.push(`- ${cid}`);
    }
  }
  return lines.join('\n').trimEnd();
}

export function markdownToOrgTeam(id: string, md: string): OrgTeam {
  const lines = md.split(/\r?\n/).map((l) => l.trimEnd());
  let name = 'Team';
  let owner = '';
  let parentId: string | null = null;
  const childIds: string[] = [];
  let inChildSection = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const h1 = line.match(/^#\s+(.+)$/);
    const ownerMatch = line.match(/^Owner:\s*(.*)$/);
    const parentMatch = line.match(/^Parent:\s*(.*)$/);
    const childHeader = line === CHILD_HEADER;
    const childItem = line.match(/^-\s+(.+)$/);

    if (h1) {
      name = h1[1].trim();
      inChildSection = false;
      continue;
    }
    if (ownerMatch) {
      owner = ownerMatch[1].trim();
      continue;
    }
    if (parentMatch) {
      const p = parentMatch[1].trim();
      parentId = p || null;
      continue;
    }
    if (childHeader) {
      inChildSection = true;
      continue;
    }
    if (inChildSection && childItem) {
      childIds.push(childItem[1].trim());
    }
  }

  return {
    id,
    name,
    owner,
    parentId: parentId || null,
    childIds,
  };
}

export function slugFromName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\p{L}\p{N}-]/gu, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'team';
}

export function ensureUniqueSlug(baseSlug: string, existingIds: string[]): string {
  const set = new Set(existingIds);
  if (!set.has(baseSlug)) return baseSlug;
  let n = 1;
  while (set.has(`${baseSlug}-${n}`)) n++;
  return `${baseSlug}-${n}`;
}
