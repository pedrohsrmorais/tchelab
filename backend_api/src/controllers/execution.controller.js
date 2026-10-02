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
async function dispatchExecution(req, res) {
  try {
    const workflow = await resolveWorkflow(req.params.wid);
    if (!workflow) return R.notFound(res, 'Workflow');
    if (workflow.user_id !== req.user.id && req.user.role !== 'admin') return R.forbidden(res);

    // Verifica se workflow tem nós
    const [[{ nodeCount }]] = await db.query(
      'SELECT COUNT(*) AS nodeCount FROM workflow_nodes WHERE workflow_id = ?',
      [workflow.id],
    );
    if (nodeCount === 0) {
      return R.unprocessable(res, [{ field: 'workflow', message: 'O workflow não possui nós.' }]);
    }

    const { parameters_override, dataset_bindings } = req.body;
    const execUuid = uuidv4();

    const [result] = await db.query(
      `INSERT INTO executions
         (uuid, workflow_id, user_id, status, parameters_override, triggered_by, created_at, updated_at)
       VALUES (?, ?, ?, 'pending', ?, 'user', NOW(), NOW())`,
      [execUuid, workflow.id, req.user.id, JSON.stringify(parameters_override || {})],
    );

    const { id: jobId, uuid: jobUuid } = await jobService.createJob({
      job_type: 'run_workflow',
      user_id: req.user.id,
      workflow_id: workflow.id,
      execution_id: result.insertId,
      payload: {
        execution_uuid: execUuid,
        workflow_uuid: workflow.uuid,
        parameters_override: parameters_override || {},
        dataset_bindings: dataset_bindings || {},
      },
    });

    return R.accepted(res, { execution_id: execUuid, job_id: jobUuid });
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

    if (!['pending', 'running'].includes(execution.status)) {
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
