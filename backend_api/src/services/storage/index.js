'use strict';

/**
 * StorageService — única porta de entrada para arquivos da plataforma.
 *
 * Dois drivers com a mesma interface:
 *   • local → pasta em disco (STORAGE_PATH). Padrão em desenvolvimento e testes.
 *   • s3    → qualquer API S3: MinIO (dentro do docker) hoje, AWS S3 depois. Trocar de um para o outro
 *             é só mudar S3_ENDPOINT/credenciais (na AWS, deixe S3_ENDPOINT vazio e S3_FORCE_PATH_STYLE=false).
 *
 * Chave de objeto = "<pasta>/<arquivo>" (ex.: "communities/172…-ab12.pdf"). O dono e o tamanho de cada
 * objeto ficam na tabela `storage_objects` (ver quota.service.js), não no nome da chave.
 *
 * Ninguém fora desta pasta deve usar `fs`/`path` para ler ou gravar arquivos de usuário.
 */

const driverName = String(process.env.STORAGE_DRIVER || 'local').toLowerCase();

let driver;
if (driverName === 's3') driver = require('./s3.driver');
else if (driverName === 'local') driver = require('./local.driver');
else throw new Error(`STORAGE_DRIVER inválido: "${driverName}" (use "local" ou "s3")`);

/** Pasta local de trabalho: uploads chegam aqui (multer) antes de irem para o storage; também usada p/ conversões. */
async function scratch() {
  const cfg = require('../../config/storage.config');
  const fsp = require('fs').promises;
  await fsp.mkdir(cfg.tmp, { recursive: true });
  await fsp.mkdir(cfg.outbox, { recursive: true });
  const now = Date.now();
  for (const f of await fsp.readdir(cfg.tmp).catch(() => [])) {
    const full = require('path').join(cfg.tmp, f);
    try { if (now - (await fsp.stat(full)).mtimeMs > 24 * 3600 * 1000) await fsp.rm(full, { recursive: true, force: true }); } catch { /* sumiu */ }
  }
}

class StorageNotFound extends Error {
  constructor(key) { super(`Objeto não encontrado: ${key}`); this.code = 'STORAGE_NOT_FOUND'; this.key = key; }
}

/** Impede "../" e caminhos absolutos: a chave sempre vira "pasta/arquivo" limpo. */
function safeKey(key) {
  const k = String(key || '').replace(/\\/g, '/').replace(/^\/+/, '');
  if (!k || k.split('/').some((p) => p === '..' || p === '.' || p === '')) throw new Error(`Chave de armazenamento inválida: "${key}"`);
  return k;
}

module.exports = {
  driver: driverName,
  StorageNotFound,
  safeKey,
  /** Cria pasta/bucket e regras de ciclo de vida. Chamado uma vez no start do servidor. */
  init: async () => {
    // o MinIO pode demorar alguns segundos a mais que o backend para aceitar conexões
    let last;
    for (let i = 0; i < 30; i += 1) {
      try { await scratch(); return await driver.init(); } catch (e) { last = e; await new Promise((r) => setTimeout(r, 2000)); }
    }
    throw last;
  },
  /** Grava `body` (Buffer, string ou stream) e devolve { key, size }. */
  put: (key, body, opts = {}) => driver.put(safeKey(key), body, opts),
  /** Envia um arquivo local (ex.: o temporário do multer) e devolve { key, size }. */
  putFile: (key, filePath, opts = {}) => driver.putFile(safeKey(key), filePath, opts),
  /** Stream de leitura. Lança StorageNotFound se não existir. */
  getStream: (key, opts = {}) => driver.getStream(safeKey(key), opts),
  /** Baixa o objeto para um caminho local (usado por ferramentas que exigem arquivo, como o LibreOffice). */
  downloadTo: (key, destPath) => driver.downloadTo(safeKey(key), destPath),
  /** { size } ou null. */
  stat: (key) => driver.stat(safeKey(key)),
  exists: async (key) => !!(await driver.stat(safeKey(key))),
  /** Remove um objeto (silencioso se não existir). */
  remove: (key) => driver.remove(safeKey(key)),
  /** Remove todos os objetos sob um prefixo ("pasta/"). Devolve a quantidade removida. */
  removePrefix: (prefix) => driver.removePrefix(String(prefix).replace(/^\/+/, '')),
  /** Lista { key, size, lastModified } sob um prefixo (usado na reconciliação). */
  list: (prefix) => driver.list(String(prefix || '').replace(/^\/+/, '')),
  /** Copia um objeto dentro do armazenamento (sem passar pela aplicação, no S3). */
  copy: (fromKey, toKey) => driver.copy(safeKey(fromKey), safeKey(toKey)),
  /** URL temporária de download (só no driver s3; no local devolve null). */
  presignGet: (key, opts = {}) => driver.presignGet(safeKey(key), opts),
  /** Capacidade do disco que guarda os dados (bytes) — só o driver local sabe; no S3 vem de S3_CAPACITY_BYTES. */
  capacity: () => driver.capacity(),
};
