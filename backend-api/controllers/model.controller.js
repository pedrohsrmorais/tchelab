'use strict';

const { pool }        = require('../config/db');
const { addTrainJob } = require('../queues/training.queue');

// ─── Constantes ───────────────────────────────────────────────────────────────

const VALID_ALGORITHMS = [
  'KNN', 'PLS-OC', 'SIMCA',
  'PLS', 'PLS-DA', 'PCR', 'PCA', 'LDA', 'SVM', 'Random Forest', 'MLP', 'CNN-1D', 'Other',
];

const VALID_MODEL_TYPES  = ['regression', 'classification', 'exploratory'];
const VALID_VISIBILITIES = ['public', 'private'];

const ALGORITHM_DEFAULT_TYPE = {
  'KNN': 'classification', 'PLS-OC': 'classification', 'SIMCA': 'classification',
  'PLS-DA': 'classification', 'LDA': 'classification', 'SVM': 'classification',
  'Random Forest': 'classification', 'MLP': 'classification', 'CNN-1D': 'classification',
  'PLS': 'regression', 'PCR': 'regression',
  'PCA': 'exploratory',
  'Other': 'regression',
};

const VALID_PREPROCESSING_STEPS = [
  'none', 'center', 'autoscale', 'snv', 'msc',
  'sg_smooth', 'sg_deriv1', 'sg_deriv2', 'range_cut',
];

const PUBLIC_FIELDS = `
  m.id, m.uuid, m.name, m.description, m.visibility,
  m.algorithm, m.model_type, m.hyperparameters, m.preprocessing,
  m.selected_vars, m.model_size_kb, m.status,
  m.metrics_cal, m.metrics_cv, m.metrics_ext,
  m.train_samples, m.test_samples, m.cv_folds,
  m.dataset_id, m.created_at, m.updated_at,
  u.id       AS owner_id,
  u.name     AS owner_name,
  u.initials AS owner_initials,
  d.name     AS dataset_name,
  d.technique AS dataset_technique,
  d.x_unit, d.y_unit
`.trim();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseJson(v) {
  if (!v) return null;
  return typeof v === 'string' ? JSON.parse(v) : v;
}

function normalizeModel(row) {
  if (!row) return null;
  return {
    ...row,
    hyperparameters: parseJson(row.hyperparameters),
    preprocessing:   parseJson(row.preprocessing),
    selected_vars:   parseJson(row.selected_vars),
    metrics_cal:     parseJson(row.metrics_cal),
    metrics_cv:      parseJson(row.metrics_cv),
    metrics_ext:     parseJson(row.metrics_ext),
  };
}

function validatePreprocessing(preprocessing) {
  if (!preprocessing) return null;
  if (!Array.isArray(preprocessing)) return '"preprocessing" deve ser um array.';
  for (const entry of preprocessing) {
    if (!entry.step || !VALID_PREPROCESSING_STEPS.includes(entry.step))
      return `Passo inválido: "${entry.step}". Válidos: ${VALID_PREPROCESSING_STEPS.join(', ')}`;
    if (entry.step === 'range_cut') {
      if (entry.idx_min == null || entry.idx_max == null)
        return '"range_cut" requer idx_min e idx_max.';
      if (entry.idx_min >= entry.idx_max)
        return '"range_cut": idx_min deve ser menor que idx_max.';
    }
  }
  return null;
}

async function assertDatasetAccess(datasetId, userId) {
  const [rows] = await pool.query(
    `SELECT id, user_id, visibility, x_points, spectra_count, deleted_at
     FROM datasets WHERE id = ? LIMIT 1`,
    [datasetId]
  );
  const ds = rows[0];
  if (!ds || ds.deleted_at)
    throw { status: 404, message: 'Dataset não encontrado.' };
  if (ds.visibility === 'private' && ds.user_id !== userId)
    throw { status: 403, message: 'Sem acesso ao dataset.' };
  return ds;
}

/**
 * Verifica se o dataset tem espectros com papel ('train'/'test') atribuído
 * manualmente na tela de dataset. Se houver, o treino deve respeitar essa
 * divisão em vez de sortear aleatoriamente via test_split.
 *
 * IMPORTANTE: o worker (Python) precisa ler `manual_split`,
 * `train_spectrum_ids` e `test_spectrum_ids` do payload do job e usar essa
 * divisão explícita em vez do split aleatório quando `manual_split === true`.
 * Essa parte ainda não está implementada no worker.
 */
