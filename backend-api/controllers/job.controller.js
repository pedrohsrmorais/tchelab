//controllers/job.controller.js

'use strict';

const { pool } = require('../config/db');
const { getTrainingQueue } = require('../queues/training.queue');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseJobRow(row) {
  if (!row) return null;
  return {
    ...row,
    payload: typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload,
    result:  row.result
      ? (typeof row.result === 'string' ? JSON.parse(row.result) : row.result)
      : null,
  };
}

function duration(row) {
  if (!row.started_at) return null;
  const end   = row.finished_at ? new Date(row.finished_at) : new Date();
  const start = new Date(row.started_at);
  return Math.round((end - start) / 1000);
}

function parseJsonField(value) {
  if (!value) return null;
  return typeof value === 'string' ? JSON.parse(value) : value;
}

// ─── GET /jobs ────────────────────────────────────────────────────────────────

async function listJobs(req, res) {
  const page   = Math.max(1, parseInt(req.query.page)  || 1);
  const limit  = Math.min(100, parseInt(req.query.limit) || 20);
  const offset = (page - 1) * limit;

  let where    = 'j.user_id = ?';
  const params = [req.user.sub];

  if (req.query.status) {
    where += ' AND j.status = ?';
    params.push(req.query.status);
  }
  if (req.query.job_type) {
    where += ' AND j.job_type = ?';
    params.push(req.query.job_type);
  }

  const [rows] = await pool.query(
    `SELECT
       j.id, j.uuid, j.job_type, j.status, j.progress,
       j.queue_name, j.celery_task_id,
       j.error_message,
       j.queued_at, j.started_at, j.finished_at,
       j.model_id, j.dataset_id,
       m.name      AS model_name,
       m.algorithm,
       d.name      AS dataset_name
     FROM jobs j
     LEFT JOIN models   m ON m.id = j.model_id
     LEFT JOIN datasets d ON d.id = j.dataset_id
     WHERE ${where}
     ORDER BY j.queued_at DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total FROM jobs j WHERE ${where}`,
    params
  );

  return res.json({
    data: rows.map((r) => ({ ...r, duration_s: duration(r) })),
    total,
    page,
    limit,
  });
}

// ─── GET /jobs/:id ────────────────────────────────────────────────────────────

async function getJob(req, res) {
  const [rows] = await pool.query(
    `SELECT
       j.*,
       m.name      AS model_name,
       m.algorithm, m.status AS model_status,
       m.metrics_cal, m.metrics_cv,
       d.name      AS dataset_name,
       d.technique AS dataset_technique
     FROM jobs j
     LEFT JOIN models   m ON m.id = j.model_id
     LEFT JOIN datasets d ON d.id = j.dataset_id
     WHERE j.id = ? LIMIT 1`,
    [req.params.id]
  );

  const job = rows[0];
  if (!job)                         return res.status(404).json({ message: 'Job não encontrado.' });
  if (job.user_id !== req.user.sub) return res.status(403).json({ message: 'Acesso negado.' });

  return res.json({
    ...parseJobRow(job),
    duration_s:  duration(job),
    metrics_cal: parseJsonField(job.metrics_cal),
    metrics_cv:  parseJsonField(job.metrics_cv),
  });
}

// ─── POST /jobs/:id/cancel ────────────────────────────────────────────────────

async function cancelJob(req, res) {
  const [rows] = await pool.query(
    'SELECT id, user_id, status, celery_task_id, queue_name FROM jobs WHERE id = ? LIMIT 1',
    [req.params.id]
  );

  const job = rows[0];
  if (!job)                         return res.status(404).json({ message: 'Job não encontrado.' });
  if (job.user_id !== req.user.sub) return res.status(403).json({ message: 'Acesso negado.' });

  if (['done', 'failed', 'cancelled'].includes(job.status)) {
    return res.status(409).json({ message: `Job já está com status "${job.status}".` });
  }

  if (job.status === 'queued' && job.celery_task_id) {
    try {
      const queue    = getTrainingQueue();
      const bullJob  = await queue.getJob(job.celery_task_id);
      if (bullJob) await bullJob.remove();
    } catch {
      // Falha na remoção da fila não impede o cancelamento no banco
    }
  }

  await pool.query(
    `UPDATE jobs SET status = 'cancelled', finished_at = NOW() WHERE id = ?`,
    [job.id]
  );

  if (job.model_id) {
    await pool.query(
      `UPDATE models SET status = 'failed' WHERE id = ? AND status IN ('pending','training')`,
      [job.model_id]
    );
  }

  return res.json({ message: 'Job cancelado.' });
}

// ─── GET /jobs/:id/logs ───────────────────────────────────────────────────────

async function getJobLogs(req, res) {
  const [rows] = await pool.query(
    'SELECT id, user_id, status, error_message, error_traceback FROM jobs WHERE id = ? LIMIT 1',
    [req.params.id]
  );

  const job = rows[0];
  if (!job)                         return res.status(404).json({ message: 'Job não encontrado.' });
  if (job.user_id !== req.user.sub) return res.status(403).json({ message: 'Acesso negado.' });

  return res.json({
    id:              job.id,
    status:          job.status,
    error_message:   job.error_message   ?? null,
    error_traceback: job.error_traceback  ?? null,
  });
}

// ─── POST /jobs/:id/update  (callback interno do worker) ─────────────────────
//
// O worker chama este endpoint ao mudar o status de qualquer job.
// Para jobs do tipo 'predict' que chegam como 'done', a inserção
// na tabela `predictions` é feita aqui, dentro da mesma transação,
// garantindo que job e prediction ficam sempre em sincronia.

