'use strict';

/**
 * Quizzes / exercícios de uma comunidade.
 *  Perguntas: tf (V/F) · choice (múltipla escolha, uma ou várias corretas) · text (descritiva)
 *             · dataset (aluno entrega uma variável do Workspace) · workflow (aluno entrega um workflow)
 *  O professor (moderator+) cria, publica (draft → open → closed) e corrige; os alunos (membros) respondem.
 *  tf/choice são corrigidas automaticamente; as demais, à mão (o professor abre o workflow/variável do aluno:
 *  a leitura é concedida em access.service.js enquanto a resposta estiver entregue).
 */

const { v4: uuidv4 } = require('uuid');
const db = require('../config/db.config');
const R = require('../utils/response');
const { LEVEL, workflowLevel, datasetLevel } = require('../services/access.service');

const RANK = { member: 1, moderator: 2, admin: 3, owner: 4 };
const isStaff = (req) => (RANK[req.cRole] || 0) >= RANK.moderator;
const KINDS = ['tf', 'choice', 'text', 'dataset', 'workflow'];
const AUTO = ['tf', 'choice'];
const STATUSES = ['draft', 'open', 'closed'];
const SHOW = ['after_submit', 'after_close', 'never'];
const MAX_QUESTIONS = 100;

const parseJson = (v, fb = null) => {
  if (v == null) return fb;
  if (typeof v === 'string') { try { return JSON.parse(v); } catch { return fb; } }
  return v;
};
const num = (v) => (v == null ? null : Number(v));

// quiz_answers.value guarda { v: <valor> }: o driver já devolve JSON parseado (e uma resposta de texto pura
// seria ambígua), então o envelope evita confundir "string" com "JSON em string".
const wrapAnswer = (v) => JSON.stringify({ v: v === undefined ? null : v });
const unwrapAnswer = (raw) => {
  const o = parseJson(raw, null);
  return o && typeof o === 'object' && !Array.isArray(o) && 'v' in o ? o.v : null;
};

const POLICIES = ['highest', 'latest', 'first'];
const MAX_ATTEMPTS_LIMIT = 50;

/** Valida `max_attempts` (0 = ilimitadas). */
function cleanAttempts(v) {
  if (v === undefined) return { value: undefined };
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0 || n > MAX_ATTEMPTS_LIMIT) return { error: `Use um número de 0 (ilimitadas) a ${MAX_ATTEMPTS_LIMIT}.` };
  return { value: n };
}

/** Nota considerada entre as tentativas já corrigidas, conforme a política do quiz. */
function officialOf(quiz, subs) {
  const graded = subs.filter((x) => x.status === 'graded' && x.score != null).sort((a, b) => a.attempt - b.attempt);
  if (!graded.length) return null;
  if (quiz.grade_policy === 'first') return graded[0];
  if (quiz.grade_policy === 'latest') return graded[graded.length - 1];
  return graded.reduce((best, x) => (Number(x.score) > Number(best.score) ? x : best), graded[0]);
}

const attemptsLeft = (quiz, used) => (quiz.max_attempts === 0 ? Infinity : Math.max(0, quiz.max_attempts - used));

async function quizRow(req) {
  const [rows] = await db.query('SELECT * FROM quizzes WHERE uuid = ? AND community_id = ?', [req.params.qid, req.community.id]);
  return rows[0] || null;
}

async function sectionId(communityId, uuid) {
  if (!uuid) return { id: null };
  const [rows] = await db.query('SELECT id FROM community_sections WHERE uuid = ? AND community_id = ?', [String(uuid), communityId]);
  return rows.length ? { id: rows[0].id } : { error: true };
}

/** Aberto para respostas? (status open e prazo não vencido) */
const acceptsAnswers = (quiz) => quiz.status === 'open' && (!quiz.due_at || new Date(quiz.due_at) > new Date());

/** O aluno já pode ver o gabarito? */
function revealsAnswers(quiz, sub) {
  if (quiz.show_results === 'never') return false;
  if (quiz.show_results === 'after_close') return quiz.status === 'closed' || (quiz.due_at && new Date(quiz.due_at) <= new Date());
  return !!sub && sub.status !== 'in_progress';
}

// ─── validação das perguntas ────────────────────────────────────────────────
function cleanQuestion(q, i) {
  const err = (message) => ({ error: { field: `questions[${i}]`, message } });
  if (!q || !KINDS.includes(q.kind)) return err('Tipo de pergunta inválido.');
  const prompt = String(q.prompt || '').trim();
  if (!prompt) return err('Escreva o enunciado.');
  const points = q.points === undefined || q.points === '' ? 1 : Number(q.points);
  if (!Number.isFinite(points) || points < 0 || points > 1000) return err('Pontuação inválida.');
  const cfg = q.config && typeof q.config === 'object' ? q.config : {};
  let config = {};
  if (q.kind === 'tf') {
    if (typeof cfg.answer !== 'boolean') return err('Marque se a afirmação é verdadeira ou falsa.');
    config = { answer: cfg.answer };
  } else if (q.kind === 'choice') {
    const opts = Array.isArray(cfg.options) ? cfg.options : [];
    const options = opts.map((o, k) => ({
      id: String((o && o.id) || String.fromCharCode(97 + k)).slice(0, 20),
      text: String((o && o.text) || '').trim().slice(0, 1000),
      correct: !!(o && o.correct),
    })).filter((o) => o.text);
    if (options.length < 2) return err('Informe ao menos duas alternativas.');
    if (options.length > 10) return err('No máximo 10 alternativas.');
    if (new Set(options.map((o) => o.id)).size !== options.length) return err('Alternativas duplicadas.');
    const correct = options.filter((o) => o.correct).length;
    if (!correct) return err('Marque ao menos uma alternativa correta.');
    const multiple = !!cfg.multiple;
    if (!multiple && correct !== 1) return err('Resposta única: marque exatamente uma alternativa correta.');
    config = { multiple, options };
  } else if (q.kind === 'text') {
    config = cfg.model_answer ? { model_answer: String(cfg.model_answer).slice(0, 5000) } : {};
  } else if (cfg.hint) {
    config = { hint: String(cfg.hint).slice(0, 2000) };
  }
  const attachments = Array.isArray(q.attachments) ? q.attachments : [];
  if (attachments.length > 10) return err('No máximo 10 anexos por pergunta.');
  return { value: { uuid: q.uuid ? String(q.uuid) : null, kind: q.kind, prompt: prompt.slice(0, 10000), points, config, attachments } };
}

