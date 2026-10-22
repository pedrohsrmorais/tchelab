'use strict';

/**
 * Backfill de armazenamento — leva o que já existe para o novo modelo (storage + cota).
 *
 *   node scripts/storage_backfill.js [--dry-run]
 *
 * Variáveis: as mesmas do backend (STORAGE_DRIVER, S3_*, DB_*) e, se os arquivos antigos estiverem em outra pasta,
 * LEGACY_STORAGE_PATH (padrão: STORAGE_PATH ou backend_api/storage).
 *
 * O que faz (idempotente: pode rodar de novo sem duplicar nada):
 *  1. envia ao storage ativo os arquivos antigos (avatares, materiais de comunidade e prévias, imagens de equipamento,
 *     PDFs de artigo e arquivos de dataset) e acerta `storage_path` dos datasets para a chave nova;
 *  2. registra cada item em `storage_objects` (se ainda não houver) com o tamanho real;
 *  3. recalcula `users.storage_used_bytes` a partir dos objetos ativos e informa quem já passou da cota.
 * Nada é apagado dos locais antigos: depois de conferir, remova a pasta antiga manualmente.
 */

const fs = require('fs');
const path = require('path');
const db = require('../src/config/db.config');
const storage = require('../src/services/storage');
const cfg = require('../src/config/storage.config');

const DRY = process.argv.includes('--dry-run');
const LEGACY = process.env.LEGACY_STORAGE_PATH || cfg.base;
const stats = { files: 0, missing: 0, objects: 0, datasets: 0, executions: 0, bytes: 0 };

const log = (...a) => console.log(DRY ? '[dry-run]' : '[backfill]', ...a);

async function hasObject(refType, refId, key) {
  const [r] = await db.query(
    'SELECT id FROM storage_objects WHERE ref_type = ? AND ref_id = ? AND deleted_at IS NULL AND (storage_key <=> ?)', [refType, refId, key]);
  return r.length > 0;
}

async function register(userId, kind, refType, refId, key, size) {
  if (await hasObject(refType, refId, key)) return;
  stats.objects += 1; stats.bytes += size;
  if (DRY) return;
  const [ins] = await db.query('INSERT INTO storage_objects (user_id, kind, ref_type, ref_id, storage_key, size_bytes) VALUES (?, ?, ?, ?, ?, ?)', [userId, kind, refType, refId, key, size]);
  await db.query('INSERT INTO storage_ledger (user_id, delta_bytes, reason, object_id) VALUES (?, ?, ?, ?)', [userId, size, `backfill:${kind}`, ins.insertId]);
}

/** Garante que `key` existe no storage; se não, envia de `candidates` (arquivos antigos). Devolve o tamanho ou null. */
async function ensureFile(key, candidates) {
  const st = await storage.stat(key);
  if (st) return st.size;
  for (const c of candidates) {
    try {
      const fst = fs.statSync(c);
      if (!fst.isFile()) continue;
      if (!DRY) await storage.putFile(key, c);
      stats.files += 1;
      return fst.size;
    } catch { /* tenta o próximo */ }
  }
  stats.missing += 1;
  return null;
}

const rowBytesSql = (a) => `1024 + COALESCE(LENGTH(CAST(${a}.metadata AS CHAR)),0) + COALESCE(LENGTH(CAST(${a}.dimensions AS CHAR)),0)
  + COALESCE(LENGTH(CAST(${a}.mode_labels AS CHAR)),0) + COALESCE(LENGTH(CAST(${a}.mode_ranges AS CHAR)),0)
  + COALESCE(LENGTH(CAST(${a}.augmentation_scheme AS CHAR)),0) + COALESCE(LENGTH(CAST(${a}.reference_labels AS CHAR)),0)
  + COALESCE(LENGTH(${a}.description),0)`;

