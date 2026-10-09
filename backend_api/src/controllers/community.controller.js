'use strict';

const { v4: uuidv4 } = require('uuid');
const db = require('../config/db.config');
const R = require('../utils/response');

async function getMembership(communityId, userId) {
  const [rows] = await db.query(
    'SELECT role FROM community_members WHERE community_id = ? AND user_id = ?',
    [communityId, userId],
  );
  return rows[0] || null;
}

async function resolveCommunity(uuid) {
  const [rows] = await db.query('SELECT * FROM communities WHERE uuid = ?', [uuid]);
  return rows[0] || null;
}

// GET /communities
async function listMyCommunities(req, res) {
  try {
    const [rows] = await db.query(
      `SELECT c.*,
              (SELECT COUNT(*) FROM community_members WHERE community_id = c.id) AS member_count,
              (SELECT COUNT(*) FROM messages WHERE community_id = c.id) AS message_count
       FROM communities c
       JOIN community_members cm ON cm.community_id = c.id
       WHERE cm.user_id = ?
       ORDER BY c.created_at DESC`,
      [req.user.id],
    );
    return R.ok(res, rows);
  } catch (err) { return R.serverError(res, err); }
}

// GET /communities/public
async function listPublicCommunities(req, res) {
  try {
    const { offset, limit, meta } = R.paginate(req, 0);
    const [[{ total }]] = await db.query(
      "SELECT COUNT(*) AS total FROM communities WHERE visibility = 'public'",
    );
    const [rows] = await db.query(
      `SELECT c.*,
              (SELECT COUNT(*) FROM community_members WHERE community_id = c.id) AS member_count,
              (SELECT COUNT(*) FROM messages WHERE community_id = c.id) AS message_count
       FROM communities c WHERE c.visibility = 'public' ORDER BY c.created_at DESC LIMIT ? OFFSET ?`,
      [limit, offset],
    );
    return R.ok(res, rows, { ...meta, total });
  } catch (err) { return R.serverError(res, err); }
}

// POST /communities
async function createCommunity(req, res) {
  try {
    const { name, description, visibility } = req.body;
    if (!name) return R.unprocessable(res, [{ field: 'name', message: 'Obrigatório.' }]);

    const uuid = uuidv4();
    const [result] = await db.query(
      `INSERT INTO communities (uuid, owner_id, name, description, visibility, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, NOW(), NOW())`,
      [uuid, req.user.id, name, description || null, visibility || 'private'],
    );
    await db.query(
      `INSERT INTO community_members (community_id, user_id, role, joined_at) VALUES (?, ?, 'admin', NOW())`,
      [result.insertId, req.user.id],
    );
    const [rows] = await db.query('SELECT * FROM communities WHERE id = ?', [result.insertId]);
    return R.created(res, rows[0]);
  } catch (err) { return R.serverError(res, err); }
}

// GET /communities/:id
async function getCommunity(req, res) {
  try {
    const community = await resolveCommunity(req.params.id);
    if (!community) return R.notFound(res, 'Comunidade');
    const [[{ member_count }]] = await db.query(
      'SELECT COUNT(*) AS member_count FROM community_members WHERE community_id = ?',
      [community.id],
    );
    return R.ok(res, { ...community, member_count });
  } catch (err) { return R.serverError(res, err); }
}

// PUT /communities/:id
async function updateCommunity(req, res) {
  try {
    const community = await resolveCommunity(req.params.id);
    if (!community) return R.notFound(res, 'Comunidade');
    const m = await getMembership(community.id, req.user.id);
    if (!m || (m.role !== 'admin' && community.owner_id !== req.user.id)) return R.forbidden(res);

    const { name, description, visibility } = req.body;
    await db.query(
      'UPDATE communities SET name = COALESCE(?, name), description = COALESCE(?, description), visibility = COALESCE(?, visibility), updated_at = NOW() WHERE id = ?',
      [name || null, description || null, visibility || null, community.id],
    );
    const [rows] = await db.query('SELECT * FROM communities WHERE id = ?', [community.id]);
    return R.ok(res, rows[0]);
  } catch (err) { return R.serverError(res, err); }
}

