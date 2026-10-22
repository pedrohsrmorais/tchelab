'use strict';

/**
 * Disponibilidade de equipamentos — a ÚNICA fonte de verdade sobre "o que pode ser reservado".
 *   livre = janela aberta (no fuso do equipamento) − bloqueios − reservas ativas
 * Usada pelo modal interno, pela página pública e pela validação da reserva.
 * Datas no banco e na API: UTC. Janelas semanais: horário local do equipamento.
 */

const { DateTime } = require('luxon');
const db = require('../config/db.config');

const MAX_RANGE_DAYS = 35;
const ACTIVE = ['pending', 'confirmed'];

const validZone = (tz) => !!tz && DateTime.local().setZone(tz).isValid;
const toDate = (v) => (v instanceof Date ? v : new Date(v));

async function loadRules(equipmentId) {
  const [windows] = await db.query('SELECT weekday, start_time, end_time, audience FROM equipment_windows WHERE equipment_id = ? ORDER BY weekday, start_time', [equipmentId]);
  const [blocks] = await db.query('SELECT uuid, start_at, end_at, reason, show_reason, repeat_until FROM equipment_blocks WHERE equipment_id = ?', [equipmentId]);
  return { windows, blocks };
}

/** Ocorrências de bloqueios (com repetição semanal, mantendo o horário local) que tocam [fromMs, toMs). */
function expandBlocks(blocks, zone, fromMs, toMs) {
  const out = [];
  for (const b of blocks) {
    const s0 = DateTime.fromJSDate(toDate(b.start_at), { zone }); const e0 = DateTime.fromJSDate(toDate(b.end_at), { zone });
    const until = b.repeat_until ? DateTime.fromISO(String(b.repeat_until instanceof Date ? b.repeat_until.toISOString() : b.repeat_until).slice(0, 10), { zone }).endOf('day').toMillis() : null;
    for (let k = 0; k < 160; k += 1) {
      const s = s0.plus({ weeks: k }); const e = e0.plus({ weeks: k });
      if (k > 0 && (until == null || s.toMillis() > until)) break;
      if (s.toMillis() >= toMs) break;
      if (e.toMillis() > fromMs) out.push({ uuid: b.uuid, start: s.toMillis(), end: e.toMillis(), reason: b.reason, show_reason: !!b.show_reason });
      if (until == null) break;
    }
  }
  return out;
}

const hhmm = (t) => String(t).slice(0, 5);

/**
 * @param eq        linha de `equipment`
 * @param opts.from 'YYYY-MM-DD' (dia local, inclusive)  opts.to idem
 * @param opts.audience 'member' | 'public'
 * @param opts.includePast  inclui horários passados (visão da agenda)
 * @param opts.now  Date (testes)
 * @returns {slots:[{start,end,state,reason?,booking?}], ...}   state: free | busy | blocked | past
 */
