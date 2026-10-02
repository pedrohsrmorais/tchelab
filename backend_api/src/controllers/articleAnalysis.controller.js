'use strict';

const { v4: uuidv4 } = require('uuid');
const db = require('../config/db.config');
const jobService = require('../services/job.service');
const R = require('../utils/response');

async function resolveAnalysis(uuid) {
  const [rows] = await db.query('SELECT * FROM article_analyses WHERE uuid = ?', [uuid]);
  return rows[0] || null;
}

// GET /article-analyses
async function listAnalyses(req, res) {
  try {
    const { article_id, status } = req.query;
    const conditions = ['aa.user_id = ?'];
    const params = [req.user.id];

    if (article_id) {
      const [a] = await db.query('SELECT id FROM articles WHERE uuid = ?', [article_id]);
      if (a.length) { conditions.push('aa.article_id = ?'); params.push(a[0].id); }
    }
    if (status) { conditions.push('aa.status = ?'); params.push(status); }

    const where = conditions.join(' AND ');
    const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total FROM article_analyses aa WHERE ${where}`, params);
    const { offset, limit, meta } = R.paginate(req, total);

    const [rows] = await db.query(
      `SELECT aa.uuid, aa.status, aa.data_type_detected, aa.dimensionality_detected,
              aa.generated_workflow_id, aa.created_at, a.title AS article_title
       FROM article_analyses aa
       LEFT JOIN articles a ON a.id = aa.article_id
       WHERE ${where} ORDER BY aa.created_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    );
    return R.ok(res, rows, { ...meta, total });
  } catch (err) { return R.serverError(res, err); }
}

// GET /article-analyses/:id
async function getAnalysis(req, res) {
  try {
    const analysis = await resolveAnalysis(req.params.id);
    if (!analysis) return R.notFound(res, 'Análise');
    if (analysis.user_id !== req.user.id && req.user.role !== 'admin') return R.forbidden(res);
    return R.ok(res, analysis);
  } catch (err) { return R.serverError(res, err); }
}

// GET /article-analyses/:id/techniques
async function getTechniques(req, res) {
  try {
    const analysis = await resolveAnalysis(req.params.id);
    if (!analysis) return R.notFound(res, 'Análise');
    const [rows] = await db.query(
      `SELECT at.step_order, t.slug, t.name, at.parameters, at.evidence,
              at.confidence, at.raw_text, at.mapping_notes
       FROM article_techniques at
       LEFT JOIN techniques t ON t.id = at.technique_id
       WHERE at.article_analysis_id = ?
       ORDER BY at.step_order ASC`,
      [analysis.id],
    );
    return R.ok(res, rows);
  } catch (err) { return R.serverError(res, err); }
}

// POST /article-analyses/:id/generate-workflow
async function generateWorkflow(req, res) {
  try {
    const analysis = await resolveAnalysis(req.params.id);
    if (!analysis) return R.notFound(res, 'Análise');
    if (analysis.user_id !== req.user.id) return R.forbidden(res);
    if (analysis.status !== 'completed') {
      return R.unprocessable(res, [{ field: 'status', message: 'A análise precisa estar "completed" para gerar workflow.' }]);
    }
    if (analysis.generated_workflow_id) {
      return R.ok(res, { workflow_id: analysis.generated_workflow_id, message: 'Workflow já gerado para esta análise.' });
    }

    const workflowUuid = uuidv4();
    const [wResult] = await db.query(
      `INSERT INTO workflows (uuid, user_id, name, status, visibility, definition, source_article_analysis_id, created_at, updated_at)
       VALUES (?, ?, ?, 'draft', 'private', '{}', ?, NOW(), NOW())`,
      [workflowUuid, req.user.id, `Workflow de ${analysis.uuid.slice(0, 8)}`, analysis.id],
    );

    await db.query(
      'UPDATE article_analyses SET generated_workflow_id = ? WHERE id = ?',
      [wResult.insertId, analysis.id],
    );

    const { id: jobId, uuid: jobUuid } = await jobService.createJob({
      job_type: 'generate_workflow',
      user_id: req.user.id,
      workflow_id: wResult.insertId,
      payload: { analysis_uuid: analysis.uuid, workflow_uuid: workflowUuid },
    });

    return R.accepted(res, { workflow_id: workflowUuid, job_id: jobUuid });
  } catch (err) { return R.serverError(res, err); }
}

// DELETE /article-analyses/:id
async function deleteAnalysis(req, res) {
  try {
    const analysis = await resolveAnalysis(req.params.id);
    if (!analysis) return R.notFound(res, 'Análise');
    if (analysis.user_id !== req.user.id && req.user.role !== 'admin') return R.forbidden(res);
    await db.query('DELETE FROM article_techniques WHERE article_analysis_id = ?', [analysis.id]);
    await db.query('DELETE FROM article_analyses WHERE id = ?', [analysis.id]);
    return R.noContent(res);
  } catch (err) { return R.serverError(res, err); }
}

module.exports = { listAnalyses, getAnalysis, getTechniques, generateWorkflow, deleteAnalysis };
