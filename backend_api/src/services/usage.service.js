'use strict';

/**
 * Consumo por usuário: processamento e memória (medidos pelo worker por job) e armazenamento ao longo do tempo,
 * agregados por mês em `usage_monthly`, mais a calculadora de custo/licença do painel admin.
 *
 * Custo (parâmetros editáveis no painel, guardados em `usage_meta`):
 *   armazenamento/mês = GB médios no mês × preço_GB_mês        (GB médios = GB·hora ÷ horas do mês)
 *   processamento/mês = CPU-horas × preço_CPU_hora             (o preço da CPU-hora já embute a memória)
 *   teto por usuário  = cota do plano (GB) × preço_GB_mês + orçamento mensal de CPU do plano (h) × preço_CPU_hora
 * A memória é medida e exibida (pico e GB·s) para dimensionar o servidor, mas não entra no preço separadamente.
 */

const db = require('../config/db.config');

const GIB = 1024 ** 3;
const HOURS_PER_MONTH = 730;
const DEFAULT_PRICES = { price_gb_month: 0.023, price_cpu_hour: 0.05, currency: 'USD' };

const R = require('../utils/response');

/** Orçamento mensal de CPU esgotado: bloqueia novas execuções até o mês virar, o admin ampliar o plano ou a cota do usuário. */
class CpuBudgetError extends Error {
  constructor(message, details = {}) { super(message); this.name = 'CpuBudgetError'; this.code = 'CPU_BUDGET_EXCEEDED'; this.status = 402; this.details = details; }
}

const monthKey = (d = new Date()) => d.toISOString().slice(0, 7);

/** Soma o consumo medido de um job ao mês corrente do usuário. */
async function record(userId, metrics = {}, { failed = false, inputBytes = 0, outputBytes = 0, at = new Date() } = {}) {
  const cpu = Number(metrics.cpu_seconds) || 0;
  const wall = (Number(metrics.wall_ms) || 0) / 1000;
  const mem = Number(metrics.mem_bytes) || 0;
  await db.query(
    `INSERT INTO usage_monthly (user_id, month, jobs, jobs_failed, cpu_seconds, wall_seconds, gb_seconds_ram, peak_rss_max_bytes, input_bytes, output_bytes)
     VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE jobs = jobs + 1, jobs_failed = jobs_failed + VALUES(jobs_failed), cpu_seconds = cpu_seconds + VALUES(cpu_seconds),
       wall_seconds = wall_seconds + VALUES(wall_seconds), gb_seconds_ram = gb_seconds_ram + VALUES(gb_seconds_ram),
       peak_rss_max_bytes = GREATEST(peak_rss_max_bytes, VALUES(peak_rss_max_bytes)),
       input_bytes = input_bytes + VALUES(input_bytes), output_bytes = output_bytes + VALUES(output_bytes)`,
    [userId, monthKey(at), failed ? 1 : 0, cpu, wall, (mem / GIB) * wall, Math.max(0, Math.round(Number(metrics.peak_rss_bytes) || 0)),
      Math.max(0, Math.round(inputBytes)), Math.max(0, Math.round(outputBytes))],
  );
}

// ── Orçamento mensal de CPU ──────────────────────────────────────────────────────────────────────────────────────
const fmtCpu = (sec) => (sec < 60 ? `${Math.round(sec)} s` : sec < 3600 ? `${Math.round(sec / 60)} min` : `${Math.round((sec / 3600) * 10) / 10} h`);

/**
 * Situação do usuário no mês: `budget` = override do usuário → orçamento do plano → plano padrão (null = sem limite).
 * `exceeded` quando já gastou todo o orçamento (um job em andamento pode terminar acima dele: o bloqueio vale para o próximo).
 */
