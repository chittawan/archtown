import { useState } from 'react';
import { ChevronDown, ChevronRight, Key, Database, RefreshCw, Layers, Users, FolderKanban, Copy, ExternalLink, Link2, Check } from 'lucide-react';

type SectionId = 'auth' | 'sync' | 'projects' | 'teams' | 'capability' | 'models' | 'workflow';

function CodeBlock({ children, title }: { children: string; title?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(children).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-page)] overflow-hidden">
      {title && (
        <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--color-border)] bg-[var(--color-overlay)]">
          <span className="text-xs font-medium text-[var(--color-text-muted)]">{title}</span>
          <button onClick={copy} className="inline-flex items-center gap-1 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)]">
            <Copy className="w-3 h-3" />
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      )}
      <pre className="p-4 text-xs font-mono text-[var(--color-text)] overflow-x-auto whitespace-pre leading-relaxed">{children}</pre>
    </div>
  );
}

function Endpoint({ method, path, desc }: { method: 'GET' | 'POST' | 'PATCH'; path: string; desc: string }) {
  const color = method === 'GET' ? 'text-emerald-500' : method === 'PATCH' ? 'text-amber-600' : 'text-blue-500';
  const bg = method === 'GET' ? 'bg-emerald-500/10' : method === 'PATCH' ? 'bg-amber-500/10' : 'bg-blue-500/10';
  return (
    <div className="flex items-start gap-3 py-1">
      <span className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${color} ${bg}`}>{method}</span>
      <code className="text-xs font-mono text-[var(--color-text)]">{path}</code>
      <span className="text-xs text-[var(--color-text-muted)] ml-auto">{desc}</span>
    </div>
  );
}

function Section({ id, icon, title, children, expanded, onToggle }: {
  id: SectionId;
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
  expanded: boolean;
  onToggle: (id: SectionId) => void;
}) {
  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-card)] overflow-hidden">
      <button
        onClick={() => onToggle(id)}
        className="w-full flex items-center gap-3 p-5 text-left hover:bg-[var(--color-overlay)] transition-colors"
      >
        <span className="text-[var(--color-primary)]">{icon}</span>
        <span className="text-base font-semibold text-[var(--color-text)] flex-1">{title}</span>
        {expanded ? <ChevronDown className="w-4 h-4 text-[var(--color-text-muted)]" /> : <ChevronRight className="w-4 h-4 text-[var(--color-text-muted)]" />}
      </button>
      {expanded && <div className="px-5 pb-5 space-y-4 border-t border-[var(--color-border)]">{children}</div>}
    </div>
  );
}

function StatusBadge({ color, label }: { color: string; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold ${color}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
}

export default function AIContextPage() {
  const [expanded, setExpanded] = useState<Record<SectionId, boolean>>({
    auth: true,
    sync: true,
    projects: false,
    teams: false,
    capability: false,
    models: false,
    workflow: true,
  });

  const toggle = (id: SectionId) => setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  const expandAll = () => setExpanded({ auth: true, sync: true, projects: true, teams: true, capability: true, models: true, workflow: true });
  const collapseAll = () => setExpanded({ auth: false, sync: false, projects: false, teams: false, capability: false, models: false, workflow: false });

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';

  return (
    <div className="max-w-4xl mx-auto pb-16">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
            <Layers className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-[var(--color-text)]">Open Claw — AI Context</h1>
            <p className="text-sm text-[var(--color-text-muted)]">API Reference &amp; Learning Context for ArchTown</p>
          </div>
        </div>
        <p className="mt-3 text-sm text-[var(--color-text-muted)] leading-relaxed">
          เอกสารนี้สำหรับ AI Agent หรือ Developer ที่ต้องการ <strong className="text-[var(--color-text)]">เข้าถึงข้อมูล ArchTown อย่างรวดเร็ว</strong> —
          ครอบคลุม Token Login, Cloud Sync API, Data Models (Projects, Teams, Capability) และ Workflow การใช้งาน
        </p>
        <div className="mt-3 flex items-center gap-2">
          <button onClick={expandAll} className="text-xs px-3 py-1.5 rounded-lg border border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[var(--color-overlay)]">Expand All</button>
          <button onClick={collapseAll} className="text-xs px-3 py-1.5 rounded-lg border border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[var(--color-overlay)]">Collapse All</button>
        </div>
      </div>

      {/* Quick Reference */}
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-card)] p-5 mb-6">
        <h2 className="text-sm font-semibold text-[var(--color-text)] mb-3">Quick Reference — All Endpoints</h2>
        <div className="space-y-1.5">
          <Endpoint method="POST" path="/api/auth/token/generate" desc="Generate AI Login Token" />
          <Endpoint method="POST" path="/api/auth/token/login" desc="Login with Token" />
          <Endpoint method="GET" path="/api/sync/download" desc="Download backup" />
          <Endpoint method="POST" path="/api/sync/upload" desc="Upload backup" />
          <Endpoint method="GET" path="/api/sync/version" desc="Get backup meta" />
          <Endpoint method="PATCH" path="/api/sync/patch" desc="Patch backup (field-level ops)" />
          <Endpoint method="GET" path="/api/audit" desc="Audit log (date or table+id)" />
          <Endpoint method="POST" path="/api/audit/undo/:req_id" desc="Undo one PATCH by req_id" />
        </div>
        <p className="mt-3 text-[10px] text-[var(--color-text-muted)]">
          Base URL: <code className="px-1 py-0.5 rounded bg-[var(--color-overlay)]">{baseUrl || 'https://your-archtown-host'}</code>
        </p>
      </div>

      {/* Sections */}
      <div className="space-y-4">

        {/* 1. Auth / Token Login */}
        <Section id="auth" icon={<Key className="w-5 h-5" />} title="1. Authentication — Token Login" expanded={expanded.auth} onToggle={toggle}>
          <p className="text-sm text-[var(--color-text-muted)] pt-3">
            ArchTown รองรับ 2 วิธี Login: <strong className="text-[var(--color-text)]">Google OAuth</strong> และ <strong className="text-[var(--color-text)]">AI Login Token</strong> —
            สำหรับ AI Agent ใช้ Token เพื่อระบุตัวตนและเข้าถึง Cloud Sync
          </p>

          <div className="mt-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-overlay)] p-4">
            <h3 className="text-sm font-semibold text-[var(--color-text)] mb-2">Flow: Token Login</h3>
            <ol className="text-xs text-[var(--color-text-muted)] space-y-1 list-decimal list-inside">
              <li>Admin สร้าง Token ผ่าน <code className="px-1 py-0.5 rounded bg-[var(--color-page)]">POST /api/auth/token/generate</code> หรือหน้า <code className="px-1 py-0.5 rounded bg-[var(--color-page)]">/admin/generate-token</code></li>
              <li>AI Agent นำ Token ไป Login ผ่าน <code className="px-1 py-0.5 rounded bg-[var(--color-page)]">POST /api/auth/token/login</code></li>
              <li>ได้รับ <code className="px-1 py-0.5 rounded bg-[var(--color-page)]">googleId</code> กลับมาเพื่อใช้เป็น User ID สำหรับ Cloud Sync</li>
              <li>ใช้ <code className="px-1 py-0.5 rounded bg-[var(--color-page)]">X-Google-User-Id</code> header ในทุก Sync API call</li>
            </ol>
          </div>

          <h3 className="text-sm font-semibold text-[var(--color-text)] mt-4 mb-2">Generate Token</h3>
          <CodeBlock title="POST /api/auth/token/generate">{`// Request
{
  "googleId": "107508959445697114581",  // User ID (required)
  "expiresAt": "2026-12-31T23:59:59Z"  // ISO 8601 or null (no-expire)
}

// Headers (optional - only if server has ARCHTOWN_ADMIN_KEY)
X-Admin-Key: <your-admin-key>

// Response 200
{
  "ok": true,
  "token": "atkn_<base64url_random>",   // Show once — store securely
  "googleId": "107508959445697114581",
  "expiresAt": "2026-12-31T23:59:59.000Z"
}

// Error 401 — Admin key required
{ "ok": false, "error": "unauthorized" }`}</CodeBlock>

          <h3 className="text-sm font-semibold text-[var(--color-text)] mt-4 mb-2">Login with Token</h3>
          <CodeBlock title="POST /api/auth/token/login">{`// Request
{
  "token": "atkn_<base64url_random>"   // Token from generate step
}

// Response 200
{
  "ok": true,
  "googleId": "107508959445697114581", // Use this as User ID for sync
  "expiresAt": "2026-12-31T23:59:59.000Z"
}

// Error 401
{ "ok": false, "error": "invalid token" }
{ "ok": false, "error": "token expired" }`}</CodeBlock>

          <div className="mt-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
            <p className="text-xs text-amber-700 dark:text-amber-300">
              <strong>Security:</strong> Token ถูกเก็บเป็น SHA-256 hash บน server — ไม่สามารถ recover ได้ ต้องสร้างใหม่ถ้าหาย
            </p>
          </div>
        </Section>

        {/* 2. Cloud Sync */}
        <Section id="sync" icon={<RefreshCw className="w-5 h-5" />} title="2. Cloud Sync — Download / Upload Backup" expanded={expanded.sync} onToggle={toggle}>
          <p className="text-sm text-[var(--color-text-muted)] pt-3">
            Cloud Sync ใช้สำหรับ backup/restore ข้อมูลทั้งหมดจาก SQLite (browser) ไปยัง server — เก็บเป็น JSON file per user
          </p>

          <div className="mt-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-overlay)] p-4">
            <h3 className="text-sm font-semibold text-[var(--color-text)] mb-2">Architecture</h3>
            <ul className="text-xs text-[var(--color-text-muted)] space-y-1 list-disc list-inside">
              <li>Storage path: <code className="px-1 py-0.5 rounded bg-[var(--color-page)]">data/sync/&lt;userId&gt;/backup.json</code></li>
              <li>User ID มาจาก header <code className="px-1 py-0.5 rounded bg-[var(--color-page)]">X-Google-User-Id</code> หรือ query <code className="px-1 py-0.5 rounded bg-[var(--color-page)]">?userId=</code></li>
              <li>Fallback เป็น <code className="px-1 py-0.5 rounded bg-[var(--color-page)]">guest</code> ถ้าไม่ระบุ</li>
              <li>Version conflict detection: server เปรียบเทียบ <code className="px-1 py-0.5 rounded bg-[var(--color-page)]">version</code> — ถ้า client version ≤ server version จะ reject (409)</li>
              <li>รองรับ AES-GCM encryption (optional, client-side)</li>
            </ul>
          </div>

          <h3 className="text-sm font-semibold text-[var(--color-text)] mt-4 mb-2">Download Backup (ดึงข้อมูลจาก Cloud)</h3>
          <CodeBlock title="GET /api/sync/download">{`// Headers
X-Google-User-Id: 107508959445697114581

// หรือ Query
GET /api/sync/download?userId=107508959445697114581

// Response 200 (plain backup)
{
  "schema_version": 1,
  "version": 74,
  "updated_at": "2026-03-19T04:57:11.866Z",
  "tables": {
    "projects": [{ "id": "...", "name": "...", "description": "..." }],
    "project_teams": [{ "id": "...", "project_id": "...", "name": "...", "sort_order": 0 }],
    "project_topics": [...],
    "project_sub_topics": [...],
    "project_sub_topic_details": [...],
    "org_teams": [...],
    "org_team_children": [...],
    "capability_order": [...],
    "caps": [...],
    "cap_projects": [...]
  }
}

// Error 404
{ "error": "ยังไม่มีข้อมูลบน Cloud" }`}</CodeBlock>

          <h3 className="text-sm font-semibold text-[var(--color-text)] mt-4 mb-2">Upload Backup (อัปโหลดข้อมูลไป Cloud)</h3>
          <CodeBlock title="POST /api/sync/upload">{`// Headers
Content-Type: application/json
X-Google-User-Id: 107508959445697114581

// Request body
{
  "schema_version": 1,
  "version": 75,                        // Must be > server version
  "updated_at": "2026-03-19T10:00:00Z",
  "tables": {
    "projects": [...],
    "project_teams": [...],
    "project_topics": [...],
    "project_sub_topics": [...],
    "project_sub_topic_details": [...],
    "org_teams": [...],
    "org_team_children": [...],
    "capability_order": [...],
    "caps": [...],
    "cap_projects": [...]
  }
}

// Response 200
{ "ok": true }

// Error 409 — Conflict (cloud has newer data)
{
  "ok": false,
  "error": "Cloud มีข้อมูลใหม่กว่า",
  "conflict": true,
  "remoteVersion": 74,
  "remoteUpdatedAt": "2026-03-19T04:57:11.866Z"
}

// Force upload (ignore version conflict)
POST /api/sync/upload?force=1`}</CodeBlock>

          <div className="mt-3 rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-3">
            <h4 className="text-xs font-semibold text-indigo-700 dark:text-indigo-300 mb-1">Version Check Flow (Architect Check)</h4>
            <ol className="text-xs text-indigo-600 dark:text-indigo-400 space-y-0.5 list-decimal list-inside">
              <li><code className="px-1 rounded bg-indigo-500/10">GET /api/sync/download</code> — ดึง backup ปัจจุบัน ดู <code>version</code> และ <code>updated_at</code></li>
              <li>เปรียบเทียบ version กับ local — ถ้า remote version &gt; local แสดงว่ามี update ใหม่</li>
              <li>ถ้าต้อง upload → ตั้ง version = remote version + 1</li>
              <li>ถ้า 409 conflict → ใช้ <code>?force=1</code> เพื่อ overwrite (ระวัง data loss)</li>
            </ol>
          </div>
        </Section>

        {/* 3. Projects Data */}
        <Section id="projects" icon={<FolderKanban className="w-5 h-5" />} title="3. Projects — Data Structure" expanded={expanded.projects} onToggle={toggle}>
          <p className="text-sm text-[var(--color-text-muted)] pt-3">
            ข้อมูล Project เก็บใน SQLite (browser) — sync ผ่าน Cloud Sync API เป็น JSON tables
          </p>

          <h3 className="text-sm font-semibold text-[var(--color-text)] mt-3 mb-2">Table Hierarchy</h3>
          <CodeBlock title="Project Table Relationships">{`projects
  └─ project_teams        (1:N)  — ทีมใน Project
       └─ project_topics   (1:N)  — หัวข้อของทีม
            └─ project_sub_topics  (1:N)  — หัวข้อย่อย (มี status: RED/YELLOW/GREEN)
                 └─ project_sub_topic_details (1:N) — รายละเอียด/Todo items`}</CodeBlock>

          <h3 className="text-sm font-semibold text-[var(--color-text)] mt-4 mb-2">Schema</h3>
          <CodeBlock title="SQL Schema">{`CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT
);

CREATE TABLE project_teams (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE project_topics (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES project_teams(id),
  title TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE project_sub_topics (
  id TEXT PRIMARY KEY,
  topic_id TEXT NOT NULL REFERENCES project_topics(id),
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'GREEN'
    CHECK (status IN ('GREEN','YELLOW','RED')),
  sub_topic_type TEXT DEFAULT 'todos'
    CHECK (sub_topic_type IN ('todos','status')),
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE project_sub_topic_details (
  id TEXT PRIMARY KEY,
  sub_topic_id TEXT NOT NULL REFERENCES project_sub_topics(id),
  text TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'todo'
    CHECK (status IN ('todo','doing','done')),
  due_date TEXT,           -- ISO YYYY-MM-DD
  sort_order INTEGER NOT NULL DEFAULT 0
);`}</CodeBlock>

          <h3 className="text-sm font-semibold text-[var(--color-text)] mt-4 mb-2">Status Values</h3>
          <div className="flex flex-wrap gap-3">
            <StatusBadge color="text-emerald-600 bg-emerald-500/10" label="GREEN — Normal" />
            <StatusBadge color="text-amber-600 bg-amber-500/10" label="YELLOW — Manageable" />
            <StatusBadge color="text-red-600 bg-red-500/10" label="RED — Critical" />
          </div>
          <div className="flex flex-wrap gap-3 mt-2">
            <StatusBadge color="text-slate-500 bg-slate-500/10" label="todo" />
            <StatusBadge color="text-blue-500 bg-blue-500/10" label="doing" />
            <StatusBadge color="text-emerald-500 bg-emerald-500/10" label="done" />
          </div>

          <h3 className="text-sm font-semibold text-[var(--color-text)] mt-4 mb-2">JSON Example (from sync payload)</h3>
          <CodeBlock title="projects table row">{`{
  "id": "performance_management",
  "name": "Performance Management [ Target 31/03/2026 ]",
  "description": "การดำเนินการจะอาศัยการ สื่อสารข้ามทีม..."
}`}</CodeBlock>
          <CodeBlock title="project_sub_topic_details row">{`{
  "id": "d-1773890009061-dgnaaem",
  "sub_topic_id": "sub-1773575363081-vf1uxbr",
  "text": "[13:00 - 13:30] Update Summary Project [PM/PO]",
  "description": "update สถานะงานเบื้องต้น",
  "status": "todo",
  "due_date": "2026-03-19",
  "sort_order": 0
}`}</CodeBlock>
        </Section>

        {/* 4. Teams */}
        <Section id="teams" icon={<Users className="w-5 h-5" />} title="4. Org Teams — Data Structure" expanded={expanded.teams} onToggle={toggle}>
          <p className="text-sm text-[var(--color-text-muted)] pt-3">
            Org Teams คือโครงสร้างทีมองค์กร แยกจาก Project Teams — มี Parent/Child hierarchy
          </p>

          <CodeBlock title="SQL Schema">{`CREATE TABLE org_teams (
  id TEXT PRIMARY KEY,      -- slug e.g. "solution_dev"
  name TEXT NOT NULL,       -- "SolutionDev"
  owner TEXT NOT NULL DEFAULT '',
  parent_id TEXT REFERENCES org_teams(id)
);

CREATE TABLE org_team_children (
  parent_id TEXT NOT NULL REFERENCES org_teams(id),
  child_id TEXT NOT NULL REFERENCES org_teams(id),
  sort_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (parent_id, child_id)
);`}</CodeBlock>

          <h3 className="text-sm font-semibold text-[var(--color-text)] mt-4 mb-2">TypeScript Interface</h3>
          <CodeBlock title="OrgTeam">{`interface OrgTeam {
  id: string;        // slug (e.g. "solution_dev")
  name: string;      // display name
  owner: string;     // team owner
  parentId: string | null;
  childIds: string[];
}`}</CodeBlock>

          <h3 className="text-sm font-semibold text-[var(--color-text)] mt-4 mb-2">JSON Example</h3>
          <CodeBlock title="org_teams row">{`{
  "id": "solution_dev",
  "name": "SolutionDev",
  "owner": "พี่ Art",
  "parent_id": null
}
// Children: otc, ftd, hc, f_a, ptp, oth`}</CodeBlock>
        </Section>

        {/* 5. Capability */}
        <Section id="capability" icon={<Layers className="w-5 h-5" />} title="5. Capability — Data Structure" expanded={expanded.capability} onToggle={toggle}>
          <p className="text-sm text-[var(--color-text-muted)] pt-3">
            Capability (TownStation) คือ Grid view ที่จัดกลุ่ม Projects ตาม Capability — ใช้สำหรับ Dashboard overview
          </p>

          <CodeBlock title="SQL Schema">{`CREATE TABLE capability_order (
  sort_order INTEGER NOT NULL PRIMARY KEY,
  cap_id TEXT NOT NULL
);

CREATE TABLE caps (
  id TEXT PRIMARY KEY,           -- e.g. "business_management"
  name TEXT NOT NULL,            -- display name
  cols INTEGER CHECK (cols IN (12,6,4,3)),  -- grid columns
  rows INTEGER                   -- grid rows
);

CREATE TABLE cap_projects (
  cap_id TEXT NOT NULL REFERENCES caps(id),
  project_id TEXT NOT NULL REFERENCES projects(id),
  status TEXT CHECK (status IN ('RED','YELLOW','GREEN')),
  cols INTEGER CHECK (cols IN (12,6,4,3)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (cap_id, project_id)
);`}</CodeBlock>

          <h3 className="text-sm font-semibold text-[var(--color-text)] mt-4 mb-2">TypeScript Interfaces</h3>
          <CodeBlock title="Cap & CapabilityLayout">{`interface Cap {
  id: string;
  name: string;
  cols?: 12 | 6 | 4 | 3;
  rows?: number;
  projects: ProjectInCap[];
}

interface ProjectInCap {
  id: string;
  name?: string;
  status?: 'RED' | 'YELLOW' | 'GREEN';
  cols?: 12 | 6 | 4 | 3;
}

interface CapabilityLayout {
  capOrder: string[];          // ordered cap IDs
  caps: Record<string, Cap>;  // cap details by ID
}`}</CodeBlock>

          <h3 className="text-sm font-semibold text-[var(--color-text)] mt-4 mb-2">JSON Example</h3>
          <CodeBlock title="caps row">{`{
  "id": "business_management",
  "name": "Business Management",
  "cols": 12,
  "rows": 5
}`}</CodeBlock>
        </Section>

        {/* 6. Data Models Summary */}
        <Section id="models" icon={<Database className="w-5 h-5" />} title="6. Sync Payload — Full Data Model" expanded={expanded.models} onToggle={toggle}>
          <p className="text-sm text-[var(--color-text-muted)] pt-3">
            Sync payload คือ export ทุก table จาก SQLite — ใช้ทั้ง upload/download
          </p>

          <CodeBlock title="SyncExportPayload">{`interface SyncExportPayload {
  schema_version: number;  // currently 1
  version?: number;        // monotonic, for conflict detection
  updated_at?: string;     // ISO 8601
  tables: {
    projects:                 ProjectRow[];
    project_teams:            ProjectTeamRow[];
    project_topics:           ProjectTopicRow[];
    project_sub_topics:       ProjectSubTopicRow[];
    project_sub_topic_details: ProjectSubTopicDetailRow[];
    org_teams:                OrgTeamRow[];
    org_team_children:        OrgTeamChildRow[];
    capability_order:         CapabilityOrderRow[];
    caps:                     CapRow[];
    cap_projects:             CapProjectRow[];
  }
}`}</CodeBlock>

          <h3 className="text-sm font-semibold text-[var(--color-text)] mt-4 mb-2">Sync Table Export Order</h3>
          <CodeBlock title="SYNC_TABLES_EXPORT_ORDER">{`[
  "projects",
  "project_teams",
  "project_topics",
  "project_sub_topics",
  "project_sub_topic_details",
  "org_teams",
  "org_team_children",
  "capability_order",
  "caps",
  "cap_projects"
]`}</CodeBlock>

          <div className="mt-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-overlay)] p-4">
            <h4 className="text-xs font-semibold text-[var(--color-text)] mb-2">Encrypted Payload (optional)</h4>
            <p className="text-xs text-[var(--color-text-muted)]">
              ถ้า user ตั้งรหัสผ่าน backup จะเข้ารหัสด้วย AES-GCM (client-side) — server เก็บแค่ ciphertext
            </p>
            <CodeBlock title="EncryptedPayload">{`{
  "version": 74,
  "updated_at": "2026-03-19T04:57:11.866Z",
  "enc": "<base64 ciphertext>",
  "iv": "<base64 IV>",
  "salt": "<base64 salt>"
}`}</CodeBlock>
          </div>
        </Section>

        {/* 7. Workflow */}
        <Section id="workflow" icon={<ExternalLink className="w-5 h-5" />} title="7. Workflow — Quick Start for AI Agent" expanded={expanded.workflow} onToggle={toggle}>
          <div className="pt-3 space-y-4">
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-overlay)] p-4">
              <h3 className="text-sm font-semibold text-[var(--color-text)] mb-2">Step 1: Login &amp; Get User ID</h3>
              <CodeBlock title="curl">{`# Login with token
curl -X POST ${baseUrl || 'https://your-host'}/api/auth/token/login \\
  -H "Content-Type: application/json" \\
  -d '{"token": "atkn_YOUR_TOKEN_HERE"}'

# Response: { "ok": true, "googleId": "YOUR_USER_ID" }`}</CodeBlock>
            </div>

            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-overlay)] p-4">
              <h3 className="text-sm font-semibold text-[var(--color-text)] mb-2">Step 2: Check Sync Version (Architect Check)</h3>
              <CodeBlock title="curl">{`# Download current backup to check version
curl -X GET ${baseUrl || 'https://your-host'}/api/sync/download \\
  -H "X-Google-User-Id: YOUR_USER_ID" \\
  | jq '{version, updated_at}'

# Output: { "version": 74, "updated_at": "2026-03-19T04:57:11.866Z" }`}</CodeBlock>
            </div>

            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-overlay)] p-4">
              <h3 className="text-sm font-semibold text-[var(--color-text)] mb-2">Step 3: Read Project Summary</h3>
              <CodeBlock title="curl + jq">{`# Get all projects with names
curl -s ${baseUrl || 'https://your-host'}/api/sync/download \\
  -H "X-Google-User-Id: YOUR_USER_ID" \\
  | jq '.tables.projects[] | {id, name, description}'

# Get todo items that are not done
curl -s ${baseUrl || 'https://your-host'}/api/sync/download \\
  -H "X-Google-User-Id: YOUR_USER_ID" \\
  | jq '[.tables.project_sub_topic_details[]
         | select(.status != "done")
         | {text, status, due_date}]'

# Get critical/warning sub-topics
curl -s ${baseUrl || 'https://your-host'}/api/sync/download \\
  -H "X-Google-User-Id: YOUR_USER_ID" \\
  | jq '[.tables.project_sub_topics[]
         | select(.status == "RED" or .status == "YELLOW")
         | {title, status}]'`}</CodeBlock>
            </div>

            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-overlay)] p-4">
              <h3 className="text-sm font-semibold text-[var(--color-text)] mb-2">Step 4: Update &amp; Upload</h3>
              <CodeBlock title="Workflow">{`# 1. Download existing backup
BACKUP=$(curl -s ${baseUrl || 'https://your-host'}/api/sync/download \\
  -H "X-Google-User-Id: YOUR_USER_ID")

# 2. Modify data (update tables in JSON)
#    - Increment version
#    - Update updated_at to current ISO time

# 3. Upload modified backup
curl -X POST ${baseUrl || 'https://your-host'}/api/sync/upload \\
  -H "Content-Type: application/json" \\
  -H "X-Google-User-Id: YOUR_USER_ID" \\
  -d "$MODIFIED_BACKUP"

# If conflict (409): use ?force=1 to overwrite
curl -X POST "${baseUrl || 'https://your-host'}/api/sync/upload?force=1" \\
  -H "Content-Type: application/json" \\
  -H "X-Google-User-Id: YOUR_USER_ID" \\
  -d "$MODIFIED_BACKUP"`}</CodeBlock>
            </div>

            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
              <h3 className="text-sm font-semibold text-emerald-700 dark:text-emerald-300 mb-2">Summary: Learning Context Checklist</h3>
              <ul className="text-xs text-emerald-600 dark:text-emerald-400 space-y-1">
                <li className="flex items-start gap-2"><span className="shrink-0">1.</span> <strong>Login</strong> — ใช้ Token login เพื่อได้ User ID</li>
                <li className="flex items-start gap-2"><span className="shrink-0">2.</span> <strong>Check Version</strong> — Download backup ดู version/updated_at ก่อน</li>
                <li className="flex items-start gap-2"><span className="shrink-0">3.</span> <strong>Read Projects</strong> — Parse tables.projects + related tables เพื่อดู summary</li>
                <li className="flex items-start gap-2"><span className="shrink-0">4.</span> <strong>Read Teams</strong> — Parse tables.org_teams + org_team_children เพื่อดูโครงสร้างทีม</li>
                <li className="flex items-start gap-2"><span className="shrink-0">5.</span> <strong>Read Capability</strong> — Parse caps + cap_projects + capability_order เพื่อดู Dashboard</li>
                <li className="flex items-start gap-2"><span className="shrink-0">6.</span> <strong>Read Tasks</strong> — Parse project_sub_topic_details ดู todo/doing/done + due_date</li>
                <li className="flex items-start gap-2"><span className="shrink-0">7.</span> <strong>Modify &amp; Upload</strong> — แก้ไขข้อมูล, increment version, upload กลับ</li>
              </ul>
            </div>
          </div>
        </Section>
      </div>

      {/* Share to AI */}
      <ShareToAI baseUrl={baseUrl} />

      {/* Footer */}
      <div className="mt-8 text-center">
        <p className="text-xs text-[var(--color-text-muted)]">
          ArchTown — Open Claw AI Context v1 · Built with SQLite WASM + React + Express
        </p>
      </div>
    </div>
  );
}

