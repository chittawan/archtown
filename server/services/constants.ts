/** Allowed table names for PATCH /api/sync/patch and audit undo. */
export const TABLE_WHITELIST = new Set([
  'projects',
  'project_teams',
  'project_topics',
  'project_sub_topics',
  'project_sub_topic_details',
  'org_teams',
  'org_team_children',
  'capability_order',
  'caps',
  'cap_projects',
]);

/**
 * Tables whose backup rows have no single `id` column: PATCH insert uses these columns for
 * uniqueness checks and audit id when `row.id` is missing.
 */
export const TABLE_COMPOSITE_KEY_COLUMNS: Record<string, readonly string[]> = {
  org_team_children: ['parent_id', 'child_id'],
  cap_projects: ['cap_id', 'project_id'],
  /** SQLite PK is sort_order only; one row per slot. */
  capability_order: ['sort_order'],
};
