'use strict';

const { v4: uuidv4 } = require('uuid');
const db = require('../config/db.config');
const R = require('../utils/response');
const { LEVEL, projectLevel } = require('../services/access.service');

const PURPOSE_VALUES = ['training', 'validation', 'test', 'calibration', 'prediction', 'reference', 'other'];
const LEVEL_NAME = { 1: 'viewer', 2: 'editor', 3: 'admin', 4: 'owner' };

async function resolveProject(uuid) {
  const [rows] = await db.query('SELECT * FROM projects WHERE uuid = ? AND deleted_at IS NULL', [uuid]);
  return rows[0] || null;
}

/**
 * Resolve o projeto e confere o nível mínimo exigido. 404 quando o usuário nem
 * enxerga o projeto (não vaza existência), 403 quando enxerga mas não pode agir.
 * Retorna { project, level } ou null (a resposta já foi enviada).
 */
async function load(req, res, min = LEVEL.READ) {
  const project = await resolveProject(req.params.id);
  if (!project) { R.notFound(res, 'Projeto'); return null; }
  const level = await projectLevel(project, req.user);
  if (level < LEVEL.READ) { R.notFound(res, 'Projeto'); return null; }
  if (level < min) { R.forbidden(res); return null; }
  return { project, level };
}

const PROJECT_COLUMNS = `p.id, p.uuid, p.name, p.description, p.visibility, p.status, p.created_at, p.updated_at,
  u.uuid AS owner_uuid, u.name AS owner_name, u.avatar_url AS owner_avatar_url,
  (SELECT COUNT(*) FROM project_datasets WHERE project_id = p.id) AS dataset_count,
  (SELECT COUNT(*) FROM project_workflows WHERE project_id = p.id) AS workflow_count,
  (SELECT COUNT(*) FROM project_techniques WHERE project_id = p.id) AS technique_count,
  (SELECT COUNT(*) FROM project_members WHERE project_id = p.id) AS member_count`;

// GET /projects?scope=mine|shared|all
//   mine   (padrão) projetos em que o usuário é dono/membro
//   shared projetos de outras pessoas acessíveis por uma comunidade
async function listProjects(req, res) {
  try {
    const scope = ['mine', 'shared', 'all'].includes(req.query.scope) ? req.query.scope : 'mine';
    const out = [];

    if (scope === 'mine' || scope === 'all') {
      const [rows] = await db.query(
        `SELECT ${PROJECT_COLUMNS}, p.user_id AS owner_id, pm.role AS member_role
           FROM projects p
           JOIN users u ON u.id = p.user_id
           JOIN project_members pm ON pm.project_id = p.id
          WHERE pm.user_id = ? AND p.deleted_at IS NULL
          ORDER BY p.created_at DESC`,
        [req.user.id],
      );
      for (const r of rows) {
        const byRole = { admin: 'admin', editor: 'editor', collaborator: 'editor' };
        out.push({ ...r, my_access: r.owner_id === req.user.id ? 'owner' : (byRole[r.member_role] || 'viewer'), via: null });
      }
    }

    if (scope === 'shared' || scope === 'all') {
      const [rows] = await db.query(
        `SELECT ${PROJECT_COLUMNS}, p.user_id AS owner_id,
                MAX(cp.access = 'edit') AS can_edit,
                GROUP_CONCAT(DISTINCT c.name SEPARATOR ', ') AS community_names
           FROM community_projects cp
           JOIN community_members cm ON cm.community_id = cp.community_id AND cm.user_id = ?
           JOIN communities c ON c.id = cp.community_id
           JOIN projects p ON p.id = cp.project_id AND p.deleted_at IS NULL
           JOIN users u ON u.id = p.user_id
          WHERE p.user_id <> ?
            AND NOT EXISTS (SELECT 1 FROM project_members x WHERE x.project_id = p.id AND x.user_id = ?)
          GROUP BY p.id, u.uuid, u.name, u.avatar_url
          ORDER BY p.updated_at DESC`,
        [req.user.id, req.user.id, req.user.id],
      );
      for (const r of rows) {
        out.push({ ...r, my_access: r.can_edit ? 'editor' : 'viewer', via: r.community_names });
      }
    }

    return R.ok(res, out.map(({ owner_id, can_edit, community_names, member_role, ...rest }) => rest));
  } catch (err) { return R.serverError(res, err); }
}