function ShareToAI({ baseUrl }: { baseUrl: string }) {
  const mdUrl = `${baseUrl}/api/ai/context`;
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(mdUrl).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="mt-8 rounded-2xl border-2 border-dashed border-[var(--color-primary)]/30 bg-gradient-to-br from-[var(--color-primary)]/5 to-transparent p-6">
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 rounded-xl bg-[var(--color-primary)]/10 flex items-center justify-center shrink-0">
          <Link2 className="w-5 h-5 text-[var(--color-primary)]" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-semibold text-[var(--color-text)]">Share to AI — Plain Markdown Link</h3>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            ส่งลิงก์นี้ให้ AI Agent (เช่น OpenClaw, ChatGPT, Claude) — AI จะอ่านเอกสาร API ได้ทันทีเป็น Markdown ไม่ต้อง render JavaScript
          </p>

          <div className="mt-3 flex items-center gap-2">
            <div className="flex-1 min-w-0 rounded-xl border border-[var(--color-border)] bg-[var(--color-page)] px-4 py-2.5">
              <code className="text-xs font-mono text-[var(--color-text)] break-all">{mdUrl}</code>
            </div>
            <button
              onClick={copy}
              className="shrink-0 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--color-primary)] text-white text-sm font-medium hover:bg-[var(--color-primary-hover)] transition-colors"
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>

          <div className="mt-3 flex items-center gap-4">
            <a
              href={mdUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--color-primary)] hover:underline"
            >
              <ExternalLink className="w-3 h-3" />
              Preview Markdown
            </a>
          </div>

          <div className="mt-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-overlay)] p-3">
            <p className="text-xs font-semibold text-[var(--color-text)] mb-1.5">How to use</p>
            <ul className="text-xs text-[var(--color-text-muted)] space-y-1">
              <li>1. Copy ลิงก์ด้านบน</li>
              <li>2. วางให้ AI Agent — AI จะ fetch URL และได้เอกสาร Markdown ครบ</li>
              <li>3. AI สามารถเรียนรู้ API spec, data models, workflow ได้ทันที</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
