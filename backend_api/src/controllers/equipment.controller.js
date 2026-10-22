'use strict';

/**
 * Equipamentos da comunidade (agendador). Dentro da comunidade (membros logados); a parte pública vive em
 * publicEquipment.controller.js. Regras de horário em services/equipmentSlots.service.js.
 *   moderator+  → cadastra, define janelas/bloqueios, aprova/recusa/cancela, vê dados de contato de convidados
 *   member      → vê, reserva, cancela a própria reserva (até o prazo do equipamento)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DateTime } = require('luxon');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/db.config');
const R = require('../utils/response');
const storage = require('../services/storage');
const quota = require('../services/quota.service');
const slots = require('../services/equipmentSlots.service');
const mail = require('../services/mail.service');
const tpl = require('../services/mail.templates');

const RANK = { member: 1, moderator: 2, admin: 3, owner: 4 };
const isStaff = (req) => (RANK[req.cRole] || 0) >= RANK.moderator;
const STATUS = ['active', 'maintenance', 'archived'];
const APPROVAL = ['auto', 'manual'];
const ACCESS = ['community', 'public'];
const MAX_SPECS = 30;
const MAX_WINDOWS = 40;
const IMG_EXT = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp' };
const IMG_MIME = Object.fromEntries(Object.entries(IMG_EXT).map(([m, e]) => [e, m]));

const parseJson = (v, fb = null) => {
  if (v == null) return fb;
  if (typeof v === 'string') { try { return JSON.parse(v); } catch { return fb; } }
  return v;
};
const iso = (d) => (d ? new Date(d).toISOString() : null);
const newToken = () => crypto.randomBytes(24).toString('base64url');
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

const intIn = (v, min, max) => { const n = Number(v); return Number.isInteger(n) && n >= min && n <= max ? n : null; };
const fieldErr = (field, message) => ({ field, message });

/** "22/10/2026 14:00–15:30" no fuso do equipamento. */
function formatWhen(start, end, zone, lang = 'pt') {
  const s = DateTime.fromJSDate(new Date(start), { zone }); const e = DateTime.fromJSDate(new Date(end), { zone });
  const day = s.setLocale(lang === 'pt' ? 'pt-BR' : lang).toFormat('dd/LL/yyyy');
  return `${day} ${s.toFormat('HH:mm')}–${e.toFormat('HH:mm')} (${zone})`;
}

async function eqRow(req, { forUpdate = false } = {}) {
  const [rows] = await db.query(`SELECT * FROM equipment WHERE uuid = ? AND community_id = ?${forUpdate ? ' FOR UPDATE' : ''}`, [req.params.eid, req.community.id]);
  const eq = rows[0];
  if (!eq) return null;
  if (eq.status === 'archived' && !isStaff(req)) return null;
  return eq;
}

async function responsibleOf(eq) {
  if (!eq.responsible_id) return null;
  const [r] = await db.query('SELECT uuid, name FROM users WHERE id = ?', [eq.responsible_id]);
  return r[0] || null;
}

async function equipmentShape(req, eq, extra = {}) {
  const staff = isStaff(req);
  const resp = await responsibleOf(eq);
  const out = {
    uuid: eq.uuid, name: eq.name, description: eq.description, location: eq.location,
    responsible: resp ? { uuid: resp.uuid, name: resp.name } : null,
    specs: parseJson(eq.specs, []) || [],
    status: eq.status, has_image: !!eq.image_path, image_version: eq.image_path ? new Date(eq.updated_at).getTime() : null,
    timezone: eq.timezone, slot_minutes: eq.slot_minutes, min_minutes: eq.min_minutes, max_minutes: eq.max_minutes,
    min_notice_minutes: eq.min_notice_minutes, max_advance_days: eq.max_advance_days, cancel_until_minutes: eq.cancel_until_minutes,
    member_approval: eq.member_approval, guest_approval: eq.guest_approval, access: eq.access,
    created_at: eq.created_at, ...extra,
  };
  if (staff) {
    out.public_token = eq.public_token;
    out.public_url = eq.public_token ? `${mail.baseUrl(req)}/e/${eq.public_token}` : null;
  }
  return out;
}

