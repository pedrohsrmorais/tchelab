// Equipamentos: cadastro, janelas, bloqueios, reservas sem sobreposição, aprovação, imagem e página pública (QR).
// Uso:  node tests/equipment_e2e.mjs [http://localhost:3003]
// Requer o backend com MAIL_TRANSPORT=file (e-mails gravados em storage/outbox) — OUTBOX_DIR aponta a pasta.
import fs from 'node:fs';
const BASE = (process.argv[2] || 'http://localhost:3003') + '/api/v1';
const OUTBOX = process.env.OUTBOX_DIR || '/tmp/tl_storage/outbox';
const stamp = Date.now().toString(36);
const TZ = 'America/Sao_Paulo';
let pass = 0; let fail = 0;

async function call(token, method, p, body, raw) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload = body;
  if (body !== undefined && !(body instanceof FormData)) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  const r = await fetch(BASE + p, { method, headers, body: payload });
  if (raw) return r;
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
  return { token: login.data.access_token, user: login.data.user, email };
}
const dayStr = (off) => new Date(Date.now() + off * 86400000).toLocaleDateString('sv-SE', { timeZone: TZ });
const T = (off, hhmm) => new Date(`${dayStr(off)}T${hhmm}:00-03:00`).toISOString();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const lastMailTo = (email) => {
  if (!fs.existsSync(OUTBOX)) return null;
  const files = fs.readdirSync(OUTBOX).sort().reverse();
  for (const f of files) { const j = JSON.parse(fs.readFileSync(`${OUTBOX}/${f}`, 'utf8')); if (j.to === email) return j; }
  return null;
};
const linkIn = (mailObj) => (mailObj?.text.match(/https?:\/\/\S+/) || [])[0];
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

