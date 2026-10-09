'use strict';

const { v4: uuidv4 } = require('uuid');
const db = require('../config/db.config');
const jobService = require('../services/job.service');
const R = require('../utils/response');

async function resolveWorkflow(uuid) {
  const [rows] = await db.query('SELECT * FROM workflows WHERE uuid = ? AND deleted_at IS NULL', [uuid]);
  return rows[0] || null;
}

async function resolveExecution(uuid) {
  const [rows] = await db.query('SELECT * FROM executions WHERE uuid = ?', [uuid]);
  return rows[0] || null;
}

// GET /workflows/:wid/executions
async function listExecutions(req, res) {
  try {
    const workflow = await resolveWorkflow(req.params.wid);
    if (!workflow) return R.notFound(res, 'Workflow');

    const { status } = req.query;
    const conditions = ['e.workflow_id = ?'];
    const params = [workflow.id];
    if (status) { conditions.push('e.status = ?'); params.push(status); }

    const where = conditions.join(' AND ');
    const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total FROM executions e WHERE ${where}`, params);
    const { offset, limit, meta } = R.paginate(req, total);

    const [rows] = await db.query(
      `SELECT e.uuid, e.status, e.started_at, e.finished_at, e.triggered_by,
              e.parameters_override, e.created_at
       FROM executions e WHERE ${where} ORDER BY e.created_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    );
    return R.ok(res, rows, { ...meta, total });
  } catch (err) { return R.serverError(res, err); }
}

// POST /workflows/:wid/executions
//
// O worker Python processa um job por vez com o schema JobPayload:
//   { job_id, execution_id, node_id, slug, inputs, params }
// Por isso o backend decompõe o workflow em N jobs — um por nó —
// na ordem topológica (nós sem arestas de entrada primeiro).
// O worker executa cada job independentemente; a orquestração de
// dependências é resolvida aqui no momento do dispatch.
async function dispatchExecution(req, res) {
  try {
    const workflow = await resolveWorkflow(req.params.wid);
    if (!workflow) return R.notFound(res, 'Workflow');
    if (workflow.user_id !== req.user.id && req.user.role !== 'admin') return R.forbidden(res);

    // Carrega nós e arestas
    const [nodes] = await db.query(
      `SELECT wn.id, wn.node_key, wn.parameters, t.slug AS technique_slug
       FROM workflow_nodes wn
       JOIN techniques t ON t.id = wn.technique_id
       WHERE wn.workflow_id = ?`,
      [workflow.id],
    );
    if (nodes.length === 0) {
      return R.unprocessable(res, [{ field: 'workflow', message: 'O workflow não possui nós.' }]);
    }
    const [edges] = await db.query(
      'SELECT source_node_key, target_node_key FROM workflow_edges WHERE workflow_id = ?',
      [workflow.id],
    );

    // Ordena topologicamente (Kahn)
    const inDegree = Object.fromEntries(nodes.map((n) => [n.node_key, 0]));
    for (const e of edges) { inDegree[e.target_node_key] = (inDegree[e.target_node_key] || 0) + 1; }
    const queue = nodes.filter((n) => inDegree[n.node_key] === 0).map((n) => n.node_key);
    const sorted = [];
    while (queue.length) {
      const key = queue.shift();
      sorted.push(key);
      for (const e of edges) {
        if (e.source_node_key === key) {
          inDegree[e.target_node_key] -= 1;
          if (inDegree[e.target_node_key] === 0) queue.push(e.target_node_key);
        }
      }
    }
    if (sorted.length !== nodes.length) {
      return R.unprocessable(res, [{ field: 'workflow', message: 'Ciclo detectado no workflow.' }]);
    }

    const { parameters_override = {}, dataset_bindings = {} } = req.body;
    const execUuid = uuidv4();

    const [execResult] = await db.query(
      `INSERT INTO executions
         (uuid, workflow_id, user_id, status, parameters_override, triggered_by, created_at, updated_at)
       VALUES (?, ?, ?, 'queued', ?, 'user', NOW(), NOW())`,
      [execUuid, workflow.id, req.user.id, JSON.stringify(parameters_override)],
    );
    const executionId = execResult.insertId;

    // Cria execution_nodes e enfileira um job por nó na ordem topológica
    const nodeMap = Object.fromEntries(nodes.map((n) => [n.node_key, n]));
    const jobUuids = [];
    for (const nodeKey of sorted) {
      const node = nodeMap[nodeKey];
      const nodeParams = {
        ...(node.parameters ? JSON.parse(node.parameters) : {}),
        ...(parameters_override[nodeKey] || {}),
      };
      const inputs = dataset_bindings[nodeKey] || {};

      // Registra nó de execução com status pending
      const [enResult] = await db.query(
        `INSERT INTO execution_nodes (execution_id, workflow_node_id, status, created_at, updated_at)
         VALUES (?, ?, 'pending', NOW(), NOW())`,
        [executionId, node.id],
      );

      const { uuid: jobUuid } = await jobService.createJob({
        job_type: 'execute_node',
        user_id: req.user.id,
        execution_id: executionId,
        workflow_id: workflow.id,
        payload: {
          // Campos obrigatórios do JobPayload do worker Python
          execution_id: execUuid,
          node_id: nodeKey,
          slug: node.technique_slug,
          inputs,
          params: nodeParams,
          // Metadados extras para rastreabilidade
          execution_node_id: enResult.insertId,
          workflow_uuid: workflow.uuid,
        },
      });
      jobUuids.push(jobUuid);
    }

    return R.accepted(res, { execution_id: execUuid, job_ids: jobUuids });
  } catch (err) { return R.serverError(res, err); }
}

