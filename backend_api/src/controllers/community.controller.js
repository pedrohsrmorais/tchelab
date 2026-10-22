'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/db.config');
const storage = require('../config/storage.config');
const R = require('../utils/response');
const { communityUpload } = require('../utils/multer');
const { LEVEL, projectLevel, workflowLevel, datasetLevel, communityRole } = require('../services/access.service');
const { isOfficeFile, enqueuePreview } = require('../services/officePreview');

/* ─────────────────────────────────────────────────────────────────────────────
 * Papéis:  owner (4) > admin (3) > moderator (2) > member (1)
 * - owner      : dono (communities.owner_id). Único que exclui a comunidade,
 *                transfere a posse e promove/rebaixa administradores.
 * - admin      : edita a comunidade, gerencia moderadores/membros, remove quem
 *                está abaixo, concede "pode vincular projetos".
 * - moderator  : cria convites, organiza o conteúdo, remove membros comuns,
 *                apaga mensagens, vincula projetos.
 * - member     : lê o conteúdo, conversa e abre os projetos vinculados (leitura
 *                ou edição, conforme o professor definiu). Vincula projetos
 *                próprios só se um admin concedeu `can_link`.
 * ──────────────────────────────────────────────────────────────────────────── */
const RANK = { member: 1, moderator: 2, admin: 3, owner: 4 };
const rankOf = (role) => RANK[role] || 0;

const ROLE_LABELS = ['member', 'moderator', 'admin'];
const ACCESS_VALUES = ['read', 'edit'];

function parseJson(v, fallback = null) {
  if (v == null) return fallback;
  if (typeof v === 'string') { try { return JSON.parse(v); } catch { return fallback; } }
  return v;
}

/**
 * Middleware: carrega a comunidade (`:id`, uuid) e o papel do usuário.
 *   guard('visible')  → membro OU comunidade pública
 *   guard('member')   → qualquer membro
 *   guard('moderator' | 'admin' | 'owner') → papel mínimo
 * Comunidade privada para quem não é membro responde 404 (não vaza existência).
 */
function guard(min = 'member') {
  return async (req, res, next) => {
    try {
      const [rows] = await db.query('SELECT * FROM communities WHERE uuid = ?', [req.params.id]);
      const community = rows[0];
      if (!community) return R.notFound(res, 'Comunidade');
      const role = await communityRole(community, req.user);
      const isMember = !!role;
      if (min === 'visible') {
        if (!isMember && community.visibility !== 'public') return R.notFound(res, 'Comunidade');
      } else {
        if (!isMember) {
          return community.visibility === 'public' ? R.forbidden(res, 'Entre na comunidade para continuar.') : R.notFound(res, 'Comunidade');
        }
        if (min !== 'member' && rankOf(role) < rankOf(min)) return R.forbidden(res);
      }
      req.community = community;
      req.cRole = role;
      return next();
    } catch (err) { return R.serverError(res, err); }
  };
}

function permissions(community, role, member) {
  const r = rankOf(role);
  return {
    is_member: !!role,
    is_owner: role === 'owner',
    can_manage: r >= RANK.admin,
    can_moderate: r >= RANK.moderator,
    can_link: r >= RANK.moderator || !!(member && member.can_link),
    can_post: !!role,
  };
}

async function memberRow(communityId, userId) {
  const [rows] = await db.query(
    'SELECT * FROM community_members WHERE community_id = ? AND user_id = ?', [communityId, userId],
  );
  return rows[0] || null;
}

async function isBanned(communityId, userId) {
  const [rows] = await db.query(
    'SELECT 1 FROM community_bans WHERE community_id = ? AND user_id = ?', [communityId, userId],
  );
  return rows.length > 0;
}

const COMMUNITY_SELECT = `c.uuid, c.name, c.description, c.visibility, c.cover_color, c.created_at, c.updated_at,
  o.uuid AS owner_uuid, o.name AS owner_name, o.avatar_url AS owner_avatar_url,
  (SELECT COUNT(*) FROM community_members WHERE community_id = c.id) AS member_count,
  (SELECT COUNT(*) FROM community_projects cp JOIN projects p ON p.id = cp.project_id AND p.deleted_at IS NULL
     WHERE cp.community_id = c.id) AS project_count`;

// ─── Comunidades ─────────────────────────────────────────────────────────────

// GET /communities  — as minhas
async function listMyCommunities(req, res) {
  try {
    const [rows] = await db.query(
      `SELECT ${COMMUNITY_SELECT}, cm.role AS my_role
         FROM communities c
         JOIN community_members cm ON cm.community_id = c.id AND cm.user_id = ?
         JOIN users o ON o.id = c.owner_id
        ORDER BY c.name`,
      [req.user.id],
    );
    return R.ok(res, rows.map((r) => ({ ...r, my_role: r.owner_uuid === req.user.uuid ? 'owner' : r.my_role })));
  } catch (err) { return R.serverError(res, err); }
}

// GET /communities/public?q=
async function listPublicCommunities(req, res) {
  try {
    const q = String(req.query.q || '').trim();
    const params = [req.user.id];
    let where = "c.visibility = 'public'";
    if (q) { where += ' AND (c.name LIKE ? OR c.description LIKE ?)'; params.push(`%${q}%`, `%${q}%`); }
    const [rows] = await db.query(
      `SELECT ${COMMUNITY_SELECT}, (SELECT role FROM community_members WHERE community_id = c.id AND user_id = ?) AS my_role
         FROM communities c JOIN users o ON o.id = c.owner_id
        WHERE ${where}
        ORDER BY member_count DESC, c.name
        LIMIT 100`,
      params,
    );
    return R.ok(res, rows.map((r) => ({
      ...r, is_member: !!r.my_role, my_role: r.owner_uuid === req.user.uuid ? 'owner' : r.my_role,
    })));
  } catch (err) { return R.serverError(res, err); }
}

