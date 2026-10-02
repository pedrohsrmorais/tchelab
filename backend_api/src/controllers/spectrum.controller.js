'use strict';

const { v4: uuidv4 } = require('uuid');
const db = require('../config/db.config');
const R = require('../utils/response');

// GET /spectra
async function listSpectra(req, res) {
  try {
    const { technique, sample_class, visibility, collection_id, page, per_page } = req.query;
    const conditions = ['s.user_id = ?', 's.deleted_at IS NULL'];
    const params = [req.user.id];

    if (technique) { conditions.push('s.technique = ?'); params.push(technique); }
    if (sample_class) { conditions.push('s.sample_class = ?'); params.push(sample_class); }
    if (visibility) { conditions.push('s.visibility = ?'); params.push(visibility); }
    if (collection_id) {
      const [c] = await db.query('SELECT id FROM collections WHERE uuid = ?', [collection_id]);
      if (c.length) {
        conditions.push('s.id IN (SELECT spectrum_id FROM collection_spectra WHERE collection_id = ?)');
        params.push(c[0].id);
      }
    }

    const where = conditions.join(' AND ');
    const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total FROM spectra s WHERE ${where}`, params);
    const { offset, limit, meta } = R.paginate(req, total);

    const [rows] = await db.query(
      `SELECT s.id, s.uuid, s.name, s.technique, s.sample_class, s.x_points,
              s.x_min, s.x_max, s.x_unit, s.y_unit, s.visibility, s.created_at
       FROM spectra s WHERE ${where} ORDER BY s.created_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    );
    return R.ok(res, rows, { ...meta, total });
  } catch (err) { return R.serverError(res, err); }
}

// POST /spectra
async function createSpectrum(req, res) {
  try {
    const { name, technique, x_values, y_values, x_unit, y_unit, sample_class, reference_value, description, visibility } = req.body;
    if (!name || !technique || !x_values || !y_values) {
      return R.unprocessable(res, [
        { field: 'name', message: 'Obrigatório.' },
        { field: 'technique', message: 'Obrigatório.' },
        { field: 'x_values', message: 'Obrigatório.' },
        { field: 'y_values', message: 'Obrigatório.' },
      ].filter((f) => !req.body[f.field]));
    }

    const xArr = Array.isArray(x_values) ? x_values : JSON.parse(x_values);
    const yArr = Array.isArray(y_values) ? y_values : JSON.parse(y_values);

    const uuid = uuidv4();
    const [result] = await db.query(
      `INSERT INTO spectra
         (uuid, user_id, name, technique, x_values, y_values, x_points, x_min, x_max,
          x_unit, y_unit, sample_class, reference_value, description, visibility, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        uuid, req.user.id, name, technique,
        JSON.stringify(xArr), JSON.stringify(yArr),
        xArr.length, Math.min(...xArr), Math.max(...xArr),
        x_unit || null, y_unit || null, sample_class || null,
        reference_value || null, description || null, visibility || 'private',
      ],
    );

    const [rows] = await db.query('SELECT * FROM spectra WHERE id = ?', [result.insertId]);
    return R.created(res, rows[0]);
  } catch (err) { return R.serverError(res, err); }
}

// POST /spectra/batch
async function batchImport(req, res) {
  try {
    const items = req.body.spectra;
    if (!Array.isArray(items) || !items.length) {
      return R.unprocessable(res, [{ field: 'spectra', message: 'Array de espectros obrigatório.' }]);
    }

    const created = [];
    const errors = [];

    for (let i = 0; i < items.length; i++) {
      const sp = items[i];
      try {
        if (!sp.name || !sp.technique || !sp.x_values || !sp.y_values) {
          throw new Error('Campos obrigatórios ausentes.');
        }
        const xArr = Array.isArray(sp.x_values) ? sp.x_values : JSON.parse(sp.x_values);
        const yArr = Array.isArray(sp.y_values) ? sp.y_values : JSON.parse(sp.y_values);
        const uuid = uuidv4();
        const [result] = await db.query(
          `INSERT INTO spectra
             (uuid, user_id, name, technique, x_values, y_values, x_points, x_min, x_max,
              x_unit, y_unit, sample_class, visibility, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
          [uuid, req.user.id, sp.name, sp.technique,
            JSON.stringify(xArr), JSON.stringify(yArr),
            xArr.length, Math.min(...xArr), Math.max(...xArr),
            sp.x_unit || null, sp.y_unit || null, sp.sample_class || null, 'private'],
        );
        created.push({ index: i, id: result.insertId, uuid });
      } catch (e) {
        errors.push({ index: i, error: e.message });
      }
    }

    return R.ok(res, { created, errors }, null, 207);
  } catch (err) { return R.serverError(res, err); }
}

