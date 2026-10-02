'use strict';

const { v4: uuidv4 } = require('uuid');
const db = require('../config/db.config');
const R = require('../utils/response');

async function resolveCollection(uuid, userId) {
  const [rows] = await db.query(
    'SELECT * FROM collections WHERE uuid = ? AND deleted_at IS NULL',
    [uuid],
  );
  return rows[0] || null;
}

// GET /collections
async function listCollections(req, res) {
  try {
    const [rows] = await db.query(
      'SELECT * FROM collections WHERE user_id = ? AND deleted_at IS NULL ORDER BY created_at DESC',
      [req.user.id],
    );
    return R.ok(res, rows);
  } catch (err) { return R.serverError(res, err); }
}

// POST /collections
async function createCollection(req, res) {
  try {
    const { name, description, visibility } = req.body;
    if (!name) return R.unprocessable(res, [{ field: 'name', message: 'Obrigatório.' }]);
    const uuid = uuidv4();
    const [result] = await db.query(
      `INSERT INTO collections (uuid, user_id, name, description, visibility, spectra_count, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 0, NOW(), NOW())`,
      [uuid, req.user.id, name, description || null, visibility || 'private'],
    );
    const [rows] = await db.query('SELECT * FROM collections WHERE id = ?', [result.insertId]);
    return R.created(res, rows[0]);
  } catch (err) { return R.serverError(res, err); }
}

// GET /collections/:id
async function getCollection(req, res) {
  try {
    const col = await resolveCollection(req.params.id, req.user.id);
    if (!col) return R.notFound(res, 'Coleção');
    return R.ok(res, col);
  } catch (err) { return R.serverError(res, err); }
}

// PUT /collections/:id
async function updateCollection(req, res) {
  try {
    const col = await resolveCollection(req.params.id);
    if (!col) return R.notFound(res, 'Coleção');
    if (col.user_id !== req.user.id && req.user.role !== 'admin') return R.forbidden(res);

    const { name, description, visibility } = req.body;
    await db.query(
      `UPDATE collections SET
         name = COALESCE(?, name), description = COALESCE(?, description),
         visibility = COALESCE(?, visibility), updated_at = NOW()
       WHERE id = ?`,
      [name || null, description || null, visibility || null, col.id],
    );
    const [rows] = await db.query('SELECT * FROM collections WHERE id = ?', [col.id]);
    return R.ok(res, rows[0]);
  } catch (err) { return R.serverError(res, err); }
}

// DELETE /collections/:id
async function deleteCollection(req, res) {
  try {
    const col = await resolveCollection(req.params.id);
    if (!col) return R.notFound(res, 'Coleção');
    if (col.user_id !== req.user.id && req.user.role !== 'admin') return R.forbidden(res);
    await db.query('UPDATE collections SET deleted_at = NOW() WHERE id = ?', [col.id]);
    return R.noContent(res);
  } catch (err) { return R.serverError(res, err); }
}

// GET /collections/:id/spectra
async function listCollectionSpectra(req, res) {
  try {
    const col = await resolveCollection(req.params.id);
    if (!col) return R.notFound(res, 'Coleção');
    const { offset, limit, meta } = R.paginate(req, col.spectra_count);
    const [rows] = await db.query(
      `SELECT s.uuid, s.name, s.technique, s.sample_class, s.x_points,
              s.x_min, s.x_max, s.x_unit, s.y_unit, cs.position
       FROM spectra s
       JOIN collection_spectra cs ON cs.spectrum_id = s.id
       WHERE cs.collection_id = ? AND s.deleted_at IS NULL
       ORDER BY cs.position ASC LIMIT ? OFFSET ?`,
      [col.id, limit, offset],
    );
    return R.ok(res, rows, { ...meta, total: col.spectra_count });
  } catch (err) { return R.serverError(res, err); }
}

// POST /collections/:id/spectra
async function addSpectraToCollection(req, res) {
  try {
    const col = await resolveCollection(req.params.id);
    if (!col) return R.notFound(res, 'Coleção');
    const { spectrum_ids } = req.body;
    if (!Array.isArray(spectrum_ids) || !spectrum_ids.length) {
      return R.unprocessable(res, [{ field: 'spectrum_ids', message: 'Array obrigatório.' }]);
    }

    const added = [];
    for (const uuid of spectrum_ids) {
      const [sp] = await db.query('SELECT id FROM spectra WHERE uuid = ? AND deleted_at IS NULL', [uuid]);
      if (sp.length) {
        await db.query(
          `INSERT IGNORE INTO collection_spectra (collection_id, spectrum_id, position) VALUES (?, ?, 0)`,
          [col.id, sp[0].id],
        );
        added.push(uuid);
      }
    }

    const [[{ count }]] = await db.query(
      'SELECT COUNT(*) AS count FROM collection_spectra WHERE collection_id = ?', [col.id],
    );
    await db.query('UPDATE collections SET spectra_count = ?, updated_at = NOW() WHERE id = ?', [count, col.id]);

    return R.ok(res, { added_count: added.length, added });
  } catch (err) { return R.serverError(res, err); }
}

// DELETE /collections/:id/spectra/:sid
async function removeSpectrumFromCollection(req, res) {
  try {
    const col = await resolveCollection(req.params.id);
    if (!col) return R.notFound(res, 'Coleção');
    const [sp] = await db.query('SELECT id FROM spectra WHERE uuid = ?', [req.params.sid]);
    if (!sp.length) return R.notFound(res, 'Espectro');
    await db.query('DELETE FROM collection_spectra WHERE collection_id = ? AND spectrum_id = ?', [col.id, sp[0].id]);

    const [[{ count }]] = await db.query(
      'SELECT COUNT(*) AS count FROM collection_spectra WHERE collection_id = ?', [col.id],
    );
    await db.query('UPDATE collections SET spectra_count = ?, updated_at = NOW() WHERE id = ?', [count, col.id]);
    return R.noContent(res);
  } catch (err) { return R.serverError(res, err); }
}

module.exports = {
  listCollections, createCollection, getCollection, updateCollection, deleteCollection,
  listCollectionSpectra, addSpectraToCollection, removeSpectrumFromCollection,
};
