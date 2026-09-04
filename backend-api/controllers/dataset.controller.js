'use strict';

const XLSX   = require('xlsx');
const { pool } = require('../config/db');

// ─── Constantes ───────────────────────────────────────────────────────────────

const VALID_TECHNIQUES = ['NIR', 'Raman', 'FTIR', 'UV-Vis', 'NMR', 'Fluorescence', 'Other'];
const VALID_X_UNITS    = ['nm', 'cm-1', 'eV', 'ppm', 'THz'];
const VALID_Y_UNITS    = ['Absorbance', 'Transmittance', 'Reflectance', 'Intensity', 'Kubelka-Munk', 'Other'];
const VALID_ROLES      = ['unassigned', 'train', 'test'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseJson(v) {
  if (!v) return null;
  return typeof v === 'string' ? JSON.parse(v) : v;
}

function normalizeDataset(row) {
  if (!row) return null;
  return {
    ...row,
    reference_labels: parseJson(row.reference_labels),
  };
}

/**
 * Recalcula estatísticas do dataset com base nos espectros membros.
 * Chamado após adicionar/remover espectros.
 */
async function recalcDatasetStats(conn, datasetId) {
  const [rows] = await conn.query(
    `SELECT s.x_points, s.x_min, s.x_max, s.reference_values
     FROM dataset_spectra ds
     JOIN spectra s ON s.id = ds.spectrum_id
     WHERE ds.dataset_id = ? AND s.deleted_at IS NULL`,
    [datasetId]
  );

  const count = rows.length;
  if (count === 0) {
    await conn.query(
      `UPDATE datasets SET spectra_count = 0, x_points = NULL,
       x_min = NULL, x_max = NULL, reference_labels = NULL
       WHERE id = ?`,
      [datasetId]
    );
    return;
  }

  const xMins    = rows.map((r) => r.x_min).filter((v) => v != null);
  const xMaxs    = rows.map((r) => r.x_max).filter((v) => v != null);
  const xPoints  = rows[0].x_points; // todos devem ser iguais (validado ao adicionar)

  // Coleta todos os rótulos de referência únicos
  const labelSet = new Set();
  rows.forEach((r) => {
    const rv = parseJson(r.reference_values);
    if (rv) Object.keys(rv).forEach((k) => labelSet.add(k));
  });

  await conn.query(
    `UPDATE datasets
     SET spectra_count    = ?,
         x_points         = ?,
         x_min            = ?,
         x_max            = ?,
         reference_labels = ?
     WHERE id = ?`,
    [
      count,
      xPoints,
      xMins.length ? Math.min(...xMins) : null,
      xMaxs.length ? Math.max(...xMaxs) : null,
      labelSet.size > 0 ? JSON.stringify([...labelSet]) : null,
      datasetId,
    ]
  );
}

// ─── POST /datasets — cria dataset vazio ─────────────────────────────────────

async function createDataset(req, res) {
  const { name, technique, x_unit, y_unit, description, visibility = 'private' } = req.body;

  if (!name)      return res.status(400).json({ message: 'Campo "name" obrigatório.' });
  if (!technique) return res.status(400).json({ message: 'Campo "technique" obrigatório.' });
  if (!x_unit)    return res.status(400).json({ message: 'Campo "x_unit" obrigatório.' });
  if (!y_unit)    return res.status(400).json({ message: 'Campo "y_unit" obrigatório.' });

  if (!VALID_TECHNIQUES.includes(technique))
    return res.status(400).json({ message: `technique inválido. Aceitos: ${VALID_TECHNIQUES.join(', ')}` });
  if (!VALID_X_UNITS.includes(x_unit))
    return res.status(400).json({ message: `x_unit inválido. Aceitos: ${VALID_X_UNITS.join(', ')}` });
  if (!VALID_Y_UNITS.includes(y_unit))
    return res.status(400).json({ message: `y_unit inválido. Aceitos: ${VALID_Y_UNITS.join(', ')}` });
  if (!['public', 'private'].includes(visibility))
    return res.status(400).json({ message: 'visibility deve ser "public" ou "private".' });

  const [result] = await pool.query(
    `INSERT INTO datasets
       (user_id, name, description, visibility, technique, x_unit, y_unit)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [req.user.sub, name, description ?? null, visibility, technique, x_unit, y_unit]
  );

  const [[dataset]] = await pool.query(
    'SELECT * FROM datasets WHERE id = ?', [result.insertId]
  );

  return res.status(201).json({
    message: 'Dataset criado.',
    dataset: normalizeDataset(dataset),
  });
}

// ─── GET /datasets ────────────────────────────────────────────────────────────

async function listDatasets(req, res) {
  const page   = Math.max(1, parseInt(req.query.page)  || 1);
  const limit  = Math.min(100, parseInt(req.query.limit) || 20);
  const offset = (page - 1) * limit;

  let where    = 'd.deleted_at IS NULL';
  const params = [];

  if (req.user) {
    where += ' AND (d.visibility = "public" OR d.user_id = ?)';
    params.push(req.user.sub);
  } else {
    where += ' AND d.visibility = "public"';
  }

  if (req.query.technique) { where += ' AND d.technique = ?'; params.push(req.query.technique); }

  const [rows] = await pool.query(
    `SELECT d.id, d.uuid, d.name, d.description, d.visibility,
            d.technique, d.x_unit, d.y_unit,
            d.spectra_count, d.x_points, d.x_min, d.x_max,
            d.reference_labels, d.created_at, d.updated_at,
            u.name AS owner_name, u.initials AS owner_initials
     FROM datasets d
     JOIN users u ON u.id = d.user_id
     WHERE ${where}
     ORDER BY d.created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total FROM datasets d WHERE ${where}`, params
  );

  return res.json({ data: rows.map(normalizeDataset), total, page, limit });
}

// ─── GET /datasets/:id ────────────────────────────────────────────────────────

async function getDataset(req, res) {
  const [rows] = await pool.query(
    `SELECT d.*, u.name AS owner_name, u.initials AS owner_initials
     FROM datasets d
     JOIN users u ON u.id = d.user_id
     WHERE d.id = ? AND d.deleted_at IS NULL LIMIT 1`,
    [req.params.id]
  );

  const dataset = rows[0];
  if (!dataset) return res.status(404).json({ message: 'Dataset não encontrado.' });

  if (dataset.visibility === 'private' && (!req.user || req.user.sub !== dataset.user_id))
    return res.status(403).json({ message: 'Acesso negado.' });

  return res.json(normalizeDataset(dataset));
}

// ─── GET /datasets/:id/spectra — lista espectros do dataset ──────────────────

async function getDatasetSpectra(req, res) {
  const [dsRows] = await pool.query(
    'SELECT id, visibility, user_id FROM datasets WHERE id = ? AND deleted_at IS NULL LIMIT 1',
    [req.params.id]
  );
  const ds = dsRows[0];
  if (!ds) return res.status(404).json({ message: 'Dataset não encontrado.' });
  if (ds.visibility === 'private' && (!req.user || req.user.sub !== ds.user_id))
    return res.status(403).json({ message: 'Acesso negado.' });

  const [spectra] = await pool.query(
    `SELECT ds.position, ds.role,
            s.id, s.uuid, s.name, s.technique, s.x_unit, s.y_unit,
            s.x_points, s.x_min, s.x_max, s.sample_class,
            s.x_values, s.y_values,
            s.reference_value, s.reference_values,
            s.source, s.created_at
     FROM dataset_spectra ds
     JOIN spectra s ON s.id = ds.spectrum_id
     WHERE ds.dataset_id = ? AND s.deleted_at IS NULL
     ORDER BY ds.position`,
    [req.params.id]
  );

  const parsed = spectra.map((s) => ({
    ...s,
    x_values:         parseJson(s.x_values),
    y_values:         parseJson(s.y_values),
    reference_values: parseJson(s.reference_values),
  }));

  return res.json({ data: parsed, spectra_count: parsed.length });
}

// ─── PATCH /datasets/:id/spectra/roles — atribui papel treino/teste em lote ──
//
// Marca um conjunto de espectros do dataset como 'train', 'test' ou volta a
// 'unassigned'. Usado pela tela de dataset para permitir seleção manual do
// split, que depois é respeitado pelo job de treino (ver model.controller.js).

async function updateSpectraRoles(req, res) {
  const { spectrum_ids, role } = req.body;

  if (!Array.isArray(spectrum_ids) || spectrum_ids.length === 0)
    return res.status(400).json({ message: '"spectrum_ids" deve ser um array não vazio.' });
  if (!VALID_ROLES.includes(role))
    return res.status(400).json({ message: `role inválido. Aceitos: ${VALID_ROLES.join(', ')}` });

  const [dsRows] = await pool.query(
    'SELECT id, user_id FROM datasets WHERE id = ? AND deleted_at IS NULL LIMIT 1',
    [req.params.id]
  );
  const ds = dsRows[0];
  if (!ds) return res.status(404).json({ message: 'Dataset não encontrado.' });
  if (ds.user_id !== req.user.sub)
    return res.status(403).json({ message: 'Acesso negado.' });

  const placeholders = spectrum_ids.map(() => '?').join(', ');
  const [result] = await pool.query(
    `UPDATE dataset_spectra SET role = ?
     WHERE dataset_id = ? AND spectrum_id IN (${placeholders})`,
    [role, req.params.id, ...spectrum_ids]
  );

  return res.json({
    message: `${result.affectedRows} espectro(s) marcado(s) como "${role}".`,
    updated: result.affectedRows,
  });
}

// ─── POST /datasets/:id/spectra — adiciona espectro ao dataset ───────────────

async function addSpectrumToDataset(req, res) {
  const { spectrum_id } = req.body;
  if (!spectrum_id)
    return res.status(400).json({ message: '"spectrum_id" é obrigatório.' });

  // Verifica dataset
  const [dsRows] = await pool.query(
    'SELECT id, user_id, technique, x_unit, y_unit, x_points FROM datasets WHERE id = ? AND deleted_at IS NULL LIMIT 1',
    [req.params.id]
  );
  const ds = dsRows[0];
  if (!ds) return res.status(404).json({ message: 'Dataset não encontrado.' });
  if (ds.user_id !== req.user.sub)
    return res.status(403).json({ message: 'Acesso negado.' });

  // Verifica espectro
  const [spRows] = await pool.query(
    'SELECT id, user_id, technique, x_unit, y_unit, x_points, visibility FROM spectra WHERE id = ? AND deleted_at IS NULL LIMIT 1',
    [spectrum_id]
  );
  const sp = spRows[0];
  if (!sp) return res.status(404).json({ message: 'Espectro não encontrado.' });

  // Espectro deve ser do mesmo usuário ou público
  if (sp.visibility === 'private' && sp.user_id !== req.user.sub)
    return res.status(403).json({ message: 'Sem acesso ao espectro.' });

  // Valida compatibilidade técnica
  if (sp.technique !== ds.technique)
    return res.status(422).json({
      message: `Técnica incompatível: dataset é "${ds.technique}", espectro é "${sp.technique}".`
    });
  if (sp.x_unit !== ds.x_unit)
    return res.status(422).json({
      message: `Unidade X incompatível: dataset usa "${ds.x_unit}", espectro usa "${sp.x_unit}".`
    });
  if (sp.y_unit !== ds.y_unit)
    return res.status(422).json({
      message: `Unidade Y incompatível: dataset usa "${ds.y_unit}", espectro usa "${sp.y_unit}".`
    });

  // Valida que todos os espectros têm o mesmo número de pontos
  if (ds.x_points != null && sp.x_points !== ds.x_points)
    return res.status(422).json({
      message: `Número de pontos incompatível: dataset tem ${ds.x_points}, espectro tem ${sp.x_points}.`
    });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Próxima posição
    const [[{ maxPos }]] = await conn.query(
      'SELECT COALESCE(MAX(position), -1) AS maxPos FROM dataset_spectra WHERE dataset_id = ?',
      [req.params.id]
    );

    await conn.query(
      'INSERT INTO dataset_spectra (dataset_id, spectrum_id, position) VALUES (?, ?, ?)',
      [req.params.id, spectrum_id, maxPos + 1]
    );

    await recalcDatasetStats(conn, Number(req.params.id));
    await conn.commit();

    return res.status(201).json({ message: 'Espectro adicionado ao dataset.' });
  } catch (e) {
    await conn.rollback();
    if (e.code === 'ER_DUP_ENTRY')
      return res.status(409).json({ message: 'Espectro já está neste dataset.' });
    throw e;
  } finally {
    conn.release();
  }
}

// ─── DELETE /datasets/:id/spectra/:spectrumId — remove espectro do dataset ───

async function removeSpectrumFromDataset(req, res) {
  const { id: datasetId, spectrumId } = req.params;

  const [dsRows] = await pool.query(
    'SELECT id, user_id FROM datasets WHERE id = ? AND deleted_at IS NULL LIMIT 1',
    [datasetId]
  );
  const ds = dsRows[0];
  if (!ds) return res.status(404).json({ message: 'Dataset não encontrado.' });
  if (ds.user_id !== req.user.sub)
    return res.status(403).json({ message: 'Acesso negado.' });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [result] = await conn.query(
      'DELETE FROM dataset_spectra WHERE dataset_id = ? AND spectrum_id = ?',
      [datasetId, spectrumId]
    );

    if (!result.affectedRows) {
      await conn.rollback();
      return res.status(404).json({ message: 'Espectro não encontrado neste dataset.' });
    }

    // Reposiciona os espectros restantes
    await conn.query(
      `SET @pos := -1;
       UPDATE dataset_spectra SET position = (@pos := @pos + 1)
       WHERE dataset_id = ? ORDER BY position`,
      [datasetId]
    );

    await recalcDatasetStats(conn, Number(datasetId));
    await conn.commit();

    return res.json({ message: 'Espectro removido do dataset.' });
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

// ─── PATCH /datasets/:id ─────────────────────────────────────────────────────

async function updateDataset(req, res) {
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
    `UPDATE datasets SET ${setClause}
     WHERE id = ? AND user_id = ? AND deleted_at IS NULL`,
    [...Object.values(fields), req.params.id, req.user.sub]
  );

  if (!result.affectedRows)
    return res.status(404).json({ message: 'Dataset não encontrado.' });

  return res.json({ message: 'Dataset atualizado.' });
}

// ─── DELETE /datasets/:id ────────────────────────────────────────────────────

async function deleteDataset(req, res) {
  const [result] = await pool.query(
    'UPDATE datasets SET deleted_at = NOW() WHERE id = ? AND user_id = ? AND deleted_at IS NULL',
    [req.params.id, req.user.sub]
  );

  if (!result.affectedRows)
    return res.status(404).json({ message: 'Dataset não encontrado.' });

  return res.json({ message: 'Dataset removido.' });
}

// ─── GET /datasets/:id/export — exporta dataset como XLSX ───────────────────

async function exportDataset(req, res) {
  const [dsRows] = await pool.query(
    'SELECT id, name, visibility, user_id, x_unit, y_unit FROM datasets WHERE id = ? AND deleted_at IS NULL LIMIT 1',
    [req.params.id]
  );
  const ds = dsRows[0];
  if (!ds) return res.status(404).json({ message: 'Dataset não encontrado.' });
  if (ds.visibility === 'private' && (!req.user || req.user.sub !== ds.user_id))
    return res.status(403).json({ message: 'Acesso negado.' });

  const [spectra] = await pool.query(
    `SELECT s.name, s.x_values, s.y_values
     FROM dataset_spectra ds
     JOIN spectra s ON s.id = ds.spectrum_id
     WHERE ds.dataset_id = ? AND s.deleted_at IS NULL
     ORDER BY ds.position`,
    [req.params.id]
  );

  if (spectra.length === 0)
    return res.status(422).json({ message: 'Dataset sem espectros para exportar.' });

  const xValues = parseJson(spectra[0].x_values);

  // Header: sample_name | x1 | x2 | ...
  const header   = [`sample_name / ${ds.y_unit}`, ...xValues];
  const dataRows = spectra.map((s) => {
    const yVals = parseJson(s.y_values);
    return [s.name, ...yVals];
  });

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([header, ...dataRows]);
  XLSX.utils.book_append_sheet(wb, ws, 'Espectros');

  const buffer   = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const filename = `${ds.name.replace(/\s+/g, '_')}.xlsx`;

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  return res.send(buffer);
}

module.exports = {
  createDataset,
  listDatasets,
  getDataset,
  getDatasetSpectra,
  updateSpectraRoles,
  addSpectrumToDataset,
  removeSpectrumFromDataset,
  updateDataset,
  deleteDataset,
  exportDataset,
};