// GET /executions/:id
async function getExecution(req, res) {
  try {
    const execution = await resolveExecution(req.params.id);
    if (!execution) return R.notFound(res, 'Execução');
    if (execution.user_id !== req.user.id && req.user.role !== 'admin') return R.forbidden(res);

    // Inclui nós de execução
    const [nodes] = await db.query(
      `SELECT en.*, wn.node_key, wn.name AS node_name, t.slug AS technique_slug
       FROM execution_nodes en
       JOIN workflow_nodes wn ON wn.id = en.workflow_node_id
       JOIN techniques t ON t.id = wn.technique_id
       WHERE en.execution_id = ?
       ORDER BY en.started_at ASC`,
      [execution.id],
    );

    return R.ok(res, { ...execution, nodes });
  } catch (err) { return R.serverError(res, err); }
}

// POST /executions/:id/cancel
async function cancelExecution(req, res) {
  try {
    const execution = await resolveExecution(req.params.id);
    if (!execution) return R.notFound(res, 'Execução');
    if (execution.user_id !== req.user.id && req.user.role !== 'admin') return R.forbidden(res);

    if (!['queued', 'running'].includes(execution.status)) {
      return R.unprocessable(res, [{ field: 'status', message: `Não é possível cancelar uma execução com status "${execution.status}".` }]);
    }

    await db.query(
      "UPDATE executions SET status = 'cancelled', finished_at = NOW(), updated_at = NOW() WHERE id = ?",
      [execution.id],
    );

    // Publica cancelamento via Redis para o worker Python
    await jobService.createJob({
      job_type: 'cancel_execution',
      user_id: req.user.id,
      execution_id: execution.id,
      payload: { execution_uuid: execution.uuid },
    });

    const [rows] = await db.query('SELECT * FROM executions WHERE id = ?', [execution.id]);
    return R.ok(res, rows[0]);
  } catch (err) { return R.serverError(res, err); }
}

// GET /executions/:id/nodes
async function listExecutionNodes(req, res) {
  try {
    const execution = await resolveExecution(req.params.id);
    if (!execution) return R.notFound(res, 'Execução');
    if (execution.user_id !== req.user.id && req.user.role !== 'admin') return R.forbidden(res);

    const [rows] = await db.query(
      `SELECT en.*, wn.node_key, wn.name AS node_name, t.slug AS technique_slug,
              t.name AS technique_name
       FROM execution_nodes en
       JOIN workflow_nodes wn ON wn.id = en.workflow_node_id
       JOIN techniques t ON t.id = wn.technique_id
       WHERE en.execution_id = ?
       ORDER BY en.started_at ASC`,
      [execution.id],
    );
    return R.ok(res, rows);
  } catch (err) { return R.serverError(res, err); }
}

// GET /executions/:id/nodes/:nid
async function getExecutionNode(req, res) {
  try {
    const execution = await resolveExecution(req.params.id);
    if (!execution) return R.notFound(res, 'Execução');
    if (execution.user_id !== req.user.id && req.user.role !== 'admin') return R.forbidden(res);

    const [rows] = await db.query(
      `SELECT en.*, wn.node_key, wn.name AS node_name, t.slug AS technique_slug,
              t.name AS technique_name, t.output_schema
       FROM execution_nodes en
       JOIN workflow_nodes wn ON wn.id = en.workflow_node_id
       JOIN techniques t ON t.id = wn.technique_id
       WHERE en.id = ? AND en.execution_id = ?`,
      [req.params.nid, execution.id],
    );
    if (!rows.length) return R.notFound(res, 'Nó de execução');
    return R.ok(res, rows[0]);
  } catch (err) { return R.serverError(res, err); }
}

// GET /executions/:id/logs
async function getExecutionLogs(req, res) {
  try {
    const execution = await resolveExecution(req.params.id);
    if (!execution) return R.notFound(res, 'Execução');
    if (execution.user_id !== req.user.id && req.user.role !== 'admin') return R.forbidden(res);

    const [rows] = await db.query(
      `SELECT en.id, en.status, en.logs, en.error_message, en.started_at, en.finished_at,
              wn.node_key, wn.name AS node_name
       FROM execution_nodes en
       JOIN workflow_nodes wn ON wn.id = en.workflow_node_id
       WHERE en.execution_id = ?
       ORDER BY en.started_at ASC`,
      [execution.id],
    );
    return R.ok(res, rows);
  } catch (err) { return R.serverError(res, err); }
}

module.exports = {
  listExecutions, dispatchExecution, getExecution, cancelExecution,
  listExecutionNodes, getExecutionNode, getExecutionLogs,
};