async function getManualSplit(datasetId) {
  const [rows] = await pool.query(
    `SELECT spectrum_id, role FROM dataset_spectra WHERE dataset_id = ? AND role IN ('train','test')`,
    [datasetId]
  );
  return {
    train: rows.filter((r) => r.role === 'train').map((r) => r.spectrum_id),
    test:  rows.filter((r) => r.role === 'test').map((r) => r.spectrum_id),
  };
}

// ─── GET /models/algorithms ───────────────────────────────────────────────────

async function listAlgorithms(_req, res) {
  const algorithms = [
    {
      algorithm: 'KNN', label: 'K-Nearest Neighbors (KNN)', model_type: 'classification',
      status: 'available',
      description: 'Classifica com base nas k amostras de treino mais próximas no espaço espectral.',
      hyperparameters: {
        n_neighbors: { type: 'int',    label: 'Número de vizinhos (k)', default: 5, min: 1, max: 50 },
        metric:      { type: 'select', label: 'Métrica de distância',   default: 'euclidean',
                       options: ['euclidean', 'mahalanobis', 'cosine', 'cityblock'] },
        weights:     { type: 'select', label: 'Ponderação',             default: 'uniform',
                       options: ['uniform', 'distance'] },
      },
    },
    {
      algorithm: 'PLS-OC', label: 'PLS One-Class (PLS-OC)', model_type: 'classification',
      status: 'available',
      description: 'Modela apenas a classe de interesse e rejeita amostras fora do espaço definido.',
      hyperparameters: {
        n_components: { type: 'int',   label: 'Componentes latentes',    default: 3, min: 1, max: 20 },
        threshold:    { type: 'float', label: 'Limiar de aceitação (α)', default: 0.05, min: 0.01, max: 0.20, step: 0.01 },
      },
    },
    {
      algorithm: 'SIMCA', label: 'SIMCA', model_type: 'classification',
      status: 'available',
      description: 'Constrói um modelo PCA por classe e avalia pertencimento via T² e resíduo Q.',
      hyperparameters: {
        n_components: { type: 'int',   label: 'Componentes PCA por classe', default: 3, min: 1, max: 20 },
        alpha:        { type: 'float', label: 'Nível de significância (α)', default: 0.05, min: 0.01, max: 0.20, step: 0.01 },
      },
    },
    {
      algorithm: 'PLS', label: 'Partial Least Squares (PLS)', model_type: 'regression',
      status: 'available',
      description: 'Regressão PLS para predição de propriedades contínuas. O mais usado em NIR e FTIR.',
      hyperparameters: {
        n_components: { type: 'int',  label: 'Componentes latentes', default: 3, min: 1, max: 20 },
        scale:        { type: 'bool', label: 'Centrar e escalar X',  default: false },
      },
    },
    {
      algorithm: 'PCA', label: 'Principal Component Analysis (PCA)', model_type: 'exploratory',
      status: 'available',
      description: 'Análise exploratória: reduz dimensionalidade e revela agrupamentos e outliers.',
      hyperparameters: {
        n_components: { type: 'int', label: 'Número de componentes principais', default: 3, min: 1, max: 20 },
      },
    },
  ];

  const preprocessing_steps = [
    { step: 'none',      label: 'Nenhum' },
    { step: 'center',    label: 'Centralização (mean center)' },
    { step: 'autoscale', label: 'Autoescalonamento (UV)' },
    { step: 'snv',       label: 'Standard Normal Variate (SNV)' },
    { step: 'msc',       label: 'Multiplicative Scatter Correction (MSC)' },
    { step: 'sg_smooth', label: 'Savitzky-Golay — Suavização',
      params: { window_length: { type: 'int', default: 11, min: 3, max: 51, step: 2 },
                polyorder:     { type: 'int', default: 2,  min: 1, max: 5  } } },
    { step: 'sg_deriv1', label: 'Savitzky-Golay — 1ª Derivada',
      params: { window_length: { type: 'int', default: 11, min: 3, max: 51, step: 2 },
                polyorder:     { type: 'int', default: 2,  min: 1, max: 5  } } },
    { step: 'sg_deriv2', label: 'Savitzky-Golay — 2ª Derivada',
      params: { window_length: { type: 'int', default: 11, min: 3, max: 51, step: 2 },
                polyorder:     { type: 'int', default: 2,  min: 1, max: 5  } } },
    { step: 'range_cut', label: 'Corte de Região Espectral',
      params: { idx_min: { type: 'int', label: 'Índice inicial' },
                idx_max: { type: 'int', label: 'Índice final'   } } },
  ];

  return res.json({ algorithms, preprocessing_steps });
}