const main = async () => {
  const prof = await makeUser('eprof'); const aluno = await makeUser('ealuno'); const colega = await makeUser('ecolega'); const outro = await makeUser('eoutro');
  let r = await call(prof.token, 'POST', '/communities', { name: 'Lab NIR E2E', visibility: 'private' }); const cid = r.data.uuid;
  r = await call(prof.token, 'POST', `/communities/${cid}/invites`, { max_uses: 5 }); const code = r.data.code;
  await call(aluno.token, 'POST', '/communities/join', { code }); await call(colega.token, 'POST', '/communities/join', { code });
  const E = `/communities/${cid}/equipment`;

  console.log('\n# Cadastro e validação');
  r = await call(aluno.token, 'POST', E, { name: 'X' }); is('membro não cadastra', r, 403);
  r = await call(outro.token, 'GET', E); is('não-membro não vê (comunidade privada)', r, 404);
  r = await call(prof.token, 'POST', E, { name: '' }); is('nome obrigatório', r, 422);
  r = await call(prof.token, 'POST', E, { name: 'X', timezone: 'Marte/Olimpo' }); is('fuso inválido', r, 422);
  r = await call(prof.token, 'POST', E, { name: 'X', slot_minutes: 30, min_minutes: 45 }); is('mínimo não múltiplo do slot', r, 422);
  r = await call(prof.token, 'POST', E, { name: 'X', slot_minutes: 30, min_minutes: 60, max_minutes: 30 }); is('máximo menor que o mínimo', r, 422);
  r = await call(prof.token, 'POST', E, { name: 'NIR portátil', description: 'Espectrômetro', location: 'Sala 201', responsible: prof.user.uuid, slot_minutes: 30, min_minutes: 30, max_minutes: 120, min_notice_minutes: 0, max_advance_days: 30,
    specs: [{ key: 'Faixa', value: '900–1700 nm' }, { key: '', value: '' }] });
  is('cria equipamento', r, 201); const eid = r.data.uuid; const EQ = `${E}/${eid}`;
  check('especificações vazias são descartadas', r.data.specs.length === 1 && r.data.specs[0].key === 'Faixa');
  check('professor recebe o token só quando público', r.data.public_token === null && r.data.access === 'community');
  r = await call(prof.token, 'POST', E, { name: 'Resp fora', responsible: outro.user.uuid }); is('responsável precisa ser membro', r, 422);
  r = await call(prof.token, 'GET', EQ); check('janelas padrão seg–sex 08–18', r.data.windows.length === 5 && r.data.windows[0].start === '08:00');

  console.log('\n# Janelas de horário');
  r = await call(prof.token, 'PUT', `${EQ}/windows`, { windows: [{ weekday: 1, start: '08:00', end: '12:00', audience: 'members' }, { weekday: 1, start: '11:00', end: '14:00', audience: 'public' }] }); is('janelas sobrepostas rejeitadas', r, 422);
  r = await call(prof.token, 'PUT', `${EQ}/windows`, { windows: [{ weekday: 1, start: '12:00', end: '08:00', audience: 'members' }] }); is('início depois do fim rejeitado', r, 422);
  r = await call(prof.token, 'PUT', `${EQ}/windows`, { windows: [{ weekday: 9, start: '08:00', end: '09:00', audience: 'members' }] }); is('dia da semana inválido', r, 422);
  const wins = []; for (let d = 0; d < 7; d += 1) { wins.push({ weekday: d, start: '08:00', end: '12:00', audience: 'members' }, { weekday: d, start: '12:00', end: '16:00', audience: 'public' }); }
  r = await call(aluno.token, 'PUT', `${EQ}/windows`, { windows: wins }); is('membro não altera janelas', r, 403);
  r = await call(prof.token, 'PUT', `${EQ}/windows`, { windows: wins }); is('define janelas: manhã membros, tarde público', r, 200);

  console.log('\n# Disponibilidade');
  const d2 = dayStr(2);
  r = await call(aluno.token, 'GET', `${EQ}/availability?from=${d2}&to=${d2}`); is('membro vê a agenda', r, 200);
  check('16 slots no dia (8 + 8 de 30 min)', r.data.slots.length === 16 && r.data.slots.every((s) => s.state === 'free'), String(r.data.slots.length));
  r = await call(aluno.token, 'GET', `${EQ}/availability?from=${d2}&to=${dayStr(60)}`); is('período acima de 35 dias rejeitado', r, 422);

  console.log('\n# Reserva de membro (modal interno)');
  const body = (h1, h2, off = 2, extra = {}) => ({ start: T(off, h1), end: T(off, h2), purpose: 'Calibração', ...extra });
  r = await call(aluno.token, 'POST', `${EQ}/bookings`, body('09:10', '10:10')); is('início fora da grade rejeitado', r, 409);
  r = await call(aluno.token, 'POST', `${EQ}/bookings`, body('09:00', '11:30')); check('duração acima do máximo rejeitada', r.status === 422 && r.error.code === 'TOO_LONG', JSON.stringify(r.error));
  r = await call(aluno.token, 'POST', `${EQ}/bookings`, body('07:00', '08:00')); is('fora da janela aberta', r, 409);
  r = await call(aluno.token, 'POST', `${EQ}/bookings`, { start: T(-1, '09:00'), end: T(-1, '10:00') }); is('no passado', r, 409);
  r = await call(aluno.token, 'POST', `${EQ}/bookings`, { start: T(40, '09:00'), end: T(40, '10:00') }); is('além da antecedência máxima', r, 409);
  r = await call(outro.token, 'POST', `${EQ}/bookings`, body('09:00', '10:00')); is('não-membro não reserva', r, 404);
  r = await call(aluno.token, 'POST', `${EQ}/bookings`, body('09:00', '10:00', 2, { project_note: 'Projeto trigo' })); is('membro reserva (aprovação automática)', r, 201);
  check('já nasce confirmada', r.data.status === 'confirmed' && r.data.mine === true && r.data.purpose === 'Calibração');
  const bAluno = r.data.uuid;
  r = await call(colega.token, 'POST', `${EQ}/bookings`, body('09:30', '10:30')); is('sobreposição parcial recusada', r, 409);
  r = await call(colega.token, 'POST', `${EQ}/bookings`, body('10:00', '11:00')); is('horário colado ao anterior é permitido', r, 201); const bColega = r.data.uuid;
  r = await call(colega.token, 'GET', `${EQ}/availability?from=${d2}&to=${d2}`);
  const busy = r.data.slots.find((s) => s.start === T(2, '09:00'));
  check('slot ocupado traz quem usa', busy.state === 'busy' && busy.booking.name === 'User ealuno' && busy.booking.mine === false && busy.booking.uuid === undefined);

  console.log('\n# Concorrência: 8 pedidos simultâneos para o mesmo horário');
  const racers = [aluno, colega, prof, aluno, colega, prof, aluno, colega];
  const results = await Promise.all(racers.map((u) => call(u.token, 'POST', `${EQ}/bookings`, body('08:00', '08:30', 3))));
  const okN = results.filter((x) => x.status === 201).length; const confN = results.filter((x) => x.status === 409).length;
  check('exatamente 1 vence e 7 recebem 409', okN === 1 && confN === 7, JSON.stringify(results.map((x) => x.status)));

  console.log('\n# Visibilidade e cancelamento');
  r = await call(colega.token, 'GET', `${EQ}/bookings?from=${T(0, '00:00')}`);
  check('membro vê confirmadas dos outros, sem finalidade', r.data.some((b) => b.who.name === 'User ealuno' && b.purpose === undefined));
  r = await call(prof.token, 'GET', `${EQ}/bookings?from=${T(0, '00:00')}`);
  check('staff vê a finalidade', r.data.find((b) => b.uuid === bAluno).purpose === 'Calibração');
  r = await call(colega.token, 'POST', `${EQ}/bookings/${bAluno}/cancel`, {}); is('colega não cancela reserva alheia', r, 403);
  r = await call(colega.token, 'POST', `${EQ}/bookings/${bAluno}/approve`, {}); is('membro não aprova', r, 403);
  r = await call(prof.token, 'PUT', EQ, { cancel_until_minutes: 43200 }); is('prazo de cancelamento de 30 dias', r, 200);
  r = await call(aluno.token, 'POST', `${EQ}/bookings/${bAluno}/cancel`, {}); check('dentro do prazo mínimo → TOO_LATE', r.status === 409 && r.error.code === 'TOO_LATE', JSON.stringify(r.error));
  r = await call(prof.token, 'PUT', EQ, { cancel_until_minutes: 0 });
  r = await call(aluno.token, 'POST', `${EQ}/bookings/${bAluno}/cancel`, { note: 'desisti' }); check('dono cancela a própria', r.status === 200 && r.data.status === 'cancelled');
  r = await call(aluno.token, 'POST', `${EQ}/bookings/${bAluno}/cancel`, {}); is('cancelar de novo é recusado', r, 409);
  r = await call(colega.token, 'POST', `${EQ}/bookings`, body('09:00', '10:00')); is('horário cancelado volta a ficar livre', r, 201);
  r = await call(colega.token, 'GET', `${E}/bookings/mine`); check('"minhas reservas" lista só as minhas', r.status === 200 && r.data.length >= 2 && r.data.every((b) => b.mine && b.equipment.name === 'NIR portátil'), JSON.stringify(r.data?.length));

  console.log('\n# Aprovação manual');
  r = await call(prof.token, 'PUT', EQ, { member_approval: 'manual' }); is('aprovação manual para membros', r, 200);
  r = await call(aluno.token, 'POST', `${EQ}/bookings`, body('11:00', '11:30', 4)); check('nasce pendente', r.status === 201 && r.data.status === 'pending'); const bPend = r.data.uuid;
  r = await call(aluno.token, 'POST', `${EQ}/bookings`, body('11:00', '11:30', 4)); is('pendente também segura o horário', r, 409);
  r = await call(prof.token, 'GET', E); check('lista mostra pedidos pendentes ao staff', r.data.find((x) => x.uuid === eid).pending_count >= 1);
  r = await call(prof.token, 'POST', `${EQ}/bookings/${bPend}/approve`, { note: 'ok' }); check('staff aprova', r.status === 200 && r.data.status === 'confirmed');
  r = await call(prof.token, 'POST', `${EQ}/bookings/${bPend}/approve`, {}); is('aprovar de novo é recusado', r, 409);
  r = await call(aluno.token, 'POST', `${EQ}/bookings`, body('11:30', '12:00', 4)); const bRej = r.data.uuid;
  r = await call(prof.token, 'POST', `${EQ}/bookings/${bRej}/reject`, { note: 'manutenção' }); check('staff recusa com mensagem', r.data.status === 'rejected' && r.data.decision_note === 'manutenção');
  r = await call(prof.token, 'POST', `${EQ}/bookings/${bPend}/no_show`, {}); is('não compareceu só depois de começar', r, 409);
  await call(prof.token, 'PUT', EQ, { member_approval: 'auto' });

  console.log('\n# Bloqueios (uso próprio / manutenção)');
  r = await call(aluno.token, 'POST', `${EQ}/blocks`, { start: T(5, '09:00'), end: T(5, '11:00') }); is('membro não bloqueia', r, 403);
  r = await call(prof.token, 'POST', `${EQ}/blocks`, { start: T(5, '11:00'), end: T(5, '09:00') }); is('período inválido', r, 422);
  r = await call(prof.token, 'POST', `${EQ}/blocks`, { start: T(5, '09:00'), end: T(5, '11:00'), reason: 'Uso do grupo', show_reason: false }); is('cria bloqueio', r, 201); const blk = r.data.uuid;
  r = await call(aluno.token, 'POST', `${EQ}/bookings`, body('09:00', '10:00', 5)); is('não reserva dentro de bloqueio', r, 409);
  r = await call(aluno.token, 'GET', `${EQ}/availability?from=${dayStr(5)}&to=${dayStr(5)}`);
  const bs = r.data.slots.find((s) => s.start === T(5, '09:00'));
  check('slot bloqueado sem revelar o motivo (show_reason=false)', bs.state === 'blocked' && !bs.reason);
  r = await call(prof.token, 'POST', `${EQ}/blocks`, { start: T(5, '08:00'), end: T(5, '09:00'), reason: 'Manutenção preventiva', show_reason: true });
  r = await call(aluno.token, 'GET', `${EQ}/availability?from=${dayStr(5)}&to=${dayStr(5)}`);
  check('motivo visível quando show_reason=true', r.data.slots.find((s) => s.start === T(5, '08:00')).reason === 'Manutenção preventiva');
  r = await call(prof.token, 'DELETE', `${EQ}/blocks/${blk}`); is('remove bloqueio', r, 204);
  r = await call(aluno.token, 'POST', `${EQ}/bookings`, body('09:00', '10:00', 5)); is('horário liberado pode ser reservado', r, 201);
  r = await call(prof.token, 'POST', `${EQ}/blocks`, { start: T(5, '09:30'), end: T(5, '10:30'), reason: 'Uso do grupo' });
  check('bloqueio avisa sobre reservas em conflito', r.status === 201 && r.data.conflicts === 1 && r.data.cancelled === 0, JSON.stringify(r.data));
  const blk2 = r.data.uuid;
  r = await call(prof.token, 'GET', `${EQ}/bookings?from=${T(5, '00:00')}&to=${T(6, '00:00')}`); check('a reserva em conflito continua (não cancela sozinho)', r.data.some((b) => b.status === 'confirmed' && b.start === T(5, '09:00')));
  await call(prof.token, 'DELETE', `${EQ}/blocks/${blk2}`);
  r = await call(prof.token, 'POST', `${EQ}/blocks`, { start: T(5, '09:30'), end: T(5, '10:30'), cancel_conflicts: true });
  check('cancel_conflicts cancela as reservas', r.data.cancelled === 1);
  r = await call(prof.token, 'POST', `${EQ}/blocks`, { start: T(9, '14:00'), end: T(9, '15:00'), reason: 'Reunião semanal', repeat_until: dayStr(30) }); is('bloqueio semanal', r, 201);
  r = await call(aluno.token, 'POST', `${EQ}/bookings`, { start: T(16, '14:00'), end: T(16, '14:30') }); check('repetição semanal bloqueia 7 dias depois (em horário de membro? 14h é público)', r.status === 409);
  r = await call(prof.token, 'POST', `${EQ}/blocks`, { start: T(9, '14:00'), end: T(9, '15:00'), repeat_until: dayStr(-3) }); is('repeat_until antes do início rejeitado', r, 422);

  console.log('\n# Imagem');
  const form = (buf, type, name) => { const f = new FormData(); f.append('image', new Blob([buf], { type }), name); return f; };
  r = await call(aluno.token, 'POST', `${EQ}/image`, form(png, 'image/png', 'a.png')); is('membro não envia imagem', r, 403);
  r = await call(prof.token, 'POST', `${EQ}/image`, form(Buffer.from('<svg onload=alert(1)>'), 'image/svg+xml', 'a.svg')); check('SVG recusado', r.status >= 400);
  r = await call(prof.token, 'POST', `${EQ}/image`, form(Buffer.from('isto não é um png'), 'image/png', 'fake.png')); is('conteúdo falso com MIME de imagem recusado', r, 422);
  r = await call(prof.token, 'POST', `${EQ}/image`, form(png, 'image/png', 'a.png')); check('envia imagem válida', r.status === 200 && r.data.has_image === true);
  let raw = await call(aluno.token, 'GET', `${EQ}/image`, undefined, true); check('membro baixa a imagem', raw.status === 200 && raw.headers.get('content-type') === 'image/png' && raw.headers.get('x-content-type-options') === 'nosniff');
  raw = await call(outro.token, 'GET', `${EQ}/image`, undefined, true); check('não-membro não baixa', raw.status === 404);

  console.log('\n# Página pública (QR)');
  r = await call(prof.token, 'GET', EQ); check('ainda sem token (acesso só da comunidade)', r.data.public_token === null);
  r = await call(prof.token, 'PUT', EQ, { access: 'public', guest_approval: 'manual' }); is('liga o acesso público', r, 200);
  const token = r.data.public_token; check('token gerado, longo e URL pronta', token && token.length >= 30 && r.data.public_url.endsWith(`/e/${token}`));
  r = await call(aluno.token, 'GET', EQ); check('membro comum não recebe o token', r.data.public_token === undefined);
  const PUB = `/public/equipment/${token}`;
  r = await call(null, 'GET', '/public/equipment/token-que-nao-existe-0000000000'); is('token inexistente → 404', r, 404);
  r = await call(null, 'GET', PUB); is('página pública abre sem login', r, 200);
  const pubJson = JSON.stringify(r.data);
  check('traz foto/nome/specs/janelas públicas e nada de pessoas', r.data.name === 'NIR portátil' && r.data.has_image && r.data.windows.every((w) => w.audience === 'public') && !pubJson.includes('eprof') && !pubJson.includes('@test.local'));
  raw = await call(null, 'GET', `${PUB}/image`, undefined, true); check('imagem pública', raw.status === 200 && raw.headers.get('content-type') === 'image/png');
  r = await call(null, 'GET', `${PUB}/availability?from=${d2}&to=${d2}`);
  check('anônimo só vê horários das janelas públicas (8 slots)', r.status === 200 && r.data.slots.length === 8 && r.data.slots.every((s) => new Date(s.start) >= new Date(T(2, '12:00'))), String(r.data?.slots?.length));
  check('… sem identificar ninguém', !JSON.stringify(r.data).includes('booking'));

  // reservas de membro na janela pública, para testar "ocupado" anônimo
  r = await call(aluno.token, 'POST', `${EQ}/bookings`, body('12:00', '13:00', 2)); is('membro também reserva em janela pública', r, 201);
  r = await call(null, 'GET', `${PUB}/availability?from=${d2}&to=${d2}`);
  check('horário reservado aparece só como "busy"', r.data.slots.find((s) => s.start === T(2, '12:00')).state === 'busy' && r.data.slots.find((s) => s.start === T(2, '12:30')).state === 'busy');

  const guest = (h1, h2, off, extra = {}) => ({ start: T(off, h1), end: T(off, h2), name: 'Marina Souza', email: `marina.${stamp}@visitante.org`, institution: 'UFRGS — Química', phone: '51 99999-0000', purpose: 'Análise de amostras de solo', consent: true, lang: 'pt', ...extra });
  r = await call(null, 'POST', `${PUB}/bookings`, guest('14:00', '14:30', 3, { name: '', email: 'ruim', consent: false, purpose: '' }));
  check('convidado: validação (nome, e-mail, finalidade, consentimento)', r.status === 422, JSON.stringify(r.error));
  r = await call(null, 'POST', `${PUB}/bookings`, guest('14:00', '14:30', 3, { website: 'http://spam.example' }));
  check('honeypot: finge sucesso e não grava', r.status === 201);
  r = await call(prof.token, 'GET', `${EQ}/bookings?from=${T(3, '00:00')}&to=${T(4, '00:00')}`); check('… nada foi gravado', !r.data.some((b) => b.start === T(3, '14:00')));
  r = await call(null, 'POST', `${PUB}/bookings`, guest('09:00', '09:30', 3)); check('convidado não reserva janela só de membros', r.status === 409 && r.error.code === 'SLOT_UNAVAILABLE');
  r = await call(null, 'POST', `${PUB}/bookings`, guest('14:00', '14:30', 3)); is('convidado reserva na janela pública', r, 201);
  check('com e-mail configurado: aguarda confirmação e NÃO devolve o token de gestão', r.data.status === 'awaiting_email' && r.data.email_confirmation_required === true && r.data.manage_token === undefined, JSON.stringify(r.data));
  const gEmail = `marina.${stamp}@visitante.org`;
  await sleep(200);
  const m1 = lastMailTo(gEmail); check('e-mail de verificação enviado com link', !!m1 && /\/e\/.+\/b\/.+/.test(linkIn(m1) || ''), JSON.stringify(m1?.text));
  const manage = (linkIn(m1) || '').split('/b/')[1];
  r = await call(null, 'POST', `${PUB}/bookings`, { ...guest('14:00', '14:30', 3), email: `outra.${stamp}@visitante.org` }); is('horário em retenção não é oferecido a outro', r, 409);
  r = await call(prof.token, 'GET', `${EQ}/bookings?from=${T(3, '00:00')}&to=${T(4, '00:00')}`); check('retenção não aparece como pedido ao staff', !r.data.some((b) => b.start === T(3, '14:00')));
  r = await call(null, 'GET', `/public/bookings/${manage}`); check('link de gestão mostra o estado', r.status === 200 && r.data.status === 'awaiting_email' && r.data.can_confirm && r.data.can_cancel && r.data.name === 'Marina Souza');
  r = await call(null, 'GET', '/public/bookings/lixo-lixo-lixo-lixo-lixo-lixo'); is('token de gestão inválido → 404', r, 404);
  r = await call(null, 'POST', `/public/bookings/${manage}/confirm`); check('confirmar e-mail → pendente (aprovação manual)', r.status === 200 && r.data.status === 'pending', JSON.stringify(r.data));
  r = await call(null, 'POST', `/public/bookings/${manage}/confirm`); check('confirmar de novo é idempotente', r.status === 200 && r.data.status === 'pending');
  r = await call(prof.token, 'GET', `${EQ}/bookings?status=pending`);
  const gb = r.data.find((b) => b.start === T(3, '14:00'));
  check('staff vê o pedido com e-mail e telefone do convidado', gb && gb.external && gb.guest.email === gEmail && gb.guest.phone === '51 99999-0000' && gb.who.institution === 'UFRGS — Química');
  r = await call(colega.token, 'GET', `${EQ}/bookings?status=pending`); check('membro não vê pedidos pendentes de terceiros', !r.data.some((b) => b.start === T(3, '14:00')));
  r = await call(prof.token, 'POST', `${EQ}/bookings/${gb.uuid}/approve`, { note: 'Traga luvas' }); is('staff aprova o convidado', r, 200);
  await sleep(200); const m2 = lastMailTo(gEmail); check('convidado recebe e-mail de confirmação com a nota', /confirmada/i.test(m2.subject) && m2.text.includes('Traga luvas'));
  r = await call(colega.token, 'GET', `${EQ}/bookings?from=${T(3, '00:00')}&to=${T(4, '00:00')}`);
  const seen = r.data.find((b) => b.start === T(3, '14:00')); check('membros veem o externo (nome e instituição), sem contato', seen && seen.external && seen.who.name === 'Marina Souza' && seen.who.institution === 'UFRGS — Química' && seen.guest === undefined);
  r = await call(null, 'POST', `${PUB}/bookings`, guest('15:00', '15:30', 3)); is('segundo pedido do mesmo e-mail', r, 201);
  r = await call(null, 'POST', `${PUB}/bookings`, guest('15:30', '16:00', 3)); check('terceiro pedido ativo do mesmo e-mail → 429', r.status === 429 && r.error.code === 'TOO_MANY_BOOKINGS');
  r = await call(null, 'POST', `/public/bookings/${manage}/cancel`); check('convidado cancela pelo link', r.status === 200 && r.data.status === 'cancelled');
  r = await call(null, 'POST', `/public/bookings/${manage}/cancel`); is('cancelar de novo é recusado', r, 409);
  r = await call(null, 'GET', `${PUB}/availability?from=${dayStr(3)}&to=${dayStr(3)}`); check('horário cancelado volta a ficar livre', r.data.slots.find((s) => s.start === T(3, '14:00')).state === 'free');

  console.log('\n# Token: girar, desligar e manutenção');
  r = await call(aluno.token, 'POST', `${EQ}/public-token`, {}); is('membro não gira o token', r, 403);
  r = await call(prof.token, 'POST', `${EQ}/public-token`, {}); is('staff gira o token', r, 200); const token2 = r.data.public_token;
  r = await call(null, 'GET', PUB); is('QR antigo deixa de funcionar', r, 404);
  r = await call(null, 'GET', `/public/equipment/${token2}`); is('token novo funciona', r, 200);
  r = await call(prof.token, 'PUT', EQ, { access: 'community' }); r = await call(null, 'GET', `/public/equipment/${token2}`); is('desligar o acesso público → 404', r, 404);
  r = await call(prof.token, 'PUT', EQ, { access: 'public' }); r = await call(null, 'GET', `/public/equipment/${token2}`); is('religar reativa o mesmo link impresso', r, 200);
  r = await call(prof.token, 'PUT', EQ, { status: 'maintenance' });
  r = await call(null, 'GET', `/public/equipment/${token2}/availability?from=${d2}&to=${d2}`); check('em manutenção: sem horários', r.data.slots.length === 0);
  r = await call(aluno.token, 'POST', `${EQ}/bookings`, body('10:00', '10:30', 6)); check('em manutenção: membro não reserva', r.status === 409 && r.error.code === 'EQUIPMENT_UNAVAILABLE');
  r = await call(prof.token, 'PUT', EQ, { status: 'archived' }); r = await call(aluno.token, 'GET', EQ); is('arquivado some para membros', r, 404);
  r = await call(null, 'GET', `/public/equipment/${token2}`); is('arquivado some da página pública', r, 404);
  r = await call(prof.token, 'PUT', EQ, { status: 'active' });

  console.log('\n# Limpeza');
  r = await call(prof.token, 'DELETE', EQ); is('exclui equipamento', r, 204);
  r = await call(prof.token, 'GET', EQ); is('equipamento removido', r, 404);
  r = await call(prof.token, 'DELETE', `/communities/${cid}`); is('exclui comunidade', r, 204);

  console.log(`\n${pass} ok, ${fail} falhas`);
  process.exit(fail ? 1 : 0);
};
main().catch((e) => { console.error(e); process.exit(1); });