// POST /projects
async function createProject(req, res) {
  try {
    const { name, description, visibility } = req.body;
    if (!name || !String(name).trim()) return R.unprocessable(res, [{ field: 'name', message: 'Obrigatório.' }]);
    if (visibility && !['public', 'private'].includes(visibility)) {
      return R.unprocessable(res, [{ field: 'visibility', message: 'Inválido.' }]);
    }

    const uuid = uuidv4();
    const [result] = await db.query(
      `INSERT INTO projects (uuid, user_id, name, description, visibility, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'active', NOW(), NOW())`,
      [uuid, req.user.id, String(name).trim(), description || null, visibility || 'private'],
    );
    await db.query(
      `INSERT INTO project_members (project_id, user_id, role, joined_at) VALUES (?, ?, 'admin', NOW())`,
      [result.insertId, req.user.id],
    );
    const [rows] = await db.query('SELECT * FROM projects WHERE id = ?', [result.insertId]);
    return R.created(res, rows[0]);
  } catch (err) { return R.serverError(res, err); }
}

// GET /projects/:id
async function getProject(req, res) {
  try {
    const ctx = await load(req, res);
    if (!ctx) return;
    const { project, level } = ctx;
    const [[counts]] = await db.query(
      `SELECT
         (SELECT COUNT(*) FROM project_datasets WHERE project_id = ?) AS dataset_count,
         (SELECT COUNT(*) FROM project_workflows WHERE project_id = ?) AS workflow_count,
         (SELECT COUNT(*) FROM project_techniques WHERE project_id = ?) AS technique_count,
         (SELECT COUNT(*) FROM project_members WHERE project_id = ?) AS member_count`,
      [project.id, project.id, project.id, project.id],
    );
    const [[owner]] = await db.query('SELECT uuid, name, avatar_url FROM users WHERE id = ?', [project.user_id]);
    return R.ok(res, {
      ...project, ...counts,
      owner: owner || null,
      my_access: LEVEL_NAME[level] || 'viewer',
      can_edit: level >= LEVEL.EDIT,
      can_admin: level >= LEVEL.ADMIN,
    });
  } catch (err) { return R.serverError(res, err); }
}

// PUT /projects/:id
async function updateProject(req, res) {
  try {
    const ctx = await load(req, res, LEVEL.ADMIN);
    if (!ctx) return;
    const { project } = ctx;

    const { name, description, visibility, status } = req.body;
    if (visibility !== undefined && !['public', 'private'].includes(visibility)) {
      return R.unprocessable(res, [{ field: 'visibility', message: 'Inválido.' }]);
    }
    if (status !== undefined && !['active', 'archived', 'closed'].includes(status)) {
      return R.unprocessable(res, [{ field: 'status', message: 'Inválido.' }]);
    }
    if (name !== undefined && !String(name).trim()) {
      return R.unprocessable(res, [{ field: 'name', message: 'Obrigatório.' }]);
    }
    await db.query(
      `UPDATE projects SET
         name = ?, description = ?, visibility = ?, status = ?, updated_at = NOW()
       WHERE id = ?`,
      [
        name !== undefined ? String(name).trim() : project.name,
        description !== undefined ? (description || null) : project.description,
        visibility !== undefined ? visibility : project.visibility,
        status !== undefined ? status : project.status,
        project.id,
      ],
    );
    const [rows] = await db.query('SELECT * FROM projects WHERE id = ?', [project.id]);
    return R.ok(res, rows[0]);
  } catch (err) { return R.serverError(res, err); }
}

// DELETE /projects/:id
async function deleteProject(req, res) {
  try {
    const ctx = await load(req, res, LEVEL.OWNER);
    if (!ctx) return;
    await db.query('UPDATE projects SET deleted_at = NOW() WHERE id = ?', [ctx.project.id]);
    return R.noContent(res);
  } catch (err) { return R.serverError(res, err); }
}

// GET /projects/:id/members
async function listProjectMembers(req, res) {
  try {
    const ctx = await load(req, res);
    if (!ctx) return;
    const [rows] = await db.query(
      `SELECT u.uuid, u.name, u.avatar_url, pm.role, pm.joined_at
       FROM project_members pm JOIN users u ON u.id = pm.user_id
       WHERE pm.project_id = ?`,
      [ctx.project.id],
    );
    return R.ok(res, rows);
  } catch (err) { return R.serverError(res, err); }
}

