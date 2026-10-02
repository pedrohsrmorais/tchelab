'use strict';

const { v4: uuidv4 } = require('uuid');
const db = require('../config/db.config');
const jobService = require('../services/job.service');
const R = require('../utils/response');

const ALLOWED_CONTEXTS = ['workflow', 'dataset', 'technique', 'execution', 'article_analysis', 'general'];
const ALLOWED_INTERACTION_TYPES = ['question', 'suggestion', 'explanation', 'recommendation', 'review'];

// GET /ai-interactions
async function listInteractions(req, res) {
  try {
    const { context_type, interaction_type } = req.query;
    const conditions = ['ai.user_id = ?'];
    const params = [req.user.id];

    if (context_type) { conditions.push('ai.context_type = ?'); params.push(context_type); }
    if (interaction_type) { conditions.push('ai.interaction_type = ?'); params.push(interaction_type); }

    const where = conditions.join(' AND ');
    const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total FROM ai_interactions ai WHERE ${where}`, params);
    const { offset, limit, meta } = R.paginate(req, total);

    const [rows] = await db.query(
      `SELECT ai.uuid, ai.context_type, ai.context_uuid, ai.interaction_type,
              ai.prompt, ai.response_summary, ai.tokens_used,
              ai.created_at
       FROM ai_interactions ai WHERE ${where}
       ORDER BY ai.created_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    );
    return R.ok(res, rows, { ...meta, total });
  } catch (err) { return R.serverError(res, err); }
}

// POST /ai-interactions
async function createInteraction(req, res) {
  try {
    const { context_type, context_uuid, interaction_type, prompt, metadata } = req.body;

    const errors = [];
    if (!context_type) errors.push({ field: 'context_type', message: 'Obrigatório.' });
    else if (!ALLOWED_CONTEXTS.includes(context_type)) {
      errors.push({ field: 'context_type', message: `Tipo inválido. Use: ${ALLOWED_CONTEXTS.join(', ')}.` });
    }
    if (!interaction_type) errors.push({ field: 'interaction_type', message: 'Obrigatório.' });
    else if (!ALLOWED_INTERACTION_TYPES.includes(interaction_type)) {
      errors.push({ field: 'interaction_type', message: `Tipo inválido. Use: ${ALLOWED_INTERACTION_TYPES.join(', ')}.` });
    }
    if (!prompt || prompt.trim().length === 0) errors.push({ field: 'prompt', message: 'Obrigatório.' });
    if (errors.length) return R.unprocessable(res, errors);

    const interUuid = uuidv4();
    const [result] = await db.query(
      `INSERT INTO ai_interactions
         (uuid, user_id, context_type, context_uuid, interaction_type, prompt, metadata, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', NOW())`,
      [
        interUuid, req.user.id, context_type, context_uuid || null,
        interaction_type, prompt.trim(),
        JSON.stringify(metadata || {}),
      ],
    );

    // Enfileira para o worker Python (que tem acesso ao LLM)
    const { id: jobId, uuid: jobUuid } = await jobService.createJob({
      job_type: 'ai_interaction',
      user_id: req.user.id,
      payload: {
        interaction_uuid: interUuid,
        context_type,
        context_uuid: context_uuid || null,
        interaction_type,
        prompt: prompt.trim(),
        metadata: metadata || {},
      },
    });

    const [rows] = await db.query('SELECT * FROM ai_interactions WHERE id = ?', [result.insertId]);
    return R.accepted(res, { interaction: rows[0], job_id: jobUuid });
  } catch (err) { return R.serverError(res, err); }
}

// GET /ai-interactions/:id
async function getInteraction(req, res) {
  try {
    const [rows] = await db.query(
      'SELECT * FROM ai_interactions WHERE uuid = ?',
      [req.params.id],
    );
    if (!rows.length) return R.notFound(res, 'Interação');
    if (rows[0].user_id !== req.user.id && req.user.role !== 'admin') return R.forbidden(res);
    return R.ok(res, rows[0]);
  } catch (err) { return R.serverError(res, err); }
}

// POST /ai-interactions/:id/feedback
async function submitFeedback(req, res) {
  try {
    const [rows] = await db.query(
      'SELECT * FROM ai_interactions WHERE uuid = ?',
      [req.params.id],
    );
    if (!rows.length) return R.notFound(res, 'Interação');
    const interaction = rows[0];
    if (interaction.user_id !== req.user.id) return R.forbidden(res);

    const { rating, comment } = req.body;
    if (rating === undefined || rating < 1 || rating > 5) {
      return R.unprocessable(res, [{ field: 'rating', message: 'Rating deve ser entre 1 e 5.' }]);
    }

    await db.query(
      'UPDATE ai_interactions SET feedback_rating = ?, feedback_comment = ? WHERE id = ?',
      [rating, comment || null, interaction.id],
    );

    return R.ok(res, { message: 'Feedback registrado.' });
  } catch (err) { return R.serverError(res, err); }
}

// DELETE /ai-interactions/:id
async function deleteInteraction(req, res) {
  try {
    const [rows] = await db.query(
      'SELECT * FROM ai_interactions WHERE uuid = ?',
      [req.params.id],
    );
    if (!rows.length) return R.notFound(res, 'Interação');
    if (rows[0].user_id !== req.user.id && req.user.role !== 'admin') return R.forbidden(res);
    await db.query('DELETE FROM ai_interactions WHERE id = ?', [rows[0].id]);
    return R.noContent(res);
  } catch (err) { return R.serverError(res, err); }
}

module.exports = { listInteractions, createInteraction, getInteraction, submitFeedback, deleteInteraction };