// GET /spectra/:id
async function getSpectrum(req, res) {
  try {
    const [rows] = await db.query(
      'SELECT * FROM spectra WHERE uuid = ? AND deleted_at IS NULL',
      [req.params.id],
    );
    if (!rows.length) return R.notFound(res, 'Espectro');
    return R.ok(res, rows[0]);
  } catch (err) { return R.serverError(res, err); }
}

// PUT /spectra/:id
async function updateSpectrum(req, res) {
  try {
    const [rows] = await db.query('SELECT * FROM spectra WHERE uuid = ? AND deleted_at IS NULL', [req.params.id]);
    if (!rows.length) return R.notFound(res, 'Espectro');
    const sp = rows[0];
    if (sp.user_id !== req.user.id && req.user.role !== 'admin') return R.forbidden(res);

    const allowed = ['name', 'description', 'sample_class', 'reference_value', 'reference_values', 'metadata', 'visibility'];
    const fields = [];
    const values = [];
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        fields.push(`${key} = ?`);
        values.push(typeof req.body[key] === 'object' ? JSON.stringify(req.body[key]) : req.body[key]);
      }
    }
    if (!fields.length) return R.badRequest(res, 'Nenhum campo para atualizar.');
    values.push(sp.id);
    await db.query(`UPDATE spectra SET ${fields.join(', ')}, updated_at = NOW() WHERE id = ?`, values);
    const [updated] = await db.query('SELECT * FROM spectra WHERE id = ?', [sp.id]);
    return R.ok(res, updated[0]);
  } catch (err) { return R.serverError(res, err); }
}

// DELETE /spectra/:id
async function deleteSpectrum(req, res) {
  try {
    const [rows] = await db.query('SELECT * FROM spectra WHERE uuid = ? AND deleted_at IS NULL', [req.params.id]);
    if (!rows.length) return R.notFound(res, 'Espectro');
    if (rows[0].user_id !== req.user.id && req.user.role !== 'admin') return R.forbidden(res);
    await db.query('UPDATE spectra SET deleted_at = NOW() WHERE id = ?', [rows[0].id]);
    return R.noContent(res);
  } catch (err) { return R.serverError(res, err); }
}

// GET /spectra/:id/plot
async function getPlotData(req, res) {
  try {
    const [rows] = await db.query(
      'SELECT name, technique, x_values, y_values, x_unit, y_unit FROM spectra WHERE uuid = ? AND deleted_at IS NULL',
      [req.params.id],
    );
    if (!rows.length) return R.notFound(res, 'Espectro');
    const sp = rows[0];
    return R.ok(res, {
      x: typeof sp.x_values === 'string' ? JSON.parse(sp.x_values) : sp.x_values,
      y: typeof sp.y_values === 'string' ? JSON.parse(sp.y_values) : sp.y_values,
      label: sp.name,
      technique: sp.technique,
      x_unit: sp.x_unit,
      y_unit: sp.y_unit,
    });
  } catch (err) { return R.serverError(res, err); }
}

module.exports = { listSpectra, createSpectrum, batchImport, getSpectrum, updateSpectrum, deleteSpectrum, getPlotData };