/** Valida/normaliza o corpo de criação/edição. `partial` = só os campos enviados. */
async function cleanBody(req, b, partial) {
  const f = {}; const errors = [];
  const has = (k) => b[k] !== undefined;
  if (!partial || has('name')) {
    const name = String(b.name || '').trim();
    if (!name) errors.push(fieldErr('name', 'Obrigatório.')); else if (name.length > 150) errors.push(fieldErr('name', 'Máximo 150 caracteres.')); else f.name = name;
  }
  if (has('description')) f.description = b.description ? String(b.description).slice(0, 10000) : null;
  if (has('location')) f.location = b.location ? String(b.location).trim().slice(0, 200) : null;
  if (has('status')) { if (STATUS.includes(b.status)) f.status = b.status; else errors.push(fieldErr('status', 'Inválido.')); }
  if (has('member_approval')) { if (APPROVAL.includes(b.member_approval)) f.member_approval = b.member_approval; else errors.push(fieldErr('member_approval', 'Inválido.')); }
  if (has('guest_approval')) { if (APPROVAL.includes(b.guest_approval)) f.guest_approval = b.guest_approval; else errors.push(fieldErr('guest_approval', 'Inválido.')); }
  if (has('access')) { if (ACCESS.includes(b.access)) f.access = b.access; else errors.push(fieldErr('access', 'Inválido.')); }
  if (has('timezone')) { if (slots.validZone(b.timezone)) f.timezone = b.timezone; else errors.push(fieldErr('timezone', 'Fuso horário inválido.')); }
  const ints = { slot_minutes: [5, 480], min_minutes: [5, 1440], max_minutes: [5, 1440], min_notice_minutes: [0, 43200], max_advance_days: [1, 365], cancel_until_minutes: [0, 43200] };
  Object.entries(ints).forEach(([k, [lo, hi]]) => {
    if (!has(k)) return;
    const n = intIn(b[k], lo, hi);
    if (n == null) errors.push(fieldErr(k, `Use um número inteiro entre ${lo} e ${hi}.`)); else f[k] = n;
  });
  if (has('specs')) {
    if (!Array.isArray(b.specs) || b.specs.length > MAX_SPECS) errors.push(fieldErr('specs', `Lista com até ${MAX_SPECS} itens.`));
    else {
      f.specs = JSON.stringify(b.specs.map((x) => ({ key: String(x?.key || '').trim().slice(0, 80), value: String(x?.value || '').trim().slice(0, 300) })).filter((x) => x.key || x.value));
    }
  }
  if (has('responsible')) {
    if (!b.responsible) f.responsible_id = null;
    else {
      const [u] = await db.query(
        `SELECT u.id FROM users u JOIN community_members m ON m.user_id = u.id AND m.community_id = ? WHERE u.uuid = ?`, [req.community.id, b.responsible],
      );
      if (!u.length) errors.push(fieldErr('responsible', 'O responsável precisa ser membro da comunidade.')); else f.responsible_id = u[0].id;
    }
  }
  return { f, errors };
}

/** Consistência entre slot/mín/máx (valores finais, já mesclados com o que existe). */
function checkLimits(v) {
  const errs = [];
  if (v.min_minutes % v.slot_minutes) errs.push(fieldErr('min_minutes', 'A duração mínima deve ser múltipla do slot.'));
  if (v.max_minutes % v.slot_minutes) errs.push(fieldErr('max_minutes', 'A duração máxima deve ser múltipla do slot.'));
  if (v.max_minutes < v.min_minutes) errs.push(fieldErr('max_minutes', 'A máxima não pode ser menor que a mínima.'));
  return errs;
}

// ── CRUD ────────────────────────────────────────────────────────────────────
// GET /communities/:id/equipment
async function listEquipment(req, res) {
  try {
    const staff = isStaff(req);
    const [rows] = await db.query(
      `SELECT * FROM equipment WHERE community_id = ? ${staff ? '' : "AND status <> 'archived'"} ORDER BY (status = 'archived'), name`, [req.community.id],
    );
    const now = new Date();
    const [using] = await db.query(
      `SELECT b.equipment_id, b.end_at, b.source, b.guest_name, b.guest_institution, u.name AS user_name
         FROM equipment_bookings b JOIN equipment e ON e.id = b.equipment_id LEFT JOIN users u ON u.id = b.user_id
        WHERE e.community_id = ? AND b.status = 'confirmed' AND b.start_at <= ? AND b.end_at > ?`, [req.community.id, now, now],
    );
    const pend = staff ? (await db.query(
      `SELECT b.equipment_id, COUNT(*) AS n FROM equipment_bookings b JOIN equipment e ON e.id = b.equipment_id
        WHERE e.community_id = ? AND b.status = 'pending' AND b.end_at > ? GROUP BY b.equipment_id`, [req.community.id, now],
    ))[0] : [];
    const out = [];
    for (const eq of rows) {
      const u = using.find((x) => x.equipment_id === eq.id);
      out.push(await equipmentShape(req, eq, {
        in_use_now: u ? { name: u.user_name || u.guest_name, institution: u.source === 'public' ? u.guest_institution : null, until: iso(u.end_at), external: u.source === 'public' } : null,
        ...(staff ? { pending_count: Number((pend.find((x) => x.equipment_id === eq.id) || {}).n || 0) } : {}),
      }));
    }
    return R.ok(res, out);
  } catch (err) { return R.serverError(res, err); }
}

