'use strict';
/**
 * Confere a cobertura da tradução do catálogo (src/catalog_i18n/{en,es}.json) contra o banco:
 *  - todo slug ativo tem tradução; todo campo de texto/porta/parâmetro em pt tem tradução;
 *  - não sobra chave "órfã" (slug/porta/parâmetro que não existe mais no banco);
 *  - `código` entre crases é preservado.
 * Uso:  node tests/catalog_i18n_check.js   (usa as variáveis DB_* do backend)
 */
const db = require('../src/config/db.config');
const { DICT } = require('../src/utils/catalogI18n');
const pj = (v) => { try { return typeof v === 'string' ? JSON.parse(v) : (v || {}); } catch { return {}; } };
const ticks = (s) => (String(s).match(/`[^`]+`/g) || []).sort().join('|');

(async () => {
  const [rows] = await db.query('SELECT slug,name,description,how_it_works,usage_tips,historical_note,input_schema,output_schema,parameter_schema FROM techniques WHERE active=1');
  const problems = [];
  for (const lang of ['en', 'es']) {
    const d = DICT[lang];
    const slugs = new Set(rows.map((r) => r.slug));
    for (const s of Object.keys(d)) if (!slugs.has(s)) problems.push(`${lang}: slug órfão ${s}`);
    for (const r of rows) {
      const t = d[r.slug];
      if (!t) { problems.push(`${lang}: sem tradução para ${r.slug}`); continue; }
      for (const f of ['description', 'how_it_works', 'usage_tips', 'historical_note']) {
        if (r[f] && !t[f]) problems.push(`${lang}:${r.slug}.${f} ausente`);
        if (r[f] && t[f] && ticks(r[f]) !== ticks(t[f])) problems.push(`${lang}:${r.slug}.${f} código entre crases difere`);
      }
      for (const [col, key] of [['input_schema', 'input'], ['output_schema', 'output'], ['parameter_schema', 'params']]) {
        const sc = pj(r[col]);
        for (const [p, v] of Object.entries(sc)) if (v && v.description && !(t[key] && t[key][p])) problems.push(`${lang}:${r.slug}.${key}.${p} ausente`);
        for (const p of Object.keys(t[key] || {})) if (!sc[p]) problems.push(`${lang}:${r.slug}.${key}.${p} órfão`);
      }
    }
  }
  if (problems.length) { console.log(problems.slice(0, 50).join('\n')); console.log(`\n✗ ${problems.length} problema(s)`); process.exit(1); }
  console.log(`✓ catálogo traduzido: ${rows.length} técnicas × (en, es) — cobertura completa`);
  process.exit(0);
})();