/** Anexos (dados X, workflow-modelo): quem anexa precisa poder ler o recurso. */
async function resolveAttachments(list, user) {
  const out = [];
  for (const a of list) {
    if (!a || !['dataset', 'workflow'].includes(a.kind) || !a.ref) return { error: 'Anexo inválido.' };
    if (a.kind === 'dataset') {
      const [r] = await db.query('SELECT * FROM datasets WHERE uuid = ? AND deleted_at IS NULL', [String(a.ref)]);
      if (!r.length || (await datasetLevel(r[0], user)) < LEVEL.READ) return { error: 'Variável anexada não encontrada.' };
      out.push({ kind: 'dataset', id: r[0].id });
    } else {
      const [r] = await db.query('SELECT * FROM workflows WHERE uuid = ? AND deleted_at IS NULL', [String(a.ref)]);
      if (!r.length || (await workflowLevel(r[0], user)) < LEVEL.READ) return { error: 'Workflow anexado não encontrado.' };
      out.push({ kind: 'workflow', id: r[0].id });
    }
  }
  return { value: out };
}

// ─── montagem de respostas da API ───────────────────────────────────────────
async function loadQuestions(quizId) {
  const [qs] = await db.query('SELECT * FROM quiz_questions WHERE quiz_id = ? ORDER BY position, id', [quizId]);
  if (!qs.length) return [];
  const [atts] = await db.query(
    `SELECT at.question_id, at.kind, w.uuid AS wf_uuid, w.name AS wf_name, d.uuid AS ds_uuid, d.name AS ds_name, d.dimensions AS ds_dims
       FROM quiz_attachments at
       LEFT JOIN workflows w ON at.kind = 'workflow' AND w.id = at.ref_id AND w.deleted_at IS NULL
       LEFT JOIN datasets d ON at.kind = 'dataset' AND d.id = at.ref_id AND d.deleted_at IS NULL
      WHERE at.question_id IN (?) ORDER BY at.id`, [qs.map((q) => q.id)],
  );
  return qs.map((q) => ({
    id: q.id, uuid: q.uuid, position: q.position, kind: q.kind, prompt: q.prompt, points: num(q.points),
    config: parseJson(q.config, {}) || {},
    attachments: atts.filter((a) => a.question_id === q.id).map((a) => (a.kind === 'workflow'
      ? { kind: 'workflow', uuid: a.wf_uuid, name: a.wf_name, available: !!a.wf_uuid }
      : { kind: 'dataset', uuid: a.ds_uuid, name: a.ds_name, dimensions: parseJson(a.ds_dims), available: !!a.ds_uuid })),
  }));
}

/** Remove o gabarito da pergunta para quem não pode vê-lo. */
function stripKey(q) {
  const { id, ...rest } = q;
  const config = { ...rest.config };
  delete config.model_answer;
  if (rest.kind === 'tf') delete config.answer;
  if (rest.kind === 'choice') config.options = config.options.map(({ correct, ...o }) => o);
  return { ...rest, config };
}
const publicQuestion = (q, reveal) => (reveal ? (({ id, ...r }) => r)(q) : stripKey(q));

async function loadAnswers(subId) {
  const [rows] = await db.query(
    `SELECT a.question_id, a.value, a.ref_type, a.ref_id, a.points, a.feedback,
            w.uuid AS wf_uuid, w.name AS wf_name, d.uuid AS ds_uuid, d.name AS ds_name, d.dimensions AS ds_dims
       FROM quiz_answers a
       LEFT JOIN workflows w ON a.ref_type = 'workflow' AND w.id = a.ref_id AND w.deleted_at IS NULL
       LEFT JOIN datasets d ON a.ref_type = 'dataset' AND d.id = a.ref_id AND d.deleted_at IS NULL
      WHERE a.submission_id = ?`, [subId],
  );
  return rows.map((a) => ({
    question_id: a.question_id, value: unwrapAnswer(a.value), points: num(a.points), feedback: a.feedback,
    ref: a.ref_type === 'workflow'
      ? { kind: 'workflow', uuid: a.wf_uuid || null, name: a.wf_name || null, available: !!a.wf_uuid }
      : a.ref_type === 'dataset'
        ? { kind: 'dataset', uuid: a.ds_uuid || null, name: a.ds_name || null, dimensions: parseJson(a.ds_dims), available: !!a.ds_uuid }
        : null,
  }));
}

