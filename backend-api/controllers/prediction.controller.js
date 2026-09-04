//controllers/prediction.controller.js

'use strict';

const { pool } = require('../config/db');

// ─── helpers ──────────────────────────────────────────────────────────────────

function resolveId(id) {
  const isUuid = /^[0-9a-f-]{36}$/i.test(id);
  return isUuid
    ? { clause: 'uuid = ?', value: id }
    : { clause: 'id = ?',   value: Number(id) };
}

// ─── POST /predictions ────────────────────────────────────────────────────────

exports.createPrediction = async (req, res) => {
  const userId = req.user.sub;                          // ← consistente com os outros controllers
  const { model_id, dataset_id } = req.body;

  if (!model_id || !dataset_id) {
    return res.status(400).json({ message: 'model_id e dataset_id são obrigatórios.' });
  }

  try {
    // ── Verifica o modelo ──────────────────────────────────────────────────
    const { clause: mClause, value: mValue } = resolveId(String(model_id));
    const [[model]] = await pool.query(
      `SELECT id, uuid, name, algorithm, model_type, status, visibility, user_id
         FROM models
        WHERE ${mClause} AND deleted_at IS NULL`,
      [mValue]
    );

    if (!model)
      return res.status(404).json({ message: 'Modelo não encontrado.' });

    if (model.status !== 'ready')
      return res.status(422).json({ message: `Modelo não está pronto (status: ${model.status}).` });

    if (model.visibility !== 'public' && model.user_id !== userId)
      return res.status(403).json({ message: 'Acesso negado ao modelo.' });

    // ── Verifica o dataset ─────────────────────────────────────────────────
    const { clause: dClause, value: dValue } = resolveId(String(dataset_id));
    const [[dataset]] = await pool.query(
      `SELECT id, uuid, name, technique, x_unit, x_points, sample_count, visibility, user_id
         FROM datasets
        WHERE ${dClause} AND deleted_at IS NULL`,
      [dValue]
    );

    if (!dataset)
      return res.status(404).json({ message: 'Dataset não encontrado.' });

    if (dataset.visibility !== 'public' && dataset.user_id !== userId)
      return res.status(403).json({ message: 'Acesso negado ao dataset.' });

    if (dataset.sample_count === 0)
      return res.status(422).json({ message: 'O dataset não possui amostras.' });

    // ── Cria o job ─────────────────────────────────────────────────────────
    const payload = {
      model_id:     model.id,
      model_uuid:   model.uuid,
      dataset_id:   dataset.id,
      dataset_uuid: dataset.uuid,
      algorithm:    model.algorithm,
      model_type:   model.model_type,
    };

    const [jobResult] = await pool.query(
      `INSERT INTO jobs
         (user_id, job_type, model_id, dataset_id, queue_name, payload, status)
       VALUES (?, 'predict', ?, ?, 'default', ?, 'queued')`,
      [userId, model.id, dataset.id, JSON.stringify(payload)]
    );
    const jobId = jobResult.insertId;

    const [[job]] = await pool.query(
      'SELECT id, uuid, job_type, status, progress, queued_at FROM jobs WHERE id = ?',
      [jobId]
    );

    // ── Notifica o worker (fire-and-forget) ────────────────────────────────
    try {
      const workerUrl = process.env.WORKER_URL ?? 'http://localhost:5001';
      await fetch(`${workerUrl}/enqueue`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ job_id: jobId, job_type: 'predict', payload }),
        signal:  AbortSignal.timeout(4000),
      });
    } catch {
      console.warn(`[predictions] Falha ao notificar worker para job ${jobId}`);
    }

    return res.status(202).json({ message: 'Predição enfileirada.', job });
  } catch (err) {
    console.error('[predictions] createPrediction:', err);
    return res.status(500).json({ message: 'Erro interno ao criar predição.' });
  }
};

// ─── GET /predictions ─────────────────────────────────────────────────────────

exports.listPredictions = async (req, res) => {
  const userId = req.user.sub;
  const page   = Math.max(1, parseInt(req.query.page)  || 1);
  const limit  = Math.min(100, parseInt(req.query.limit) || 20);
  const offset = (page - 1) * limit;

  try {
    const [rows] = await pool.query(
      `SELECT
         p.id, p.uuid, p.sample_count, p.created_at,
         m.id        AS model_id,   m.uuid AS model_uuid,   m.name AS model_name,
         m.algorithm, m.model_type,
         d.id        AS dataset_id, d.uuid AS dataset_uuid, d.name AS dataset_name,
         j.id        AS job_id,     j.uuid AS job_uuid,
         j.status    AS job_status, j.progress AS job_progress
       FROM predictions p
       JOIN models  m ON m.id = p.model_id
       JOIN jobs    j ON j.id = p.job_id
       LEFT JOIN datasets d ON d.id = p.source_dataset_id
       WHERE p.user_id = ?
       ORDER BY p.created_at DESC
       LIMIT ? OFFSET ?`,
      [userId, limit, offset]
    );

    const [[{ total }]] = await pool.query(
      'SELECT COUNT(*) AS total FROM predictions WHERE user_id = ?',
      [userId]
    );

    return res.json({
      data: rows,
      meta: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error('[predictions] listPredictions:', err);
    return res.status(500).json({ message: 'Erro interno ao listar predições.' });
  }
};

// ─── GET /predictions/:id ─────────────────────────────────────────────────────

exports.getPrediction = async (req, res) => {
  const userId = req.user.sub;
  const { clause, value } = resolveId(req.params.id);

  try {
    const [[prediction]] = await pool.query(
      `SELECT
         p.*,
         m.name      AS model_name, m.algorithm, m.model_type,
         d.name      AS dataset_name,
         j.status    AS job_status, j.progress AS job_progress,
         j.error_message AS job_error, j.started_at, j.finished_at
       FROM predictions p
       JOIN models  m ON m.id = p.model_id
       JOIN jobs    j ON j.id = p.job_id
       LEFT JOIN datasets d ON d.id = p.source_dataset_id
       WHERE p.${clause} AND p.user_id = ?`,
      [value, userId]
    );

    if (!prediction)
      return res.status(404).json({ message: 'Predição não encontrada.' });

    if (typeof prediction.results === 'string')
      prediction.results = JSON.parse(prediction.results);

    return res.json(prediction);
  } catch (err) {
    console.error('[predictions] getPrediction:', err);
    return res.status(500).json({ message: 'Erro interno ao buscar predição.' });
  }
};

// ─── DELETE /predictions/:id ──────────────────────────────────────────────────

exports.deletePrediction = async (req, res) => {
  const userId = req.user.sub;
  const { clause, value } = resolveId(req.params.id);

  try {
    const [[prediction]] = await pool.query(
      `SELECT id FROM predictions WHERE ${clause} AND user_id = ?`,
      [value, userId]
    );

    if (!prediction)
      return res.status(404).json({ message: 'Predição não encontrada.' });

    await pool.query('DELETE FROM predictions WHERE id = ?', [prediction.id]);
    return res.status(204).send();
  } catch (err) {
    console.error('[predictions] deletePrediction:', err);
    return res.status(500).json({ message: 'Erro interno ao deletar predição.' });
  }
};