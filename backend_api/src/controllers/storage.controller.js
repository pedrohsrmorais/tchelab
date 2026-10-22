'use strict';

const db = require('../config/db.config');
const R = require('../utils/response');
const quota = require('../services/quota.service');
const storage = require('../services/storage');

// GET /storage/usage — uso, limite e plano do usuário logado (+ o que mais ocupa espaço com ?details=1)
async function myUsage(req, res) {
  try {
    const usage = await quota.getUsage(req.user.id);
    if (!usage) return R.notFound(res, 'Usuário');
    const body = { ...usage };
    if (req.query.details === '1' || req.query.details === 'true') body.breakdown = await quota.breakdown(req.user.id, Math.min(100, Number(req.query.limit) || 30));
    return R.ok(res, body);
  } catch (err) { return R.serverError(res, err); }
}

const adminOnly = (req, res) => { if (req.user.role !== 'admin') { R.forbidden(res); return false; } return true; };

// GET /admin/storage — visão do servidor: capacidade × cota alocada × uso real, e uso por usuário
async function adminOverview(req, res) {
  try {
    if (!adminOnly(req, res)) return;
    const [users] = await db.query(
      `SELECT u.uuid, u.name, u.email, u.storage_used_bytes AS used, u.storage_reserved_bytes AS reserved,
              COALESCE(u.storage_quota_bytes, p.quota_bytes, (SELECT quota_bytes FROM storage_plans WHERE is_default = 1 LIMIT 1), 0) AS quota,
              u.storage_quota_bytes IS NOT NULL AS custom_quota, COALESCE(p.code, 'beta') AS plan
         FROM users u LEFT JOIN storage_plans p ON p.id = u.storage_plan_id
        WHERE u.deleted_at IS NULL ORDER BY u.storage_used_bytes DESC`);
    const allocated = users.reduce((n, u) => n + Number(u.quota), 0);
    const used = users.reduce((n, u) => n + Number(u.used), 0);
    const cap = await storage.capacity();
    return R.ok(res, {
      driver: storage.driver,
      capacity_bytes: cap ? cap.total : null,
      free_bytes: cap && cap.free != null ? cap.free : null,
      allocated_bytes: allocated,
      used_bytes: used,
      overcommit_ratio: cap && cap.total ? Math.round((allocated / cap.total) * 100) / 100 : null,
      server_full: await quota.serverIsFull(),
      users: users.map((u) => ({
        uuid: u.uuid, name: u.name, email: u.email, plan: u.plan, custom_quota: !!u.custom_quota,
        used: Number(u.used), reserved: Number(u.reserved), quota: Number(u.quota),
        percent: Number(u.quota) ? Math.round((Number(u.used) / Number(u.quota)) * 1000) / 10 : 100,
      })),
    });
  } catch (err) { return R.serverError(res, err); }
}

// GET /admin/storage/plans
async function listPlans(req, res) {
  try {
    if (!adminOnly(req, res)) return;
    const [rows] = await db.query(
      `SELECT p.id, p.code, p.name, p.quota_bytes, p.max_file_bytes, p.max_concurrent_jobs, p.monthly_cpu_seconds, p.is_default,
              (SELECT COUNT(*) FROM users u WHERE u.storage_plan_id = p.id AND u.deleted_at IS NULL) AS users
         FROM storage_plans p ORDER BY p.quota_bytes`);
    return R.ok(res, rows);
  } catch (err) { return R.serverError(res, err); }
}

const posInt = (v) => Number.isFinite(Number(v)) && Number(v) >= 0 && Number.isInteger(Number(v));

// PUT /admin/storage/plans/:code — ajusta cota/limites do plano (vale para todos os usuários dele, sem deploy)
async function updatePlan(req, res) {
  try {
    if (!adminOnly(req, res)) return;
    const b = req.body || {}; const f = []; const v = [];
    for (const k of ['quota_bytes', 'max_file_bytes', 'max_concurrent_jobs']) {
      if (b[k] !== undefined) {
        if (!posInt(b[k]) || Number(b[k]) < 1) return R.unprocessable(res, [{ field: k, message: 'Informe um inteiro positivo.' }]);
        f.push(`${k} = ?`); v.push(Number(b[k]));
      }
    }
    if (b.name !== undefined) { f.push('name = ?'); v.push(String(b.name).slice(0, 120)); }
    if (!f.length) return R.badRequest(res, 'Nenhum campo para atualizar.');
    const [r] = await db.query(`UPDATE storage_plans SET ${f.join(', ')} WHERE code = ?`, [...v, req.params.code]);
    if (!r.affectedRows) return R.notFound(res, 'Plano');
    const [[plan]] = await db.query('SELECT * FROM storage_plans WHERE code = ?', [req.params.code]);
    return R.ok(res, plan);
  } catch (err) { return R.serverError(res, err); }
}

// PUT /admin/storage/users/:uuid  { plan_code?, quota_bytes? (null = volta a seguir o plano) }
async function updateUserQuota(req, res) {
  try {
    if (!adminOnly(req, res)) return;
    const [[u]] = await db.query('SELECT id FROM users WHERE uuid = ? AND deleted_at IS NULL', [req.params.uuid]);
    if (!u) return R.notFound(res, 'Usuário');
    const b = req.body || {}; const f = []; const v = [];
    if (b.plan_code !== undefined) {
      const [[p]] = await db.query('SELECT id FROM storage_plans WHERE code = ?', [String(b.plan_code)]);
      if (!p) return R.unprocessable(res, [{ field: 'plan_code', message: 'Plano inexistente.' }]);
      f.push('storage_plan_id = ?'); v.push(p.id);
    }
    if (b.quota_bytes !== undefined) {
      if (b.quota_bytes === null) f.push('storage_quota_bytes = NULL');
      else if (!posInt(b.quota_bytes) || Number(b.quota_bytes) < 1) return R.unprocessable(res, [{ field: 'quota_bytes', message: 'Informe um inteiro positivo ou null.' }]);
      else { f.push('storage_quota_bytes = ?'); v.push(Number(b.quota_bytes)); }
    }
    if (!f.length) return R.badRequest(res, 'Nenhum campo para atualizar.');
    await db.query(`UPDATE users SET ${f.join(', ')} WHERE id = ?`, [...v, u.id]);
    return R.ok(res, await quota.getUsage(u.id));
  } catch (err) { return R.serverError(res, err); }
}

module.exports = { myUsage, adminOverview, listPlans, updatePlan, updateUserQuota };
