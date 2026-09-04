'use strict';

const { pool } = require('../config/db');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseJson(v) {
  if (!v) return null;
  return typeof v === 'string' ? JSON.parse(v) : v;
}

function normalizeSpectrum(row) {
  if (!row) return null;
  return {
    ...row,
    x_values:         parseJson(row.x_values),
    y_values:         parseJson(row.y_values),
    reference_values: parseJson(row.reference_values),
    metadata:         parseJson(row.metadata),
  };
}

// ─── POST /collections ────────────────────────────────────────────────────────

async function createCollection(req, res) {
  const { name, description, visibility = 'private' } = req.body;

  if (!name || !name.trim())
    return res.status(400).json({ message: 'Campo "name" é obrigatório.' });
  if (!['public', 'private'].includes(visibility))
    return res.status(400).json({ message: 'visibility deve ser "public" ou "private".' });

  const [result] = await pool.query(
    `INSERT INTO collections (user_id, name, description, visibility)
     VALUES (?, ?, ?, ?)`,
    [req.user.sub, name.trim(), description?.trim() ?? null, visibility]
  );

  const [[collection]] = await pool.query(
    'SELECT * FROM collections WHERE id = ?', [result.insertId]
  );

  return res.status(201).json({ message: 'Coleção criada.', collection });
}

// ─── GET /collections ─────────────────────────────────────────────────────────

async function listCollections(req, res) {
  const page   = Math.max(1, parseInt(req.query.page)  || 1);
  const limit = Math.min(5000, parseInt(req.query.limit) || 50);
  const offset = (page - 1) * limit;

  let where    = 'c.deleted_at IS NULL';
  const params = [];

  if (req.user) {
    where += ' AND (c.visibility = "public" OR c.user_id = ?)';
    params.push(req.user.sub);
  } else {
    where += ' AND c.visibility = "public"';
  }

  const [rows] = await pool.query(
    `SELECT c.id, c.uuid, c.name, c.description, c.visibility,
            c.spectra_count, c.created_at, c.updated_at,
            u.name AS owner_name, u.initials AS owner_initials
     FROM collections c
     JOIN users u ON u.id = c.user_id
     WHERE ${where}
     ORDER BY c.created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total FROM collections c WHERE ${where}`, params
  );

  return res.json({ data: rows, total, page, limit });
}

// ─── GET /collections/mine ────────────────────────────────────────────────────

async function listMyCollections(req, res) {
  const page   = Math.max(1, parseInt(req.query.page)  || 1);
 const limit = Math.min(5000, parseInt(req.query.limit) || 50);
  const offset = (page - 1) * limit;

  const [rows] = await pool.query(
    `SELECT id, uuid, name, description, visibility, spectra_count,
            created_at, updated_at
     FROM collections
     WHERE user_id = ? AND deleted_at IS NULL
     ORDER BY created_at DESC
     LIMIT ? OFFSET ?`,
    [req.user.sub, limit, offset]
  );

  const [[{ total }]] = await pool.query(
    'SELECT COUNT(*) AS total FROM collections WHERE user_id = ? AND deleted_at IS NULL',
    [req.user.sub]
  );

  return res.json({ data: rows, total, page, limit });
}

// ─── GET /collections/:id ─────────────────────────────────────────────────────

async function getCollection(req, res) {
  const [rows] = await pool.query(
    `SELECT c.*, u.name AS owner_name, u.initials AS owner_initials
     FROM collections c
     JOIN users u ON u.id = c.user_id
     WHERE c.id = ? AND c.deleted_at IS NULL LIMIT 1`,
    [req.params.id]
  );

  const collection = rows[0];
  if (!collection)
    return res.status(404).json({ message: 'Coleção não encontrada.' });

  if (collection.visibility === 'private' && (!req.user || req.user.sub !== collection.user_id))
    return res.status(403).json({ message: 'Acesso negado.' });

  return res.json(collection);
}

// ─── GET /collections/:id/spectra ────────────────────────────────────────────

