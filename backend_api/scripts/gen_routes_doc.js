'use strict';
/**
 * Gera docs/api_rotas.md a partir de src/routes/api.routes.js (a fonte da verdade das rotas).
 *   node scripts/gen_routes_doc.js           → escreve ../docs/api_rotas.md
 *   node scripts/gen_routes_doc.js --check   → falha (exit 1) se o arquivo estiver desatualizado (útil em CI)
 * Agrupa pelos cabeçalhos "// ─── NOME ───" do arquivo de rotas; "acesso" vem dos middlewares declarados na rota.
 */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '../src/routes/api.routes.js');
const OUT = path.join(__dirname, '../../docs/api_rotas.md');

const lines = fs.readFileSync(SRC, 'utf8').split('\n');
const groups = []; let cur = { name: 'Geral', routes: [] }; groups.push(cur);
let buf = '';
for (const raw of lines) {
  const h = raw.match(/^\/\/ ─+\s*(.+?)\s*─+\s*$/);
  if (h) { cur = { name: h[1], routes: [] }; groups.push(cur); continue; }
  buf = buf ? `${buf} ${raw.trim()}` : raw;
  if (!/^router\./.test(buf.trim())) { buf = ''; continue; }
  if (!/\);\s*(\/\/.*)?$/.test(buf.trim())) continue; // rota em várias linhas: continua juntando
  const m = buf.match(/^router\.(get|post|put|patch|delete)\s*\(\s*'([^']+)'\s*,\s*(.+?)\)\s*;?\s*(?:\/\/\s*(.*))?$/);
  buf = '';
  if (!m) continue;
  const [, method, route, rest, note] = m;
  const mids = rest.split(',').map((s) => s.trim());
  const handler = mids[mids.length - 1];
  let access = 'pública';
  if (mids.includes('authenticate')) access = 'login';
  const cg = rest.match(/cg\('(\w+)'\)/); if (cg) access = `login + papel ${cg[1]}+ na comunidade`;
  if (mids.some((s) => /assertSelfOrAdmin/.test(s))) access = 'login (próprio ou admin)';
  if (/^\/admin\//.test(route)) access = 'login + admin';
  cur.routes.push({ method: method.toUpperCase(), route: `/api/v1${route}`, access, handler, note: note || '' });
}

const total = groups.reduce((n, g) => n + g.routes.length, 0);
let md = `# Rotas da API (geradas do código)

> **Não edite à mão.** Gerado por \`backend_api/scripts/gen_routes_doc.js\` a partir de \`backend_api/src/routes/api.routes.js\`
> (${total} rotas). Para atualizar: \`cd backend_api && node scripts/gen_routes_doc.js\`.
> Descrição de cada área, regras e exemplos: [api.md](api.md) (núcleo), [apps_comunidade.md](apps_comunidade.md) (Quiz, Equipamentos, Quadro),
> [comunidades_perfil_i18n.md](comunidades_perfil_i18n.md) (perfil, comunidades, idiomas) e [armazenamento.md](armazenamento.md) (cota e consumo).

Convenções: prefixo \`/api/v1\`; respostas \`{ data, meta, error }\`; "acesso" é o que a rota exige no roteador (regras mais finas
— dono do recurso, papel, visibilidade — ficam no controller). Cota de armazenamento: **413** \`STORAGE_QUOTA_EXCEEDED\`/\`FILE_TOO_LARGE\`,
**503** \`STORAGE_SERVER_FULL\`; orçamento de CPU: **402** \`CPU_BUDGET_EXCEEDED\`.

`;
for (const g of groups.filter((x) => x.routes.length)) {
  md += `## ${g.name}\n\n| Método | Rota | Acesso | Handler |\n|---|---|---|---|\n`;
  for (const r of g.routes) md += `| ${r.method} | \`${r.route}\` | ${r.access} | \`${r.handler}\`${r.note ? ` — ${r.note}` : ''} |\n`;
  md += '\n';
}
if (process.argv.includes('--check')) {
  const cur0 = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
  if (cur0 !== md) { console.error('docs/api_rotas.md desatualizado — rode: node scripts/gen_routes_doc.js'); process.exit(1); }
  console.log('docs/api_rotas.md em dia'); process.exit(0);
}
fs.writeFileSync(OUT, md);
console.log(`docs/api_rotas.md gerado com ${total} rotas em ${groups.filter((x) => x.routes.length).length} áreas`);
