'use strict';

/**
 * Permissões de leitura/edição sobre projetos e sobre o que vive dentro deles
 * (workflows, datasets, artigos, técnicas).
 *
 * Níveis (maior = mais poder):
 *   0 nenhum · 1 leitura · 2 edição · 3 administração do projeto · 4 dono
 *
 * Um usuário alcança um projeto por QUALQUER um dos caminhos, vale o maior:
 *   - é o dono (projects.user_id) ........................................ 4
 *   - admin da plataforma ................................................ 4
 *   - project_members.role: viewer=1, editor/collaborator=2, admin=3
 *   - membro de uma comunidade à qual o projeto foi vinculado:
 *       community_projects.access = 'read' → 1 | 'edit' → 2
 *   - projeto público (visibility = 'public') ............................ 1
 *
 * Workflows e datasets também podem ser alcançados direto por um MATERIAL de comunidade
 * (item do tipo workflow/dataset num tópico visível): leitura, ou edição se o professor marcou `edit`.
 *
 * "Administrar" (membros, visibilidade, excluir) nunca vem de comunidade: o
 * máximo que uma comunidade concede é edição do conteúdo.
 */

const db = require('../config/db.config');
const R = require('../utils/response');

const LEVEL = { NONE: 0, READ: 1, EDIT: 2, ADMIN: 3, OWNER: 4 };
const MEMBER_ROLE_LEVEL = { viewer: 1, editor: 2, collaborator: 2, admin: 3 };

const isPlatformAdmin = (user) => user && user.role === 'admin';

/** Nível do usuário sobre um projeto (linha completa de `projects`). */
async function projectLevel(project, user) {
  if (!project || !user) return LEVEL.NONE;
  if (isPlatformAdmin(user)) return LEVEL.OWNER;
  if (project.user_id === user.id) return LEVEL.OWNER;

  let level = project.visibility === 'public' ? LEVEL.READ : LEVEL.NONE;

  const [pmRows] = await db.query(
    'SELECT role FROM project_members WHERE project_id = ? AND user_id = ? LIMIT 1',
    [project.id, user.id],
  );
  if (pmRows.length) level = Math.max(level, MEMBER_ROLE_LEVEL[pmRows[0].role] || LEVEL.READ);

  const [links] = await db.query(
    `SELECT cp.access
       FROM community_projects cp
       JOIN community_members cm ON cm.community_id = cp.community_id AND cm.user_id = ?
      WHERE cp.project_id = ?`,
    [user.id, project.id],
  );
  for (const l of links) level = Math.max(level, l.access === 'edit' ? LEVEL.EDIT : LEVEL.READ);

  return level;
}

async function projectsOf(table, column, id) {
  const [rows] = await db.query(
    `SELECT p.* FROM projects p JOIN ${table} t ON t.project_id = p.id
      WHERE t.${column} = ? AND p.deleted_at IS NULL`,
    [id],
  );
  return rows;
}

async function bestProjectLevel(projects, user) {
  let best = LEVEL.NONE;
  for (const p of projects) {
    best = Math.max(best, await projectLevel(p, user));
    if (best >= LEVEL.EDIT) break;
  }
  // Via projeto, nunca passa de edição sobre o recurso filho.
  return Math.min(best, LEVEL.EDIT);
}

/**
 * Nível concedido por um MATERIAL de comunidade (item `workflow`/`dataset` visível num tópico visível)
 * a quem é membro dessa comunidade: 1 (leitura) ou 2 (edição, só workflows com access='edit').
 */
async function communityItemLevel(type, refId, user) {
  const [rows] = await db.query(
    `SELECT i.access
       FROM community_items i
       JOIN community_members cm ON cm.community_id = i.community_id AND cm.user_id = ?
      WHERE i.type = ? AND i.ref_id = ? AND i.is_visible = 1
        AND (i.section_id IS NULL OR EXISTS (SELECT 1 FROM community_sections s WHERE s.id = i.section_id AND s.is_visible = 1))`,
    [user.id, type, refId],
  );
  let level = LEVEL.NONE;
  for (const r of rows) level = Math.max(level, type === 'workflow' && r.access === 'edit' ? LEVEL.EDIT : LEVEL.READ);
  return level;
}

/** Nível sobre um workflow (linha de `workflows`). */
async function workflowLevel(workflow, user) {
  if (!workflow || !user) return LEVEL.NONE;
  if (isPlatformAdmin(user) || workflow.user_id === user.id) return LEVEL.OWNER;
  let level = workflow.visibility === 'public' ? LEVEL.READ : LEVEL.NONE;
  level = Math.max(level, await bestProjectLevel(await projectsOf('project_workflows', 'workflow_id', workflow.id), user));
  if (level < LEVEL.EDIT) level = Math.max(level, await communityItemLevel('workflow', workflow.id, user));
  return level;
}

/** Nível sobre um dataset (linha de `datasets`). */
async function datasetLevel(dataset, user) {
  if (!dataset || !user) return LEVEL.NONE;
  if (isPlatformAdmin(user) || dataset.user_id === user.id) return LEVEL.OWNER;
  let level = dataset.visibility === 'public' ? LEVEL.READ : LEVEL.NONE;
  level = Math.max(level, await bestProjectLevel(await projectsOf('project_datasets', 'dataset_id', dataset.id), user));
  if (level < LEVEL.READ) level = Math.max(level, await communityItemLevel('dataset', dataset.id, user));
  // Datasets só leem; edição de dados pertence ao dono.
  return Math.min(level, LEVEL.READ);
}

/** Papel do usuário numa comunidade: 'owner'|'admin'|'moderator'|'member'|null. */
async function communityRole(community, user) {
  if (!community || !user) return null;
  if (community.owner_id === user.id) return 'owner';
  const [rows] = await db.query(
    'SELECT role FROM community_members WHERE community_id = ? AND user_id = ? LIMIT 1',
    [community.id, user.id],
  );
  if (rows.length) return rows[0].role;
  if (isPlatformAdmin(user)) return 'admin';
  return null;
}

/**
 * Confere o nível sobre um workflow e já responde 404/403 quando insuficiente.
 * Retorna true se pode prosseguir. Uso: `if (!(await guardWorkflow(req, res, wf, LEVEL.EDIT))) return;`
 */
async function guardWorkflow(req, res, workflow, min = LEVEL.READ) {
  const lvl = await workflowLevel(workflow, req.user);
  if (lvl < LEVEL.READ) { R.notFound(res, 'Workflow'); return false; }
  if (lvl < min) { R.forbidden(res); return false; }
  return true;
}

async function guardDataset(req, res, dataset, min = LEVEL.READ) {
  const lvl = await datasetLevel(dataset, req.user);
  if (lvl < LEVEL.READ) { R.notFound(res, 'Dataset'); return false; }
  if (lvl < min) { R.forbidden(res); return false; }
  return true;
}

module.exports = {
  guardWorkflow, guardDataset,
  LEVEL, projectLevel, workflowLevel, datasetLevel, communityRole, isPlatformAdmin,
};