async function getCollectionSpectra(req, res) {
  const page   = Math.max(1, parseInt(req.query.page)  || 1);
  const limit = Math.min(5000, parseInt(req.query.limit) || 50);
  const offset = (page - 1) * limit;

  // Verifica acesso à coleção
  const [colRows] = await pool.query(
    'SELECT id, visibility, user_id FROM collections WHERE id = ? AND deleted_at IS NULL LIMIT 1',
    [req.params.id]
  );
  const col = colRows[0];
  if (!col) return res.status(404).json({ message: 'Coleção não encontrada.' });
  if (col.visibility === 'private' && (!req.user || req.user.sub !== col.user_id))
    return res.status(403).json({ message: 'Acesso negado.' });

  const [spectra] = await pool.query(
    `SELECT cs.added_at,
            s.id, s.uuid, s.name, s.technique, s.x_unit, s.y_unit,
            s.x_points, s.x_min, s.x_max, s.sample_class,
            s.reference_value, s.source, s.visibility, s.created_at
     FROM collection_spectra cs
     JOIN spectra s ON s.id = cs.spectrum_id
     WHERE cs.collection_id = ? AND s.deleted_at IS NULL
     ORDER BY cs.added_at DESC
     LIMIT ? OFFSET ?`,
    [req.params.id, limit, offset]
  );

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total
     FROM collection_spectra cs
     JOIN spectra s ON s.id = cs.spectrum_id
     WHERE cs.collection_id = ? AND s.deleted_at IS NULL`,
    [req.params.id]
  );

  return res.json({ data: spectra, total, page, limit });
}

// ─── POST /collections/:id/spectra ───────────────────────────────────────────

async function addSpectrumToCollection(req, res) {
  const { spectrum_id } = req.body;
  if (!spectrum_id)
    return res.status(400).json({ message: '"spectrum_id" é obrigatório.' });

  // Verifica coleção e ownership
  const [colRows] = await pool.query(
    'SELECT id, user_id FROM collections WHERE id = ? AND deleted_at IS NULL LIMIT 1',
    [req.params.id]
  );
  const col = colRows[0];
  if (!col) return res.status(404).json({ message: 'Coleção não encontrada.' });
  if (col.user_id !== req.user.sub)
    return res.status(403).json({ message: 'Acesso negado.' });

  // Verifica espectro
  const [spRows] = await pool.query(
    'SELECT id, user_id, visibility FROM spectra WHERE id = ? AND deleted_at IS NULL LIMIT 1',
    [spectrum_id]
  );
  const sp = spRows[0];
  if (!sp) return res.status(404).json({ message: 'Espectro não encontrado.' });
  if (sp.visibility === 'private' && sp.user_id !== req.user.sub)
    return res.status(403).json({ message: 'Sem acesso ao espectro.' });

  try {
    await pool.query(
      'INSERT INTO collection_spectra (collection_id, spectrum_id) VALUES (?, ?)',
      [req.params.id, spectrum_id]
    );
    // Atualiza contagem
    await pool.query(
      'UPDATE collections SET spectra_count = spectra_count + 1 WHERE id = ?',
      [req.params.id]
    );
    return res.status(201).json({ message: 'Espectro adicionado à coleção.' });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY')
      return res.status(409).json({ message: 'Espectro já está nesta coleção.' });
    throw e;
  }
}

// ─── DELETE /collections/:id/spectra/:spectrumId ──────────────────────────────

async function removeSpectrumFromCollection(req, res) {
  const { id: collectionId, spectrumId } = req.params;

  const [colRows] = await pool.query(
    'SELECT id, user_id FROM collections WHERE id = ? AND deleted_at IS NULL LIMIT 1',
    [collectionId]
  );
  const col = colRows[0];
  if (!col) return res.status(404).json({ message: 'Coleção não encontrada.' });
  if (col.user_id !== req.user.sub)
    return res.status(403).json({ message: 'Acesso negado.' });

  const [result] = await pool.query(
    'DELETE FROM collection_spectra WHERE collection_id = ? AND spectrum_id = ?',
    [collectionId, spectrumId]
  );

  if (!result.affectedRows)
    return res.status(404).json({ message: 'Espectro não encontrado nesta coleção.' });

  await pool.query(
    'UPDATE collections SET spectra_count = GREATEST(spectra_count - 1, 0) WHERE id = ?',
    [collectionId]
  );

  return res.json({ message: 'Espectro removido da coleção.' });
}

// ─── POST /collections/:id/export-dataset ────────────────────────────────────
// Cria um dataset a partir de espectros selecionados da coleção.
// Body: { name, technique, x_unit, y_unit, spectrum_ids: number[], visibility?, description? }

async function exportToDataset(req, res) {
  const { name, technique, x_unit, y_unit,
    spectrum_ids, visibility = 'private', description } = req.body;

  if (!name?.trim())
    return res.status(400).json({ message: 'Campo "name" é obrigatório.' });
  if (!technique || !x_unit || !y_unit)
    return res.status(400).json({ message: 'Campos "technique", "x_unit" e "y_unit" são obrigatórios.' });
  if (!Array.isArray(spectrum_ids) || spectrum_ids.length === 0)
    return res.status(400).json({ message: '"spectrum_ids" deve ser um array não vazio.' });

  // Verifica acesso à coleção
  const [colRows] = await pool.query(
    'SELECT id, user_id FROM collections WHERE id = ? AND deleted_at IS NULL LIMIT 1',
    [req.params.id]
  );
  const col = colRows[0];
  if (!col) return res.status(404).json({ message: 'Coleção não encontrada.' });
  if (col.user_id !== req.user.sub)
    return res.status(403).json({ message: 'Acesso negado.' });

  // Verifica que os spectrum_ids pertencem à coleção e são compatíveis
  const placeholders = spectrum_ids.map(() => '?').join(', ');
  const [spectra] = await pool.query(
    `SELECT s.id, s.technique, s.x_unit, s.y_unit, s.x_points, s.x_min, s.x_max
     FROM collection_spectra cs
     JOIN spectra s ON s.id = cs.spectrum_id
     WHERE cs.collection_id = ? AND s.id IN (${placeholders}) AND s.deleted_at IS NULL`,
    [req.params.id, ...spectrum_ids]
  );

  if (spectra.length === 0)
    return res.status(422).json({ message: 'Nenhum espectro válido encontrado na coleção.' });

  // Validação de compatibilidade
  const incompatible = spectra.filter(
    (s) => s.technique !== technique || s.x_unit !== x_unit || s.y_unit !== y_unit
  );
  if (incompatible.length > 0) {
    return res.status(422).json({
      message: `${incompatible.length} espectro(s) incompatíveis com a técnica/unidades escolhidas.`,
      incompatible_ids: incompatible.map((s) => s.id),
    });
  }

  // Verifica homogeneidade de x_points
  const pointCounts = [...new Set(spectra.map((s) => s.x_points))];
  if (pointCounts.length > 1) {
    return res.status(422).json({
      message: `Espectros têm números diferentes de pontos: ${pointCounts.join(', ')}. O dataset exige homogeneidade.`,
    });
  }

  const xPoints = pointCounts[0];
  const xMins   = spectra.map((s) => parseFloat(s.x_min)).filter((v) => !isNaN(v));
  const xMaxs   = spectra.map((s) => parseFloat(s.x_max)).filter((v) => !isNaN(v));

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Cria o dataset
    const [dsResult] = await conn.query(
      `INSERT INTO datasets
         (user_id, name, description, visibility, technique, x_unit, y_unit,
          spectra_count, x_points, x_min, x_max)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.user.sub, name.trim(), description?.trim() ?? null, visibility,
        technique, x_unit, y_unit,
        spectra.length, xPoints,
        xMins.length ? Math.min(...xMins) : null,
        xMaxs.length ? Math.max(...xMaxs) : null,
      ]
    );

    const datasetId = dsResult.insertId;

    // Adiciona espectros ao dataset em ordem
    const dsRows = spectra.map((s, idx) => [datasetId, s.id, idx]);
    await conn.query(
      'INSERT INTO dataset_spectra (dataset_id, spectrum_id, position) VALUES ?',
      [dsRows]
    );

    await conn.commit();

    const [[dataset]] = await pool.query(
      'SELECT * FROM datasets WHERE id = ?', [datasetId]
    );

    return res.status(201).json({
      message: `Dataset "${name}" criado com ${spectra.length} espectros.`,
      dataset,
    });
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