async function cpuBudgetStatus(userId, at = new Date()) {
  const [[r]] = await db.query(
    `SELECT COALESCE(u.cpu_budget_seconds, p.monthly_cpu_seconds, d.monthly_cpu_seconds) AS budget,
            COALESCE((SELECT cpu_seconds FROM usage_monthly WHERE user_id = u.id AND month = ?), 0) AS used
       FROM users u LEFT JOIN storage_plans p ON p.id = u.storage_plan_id
       LEFT JOIN storage_plans d ON d.is_default = 1 WHERE u.id = ? LIMIT 1`, [monthKey(at), userId]);
  if (!r) return { budget: null, used: 0, remaining: null, exceeded: false };
  const budget = r.budget != null ? Number(r.budget) : null; const used = Number(r.used);
  return { budget, used, remaining: budget != null ? Math.max(0, budget - used) : null, exceeded: budget != null && used >= budget };
}

/** Lança CpuBudgetError se o orçamento do mês acabou. */
async function assertCpuBudget(userId) {
  const st = await cpuBudgetStatus(userId);
  if (st.exceeded) {
    throw new CpuBudgetError(
      `Você usou todo o tempo de processamento do mês (${fmtCpu(st.used)} de ${fmtCpu(st.budget)}). Novas execuções ficam bloqueadas até o início do próximo mês ou até o seu plano ser ampliado.`,
      { used_seconds: st.used, budget_seconds: st.budget },
    );
  }
  return st;
}

/** Resposta HTTP padronizada para CpuBudgetError (402). Devolve true se tratou. */
function handleCpuError(res, err) {
  if (!(err instanceof CpuBudgetError)) return false;
  R.error(res, err.status, err.code, err.message, err.details);
  return true;
}

// ── Armazenamento ao longo do tempo (GB·hora) ────────────────────────────────────────────────────────────────────
async function getMeta(k, fallback = null) {
  const [[r]] = await db.query('SELECT v FROM usage_meta WHERE k = ?', [k]);
  return r ? r.v : fallback;
}
const setMeta = (k, v) => db.query('INSERT INTO usage_meta (k, v) VALUES (?, ?) ON DUPLICATE KEY UPDATE v = VALUES(v)', [k, String(v)]);

/**
 * Credita ao mês corrente o armazenamento de cada usuário pelo tempo decorrido desde a última medição (máx. 48 h, para
 * cobrir reinícios sem inventar horas). Chamada a cada hora; `now` existe para teste.
 */
async function tickStorage(now = Date.now()) {
  const last = Number(await getMeta('storage_tick_at', 0));
  const hours = last ? Math.min(48, Math.max(0, (now - last) / 3600000)) : 1;
  await setMeta('storage_tick_at', now);
  if (hours <= 0) return 0;
  const [r] = await db.query(
    `INSERT INTO usage_monthly (user_id, month, storage_gb_hours)
     SELECT id, ?, (storage_used_bytes / ?) * ? FROM users WHERE storage_used_bytes > 0 AND deleted_at IS NULL
     ON DUPLICATE KEY UPDATE storage_gb_hours = storage_gb_hours + VALUES(storage_gb_hours)`,
    [monthKey(new Date(now)), GIB, hours],
  );
  return r.affectedRows;
}

let timer = null;
function startStorageMeter() {
  if (timer) return;
  tickStorage().catch((e) => console.error('[usage] tick de armazenamento:', e.message));
  timer = setInterval(() => tickStorage().catch((e) => console.error('[usage] tick de armazenamento:', e.message)), 3600000);
  timer.unref();
}

// ── Preços e custo ───────────────────────────────────────────────────────────────────────────────────────────────
async function getPrices() {
  const [rows] = await db.query("SELECT k, v FROM usage_meta WHERE k IN ('price_gb_month', 'price_cpu_hour', 'currency')");
  const m = Object.fromEntries(rows.map((r) => [r.k, r.v]));
  return {
    price_gb_month: m.price_gb_month != null ? Number(m.price_gb_month) : DEFAULT_PRICES.price_gb_month,
    price_cpu_hour: m.price_cpu_hour != null ? Number(m.price_cpu_hour) : DEFAULT_PRICES.price_cpu_hour,
    currency: m.currency || DEFAULT_PRICES.currency,
    is_default: !rows.length,
  };
}

