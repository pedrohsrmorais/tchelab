const bcrypt = require('bcrypt');
const { pool } = require('../config/db');

const SALT_ROUNDS = 12;

// Colunas seguras para retornar ao cliente (nunca expor password_hash)
const PUBLIC_FIELDS = `
  id, uuid, name, initials, email, bio, research_area, institution, birth_date,
  lattes_url, linkedin_url, github_url, avatar_url, cover_color,
  stat_models, stat_analyses, stat_datasets, stat_public_analyses, stat_private_analyses,
  role, is_active, created_at, updated_at
`.trim();

// ─── GET /users/:id ──────────────────────────────────────────────────────────

async function getUser(req, res) {
  const [rows] = await pool.query(
    `SELECT ${PUBLIC_FIELDS} FROM users WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
    [req.params.id]
  );

  if (!rows.length) return res.status(404).json({ message: 'Usuário não encontrado.' });

  return res.json(rows[0]);
}

// ─── GET /users/me ───────────────────────────────────────────────────────────

async function getMe(req, res) {
  // req.user é populado pelo auth.middleware
  const [rows] = await pool.query(
    `SELECT ${PUBLIC_FIELDS} FROM users WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
    [req.user.sub]
  );

  if (!rows.length) return res.status(404).json({ message: 'Usuário não encontrado.' });

  return res.json(rows[0]);
}

// ─── PATCH /users/me ─────────────────────────────────────────────────────────

async function updateMe(req, res) {
  const ALLOWED = [
    'name', 'bio', 'research_area', 'institution', 'birth_date',
    'lattes_url', 'linkedin_url', 'github_url', 'avatar_url', 'cover_color',
  ];

  const fields = {};
  for (const key of ALLOWED) {
    if (key in req.body) fields[key] = req.body[key];
  }

  // Recalcula initials se o nome mudou
  if (fields.name) {
    const parts = fields.name.trim().split(/\s+/);
    fields.initials = parts.length === 1
      ? parts[0].slice(0, 2).toUpperCase()
      : (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  if (!Object.keys(fields).length) {
    return res.status(400).json({ message: 'Nenhum campo válido para atualizar.' });
  }

  const setClause = Object.keys(fields).map((k) => `${k} = ?`).join(', ');
  const values = [...Object.values(fields), req.user.sub];

  await pool.query(
    `UPDATE users SET ${setClause} WHERE id = ? AND deleted_at IS NULL`,
    values
  );

  return getMe(req, res);
}

// ─── PATCH /users/me/password ─────────────────────────────────────────────────

async function updatePassword(req, res) {
  const { current_password, new_password } = req.body;

  if (!current_password || !new_password) {
    return res.status(400).json({ message: 'current_password e new_password são obrigatórios.' });
  }

  const [rows] = await pool.query(
    'SELECT password_hash FROM users WHERE id = ? AND deleted_at IS NULL LIMIT 1',
    [req.user.sub]
  );

  if (!rows.length) return res.status(404).json({ message: 'Usuário não encontrado.' });

  const valid = await bcrypt.compare(current_password, rows[0].password_hash);
  if (!valid) return res.status(401).json({ message: 'Senha atual incorreta.' });

  const password_hash = await bcrypt.hash(new_password, SALT_ROUNDS);

  await pool.query(
    'UPDATE users SET password_hash = ? WHERE id = ?',
    [password_hash, req.user.sub]
  );

  return res.json({ message: 'Senha atualizada com sucesso.' });
}

// ─── DELETE /users/me ────────────────────────────────────────────────────────

async function deleteMe(req, res) {
  await pool.query(
    'UPDATE users SET deleted_at = NOW(), is_active = 0 WHERE id = ?',
    [req.user.sub]
  );

  return res.json({ message: 'Conta desativada.' });
}

// ─── Admin: GET /users ────────────────────────────────────────────────────────

async function listUsers(req, res) {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, parseInt(req.query.limit) || 20);
  const offset = (page - 1) * limit;

  const [rows] = await pool.query(
    `SELECT ${PUBLIC_FIELDS} FROM users WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [limit, offset]
  );
  const [[{ total }]] = await pool.query(
    'SELECT COUNT(*) AS total FROM users WHERE deleted_at IS NULL'
  );

  return res.json({ data: rows, total, page, limit });
}

// ─── Admin: DELETE /users/:id ─────────────────────────────────────────────────

async function deleteUser(req, res) {
  const [result] = await pool.query(
    'UPDATE users SET deleted_at = NOW(), is_active = 0 WHERE id = ? AND deleted_at IS NULL',
    [req.params.id]
  );

  if (!result.affectedRows) return res.status(404).json({ message: 'Usuário não encontrado.' });

  return res.json({ message: 'Usuário desativado.' });
}

module.exports = { getUser, getMe, updateMe, updatePassword, deleteMe, listUsers, deleteUser };