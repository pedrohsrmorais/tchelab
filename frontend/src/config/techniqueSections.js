/**
 * Seções dentro de famílias grandes do Catálogo.
 *
 * A família `01_dados` junta ~60 técnicas de natureza bem diferente (carga de dados, manipulação
 * de arrays, funções matemáticas, estatística básica, álgebra linear). Como o banco não tem uma
 * coluna para isso, a seção é derivada de (family, subcategory, slug) só na apresentação:
 * o banco e o worker continuam como estão.
 */

const STATS_SLUGS = new Set(['corr', 'cov', 'var']);
const SAMPLING_SUBS = new Set(['sample_split', 'split']);
const INPUT_SUBS = new Set(['importacao', 'upload', 'info']);

/** Ordem de exibição das seções da família de dados. */
export const SECTION_ORDER = ['input', 'manipulation', 'sampling', 'math', 'stats', 'linear_algebra'];

/** Seção de uma técnica ('input' | 'manipulation' | …) ou null quando a família não é dividida. */
export function sectionOf(tech) {
  if (tech.family !== '01_dados') return null;
  const sub = tech.subcategory;
  if (STATS_SLUGS.has(tech.slug) || sub === 'estatistica_basica') return 'stats';
  if (sub === 'algebra_linear') return 'linear_algebra';
  if (INPUT_SUBS.has(sub)) return 'input';
  if (SAMPLING_SUBS.has(sub) && tech.slug !== 'split') return 'sampling';
  if (sub === 'manipulation') return 'manipulation';
  return 'math'; // funções elemento a elemento (abs, exp, log…), fórmula personalizada e afins
}

/** Chave i18n do rótulo da subcategoria; `null` quando não há rótulo útil (ex.: "other"). */
export function subcategoryKey(tech) {
  const sub = tech.subcategory;
  if (!sub || sub === 'other' || tech.family === '01_dados') return null;
  return `catalog.sub.${sub}`;
}
