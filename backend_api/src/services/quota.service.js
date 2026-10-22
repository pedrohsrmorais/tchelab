'use strict';

/**
 * Cota de armazenamento por usuário.
 *
 * Regra de ouro: NADA que consuma espaço é gravado sem antes reservar a cota. O fluxo é sempre
 *   reserve(userId, bytes)  →  grava (banco/objeto)  →  commit(...)        (sucesso)
 *                                        └─ falhou →  release(userId, bytes)  (devolve a reserva)
 * `guard()` encapsula esse ciclo. A reserva é um UPDATE atômico condicionado ao limite, então dois envios
 * simultâneos nunca passam juntos do limite (não há "checar e depois gravar").
 *
 * Fonte da verdade: `users.storage_used_bytes` (+ `storage_reserved_bytes` em trânsito), com cada objeto
 * em `storage_objects` e cada variação em `storage_ledger`. A reconciliação (scripts/storage_reconcile.js)
 * recalcula o usado a partir de `storage_objects` e aponta divergências.
 *
 * O limite efetivo é `users.storage_quota_bytes` (exceção individual) ou, se nulo, a cota do plano.
 */

const db = require('../config/db.config');
const R = require('../utils/response');

const DEFAULT_PLAN_SQL = '(SELECT id FROM storage_plans WHERE is_default = 1 ORDER BY id LIMIT 1)';
const QUOTA_SQL = `COALESCE(u.storage_quota_bytes, p.quota_bytes, (SELECT quota_bytes FROM storage_plans WHERE id = ${DEFAULT_PLAN_SQL}), 0)`;

class QuotaError extends Error {
  constructor(code, message, details) {
    super(message); this.name = 'QuotaError'; this.code = code; this.details = details || null;
    this.status = 413;
  }
}

