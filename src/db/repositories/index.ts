/**
 * Repositories layer: แยกตาม table + domain สำหรับ frontend เรียกใช้
 *
 * Table repositories (ต่อตาราง):
 * - projects.repository
 * - project_teams.repository
 * - project_topics.repository
 * - project_sub_topics.repository
 * - project_sub_topic_details.repository
 * - org_teams.repository
 * - org_team_children.repository
 * - capability_order.repository
 * - caps.repository
 * - cap_projects.repository
 *
 * Domain repositories (สำหรับหน้า frontend):
 * - project.repository  → listProjects, getProject, createProject, saveProject
 * - org_team.repository → listTeamIds, getTeam, saveTeam
 * - capability.repository → getCapabilityLayout, saveCapabilityLayout, getCapabilitySummary
 */

export * as projectsTable from './projects.repository';
export * as projectTeamsTable from './project_teams.repository';
export * as projectTopicsTable from './project_topics.repository';
export * as projectSubTopicsTable from './project_sub_topics.repository';
export * as projectSubTopicDetailsTable from './project_sub_topic_details.repository';
export * as orgTeamsTable from './org_teams.repository';
export * as orgTeamChildrenTable from './org_team_children.repository';
export * as capabilityOrderTable from './capability_order.repository';
export * as capsTable from './caps.repository';
export * as capProjectsTable from './cap_projects.repository';

export * as projectRepository from './project.repository';
export * as orgTeamRepository from './org_team.repository';
export * as capabilityRepository from './capability.repository';