// POST /projects/:id/members
async function addProjectMember(req, res) {
  try {
    const ctx = await load(req, res, LEVEL.ADMIN);
    if (!ctx) return;
    const { project } = ctx;

    const { email, user_uuid, role } = req.body;
    if (!email && !user_uuid) return R.unprocessable(res, [{ field: 'email', message: 'Obrigatório.' }]);
    const lookup = email
      ? ['SELECT id FROM users WHERE email = ? AND deleted_at IS NULL', [String(email).toLowerCase().trim()]]
      : ['SELECT id FROM users WHERE uuid = ? AND deleted_at IS NULL', [user_uuid]];
    const [users] = await db.query(...lookup);
    if (!users.length) return R.notFound(res, 'Usuário');

    const memberRole = ['viewer', 'editor', 'admin'].includes(role) ? role : 'viewer';
    await db.query(
      `INSERT IGNORE INTO project_members (project_id, user_id, role, joined_at) VALUES (?, ?, ?, NOW())`,
      [project.id, users[0].id, memberRole],
    );
    return R.created(res, { message: 'Membro adicionado.' });
  } catch (err) { return R.serverError(res, err); }
}

// PUT /projects/:id/members/:uid
async function updateProjectMemberRole(req, res) {
  try {
    const ctx = await load(req, res, LEVEL.ADMIN);
    if (!ctx) return;
    const { project } = ctx;

    const { role } = req.body;
    if (!['viewer', 'editor', 'admin'].includes(role)) {
      return R.unprocessable(res, [{ field: 'role', message: 'Inválido.' }]);
    }
    const [target] = await db.query('SELECT id FROM users WHERE uuid = ?', [req.params.uid]);
    if (!target.length) return R.notFound(res, 'Usuário');
    if (target[0].id === project.user_id) return R.forbidden(res, 'O papel do dono do projeto não pode ser alterado.');
    await db.query(
      'UPDATE project_members SET role = ? WHERE project_id = ? AND user_id = ?',
      [role, project.id, target[0].id],
    );
    return R.ok(res, { message: 'Papel atualizado.' });
  } catch (err) { return R.serverError(res, err); }
}

// DELETE /projects/:id/members/:uid
async function removeProjectMember(req, res) {
  try {
    const ctx = await load(req, res);
    if (!ctx) return;
    const { project, level } = ctx;
    const [target] = await db.query('SELECT id FROM users WHERE uuid = ?', [req.params.uid]);
    if (!target.length) return R.notFound(res, 'Usuário');
    const isSelf = req.user.id === target[0].id;
    if (!isSelf && level < LEVEL.ADMIN) return R.forbidden(res);
    if (target[0].id === project.user_id) return R.forbidden(res, 'O dono do projeto não pode ser removido.');
    await db.query('DELETE FROM project_members WHERE project_id = ? AND user_id = ?', [project.id, target[0].id]);
    return R.noContent(res);
  } catch (err) { return R.serverError(res, err); }
}

// GET /projects/:id/datasets
async function listProjectDatasets(req, res) {
  try {
    const ctx = await load(req, res);
    if (!ctx) return;
    const [rows] = await db.query(
      `SELECT d.id, d.uuid, d.name, d.description, d.data_type, d.dimensions, d.visibility, d.created_at,
              (d.user_id = ?) AS is_mine, pd.purpose, pd.added_at
         FROM datasets d
         JOIN project_datasets pd ON pd.dataset_id = d.id
        WHERE pd.project_id = ? AND d.deleted_at IS NULL
        ORDER BY pd.added_at DESC`,
      [req.user.id, ctx.project.id],
    );
    return R.ok(res, rows);
  } catch (err) { return R.serverError(res, err); }
}