// POST /communities/:id/equipment
async function createEquipment(req, res) {
  try {
    const { f, errors } = await cleanBody(req, req.body || {}, false);
    const v = { slot_minutes: 30, min_minutes: 30, max_minutes: 240, ...f };
    errors.push(...checkLimits(v));
    if (errors.length) return R.unprocessable(res, errors);
    const uuid = uuidv4();
    const cols = { uuid, community_id: req.community.id, created_by: req.user.id, ...f };
    if (cols.access === 'public') cols.public_token = newToken();
    const [r] = await db.query('INSERT INTO equipment SET ?', [cols]);
    // janelas padrão: seg–sex 08–18 para membros (o admin ajusta/abre ao público depois)
    const vals = [1, 2, 3, 4, 5].map((d) => [r.insertId, d, '08:00:00', '18:00:00', 'members']);
    await db.query('INSERT INTO equipment_windows (equipment_id, weekday, start_time, end_time, audience) VALUES ?', [vals]);
    const [[eq]] = await db.query('SELECT * FROM equipment WHERE id = ?', [r.insertId]);
    return R.created(res, await equipmentShape(req, eq));
  } catch (err) { return R.serverError(res, err); }
}

async function loadWindows(eqId) {
  const [w] = await db.query('SELECT weekday, start_time, end_time, audience FROM equipment_windows WHERE equipment_id = ? ORDER BY weekday, start_time', [eqId]);
  return w.map((x) => ({ weekday: x.weekday, start: String(x.start_time).slice(0, 5), end: String(x.end_time).slice(0, 5), audience: x.audience }));
}

// GET /communities/:id/equipment/:eid
async function getEquipment(req, res) {
  try {
    const eq = await eqRow(req);
    if (!eq) return R.notFound(res, 'Equipamento');
    const now = new Date();
    const [urows] = await db.query(
      `SELECT b.end_at, b.source, b.guest_name, b.guest_institution, usr.name AS user_name FROM equipment_bookings b LEFT JOIN users usr ON usr.id = b.user_id
        WHERE b.equipment_id = ? AND b.status = 'confirmed' AND b.start_at <= ? AND b.end_at > ? LIMIT 1`, [eq.id, now, now],
    );
    const u = urows[0];
    const extra = {
      windows: await loadWindows(eq.id),
      in_use_now: u ? { name: u.user_name || u.guest_name, institution: u.source === 'public' ? u.guest_institution : null, until: iso(u.end_at), external: u.source === 'public' } : null,
    };
    return R.ok(res, await equipmentShape(req, eq, extra));
  } catch (err) { return R.serverError(res, err); }
}

// PUT /communities/:id/equipment/:eid
async function updateEquipment(req, res) {
  try {
    const eq = await eqRow(req);
    if (!eq) return R.notFound(res, 'Equipamento');
    const { f, errors } = await cleanBody(req, req.body || {}, true);
    errors.push(...checkLimits({ slot_minutes: eq.slot_minutes, min_minutes: eq.min_minutes, max_minutes: eq.max_minutes, ...f }));
    if (errors.length) return R.unprocessable(res, errors);
    if ((f.access || eq.access) === 'public' && !eq.public_token) f.public_token = newToken();
    if (Object.keys(f).length) await db.query('UPDATE equipment SET ? WHERE id = ?', [f, eq.id]);
    const [[fresh]] = await db.query('SELECT * FROM equipment WHERE id = ?', [eq.id]);
    return R.ok(res, await equipmentShape(req, fresh, { windows: await loadWindows(eq.id) }));
  } catch (err) { return R.serverError(res, err); }
}

// DELETE /communities/:id/equipment/:eid
async function deleteEquipment(req, res) {
  try {
    const eq = await eqRow(req);
    if (!eq) return R.notFound(res, 'Equipamento');
    await db.query('DELETE FROM equipment WHERE id = ?', [eq.id]);
    await dropImage(eq);
    return R.noContent(res);
  } catch (err) { return R.serverError(res, err); }
}