// POST /communities
async function createCommunity(req, res) {
  try {
    const { name, description, visibility, cover_color } = req.body || {};
    const n = String(name || '').trim();
    if (!n) return R.unprocessable(res, [{ field: 'name', message: 'Obrigatório.' }]);
    if (n.length > 255) return R.unprocessable(res, [{ field: 'name', message: 'Máximo 255 caracteres.' }]);
    if (visibility && !['public', 'private'].includes(visibility)) {
      return R.unprocessable(res, [{ field: 'visibility', message: 'Inválido.' }]);
    }
    const uuid = uuidv4();
    const [result] = await db.query(
      `INSERT INTO communities (uuid, owner_id, name, description, visibility, cover_color, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [uuid, req.user.id, n, description ? String(description).slice(0, 5000) : null, visibility || 'private',
        /^[a-zA-Z0-9#_-]{1,100}$/.test(cover_color || '') ? cover_color : 'gradient-primary'],
    );
    await db.query(
      `INSERT INTO community_members (community_id, user_id, role, can_link, joined_at) VALUES (?, ?, 'admin', 1, NOW())`,
      [result.insertId, req.user.id],
    );
    const [rows] = await db.query('SELECT * FROM communities WHERE id = ?', [result.insertId]);
    return R.created(res, { ...rows[0], my_role: 'owner' });
  } catch (err) { return R.serverError(res, err); }
}

// GET /communities/:id
async function getCommunity(req, res) {
  try {
    const c = req.community;
    const [[row]] = await db.query(
      `SELECT ${COMMUNITY_SELECT} FROM communities c JOIN users o ON o.id = c.owner_id WHERE c.id = ?`, [c.id],
    );
    const member = req.cRole ? await memberRow(c.id, req.user.id) : null;
    return R.ok(res, { ...row, my_role: req.cRole, permissions: permissions(c, req.cRole, member) });
  } catch (err) { return R.serverError(res, err); }
}

// PUT /communities/:id
async function updateCommunity(req, res) {
  try {
    const c = req.community;
    const { name, description, visibility, cover_color } = req.body || {};
    if (name !== undefined && !String(name).trim()) return R.unprocessable(res, [{ field: 'name', message: 'Obrigatório.' }]);
    if (visibility !== undefined && !['public', 'private'].includes(visibility)) {
      return R.unprocessable(res, [{ field: 'visibility', message: 'Inválido.' }]);
    }
    if (cover_color !== undefined && cover_color && !/^[a-zA-Z0-9#_-]{1,100}$/.test(cover_color)) {
      return R.unprocessable(res, [{ field: 'cover_color', message: 'Inválido.' }]);
    }
    await db.query(
      `UPDATE communities SET name = ?, description = ?, visibility = ?, cover_color = ?, updated_at = NOW() WHERE id = ?`,
      [
        name !== undefined ? String(name).trim().slice(0, 255) : c.name,
        description !== undefined ? (description ? String(description).slice(0, 5000) : null) : c.description,
        visibility !== undefined ? visibility : c.visibility,
        cover_color !== undefined ? (cover_color || 'gradient-primary') : c.cover_color,
        c.id,
      ],
    );
    const [rows] = await db.query('SELECT * FROM communities WHERE id = ?', [c.id]);
    return R.ok(res, rows[0]);
  } catch (err) { return R.serverError(res, err); }
}

// DELETE /communities/:id  (somente o dono)
async function deleteCommunity(req, res) {
  try {
    const [files] = await db.query(
      "SELECT file_path, preview_path FROM community_items WHERE community_id = ? AND file_path IS NOT NULL", [req.community.id],
    );
    await db.query('DELETE FROM communities WHERE id = ?', [req.community.id]);
    files.forEach((f) => { removeStoredFile(f.file_path); removeStoredFile(f.preview_path); });
    return R.noContent(res);
  } catch (err) { return R.serverError(res, err); }
}

// POST /communities/:id/join  — entrar numa comunidade PÚBLICA
async function joinPublic(req, res) {
  try {
    const [rows] = await db.query('SELECT * FROM communities WHERE uuid = ?', [req.params.id]);
    const c = rows[0];
    if (!c || c.visibility !== 'public') return R.notFound(res, 'Comunidade');
    if (await isBanned(c.id, req.user.id)) return R.forbidden(res, 'Você foi removido desta comunidade.');
    await db.query(
      `INSERT IGNORE INTO community_members (community_id, user_id, role, joined_at) VALUES (?, ?, 'member', NOW())`,
      [c.id, req.user.id],
    );
    return R.ok(res, { uuid: c.uuid, name: c.name, joined: true });
  } catch (err) { return R.serverError(res, err); }
}

// POST /communities/:id/leave
async function leaveCommunity(req, res) {
  try {
    if (req.cRole === 'owner') {
      return R.unprocessable(res, [{ field: 'owner', message: 'O dono precisa transferir a comunidade antes de sair.' }]);
    }
    await db.query('DELETE FROM community_members WHERE community_id = ? AND user_id = ?', [req.community.id, req.user.id]);
    await db.query('DELETE FROM community_projects WHERE community_id = ? AND shared_by = ?', [req.community.id, req.user.id]);
    return R.noContent(res);
  } catch (err) { return R.serverError(res, err); }
}

// POST /communities/:id/transfer  { user_uuid }  (somente o dono)
async function transferOwnership(req, res) {
  try {
    const { user_uuid } = req.body || {};
    if (!user_uuid) return R.unprocessable(res, [{ field: 'user_uuid', message: 'Obrigatório.' }]);
    const [users] = await db.query('SELECT id FROM users WHERE uuid = ? AND deleted_at IS NULL', [user_uuid]);
    if (!users.length) return R.notFound(res, 'Usuário');
    const target = await memberRow(req.community.id, users[0].id);
    if (!target) return R.unprocessable(res, [{ field: 'user_uuid', message: 'O novo dono precisa ser membro da comunidade.' }]);
    await db.query('UPDATE communities SET owner_id = ?, updated_at = NOW() WHERE id = ?', [users[0].id, req.community.id]);
    await db.query(
      "UPDATE community_members SET role = 'admin', can_link = 1 WHERE community_id = ? AND user_id = ?",
      [req.community.id, users[0].id],
    );
    return R.ok(res, { message: 'Comunidade transferida.' });
  } catch (err) { return R.serverError(res, err); }
}

// ─── Convites ────────────────────────────────────────────────────────────────

const B32 = 'ABCDEFGHJKMNPQRSTVWXYZ23456789'; // sem I, L, O, U, 0, 1
function newInviteCode() {
  const bytes = crypto.randomBytes(12);
  let out = '';
  for (let i = 0; i < 12; i += 1) out += B32[bytes[i] % B32.length];
  return `${out.slice(0, 4)}-${out.slice(4, 8)}-${out.slice(8, 12)}`;
}
const normalizeCode = (c) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/(.{4})(.{4})(.{4})/, '$1-$2-$3');

function inviteStatus(i) {
  if (i.revoked_at) return 'revoked';
  if (i.expired) return 'expired';
  if (i.max_uses != null && i.uses >= i.max_uses) return 'exhausted';
  return 'active';
}

// GET /communities/:id/invites
async function listInvites(req, res) {
  try {
    const [rows] = await db.query(
      `SELECT i.uuid, i.code, i.label, i.expires_at, i.max_uses, i.uses, i.revoked_at, i.created_at,
              (i.expires_at IS NOT NULL AND i.expires_at <= NOW()) AS expired,
              u.uuid AS created_by_uuid, u.name AS created_by_name
         FROM community_invites i JOIN users u ON u.id = i.created_by
        WHERE i.community_id = ? ORDER BY i.created_at DESC`,
      [req.community.id],
    );
    return R.ok(res, rows.map((i) => ({ ...i, expired: !!i.expired, status: inviteStatus(i) })));
  } catch (err) { return R.serverError(res, err); }
}

// POST /communities/:id/invites  { label?, expires_in_hours?, max_uses? }
async function createInvite(req, res) {
  try {
    const { label, expires_in_hours, max_uses } = req.body || {};
    const errors = [];
    let hours = null;
    if (expires_in_hours !== undefined && expires_in_hours !== null && expires_in_hours !== '') {
      hours = Number(expires_in_hours);
      if (!Number.isFinite(hours) || hours <= 0 || hours > 24 * 365) errors.push({ field: 'expires_in_hours', message: 'Use entre 1 hora e 365 dias.' });
    }
    let max = null;
    if (max_uses !== undefined && max_uses !== null && max_uses !== '') {
      max = Number(max_uses);
      if (!Number.isInteger(max) || max < 1 || max > 100000) errors.push({ field: 'max_uses', message: 'Use um número inteiro de 1 a 100000.' });
    }
    if (label && String(label).length > 120) errors.push({ field: 'label', message: 'Máximo 120 caracteres.' });
    if (errors.length) return R.unprocessable(res, errors);

    const uuid = uuidv4();
    let code = newInviteCode();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        await db.query(
          `INSERT INTO community_invites (uuid, community_id, code, label, created_by, expires_at, max_uses, created_at)
           VALUES (?, ?, ?, ?, ?, ${hours ? 'DATE_ADD(NOW(), INTERVAL ? MINUTE)' : 'NULL'}, ?, NOW())`,
          hours
            ? [uuid, req.community.id, code, label || null, req.user.id, Math.round(hours * 60), max]
            : [uuid, req.community.id, code, label || null, req.user.id, max],
        );
        break;
      } catch (e) {
        if (e.code === 'ER_DUP_ENTRY' && attempt < 4) { code = newInviteCode(); continue; }
        throw e;
      }
    }
    const [rows] = await db.query(
      `SELECT uuid, code, label, expires_at, max_uses, uses, revoked_at, created_at FROM community_invites WHERE uuid = ?`, [uuid],
    );
    return R.created(res, { ...rows[0], status: 'active' });
  } catch (err) { return R.serverError(res, err); }
}

// DELETE /communities/:id/invites/:iid  — revoga
async function revokeInvite(req, res) {
  try {
    const [rows] = await db.query(
      'SELECT id, created_by FROM community_invites WHERE uuid = ? AND community_id = ?', [req.params.iid, req.community.id],
    );
    if (!rows.length) return R.notFound(res, 'Convite');
    if (rankOf(req.cRole) < RANK.admin && rows[0].created_by !== req.user.id) {
      return R.forbidden(res, 'Só quem criou o convite ou um administrador pode revogá-lo.');
    }
    await db.query('UPDATE community_invites SET revoked_at = NOW() WHERE id = ? AND revoked_at IS NULL', [rows[0].id]);
    return R.noContent(res);
  } catch (err) { return R.serverError(res, err); }
}

async function findUsableInvite(code) {
  const [rows] = await db.query(
    `SELECT i.*, c.uuid AS community_uuid, c.name, c.description, c.visibility, c.cover_color,
            (i.expires_at IS NOT NULL AND i.expires_at <= NOW()) AS expired,
            (SELECT COUNT(*) FROM community_members WHERE community_id = c.id) AS member_count,
            o.name AS owner_name
       FROM community_invites i
       JOIN communities c ON c.id = i.community_id
       JOIN users o ON o.id = c.owner_id
      WHERE i.code = ?`,
    [normalizeCode(code)],
  );
  return rows[0] || null;
}

// GET /communities/invite/:code  — prévia antes de entrar
async function previewInvite(req, res) {
  try {
    const inv = await findUsableInvite(req.params.code);
    if (!inv) return R.notFound(res, 'Convite');
    const status = inviteStatus({ ...inv, expired: !!inv.expired });
    const member = await memberRow(inv.community_id, req.user.id);
    return R.ok(res, {
      status,
      is_member: !!member,
      community: {
        uuid: inv.community_uuid, name: inv.name, description: inv.description,
        visibility: inv.visibility, cover_color: inv.cover_color,
        member_count: inv.member_count, owner_name: inv.owner_name,
      },
    });
  } catch (err) { return R.serverError(res, err); }
}

// POST /communities/join  { code }
async function joinWithCode(req, res) {
  try {
    const code = req.body && req.body.code;
    if (!code) return R.unprocessable(res, [{ field: 'code', message: 'Obrigatório.' }]);
    const inv = await findUsableInvite(code);
    if (!inv) return R.error(res, 404, 'INVITE_NOT_FOUND', 'Código de convite inválido.');

    if (await memberRow(inv.community_id, req.user.id)) {
      return R.ok(res, { uuid: inv.community_uuid, name: inv.name, joined: false, already_member: true });
    }
    if (await isBanned(inv.community_id, req.user.id)) return R.forbidden(res, 'Você foi removido desta comunidade.');

    // Consome 1 uso de forma atômica (respeita expiração, revogação e limite).
    const [upd] = await db.query(
      `UPDATE community_invites SET uses = uses + 1
        WHERE id = ? AND revoked_at IS NULL
          AND (expires_at IS NULL OR expires_at > NOW())
          AND (max_uses IS NULL OR uses < max_uses)`,
      [inv.id],
    );
    if (!upd.affectedRows) {
      const status = inviteStatus({ ...inv, expired: !!inv.expired });
      return R.error(res, 410, 'INVITE_UNAVAILABLE', 'Este convite não está mais disponível.', { status: status === 'active' ? 'exhausted' : status });
    }
    await db.query(
      `INSERT IGNORE INTO community_members (community_id, user_id, role, joined_at) VALUES (?, ?, 'member', NOW())`,
      [inv.community_id, req.user.id],
    );
    return R.ok(res, { uuid: inv.community_uuid, name: inv.name, joined: true });
  } catch (err) { return R.serverError(res, err); }
}

// ─── Membros ─────────────────────────────────────────────────────────────────

// GET /communities/:id/members
async function listMembers(req, res) {
  try {
    const [rows] = await db.query(
      `SELECT u.uuid, u.name, u.initials, u.avatar_url, u.institution, u.research_area,
              cm.role, cm.can_link, cm.joined_at, (c.owner_id = u.id) AS is_owner
         FROM community_members cm
         JOIN users u ON u.id = cm.user_id
         JOIN communities c ON c.id = cm.community_id
        WHERE cm.community_id = ? AND u.deleted_at IS NULL
        ORDER BY is_owner DESC, FIELD(cm.role, 'admin', 'moderator', 'member'), u.name`,
      [req.community.id],
    );
    return R.ok(res, rows.map((m) => ({
      ...m, can_link: !!m.can_link, is_owner: !!m.is_owner, role: m.is_owner ? 'owner' : m.role,
    })));
  } catch (err) { return R.serverError(res, err); }
}

async function targetMember(req, res) {
  const [users] = await db.query('SELECT id FROM users WHERE uuid = ?', [req.params.uid]);
  if (!users.length) { R.notFound(res, 'Usuário'); return null; }
  const member = await memberRow(req.community.id, users[0].id);
  if (!member) { R.notFound(res, 'Membro'); return null; }
  const role = req.community.owner_id === users[0].id ? 'owner' : member.role;
  return { userId: users[0].id, member, role };
}

// PUT /communities/:id/members/:uid  { role?, can_link? }   (admin+)
async function updateMember(req, res) {
  try {
    const t = await targetMember(req, res);
    if (!t) return;
    const { role, can_link } = req.body || {};
    const actor = rankOf(req.cRole);

    if (t.role === 'owner') return R.forbidden(res, 'O dono da comunidade não pode ser alterado.');
    // Admins só mexem em quem está abaixo; outro admin só o dono rebaixa.
    if (rankOf(t.role) >= actor && req.cRole !== 'owner') return R.forbidden(res, 'Você não pode alterar este membro.');

    const sets = []; const vals = [];
    if (role !== undefined) {
      if (!ROLE_LABELS.includes(role)) return R.unprocessable(res, [{ field: 'role', message: 'Inválido.' }]);
      if (role === 'admin' && req.cRole !== 'owner') return R.forbidden(res, 'Só o dono promove administradores.');
      sets.push('role = ?'); vals.push(role);
    }
    if (can_link !== undefined) { sets.push('can_link = ?'); vals.push(can_link ? 1 : 0); }
    if (!sets.length) return R.badRequest(res, 'Nada para atualizar.');
    await db.query(
      `UPDATE community_members SET ${sets.join(', ')} WHERE community_id = ? AND user_id = ?`,
      [...vals, req.community.id, t.userId],
    );
    return R.ok(res, { message: 'Membro atualizado.' });
  } catch (err) { return R.serverError(res, err); }
}

// DELETE /communities/:id/members/:uid?ban=1   (moderador+, respeitando a hierarquia)
async function removeMember(req, res) {
  try {
    const t = await targetMember(req, res);
    if (!t) return;
    if (t.userId === req.user.id) {
      return R.unprocessable(res, [{ field: 'uid', message: 'Para sair, use "Sair da comunidade".' }]);
    }
    if (t.role === 'owner') return R.forbidden(res, 'O dono da comunidade não pode ser removido.');
    const actor = rankOf(req.cRole);
    // Remove somente quem está estritamente abaixo (dono remove qualquer um que não seja ele).
    if (req.cRole !== 'owner' && rankOf(t.role) >= actor) return R.forbidden(res, 'Você não pode remover este membro.');

    await db.query('DELETE FROM community_members WHERE community_id = ? AND user_id = ?', [req.community.id, t.userId]);
    await db.query('DELETE FROM community_projects WHERE community_id = ? AND shared_by = ?', [req.community.id, t.userId]);
    if (req.query.ban === '1' || req.query.ban === 'true') {
      await db.query(
        'INSERT IGNORE INTO community_bans (community_id, user_id, banned_by, created_at) VALUES (?, ?, ?, NOW())',
        [req.community.id, t.userId, req.user.id],
      );
    }
    return R.noContent(res);
  } catch (err) { return R.serverError(res, err); }
}

// GET /communities/:id/bans  (admin+)
async function listBans(req, res) {
  try {
    const [rows] = await db.query(
      `SELECT u.uuid, u.name, b.created_at FROM community_bans b JOIN users u ON u.id = b.user_id
        WHERE b.community_id = ? ORDER BY b.created_at DESC`, [req.community.id],
    );
    return R.ok(res, rows);
  } catch (err) { return R.serverError(res, err); }
}

// DELETE /communities/:id/bans/:uid  (admin+)
async function removeBan(req, res) {
  try {
    const [users] = await db.query('SELECT id FROM users WHERE uuid = ?', [req.params.uid]);
    if (!users.length) return R.notFound(res, 'Usuário');
    await db.query('DELETE FROM community_bans WHERE community_id = ? AND user_id = ?', [req.community.id, users[0].id]);
    return R.noContent(res);
  } catch (err) { return R.serverError(res, err); }
}

// ─── Projetos vinculados ─────────────────────────────────────────────────────

async function projectRow(uuid) {
  const [rows] = await db.query('SELECT * FROM projects WHERE uuid = ? AND deleted_at IS NULL', [uuid]);
  return rows[0] || null;
}

// GET /communities/:id/projects
//   membros: todos os projetos vinculados (com o nível de acesso concedido)
//   visitante de comunidade pública: apenas os projetos vinculados que são públicos
async function listCommunityProjects(req, res) {
  try {
    const isMember = !!req.cRole;
    const [rows] = await db.query(
      `SELECT p.uuid, p.name, p.description, p.visibility, p.status, p.updated_at,
              cp.access, cp.section_id, cp.position, cp.shared_at,
              ou.uuid AS owner_uuid, ou.name AS owner_name, ou.avatar_url AS owner_avatar_url,
              su.uuid AS shared_by_uuid, su.name AS shared_by_name,
              (SELECT COUNT(*) FROM project_workflows WHERE project_id = p.id) AS workflow_count,
              (SELECT COUNT(*) FROM project_datasets WHERE project_id = p.id) AS dataset_count,
              (SELECT COUNT(*) FROM project_techniques WHERE project_id = p.id) AS technique_count,
              s.uuid AS section_uuid
         FROM community_projects cp
         JOIN projects p ON p.id = cp.project_id AND p.deleted_at IS NULL
         JOIN users ou ON ou.id = p.user_id
         JOIN users su ON su.id = cp.shared_by
         LEFT JOIN community_sections s ON s.id = cp.section_id
        WHERE cp.community_id = ? ${isMember ? '' : "AND p.visibility = 'public'"}
        ORDER BY cp.position, cp.shared_at DESC`,
      [req.community.id],
    );
    return R.ok(res, rows.map(({ section_id, ...r }) => r));
  } catch (err) { return R.serverError(res, err); }
}

// POST /communities/:id/projects  { project_id, access?, section_id? }
async function linkProject(req, res) {
  try {
    const member = await memberRow(req.community.id, req.user.id);
    const perms = permissions(req.community, req.cRole, member);
    if (!perms.can_link) return R.forbidden(res, 'Você não tem permissão para vincular projetos nesta comunidade.');

    const { project_id, access, section_id } = req.body || {};
    if (!project_id) return R.unprocessable(res, [{ field: 'project_id', message: 'Obrigatório.' }]);
    const acc = access || 'read';
    if (!ACCESS_VALUES.includes(acc)) return R.unprocessable(res, [{ field: 'access', message: "Deve ser 'read' ou 'edit'." }]);

    const project = await projectRow(project_id);
    if (!project) return R.notFound(res, 'Projeto');
    if ((await projectLevel(project, req.user)) < LEVEL.ADMIN) {
      return R.forbidden(res, 'Só o dono ou um administrador do projeto pode vinculá-lo a uma comunidade.');
    }
    let sectionId = null;
    if (section_id) {
      const [s] = await db.query('SELECT id FROM community_sections WHERE uuid = ? AND community_id = ?', [section_id, req.community.id]);
      if (!s.length) return R.notFound(res, 'Tópico');
      sectionId = s[0].id;
    }
    await db.query(
      `INSERT INTO community_projects (community_id, project_id, shared_by, access, section_id, shared_at)
       VALUES (?, ?, ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE access = VALUES(access), section_id = VALUES(section_id)`,
      [req.community.id, project.id, req.user.id, acc, sectionId],
    );
    return R.created(res, { message: 'Projeto vinculado.', access: acc });
  } catch (err) { return R.serverError(res, err); }
}

// PUT /communities/:id/projects/:pid  { access?, section_id? }
async function updateProjectLink(req, res) {
  try {
    const project = await projectRow(req.params.pid);
    if (!project) return R.notFound(res, 'Projeto');
    const [links] = await db.query(
      'SELECT * FROM community_projects WHERE community_id = ? AND project_id = ?', [req.community.id, project.id],
    );
    if (!links.length) return R.notFound(res, 'Vínculo');
    const { access, section_id } = req.body || {};

    const isProjectAdmin = (await projectLevel(project, req.user)) >= LEVEL.ADMIN;
    const isSharer = links[0].shared_by === req.user.id;
    const canOrganize = rankOf(req.cRole) >= RANK.moderator;

    const sets = []; const vals = [];
    if (access !== undefined) {
      // Quem define o que os alunos podem fazer é o responsável pelo projeto.
      if (!isProjectAdmin) return R.forbidden(res, 'Só o responsável pelo projeto altera o nível de acesso.');
      if (!ACCESS_VALUES.includes(access)) return R.unprocessable(res, [{ field: 'access', message: "Deve ser 'read' ou 'edit'." }]);
      sets.push('access = ?'); vals.push(access);
    }
    if (section_id !== undefined) {
      if (!(isProjectAdmin || isSharer || canOrganize)) return R.forbidden(res);
      if (section_id === null || section_id === '') { sets.push('section_id = NULL'); } else {
        const [s] = await db.query('SELECT id FROM community_sections WHERE uuid = ? AND community_id = ?', [section_id, req.community.id]);
        if (!s.length) return R.notFound(res, 'Tópico');
        sets.push('section_id = ?'); vals.push(s[0].id);
      }
    }
    if (!sets.length) return R.badRequest(res, 'Nada para atualizar.');
    await db.query(
      `UPDATE community_projects SET ${sets.join(', ')} WHERE community_id = ? AND project_id = ?`,
      [...vals, req.community.id, project.id],
    );
    return R.ok(res, { message: 'Vínculo atualizado.' });
  } catch (err) { return R.serverError(res, err); }
}

// DELETE /communities/:id/projects/:pid
async function unlinkProject(req, res) {
  try {
    const [pr] = await db.query('SELECT * FROM projects WHERE uuid = ?', [req.params.pid]);
    if (!pr.length) return R.notFound(res, 'Projeto');
    const [links] = await db.query(
      'SELECT * FROM community_projects WHERE community_id = ? AND project_id = ?', [req.community.id, pr[0].id],
    );
    if (!links.length) return R.notFound(res, 'Vínculo');
    const isProjectAdmin = (await projectLevel(pr[0], req.user)) >= LEVEL.ADMIN;
    const isSharer = links[0].shared_by === req.user.id;
    if (!(isProjectAdmin || isSharer || rankOf(req.cRole) >= RANK.moderator)) return R.forbidden(res);
    await db.query('DELETE FROM community_projects WHERE community_id = ? AND project_id = ?', [req.community.id, pr[0].id]);
    return R.noContent(res);
  } catch (err) { return R.serverError(res, err); }
}

// ─── Datasets / workflows compartilhados (legado, agora com checagem) ────────

async function listCommunityDatasets(req, res) {
  try {
    const [rows] = await db.query(
      `SELECT d.uuid, d.name, d.description, d.data_type, d.dimensions, cd.shared_at, u.name AS shared_by_name
         FROM community_datasets cd JOIN datasets d ON d.id = cd.dataset_id AND d.deleted_at IS NULL
         JOIN users u ON u.id = cd.shared_by
        WHERE cd.community_id = ?`, [req.community.id],
    );
    return R.ok(res, rows);
  } catch (err) { return R.serverError(res, err); }
}

async function shareDataset(req, res) {
  try {
    const { dataset_id } = req.body || {};
    if (!dataset_id) return R.unprocessable(res, [{ field: 'dataset_id', message: 'Obrigatório.' }]);
    const [ds] = await db.query('SELECT id, user_id FROM datasets WHERE uuid = ? AND deleted_at IS NULL', [dataset_id]);
    if (!ds.length) return R.notFound(res, 'Dataset');
    if (ds[0].user_id !== req.user.id) return R.forbidden(res, 'Você só pode compartilhar datasets seus.');
    await db.query(
      'INSERT IGNORE INTO community_datasets (community_id, dataset_id, shared_by, shared_at) VALUES (?, ?, ?, NOW())',
      [req.community.id, ds[0].id, req.user.id],
    );
    return R.created(res, { message: 'Dataset compartilhado.' });
  } catch (err) { return R.serverError(res, err); }
}

async function removeDatasetShare(req, res) {
  try {
    const [ds] = await db.query('SELECT id FROM datasets WHERE uuid = ?', [req.params.did]);
    if (!ds.length) return R.notFound(res, 'Dataset');
    const [links] = await db.query('SELECT shared_by FROM community_datasets WHERE community_id = ? AND dataset_id = ?', [req.community.id, ds[0].id]);
    if (!links.length) return R.notFound(res, 'Vínculo');
    if (links[0].shared_by !== req.user.id && rankOf(req.cRole) < RANK.moderator) return R.forbidden(res);
    await db.query('DELETE FROM community_datasets WHERE community_id = ? AND dataset_id = ?', [req.community.id, ds[0].id]);
    return R.noContent(res);
  } catch (err) { return R.serverError(res, err); }
}

async function listCommunityWorkflows(req, res) {
  try {
    const [rows] = await db.query(
      `SELECT w.uuid, w.name, w.description, cw.shared_at, u.name AS shared_by_name
         FROM community_workflows cw JOIN workflows w ON w.id = cw.workflow_id AND w.deleted_at IS NULL
         JOIN users u ON u.id = cw.shared_by
        WHERE cw.community_id = ?`, [req.community.id],
    );
    return R.ok(res, rows);
  } catch (err) { return R.serverError(res, err); }
}

async function shareWorkflow(req, res) {
  try {
    const { workflow_id } = req.body || {};
    if (!workflow_id) return R.unprocessable(res, [{ field: 'workflow_id', message: 'Obrigatório.' }]);
    const [wf] = await db.query('SELECT id, user_id FROM workflows WHERE uuid = ? AND deleted_at IS NULL', [workflow_id]);
    if (!wf.length) return R.notFound(res, 'Workflow');
    if (wf[0].user_id !== req.user.id) return R.forbidden(res, 'Você só pode compartilhar workflows seus.');
    await db.query(
      'INSERT IGNORE INTO community_workflows (community_id, workflow_id, shared_by, shared_at) VALUES (?, ?, ?, NOW())',
      [req.community.id, wf[0].id, req.user.id],
    );
    return R.created(res, { message: 'Workflow compartilhado.' });
  } catch (err) { return R.serverError(res, err); }
}

async function removeWorkflowShare(req, res) {
  try {
    const [wf] = await db.query('SELECT id FROM workflows WHERE uuid = ?', [req.params.wid]);
    if (!wf.length) return R.notFound(res, 'Workflow');
    const [links] = await db.query('SELECT shared_by FROM community_workflows WHERE community_id = ? AND workflow_id = ?', [req.community.id, wf[0].id]);
    if (!links.length) return R.notFound(res, 'Vínculo');
    if (links[0].shared_by !== req.user.id && rankOf(req.cRole) < RANK.moderator) return R.forbidden(res);
    await db.query('DELETE FROM community_workflows WHERE community_id = ? AND workflow_id = ?', [req.community.id, wf[0].id]);
    return R.noContent(res);
  } catch (err) { return R.serverError(res, err); }
}

// ─── Conteúdo estilo "Moodle": tópicos com materiais ────────────────────────

function removeStoredFile(filePath) {
  if (!filePath) return;
  const full = path.join(storage.communities, path.basename(filePath));
  fs.promises.unlink(full).catch(() => {});
}

function cleanUrl(input) {
  if (input == null || !String(input).trim()) return { error: 'Informe o endereço do link.' };
  let raw = String(input).trim();
  if (raw.length > 1000) return { error: 'Endereço muito longo.' };
  if (!/^[a-z][a-z0-9+.-]*:/i.test(raw)) raw = `https://${raw}`;
  try {
    const u = new URL(raw);
    if (!['http:', 'https:'].includes(u.protocol)) return { error: 'Use um endereço http(s).' };
    return { value: u.toString() };
  } catch { return { error: 'Endereço inválido.' }; }
}

async function sectionRow(communityId, uuid) {
  const [rows] = await db.query('SELECT * FROM community_sections WHERE uuid = ? AND community_id = ?', [uuid, communityId]);
  return rows[0] || null;
}

const MAX_SECTION_DEPTH = 3; // Parte > Aula > Subaula

/** Cadeia de ancestrais (do pai para cima) de uma seção. */
async function sectionAncestors(sec) {
  const chain = [];
  let cur = sec;
  while (cur && cur.parent_id && chain.length < 10) {
    const [rows] = await db.query('SELECT * FROM community_sections WHERE id = ?', [cur.parent_id]);
    cur = rows[0];
    if (cur) chain.push(cur);
  }
  return chain;
}

/** Ids de todos os descendentes de uma seção. */
async function sectionDescendants(id) {
  const out = [];
  let frontier = [id];
  for (let d = 0; d < 10 && frontier.length; d += 1) {
    const [rows] = await db.query('SELECT id FROM community_sections WHERE parent_id IN (?)', [frontier]);
    frontier = rows.map((r) => r.id);
    out.push(...frontier);
  }
  return out;
}

/** Altura da subárvore (1 = sem filhos). */
async function subtreeHeight(id) {
  let h = 1; let frontier = [id];
  for (let d = 0; d < 10; d += 1) {
    const [rows] = await db.query('SELECT id FROM community_sections WHERE parent_id IN (?)', [frontier]);
    if (!rows.length) break;
    h += 1; frontier = rows.map((r) => r.id);
  }
  return h;
}

/** Um tópico só é visível a membros comuns se ele e todos os ancestrais forem visíveis. */
async function sectionVisibleTo(sec) {
  if (!sec) return false;
  if (!sec.is_visible) return false;
  return (await sectionAncestors(sec)).every((a) => a.is_visible);
}

/** Resolve `parent` (uuid|null) validando existência, profundidade e ciclos. `selfSec` = tópico sendo movido. */
async function resolveParent(communityId, parentUuid, selfSec) {
  if (!parentUuid) return { id: null };
  const parent = await sectionRow(communityId, String(parentUuid));
  if (!parent) return { error: 'Tópico pai não encontrado.' };
  const chain = await sectionAncestors(parent);
  if (selfSec && (parent.id === selfSec.id || chain.some((a) => a.id === selfSec.id))) return { error: 'Um tópico não pode ficar dentro de si mesmo.' };
  const depthOfParent = chain.length + 1;
  const height = selfSec ? await subtreeHeight(selfSec.id) : 1;
  if (depthOfParent + height > MAX_SECTION_DEPTH) return { error: `No máximo ${MAX_SECTION_DEPTH} níveis de tópicos.` };
  return { id: parent.id };
}

/** Linha do banco -> item da API (referências a workflow/variável viram `ref`). */
function shapeItem(row) {
  const { section_id, is_visible, wf_uuid, wf_name, ds_uuid, ds_name, ds_dimensions, ...it } = row;
  const out = { ...it, is_visible: !!is_visible };
  if (it.type === 'workflow') out.ref = wf_uuid ? { uuid: wf_uuid, name: wf_name } : null;
  else if (it.type === 'dataset') {
    let dims = null;
    try { dims = typeof ds_dimensions === 'string' ? JSON.parse(ds_dimensions) : ds_dimensions; } catch { /* ignora */ }
    out.ref = ds_uuid ? { uuid: ds_uuid, name: ds_name, dimensions: dims } : null;
  } else { delete out.access; }
  if (it.type !== 'file') delete out.preview_status;
  return out;
}

// GET /communities/:id/content
async function getContent(req, res) {
  try {
    const canSeeHidden = rankOf(req.cRole) >= RANK.moderator;
    const [allSections] = await db.query(
      `SELECT id, uuid, parent_id, title, description, position, is_visible, created_at
         FROM community_sections WHERE community_id = ? ORDER BY position, id`, [req.community.id],
    );
    // visibilidade efetiva: o tópico e todos os ancestrais precisam estar visíveis
    const byId = new Map(allSections.map((x) => [x.id, x]));
    const effVisible = (x) => { let c = x; let n = 0; while (c && n < 10) { if (!c.is_visible) return false; c = c.parent_id ? byId.get(c.parent_id) : null; n += 1; } return true; };
    const sections = canSeeHidden ? allSections : allSections.filter(effVisible);
    const visibleIds = new Set(sections.map((x) => x.id));
    const [items] = await db.query(
      `SELECT i.uuid, i.section_id, i.type, i.title, i.description, i.url, i.file_name, i.file_mime, i.file_size,
              i.position, i.is_visible, i.created_at, i.access, i.preview_status, u.name AS created_by_name,
              w.uuid AS wf_uuid, w.name AS wf_name, d.uuid AS ds_uuid, d.name AS ds_name, d.dimensions AS ds_dimensions
         FROM community_items i LEFT JOIN users u ON u.id = i.created_by
         LEFT JOIN workflows w ON i.type = 'workflow' AND w.id = i.ref_id AND w.deleted_at IS NULL
         LEFT JOIN datasets d ON i.type = 'dataset' AND d.id = i.ref_id AND d.deleted_at IS NULL
        WHERE i.community_id = ? ${canSeeHidden ? '' : 'AND i.is_visible = 1'}
        ORDER BY i.position, i.id`, [req.community.id],
    );
    const [projects] = await db.query(
      `SELECT p.uuid, p.name, p.description, p.visibility, cp.access, cp.section_id, cp.position,
              ou.name AS owner_name,
              (SELECT COUNT(*) FROM project_workflows WHERE project_id = p.id) AS workflow_count,
              (SELECT COUNT(*) FROM project_datasets WHERE project_id = p.id) AS dataset_count
         FROM community_projects cp JOIN projects p ON p.id = cp.project_id AND p.deleted_at IS NULL
         JOIN users ou ON ou.id = p.user_id
        WHERE cp.community_id = ? ORDER BY cp.position, cp.shared_at`, [req.community.id],
    );
    const [quizzes] = await db.query(
      `SELECT q.uuid, q.section_id, q.title, q.description, q.status, q.due_at, q.show_results, q.position, q.created_at,
              (SELECT COUNT(*) FROM quiz_questions WHERE quiz_id = q.id) AS question_count,
              (SELECT COUNT(*) FROM quiz_submissions WHERE quiz_id = q.id AND status <> 'in_progress') AS submission_count,
              (SELECT status FROM quiz_submissions WHERE quiz_id = q.id AND user_id = ?) AS my_status
         FROM quizzes q WHERE q.community_id = ? ${canSeeHidden ? '' : "AND q.status <> 'draft'"}
        ORDER BY q.position, q.id`, [req.user.id, req.community.id],
    );

    const bySection = (sid) => ({
      items: items.filter((i) => i.section_id === sid).map(shapeItem),
      projects: projects.filter((p) => p.section_id === sid).map(({ section_id, ...p }) => p),
      quizzes: quizzes.filter((q) => q.section_id === sid).map(({ section_id, ...q }) => q),
    });
    const parentUuid = (x) => (x.parent_id && byId.get(x.parent_id) ? byId.get(x.parent_id).uuid : null);
    return R.ok(res, {
      // lista plana; `parent` (uuid) monta a árvore. Mantém a ordem por position entre irmãos.
      sections: sections.filter((x) => visibleIds.has(x.id)).map((s) => ({
        uuid: s.uuid, parent: parentUuid(s), title: s.title, description: s.description, position: s.position,
        is_visible: !!s.is_visible, ...bySection(s.id),
      })),
      general: bySection(null),
    });
  } catch (err) { return R.serverError(res, err); }
}

// POST /communities/:id/sections  { title, description? }
async function createSection(req, res) {
  try {
    const { title, description, parent } = req.body || {};
    const t = String(title || '').trim();
    if (!t) return R.unprocessable(res, [{ field: 'title', message: 'Obrigatório.' }]);
    if (t.length > 255) return R.unprocessable(res, [{ field: 'title', message: 'Máximo 255 caracteres.' }]);
    const par = await resolveParent(req.community.id, parent, null);
    if (par.error) return R.unprocessable(res, [{ field: 'parent', message: par.error }]);
    const [[{ next }]] = await db.query(
      'SELECT COALESCE(MAX(position), -1) + 1 AS next FROM community_sections WHERE community_id = ? AND parent_id <=> ?', [req.community.id, par.id],
    );
    const uuid = uuidv4();
    await db.query(
      `INSERT INTO community_sections (uuid, community_id, parent_id, title, description, position, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [uuid, req.community.id, par.id, t, description ? String(description).slice(0, 5000) : null, next, req.user.id],
    );
    return R.created(res, { uuid, parent: parent || null, title: t, description: description || null, position: next, is_visible: true, items: [], projects: [], quizzes: [] });
  } catch (err) { return R.serverError(res, err); }
}

// PUT /communities/:id/sections/:sid
async function updateSection(req, res) {
  try {
    const s = await sectionRow(req.community.id, req.params.sid);
    if (!s) return R.notFound(res, 'Tópico');
    const { title, description, is_visible, parent } = req.body || {};
    if (title !== undefined && !String(title).trim()) return R.unprocessable(res, [{ field: 'title', message: 'Obrigatório.' }]);
    let parentId = s.parent_id; let position = s.position;
    if (parent !== undefined) {
      const par = await resolveParent(req.community.id, parent, s);
      if (par.error) return R.unprocessable(res, [{ field: 'parent', message: par.error }]);
      if ((par.id || null) !== (s.parent_id || null)) {
        parentId = par.id;
        const [[{ next }]] = await db.query(
          'SELECT COALESCE(MAX(position), -1) + 1 AS next FROM community_sections WHERE community_id = ? AND parent_id <=> ?', [req.community.id, par.id],
        );
        position = next;
      }
    }
    await db.query(
      'UPDATE community_sections SET title = ?, description = ?, is_visible = ?, parent_id = ?, position = ? WHERE id = ?',
      [
        title !== undefined ? String(title).trim().slice(0, 255) : s.title,
        description !== undefined ? (description ? String(description).slice(0, 5000) : null) : s.description,
        is_visible !== undefined ? (is_visible ? 1 : 0) : s.is_visible,
        parentId, position,
        s.id,
      ],
    );
    return R.ok(res, { message: 'Tópico atualizado.' });
  } catch (err) { return R.serverError(res, err); }
}

// PUT /communities/:id/sections-order  { order: [uuid, ...] }
async function reorderSections(req, res) {
  try {
    const order = req.body && req.body.order;
    if (!Array.isArray(order)) return R.unprocessable(res, [{ field: 'order', message: 'Informe a lista de tópicos.' }]);
    for (let i = 0; i < order.length; i += 1) {
      await db.query('UPDATE community_sections SET position = ? WHERE uuid = ? AND community_id = ?', [i, String(order[i]), req.community.id]);
    }
    return R.ok(res, { message: 'Ordem atualizada.' });
  } catch (err) { return R.serverError(res, err); }
}

// DELETE /communities/:id/sections/:sid
async function deleteSection(req, res) {
  try {
    const s = await sectionRow(req.community.id, req.params.sid);
    if (!s) return R.notFound(res, 'Tópico');
    const ids = [s.id, ...(await sectionDescendants(s.id))];
    const [files] = await db.query('SELECT file_path, preview_path FROM community_items WHERE section_id IN (?) AND file_path IS NOT NULL', [ids]);
    // Projetos do tópico (e dos subtópicos) voltam para "geral" (o vínculo é preservado).
    await db.query('UPDATE community_projects SET section_id = NULL WHERE section_id IN (?)', [ids]);
    // filhos primeiro (itens e quizzes saem por cascata)
    await db.query('DELETE FROM community_sections WHERE id IN (?) ORDER BY id DESC', [ids]);
    files.forEach((f) => { removeStoredFile(f.file_path); removeStoredFile(f.preview_path); });
    return R.noContent(res);
  } catch (err) { return R.serverError(res, err); }
}

/** Multer com 422 amigável + checagem prévia de papel feita pelo guard. */
function itemUpload(req, res, next) {
  if (!String(req.headers['content-type'] || '').startsWith('multipart/')) return next();
  return communityUpload.single('file')(req, res, (err) => {
    if (!err) return next();
    const message = err.code === 'LIMIT_FILE_SIZE' ? 'O arquivo deve ter no máximo 100 MB.' : err.message;
    return R.unprocessable(res, [{ field: 'file', message }]);
  });
}

// POST /communities/:id/items   (JSON para link/texto, multipart para arquivo)
async function createItem(req, res) {
  const discard = () => { if (req.file) fs.promises.unlink(req.file.path).catch(() => {}); };
  try {
    const b = req.body || {};
    const type = req.file ? 'file' : (b.type || 'link');
    if (!['link', 'file', 'text', 'workflow', 'dataset'].includes(type)) { discard(); return R.unprocessable(res, [{ field: 'type', message: 'Inválido.' }]); }
    if (type === 'file' && !req.file) return R.unprocessable(res, [{ field: 'file', message: 'Envie um arquivo.' }]);

    // Referência a um workflow / variável do Workspace do próprio professor
    let refId = null; let refName = null; let refAccess = 'read';
    if (type === 'workflow' || type === 'dataset') {
      if (!b.ref) return R.unprocessable(res, [{ field: 'ref', message: type === 'workflow' ? 'Escolha um workflow.' : 'Escolha uma variável.' }]);
      if (type === 'workflow') {
        const [w] = await db.query('SELECT * FROM workflows WHERE uuid = ? AND deleted_at IS NULL', [String(b.ref)]);
        if (!w.length) return R.notFound(res, 'Workflow');
        if ((await workflowLevel(w[0], req.user)) < LEVEL.EDIT) return R.forbidden(res, 'Você só pode vincular workflows que pode editar.');
        refId = w[0].id; refName = w[0].name;
        if (b.access !== undefined) {
          if (!ACCESS_VALUES.includes(b.access)) return R.unprocessable(res, [{ field: 'access', message: 'Use read ou edit.' }]);
          refAccess = b.access;
        }
      } else {
        const [d] = await db.query('SELECT * FROM datasets WHERE uuid = ? AND deleted_at IS NULL', [String(b.ref)]);
        if (!d.length) return R.notFound(res, 'Variável');
        if (d[0].user_id !== req.user.id && req.user.role !== 'admin') return R.forbidden(res, 'Você só pode vincular variáveis suas.');
        refId = d[0].id; refName = d[0].name;
      }
    }

    const title = String(b.title || (req.file ? req.file.originalname : refName || '')).trim();
    if (!title) { discard(); return R.unprocessable(res, [{ field: 'title', message: 'Obrigatório.' }]); }
    if (title.length > 255) { discard(); return R.unprocessable(res, [{ field: 'title', message: 'Máximo 255 caracteres.' }]); }

    let url = null;
    if (type === 'link') {
      const u = cleanUrl(b.url);
      if (u.error) { discard(); return R.unprocessable(res, [{ field: 'url', message: u.error }]); }
      url = u.value;
    }
    if (type === 'text' && !String(b.description || '').trim()) {
      discard(); return R.unprocessable(res, [{ field: 'description', message: 'Escreva o conteúdo do texto.' }]);
    }

    const wantsPreview = !!req.file && isOfficeFile(req.file.originalname);
    let sectionId = null;
    if (b.section_id) {
      const s = await sectionRow(req.community.id, b.section_id);
      if (!s) { discard(); return R.notFound(res, 'Tópico'); }
      sectionId = s.id;
    }
    const [[{ next }]] = await db.query(
      'SELECT COALESCE(MAX(position), -1) + 1 AS next FROM community_items WHERE community_id = ? AND section_id <=> ?',
      [req.community.id, sectionId],
    );
    const uuid = uuidv4();
    await db.query(
      `INSERT INTO community_items
         (uuid, community_id, section_id, type, title, description, url, file_path, file_name, file_mime, file_size, position, created_by,
          ref_id, access, preview_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        uuid, req.community.id, sectionId, type, title,
        b.description ? String(b.description).slice(0, 20000) : null, url,
        req.file ? path.basename(req.file.path) : null,
        req.file ? Buffer.from(req.file.originalname, 'latin1').toString('utf8').slice(0, 255) : null,
        req.file ? req.file.mimetype : null,
        req.file ? req.file.size : null,
        next, req.user.id,
        refId, refAccess, wantsPreview ? 'pending' : 'none',
      ],
    );
    if (wantsPreview) {
      const [[row]] = await db.query('SELECT id FROM community_items WHERE uuid = ?', [uuid]);
      enqueuePreview(row.id, path.basename(req.file.path));
    }
    return R.created(res, { uuid, type, title });
  } catch (err) { discard(); return R.serverError(res, err); }
}

// PUT /communities/:id/items/:iid
async function updateItem(req, res) {
  try {
    const [rows] = await db.query('SELECT * FROM community_items WHERE uuid = ? AND community_id = ?', [req.params.iid, req.community.id]);
    if (!rows.length) return R.notFound(res, 'Item');
    const it = rows[0];
    const b = req.body || {};

    let url = it.url;
    if (b.url !== undefined && it.type === 'link') {
      const u = cleanUrl(b.url);
      if (u.error) return R.unprocessable(res, [{ field: 'url', message: u.error }]);
      url = u.value;
    }
    if (b.title !== undefined && !String(b.title).trim()) return R.unprocessable(res, [{ field: 'title', message: 'Obrigatório.' }]);
    let sectionId = it.section_id;
    if (b.section_id !== undefined) {
      if (!b.section_id) sectionId = null; else {
        const s = await sectionRow(req.community.id, b.section_id);
        if (!s) return R.notFound(res, 'Tópico');
        sectionId = s.id;
      }
    }
    let access = it.access;
    if (b.access !== undefined) {
      if (!ACCESS_VALUES.includes(b.access)) return R.unprocessable(res, [{ field: 'access', message: 'Use read ou edit.' }]);
      if (it.type === 'workflow') access = b.access;
    }
    // Mudou de tópico: vai para o fim do tópico de destino
    let position = it.position;
    if (sectionId !== it.section_id) {
      const [[{ next }]] = await db.query(
        'SELECT COALESCE(MAX(position), -1) + 1 AS next FROM community_items WHERE community_id = ? AND section_id <=> ?', [req.community.id, sectionId],
      );
      position = next;
    }
    await db.query(
      'UPDATE community_items SET title = ?, description = ?, url = ?, section_id = ?, is_visible = ?, access = ?, position = ? WHERE id = ?',
      [
        b.title !== undefined ? String(b.title).trim().slice(0, 255) : it.title,
        b.description !== undefined ? (b.description ? String(b.description).slice(0, 20000) : null) : it.description,
        url, sectionId,
        b.is_visible !== undefined ? (b.is_visible ? 1 : 0) : it.is_visible,
        access, position, it.id,
      ],
    );
    return R.ok(res, { message: 'Item atualizado.' });
  } catch (err) { return R.serverError(res, err); }
}

// PUT /communities/:id/items-order  { section_id?: uuid|null, order: [uuid, ...] }  — reordena os itens de um tópico
async function reorderItems(req, res) {
  try {
    const { section_id: sectionUuid, order } = req.body || {};
    if (!Array.isArray(order)) return R.unprocessable(res, [{ field: 'order', message: 'Informe a lista de itens.' }]);
    let sectionId = null;
    if (sectionUuid) {
      const s = await sectionRow(req.community.id, sectionUuid);
      if (!s) return R.notFound(res, 'Tópico');
      sectionId = s.id;
    }
    for (let i = 0; i < order.length; i += 1) {
      await db.query(
        'UPDATE community_items SET position = ? WHERE uuid = ? AND community_id = ? AND section_id <=> ?',
        [i, String(order[i]), req.community.id, sectionId],
      );
    }
    return R.ok(res, { message: 'Ordem atualizada.' });
  } catch (err) { return R.serverError(res, err); }
}

// DELETE /communities/:id/items/:iid
async function deleteItem(req, res) {
  try {
    const [rows] = await db.query('SELECT id, file_path, preview_path FROM community_items WHERE uuid = ? AND community_id = ?', [req.params.iid, req.community.id]);
    if (!rows.length) return R.notFound(res, 'Item');
    await db.query('DELETE FROM community_items WHERE id = ?', [rows[0].id]);
    removeStoredFile(rows[0].file_path);
    removeStoredFile(rows[0].preview_path);
    return R.noContent(res);
  } catch (err) { return R.serverError(res, err); }
}

// GET /communities/:id/items/:iid/file?download=1   (somente membros)
async function downloadItemFile(req, res) {
  try {
    const [rows] = await db.query(
      "SELECT * FROM community_items WHERE uuid = ? AND community_id = ? AND type = 'file'", [req.params.iid, req.community.id],
    );
    if (!rows.length || !rows[0].file_path) return R.notFound(res, 'Arquivo');
    const it = rows[0];
    if (rankOf(req.cRole) < RANK.moderator) {
      // item oculto, ou dentro de um tópico oculto, não é servido a membros comuns
      let hidden = !it.is_visible;
      if (!hidden && it.section_id) {
        const [[sec]] = await db.query('SELECT * FROM community_sections WHERE id = ?', [it.section_id]);
        hidden = !(await sectionVisibleTo(sec));
      }
      if (hidden) return R.notFound(res, 'Arquivo');
    }
    const full = path.join(storage.communities, path.basename(it.file_path));
    if (!fs.existsSync(full)) return R.notFound(res, 'Arquivo');

    // ?preview=1 -> PDF gerado a partir de PPT/DOC/XLS (quando a conversão terminou)
    if (req.query.preview === '1') {
      if (it.preview_status !== 'ready' || !it.preview_path) return R.notFound(res, 'Pré-visualização');
      const pfull = path.join(storage.communities, path.basename(it.preview_path));
      if (!fs.existsSync(pfull)) return R.notFound(res, 'Pré-visualização');
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(`${path.parse(it.file_name || 'arquivo').name}.pdf`)}`);
      return fs.createReadStream(pfull).pipe(res);
    }

    const inline = req.query.download !== '1' && (it.file_mime === 'application/pdf' || String(it.file_mime).startsWith('image/'));
    res.setHeader('Content-Type', it.file_mime || 'application/octet-stream');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader(
      'Content-Disposition',
      `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(it.file_name || 'arquivo')}`,
    );
    return fs.createReadStream(full).pipe(res);
  } catch (err) { return R.serverError(res, err); }
}

// ─── Chat ────────────────────────────────────────────────────────────────────

// GET /communities/:id/messages?limit=50&after=<uuid>
async function listMessages(req, res) {
  try {
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit || '50', 10) || 50));
    const params = [req.community.id];
    let afterSql = '';
    if (req.query.after) {
      const [a] = await db.query('SELECT id FROM messages WHERE uuid = ? AND community_id = ?', [req.query.after, req.community.id]);
      if (a.length) { afterSql = 'AND m.id > ?'; params.push(a[0].id); }
    }
    const [rows] = await db.query(
      `SELECT m.uuid, m.content, m.created_at, u.uuid AS user_uuid, u.name AS user_name, u.avatar_url AS user_avatar_url
         FROM messages m JOIN users u ON u.id = m.user_id
        WHERE m.community_id = ? AND m.deleted_at IS NULL ${afterSql}
        ORDER BY m.id DESC LIMIT ${limit}`,
      params,
    );
    return R.ok(res, rows.reverse());
  } catch (err) { return R.serverError(res, err); }
}

// POST /communities/:id/messages  { content }
async function sendMessage(req, res) {
  try {
    const content = String((req.body && req.body.content) || '').trim();
    if (!content) return R.unprocessable(res, [{ field: 'content', message: 'Obrigatório.' }]);
    if (content.length > 4000) return R.unprocessable(res, [{ field: 'content', message: 'Máximo 4000 caracteres.' }]);
    const uuid = uuidv4();
    await db.query(
      'INSERT INTO messages (uuid, community_id, user_id, content, created_at, updated_at) VALUES (?, ?, ?, ?, NOW(), NOW())',
      [uuid, req.community.id, req.user.id, content],
    );
    return R.created(res, {
      uuid, content, created_at: new Date().toISOString(),
      user_uuid: req.user.uuid,
    });
  } catch (err) { return R.serverError(res, err); }
}

// DELETE /communities/:id/messages/:mid  — autor ou moderador+
async function deleteMessage(req, res) {
  try {
    const [rows] = await db.query(
      'SELECT id, user_id FROM messages WHERE uuid = ? AND community_id = ? AND deleted_at IS NULL', [req.params.mid, req.community.id],
    );
    if (!rows.length) return R.notFound(res, 'Mensagem');
    if (rows[0].user_id !== req.user.id && rankOf(req.cRole) < RANK.moderator) return R.forbidden(res);
    await db.query('UPDATE messages SET deleted_at = NOW() WHERE id = ?', [rows[0].id]);
    return R.noContent(res);
  } catch (err) { return R.serverError(res, err); }
}

module.exports = {
  guard, itemUpload, reorderItems,
  listMyCommunities, listPublicCommunities, createCommunity, getCommunity, updateCommunity, deleteCommunity,
  joinPublic, leaveCommunity, transferOwnership,
  listInvites, createInvite, revokeInvite, previewInvite, joinWithCode,
  listMembers, updateMember, removeMember, listBans, removeBan,
  listCommunityProjects, linkProject, updateProjectLink, unlinkProject,
  listCommunityDatasets, shareDataset, removeDatasetShare,
  listCommunityWorkflows, shareWorkflow, removeWorkflowShare,
  getContent, createSection, updateSection, reorderSections, deleteSection,
  createItem, updateItem, deleteItem, downloadItemFile,
  listMessages, sendMessage, deleteMessage,
  parseJson,
};
