'use strict';

const fs = require('fs');
const path = require('path');
const db = require('../config/db.config');
const storage = require('../config/storage.config');
const R = require('../utils/response');
const { avatarUpload } = require('../utils/multer');
const profile = require('../utils/userProfile');

const COVER_RE = /^[a-zA-Z0-9#_-]{1,100}$/;

/** `:id` aceita o uuid ou a palavra `me`. */
function paramUuid(req) {
  return req.params.id === 'me' ? req.user.uuid : req.params.id;
}

async function findUser(req) {
  const [rows] = await db.query(
    'SELECT * FROM users WHERE uuid = ? AND deleted_at IS NULL',
    [paramUuid(req)],
  );
  return rows[0] || null;
}

/** Pré-filtro de rotas que alteram dados de um usuário: só ele mesmo ou admin. */
function assertSelfOrAdmin(req, res, next) {
  if (paramUuid(req) !== req.user.uuid && req.user.role !== 'admin') return R.forbidden(res);
  return next();
}

// GET /users/:id  — perfil público (respeita a privacidade escolhida)
async function getUser(req, res) {
  try {
    const user = await findUser(req);
    if (!user) return R.notFound(res, 'Usuário');
    const data = profile.publicUser(user, req.user);
    const [[counts]] = await db.query(
      `SELECT
         (SELECT COUNT(*) FROM projects WHERE user_id = ? AND visibility = 'public' AND deleted_at IS NULL) AS public_projects,
         (SELECT COUNT(*) FROM community_members cm JOIN communities c ON c.id = cm.community_id
            WHERE cm.user_id = ? AND c.visibility = 'public') AS public_communities`,
      [user.id, user.id],
    );
    return R.ok(res, { ...data, ...counts });
  } catch (err) { return R.serverError(res, err); }
}

// PUT /users/:id
async function updateUser(req, res) {
  try {
    const user = await findUser(req);
    if (!user) return R.notFound(res, 'Usuário');
    if (req.user.id !== user.id && req.user.role !== 'admin') return R.forbidden(res);

    const b = req.body || {};
    const sets = {};
    const errors = [];

    const text = (key, max, { required = false } = {}) => {
      if (b[key] === undefined) return;
      const v = b[key] == null ? '' : String(b[key]).trim();
      if (required && !v) { errors.push({ field: key, message: 'Obrigatório.' }); return; }
      if (v.length > max) { errors.push({ field: key, message: `Máximo ${max} caracteres.` }); return; }
      sets[key] = v || null;
    };
    text('name', 255, { required: true });
    text('initials', 20);
    text('bio', 2000);
    text('research_area', 255);
    text('institution', 255);

    for (const f of ['lattes_url', 'linkedin_url', 'github_url']) {
      if (b[f] === undefined) continue;
      const r = profile.sanitizeUrl(f, b[f]);
      if (r.error) errors.push({ field: f, message: r.error }); else sets[f] = r.value;
    }
    if (b.birth_date !== undefined) {
      const r = profile.sanitizeBirthDate(b.birth_date);
      if (r.error) errors.push({ field: 'birth_date', message: r.error }); else sets.birth_date = r.value;
    }
    if (b.cover_color !== undefined) {
      if (b.cover_color && !COVER_RE.test(String(b.cover_color))) {
        errors.push({ field: 'cover_color', message: 'Inválido.' });
      } else sets.cover_color = b.cover_color || 'gradient-primary';
    }
    if (b.preferences !== undefined) {
      const merged = profile.mergePreferences(profile.readPreferences(user), b.preferences);
      if (merged.errors.length) errors.push(...merged.errors);
      else sets.preferences = JSON.stringify(merged.value);
    }

    if (errors.length) return R.unprocessable(res, errors);
    const cols = Object.keys(sets);
    if (!cols.length) return R.badRequest(res, 'Nenhum campo para atualizar.');

    await db.query(
      `UPDATE users SET ${cols.map((c) => `${c} = ?`).join(', ')}, updated_at = NOW() WHERE id = ?`,
      [...cols.map((c) => sets[c]), user.id],
    );
    const [updated] = await db.query('SELECT * FROM users WHERE id = ?', [user.id]);
    return R.ok(res, profile.selfUser(updated[0]));
  } catch (err) { return R.serverError(res, err); }
}

/** Remove um arquivo de avatar antigo (só dentro da pasta de avatares). */
function removeAvatarFile(avatarUrl) {
  if (!avatarUrl || !avatarUrl.startsWith('/storage/avatars/')) return;
  const file = path.join(storage.avatars, path.basename(avatarUrl.split('?')[0]));
  fs.promises.unlink(file).catch(() => {});
}

/** Multer com resposta 422 amigável em vez de 500. */
function avatarMiddleware(req, res, next) {
  avatarUpload.single('avatar')(req, res, (err) => {
    if (!err) return next();
    const message = err.code === 'LIMIT_FILE_SIZE' ? 'A imagem deve ter no máximo 5 MB.' : err.message;
    return R.unprocessable(res, [{ field: 'avatar', message }]);
  });
}

// POST /users/:id/avatar
async function uploadAvatar(req, res) {
  try {
    if (!req.file) return R.unprocessable(res, [{ field: 'avatar', message: 'Arquivo de avatar não enviado.' }]);
    const user = await findUser(req);
    if (!user) { fs.promises.unlink(req.file.path).catch(() => {}); return R.notFound(res, 'Usuário'); }

    const avatarUrl = `/storage/avatars/${path.basename(req.file.path)}`;
    await db.query('UPDATE users SET avatar_url = ?, updated_at = NOW() WHERE id = ?', [avatarUrl, user.id]);
    removeAvatarFile(user.avatar_url);
    return R.ok(res, { avatar_url: avatarUrl });
  } catch (err) { return R.serverError(res, err); }
}

// DELETE /users/:id/avatar
async function deleteAvatar(req, res) {
  try {
    const user = await findUser(req);
    if (!user) return R.notFound(res, 'Usuário');
    await db.query('UPDATE users SET avatar_url = NULL, updated_at = NOW() WHERE id = ?', [user.id]);
    removeAvatarFile(user.avatar_url);
    return R.noContent(res);
  } catch (err) { return R.serverError(res, err); }
}

// GET /users/:id/projects  — projetos públicos (o próprio usuário/admin vê todos)
async function listUserProjects(req, res) {
  try {
    const user = await findUser(req);
    if (!user) return R.notFound(res, 'Usuário');
    const full = req.user.id === user.id || req.user.role === 'admin';
    const [rows] = await db.query(
      `SELECT p.uuid, p.name, p.description, p.visibility, p.status, p.created_at, p.updated_at,
              (SELECT COUNT(*) FROM project_datasets WHERE project_id = p.id) AS dataset_count,
              (SELECT COUNT(*) FROM project_workflows WHERE project_id = p.id) AS workflow_count,
              (SELECT COUNT(*) FROM project_techniques WHERE project_id = p.id) AS technique_count
         FROM projects p
        WHERE p.user_id = ? AND p.deleted_at IS NULL ${full ? '' : "AND p.visibility = 'public'"}
        ORDER BY p.updated_at DESC`,
      [user.id],
    );
    return R.ok(res, rows);
  } catch (err) { return R.serverError(res, err); }
}

// GET /users/:id/communities  — comunidades públicas (ou todas, se for o próprio)
async function listUserCommunities(req, res) {
  try {
    const user = await findUser(req);
    if (!user) return R.notFound(res, 'Usuário');
    const full = req.user.id === user.id || req.user.role === 'admin';
    const [rows] = await db.query(
      `SELECT c.uuid, c.name, c.description, c.visibility, cm.role,
              (SELECT COUNT(*) FROM community_members WHERE community_id = c.id) AS member_count
         FROM community_members cm JOIN communities c ON c.id = cm.community_id
        WHERE cm.user_id = ? ${full ? '' : "AND c.visibility = 'public'"}
        ORDER BY c.name`,
      [user.id],
    );
    return R.ok(res, rows);
  } catch (err) { return R.serverError(res, err); }
}

// GET /users/:id/stats
async function getStats(req, res) {
  try {
    const user = await findUser(req);
    if (!user) return R.notFound(res, 'Usuário');
    const prefs = profile.readPreferences(user);
    const mine = req.user.id === user.id || req.user.role === 'admin';
    if (!mine && !prefs.privacy.show_stats) return R.forbidden(res, 'Este usuário não exibe estatísticas.');
    return R.ok(res, {
      stat_models: user.stat_models,
      stat_analyses: user.stat_analyses,
      stat_datasets: user.stat_datasets,
      stat_public_analyses: user.stat_public_analyses,
      stat_private_analyses: user.stat_private_analyses,
    });
  } catch (err) { return R.serverError(res, err); }
}

// DELETE /users/:id
async function deleteUser(req, res) {
  try {
    const user = await findUser(req);
    if (!user) return R.notFound(res, 'Usuário');
    if (req.user.id !== user.id && req.user.role !== 'admin') return R.forbidden(res);
    await db.query('UPDATE users SET deleted_at = NOW() WHERE id = ?', [user.id]);
    return R.noContent(res);
  } catch (err) { return R.serverError(res, err); }
}

module.exports = {
  getUser, updateUser, uploadAvatar, deleteAvatar, avatarMiddleware, assertSelfOrAdmin,
  listUserProjects, listUserCommunities, getStats, deleteUser,
};
