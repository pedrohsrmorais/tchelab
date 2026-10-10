'use strict';

const { v4: uuidv4 } = require('uuid');
const db = require('../config/db.config');
const R = require('../utils/response');

async function resolveWorkflow(uuid) {
  const [rows] = await db.query('SELECT * FROM workflows WHERE uuid = ? AND deleted_at IS NULL', [uuid]);
  return rows[0] || null;
}

async function updateWorkflowDefinition(workflowId) {
  const [nodes] = await db.query('SELECT * FROM workflow_nodes WHERE workflow_id = ?', [workflowId]);
  const [edges] = await db.query('SELECT * FROM workflow_edges WHERE workflow_id = ?', [workflowId]);
  await db.query(
    'UPDATE workflows SET definition = ?, updated_at = NOW() WHERE id = ?',
    [JSON.stringify({ nodes, edges }), workflowId],
  );
}

// GET /workflows/:wid/nodes
async function listNodes(req, res) {
  try {
    const workflow = await resolveWorkflow(req.params.wid);
    if (!workflow) return R.notFound(res, 'Workflow');
    const [rows] = await db.query(
      `SELECT wn.*, t.slug AS technique_slug, t.name AS technique_name,
              t.input_schema, t.output_schema, t.parameter_schema
       FROM workflow_nodes wn
       JOIN techniques t ON t.id = wn.technique_id
       WHERE wn.workflow_id = ?
       ORDER BY wn.created_at ASC`,
      [workflow.id],
    );
    return R.ok(res, rows);
  } catch (err) { return R.serverError(res, err); }
}

// POST /workflows/:wid/nodes
async function addNode(req, res) {
  try {
    const workflow = await resolveWorkflow(req.params.wid);
    if (!workflow) return R.notFound(res, 'Workflow');
    if (workflow.user_id !== req.user.id && req.user.role !== 'admin') return R.forbidden(res);

    const { technique_id, node_key, name, parameters, position_x, position_y } = req.body;
    if (!technique_id || !node_key) {
      return R.unprocessable(res, [
        { field: 'technique_id', message: 'Obrigatório.' },
        { field: 'node_key', message: 'Obrigatório.' },
      ].filter((f) => !req.body[f.field]));
    }

    // Valida que technique existe
    const [techs] = await db.query('SELECT * FROM techniques WHERE uuid = ? OR id = ?', [technique_id, technique_id]);
    if (!techs.length) return R.notFound(res, 'Técnica');
    const tech = techs[0];

    // Técnica desativada (fora da lista beta) não pode virar nó — mesmo
    // que alguém chame esta rota direto, sem passar pelo editor (que já
    // nem lista as desativadas via GET /techniques).
    if (!tech.is_custom && !tech.active) {
      return R.unprocessable(res, [
        { field: 'technique_id', message: `Técnica "${tech.name}" ainda não está disponível nesta versão.` },
      ]);
    }

    // Valida node_key único no workflow
    const [existing] = await db.query(
      'SELECT id FROM workflow_nodes WHERE workflow_id = ? AND node_key = ?',
      [workflow.id, node_key],
    );
    if (existing.length) {
      return R.unprocessable(res, [{ field: 'node_key', message: `node_key "${node_key}" já existe neste workflow.` }]);
    }

    const [result] = await db.query(
      `INSERT INTO workflow_nodes (workflow_id, node_key, technique_id, name, parameters, position_x, position_y, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [workflow.id, node_key, tech.id, name || null,
        JSON.stringify(parameters || {}),
        position_x || 0, position_y || 0],
    );

    await updateWorkflowDefinition(workflow.id);
    const [rows] = await db.query('SELECT * FROM workflow_nodes WHERE id = ?', [result.insertId]);
    return R.created(res, rows[0]);
  } catch (err) { return R.serverError(res, err); }
}

// GET /workflows/:wid/nodes/:nid
async function getNode(req, res) {
  try {
    const workflow = await resolveWorkflow(req.params.wid);
    if (!workflow) return R.notFound(res, 'Workflow');
    const [rows] = await db.query(
      `SELECT wn.*, t.slug, t.name AS technique_name, t.input_schema, t.output_schema, t.parameter_schema
       FROM workflow_nodes wn
       JOIN techniques t ON t.id = wn.technique_id
       WHERE wn.workflow_id = ? AND wn.node_key = ?`,
      [workflow.id, req.params.nid],
    );
    if (!rows.length) return R.notFound(res, 'Nó');
    return R.ok(res, rows[0]);
  } catch (err) { return R.serverError(res, err); }
}

// PUT /workflows/:wid/nodes/:nid
async function updateNode(req, res) {
  try {
    const workflow = await resolveWorkflow(req.params.wid);
    if (!workflow) return R.notFound(res, 'Workflow');
    if (workflow.user_id !== req.user.id && req.user.role !== 'admin') return R.forbidden(res);

    const [nodes] = await db.query(
      'SELECT * FROM workflow_nodes WHERE workflow_id = ? AND node_key = ?',
      [workflow.id, req.params.nid],
    );
    if (!nodes.length) return R.notFound(res, 'Nó');
    const node = nodes[0];

    const { parameters, position_x, position_y, name } = req.body;
    await db.query(
      `UPDATE workflow_nodes SET
         parameters = COALESCE(?, parameters),
         position_x = COALESCE(?, position_x),
         position_y = COALESCE(?, position_y),
         name = COALESCE(?, name),
         updated_at = NOW()
       WHERE id = ?`,
      [
        parameters ? JSON.stringify(parameters) : null,
        position_x !== undefined ? position_x : null,
        position_y !== undefined ? position_y : null,
        name || null,
        node.id,
      ],
    );

    await updateWorkflowDefinition(workflow.id);
    const [rows] = await db.query('SELECT * FROM workflow_nodes WHERE id = ?', [node.id]);
    return R.ok(res, rows[0]);
  } catch (err) { return R.serverError(res, err); }
}

// DELETE /workflows/:wid/nodes/:nid
async function deleteNode(req, res) {
  try {
    const workflow = await resolveWorkflow(req.params.wid);
    if (!workflow) return R.notFound(res, 'Workflow');
    if (workflow.user_id !== req.user.id && req.user.role !== 'admin') return R.forbidden(res);

    const [nodes] = await db.query(
      'SELECT id FROM workflow_nodes WHERE workflow_id = ? AND node_key = ?',
      [workflow.id, req.params.nid],
    );
    if (!nodes.length) return R.notFound(res, 'Nó');

    await db.query(
      `DELETE FROM workflow_edges WHERE workflow_id = ? AND (source_node_key = ? OR target_node_key = ?)`,
      [workflow.id, req.params.nid, req.params.nid],
    );
    await db.query('DELETE FROM workflow_nodes WHERE id = ?', [nodes[0].id]);
    await updateWorkflowDefinition(workflow.id);
    return R.noContent(res);
  } catch (err) { return R.serverError(res, err); }
}

module.exports = { listNodes, addNode, getNode, updateNode, deleteNode };
