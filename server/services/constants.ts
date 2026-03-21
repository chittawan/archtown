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
