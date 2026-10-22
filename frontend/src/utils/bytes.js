/** Formata bytes em B/KB/MB/GB (base 1024, igual ao backend: 100 MB = 104 857 600 bytes). */
export function formatBytes(n, lang) {
  const v = Number(n) || 0;
  const nf = (x, d) => new Intl.NumberFormat(lang || undefined, { maximumFractionDigits: d, minimumFractionDigits: 0 }).format(x);
  if (v < 1024) return `${nf(v, 0)} B`;
  if (v < 1024 * 1024) return `${nf(v / 1024, v < 10240 ? 1 : 0)} KB`;
  if (v < 1024 ** 3) return `${nf(v / 1024 ** 2, v < 10 * 1024 ** 2 ? 1 : 0)} MB`;
  return `${nf(v / 1024 ** 3, 2)} GB`;
}
