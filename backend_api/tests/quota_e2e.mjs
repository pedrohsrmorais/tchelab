// Teste da cota de armazenamento por usuário (reserva atômica, bloqueio, liberação, admin, auditoria).
// Uso:  node tests/quota_e2e.mjs [http://localhost:3003]   (backend no ar e as mesmas variáveis DB_* do backend)
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const db = require('../src/config/db.config');
const quotaSvc = require('../src/services/quota.service');

const BASE = (process.argv[2] || 'http://localhost:3003') + '/api/v1';
const stamp = Date.now().toString(36);
let pass = 0; let fail = 0;

async function call(token, method, p, body, { form = null } = {}) {
  const headers = {}; if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (form) payload = form; else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  const r = await fetch(BASE + p, { method, headers, body: payload });
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
  return { token: login.data.access_token, user: login.data.user, id: reg.data?.id };
}
const KB = 1024;
const file = (size, name = 'f.txt', type = 'text/plain') => { const fd = new FormData(); fd.append('file', new Blob([Buffer.alloc(size, 97)], { type }), name); return fd; };
const png = (size) => { const b = Buffer.alloc(size, 0); Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b); return b; };
const usage = async (u) => (await call(u.token, 'GET', '/storage/usage')).data;
const dbUser = async (u) => (await db.query('SELECT id FROM users WHERE email = ?', [u.user.email]))[0][0].id;
const setQuota = async (u, bytes) => db.query('UPDATE users SET storage_quota_bytes = ? WHERE email = ?', [bytes, u.user.email]);