async function setPrices(b) {
  if (b.price_gb_month !== undefined) await setMeta('price_gb_month', Number(b.price_gb_month));
  if (b.price_cpu_hour !== undefined) await setMeta('price_cpu_hour', Number(b.price_cpu_hour));
  if (b.currency !== undefined) await setMeta('currency', String(b.currency).toUpperCase().slice(0, 3));
  return getPrices();
}

const round = (n, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

/** Custo do mês de um registro de `usage_monthly` (ou zeros). */
function costOf(row, prices) {
  const gbAvg = (Number(row?.storage_gb_hours) || 0) / HOURS_PER_MONTH;
  const cpuH = (Number(row?.cpu_seconds) || 0) / 3600;
  const storage = gbAvg * prices.price_gb_month; const compute = cpuH * prices.price_cpu_hour;
  return { gb_avg: round(gbAvg, 4), cpu_hours: round(cpuH, 4), storage: round(storage, 4), compute: round(compute, 4), total: round(storage + compute, 4) };
}

/** Teto por usuário de um plano: tudo cheio e o orçamento de CPU gasto. */
function ceilingOf(plan, prices) {
  const gb = Number(plan.quota_bytes) / GIB; const cpuH = (Number(plan.monthly_cpu_seconds) || 0) / 3600;
  const storage = gb * prices.price_gb_month; const compute = cpuH * prices.price_cpu_hour;
  return { quota_gb: round(gb, 3), cpu_hours: round(cpuH, 2), storage: round(storage, 4), compute: round(compute, 4), total: round(storage + compute, 4) };
}

/**
 * Relatório para o painel: teto por plano (× nº de licenças) e custo real do mês corrente (total, por usuário ativo e
 * projeção do mês). `licenses` só multiplica; o teto é exato dado o que o plano promete.
 */
async function costReport({ licenses = 10, month = monthKey() } = {}) {
  const prices = await getPrices();
  const [plans] = await db.query('SELECT code, name, quota_bytes, max_file_bytes, monthly_cpu_seconds, is_default FROM storage_plans ORDER BY quota_bytes');
  const [rows] = await db.query('SELECT * FROM usage_monthly WHERE month = ?', [month]);
  const sum = rows.reduce((a, r) => ({
    storage_gb_hours: a.storage_gb_hours + Number(r.storage_gb_hours), cpu_seconds: a.cpu_seconds + Number(r.cpu_seconds),
    gb_seconds_ram: a.gb_seconds_ram + Number(r.gb_seconds_ram), jobs: a.jobs + r.jobs,
  }), { storage_gb_hours: 0, cpu_seconds: 0, gb_seconds_ram: 0, jobs: 0 });
  const active = rows.filter((r) => Number(r.cpu_seconds) > 0 || Number(r.storage_gb_hours) > 0).length;
  const total = costOf(sum, prices);
  const now = new Date(); const dayOfMonth = now.getUTCDate(); const daysInMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
  return {
    month, licenses, prices,
    plans: plans.map((p) => { const c = ceilingOf(p, prices); return { code: p.code, name: p.name, is_default: !!p.is_default, per_user: c, for_licenses: round(c.total * licenses, 2) }; }),
    real: {
      active_users: active, jobs: sum.jobs, cpu_hours: total.cpu_hours, gb_avg: total.gb_avg,
      gb_seconds_ram: round(sum.gb_seconds_ram, 1), total,
      per_active_user: active ? round(total.total / active, 4) : 0,
      projected_month_total: month === monthKey() ? round(total.total * (daysInMonth / Math.max(1, dayOfMonth)), 4) : null,
    },
  };
}

module.exports = { CpuBudgetError, cpuBudgetStatus, assertCpuBudget, handleCpuError, record, tickStorage, startStorageMeter, getPrices, setPrices, costOf, ceilingOf, costReport, monthKey, HOURS_PER_MONTH };
