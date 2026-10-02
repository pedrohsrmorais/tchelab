'use strict';

const db = require('../config/db.config');
const shapeValidator = require('../services/shapeValidator.service');
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

// GET /workflows/:wid/edges
async function listEdges(req, res) {
  try {
    const workflow = await resolveWorkflow(req.params.wid);
    if (!workflow) return R.notFound(res, 'Workflow');
    const [rows] = await db.query(
      'SELECT * FROM workflow_edges WHERE workflow_id = ? ORDER BY created_at ASC',
      [workflow.id],
    );
    return R.ok(res, rows);
  } catch (err) { return R.serverError(res, err); }
}

// POST /workflows/:wid/edges
async function createEdge(req, res) {
  try {
    const workflow = await resolveWorkflow(req.params.wid);
    if (!workflow) return R.notFound(res, 'Workflow');
    if (workflow.user_id !== req.user.id && req.user.role !== 'admin') return R.forbidden(res);

    const { source_node_key, source_port, target_node_key, target_port } = req.body;

    const missing = [];
    if (!source_node_key) missing.push({ field: 'source_node_key', message: 'Obrigatório.' });
    if (!source_port) missing.push({ field: 'source_port', message: 'Obrigatório.' });
    if (!target_node_key) missing.push({ field: 'target_node_key', message: 'Obrigatório.' });
    if (!target_port) missing.push({ field: 'target_port', message: 'Obrigatório.' });
    if (missing.length) return R.unprocessable(res, missing);

    // Evita self-loop
    if (source_node_key === target_node_key) {
      return R.unprocessable(res, [{ field: 'target_node_key', message: 'Uma aresta não pode conectar um nó a si mesmo.' }]);
    }

    // Verifica duplicidade
    const [dup] = await db.query(
      `SELECT id FROM workflow_edges WHERE workflow_id = ? AND source_node_key = ? AND source_port = ?
       AND target_node_key = ? AND target_port = ?`,
      [workflow.id, source_node_key, source_port, target_node_key, target_port],
    );
    if (dup.length) {
      return R.unprocessable(res, [{ field: 'source_port', message: 'Esta conexão já existe no workflow.' }]);
    }

    // Executa todas as 8 camadas de validação via ShapeValidatorService
    const edge = { source_node_key, source_port, target_node_key, target_port };
    const validation = await shapeValidator.validateEdge(workflow.id, edge);
    if (!validation.valid) {
      return R.unprocessable(res, [{ field: 'edge', message: validation.error }]);
    }

    await db.query(
      `INSERT INTO workflow_edges (workflow_id, source_node_key, source_port, target_node_key, target_port, created_at)
       VALUES (?, ?, ?, ?, ?, NOW())`,
      [workflow.id, source_node_key, source_port, target_node_key, target_port],
    );

    await updateWorkflowDefinition(workflow.id);

    const [rows] = await db.query(
      `SELECT * FROM workflow_edges WHERE workflow_id = ? AND source_node_key = ? AND source_port = ?
       AND target_node_key = ? AND target_port = ? ORDER BY created_at DESC LIMIT 1`,
      [workflow.id, source_node_key, source_port, target_node_key, target_port],
    );
    return R.created(res, rows[0]);
  } catch (err) { return R.serverError(res, err); }
}

// DELETE /workflows/:wid/edges/:eid
async function deleteEdge(req, res) {
  try {
    const workflow = await resolveWorkflow(req.params.wid);
    if (!workflow) return R.notFound(res, 'Workflow');
    if (workflow.user_id !== req.user.id && req.user.role !== 'admin') return R.forbidden(res);

    const [edges] = await db.query(
      'SELECT id FROM workflow_edges WHERE id = ? AND workflow_id = ?',
      [req.params.eid, workflow.id],
    );
    if (!edges.length) return R.notFound(res, 'Aresta');

    await db.query('DELETE FROM workflow_edges WHERE id = ?', [edges[0].id]);
    await updateWorkflowDefinition(workflow.id);
    return R.noContent(res);
  } catch (err) { return R.serverError(res, err); }
}

// POST /workflows/:wid/validate
async function validateWorkflow(req, res) {
  try {
    const workflow = await resolveWorkflow(req.params.wid);
    if (!workflow) return R.notFound(res, 'Workflow');

    const [edges] = await db.query(
      'SELECT * FROM workflow_edges WHERE workflow_id = ?',
      [workflow.id],
    );

    const results = [];
    let allValid = true;
    for (const edge of edges) {
      const validation = await shapeValidator.validateEdge(workflow.id, edge);
      results.push({
        edge_id: edge.id,
        source: `${edge.source_node_key}:${edge.source_port}`,
        target: `${edge.target_node_key}:${edge.target_port}`,
        valid: validation.valid,
        error: validation.error || null,
      });
      if (!validation.valid) allValid = false;
    }

    return R.ok(res, { valid: allValid, edges: results });
  } catch (err) { return R.serverError(res, err); }
}

module.exports = { listEdges, createEdge, deleteEdge, validateWorkflow };