// POST /communities/:id/equipment/:eid/public-token   (gira o token: o QR/link antigo deixa de funcionar)
async function rotateToken(req, res) {
  try {
    const eq = await eqRow(req);
    if (!eq) return R.notFound(res, 'Equipamento');
    const token = newToken();
    await db.query('UPDATE equipment SET public_token = ? WHERE id = ?', [token, eq.id]);
    return R.ok(res, { public_token: token, public_url: `${mail.baseUrl(req)}/e/${token}` });
  } catch (err) { return R.serverError(res, err); }
}

// ── Imagem ──────────────────────────────────────────────────────────────────
/** Remove a imagem do equipamento do storage e devolve o espaço à cota de quem a enviou. */
async function dropImage(eq) {
  if (!eq.image_path) return;
  try {
    await quota.freeByRef('equipment_image', eq.id, { reason: 'remove' });
    await storage.remove(`equipment/${path.basename(eq.image_path)}`);
  } catch (e) { console.warn('[equipment] falha ao remover imagem:', e.message); }
}

// POST /communities/:id/equipment/:eid/image   (multipart, campo "image") — middleware multer na rota
async function uploadImage(req, res) {
  const cleanup = () => { if (req.file) fs.rm(req.file.path, { force: true }, () => {}); };
  try {
    const eq = await eqRow(req);
    if (!eq) { cleanup(); return R.notFound(res, 'Equipamento'); }
    if (!req.file) return R.unprocessable(res, [fieldErr('image', 'Envie uma imagem (JPEG, PNG ou WebP).')]);
    // confere os "números mágicos": o MIME enviado pelo cliente não basta
    const head = Buffer.alloc(12); const fd = fs.openSync(req.file.path, 'r'); fs.readSync(fd, head, 0, 12, 0); fs.closeSync(fd);
    const ok = (head[0] === 0xff && head[1] === 0xd8) || head.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) || (head.slice(0, 4).toString() === 'RIFF' && head.slice(8, 12).toString() === 'WEBP');
    if (!ok) { cleanup(); return R.unprocessable(res, [fieldErr('image', 'O arquivo não é uma imagem válida.')]); }
    const name = path.basename(req.file.path);
    const key = `equipment/${name}`;
    // a imagem conta na cota de quem a enviou
    await quota.guard(req.user.id, req.file.size, async () => {
      await storage.putFile(key, req.file.path, { contentType: IMG_MIME[path.extname(name).toLowerCase()] });
      try { await db.query('UPDATE equipment SET image_path = ? WHERE id = ?', [name, eq.id]); } catch (e) { await storage.remove(key).catch(() => {}); throw e; }
      return { kind: 'equipment_image', refType: 'equipment_image', refId: eq.id, key, size: req.file.size };
    });
    // a imagem antiga (se havia) foi substituída: libera só as anteriores à nova
    if (eq.image_path) {
      const oldKey = `equipment/${path.basename(eq.image_path)}`;
      await quota.freeByKey(oldKey, { reason: 'replace' }).catch(() => {});
      await storage.remove(oldKey).catch(() => {});
    }
    cleanup();
    const [[fresh]] = await db.query('SELECT * FROM equipment WHERE id = ?', [eq.id]);
    return R.ok(res, await equipmentShape(req, fresh));
  } catch (err) { cleanup(); if (quota.handleError(res, err)) return undefined; return R.serverError(res, err); }
}

// DELETE /communities/:id/equipment/:eid/image
async function deleteImage(req, res) {
  try {
    const eq = await eqRow(req);
    if (!eq) return R.notFound(res, 'Equipamento');
    await db.query('UPDATE equipment SET image_path = NULL WHERE id = ?', [eq.id]);
    await dropImage(eq);
    return R.noContent(res);
  } catch (err) { return R.serverError(res, err); }
}

/** Serve o arquivo de imagem (usado também pela rota pública). */
async function sendImage(res, eq, cacheScope) {
  try {
    if (!eq || !eq.image_path) return R.notFound(res, 'Imagem');
    const key = `equipment/${path.basename(eq.image_path)}`;
    if (!(await storage.exists(key))) return R.notFound(res, 'Imagem');
    res.setHeader('Content-Type', IMG_MIME[path.extname(key).toLowerCase()] || 'application/octet-stream');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    res.setHeader('Cache-Control', `${cacheScope}, max-age=300`);
    const stream = await storage.getStream(key);
    stream.on('error', () => res.destroy());
    return stream.pipe(res);
  } catch (err) { return R.serverError(res, err); }
}
async function getImage(req, res) {
  try { return await sendImage(res, await eqRow(req), 'private'); } catch (err) { return R.serverError(res, err); }
}