// DELETE /communities/:id
async function deleteCommunity(req, res) {
  try {
    const community = await resolveCommunity(req.params.id);
    if (!community) return R.notFound(res, 'Comunidade');
    if (community.owner_id !== req.user.id && req.user.role !== 'admin') return R.forbidden(res);
    await db.query('DELETE FROM communities WHERE id = ?', [community.id]);
    return R.noContent(res);
  } catch (err) { return R.serverError(res, err); }
}

// GET /communities/:id/members
async function listMembers(req, res) {
  try {
    const community = await resolveCommunity(req.params.id);
    if (!community) return R.notFound(res, 'Comunidade');
    const [rows] = await db.query(
      `SELECT u.uuid, u.name, u.avatar_url, cm.role, cm.joined_at
       FROM community_members cm JOIN users u ON u.id = cm.user_id
       WHERE cm.community_id = ?`,
      [community.id],
    );
    return R.ok(res, rows);
  } catch (err) { return R.serverError(res, err); }
}

// POST /communities/:id/members
async function addMember(req, res) {
  try {
    const community = await resolveCommunity(req.params.id);
    if (!community) return R.notFound(res, 'Comunidade');
    const m = await getMembership(community.id, req.user.id);
    if (!m || m.role === 'member') return R.forbidden(res);

    const { email, user_uuid } = req.body;
    const lookup = email
      ? ['SELECT id FROM users WHERE email = ?', [email]]
      : ['SELECT id FROM users WHERE uuid = ?', [user_uuid]];
    const [users] = await db.query(...lookup);
    if (!users.length) return R.notFound(res, 'Usuário');

    await db.query(
      `INSERT IGNORE INTO community_members (community_id, user_id, role, joined_at) VALUES (?, ?, 'member', NOW())`,
      [community.id, users[0].id],
    );
    return R.created(res, { message: 'Membro adicionado.' });
  } catch (err) { return R.serverError(res, err); }
}

// PUT /communities/:id/members/:uid
async function updateMemberRole(req, res) {
  try {
    const community = await resolveCommunity(req.params.id);
    if (!community) return R.notFound(res, 'Comunidade');
    const m = await getMembership(community.id, req.user.id);
    if (!m || m.role !== 'admin') return R.forbidden(res);

    const { role } = req.body;
    if (!['member', 'moderator', 'admin'].includes(role)) {
      return R.unprocessable(res, [{ field: 'role', message: 'Inválido.' }]);
    }
    const [target] = await db.query('SELECT id FROM users WHERE uuid = ?', [req.params.uid]);
    if (!target.length) return R.notFound(res, 'Usuário');

    await db.query(
      'UPDATE community_members SET role = ? WHERE community_id = ? AND user_id = ?',
      [role, community.id, target[0].id],
    );
    return R.ok(res, { message: 'Papel atualizado.' });
  } catch (err) { return R.serverError(res, err); }
}

// DELETE /communities/:id/members/:uid
async function removeMember(req, res) {
  try {
    const community = await resolveCommunity(req.params.id);
    if (!community) return R.notFound(res, 'Comunidade');
    const [target] = await db.query('SELECT id FROM users WHERE uuid = ?', [req.params.uid]);
    if (!target.length) return R.notFound(res, 'Usuário');

    const isSelf = req.user.id === target[0].id;
    const m = await getMembership(community.id, req.user.id);
    if (!isSelf && (!m || m.role === 'member')) return R.forbidden(res);

    await db.query('DELETE FROM community_members WHERE community_id = ? AND user_id = ?', [community.id, target[0].id]);
    return R.noContent(res);
  } catch (err) { return R.serverError(res, err); }
}

// GET /communities/:id/projects
async function listCommunityProjects(req, res) {
  try {
    const community = await resolveCommunity(req.params.id);
    if (!community) return R.notFound(res, 'Comunidade');
    const [rows] = await db.query(
      `SELECT p.* FROM projects p
       JOIN community_projects cp ON cp.project_id = p.id
       WHERE cp.community_id = ? AND p.deleted_at IS NULL`,
      [community.id],
    );
    return R.ok(res, rows);
  } catch (err) { return R.serverError(res, err); }
}