const subShape = (s) => ({
  uuid: s.uuid, attempt: s.attempt, status: s.status, score: num(s.score), feedback: s.feedback, submitted_at: s.submitted_at, graded_at: s.graded_at,
});

function quizShape(q, extra = {}) {
  return {
    uuid: q.uuid, title: q.title, description: q.description, status: q.status, due_at: q.due_at, show_results: q.show_results,
    max_attempts: q.max_attempts, grade_policy: q.grade_policy,
    created_at: q.created_at, accepting: acceptsAnswers(q), ...extra,
  };
}

// ─── CRUD (professor) ───────────────────────────────────────────────────────
// GET /communities/:id/quizzes
async function listQuizzes(req, res) {
  try {
    const staff = isStaff(req);
    const [rows] = await db.query(
      `SELECT q.*, s.uuid AS section_uuid,
              (SELECT COUNT(*) FROM quiz_questions WHERE quiz_id = q.id) AS question_count,
              (SELECT COALESCE(SUM(points),0) FROM quiz_questions WHERE quiz_id = q.id) AS total_points,
              (SELECT COUNT(DISTINCT user_id) FROM quiz_submissions WHERE quiz_id = q.id AND status <> 'in_progress') AS submission_count
         FROM quizzes q LEFT JOIN community_sections s ON s.id = q.section_id
        WHERE q.community_id = ? ${staff ? '' : "AND q.status <> 'draft'"}
        ORDER BY q.position, q.id`, [req.community.id],
    );
    const mine = await mySubmissionsByQuiz(rows.map((r) => r.id), req.user.id);
    return R.ok(res, rows.map((q) => {
      const my = mine.get(q.id) || [];
      const latest = my[my.length - 1];
      const off = officialOf(q, my);
      return quizShape(q, {
        section: q.section_uuid, question_count: q.question_count, total_points: num(q.total_points),
        submission_count: staff ? q.submission_count : undefined,
        my_status: latest ? latest.status : null, my_score: off ? num(off.score) : null, my_attempts: my.length,
      });
    }));
  } catch (err) { return R.serverError(res, err); }
}

/** Entregas do usuário agrupadas por quiz (em ordem de tentativa). */
async function mySubmissionsByQuiz(quizIds, userId) {
  const map = new Map();
  if (!quizIds.length) return map;
  const [subs] = await db.query(
    'SELECT quiz_id, attempt, status, score FROM quiz_submissions WHERE user_id = ? AND quiz_id IN (?) ORDER BY attempt', [userId, quizIds],
  );
  subs.forEach((x) => { if (!map.has(x.quiz_id)) map.set(x.quiz_id, []); map.get(x.quiz_id).push(x); });
  return map;
}

// POST /communities/:id/quizzes
async function createQuiz(req, res) {
  try {
    const b = req.body || {};
    const title = String(b.title || '').trim();
    if (!title) return R.unprocessable(res, [{ field: 'title', message: 'Obrigatório.' }]);
    if (title.length > 255) return R.unprocessable(res, [{ field: 'title', message: 'Máximo 255 caracteres.' }]);
    const sec = await sectionId(req.community.id, b.section);
    if (sec.error) return R.notFound(res, 'Tópico');
    const show = SHOW.includes(b.show_results) ? b.show_results : 'after_submit';
    const att = cleanAttempts(b.max_attempts);
    if (att.error) return R.unprocessable(res, [{ field: 'max_attempts', message: att.error }]);
    if (b.grade_policy !== undefined && !POLICIES.includes(b.grade_policy)) return R.unprocessable(res, [{ field: 'grade_policy', message: 'Inválido.' }]);
    let due = null;
    if (b.due_at) { due = new Date(b.due_at); if (Number.isNaN(due.getTime())) return R.unprocessable(res, [{ field: 'due_at', message: 'Data inválida.' }]); }
    const [[{ next }]] = await db.query('SELECT COALESCE(MAX(position), -1) + 1 AS next FROM quizzes WHERE community_id = ? AND section_id <=> ?', [req.community.id, sec.id]);
    const uuid = uuidv4();
    await db.query(
      `INSERT INTO quizzes (uuid, community_id, section_id, title, description, status, due_at, show_results, max_attempts, grade_policy, position, created_by)
       VALUES (?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?)`,
      [uuid, req.community.id, sec.id, title, b.description ? String(b.description).slice(0, 10000) : null, due, show,
        att.value === undefined ? 1 : att.value, b.grade_policy || 'highest', next, req.user.id],
    );
    return R.created(res, { uuid, title, status: 'draft', max_attempts: att.value === undefined ? 1 : att.value, grade_policy: b.grade_policy || 'highest' });
  } catch (err) { return R.serverError(res, err); }
}

