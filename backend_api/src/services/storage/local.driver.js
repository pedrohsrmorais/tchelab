'use strict';

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { pipeline } = require('stream/promises');
const cfg = require('../../config/storage.config');

const abs = (key) => {
  const full = path.resolve(cfg.base, key);
  if (full !== cfg.base && !full.startsWith(path.resolve(cfg.base) + path.sep)) throw new Error('Caminho fora do armazenamento.');
  return full;
};
const notFound = (key) => { const E = require('./index').StorageNotFound; return new E(key); };

async function* walk(dir, rel = '') {
  let entries;
  try { entries = await fsp.readdir(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) yield* walk(path.join(dir, e.name), r);
    else yield r;
  }
}

module.exports = {
  async init() {
    for (const d of Object.values(cfg)) await fsp.mkdir(d, { recursive: true });
    // tmp/ local é limpo no start: o que sobrou de upload interrompido nunca é reutilizado
    await module.exports.sweepTmp(24 * 3600 * 1000).catch(() => {});
  },
  async sweepTmp(maxAgeMs) {
    const now = Date.now(); let n = 0;
    for await (const rel of walk(cfg.tmp)) {
      const f = path.join(cfg.tmp, rel);
      try { const st = await fsp.stat(f); if (now - st.mtimeMs > maxAgeMs) { await fsp.rm(f, { force: true }); n += 1; } } catch { /* sumiu */ }
    }
    return n;
  },
  async put(key, body, opts = {}) {
    const dest = abs(key);
    await fsp.mkdir(path.dirname(dest), { recursive: true });
    const tmpDest = `${dest}.part-${process.pid}-${Date.now()}`;
    try {
      if (Buffer.isBuffer(body) || typeof body === 'string') await fsp.writeFile(tmpDest, body);
      else {
        let n = 0;
        const guard = new (require('stream').Transform)({
          transform(chunk, _e, cb) {
            n += chunk.length;
            if (opts.maxBytes && n > opts.maxBytes) return cb(Object.assign(new Error('Arquivo maior que o permitido.'), { code: 'STORAGE_TOO_LARGE' }));
            return cb(null, chunk);
          },
        });
        await pipeline(body, guard, fs.createWriteStream(tmpDest));
      }
      await fsp.rename(tmpDest, dest);
    } catch (e) { await fsp.rm(tmpDest, { force: true }); throw e; }
    const st = await fsp.stat(dest);
    return { key, size: st.size };
  },
  async putFile(key, filePath, opts = {}) {
    const st = await fsp.stat(filePath);
    if (opts.maxBytes && st.size > opts.maxBytes) throw Object.assign(new Error('Arquivo maior que o permitido.'), { code: 'STORAGE_TOO_LARGE' });
    return module.exports.put(key, fs.createReadStream(filePath), opts);
  },
  async getStream(key, opts = {}) {
    const full = abs(key);
    let st;
    try { st = await fsp.stat(full); } catch { throw notFound(key); }
    if (!st.isFile()) throw notFound(key);
    return fs.createReadStream(full, opts.range ? { start: opts.range.start, end: opts.range.end } : undefined);
  },
  async downloadTo(key, destPath) {
    const src = await module.exports.getStream(key);
    await fsp.mkdir(path.dirname(destPath), { recursive: true });
    await pipeline(src, fs.createWriteStream(destPath));
  },
  async stat(key) {
    try { const st = await fsp.stat(abs(key)); return st.isFile() ? { size: st.size } : null; } catch { return null; }
  },
  async remove(key) { await fsp.rm(abs(key), { force: true }); },
  async removePrefix(prefix) {
    let n = 0;
    for await (const rel of walk(abs(prefix || '.'), prefix.replace(/\/+$/, ''))) { await fsp.rm(abs(rel), { force: true }); n += 1; }
    return n;
  },
  async list(prefix) {
    const out = [];
    const base = prefix.replace(/\/+$/, '');
    for await (const rel of walk(abs(base || '.'), base)) {
      if (rel.includes('.part-')) continue;
      try { const st = await fsp.stat(abs(rel)); out.push({ key: rel, size: st.size, lastModified: st.mtime }); } catch { /* sumiu */ }
    }
    return out;
  },
  async copy(fromKey, toKey) {
    const dest = abs(toKey);
    await fsp.mkdir(path.dirname(dest), { recursive: true });
    try { await fsp.copyFile(abs(fromKey), dest); } catch { throw notFound(fromKey); }
    return { key: toKey, size: (await fsp.stat(dest)).size };
  },
  async presignGet() { return null; },
  async capacity() {
    try { const s = await fsp.statfs(cfg.base); return { total: s.blocks * s.bsize, free: s.bavail * s.bsize }; } catch { return null; }
  },
};
