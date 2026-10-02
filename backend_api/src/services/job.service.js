'use strict';

const { v4: uuidv4 } = require('uuid');
const db = require('../config/db.config');
const redis = require('../config/redis.config');

const REDIS_JOB_CHANNEL = 'tchelab:jobs';

/**
 * Cria um job na tabela `jobs` e publica no canal Redis para o worker Python.
 *
 * @param {object} params
 * @param {string}  params.job_type         Tipo do job (ex: 'execute_workflow')
 * @param {number}  params.user_id          Usuário que criou
 * @param {object}  params.payload          Dados enviados ao worker
 * @param {number}  [params.workflow_id]
 * @param {number}  [params.execution_id]
 * @param {number}  [params.dataset_id]
 * @param {number}  [params.article_id]
 * @param {number}  [params.model_id]
 * @param {number}  [params.prediction_id]
 * @returns {Promise<{ id: number, uuid: string }>}
 */
async function createJob({
  job_type,
  user_id,
  payload = {},
  workflow_id = null,
  execution_id = null,
  dataset_id = null,
  article_id = null,
  model_id = null,
  prediction_id = null,
}) {
  const uuid = uuidv4();
  const [result] = await db.query(
    `INSERT INTO jobs
       (uuid, job_type, status, user_id, payload, workflow_id, execution_id,
        dataset_id, article_id, model_id, prediction_id, queued_at)
     VALUES (?, ?, 'queued', ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
    [
      uuid, job_type, user_id,
      JSON.stringify(payload),
      workflow_id, execution_id, dataset_id, article_id, model_id, prediction_id,
    ],
  );

  const jobId = result.insertId;

  // Publica no Redis para o worker Python consumir
  try {
    await redis.publish(REDIS_JOB_CHANNEL, JSON.stringify({ job_id: jobId, uuid, job_type }));
  } catch (err) {
    console.error('[JobService] Falha ao publicar no Redis:', err.message);
    // Job já está no banco; worker pode consultar periodicamente como fallback
  }

  return { id: jobId, uuid };
}

/**
 * Retorna um job pelo uuid (exposto pela API).
 */
async function getJobByUuid(uuid) {
  const [rows] = await db.query('SELECT * FROM jobs WHERE uuid = ?', [uuid]);
  return rows[0] || null;
}

/**
 * Retorna um job pelo id interno.
 */
async function getJobById(id) {
  const [rows] = await db.query('SELECT * FROM jobs WHERE id = ?', [id]);
  return rows[0] || null;
}

module.exports = { createJob, getJobByUuid, getJobById };
