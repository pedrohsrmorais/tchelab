'use strict';

/**
 * Quadro da comunidade (gestão do lab, estilo monday): quadros → grupos → itens, com colunas personalizáveis.
 *
 *   estrutura (grupos, colunas, configurações, excluir quadro)  → moderator+
 *   conteúdo (criar/editar itens e células)                     → conforme `edit_policy` do quadro:
 *       staff   → só moderator+ (o responsável de um item ainda atualiza status/caixas do próprio item)
 *       own     → qualquer membro cria itens e edita os que criou ou em que é responsável
 *       members → qualquer membro cria e edita tudo
 *   comentários                                                 → qualquer membro
 *
 * Cada célula é gravada sozinha com JSON_SET — duas pessoas editando colunas diferentes do mesmo item não se
 * sobrescrevem. A coluna `people` vive em `board_item_people` (consulta rápida de "Minhas tarefas").
 */

const { v4: uuidv4 } = require('uuid');
const db = require('../config/db.config');
const R = require('../utils/response');
const cells = require('../services/boardCells.service');
const templates = require('../services/boardTemplates');

const RANK = { member: 1, moderator: 2, admin: 3, owner: 4 };
const isStaff = (req) => (RANK[req.cRole] || 0) >= RANK.moderator;
const POLICIES = ['staff', 'own', 'members'];
const LIMITS = { boards: 50, columns: 40, groups: 30, items: 5000 };
const GAP = 1024;

const fieldErr = (field, message) => ({ field, message });
const todayUtc = (req) => (cells.validDate(req.query?.today) ? req.query.today : new Date().toISOString().slice(0, 10));
const parseJson = (v, fb = null) => {
  if (v == null) return fb;
  if (typeof v === 'string') { try { return JSON.parse(v); } catch { return fb; } }
  return v;
};
const str = (v, max) => String(v ?? '').trim().slice(0, max);
const jpath = (uuid) => `$."${uuid}"`;

// ── carregamento ────────────────────────────────────────────────────────────
async function boardRow(req, conn = db, { forUpdate = false } = {}) {
  const [rows] = await conn.query(`SELECT * FROM boards WHERE uuid = ? AND community_id = ?${forUpdate ? ' FOR UPDATE' : ''}`, [req.params.bid, req.community.id]);
  return rows[0] || null;
}

const shapeColumn = (c) => ({ uuid: c.uuid, title: c.title, type: c.type, config: parseJson(c.config, {}) || {}, position: c.position, width: c.width, hidden: !!c.hidden });
const shapeGroup = (g) => ({ uuid: g.uuid, title: g.title, color: g.color, position: g.position });
const person = (u) => (u ? { uuid: u.uuid, name: u.name, initials: u.initials, avatar_url: u.avatar_url } : null);

async function loadColumns(boardId, conn = db) {
  const [rows] = await conn.query('SELECT * FROM board_columns WHERE board_id = ? ORDER BY position, id', [boardId]);
  return rows.map((r) => ({ ...shapeColumn(r), id: r.id }));
}

async function communityMembers(communityId) {
  const [rows] = await db.query(
    `SELECT u.id, u.uuid, u.name, u.initials, u.avatar_url, cm.role
       FROM community_members cm JOIN users u ON u.id = cm.user_id
      WHERE cm.community_id = ? AND u.deleted_at IS NULL ORDER BY u.name`, [communityId],
  );
  return rows;
}

/** Itens do quadro no formato da API (células + pessoas mescladas; `access` por item para o usuário atual). */
async function shapeItems(req, board, columns, rows) {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const colById = new Map(columns.map((c) => [c.id, c]));
  const [people] = await db.query(
    `SELECT p.item_id, p.column_id, u.uuid FROM board_item_people p
       JOIN users u ON u.id = p.user_id
       JOIN community_members cm ON cm.user_id = p.user_id AND cm.community_id = ?
      WHERE p.item_id IN (?) ORDER BY u.name`, [req.community.id, ids],
  );
  const [counts] = await db.query('SELECT item_id, COUNT(*) AS n FROM board_comments WHERE item_id IN (?) GROUP BY item_id', [ids]);
  const nComments = new Map(counts.map((c) => [c.item_id, c.n]));
  const [mine] = await db.query('SELECT DISTINCT item_id FROM board_item_people WHERE item_id IN (?) AND user_id = ?', [ids, req.user.id]);
  const assigned = new Set(mine.map((m) => m.item_id));
  const byItem = new Map();
  people.forEach((p) => {
    const col = colById.get(p.column_id); if (!col) return;
    if (!byItem.has(p.item_id)) byItem.set(p.item_id, {});
    const o = byItem.get(p.item_id); (o[col.uuid] = o[col.uuid] || []).push(p.uuid);
  });
  const creators = new Map();
  const cIds = [...new Set(rows.map((r) => r.created_by).filter(Boolean))];
  if (cIds.length) (await db.query('SELECT id, uuid, name, initials, avatar_url FROM users WHERE id IN (?)', [cIds]))[0].forEach((u) => creators.set(u.id, u));
  return rows.map((r) => {
    const base = parseJson(r.cells, {}) || {};
    const merged = { ...base, ...(byItem.get(r.id) || {}) };
    return {
      uuid: r.uuid, seq: r.seq, title: r.title, group: r.group_uuid, position: r.position, cells: merged,
      created_by: person(creators.get(r.created_by)), created_at: r.created_at, updated_at: r.updated_at,
      comments: nComments.get(r.id) || 0, access: accessLevel(req, board, r, assigned.has(r.id)),
    };
  });
}

/** 'all' | 'status' (só status/caixas) | 'none' */
function accessLevel(req, board, item, assigned) {
  if (isStaff(req)) return 'all';
  if (board.edit_policy === 'members') return 'all';
  if (board.edit_policy === 'own') return item.created_by === req.user.id || assigned ? 'all' : 'none';
  return assigned ? 'status' : 'none';
}
const canCreate = (req, board) => isStaff(req) || board.edit_policy !== 'staff';
const canDeleteItem = (req, board, item) => isStaff(req) || (board.edit_policy !== 'staff' && item.created_by === req.user.id);

const ITEM_SELECT = `SELECT i.*, g.uuid AS group_uuid FROM board_items i JOIN board_groups g ON g.id = i.group_id`;

