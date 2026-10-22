import { currentLocale } from '../../i18n';

export const PALETTE = ['#00c875', '#9cd326', '#cab641', '#ffcb00', '#fdab3d', '#ff642e', '#e2445c', '#ff158a', '#ff5ac4', '#a25ddc', '#784bd1', '#7f5347', '#579bfc', '#66ccff', '#037f4c', '#4eccc6', '#c4c4c4', '#808080', '#333333', '#bb3354'];

/** Cor do texto legível sobre um fundo hexadecimal: escolhe preto ou branco pelo maior contraste (WCAG). */
export function ink(hex) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return '#fff';
  const n = parseInt(m[1], 16);
  const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const L = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  // contraste com branco = 1.05 / (L + .05); com preto-azulado (#1f2937, L≈.022) = (L + .05) / .072
  return 1.05 / (L + 0.05) >= (L + 0.05) / 0.072 ? '#fff' : '#1f2937';
}

export const arr = (x) => (Array.isArray(x) ? x : []);

const pad = (n) => String(n).padStart(2, '0');
export const toKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayKey = () => toKey(new Date());
export const parseKey = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
export const addDaysKey = (k, n) => { const d = parseKey(k); d.setDate(d.getDate() + n); return toKey(d); };

/** "22 out" (ou "22 out 2027" se for outro ano). */
export function fmtDay(k, { withYear } = {}) {
  if (!k) return '';
  const d = parseKey(k);
  const y = withYear ?? d.getFullYear() !== new Date().getFullYear();
  return d.toLocaleDateString(currentLocale(), { day: '2-digit', month: 'short', ...(y ? { year: 'numeric' } : {}) }).replace('.', '');
}
export const fmtRangeKeys = (a, b) => (a === b ? fmtDay(a) : `${fmtDay(a)} – ${fmtDay(b)}`);

export function fmtDateTime(iso) {
  return new Date(iso).toLocaleString(currentLocale(), { dateStyle: 'short', timeStyle: 'short' });
}

export function timeAgo(iso, t) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return t('board.justNow');
  if (s < 3600) return t('board.minutesAgo', { n: Math.floor(s / 60) });
  if (s < 86400) return t('board.hoursAgo', { n: Math.floor(s / 3600) });
  if (s < 86400 * 7) return t('board.daysAgo', { n: Math.floor(s / 86400) });
  return fmtDateTime(iso);
}

export const labelsOf = (col) => (col?.type === 'status' ? col.config?.labels : col?.config?.options) || [];
export const labelOf = (col, id) => labelsOf(col).find((l) => l.id === id);
export const isDoneItem = (columns, item) => {
  const st = columns.find((c) => c.type === 'status');
  return !!(st && labelOf(st, item.cells[st.uuid])?.done);
};
export const dueOf = (columns, item) => {
  const c = columns.find((x) => x.type === 'date' || x.type === 'timeline');
  if (!c) return null;
  const v = item.cells[c.uuid];
  return c.type === 'timeline' ? v?.end || null : v || null;
};
export const isOverdue = (columns, item) => { const d = dueOf(columns, item); return !!d && d < todayKey() && !isDoneItem(columns, item); };

/** O usuário pode editar esta coluna neste item? */
export function canEditCell(item, col, structure) {
  if (!item) return false;
  void structure;
  if (item.access === 'all') return true;
  if (item.access === 'status') return col.type === 'status' || col.type === 'checkbox';
  return false;
}

/** Texto pesquisável de um item. */
export function haystack(item, columns, members) {
  const parts = [item.title, `#${item.seq}`];
  columns.forEach((c) => {
    const v = item.cells[c.uuid];
    if (v == null) return;
    if (c.type === 'text') parts.push(v);
    else if (c.type === 'link') parts.push(v.url, v.text || '');
    else if (c.type === 'status') parts.push(labelOf(c, v)?.label || '');
    else if (c.type === 'dropdown') arr(v).forEach((id) => parts.push(labelOf(c, id)?.label || ''));
    else if (c.type === 'people') arr(v).forEach((u) => parts.push(members.find((m) => m.uuid === u)?.name || ''));
  });
  return parts.join(' ').toLowerCase();
}

/** Aplica busca, filtros e ordenação. `f` = { q, people:[uuid|'none'], status:{colUuid:[labelId|'none']}, overdue, hideDone }. */
export function applyFilters(items, columns, members, f, sort) {
  let out = items;
  const q = (f.q || '').trim().toLowerCase();
  if (q) out = out.filter((i) => haystack(i, columns, members).includes(q));
  if (arr(f.people).length) {
    const pcols = columns.filter((c) => c.type === 'people');
    out = out.filter((i) => {
      const all = pcols.flatMap((c) => arr(i.cells[c.uuid]));
      return f.people.some((p) => (p === 'none' ? all.length === 0 : all.includes(p)));
    });
  }
  Object.entries(f.status || {}).forEach(([cu, ids]) => {
    if (!arr(ids).length) return;
    out = out.filter((i) => ids.some((id) => (id === 'none' ? !i.cells[cu] : i.cells[cu] === id)));
  });
  if (f.overdue) out = out.filter((i) => isOverdue(columns, i));
  if (f.hideDone) out = out.filter((i) => !isDoneItem(columns, i));
  if (sort?.col) {
    const col = sort.col === 'title' ? { type: 'title' } : columns.find((c) => c.uuid === sort.col);
    if (col) {
      const key = (i) => {
        if (col.type === 'title') return (i.title || '').toLowerCase();
        const v = i.cells[sort.col];
        if (v == null) return null;
        switch (col.type) {
          case 'status': return labelsOf(col).findIndex((l) => l.id === v);
          case 'dropdown': return labelOf(col, arr(v)[0])?.label?.toLowerCase() ?? null;
          case 'people': return members.find((m) => m.uuid === arr(v)[0])?.name?.toLowerCase() ?? null;
          case 'timeline': return v.start;
          case 'link': return v.url;
          case 'checkbox': return v ? 1 : 0;
          case 'text': return String(v).toLowerCase();
          default: return v;
        }
      };
      const dir = sort.dir === 'desc' ? -1 : 1;
      out = [...out].sort((a, b) => {
        const ka = key(a); const kb = key(b);
        if (ka == null && kb == null) return 0;
        if (ka == null) return 1;
        if (kb == null) return -1;
        return (ka < kb ? -1 : ka > kb ? 1 : 0) * dir;
      });
    }
  }
  return out;
}

export function formatNumber(v, col) {
  if (v == null) return '';
  const d = col?.config?.decimals;
  const s = typeof d === 'number' ? Number(v).toLocaleString(currentLocale(), { minimumFractionDigits: d, maximumFractionDigits: d }) : Number(v).toLocaleString(currentLocale(), { maximumFractionDigits: 6 });
  return col?.config?.unit ? `${s} ${col.config.unit}` : s;
}

/** Preferências de visualização por quadro, guardadas só neste navegador. */
export function loadPrefs(bid) {
  try { return JSON.parse(localStorage.getItem(`tl_board_${bid}`)) || {}; } catch { return {}; }
}
export function savePrefs(bid, p) {
  try { localStorage.setItem(`tl_board_${bid}`, JSON.stringify(p)); } catch { /* sem armazenamento */ }
}
