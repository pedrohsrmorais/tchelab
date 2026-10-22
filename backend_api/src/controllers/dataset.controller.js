'use strict';

const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const db = require('../config/db.config');
const jobService = require('../services/job.service');
const lineageService = require('../services/lineage.service');
const R = require('../utils/response');
const storage = require('../services/storage');
const quota = require('../services/quota.service');
const { LEVEL, guardDataset } = require('../services/access.service');

/**
 * Parses a CSV/TSV text string into { headers, rows, separator }.
 * Handles quoted fields, trims whitespace, ignores empty lines.
 */
function parseCSVText(text, forceSep) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(l => l.trim());
  if (!lines.length) return { headers: [], rows: [], separator: ',' };

  // Auto-detect separator if not forced
  let sep = forceSep || ',';
  if (!forceSep) {
    const firstLine = lines[0];
    const counts = { ',': (firstLine.match(/,/g) || []).length, ';': (firstLine.match(/;/g) || []).length, '\t': (firstLine.match(/\t/g) || []).length };
    sep = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
  }

  const splitLine = (line) => {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQuotes = !inQuotes; continue; }
      if (ch === sep && !inQuotes) { result.push(current.trim()); current = ''; continue; }
      current += ch;
    }
    result.push(current.trim());
    return result;
  };

  const headers = splitLine(lines[0]);
  const rows = lines.slice(1).map(splitLine);
  return { headers, rows, separator: sep };
}

/**
 * Smart CSV analysis: detects column types, class columns, wavelength patterns,
 * and returns structured metadata about the dataset.
 */
function analyzeCSV(headers, rows) {
  // Detect which columns are numeric (potential wavelength/feature columns)
  const wavelengthPattern = /^(\d+(\.\d+)?(nm|cm-1|cm⁻¹|um|μm)?|[0-9]+\s*(nm|cm-1)?)$/i;
  const classPattern = /^(class|classe|label|target|grupo|group|category|categoria|y)$/i;

  const numericCols = [];
  const classCols = [];
  const otherCols = [];

  for (let ci = 0; ci < headers.length; ci++) {
    const h = headers[ci];
    if (classPattern.test(h.trim())) {
      classCols.push(ci);
      continue;
    }
    // Check if column values are numeric
    const values = rows.map(r => r[ci]).filter(v => v !== undefined && v !== '');
    const numericCount = values.filter(v => !isNaN(parseFloat(v)) && isFinite(v)).length;
    if (numericCount / Math.max(values.length, 1) > 0.8) {
      numericCols.push(ci);
    } else {
      otherCols.push(ci);
    }
  }

  // Extract numeric data matrix
  const featureCols = numericCols;
  const featureHeaders = featureCols.map(ci => headers[ci]);

  // Try to parse wavelength values from headers
  const wavelengths = featureHeaders.map(h => parseFloat(h.replace(/[^0-9.]/g, ''))).filter(v => !isNaN(v));

  // Build numeric matrix
  const dataMatrix = rows.map(row =>
    featureCols.map(ci => {
      const v = parseFloat(row[ci]);
      return isNaN(v) ? null : v;
    })
  );

  // Class labels
  const classValues = classCols.length > 0
    ? [...new Set(rows.map(r => r[classCols[0]]).filter(Boolean))]
    : [];

  // Stats per numeric column
  const colStats = featureCols.map((ci, fi) => {
    const vals = dataMatrix.map(r => r[fi]).filter(v => v !== null);
    if (!vals.length) return null;
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    return { col: headers[ci], min, max, mean: +mean.toFixed(6) };
  });

  return {
    n_samples: rows.length,
    n_variables: featureCols.length,
    feature_headers: featureHeaders,
    class_columns: classCols.map(ci => headers[ci]),
    class_values: classValues,
    wavelengths: wavelengths.length === featureHeaders.length ? wavelengths : null,
    x_min: wavelengths.length > 0 ? Math.min(...wavelengths) : null,
    x_max: wavelengths.length > 0 ? Math.max(...wavelengths) : null,
    x_points: featureCols.length,
    col_stats: colStats.filter(Boolean),
    data_matrix: dataMatrix,
    row_labels: classCols.length > 0 ? rows.map(r => r[classCols[0]] || null) : null,
    other_col_indices: otherCols,
    other_col_headers: otherCols.map(ci => headers[ci]),
  };
}