// ── Janelas e bloqueios ─────────────────────────────────────────────────────
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

// PUT /communities/:id/equipment/:eid/windows   { windows:[{weekday,start,end,audience}] }
async function saveWindows(req, res) {
  try {
    const eq = await eqRow(req);
    if (!eq) return R.notFound(res, 'Equipamento');
    const list = req.body?.windows;
    if (!Array.isArray(list) || list.length > MAX_WINDOWS) return R.unprocessable(res, [fieldErr('windows', `Lista com até ${MAX_WINDOWS} janelas.`)]);
    const clean = [];
    for (const [i, w] of list.entries()) {
      const wd = intIn(w?.weekday, 0, 6);
      if (wd == null || !TIME_RE.test(w?.start || '') || !TIME_RE.test(w?.end || '') || w.start >= w.end || !['members', 'public'].includes(w.audience)) {
        return R.unprocessable(res, [fieldErr(`windows[${i}]`, 'Dia da semana, horários (HH:MM, início < fim) e público são obrigatórios.')]);
      }
      clean.push({ weekday: wd, start: w.start, end: w.end, audience: w.audience });
    }
    for (let i = 0; i < clean.length; i += 1) {
      for (let j = i + 1; j < clean.length; j += 1) {
        const a = clean[i]; const b = clean[j];
        if (a.weekday === b.weekday && a.start < b.end && b.start < a.end) return R.unprocessable(res, [fieldErr('windows', 'Há janelas sobrepostas no mesmo dia.')]);
      }
    }
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query('DELETE FROM equipment_windows WHERE equipment_id = ?', [eq.id]);
      if (clean.length) await conn.query('INSERT INTO equipment_windows (equipment_id, weekday, start_time, end_time, audience) VALUES ?', [clean.map((w) => [eq.id, w.weekday, `${w.start}:00`, `${w.end}:00`, w.audience])]);
      await conn.commit();
    } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
    return R.ok(res, { windows: await loadWindows(eq.id) });
  } catch (err) { return R.serverError(res, err); }
}

const blockShape = (b) => ({ uuid: b.uuid, start: iso(b.start_at), end: iso(b.end_at), reason: b.reason, show_reason: !!b.show_reason, repeat_until: b.repeat_until ? String(b.repeat_until instanceof Date ? b.repeat_until.toISOString() : b.repeat_until).slice(0, 10) : null });

// GET /communities/:id/equipment/:eid/blocks
async function listBlocks(req, res) {
  try {
    const eq = await eqRow(req);
    if (!eq) return R.notFound(res, 'Equipamento');
    const [rows] = await db.query('SELECT * FROM equipment_blocks WHERE equipment_id = ? ORDER BY start_at', [eq.id]);
    return R.ok(res, rows.map(blockShape));
  } catch (err) { return R.serverError(res, err); }
}

async function notifyGuest(eq, b, kind, note, req) {
  if (!b.guest_email) return;
  const when = formatWhen(b.start_at, b.end_at, eq.timezone, b.guest_lang || 'pt');
  const link = b.__manage ? `${mail.baseUrl(req)}/e/${eq.public_token}/b/${b.__manage}` : null;
  const m = tpl.render(kind, b.guest_lang, { name: b.guest_name, eq: eq.name, when, note }, link);
  await mail.send({ to: b.guest_email, ...m });
}

