/** Formata bytes em B/KB/MB/GB (base 1024, igual ao backend: 100 MB = 104 857 600 bytes). */
export function formatBytes(n, lang) {
  const v = Number(n) || 0;
  const nf = (x, d) => new Intl.NumberFormat(lang || undefined, { maximumFractionDigits: d, minimumFractionDigits: 0 }).format(x);
  if (v < 1024) return `${nf(v, 0)} B`;
  if (v < 1024 * 1024) return `${nf(v / 1024, v < 10240 ? 1 : 0)} KB`;
  if (v < 1024 ** 3) return `${nf(v / 1024 ** 2, v < 10 * 1024 ** 2 ? 1 : 0)} MB`;
  return `${nf(v / 1024 ** 3, 2)} GB`;
}

/** Duração de CPU em segundos → "850 ms", "42 s", "12 min 30 s" ou "1,5 h". */
export function formatCpu(sec, lang) {
  const s = Number(sec) || 0;
  const nf = (x, d) => new Intl.NumberFormat(lang || undefined, { maximumFractionDigits: d }).format(x);
  if (s < 1) return `${nf(s * 1000, 0)} ms`;
  if (s < 60) return `${nf(s, s < 10 ? 1 : 0)} s`;
  if (s < 3600) return `${Math.floor(s / 60)} min ${Math.round(s % 60)} s`;
  return `${nf(s / 3600, 1)} h`;
}

/** Valor monetário com a moeda configurada pelo admin; valores pequenos ganham mais casas decimais. */
export function formatMoney(v, currency = 'USD', lang) {
  const n = Number(v) || 0;
  try {
    return new Intl.NumberFormat(lang || undefined, { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: n !== 0 && Math.abs(n) < 1 ? 4 : 2 }).format(n);
  } catch { return `${currency} ${n.toFixed(2)}`; }
}