const fmtMB = (b) => {
  const n = Number(b);
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`; // arquivos pequenos: "0.0 MB" não ajuda
  return `${(n / 1048576).toFixed(n >= 10485760 ? 0 : 1)} MB`;
};

/** Limite, uso, reservas e plano do usuário. */
async function getUsage(userId, conn = db) {
  const [[u]] = await conn.query(
    `SELECT u.storage_used_bytes AS used, u.storage_reserved_bytes AS reserved, ${QUOTA_SQL} AS quota,
            COALESCE(p.code, (SELECT code FROM storage_plans WHERE id = ${DEFAULT_PLAN_SQL})) AS plan_code,
            COALESCE(p.name, (SELECT name FROM storage_plans WHERE id = ${DEFAULT_PLAN_SQL})) AS plan_name,
            COALESCE(p.max_file_bytes, (SELECT max_file_bytes FROM storage_plans WHERE id = ${DEFAULT_PLAN_SQL}), 0) AS max_file_bytes,
            COALESCE(p.max_concurrent_jobs, (SELECT max_concurrent_jobs FROM storage_plans WHERE id = ${DEFAULT_PLAN_SQL}), 1) AS max_concurrent_jobs
       FROM users u LEFT JOIN storage_plans p ON p.id = u.storage_plan_id WHERE u.id = ?`, [userId]);
  if (!u) return null;
  const used = Number(u.used); const reserved = Number(u.reserved); const quota = Number(u.quota);
  return {
    used, reserved, quota, remaining: Math.max(0, quota - used - reserved),
    percent: quota ? Math.min(100, Math.round(((used + reserved) / quota) * 1000) / 10) : 100,
    plan: { code: u.plan_code, name: u.plan_name },
    max_file_bytes: Number(u.max_file_bytes), max_concurrent_jobs: Number(u.max_concurrent_jobs),
    level: !quota || (used + reserved) / quota >= 1 ? 'full' : (used + reserved) / quota >= 0.95 ? 'critical' : (used + reserved) / quota >= 0.8 ? 'warning' : 'ok',
  };
}

/** Falha cedo (sem reservar) quando o arquivo é maior que o permitido no plano ou não cabe na cota. */
async function precheck(userId, bytes) {
  const us = await getUsage(userId);
  if (!us) throw new QuotaError('STORAGE_NO_USER', 'Usuário não encontrado.');
  if (us.max_file_bytes && bytes > us.max_file_bytes) {
    throw new QuotaError('FILE_TOO_LARGE', `O arquivo tem ${fmtMB(bytes)}; o máximo por arquivo no seu plano é ${fmtMB(us.max_file_bytes)}.`,
      { size: bytes, max_file_bytes: us.max_file_bytes });
  }
  if (bytes > us.remaining) throw quotaExceeded(us, bytes);
  return us;
}

function quotaExceeded(us, needed) {
  return new QuotaError('STORAGE_QUOTA_EXCEEDED',
    `Espaço insuficiente: faltam ${fmtMB(Math.max(0, needed - us.remaining))} (usado ${fmtMB(us.used + us.reserved)} de ${fmtMB(us.quota)}). Exclua algum dado para liberar espaço.`,
    { used: us.used + us.reserved, quota: us.quota, needed, remaining: us.remaining });
}

// Trava global: com o servidor quase cheio ninguém grava, mesmo com cota sobrando (proteção de infraestrutura).
const GLOBAL_LIMIT = Number(process.env.STORAGE_GLOBAL_LIMIT || 0.9);
let globalCache = { at: 0, full: false };
async function serverIsFull() {
  if (Date.now() - globalCache.at < 30000) return globalCache.full;
  let full = false;
  try {
    const storage = require('./storage');
    const cap = await storage.capacity();
    if (cap && cap.total) {
      const used = cap.free != null ? cap.total - cap.free
        : Number((await db.query('SELECT COALESCE(SUM(storage_used_bytes), 0) AS b FROM users'))[0][0].b);
      full = used / cap.total >= GLOBAL_LIMIT;
    }
  } catch { /* sem informação de capacidade: não trava */ }
  globalCache = { at: Date.now(), full };
  return full;
}

/** Reserva `bytes` de forma atômica. Lança QuotaError se passar do limite. Devolve `bytes` (a "reserva"). */
async function reserve(userId, bytes) {
  const n = Math.max(0, Math.ceil(Number(bytes) || 0));
  if (n === 0) return 0;
  if (await serverIsFull()) {
    throw Object.assign(new QuotaError('STORAGE_SERVER_FULL', 'O armazenamento da plataforma está temporariamente cheio. Tente novamente mais tarde.'), { status: 503 });
  }
  const [r] = await db.query(
    `UPDATE users u LEFT JOIN storage_plans p ON p.id = u.storage_plan_id
        SET u.storage_reserved_bytes = u.storage_reserved_bytes + ?
      WHERE u.id = ? AND u.storage_used_bytes + u.storage_reserved_bytes + ? <= ${QUOTA_SQL}`,
    [n, userId, n],
  );
  if (!r.affectedRows) {
    const us = await getUsage(userId);
    if (!us) throw new QuotaError('STORAGE_NO_USER', 'Usuário não encontrado.');
    throw quotaExceeded(us, n);
  }
  return n;
}

/**
 * Reserva para a SAÍDA de um job (gerada de forma assíncrona pelo worker): respeita o máximo por item do plano e a cota.
 * Lança QuotaError (FILE_TOO_LARGE ou STORAGE_QUOTA_EXCEEDED); quem chama marca o nó como falho, sem gravar nada.
 */
async function reserveOutput(userId, bytes) {
  const us = await getUsage(userId);
  if (us && us.max_file_bytes && bytes > us.max_file_bytes) {
    throw new QuotaError('FILE_TOO_LARGE', `A saída tem ${fmtMB(bytes)}; o máximo por item no seu plano é ${fmtMB(us.max_file_bytes)}.`,
      { size: bytes, max_file_bytes: us.max_file_bytes });
  }
  return reserve(userId, bytes);
}

/** Devolve uma reserva que não virou objeto. */
async function release(userId, bytes) {
  const n = Math.max(0, Math.ceil(Number(bytes) || 0));
  if (!n) return;
  await db.query('UPDATE users SET storage_reserved_bytes = GREATEST(0, storage_reserved_bytes - ?) WHERE id = ?', [n, userId]);
}

/**
 * Converte a reserva em uso e registra o objeto. `size` é o tamanho real (pode ser menor que o reservado).
 * Devolve o id em `storage_objects`.
 */
async function commit(userId, reserved, { kind, refType, refId, key = null, size }) {
  const real = Math.max(0, Math.ceil(Number(size) || 0));
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(
      `UPDATE users SET storage_reserved_bytes = GREATEST(0, storage_reserved_bytes - ?), storage_used_bytes = storage_used_bytes + ? WHERE id = ?`,
      [reserved, real, userId]);
    const [ins] = await conn.query(
      'INSERT INTO storage_objects (user_id, kind, ref_type, ref_id, storage_key, size_bytes) VALUES (?, ?, ?, ?, ?, ?)',
      [userId, kind, refType, refId, key, real]);
    await conn.query('INSERT INTO storage_ledger (user_id, delta_bytes, reason, object_id) VALUES (?, ?, ?, ?)', [userId, real, `add:${kind}`, ins.insertId]);
    await conn.commit();
    return ins.insertId;
  } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
}

/**
 * Reserva → executa `work` → confirma. `fileBytes` (opcional) é o tamanho do arquivo enviado, comparado ao máximo por arquivo do plano
 * (a cota total usa `estimate`, que pode incluir o dado já interpretado).
 * `work` devolve { refType, refId, kind, key?, size? } (size padrão = estimativa).
 * Qualquer exceção em `work` devolve a reserva. Retorna o que `work` devolveu (+ objectId).
 */
async function guard(userId, estimate, work, { fileBytes } = {}) {
  // nenhum item individual pode passar do máximo por arquivo do plano
  const us = await getUsage(userId);
  const capCheck = fileBytes ?? estimate;
  if (us && us.max_file_bytes && capCheck > us.max_file_bytes) {
    throw new QuotaError('FILE_TOO_LARGE', `O item tem ${fmtMB(capCheck)}; o máximo por arquivo no seu plano é ${fmtMB(us.max_file_bytes)}.`,
      { size: capCheck, max_file_bytes: us.max_file_bytes });
  }
  const reserved = await reserve(userId, estimate);
  let out;
  try { out = await work(); } catch (e) { await release(userId, reserved); throw e; }
  try {
    const objectId = await commit(userId, reserved, { ...out, size: out.size ?? estimate });
    return { ...out, objectId };
  } catch (e) { await release(userId, reserved); throw e; }
}

async function freeObjects(objs, reason) {
  const keys = [];
  for (const o of objs) {
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      const [r] = await conn.query('UPDATE storage_objects SET deleted_at = NOW() WHERE id = ? AND deleted_at IS NULL', [o.id]);
      if (r.affectedRows) {
        await conn.query('UPDATE users SET storage_used_bytes = GREATEST(0, storage_used_bytes - ?) WHERE id = ?', [o.size_bytes, o.user_id]);
        await conn.query('INSERT INTO storage_ledger (user_id, delta_bytes, reason, object_id) VALUES (?, ?, ?, ?)', [o.user_id, -Number(o.size_bytes), `${reason}:${o.kind}`, o.id]);
        if (o.storage_key) keys.push(o.storage_key);
      }
      await conn.commit();
    } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
  }
  return keys;
}

/** Libera todos os objetos ativos de uma referência (ex.: dataset apagado). Devolve os `storage_key` a apagar do storage. */
async function freeByRef(refType, refId, { reason = 'remove' } = {}) {
  const [objs] = await db.query('SELECT id, user_id, kind, storage_key, size_bytes FROM storage_objects WHERE ref_type = ? AND ref_id = ? AND deleted_at IS NULL', [refType, refId]);
  return freeObjects(objs, reason);
}

/** Libera só o(s) objeto(s) com esta chave (ex.: arquivo substituído, mantendo os outros da mesma referência). */
async function freeByKey(key, { reason = 'remove' } = {}) {
  const [objs] = await db.query('SELECT id, user_id, kind, storage_key, size_bytes FROM storage_objects WHERE storage_key = ? AND deleted_at IS NULL', [key]);
  return freeObjects(objs, reason);
}

/**
 * Ajusta o tamanho de uma referência (ex.: dataset editado). Se crescer, precisa caber; se encolher, devolve.
 * Quando não existe objeto para a referência, cria um com `kind`.
 */
async function resize(userId, refType, refId, newSize, { kind }) {
  const target = Math.max(0, Math.ceil(Number(newSize) || 0));
  const [[row]] = await db.query('SELECT id, size_bytes FROM storage_objects WHERE ref_type = ? AND ref_id = ? AND deleted_at IS NULL ORDER BY id LIMIT 1', [refType, refId]);
  if (!row) return commit(userId, await reserve(userId, target), { kind, refType, refId, size: target });
  const delta = target - Number(row.size_bytes);
  if (delta === 0) return row.id;
  if (delta > 0) await reserve(userId, delta);
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query('UPDATE storage_objects SET size_bytes = ? WHERE id = ?', [target, row.id]);
    await conn.query(
      `UPDATE users SET storage_used_bytes = GREATEST(0, storage_used_bytes + ?), storage_reserved_bytes = GREATEST(0, storage_reserved_bytes - ?) WHERE id = ?`,
      [delta, Math.max(0, delta), userId]);
    await conn.query('INSERT INTO storage_ledger (user_id, delta_bytes, reason, object_id) VALUES (?, ?, ?, ?)', [userId, delta, `resize:${kind}`, row.id]);
    await conn.commit();
  } catch (e) { await conn.rollback(); if (delta > 0) await release(userId, delta); throw e; } finally { conn.release(); }
  return row.id;
}

/**
 * Quanto cada coisa ocupa (para o usuário saber o que excluir).
 * `items`: agrupado por referência, com nome e, quando existe, o `ref_id` público (uuid) e `community_id`, que o
 * frontend usa para oferecer "excluir"/"abrir". `deletable` indica que há endpoint de exclusão direto.
 */
async function breakdown(userId, limit = 50) {
  const [byKind] = await db.query(
    'SELECT kind, COUNT(*) AS n, SUM(size_bytes) AS bytes FROM storage_objects WHERE user_id = ? AND deleted_at IS NULL GROUP BY kind ORDER BY bytes DESC', [userId]);
  const [top] = await db.query(
    `SELECT so.ref_type, so.ref_id, MIN(so.kind) AS kind, SUM(so.size_bytes) AS bytes
       FROM storage_objects so WHERE so.user_id = ? AND so.deleted_at IS NULL
      GROUP BY so.ref_type, so.ref_id ORDER BY bytes DESC LIMIT ?`, [userId, limit]);
  const one = async (sql, params) => { try { const [rows] = await db.query(sql, params); return rows[0] || {}; } catch { return {}; } };
  const items = [];
  for (const r of top) {
    let info = {};
    if (r.ref_type === 'dataset') info = await one('SELECT name, uuid FROM datasets WHERE id = ?', [r.ref_id]);
    else if (r.ref_type === 'execution') info = await one("SELECT COALESCE(label, CONCAT('Execução ', LEFT(uuid, 8))) AS name, uuid FROM executions WHERE id = ?", [r.ref_id]);
    else if (r.ref_type === 'community_item') info = await one('SELECT ci.title AS name, ci.uuid, c.uuid AS community_id FROM community_items ci JOIN communities c ON c.id = ci.community_id WHERE ci.id = ?', [r.ref_id]);
    else if (r.ref_type === 'article') info = await one("SELECT COALESCE(title, CONCAT('PDF ', LEFT(uuid, 8))) AS name, uuid FROM articles WHERE id = ?", [r.ref_id]);
    else if (r.ref_type === 'equipment_image') info = await one('SELECT e.name, e.uuid, c.uuid AS community_id FROM equipment e JOIN communities c ON c.id = e.community_id WHERE e.id = ?', [r.ref_id]);
    items.push({
      kind: r.kind, ref_type: r.ref_type, ref_id: info.uuid || null, community_id: info.community_id || null, name: info.name || null, bytes: Number(r.bytes),
      deletable: ['dataset', 'execution', 'community_item', 'user_avatar'].includes(r.ref_type),
    });
  }
  return { by_kind: byKind.map((r) => ({ kind: r.kind, count: Number(r.n), bytes: Number(r.bytes) })), items };
}

/** Bytes que uma linha de dataset ocupa no banco (JSON de metadados + colunas pequenas). */
const datasetRowBytes = (...jsonParts) => 1024 + jsonParts.reduce((n, p) => n + (p == null ? 0 : Buffer.byteLength(typeof p === 'string' ? p : JSON.stringify(p))), 0);

/** Resposta HTTP padronizada para QuotaError (usada pelos controllers). Devolve true se tratou. */
function handleError(res, err) {
  if (!(err instanceof QuotaError)) return false;
  R.error(res, err.status, err.code, err.message, err.details);
  return true;
}

/** Tamanho atual (bytes) registrado para uma referência (soma dos objetos ativos). */
async function sizeOfRef(refType, refId) {
  const [[r]] = await db.query('SELECT COALESCE(SUM(size_bytes), 0) AS b FROM storage_objects WHERE ref_type = ? AND ref_id = ? AND deleted_at IS NULL', [refType, refId]);
  return Number(r.b);
}

module.exports = { serverIsFull, reserveOutput, sizeOfRef, datasetRowBytes, QuotaError, getUsage, precheck, reserve, release, commit, guard, freeByRef, freeByKey, resize, breakdown, handleError, fmtMB };
