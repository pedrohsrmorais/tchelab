// Teste do consumo por usuário: worker mede CPU/memória por job → resultConsumer grava em `jobs` e `usage_monthly` →
// endpoints do usuário e do admin, armazenamento ao longo do tempo (GB·hora) e calculadora de custo/licença.
// Requer: backend e WORKER Python no ar. Uso: node tests/usage_e2e.mjs [http://localhost:3003]
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const db = require('../src/config/db.config');
const usageSvc = require('../src/services/usage.service');
const pipeline = require('../src/services/executionPipeline.service');

const BASE = (process.argv[2] || 'http://localhost:3003') + '/api/v1';
const stamp = Date.now().toString(36);
let pass = 0; let fail = 0;
async function call(token, method, p, body) {
  const headers = {}; if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const r = await fetch(BASE + p, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  let json = null; try { json = await r.json(); } catch { /* 204 */ }
  return { status: r.status, data: json?.data, error: json?.error };
}
const check = (n, c, x = '') => { if (c) { pass += 1; console.log(`  ok   ${n}`); } else { fail += 1; console.log(`  FAIL ${n} ${x}`); } };
const is = (n, r, s) => check(n, r.status === s, `(esperado ${s}, veio ${r.status} ${r.error?.code || ''} ${r.error?.message || ''})`);
async function makeUser(label) {
  const email = `${label}.${stamp}@test.local`; const password = 'Senha-Forte-123';
  const reg = await call(null, 'POST', '/auth/register', { name: `User ${label}`, email, password });
  if (reg.status !== 201) throw new Error(`register ${label}: ${reg.status}`);
  const login = await call(null, 'POST', '/auth/login', { email, password });
  return { token: login.data.access_token, user: login.data.user };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const main = async () => {
  const u = await makeUser('us1'); const admin = await makeUser('usadm');
  await db.query("UPDATE users SET role = 'admin' WHERE email = ?", [admin.user.email]);
  admin.token = (await call(null, 'POST', '/auth/login', { email: admin.user.email, password: 'Senha-Forte-123' })).data.access_token;
  const [[uRow]] = await db.query('SELECT id FROM users WHERE email = ?', [u.user.email]);
  const month = usageSvc.monthKey();

  console.log('\n# Sem uso ainda');
  let r = await call(u.token, 'GET', '/usage/compute');
  is('consumo do usuário', r, 200);
  check('zerado', r.data.current.jobs === 0 && r.data.current.cpu_seconds === 0);
  check('traz o orçamento de CPU do plano', r.data.cpu_budget_seconds > 0, String(r.data.cpu_budget_seconds));
  is('sem token → 401', await call(null, 'GET', '/usage/compute'), 401);

  console.log('\n# Executa no worker de verdade (média)');
  r = await call(u.token, 'POST', '/datasets/import', { name: 'Medição', tensor: Array.from({ length: 60 }, (_, i) => Array.from({ length: 12 }, (_, j) => Math.sin(i * 0.3 + j) + (i % 5) * 0.1)), data_type: 'tensor' });
  is('dataset criado', r, 201); const dsId = r.data.uuid;
  const [[tech]] = await db.query("SELECT uuid FROM techniques WHERE slug = 'mean' AND active = 1");
  r = await call(u.token, 'POST', `/datasets/${dsId}/operations`, { technique_id: tech.uuid, params: {}, workflow_name: 'Medição média', save_mode: 'new_dataset', new_dataset_name: 'PCA medição' });
  check('operação disparada', r.status === 201 || r.status === 202 || r.status === 200, `${r.status} ${JSON.stringify(r.error)}`);
  let job = null;
  for (let i = 0; i < 60 && !job; i += 1) {
    await sleep(500);
    const [[j]] = await db.query("SELECT * FROM jobs WHERE user_id = ? AND job_type = 'execute_node' AND status IN ('done','failed') ORDER BY id DESC LIMIT 1", [uRow.id]);
    job = j || null;
  }
  check('job terminou', !!job);
  check('job concluído com sucesso', job && job.status === 'done', job && job.error_message);
  check('CPU medida gravada no job', job && job.cpu_seconds != null && Number(job.cpu_seconds) >= 0, String(job?.cpu_seconds));
  check('pico de memória do processo gravado', job && Number(job.peak_rss_bytes) > 10 * 1024 * 1024, String(job?.peak_rss_bytes));
  check('bytes de entrada e saída gravados', job && Number(job.input_bytes) > 0 && Number(job.output_bytes) > 0, `${job?.input_bytes}/${job?.output_bytes}`);
  const [[node]] = await db.query('SELECT metrics FROM execution_nodes en JOIN executions e ON e.id = en.execution_id WHERE e.user_id = ? ORDER BY en.id DESC LIMIT 1', [uRow.id]);
  const nm = typeof node.metrics === 'string' ? JSON.parse(node.metrics) : node.metrics;
  check('métricas também no nó da execução', nm && nm.cpu_seconds != null && nm.concurrent_max >= 1, JSON.stringify(nm));
  await sleep(500);
  r = await call(u.token, 'GET', '/usage/compute');
  check('mês: 1 job somado', r.data.current.jobs === 1 && r.data.current.cpu_seconds >= 0 && r.data.current.peak_rss_max_bytes > 0, JSON.stringify(r.data.current));
  check('histórico traz o mês', r.data.history.some((h) => h.month === month));

  console.log('\n# Soma acumulada, falha também conta');
  await usageSvc.record(uRow.id, { cpu_seconds: 2.5, wall_ms: 4000, mem_bytes: 2 * 1024 ** 3, peak_rss_bytes: 3 * 1024 ** 3 }, { failed: true, inputBytes: 10, outputBytes: 0 });
  r = await call(u.token, 'GET', '/usage/compute');
  check('2 jobs, 1 falho', r.data.current.jobs === 2 && r.data.current.jobs_failed === 1, JSON.stringify(r.data.current));
  check('GB·s de RAM = 2 GB × 4 s somados', Math.abs(r.data.current.gb_seconds_ram - 8) < 0.5, String(r.data.current.gb_seconds_ram));
  check('pico máximo guardado', r.data.current.peak_rss_max_bytes === 3 * 1024 ** 3);

  console.log('\n# Armazenamento ao longo do tempo');
  await db.query('UPDATE users SET storage_used_bytes = ? WHERE id = ?', [2 * 1024 ** 3, uRow.id]); // 2 GB
  const t0 = Date.now();
  await db.query("DELETE FROM usage_meta WHERE k = 'storage_tick_at'");
  await usageSvc.tickStorage(t0 - 3 * 3600000);            // marca o "último tick" 3 h atrás
  await db.query('UPDATE usage_monthly SET storage_gb_hours = 0 WHERE user_id = ?', [uRow.id]);
  await usageSvc.tickStorage(t0);                          // 3 h × 2 GB = 6 GB·h
  r = await call(u.token, 'GET', '/usage/compute');
  check('3 h × 2 GB = 6 GB·hora', Math.abs(r.data.current.storage_gb_hours - 6) < 0.05, String(r.data.current.storage_gb_hours));
  await db.query('UPDATE users SET storage_used_bytes = 0 WHERE id = ?', [uRow.id]);

  console.log('\n# Orçamento mensal de CPU bloqueia novas execuções');
  const used = (await call(u.token, 'GET', '/usage/compute')).data.current.cpu_seconds; // ≈ 2,5 s já registrados acima
  r = await call(admin.token, 'PUT', `/admin/storage/users/${u.user.uuid}`, { cpu_budget_seconds: 0 });
  is('orçamento inválido (0) é recusado', r, 422);
  r = await call(admin.token, 'PUT', `/admin/storage/users/${u.user.uuid}`, { cpu_budget_seconds: 1 });
  is('admin define orçamento próprio do usuário', r, 200);
  r = await call(u.token, 'GET', '/usage/compute'); check('usuário vê o orçamento próprio', r.data.cpu_budget_seconds === 1);
  const [[wfCount0]] = await db.query('SELECT COUNT(*) AS n FROM workflows WHERE user_id = ?', [uRow.id]);
  r = await call(u.token, 'POST', `/datasets/${dsId}/operations`, { technique_id: tech.uuid, params: {}, workflow_name: 'Deve bloquear', save_mode: 'new_dataset', new_dataset_name: 'x' });
  is('operação rápida bloqueada: 402', r, 402);
  check('código CPU_BUDGET_EXCEEDED com os números', r.error?.code === 'CPU_BUDGET_EXCEEDED' && r.error.details.used_seconds >= used - 0.01 && r.error.details.budget_seconds === 1, JSON.stringify(r.error));
  const [[wfCount1]] = await db.query('SELECT COUNT(*) AS n FROM workflows WHERE user_id = ?', [uRow.id]);
  check('não deixa workflow órfão para trás', wfCount1.n === wfCount0.n, `${wfCount0.n} → ${wfCount1.n}`);
  const [wfIns] = await db.query("INSERT INTO workflows (uuid, user_id, name, definition) VALUES (UUID(), ?, 'WF bloqueio', '{}')", [uRow.id]);
  const [[wfRow]] = await db.query('SELECT uuid FROM workflows WHERE id = ?', [wfIns.insertId]);
  is('execução de workflow bloqueada: 402', await call(u.token, 'POST', `/workflows/${wfRow.uuid}/executions`, { dataset_bindings: {} }), 402);

  // meio da execução: o nó seguinte falha com o motivo (o que já estava em andamento termina)
  const [[techRow]] = await db.query("SELECT id FROM techniques WHERE slug = 'mean'");
  const [wf2] = await db.query("INSERT INTO workflows (uuid, user_id, name, definition) VALUES (UUID(), ?, 'WF 2 nós', '{}')", [uRow.id]);
  await db.query("INSERT INTO workflow_nodes (workflow_id, node_key, technique_id, name, parameters) VALUES (?, 'a', ?, 'A', '{}'), (?, 'b', ?, 'B', '{}')", [wf2.insertId, techRow.id, wf2.insertId, techRow.id]);
  await db.query("INSERT INTO workflow_edges (workflow_id, source_node_key, target_node_key, source_port, target_port) VALUES (?, 'a', 'b', 'out', 'X')", [wf2.insertId]);
  const [ex2] = await db.query("INSERT INTO executions (uuid, workflow_id, user_id, status) VALUES (UUID(), ?, ?, 'running')", [wf2.insertId, uRow.id]);
  const [[nA]] = await db.query('SELECT id FROM workflow_nodes WHERE workflow_id = ? AND node_key = ?', [wf2.insertId, 'a']);
  const [[nB]] = await db.query('SELECT id FROM workflow_nodes WHERE workflow_id = ? AND node_key = ?', [wf2.insertId, 'b']);
  await db.query("INSERT INTO execution_nodes (execution_id, workflow_node_id, status, output_data, started_at) VALUES (?, ?, 'completed', '{\"out\":[1,2,3]}', NOW())", [ex2.insertId, nA.id]);
  await db.query("INSERT INTO execution_nodes (execution_id, workflow_node_id, status) VALUES (?, ?, 'pending')", [ex2.insertId, nB.id]);
  await pipeline.advanceExecution(ex2.insertId);
  const [[nodeB]] = await db.query('SELECT status, error_message FROM execution_nodes WHERE execution_id = ? AND workflow_node_id = ?', [ex2.insertId, nB.id]);
  check('nó seguinte falha com CPU_BUDGET_EXCEEDED', nodeB.status === 'failed' && /CPU_BUDGET_EXCEEDED/.test(nodeB.error_message), JSON.stringify(nodeB));
  const [[jobsForB]] = await db.query("SELECT COUNT(*) AS n FROM jobs WHERE execution_id = ?", [ex2.insertId]);
  check('e nenhum job foi enfileirado para ele', jobsForB.n === 0);

  // ampliou → volta a executar
  r = await call(admin.token, 'PUT', `/admin/storage/users/${u.user.uuid}`, { cpu_budget_seconds: 3600 });
  is('admin amplia o orçamento', r, 200);
  r = await call(u.token, 'POST', `/datasets/${dsId}/operations`, { technique_id: tech.uuid, params: {}, workflow_name: 'Liberado', save_mode: 'new_dataset', new_dataset_name: 'y' });
  check('volta a executar com orçamento', [200, 201, 202].includes(r.status), `${r.status} ${JSON.stringify(r.error)}`);
  r = await call(admin.token, 'PUT', `/admin/storage/users/${u.user.uuid}`, { cpu_budget_seconds: null });
  is('null volta a seguir o plano', r, 200);
  r = await call(u.token, 'GET', '/usage/compute'); check('segue o orçamento do plano de novo', r.data.cpu_budget_seconds === 36000, String(r.data.cpu_budget_seconds));
  r = await call(admin.token, 'GET', '/admin/storage');
  check('painel mostra orçamento do usuário', r.data.users.find((x) => x.email === u.user.email)?.cpu_budget_seconds === 36000);
  await sleep(1500); // deixa o worker terminar o job liberado antes de encerrar

  console.log('\n# Admin: consumo por usuário, preços e calculadora');
  r = await call(admin.token, 'GET', '/admin/storage');
  const row = r.data.users.find((x) => x.email === u.user.email);
  check('painel traz consumo do mês por usuário', row && row.month.jobs >= 2 && row.month.cpu_seconds >= 2.5 && row.month.cost.total >= 0, JSON.stringify(row?.month));
  r = await call(admin.token, 'PUT', '/admin/storage/prices', { price_gb_month: 0.1, price_cpu_hour: 0.4, currency: 'brl' });
  is('define preços', r, 200); check('moeda em maiúsculas', r.data.currency === 'BRL' && r.data.price_cpu_hour === 0.4);
  is('preço negativo é recusado', await call(admin.token, 'PUT', '/admin/storage/prices', { price_cpu_hour: -1 }), 422);
  is('moeda inválida é recusada', await call(admin.token, 'PUT', '/admin/storage/prices', { currency: 'REAIS' }), 422);
  is('comum não altera preços', await call(u.token, 'PUT', '/admin/storage/prices', { price_cpu_hour: 9 }), 403);
  is('comum não vê a calculadora', await call(u.token, 'GET', '/admin/storage/costs'), 403);
  await call(admin.token, 'PUT', '/admin/storage/plans/beta', { monthly_cpu_seconds: 36000 });
  r = await call(admin.token, 'GET', '/admin/storage/costs?licenses=10');
  is('calculadora', r, 200);
  const beta = r.data.plans.find((p) => p.code === 'beta');
  // teto Beta por usuário: 100 MB (0,09765625 GB × 0,10) + 10 h × 0,40 = 0,009765625 + 4 = 4,009766 (arredondado a 4 casas)
  check('teto por usuário do Beta', Math.abs(beta.per_user.total - 4.0098) < 0.0002, JSON.stringify(beta.per_user));
  check('10 licenças = 10 × teto', Math.abs(beta.for_licenses - 40.1) < 0.01, String(beta.for_licenses));
  check('relatório real do mês', r.data.real.jobs >= 2 && r.data.real.active_users >= 1 && r.data.real.total.total > 0);
  r = await call(admin.token, 'GET', '/admin/storage/costs?licenses=3');
  check('nº de licenças multiplica o teto', Math.abs(r.data.plans.find((p) => p.code === 'beta').for_licenses - 12.03) < 0.01);
  await call(admin.token, 'PUT', '/admin/storage/prices', { price_gb_month: 0.023, price_cpu_hour: 0.05, currency: 'USD' });

  await db.end();
  console.log(`\n${pass} ok, ${fail} falhas`);
  process.exit(fail ? 1 : 0);
};
main().catch((e) => { console.error(e); process.exit(1); });