// POST /projects/:id/datasets  — UUID do dataset vem no body (dataset_id)
async function addDatasetToProject(req, res) {
  try {
    const ctx = await load(req, res, LEVEL.EDIT);
    if (!ctx) return;
    const { dataset_id: datasetUuid, purpose } = req.body;
    if (!datasetUuid) return R.unprocessable(res, [{ field: 'dataset_id', message: 'Obrigatório.' }]);
    const [datasets] = await db.query('SELECT * FROM datasets WHERE uuid = ? AND deleted_at IS NULL', [datasetUuid]);
    if (!datasets.length) return R.notFound(res, 'Dataset');
    // Só se vincula o que é seu.
    if (datasets[0].user_id !== req.user.id && req.user.role !== 'admin') {
      return R.forbidden(res, 'Você só pode vincular datasets seus.');
    }

    const p = purpose || 'other';
    if (!PURPOSE_VALUES.includes(p)) {
      return R.unprocessable(res, [{ field: 'purpose', message: `Deve ser um dos: ${PURPOSE_VALUES.join(', ')}.` }]);
    }
    await db.query(
      `INSERT IGNORE INTO project_datasets (project_id, dataset_id, purpose, added_by, added_at)
       VALUES (?, ?, ?, ?, NOW())`,
      [ctx.project.id, datasets[0].id, p, req.user.id],
    );
    return R.created(res, { message: 'Dataset associado ao projeto.' });
  } catch (err) { return R.serverError(res, err); }
}

// PUT /projects/:id/datasets/:did
async function updateDatasetPurpose(req, res) {
  try {
    const ctx = await load(req, res, LEVEL.EDIT);
    if (!ctx) return;
    const [datasets] = await db.query('SELECT id FROM datasets WHERE uuid = ?', [req.params.did]);
    if (!datasets.length) return R.notFound(res, 'Dataset');

    const { purpose } = req.body;
    if (!PURPOSE_VALUES.includes(purpose)) {
      return R.unprocessable(res, [{ field: 'purpose', message: 'Valor inválido.' }]);
    }
    await db.query(
      'UPDATE project_datasets SET purpose = ? WHERE project_id = ? AND dataset_id = ?',
      [purpose, ctx.project.id, datasets[0].id],
    );
    return R.ok(res, { message: 'Purpose atualizado.' });
  } catch (err) { return R.serverError(res, err); }
}

// DELETE /projects/:id/datasets/:did
async function removeDatasetFromProject(req, res) {
  try {
    const ctx = await load(req, res, LEVEL.EDIT);
    if (!ctx) return;
    const [datasets] = await db.query('SELECT id FROM datasets WHERE uuid = ?', [req.params.did]);
    if (!datasets.length) return R.notFound(res, 'Dataset');
    const [links] = await db.query(
      'SELECT added_by FROM project_datasets WHERE project_id = ? AND dataset_id = ?',
      [ctx.project.id, datasets[0].id],
    );
    if (links.length && ctx.level < LEVEL.ADMIN && links[0].added_by !== req.user.id) {
      return R.forbidden(res, 'Só quem vinculou ou um administrador do projeto pode remover.');
    }
    await db.query('DELETE FROM project_datasets WHERE project_id = ? AND dataset_id = ?', [ctx.project.id, datasets[0].id]);
    return R.noContent(res);
  } catch (err) { return R.serverError(res, err); }
}

// GET /projects/:id/workflows
async function listProjectWorkflows(req, res) {
  try {
    const ctx = await load(req, res);
    if (!ctx) return;
    const [rows] = await db.query(
      `SELECT w.id, w.uuid, w.name, w.description, w.status, w.visibility, w.created_at, w.updated_at,
              (w.user_id = ?) AS is_mine
         FROM workflows w
         JOIN project_workflows pw ON pw.workflow_id = w.id
        WHERE pw.project_id = ? AND w.deleted_at IS NULL
        ORDER BY w.updated_at DESC`,
      [req.user.id, ctx.project.id],
    );
    return R.ok(res, rows);
  } catch (err) { return R.serverError(res, err); }
}

// POST /projects/:id/workflows  — UUID do workflow vem no body (workflow_id)
async function addWorkflowToProject(req, res) {
  try {
    const ctx = await load(req, res, LEVEL.EDIT);
    if (!ctx) return;
    const { workflow_id: workflowUuid } = req.body;
    if (!workflowUuid) return R.unprocessable(res, [{ field: 'workflow_id', message: 'Obrigatório.' }]);
    const [workflows] = await db.query('SELECT * FROM workflows WHERE uuid = ? AND deleted_at IS NULL', [workflowUuid]);
    if (!workflows.length) return R.notFound(res, 'Workflow');
    if (workflows[0].user_id !== req.user.id && req.user.role !== 'admin') {
      return R.forbidden(res, 'Você só pode vincular workflows seus.');
    }
    await db.query(
      `INSERT IGNORE INTO project_workflows (project_id, workflow_id, added_by, added_at) VALUES (?, ?, ?, NOW())`,
      [ctx.project.id, workflows[0].id, req.user.id],
    );
    return R.created(res, { message: 'Workflow associado ao projeto.' });
  } catch (err) { return R.serverError(res, err); }
}