// ─── PATCH /collections/:id ───────────────────────────────────────────────────

async function updateCollection(req, res) {
  const ALLOWED = ['name', 'description', 'visibility'];
  const fields  = {};
  for (const key of ALLOWED) {
    if (key in req.body) fields[key] = req.body[key];
  }

  if (!Object.keys(fields).length)
    return res.status(400).json({ message: 'Nenhum campo válido para atualizar.' });
  if (fields.visibility && !['public', 'private'].includes(fields.visibility))
    return res.status(400).json({ message: 'visibility deve ser "public" ou "private".' });

  const setClause = Object.keys(fields).map((k) => `${k} = ?`).join(', ');
  const [result]  = await pool.query(
    `UPDATE collections SET ${setClause}
     WHERE id = ? AND user_id = ? AND deleted_at IS NULL`,
    [...Object.values(fields), req.params.id, req.user.sub]
  );

  if (!result.affectedRows)
    return res.status(404).json({ message: 'Coleção não encontrada.' });

  return res.json({ message: 'Coleção atualizada.' });
}

// ─── DELETE /collections/:id ──────────────────────────────────────────────────

async function deleteCollection(req, res) {
  const [result] = await pool.query(
    'UPDATE collections SET deleted_at = NOW() WHERE id = ? AND user_id = ? AND deleted_at IS NULL',
    [req.params.id, req.user.sub]
  );

  if (!result.affectedRows)
    return res.status(404).json({ message: 'Coleção não encontrada.' });

  return res.json({ message: 'Coleção removida.' });
}

module.exports = {
  createCollection,
  listCollections,
  listMyCollections,
  getCollection,
  getCollectionSpectra,
  addSpectrumToCollection,
  removeSpectrumFromCollection,
  exportToDataset,
  updateCollection,
  deleteCollection,
};