// POST /communities/:id/equipment/:eid/blocks   { start, end, reason?, show_reason?, repeat_until?, cancel_conflicts? }
async function createBlock(req, res) {
  try {
    const eq = await eqRow(req);
    if (!eq) return R.notFound(res, 'Equipamento');
    const b = req.body || {};
    const start = new Date(b.start); const end = new Date(b.end);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return R.unprocessable(res, [fieldErr('end', 'Período inválido.')]);
    if (end - start > 14 * 86400000) return R.unprocessable(res, [fieldErr('end', 'Um bloqueio pode durar no máximo 14 dias (use repetição para períodos longos).')]);
    let until = null;
    if (b.repeat_until) {
      const d = DateTime.fromISO(String(b.repeat_until), { zone: eq.timezone });
      if (!d.isValid || d < DateTime.fromJSDate(start, { zone: eq.timezone }).startOf('day') || d > DateTime.now().plus({ years: 2 })) return R.unprocessable(res, [fieldErr('repeat_until', 'Data de término da repetição inválida (até 2 anos).')]);
      until = d.toISODate();
    }
    const uuid = uuidv4();
    await db.query('INSERT INTO equipment_blocks (uuid, equipment_id, start_at, end_at, reason, show_reason, repeat_until, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [uuid, eq.id, start, end, b.reason ? String(b.reason).trim().slice(0, 200) : null, b.show_reason ? 1 : 0, until, req.user.id]);
    // reservas já feitas que caem dentro do bloqueio
    const occ = slots.expandBlocks([{ uuid, start_at: start, end_at: end, repeat_until: until, reason: null, show_reason: 0 }], eq.timezone, Date.now(), Date.now() + 800 * 86400000);
    let conflicts = [];
    if (occ.length) {
      const [bk] = await db.query(
        `SELECT * FROM equipment_bookings WHERE equipment_id = ? AND status IN ('pending','confirmed') AND end_at > ? AND start_at < ?`,
        [eq.id, new Date(Math.min(...occ.map((o) => o.start))), new Date(Math.max(...occ.map((o) => o.end)))],
      );
      conflicts = bk.filter((x) => occ.some((o) => o.start < new Date(x.end_at).getTime() && o.end > new Date(x.start_at).getTime()));
    }
    if (b.cancel_conflicts && conflicts.length) {
      for (const c of conflicts) {
        await db.query("UPDATE equipment_bookings SET status = 'cancelled', decided_by = ?, decided_at = ?, decision_note = ? WHERE id = ?", [req.user.id, new Date(), 'Horário bloqueado pelo responsável.', c.id]);
        await notifyGuest(eq, c, 'cancelled', 'Horário bloqueado pelo responsável.', req);
      }
    }
    return R.created(res, { ...blockShape({ uuid, start_at: start, end_at: end, reason: b.reason, show_reason: b.show_reason, repeat_until: until }), conflicts: conflicts.length, cancelled: b.cancel_conflicts ? conflicts.length : 0 });
  } catch (err) { return R.serverError(res, err); }
}

// DELETE /communities/:id/equipment/:eid/blocks/:bid
async function deleteBlock(req, res) {
  try {
    const eq = await eqRow(req);
    if (!eq) return R.notFound(res, 'Equipamento');
    const [r] = await db.query('DELETE FROM equipment_blocks WHERE uuid = ? AND equipment_id = ?', [req.params.bid, eq.id]);
    return r.affectedRows ? R.noContent(res) : R.notFound(res, 'Bloqueio');
  } catch (err) { return R.serverError(res, err); }
}

// ── Disponibilidade ─────────────────────────────────────────────────────────
// GET /communities/:id/equipment/:eid/availability?from=YYYY-MM-DD&to=YYYY-MM-DD
async function availability(req, res) {
  try {
    const eq = await eqRow(req);
    if (!eq) return R.notFound(res, 'Equipamento');
    const today = DateTime.now().setZone(eq.timezone);
    const from = String(req.query.from || today.toISODate()); const to = String(req.query.to || today.plus({ days: 6 }).toISODate());
    let list;
    try { list = await slots.computeSlots(eq, { from, to, audience: 'member', includePast: true }); } catch (e) { if (e.code === 'BAD_RANGE') return R.unprocessable(res, [fieldErr('from', e.message)]); throw e; }
    const staff = isStaff(req);
    const out = list.map((s) => {
      if (!s.booking) return s;
      const mine = s.booking.user_id === req.user.id;
      const show = staff || mine || s.booking.status === 'confirmed';
      return { start: s.start, end: s.end, state: s.state, booking: { uuid: staff || mine ? s.booking.uuid : undefined, status: s.booking.status, mine, name: show ? s.booking.name : null, external: s.booking.source === 'public', institution: show ? s.booking.institution : null } };
    });
    return R.ok(res, { timezone: eq.timezone, slot_minutes: eq.slot_minutes, status: eq.status, slots: out });
  } catch (err) { return R.serverError(res, err); }
}

// ── Reservas ────────────────────────────────────────────────────────────────
function bookingShape(b, req, eq) {
  const staff = isStaff(req); const mine = b.user_id === req.user.id;
  const external = b.source === 'public';
  const out = {
    uuid: b.uuid, status: b.status, source: b.source, start: iso(b.start_at), end: iso(b.end_at), mine, external,
    who: { name: b.user_name || b.guest_name, institution: external ? b.guest_institution : null, user: b.user_uuid || null },
    created_at: b.created_at,
  };
  if (eq) out.equipment = { uuid: eq.uuid, name: eq.name };
  if (staff || mine) { out.purpose = b.purpose; out.project_note = b.project_note; out.decision_note = b.decision_note; }
  if (staff && external) { out.guest = { email: b.guest_email, phone: b.guest_phone }; }
  return out;
}

const BOOKING_SELECT = `SELECT b.*, u.name AS user_name, u.uuid AS user_uuid FROM equipment_bookings b LEFT JOIN users u ON u.id = b.user_id`;

// GET /communities/:id/equipment/:eid/bookings?status=&from=&to=
async function listBookings(req, res) {
  try {
    const eq = await eqRow(req);
    if (!eq) return R.notFound(res, 'Equipamento');
    const where = ['b.equipment_id = ?', "b.status <> 'awaiting_email'"]; const args = [eq.id];
    const st = String(req.query.status || '');
    if (st) { const list = st.split(',').filter((x) => ['pending', 'confirmed', 'rejected', 'cancelled', 'no_show'].includes(x)); if (list.length) { where.push('b.status IN (?)'); args.push(list); } }
    const from = req.query.from ? new Date(String(req.query.from)) : new Date(Date.now() - 7 * 86400000);
    if (!Number.isNaN(from.getTime())) { where.push('b.end_at > ?'); args.push(from); }
    if (req.query.to) { const to = new Date(String(req.query.to)); if (!Number.isNaN(to.getTime())) { where.push('b.start_at < ?'); args.push(to); } }
    if (!isStaff(req)) { where.push("(b.status = 'confirmed' OR b.user_id = ?)"); args.push(req.user.id); }
    const [rows] = await db.query(`${BOOKING_SELECT} WHERE ${where.join(' AND ')} ORDER BY b.start_at LIMIT 500`, args);
    return R.ok(res, rows.map((b) => bookingShape(b, req, null)));
  } catch (err) { return R.serverError(res, err); }
}

// GET /communities/:id/equipment/bookings/mine
async function myBookings(req, res) {
  try {
    const [rows] = await db.query(
      `${BOOKING_SELECT} JOIN equipment e ON e.id = b.equipment_id
        WHERE e.community_id = ? AND b.user_id = ? AND b.end_at > ? AND b.status IN ('pending','confirmed') ORDER BY b.start_at LIMIT 200`,
      [req.community.id, req.user.id, new Date(Date.now() - 86400000)],
    );
    const ids = [...new Set(rows.map((r) => r.equipment_id))];
    const eqs = ids.length ? (await db.query('SELECT id, uuid, name FROM equipment WHERE id IN (?)', [ids]))[0] : [];
    return R.ok(res, rows.map((b) => bookingShape(b, req, eqs.find((e) => e.id === b.equipment_id))));
  } catch (err) { return R.serverError(res, err); }
}

async function staffEmail(eq, communityId) {
  const [r] = await db.query(
    `SELECT u.email, u.name FROM users u WHERE u.id = COALESCE(?, (SELECT owner_id FROM communities WHERE id = ?))`, [eq.responsible_id, communityId],
  );
  return r[0] || null;
}
async function notifyStaff(eq, b, req) {
  if (!mail.enabled()) return;
  const to = await staffEmail(eq, eq.community_id);
  if (!to?.email) return;
  const when = formatWhen(b.start_at, b.end_at, eq.timezone, 'pt');
  const m = tpl.render('staff', 'pt', { name: b.guest_name || b.user_name || 'Membro', inst: b.guest_institution || 'comunidade', eq: eq.name, when }, `${mail.baseUrl(req)}/communities/${req.communityUuid || ''}`);
  await mail.send({ to: to.email, ...m });
}

/** Cria a reserva em transação: trava o equipamento, confere conflito, insere. */
async function insertBooking(eq, v, fields) {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query('SELECT id FROM equipment WHERE id = ? FOR UPDATE', [eq.id]);
    if (await slots.hasConflict(conn, eq.id, v.start, v.end)) { await conn.rollback(); return { conflict: true }; }
    const uuid = uuidv4();
    await conn.query('INSERT INTO equipment_bookings SET ?', [{ uuid, equipment_id: eq.id, start_at: v.start, end_at: v.end, ...fields }]);
    await conn.commit();
    return { uuid };
  } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
}

