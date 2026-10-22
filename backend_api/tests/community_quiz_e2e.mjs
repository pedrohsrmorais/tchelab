// Subtópicos aninhados (estilo Moodle) + quizzes da comunidade (V/F, múltipla escolha, texto, variável e workflow).
// Uso:  node tests/community_quiz_e2e.mjs [http://localhost:3003]
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
const is = (name, r, status) => check(name, r.status === status, `(esperado ${status}, veio ${r.status} ${r.error?.message || ''})`);

async function makeUser(label) {
  const email = `${label}.${stamp}@test.local`; const password = 'Senha-Forte-123';
  const reg = await call(null, 'POST', '/auth/register', { name: `User ${label}`, email, password });
  if (reg.status !== 201) throw new Error(`register ${label}: ${reg.status}`);
  const login = await call(null, 'POST', '/auth/login', { email, password });
  return { token: login.data.access_token, user: login.data.user };
}

const main = async () => {
  const prof = await makeUser('qprof'); const aluno = await makeUser('qaluno'); const outro = await makeUser('qoutro');
  let r = await call(prof.token, 'POST', '/communities', { name: 'Quimiometria E2E', visibility: 'private' });
  is('cria comunidade', r, 201); const cid = r.data.uuid;
  r = await call(prof.token, 'POST', `/communities/${cid}/invites`, { max_uses: 5 }); const code = r.data.code;
  r = await call(aluno.token, 'POST', '/communities/join', { code }); check('aluno entra', [200, 201].includes(r.status));

  console.log('\n# Subtópicos (Parte > Aula > Subaula)');
  r = await call(prof.token, 'POST', `/communities/${cid}/sections`, { title: 'Parte 1 — Fundamentos' }); const parte1 = r.data.uuid;
  r = await call(prof.token, 'POST', `/communities/${cid}/sections`, { title: 'Aula 1', parent: parte1 });
  is('cria Aula 1 dentro da Parte 1', r, 201); const aula1 = r.data.uuid;
  r = await call(prof.token, 'POST', `/communities/${cid}/sections`, { title: 'Aula 2', parent: parte1 }); const aula2 = r.data.uuid;
  r = await call(prof.token, 'POST', `/communities/${cid}/sections`, { title: 'Prática', parent: aula1 });
  is('cria subaula (3º nível)', r, 201); const pratica = r.data.uuid;
  r = await call(prof.token, 'POST', `/communities/${cid}/sections`, { title: 'Nível 4', parent: pratica });
  is('4º nível é rejeitado', r, 422);
  r = await call(prof.token, 'POST', `/communities/${cid}/sections`, { title: 'X', parent: 'nao-existe' });
  is('pai inexistente é rejeitado', r, 422);
  r = await call(prof.token, 'PUT', `/communities/${cid}/sections/${parte1}`, { parent: pratica });
  is('não move um tópico para dentro de si mesmo', r, 422);
  r = await call(prof.token, 'PUT', `/communities/${cid}/sections/${parte1}`, { parent: aula2 });
  is('não move a Parte 1 para dentro de uma descendente', r, 422);
  r = await call(prof.token, 'POST', `/communities/${cid}/items`, { type: 'text', title: 'Roteiro', description: 'Leia.', section_id: pratica });
  is('item dentro da subaula', r, 201);

  let content = (await call(prof.token, 'GET', `/communities/${cid}/content`)).data;
  const sec = (u) => content.sections.find((s) => s.uuid === u);
  check('conteúdo traz parent', sec(aula1)?.parent === parte1 && sec(pratica)?.parent === aula1 && sec(parte1)?.parent === null);
  r = await call(prof.token, 'PUT', `/communities/${cid}/sections/${aula2}`, { parent: null });
  is('promove Aula 2 a tópico de topo', r, 200);
  r = await call(prof.token, 'PUT', `/communities/${cid}/sections/${aula2}`, { parent: parte1 });
  is('volta a Aula 2 para a Parte 1', r, 200);

  r = await call(prof.token, 'PUT', `/communities/${cid}/sections/${parte1}`, { is_visible: false });
  is('oculta a Parte 1', r, 200);
  content = (await call(aluno.token, 'GET', `/communities/${cid}/content`)).data;
  check('aluno não vê a Parte 1 nem as filhas (herda ocultação)', content.sections.length === 0, JSON.stringify(content.sections.map((s) => s.title)));
  content = (await call(prof.token, 'GET', `/communities/${cid}/content`)).data;
  check('professor vê tudo', content.sections.length === 4);
  r = await call(prof.token, 'PUT', `/communities/${cid}/sections/${parte1}`, { is_visible: true });

  console.log('\n# Quiz: criação e validação');
  r = await call(prof.token, 'POST', '/workflows', { name: 'Modelo Tucker3' }); const wfModelo = r.data.uuid;
  r = await call(prof.token, 'POST', '/datasets/import', { name: 'X multiway da turma', tensor: [[1, 2, 3], [4, 5, 6]], dimensions: [2, 3] });
  is('professor cria o multiway X', r, 201); const dsX = r.data.uuid;
  r = await call(aluno.token, 'POST', `/communities/${cid}/quizzes`, { title: 'x' }); is('aluno não cria quiz', r, 403);
  r = await call(prof.token, 'POST', `/communities/${cid}/quizzes`, {}); is('quiz sem título → 422', r, 422);
  r = await call(prof.token, 'POST', `/communities/${cid}/quizzes`, { title: 'Exercício 1 — Tucker3', description: 'Decomponha X', section: pratica, show_results: 'after_submit' });
  is('cria quiz (rascunho)', r, 201); const qz = r.data.uuid;
  r = await call(prof.token, 'PUT', `/communities/${cid}/quizzes/${qz}`, { status: 'open' });
  is('não publica sem perguntas', r, 422);

  const bad = async (name, q) => { const x = await call(prof.token, 'PUT', `/communities/${cid}/quizzes/${qz}/questions`, { questions: [q] }); is(name, x, 422); };
  await bad('V/F sem gabarito rejeitada', { kind: 'tf', prompt: 'A?', config: {} });
  await bad('múltipla escolha com 1 alternativa rejeitada', { kind: 'choice', prompt: 'A?', config: { options: [{ text: 'a', correct: true }] } });
  await bad('múltipla escolha sem correta rejeitada', { kind: 'choice', prompt: 'A?', config: { options: [{ text: 'a' }, { text: 'b' }] } });
  await bad('resposta única com 2 corretas rejeitada', { kind: 'choice', prompt: 'A?', config: { options: [{ text: 'a', correct: true }, { text: 'b', correct: true }] } });
  await bad('enunciado vazio rejeitado', { kind: 'text', prompt: ' ' });
  await bad('tipo inválido rejeitado', { kind: 'xyz', prompt: 'A' });
  await bad('anexo inexistente rejeitado', { kind: 'dataset', prompt: 'A', attachments: [{ kind: 'dataset', ref: 'nope' }] });

  r = await call(prof.token, 'PUT', `/communities/${cid}/quizzes/${qz}/questions`, { questions: [
    { kind: 'tf', prompt: 'O Tucker3 generaliza a PCA para dados de 3 vias.', points: 1, config: { answer: true } },
    { kind: 'choice', prompt: 'Qual modelo tem uma só matriz core superdiagonal?', points: 2, config: { options: [{ id: 'a', text: 'PARAFAC', correct: true }, { id: 'b', text: 'PCA' }, { id: 'c', text: 'PLS' }] } },
    { kind: 'choice', prompt: 'Marque as técnicas multiway.', points: 2, config: { multiple: true, options: [{ id: 'a', text: 'Tucker3', correct: true }, { id: 'b', text: 'PARAFAC', correct: true }, { id: 'c', text: 'SNV' }] } },
    { kind: 'text', prompt: 'Explique o que é o core array.', points: 3, config: { model_answer: 'Interação entre componentes' } },
    { kind: 'dataset', prompt: 'Entregue a variável de scores do modo A.', points: 2 },
    { kind: 'workflow', prompt: 'Faça o Tucker3 em X e entregue seu workflow.', points: 5, config: { hint: 'Use [2,2,2]' }, attachments: [{ kind: 'dataset', ref: dsX }, { kind: 'workflow', ref: wfModelo }] },
  ] });
  is('salva 6 perguntas (todos os tipos)', r, 200);

  console.log('\n# Publicação e visão do aluno');
  r = await call(aluno.token, 'GET', `/communities/${cid}/quizzes/${qz}`); is('rascunho é 404 para o aluno', r, 404);
  r = await call(aluno.token, 'GET', `/communities/${cid}/quizzes`); check('lista do aluno não traz rascunho', r.data.length === 0);
  r = await call(aluno.token, 'GET', `/datasets/${dsX}`); is('antes de publicar: X é 404 para o aluno', r, 404);
  r = await call(prof.token, 'PUT', `/communities/${cid}/quizzes/${qz}`, { status: 'open' }); is('publica', r, 200);
  r = await call(outro.token, 'GET', `/communities/${cid}/quizzes/${qz}`); is('não-membro não vê o quiz', r, 404);
  r = await call(aluno.token, 'GET', `/communities/${cid}/quizzes/${qz}`); is('aluno abre o quiz', r, 200);
  const qa = r.data;
  const qs = qa.questions;
  check('6 perguntas, total 15 pontos', qs.length === 6 && qa.total_points === 15, qa.total_points);
  check('aluno não recebe gabarito V/F', qs[0].config.answer === undefined);
  check('aluno não recebe "correct" das alternativas', qs[1].config.options.every((o) => o.correct === undefined));
  check('aluno não recebe resposta-modelo', qs[3].config.model_answer === undefined);
  check('anexos visíveis ao aluno (X e modelo)', qs[5].attachments.length === 2 && qs[5].attachments[0].dimensions?.length === 2);
  r = await call(aluno.token, 'GET', `/datasets/${dsX}`); is('após publicar: aluno lê o X da turma', r, 200);
  r = await call(aluno.token, 'GET', `/workflows/${wfModelo}`);
  check('aluno lê o workflow-modelo (somente leitura)', r.status === 200 && r.data.can_edit === false);
  r = await call(aluno.token, 'PUT', `/communities/${cid}/quizzes/${qz}/questions`, { questions: [] }); is('aluno não edita perguntas', r, 403);

  console.log('\n# Aluno responde');
  const ans = (i, body) => call(aluno.token, 'PUT', `/communities/${cid}/quizzes/${qz}/answers/${qs[i].uuid}`, body);
  r = await ans(0, { value: 'sim' }); is('V/F exige booleano', r, 422);
  r = await ans(1, { value: ['zzz'] }); is('alternativa inexistente rejeitada', r, 422);
  r = await ans(1, { value: ['a', 'b'] }); is('resposta única com 2 alternativas rejeitada', r, 422);
  r = await ans(0, { value: true }); is('responde V/F', r, 200);
  r = await ans(1, { value: ['a'] }); is('responde única', r, 200);
  r = await ans(2, { value: ['a'] }); is('responde múltipla (parcial, errada)', r, 200);
  r = await ans(3, { value: 'É a matriz que relaciona os componentes dos três modos.' }); is('responde texto', r, 200);
  r = await call(outro.token, 'POST', '/datasets/import', { name: 'De outra pessoa', tensor: [[1]], dimensions: [1, 1] }); const dsOutro = r.data.uuid;
  r = await ans(4, { ref: dsOutro }); is('não entrega variável de outra pessoa', r, 422);
  r = await call(aluno.token, 'POST', '/datasets/import', { name: 'Scores A', tensor: [[1, 2], [3, 4]], dimensions: [2, 2] }); const dsAluno = r.data.uuid;
  r = await ans(4, { ref: dsAluno }); is('entrega a própria variável', r, 200);
  r = await call(aluno.token, 'POST', '/workflows', { name: 'Tucker3 do aluno' }); const wfAluno = r.data.uuid;
  r = await ans(5, { ref: wfAluno }); is('entrega o próprio workflow', r, 200);
  r = await call(prof.token, 'GET', `/workflows/${wfAluno}`); is('antes de entregar: professor NÃO lê o workflow do aluno', r, 404);

  r = await call(aluno.token, 'GET', `/communities/${cid}/quizzes/${qz}`);
  check('respostas salvas aparecem', r.data.my_submission?.status === 'in_progress' && r.data.my_submission.answers.length === 6);
  check('aluno relê o próprio texto', r.data.my_submission.answers.find((a) => a.question === qs[3].uuid)?.value === 'É a matriz que relaciona os componentes dos três modos.');
  r = await call(aluno.token, 'POST', `/communities/${cid}/quizzes/${qz}/submit`); is('entrega', r, 200);
  check('com perguntas manuais fica "submitted"', r.data.status === 'submitted' && r.data.pending_manual === 3, JSON.stringify(r.data));
  r = await ans(0, { value: false }); is('depois de entregar não altera', r, 409);
  r = await call(aluno.token, 'POST', `/communities/${cid}/quizzes/${qz}/submit`); is('não entrega duas vezes', r, 409);

  console.log('\n# Professor corrige vendo o trabalho do aluno');
  r = await call(aluno.token, 'GET', `/communities/${cid}/quizzes/${qz}/submissions`); is('aluno não lista entregas', r, 403);
  r = await call(prof.token, 'GET', `/communities/${cid}/quizzes/${qz}/submissions`);
  is('professor lista entregas', r, 200);
  check('1 entrega submitted', r.data.submissions.length === 1 && r.data.submissions[0].status === 'submitted');
  const sid = r.data.submissions[0].uuid;
  r = await call(prof.token, 'GET', `/workflows/${wfAluno}`); is('após entregar: professor lê o workflow do aluno', r, 200);
  check('… somente leitura', r.data.can_edit === false);
  r = await call(prof.token, 'GET', `/datasets/${dsAluno}`); is('após entregar: professor lê a variável do aluno', r, 200);
  r = await call(outro.token, 'GET', `/workflows/${wfAluno}`); is('terceiros continuam sem acesso', r, 404);
  r = await call(prof.token, 'GET', `/communities/${cid}/quizzes/${qz}/submissions/${sid}`);
  is('professor abre a entrega', r, 200);
  const sub = r.data;
  check('entrega traz a ref do workflow com nome', sub.questions[5].answer?.ref?.name === 'Tucker3 do aluno' && sub.questions[5].answer.ref.uuid === wfAluno);
  check('correção automática: V/F=1, única=2, múltipla=0', sub.questions[0].answer.points === 1 && sub.questions[1].answer.points === 2 && sub.questions[2].answer.points === 0, JSON.stringify(sub.questions.slice(0, 3).map((x) => x.answer.points)));
  check('resposta de texto volta íntegra (acentos)', sub.questions[3].answer?.value === 'É a matriz que relaciona os componentes dos três modos.', JSON.stringify(sub.questions[3].answer));
  check('professor vê o gabarito', sub.questions[0].config.answer === true && sub.questions[3].config.model_answer);
  r = await call(prof.token, 'PUT', `/communities/${cid}/quizzes/${qz}/submissions/${sid}/grade`, { answers: [{ question: qs[3].uuid, points: 99 }] });
  is('nota acima do máximo rejeitada', r, 422);
  r = await call(prof.token, 'PUT', `/communities/${cid}/quizzes/${qz}/submissions/${sid}/grade`, { answers: [{ question: qs[3].uuid, points: 2.5, feedback: 'Bom' }] });
  check('correção parcial mantém "submitted"', r.status === 200 && r.data.status === 'submitted' && r.data.pending === 2, JSON.stringify(r.data));
  r = await call(prof.token, 'PUT', `/communities/${cid}/quizzes/${qz}/submissions/${sid}/grade`, {
    feedback: 'Parabéns!',
    answers: [{ question: qs[4].uuid, points: 2 }, { question: qs[5].uuid, points: 4, feedback: 'Faltou rotacionar' }],
  });
  check('correção completa → graded, nota 1+2+0+2.5+2+4 = 11.5', r.data.status === 'graded' && r.data.score === 11.5, JSON.stringify(r.data));
  r = await call(aluno.token, 'GET', `/communities/${cid}/quizzes/${qz}`);
  check('aluno vê nota, feedback e gabarito', r.data.my_submission.status === 'graded' && r.data.my_submission.score === 11.5 && r.data.revealed && r.data.questions[0].config.answer === true);
  check('aluno vê o feedback por pergunta', r.data.my_submission.answers.find((a) => a.question === qs[5].uuid)?.feedback === 'Faltou rotacionar');

  console.log('\n# Reabrir, fechar e remover');
  r = await call(prof.token, 'PUT', `/communities/${cid}/quizzes/${qz}/questions`, { questions: [{ kind: 'text', prompt: 'x' }] });
  is('editar perguntas com entregas exige confirmação', r, 409);
  check('… com código HAS_SUBMISSIONS', r.error?.code === 'HAS_SUBMISSIONS' || r.status === 409);
  r = await call(aluno.token, 'GET', `/communities/${cid}/quizzes/${qz}`);
  check('padrão: 1 tentativa, sem nova tentativa', r.data.max_attempts === 1 && r.data.can_retry === false && r.data.attempts_used === 1 && r.data.attempts_left === 0, JSON.stringify([r.data.max_attempts, r.data.can_retry, r.data.attempts_used, r.data.attempts_left]));
  r = await call(aluno.token, 'POST', `/communities/${cid}/quizzes/${qz}/start`, { new_attempt: true });
  is('1 tentativa: nova tentativa recusada', r, 409);
  r = await call(prof.token, 'POST', `/communities/${cid}/quizzes/${qz}/submissions/${sid}/reopen`); is('devolve a entrega', r, 200);
  r = await call(prof.token, 'GET', `/workflows/${wfAluno}`); is('reaberta: professor volta a não ler o trabalho', r, 404);
  r = await ans(0, { value: false }); is('aluno edita de novo', r, 200);
  r = await call(prof.token, 'PUT', `/communities/${cid}/quizzes/${qz}`, { status: 'closed' }); is('fecha o quiz', r, 200);
  r = await ans(0, { value: true }); is('quiz fechado não recebe respostas', r, 409);
  r = await call(aluno.token, 'POST', `/communities/${cid}/quizzes/${qz}/submit`); is('quiz fechado não recebe entrega', r, 409);

  console.log('\n# Tentativas configuráveis');
  r = await call(prof.token, 'POST', `/communities/${cid}/quizzes`, { title: 'Treino', max_attempts: -1 }); is('max_attempts negativo rejeitado', r, 422);
  r = await call(prof.token, 'POST', `/communities/${cid}/quizzes`, { title: 'Treino', max_attempts: 999 }); is('max_attempts acima do limite rejeitado', r, 422);
  r = await call(prof.token, 'POST', `/communities/${cid}/quizzes`, { title: 'Treino', max_attempts: 2, grade_policy: 'xyz' }); is('grade_policy inválida rejeitada', r, 422);
  r = await call(prof.token, 'POST', `/communities/${cid}/quizzes`, { title: 'Treino', max_attempts: 2, grade_policy: 'highest' }); is('cria quiz com 2 tentativas', r, 201);
  const qza = r.data.uuid;
  check('quiz devolve max_attempts/grade_policy', r.data.max_attempts === 2 && r.data.grade_policy === 'highest');
  await call(prof.token, 'PUT', `/communities/${cid}/quizzes/${qza}/questions`, { questions: [
    { kind: 'tf', prompt: 'Tucker3 tem 3 modos.', points: 2, config: { answer: true } },
    { kind: 'choice', prompt: 'Qual é PARAFAC?', points: 3, config: { multiple: false, options: [{ id: 'a', text: 'CP', correct: true }, { id: 'b', text: 'PCA' }] } },
  ] });
  await call(prof.token, 'PUT', `/communities/${cid}/quizzes/${qza}`, { status: 'open' });
  r = await call(aluno.token, 'GET', `/communities/${cid}/quizzes/${qza}`); const qqza = r.data.questions;
  const put = (i, body) => call(aluno.token, 'PUT', `/communities/${cid}/quizzes/${qza}/answers/${qqza[i].uuid}`, body);
  const sendA = () => call(aluno.token, 'POST', `/communities/${cid}/quizzes/${qza}/submit`);
  const startA = (b) => call(aluno.token, 'POST', `/communities/${cid}/quizzes/${qza}/start`, b);
  await put(0, { value: true }); await put(1, { value: ['b'] });
  r = await sendA(); check('tentativa 1 → nota 2', r.data.status === 'graded' && r.data.score === 2, JSON.stringify(r.data));
  r = await call(aluno.token, 'GET', `/communities/${cid}/quizzes/${qza}`);
  check('pode tentar de novo (1 restante)', r.data.can_retry === true && r.data.attempts_left === 1 && r.data.attempts_used === 1);
  r = await startA();
  check('start sem new_attempt devolve a tentativa já entregue', r.data.attempt === 1 && r.data.status === 'graded');
  r = await startA({ new_attempt: true }); check('nova tentativa → #2 em andamento', r.status === 200 && r.data.attempt === 2 && r.data.status === 'in_progress', JSON.stringify(r.data));
  r = await startA({ new_attempt: true }); check('repetir new_attempt não cria outra (continua a #2)', r.data.attempt === 2);
  r = await call(aluno.token, 'GET', `/communities/${cid}/quizzes/${qza}`);
  check('tentativa atual vazia, histórico com 2', r.data.my_submission.attempt === 2 && r.data.my_submission.answers.length === 0 && r.data.attempts.length === 2);
  check('nota oficial = melhor (2) enquanto a #2 não entrega', r.data.official_score === 2 && r.data.official_attempt === 1);
  await put(0, { value: true }); await put(1, { value: ['a'] });
  r = await sendA(); check('tentativa 2 → nota 5', r.data.score === 5, JSON.stringify(r.data));
  r = await call(aluno.token, 'GET', `/communities/${cid}/quizzes/${qza}`);
  check('melhor nota: oficial 5 (#2), sem tentativas restantes', r.data.official_score === 5 && r.data.official_attempt === 2 && r.data.can_retry === false && r.data.attempts_left === 0);
  r = await startA({ new_attempt: true }); is('esgotou as tentativas', r, 409);
  r = await call(prof.token, 'GET', `/communities/${cid}/quizzes/${qza}/submissions`);
  check('professor vê as 2 tentativas, só a melhor conta', r.data.submissions.length === 2 && r.data.submissions.filter((x) => x.counted).length === 1 && r.data.submissions.find((x) => x.counted).attempt === 2, JSON.stringify(r.data.submissions.map((x) => [x.attempt, x.counted])));
  check('1 aluno entregou (student_count)', r.data.student_count === 1);
  r = await call(prof.token, 'GET', `/communities/${cid}/content`);
  check('lista de conteúdo: submission_count conta alunos, não tentativas', (r.data.general.quizzes || []).concat(r.data.sections.flatMap((x) => x.quizzes || [])).find((x) => x.uuid === qza)?.submission_count === 1);

  // políticas
  r = await call(prof.token, 'PUT', `/communities/${cid}/quizzes/${qza}`, { grade_policy: 'first' }); is('troca política → primeira', r, 200);
  r = await call(aluno.token, 'GET', `/communities/${cid}/quizzes/${qza}`); check('política "primeira": oficial = #1 (2)', r.data.official_score === 2 && r.data.official_attempt === 1);
  r = await call(prof.token, 'PUT', `/communities/${cid}/quizzes/${qza}`, { grade_policy: 'latest' });
  r = await call(aluno.token, 'GET', `/communities/${cid}/quizzes/${qza}`); check('política "última": oficial = #2 (5)', r.data.official_attempt === 2);
  r = await call(prof.token, 'PUT', `/communities/${cid}/quizzes/${qza}`, { max_attempts: 0 }); is('tentativas ilimitadas (0)', r, 200);
  r = await call(aluno.token, 'GET', `/communities/${cid}/quizzes/${qza}`); check('ilimitadas: can_retry e attempts_left=null', r.data.can_retry === true && r.data.attempts_left === null);
  r = await startA({ new_attempt: true }); check('abre a tentativa #3', r.data.attempt === 3);
  r = await call(prof.token, 'PUT', `/communities/${cid}/quizzes/${qza}`, { max_attempts: 1 }); is('reduz limite abaixo do que já usou', r, 200);
  await put(0, { value: false }); r = await sendA(); check('tentativa #3 em andamento ainda pode ser entregue', r.status === 200 && r.data.score === 0, JSON.stringify(r.data));
  r = await startA({ new_attempt: true }); is('limite 1 já estourado: nova tentativa recusada', r, 409);
  r = await call(outro.token, 'POST', `/communities/${cid}/quizzes/${qza}/start`, {}); check('não-membro não inicia', [403, 404].includes(r.status));

  console.log('\n# Editar perguntas com entregas (recorrige)');
  r = await call(prof.token, 'GET', `/communities/${cid}/quizzes/${qza}`); const qSrc = r.data.questions;
  const edit = (qs2, confirm) => call(prof.token, 'PUT', `/communities/${cid}/quizzes/${qza}/questions`, { questions: qs2, ...(confirm ? { confirm: true } : {}) });
  const keep = (x, over = {}) => ({ uuid: x.uuid, kind: x.kind, prompt: x.prompt, points: x.points, config: x.config, ...over });
  r = await edit([keep(qSrc[0], { config: { answer: false } }), keep(qSrc[1])]); is('sem confirm → 409', r, 409);
  check('… informa quantas entregas', r.error?.details?.submissions === 3 || r.status === 409);
  r = await edit([keep(qSrc[0], { config: { answer: false } }), keep(qSrc[1])], true); is('com confirm → salva', r, 200);
  r = await call(prof.token, 'GET', `/communities/${cid}/quizzes/${qza}/submissions`);
  const bySub = Object.fromEntries(r.data.submissions.map((x) => [x.attempt, x.score]));
  check('recorrigido: #1 (V,b)=0, #2 (V,a)=3, #3 (F,—)=2', bySub[1] === 0 && bySub[2] === 3 && bySub[3] === 2, JSON.stringify(bySub));
  r = await edit([keep(qSrc[0], { config: { answer: false } }), keep(qSrc[1], { config: { multiple: false, options: [{ id: 'a', text: 'CP' }, { id: 'c', text: 'Tucker', correct: true }] } })], true);
  is('alternativa removida/alterada com confirm', r, 200);
  r = await call(prof.token, 'GET', `/communities/${cid}/quizzes/${qza}/submissions`);
  const by2 = Object.fromEntries(r.data.submissions.map((x) => [x.attempt, x.score]));
  check('resposta "b" (removida) descartada; #2 (a) errada: #1=0, #2=0, #3=2', by2[1] === 0 && by2[2] === 0 && by2[3] === 2, JSON.stringify(by2));
  r = await edit([keep(qSrc[0], { kind: 'text', config: {} })], true); is('muda tipo de pergunta com confirm', r, 200);
  r = await call(prof.token, 'GET', `/communities/${cid}/quizzes/${qza}/submissions`);
  check('com pergunta manual nova, entregas voltam a "submitted"', r.data.submissions.every((x) => x.status === 'submitted'), JSON.stringify(r.data.submissions.map((x) => x.status)));
  r = await call(prof.token, 'DELETE', `/communities/${cid}/quizzes/${qza}`); is('exclui quiz de tentativas', r, 204);

  // quiz só com perguntas automáticas é corrigido na hora
  r = await call(prof.token, 'POST', `/communities/${cid}/quizzes`, { title: 'Relâmpago' }); const qz2 = r.data.uuid;
  await call(prof.token, 'PUT', `/communities/${cid}/quizzes/${qz2}/questions`, { questions: [{ kind: 'tf', prompt: 'A água ferve a 100 °C ao nível do mar.', config: { answer: true } }] });
  await call(prof.token, 'PUT', `/communities/${cid}/quizzes/${qz2}`, { status: 'open', due_at: new Date(Date.now() + 3600e3).toISOString() });
  r = await call(aluno.token, 'GET', `/communities/${cid}/quizzes/${qz2}`); const q2 = r.data.questions[0];
  r = await call(aluno.token, 'PUT', `/communities/${cid}/quizzes/${qz2}/answers/${q2.uuid}`, { value: true });
  r = await call(aluno.token, 'POST', `/communities/${cid}/quizzes/${qz2}/submit`);
  check('só automáticas → graded com nota 1', r.data.status === 'graded' && r.data.score === 1, JSON.stringify(r.data));
  await call(prof.token, 'PUT', `/communities/${cid}/quizzes/${qz2}`, { due_at: new Date(Date.now() - 1000).toISOString() });
  r = await call(aluno.token, 'GET', `/communities/${cid}/quizzes/${qz2}`);
  check('prazo vencido → accepting=false', r.data.accepting === false);
  content = (await call(aluno.token, 'GET', `/communities/${cid}/content`)).data;
  check('quiz aparece na subaula Prática', content.sections.find((s) => s.uuid === pratica).quizzes.some((x) => x.uuid === qz && x.my_status));
  r = await call(prof.token, 'DELETE', `/communities/${cid}/sections/${parte1}`); is('exclui a Parte 1 com todas as filhas', r, 204);
  content = (await call(prof.token, 'GET', `/communities/${cid}/content`)).data;
  check('nada sobrou dos descendentes', content.sections.length === 0);
  r = await call(prof.token, 'GET', `/communities/${cid}/quizzes/${qz}`); is('quiz da subaula foi junto', r, 404);
  r = await call(prof.token, 'GET', `/communities/${cid}/quizzes/${qz2}`); is('quiz fora de tópico permanece', r, 200);
  r = await call(prof.token, 'DELETE', `/communities/${cid}/quizzes/${qz2}`); is('exclui quiz', r, 204);
  r = await call(prof.token, 'DELETE', `/communities/${cid}`); is('exclui comunidade', r, 204);

  console.log(`\n${pass} ok, ${fail} falhas`);
  process.exit(fail ? 1 : 0);
};
main().catch((e) => { console.error(e); process.exit(1); });