// POST /communities/:id/projects  — UUID do projeto vem no body (project_id)
async function linkProject(req, res) {
  try {
    const community = await resolveCommunity(req.params.id);
    if (!community) return R.notFound(res, 'Comunidade');
    const { project_id: projectUuid } = req.body;
    if (!projectUuid) return R.unprocessable(res, [{ field: 'project_id', message: 'Obrigatório.' }]);
    const [projects] = await db.query('SELECT id FROM projects WHERE uuid = ?', [projectUuid]);
    if (!projects.length) return R.notFound(res, 'Projeto');

    await db.query(
      `INSERT IGNORE INTO community_projects (community_id, project_id, shared_by, shared_at) VALUES (?, ?, ?, NOW())`,
      [community.id, projects[0].id, req.user.id],
    );
    return R.created(res, { message: 'Projeto vinculado.' });
  } catch (err) { return R.serverError(res, err); }
}

// DELETE /communities/:id/projects/:pid
async function unlinkProject(req, res) {
  try {
    const community = await resolveCommunity(req.params.id);
    if (!community) return R.notFound(res, 'Comunidade');
    const [projects] = await db.query('SELECT id FROM projects WHERE uuid = ?', [req.params.pid]);
    if (!projects.length) return R.notFound(res, 'Projeto');
    await db.query('DELETE FROM community_projects WHERE community_id = ? AND project_id = ?', [community.id, projects[0].id]);
    return R.noContent(res);
  } catch (err) { return R.serverError(res, err); }
}

// GET /communities/:id/datasets
async function listCommunityDatasets(req, res) {
  try {
    const community = await resolveCommunity(req.params.id);
    if (!community) return R.notFound(res, 'Comunidade');
    const [rows] = await db.query(
      `SELECT d.* FROM datasets d
       JOIN community_datasets cd ON cd.dataset_id = d.id
       WHERE cd.community_id = ? AND d.deleted_at IS NULL`,
      [community.id],
    );
    return R.ok(res, rows);
  } catch (err) { return R.serverError(res, err); }
}

// POST /communities/:id/datasets  — UUID do dataset vem no body (dataset_id)
async function shareDataset(req, res) {
  try {
    const community = await resolveCommunity(req.params.id);
    if (!community) return R.notFound(res, 'Comunidade');
    const { dataset_id: datasetUuid } = req.body;
    if (!datasetUuid) return R.unprocessable(res, [{ field: 'dataset_id', message: 'Obrigatório.' }]);
    const [datasets] = await db.query('SELECT id FROM datasets WHERE uuid = ?', [datasetUuid]);
    if (!datasets.length) return R.notFound(res, 'Dataset');
    await db.query(
      `INSERT IGNORE INTO community_datasets (community_id, dataset_id, shared_by, shared_at) VALUES (?, ?, ?, NOW())`,
      [community.id, datasets[0].id, req.user.id],
    );
    return R.created(res, { message: 'Dataset compartilhado.' });
  } catch (err) { return R.serverError(res, err); }
}

// DELETE /communities/:id/datasets/:did
async function removeDatasetShare(req, res) {
  try {
    const community = await resolveCommunity(req.params.id);
    if (!community) return R.notFound(res, 'Comunidade');
    const [datasets] = await db.query('SELECT id FROM datasets WHERE uuid = ?', [req.params.did]);
    if (!datasets.length) return R.notFound(res, 'Dataset');
    await db.query('DELETE FROM community_datasets WHERE community_id = ? AND dataset_id = ?', [community.id, datasets[0].id]);
    return R.noContent(res);
  } catch (err) { return R.serverError(res, err); }
}

// GET /communities/:id/workflows
async function listCommunityWorkflows(req, res) {
  try {
    const community = await resolveCommunity(req.params.id);
    if (!community) return R.notFound(res, 'Comunidade');
    const [rows] = await db.query(
      `SELECT w.* FROM workflows w
       JOIN community_workflows cw ON cw.workflow_id = w.id
       WHERE cw.community_id = ? AND w.deleted_at IS NULL`,
      [community.id],
    );
    return R.ok(res, rows);
  } catch (err) { return R.serverError(res, err); }
}

