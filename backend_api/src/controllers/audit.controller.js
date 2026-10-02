'use strict';

const db = require('../config/db.config');
const R = require('../utils/response');

// GET /audit-logs  (somente admin)
async function listAuditLogs(req, res) {
  try {
    if (req.user.role !== 'admin') return R.forbidden(res);

    const { user_id, action, resource_type, from, to } = req.query;
    const conditions = [];
    const params = [];

    if (user_id) {
      const [u] = await db.query('SELECT id FROM users WHERE uuid = ?', [user_id]);
      if (u.length) { conditions.push('al.user_id = ?'); params.push(u[0].id); }
    }
    if (action) { conditions.push('al.action LIKE ?'); params.push(`%${action}%`); }
    if (resource_type) { conditions.push('al.resource_type = ?'); params.push(resource_type); }
    if (from) { conditions.push('al.created_at >= ?'); params.push(from); }
    if (to) { conditions.push('al.created_at <= ?'); params.push(to); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total FROM audit_logs al ${where}`, params);
    const { offset, limit, meta } = R.paginate(req, total);

    const [rows] = await db.query(
      `SELECT al.id, al.action, al.resource_type, al.resource_uuid,
              al.old_value, al.new_value, al.ip_address, al.user_agent,
              al.created_at, u.email AS user_email, u.uuid AS user_uuid
       FROM audit_logs al
       LEFT JOIN users u ON u.id = al.user_id
       ${where} ORDER BY al.created_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    );
    return R.ok(res, rows, { ...meta, total });
  } catch (err) { return R.serverError(res, err); }
}

// GET /audit-logs/:id  (somente admin)
async function getAuditLog(req, res) {
  try {
    if (req.user.role !== 'admin') return R.forbidden(res);

    const [rows] = await db.query(
      `SELECT al.*, u.email AS user_email, u.uuid AS user_uuid
       FROM audit_logs al
       LEFT JOIN users u ON u.id = al.user_id
       WHERE al.id = ?`,
      [req.params.id],
    );
    if (!rows.length) return R.notFound(res, 'Log de auditoria');
    return R.ok(res, rows[0]);
  } catch (err) { return R.serverError(res, err); }
}

// GET /audit-logs/resource/:type/:uuid  (admin ou dono do recurso)
async function getResourceAuditLogs(req, res) {
  try {
    const { type, uuid } = req.params;

    // Admin pode ver tudo; usuário normal só vê logs dos seus próprios recursos
    let userId = null;
    if (req.user.role !== 'admin') userId = req.user.id;

    const conditions = ['al.resource_type = ?', 'al.resource_uuid = ?'];
    const params = [type, uuid];
    if (userId) {
      conditions.push('al.user_id = ?');
      params.push(userId);
    }

    const where = conditions.join(' AND ');
    const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total FROM audit_logs al WHERE ${where}`, params);
    const { offset, limit, meta } = R.paginate(req, total);

    const [rows] = await db.query(
      `SELECT al.id, al.action, al.old_value, al.new_value,
              al.ip_address, al.created_at, u.email AS user_email
       FROM audit_logs al
       LEFT JOIN users u ON u.id = al.user_id
       WHERE ${where} ORDER BY al.created_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    );
    return R.ok(res, rows, { ...meta, total });
  } catch (err) { return R.serverError(res, err); }
}

// GET /admin/stats  (somente admin)
async function getAdminStats(req, res) {
  try {
    if (req.user.role !== 'admin') return R.forbidden(res);

    const [[users]] = await db.query('SELECT COUNT(*) AS total, SUM(deleted_at IS NOT NULL) AS deleted FROM users');
    const [[articles]] = await db.query('SELECT COUNT(*) AS total FROM articles WHERE deleted_at IS NULL');
    const [[workflows]] = await db.query('SELECT COUNT(*) AS total FROM workflows WHERE deleted_at IS NULL');
    const [[datasets]] = await db.query('SELECT COUNT(*) AS total FROM datasets WHERE deleted_at IS NULL');
    const [[jobs]] = await db.query(
      `SELECT
         SUM(status = 'pending') AS pending,
         SUM(status = 'running') AS running,
         SUM(status = 'completed') AS completed,
         SUM(status = 'failed') AS failed
       FROM jobs`,
    );
    const [[executions]] = await db.query(
      `SELECT
         SUM(status = 'running') AS running,
         SUM(status = 'completed') AS completed,
         SUM(status = 'failed') AS failed
       FROM executions`,
    );

    return R.ok(res, {
      users: { total: users.total, deleted: users.deleted },
      articles: articles.total,
      workflows: workflows.total,
      datasets: datasets.total,
      jobs,
      executions,
    });
  } catch (err) { return R.serverError(res, err); }
}

module.exports = { listAuditLogs, getAuditLog, getResourceAuditLogs, getAdminStats };