async function itemRow(req, board, conn = db, { forUpdate = false } = {}) {
  const [rows] = await conn.query(`${ITEM_SELECT} WHERE i.uuid = ? AND i.board_id = ?${forUpdate ? ' FOR UPDATE' : ''}`, [req.params.iid, board.id]);
  return rows[0] || null;
}
async function isAssigned(itemId, userId, conn = db) {
  const [r] = await conn.query('SELECT 1 FROM board_item_people WHERE item_id = ? AND user_id = ? LIMIT 1', [itemId, userId]);
  return r.length > 0;
}
async function accessOf(req, board, item) { return accessLevel(req, board, item, await isAssigned(item.id, req.user.id)); }

async function log(conn, boardId, itemId, userId, kind, columnId, data) {
  await conn.query('INSERT INTO board_activity (board_id, item_id, user_id, kind, column_id, data) VALUES (?,?,?,?,?,?)',
    [boardId, itemId, userId, kind, columnId || null, data ? JSON.stringify(data) : null]);
}

async function withTxPlain(fn) {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const out = await fn(conn);
    await conn.commit();
    return out;
  } catch (e) { try { await conn.rollback(); } catch { /* ignore */ } throw e; } finally { conn.release(); }
}

/**
 * Transação sobre um quadro: a PRIMEIRA instrução trava a linha do quadro (e já incrementa `rev`). Assim todas as
 * escritas do mesmo quadro seguem a mesma ordem de travas (quadro → item → demais), sem deadlock por FK
 * (INSERT em tabela filha pede lock compartilhado no pai e depois tentaria promovê-lo a exclusivo).
 */
const txBoard = (boardId, fn) => withTxPlain(async (conn) => {
  await conn.query('UPDATE boards SET rev = rev + 1 WHERE id = ?', [boardId]);
  return fn(conn);
});

async function nextPosition(conn, table, where, params, col = 'position') {
  const [[r]] = await conn.query(`SELECT COALESCE(MAX(${col}), -1) AS m FROM ${table} WHERE ${where}`, params);
  return Number(r.m) + 1;
}

async function renumberGroupItems(conn, groupId) {
  const [rows] = await conn.query('SELECT id FROM board_items WHERE group_id = ? ORDER BY position, id', [groupId]);
  for (let i = 0; i < rows.length; i += 1) await conn.query('UPDATE board_items SET position = ? WHERE id = ?', [(i + 1) * GAP, rows[i].id]);
}

// ── quadros ─────────────────────────────────────────────────────────────────
// GET /communities/:id/boards
async function listBoards(req, res) {
  try {
    const [boards] = await db.query('SELECT * FROM boards WHERE community_id = ? ORDER BY position, id', [req.community.id]);
    if (!boards.length) return R.ok(res, []);
    const ids = boards.map((b) => b.id);
    const [cols] = await db.query('SELECT * FROM board_columns WHERE board_id IN (?) ORDER BY position, id', [ids]);
    const [items] = await db.query('SELECT id, board_id, cells, created_by FROM board_items WHERE board_id IN (?)', [ids]);
    const [mineRows] = await db.query(
      `SELECT DISTINCT p.item_id, i.board_id FROM board_item_people p JOIN board_items i ON i.id = p.item_id WHERE i.board_id IN (?) AND p.user_id = ?`, [ids, req.user.id],
    );
    const mine = new Map();
    mineRows.forEach((m) => mine.set(m.board_id, (mine.get(m.board_id) || 0) + 1));
    const today = todayUtc(req);
    const out = boards.map((b) => {
      const bc = cols.filter((c) => c.board_id === b.id).map(shapeColumn);
      const bi = items.filter((i) => i.board_id === b.id).map((i) => ({ cells: parseJson(i.cells, {}) }));
      return {
        uuid: b.uuid, title: b.title, description: b.description, color: b.color, edit_policy: b.edit_policy, updated_at: b.updated_at,
        ...cells.summarize(bc, bi, today), mine: mine.get(b.id) || 0,
        can_create: canCreate(req, b),
      };
    });
    return R.ok(res, out);
  } catch (err) { return R.serverError(res, err); }
}

// POST /communities/:id/boards  { title, description?, template?, lang?, color?, edit_policy? }
async function createBoard(req, res) {
  try {
    const b = req.body || {};
    const title = str(b.title, 150);
    const errors = [];
    if (!title) errors.push(fieldErr('title', 'Informe o título.'));
    const template = b.template || 'blank';
    if (!templates.TEMPLATES.includes(template)) errors.push(fieldErr('template', 'Modelo inválido.'));
    const policy = b.edit_policy || 'members';
    if (!POLICIES.includes(policy)) errors.push(fieldErr('edit_policy', 'Inválido.'));
    if (errors.length) return R.unprocessable(res, errors);
    const [[{ n }]] = await db.query('SELECT COUNT(*) AS n FROM boards WHERE community_id = ?', [req.community.id]);
    if (n >= LIMITS.boards) return R.unprocessable(res, [fieldErr('title', `No máximo ${LIMITS.boards} quadros por comunidade.`)]);

    const uuid = uuidv4();
    const spec = templates.build(template, b.lang);
    await withTxPlain(async (conn) => {
      const pos = await nextPosition(conn, 'boards', 'community_id = ?', [req.community.id]);
      const [ins] = await conn.query(
        'INSERT INTO boards (uuid, community_id, title, description, color, edit_policy, position, created_by) VALUES (?,?,?,?,?,?,?,?)',
        [uuid, req.community.id, title, b.description ? str(b.description, 5000) : null, cells.COLOR_RE.test(b.color || '') ? b.color : '#579bfc', policy, pos, req.user.id],
      );
      const boardId = ins.insertId;
      const groupIds = [];
      for (let i = 0; i < spec.groups.length; i += 1) {
        const [g] = await conn.query('INSERT INTO board_groups (uuid, board_id, title, color, position) VALUES (?,?,?,?,?)',
          [uuidv4(), boardId, spec.groups[i], templates.GROUP_COLORS[i % templates.GROUP_COLORS.length], i]);
        groupIds.push(g.insertId);
      }
      const colUuids = [];
      for (let i = 0; i < spec.columns.length; i += 1) {
        const c = spec.columns[i]; const cu = uuidv4(); colUuids.push(cu);
        await conn.query('INSERT INTO board_columns (uuid, board_id, title, type, config, position, width) VALUES (?,?,?,?,?,?,?)',
          [cu, boardId, c.title, c.type, JSON.stringify(c.config), i, c.width]);
      }
      if (spec.example) {
        const [s] = await conn.query('UPDATE boards SET next_seq = LAST_INSERT_ID(next_seq) + 1 WHERE id = ?', [boardId]);
        const [[{ seq }]] = await conn.query('SELECT LAST_INSERT_ID() AS seq');
        void s;
        await conn.query('INSERT INTO board_items (uuid, board_id, group_id, seq, title, cells, position, created_by) VALUES (?,?,?,?,?,?,?,?)',
          [uuidv4(), boardId, groupIds[spec.example.group], seq, spec.example.title, '{}', GAP, req.user.id]);
      }
      await log(conn, boardId, null, req.user.id, 'board_created', null, { title });
    });
    return R.created(res, { uuid });
  } catch (err) { return R.serverError(res, err); }
}