// PUT /communities/:id/quizzes/:qid   { title, description, status, due_at, show_results, section }
async function updateQuiz(req, res) {
  try {
    const q = await quizRow(req);
    if (!q) return R.notFound(res, 'Quiz');
    const b = req.body || {};
    if (b.title !== undefined && !String(b.title).trim()) return R.unprocessable(res, [{ field: 'title', message: 'Obrigatório.' }]);
    if (b.status !== undefined && !STATUSES.includes(b.status)) return R.unprocessable(res, [{ field: 'status', message: 'Inválido.' }]);
    if (b.show_results !== undefined && !SHOW.includes(b.show_results)) return R.unprocessable(res, [{ field: 'show_results', message: 'Inválido.' }]);
    const att = cleanAttempts(b.max_attempts);
    if (att.error) return R.unprocessable(res, [{ field: 'max_attempts', message: att.error }]);
    if (b.grade_policy !== undefined && !POLICIES.includes(b.grade_policy)) return R.unprocessable(res, [{ field: 'grade_policy', message: 'Inválido.' }]);
    let secId = q.section_id;
    if (b.section !== undefined) {
      const sec = await sectionId(req.community.id, b.section);
      if (sec.error) return R.notFound(res, 'Tópico');
      secId = sec.id;
    }
    let due = q.due_at;
    if (b.due_at !== undefined) {
      if (!b.due_at) due = null;
      else { due = new Date(b.due_at); if (Number.isNaN(due.getTime())) return R.unprocessable(res, [{ field: 'due_at', message: 'Data inválida.' }]); }
    }
    const status = b.status !== undefined ? b.status : q.status;
    if (status !== 'draft' && q.status === 'draft') {
      const [[{ n }]] = await db.query('SELECT COUNT(*) AS n FROM quiz_questions WHERE quiz_id = ?', [q.id]);
      if (!n) return R.unprocessable(res, [{ field: 'status', message: 'Adicione ao menos uma pergunta antes de publicar.' }]);
    }
    await db.query(
      'UPDATE quizzes SET title = ?, description = ?, status = ?, due_at = ?, show_results = ?, max_attempts = ?, grade_policy = ?, section_id = ? WHERE id = ?',
      [
        b.title !== undefined ? String(b.title).trim().slice(0, 255) : q.title,
        b.description !== undefined ? (b.description ? String(b.description).slice(0, 10000) : null) : q.description,
        status, due, b.show_results !== undefined ? b.show_results : q.show_results,
        att.value === undefined ? q.max_attempts : att.value, b.grade_policy !== undefined ? b.grade_policy : q.grade_policy, secId, q.id,
      ],
    );
    return R.ok(res, { message: 'Quiz atualizado.' });
  } catch (err) { return R.serverError(res, err); }
}

// DELETE /communities/:id/quizzes/:qid
async function deleteQuiz(req, res) {
  try {
    const q = await quizRow(req);
    if (!q) return R.notFound(res, 'Quiz');
    await db.query('DELETE FROM quizzes WHERE id = ?', [q.id]);
    return R.noContent(res);
  } catch (err) { return R.serverError(res, err); }
}