// POST /communities/:id/equipment/:eid/bookings   { start, end, purpose?, project_note? }
async function createBooking(req, res) {
  try {
    const eq = await eqRow(req);
    if (!eq || eq.status === 'archived') return R.notFound(res, 'Equipamento');
    if (eq.status !== 'active') return R.error(res, 409, 'EQUIPMENT_UNAVAILABLE', 'Este equipamento está em manutenção e não aceita reservas.');
    const b = req.body || {};
    const purpose = b.purpose ? String(b.purpose).trim().slice(0, 500) : null;
    const note = b.project_note ? String(b.project_note).trim().slice(0, 300) : null;
    const v = await slots.validateRange(eq, b.start, b.end, 'member');
    if (v.error) return R.error(res, v.error.code === 'SLOT_UNAVAILABLE' ? 409 : 422, v.error.code, v.error.message);
    const [[{ n }]] = await db.query("SELECT COUNT(*) AS n FROM equipment_bookings WHERE equipment_id = ? AND user_id = ? AND status IN ('pending','confirmed') AND end_at > ?", [eq.id, req.user.id, new Date()]);
    if (n >= 20) return R.error(res, 429, 'TOO_MANY_BOOKINGS', 'Você já tem muitas reservas futuras neste equipamento.');
    const status = isStaff(req) || eq.member_approval === 'auto' ? 'confirmed' : 'pending';
    const r = await insertBooking(eq, v, { status, source: 'member', user_id: req.user.id, purpose, project_note: note, decided_by: status === 'confirmed' ? req.user.id : null, decided_at: status === 'confirmed' ? new Date() : null });
    if (r.conflict) return R.error(res, 409, 'SLOT_UNAVAILABLE', 'Esse horário acabou de ser reservado por outra pessoa.');
    const [rows] = await db.query(`${BOOKING_SELECT} WHERE b.uuid = ?`, [r.uuid]);
    if (status === 'pending') { req.communityUuid = req.community.uuid; notifyStaff(eq, { ...rows[0] }, req).catch(() => {}); }
    return R.created(res, bookingShape(rows[0], req, eq));
  } catch (err) { return R.serverError(res, err); }
}

