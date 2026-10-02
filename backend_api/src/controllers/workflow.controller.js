'use strict';

const { v4: uuidv4 } = require('uuid');
const db = require('../config/db.config');
const R = require('../utils/response');

async function resolveWorkflow(uuid) {
  const [rows] = await db.query('SELECT * FROM workflows WHERE uuid = ? AND deleted_at IS NULL', [uuid]);
  return rows[0] || null;
}

async function buildDefinition(workflowId) {
  const [nodes] = await db.query('SELECT * FROM workflow_nodes WHERE workflow_id = ?', [workflowId]);
  const [edges] = await db.query('SELECT * FROM workflow_edges WHERE workflow_id = ?', [workflowId]);
  return { nodes, edges };
}

// GET /workflows
async function listWorkflows(req, res) {
  try {
    const { status, visibility, is_template, project_id, source_article_analysis_id } = req.query;
    const conditions = ['w.user_id = ?', 'w.deleted_at IS NULL'];
    const params = [req.user.id];

    if (status) { conditions.push('w.status = ?'); params.push(status); }
    if (visibility) { conditions.push('w.visibility = ?'); params.push(visibility); }
    if (is_template !== undefined) { conditions.push('w.is_template = ?'); params.push(is_template === 'true' ? 1 : 0); }
    if (source_article_analysis_id) { conditions.push('w.source_article_analysis_id = ?'); params.push(source_article_analysis_id); }
    if (project_id) {
      const [p] = await db.query('SELECT id FROM projects WHERE uuid = ?', [project_id]);
      if (p.length) {
        conditions.push('w.id IN (SELECT workflow_id FROM project_workflows WHERE project_id = ?)');
        params.push(p[0].id);
      }
    }

    const where = conditions.join(' AND ');
    const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total FROM workflows w WHERE ${where}`, params);
    const { offset, limit, meta } = R.paginate(req, total);

    const [rows] = await db.query(
      `SELECT w.id, w.uuid, w.name, w.status, w.visibility, w.is_template,
              w.source_article_analysis_id, w.fork_from_workflow_id, w.created_at, w.updated_at
       FROM workflows w WHERE ${where} ORDER BY w.updated_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    );
    return R.ok(res, rows, { ...meta, total });
  } catch (err) { return R.serverError(res, err); }
}

// GET /workflows/templates
async function listTemplates(req, res) {
  try {
    const [rows] = await db.query(
      `SELECT w.*, wt.domain, wt.data_type, wt.analytical_order
       FROM workflows w
       LEFT JOIN workflow_templates wt ON wt.workflow_id = w.id
       WHERE w.is_template = 1 AND w.visibility = 'public' AND w.deleted_at IS NULL
       ORDER BY w.created_at DESC`,
    );
    return R.ok(res, rows);
  } catch (err) { return R.serverError(res, err); }
}

// POST /workflows
async function createWorkflow(req, res) {
  try {
    const { name, description, visibility, tags, definition } = req.body;
    if (!name) return R.unprocessable(res, [{ field: 'name', message: 'Obrigatório.' }]);

    const uuid = uuidv4();
    const [result] = await db.query(
      `INSERT INTO workflows (uuid, user_id, name, description, visibility, tags, status, definition, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, NOW(), NOW())`,
      [uuid, req.user.id, name, description || null, visibility || 'private',
        JSON.stringify(tags || []), JSON.stringify(definition || {})],
    );
    const [rows] = await db.query('SELECT * FROM workflows WHERE id = ?', [result.insertId]);
    return R.created(res, rows[0]);
  } catch (err) { return R.serverError(res, err); }
}