async function main() {
  await storage.init();
  log(`driver=${storage.driver} origem dos arquivos antigos=${LEGACY}${DRY ? ' (simulação)' : ''}`);

  // 1) avatares
  const [users] = await db.query("SELECT id, avatar_url FROM users WHERE avatar_url LIKE '/storage/avatars/%'");
  for (const u of users) {
    const name = path.basename(u.avatar_url.split('?')[0]);
    const size = await ensureFile(`avatars/${name}`, [path.join(LEGACY, 'avatars', name)]);
    if (size != null) await register(u.id, 'avatar', 'user_avatar', u.id, `avatars/${name}`, size);
  }

  // 2) materiais de comunidade (+ prévias): quem enviou paga
  const [items] = await db.query("SELECT id, created_by, file_path, preview_path FROM community_items WHERE file_path IS NOT NULL");
  for (const it of items) {
    const f = path.basename(it.file_path);
    const size = await ensureFile(`communities/${f}`, [path.join(LEGACY, 'communities', f)]);
    if (size != null) await register(it.created_by, 'community_file', 'community_item', it.id, `communities/${f}`, size);
    if (it.preview_path) {
      const p = path.basename(it.preview_path);
      const ps = await ensureFile(`communities/${p}`, [path.join(LEGACY, 'communities', p)]);
      if (ps != null) await register(it.created_by, 'community_preview', 'community_item', it.id, `communities/${p}`, ps);
    }
  }

  // 3) imagens de equipamento: sem autor registrado, paga o dono da comunidade
  const [eqs] = await db.query('SELECT e.id, e.image_path, c.owner_id FROM equipment e JOIN communities c ON c.id = e.community_id WHERE e.image_path IS NOT NULL');
  for (const e of eqs) {
    const f = path.basename(e.image_path);
    const size = await ensureFile(`equipment/${f}`, [path.join(LEGACY, 'equipment', f)]);
    if (size != null) await register(e.owner_id, 'equipment_image', 'equipment_image', e.id, `equipment/${f}`, size);
  }

  // 4) PDFs de artigo
  const [arts] = await db.query('SELECT id, user_id, uuid, pdf_path FROM articles WHERE pdf_path IS NOT NULL AND deleted_at IS NULL');
  for (const a of arts) {
    const key = `articles/${a.uuid}.pdf`;
    const size = await ensureFile(key, [a.pdf_path, path.join(LEGACY, 'articles', `${a.uuid}.pdf`)]);
    if (size != null) {
      await register(a.user_id, 'article_pdf', 'article', a.id, key, size);
      if (!DRY && a.pdf_path !== key) await db.query('UPDATE articles SET pdf_path = ? WHERE id = ?', [key, a.id]);
    }
  }

  // 5) datasets: linha no banco (+ arquivo, se houver)
  const [dss] = await db.query(`SELECT d.id, d.uuid, d.user_id, d.storage_path, (${rowBytesSql('d')}) AS row_bytes FROM datasets d WHERE d.deleted_at IS NULL`);
  for (const d of dss) {
    let key = null; let fileSize = 0;
    if (d.storage_path) {
      const ext = path.extname(d.storage_path) || '.csv';
      key = `datasets/${d.uuid}${ext}`;
      const sz = await ensureFile(key, [d.storage_path, path.join(LEGACY, d.storage_path), path.join(LEGACY, 'tmp', path.basename(d.storage_path)), path.join(LEGACY, 'datasets', path.basename(d.storage_path))]);
      if (sz == null) key = null; else { fileSize = sz; if (!DRY && d.storage_path !== key) await db.query('UPDATE datasets SET storage_path = ? WHERE id = ?', [key, d.id]); }
    }
    await register(d.user_id, 'dataset', 'dataset', d.id, key, Number(d.row_bytes) + fileSize);
    stats.datasets += 1;
  }

  // 6) saídas de execução (uma entrada por execução)
  const [exs] = await db.query(
    `SELECT e.id, e.user_id, COALESCE(SUM(1024 + COALESCE(LENGTH(CAST(en.output_data AS CHAR)),0)), 0) AS bytes
       FROM executions e JOIN execution_nodes en ON en.execution_id = e.id
      WHERE en.output_data IS NOT NULL GROUP BY e.id, e.user_id`);
  for (const e of exs) { await register(e.user_id, 'execution_output', 'execution', e.id, null, Number(e.bytes)); stats.executions += 1; }

  // 7) totais por usuário
  if (!DRY) {
    await db.query(`UPDATE users u SET storage_reserved_bytes = 0, storage_used_bytes = COALESCE((SELECT SUM(size_bytes) FROM storage_objects o WHERE o.user_id = u.id AND o.deleted_at IS NULL), 0)`);
  }
  const [over] = await db.query(
    `SELECT u.email, u.storage_used_bytes AS used, COALESCE(u.storage_quota_bytes, p.quota_bytes) AS quota
       FROM users u LEFT JOIN storage_plans p ON p.id = u.storage_plan_id
      WHERE u.storage_used_bytes > COALESCE(u.storage_quota_bytes, p.quota_bytes) ORDER BY used DESC`);
  log(JSON.stringify(stats));
  if (over.length) {
    log(`${over.length} usuário(s) já acima da cota (ficam sem poder gravar até excluir algo ou receber mais espaço):`);
    over.slice(0, 20).forEach((o) => log(`  ${o.email}: ${(o.used / 1048576).toFixed(1)} MB de ${(o.quota / 1048576).toFixed(0)} MB`));
  }
  await db.end();
}

main().catch((e) => { console.error('[backfill] falhou:', e); process.exit(1); });
