'use strict';

const { v4: uuidv4 } = require('uuid');
const path = require('path');
const db = require('../config/db.config');
const jobService = require('../services/job.service');
const storage = require('../config/storage.config');
const R = require('../utils/response');

async function resolveArticle(uuid) {
  const [rows] = await db.query('SELECT * FROM articles WHERE uuid = ? AND deleted_at IS NULL', [uuid]);
  return rows[0] || null;
}

// GET /articles
async function listArticles(req, res) {
  try {
    const { journal, extraction_status, project_id } = req.query;
    const conditions = ['a.user_id = ?', 'a.deleted_at IS NULL'];
    const params = [req.user.id];

    if (journal) { conditions.push('a.journal LIKE ?'); params.push(`%${journal}%`); }
    if (extraction_status) { conditions.push('a.extraction_status = ?'); params.push(extraction_status); }
    if (project_id) {
      const [p] = await db.query('SELECT id FROM projects WHERE uuid = ?', [project_id]);
      if (p.length) {
        conditions.push('a.id IN (SELECT article_id FROM project_articles WHERE project_id = ?)');
        params.push(p[0].id);
      }
    }

    const where = conditions.join(' AND ');
    const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total FROM articles a WHERE ${where}`, params);
    const { offset, limit, meta } = R.paginate(req, total);

    const [rows] = await db.query(
      `SELECT a.id, a.uuid, a.title, a.authors, a.journal, a.publication_date,
              a.doi, a.extraction_status, a.created_at
       FROM articles a WHERE ${where} ORDER BY a.created_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    );
    return R.ok(res, rows, { ...meta, total });
  } catch (err) { return R.serverError(res, err); }
}

// POST /articles
async function createArticle(req, res) {
  try {
    const { doi, title, abstract, authors, journal, publisher, publication_date, url } = req.body;
    const uuid = uuidv4();
    const [result] = await db.query(
      `INSERT INTO articles
         (uuid, user_id, doi, title, abstract, authors, journal, publisher,
          publication_date, url, extraction_status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', NOW(), NOW())`,
      [uuid, req.user.id, doi || null, title || null, abstract || null,
        JSON.stringify(authors || []), journal || null, publisher || null,
        publication_date || null, url || null],
    );
    const [rows] = await db.query('SELECT * FROM articles WHERE id = ?', [result.insertId]);
    return R.created(res, rows[0]);
  } catch (err) { return R.serverError(res, err); }
}

// POST /articles/upload
async function uploadPDF(req, res) {
  try {
    if (!req.file) return R.badRequest(res, 'Arquivo PDF não enviado.');

    const uuid = uuidv4();
    const pdfDest = path.join(storage.articles, `${uuid}.pdf`);

    const [result] = await db.query(
      `INSERT INTO articles
         (uuid, user_id, pdf_path, extraction_status, created_at, updated_at)
       VALUES (?, ?, ?, 'pending', NOW(), NOW())`,
      [uuid, req.user.id, pdfDest],
    );

    const { id: jobId, uuid: jobUuid } = await jobService.createJob({
      job_type: 'extract_pdf',
      user_id: req.user.id,
      article_id: result.insertId,
      payload: { tmp_path: req.file.path, dest_path: pdfDest, article_uuid: uuid },
    });

    const [rows] = await db.query('SELECT * FROM articles WHERE id = ?', [result.insertId]);
    return R.accepted(res, { article: rows[0], job_id: jobUuid });
  } catch (err) { return R.serverError(res, err); }
}

// GET /articles/:id
async function getArticle(req, res) {
  try {
    const article = await resolveArticle(req.params.id);
    if (!article) return R.notFound(res, 'Artigo');
    return R.ok(res, article);
  } catch (err) { return R.serverError(res, err); }
}

// PUT /articles/:id
async function updateArticle(req, res) {
  try {
    const article = await resolveArticle(req.params.id);
    if (!article) return R.notFound(res, 'Artigo');
    if (article.user_id !== req.user.id && req.user.role !== 'admin') return R.forbidden(res);

    const allowed = ['title', 'abstract', 'authors', 'journal', 'publisher', 'publication_date', 'url', 'doi'];
    const fields = [];
    const values = [];
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        fields.push(`${key} = ?`);
        values.push(key === 'authors' ? JSON.stringify(req.body[key]) : req.body[key]);
      }
    }
    if (!fields.length) return R.badRequest(res, 'Nenhum campo para atualizar.');
    values.push(article.id);
    await db.query(`UPDATE articles SET ${fields.join(', ')}, updated_at = NOW() WHERE id = ?`, values);
    const [rows] = await db.query('SELECT * FROM articles WHERE id = ?', [article.id]);
    return R.ok(res, rows[0]);
  } catch (err) { return R.serverError(res, err); }
}

// DELETE /articles/:id
async function deleteArticle(req, res) {
  try {
    const article = await resolveArticle(req.params.id);
    if (!article) return R.notFound(res, 'Artigo');
    if (article.user_id !== req.user.id && req.user.role !== 'admin') return R.forbidden(res);
    await db.query('UPDATE articles SET deleted_at = NOW() WHERE id = ?', [article.id]);
    await db.query('DELETE FROM project_articles WHERE article_id = ?', [article.id]);
    return R.noContent(res);
  } catch (err) { return R.serverError(res, err); }
}

// POST /articles/:id/analyze
async function analyzeArticle(req, res) {
  try {
    const article = await resolveArticle(req.params.id);
    if (!article) return R.notFound(res, 'Artigo');
    if (article.extraction_status !== 'extracted') {
      return R.unprocessable(res, [{ field: 'extraction_status', message: 'O artigo ainda não foi extraído (extraction_status deve ser "extracted").' }]);
    }

    const aUuid = uuidv4();
    const [result] = await db.query(
      `INSERT INTO article_analyses (uuid, article_id, user_id, status, created_at, updated_at)
       VALUES (?, ?, ?, 'pending', NOW(), NOW())`,
      [aUuid, article.id, req.user.id],
    );

    const { id: jobId, uuid: jobUuid } = await jobService.createJob({
      job_type: 'analyze_article',
      user_id: req.user.id,
      article_id: article.id,
      payload: { article_uuid: article.uuid, analysis_uuid: aUuid, article_analysis_id: result.insertId },
    });

    return R.accepted(res, { analysis_id: aUuid, job_id: jobUuid });
  } catch (err) { return R.serverError(res, err); }
}

module.exports = { listArticles, createArticle, uploadPDF, getArticle, updateArticle, deleteArticle, analyzeArticle };