// DELETE /projects/:id/workflows/:wid
async function removeWorkflowFromProject(req, res) {
  try {
    const ctx = await load(req, res, LEVEL.EDIT);
    if (!ctx) return;
    const [workflows] = await db.query('SELECT id FROM workflows WHERE uuid = ?', [req.params.wid]);
    if (!workflows.length) return R.notFound(res, 'Workflow');
    const [links] = await db.query(
      'SELECT added_by FROM project_workflows WHERE project_id = ? AND workflow_id = ?',
      [ctx.project.id, workflows[0].id],
    );
    if (links.length && ctx.level < LEVEL.ADMIN && links[0].added_by !== req.user.id) {
      return R.forbidden(res, 'Só quem vinculou ou um administrador do projeto pode remover.');
    }
    await db.query('DELETE FROM project_workflows WHERE project_id = ? AND workflow_id = ?', [ctx.project.id, workflows[0].id]);
    return R.noContent(res);
  } catch (err) { return R.serverError(res, err); }
}

// GET /projects/:id/articles
async function listProjectArticles(req, res) {
  try {
    const ctx = await load(req, res);
    if (!ctx) return;
    const [rows] = await db.query(
      `SELECT a.* FROM articles a
       JOIN project_articles pa ON pa.article_id = a.id
       WHERE pa.project_id = ? AND a.deleted_at IS NULL`,
      [ctx.project.id],
    );
    return R.ok(res, rows);
  } catch (err) { return R.serverError(res, err); }
}

// POST /projects/:id/articles  — UUID do artigo vem no body (article_id)
async function addArticleToProject(req, res) {
  try {
    const ctx = await load(req, res, LEVEL.EDIT);
    if (!ctx) return;
    const { article_id: articleUuid } = req.body;
    if (!articleUuid) return R.unprocessable(res, [{ field: 'article_id', message: 'Obrigatório.' }]);
    const [articles] = await db.query('SELECT id, user_id FROM articles WHERE uuid = ? AND deleted_at IS NULL', [articleUuid]);
    if (!articles.length) return R.notFound(res, 'Artigo');
    if (articles[0].user_id !== req.user.id && req.user.role !== 'admin') {
      return R.forbidden(res, 'Você só pode vincular artigos seus.');
    }
    await db.query(
      `INSERT IGNORE INTO project_articles (project_id, article_id, added_by, added_at) VALUES (?, ?, ?, NOW())`,
      [ctx.project.id, articles[0].id, req.user.id],
    );
    return R.created(res, { message: 'Artigo associado.' });
  } catch (err) { return R.serverError(res, err); }
}

// DELETE /projects/:id/articles/:aid
async function removeArticleFromProject(req, res) {
  try {
    const ctx = await load(req, res, LEVEL.EDIT);
    if (!ctx) return;
    const [articles] = await db.query('SELECT id FROM articles WHERE uuid = ?', [req.params.aid]);
    if (!articles.length) return R.notFound(res, 'Artigo');
    await db.query('DELETE FROM project_articles WHERE project_id = ? AND article_id = ?', [ctx.project.id, articles[0].id]);
    return R.noContent(res);
  } catch (err) { return R.serverError(res, err); }
}

// GET /projects/:id/techniques  — técnicas favoritas / próprias do projeto
async function listProjectTechniques(req, res) {
  try {
    const ctx = await load(req, res);
    if (!ctx) return;
    const [rows] = await db.query(
      `SELECT t.uuid, t.slug, t.name, t.description, t.category, t.family, t.is_custom, t.is_beta,
              pt.kind, pt.added_at
         FROM project_techniques pt
         JOIN techniques t ON t.id = pt.technique_id
        WHERE pt.project_id = ? AND (t.is_custom = 0 OR t.user_id = ? OR t.user_id = ?)
        ORDER BY pt.kind, t.name`,
      [ctx.project.id, req.user.id, ctx.project.user_id],
    );
    return R.ok(res, rows);
  } catch (err) { return R.serverError(res, err); }
}