// PUT /communities/:id/quizzes/:qid/questions   { questions: [...] }  — substitui a lista (só sem respostas)
async function saveQuestions(req, res) {
  try {
    const q = await quizRow(req);
    if (!q) return R.notFound(res, 'Quiz');
    const list = req.body && req.body.questions;
    if (!Array.isArray(list)) return R.unprocessable(res, [{ field: 'questions', message: 'Informe a lista de perguntas.' }]);
    if (list.length > MAX_QUESTIONS) return R.unprocessable(res, [{ field: 'questions', message: `No máximo ${MAX_QUESTIONS} perguntas.` }]);
    const [[{ n }]] = await db.query("SELECT COUNT(DISTINCT id) AS n FROM quiz_submissions WHERE quiz_id = ? AND status <> 'in_progress'", [q.id]);
    if (n && !(req.body && req.body.confirm === true)) {
      return R.error(res, 409, 'HAS_SUBMISSIONS', 'Este quiz já tem entregas. Ao alterar as perguntas, as notas automáticas serão recalculadas e respostas incompatíveis serão descartadas.', { submissions: n });
    }

    const cleaned = [];
    for (let i = 0; i < list.length; i += 1) {
      const c = cleanQuestion(list[i], i);
      if (c.error) return R.unprocessable(res, [c.error]);
      const at = await resolveAttachments(c.value.attachments, req.user);
      if (at.error) return R.unprocessable(res, [{ field: `questions[${i}]`, message: at.error }]);
      cleaned.push({ ...c.value, attachments: at.value });
    }

    const [existing] = await db.query('SELECT id, uuid FROM quiz_questions WHERE quiz_id = ?', [q.id]);
    const byUuid = new Map(existing.map((e) => [e.uuid, e.id]));
    const keep = new Set();
    for (let i = 0; i < cleaned.length; i += 1) {
      const c = cleaned[i];
      let qid = c.uuid && byUuid.get(c.uuid);
      if (qid) {
        await db.query('UPDATE quiz_questions SET position = ?, kind = ?, prompt = ?, points = ?, config = ? WHERE id = ?',
          [i, c.kind, c.prompt, c.points, JSON.stringify(c.config), qid]);
        await db.query('DELETE FROM quiz_attachments WHERE question_id = ?', [qid]);
      } else {
        const [ins] = await db.query('INSERT INTO quiz_questions (uuid, quiz_id, position, kind, prompt, points, config) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [uuidv4(), q.id, i, c.kind, c.prompt, c.points, JSON.stringify(c.config)]);
        qid = ins.insertId;
      }
      keep.add(qid);
      for (const a of c.attachments) {
        await db.query('INSERT IGNORE INTO quiz_attachments (question_id, kind, ref_id) VALUES (?, ?, ?)', [qid, a.kind, a.id]);
      }
    }
    const drop = existing.filter((e) => !keep.has(e.id)).map((e) => e.id);
    if (drop.length) await db.query('DELETE FROM quiz_questions WHERE id IN (?)', [drop]);
    // descarta respostas que não servem mais (tipo/alternativas mudaram) e recalcula as entregas já feitas
    await regradeQuiz(q.id);
    return R.ok(res, { message: 'Perguntas salvas.', count: cleaned.length, regraded: n });
  } catch (err) { return R.serverError(res, err); }
}

// ─── leitura de um quiz (professor e aluno) ─────────────────────────────────
// GET /communities/:id/quizzes/:qid
async function getQuiz(req, res) {
  try {
    const q = await quizRow(req);
    if (!q) return R.notFound(res, 'Quiz');
    const staff = isStaff(req);
    if (!staff && q.status === 'draft') return R.notFound(res, 'Quiz');
    if (!staff && q.section_id) {
      const [[sec]] = await db.query('SELECT * FROM community_sections WHERE id = ?', [q.section_id]);
      const ok = async (s) => {
        let c = s; let n = 0;
        while (c && n < 10) { if (!c.is_visible) return false; if (!c.parent_id) return true; [[c]] = await db.query('SELECT * FROM community_sections WHERE id = ?', [c.parent_id]); n += 1; }
        return !!c;
      };
      if (!(await ok(sec))) return R.notFound(res, 'Quiz');
    }
    const questions = await loadQuestions(q.id);
    const [subs] = await db.query('SELECT * FROM quiz_submissions WHERE quiz_id = ? AND user_id = ? ORDER BY attempt', [q.id, req.user.id]);
    const sub = subs[subs.length - 1] || null; // tentativa atual
    const reveal = staff || revealsAnswers(q, sub);
    const out = quizShape(q, {
      questions: questions.map((x) => publicQuestion(x, reveal)),
      total_points: questions.reduce((s, x) => s + x.points, 0),
      revealed: reveal,
    });
    if (staff) {
      const [[{ n }]] = await db.query("SELECT COUNT(DISTINCT user_id) AS n FROM quiz_submissions WHERE quiz_id = ? AND status <> 'in_progress'", [q.id]);
      out.has_submissions = n > 0;
      out.submitters = n;
      if (q.section_id) { const [[sec]] = await db.query('SELECT uuid FROM community_sections WHERE id = ?', [q.section_id]); out.section = sec ? sec.uuid : null; } else out.section = null;
    }
    const left = attemptsLeft(q, subs.length);
    out.attempts = subs.map((x) => ({ uuid: x.uuid, attempt: x.attempt, status: x.status, score: x.status === 'graded' ? num(x.score) : null, submitted_at: x.submitted_at }));
    out.attempts_used = subs.length;
    out.attempts_left = left === Infinity ? null : left; // null = ilimitadas
    out.can_retry = !!sub && sub.status !== 'in_progress' && acceptsAnswers(q) && left > 0;
    const off = officialOf(q, subs);
    out.official_score = off ? num(off.score) : null;
    out.official_attempt = off ? off.attempt : null;
    if (sub) {
      const answers = await loadAnswers(sub.id);
      out.my_submission = {
        ...subShape(sub),
        // pontos por pergunta só aparecem quando o gabarito é liberado ou a correção terminou
        answers: answers.map((a) => ({
          question: (questions.find((x) => x.id === a.question_id) || {}).uuid,
          value: a.value, ref: a.ref,
          points: reveal || sub.status === 'graded' ? a.points : null,
          feedback: sub.status === 'graded' || reveal ? a.feedback : null,
        })),
      };
      if (!reveal && sub.status !== 'graded') out.my_submission.score = null;
    }
    return R.ok(res, out);
  } catch (err) { return R.serverError(res, err); }
}

// ─── aluno ──────────────────────────────────────────────────────────────────
async function latestSubmission(quizId, userId) {
  const [rows] = await db.query('SELECT * FROM quiz_submissions WHERE quiz_id = ? AND user_id = ? ORDER BY attempt DESC LIMIT 1', [quizId, userId]);
  return rows[0] || null;
}

async function createSubmission(quiz, user, attempt) {
  const uuid = uuidv4();
  await db.query('INSERT INTO quiz_submissions (uuid, quiz_id, user_id, attempt) VALUES (?, ?, ?, ?)', [uuid, quiz.id, user.id, attempt]);
  const [r] = await db.query('SELECT * FROM quiz_submissions WHERE uuid = ?', [uuid]);
  return r[0];
}

// POST /communities/:id/quizzes/:qid/start   { new_attempt?: true }
// Começa (ou continua) a tentativa atual; `new_attempt` abre outra, se o professor permitir e ainda houver tentativas.
async function startQuiz(req, res) {
  try {
    const q = await quizRow(req);
    if (!q || q.status === 'draft') return R.notFound(res, 'Quiz');
    const latest = await latestSubmission(q.id, req.user.id);
    if (!latest) {
      if (!acceptsAnswers(q)) return R.error(res, 409, 'QUIZ_CLOSED', 'Este quiz não está recebendo respostas.');
      return R.ok(res, subShape(await createSubmission(q, req.user, 1)));
    }
    if (latest.status === 'in_progress' || !(req.body && req.body.new_attempt)) return R.ok(res, subShape(latest));
    if (!acceptsAnswers(q)) return R.error(res, 409, 'QUIZ_CLOSED', 'Este quiz não está recebendo respostas.');
    const [[{ used }]] = await db.query('SELECT COUNT(*) AS used FROM quiz_submissions WHERE quiz_id = ? AND user_id = ?', [q.id, req.user.id]);
    if (attemptsLeft(q, used) <= 0) return R.error(res, 409, 'NO_ATTEMPTS_LEFT', 'Você já usou todas as tentativas deste quiz.');
    return R.ok(res, subShape(await createSubmission(q, req.user, latest.attempt + 1)));
  } catch (err) { return R.serverError(res, err); }
}

/** Valida o valor da resposta conforme o tipo. Retorna { value, refType, refId } ou { error }. */
async function cleanAnswer(question, body, user) {
  const cfg = question.config || {};
  if (question.kind === 'tf') {
    if (typeof body.value !== 'boolean') return { error: 'Responda Verdadeiro ou Falso.' };
    return { value: body.value };
  }
  if (question.kind === 'choice') {
    const ids = Array.isArray(body.value) ? body.value.map(String) : (body.value != null ? [String(body.value)] : []);
    const valid = new Set(cfg.options.map((o) => o.id));
    if (ids.some((x) => !valid.has(x))) return { error: 'Alternativa inválida.' };
    if (!cfg.multiple && ids.length > 1) return { error: 'Escolha apenas uma alternativa.' };
    return { value: [...new Set(ids)] };
  }
  if (question.kind === 'text') {
    const t = String(body.value == null ? '' : body.value);
    if (t.length > 20000) return { error: 'Resposta muito longa.' };
    return { value: t };
  }
  // dataset / workflow: o aluno só pode entregar o que é dele
  if (!body.ref) return { value: null, refType: null, refId: null };
  if (question.kind === 'workflow') {
    const [r] = await db.query('SELECT id, user_id FROM workflows WHERE uuid = ? AND deleted_at IS NULL', [String(body.ref)]);
    if (!r.length || r[0].user_id !== user.id) return { error: 'Escolha um workflow seu.' };
    return { value: null, refType: 'workflow', refId: r[0].id };
  }
  const [r] = await db.query('SELECT id, user_id FROM datasets WHERE uuid = ? AND deleted_at IS NULL', [String(body.ref)]);
  if (!r.length || r[0].user_id !== user.id) return { error: 'Escolha uma variável sua.' };
  return { value: null, refType: 'dataset', refId: r[0].id };
}

// PUT /communities/:id/quizzes/:qid/answers/:question   { value } | { ref }
async function saveAnswer(req, res) {
  try {
    const q = await quizRow(req);
    if (!q || q.status === 'draft') return R.notFound(res, 'Quiz');
    const [qq] = await db.query('SELECT * FROM quiz_questions WHERE uuid = ? AND quiz_id = ?', [req.params.question, q.id]);
    if (!qq.length) return R.notFound(res, 'Pergunta');
    const sub = await ensureSubmissionFor(q, req);
    if (!sub) return R.error(res, 409, 'QUIZ_CLOSED', 'Este quiz não está recebendo respostas.');
    if (sub.status !== 'in_progress') return R.error(res, 409, 'ALREADY_SUBMITTED', 'Você já entregou esta tentativa.');
    if (!acceptsAnswers(q)) return R.error(res, 409, 'QUIZ_CLOSED', 'Este quiz não está recebendo respostas.');
    const question = { ...qq[0], config: parseJson(qq[0].config, {}) || {} };
    const a = await cleanAnswer(question, req.body || {}, req.user);
    if (a.error) return R.unprocessable(res, [{ field: 'value', message: a.error }]);
    await db.query(
      `INSERT INTO quiz_answers (submission_id, question_id, value, ref_type, ref_id) VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE value = VALUES(value), ref_type = VALUES(ref_type), ref_id = VALUES(ref_id), points = NULL, feedback = NULL`,
      [sub.id, question.id, a.refType ? null : wrapAnswer(a.value), a.refType || null, a.refId || null],
    );
    return R.ok(res, { message: 'Resposta salva.' });
  } catch (err) { return R.serverError(res, err); }
}

async function ensureSubmissionFor(quiz, req) {
  const latest = await latestSubmission(quiz.id, req.user.id);
  if (latest) return latest;
  if (!acceptsAnswers(quiz)) return null;
  return createSubmission(quiz, req.user, 1);
}

function autoPoints(question, value) {
  const cfg = question.config || {};
  if (question.kind === 'tf') return value === cfg.answer ? num(question.points) : 0;
  if (question.kind === 'choice') {
    const got = new Set(Array.isArray(value) ? value : []);
    const want = new Set(cfg.options.filter((o) => o.correct).map((o) => o.id));
    const same = got.size === want.size && [...want].every((x) => got.has(x));
    return same ? num(question.points) : 0;
  }
  return null;
}

// POST /communities/:id/quizzes/:qid/submit
async function submitQuiz(req, res) {
  try {
    const q = await quizRow(req);
    if (!q || q.status === 'draft') return R.notFound(res, 'Quiz');
    const sub = await ensureSubmissionFor(q, req);
    if (!sub) return R.error(res, 409, 'QUIZ_CLOSED', 'Este quiz não está recebendo respostas.');
    if (sub.status !== 'in_progress') return R.error(res, 409, 'ALREADY_SUBMITTED', 'Você já entregou esta tentativa.');
    if (!acceptsAnswers(q)) return R.error(res, 409, 'QUIZ_CLOSED', 'Este quiz não está recebendo respostas.');
    const questions = await loadQuestions(q.id);
    const [answers] = await db.query('SELECT * FROM quiz_answers WHERE submission_id = ?', [sub.id]);
    let auto = 0; let manual = 0;
    for (const question of questions) {
      const ans = answers.find((x) => x.question_id === question.id);
      if (AUTO.includes(question.kind)) {
        const pts = ans ? autoPoints(question, unwrapAnswer(ans.value)) : 0;
        auto += pts;
        if (ans) await db.query('UPDATE quiz_answers SET points = ? WHERE id = ?', [pts, ans.id]);
        else await db.query('INSERT INTO quiz_answers (submission_id, question_id, value, points) VALUES (?, ?, NULL, 0)', [sub.id, question.id, ]);
      } else manual += 1;
    }
    const status = manual ? 'submitted' : 'graded';
    await db.query(
      'UPDATE quiz_submissions SET status = ?, score = ?, submitted_at = NOW(), graded_at = ? WHERE id = ?',
      [status, auto, status === 'graded' ? new Date() : null, sub.id],
    );
    return R.ok(res, { status, score: manual ? null : auto, pending_manual: manual });
  } catch (err) { return R.serverError(res, err); }
}

// ─── professor: entregas e correção ─────────────────────────────────────────
// GET /communities/:id/quizzes/:qid/submissions
async function listSubmissions(req, res) {
  try {
    const q = await quizRow(req);
    if (!q) return R.notFound(res, 'Quiz');
    const [rows] = await db.query(
      `SELECT s.uuid, s.user_id, s.attempt, s.status, s.score, s.submitted_at, s.graded_at, u.uuid AS user_uuid, u.name AS user_name, u.email AS user_email
         FROM quiz_submissions s JOIN users u ON u.id = s.user_id
        WHERE s.quiz_id = ? ORDER BY u.name, s.user_id, s.attempt DESC`, [q.id],
    );
    const [[{ total }]] = await db.query('SELECT COALESCE(SUM(points),0) AS total FROM quiz_questions WHERE quiz_id = ?', [q.id]);
    const [[{ members }]] = await db.query("SELECT COUNT(*) AS members FROM community_members WHERE community_id = ? AND role = 'member'", [req.community.id]);
    const byUser = new Map();
    rows.forEach((r) => { if (!byUser.has(r.user_id)) byUser.set(r.user_id, []); byUser.get(r.user_id).push(r); });
    const counted = new Set();
    byUser.forEach((list) => { const off = officialOf(q, list); if (off) counted.add(off.uuid); });
    const students = new Set(rows.filter((r) => r.status !== 'in_progress').map((r) => r.user_id)).size;
    return R.ok(res, {
      total_points: num(total), member_count: members, student_count: students, max_attempts: q.max_attempts, grade_policy: q.grade_policy,
      submissions: rows.map((r) => ({
        uuid: r.uuid, attempt: r.attempt, status: r.status, score: num(r.score), submitted_at: r.submitted_at, graded_at: r.graded_at,
        counted: counted.has(r.uuid), user: { uuid: r.user_uuid, name: r.user_name, email: r.user_email },
      })),
    });
  } catch (err) { return R.serverError(res, err); }
}

// GET /communities/:id/quizzes/:qid/submissions/:sid  (professor, ou o próprio aluno via getQuiz)
async function getSubmission(req, res) {
  try {
    const q = await quizRow(req);
    if (!q) return R.notFound(res, 'Quiz');
    const [rows] = await db.query(
      `SELECT s.*, u.uuid AS user_uuid, u.name AS user_name FROM quiz_submissions s JOIN users u ON u.id = s.user_id
        WHERE s.uuid = ? AND s.quiz_id = ?`, [req.params.sid, q.id],
    );
    if (!rows.length) return R.notFound(res, 'Entrega');
    const s = rows[0];
    const questions = await loadQuestions(q.id);
    const answers = await loadAnswers(s.id);
    return R.ok(res, {
      quiz: { uuid: q.uuid, title: q.title }, ...subShape(s), user: { uuid: s.user_uuid, name: s.user_name },
      questions: questions.map(({ id, ...x }) => ({
        ...x,
        answer: (() => {
          const a = answers.find((y) => y.question_id === id);
          return a ? { value: a.value, ref: a.ref, points: a.points, feedback: a.feedback } : null;
        })(),
      })),
    });
  } catch (err) { return R.serverError(res, err); }
}

// PUT /communities/:id/quizzes/:qid/submissions/:sid/grade   { answers: [{question, points, feedback}], feedback }
async function gradeSubmission(req, res) {
  try {
    const q = await quizRow(req);
    if (!q) return R.notFound(res, 'Quiz');
    const [rows] = await db.query('SELECT * FROM quiz_submissions WHERE uuid = ? AND quiz_id = ?', [req.params.sid, q.id]);
    if (!rows.length) return R.notFound(res, 'Entrega');
    const s = rows[0];
    if (s.status === 'in_progress') return R.error(res, 409, 'NOT_SUBMITTED', 'O aluno ainda não entregou.');
    const questions = await loadQuestions(q.id);
    const list = Array.isArray(req.body && req.body.answers) ? req.body.answers : [];
    for (const item of list) {
      const question = questions.find((x) => x.uuid === item.question);
      if (!question) return R.notFound(res, 'Pergunta');
      const pts = item.points === null || item.points === undefined || item.points === '' ? null : Number(item.points);
      if (pts !== null && (!Number.isFinite(pts) || pts < 0 || pts > question.points)) {
        return R.unprocessable(res, [{ field: 'points', message: `A nota deve ficar entre 0 e ${question.points}.` }]);
      }
      await db.query(
        `INSERT INTO quiz_answers (submission_id, question_id, points, feedback) VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE points = VALUES(points), feedback = VALUES(feedback)`,
        [s.id, question.id, pts, item.feedback ? String(item.feedback).slice(0, 5000) : null],
      );
    }
    const [[{ score }]] = await db.query('SELECT COALESCE(SUM(points),0) AS score FROM quiz_answers WHERE submission_id = ?', [s.id]);
    // "graded" só quando todas as perguntas manuais têm nota
    const [ans] = await db.query('SELECT question_id, points FROM quiz_answers WHERE submission_id = ?', [s.id]);
    const pending = questions.filter((x) => !AUTO.includes(x.kind) && !ans.some((a) => a.question_id === x.id && a.points !== null)).length;
    const status = pending ? 'submitted' : 'graded';
    await db.query(
      'UPDATE quiz_submissions SET score = ?, status = ?, feedback = ?, graded_by = ?, graded_at = ? WHERE id = ?',
      [score, status, req.body && req.body.feedback ? String(req.body.feedback).slice(0, 5000) : s.feedback, req.user.id, status === 'graded' ? new Date() : null, s.id],
    );
    return R.ok(res, { status, score: num(score), pending });
  } catch (err) { return R.serverError(res, err); }
}

// POST /communities/:id/quizzes/:qid/submissions/:sid/reopen — devolve ao aluno para refazer
async function reopenSubmission(req, res) {
  try {
    const q = await quizRow(req);
    if (!q) return R.notFound(res, 'Quiz');
    const [rows] = await db.query('SELECT id FROM quiz_submissions WHERE uuid = ? AND quiz_id = ?', [req.params.sid, q.id]);
    if (!rows.length) return R.notFound(res, 'Entrega');
    await db.query("UPDATE quiz_submissions SET status = 'in_progress', score = NULL, submitted_at = NULL, graded_at = NULL WHERE id = ?", [rows[0].id]);
    await db.query('UPDATE quiz_answers SET points = NULL, feedback = NULL WHERE submission_id = ?', [rows[0].id]);
    return R.ok(res, { message: 'Entrega devolvida ao aluno.' });
  } catch (err) { return R.serverError(res, err); }
}

// ─── recorreção ao editar perguntas de um quiz que já tem entregas ──────────
/** A resposta continua válida para a pergunta (que pode ter mudado de tipo/alternativas)? */
function sanitizeAnswer(question, row) {
  const v = unwrapAnswer(row.value);
  if (question.kind === 'tf') return typeof v === 'boolean' ? { value: v } : null;
  if (question.kind === 'choice') {
    if (!Array.isArray(v)) return null;
    const valid = new Set((question.config.options || []).map((o) => o.id));
    let ids = v.filter((x) => valid.has(x));
    if (!question.config.multiple) ids = ids.slice(0, 1);
    return ids.length ? { value: ids } : null;
  }
  if (question.kind === 'text') return typeof v === 'string' ? { value: v } : null;
  return row.ref_type === question.kind ? { keep: true } : null;
}

async function regradeQuiz(quizId) {
  const questions = await loadQuestions(quizId);
  const byId = new Map(questions.map((x) => [x.id, x]));
  const [subs] = await db.query('SELECT * FROM quiz_submissions WHERE quiz_id = ?', [quizId]);
  for (const sub of subs) {
    const [answers] = await db.query('SELECT * FROM quiz_answers WHERE submission_id = ?', [sub.id]);
    for (const a of answers) {
      const question = byId.get(a.question_id);
      if (!question) continue;
      const clean = sanitizeAnswer(question, a);
      if (!clean) { await db.query('DELETE FROM quiz_answers WHERE id = ?', [a.id]); continue; }
      if (clean.value !== undefined && JSON.stringify(clean.value) !== JSON.stringify(unwrapAnswer(a.value))) {
        await db.query('UPDATE quiz_answers SET value = ? WHERE id = ?', [wrapAnswer(clean.value), a.id]);
      }
    }
    if (sub.status === 'in_progress') continue;
    const [fresh] = await db.query('SELECT * FROM quiz_answers WHERE submission_id = ?', [sub.id]);
    let score = 0; let pending = 0;
    for (const question of questions) {
      const a = fresh.find((x) => x.question_id === question.id);
      if (AUTO.includes(question.kind)) {
        const pts = a ? autoPoints(question, unwrapAnswer(a.value)) : 0;
        if (a) await db.query('UPDATE quiz_answers SET points = ? WHERE id = ?', [pts, a.id]);
        score += pts;
      } else if (a && a.points != null) {
        const pts = Math.min(Number(a.points), question.points);
        if (pts !== Number(a.points)) await db.query('UPDATE quiz_answers SET points = ? WHERE id = ?', [pts, a.id]);
        score += pts;
      } else pending += 1;
    }
    const status = pending ? 'submitted' : 'graded';
    await db.query(
      `UPDATE quiz_submissions SET score = ?, status = ?,
              graded_at = CASE WHEN ? = 'graded' THEN COALESCE(graded_at, NOW()) ELSE NULL END WHERE id = ?`,
      [score, status, status, sub.id],
    );
  }
}

module.exports = {
  listQuizzes, createQuiz, updateQuiz, deleteQuiz, saveQuestions, getQuiz,
  startQuiz, saveAnswer, submitQuiz, listSubmissions, getSubmission, gradeSubmission, reopenSubmission,
};
