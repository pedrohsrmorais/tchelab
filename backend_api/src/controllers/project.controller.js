'use strict';

const { v4: uuidv4 } = require('uuid');
const db = require('../config/db.config');
const R = require('../utils/response');

const PURPOSE_VALUES = ['training', 'validation', 'test', 'calibration', 'prediction', 'reference', 'other'];

async function resolveProject(uuid) {
  const [rows] = await db.query('SELECT * FROM projects WHERE uuid = ? AND deleted_at IS NULL', [uuid]);
  return rows[0] || null;
}

async function getMembership(projectId, userId) {
  const [rows] = await db.query(
    'SELECT role FROM project_members WHERE project_id = ? AND user_id = ?',
    [projectId, userId],
  );
  return rows[0] || null;
}

// GET /projects
async function listProjects(req, res) {
  try {
    const [rows] = await db.query(
      `SELECT p.* FROM projects p
       JOIN project_members pm ON pm.project_id = p.id
       WHERE pm.user_id = ? AND p.deleted_at IS NULL
       ORDER BY p.created_at DESC`,
      [req.user.id],
    );
    return R.ok(res, rows);
  } catch (err) { return R.serverError(res, err); }
}

// POST /projects
async function createProject(req, res) {
  try {
    const { name, description, visibility } = req.body;
    if (!name) return R.unprocessable(res, [{ field: 'name', message: 'Obrigatório.' }]);

    const uuid = uuidv4();
    const [result] = await db.query(
      `INSERT INTO projects (uuid, user_id, name, description, visibility, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'active', NOW(), NOW())`,
      [uuid, req.user.id, name, description || null, visibility || 'private'],
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
    const project = await resolveProject(req.params.id);
    if (!project) return R.notFound(res, 'Projeto');
    const [[counts]] = await db.query(
      `SELECT
         (SELECT COUNT(*) FROM project_datasets WHERE project_id = ?) AS dataset_count,
         (SELECT COUNT(*) FROM project_workflows WHERE project_id = ?) AS workflow_count,
         (SELECT COUNT(*) FROM project_members WHERE project_id = ?) AS member_count`,
      [project.id, project.id, project.id],
    );
    return R.ok(res, { ...project, ...counts });
  } catch (err) { return R.serverError(res, err); }
}

// PUT /projects/:id
async function updateProject(req, res) {
  try {
    const project = await resolveProject(req.params.id);
    if (!project) return R.notFound(res, 'Projeto');
    const m = await getMembership(project.id, req.user.id);
    if (!m || (m.role !== 'admin' && project.user_id !== req.user.id)) return R.forbidden(res);

    const { name, description, visibility, status } = req.body;
    await db.query(
      `UPDATE projects SET
         name = COALESCE(?, name), description = COALESCE(?, description),
         visibility = COALESCE(?, visibility), status = COALESCE(?, status),
         updated_at = NOW()
       WHERE id = ?`,
      [name || null, description || null, visibility || null, status || null, project.id],
    );
    const [rows] = await db.query('SELECT * FROM projects WHERE id = ?', [project.id]);
    return R.ok(res, rows[0]);
  } catch (err) { return R.serverError(res, err); }
}

// DELETE /projects/:id
async function deleteProject(req, res) {
  try {
    const project = await resolveProject(req.params.id);
    if (!project) return R.notFound(res, 'Projeto');
    if (project.user_id !== req.user.id && req.user.role !== 'admin') return R.forbidden(res);
    await db.query('UPDATE projects SET deleted_at = NOW() WHERE id = ?', [project.id]);
    return R.noContent(res);
  } catch (err) { return R.serverError(res, err); }
}

// GET /projects/:id/members
async function listProjectMembers(req, res) {
  try {
    const project = await resolveProject(req.params.id);
    if (!project) return R.notFound(res, 'Projeto');
    const [rows] = await db.query(
      `SELECT u.uuid, u.name, u.avatar_url, pm.role, pm.joined_at
       FROM project_members pm JOIN users u ON u.id = pm.user_id
       WHERE pm.project_id = ?`,
      [project.id],
    );
    return R.ok(res, rows);
  } catch (err) { return R.serverError(res, err); }
}

// POST /projects/:id/members
async function addProjectMember(req, res) {
  try {
    const project = await resolveProject(req.params.id);
    if (!project) return R.notFound(res, 'Projeto');
    const m = await getMembership(project.id, req.user.id);
    if (!m || m.role === 'viewer') return R.forbidden(res);

    const { email, user_uuid, role } = req.body;
    const lookup = email
      ? ['SELECT id FROM users WHERE email = ?', [email]]
      : ['SELECT id FROM users WHERE uuid = ?', [user_uuid]];
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
    const project = await resolveProject(req.params.id);
    if (!project) return R.notFound(res, 'Projeto');
    const m = await getMembership(project.id, req.user.id);
    if (!m || m.role !== 'admin') return R.forbidden(res);

    const { role } = req.body;
    if (!['viewer', 'editor', 'admin'].includes(role)) {
      return R.unprocessable(res, [{ field: 'role', message: 'Inválido.' }]);
    }
    const [target] = await db.query('SELECT id FROM users WHERE uuid = ?', [req.params.uid]);
    if (!target.length) return R.notFound(res, 'Usuário');
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
    const project = await resolveProject(req.params.id);
    if (!project) return R.notFound(res, 'Projeto');
    const [target] = await db.query('SELECT id FROM users WHERE uuid = ?', [req.params.uid]);
    if (!target.length) return R.notFound(res, 'Usuário');
    const isSelf = req.user.id === target[0].id;
    const m = await getMembership(project.id, req.user.id);
    if (!isSelf && (!m || m.role !== 'admin')) return R.forbidden(res);
    await db.query('DELETE FROM project_members WHERE project_id = ? AND user_id = ?', [project.id, target[0].id]);
    return R.noContent(res);
  } catch (err) { return R.serverError(res, err); }
}

// GET /projects/:id/datasets
async function listProjectDatasets(req, res) {
  try {
    const project = await resolveProject(req.params.id);
    if (!project) return R.notFound(res, 'Projeto');
    const [rows] = await db.query(
      `SELECT d.*, pd.purpose, pd.added_at FROM datasets d
       JOIN project_datasets pd ON pd.dataset_id = d.id
       WHERE pd.project_id = ? AND d.deleted_at IS NULL`,
      [project.id],
    );
    return R.ok(res, rows);
  } catch (err) { return R.serverError(res, err); }
}

// POST /projects/:id/datasets  — UUID do dataset vem no body (dataset_id)
async function addDatasetToProject(req, res) {
  try {
    const project = await resolveProject(req.params.id);
    if (!project) return R.notFound(res, 'Projeto');
    const { dataset_id: datasetUuid, purpose } = req.body;
    if (!datasetUuid) return R.unprocessable(res, [{ field: 'dataset_id', message: 'Obrigatório.' }]);
    const [datasets] = await db.query('SELECT id FROM datasets WHERE uuid = ?', [datasetUuid]);
    if (!datasets.length) return R.notFound(res, 'Dataset');

    if (!PURPOSE_VALUES.includes(purpose)) {
      return R.unprocessable(res, [{ field: 'purpose', message: `Deve ser um dos: ${PURPOSE_VALUES.join(', ')}.` }]);
    }
    await db.query(
      `INSERT IGNORE INTO project_datasets (project_id, dataset_id, purpose, added_by, added_at)
       VALUES (?, ?, ?, ?, NOW())`,
      [project.id, datasets[0].id, purpose, req.user.id],
    );
    return R.created(res, { message: 'Dataset associado ao projeto.' });
  } catch (err) { return R.serverError(res, err); }
}

// PUT /projects/:id/datasets/:did
async function updateDatasetPurpose(req, res) {
  try {
    const project = await resolveProject(req.params.id);
    if (!project) return R.notFound(res, 'Projeto');
    const [datasets] = await db.query('SELECT id FROM datasets WHERE uuid = ?', [req.params.did]);
    if (!datasets.length) return R.notFound(res, 'Dataset');

    const { purpose } = req.body;
    if (!PURPOSE_VALUES.includes(purpose)) {
      return R.unprocessable(res, [{ field: 'purpose', message: 'Valor inválido.' }]);
    }
    await db.query(
      'UPDATE project_datasets SET purpose = ? WHERE project_id = ? AND dataset_id = ?',
      [purpose, project.id, datasets[0].id],
    );
    return R.ok(res, { message: 'Purpose atualizado.' });
  } catch (err) { return R.serverError(res, err); }
}

// DELETE /projects/:id/datasets/:did
async function removeDatasetFromProject(req, res) {
  try {
    const project = await resolveProject(req.params.id);
    if (!project) return R.notFound(res, 'Projeto');
    const [datasets] = await db.query('SELECT id FROM datasets WHERE uuid = ?', [req.params.did]);
    if (!datasets.length) return R.notFound(res, 'Dataset');
    await db.query('DELETE FROM project_datasets WHERE project_id = ? AND dataset_id = ?', [project.id, datasets[0].id]);
    return R.noContent(res);
  } catch (err) { return R.serverError(res, err); }
}

// GET /projects/:id/workflows
async function listProjectWorkflows(req, res) {
  try {
    const project = await resolveProject(req.params.id);
    if (!project) return R.notFound(res, 'Projeto');
    const [rows] = await db.query(
      `SELECT w.* FROM workflows w
       JOIN project_workflows pw ON pw.workflow_id = w.id
       WHERE pw.project_id = ? AND w.deleted_at IS NULL`,
      [project.id],
    );
    return R.ok(res, rows);
  } catch (err) { return R.serverError(res, err); }
}

// POST /projects/:id/workflows  — UUID do workflow vem no body (workflow_id)
async function addWorkflowToProject(req, res) {
  try {
    const project = await resolveProject(req.params.id);
    if (!project) return R.notFound(res, 'Projeto');
    const { workflow_id: workflowUuid } = req.body;
    if (!workflowUuid) return R.unprocessable(res, [{ field: 'workflow_id', message: 'Obrigatório.' }]);
    const [workflows] = await db.query('SELECT id FROM workflows WHERE uuid = ?', [workflowUuid]);
    if (!workflows.length) return R.notFound(res, 'Workflow');
    await db.query(
      `INSERT IGNORE INTO project_workflows (project_id, workflow_id, added_by, added_at) VALUES (?, ?, ?, NOW())`,
      [project.id, workflows[0].id, req.user.id],
    );
    return R.created(res, { message: 'Workflow associado ao projeto.' });
  } catch (err) { return R.serverError(res, err); }
}

// DELETE /projects/:id/workflows/:wid
async function removeWorkflowFromProject(req, res) {
  try {
    const project = await resolveProject(req.params.id);
    if (!project) return R.notFound(res, 'Projeto');
    const [workflows] = await db.query('SELECT id FROM workflows WHERE uuid = ?', [req.params.wid]);
    if (!workflows.length) return R.notFound(res, 'Workflow');
    await db.query('DELETE FROM project_workflows WHERE project_id = ? AND workflow_id = ?', [project.id, workflows[0].id]);
    return R.noContent(res);
  } catch (err) { return R.serverError(res, err); }
}

// GET /projects/:id/articles
async function listProjectArticles(req, res) {
  try {
    const project = await resolveProject(req.params.id);
    if (!project) return R.notFound(res, 'Projeto');
    const [rows] = await db.query(
      `SELECT a.* FROM articles a
       JOIN project_articles pa ON pa.article_id = a.id
       WHERE pa.project_id = ? AND a.deleted_at IS NULL`,
      [project.id],
    );
    return R.ok(res, rows);
  } catch (err) { return R.serverError(res, err); }
}

// POST /projects/:id/articles  — UUID do artigo vem no body (article_id)
async function addArticleToProject(req, res) {
  try {
    const project = await resolveProject(req.params.id);
    if (!project) return R.notFound(res, 'Projeto');
    const { article_id: articleUuid } = req.body;
    if (!articleUuid) return R.unprocessable(res, [{ field: 'article_id', message: 'Obrigatório.' }]);
    const [articles] = await db.query('SELECT id FROM articles WHERE uuid = ?', [articleUuid]);
    if (!articles.length) return R.notFound(res, 'Artigo');
    await db.query(
      `INSERT IGNORE INTO project_articles (project_id, article_id, added_by, added_at) VALUES (?, ?, ?, NOW())`,
      [project.id, articles[0].id, req.user.id],
    );
    return R.created(res, { message: 'Artigo associado.' });
  } catch (err) { return R.serverError(res, err); }
}

// DELETE /projects/:id/articles/:aid
async function removeArticleFromProject(req, res) {
  try {
    const project = await resolveProject(req.params.id);
    if (!project) return R.notFound(res, 'Projeto');
    const [articles] = await db.query('SELECT id FROM articles WHERE uuid = ?', [req.params.aid]);
    if (!articles.length) return R.notFound(res, 'Artigo');
    await db.query('DELETE FROM project_articles WHERE project_id = ? AND article_id = ?', [project.id, articles[0].id]);
    return R.noContent(res);
  } catch (err) { return R.serverError(res, err); }
}

// GET /projects/:id/history
async function getProjectHistory(req, res) {
  try {
    const project = await resolveProject(req.params.id);
    if (!project) return R.notFound(res, 'Projeto');
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
  getProjectHistory,
};
