'use strict';

const { v4: uuidv4 } = require('uuid');
const db = require('../config/db.config');
const jobService = require('../services/job.service');
const formulaParser = require('../services/formulaParser.service');
const R = require('../utils/response');

// GET /synthetic-datasets
async function listSyntheticDatasets(req, res) {
  try {
    const { status } = req.query;
    const conditions = ['s.user_id = ?'];
    const params = [req.user.id];
    if (status) { conditions.push('s.status = ?'); params.push(status); }

    const where = conditions.join(' AND ');
    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM synthetic_datasets s WHERE ${where}`, params,
    );
    const { offset, limit, meta } = R.paginate(req, total);

    const [rows] = await db.query(
      `SELECT s.uuid, s.name, s.status, s.n_samples, s.n_variables,
              s.x_range_start, s.x_range_end, s.noise_level,
              s.output_dataset_uuid, s.created_at
       FROM synthetic_datasets s WHERE ${where}
       ORDER BY s.created_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    );
    return R.ok(res, rows, { ...meta, total });
  } catch (err) { return R.serverError(res, err); }
}

// POST /synthetic-datasets
async function createSyntheticDataset(req, res) {
  try {
    const {
      name,
      n_samples,
      n_variables,
      x_range_start,
      x_range_end,
      noise_level,
      signal_formula,
      baseline_formula,
      tags,
    } = req.body;

    const errors = [];
    if (!name) errors.push({ field: 'name', message: 'Obrigatório.' });
    if (!n_samples || n_samples < 1) errors.push({ field: 'n_samples', message: 'Deve ser >= 1.' });
    if (!n_variables || n_variables < 1) errors.push({ field: 'n_variables', message: 'Deve ser >= 1.' });
    if (errors.length) return R.unprocessable(res, errors);

    // Valida fórmulas se fornecidas (sem eval, via AST)
    if (signal_formula) {
      const validation = formulaParser.validate(signal_formula, ['x', 'i', 'n']);
      if (!validation.valid) {
        return R.unprocessable(res, [{ field: 'signal_formula', message: validation.error }]);
      }
    }
    if (baseline_formula) {
      const validation = formulaParser.validate(baseline_formula, ['x', 'i', 'n']);
      if (!validation.valid) {
        return R.unprocessable(res, [{ field: 'baseline_formula', message: validation.error }]);
      }
    }

    const synUuid = uuidv4();
    const [result] = await db.query(
      `INSERT INTO synthetic_datasets
         (uuid, user_id, name, status, n_samples, n_variables,
          x_range_start, x_range_end, noise_level, signal_formula, baseline_formula, tags, created_at, updated_at)
       VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        synUuid, req.user.id, name, n_samples, n_variables,
        x_range_start !== undefined ? x_range_start : 400,
        x_range_end !== undefined ? x_range_end : 2500,
        noise_level !== undefined ? noise_level : 0,
        signal_formula || null,
        baseline_formula || null,
        JSON.stringify(tags || []),
      ],
    );

    const { id: jobId, uuid: jobUuid } = await jobService.createJob({
      job_type: 'generate_synthetic',
      user_id: req.user.id,
      // result.insertId é o id em `synthetic_datasets`, não em `datasets`
      // (a FK jobs.dataset_id aponta para `datasets`) — não associar aqui.
      payload: {
        synthetic_uuid: synUuid,
        n_samples,
        n_variables,
        x_range_start: x_range_start || 400,
        x_range_end: x_range_end || 2500,
        noise_level: noise_level || 0,
        signal_formula: signal_formula || null,
        baseline_formula: baseline_formula || null,
      },
    });

    const [rows] = await db.query('SELECT * FROM synthetic_datasets WHERE id = ?', [result.insertId]);
    return R.accepted(res, { synthetic_dataset: rows[0], job_id: jobUuid });
  } catch (err) { return R.serverError(res, err); }
}

// GET /synthetic-datasets/:id
async function getSyntheticDataset(req, res) {
  try {
    const [rows] = await db.query(
      'SELECT * FROM synthetic_datasets WHERE uuid = ? AND user_id = ?',
      [req.params.id, req.user.id],
    );
    if (!rows.length) return R.notFound(res, 'Dataset sintético');
    return R.ok(res, rows[0]);
  } catch (err) { return R.serverError(res, err); }
}

// DELETE /synthetic-datasets/:id
async function deleteSyntheticDataset(req, res) {
  try {
    const [rows] = await db.query(
      'SELECT id FROM synthetic_datasets WHERE uuid = ? AND user_id = ?',
      [req.params.id, req.user.id],
    );
    if (!rows.length) return R.notFound(res, 'Dataset sintético');
    await db.query('DELETE FROM synthetic_datasets WHERE id = ?', [rows[0].id]);
    return R.noContent(res);
  } catch (err) { return R.serverError(res, err); }
}

module.exports = { listSyntheticDatasets, createSyntheticDataset, getSyntheticDataset, deleteSyntheticDataset };