async function resolveDataset(uuid) {
  const [rows] = await db.query('SELECT * FROM datasets WHERE uuid = ? AND deleted_at IS NULL', [uuid]);
  return rows[0] || null;
}

// GET /datasets
async function listDatasets(req, res) {
  try {
    const { data_type, data_order, sample_axis, visibility, technique, project_id } = req.query;
    const conditions = ['d.user_id = ?', 'd.deleted_at IS NULL'];
    const params = [req.user.id];

    if (data_type) { conditions.push('d.data_type = ?'); params.push(data_type); }
    if (data_order !== undefined) { conditions.push('d.data_order = ?'); params.push(data_order); }
    if (sample_axis !== undefined) { conditions.push('d.sample_axis = ?'); params.push(sample_axis); }
    if (visibility) { conditions.push('d.visibility = ?'); params.push(visibility); }
    if (technique) { conditions.push('d.technique = ?'); params.push(technique); }
    if (project_id) {
      const [p] = await db.query('SELECT id FROM projects WHERE uuid = ?', [project_id]);
      if (p.length) {
        conditions.push('d.id IN (SELECT dataset_id FROM project_datasets WHERE project_id = ?)');
        params.push(p[0].id);
      }
    }

    const withMeta = req.query.with_metadata === '1' || req.query.with_metadata === 'true';
    const where = conditions.join(' AND ');
    const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total FROM datasets d WHERE ${where}`, params);
    const { offset, limit, meta } = R.paginate(req, total);

    const [rows] = await db.query(
      `SELECT d.id, d.uuid, d.name, d.description, d.data_type, d.data_order, d.sample_axis,
              d.dimensions, d.mode_labels, d.visibility, d.created_at${withMeta ? ', d.metadata' : ''}
       FROM datasets d WHERE ${where} ORDER BY d.created_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    );
    return R.ok(res, rows, { ...meta, total });
  } catch (err) { return R.serverError(res, err); }
}

