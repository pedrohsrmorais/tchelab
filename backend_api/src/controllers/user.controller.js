'use strict';

const path = require('path');
const db = require('../config/db.config');
const R = require('../utils/response');

function safeUser(u) {
  const { password_hash, deleted_at, email, ...pub } = u;
  return pub;
}

// GET /users/:id
async function getUser(req, res) {
  try {
    const [rows] = await db.query(
      'SELECT * FROM users WHERE uuid = ? AND deleted_at IS NULL',
      [req.params.id],
    );
    if (!rows.length) return R.notFound(res, 'Usuário');
    return R.ok(res, safeUser(rows[0]));
  } catch (err) {
    return R.serverError(res, err);
  }
}

// PUT /users/:id
async function updateUser(req, res) {
  try {
    const [rows] = await db.query(
      'SELECT * FROM users WHERE uuid = ? AND deleted_at IS NULL',
      [req.params.id],
    );
    if (!rows.length) return R.notFound(res, 'Usuário');
    const user = rows[0];

    if (req.user.id !== user.id && req.user.role !== 'admin') {
      return R.forbidden(res);
    }

    const allowed = ['name', 'initials', 'bio', 'research_area', 'institution',
      'lattes_url', 'linkedin_url', 'github_url', 'cover_color'];
    const fields = [];
    const values = [];
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        fields.push(`${key} = ?`);
        values.push(req.body[key]);
      }
    }
    if (!fields.length) return R.badRequest(res, 'Nenhum campo para atualizar.');

    values.push(user.id);
    await db.query(`UPDATE users SET ${fields.join(', ')}, updated_at = NOW() WHERE id = ?`, values);

    const [updated] = await db.query('SELECT * FROM users WHERE id = ?', [user.id]);
    return R.ok(res, safeUser(updated[0]));
  } catch (err) {
    return R.serverError(res, err);
  }
}

// PUT /users/:id/avatar
async function uploadAvatar(req, res) {
  try {
    if (!req.file) return R.badRequest(res, 'Arquivo de avatar não enviado.');

    const [rows] = await db.query(
      'SELECT * FROM users WHERE uuid = ? AND deleted_at IS NULL',
      [req.params.id],
    );
    if (!rows.length) return R.notFound(res, 'Usuário');
    const user = rows[0];

    if (req.user.id !== user.id && req.user.role !== 'admin') {
      return R.forbidden(res);
    }

    const avatarUrl = `/storage/avatars/${path.basename(req.file.path)}`;
    await db.query('UPDATE users SET avatar_url = ?, updated_at = NOW() WHERE id = ?', [avatarUrl, user.id]);

    return R.ok(res, { avatar_url: avatarUrl });
  } catch (err) {
    return R.serverError(res, err);
  }
}

// GET /users/:id/stats
async function getStats(req, res) {
  try {
    const [rows] = await db.query(
      `SELECT stat_models, stat_analyses, stat_datasets,
              stat_public_analyses, stat_private_analyses
       FROM users WHERE uuid = ? AND deleted_at IS NULL`,
      [req.params.id],
    );
    if (!rows.length) return R.notFound(res, 'Usuário');
    return R.ok(res, rows[0]);
  } catch (err) {
    return R.serverError(res, err);
  }
}

// DELETE /users/:id
async function deleteUser(req, res) {
  try {
    const [rows] = await db.query(
      'SELECT * FROM users WHERE uuid = ? AND deleted_at IS NULL',
      [req.params.id],
    );
    if (!rows.length) return R.notFound(res, 'Usuário');
    const user = rows[0];

    if (req.user.id !== user.id && req.user.role !== 'admin') {
      return R.forbidden(res);
    }

    await db.query('UPDATE users SET deleted_at = NOW() WHERE id = ?', [user.id]);
    return R.noContent(res);
  } catch (err) {
    return R.serverError(res, err);
  }
}

module.exports = { getUser, updateUser, uploadAvatar, getStats, deleteUser };
