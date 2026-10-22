'use strict';

/**
 * Página pública de um equipamento (sem login), acessada por link/QR: /e/:token.
 * Só existe com equipment.access = 'public' e o token vigente; caso contrário, 404 (não vaza a existência).
 * Nada de dado pessoal de terceiros: horários ocupados saem apenas como "busy".
 * Reservas de convidados: limites por e-mail/IP, honeypot, confirmação de e-mail (quando há e-mail configurado)
 * e aprovação manual por padrão. Link de gestão (confirmar/cancelar) por token aleatório guardado só como hash.
 */

const { DateTime } = require('luxon');
const db = require('../config/db.config');
const R = require('../utils/response');
const slots = require('../services/equipmentSlots.service');
const mail = require('../services/mail.service');
const tpl = require('../services/mail.templates');
const eqc = require('./equipment.controller');

const { formatWhen, notifyStaff, insertBooking, loadWindows, iso, sha256, newToken } = eqc._shared;
const HOLD_MINUTES = 15;
const MAX_ACTIVE_PER_EMAIL = 2;
const MAX_ACTIVE_PER_IP = 6;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const fieldErr = (field, message) => ({ field, message });

const langOf = (req) => {
  const l = String(req.body?.lang || req.get('accept-language') || '').slice(0, 2).toLowerCase();
  return tpl.LANGS.includes(l) ? l : 'pt';
};

async function byToken(token) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(String(token || ''))) return null;
  const [rows] = await db.query(
    `SELECT e.*, c.name AS community_name, c.uuid AS community_uuid FROM equipment e JOIN communities c ON c.id = e.community_id
      WHERE e.public_token = ? AND e.access = 'public' AND e.status <> 'archived'`, [token],
  );
  return rows[0] || null;
}

// GET /public/equipment/:token
async function getPublic(req, res) {
  try {
    const eq = await byToken(req.params.token);
    if (!eq) return R.notFound(res, 'Equipamento');
    const wins = (await loadWindows(eq.id)).filter((w) => w.audience === 'public');
    return R.ok(res, {
      uuid: eq.uuid, community: { uuid: eq.community_uuid, name: eq.community_name },
      name: eq.name, description: eq.description, location: eq.location, specs: eqc._shared.parseJson(eq.specs, []) || [],
      status: eq.status, has_image: !!eq.image_path, image_version: eq.image_path ? new Date(eq.updated_at).getTime() : null,
      timezone: eq.timezone, slot_minutes: eq.slot_minutes, min_minutes: eq.min_minutes, max_minutes: eq.max_minutes,
      max_advance_days: eq.max_advance_days, cancel_until_minutes: eq.cancel_until_minutes, guest_approval: eq.guest_approval,
      requires_email_confirmation: mail.enabled(), windows: wins,
    });
  } catch (err) { return R.serverError(res, err); }
}

// GET /public/equipment/:token/image
async function getImage(req, res) {
  try { return await eqc.sendImage(res, await byToken(req.params.token), 'public'); } catch (err) { return R.serverError(res, err); }
}

// GET /public/equipment/:token/availability?from=&to=
async function availability(req, res) {
  try {
    const eq = await byToken(req.params.token);
    if (!eq) return R.notFound(res, 'Equipamento');
    const today = DateTime.now().setZone(eq.timezone);
    const from = String(req.query.from || today.toISODate()); const to = String(req.query.to || today.plus({ days: 6 }).toISODate());
    if (eq.status !== 'active') return R.ok(res, { timezone: eq.timezone, slot_minutes: eq.slot_minutes, status: eq.status, slots: [] });
    let list;
    try { list = await slots.computeSlots(eq, { from, to, audience: 'public', includePast: false }); } catch (e) { if (e.code === 'BAD_RANGE') return R.unprocessable(res, [fieldErr('from', e.message)]); throw e; }
    return R.ok(res, {
      timezone: eq.timezone, slot_minutes: eq.slot_minutes, status: eq.status,
      slots: list.map((s) => ({ start: s.start, end: s.end, state: s.state === 'free' ? 'free' : 'busy' })), // bloqueio e reserva são indistinguíveis
    });
  } catch (err) { return R.serverError(res, err); }
}