// GET /communities/:id/boards/:bid[?rev=N]
async function getBoard(req, res) {
  try {
    const board = await boardRow(req);
    if (!board) return R.notFound(res, 'Quadro');
    if (req.query.rev && Number(req.query.rev) === board.rev) return R.ok(res, { unchanged: true, rev: board.rev });
    const [groups] = await db.query('SELECT * FROM board_groups WHERE board_id = ? ORDER BY position, id', [board.id]);
    const columns = await loadColumns(board.id);
    const [rows] = await db.query(`${ITEM_SELECT} WHERE i.board_id = ? ORDER BY i.position, i.id`, [board.id]);
    const items = await shapeItems(req, board, columns, rows);
    const members = await communityMembers(req.community.id);
    return R.ok(res, {
      board: { uuid: board.uuid, title: board.title, description: board.description, color: board.color, edit_policy: board.edit_policy, rev: board.rev, created_at: board.created_at },
      permissions: { structure: isStaff(req), create: canCreate(req, board) },
      groups: groups.map(shapeGroup),
      columns: columns.map(({ id, ...c }) => c),
      items,
      members: members.map((m) => ({ uuid: m.uuid, name: m.name, initials: m.initials, avatar_url: m.avatar_url, role: m.role })),
    });
  } catch (err) { return R.serverError(res, err); }
}

// PUT /communities/:id/boards/:bid
async function updateBoard(req, res) {
  try {
    const board = await boardRow(req);
    if (!board) return R.notFound(res, 'Quadro');
    const b = req.body || {}; const f = {}; const errors = [];
    if (b.title !== undefined) { const t = str(b.title, 150); if (!t) errors.push(fieldErr('title', 'Informe o título.')); else f.title = t; }
    if (b.description !== undefined) f.description = b.description ? str(b.description, 5000) : null;
    if (b.color !== undefined) { if (cells.COLOR_RE.test(b.color || '')) f.color = b.color; else errors.push(fieldErr('color', 'Cor inválida.')); }
    if (b.edit_policy !== undefined) { if (POLICIES.includes(b.edit_policy)) f.edit_policy = b.edit_policy; else errors.push(fieldErr('edit_policy', 'Inválido.')); }
    if (errors.length) return R.unprocessable(res, errors);
    if (Object.keys(f).length) {
      await txBoard(board.id, async (conn) => {
        await conn.query(`UPDATE boards SET ${Object.keys(f).map((k) => `${k} = ?`).join(', ')}, rev = rev + 1 WHERE id = ?`, [...Object.values(f), board.id]);
      });
    }
    return R.ok(res, { uuid: board.uuid, ...f });
  } catch (err) { return R.serverError(res, err); }
}

// DELETE /communities/:id/boards/:bid
async function deleteBoard(req, res) {
  try {
    const board = await boardRow(req);
    if (!board) return R.notFound(res, 'Quadro');
    await db.query('DELETE FROM boards WHERE id = ?', [board.id]);
    return R.noContent(res);
  } catch (err) { return R.serverError(res, err); }
}

// POST /communities/:id/boards/reorder { order: [uuid] }
async function reorderBoards(req, res) {
  try {
    const order = req.body?.order;
    if (!Array.isArray(order)) return R.unprocessable(res, [fieldErr('order', 'Informe a ordem.')]);
    const [rows] = await db.query('SELECT id, uuid FROM boards WHERE community_id = ?', [req.community.id]);
    const byUuid = new Map(rows.map((r) => [r.uuid, r.id]));
    await withTxPlain(async (conn) => {
      let p = 0;
      for (const u of order) if (byUuid.has(u)) { await conn.query('UPDATE boards SET position = ? WHERE id = ?', [p, byUuid.get(u)]); p += 1; }
    });
    return R.ok(res, { ok: true });
  } catch (err) { return R.serverError(res, err); }
}

// ── grupos ──────────────────────────────────────────────────────────────────
async function groupRow(req, board) {
  const [r] = await db.query('SELECT * FROM board_groups WHERE uuid = ? AND board_id = ?', [req.params.gid, board.id]);
  return r[0] || null;
}

// POST …/groups { title, color? }
async function createGroup(req, res) {
  try {
    const board = await boardRow(req);
    if (!board) return R.notFound(res, 'Quadro');
    const title = str(req.body?.title, 150);
    if (!title) return R.unprocessable(res, [fieldErr('title', 'Informe o título.')]);
    const [[{ n }]] = await db.query('SELECT COUNT(*) AS n FROM board_groups WHERE board_id = ?', [board.id]);
    if (n >= LIMITS.groups) return R.unprocessable(res, [fieldErr('title', `No máximo ${LIMITS.groups} grupos.`)]);
    const uuid = uuidv4();
    await txBoard(board.id, async (conn) => {
      const pos = await nextPosition(conn, 'board_groups', 'board_id = ?', [board.id]);
      const color = cells.COLOR_RE.test(req.body?.color || '') ? req.body.color : templates.GROUP_COLORS[n % templates.GROUP_COLORS.length];
      await conn.query('INSERT INTO board_groups (uuid, board_id, title, color, position) VALUES (?,?,?,?,?)', [uuid, board.id, title, color, pos]);
      await log(conn, board.id, null, req.user.id, 'group_created', null, { title });
    });
    return R.created(res, { uuid });
  } catch (err) { return R.serverError(res, err); }
}