// POST /communities/:id/equipment/:eid/bookings/:bid/:action   approve | reject | cancel | no_show   { note? }
async function bookingAction(req, res) {
  try {
    const eq = await eqRow(req);
    if (!eq) return R.notFound(res, 'Equipamento');
    const [rows] = await db.query(`${BOOKING_SELECT} WHERE b.uuid = ? AND b.equipment_id = ?`, [req.params.bid, eq.id]);
    const b = rows[0];
    if (!b || b.status === 'awaiting_email') return R.notFound(res, 'Reserva');
    const action = req.params.action; const staff = isStaff(req); const mine = b.user_id === req.user.id;
    const note = req.body?.note ? String(req.body.note).trim().slice(0, 300) : null;
    const now = new Date();
    let next;
    if (action === 'approve' || action === 'reject') {
      if (!staff) return R.forbidden(res);
      if (b.status !== 'pending') return R.error(res, 409, 'INVALID_STATE', 'Só pedidos pendentes podem ser aprovados ou recusados.');
      next = action === 'approve' ? 'confirmed' : 'rejected';
    } else if (action === 'cancel') {
      if (!staff && !mine) return R.forbidden(res);
      if (!['pending', 'confirmed'].includes(b.status)) return R.error(res, 409, 'INVALID_STATE', 'Esta reserva não pode mais ser cancelada.');
      if (!staff && now > new Date(new Date(b.start_at).getTime() - eq.cancel_until_minutes * 60000)) return R.error(res, 409, 'TOO_LATE', 'O prazo para cancelar esta reserva já passou. Fale com o responsável.');
      next = 'cancelled';
    } else if (action === 'no_show') {
      if (!staff) return R.forbidden(res);
      if (b.status !== 'confirmed' || new Date(b.start_at) > now) return R.error(res, 409, 'INVALID_STATE', 'Só reservas confirmadas que já começaram.');
      next = 'no_show';
    } else return R.notFound(res, 'Ação');
    await db.query('UPDATE equipment_bookings SET status = ?, decided_by = ?, decided_at = ?, decision_note = ? WHERE id = ?', [next, req.user.id, now, note, b.id]);
    if (b.source === 'public' && ['confirmed', 'rejected', 'cancelled'].includes(next) && !(next === 'cancelled' && !staff)) await notifyGuest(eq, b, next, note, req);
    const [fresh] = await db.query(`${BOOKING_SELECT} WHERE b.id = ?`, [b.id]);
    return R.ok(res, bookingShape(fresh[0], req, eq));
  } catch (err) { return R.serverError(res, err); }
}

module.exports = {
  listEquipment, createEquipment, getEquipment, updateEquipment, deleteEquipment, rotateToken,
  uploadImage, deleteImage, getImage, sendImage,
  saveWindows, listBlocks, createBlock, deleteBlock, availability,
  listBookings, myBookings, createBooking, bookingAction,
  // usados pelo controller público
  _shared: { formatWhen, notifyGuest, notifyStaff, insertBooking, loadWindows, parseJson, iso, sha256, newToken, intIn },
};