const publicBooking = (b, eq) => ({
  status: b.status, start: iso(b.start_at), end: iso(b.end_at), name: b.guest_name,
  equipment: { name: eq.name, timezone: eq.timezone, location: eq.location },
  expires_at: b.status === 'awaiting_email' ? iso(b.hold_expires_at) : null,
});

// POST /public/equipment/:token/bookings
async function createGuestBooking(req, res) {
  try {
    const eq = await byToken(req.params.token);
    if (!eq) return R.notFound(res, 'Equipamento');
    const b = req.body || {};
    if (b.website) return R.created(res, { status: 'pending', start: b.start, end: b.end }); // honeypot: finge sucesso, não grava
    if (eq.status !== 'active') return R.error(res, 409, 'EQUIPMENT_UNAVAILABLE', 'Este equipamento não está aceitando reservas no momento.');
    const errors = [];
    const name = String(b.name || '').trim(); const email = String(b.email || '').trim().toLowerCase();
    const inst = String(b.institution || '').trim(); const phone = String(b.phone || '').trim(); const purpose = String(b.purpose || '').trim();
    if (name.length < 2 || name.length > 120) errors.push(fieldErr('name', 'Informe seu nome (2 a 120 caracteres).'));
    if (!EMAIL_RE.test(email) || email.length > 190) errors.push(fieldErr('email', 'E-mail inválido.'));
    if (inst.length < 2 || inst.length > 160) errors.push(fieldErr('institution', 'Informe sua instituição.'));
    if (phone.length > 40) errors.push(fieldErr('phone', 'Telefone muito longo.'));
    if (purpose.length < 3 || purpose.length > 500) errors.push(fieldErr('purpose', 'Descreva a finalidade do uso (3 a 500 caracteres).'));
    if (b.consent !== true) errors.push(fieldErr('consent', 'É preciso aceitar o uso dos dados para a reserva.'));
    if (errors.length) return R.unprocessable(res, errors);

    const v = await slots.validateRange(eq, b.start, b.end, 'public');
    if (v.error) return R.error(res, v.error.code === 'SLOT_UNAVAILABLE' ? 409 : 422, v.error.code, v.error.message);

    const now = new Date();
    const activeSql = "status IN ('pending','confirmed') OR (status = 'awaiting_email' AND hold_expires_at > ?)";
    const [[{ ne }]] = await db.query(`SELECT COUNT(*) AS ne FROM equipment_bookings WHERE guest_email = ? AND end_at > ? AND (${activeSql})`, [email, now, now]);
    const [[{ ni }]] = await db.query(`SELECT COUNT(*) AS ni FROM equipment_bookings WHERE created_ip = ? AND source = 'public' AND end_at > ? AND (${activeSql})`, [req.ip, now, now]);
    if (ne >= MAX_ACTIVE_PER_EMAIL || ni >= MAX_ACTIVE_PER_IP) return R.error(res, 429, 'TOO_MANY_BOOKINGS', 'Você já tem reservas em aberto. Cancele uma ou aguarde antes de pedir outra.');

    const verify = mail.enabled();
    const manage = newToken();
    const status = verify ? 'awaiting_email' : (eq.guest_approval === 'auto' ? 'confirmed' : 'pending');
    const lang = langOf(req);
    const r = await insertBooking(eq, v, {
      status, source: 'public', guest_name: name, guest_email: email, guest_phone: phone || null, guest_institution: inst, guest_lang: lang,
      purpose, manage_token_hash: sha256(manage), hold_expires_at: verify ? new Date(now.getTime() + HOLD_MINUTES * 60000) : null, created_ip: req.ip,
    });
    if (r.conflict) return R.error(res, 409, 'SLOT_UNAVAILABLE', 'Esse horário acabou de ser reservado por outra pessoa.');
    const base = mail.baseUrl(req);
    const link = `${base}/e/${req.params.token}/b/${manage}`;
    const rowLike = { start_at: v.start, end_at: v.end, guest_name: name, guest_email: email, guest_lang: lang, guest_institution: inst };
    if (verify) {
      const m = tpl.render('verify', lang, { name, eq: eq.name, when: formatWhen(v.start, v.end, eq.timezone, lang) }, link);
      await mail.send({ to: email, ...m });
    } else if (status === 'pending') {
      notifyStaff(eq, rowLike, req).catch(() => {});
    }
    const out = { status, start: iso(v.start), end: iso(v.end), email_confirmation_required: verify, hold_minutes: verify ? HOLD_MINUTES : null };
    if (!verify) out.manage_token = manage; // sem e-mail configurado o convidado guarda o link de gestão na tela
    return R.created(res, out);
  } catch (err) { return R.serverError(res, err); }
}