async function workerUpdate(req, res) {
  const secret = req.headers['x-worker-secret'];
  if (!secret || secret !== process.env.WORKER_SECRET) {
    return res.status(401).json({ message: 'Unauthorized.' });
  }

  const { status, progress, result, error_message, error_traceback } = req.body;

  const VALID_STATUSES = ['running', 'done', 'failed'];
  if (!VALID_STATUSES.includes(status)) {
    return res.status(400).json({ message: `status inválido. Aceitos: ${VALID_STATUSES.join(', ')}` });
  }

  const [rows] = await pool.query(
    `SELECT id, user_id, job_type, model_id, dataset_id, status AS current_status
       FROM jobs WHERE id = ? LIMIT 1`,
    [req.params.id]
  );

  const job = rows[0];
  if (!job) return res.status(404).json({ message: 'Job não encontrado.' });

  if (job.current_status === 'cancelled') {
    return res.json({ message: 'Job cancelado — update ignorado.' });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // ── 1. Atualiza o job ──────────────────────────────────────────────────
    const jobUpdates = {
      status,
      progress:        progress ?? (status === 'done' ? 100 : undefined),
      started_at:      status === 'running' ? new Date() : undefined,
      finished_at:     ['done', 'failed'].includes(status) ? new Date() : undefined,
      result:          result          ? JSON.stringify(result)          : undefined,
      error_message:   error_message   ?? undefined,
      error_traceback: error_traceback ?? undefined,
    };

    const setClauses = [];
    const setValues  = [];
    for (const [k, v] of Object.entries(jobUpdates)) {
      if (v !== undefined) {
        setClauses.push(`${k} = ?`);
        setValues.push(v);
      }
    }

    await conn.query(
      `UPDATE jobs SET ${setClauses.join(', ')} WHERE id = ?`,
      [...setValues, job.id]
    );

    // ── 2. Atualiza modelo (jobs de treino) ────────────────────────────────
    if (job.model_id && job.job_type === 'train_model') {
      const modelStatus = { running: 'training', done: 'ready', failed: 'failed' }[status];

      const modelUpdates = [`status = '${modelStatus}'`];
      const modelValues  = [];

      if (status === 'done' && result) {
        const modelFields = [
          'metrics_cal', 'metrics_cv', 'metrics_ext',
          'model_path', 'model_size_kb',
          'train_samples', 'test_samples',
        ];
        for (const field of modelFields) {
          if (result[field] !== undefined) {
            modelUpdates.push(`${field} = ?`);
            modelValues.push(
              typeof result[field] === 'object'
                ? JSON.stringify(result[field])
                : result[field]
            );
          }
        }
      }

      await conn.query(
        `UPDATE models SET ${modelUpdates.join(', ')} WHERE id = ?`,
        [...modelValues, job.model_id]
      );
    }

    // ── 3. Cria registro em predictions (jobs de predição concluídos) ──────
    if (job.job_type === 'predict' && status === 'done' && result) {
      // O worker deve devolver em result:
      //   { predictions: [...], sample_count: N, scores?: [...] }
      //
      // predictions é o array de resultados por amostra — formato livre
      // definido pelo handler (classe, valor numérico, etc.)

      const sampleCount = result.sample_count
        ?? (Array.isArray(result.predictions) ? result.predictions.length : 0);

      await conn.query(
        `INSERT INTO predictions
           (user_id, model_id, job_id, source_dataset_id, results, sample_count)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          job.user_id,
          job.model_id,
          job.id,
          job.dataset_id ?? null,
          JSON.stringify(result),
          sampleCount,
        ]
      );
    }

    await conn.commit();
    return res.json({ message: 'Job atualizado.' });
  } catch (err) {
    await conn.rollback();
    console.error('[jobs] workerUpdate error:', err);
    return res.status(500).json({ message: 'Erro interno ao atualizar job.' });
  } finally {
    conn.release();
  }
}

// ─── Admin: GET /admin/jobs ───────────────────────────────────────────────────

async function listAllJobs(req, res) {
  const page   = Math.max(1, parseInt(req.query.page)  || 1);
  const limit  = Math.min(100, parseInt(req.query.limit) || 50);
  const offset = (page - 1) * limit;

  let where    = '1=1';
  const params = [];

  if (req.query.status) {
    where += ' AND j.status = ?';
    params.push(req.query.status);
  }
  if (req.query.user_id) {
    where += ' AND j.user_id = ?';
    params.push(req.query.user_id);
  }

  const [rows] = await pool.query(
    `SELECT
       j.id, j.uuid, j.job_type, j.status, j.progress,
       j.queue_name, j.error_message,
       j.queued_at, j.started_at, j.finished_at,
       u.name  AS user_name,
       m.name  AS model_name,
       m.algorithm,
       d.name  AS dataset_name
     FROM jobs j
     JOIN  users    u ON u.id = j.user_id
     LEFT JOIN models   m ON m.id = j.model_id
     LEFT JOIN datasets d ON d.id = j.dataset_id
     WHERE ${where}
     ORDER BY j.queued_at DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total FROM jobs j WHERE ${where}`,
    params
  );

  return res.json({
    data: rows.map((r) => ({ ...r, duration_s: duration(r) })),
    total, page, limit,
  });
}

module.exports = {
  listJobs,
  getJob,
  cancelJob,
  getJobLogs,
  workerUpdate,
  listAllJobs,
};