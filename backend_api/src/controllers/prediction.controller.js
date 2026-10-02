'use strict';

const { v4: uuidv4 } = require('uuid');
const db = require('../config/db.config');
const jobService = require('../services/job.service');
const R = require('../utils/response');

async function resolvePrediction(uuid) {
  const [rows] = await db.query('SELECT * FROM predictions WHERE uuid = ?', [uuid]);
  return rows[0] || null;
}

// GET /predictions
async function listPredictions(req, res) {
  try {
    const { model_id, status, dataset_id } = req.query;
    const conditions = ['p.user_id = ?'];
    const params = [req.user.id];

    if (model_id) {
      const [m] = await db.query('SELECT id FROM models WHERE uuid = ?', [model_id]);
      if (m.length) { conditions.push('p.model_id = ?'); params.push(m[0].id); }
    }
    if (dataset_id) {
      const [d] = await db.query('SELECT id FROM datasets WHERE uuid = ?', [dataset_id]);
      if (d.length) { conditions.push('p.dataset_id = ?'); params.push(d[0].id); }
    }
    if (status) { conditions.push('p.status = ?'); params.push(status); }

    const where = conditions.join(' AND ');
    const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total FROM predictions p WHERE ${where}`, params);
    const { offset, limit, meta } = R.paginate(req, total);

    const [rows] = await db.query(
      `SELECT p.uuid, p.status, p.created_at,
              m.uuid AS model_uuid, m.name AS model_name, m.technique_slug,
              d.uuid AS dataset_uuid, d.name AS dataset_name
       FROM predictions p
       JOIN models m ON m.id = p.model_id
       JOIN datasets d ON d.id = p.dataset_id
       WHERE ${where} ORDER BY p.created_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    );
    return R.ok(res, rows, { ...meta, total });
  } catch (err) { return R.serverError(res, err); }
}

// POST /predictions
async function createPrediction(req, res) {
  try {
    const { model_id, dataset_id, parameters } = req.body;

    if (!model_id || !dataset_id) {
      const missing = [];
      if (!model_id) missing.push({ field: 'model_id', message: 'Obrigatório.' });
      if (!dataset_id) missing.push({ field: 'dataset_id', message: 'Obrigatório.' });
      return R.unprocessable(res, missing);
    }

    const [models] = await db.query('SELECT * FROM models WHERE uuid = ? AND deleted_at IS NULL', [model_id]);
    if (!models.length) return R.notFound(res, 'Modelo');
    const model = models[0];

    if (model.status !== 'trained') {
      return R.unprocessable(res, [{ field: 'model_id', message: 'Modelo precisa estar com status "trained".' }]);
    }

    const [datasets] = await db.query('SELECT * FROM datasets WHERE uuid = ? AND deleted_at IS NULL', [dataset_id]);
    if (!datasets.length) return R.notFound(res, 'Dataset');
    const dataset = datasets[0];

    const predUuid = uuidv4();
    const [result] = await db.query(
      `INSERT INTO predictions (uuid, user_id, model_id, dataset_id, status, parameters, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'pending', ?, NOW(), NOW())`,
      [predUuid, req.user.id, model.id, dataset.id, JSON.stringify(parameters || {})],
    );

    const { id: jobId, uuid: jobUuid } = await jobService.createJob({
      job_type: 'run_prediction',
      user_id: req.user.id,
      prediction_id: result.insertId,
      payload: {
        prediction_uuid: predUuid,
        model_uuid: model.uuid,
        dataset_uuid: dataset.uuid,
        parameters: parameters || {},
      },
    });

    return R.accepted(res, { prediction_id: predUuid, job_id: jobUuid });
  } catch (err) { return R.serverError(res, err); }
}

// GET /predictions/:id
async function getPrediction(req, res) {
  try {
    const prediction = await resolvePrediction(req.params.id);
    if (!prediction) return R.notFound(res, 'Predição');
    if (prediction.user_id !== req.user.id && req.user.role !== 'admin') return R.forbidden(res);

    const [models] = await db.query('SELECT uuid, name, technique_slug FROM models WHERE id = ?', [prediction.model_id]);
    const [datasets] = await db.query('SELECT uuid, name FROM datasets WHERE id = ?', [prediction.dataset_id]);

    return R.ok(res, {
      ...prediction,
      model: models[0] || null,
      dataset: datasets[0] || null,
    });
  } catch (err) { return R.serverError(res, err); }
}

// GET /predictions/:id/results
async function getPredictionResults(req, res) {
  try {
    const prediction = await resolvePrediction(req.params.id);
    if (!prediction) return R.notFound(res, 'Predição');
    if (prediction.user_id !== req.user.id && req.user.role !== 'admin') return R.forbidden(res);

    if (prediction.status !== 'completed') {
      return R.unprocessable(res, [{ field: 'status', message: `Predição ainda não concluída (status: ${prediction.status}).` }]);
    }

    // results armazenado como JSON no campo result_data ou apontando para um dataset de saída
    return R.ok(res, {
      prediction_uuid: prediction.uuid,
      result_data: prediction.result_data ? JSON.parse(prediction.result_data) : null,
      output_dataset_uuid: prediction.output_dataset_uuid || null,
    });
  } catch (err) { return R.serverError(res, err); }
}

// DELETE /predictions/:id
async function deletePrediction(req, res) {
  try {
    const prediction = await resolvePrediction(req.params.id);
    if (!prediction) return R.notFound(res, 'Predição');
    if (prediction.user_id !== req.user.id && req.user.role !== 'admin') return R.forbidden(res);
    await db.query('DELETE FROM predictions WHERE id = ?', [prediction.id]);
    return R.noContent(res);
  } catch (err) { return R.serverError(res, err); }
}

module.exports = { listPredictions, createPrediction, getPrediction, getPredictionResults, deletePrediction };