// POST /projects/:id/techniques  { technique_id: uuid|slug }
async function addProjectTechnique(req, res) {
  try {
    const ctx = await load(req, res, LEVEL.EDIT);
    if (!ctx) return;
    const ref = req.body.technique_id || req.body.slug;
    if (!ref) return R.unprocessable(res, [{ field: 'technique_id', message: 'Obrigatório.' }]);
    const [techs] = await db.query('SELECT id, is_custom, user_id FROM techniques WHERE uuid = ? OR slug = ? LIMIT 1', [ref, ref]);
    if (!techs.length) return R.notFound(res, 'Técnica');
    const tech = techs[0];
    if (tech.is_custom && tech.user_id !== req.user.id) return R.forbidden(res, 'Técnica própria de outro usuário.');
    const kind = tech.is_custom ? 'own' : 'favorite';
    await db.query(
      `INSERT IGNORE INTO project_techniques (project_id, technique_id, kind, added_by, added_at) VALUES (?, ?, ?, ?, NOW())`,
      [ctx.project.id, tech.id, kind, req.user.id],
    );
    return R.created(res, { message: 'Técnica adicionada ao projeto.', kind });
  } catch (err) { return R.serverError(res, err); }
}

// DELETE /projects/:id/techniques/:tid
async function removeProjectTechnique(req, res) {
  try {
    const ctx = await load(req, res, LEVEL.EDIT);
    if (!ctx) return;
    const [techs] = await db.query('SELECT id FROM techniques WHERE uuid = ? OR slug = ? LIMIT 1', [req.params.tid, req.params.tid]);
    if (!techs.length) return R.notFound(res, 'Técnica');
    await db.query('DELETE FROM project_techniques WHERE project_id = ? AND technique_id = ?', [ctx.project.id, techs[0].id]);
    return R.noContent(res);
  } catch (err) { return R.serverError(res, err); }
}

// GET /projects/:id/communities — comunidades em que o projeto está vinculado
async function listProjectCommunities(req, res) {
  try {
    const ctx = await load(req, res);
    if (!ctx) return;
    const isAdmin = ctx.level >= LEVEL.ADMIN;
    const [rows] = await db.query(
      `SELECT c.uuid, c.name, c.visibility, cp.access, cp.shared_at
         FROM community_projects cp
         JOIN communities c ON c.id = cp.community_id
        WHERE cp.project_id = ?
          AND (? = 1 OR EXISTS (SELECT 1 FROM community_members m WHERE m.community_id = c.id AND m.user_id = ?))
        ORDER BY c.name`,
      [ctx.project.id, isAdmin ? 1 : 0, req.user.id],
    );
    return R.ok(res, rows);
  } catch (err) { return R.serverError(res, err); }
}

// GET /projects/:id/history
async function getProjectHistory(req, res) {
  try {
    const ctx = await load(req, res);
    if (!ctx) return;
    const { project } = ctx;
    const { offset, limit, meta } = R.paginate(req, 0);
    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM executions e
       WHERE e.workflow_id IN (SELECT workflow_id FROM project_workflows WHERE project_id = ?)`,
      [project.id],
    );
    const [rows] = await db.query(
      `SELECT e.* FROM executions e
       WHERE e.workflow_id IN (SELECT workflow_id FROM project_workflows WHERE project_id = ?)
       ORDER BY e.created_at DESC LIMIT ? OFFSET ?`,
      [project.id, limit, offset],
    );
    return R.ok(res, rows, { ...meta, total });
  } catch (err) { return R.serverError(res, err); }
}

module.exports = {
  listProjects, createProject, getProject, updateProject, deleteProject,
  listProjectMembers, addProjectMember, updateProjectMemberRole, removeProjectMember,
  listProjectDatasets, addDatasetToProject, updateDatasetPurpose, removeDatasetFromProject,
  listProjectWorkflows, addWorkflowToProject, removeWorkflowFromProject,
  listProjectArticles, addArticleToProject, removeArticleFromProject,
  listProjectTechniques, addProjectTechnique, removeProjectTechnique,
  listProjectCommunities,
  getProjectHistory,
};
