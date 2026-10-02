'use strict';

const db = require('../config/db.config');
const R = require('../utils/response');

// GET /executions/:id/metrics
async function getExecutionMetrics(req, res) {
  try {
    const [execs] = await db.query('SELECT * FROM executions WHERE uuid = ?', [req.params.id]);
    if (!execs.length) return R.notFound(res, 'Execução');
    const execution = execs[0];
    if (execution.user_id !== req.user.id && req.user.role !== 'admin') return R.forbidden(res);

    const { node_key, metric_name, split } = req.query;
    const conditions = ['m.execution_id = ?'];
    const params = [execution.id];

    if (node_key) {
      // Filtra por nó via JOIN com execution_nodes e workflow_nodes
      conditions.push(`m.execution_node_id IN (
        SELECT en.id FROM execution_nodes en
        JOIN workflow_nodes wn ON wn.id = en.workflow_node_id
        WHERE en.execution_id = ? AND wn.node_key = ?
      )`);
      params.push(execution.id, node_key);
    }
    if (metric_name) { conditions.push('m.metric_name = ?'); params.push(metric_name); }
    if (split) { conditions.push('m.split = ?'); params.push(split); }

    const where = conditions.join(' AND ');
    const [rows] = await db.query(
      `SELECT m.id, m.metric_name, m.metric_value, m.split, m.computed_at,
              en.id AS execution_node_id, wn.node_key
       FROM metrics m
       LEFT JOIN execution_nodes en ON en.id = m.execution_node_id
       LEFT JOIN workflow_nodes wn ON wn.id = en.workflow_node_id
       WHERE ${where}
       ORDER BY m.computed_at ASC`,
      params,
    );
    return R.ok(res, rows);
  } catch (err) { return R.serverError(res, err); }
}

// GET /executions/:id/nodes/:nid/metrics
async function getNodeMetrics(req, res) {
  try {
    const [execs] = await db.query('SELECT * FROM executions WHERE uuid = ?', [req.params.id]);
    if (!execs.length) return R.notFound(res, 'Execução');
    const execution = execs[0];
    if (execution.user_id !== req.user.id && req.user.role !== 'admin') return R.forbidden(res);

    const [nodes] = await db.query(
      'SELECT en.* FROM execution_nodes en WHERE en.id = ? AND en.execution_id = ?',
      [req.params.nid, execution.id],
    );
    if (!nodes.length) return R.notFound(res, 'Nó de execução');

    const { split } = req.query;
    const conditions = ['m.execution_node_id = ?'];
    const params = [nodes[0].id];
    if (split) { conditions.push('m.split = ?'); params.push(split); }

    const [rows] = await db.query(
      `SELECT m.metric_name, m.metric_value, m.split, m.computed_at
       FROM metrics m WHERE ${conditions.join(' AND ')} ORDER BY m.metric_name ASC`,
      params,
    );
    return R.ok(res, rows);
  } catch (err) { return R.serverError(res, err); }
}

// POST /metrics/compare
async function compareMetrics(req, res) {
  try {
    const { execution_uuids, metric_names } = req.body;

    if (!Array.isArray(execution_uuids) || execution_uuids.length < 2) {
      return R.unprocessable(res, [{ field: 'execution_uuids', message: 'Forneça ao menos 2 UUIDs de execução.' }]);
    }
    if (!Array.isArray(metric_names) || metric_names.length === 0) {
      return R.unprocessable(res, [{ field: 'metric_names', message: 'Forneça ao menos 1 nome de métrica.' }]);
    }

    // Resolve execuções e verifica permissão
    const executions = [];
    for (const uuid of execution_uuids) {
      const [rows] = await db.query('SELECT * FROM executions WHERE uuid = ?', [uuid]);
      if (!rows.length) return R.notFound(res, `Execução ${uuid}`);
      if (rows[0].user_id !== req.user.id && req.user.role !== 'admin') return R.forbidden(res);
      executions.push(rows[0]);
    }

    // Agrupa métricas por execução
    const result = {};
    for (const exec of executions) {
      const placeholders = metric_names.map(() => '?').join(', ');
      const [metrics] = await db.query(
        `SELECT m.metric_name, m.metric_value, m.split, wn.node_key
         FROM metrics m
         LEFT JOIN execution_nodes en ON en.id = m.execution_node_id
         LEFT JOIN workflow_nodes wn ON wn.id = en.workflow_node_id
         WHERE m.execution_id = ? AND m.metric_name IN (${placeholders})
         ORDER BY wn.node_key, m.metric_name`,
        [exec.id, ...metric_names],
      );
      result[exec.uuid] = metrics;
    }

    return R.ok(res, { executions: execution_uuids, metrics: result });
  } catch (err) { return R.serverError(res, err); }
}

module.exports = { getExecutionMetrics, getNodeMetrics, compareMetrics };
