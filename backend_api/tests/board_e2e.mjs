// Quadro (gestão do lab): quadros, grupos, colunas personalizáveis, itens, células, permissões, comentários e "Minhas tarefas".
// Uso:  node tests/board_e2e.mjs [http://localhost:3003]
const BASE = (process.argv[2] || 'http://localhost:3003') + '/api/v1';
const stamp = Date.now().toString(36);
let pass = 0; let fail = 0;

async function call(token, method, p, body) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  const r = await fetch(BASE + p, { method, headers, body: payload });
  let json = null; try { json = await r.json(); } catch { /* 204 */ }
  return { status: r.status, data: json?.data, error: json?.error };
}
const check = (name, cond, extra = '') => { if (cond) { pass += 1; console.log(`  ok   ${name}`); } else { fail += 1; console.log(`  FAIL ${name} ${extra}`); } };
const is = (name, r, status) => check(name, r.status === status, `(esperado ${status}, veio ${r.status} ${r.error?.code || ''} ${r.error?.message || ''})`);

async function makeUser(label) {
  const email = `${label}.${stamp}@test.local`; const password = 'Senha-Forte-123';
  const reg = await call(null, 'POST', '/auth/register', { name: `User ${label}`, email, password });
  if (reg.status !== 201) throw new Error(`register ${label}: ${reg.status}`);
  const login = await call(null, 'POST', '/auth/login', { email, password });
  return { token: login.data.access_token, user: login.data.user };
}
const day = (off) => new Date(Date.now() + off * 86400000).toISOString().slice(0, 10);

