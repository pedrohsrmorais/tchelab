// Teste de integração de permissões (projetos, workflows, comunidades, perfil).
// Uso:  node tests/access_e2e.mjs [http://localhost:3003]
// Cria usuários descartáveis (e-mails únicos) e valida respostas HTTP.
// Atenção: login/cadastro têm limite de 20 req/15min por IP (authLimiter).

const BASE = (process.argv[2] || 'http://localhost:3003') + '/api/v1';
const stamp = Date.now().toString(36);
let pass = 0; let fail = 0;
const failures = [];

async function call(token, method, path, body, { raw = false, form = null } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (form) payload = form; else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  const r = await fetch(BASE + path, { method, headers, body: payload });
  if (raw) return r;
  let json = null; try { json = await r.json(); } catch { /* 204 */ }
  return { status: r.status, data: json?.data, error: json?.error, meta: json?.meta };
}

function check(name, cond, extra = '') {
  if (cond) { pass += 1; console.log(`  ok   ${name}`); } else { fail += 1; failures.push(name); console.log(`  FAIL ${name} ${extra}`); }
}
const is = (name, r, status) => check(name, r.status === status, `(esperado ${status}, veio ${r.status} ${r.error?.message || ''})`);

async function makeUser(label) {
  const email = `${label}.${stamp}@test.local`;
  const password = 'Senha-Forte-123';
  const reg = await call(null, 'POST', '/auth/register', { name: `User ${label}`, email, password, preferences: { theme: 'classic', language: 'es' } });
  if (reg.status !== 201) throw new Error(`register ${label}: ${reg.status} ${JSON.stringify(reg.error)}`);
  const login = await call(null, 'POST', '/auth/login', { email, password });
  if (login.status !== 200) throw new Error(`login ${label}: ${login.status}`);
  return { token: login.data.access_token, user: login.data.user, email, password };
}