// POST /workflows/:id/fork
async function forkWorkflow(req, res) {
  try {
    const original = await resolveWorkflow(req.params.id);
    if (!original) return R.notFound(res, 'Workflow');

    const uuid = uuidv4();
    const [forkResult] = await db.query(
      `INSERT INTO workflows (uuid, user_id, name, description, visibility, tags, status,
          definition, fork_from_workflow_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'private', ?, 'draft', ?, ?, NOW(), NOW())`,
      [uuid, req.user.id, `Fork de ${original.name}`, original.description,
        original.tags, original.definition, original.id],
    );

    // Copia nós e arestas
    const [nodes] = await db.query('SELECT * FROM workflow_nodes WHERE workflow_id = ?', [original.id]);
    for (const node of nodes) {
      await db.query(
        `INSERT INTO workflow_nodes (workflow_id, node_key, technique_id, name, parameters, position_x, position_y, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [forkResult.insertId, node.node_key, node.technique_id, node.name, node.parameters, node.position_x, node.position_y],
      );
    }
    const [edges] = await db.query('SELECT * FROM workflow_edges WHERE workflow_id = ?', [original.id]);
    for (const edge of edges) {
      await db.query(
        `INSERT INTO workflow_edges (workflow_id, source_node_key, source_port, target_node_key, target_port, created_at)
         VALUES (?, ?, ?, ?, ?, NOW())`,
        [forkResult.insertId, edge.source_node_key, edge.source_port, edge.target_node_key, edge.target_port],
      );
    }

    const [rows] = await db.query('SELECT * FROM workflows WHERE id = ?', [forkResult.insertId]);
    return R.created(res, rows[0]);
  } catch (err) { return R.serverError(res, err); }
}

// GET /workflows/:id
async function getWorkflow(req, res) {
  try {
    const workflow = await resolveWorkflow(req.params.id);
    if (!workflow) return R.notFound(res, 'Workflow');
    const { nodes, edges } = await buildDefinition(workflow.id);
    return R.ok(res, { ...workflow, nodes, edges });
  } catch (err) { return R.serverError(res, err); }
}

// PUT /workflows/:id
async function updateWorkflow(req, res) {
  try {
    const workflow = await resolveWorkflow(req.params.id);
    if (!workflow) return R.notFound(res, 'Workflow');
    if (workflow.user_id !== req.user.id && req.user.role !== 'admin') return R.forbidden(res);

    const allowed = ['name', 'description', 'visibility', 'status', 'tags'];
    const fields = [];
    const values = [];
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        fields.push(`${key} = ?`);
        values.push(key === 'tags' ? JSON.stringify(req.body[key]) : req.body[key]);
      }
    }
    if (!fields.length) return R.badRequest(res, 'Nenhum campo para atualizar.');
    values.push(workflow.id);
    await db.query(`UPDATE workflows SET ${fields.join(', ')}, updated_at = NOW() WHERE id = ?`, values);
    const [rows] = await db.query('SELECT * FROM workflows WHERE id = ?', [workflow.id]);
    return R.ok(res, rows[0]);
  } catch (err) { return R.serverError(res, err); }
}

// DELETE /workflows/:id
async function deleteWorkflow(req, res) {
  try {
    const workflow = await resolveWorkflow(req.params.id);
    if (!workflow) return R.notFound(res, 'Workflow');
    if (workflow.user_id !== req.user.id && req.user.role !== 'admin') return R.forbidden(res);
    await db.query('UPDATE workflows SET deleted_at = NOW() WHERE id = ?', [workflow.id]);
    return R.noContent(res);
  } catch (err) { return R.serverError(res, err); }
}

// POST /workflows/:id/snapshot
async function saveSnapshot(req, res) {
  try {
    const workflow = await resolveWorkflow(req.params.id);
    if (!workflow) return R.notFound(res, 'Workflow');

    const { label, description } = req.body;
    const { nodes, edges } = await buildDefinition(workflow.id);
    const definition = JSON.stringify({ nodes, edges });

    const [result] = await db.query(
      `INSERT INTO workflow_versions (workflow_id, label, description, definition, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, NOW())`,
      [workflow.id, label || `Versão ${Date.now()}`, description || null, definition, req.user.id],
    );
    const [rows] = await db.query('SELECT * FROM workflow_versions WHERE id = ?', [result.insertId]);
    return R.created(res, rows[0]);
  } catch (err) { return R.serverError(res, err); }
}

// GET /workflows/:id/versions
async function listVersions(req, res) {
  try {
    const workflow = await resolveWorkflow(req.params.id);
    if (!workflow) return R.notFound(res, 'Workflow');
    const [rows] = await db.query(
      'SELECT id, label, description, created_by, created_at FROM workflow_versions WHERE workflow_id = ? ORDER BY created_at DESC',
      [workflow.id],
    );
    return R.ok(res, rows);
  } catch (err) { return R.serverError(res, err); }
}

// GET /workflows/:id/versions/:vid
async function getVersion(req, res) {
  try {
    const workflow = await resolveWorkflow(req.params.id);
    if (!workflow) return R.notFound(res, 'Workflow');
    const [rows] = await db.query(
      'SELECT * FROM workflow_versions WHERE id = ? AND workflow_id = ?',
      [req.params.vid, workflow.id],
    );
    if (!rows.length) return R.notFound(res, 'Versão');
    return R.ok(res, rows[0]);
  } catch (err) { return R.serverError(res, err); }
}

// POST /workflows/:id/versions/:vid/restore
async function restoreVersion(req, res) {
  try {
    const workflow = await resolveWorkflow(req.params.id);
    if (!workflow) return R.notFound(res, 'Workflow');

    const [versions] = await db.query(
      'SELECT * FROM workflow_versions WHERE id = ? AND workflow_id = ?',
      [req.params.vid, workflow.id],
    );
    if (!versions.length) return R.notFound(res, 'Versão');

    // Salva snapshot automático antes de restaurar
    const { nodes: curNodes, edges: curEdges } = await buildDefinition(workflow.id);
    await db.query(
      `INSERT INTO workflow_versions (workflow_id, label, description, definition, created_by, created_at)
       VALUES (?, 'Auto-save antes de restaurar', ?, ?, ?, NOW())`,
      [workflow.id, null, JSON.stringify({ nodes: curNodes, edges: curEdges }), req.user.id],
    );

    // Restaura definition
    await db.query(
      'UPDATE workflows SET definition = ?, updated_at = NOW() WHERE id = ?',
      [versions[0].definition, workflow.id],
    );

    return R.ok(res, { message: 'Workflow restaurado para a versão selecionada.' });
  } catch (err) { return R.serverError(res, err); }
}

// PUT /workflows/:id/template
async function setTemplate(req, res) {
  try {
    const workflow = await resolveWorkflow(req.params.id);
    if (!workflow) return R.notFound(res, 'Workflow');
    if (workflow.user_id !== req.user.id && req.user.role !== 'admin') return R.forbidden(res);

    const { is_template, domain, data_type, analytical_order } = req.body;
    await db.query(
      'UPDATE workflows SET is_template = ?, updated_at = NOW() WHERE id = ?',
      [is_template ? 1 : 0, workflow.id],
    );

    if (is_template) {
      await db.query(
        `INSERT INTO workflow_templates (workflow_id, domain, data_type, analytical_order)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE domain = VALUES(domain), data_type = VALUES(data_type),
         analytical_order = VALUES(analytical_order)`,
        [workflow.id, domain || null, data_type || null, analytical_order || null],
      );
    }

    return R.ok(res, { message: is_template ? 'Workflow marcado como template.' : 'Template removido.' });
  } catch (err) { return R.serverError(res, err); }
}

module.exports = {
  listWorkflows, listTemplates, createWorkflow, forkWorkflow, getWorkflow,
  updateWorkflow, deleteWorkflow, saveSnapshot, listVersions, getVersion,
  restoreVersion, setTemplate,
};