const main = async () => {
  const prof = await makeUser('bprof'); const mod = await makeUser('bmod'); const ana = await makeUser('bana'); const beto = await makeUser('bbeto'); const fora = await makeUser('bfora');
  let r = await call(prof.token, 'POST', '/communities', { name: 'Lab Quadro E2E', visibility: 'private' }); const cid = r.data.uuid;
  r = await call(prof.token, 'POST', `/communities/${cid}/invites`, { max_uses: 10 }); const code = r.data.code;
  for (const u of [mod, ana, beto]) await call(u.token, 'POST', '/communities/join', { code });
  r = await call(prof.token, 'PUT', `/communities/${cid}/members/${mod.user.uuid}`, { role: 'moderator' }); is('promove moderador', r, 200);
  const B = `/communities/${cid}/boards`;

  console.log('\n# Criação de quadros');
  r = await call(ana.token, 'POST', B, { title: 'X' }); is('membro não cria quadro', r, 403);
  r = await call(fora.token, 'GET', B); is('não-membro não vê (privada)', r, 404);
  r = await call(prof.token, 'POST', B, { title: '' }); is('título obrigatório', r, 422);
  r = await call(prof.token, 'POST', B, { title: 'X', template: 'inexistente' }); is('modelo inválido', r, 422);
  r = await call(prof.token, 'POST', B, { title: 'X', edit_policy: 'todos' }); is('política inválida', r, 422);
  r = await call(prof.token, 'POST', B, { title: 'Tarefas do Lab', template: 'lab_tasks', lang: 'pt' }); is('cria a partir do modelo "tarefas do lab"', r, 201); const bid = r.data.uuid;
  const BD = `${B}/${bid}`;
  r = await call(ana.token, 'GET', BD); is('membro abre o quadro', r, 200);
  let st = r.data;
  check('modelo traz colunas (pessoa, status, prioridade, prazo, notas)', st.columns.map((c) => c.type).join() === 'people,status,status,date,text');
  check('modelo traz 3 grupos e 1 item de exemplo', st.groups.length === 3 && st.items.length === 1 && st.items[0].seq === 1);
  check('rótulos de status com "conta como concluído"', st.columns[1].config.labels.some((l) => l.done && l.label === 'Feito'));
  check('lista de membros disponível para a coluna pessoa', st.members.length === 4);
  const rev0 = st.board.rev;
  r = await call(ana.token, 'GET', `${BD}?rev=${rev0}`); check('rev igual → "unchanged"', r.data.unchanged === true);
  r = await call(prof.token, 'POST', B, { title: 'Em branco', template: 'blank', lang: 'en' }); is('cria quadro em branco (en)', r, 201);
  r = await call(prof.token, 'POST', B, { title: 'Tickets', template: 'tickets', lang: 'es', edit_policy: 'own' }); is('cria quadro de tickets (es)', r, 201); const tid = r.data.uuid;
  r = await call(prof.token, 'GET', `${B}/${tid}`); check('tickets: status, prioridade, tipo, solicitante, responsável, prazo', r.data.columns.map((c) => c.type).join() === 'status,status,dropdown,people,people,date');
  r = await call(ana.token, 'GET', B); check('lista com resumo e quantidade de quadros', r.data.length === 3 && r.data[0].total === 1);

  const col = (t) => st.columns.find((c) => c.type === t);
  const peopleCol = col('people'); const statusCol = col('status'); const dateCol = col('date'); const textCol = col('text');
  const prioCol = st.columns[2];
  const lab = (c, name) => c.config.labels.find((l) => l.label === name).id;

  console.log('\n# Grupos');
  r = await call(ana.token, 'POST', `${BD}/groups`, { title: 'G' }); is('membro não cria grupo', r, 403);
  r = await call(prof.token, 'POST', `${BD}/groups`, { title: '' }); is('título do grupo obrigatório', r, 422);
  r = await call(prof.token, 'POST', `${BD}/groups`, { title: 'Backlog', color: '#ff00aa' }); is('cria grupo', r, 201); const gBack = r.data.uuid;
  r = await call(mod.token, 'PUT', `${BD}/groups/${gBack}`, { title: 'Backlog 2', color: 'vermelho' }); is('cor inválida', r, 422);
  r = await call(mod.token, 'PUT', `${BD}/groups/${gBack}`, { title: 'Backlog 2' }); is('moderador renomeia grupo', r, 200);
  r = await call(prof.token, 'GET', BD); st = r.data;
  const g0 = st.groups[0].uuid; const g1 = st.groups[1].uuid;
  r = await call(prof.token, 'POST', `${BD}/groups/reorder`, { order: [gBack, g0, g1] }); is('reordena grupos', r, 200);
  r = await call(prof.token, 'GET', BD); check('nova ordem dos grupos', r.data.groups[0].uuid === gBack && r.data.groups.length === 4);

  console.log('\n# Colunas personalizáveis');
  r = await call(ana.token, 'POST', `${BD}/columns`, { title: 'C', type: 'text' }); is('membro não cria coluna', r, 403);
  r = await call(prof.token, 'POST', `${BD}/columns`, { title: 'C', type: 'xyz' }); is('tipo inválido', r, 422);
  r = await call(prof.token, 'POST', `${BD}/columns`, { title: '', type: 'text' }); is('nome obrigatório', r, 422);
  r = await call(prof.token, 'POST', `${BD}/columns`, { title: 'Horas', type: 'number', config: { unit: 'h', decimals: 1 } }); is('coluna de número', r, 201); const numCol = r.data;
  r = await call(prof.token, 'POST', `${BD}/columns`, { title: 'Local', type: 'dropdown', config: { options: [{ label: 'Sala 1', color: '#579bfc' }, { label: 'Sala 2' }] } }); is('coluna de lista', r, 201); const ddCol = r.data;
  check('opções ganham id', ddCol.config.options.every((o) => o.id));
  r = await call(prof.token, 'POST', `${BD}/columns`, { title: 'Entrega', type: 'timeline' }); is('coluna de período', r, 201); const tlCol = r.data;
  r = await call(prof.token, 'POST', `${BD}/columns`, { title: 'Feito?', type: 'checkbox' }); is('coluna de caixa de seleção', r, 201); const ckCol = r.data;
  r = await call(prof.token, 'POST', `${BD}/columns`, { title: 'Link', type: 'link' }); is('coluna de link', r, 201); const lkCol = r.data;
  r = await call(prof.token, 'POST', `${BD}/columns`, { title: 'Etapa', type: 'status' }); is('status novo vem com rótulos padrão', r, 201); const st2 = r.data;
  check('4 rótulos padrão e um concluído', st2.config.labels.length === 4 && st2.config.labels.filter((l) => l.done).length === 1);
  r = await call(prof.token, 'PUT', `${BD}/columns/${st2.uuid}`, { config: { labels: [] } }); is('status precisa de ao menos 1 rótulo', r, 422);
  r = await call(prof.token, 'PUT', `${BD}/columns/${st2.uuid}`, { config: { labels: [{ label: '' }] } }); is('rótulo sem nome rejeitado', r, 422);
  r = await call(prof.token, 'PUT', `${BD}/columns/${st2.uuid}`, { width: 5 }); is('largura mínima', r, 422);
  r = await call(prof.token, 'PUT', `${BD}/columns/${st2.uuid}`, { title: 'Etapa do projeto', width: 220, hidden: true }); is('renomeia, redimensiona e oculta', r, 200);
  check('persistiu', r.data.title === 'Etapa do projeto' && r.data.width === 220 && r.data.hidden === true);

  console.log('\n# Itens');
  let seqBefore;
  r = await call(ana.token, 'POST', `${BD}/items`, { title: '' }); is('título do item obrigatório', r, 422);
  r = await call(ana.token, 'POST', `${BD}/items`, { title: 'Preparar amostras', group: 'nao-existe' }); is('grupo inexistente', r, 422);
  r = await call(ana.token, 'POST', `${BD}/items`, { title: 'Preparar amostras', group: g0, cells: { [statusCol.uuid]: 'zzz' } }); is('célula inicial inválida recusada', r, 422);
  r = await call(ana.token, 'POST', `${BD}/items`, { title: 'Preparar amostras', group: g0, cells: { [peopleCol.uuid]: [fora.user.uuid] } }); is('responsável precisa ser membro', r, 422);
  r = await call(ana.token, 'POST', `${BD}/items`, { title: 'Preparar amostras', group: g0, cells: { [peopleCol.uuid]: [ana.user.uuid], [statusCol.uuid]: lab(statusCol, 'Em andamento'), [dateCol.uuid]: day(-2) } });
  is('membro cria item (política "members")', r, 201); const i1 = r.data; seqBefore = i1.seq;
  check('item nasce com número (#) sequencial', i1.seq === 2 && i1.created_by.uuid === ana.user.uuid);
  check('valores iniciais aplicados', i1.cells[statusCol.uuid] === lab(statusCol, 'Em andamento') && i1.cells[peopleCol.uuid][0] === ana.user.uuid && i1.cells[dateCol.uuid] === day(-2));
  r = await call(beto.token, 'POST', `${BD}/items`, { title: 'Rodar PCA', group: g0, top: true }); is('outro membro cria item no topo', r, 201); const i2 = r.data;
  check('seq incrementa', i2.seq === seqBefore + 1);
  r = await call(beto.token, 'GET', BD); const order = r.data.items.filter((i) => i.group === g0).map((i) => i.uuid);
  check('item "no topo" vem primeiro', order[0] === i2.uuid);
  r = await call(ana.token, 'PUT', `${BD}/items/${i2.uuid}`, { title: 'Rodar PCA e PLS' }); is('política "members": qualquer um renomeia', r, 200);
  r = await call(ana.token, 'POST', `${BD}/items/${i2.uuid}/move`, { group: g1, before: null }); is('move para outro grupo', r, 200);
  r = await call(ana.token, 'POST', `${BD}/items/${i2.uuid}/move`, { group: g0, before: i1.uuid }); is('move para antes de outro item', r, 200);
  r = await call(ana.token, 'GET', BD); { const o = r.data.items.filter((i) => i.group === g0).map((i) => i.uuid); check('ordem após mover (i2 logo antes de i1)', o.indexOf(i2.uuid) >= 0 && o.indexOf(i2.uuid) === o.indexOf(i1.uuid) - 1); }
  r = await call(ana.token, 'POST', `${BD}/items/${i1.uuid}/duplicate`); is('duplica item', r, 201); const dup = r.data.uuid;
  r = await call(ana.token, 'GET', `${BD}/items/${dup}`); check('cópia mantém valores e responsável', r.data.item.cells[statusCol.uuid] === lab(statusCol, 'Em andamento') && r.data.item.cells[peopleCol.uuid].length === 1 && r.data.item.seq === seqBefore + 2);

  console.log('\n# Células (um valor por vez)');
  const put = (t, it, c, value) => call(t, 'PUT', `${BD}/items/${it}/cells/${c}`, { value });
  r = await put(ana.token, i1.uuid, textCol.uuid, 'x'.repeat(1001)); is('texto > 1000', r, 422);
  r = await put(ana.token, i1.uuid, textCol.uuid, '  nota  '); is('texto', r, 200); check('texto aparado', r.data.cells[textCol.uuid] === 'nota');
  r = await put(ana.token, i1.uuid, numCol.uuid, 'abc'); is('número inválido', r, 422);
  r = await put(ana.token, i1.uuid, numCol.uuid, '2,5'); is('número com vírgula', r, 200); check('vírgula vira ponto', r.data.cells[numCol.uuid] === 2.5);
  r = await put(ana.token, i1.uuid, dateCol.uuid, '2026-02-30'); is('data inexistente', r, 422);
  r = await put(ana.token, i1.uuid, dateCol.uuid, day(5)); is('data', r, 200);
  r = await put(ana.token, i1.uuid, tlCol.uuid, { start: '2026-05-10', end: '2026-05-01' }); is('período com fim antes do início', r, 422);
  r = await put(ana.token, i1.uuid, tlCol.uuid, { start: '2026-05-01', end: '2026-05-10' }); is('período', r, 200);
  r = await put(ana.token, i1.uuid, ckCol.uuid, 'sim'); is('caixa exige booleano', r, 422);
  r = await put(ana.token, i1.uuid, ckCol.uuid, true); is('caixa marcada', r, 200); check('marcada', r.data.cells[ckCol.uuid] === true);
  r = await put(ana.token, i1.uuid, ckCol.uuid, false); check('desmarcar limpa o valor', r.data.cells[ckCol.uuid] === undefined);
  r = await put(ana.token, i1.uuid, lkCol.uuid, 'javascript:alert(1)'); is('link javascript: recusado', r, 422);
  r = await put(ana.token, i1.uuid, lkCol.uuid, { url: 'https://ufrgs.br/lab', text: 'Lab' }); is('link', r, 200);
  r = await put(ana.token, i1.uuid, ddCol.uuid, ['nao']); is('opção de lista inexistente', r, 422);
  r = await put(ana.token, i1.uuid, ddCol.uuid, [ddCol.config.options[1].id]); is('lista', r, 200);
  r = await put(ana.token, i1.uuid, statusCol.uuid, 'inexistente'); is('rótulo inexistente', r, 422);
  r = await put(ana.token, i1.uuid, peopleCol.uuid, [ana.user.uuid, beto.user.uuid]); is('várias pessoas', r, 200); check('duas pessoas', r.data.cells[peopleCol.uuid].length === 2);
  r = await put(ana.token, i1.uuid, peopleCol.uuid, [fora.user.uuid]); is('pessoa de fora recusada', r, 422);
  r = await put(ana.token, i1.uuid, peopleCol.uuid, []); is('limpa pessoas', r, 200); check('sem pessoas', !r.data.cells[peopleCol.uuid] || r.data.cells[peopleCol.uuid].length === 0);
  await put(ana.token, i1.uuid, peopleCol.uuid, [ana.user.uuid]);
  r = await put(ana.token, i1.uuid, textCol.uuid, null); check('null limpa a célula', r.data.cells[textCol.uuid] === undefined);
  r = await call(ana.token, 'PUT', `${BD}/items/${i1.uuid}/cells/${textCol.uuid}`, {}); is('sem valor → 422', r, 422);
  r = await put(ana.token, i1.uuid, 'coluna-fantasma', 'x'); is('coluna inexistente', r, 404);

  console.log('\n# Edições simultâneas em colunas diferentes');
  r = await call(prof.token, 'POST', `${BD}/items`, { title: 'Concorrência', group: g0 }); const cc = r.data.uuid;
  const jobs = [
    put(ana.token, cc, textCol.uuid, 'texto A'), put(beto.token, cc, numCol.uuid, 7), put(mod.token, cc, dateCol.uuid, day(9)),
    put(prof.token, cc, statusCol.uuid, lab(statusCol, 'Feito')), put(ana.token, cc, ckCol.uuid, true), put(beto.token, cc, lkCol.uuid, 'https://a.b/c'),
    put(mod.token, cc, peopleCol.uuid, [ana.user.uuid, beto.user.uuid]), put(prof.token, cc, tlCol.uuid, { start: '2026-01-01', end: '2026-01-02' }),
  ];
  const rs = await Promise.all(jobs);
  check('todas as 8 gravações concluídas', rs.every((x) => x.status === 200), rs.map((x) => x.status).join());
  r = await call(prof.token, 'GET', `${BD}/items/${cc}`); const cs = r.data.item.cells;
  check('nenhuma gravação foi perdida', cs[textCol.uuid] === 'texto A' && cs[numCol.uuid] === 7 && cs[dateCol.uuid] === day(9) && cs[statusCol.uuid] === lab(statusCol, 'Feito') && cs[ckCol.uuid] === true && cs[lkCol.uuid].url === 'https://a.b/c' && cs[peopleCol.uuid].length === 2 && cs[tlCol.uuid].end === '2026-01-02', JSON.stringify(cs));
  const same = await Promise.all([1, 2, 3, 4, 5].map((n) => put(ana.token, cc, textCol.uuid, `v${n}`)));
  check('mesma célula: todas respondem 200 e fica um valor válido', same.every((x) => x.status === 200));
  r = await call(prof.token, 'GET', `${BD}/items/${cc}`); check('valor final é um dos enviados', /^v[1-5]$/.test(r.data.item.cells[textCol.uuid]));

  console.log('\n# Status personalizáveis em uso');
  const newLabels = statusCol.config.labels.filter((l) => l.label !== 'Bloqueado').map((l) => (l.label === 'Feito' ? { ...l, label: 'Concluído' } : l)).concat([{ label: 'Revisão', color: '#a25ddc' }]);
  r = await call(prof.token, 'PUT', `${BD}/columns/${statusCol.uuid}`, { config: { labels: newLabels } }); is('renomear/adicionar/remover rótulo sem uso', r, 200);
  const usedLabels = r.data.config.labels;
  const emAnd = usedLabels.find((l) => l.label === 'Em andamento'); const fazer = usedLabels.find((l) => l.label === 'A fazer');
  r = await call(prof.token, 'PUT', `${BD}/columns/${statusCol.uuid}`, { config: { labels: usedLabels.filter((l) => l.id !== emAnd.id) } }); is('remover rótulo em uso pede confirmação', r, 409);
  check('informa quantos itens usam', r.error.details.items >= 1);
  r = await call(prof.token, 'PUT', `${BD}/columns/${statusCol.uuid}`, { config: { labels: usedLabels.filter((l) => l.id !== emAnd.id) }, confirm: true, remap: { [emAnd.id]: fazer.id } }); is('confirma e move itens para outro rótulo', r, 200);
  r = await call(prof.token, 'GET', `${BD}/items/${i1.uuid}`); check('item foi remapeado para "A fazer"', r.data.item.cells[statusCol.uuid] === fazer.id);
  const doneLabel = r.data.item && (await call(prof.token, 'GET', BD)).data.columns.find((c) => c.uuid === statusCol.uuid).config.labels.find((l) => l.done);
  check('rótulo concluído preservado', doneLabel && doneLabel.label === 'Concluído');
  r = await call(prof.token, 'PUT', `${BD}/columns/${ddCol.uuid}`, { type: 'text' }); is('mudar tipo com valores pede confirmação', r, 409);
  r = await call(prof.token, 'PUT', `${BD}/columns/${ddCol.uuid}`, { type: 'text', confirm: true }); is('mudar tipo confirmado', r, 200);
  r = await call(prof.token, 'GET', `${BD}/items/${i1.uuid}`); check('valores antigos foram limpos', r.data.item.cells[ddCol.uuid] === undefined);
  r = await call(prof.token, 'DELETE', `${BD}/columns/${lkCol.uuid}`); is('excluir coluna preenchida pede confirmação', r, 409);
  r = await call(prof.token, 'DELETE', `${BD}/columns/${lkCol.uuid}`, { confirm: true }); is('exclui coluna confirmada', r, 204);
  r = await call(prof.token, 'POST', `${BD}/columns/reorder`, { order: [dateCol.uuid, statusCol.uuid] }); is('reordena colunas', r, 200);
  r = await call(prof.token, 'GET', BD); check('colunas reordenadas, demais mantidas', r.data.columns[0].uuid === dateCol.uuid && r.data.columns[1].uuid === statusCol.uuid && r.data.columns.length === st.columns.length + 5);

  console.log('\n# Políticas de edição');
  r = await call(prof.token, 'PUT', BD, { edit_policy: 'staff' }); is('política "só equipe"', r, 200);
  r = await call(ana.token, 'POST', `${BD}/items`, { title: 'nope' }); is('membro não cria item (staff)', r, 403);
  r = await call(mod.token, 'POST', `${BD}/items`, { title: 'Do moderador', group: g0 }); is('moderador cria (staff)', r, 201); const mi = r.data.uuid;
  r = await put(ana.token, mi, textCol.uuid, 'x'); is('membro não edita (staff)', r, 403);
  await put(mod.token, mi, peopleCol.uuid, [ana.user.uuid]);
  r = await put(ana.token, mi, textCol.uuid, 'x'); is('responsável não edita texto (staff)', r, 403);
  r = await put(ana.token, mi, statusCol.uuid, fazer.id); is('responsável atualiza o status do próprio item (staff)', r, 200);
  r = await put(beto.token, mi, statusCol.uuid, fazer.id); is('não-responsável não atualiza status (staff)', r, 403);
  r = await call(ana.token, 'GET', BD); check('item informa nível de acesso do usuário', r.data.items.find((i) => i.uuid === mi).access === 'status' && r.data.items.find((i) => i.uuid === i2.uuid).access === 'none' && r.data.permissions.create === false);
  r = await call(ana.token, 'DELETE', `${BD}/items/${mi}`); is('membro não exclui (staff)', r, 403);
  r = await call(prof.token, 'PUT', BD, { edit_policy: 'own' }); is('política "só os meus"', r, 200);
  r = await call(beto.token, 'POST', `${BD}/items`, { title: 'Do Beto', group: g0 }); is('membro cria (own)', r, 201); const bi = r.data.uuid;
  r = await put(beto.token, bi, textCol.uuid, 'meu'); is('autor edita o próprio item (own)', r, 200);
  r = await put(ana.token, bi, textCol.uuid, 'invadi'); is('outro membro não edita (own)', r, 403);
  r = await put(ana.token, mi, textCol.uuid, 'sou responsável'); is('responsável edita tudo do item (own)', r, 200);
  r = await call(ana.token, 'DELETE', `${BD}/items/${bi}`); is('não-autor não exclui (own)', r, 403);
  r = await call(beto.token, 'DELETE', `${BD}/items/${bi}`); is('autor exclui o próprio item (own)', r, 204);
  r = await call(ana.token, 'POST', `${BD}/items/bulk`, { items: [mi, i1.uuid], action: 'delete' }); is('exclusão em lote responde', r, 200);
  check('lote respeita permissões', r.data.denied.includes(mi) && r.data.done.includes(i1.uuid) === true && !r.data.done.includes(mi));
  await call(prof.token, 'PUT', BD, { edit_policy: 'members' });

  console.log('\n# Lote, comentários e histórico');
  r = await call(ana.token, 'POST', `${BD}/items`, { title: 'L1', group: g0 }); const l1 = r.data.uuid;
  r = await call(ana.token, 'POST', `${BD}/items`, { title: 'L2', group: g0 }); const l2 = r.data.uuid;
  r = await call(ana.token, 'POST', `${BD}/items/bulk`, { items: [l1, l2], action: 'move', group: g1 }); is('move em lote', r, 200); check('2 movidos', r.data.done.length === 2);
  r = await call(ana.token, 'POST', `${BD}/items/bulk`, { items: [], action: 'delete' }); is('lote vazio', r, 422);
  r = await call(fora.token, 'POST', `${BD}/items/${l1}/comments`, { body: 'oi' }); is('não-membro não comenta', r, 404);
  r = await call(ana.token, 'POST', `${BD}/items/${l1}/comments`, { body: '' }); is('comentário vazio', r, 422);
  r = await call(ana.token, 'POST', `${BD}/items/${l1}/comments`, { body: 'Preciso do protocolo' }); is('comenta', r, 201); const cm1 = r.data.uuid;
  r = await call(beto.token, 'POST', `${BD}/items/${l1}/comments`, { body: 'Mando hoje' }); is('outro membro comenta', r, 201); const cm2 = r.data.uuid;
  r = await call(beto.token, 'DELETE', `${BD}/items/${l1}/comments/${cm1}`); is('não apaga comentário alheio', r, 403);
  r = await call(mod.token, 'DELETE', `${BD}/items/${l1}/comments/${cm2}`); is('moderador apaga comentário', r, 204);
  await put(ana.token, l1, statusCol.uuid, fazer.id);
  r = await call(ana.token, 'GET', `${BD}/items/${l1}`);
  check('detalhe traz 1 comentário', r.data.comments.length === 1 && r.data.comments[0].can_delete === true);
  check('histórico registra criação, mudança de grupo e de status', ['item_created', 'moved', 'cell'].every((k) => r.data.activity.some((a) => a.kind === k)));
  const cellAct = r.data.activity.find((a) => a.kind === 'cell');
  check('histórico guarda o texto legível', cellAct.data.new === 'A fazer' && cellAct.data.col && cellAct.user.uuid === ana.user.uuid);
  r = await call(ana.token, 'GET', BD); check('contagem de comentários no item', r.data.items.find((i) => i.uuid === l1).comments === 1);

  console.log('\n# Minhas tarefas');
  r = await call(prof.token, 'POST', `${BD}/items`, { title: 'Atrasada da Ana', group: g0, cells: { [peopleCol.uuid]: [ana.user.uuid], [dateCol.uuid]: day(-3), [statusCol.uuid]: fazer.id } }); const t1 = r.data.uuid;
  r = await call(prof.token, 'POST', `${BD}/items`, { title: 'Pronta da Ana', group: g0, cells: { [peopleCol.uuid]: [ana.user.uuid], [dateCol.uuid]: day(-3), [statusCol.uuid]: doneLabel.id } }); const t2 = r.data.uuid;
  r = await call(prof.token, 'POST', `${BD}/items`, { title: 'Do Beto', group: g0, cells: { [peopleCol.uuid]: [beto.user.uuid] } });
  r = await call(ana.token, 'GET', `${B}/my-items`); is('minhas tarefas', r, 200);
  const mine = r.data.filter((i) => i.board.uuid === bid);
  check('só o que é meu', mine.every((i) => [t1, t2, i1.uuid, dup, cc, mi].includes(i.uuid)) && !mine.some((i) => i.title === 'Do Beto'));
  check('atrasada só se não concluída', mine.find((i) => i.uuid === t1).overdue === true && mine.find((i) => i.uuid === t2).overdue === false && mine.find((i) => i.uuid === t2).done === true);
  check('traz status editável (lista de rótulos)', mine[0].status && mine[0].status.labels.length >= 3);
  r = await call(fora.token, 'GET', `${B}/my-items`); is('não-membro: 404', r, 404);
  r = await call(prof.token, 'GET', B); const sum = r.data.find((x) => x.uuid === bid);
  check('resumo do quadro conta concluídas e atrasadas', sum.done >= 1 && sum.overdue >= 1 && sum.total >= 5);
  r = await call(ana.token, 'GET', B); check('quantidade "meus" no quadro', r.data.find((x) => x.uuid === bid).mine >= 3);

  console.log('\n# Membro removido some das colunas de pessoa');
  r = await call(prof.token, 'DELETE', `/communities/${cid}/members/${beto.user.uuid}`); is('remove membro', r, 204);
  r = await call(prof.token, 'GET', `${BD}/items/${cc}`); check('Beto some do item; Ana permanece', r.data.item.cells[peopleCol.uuid].length === 1 && r.data.item.cells[peopleCol.uuid][0] === ana.user.uuid);
  r = await call(beto.token, 'GET', BD); is('ex-membro perde acesso (404)', r, 404);

  console.log('\n# Limpeza');
  r = await call(ana.token, 'DELETE', BD); is('membro não exclui quadro', r, 403);
  r = await call(prof.token, 'DELETE', `${BD}/groups/${g0}`); is('grupo com itens pede confirmação', r, 409);
  r = await call(prof.token, 'DELETE', `${BD}/groups/${g0}`, { confirm: true }); is('exclui grupo com itens', r, 204);
  r = await call(prof.token, 'GET', BD); check('itens do grupo sumiram', !r.data.items.some((i) => i.group === g0));
  r = await call(prof.token, 'DELETE', BD); is('professor exclui quadro', r, 204);
  r = await call(prof.token, 'GET', BD); is('quadro excluído → 404', r, 404);
  r = await call(prof.token, 'DELETE', `/communities/${cid}`); is('exclui a comunidade (cascata)', r, 204);

  console.log(`\n${pass} ok, ${fail} falhas`);
  process.exit(fail ? 1 : 0);
};
main().catch((e) => { console.error(e); process.exit(2); });
