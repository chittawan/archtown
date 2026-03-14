/**
 * SQLite schema for ArchTown (client-side WASM).
 * Matches docs/SQLITE_MIGRATION.md — 9 tables + indexes.
 */

export const ARCHTOWN_SCHEMA = `
-- Projects
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT
);

CREATE TABLE IF NOT EXISTS project_teams (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS project_topics (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES project_teams(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS project_sub_topics (
  id TEXT PRIMARY KEY,
  topic_id TEXT NOT NULL REFERENCES project_topics(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'GREEN' CHECK (status IN ('GREEN','YELLOW','RED')),
  sub_topic_type TEXT DEFAULT 'todos' CHECK (sub_topic_type IN ('todos','status')),
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS project_sub_topic_details (
  id TEXT PRIMARY KEY,
  sub_topic_id TEXT NOT NULL REFERENCES project_sub_topics(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'todo' CHECK (status IN ('todo','doing','done')),
  due_date TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_project_teams_project ON project_teams(project_id);
CREATE INDEX IF NOT EXISTS idx_project_topics_team ON project_topics(team_id);
CREATE INDEX IF NOT EXISTS idx_project_sub_topics_topic ON project_sub_topics(topic_id);
CREATE INDEX IF NOT EXISTS idx_project_details_sub_topic ON project_sub_topic_details(sub_topic_id);

-- Org teams
CREATE TABLE IF NOT EXISTS org_teams (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  owner TEXT NOT NULL DEFAULT '',
  parent_id TEXT REFERENCES org_teams(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS org_team_children (
  parent_id TEXT NOT NULL REFERENCES org_teams(id) ON DELETE CASCADE,
  child_id TEXT NOT NULL REFERENCES org_teams(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (parent_id, child_id)
);

-- Capability
CREATE TABLE IF NOT EXISTS capability_order (
  sort_order INTEGER NOT NULL,
  cap_id TEXT NOT NULL,
  PRIMARY KEY (sort_order)
);

CREATE TABLE IF NOT EXISTS caps (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  cols INTEGER CHECK (cols IN (12,6,4,3)),
  rows INTEGER
);

CREATE TABLE IF NOT EXISTS cap_projects (
  cap_id TEXT NOT NULL REFERENCES caps(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  status TEXT CHECK (status IN ('RED','YELLOW','GREEN')),
  cols INTEGER CHECK (cols IN (12,6,4,3)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (cap_id, project_id)
);
`.trim();
