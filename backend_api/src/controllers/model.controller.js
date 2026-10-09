'use strict';

const { v4: uuidv4 } = require('uuid');
const db = require('../config/db.config');
const jobService = require('../services/job.service');
const R = require('../utils/response');

async function resolveModel(uuid) {
  const [rows] = await db.query('SELECT * FROM models WHERE uuid = ? AND deleted_at IS NULL', [uuid]);
  return rows[0] || null;
}

// GET /models
async function listModels(req, res) {
  try {
    const { technique_slug, status, project_id } = req.query;
    const conditions = ['m.user_id = ?', 'm.deleted_at IS NULL'];
    const params = [req.user.id];

    if (technique_slug) {
      conditions.push('m.technique_slug = ?');
      params.push(technique_slug);
    }
    if (status) { conditions.push('m.status = ?'); params.push(status); }
    if (project_id) {
      const [p] = await db.query('SELECT id FROM projects WHERE uuid = ?', [project_id]);
      if (p.length) {
        conditions.push('m.project_id = ?');
        params.push(p[0].id);
      }
    }

    const where = conditions.join(' AND ');
    const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total FROM models m WHERE ${where}`, params);
    const { offset, limit, meta } = R.paginate(req, total);

    const [rows] = await db.query(
      `SELECT m.uuid, m.name, m.technique_slug, m.status, m.framework,
              m.training_dataset_uuid, m.execution_uuid, m.created_at, m.updated_at
       FROM models m WHERE ${where} ORDER BY m.created_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    );
    return R.ok(res, rows, { ...meta, total });
  } catch (err) { return R.serverError(res, err); }
}

// GET /models/:id
async function getModel(req, res) {
  try {
    const model = await resolveModel(req.params.id);
    if (!model) return R.notFound(res, 'Modelo');
    if (model.user_id !== req.user.id && req.user.role !== 'admin') return R.forbidden(res);
    return R.ok(res, model);
  } catch (err) { return R.serverError(res, err); }
}

// PUT /models/:id
async function updateModel(req, res) {
  try {
    const model = await resolveModel(req.params.id);
    if (!model) return R.notFound(res, 'Modelo');
    if (model.user_id !== req.user.id && req.user.role !== 'admin') return R.forbidden(res);

    const { name, description, tags } = req.body;
    const fields = [];
    const values = [];
    if (name !== undefined) { fields.push('name = ?'); values.push(name); }
    if (description !== undefined) { fields.push('description = ?'); values.push(description); }
    if (tags !== undefined) { fields.push('tags = ?'); values.push(JSON.stringify(tags)); }
    if (!fields.length) return R.badRequest(res, 'Nenhum campo para atualizar.');

    values.push(model.id);
    await db.query(`UPDATE models SET ${fields.join(', ')}, updated_at = NOW() WHERE id = ?`, values);
    const [rows] = await db.query('SELECT * FROM models WHERE id = ?', [model.id]);
    return R.ok(res, rows[0]);
  } catch (err) { return R.serverError(res, err); }
}

// DELETE /models/:id
async function deleteModel(req, res) {
  try {
    const model = await resolveModel(req.params.id);
    if (!model) return R.notFound(res, 'Modelo');
    if (model.user_id !== req.user.id && req.user.role !== 'admin') return R.forbidden(res);
    await db.query('UPDATE models SET deleted_at = NOW() WHERE id = ?', [model.id]);
    return R.noContent(res);
  } catch (err) { return R.serverError(res, err); }
}

// GET /models/:id/metrics
async function getModelMetrics(req, res) {
  try {
    const model = await resolveModel(req.params.id);
    if (!model) return R.notFound(res, 'Modelo');
    if (model.user_id !== req.user.id && req.user.role !== 'admin') return R.forbidden(res);

    // metrics rows belong to execution_nodes; get model's execution_id → execution_nodes
    const [rows] = await db.query(
      `SELECT m.name AS metric_name, m.value AS metric_value, m.dataset_split AS split, m.created_at AS computed_at
       FROM metrics m
       JOIN execution_nodes en ON en.id = m.execution_node_id
       WHERE en.execution_id = ?
       ORDER BY m.created_at DESC`,
      [model.execution_id],
    );
    return R.ok(res, rows);
  } catch (err) { return R.serverError(res, err); }
}

// POST /models/:id/export
async function exportModel(req, res) {
  try {
    const model = await resolveModel(req.params.id);
    if (!model) return R.notFound(res, 'Modelo');
    if (model.user_id !== req.user.id && req.user.role !== 'admin') return R.forbidden(res);
    if (model.status !== 'ready') {
      return R.unprocessable(res, [{ field: 'status', message: 'Modelo precisa estar com status "ready" para exportar.' }]);
    }

    const { format } = req.body;
    const allowed_formats = ['pkl', 'onnx', 'joblib', 'pmml'];
    if (format && !allowed_formats.includes(format)) {
      return R.unprocessable(res, [{ field: 'format', message: `Formato inválido. Use: ${allowed_formats.join(', ')}.` }]);
    }

    const { id: jobId, uuid: jobUuid } = await jobService.createJob({
      job_type: 'export_model',
      user_id: req.user.id,
      model_id: model.id,
      payload: { model_uuid: model.uuid, format: format || 'pkl' },
    });

    return R.accepted(res, { job_id: jobUuid });
  } catch (err) { return R.serverError(res, err); }
}

module.exports = { listModels, getModel, updateModel, deleteModel, getModelMetrics, exportModel };
