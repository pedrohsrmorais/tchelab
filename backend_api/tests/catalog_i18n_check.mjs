// Confere a cobertura da tradução do catálogo: toda técnica nativa (ativa ou não) precisa ter,
// em en e es, descrição, textos de portas e parâmetros (quando existirem no banco) e nenhum
// texto traduzido pode conter palavras típicas do português.   Uso: node tests/catalog_i18n_check.mjs
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const db = require('../src/config/db.config.js');
const { DICT } = require('../src/utils/catalogI18n.js');

let ok = 0; const fails = [];
const check = (c, msg) => { if (c) ok++; else fails.push(msg); };
const js = (v) => { try { return typeof v === 'string' ? JSON.parse(v) : v; } catch { return null; } };
const PT_EN = /\b(não|você|também|quando|pelo|pela|sobre|seus|suas|onde|amostras|variáveis|dados|para o|para a|com a|com o)\b/i;
// em espanhol, 'sobre', 'dados' e 'onde' são palavras válidas: só entram as que existem apenas em português
const PT_ES = /\b(não|você|também|quando|pelo|pela|seus|suas|amostras|variáveis|para o|para a|com a|com o)\b/i;
const EN_IN_ES = /\b(the|and|with|from|is|are)\b/i;

const [rows] = await db.query('SELECT slug, name, description, how_it_works, usage_tips, historical_note, input_schema, output_schema, parameter_schema FROM techniques WHERE is_custom = 0');
for (const lang of ['en', 'es']) {
  for (const r of rows) {
    const t = DICT[lang][r.slug];
    check(!!t, `${lang}/${r.slug}: sem entrada`); if (!t) continue;
    check(!(lang === 'en' ? /[ãõç]|\b(de|do|da|dos|das|para|com)\s/i : /[ãõç]|\b(do|dos|das|para|com)\s/i).test(t.name || r.name), `${lang}/${r.slug}: nome parece português → ${t.name || r.name}`);
    if (r.description) check(!!t.description, `${lang}/${r.slug}: sem description`);
    for (const f of ['how_it_works', 'usage_tips', 'historical_note']) if (r[f]) check(!!t[f], `${lang}/${r.slug}: sem ${f}`);
    for (const [col, key] of [['input_schema', 'input'], ['output_schema', 'output'], ['parameter_schema', 'params']]) {
      const o = js(r[col]);
      if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) if (v && typeof v === 'object' && v.description) check(!!(t[key] || {})[k], `${lang}/${r.slug}: sem ${key}.${k}`);
    }
    const texts = [t.description, t.how_it_works, t.usage_tips, t.historical_note, ...Object.values(t.input || {}), ...Object.values(t.output || {}), ...Object.values(t.params || {})].filter(Boolean);
    for (const s of texts) {
      check(!(lang === 'en' ? PT_EN : PT_ES).test(s), `${lang}/${r.slug}: parece português → ${s.slice(0, 70)}`);
      if (lang === 'es') check(!EN_IN_ES.test(s.replace(/\([^)]*\)/g, '').replace(/"[^"]*"/g, '')), `es/${r.slug}: parece inglês → ${s.slice(0, 70)}`);
    }
  }
  // não pode sobrar entrada órfã (slug removido do banco)
  const slugs = new Set(rows.map((r) => r.slug));
  for (const s of Object.keys(DICT[lang])) check(slugs.has(s), `${lang}/${s}: entrada sem técnica no banco`);
}
console.log(`${ok} ok, ${fails.length} falhas`);
fails.slice(0, 40).forEach((f) => console.log('  FAIL', f));
process.exit(fails.length ? 1 : 0);