// ─── POST /models/train ───────────────────────────────────────────────────────

async function trainModel(req, res) {
  const {
    name, dataset_id, algorithm, model_type, description,
    visibility = 'private', hyperparameters, preprocessing,
    selected_vars, cv_folds = 5, test_split = 0.2,
    target_property = null, target_properties = null,
  } = req.body;

  if (!name)       return res.status(400).json({ message: '"name" é obrigatório.' });
  if (!dataset_id) return res.status(400).json({ message: '"dataset_id" é obrigatório.' });
  if (!algorithm)  return res.status(400).json({ message: '"algorithm" é obrigatório.' });

  if (!VALID_ALGORITHMS.includes(algorithm))
    return res.status(400).json({ message: `algorithm inválido. Aceitos: ${VALID_ALGORITHMS.join(', ')}` });

  const resolvedType = model_type ?? ALGORITHM_DEFAULT_TYPE[algorithm];
  if (!VALID_MODEL_TYPES.includes(resolvedType))
    return res.status(400).json({ message: `model_type inválido. Aceitos: ${VALID_MODEL_TYPES.join(', ')}` });

  if (!VALID_VISIBILITIES.includes(visibility))
    return res.status(400).json({ message: 'visibility deve ser "public" ou "private".' });

  const prepError = validatePreprocessing(preprocessing);
  if (prepError) return res.status(400).json({ message: prepError });

  if (cv_folds != null && (cv_folds < 2 || cv_folds > 20))
    return res.status(400).json({ message: 'cv_folds deve estar entre 2 e 20.' });
  if (test_split != null && (test_split < 0 || test_split >= 1))
    return res.status(400).json({ message: 'test_split deve estar entre 0 e 1.' });

  let dataset;
  try {
    dataset = await assertDatasetAccess(Number(dataset_id), req.user.sub);
  } catch (e) {
    return res.status(e.status).json({ message: e.message });
  }

  // Usa spectra_count (novo campo) em vez de sample_count
  if ((dataset.spectra_count ?? 0) < 2)
    return res.status(422).json({ message: 'Dataset precisa de ao menos 2 espectros para treino.' });

  // ── Split manual (definido na tela de dataset) ──────────────────────────
  const manualSplit    = await getManualSplit(Number(dataset_id));
  const useManualSplit = manualSplit.train.length > 0 || manualSplit.test.length > 0;

  if (useManualSplit && manualSplit.train.length === 0) {
    return res.status(422).json({
      message: 'Existem espectros marcados como "teste", mas nenhum como "treino". Marque ao menos um espectro como treino antes de continuar.',
    });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [modelResult] = await conn.query(
      `INSERT INTO models
         (user_id, dataset_id, name, description, visibility,
          algorithm, model_type, hyperparameters, preprocessing,
          selected_vars, cv_folds, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [
        req.user.sub, dataset_id, name, description ?? null, visibility,
        algorithm, resolvedType,
        hyperparameters ? JSON.stringify(hyperparameters) : null,
        preprocessing   ? JSON.stringify(preprocessing)   : null,
        selected_vars   ? JSON.stringify(selected_vars)   : null,
        cv_folds,
      ]
    );
    const modelId = modelResult.insertId;

    const jobPayload = {
      model_id:            modelId,
      dataset_id:          Number(dataset_id),
      algorithm,
      model_type:          resolvedType,
      hyperparameters:     hyperparameters ?? {},
      preprocessing:       preprocessing   ?? [],
      selected_vars:       selected_vars   ?? null,
      cv_folds,
      // Quando há split manual, test_split é ignorado — o worker deve usar
      // train_spectrum_ids / test_spectrum_ids diretamente.
      test_split:          useManualSplit ? null : test_split,
      manual_split:        useManualSplit,
      train_spectrum_ids:  useManualSplit ? manualSplit.train : null,
      test_spectrum_ids:   useManualSplit ? manualSplit.test  : null,
      x_points:            dataset.x_points,
      sample_count:        useManualSplit
        ? (manualSplit.train.length + manualSplit.test.length)
        : dataset.spectra_count,
      target_property,
      target_properties,
    };

    const [jobResult] = await conn.query(
      `INSERT INTO jobs
         (user_id, job_type, model_id, dataset_id, queue_name, payload, status)
       VALUES (?, 'train_model', ?, ?, 'training', ?, 'queued')`,
      [req.user.sub, modelId, dataset_id, JSON.stringify(jobPayload)]
    );
    const jobId = jobResult.insertId;

    jobPayload.job_id = jobId;
    const bullJob = await addTrainJob(jobPayload);

    await conn.query(
      'UPDATE jobs SET celery_task_id = ? WHERE id = ?',
      [bullJob.id, jobId]
    );

    await conn.commit();
    return res.status(202).json({
      message: useManualSplit
        ? `Treino enfileirado com split manual (${manualSplit.train.length} treino / ${manualSplit.test.length} teste).`
        : 'Treino enfileirado.',
      model_id: modelId, job_id: jobId, queue_task: bullJob.id,
      manual_split: useManualSplit,
    });
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

// ─── GET /models ──────────────────────────────────────────────────────────────

async function listModels(req, res) {
  const page   = Math.max(1, parseInt(req.query.page)  || 1);
  const limit  = Math.min(100, parseInt(req.query.limit) || 20);
  const offset = (page - 1) * limit;

  let where    = 'm.deleted_at IS NULL AND m.status = "ready"';
  const params = [];

  if (req.user) {
    where += ' AND (m.visibility = "public" OR m.user_id = ?)';
    params.push(req.user.sub);
  } else {
    where += ' AND m.visibility = "public"';
  }

  if (req.query.algorithm)  { where += ' AND m.algorithm = ?';   params.push(req.query.algorithm); }
  if (req.query.model_type) { where += ' AND m.model_type = ?';  params.push(req.query.model_type); }

  const [rows] = await pool.query(
    `SELECT ${PUBLIC_FIELDS}
     FROM models m
     JOIN users    u ON u.id = m.user_id
     JOIN datasets d ON d.id = m.dataset_id
     WHERE ${where}
     ORDER BY m.created_at DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total FROM models m WHERE ${where}`, params
  );

  return res.json({ data: rows.map(normalizeModel), total, page, limit });
}

// ─── GET /models/mine ─────────────────────────────────────────────────────────

async function listMyModels(req, res) {
  const page   = Math.max(1, parseInt(req.query.page)  || 1);
  const limit  = Math.min(100, parseInt(req.query.limit) || 20);
  const offset = (page - 1) * limit;

  const [rows] = await pool.query(
    `SELECT ${PUBLIC_FIELDS}
     FROM models m
     JOIN users    u ON u.id = m.user_id
     JOIN datasets d ON d.id = m.dataset_id
     WHERE m.user_id = ? AND m.deleted_at IS NULL
     ORDER BY m.created_at DESC LIMIT ? OFFSET ?`,
    [req.user.sub, limit, offset]
  );

  const [[{ total }]] = await pool.query(
    'SELECT COUNT(*) AS total FROM models WHERE user_id = ? AND deleted_at IS NULL',
    [req.user.sub]
  );

  return res.json({ data: rows.map(normalizeModel), total, page, limit });
}

// ─── GET /models/:id ──────────────────────────────────────────────────────────

async function getModel(req, res) {
  const [rows] = await pool.query(
    `SELECT ${PUBLIC_FIELDS}
     FROM models m
     JOIN users    u ON u.id = m.user_id
     JOIN datasets d ON d.id = m.dataset_id
     WHERE m.id = ? AND m.deleted_at IS NULL LIMIT 1`,
    [req.params.id]
  );

  const model = rows[0];
  if (!model) return res.status(404).json({ message: 'Modelo não encontrado.' });

  if (model.visibility === 'private' && (!req.user || req.user.sub !== model.owner_id))
    return res.status(403).json({ message: 'Acesso negado.' });

  return res.json(normalizeModel(model));
}

// ─── PATCH /models/:id ────────────────────────────────────────────────────────

async function updateModel(req, res) {
  const ALLOWED = ['name', 'description', 'visibility'];
  const fields  = {};
  for (const key of ALLOWED) {
    if (key in req.body) fields[key] = req.body[key];
  }

  if (!Object.keys(fields).length)
    return res.status(400).json({ message: 'Nenhum campo válido para atualizar.' });

  if (fields.visibility && !VALID_VISIBILITIES.includes(fields.visibility))
    return res.status(400).json({ message: 'visibility deve ser "public" ou "private".' });

  const setClause = Object.keys(fields).map((k) => `${k} = ?`).join(', ');
  const [result]  = await pool.query(
    `UPDATE models SET ${setClause} WHERE id = ? AND user_id = ? AND deleted_at IS NULL`,
    [...Object.values(fields), req.params.id, req.user.sub]
  );

  if (!result.affectedRows)
    return res.status(404).json({ message: 'Modelo não encontrado.' });
  return res.json({ message: 'Modelo atualizado.' });
}

// ─── DELETE /models/:id ───────────────────────────────────────────────────────

async function deleteModel(req, res) {
  const [result] = await pool.query(
    `UPDATE models SET deleted_at = NOW() WHERE id = ? AND user_id = ? AND deleted_at IS NULL`,
    [req.params.id, req.user.sub]
  );

  if (!result.affectedRows)
    return res.status(404).json({ message: 'Modelo não encontrado.' });
  return res.json({ message: 'Modelo removido.' });
}

// ─── POST /models/:id/retrain ─────────────────────────────────────────────────

async function retrainModel(req, res) {
  const [rows] = await pool.query(
    'SELECT * FROM models WHERE id = ? AND user_id = ? AND deleted_at IS NULL LIMIT 1',
    [req.params.id, req.user.sub]
  );

  const model = rows[0];
  if (!model) return res.status(404).json({ message: 'Modelo não encontrado.' });
  if (model.status === 'training')
    return res.status(409).json({ message: 'Modelo já está sendo treinado.' });

  if (req.body.preprocessing) {
    const prepError = validatePreprocessing(req.body.preprocessing);
    if (prepError) return res.status(400).json({ message: prepError });
  }

  const newHyperparameters = req.body.hyperparameters
    ? JSON.stringify(req.body.hyperparameters) : model.hyperparameters;
  const newPreprocessing = req.body.preprocessing
    ? JSON.stringify(req.body.preprocessing) : model.preprocessing;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    await conn.query(
      `UPDATE models SET status = 'pending', hyperparameters = ?, preprocessing = ?,
       metrics_cal = NULL, metrics_cv = NULL, metrics_ext = NULL,
       model_path = NULL, updated_at = NOW() WHERE id = ?`,
      [newHyperparameters, newPreprocessing, model.id]
    );

    let dataset;
    try {
      dataset = await assertDatasetAccess(model.dataset_id, req.user.sub);
    } catch (e) {
      await conn.rollback();
      return res.status(e.status).json({ message: e.message });
    }

    const jobPayload = {
      model_id:          model.id,
      dataset_id:        model.dataset_id,
      algorithm:         model.algorithm,
      model_type:        model.model_type,
      hyperparameters:   req.body.hyperparameters ?? parseJson(model.hyperparameters) ?? {},
      preprocessing:     req.body.preprocessing   ?? parseJson(model.preprocessing)   ?? [],
      selected_vars:     parseJson(model.selected_vars),
      cv_folds:          model.cv_folds,
      test_split:        req.body.test_split ?? 0.2,
      x_points:          dataset.x_points,
      sample_count:      dataset.spectra_count,
      target_property:   req.body.target_property   ?? null,
      target_properties: req.body.target_properties ?? null,
    };

    const [jobResult] = await conn.query(
      `INSERT INTO jobs
         (user_id, job_type, model_id, dataset_id, queue_name, payload, status)
       VALUES (?, 'train_model', ?, ?, 'training', ?, 'queued')`,
      [req.user.sub, model.id, model.dataset_id, JSON.stringify(jobPayload)]
    );
    const jobId = jobResult.insertId;
    jobPayload.job_id = jobId;

    const bullJob = await addTrainJob(jobPayload);
    await conn.query('UPDATE jobs SET celery_task_id = ? WHERE id = ?', [bullJob.id, jobId]);

    await conn.commit();
    return res.status(202).json({ message: 'Retrain enfileirado.', job_id: jobId });
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = {
  listAlgorithms, trainModel, listModels, listMyModels,
  getModel, updateModel, deleteModel, retrainModel,
};