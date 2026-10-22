// Verifica paridade de chaves e placeholders ({{x}}) entre pt, en e es.
// Uso: npm run i18n:check
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../src/i18n/locales');
const load = async (f) => (await import(pathToFileURL(path.join(dir, f)).href)).default;
const [pt, en, es, extra] = await Promise.all(['pt.js', 'en.js', 'es.js', 'extra.js'].map(load));

const flat = (o, p = '', out = {}) => {
  for (const [k, v] of Object.entries(o)) {
    const key = p ? `${p}.${k}` : k;
    if (v && typeof v === 'object') flat(v, key, out); else out[key] = String(v);
  }
  return out;
};
const langs = { pt: { ...flat(pt), ...flat(extra.pt) }, en: { ...flat(en), ...flat(extra.en) }, es: { ...flat(es), ...flat(extra.es) } };
const ph = (s) => [...s.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]).sort().join(',');

let bad = 0;
const all = new Set(Object.values(langs).flatMap((l) => Object.keys(l)));
for (const key of [...all].sort()) {
  for (const code of ['pt', 'en', 'es']) {
    if (!(key in langs[code])) { console.log(`FALTA  [${code}] ${key}`); bad++; }
  }
  const sets = ['pt', 'en', 'es'].filter((c) => key in langs[c]).map((c) => [c, ph(langs[c][key])]);
  if (new Set(sets.map((s) => s[1])).size > 1) { console.log(`PLACEHOLDER diferente: ${key} → ${sets.map((s) => `${s[0]}={${s[1]}}`).join(' ')}`); bad++; }
}
console.log(`${all.size} chaves verificadas — ${bad ? `${bad} problema(s)` : 'paridade OK em pt/en/es'}.`);
process.exit(bad ? 1 : 0);
