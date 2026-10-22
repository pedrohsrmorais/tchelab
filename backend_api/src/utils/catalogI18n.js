'use strict';
/**
 * Tradução do catálogo de técnicas (pt = idioma-fonte, gravado no banco).
 *
 * Os textos traduzidos ficam em arquivos laterais `src/catalog_i18n/<lang>.json`,
 * indexados por slug, e são aplicados em tempo de resposta. Qualquer campo ausente
 * cai de volta para o texto em português do banco (fallback por campo, nunca quebra).
 *
 * Formato de cada slug:
 *   { name, description, how_it_works, usage_tips, historical_note,
 *     input: {porta: texto}, output: {porta: texto}, params: {param: texto} }
 */
const path = require('path');
const fs = require('fs');

const SUPPORTED = ['en', 'es'];
const DICT = {};
for (const lang of SUPPORTED) {
  try {
    DICT[lang] = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'catalog_i18n', `${lang}.json`), 'utf8'));
  } catch { DICT[lang] = {}; }
}

/** Resolve o idioma do pedido: ?lang= tem prioridade sobre Accept-Language. 'pt' = sem tradução. */
function resolveLang(req) {
  const raw = String(req.query?.lang || req.headers?.['accept-language'] || '').toLowerCase();
  const first = raw.split(',')[0].trim().slice(0, 2);
  return SUPPORTED.includes(first) ? first : 'pt';
}

const SCHEMA_FIELDS = [['input_schema', 'input'], ['output_schema', 'output'], ['parameter_schema', 'params']];

function translateSchema(value, texts) {
  if (!texts || value == null || value === '') return value;
  const wasString = typeof value === 'string';
  let obj;
  try { obj = wasString ? JSON.parse(value) : value; } catch { return value; }
  if (!obj || typeof obj !== 'object') return value;
  const copy = Array.isArray(obj) ? obj.slice() : { ...obj };
  for (const [key, txt] of Object.entries(texts)) {
    if (copy[key] && typeof copy[key] === 'object') copy[key] = { ...copy[key], description: txt };
  }
  return wasString ? JSON.stringify(copy) : copy;
}

/** Devolve uma cópia da linha com os campos traduzidos (ou a própria linha se lang = pt / sem dicionário). */
function localizeTechnique(row, lang) {
  if (!row || lang === 'pt' || !DICT[lang]) return row;
  const t = DICT[lang][row.slug];
  if (!t) return row;
  const out = { ...row };
  for (const f of ['name', 'description', 'how_it_works', 'usage_tips', 'historical_note']) {
    if (t[f] && f in out) out[f] = t[f];
  }
  for (const [col, key] of SCHEMA_FIELDS) {
    if (col in out && t[key]) out[col] = translateSchema(out[col], t[key]);
  }
  return out;
}

const localizeMany = (rows, lang) => (lang === 'pt' ? rows : rows.map((r) => localizeTechnique(r, lang)));

module.exports = { resolveLang, localizeTechnique, localizeMany, SUPPORTED, DICT };
