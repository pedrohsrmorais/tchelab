'use strict';

/**
 * Regras das colunas do Quadro: tipos, configuração (rótulos de status, opções), validação do valor de uma
 * célula e texto legível para o histórico. Sem acesso a banco — as pessoas (coluna `people`) são resolvidas
 * no controller.
 */

const crypto = require('crypto');

const TYPES = ['text', 'status', 'people', 'date', 'timeline', 'number', 'checkbox', 'link', 'dropdown'];
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_LABELS = 20;
const MAX_OPTIONS = 50;
const MAX_PEOPLE = 20;

const newId = () => crypto.randomBytes(4).toString('hex');

function validDate(s) {
  if (typeof s !== 'string' || !DATE_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

const DEFAULT_STATUS = {
  pt: [['A fazer', '#c4c4c4', false], ['Em andamento', '#fdab3d', false], ['Bloqueado', '#e2445c', false], ['Feito', '#00c875', true]],
  en: [['To do', '#c4c4c4', false], ['In progress', '#fdab3d', false], ['Blocked', '#e2445c', false], ['Done', '#00c875', true]],
  es: [['Por hacer', '#c4c4c4', false], ['En curso', '#fdab3d', false], ['Bloqueado', '#e2445c', false], ['Hecho', '#00c875', true]],
};

function labelsFrom(list) { return list.map(([label, color, done], i) => ({ id: `s${i + 1}${newId().slice(0, 3)}`, label, color, done: !!done })); }

function defaultConfig(type, lang = 'pt') {
  if (type === 'status') return { labels: labelsFrom(DEFAULT_STATUS[lang] || DEFAULT_STATUS.pt) };
  if (type === 'dropdown') return { options: [] };
  if (type === 'number') return { unit: '', decimals: null };
  if (type === 'people') return { multiple: true };
  return {};
}

/** Normaliza `config` de acordo com o tipo. Devolve { value } ou { error }. */
function cleanConfig(type, cfg) {
  const c = cfg && typeof cfg === 'object' && !Array.isArray(cfg) ? cfg : {};
  if (type === 'status' || type === 'dropdown') {
    const key = type === 'status' ? 'labels' : 'options';
    const max = type === 'status' ? MAX_LABELS : MAX_OPTIONS;
    const src = c[key];
    if (!Array.isArray(src)) return { error: 'Informe a lista de opções.' };
    if (src.length > max) return { error: `No máximo ${max} opções.` };
    if (type === 'status' && !src.length) return { error: 'Mantenha ao menos um rótulo.' };
    const seen = new Set(); const out = [];
    for (const raw of src) {
      const label = String(raw?.label ?? '').trim();
      if (!label) return { error: 'Todo rótulo precisa de um nome.' };
      if (label.length > 40) return { error: 'Rótulo com no máximo 40 caracteres.' };
      let id = typeof raw.id === 'string' && /^[a-z0-9_-]{2,16}$/i.test(raw.id) ? raw.id : newId();
      if (seen.has(id)) id = newId();
      seen.add(id);
      const color = COLOR_RE.test(raw?.color || '') ? raw.color.toLowerCase() : '#c4c4c4';
      const item = { id, label, color };
      if (type === 'status') item.done = raw?.done === true;
      out.push(item);
    }
    return { value: { [key]: out } };
  }
  if (type === 'number') {
    const unit = String(c.unit ?? '').trim().slice(0, 12);
    const d = c.decimals === null || c.decimals === undefined || c.decimals === '' ? null : Number(c.decimals);
    if (d !== null && !(Number.isInteger(d) && d >= 0 && d <= 6)) return { error: 'Casas decimais entre 0 e 6.' };
    return { value: { unit, decimals: d } };
  }
  if (type === 'people') return { value: { multiple: c.multiple !== false } };
  return { value: {} };
}

const labelsOf = (col) => (col.type === 'status' ? col.config?.labels : col.config?.options) || [];

/**
 * Valida o valor de uma célula. Retorna { value } (valor a guardar; `null` = limpar) ou { error }.
 * Para `people`, o valor devolvido é a lista de uuids (resolvida depois).
 */
function cleanCell(col, v) {
  if (v === undefined) return { error: 'Informe o valor.' };
  if (v === null || v === '') return { value: null };
  switch (col.type) {
    case 'text': {
      const s = String(v).trim();
      if (s.length > 1000) return { error: 'Máximo 1000 caracteres.' };
      return { value: s || null };
    }
    case 'number': {
      const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
      if (!Number.isFinite(n) || Math.abs(n) >= 1e15) return { error: 'Número inválido.' };
      return { value: n };
    }
    case 'checkbox':
      if (typeof v !== 'boolean') return { error: 'Use verdadeiro ou falso.' };
      return { value: v ? true : null };
    case 'date':
      if (!validDate(v)) return { error: 'Data inválida (AAAA-MM-DD).' };
      return { value: v };
    case 'timeline': {
      if (!v || typeof v !== 'object' || !validDate(v.start) || !validDate(v.end)) return { error: 'Período inválido.' };
      if (v.end < v.start) return { error: 'O fim não pode ser antes do início.' };
      return { value: { start: v.start, end: v.end } };
    }
    case 'link': {
      const raw = typeof v === 'string' ? { url: v } : v;
      const url = String(raw?.url || '').trim();
      if (!/^https?:\/\/[^\s]+$/i.test(url) || url.length > 500) return { error: 'Link inválido (use http:// ou https://).' };
      const text = String(raw?.text || '').trim().slice(0, 100);
      return { value: text ? { url, text } : { url } };
    }
    case 'status': {
      if (typeof v !== 'string' || !labelsOf(col).some((l) => l.id === v)) return { error: 'Rótulo inexistente.' };
      return { value: v };
    }
    case 'dropdown': {
      if (!Array.isArray(v)) return { error: 'Informe uma lista.' };
      const ids = [...new Set(v.map(String))];
      if (ids.length > 20) return { error: 'No máximo 20 opções.' };
      if (ids.some((id) => !labelsOf(col).some((l) => l.id === id))) return { error: 'Opção inexistente.' };
      return { value: ids.length ? ids : null };
    }
    case 'people': {
      if (!Array.isArray(v)) return { error: 'Informe uma lista de pessoas.' };
      const ids = [...new Set(v.map(String))];
      if (ids.length > MAX_PEOPLE) return { error: `No máximo ${MAX_PEOPLE} pessoas.` };
      if (col.config?.multiple === false && ids.length > 1) return { error: 'Esta coluna aceita uma pessoa.' };
      return { value: ids };
    }
    default: return { error: 'Tipo de coluna desconhecido.' };
  }
}

/** Texto curto para o histórico ("Em andamento", "22/10 → 30/10"...). `peopleNames` = nomes já resolvidos. */
function display(col, v, peopleNames) {
  if (v === null || v === undefined || (Array.isArray(v) && !v.length)) return '';
  switch (col.type) {
    case 'status': return labelsOf(col).find((l) => l.id === v)?.label || '';
    case 'dropdown': return v.map((id) => labelsOf(col).find((l) => l.id === id)?.label).filter(Boolean).join(', ');
    case 'people': return (peopleNames || []).join(', ');
    case 'timeline': return `${v.start} → ${v.end}`;
    case 'link': return v.url;
    case 'checkbox': return v ? '✓' : '';
    default: return String(v);
  }
}

/** Quais tipos o responsável pelo item pode editar mesmo quando o quadro é só da equipe. */
const ASSIGNEE_TYPES = ['status', 'checkbox'];

function doneIds(col) { return new Set((col?.config?.labels || []).filter((l) => l.done).map((l) => l.id)); }

/** Resumo de progresso de um quadro: coluna de status principal, coluna de prazo principal. */
function summarize(columns, items, today) {
  const status = columns.find((c) => c.type === 'status');
  const due = columns.find((c) => c.type === 'date' || c.type === 'timeline');
  const done = doneIds(status);
  let nDone = 0; let overdue = 0;
  items.forEach((it) => {
    const isDone = status ? done.has(it.cells?.[status.uuid]) : false;
    if (isDone) nDone += 1;
    if (due && !isDone) {
      const d = it.cells?.[due.uuid];
      const end = due.type === 'timeline' ? d?.end : d;
      if (end && end < today) overdue += 1;
    }
  });
  return { total: items.length, done: nDone, overdue, has_status: !!status };
}

module.exports = { TYPES, COLOR_RE, validDate, defaultConfig, cleanConfig, cleanCell, display, labelsOf, labelsFrom, DEFAULT_STATUS, ASSIGNEE_TYPES, doneIds, summarize, newId, MAX_PEOPLE };
