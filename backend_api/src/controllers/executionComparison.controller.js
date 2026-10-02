'use strict';

const { v4: uuidv4 } = require('uuid');
const db = require('../config/db.config');
const R = require('../utils/response');

// GET /execution-comparisons
async function listComparisons(req, res) {
  try {
    const [[{ total }]] = await db.query(
      'SELECT COUNT(*) AS total FROM execution_comparisons WHERE user_id = ?',
      [req.user.id],
    );
    const { offset, limit, meta } = R.paginate(req, total);
    const [rows] = await db.query(
      `SELECT uuid, name, description, execution_uuids, metric_names, created_at
       FROM execution_comparisons WHERE user_id = ?
       ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [req.user.id, limit, offset],
    );
    return R.ok(res, rows, { ...meta, total });
  } catch (err) { return R.serverError(res, err); }
}

// POST /execution-comparisons
async function createComparison(req, res) {
  try {
    const { name, description, execution_uuids, metric_names } = req.body;

    if (!Array.isArray(execution_uuids) || execution_uuids.length < 2) {
      return R.unprocessable(res, [{ field: 'execution_uuids', message: 'Forneça ao menos 2 UUIDs de execução.' }]);
    }

    // Verifica existência e permissão de todas as execuções
    for (const uuid of execution_uuids) {
      const [rows] = await db.query('SELECT user_id FROM executions WHERE uuid = ?', [uuid]);
      if (!rows.length) return R.notFound(res, `Execução ${uuid}`);
      if (rows[0].user_id !== req.user.id && req.user.role !== 'admin') return R.forbidden(res);
    }

    const compUuid = uuidv4();
    const [result] = await db.query(
      `INSERT INTO execution_comparisons
         (uuid, user_id, name, description, execution_uuids, metric_names, created_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      [
        compUuid, req.user.id,
        name || `Comparação ${Date.now()}`,
        description || null,
        JSON.stringify(execution_uuids),
        JSON.stringify(metric_names || []),
      ],
    );

    const [rows] = await db.query('SELECT * FROM execution_comparisons WHERE id = ?', [result.insertId]);
    return R.created(res, rows[0]);
  } catch (err) { return R.serverError(res, err); }
}

// GET /execution-comparisons/:id
async function getComparison(req, res) {
  try {
    const [rows] = await db.query(
      'SELECT * FROM execution_comparisons WHERE uuid = ? AND user_id = ?',
      [req.params.id, req.user.id],
    );
    if (!rows.length) return R.notFound(res, 'Comparação');
    const comp = rows[0];

    // Carrega métricas de cada execução para resposta enriquecida
    const executionUuids = JSON.parse(comp.execution_uuids);
    const metricNames = JSON.parse(comp.metric_names);
    const metricsData = {};

    for (const execUuid of executionUuids) {
      const [exec] = await db.query('SELECT id FROM executions WHERE uuid = ?', [execUuid]);
      if (!exec.length) { metricsData[execUuid] = []; continue; }

      const conditions = ['m.execution_id = ?'];
      const params = [exec[0].id];
      if (metricNames.length) {
        conditions.push(`m.metric_name IN (${metricNames.map(() => '?').join(', ')})`);
        params.push(...metricNames);
      }

      const [metrics] = await db.query(
        `SELECT m.metric_name, m.metric_value, m.split, wn.node_key
         FROM metrics m
         LEFT JOIN execution_nodes en ON en.id = m.execution_node_id
         LEFT JOIN workflow_nodes wn ON wn.id = en.workflow_node_id
         WHERE ${conditions.join(' AND ')} ORDER BY wn.node_key, m.metric_name`,
        params,
      );
      metricsData[execUuid] = metrics;
    }

    return R.ok(res, { ...comp, metrics_data: metricsData });
  } catch (err) { return R.serverError(res, err); }
}

// DELETE /execution-comparisons/:id
async function deleteComparison(req, res) {
  try {
    const [rows] = await db.query(
      'SELECT id FROM execution_comparisons WHERE uuid = ? AND user_id = ?',
      [req.params.id, req.user.id],
    );
    if (!rows.length) return R.notFound(res, 'Comparação');
    await db.query('DELETE FROM execution_comparisons WHERE id = ?', [rows[0].id]);
    return R.noContent(res);
  } catch (err) { return R.serverError(res, err); }
}

module.exports = { listComparisons, createComparison, getComparison, deleteComparison };