async function computeSlots(eq, opts) {
  const zone = eq.timezone;
  const now = opts.now ? DateTime.fromJSDate(opts.now) : DateTime.now();
  const from = DateTime.fromISO(opts.from, { zone }).startOf('day');
  const to = DateTime.fromISO(opts.to, { zone }).endOf('day');
  if (!from.isValid || !to.isValid || to < from) throw Object.assign(new Error('Período inválido.'), { code: 'BAD_RANGE' });
  if (to.diff(from, 'days').days > MAX_RANGE_DAYS) throw Object.assign(new Error(`Período máximo de ${MAX_RANGE_DAYS} dias.`), { code: 'BAD_RANGE' });

  const { windows, blocks } = opts.rules || await loadRules(eq.id);
  const usable = windows.filter((w) => opts.audience !== 'public' || w.audience === 'public');
  const fromMs = from.toMillis(); const toMs = to.toMillis() + 1;
  const blockOcc = expandBlocks(blocks, zone, fromMs, toMs);
  const [books] = await db.query(
    `SELECT b.uuid, b.start_at, b.end_at, b.status, b.source, b.user_id, b.guest_name, b.guest_institution, u.name AS user_name
       FROM equipment_bookings b LEFT JOIN users u ON u.id = b.user_id
      WHERE b.equipment_id = ? AND b.start_at < ? AND b.end_at > ?
        AND (b.status IN ('pending','confirmed') OR (b.status = 'awaiting_email' AND b.hold_expires_at > ?))`,
    [eq.id, new Date(toMs), new Date(fromMs), new Date()],
  );
  const bookMs = books.map((b) => ({ ...b, s: toDate(b.start_at).getTime(), e: toDate(b.end_at).getTime() }));

  const minStart = now.plus({ minutes: eq.min_notice_minutes }).toMillis();
  const maxEnd = now.plus({ days: eq.max_advance_days }).endOf('day').toMillis();
  const slotMs = eq.slot_minutes * 60000;
  const slots = [];
  for (let day = from; day <= to; day = day.plus({ days: 1 })) {
    const wd = day.weekday % 7; // luxon: 1=seg..7=dom → 0=dom
    for (const w of usable.filter((x) => x.weekday === wd)) {
      const [sh, sm] = hhmm(w.start_time).split(':').map(Number); const [eh, em] = hhmm(w.end_time).split(':').map(Number);
      const wEnd = day.set({ hour: eh, minute: em, second: 0, millisecond: 0 }).toMillis();
      let cur = day.set({ hour: sh, minute: sm, second: 0, millisecond: 0 }).toMillis();
      while (cur + slotMs <= wEnd) {
        const s = cur; const e = cur + slotMs; cur = e;
        const bk = bookMs.find((b) => b.s < e && b.e > s);
        const bl = blockOcc.find((b) => b.start < e && b.end > s);
        let state = 'free';
        if (bk) state = 'busy'; else if (bl) state = 'blocked'; else if (s < minStart || e > maxEnd) state = 'past';
        if (!opts.includePast && (state === 'past' || e <= now.toMillis())) continue; // passado/fora da antecedência: só na visão da agenda
        const slot = { start: new Date(s).toISOString(), end: new Date(e).toISOString(), state };
        if (bk) slot.booking = { uuid: bk.uuid, status: bk.status, source: bk.source, user_id: bk.user_id, name: bk.user_name || bk.guest_name, institution: bk.guest_institution };
        if (bl && state === 'blocked') slot.reason = bl.show_reason ? bl.reason : null;
        slots.push(slot);
      }
    }
  }
  slots.sort((a, b) => a.start.localeCompare(b.start));
  return slots;
}

/**
 * Valida um pedido [start,end) e devolve {error:{code,message}} ou {start:Date,end:Date}.
 * Todo slot do intervalo precisa estar livre (e o início alinhado à grade).
 */
async function validateRange(eq, startIso, endIso, audience, now) {
  const start = new Date(startIso); const end = new Date(endIso);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return { error: { code: 'BAD_RANGE', message: 'Horário inválido.' } };
  const minutes = (end - start) / 60000;
  if (!Number.isInteger(minutes) || minutes % eq.slot_minutes !== 0) return { error: { code: 'BAD_RANGE', message: `A duração precisa ser múltipla de ${eq.slot_minutes} minutos.` } };
  if (minutes < eq.min_minutes) return { error: { code: 'TOO_SHORT', message: `Duração mínima: ${eq.min_minutes} minutos.` } };
  if (minutes > eq.max_minutes) return { error: { code: 'TOO_LONG', message: `Duração máxima: ${eq.max_minutes} minutos.` } };
  const zone = eq.timezone;
  const d1 = DateTime.fromJSDate(start, { zone }).toISODate(); const d2 = DateTime.fromJSDate(new Date(end - 1), { zone }).toISODate();
  const slots = await computeSlots(eq, { from: d1, to: d2, audience, includePast: false, now });
  const byStart = new Map(slots.map((s) => [new Date(s.start).getTime(), s]));
  for (let t = start.getTime(); t < end.getTime(); t += eq.slot_minutes * 60000) {
    const s = byStart.get(t);
    if (!s || s.state !== 'free') return { error: { code: 'SLOT_UNAVAILABLE', message: 'Esse horário não está disponível.' } };
  }
  return { start, end };
}

/** Conflito com reservas ativas, dentro de uma transação (conn) que já travou a linha do equipamento. */
async function hasConflict(conn, equipmentId, start, end) {
  const [[{ n }]] = await conn.query(
    `SELECT COUNT(*) AS n FROM equipment_bookings
      WHERE equipment_id = ? AND start_at < ? AND end_at > ?
        AND (status IN ('pending','confirmed') OR (status = 'awaiting_email' AND hold_expires_at > ?))`,
    [equipmentId, end, start, new Date()],
  );
  return n > 0;
}

module.exports = { computeSlots, validateRange, hasConflict, loadRules, expandBlocks, validZone, MAX_RANGE_DAYS, ACTIVE };