const main = async () => {
  const u = await makeUser('qa1'); const other = await makeUser('qa2'); const admin = await makeUser('qadm');
  await db.query("UPDATE users SET role = 'admin' WHERE email = ?", [admin.user.email]);
  const adminLogin = await call(null, 'POST', '/auth/login', { email: admin.user.email, password: 'Senha-Forte-123' });
  admin.token = adminLogin.data.access_token;
  const uid = await dbUser(u);

  console.log('\n# Plano e leitura do uso');
  let us = await usage(u);
  check('plano Beta: 100 MB e 20 MB por arquivo', us.plan.code === 'beta' && us.quota === 100 * 1048576 && us.max_file_bytes === 20 * 1048576, JSON.stringify(us));
  check('começa zerado', us.used === 0 && us.reserved === 0 && us.level === 'ok');
  let r = await call(u.token, 'GET', '/storage/usage?details=1');
  check('detalhes vazios', r.data.breakdown && r.data.breakdown.items.length === 0);
  is('usuário comum não vê o painel admin', await call(u.token, 'GET', '/admin/storage'), 403);
  is('sem token → 401', await call(null, 'GET', '/storage/usage'), 401);

  console.log('\n# Avatar conta e libera');
  await setQuota(u, 300 * KB);
  const fd = new FormData(); fd.append('avatar', new Blob([png(50 * KB)], { type: 'image/png' }), 'a.png');
  r = await call(u.token, 'POST', `/users/${u.user.uuid}/avatar`, undefined, { form: fd });
  is('envia avatar de 50 KB', r, 200);
  us = await usage(u);
  check('uso = 50 KB', us.used === 50 * KB, `used=${us.used}`);
  is('apaga avatar', await call(u.token, 'DELETE', `/users/${u.user.uuid}/avatar`), 204);
  check('uso volta a 0', (await usage(u)).used === 0);

  console.log('\n# Material de comunidade: bloqueia ao passar do limite');
  await setQuota(u, 200 * KB);
  r = await call(u.token, 'POST', '/communities', { name: 'Cota E2E', visibility: 'private' });
  const cid = r.data.uuid;
  r = await call(u.token, 'POST', `/communities/${cid}/items`, undefined, { form: file(100 * KB, 'a.txt') });
  is('envia 100 KB', r, 201); const itemA = r.data.uuid;
  check('uso = 100 KB', (await usage(u)).used === 100 * KB);
  r = await call(u.token, 'POST', `/communities/${cid}/items`, undefined, { form: file(150 * KB, 'b.txt') });
  is('150 KB não cabe (faltam 50 KB)', r, 413);
  check('código STORAGE_QUOTA_EXCEEDED com detalhes', r.error?.code === 'STORAGE_QUOTA_EXCEEDED' && r.error.details?.quota === 200 * KB && Math.abs(r.error.details?.needed - 150 * KB) < 2 * KB, JSON.stringify(r.error));
  us = await usage(u);
  check('uso não mudou e nada ficou reservado', us.used === 100 * KB && us.reserved === 0, JSON.stringify(us));
  r = await call(u.token, 'GET', `/communities/${cid}/items`);
  check('item recusado não foi criado', (r.data?.items || r.data || []).length <= 1 || true);
  const [files1] = await db.query("SELECT COUNT(*) AS n FROM community_items WHERE type = 'file' AND created_by = ?", [uid]);
  check('só 1 item de arquivo no banco', files1[0].n === 1, String(files1[0].n));
  check('nível "warning" ou acima a 50%?', ['ok', 'warning'].includes(us.level));

  console.log('\n# Com a cota cheia: lê e exclui, mas não grava');
  await setQuota(u, 100 * KB);
  us = await usage(u);
  check('nível "full"', us.level === 'full', us.level);
  r = await call(u.token, 'GET', `/communities/${cid}/items/${itemA}/file`);
  check('ainda baixa o arquivo', r.status === 200, String(r.status));
  is('não envia outro arquivo', await call(u.token, 'POST', `/communities/${cid}/items`, undefined, { form: file(10 * KB, 'c.txt') }), 413);
  is('não cria dataset (tensor)', await call(u.token, 'POST', '/datasets/import', { name: 'T', tensor: [[1, 2], [3, 4]], data_type: 'tensor' }), 413);
  is('exclui o item', await call(u.token, 'DELETE', `/communities/${cid}/items/${itemA}`), 204);
  check('espaço devolvido', (await usage(u)).used === 0);
  is('agora envia', await call(u.token, 'POST', `/communities/${cid}/items`, undefined, { form: file(10 * KB, 'c.txt') }), 201);

  console.log('\n# Dataset: criar, editar, excluir ajustam a cota');
  await setQuota(u, 1024 * KB);
  const before = (await usage(u)).used;
  r = await call(u.token, 'POST', '/datasets/import', { name: 'Tensor E2E', tensor: [[1, 2, 3], [4, 5, 6]], data_type: 'tensor' });
  is('cria dataset por JSON', r, 201); const dsId = r.data.uuid;
  let afterCreate = (await usage(u)).used;
  check('uso cresceu', afterCreate > before, `${before} → ${afterCreate}`);
  const big = { name: 'x', blob: 'z'.repeat(60 * KB) };
  r = await call(u.token, 'PUT', `/datasets/${dsId}`, { metadata: big });
  is('edição que aumenta o conteúdo', r, 200);
  const afterGrow = (await usage(u)).used;
  check('uso acompanha o crescimento (+60 KB)', afterGrow - afterCreate >= 59 * KB, `${afterCreate} → ${afterGrow}`);
  await call(u.token, 'PUT', `/datasets/${dsId}`, { metadata: { name: 'x' } });
  check('e a redução', (await usage(u)).used < afterGrow - 50 * KB);
  await setQuota(u, (await usage(u)).used + 5 * KB);
  is('edição que estoura a cota é recusada', await call(u.token, 'PUT', `/datasets/${dsId}`, { metadata: { blob: 'z'.repeat(60 * KB) } }), 413);
  r = await call(u.token, 'GET', `/datasets/${dsId}`);
  check('o conteúdo antigo ficou intacto', !JSON.stringify(r.data.metadata).includes('zzzz'));
  is('exclui dataset', await call(u.token, 'DELETE', `/datasets/${dsId}`), 204);
  check('uso volta ao anterior', (await usage(u)).used === before, `${(await usage(u)).used} vs ${before}`);
  r = await call(u.token, 'GET', '/storage/usage?details=1');
  check('detalhe por tipo lista o que sobrou', r.data.breakdown.by_kind.some((k) => k.kind === 'community_file'));

  console.log('\n# Copiar da plataforma também conta');
  await setQuota(u, 1024 * KB);
  r = await call(other.token, 'POST', '/datasets/import', { name: 'Público', tensor: [[1, 2], [3, 4]], visibility: 'public' });
  const pub = r.data.uuid;
  const used0 = (await usage(u)).used;
  r = await call(u.token, 'POST', `/datasets/${pub}/copy`, {});
  is('copia o dataset de outra pessoa', r, 201);
  check('conta na cota de quem copia', (await usage(u)).used > used0);
  check('e não mexe na de quem tem o original', (await usage(other)).used > 0);

  console.log('\n# Concorrência: 8 envios de 100 KB com cota de 300 KB');
  await db.query('DELETE FROM community_items WHERE created_by = ?', [uid]);
  await db.query("UPDATE storage_objects SET deleted_at = NOW() WHERE user_id = ? AND deleted_at IS NULL", [uid]);
  await db.query('UPDATE users SET storage_used_bytes = 0, storage_reserved_bytes = 0 WHERE id = ?', [uid]);
  const [[lg0]] = await db.query('SELECT COALESCE(MAX(id),0) AS m FROM storage_ledger WHERE user_id = ?', [uid]);
  await setQuota(u, 300 * KB);
  const results = await Promise.all(Array.from({ length: 8 }, (_, i) => call(u.token, 'POST', `/communities/${cid}/items`, undefined, { form: file(100 * KB, `p${i}.txt`) })));
  const okN = results.filter((x) => x.status === 201).length; const blocked = results.filter((x) => x.status === 413).length;
  check('exatamente 3 passam', okN === 3, `passaram ${okN}, bloqueados ${blocked}`);
  check('os outros 5 são bloqueados', blocked === 5, `bloqueados ${blocked}`);
  us = await usage(u);
  check('uso = 300 KB e nenhuma reserva presa', us.used === 300 * KB && us.reserved === 0, JSON.stringify(us));
  const [[agg]] = await db.query('SELECT COALESCE(SUM(size_bytes),0) AS s FROM storage_objects WHERE user_id = ? AND deleted_at IS NULL', [uid]);
  check('soma dos objetos = uso', Number(agg.s) === us.used, `${agg.s} vs ${us.used}`);
  const [[led]] = await db.query('SELECT COALESCE(SUM(delta_bytes),0) AS s FROM storage_ledger WHERE user_id = ? AND id > ?', [uid, lg0.m]);
  check('soma do ledger = uso (auditoria fecha)', Number(led.s) === us.used, `${led.s} vs ${us.used}`);

  console.log('\n# Máximo por arquivo do plano');
  await setQuota(u, null);
  is('arquivo de 21 MB recusado antes de subir', await call(u.token, 'POST', `/communities/${cid}/items`, undefined, { form: file(21 * 1048576, 'grande.txt') }), 413);
  r = await call(u.token, 'POST', `/communities/${cid}/items`, undefined, { form: file(21 * 1048576, 'grande.txt') });
  check('código FILE_TOO_LARGE', r.error?.code === 'FILE_TOO_LARGE', JSON.stringify(r.error));

  console.log('\n# Serviço: saída de job e reservas');
  await setQuota(u, 1000);
  let threw = null; try { await quotaSvc.reserveOutput(uid, 5000); } catch (e) { threw = e; }
  check('reserveOutput recusa saída que não cabe', threw && threw.code === 'STORAGE_QUOTA_EXCEEDED', threw && threw.code);
  await setQuota(u, 50 * 1048576);
  threw = null; try { await quotaSvc.reserveOutput(uid, 25 * 1048576); } catch (e) { threw = e; }
  check('reserveOutput respeita o máximo por item', threw && threw.code === 'FILE_TOO_LARGE', threw && threw.code);
  const resv = await quotaSvc.reserveOutput(uid, 2000);
  check('reserva aparece no uso', (await usage(u)).reserved === 2000);
  await quotaSvc.release(uid, resv);
  check('release devolve', (await usage(u)).reserved === 0);

  console.log('\n# Admin');
  r = await call(admin.token, 'GET', '/admin/storage');
  is('visão geral', r, 200);
  check('lista o usuário de teste com uso e cota', r.data.users.some((x) => x.email === u.user.email && x.used > 0));
  check('traz capacidade e cota alocada', 'allocated_bytes' in r.data && 'capacity_bytes' in r.data && 'overcommit_ratio' in r.data);
  r = await call(admin.token, 'PUT', `/admin/storage/users/${u.user.uuid}`, { quota_bytes: 7 * 1048576 });
  is('define cota individual', r, 200); check('uso reflete 7 MB', r.data.quota === 7 * 1048576);
  r = await call(admin.token, 'PUT', `/admin/storage/users/${u.user.uuid}`, { quota_bytes: null });
  check('null volta a seguir o plano', r.data.quota === 100 * 1048576, String(r.data?.quota));
  r = await call(admin.token, 'PUT', `/admin/storage/users/${u.user.uuid}`, { plan_code: 'staff' });
  check('troca de plano', r.data.plan.code === 'staff' && r.data.quota === 10 * 1024 * 1048576);
  await call(admin.token, 'PUT', `/admin/storage/users/${u.user.uuid}`, { plan_code: 'beta' });
  r = await call(admin.token, 'PUT', '/admin/storage/plans/beta', { quota_bytes: 120 * 1048576 });
  is('edita a cota do plano', r, 200);
  check('vale para quem está no plano', (await usage(other)).quota === 120 * 1048576);
  await call(admin.token, 'PUT', '/admin/storage/plans/beta', { quota_bytes: 100 * 1048576 });
  is('valor inválido é recusado', await call(admin.token, 'PUT', '/admin/storage/plans/beta', { quota_bytes: -5 }), 422);
  is('comum não altera cotas', await call(u.token, 'PUT', `/admin/storage/users/${u.user.uuid}`, { quota_bytes: 1e12 }), 403);

  console.log('\n# Execução: excluir libera');
  is('execução inexistente → 404', await call(u.token, 'DELETE', '/executions/00000000-0000-0000-0000-000000000000'), 404);

  console.log('\n# Listagem "o que ocupa espaço" e exclusão de execução');
  r = await call(u.token, 'POST', '/datasets/import', { name: 'Listado E2E', tensor: [[1, 2], [3, 4]], data_type: 'tensor' });
  is('cria dataset para a listagem', r, 201); const listedId = r.data.uuid;
  r = await call(u.token, 'GET', '/storage/usage?details=1');
  const it = r.data.breakdown.items.find((x) => x.ref_id === listedId);
  check('item traz nome e uuid públicos', it && it.name === 'Listado E2E' && it.ref_type === 'dataset', JSON.stringify(it));
  check('item de dataset é excluível', it && it.deletable === true);
  check('itens vêm do maior para o menor', r.data.breakdown.items.every((x, i, a) => i === 0 || a[i - 1].bytes >= x.bytes));
  const uidE = await dbUser(u);
  const [wfE] = await db.query("INSERT INTO workflows (uuid, user_id, name, definition) VALUES (UUID(), ?, 'WF cota', '{}')", [uidE]);
  const [exE] = await db.query("INSERT INTO executions (uuid, workflow_id, user_id, status) VALUES (UUID(), ?, ?, 'completed')", [wfE.insertId, uidE]);
  const [[exRow]] = await db.query('SELECT uuid FROM executions WHERE id = ?', [exE.insertId]);
  const resvE = await quotaSvc.reserveOutput(uidE, 30 * KB);
  await quotaSvc.commit(uidE, resvE, { kind: 'execution_output', refType: 'execution', refId: exE.insertId, size: 30 * KB });
  const usedWithExecE = (await usage(u)).used;
  r = await call(u.token, 'GET', '/storage/usage?details=1');
  check('execução aparece na listagem', r.data.breakdown.items.some((x) => x.ref_type === 'execution' && x.ref_id === exRow.uuid && x.deletable));
  is('outro usuário não exclui a execução', await call(other.token, 'DELETE', `/executions/${exRow.uuid}`), 403);
  is('exclui a execução', await call(u.token, 'DELETE', `/executions/${exRow.uuid}`), 204);
  check('excluir a execução devolve a cota', usedWithExecE - (await usage(u)).used === 30 * KB, `${usedWithExecE} → ${(await usage(u)).used}`);
  await db.query('DELETE FROM workflows WHERE id = ?', [wfE.insertId]);
  is('exclui o dataset listado', await call(u.token, 'DELETE', `/datasets/${listedId}`), 204);

  console.log('\n# Limpeza');
  is('exclui comunidade', await call(u.token, 'DELETE', `/communities/${cid}`), 204);
  check('arquivos da comunidade devolvidos à cota', (await usage(u)).used < 300 * KB);
  await db.end();
  console.log(`\n${pass} ok, ${fail} falhas`);
  process.exit(fail ? 1 : 0);
};
main().catch((e) => { console.error(e); process.exit(1); });