// POST /communities/:id/workflows  — UUID do workflow vem no body (workflow_id)
async function shareWorkflow(req, res) {
  try {
    const community = await resolveCommunity(req.params.id);
    if (!community) return R.notFound(res, 'Comunidade');
    const { workflow_id: workflowUuid } = req.body;
    if (!workflowUuid) return R.unprocessable(res, [{ field: 'workflow_id', message: 'Obrigatório.' }]);
    const [workflows] = await db.query('SELECT id FROM workflows WHERE uuid = ?', [workflowUuid]);
    if (!workflows.length) return R.notFound(res, 'Workflow');
    await db.query(
      `INSERT IGNORE INTO community_workflows (community_id, workflow_id, shared_by, shared_at) VALUES (?, ?, ?, NOW())`,
      [community.id, workflows[0].id, req.user.id],
    );
    return R.created(res, { message: 'Workflow compartilhado.' });
  } catch (err) { return R.serverError(res, err); }
}

// DELETE /communities/:id/workflows/:wid
async function removeWorkflowShare(req, res) {
  try {
    const community = await resolveCommunity(req.params.id);
    if (!community) return R.notFound(res, 'Comunidade');
    const [workflows] = await db.query('SELECT id FROM workflows WHERE uuid = ?', [req.params.wid]);
    if (!workflows.length) return R.notFound(res, 'Workflow');
    await db.query('DELETE FROM community_workflows WHERE community_id = ? AND workflow_id = ?', [community.id, workflows[0].id]);
    return R.noContent(res);
  } catch (err) { return R.serverError(res, err); }
}

// GET /communities/:id/messages
async function listMessages(req, res) {
  try {
    const community = await resolveCommunity(req.params.id);
    if (!community) return R.notFound(res, 'Comunidade');
    const { offset, limit, meta } = R.paginate(req, 0);
    const [[{ total }]] = await db.query(
      'SELECT COUNT(*) AS total FROM messages WHERE community_id = ?',
      [community.id],
    );
    const [rows] = await db.query(
      `SELECT m.*, u.name AS author_name, u.avatar_url AS author_avatar
       FROM messages m JOIN users u ON u.id = m.user_id
       WHERE m.community_id = ? ORDER BY m.created_at ASC LIMIT ? OFFSET ?`,
      [community.id, limit, offset],
    );
    return R.ok(res, rows, { ...meta, total });
  } catch (err) { return R.serverError(res, err); }
}

// POST /communities/:id/messages
async function sendMessage(req, res) {
  try {
    const community = await resolveCommunity(req.params.id);
    if (!community) return R.notFound(res, 'Comunidade');
    const { content } = req.body;
    if (!content) return R.unprocessable(res, [{ field: 'content', message: 'Obrigatório.' }]);

    const [result] = await db.query(
      'INSERT INTO messages (community_id, user_id, content, created_at) VALUES (?, ?, ?, NOW())',
      [community.id, req.user.id, content],
    );
    const [rows] = await db.query('SELECT * FROM messages WHERE id = ?', [result.insertId]);
    return R.created(res, rows[0]);
  } catch (err) { return R.serverError(res, err); }
}

// DELETE /communities/:id/messages/:mid
async function deleteMessage(req, res) {
  try {
    const community = await resolveCommunity(req.params.id);
    if (!community) return R.notFound(res, 'Comunidade');
    const [msgs] = await db.query(
      'SELECT * FROM messages WHERE id = ? AND community_id = ?',
      [req.params.mid, community.id],
    );
    if (!msgs.length) return R.notFound(res, 'Mensagem');
    const msg = msgs[0];
    const m = await getMembership(community.id, req.user.id);
    if (msg.user_id !== req.user.id && (!m || m.role === 'member')) return R.forbidden(res);
    await db.query('DELETE FROM messages WHERE id = ?', [msg.id]);
    return R.noContent(res);
  } catch (err) { return R.serverError(res, err); }
}

module.exports = {
  listMyCommunities, listPublicCommunities, createCommunity, getCommunity,
  updateCommunity, deleteCommunity, listMembers, addMember, updateMemberRole,
  removeMember, listCommunityProjects, linkProject, unlinkProject,
  listCommunityDatasets, shareDataset, removeDatasetShare,
  listCommunityWorkflows, shareWorkflow, removeWorkflowShare,
  listMessages, sendMessage, deleteMessage,
};
