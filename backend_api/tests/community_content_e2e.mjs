// Teste de integração do conteúdo de comunidade (aula completa): PPT com pré-visualização,
// workflows e variáveis do Workspace como material, acesso do aluno, copiar, reordenar, mover.
// Uso:  node tests/community_content_e2e.mjs [http://localhost:3003]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = (process.argv[2] || 'http://localhost:3003') + '/api/v1';
const here = path.dirname(fileURLToPath(import.meta.url));
const stamp = Date.now().toString(36);
let pass = 0; let fail = 0;

async function call(token, method, p, body, { raw = false, form = null } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (form) payload = form; else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  const r = await fetch(BASE + p, { method, headers, body: payload });
  if (raw) return r;
  let json = null; try { json = await r.json(); } catch { /* 204 */ }
  return { status: r.status, data: json?.data, error: json?.error };
}
const check = (name, cond, extra = '') => { if (cond) { pass += 1; console.log(`  ok   ${name}`); } else { fail += 1; console.log(`  FAIL ${name} ${extra}`); } };
const is = (name, r, status) => check(name, r.status === status, `(esperado ${status}, veio ${r.status} ${r.error?.message || ''})`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function makeUser(label) {
  const email = `${label}.${stamp}@test.local`; const password = 'Senha-Forte-123';
  const reg = await call(null, 'POST', '/auth/register', { name: `User ${label}`, email, password });
  if (reg.status !== 201) throw new Error(`register ${label}: ${reg.status}`);
  const login = await call(null, 'POST', '/auth/login', { email, password });
  return { token: login.data.access_token, user: login.data.user };
}

const main = async () => {
  const prof = await makeUser('cprof'); const aluno = await makeUser('caluno'); const outro = await makeUser('coutro');

  console.log('\n# Comunidade + tópicos');
  let r = await call(prof.token, 'POST', '/communities', { name: 'Turma E2E', visibility: 'private' });
  is('cria comunidade', r, 201); const cid = r.data.uuid;
  r = await call(prof.token, 'POST', `/communities/${cid}/sections`, { title: 'Aula 1' }); const s1 = r.data.uuid;
  r = await call(prof.token, 'POST', `/communities/${cid}/sections`, { title: 'Aula 2' }); const s2 = r.data.uuid;
  r = await call(prof.token, 'POST', `/communities/${cid}/invites`, { max_uses: 5 });
  is('cria convite', r, 201); const code = r.data.code;

  console.log('\n# PPT com pré-visualização');
  const buf = fs.readFileSync(path.join(here, 'fixtures', 'aula.pptx'));
  const fd = new FormData();
  fd.append('file', new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' }), 'Aula 1.pptx');
  fd.append('section_id', s1);
  r = await call(prof.token, 'POST', `/communities/${cid}/items`, undefined, { form: fd });
  is('envia PPTX', r, 201); const pptId = r.data.uuid;
  let content = (await call(prof.token, 'GET', `/communities/${cid}/content`)).data;
  let ppt = content.sections[0].items.find((i) => i.uuid === pptId);
  check('PPTX aparece como file com preview pending/ready', ppt && ppt.type === 'file' && ['pending', 'ready'].includes(ppt.preview_status), JSON.stringify(ppt));
  for (let i = 0; i < 40 && ppt.preview_status === 'pending'; i += 1) {
    await sleep(1500);
    content = (await call(prof.token, 'GET', `/communities/${cid}/content`)).data;
    ppt = content.sections[0].items.find((i2) => i2.uuid === pptId);
  }
  check('conversão para PDF concluída', ppt.preview_status === 'ready', ppt.preview_status);
  let pr = await call(prof.token, 'GET', `/communities/${cid}/items/${pptId}/file?preview=1`, undefined, { raw: true });
  const pbuf = Buffer.from(await pr.arrayBuffer());
  check('preview é PDF inline', pr.status === 200 && pr.headers.get('content-type') === 'application/pdf' && pbuf.slice(0, 4).toString() === '%PDF' && /inline/.test(pr.headers.get('content-disposition') || ''));
  pr = await call(prof.token, 'GET', `/communities/${cid}/items/${pptId}/file?download=1`, undefined, { raw: true });
  check('original baixa como attachment', pr.status === 200 && /attachment/.test(pr.headers.get('content-disposition') || ''));
  pr = await call(aluno.token, 'GET', `/communities/${cid}/items/${pptId}/file?preview=1`, undefined, { raw: true });
  check('não-membro não vê a pré-visualização', pr.status === 404, pr.status);

  console.log('\n# Workflow e variável como material');
  r = await call(prof.token, 'POST', '/workflows', { name: 'PCA da aula' }); const wf = r.data.uuid;
  r = await call(prof.token, 'POST', '/datasets/import', { name: 'X da turma', tensor: [[1, 2, 3], [4, 5, 6]], dimensions: [2, 3] });
  is('professor cria variável', r, 201); const ds = r.data.uuid;
  r = await call(outro.token, 'POST', '/workflows', { name: 'WF de outra pessoa' }); const wfOutro = r.data.uuid;

  r = await call(prof.token, 'POST', `/communities/${cid}/items`, { type: 'workflow', ref: wfOutro, section_id: s1 });
  is('não vincula workflow de outra pessoa', r, 403);
  r = await call(prof.token, 'POST', `/communities/${cid}/items`, { type: 'workflow', ref: wf, section_id: s1, access: 'xx' });
  is('access inválido rejeitado', r, 422);
  r = await call(prof.token, 'POST', `/communities/${cid}/items`, { type: 'workflow', ref: wf, section_id: s1, access: 'read' });
  is('vincula workflow (leitura)', r, 201); const wfItem = r.data.uuid;
  r = await call(prof.token, 'POST', `/communities/${cid}/items`, { type: 'dataset', ref: ds, section_id: s1 });
  is('vincula variável', r, 201); const dsItem = r.data.uuid;
  r = await call(prof.token, 'POST', `/communities/${cid}/items`, { type: 'dataset' });
  is('variável sem referência rejeitada', r, 422);
  r = await call(prof.token, 'POST', `/communities/${cid}/items`, { type: 'workflow', ref: 'nao-existe' });
  is('workflow inexistente → 404', r, 404);

  content = (await call(prof.token, 'GET', `/communities/${cid}/content`)).data;
  const items = content.sections[0].items;
  check('item workflow traz ref.name', items.find((i) => i.uuid === wfItem)?.ref?.name === 'PCA da aula');
  check('item variável traz ref.dimensions', JSON.stringify(items.find((i) => i.uuid === dsItem)?.ref?.dimensions) === '[2,3]');
  check('título padrão = nome do recurso', items.find((i) => i.uuid === wfItem)?.title === 'PCA da aula');

  console.log('\n# Acesso do aluno');
  r = await call(aluno.token, 'GET', `/workflows/${wf}`); is('antes de entrar: workflow 404', r, 404);
  r = await call(aluno.token, 'GET', `/datasets/${ds}`); is('antes de entrar: variável 404', r, 404);
  r = await call(aluno.token, 'POST', '/communities/join', { code }); check('aluno entra pelo código', [200, 201].includes(r.status), r.status);
  r = await call(aluno.token, 'GET', `/workflows/${wf}`);
  check('aluno lê o workflow vinculado (somente leitura)', r.status === 200 && r.data.can_edit === false && r.data.my_access === 'viewer', JSON.stringify([r.status, r.data?.my_access, r.data?.can_edit]));
  r = await call(aluno.token, 'PUT', `/workflows/${wf}`, { name: 'hack' }); is('aluno não edita (leitura)', r, 403);
  r = await call(aluno.token, 'GET', `/datasets/${ds}`); is('aluno lê a variável vinculada', r, 200);
  r = await call(outro.token, 'GET', `/workflows/${wf}`); is('não-membro continua sem acesso', r, 404);
  r = await call(aluno.token, 'POST', `/communities/${cid}/items`, { type: 'workflow', ref: wf });
  is('aluno não adiciona material', r, 403);

  console.log('\n# Copiar para a conta do aluno');
  r = await call(aluno.token, 'POST', `/workflows/${wf}/fork`); is('aluno copia o workflow', r, 201);
  const fork = r.data.uuid;
  r = await call(aluno.token, 'PUT', `/workflows/${fork}`, { name: 'Minha cópia' }); is('aluno edita a própria cópia', r, 200);
  r = await call(aluno.token, 'POST', `/datasets/${ds}/copy`, {}); is('aluno copia a variável', r, 201);
  const dsCopy = r.data;
  check('cópia pertence ao aluno, privada, mesmas dimensões', dsCopy.visibility === 'private' && dsCopy.uuid !== ds && JSON.stringify(typeof dsCopy.dimensions === 'string' ? JSON.parse(dsCopy.dimensions) : dsCopy.dimensions) === '[2,3]');
  r = await call(aluno.token, 'GET', `/datasets/${dsCopy.uuid}`); is('aluno lê a cópia', r, 200);
  r = await call(outro.token, 'POST', `/datasets/${ds}/copy`, {}); is('não-membro não copia', r, 404);

  console.log('\n# Edição concedida pelo professor');
  r = await call(prof.token, 'PUT', `/communities/${cid}/items/${wfItem}`, { access: 'edit' }); is('professor libera edição', r, 200);
  r = await call(aluno.token, 'PUT', `/workflows/${wf}`, { name: 'PCA da aula (editado pelo aluno)' }); is('aluno edita com permissão', r, 200);
  r = await call(prof.token, 'PUT', `/communities/${cid}/items/${wfItem}`, { access: 'read' });

  console.log('\n# Ocultar / remover revoga o acesso');
  r = await call(prof.token, 'PUT', `/communities/${cid}/sections/${s1}`, { is_visible: false }); is('oculta tópico', r, 200);
  r = await call(aluno.token, 'GET', `/workflows/${wf}`); is('tópico oculto → workflow 404', r, 404);
  r = await call(aluno.token, 'GET', `/datasets/${ds}`); is('tópico oculto → variável 404', r, 404);
  r = await call(aluno.token, 'GET', `/communities/${cid}/items/${pptId}/file`, undefined, { raw: true }); check('tópico oculto → arquivo 404', r.status === 404, r.status);
  r = await call(prof.token, 'PUT', `/communities/${cid}/sections/${s1}`, { is_visible: true });
  r = await call(aluno.token, 'GET', `/workflows/${wf}`); is('tópico visível de novo → 200', r, 200);
  r = await call(prof.token, 'PUT', `/communities/${cid}/items/${wfItem}`, { is_visible: false });
  r = await call(aluno.token, 'GET', `/workflows/${wf}`); is('item oculto → workflow 404', r, 404);
  r = await call(prof.token, 'PUT', `/communities/${cid}/items/${wfItem}`, { is_visible: true });
  r = await call(prof.token, 'DELETE', `/communities/${cid}/items/${wfItem}`); is('remove o item', r, 204);
  r = await call(aluno.token, 'GET', `/workflows/${wf}`); is('item removido → workflow 404', r, 404);
  r = await call(aluno.token, 'GET', `/workflows/${fork}`); is('cópia do aluno continua dele', r, 200);

  console.log('\n# Organização: reordenar e mover');
  const mk = async (title, section) => (await call(prof.token, 'POST', `/communities/${cid}/items`, { type: 'text', title, description: 'x', section_id: section })).data.uuid;
  const a = await mk('A', s2); const b = await mk('B', s2); const c = await mk('C', s2);
  r = await call(prof.token, 'PUT', `/communities/${cid}/items-order`, { section_id: s2, order: [c, a, b] }); is('reordena itens', r, 200);
  content = (await call(prof.token, 'GET', `/communities/${cid}/content`)).data;
  const sec2 = content.sections.find((s) => s.uuid === s2);
  check('nova ordem C, A, B', sec2.items.map((i) => i.title).join() === 'C,A,B', sec2.items.map((i) => i.title).join());
  r = await call(prof.token, 'PUT', `/communities/${cid}/items/${a}`, { section_id: s1, title: 'A (editado)' }); is('move + edita item', r, 200);
  content = (await call(prof.token, 'GET', `/communities/${cid}/content`)).data;
  const sec1 = content.sections.find((s) => s.uuid === s1);
  check('item foi para o fim do outro tópico', sec1.items[sec1.items.length - 1].title === 'A (editado)', sec1.items.map((i) => i.title).join());
  check('tópico de origem manteve os demais', content.sections.find((s) => s.uuid === s2).items.map((i) => i.title).join() === 'C,B');
  r = await call(aluno.token, 'PUT', `/communities/${cid}/items-order`, { section_id: s2, order: [b, c] }); is('aluno não reordena', r, 403);
  r = await call(prof.token, 'PUT', `/communities/${cid}/items-order`, { section_id: s2 }); is('ordem sem lista → 422', r, 422);

  console.log('\n# Limpeza de arquivos');
  r = await call(prof.token, 'DELETE', `/communities/${cid}`); is('exclui comunidade', r, 204);

  console.log(`\n${pass} ok, ${fail} falhas`);
  process.exit(fail ? 1 : 0);
};
main().catch((e) => { console.error(e); process.exit(1); });
