/**
 * Cab = กล่องใหญ่ (domain), Projects = โปรเจกต์ย่อยภายใน
 * เก็บที่ data/cability/ เป็นไฟล์ .md
 */

export type ProjectStatus = 'RED' | 'YELLOW' | 'GREEN';

export interface ProjectInCab {
  id: string;
  name: string;
  status?: ProjectStatus;
  /** ความกว้างของ Project card ภายใน Cab */
  cols?: 12 | 6 | 4 | 3;
}

export interface Cab {
  id: string;
  name: string;
  /** ความกว้างของ Cab บนหน้าจอ (จำนวน columns ที่กิน) */
  cols?: 12 | 6 | 4 | 3;
  projects: ProjectInCab[];
}

export interface CabilityLayout {
  cabOrder: string[];
  cabs: Record<string, Cab>;
}

const PROJECTS_HEADER = '## Projects';

function safeId(s: string): string {
  return s.replace(/[^a-zA-Z0-9-_]/g, '') || 'cab';
}

/** แปลง Cab เป็น markdown (ใช้ชื่อไฟล์ = cab.id) */
export function cabToMarkdown(cab: Cab): string {
  const lines: string[] = [];
  lines.push(`# ${(cab.name || '').trim() || 'Cab'}`);
  if (cab.cols && [12, 6, 4, 3].includes(cab.cols)) {
    lines.push(`Cols: ${cab.cols}`);
  }
  lines.push('');
  if (cab.projects.length > 0) {
    lines.push(PROJECTS_HEADER);
    for (const p of cab.projects) {
      const parts: string[] = [p.id, p.name];
      if (p.status) parts.push(p.status);
      if (p.cols && [12, 6, 4, 3].includes(p.cols)) {
        while (parts.length < 3) parts.push('');
        parts.push(String(p.cols));
      }
      const part = parts.join('|');
      lines.push(`- ${part}`);
    }
  }
  return lines.join('\n').trimEnd();
}

/** อ่าน markdown เป็น Cab (id มาจากชื่อไฟล์) */
export function markdownToCab(id: string, md: string): Cab {
  const lines = md.split(/\r?\n/).map((l) => l.trimEnd());
  let name = 'Cab';
  let cols: 12 | 6 | 4 | 3 | undefined;
  const projects: ProjectInCab[] = [];
  let inProjects = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const h1 = line.match(/^#\s+(.+)$/);
    const isProjectsHeader = line === PROJECTS_HEADER;
    const colsMatch = line.match(/^Cols:\s*(\d+)\s*$/);
    const bullet = line.match(/^-\s+(.+)$/);

    if (h1) {
      name = h1[1].trim();
      inProjects = false;
      continue;
    }
    if (colsMatch) {
      const n = Number(colsMatch[1]);
      if (n === 12 || n === 6 || n === 4 || n === 3) {
        cols = n;
      }
      continue;
    }
    if (isProjectsHeader) {
      inProjects = true;
      continue;
    }
    if (inProjects && bullet) {
      const raw = bullet[1].trim();
      const parts = raw.split('|').map((s) => s.trim());
      const projectId = parts[0] || '';
      const projectName = parts[1] ?? projectId;
      const status = parts[2] as ProjectStatus | undefined;
      const colsRaw = parts[3];
      let projCols: 12 | 6 | 4 | 3 | undefined;
      const n = Number(colsRaw);
      if (n === 12 || n === 6 || n === 4 || n === 3) projCols = n;
      if (projectId) {
        projects.push({
          id: projectId,
          name: projectName,
          status: status === 'RED' || status === 'YELLOW' || status === 'GREEN' ? status : undefined,
          cols: projCols,
        });
      }
    }
  }

  return { id: safeId(id), name, cols, projects };
}

/** อ่าน _order.md เป็นรายการ id ของ Cab (ตามลำดับ) */
export function orderMarkdownToCabIds(md: string): string[] {
  return md
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));
}

/** แปลง cabOrder เป็น _order.md */
export function cabIdsToOrderMarkdown(cabOrder: string[]): string {
  return cabOrder.filter(Boolean).join('\n');
}