const main = async () => {
  console.log('\n# Usuários');
  const prof = await makeUser('prof');
  const alice = await makeUser('alice');
  const eve = await makeUser('eve');
  const bob = await makeUser('bob');
  const carol = await makeUser('carol');
  check('preferências do cadastro salvas', prof.user.preferences.theme === 'classic' && prof.user.preferences.language === 'es');

  console.log('\n# Perfil e preferências');
  let r = await call(prof.token, 'PUT', `/users/${prof.user.uuid}`, { lattes_url: 'javascript:alert(1)' });
  is('lattes javascript: rejeitado', r, 422);
  r = await call(prof.token, 'PUT', `/users/${prof.user.uuid}`, { lattes_url: 'http://evil.com/x' });
  is('lattes fora do cnpq.br rejeitado', r, 422);
  r = await call(prof.token, 'PUT', `/users/${prof.user.uuid}`, {
    name: 'Prof. Teste', bio: 'Quimiometria', institution: 'UFRGS', research_area: 'Quimiometria',
    lattes_url: 'lattes.cnpq.br/123', linkedin_url: 'https://www.linkedin.com/in/prof', github_url: 'github.com/prof',
    birth_date: '1980-05-17', cover_color: 'gradient-primary',
  });
  is('atualiza perfil completo', r, 200);
  check('url normalizada para https', r.data?.lattes_url === 'https://lattes.cnpq.br/123', r.data?.lattes_url);
  r = await call(prof.token, 'PUT', `/users/${prof.user.uuid}`, { birth_date: '2999-01-01' });
  is('data de nascimento futura rejeitada', r, 422);
  r = await call(prof.token, 'PUT', `/users/${prof.user.uuid}`, { preferences: { language: 'xx' } });
  is('idioma inválido rejeitado', r, 422);
  r = await call(prof.token, 'PUT', `/users/${prof.user.uuid}`, { preferences: { theme: 'light', language: 'en' } });
  is('salva tema/idioma', r, 200);
  r = await call(prof.token, 'GET', '/auth/me');
  check('/auth/me devolve preferências', r.data?.preferences?.theme === 'light' && r.data?.preferences?.language === 'en');
  check('/auth/me tem e-mail', r.data?.email === prof.email);
  r = await call(eve.token, 'PUT', `/users/${prof.user.uuid}`, { name: 'hack' });
  is('outro usuário não edita perfil', r, 403);

  r = await call(eve.token, 'GET', `/users/${prof.user.uuid}`);
  check('perfil público sem e-mail', r.status === 200 && r.data.email === undefined);
  check('perfil público sem nascimento por padrão', r.data.birth_date === undefined);
  check('perfil público mostra instituição/links', r.data.institution === 'UFRGS' && !!r.data.github_url);
  await call(prof.token, 'PUT', `/users/${prof.user.uuid}`, { preferences: { privacy: { show_birth_date: true } } });
  r = await call(eve.token, 'GET', `/users/${prof.user.uuid}`);
  check('nascimento aparece quando o usuário permite', r.data.birth_date === '1980-05-17', r.data.birth_date);

  r = await call(prof.token, 'POST', '/auth/change-password', { current_password: 'errada', new_password: 'NovaSenha-456' });
  is('troca de senha com senha atual errada', r, 400);
  r = await call(prof.token, 'POST', '/auth/change-password', { current_password: prof.password, new_password: 'curta' });
  is('troca de senha curta rejeitada', r, 422);
  r = await call(prof.token, 'POST', '/auth/change-password', { current_password: prof.password, new_password: 'NovaSenha-456' });
  is('troca de senha ok', r, 200);
  prof.password = 'NovaSenha-456';

  // avatar
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  let form = new FormData(); form.append('avatar', new Blob([png], { type: 'image/png' }), 'a.png');
  r = await call(prof.token, 'POST', `/users/${prof.user.uuid}/avatar`, undefined, { form });
  is('upload de avatar', r, 200);
  check('avatar_url devolvida', /^\/storage\/avatars\//.test(r.data?.avatar_url || ''));
  const av = await fetch(BASE.replace('/api/v1', '') + r.data.avatar_url);
  check('avatar é servido', av.status === 200 && (av.headers.get('content-type') || '').startsWith('image/'));
  form = new FormData(); form.append('avatar', new Blob(['x'], { type: 'text/html' }), 'a.html');
  r = await call(prof.token, 'POST', `/users/${prof.user.uuid}/avatar`, undefined, { form });
  is('avatar não-imagem rejeitado', r, 422);
  form = new FormData(); form.append('avatar', new Blob([png], { type: 'image/png' }), 'a.png');
  r = await call(eve.token, 'POST', `/users/${prof.user.uuid}/avatar`, undefined, { form });
  is('avatar de outro usuário bloqueado', r, 403);

  console.log('\n# Projetos e acesso');
  r = await call(prof.token, 'POST', '/projects', { name: 'Projeto Privado', visibility: 'private' });
  is('cria projeto privado', r, 201); const P = r.data.uuid;
  r = await call(prof.token, 'POST', '/projects', { name: 'Projeto Público', visibility: 'public' });
  is('cria projeto público', r, 201); const PUB = r.data.uuid;
  r = await call(prof.token, 'POST', '/workflows', { name: 'WF do professor' });
  const W = r.data.uuid;
  r = await call(prof.token, 'POST', `/projects/${P}/workflows`, { workflow_id: W });
  is('vincula workflow ao projeto', r, 201);
  r = await call(alice.token, 'POST', `/projects/${P}/workflows`, { workflow_id: W });
  is('aluno sem acesso não vincula', r, 404);

  for (const [who, u] of [['aluno', alice], ['estranho', eve]]) {
    r = await call(u.token, 'GET', `/projects/${P}`); is(`${who} não vê projeto privado`, r, 404);
    r = await call(u.token, 'GET', `/projects/${P}/workflows`); is(`${who} não lista workflows do projeto`, r, 404);
    r = await call(u.token, 'GET', `/workflows/${W}`); is(`${who} não lê workflow privado`, r, 404);
  }
  r = await call(eve.token, 'GET', `/projects/${PUB}`);
  is('projeto público é legível', r, 200); check('...somente leitura', r.data?.can_edit === false && r.data?.my_access === 'viewer');
  r = await call(eve.token, 'PUT', `/projects/${PUB}`, { name: 'x' }); is('projeto público não é editável por terceiros', r, 403);
  r = await call(eve.token, 'GET', `/users/${prof.user.uuid}/projects`);
  check('perfil lista só projetos públicos', r.status === 200 && r.data.length === 1 && r.data[0].uuid === PUB, JSON.stringify(r.data?.map((x) => x.name)));
  r = await call(prof.token, 'GET', `/users/${prof.user.uuid}/projects`);
  check('dono vê todos no próprio perfil', r.data.length === 2);

  console.log('\n# Técnicas favoritas no projeto');
  const techs = await call(prof.token, 'GET', '/techniques?limit=5');
  const T = techs.data[0];
  r = await call(prof.token, 'POST', `/projects/${P}/techniques`, { technique_id: T.uuid });
  is('favorita técnica', r, 201);
  r = await call(prof.token, 'GET', `/projects/${P}/techniques`);
  check('lista técnicas do projeto', r.data?.length === 1 && r.data[0].kind === 'favorite');
  r = await call(prof.token, 'DELETE', `/projects/${P}/techniques/${T.uuid}`); is('remove técnica', r, 204);

  console.log('\n# Comunidade: criação, convites, entrada');
  r = await call(prof.token, 'POST', '/communities', { name: 'Turma 2026', description: 'Quimiometria', visibility: 'private' });
  is('cria comunidade', r, 201); const C = r.data.uuid;
  r = await call(alice.token, 'GET', `/communities/${C}`); is('privada: não-membro recebe 404', r, 404);
  r = await call(alice.token, 'POST', `/communities/${C}/join`); is('privada: join direto bloqueado', r, 404);
  r = await call(alice.token, 'POST', `/communities/${C}/invites`, {}); is('não-membro não cria convite', r, 404);
  r = await call(prof.token, 'POST', `/communities/${C}/invites`, { max_uses: 1, expires_in_hours: 1, label: 'turma A' });
  is('dono cria convite', r, 201); const code1 = r.data.code;
  check('código no formato XXXX-XXXX-XXXX', /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code1), code1);
  r = await call(eve.token, 'POST', '/communities/join', { code: 'AAAA-BBBB-CCCC' }); is('código inexistente', r, 404);
  r = await call(alice.token, 'GET', `/communities/invite/${code1}`);
  check('prévia do convite', r.status === 200 && r.data.status === 'active' && r.data.community.name === 'Turma 2026');
  r = await call(alice.token, 'POST', '/communities/join', { code: code1.toLowerCase().replace(/-/g, '') });
  is('aluno entra com o código (case/hífen livres)', r, 200); check('...joined', r.data?.joined === true);
  r = await call(eve.token, 'POST', '/communities/join', { code: code1 }); is('convite de 1 uso esgotado', r, 410);
  r = await call(alice.token, 'POST', '/communities/join', { code: code1 });
  check('reentrada é idempotente', r.status === 200 && r.data.already_member === true);

  r = await call(alice.token, 'GET', `/communities/${C}`);
  check('membro vê a comunidade', r.status === 200 && r.data.my_role === 'member' && r.data.permissions.can_link === false);
  r = await call(alice.token, 'POST', `/communities/${C}/invites`, {}); is('aluno não cria convite', r, 403);
  r = await call(alice.token, 'PUT', `/communities/${C}`, { name: 'hack' }); is('aluno não edita comunidade', r, 403);
  r = await call(alice.token, 'DELETE', `/communities/${C}`); is('aluno não exclui comunidade', r, 403);
  r = await call(alice.token, 'POST', `/communities/${C}/projects`, { project_id: P }); is('aluno não vincula projeto alheio', r, 403);

  console.log('\n# Vínculo de projeto: leitura x edição');
  r = await call(prof.token, 'POST', `/communities/${C}/projects`, { project_id: P, access: 'read' });
  is('professor vincula projeto (leitura)', r, 201);
  r = await call(alice.token, 'GET', `/projects/${P}`);
  check('aluno abre o projeto vinculado (leitura)', r.status === 200 && r.data.can_edit === false);
  r = await call(alice.token, 'GET', `/workflows/${W}`); is('aluno lê o workflow do projeto', r, 200);
  r = await call(alice.token, 'POST', `/workflows/${W}/nodes`, { technique_id: T.uuid, node_key: 'n1' });
  is('leitura: aluno NÃO adiciona nó', r, 403);
  r = await call(alice.token, 'PUT', `/workflows/${W}`, { name: 'hack' }); is('leitura: aluno NÃO renomeia workflow', r, 403);
  r = await call(alice.token, 'GET', '/projects?scope=shared');
  check('projeto aparece em "compartilhados comigo"', r.data?.some((p) => p.uuid === P && p.my_access === 'viewer'));
  r = await call(alice.token, 'GET', '/projects');
  check('...mas não em "meus"', !r.data?.some((p) => p.uuid === P));
  r = await call(eve.token, 'GET', `/projects/${P}`); is('estranho continua sem acesso', r, 404);

  r = await call(prof.token, 'PUT', `/communities/${C}/projects/${P}`, { access: 'edit' });
  is('professor libera edição', r, 200);
  r = await call(alice.token, 'POST', `/workflows/${W}/nodes`, { technique_id: T.uuid, node_key: 'n1', name: 'nó do aluno' });
  is('edição: aluno adiciona nó', r, 201);
  r = await call(alice.token, 'PUT', `/projects/${P}`, { name: 'hack' }); is('edição: aluno NÃO altera dados do projeto', r, 403);
  r = await call(alice.token, 'DELETE', `/projects/${P}`); is('edição: aluno NÃO exclui projeto', r, 403);
  r = await call(alice.token, 'PUT', `/communities/${C}/projects/${P}`, { access: 'read' });
  is('aluno não altera o nível de acesso', r, 403);
  r = await call(alice.token, 'DELETE', `/communities/${C}/projects/${P}`); is('aluno não desvincula projeto do professor', r, 403);
  r = await call(alice.token, 'GET', `/workflows/${W}/executions`);
  is('aluno lista execuções (só as dele)', r, 200);

  console.log('\n# can_link e hierarquia');
  r = await call(alice.token, 'POST', '/projects', { name: 'Projeto da Alice' }); const AP = r.data.uuid;
  r = await call(alice.token, 'POST', `/communities/${C}/projects`, { project_id: AP });
  is('sem can_link: aluno não vincula nem o próprio', r, 403);
  r = await call(prof.token, 'PUT', `/communities/${C}/members/${alice.user.uuid}`, { can_link: true });
  is('admin concede can_link', r, 200);
  r = await call(alice.token, 'POST', `/communities/${C}/projects`, { project_id: AP, access: 'read' });
  is('com can_link: aluno vincula o próprio projeto', r, 201);
  r = await call(alice.token, 'POST', `/communities/${C}/projects`, { project_id: PUB });
  is('...mas não o projeto de outro', r, 403);

  // mais membros
  r = await call(prof.token, 'POST', `/communities/${C}/invites`, { max_uses: 10 }); const code2 = r.data.code;
  for (const u of [bob, carol, eve]) { r = await call(u.token, 'POST', '/communities/join', { code: code2 }); is('entra com convite reutilizável', r, 200); }
  r = await call(prof.token, 'PUT', `/communities/${C}/members/${alice.user.uuid}`, { role: 'moderator' }); is('promove a moderador', r, 200);
  r = await call(alice.token, 'POST', `/communities/${C}/invites`, { max_uses: 3 }); is('moderador cria convite', r, 201);
  r = await call(alice.token, 'PUT', `/communities/${C}/members/${bob.user.uuid}`, { role: 'moderator' }); is('moderador não muda papéis', r, 403);
  r = await call(alice.token, 'DELETE', `/communities/${C}/members/${prof.user.uuid}`); is('moderador não remove o dono', r, 403);
  r = await call(prof.token, 'PUT', `/communities/${C}/members/${carol.user.uuid}`, { role: 'admin' }); is('dono promove admin', r, 200);
  r = await call(prof.token, 'PUT', `/communities/${C}/members/${alice.user.uuid}`, { role: 'admin' }); is('dono promove 2º admin', r, 200);
  r = await call(alice.token, 'DELETE', `/communities/${C}/members/${carol.user.uuid}`); is('admin NÃO remove outro admin', r, 403);
  r = await call(alice.token, 'PUT', `/communities/${C}/members/${carol.user.uuid}`, { role: 'member' }); is('admin NÃO rebaixa outro admin', r, 403);
  r = await call(alice.token, 'PUT', `/communities/${C}/members/${bob.user.uuid}`, { role: 'admin' }); is('admin NÃO promove a admin', r, 403);
  r = await call(alice.token, 'PUT', `/communities/${C}/members/${prof.user.uuid}`, { role: 'member' }); is('admin NÃO altera o dono', r, 403);
  r = await call(carol.token, 'DELETE', `/communities/${C}/members/${alice.user.uuid}`); is('admin não remove outro admin (inverso)', r, 403);
  r = await call(alice.token, 'DELETE', `/communities/${C}/members/${bob.user.uuid}?ban=1`); is('admin remove e bane membro', r, 204);
  r = await call(bob.token, 'POST', '/communities/join', { code: code2 }); is('banido não volta pelo link', r, 403);
  r = await call(bob.token, 'GET', `/communities/${C}`); is('removido perde o acesso', r, 404);
  r = await call(prof.token, 'DELETE', `/communities/${C}/members/${carol.user.uuid}`); is('dono remove admin', r, 204);
  r = await call(alice.token, 'POST', `/communities/${C}/leave`); is('sair da comunidade', r, 204);
  r = await call(alice.token, 'GET', `/projects/${P}`); is('ao sair, perde acesso ao projeto vinculado', r, 404);
  r = await call(prof.token, 'POST', `/communities/${C}/leave`); is('dono não sai sem transferir', r, 422);
  r = await call(prof.token, 'POST', `/communities/${C}/invites`, {}); const code3 = r.data.code;
  await call(alice.token, 'POST', '/communities/join', { code: code3 });
  r = await call(prof.token, 'DELETE', `/communities/${C}/invites/${(await call(prof.token, 'GET', `/communities/${C}/invites`)).data.find((i) => i.code === code3).uuid}`);
  is('revoga convite', r, 204);
  r = await call(eve.token, 'GET', `/communities/invite/${code3}`); check('convite revogado', r.data?.status === 'revoked');

  console.log('\n# Conteúdo estilo Moodle');
  r = await call(eve.token, 'POST', `/communities/${C}/sections`, { title: 'x' }); is('membro comum não cria tópico', r, 403);
  r = await call(prof.token, 'POST', `/communities/${C}/sections`, { title: 'Aula 1 — Introdução', description: 'Leitura inicial' });
  is('professor cria tópico', r, 201); const S1 = r.data.uuid;
  r = await call(prof.token, 'POST', `/communities/${C}/items`, { section_id: S1, type: 'link', title: 'Artigo SNV', url: 'javascript:alert(1)' });
  is('link javascript: rejeitado', r, 422);
  r = await call(prof.token, 'POST', `/communities/${C}/items`, { section_id: S1, type: 'link', title: 'Artigo SNV', url: 'doi.org/10.1000/xyz' });
  is('adiciona link', r, 201);
  r = await call(prof.token, 'POST', `/communities/${C}/items`, { section_id: S1, type: 'text', title: 'Aviso', description: 'Prova dia 10' });
  is('adiciona texto', r, 201);
  const pdf = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF');
  form = new FormData(); form.append('file', new Blob([pdf], { type: 'application/pdf' }), 'Aula 1 – slides.pdf'); form.append('section_id', S1); form.append('title', 'Slides da aula');
  r = await call(prof.token, 'POST', `/communities/${C}/items`, undefined, { form });
  is('professor envia PDF', r, 201); const FI = r.data.uuid;
  form = new FormData(); form.append('file', new Blob(['<script>'], { type: 'text/html' }), 'x.html'); form.append('title', 'x');
  r = await call(prof.token, 'POST', `/communities/${C}/items`, undefined, { form });
  is('HTML rejeitado no upload', r, 422);
  r = await call(prof.token, 'PUT', `/communities/${C}/projects/${P}`, { section_id: S1 }); is('projeto posicionado no tópico', r, 200);
  r = await call(eve.token, 'GET', `/communities/${C}/content`);
  const sec = r.data?.sections?.[0];
  check('membro vê tópico com link, texto, PDF e projeto', sec && sec.items.length === 3 && sec.projects.length === 1, JSON.stringify(sec?.items?.map((i) => i.type)));
  const dl = await call(eve.token, 'GET', `/communities/${C}/items/${FI}/file`, undefined, { raw: true });
  check('membro baixa o PDF', dl.status === 200 && dl.headers.get('content-type') === 'application/pdf' && dl.headers.get('content-disposition').startsWith('inline'));
  const dl2 = await call(null, 'GET', `/communities/${C}/items/${FI}/file`, undefined, { raw: true }); check('PDF exige login', dl2.status === 401);
  const dl3 = await call(bob.token, 'GET', `/communities/${C}/items/${FI}/file`, undefined, { raw: true }); check('quem não é membro não baixa', dl3.status === 404);
  r = await call(prof.token, 'PUT', `/communities/${C}/sections/${S1}`, { is_visible: false }); is('oculta tópico', r, 200);
  r = await call(eve.token, 'GET', `/communities/${C}/content`); check('tópico oculto some para alunos', r.data.sections.length === 0);
  r = await call(prof.token, 'GET', `/communities/${C}/content`); check('...mas o professor ainda vê', r.data.sections.length === 1);

  console.log('\n# Chat');
  r = await call(eve.token, 'POST', `/communities/${C}/messages`, { content: 'Olá, turma!' }); is('membro envia mensagem', r, 201);
  r = await call(bob.token, 'GET', `/communities/${C}/messages`); is('banido não lê o chat', r, 404);
  r = await call(prof.token, 'GET', `/communities/${C}/messages`);
  check('lista mensagens com autor', r.data?.length === 1 && r.data[0].user_name === 'User eve');
  const mid = r.data[0].uuid;
  r = await call(carol.token, 'POST', `/communities/${C}/messages`, { content: 'x' }); is('ex-membro não envia', r, 404);
  r = await call(prof.token, 'DELETE', `/communities/${C}/messages/${mid}`); is('moderador apaga mensagem alheia', r, 204);

  console.log('\n# Comunidade pública');
  r = await call(prof.token, 'PUT', `/communities/${C}`, { visibility: 'public' }); is('torna pública', r, 200);
  r = await call(bob.token, 'GET', `/communities/${C}`);
  check('visitante vê dados básicos', r.status === 200 && r.data.my_role === null && r.data.permissions.is_member === false);
  r = await call(bob.token, 'GET', `/communities/${C}/projects`);
  check('visitante vê só projetos públicos vinculados', r.status === 200 && r.data.length === 0, JSON.stringify(r.data?.map((p) => p.name)));
  r = await call(bob.token, 'GET', `/communities/${C}/messages`); is('visitante não lê chat', r, 403);
  r = await call(bob.token, 'POST', `/communities/${C}/join`); is('banido não entra nem em pública', r, 403);
  r = await call(prof.token, 'DELETE', `/communities/${C}/bans/${bob.user.uuid}`); is('desbane', r, 204);
  r = await call(bob.token, 'POST', `/communities/${C}/join`); is('entra na pública sem convite', r, 200);
  r = await call(carol.token, 'GET', '/communities/public?q=Turma');
  check('aparece na descoberta pública', r.data?.some((c) => c.uuid === C));
  r = await call(prof.token, 'POST', `/communities/${C}/transfer`, { user_uuid: bob.user.uuid }); is('transfere posse', r, 200);
  r = await call(prof.token, 'DELETE', `/communities/${C}`); is('ex-dono não exclui', r, 403);
  r = await call(bob.token, 'DELETE', `/communities/${C}`); is('novo dono exclui', r, 204);
  r = await call(eve.token, 'GET', `/communities/${C}/items/${FI}/file`, undefined, { raw: true }); check('comunidade excluída: arquivo some', r.status === 404);

  console.log(`\n${pass} ok, ${fail} falhas`);
  if (fail) { console.log('Falhas:\n - ' + failures.join('\n - ')); process.exit(1); }
};

main().catch((e) => { console.error(e); process.exit(2); });
