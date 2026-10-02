'use strict';

const db = require('../config/db.config');
const R = require('../utils/response');

// GET /jobs
async function listJobs(req, res) {
  try {
    const { status, job_type } = req.query;
    const conditions = ['j.user_id = ?'];
    const params = [req.user.id];

    if (status) { conditions.push('j.status = ?'); params.push(status); }
    if (job_type) { conditions.push('j.job_type = ?'); params.push(job_type); }

    const where = conditions.join(' AND ');
    const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total FROM jobs j WHERE ${where}`, params);
    const { offset, limit, meta } = R.paginate(req, total);

    const [rows] = await db.query(
      `SELECT j.uuid, j.job_type, j.status, j.progress, j.created_at, j.started_at, j.finished_at
       FROM jobs j WHERE ${where} ORDER BY j.created_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    );
    return R.ok(res, rows, { ...meta, total });
  } catch (err) { return R.serverError(res, err); }
}

// GET /jobs/:id
async function getJob(req, res) {
  try {
    const [rows] = await db.query(
      `SELECT j.uuid, j.job_type, j.status, j.progress, j.result, j.error_message,
              j.created_at, j.started_at, j.finished_at
       FROM jobs j WHERE j.uuid = ? AND j.user_id = ?`,
      [req.params.id, req.user.id],
    );
    if (!rows.length) return R.notFound(res, 'Job');
    const job = rows[0];

    // Parseia result se for JSON string
    if (job.result && typeof job.result === 'string') {
      try { job.result = JSON.parse(job.result); } catch (_) { /* mantém string */ }
    }

    return R.ok(res, job);
  } catch (err) { return R.serverError(res, err); }
}

// GET /jobs/admin (apenas admin)
async function listAllJobs(req, res) {
  try {
    if (req.user.role !== 'admin') return R.forbidden(res);

    const { status, job_type, user_id } = req.query;
    const conditions = [];
    const params = [];

    if (status) { conditions.push('j.status = ?'); params.push(status); }
    if (job_type) { conditions.push('j.job_type = ?'); params.push(job_type); }
    if (user_id) {
      const [u] = await db.query('SELECT id FROM users WHERE uuid = ?', [user_id]);
      if (u.length) { conditions.push('j.user_id = ?'); params.push(u[0].id); }
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total FROM jobs j ${where}`, params);
    const { offset, limit, meta } = R.paginate(req, total);

    const [rows] = await db.query(
      `SELECT j.uuid, j.job_type, j.status, j.progress, j.created_at, j.started_at, j.finished_at,
              u.email AS user_email
       FROM jobs j
       LEFT JOIN users u ON u.id = j.user_id
       ${where} ORDER BY j.created_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    );
    return R.ok(res, rows, { ...meta, total });
  } catch (err) { return R.serverError(res, err); }
}

module.exports = { listJobs, getJob, listAllJobs };