async function byManage(token) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(String(token || ''))) return null;
  const [rows] = await db.query(
    `SELECT b.*, e.name AS eq_name, e.timezone, e.location, e.cancel_until_minutes, e.guest_approval, e.public_token, e.responsible_id, e.community_id, e.id AS eq_id
       FROM equipment_bookings b JOIN equipment e ON e.id = b.equipment_id WHERE b.manage_token_hash = ? AND b.source = 'public'`, [sha256(token)],
  );
  return rows[0] || null;
}
const eqOf = (b) => ({ id: b.eq_id, name: b.eq_name, timezone: b.timezone, location: b.location, public_token: b.public_token, responsible_id: b.responsible_id, community_id: b.community_id, guest_approval: b.guest_approval });
const lateForCancel = (b) => b.status !== 'awaiting_email' && Date.now() > new Date(b.start_at).getTime() - b.cancel_until_minutes * 60000;

// GET /public/bookings/:mt
async function getManaged(req, res) {
  try {
    const b = await byManage(req.params.mt);
    if (!b) return R.notFound(res, 'Reserva');
    const expired = b.status === 'awaiting_email' && new Date(b.hold_expires_at) <= new Date();
    return R.ok(res, {
      ...publicBooking(b, eqOf(b)), status: expired ? 'expired' : b.status,
      can_confirm: b.status === 'awaiting_email' && !expired,
      can_cancel: ['awaiting_email', 'pending', 'confirmed'].includes(b.status) && !expired && new Date(b.end_at) > new Date() && !lateForCancel(b),
      decision_note: b.decision_note, equipment_token: b.public_token,
    });
  } catch (err) { return R.serverError(res, err); }
}

// POST /public/bookings/:mt/confirm   (confirma o e-mail e solta a retenção do horário)
async function confirmManaged(req, res) {
  try {
    const b = await byManage(req.params.mt);
    if (!b) return R.notFound(res, 'Reserva');
    if (b.status !== 'awaiting_email') return R.ok(res, publicBooking(b, eqOf(b)));
    if (new Date(b.hold_expires_at) <= new Date()) return R.error(res, 410, 'EXPIRED', 'O prazo para confirmar o e-mail terminou. Faça um novo pedido.');
    const next = b.guest_approval === 'auto' ? 'confirmed' : 'pending';
    await db.query('UPDATE equipment_bookings SET status = ?, hold_expires_at = NULL WHERE id = ?', [next, b.id]);
    const eq = eqOf(b); const lang = b.guest_lang || 'pt';
    const link = `${mail.baseUrl(req)}/e/${b.public_token}/b/${req.params.mt}`;
    const m = tpl.render(next === 'confirmed' ? 'confirmed' : 'received', lang, { name: b.guest_name, eq: eq.name, when: formatWhen(b.start_at, b.end_at, eq.timezone, lang) }, link);
    await mail.send({ to: b.guest_email, ...m });
    if (next === 'pending') notifyStaff(eq, b, req).catch(() => {});
    return R.ok(res, publicBooking({ ...b, status: next }, eq));
  } catch (err) { return R.serverError(res, err); }
}

// POST /public/bookings/:mt/cancel
async function cancelManaged(req, res) {
  try {
    const b = await byManage(req.params.mt);
    if (!b) return R.notFound(res, 'Reserva');
    if (!['awaiting_email', 'pending', 'confirmed'].includes(b.status)) return R.error(res, 409, 'INVALID_STATE', 'Esta reserva não pode mais ser cancelada.');
    if (lateForCancel(b)) return R.error(res, 409, 'TOO_LATE', 'O prazo para cancelar já passou. Fale com o responsável.');
    await db.query("UPDATE equipment_bookings SET status = 'cancelled', hold_expires_at = NULL, decided_at = ?, decision_note = ? WHERE id = ?", [new Date(), 'Cancelada pelo solicitante.', b.id]);
    return R.ok(res, publicBooking({ ...b, status: 'cancelled' }, eqOf(b)));
  } catch (err) { return R.serverError(res, err); }
}

module.exports = { getPublic, getImage, availability, createGuestBooking, getManaged, confirmManaged, cancelManaged };
