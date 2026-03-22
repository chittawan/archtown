import { useState } from 'react';
import { ChevronDown, ChevronRight, Key, Database, RefreshCw, Layers, Users, FolderKanban, Copy, ExternalLink, Link2, Check, LayoutTemplate } from 'lucide-react';

type SectionId = 'auth' | 'sync' | 'projects' | 'teams' | 'capability' | 'browserUi' | 'models' | 'workflow';

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

const ALL_EXPANDED: Record<SectionId, boolean> = {
  auth: true,
  sync: true,
  projects: true,
  teams: true,
  capability: true,
  browserUi: true,
  models: true,
  workflow: true,
};

const ALL_COLLAPSED: Record<SectionId, boolean> = {
  auth: false,
  sync: false,
  projects: false,
  teams: false,
  capability: false,
  browserUi: false,
  models: false,
  workflow: false,
};

export default function AIContextPage() {
  const [expanded, setExpanded] = useState<Record<SectionId, boolean>>({
    auth: true,
    sync: true,
    projects: false,
    teams: false,
    capability: false,
    browserUi: false,
    models: false,
    workflow: true,
  });

  const toggle = (id: SectionId) => setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  const expandAll = () => setExpanded({ ...ALL_EXPANDED });
  const collapseAll = () => setExpanded({ ...ALL_COLLAPSED });

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const host = baseUrl || 'https://your-archtown-host';

  return (
    <div className="max-w-4xl mx-auto pb-16">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
            <Layers className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-[var(--color-text)]">ArchTown — AI &amp; API Context</h1>
            <p className="text-sm text-[var(--color-text-muted)]">API reference and learning context (mirrors <code className="text-xs px-1 rounded bg-[var(--color-overlay)]">GET /api/ai/context</code>)</p>
          </div>
        </div>
        <p className="mt-3 text-sm text-[var(--color-text-muted)] leading-relaxed">
          For <strong className="text-[var(--color-text)]">AI agents and developers</strong>: ArchTown is a React + SQLite (WASM) app; the server stores per-user JSON at{' '}
          <code className="text-xs px-1 rounded bg-[var(--color-overlay)]">data/sync/&lt;userId&gt;/backup.json</code>. Use the HTTP APIs below — not the browser DB — for reliable reads/writes.
          Prefer <code className="text-xs px-1 rounded bg-[var(--color-overlay)]">GET /api/sync/version</code> and <code className="text-xs px-1 rounded bg-[var(--color-overlay)]">PATCH /api/sync/patch</code> for small changes; use full upload for bulk replace or recovery.
        </p>
        <p className="mt-2 text-xs text-[var(--color-text-muted)]">
          Some JSON <code className="px-0.5 rounded bg-[var(--color-overlay)]">error</code> strings are still <strong>Thai</strong> in the API (e.g. no backup yet, upload conflict). The Markdown context documents what they mean.
        </p>
        <div className="mt-3 flex items-center gap-2">
          <button onClick={expandAll} className="text-xs px-3 py-1.5 rounded-lg border border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[var(--color-overlay)]">Expand all</button>
          <button onClick={collapseAll} className="text-xs px-3 py-1.5 rounded-lg border border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[var(--color-overlay)]">Collapse all</button>
        </div>
      </div>

      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-card)] p-5 mb-6">
        <h2 className="text-sm font-semibold text-[var(--color-text)] mb-3">Quick reference — HTTP endpoints</h2>
        <div className="space-y-1.5">
          <Endpoint method="POST" path="/api/auth/token/generate" desc="Issue an AI login token (admin)" />
          <Endpoint method="POST" path="/api/auth/token/login" desc="Exchange token → googleId" />
          <Endpoint method="GET" path="/api/sync/version" desc="Backup metadata: version, updated_at" />
          <Endpoint method="GET" path="/api/sync/download" desc="Full backup JSON" />
          <Endpoint method="POST" path="/api/sync/upload" desc="Full backup upload (?force=1 optional)" />
          <Endpoint method="PATCH" path="/api/sync/patch" desc="Row/field ops (max 100 per request)" />
          <Endpoint method="GET" path="/api/audit" desc="Audit log (date or table+id)" />
          <Endpoint method="POST" path="/api/audit/undo/:req_id" desc="Undo one PATCH request" />
          <Endpoint method="GET" path="/api/ai/context" desc="This document as Markdown" />
        </div>
        <p className="mt-3 text-[10px] text-[var(--color-text-muted)]">
          Base URL: <code className="px-1 py-0.5 rounded bg-[var(--color-overlay)]">{baseUrl || 'https://your-archtown-host'}</code>
        </p>
      </div>

      <div className="space-y-4">

        <Section id="auth" icon={<Key className="w-5 h-5" />} title="1. Authentication" expanded={expanded.auth} onToggle={toggle}>
          <p className="text-sm text-[var(--color-text-muted)] pt-3">
            <strong className="text-[var(--color-text)]">Google OAuth</strong> (browser) and <strong className="text-[var(--color-text)]">AI login tokens</strong> (API). For agents: token login → <code className="px-1 py-0.5 rounded bg-[var(--color-page)]">googleId</code> → send{' '}
            <code className="px-1 py-0.5 rounded bg-[var(--color-page)]">X-Google-User-Id</code> on every sync call. Optional: <code className="px-1 py-0.5 rounded bg-[var(--color-page)]">Authorization: Bearer &lt;token&gt;</code> for scope and rate limits.
          </p>

          <div className="mt-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-overlay)] p-4">
            <h3 className="text-sm font-semibold text-[var(--color-text)] mb-2">Token login flow</h3>
            <ol className="text-xs text-[var(--color-text-muted)] space-y-1 list-decimal list-inside">
              <li>Admin creates a token via <code className="px-1 py-0.5 rounded bg-[var(--color-page)]">POST /api/auth/token/generate</code> or <code className="px-1 py-0.5 rounded bg-[var(--color-page)]">/admin/generate-token</code></li>
              <li>Agent calls <code className="px-1 py-0.5 rounded bg-[var(--color-page)]">POST /api/auth/token/login</code> with the token</li>
              <li>Response includes <code className="px-1 py-0.5 rounded bg-[var(--color-page)]">googleId</code> — use as user id for sync</li>
              <li>Send <code className="px-1 py-0.5 rounded bg-[var(--color-page)]">X-Google-User-Id</code> on all sync requests</li>
            </ol>
          </div>

          <h3 className="text-sm font-semibold text-[var(--color-text)] mt-4 mb-2">Generate token</h3>
          <CodeBlock title="POST /api/auth/token/generate">{`// Request
{
  "googleId": "107508…4581",
  "expiresAt": "2026-12-31T23:59:59Z",
  "scope": "read"   // optional: "read" | "write" (default write)
}

// When ARCHTOWN_ADMIN_KEY is set:
X-Admin-Key: <your-admin-key>

// 200
{
  "ok": true,
  "token": "atkn_...",
  "googleId": "107508…4581",
  "expiresAt": "2026-12-31T23:59:59.000Z"
}

// 401
{ "ok": false, "error": "unauthorized" }`}</CodeBlock>

          <h3 className="text-sm font-semibold text-[var(--color-text)] mt-4 mb-2">Login with token</h3>
          <CodeBlock title="POST /api/auth/token/login">{`{ "token": "atkn_..." }

// 200
{ "ok": true, "googleId": "...", "expiresAt": "..." }

// 401 — invalid or expired`}</CodeBlock>

          <div className="mt-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
            <p className="text-xs text-amber-700 dark:text-amber-300">
              <strong>Security:</strong> Tokens are stored as SHA-256 hashes on the server — they cannot be recovered; issue a new token if lost.
            </p>
          </div>
        </Section>

        <Section id="sync" icon={<RefreshCw className="w-5 h-5" />} title="2. Cloud sync" expanded={expanded.sync} onToggle={toggle}>
          <p className="text-sm text-[var(--color-text-muted)] pt-3">
            Backup/restore for all SQLite tables as one JSON file per user under <code className="px-1 py-0.5 rounded bg-[var(--color-page)]">data/sync/&lt;userId&gt;/backup.json</code>.
          </p>

          <div className="mt-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-overlay)] p-4">
            <h3 className="text-sm font-semibold text-[var(--color-text)] mb-2">Behavior</h3>
            <ul className="text-xs text-[var(--color-text-muted)] space-y-1 list-disc list-inside">
              <li>User id: header <code className="px-1 py-0.5 rounded bg-[var(--color-page)]">X-Google-User-Id</code> or query <code className="px-1 py-0.5 rounded bg-[var(--color-page)]">?userId=</code></li>
              <li>Fallback user id: <code className="px-1 py-0.5 rounded bg-[var(--color-page)]">guest</code> if omitted</li>
              <li>Upload: client <code className="px-1 py-0.5 rounded bg-[var(--color-page)]">version</code> must be <strong>greater</strong> than server or you get <strong>409</strong></li>
              <li>Optional client-side AES-GCM encryption (server stores ciphertext)</li>
            </ul>
          </div>

          <h3 className="text-sm font-semibold text-[var(--color-text)] mt-4 mb-2">GET /api/sync/version</h3>
          <CodeBlock title="GET /api/sync/version">{`X-Google-User-Id: YOUR_USER_ID
Authorization: Bearer <token>   # optional; recommended

// 200
{ "version": 74, "updated_at": "2026-03-19T04:57:11.866Z" }

// 404 — no backup yet (Thai error string possible)`}</CodeBlock>

          <h3 className="text-sm font-semibold text-[var(--color-text)] mt-4 mb-2">GET /api/sync/download</h3>
          <CodeBlock title="GET /api/sync/download">{`X-Google-User-Id: 107508…4581

// or
GET /api/sync/download?userId=107508…4581

// 200 — schema_version, version, updated_at, tables (10 keys)
// 404
{ "error": "ยังไม่มีข้อมูลบน Cloud" }  // = no cloud backup yet`}</CodeBlock>

          <h3 className="text-sm font-semibold text-[var(--color-text)] mt-4 mb-2">POST /api/sync/upload</h3>
          <CodeBlock title="POST /api/sync/upload">{`Content-Type: application/json
X-Google-User-Id: YOUR_USER_ID

{
  "schema_version": 1,
  "version": 75,
  "updated_at": "2026-03-19T10:00:00.000Z",
  "tables": { ... }
}

// 200 { "ok": true }
// 409 — server newer (Thai error possible) + conflict, remoteVersion, remoteUpdatedAt
// Force: POST /api/sync/upload?force=1`}</CodeBlock>

          <h3 className="text-sm font-semibold text-[var(--color-text)] mt-4 mb-2">PATCH /api/sync/patch</h3>
          <p className="text-xs text-[var(--color-text-muted)]">
            Up to <strong>100</strong> ops per request, atomic. Server bumps <code className="px-0.5 rounded bg-[var(--color-overlay)]">version</code> only if <code className="px-0.5 rounded bg-[var(--color-overlay)]">applied &gt; 0</code>.{' '}
            <strong>409</strong> if <code className="px-0.5 rounded bg-[var(--color-overlay)]">base_version</code> &lt; server — refresh version and retry.
          </p>
          <CodeBlock title="PATCH body shape">{`{
  "base_version": 74,
  "ops": [ ... ]
}

// update — per-field field_updated_at (ISO) required
{
  "op": "update",
  "table": "project_sub_topic_details",
  "id": "detail-row-id",
  "fields": { "status": "done" },
  "field_updated_at": { "status": "2026-03-20T10:00:00.000Z" }
}

// insert — normal tables need row.id; composite tables omit row.id
{ "op": "insert", "table": "org_team_children",
  "row": { "parent_id": "team-a", "child_id": "team-b", "sort_order": 0 } }

// delete by id
{ "op": "delete", "table": "projects", "id": "project-id" }

// delete by composite_id
{
  "op": "delete",
  "table": "org_team_children",
  "composite_id": { "parent_id": "team-1", "child_id": "team-2" }
}

// 200
{ "ok": true, "version": 75, "applied": 2, "rejected": [{ "index": 0, "error": "..." }] }

// Allowed tables: projects, project_teams, project_topics, project_sub_topics,
// project_sub_topic_details, org_teams, org_team_children, capability_order, caps, cap_projects`}</CodeBlock>

          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-overlay)] p-4">
            <h4 className="text-xs font-semibold text-[var(--color-text)] mb-2">Audit &amp; undo (PATCH)</h4>
            <p className="text-xs text-[var(--color-text-muted)] mb-2">
              Logs: <code className="px-1 rounded bg-[var(--color-page)]">data/audit/&lt;userId&gt;/&lt;YYYY-MM-DD&gt;.jsonl</code>. All ops in one PATCH share the same <code className="px-1 rounded bg-[var(--color-page)]">req_id</code>.
            </p>
            <CodeBlock title="Audit / undo">{`GET ${host}/api/audit?date=2026-03-21
GET ${host}/api/audit?table=project_sub_topic_details&id=<rowId>

POST ${host}/api/audit/undo/<req_id>
X-Google-User-Id: YOUR_USER_ID
Authorization: Bearer <token>`}</CodeBlock>
          </div>

          <div className="mt-3 rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-3">
            <h4 className="text-xs font-semibold text-indigo-700 dark:text-indigo-300 mb-1">Full upload — version workflow</h4>
            <ol className="text-xs text-indigo-600 dark:text-indigo-400 space-y-0.5 list-decimal list-inside">
              <li><code className="px-1 rounded bg-indigo-500/10">GET /api/sync/version</code> (or download) → read server <code>version</code></li>
              <li>To upload successfully, send <code>version &gt; serverVersion</code></li>
              <li>On <strong>409</strong>: merge from download, bump version, or use <code>?force=1</code> (data loss risk)</li>
            </ol>
          </div>
        </Section>

        <Section id="projects" icon={<FolderKanban className="w-5 h-5" />} title="3. Projects — data structure" expanded={expanded.projects} onToggle={toggle}>
          <p className="text-sm text-[var(--color-text-muted)] pt-3">
            Live data is in the browser SQLite DB; sync exposes the same rows as JSON <code className="px-1 rounded bg-[var(--color-page)]">tables.*</code>.
          </p>

          <h3 className="text-sm font-semibold text-[var(--color-text)] mt-3 mb-2">Hierarchy</h3>
          <CodeBlock title="Project tree">{`projects
  └── project_teams
        └── project_topics
              └── project_sub_topics   (RAG: GREEN / YELLOW / RED)
                    └── project_sub_topic_details   (todo / doing / done + due_date)`}</CodeBlock>

          <h3 className="text-sm font-semibold text-[var(--color-text)] mt-4 mb-2">SQLite schema (reference)</h3>
          <CodeBlock title="SQL">{`CREATE TABLE projects (
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
  due_date TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);`}</CodeBlock>

          <h3 className="text-sm font-semibold text-[var(--color-text)] mt-4 mb-2">Status values</h3>
          <div className="flex flex-wrap gap-3">
            <StatusBadge color="text-emerald-600 bg-emerald-500/10" label="GREEN — normal" />
            <StatusBadge color="text-amber-600 bg-amber-500/10" label="YELLOW — manageable" />
            <StatusBadge color="text-red-600 bg-red-500/10" label="RED — critical" />
          </div>
          <div className="flex flex-wrap gap-3 mt-2">
            <StatusBadge color="text-slate-500 bg-slate-500/10" label="todo" />
            <StatusBadge color="text-blue-500 bg-blue-500/10" label="doing" />
            <StatusBadge color="text-emerald-500 bg-emerald-500/10" label="done" />
          </div>

          <h3 className="text-sm font-semibold text-[var(--color-text)] mt-4 mb-2">JSON examples (sync payload)</h3>
          <CodeBlock title="projects row">{`{
  "id": "performance_management",
  "name": "Performance Management [ Target 31/03/2026 ]",
  "description": "Cross-team coordination for performance goals..."
}`}</CodeBlock>
          <CodeBlock title="project_sub_topic_details row">{`{
  "id": "d-1773890009061-dgnaaem",
  "sub_topic_id": "sub-1773575363081-vf1uxbr",
  "text": "[13:00 - 13:30] Update summary [PM/PO]",
  "description": "Initial status update",
  "status": "todo",
  "due_date": "2026-03-19",
  "sort_order": 0
}`}</CodeBlock>
        </Section>

        <Section id="teams" icon={<Users className="w-5 h-5" />} title="4. Org teams" expanded={expanded.teams} onToggle={toggle}>
          <p className="text-sm text-[var(--color-text-muted)] pt-3">
            Organization tree, separate from project teams. Parent/child edges live in <code className="px-1 rounded bg-[var(--color-page)]">org_team_children</code> (composite key: <code className="px-1 rounded bg-[var(--color-page)]">parent_id</code> + <code className="px-1 rounded bg-[var(--color-page)]">child_id</code>).
          </p>

          <CodeBlock title="SQL">{`CREATE TABLE org_teams (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  owner TEXT NOT NULL DEFAULT '',
  parent_id TEXT REFERENCES org_teams(id)
);

CREATE TABLE org_team_children (
  parent_id TEXT NOT NULL REFERENCES org_teams(id),
  child_id TEXT NOT NULL REFERENCES org_teams(id),
  sort_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (parent_id, child_id)
);`}</CodeBlock>

          <h3 className="text-sm font-semibold text-[var(--color-text)] mt-4 mb-2">JSON example</h3>
          <CodeBlock title="org_teams row">{`{
  "id": "solution_dev",
  "name": "SolutionDev",
  "owner": "Team lead",
  "parent_id": null
}`}</CodeBlock>
        </Section>

        <Section id="capability" icon={<Layers className="w-5 h-5" />} title="5. Capability grid (TownStation)" expanded={expanded.capability} onToggle={toggle}>
          <p className="text-sm text-[var(--color-text-muted)] pt-3">
            Dashboard layout: ordered capabilities, each cap holds projects with status/col/sort. Order: <code className="px-1 rounded bg-[var(--color-page)]">capability_order</code> → <code className="px-1 rounded bg-[var(--color-page)]">caps</code> → <code className="px-1 rounded bg-[var(--color-page)]">cap_projects</code>.
          </p>

          <CodeBlock title="SQL">{`CREATE TABLE capability_order (
  sort_order INTEGER NOT NULL PRIMARY KEY,
  cap_id TEXT NOT NULL
);

CREATE TABLE caps (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  cols INTEGER CHECK (cols IN (12,6,4,3)),
  rows INTEGER
);

CREATE TABLE cap_projects (
  cap_id TEXT NOT NULL REFERENCES caps(id),
  project_id TEXT NOT NULL REFERENCES projects(id),
  status TEXT CHECK (status IN ('RED','YELLOW','GREEN')),
  cols INTEGER CHECK (cols IN (12,6,4,3)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (cap_id, project_id)
);`}</CodeBlock>

          <CodeBlock title="caps row">{`{
  "id": "business_management",
  "name": "Business Management",
  "cols": 12,
  "rows": 5
}`}</CodeBlock>
        </Section>

        <Section id="browserUi" icon={<LayoutTemplate className="w-5 h-5" />} title="6. Browser UI — Summary &amp; PDF (no extra REST)" expanded={expanded.browserUi} onToggle={toggle}>
          <p className="text-sm text-[var(--color-text-muted)] pt-3">
            The <strong className="text-[var(--color-text)]">Project Manage</strong> page has a <strong>Summary</strong> modal: executive summary, tables, and cards (Critical / Manageable / Normal) including todos under each sub-topic.
          </p>
          <ul className="text-xs text-[var(--color-text-muted)] list-disc list-inside space-y-1 mt-2">
            <li><strong className="text-[var(--color-text)]">Timeline</strong> tab: vertical timeline by <code className="px-0.5 rounded bg-[var(--color-overlay)]">due_date</code> (<code className="px-0.5 rounded bg-[var(--color-overlay)]">YYYY-MM-DD</code>) on <code className="px-0.5 rounded bg-[var(--color-overlay)]">project_sub_topic_details</code>.</li>
            <li><strong className="text-[var(--color-text)]">Date filter</strong>: start/end inclusive; optional include items without due date. Affects counts, Summary, Timeline, and exported PDF.</li>
            <li><strong className="text-[var(--color-text)]">Save PDF</strong>: client-side (<code className="px-0.5 rounded bg-[var(--color-overlay)]">html2canvas</code> + <code className="px-0.5 rounded bg-[var(--color-overlay)]">jsPDF</code>), one continuous page; filename <code className="px-0.5 rounded bg-[var(--color-overlay)]">{'{projectName}_{Summary|Timeline}_{YYYYMMDD}.pdf'}</code>.</li>
          </ul>
          <p className="text-xs text-[var(--color-text-muted)] mt-3">
            For API-only agents: reproduce reports from <code className="px-1 rounded bg-[var(--color-page)]">GET /api/sync/download</code> by joining sub-topics and details (and parents for labels).
          </p>
        </Section>

        <Section id="models" icon={<Database className="w-5 h-5" />} title="7. Sync payload — 10 tables" expanded={expanded.models} onToggle={toggle}>
          <p className="text-sm text-[var(--color-text-muted)] pt-3">
            Export/import uses the same shape for upload and download — <strong>10</strong> table keys under <code className="px-1 rounded bg-[var(--color-page)]">tables</code>.
          </p>

          <CodeBlock title="Shape">{`{
  "schema_version": 1,
  "version": 74,
  "updated_at": "2026-03-19T04:57:11.866Z",
  "tables": {
    "projects": [],
    "project_teams": [],
    "project_topics": [],
    "project_sub_topics": [],
    "project_sub_topic_details": [],
    "org_teams": [],
    "org_team_children": [],
    "capability_order": [],
    "caps": [],
    "cap_projects": []
  }
}`}</CodeBlock>

          <h3 className="text-sm font-semibold text-[var(--color-text)] mt-4 mb-2">Export order (dependency-ish)</h3>
          <CodeBlock title="Order">{`projects → project_teams → project_topics → project_sub_topics
→ project_sub_topic_details → org_teams → org_team_children
→ capability_order → caps → cap_projects`}</CodeBlock>

          <div className="mt-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-overlay)] p-4">
            <h4 className="text-xs font-semibold text-[var(--color-text)] mb-2">Encrypted backup (optional)</h4>
            <p className="text-xs text-[var(--color-text-muted)] mb-2">
              If the user sets a backup password, the client encrypts with AES-GCM; the server only stores opaque fields.
            </p>
            <CodeBlock title="Encrypted payload">{`{
  "version": 74,
  "updated_at": "...",
  "enc": "<base64>",
  "iv": "<base64>",
  "salt": "<base64>"
}`}</CodeBlock>
          </div>
        </Section>

        <Section id="workflow" icon={<ExternalLink className="w-5 h-5" />} title="8. Agent workflow" expanded={expanded.workflow} onToggle={toggle}>
          <div className="pt-3 space-y-4">
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-overlay)] p-4">
              <h3 className="text-sm font-semibold text-[var(--color-text)] mb-2">Login</h3>
              <CodeBlock title="curl">{`curl -s -X POST ${host}/api/auth/token/login \\
  -H "Content-Type: application/json" \\
  -d '{"token":"atkn_YOUR_TOKEN"}'`}</CodeBlock>
            </div>

            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-overlay)] p-4">
              <h3 className="text-sm font-semibold text-[var(--color-text)] mb-2">Read version</h3>
              <CodeBlock title="curl">{`curl -s ${host}/api/sync/version \\
  -H "X-Google-User-Id: YOUR_USER_ID"`}</CodeBlock>
            </div>

            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-overlay)] p-4">
              <h3 className="text-sm font-semibold text-[var(--color-text)] mb-2">List projects / open tasks</h3>
              <CodeBlock title="curl + jq">{`curl -s ${host}/api/sync/download \\
  -H "X-Google-User-Id: YOUR_USER_ID" \\
  | jq '.tables.projects[] | {id, name}'

curl -s ${host}/api/sync/download \\
  -H "X-Google-User-Id: YOUR_USER_ID" \\
  | jq '[.tables.project_sub_topic_details[]
         | select(.status != "done")
         | {text, status, due_date}]'`}</CodeBlock>
            </div>

            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-overlay)] p-4">
              <h3 className="text-sm font-semibold text-[var(--color-text)] mb-2">Patch one field</h3>
              <CodeBlock title="curl">{`curl -s -X PATCH ${host}/api/sync/patch \\
  -H "Content-Type: application/json" \\
  -H "X-Google-User-Id: YOUR_USER_ID" \\
  -d '{"base_version":74,"ops":[{"op":"update","table":"project_sub_topic_details","id":"ROW_ID","fields":{"status":"done"},"field_updated_at":{"status":"2026-03-21T12:00:00.000Z"}}]}'`}</CodeBlock>
            </div>

            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-overlay)] p-4">
              <h3 className="text-sm font-semibold text-[var(--color-text)] mb-2">Full upload</h3>
              <CodeBlock title="curl">{`curl -s -X POST ${host}/api/sync/upload \\
  -H "Content-Type: application/json" \\
  -H "X-Google-User-Id: YOUR_USER_ID" \\
  -d @modified_backup.json`}</CodeBlock>
            </div>

            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
              <h3 className="text-sm font-semibold text-emerald-700 dark:text-emerald-300 mb-2">Checklist</h3>
              <ul className="text-xs text-emerald-600 dark:text-emerald-400 space-y-1">
                <li className="flex items-start gap-2"><span className="shrink-0">1.</span> Token login → <code className="px-0.5 rounded bg-emerald-500/10">googleId</code></li>
                <li className="flex items-start gap-2"><span className="shrink-0">2.</span> <code className="px-0.5 rounded bg-emerald-500/10">GET /api/sync/version</code> or download → know <code className="px-0.5 rounded bg-emerald-500/10">version</code></li>
                <li className="flex items-start gap-2"><span className="shrink-0">3.</span> Prefer <code className="px-0.5 rounded bg-emerald-500/10">PATCH</code> for small edits (<code className="px-0.5 rounded bg-emerald-500/10">base_version</code> must match server)</li>
                <li className="flex items-start gap-2"><span className="shrink-0">4.</span> Use <code className="px-0.5 rounded bg-emerald-500/10">POST /api/sync/upload</code> for bulk replace or merge-then-upload</li>
                <li className="flex items-start gap-2"><span className="shrink-0">5.</span> Parse the 10 <code className="px-0.5 rounded bg-emerald-500/10">tables.*</code> arrays for domain logic</li>
                <li className="flex items-start gap-2"><span className="shrink-0">6.</span> Use audit / undo when you need traceability or rollback</li>
              </ul>
            </div>
          </div>
        </Section>
      </div>

      <ShareToAI baseUrl={baseUrl} />

      <div className="mt-8 text-center">
        <p className="text-xs text-[var(--color-text-muted)]">
          ArchTown — AI context · SQLite WASM + React + Express · <code className="text-[10px]">GET /api/ai/context</code>
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
          <h3 className="text-base font-semibold text-[var(--color-text)]">Share with an AI — Markdown URL</h3>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            Give agents this URL (ChatGPT, Claude, etc.). They receive plain Markdown — no JavaScript rendering required. Content matches this page and <code className="text-xs px-1 rounded bg-[var(--color-overlay)]">buildAIContextMarkdown</code> on the server.
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
              Open Markdown
            </a>
          </div>

          <div className="mt-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-overlay)] p-3">
            <p className="text-xs font-semibold text-[var(--color-text)] mb-1.5">How to use</p>
            <ul className="text-xs text-[var(--color-text-muted)] space-y-1">
              <li>1. Copy the URL above.</li>
              <li>2. Paste it into your agent; it will fetch the full Markdown spec.</li>
              <li>3. Use the checklist and curl examples to call the APIs correctly.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