// POST /datasets
async function createDataset(req, res) {
  try {
    const {
      name, data_type, technique, dimensions, mode_labels, mode_ranges,
      sample_axis, data_order, augmentation_scheme, dtype, file_format,
      storage_path, description, visibility,
    } = req.body;

    if (!name || !dimensions) {
      return R.unprocessable(res, [
        { field: 'name', message: 'Obrigatório.' },
        { field: 'dimensions', message: 'Obrigatório.' },
      ].filter((f) => !req.body[f.field]));
    }

    const uuid = uuidv4();
    // `storage_path` enviado pelo cliente é ignorado: só o servidor decide onde um arquivo fica no storage.
    void storage_path;
    const result = await quota.guard(req.user.id, quota.datasetRowBytes(dimensions, mode_labels, mode_ranges, augmentation_scheme, description), async () => {
      const [r] = await db.query(
      `INSERT INTO datasets
         (uuid, user_id, name, description, data_type, technique, dimensions, mode_labels,
          mode_ranges, sample_axis, data_order, augmentation_scheme, file_format,
          storage_path, visibility, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        uuid, req.user.id, name, description || null, data_type || null,
        technique || null,
        JSON.stringify(dimensions),
        JSON.stringify(mode_labels || null),
        JSON.stringify(mode_ranges || null),
        sample_axis !== undefined ? sample_axis : null,
        data_order || 1,
        JSON.stringify(augmentation_scheme || null),
        file_format || null, null,
        visibility || 'private',
      ],
      );
      return { kind: 'dataset', refType: 'dataset', refId: r.insertId, size: quota.datasetRowBytes(dimensions, mode_labels, mode_ranges, augmentation_scheme, description) };
    }).then((o) => ({ insertId: o.refId }));

    await db.query('UPDATE users SET stat_datasets = stat_datasets + 1 WHERE id = ?', [req.user.id]);
    const [rows] = await db.query('SELECT * FROM datasets WHERE id = ?', [result.insertId]);
    return R.created(res, rows[0]);
  } catch (err) { if (quota.handleError(res, err)) return undefined; return R.serverError(res, err); }
}

/**
 * Infers the shape of an N-dimensional nested array, e.g.
 * [[[1,2],[3,4]],[[5,6],[7,8]]] -> [2,2,2]. Assumes a regular (non-jagged) tensor.
 */
function inferTensorShape(arr) {
  const dims = [];
  let cur = arr;
  while (Array.isArray(cur)) {
    dims.push(cur.length);
    cur = cur[0];
  }
  return dims;
}

/** Flattens a nested array into a single flat array of numbers. */
function flattenTensor(arr) {
  const out = [];
  const walk = (v) => {
    if (Array.isArray(v)) v.forEach(walk);
    else out.push(Number(v));
  };
  walk(arr);
  return out;
}

/** Rebuilds a flat array of numbers into a nested array of the given shape. */
function reshapeFlat(flat, shape) {
  if (shape.length === 1) return flat.slice(0, shape[0]);
  const size = shape.slice(1).reduce((a, b) => a * b, 1);
  const out = [];
  for (let i = 0; i < shape[0]; i++) {
    out.push(reshapeFlat(flat.slice(i * size, (i + 1) * size), shape.slice(1)));
  }
  return out;
}

/**
 * Handles POST /datasets/import when the request body is JSON describing an
 * N-dimensional tensor (3D/4D+), produced by pasting block-delimited data in
 * the ImportModal. Does not touch CSV parsing at all.
 */
async function importTensorFromJson(req, res) {
  const { name, description, visibility, tensor, dimensions } = req.body;
  if (!name || !String(name).trim()) return R.badRequest(res, 'Nome do dataset é obrigatório.');
  if (!Array.isArray(tensor) || !tensor.length) {
    return R.unprocessable(res, [{ field: 'tensor', message: 'Tensor vazio ou em formato inválido.' }]);
  }

  const inferredShape = inferTensorShape(tensor);
  let dims = Array.isArray(dimensions) && dimensions.length ? dimensions.map(Number) : inferredShape;

  let finalTensor = tensor;
  // If the caller supplied custom dimensions that don't match the inferred
  // shape, reshape the flattened data to honor them (e.g. collapsing 3D
  // blocks into a user-specified 4D shape).
  const sameShape = dims.length === inferredShape.length && dims.every((d, i) => d === inferredShape[i]);
  if (!sameShape) {
    const flat = flattenTensor(tensor);
    const expected = dims.reduce((a, b) => a * b, 1);
    if (!dims.length || dims.some(d => !Number.isFinite(d) || d <= 0) || expected !== flat.length) {
      return R.unprocessable(res, [{ field: 'dimensions', message: `As dimensões informadas (${dims.join('x') || '?'}) não são compatíveis com os ${flat.length} valores recebidos.` }]);
    }
    finalTensor = reshapeFlat(flat, dims);
  } else {
    // Ensure values are numeric even when shape matches.
    finalTensor = reshapeFlat(flattenTensor(tensor), dims);
  }

  const dsUuid = uuidv4();
  const metadata = {
    import_method: 'paste_tensor',
    data: { tensor: finalTensor },
  };

  const metaStr = JSON.stringify(metadata);
  const result = await quota.guard(req.user.id, quota.datasetRowBytes(metaStr, dims, description), async () => {
    const [r] = await db.query(
    `INSERT INTO datasets
       (uuid, user_id, name, description, visibility, data_type, dimensions,
        x_points, x_min, x_max, file_format, storage_path,
        metadata, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'tensor', ?, NULL, NULL, NULL, 'json', NULL, ?, NOW(), NOW())`,
    [
      dsUuid,
      req.user.id,
      name,
      description || null,
      visibility || 'private',
      JSON.stringify(dims),
      metaStr,
    ],
    );
    return { kind: 'dataset', refType: 'dataset', refId: r.insertId, size: quota.datasetRowBytes(metaStr, dims, description) };
  }).then((o) => ({ insertId: o.refId }));

  await db.query('UPDATE users SET stat_datasets = stat_datasets + 1 WHERE id = ?', [req.user.id]);

  const [rows2] = await db.query('SELECT * FROM datasets WHERE id = ?', [result.insertId]);
  return R.created(res, rows2[0]);
}

// POST /datasets/import
async function smartImport(req, res) {
  const tmpFile = req.file && req.file.path;
  try {
    // New JSON-tensor path (3D/4D+ pasted data): no file is sent, the body
    // is a JSON object carrying the already-assembled nested-array tensor.
    // The classic multipart/form-data (CSV) flow below is untouched.
    if (!req.file && req.is('application/json') && req.body && (req.body.data_type === 'tensor' || Array.isArray(req.body.tensor))) {
      return await importTensorFromJson(req, res);
    }

    if (!req.file) return R.badRequest(res, 'Arquivo não enviado.');
    await quota.precheck(req.user.id, req.file.size); // máximo por arquivo e espaço livre, antes de interpretar o arquivo
    const { name, description, visibility, separator: forceSep } = req.body;
    const dsUuid = uuidv4();

    // Read and parse the file immediately (synchronous processing)
    const fileText = fs.readFileSync(req.file.path, 'utf8');
    const { headers, rows, separator } = parseCSVText(fileText, forceSep || null);

    if (!headers.length) {
      return R.unprocessable(res, [{ field: 'file', message: 'Arquivo vazio ou formato não reconhecido.' }]);
    }

    // Analyze the dataset structure
    const analysis = analyzeCSV(headers, rows);

    const dsName = name || req.file.originalname.replace(/\.[^.]+$/, '');

    // Determine data_type based on content
    const dataType = analysis.wavelengths ? 'spectral' : 'tabular';

    // Dimensions: [n_samples, n_variables]
    const dimensions = [analysis.n_samples, analysis.n_variables];

    // Build full metadata payload
    const metadata = {
      import_method: 'csv',
      separator,
      original_filename: req.file.originalname,
      all_headers: headers,
      feature_headers: analysis.feature_headers,
      class_columns: analysis.class_columns,
      class_values: analysis.class_values,
      wavelengths: analysis.wavelengths,
      col_stats: analysis.col_stats,
      // Store the actual data matrix for preview
      data: {
        columns: analysis.feature_headers,
        class_column: analysis.class_columns[0] || null,
        row_labels: analysis.row_labels,
        matrix: analysis.data_matrix,
        other_columns: analysis.other_col_headers.map((h, i) => ({
          name: h,
          values: rows.map(r => r[analysis.other_col_indices[i]]),
        })),
      },
    };

    // o arquivo original vai para o storage e a matriz interpretada fica no banco; os dois contam na cota
    const metaStr = JSON.stringify(metadata);
    const fileKey = `datasets/${dsUuid}${path.extname(req.file.originalname).toLowerCase().replace(/[^.a-z0-9]/g, '').slice(0, 8) || '.csv'}`;
    const total = quota.datasetRowBytes(metaStr, dimensions, description) + req.file.size;
    const result = await quota.guard(req.user.id, total, async () => {
      await storage.putFile(fileKey, req.file.path, { contentType: 'text/csv' });
      try {
        const [r] = await db.query(
          `INSERT INTO datasets
             (uuid, user_id, name, description, visibility, data_type, dimensions,
              x_points, x_min, x_max, file_format, storage_path,
              metadata, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'csv', ?, ?, NOW(), NOW())`,
          [
            dsUuid, req.user.id, dsName, description || null, visibility || 'private', dataType,
            JSON.stringify(dimensions), analysis.x_points || null, analysis.x_min, analysis.x_max,
            fileKey, metaStr,
          ],
        );
        return { kind: 'dataset', refType: 'dataset', refId: r.insertId, key: fileKey, size: total };
      } catch (e) { await storage.remove(fileKey).catch(() => {}); throw e; }
    }, { fileBytes: req.file.size }).then((o) => ({ insertId: o.refId }));

    await db.query('UPDATE users SET stat_datasets = stat_datasets + 1 WHERE id = ?', [req.user.id]);

    const [rows2] = await db.query('SELECT * FROM datasets WHERE id = ?', [result.insertId]);
    return R.created(res, rows2[0]);
  } catch (err) {
    if (quota.handleError(res, err)) return undefined;
    return R.serverError(res, err);
  } finally { if (tmpFile) fs.promises.unlink(tmpFile).catch(() => {}); }
}

// GET /datasets/:id
async function getDataset(req, res) {
  try {
    const ds = await resolveDataset(req.params.id);
    if (!ds) return R.notFound(res, 'Dataset');
    if (!(await guardDataset(req, res, ds, LEVEL.READ))) return;
    return R.ok(res, ds);
  } catch (err) { return R.serverError(res, err); }
}

// POST /datasets/:id/copy — copia a variável para o Workspace de quem pede (precisa poder LER o original)
async function copyDataset(req, res) {
  try {
    const ds = await resolveDataset(req.params.id);
    if (!ds) return R.notFound(res, 'Dataset');
    if (!(await guardDataset(req, res, ds, LEVEL.READ))) return;

    const uuid = uuidv4();
    // Arquivo guardado (importações de arquivo) é copiado dentro do storage; variáveis coladas vivem no metadata.
    // A cópia conta na cota de quem copia (decisão de produto: tudo que entra no Workspace conta).
    let newKey = null;
    let fileSize = 0;
    if (ds.storage_path) {
      const srcKey = `datasets/${path.basename(ds.storage_path)}`;
      const st = await storage.stat(srcKey);
      if (st) { fileSize = st.size; newKey = `datasets/${uuid}${path.extname(srcKey)}`; }
    }
    const name = (req.body && req.body.name ? String(req.body.name) : ds.name).slice(0, 255);
    const cols = ['uuid', 'user_id', 'name', 'description', 'visibility', 'data_type', 'technique', 'x_unit', 'y_unit', 'spectra_count',
      'x_points', 'x_min', 'x_max', 'reference_labels', 'dimensions', 'mode_labels', 'mode_ranges', 'sample_axis', 'data_order',
      'augmentation_scheme', 'file_format', 'storage_path', 'metadata'];
    const vals = cols.map((c) => {
      if (c === 'uuid') return uuid;
      if (c === 'user_id') return req.user.id;
      if (c === 'name') return name;
      if (c === 'visibility') return 'private';
      if (c === 'storage_path') return newKey;
      const v = ds[c];
      return v !== null && typeof v === 'object' && !(v instanceof Date) ? JSON.stringify(v) : v;
    });
    const total = quota.datasetRowBytes(...[ds.metadata, ds.dimensions, ds.mode_labels, ds.mode_ranges, ds.augmentation_scheme, ds.reference_labels, ds.description]
      .map((v) => (v !== null && typeof v === 'object' ? JSON.stringify(v) : v))) + fileSize;
    const out = await quota.guard(req.user.id, total, async () => {
      if (newKey) await storage.copy(`datasets/${path.basename(ds.storage_path)}`, newKey);
      try {
        const [r] = await db.query(
          `INSERT INTO datasets (${cols.join(', ')}, created_at, updated_at) VALUES (${cols.map(() => '?').join(', ')}, NOW(), NOW())`, vals,
        );
        return { kind: 'dataset', refType: 'dataset', refId: r.insertId, key: newKey, size: total };
      } catch (e) { if (newKey) await storage.remove(newKey).catch(() => {}); throw e; }
    }, { fileBytes: fileSize });
    await db.query('UPDATE users SET stat_datasets = stat_datasets + 1 WHERE id = ?', [req.user.id]);
    const [rows] = await db.query('SELECT * FROM datasets WHERE id = ?', [out.refId]);
    return R.created(res, rows[0]);
  } catch (err) { if (quota.handleError(res, err)) return undefined; return R.serverError(res, err); }
}

// PUT /datasets/:id
async function updateDataset(req, res) {
  try {
    const ds = await resolveDataset(req.params.id);
    if (!ds) return R.notFound(res, 'Dataset');
    if (ds.user_id !== req.user.id && req.user.role !== 'admin') return R.forbidden(res);

    const allowed = ['name', 'description', 'visibility', 'mode_labels', 'mode_ranges', 'metadata'];
    const fields = [];
    const values = [];
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        fields.push(`${key} = ?`);
        values.push(typeof req.body[key] === 'object' ? JSON.stringify(req.body[key]) : req.body[key]);
      }
    }
    if (!fields.length) return R.badRequest(res, 'Nenhum campo para atualizar.');
    values.push(ds.id);

    // se o conteúdo (metadata) muda de tamanho, a cota do dono acompanha — crescer precisa caber
    let resized = null;
    if (req.body.metadata !== undefined) {
      const [[cur]] = await db.query('SELECT COALESCE(LENGTH(CAST(metadata AS CHAR)), 0) AS len FROM datasets WHERE id = ?', [ds.id]);
      const newLen = Buffer.byteLength(typeof req.body.metadata === 'object' ? JSON.stringify(req.body.metadata) : String(req.body.metadata));
      const before = await quota.sizeOfRef('dataset', ds.id);
      resized = { before, target: Math.max(0, before - Number(cur.len) + newLen) };
      if (resized.target !== before) await quota.resize(ds.user_id, 'dataset', ds.id, resized.target, { kind: 'dataset' });
    }
    try {
      await db.query(`UPDATE datasets SET ${fields.join(', ')}, updated_at = NOW() WHERE id = ?`, values);
    } catch (e) {
      if (resized && resized.target !== resized.before) await quota.resize(ds.user_id, 'dataset', ds.id, resized.before, { kind: 'dataset' }).catch(() => {});
      throw e;
    }
    const [rows] = await db.query('SELECT * FROM datasets WHERE id = ?', [ds.id]);
    return R.ok(res, rows[0]);
  } catch (err) { if (quota.handleError(res, err)) return undefined; return R.serverError(res, err); }
}

// DELETE /datasets/:id
async function deleteDataset(req, res) {
  try {
    const ds = await resolveDataset(req.params.id);
    if (!ds) return R.notFound(res, 'Dataset');
    if (ds.user_id !== req.user.id && req.user.role !== 'admin') return R.forbidden(res);
    await db.query('UPDATE datasets SET deleted_at = NOW() WHERE id = ?', [ds.id]);
    // devolve o espaço à cota e apaga o arquivo guardado (o conteúdo no banco é limpo pelo expurgo periódico)
    try { for (const k of await quota.freeByRef('dataset', ds.id)) await storage.remove(k).catch(() => {}); }
    catch (e) { console.warn('[dataset] liberar cota:', e.message); }
    return R.noContent(res);
  } catch (err) { return R.serverError(res, err); }
}

// GET /datasets/:id/lineage
async function getLineage(req, res) {
  try {
    const ds = await resolveDataset(req.params.id);
    if (!ds) return R.notFound(res, 'Dataset');
    if (!(await guardDataset(req, res, ds, LEVEL.READ))) return;
    const lineage = await lineageService.getLineage(ds.id);
    return R.ok(res, lineage);
  } catch (err) { return R.serverError(res, err); }
}

// GET /datasets/:id/slice
async function getSlice(req, res) {
  try {
    const ds = await resolveDataset(req.params.id);
    if (!ds) return R.notFound(res, 'Dataset');
    if (!(await guardDataset(req, res, ds, LEVEL.READ))) return;

    // Monta ranges a partir de query params: ?axis0=0:10&axis1=5:20
    const ranges = {};
    for (const key of Object.keys(req.query)) {
      if (/^axis\d+$/.test(key)) {
        const [start, end] = req.query[key].split(':').map(Number);
        ranges[key] = { start: start || 0, end: end || -1 };
      }
    }

    // Enfileira job para buscar fatia do Zarr
    const { id: jobId, uuid: jobUuid } = await jobService.createJob({
      job_type: 'slice_dataset',
      user_id: req.user.id,
      dataset_id: ds.id,
      payload: { storage_path: ds.storage_path, ranges },
    });

    return R.accepted(res, { job_id: jobUuid, message: 'Fatia em processamento.' });
  } catch (err) { return R.serverError(res, err); }
}

// GET /datasets/:id/preview
async function getPreview(req, res) {
  try {
    const ds = await resolveDataset(req.params.id);
    if (!ds) return R.notFound(res, 'Dataset');
    if (!(await guardDataset(req, res, ds, LEVEL.READ))) return;
    const n_samples = parseInt(req.query.n_samples || '5', 10);
    const n_vars = parseInt(req.query.n_vars || '20', 10);

    const { id: jobId, uuid: jobUuid } = await jobService.createJob({
      job_type: 'preview_dataset',
      user_id: req.user.id,
      dataset_id: ds.id,
      payload: { storage_path: ds.storage_path, n_samples, n_vars },
    });

    return R.accepted(res, { job_id: jobUuid });
  } catch (err) { return R.serverError(res, err); }
}

// POST /datasets/:id/spectra
async function addSpectraToDataset(req, res) {
  try {
    const ds = await resolveDataset(req.params.id);
    if (!ds) return R.notFound(res, 'Dataset');
    const { associations } = req.body; // [{ spectrum_uuid, position }]
    if (!Array.isArray(associations)) {
      return R.unprocessable(res, [{ field: 'associations', message: 'Array obrigatório.' }]);
    }

    for (const assoc of associations) {
      const [sp] = await db.query('SELECT id FROM spectra WHERE uuid = ?', [assoc.spectrum_uuid]);
      if (sp.length) {
        await db.query(
          `INSERT IGNORE INTO dataset_spectra (dataset_id, spectrum_id, position) VALUES (?, ?, ?)`,
          [ds.id, sp[0].id, assoc.position || 0],
        );
      }
    }
    return R.ok(res, { message: 'Espectros associados.' });
  } catch (err) { return R.serverError(res, err); }
}

// GET /datasets/:id/spectra
async function listDatasetSpectra(req, res) {
  try {
    const ds = await resolveDataset(req.params.id);
    if (!ds) return R.notFound(res, 'Dataset');
    if (!(await guardDataset(req, res, ds, LEVEL.READ))) return;
    const [rows] = await db.query(
      `SELECT s.uuid, s.name, s.technique, s.sample_class, ds_s.position
       FROM spectra s
       JOIN dataset_spectra ds_s ON ds_s.spectrum_id = s.id
       WHERE ds_s.dataset_id = ? AND s.deleted_at IS NULL
       ORDER BY ds_s.position ASC`,
      [ds.id],
    );
    return R.ok(res, rows);
  } catch (err) { return R.serverError(res, err); }
}

module.exports = {
  listDatasets, createDataset, smartImport, getDataset, copyDataset, updateDataset, deleteDataset,
  getLineage, getSlice, getPreview, addSpectraToDataset, listDatasetSpectra,
};