// PUT …/groups/:gid { title?, color? }
async function updateGroup(req, res) {
  try {
    const board = await boardRow(req);
    if (!board) return R.notFound(res, 'Quadro');
    const g = await groupRow(req, board);
    if (!g) return R.notFound(res, 'Grupo');
    const b = req.body || {}; const f = {};
    if (b.title !== undefined) { const t = str(b.title, 150); if (!t) return R.unprocessable(res, [fieldErr('title', 'Informe o título.')]); f.title = t; }
    if (b.color !== undefined) { if (!cells.COLOR_RE.test(b.color || '')) return R.unprocessable(res, [fieldErr('color', 'Cor inválida.')]); f.color = b.color; }
    if (Object.keys(f).length) {
      await txBoard(board.id, async (conn) => {
        await conn.query(`UPDATE board_groups SET ${Object.keys(f).map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, [...Object.values(f), g.id]);
      });
    }
    return R.ok(res, { uuid: g.uuid, ...f });
  } catch (err) { return R.serverError(res, err); }
}

// DELETE …/groups/:gid  (body { confirm: true } se houver itens)
async function deleteGroup(req, res) {
  try {
    const board = await boardRow(req);
    if (!board) return R.notFound(res, 'Quadro');
    const g = await groupRow(req, board);
    if (!g) return R.notFound(res, 'Grupo');
    const [[{ total }]] = await db.query('SELECT COUNT(*) AS total FROM board_groups WHERE board_id = ?', [board.id]);
    if (total <= 1) return R.unprocessable(res, [fieldErr('group', 'O quadro precisa ter ao menos um grupo.')]);
    const [[{ n }]] = await db.query('SELECT COUNT(*) AS n FROM board_items WHERE group_id = ?', [g.id]);
    if (n && req.body?.confirm !== true) return R.error(res, 409, 'HAS_ITEMS', 'O grupo tem itens; eles serão excluídos junto.', { items: n });
    await txBoard(board.id, async (conn) => {
      await conn.query('DELETE FROM board_groups WHERE id = ?', [g.id]);
      await log(conn, board.id, null, req.user.id, 'group_deleted', null, { title: g.title, items: n });
    });
    return R.noContent(res);
  } catch (err) { return R.serverError(res, err); }
}

async function reorderBy(req, res, table, { extraWhere = '' } = {}) {
  const board = await boardRow(req);
  if (!board) return R.notFound(res, 'Quadro');
  const order = req.body?.order;
  if (!Array.isArray(order)) return R.unprocessable(res, [fieldErr('order', 'Informe a ordem.')]);
  const [rows] = await db.query(`SELECT id, uuid FROM ${table} WHERE board_id = ? ${extraWhere}`, [board.id]);
  const byUuid = new Map(rows.map((r) => [r.uuid, r.id]));
  const listed = order.filter((u) => byUuid.has(u));
  const rest = rows.filter((r) => !listed.includes(r.uuid)).map((r) => r.uuid);
  await txBoard(board.id, async (conn) => {
    let p = 0;
    for (const u of [...listed, ...rest]) { await conn.query(`UPDATE ${table} SET position = ? WHERE id = ?`, [p, byUuid.get(u)]); p += 1; }
  });
  return R.ok(res, { ok: true });
}
const reorderGroups = (req, res) => reorderBy(req, res, 'board_groups').catch((e) => R.serverError(res, e));
const reorderColumns = (req, res) => reorderBy(req, res, 'board_columns').catch((e) => R.serverError(res, e));

// ── colunas ─────────────────────────────────────────────────────────────────
async function columnRow(req, board) {
  const [r] = await db.query('SELECT * FROM board_columns WHERE uuid = ? AND board_id = ?', [req.params.cid, board.id]);
  return r[0] || null;
}

// POST …/columns { title, type, config?, lang? }
async function createColumn(req, res) {
  try {
    const board = await boardRow(req);
    if (!board) return R.notFound(res, 'Quadro');
    const b = req.body || {};
    const title = str(b.title, 100);
    const errors = [];
    if (!title) errors.push(fieldErr('title', 'Informe o nome da coluna.'));
    if (!cells.TYPES.includes(b.type)) errors.push(fieldErr('type', 'Tipo de coluna inválido.'));
    let config = null;
    if (!errors.length) {
      if (b.config) { const c = cells.cleanConfig(b.type, b.config); if (c.error) errors.push(fieldErr('config', c.error)); else config = c.value; } else config = cells.defaultConfig(b.type, b.lang);
    }
    if (errors.length) return R.unprocessable(res, errors);
    const [[{ n }]] = await db.query('SELECT COUNT(*) AS n FROM board_columns WHERE board_id = ?', [board.id]);
    if (n >= LIMITS.columns) return R.unprocessable(res, [fieldErr('title', `No máximo ${LIMITS.columns} colunas.`)]);
    const uuid = uuidv4();
    await txBoard(board.id, async (conn) => {
      const pos = await nextPosition(conn, 'board_columns', 'board_id = ?', [board.id]);
      await conn.query('INSERT INTO board_columns (uuid, board_id, title, type, config, position, width) VALUES (?,?,?,?,?,?,?)',
        [uuid, board.id, title, b.type, JSON.stringify(config), pos, b.type === 'timeline' ? 190 : 150]);
      await log(conn, board.id, null, req.user.id, 'column_created', null, { title, type: b.type });
    });
    const [rows] = await db.query('SELECT * FROM board_columns WHERE uuid = ?', [uuid]);
    return R.created(res, shapeColumn(rows[0]));
  } catch (err) { return R.serverError(res, err); }
}

/** Itens que usam algum dos ids de rótulo/opção dados nesta coluna. */
async function itemsUsing(boardId, col, ids) {
  if (!ids.length) return [];
  const [rows] = await db.query('SELECT id, cells FROM board_items WHERE board_id = ?', [boardId]);
  const set = new Set(ids);
  return rows.filter((r) => {
    const v = (parseJson(r.cells, {}) || {})[col.uuid];
    if (v === undefined || v === null) return false;
    return Array.isArray(v) ? v.some((x) => set.has(x)) : set.has(v);
  }).map((r) => r.id);
}

// PUT …/columns/:cid { title?, config?, width?, hidden?, type?, remap?, confirm? }
async function updateColumn(req, res) {
  try {
    const board = await boardRow(req);
    if (!board) return R.notFound(res, 'Quadro');
    const col = await columnRow(req, board);
    if (!col) return R.notFound(res, 'Coluna');
    const b = req.body || {}; const f = {}; const errors = [];
    const cur = shapeColumn(col);
    if (b.title !== undefined) { const t = str(b.title, 100); if (!t) errors.push(fieldErr('title', 'Informe o nome.')); else f.title = t; }
    if (b.width !== undefined) { const w = Number(b.width); if (Number.isInteger(w) && w >= 60 && w <= 700) f.width = w; else errors.push(fieldErr('width', 'Largura inválida.')); }
    if (b.hidden !== undefined) f.hidden = b.hidden ? 1 : 0;

    let newType = cur.type; let typeChanged = false;
    if (b.type !== undefined && b.type !== cur.type) {
      if (!cells.TYPES.includes(b.type)) errors.push(fieldErr('type', 'Tipo inválido.')); else { newType = b.type; typeChanged = true; }
    }
    let newConfig = cur.config; let configChanged = false; let removedIds = [];
    if (typeChanged) { newConfig = b.config ? null : cells.defaultConfig(newType, b.lang); configChanged = true; }
    if (b.config !== undefined) {
      const c = cells.cleanConfig(newType, b.config);
      if (c.error) errors.push(fieldErr('config', c.error)); else { newConfig = c.value; configChanged = true; }
    }
    if (errors.length) return R.unprocessable(res, errors);

    let clearAll = false; let remap = {};
    if (typeChanged) {
      const used = await itemsWithValue(board.id, cur);
      if (used.length && b.confirm !== true) return R.error(res, 409, 'HAS_VALUES', 'Mudar o tipo apaga os valores já preenchidos nesta coluna.', { items: used.length });
      clearAll = used.length > 0;
    } else if (configChanged && (cur.type === 'status' || cur.type === 'dropdown')) {
      const before = cells.labelsOf(cur).map((l) => l.id); const after = new Set(cells.labelsOf({ type: cur.type, config: newConfig }).map((l) => l.id));
      removedIds = before.filter((id) => !after.has(id));
      const using = await itemsUsing(board.id, cur, removedIds);
      if (using.length && b.confirm !== true) return R.error(res, 409, 'LABEL_IN_USE', 'Há itens usando rótulos que serão removidos.', { items: using.length, removed: removedIds });
      if (b.remap && typeof b.remap === 'object') {
        Object.entries(b.remap).forEach(([from, to]) => { if (removedIds.includes(from) && after.has(to)) remap[from] = to; });
      }
    }
    await txBoard(board.id, async (conn) => {
      const sets = { ...f };
      if (typeChanged) sets.type = newType;
      if (configChanged) sets.config = JSON.stringify(newConfig);
      if (Object.keys(sets).length) await conn.query(`UPDATE board_columns SET ${Object.keys(sets).map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, [...Object.values(sets), col.id]);
      if (clearAll) {
        await conn.query('UPDATE board_items SET cells = JSON_REMOVE(COALESCE(cells, \'{}\'), ?) WHERE board_id = ?', [jpath(col.uuid), board.id]);
        await conn.query('DELETE FROM board_item_people WHERE column_id = ?', [col.id]);
      } else if (removedIds.length) {
        const [rows] = await conn.query('SELECT id, cells FROM board_items WHERE board_id = ?', [board.id]);
        for (const r of rows) {
          const cs = parseJson(r.cells, {}) || {}; const v = cs[col.uuid];
          if (v === undefined || v === null) continue;
          let nv = v;
          if (Array.isArray(v)) { nv = [...new Set(v.map((x) => remap[x] || x).filter((x) => !removedIds.includes(x)))]; if (!nv.length) nv = null; } else if (removedIds.includes(v)) nv = remap[v] || null;
          if (JSON.stringify(nv) === JSON.stringify(v)) continue;
          if (nv === null) await conn.query('UPDATE board_items SET cells = JSON_REMOVE(cells, ?) WHERE id = ?', [jpath(col.uuid), r.id]);
          else await conn.query('UPDATE board_items SET cells = JSON_SET(cells, ?, JSON_EXTRACT(?, \'$\')) WHERE id = ?', [jpath(col.uuid), JSON.stringify(nv), r.id]);
        }
      }
      if (f.title && f.title !== col.title) await log(conn, board.id, null, req.user.id, 'column_renamed', col.id, { old: col.title, new: f.title });
    });
    const [rows] = await db.query('SELECT * FROM board_columns WHERE id = ?', [col.id]);
    return R.ok(res, shapeColumn(rows[0]));
  } catch (err) { return R.serverError(res, err); }
}

async function itemsWithValue(boardId, col) {
  if (col.type === 'people') {
    const [r] = await db.query('SELECT DISTINCT item_id FROM board_item_people WHERE column_id = (SELECT id FROM board_columns WHERE uuid = ?)', [col.uuid]);
    return r.map((x) => x.item_id);
  }
  const [rows] = await db.query('SELECT id, cells FROM board_items WHERE board_id = ?', [boardId]);
  return rows.filter((r) => { const v = (parseJson(r.cells, {}) || {})[col.uuid]; return v !== undefined && v !== null; }).map((r) => r.id);
}

// DELETE …/columns/:cid  (body { confirm: true } se houver valores)
async function deleteColumn(req, res) {
  try {
    const board = await boardRow(req);
    if (!board) return R.notFound(res, 'Quadro');
    const col = await columnRow(req, board);
    if (!col) return R.notFound(res, 'Coluna');
    const used = await itemsWithValue(board.id, shapeColumn(col));
    if (used.length && req.body?.confirm !== true) return R.error(res, 409, 'HAS_VALUES', 'Os valores desta coluna serão apagados.', { items: used.length });
    await txBoard(board.id, async (conn) => {
      await conn.query('UPDATE board_items SET cells = JSON_REMOVE(COALESCE(cells, \'{}\'), ?) WHERE board_id = ?', [jpath(col.uuid), board.id]);
      await conn.query('DELETE FROM board_columns WHERE id = ?', [col.id]);
      await log(conn, board.id, null, req.user.id, 'column_deleted', null, { title: col.title });
    });
    return R.noContent(res);
  } catch (err) { return R.serverError(res, err); }
}

// ── itens ───────────────────────────────────────────────────────────────────
async function allocSeq(conn, boardId) {
  await conn.query('UPDATE boards SET next_seq = LAST_INSERT_ID(next_seq) + 1 WHERE id = ?', [boardId]);
  const [[{ seq }]] = await conn.query('SELECT LAST_INSERT_ID() AS seq');
  return seq;
}

/** Aplica valores iniciais (criação/duplicação) respeitando as colunas. Retorna erros de validação. */
async function validateCells(req, board, columns, values) {
  const out = []; const errors = [];
  const members = await communityMembers(req.community.id);
  const byUuid = new Map(members.map((m) => [m.uuid, m]));
  for (const [cu, v] of Object.entries(values || {})) {
    const col = columns.find((c) => c.uuid === cu);
    if (!col) { errors.push(fieldErr(cu, 'Coluna inexistente.')); continue; }
    const c = cells.cleanCell(col, v);
    if (c.error) { errors.push(fieldErr(col.title, c.error)); continue; }
    if (col.type === 'people') {
      const bad = (c.value || []).filter((u) => !byUuid.has(u));
      if (bad.length) { errors.push(fieldErr(col.title, 'Só membros da comunidade podem ser responsáveis.')); continue; }
      out.push({ col, value: c.value, ids: (c.value || []).map((u) => byUuid.get(u).id) });
    } else out.push({ col, value: c.value });
  }
  return { out, errors };
}

async function writeCells(conn, itemId, list) {
  for (const { col, value, ids } of list) {
    if (col.type === 'people') {
      await conn.query('DELETE FROM board_item_people WHERE item_id = ? AND column_id = ?', [itemId, col.id]);
      for (const uid of ids) await conn.query('INSERT IGNORE INTO board_item_people (item_id, column_id, user_id) VALUES (?,?,?)', [itemId, col.id, uid]);
    } else if (value === null) {
      await conn.query('UPDATE board_items SET cells = JSON_REMOVE(COALESCE(cells, \'{}\'), ?) WHERE id = ?', [jpath(col.uuid), itemId]);
    } else {
      await conn.query('UPDATE board_items SET cells = JSON_SET(COALESCE(cells, \'{}\'), ?, JSON_EXTRACT(?, \'$\')) WHERE id = ?', [jpath(col.uuid), JSON.stringify(value), itemId]);
    }
  }
}

// POST …/items { title, group?, cells?, top? }
async function createItem(req, res) {
  try {
    const board = await boardRow(req);
    if (!board) return R.notFound(res, 'Quadro');
    if (!canCreate(req, board)) return R.forbidden(res, 'Neste quadro só a equipe cria itens.');
    const b = req.body || {};
    const title = str(b.title, 300);
    if (!title) return R.unprocessable(res, [fieldErr('title', 'Informe o título.')]);
    const [groups] = await db.query('SELECT * FROM board_groups WHERE board_id = ? ORDER BY position, id', [board.id]);
    const group = b.group ? groups.find((g) => g.uuid === b.group) : groups[0];
    if (!group) return R.unprocessable(res, [fieldErr('group', 'Grupo inexistente.')]);
    const [[{ n }]] = await db.query('SELECT COUNT(*) AS n FROM board_items WHERE board_id = ?', [board.id]);
    if (n >= LIMITS.items) return R.unprocessable(res, [fieldErr('title', `No máximo ${LIMITS.items} itens por quadro.`)]);
    const columns = await loadColumns(board.id);
    const v = await validateCells(req, board, columns, b.cells);
    if (v.errors.length) return R.unprocessable(res, v.errors);
    const uuid = uuidv4();
    await txBoard(board.id, async (conn) => {
      const seq = await allocSeq(conn, board.id);
      const [[m]] = await conn.query('SELECT MIN(position) AS lo, MAX(position) AS hi FROM board_items WHERE group_id = ?', [group.id]);
      const pos = b.top ? (m.lo == null ? GAP : Number(m.lo) - GAP) : (m.hi == null ? GAP : Number(m.hi) + GAP);
      const [ins] = await conn.query('INSERT INTO board_items (uuid, board_id, group_id, seq, title, cells, position, created_by) VALUES (?,?,?,?,?,?,?,?)',
        [uuid, board.id, group.id, seq, title, '{}', pos, req.user.id]);
      await writeCells(conn, ins.insertId, v.out);
      await log(conn, board.id, ins.insertId, req.user.id, 'item_created', null, { title });
    });
    const item = await itemRow({ ...req, params: { ...req.params, iid: uuid } }, board);
    const [shaped] = await shapeItems(req, board, columns, [item]);
    return R.created(res, shaped);
  } catch (err) { return R.serverError(res, err); }
}

// PUT …/items/:iid { title }
async function updateItem(req, res) {
  try {
    const board = await boardRow(req);
    if (!board) return R.notFound(res, 'Quadro');
    const item = await itemRow(req, board);
    if (!item) return R.notFound(res, 'Item');
    if ((await accessOf(req, board, item)) !== 'all') return R.forbidden(res, 'Você não pode editar este item.');
    const title = str(req.body?.title, 300);
    if (!title) return R.unprocessable(res, [fieldErr('title', 'Informe o título.')]);
    if (title !== item.title) {
      await txBoard(board.id, async (conn) => {
        await conn.query('UPDATE board_items SET title = ? WHERE id = ?', [title, item.id]);
        await log(conn, board.id, item.id, req.user.id, 'renamed', null, { old: item.title, new: title });
      });
    }
    return R.ok(res, { uuid: item.uuid, title });
  } catch (err) { return R.serverError(res, err); }
}

// DELETE …/items/:iid
async function deleteItem(req, res) {
  try {
    const board = await boardRow(req);
    if (!board) return R.notFound(res, 'Quadro');
    const item = await itemRow(req, board);
    if (!item) return R.notFound(res, 'Item');
    if (!canDeleteItem(req, board, item)) return R.forbidden(res, 'Só a equipe ou quem criou o item pode excluí-lo.');
    await txBoard(board.id, async (conn) => {
      await conn.query('DELETE FROM board_items WHERE id = ?', [item.id]);
      await log(conn, board.id, item.id, req.user.id, 'item_deleted', null, { title: item.title });
    });
    return R.noContent(res);
  } catch (err) { return R.serverError(res, err); }
}

// POST …/items/:iid/move { group, before? }  — muda de grupo e/ou posição
async function moveItem(req, res) {
  try {
    const board = await boardRow(req);
    if (!board) return R.notFound(res, 'Quadro');
    const item = await itemRow(req, board);
    if (!item) return R.notFound(res, 'Item');
    if ((await accessOf(req, board, item)) !== 'all') return R.forbidden(res, 'Você não pode mover este item.');
    const b = req.body || {};
    const [gr] = await db.query('SELECT * FROM board_groups WHERE uuid = ? AND board_id = ?', [b.group || item.group_uuid, board.id]);
    const group = gr[0];
    if (!group) return R.unprocessable(res, [fieldErr('group', 'Grupo inexistente.')]);
    await txBoard(board.id, async (conn) => {
      const [sibs] = await conn.query('SELECT id, uuid, position FROM board_items WHERE group_id = ? AND id <> ? ORDER BY position, id', [group.id, item.id]);
      let pos;
      const idx = b.before ? sibs.findIndex((s) => s.uuid === b.before) : -1;
      if (idx >= 0) {
        const hi = Number(sibs[idx].position); const lo = idx > 0 ? Number(sibs[idx - 1].position) : hi - 2 * GAP;
        pos = (lo + hi) / 2;
      } else pos = sibs.length ? Number(sibs[sibs.length - 1].position) + GAP : GAP;
      await conn.query('UPDATE board_items SET group_id = ?, position = ? WHERE id = ?', [group.id, pos, item.id]);
      if (idx > 0 && Math.abs(Number(sibs[idx].position) - Number(sibs[idx - 1].position)) < 1e-4) await renumberGroupItems(conn, group.id);
      if (group.id !== item.group_id) {
        const [[og]] = await conn.query('SELECT title FROM board_groups WHERE id = ?', [item.group_id]);
        await log(conn, board.id, item.id, req.user.id, 'moved', null, { from: og?.title, to: group.title });
      }
    });
    return R.ok(res, { uuid: item.uuid, group: group.uuid });
  } catch (err) { return R.serverError(res, err); }
}

// POST …/items/:iid/duplicate
async function duplicateItem(req, res) {
  try {
    const board = await boardRow(req);
    if (!board) return R.notFound(res, 'Quadro');
    if (!canCreate(req, board)) return R.forbidden(res, 'Neste quadro só a equipe cria itens.');
    const item = await itemRow(req, board);
    if (!item) return R.notFound(res, 'Item');
    const [[{ n }]] = await db.query('SELECT COUNT(*) AS n FROM board_items WHERE board_id = ?', [board.id]);
    if (n >= LIMITS.items) return R.unprocessable(res, [fieldErr('title', `No máximo ${LIMITS.items} itens por quadro.`)]);
    const uuid = uuidv4();
    await txBoard(board.id, async (conn) => {
      const seq = await allocSeq(conn, board.id);
      const [next] = await conn.query('SELECT position FROM board_items WHERE group_id = ? AND position > ? ORDER BY position LIMIT 1', [item.group_id, item.position]);
      const pos = next.length ? (Number(item.position) + Number(next[0].position)) / 2 : Number(item.position) + GAP;
      const [ins] = await conn.query('INSERT INTO board_items (uuid, board_id, group_id, seq, title, cells, position, created_by) VALUES (?,?,?,?,?,?,?,?)',
        [uuid, board.id, item.group_id, seq, item.title, typeof item.cells === 'string' ? item.cells : JSON.stringify(item.cells || {}), pos, req.user.id]);
      await conn.query('INSERT INTO board_item_people (item_id, column_id, user_id) SELECT ?, column_id, user_id FROM board_item_people WHERE item_id = ?', [ins.insertId, item.id]);
      await log(conn, board.id, ins.insertId, req.user.id, 'item_created', null, { title: item.title, copy_of: item.seq });
    });
    return R.created(res, { uuid });
  } catch (err) { return R.serverError(res, err); }
}

// POST …/items/bulk { items: [uuid], action: 'delete' | 'move', group? }
async function bulkItems(req, res) {
  try {
    const board = await boardRow(req);
    if (!board) return R.notFound(res, 'Quadro');
    const b = req.body || {};
    if (!Array.isArray(b.items) || !b.items.length || b.items.length > 500) return R.unprocessable(res, [fieldErr('items', 'Informe de 1 a 500 itens.')]);
    if (!['delete', 'move'].includes(b.action)) return R.unprocessable(res, [fieldErr('action', 'Ação inválida.')]);
    const [rows] = await db.query(`${ITEM_SELECT} WHERE i.board_id = ? AND i.uuid IN (?)`, [board.id, b.items]);
    let group = null;
    if (b.action === 'move') {
      const [g] = await db.query('SELECT * FROM board_groups WHERE uuid = ? AND board_id = ?', [b.group, board.id]);
      group = g[0];
      if (!group) return R.unprocessable(res, [fieldErr('group', 'Grupo inexistente.')]);
    }
    const done = []; const denied = [];
    await txBoard(board.id, async (conn) => {
      for (const it of rows) {
        const ok = b.action === 'delete' ? canDeleteItem(req, board, it) : (await accessOf(req, board, it)) === 'all';
        if (!ok) { denied.push(it.uuid); continue; }
        if (b.action === 'delete') {
          await conn.query('DELETE FROM board_items WHERE id = ?', [it.id]);
          await log(conn, board.id, it.id, req.user.id, 'item_deleted', null, { title: it.title });
        } else {
          const [[m]] = await conn.query('SELECT COALESCE(MAX(position), 0) AS hi FROM board_items WHERE group_id = ?', [group.id]);
          await conn.query('UPDATE board_items SET group_id = ?, position = ? WHERE id = ?', [group.id, Number(m.hi) + GAP, it.id]);
          if (it.group_id !== group.id) await log(conn, board.id, it.id, req.user.id, 'moved', null, { to: group.title });
        }
        done.push(it.uuid);
      }
    });
    return R.ok(res, { done, denied });
  } catch (err) { return R.serverError(res, err); }
}

// PUT …/items/:iid/cells/:cid { value }
async function setCell(req, res) {
  try {
    const board = await boardRow(req);
    if (!board) return R.notFound(res, 'Quadro');
    const item = await itemRow(req, board);
    if (!item) return R.notFound(res, 'Item');
    const columns = await loadColumns(board.id);
    const col = columns.find((c) => c.uuid === req.params.cid);
    if (!col) return R.notFound(res, 'Coluna');
    const level = await accessOf(req, board, item);
    if (level === 'none' || (level === 'status' && !cells.ASSIGNEE_TYPES.includes(col.type))) return R.forbidden(res, 'Você não pode editar este campo.');
    if (req.body?.value === undefined) return R.unprocessable(res, [fieldErr('value', 'Informe o valor.')]);
    const v = await validateCells(req, board, columns, { [col.uuid]: req.body.value });
    if (v.errors.length) return R.unprocessable(res, v.errors);
    const entry = v.out[0];

    // valor anterior e nomes (para o histórico)
    const oldRaw = col.type === 'people'
      ? (await db.query(`SELECT u.uuid, u.name FROM board_item_people p JOIN users u ON u.id = p.user_id WHERE p.item_id = ? AND p.column_id = ? ORDER BY u.name`, [item.id, col.id]))[0]
      : (parseJson(item.cells, {}) || {})[col.uuid];
    let oldText; let newText;
    if (col.type === 'people') {
      oldText = oldRaw.map((x) => x.name).join(', ');
      const nm = entry.ids.length ? (await db.query('SELECT name FROM users WHERE id IN (?) ORDER BY name', [entry.ids]))[0].map((x) => x.name) : [];
      newText = nm.join(', ');
    } else { oldText = cells.display(col, oldRaw); newText = cells.display(col, entry.value); }

    await txBoard(board.id, async (conn) => {
      await writeCells(conn, item.id, [{ ...entry, col }]);
      await conn.query('UPDATE board_items SET updated_at = NOW() WHERE id = ?', [item.id]);
      if (oldText !== newText) await log(conn, board.id, item.id, req.user.id, 'cell', col.id, { col: col.title, type: col.type, old: oldText, new: newText });
    });
    const fresh = await itemRow(req, board);
    const [shaped] = await shapeItems(req, board, columns, [fresh]);
    return R.ok(res, shaped);
  } catch (err) { return R.serverError(res, err); }
}

// GET …/items/:iid  (detalhe: comentários + histórico)
async function getItem(req, res) {
  try {
    const board = await boardRow(req);
    if (!board) return R.notFound(res, 'Quadro');
    const row = await itemRow(req, board);
    if (!row) return R.notFound(res, 'Item');
    const columns = await loadColumns(board.id);
    const [item] = await shapeItems(req, board, columns, [row]);
    const [cm] = await db.query(
      `SELECT c.uuid, c.body, c.created_at, c.user_id, u.uuid AS u_uuid, u.name, u.initials, u.avatar_url
         FROM board_comments c LEFT JOIN users u ON u.id = c.user_id WHERE c.item_id = ? ORDER BY c.created_at DESC, c.id DESC LIMIT 200`, [row.id],
    );
    const [act] = await db.query(
      `SELECT a.kind, a.data, a.created_at, u.uuid AS u_uuid, u.name, u.initials, u.avatar_url
         FROM board_activity a LEFT JOIN users u ON u.id = a.user_id WHERE a.item_id = ? ORDER BY a.created_at DESC, a.id DESC LIMIT 100`, [row.id],
    );
    return R.ok(res, {
      item,
      comments: cm.map((c) => ({ uuid: c.uuid, body: c.body, created_at: c.created_at, user: c.u_uuid ? { uuid: c.u_uuid, name: c.name, initials: c.initials, avatar_url: c.avatar_url } : null, can_delete: isStaff(req) || c.user_id === req.user.id })),
      activity: act.map((a) => ({ kind: a.kind, data: parseJson(a.data, {}), created_at: a.created_at, user: a.u_uuid ? { uuid: a.u_uuid, name: a.name, initials: a.initials, avatar_url: a.avatar_url } : null })),
      can_delete: canDeleteItem(req, board, row),
    });
  } catch (err) { return R.serverError(res, err); }
}

// POST …/items/:iid/comments { body }
async function createComment(req, res) {
  try {
    const board = await boardRow(req);
    if (!board) return R.notFound(res, 'Quadro');
    const item = await itemRow(req, board);
    if (!item) return R.notFound(res, 'Item');
    const body = String(req.body?.body ?? '').trim();
    if (!body) return R.unprocessable(res, [fieldErr('body', 'Escreva o comentário.')]);
    if (body.length > 4000) return R.unprocessable(res, [fieldErr('body', 'Máximo 4000 caracteres.')]);
    const uuid = uuidv4();
    await txBoard(board.id, async (conn) => {
      await conn.query('INSERT INTO board_comments (uuid, item_id, user_id, body) VALUES (?,?,?,?)', [uuid, item.id, req.user.id, body]);
    });
    return R.created(res, { uuid });
  } catch (err) { return R.serverError(res, err); }
}

// DELETE …/items/:iid/comments/:cmid
async function deleteComment(req, res) {
  try {
    const board = await boardRow(req);
    if (!board) return R.notFound(res, 'Quadro');
    const item = await itemRow(req, board);
    if (!item) return R.notFound(res, 'Item');
    const [rows] = await db.query('SELECT * FROM board_comments WHERE uuid = ? AND item_id = ?', [req.params.cmid, item.id]);
    const c = rows[0];
    if (!c) return R.notFound(res, 'Comentário');
    if (!isStaff(req) && c.user_id !== req.user.id) return R.forbidden(res);
    await txBoard(board.id, async (conn) => { await conn.query('DELETE FROM board_comments WHERE id = ?', [c.id]); });
    return R.noContent(res);
  } catch (err) { return R.serverError(res, err); }
}

// GET /communities/:id/boards/my-items — tudo o que está atribuído a mim, em todos os quadros da comunidade
async function myItems(req, res) {
  try {
    const [rows] = await db.query(
      `SELECT DISTINCT i.*, g.uuid AS group_uuid, g.title AS group_title, g.color AS group_color,
              b.uuid AS board_uuid, b.title AS board_title, b.color AS board_color, b.edit_policy, b.id AS bid
         FROM board_item_people p
         JOIN board_items i ON i.id = p.item_id
         JOIN board_groups g ON g.id = i.group_id
         JOIN boards b ON b.id = i.board_id
        WHERE b.community_id = ? AND p.user_id = ? ORDER BY b.position, i.position`, [req.community.id, req.user.id],
    );
    const boardIds = [...new Set(rows.map((r) => r.bid))];
    const cols = boardIds.length ? (await db.query('SELECT * FROM board_columns WHERE board_id IN (?) ORDER BY position, id', [boardIds]))[0] : [];
    const today = todayUtc(req);
    const out = rows.map((r) => {
      const bc = cols.filter((c) => c.board_id === r.bid).map(shapeColumn);
      const statusCol = bc.find((c) => c.type === 'status');
      const dueCol = bc.find((c) => c.type === 'date' || c.type === 'timeline');
      const cs = parseJson(r.cells, {}) || {};
      const sv = statusCol ? cs[statusCol.uuid] : null;
      const label = statusCol ? statusCol.config.labels.find((l) => l.id === sv) : null;
      const dv = dueCol ? cs[dueCol.uuid] : null;
      const due = dueCol?.type === 'timeline' ? dv?.end : dv;
      const done = !!label?.done;
      return {
        uuid: r.uuid, seq: r.seq, title: r.title, updated_at: r.updated_at,
        board: { uuid: r.board_uuid, title: r.board_title, color: r.board_color },
        group: { uuid: r.group_uuid, title: r.group_title, color: r.group_color },
        status: statusCol ? { column: statusCol.uuid, value: sv || null, label: label || null, labels: statusCol.config.labels } : null,
        due: due || null, due_column: dueCol?.uuid || null, done, overdue: !!(due && !done && due < today),
        access: accessLevel(req, { edit_policy: r.edit_policy }, r, true),
      };
    });
    return R.ok(res, out);
  } catch (err) { return R.serverError(res, err); }
}

module.exports = {
  listBoards, createBoard, getBoard, updateBoard, deleteBoard, reorderBoards,
  createGroup, updateGroup, deleteGroup, reorderGroups,
  createColumn, updateColumn, deleteColumn, reorderColumns,
  createItem, updateItem, deleteItem, moveItem, duplicateItem, bulkItems, setCell, getItem,
  createComment, deleteComment, myItems,
};
