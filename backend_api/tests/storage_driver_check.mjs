// Testa o StorageService nos dois drivers (local e s3) com a mesma bateria.
//   node tests/storage_driver_check.mjs            → roda local e, se S3_TEST_ENDPOINT existir, s3
//   S3_TEST_ENDPOINT=http://127.0.0.1:5000 node tests/storage_driver_check.mjs   (ex.: `moto_server -p 5000` ou MinIO)
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { Readable } from 'node:stream';

if (!process.env.__DRIVER) {
  let bad = 0;
  const runs = [['local', {}]];
  if (process.env.S3_TEST_ENDPOINT) runs.push(['s3', { S3_ENDPOINT: process.env.S3_TEST_ENDPOINT, S3_ACCESS_KEY: 'test', S3_SECRET_KEY: 'test', S3_BUCKET: `t${Date.now()}` }]);
  for (const [d, extra] of runs) {
    const r = spawnSync(process.execPath, [new URL(import.meta.url).pathname], { stdio: 'inherit', env: { ...process.env, __DRIVER: d, STORAGE_DRIVER: d, STORAGE_PATH: fs.mkdtempSync(path.join(os.tmpdir(), 'st-')), ...extra } });
    if (r.status) bad += 1;
  }
  process.exit(bad ? 1 : 0);
}

const require = createRequire(import.meta.url);
const st = require('../src/services/storage');
let ok = 0, fail = 0;
const t = async (name, fn) => { try { await fn(); ok += 1; } catch (e) { fail += 1; console.log(`  ✗ [${st.driver}] ${name}: ${e.message}`); } };
const eq = (a, b, m) => { if (a !== b) throw new Error(`${m || ''} esperado ${b}, veio ${a}`); };
const read = async (s) => { const c = []; for await (const x of s) c.push(x); return Buffer.concat(c); };

await st.init();
await t('put/stat/get (buffer)', async () => {
  const r = await st.put('communities/a.txt', Buffer.from('olá mundo'), { contentType: 'text/plain' });
  eq(r.size, 10); eq((await st.stat('communities/a.txt')).size, 10);
  eq((await read(await st.getStream('communities/a.txt'))).toString(), 'olá mundo');
});
await t('put (stream) e tamanho', async () => {
  const r = await st.put('datasets/b.bin', Readable.from([Buffer.alloc(1000, 1), Buffer.alloc(500, 2)]));
  eq(r.size, 1500); eq((await st.stat('datasets/b.bin')).size, 1500);
});
await t('putFile + downloadTo', async () => {
  const f = path.join(os.tmpdir(), `pf-${Date.now()}.txt`); fs.writeFileSync(f, 'arquivo local');
  const r = await st.putFile('articles/c.txt', f); eq(r.size, 13);
  const d = path.join(os.tmpdir(), `dl-${Date.now()}.txt`); await st.downloadTo('articles/c.txt', d);
  eq(fs.readFileSync(d, 'utf8'), 'arquivo local'); fs.rmSync(f); fs.rmSync(d);
});
await t('range', async () => {
  const b = (await read(await st.getStream('datasets/b.bin', { range: { start: 998, end: 1001 } })));
  eq(b.length, 4); eq(b[0], 1); eq(b[2], 2);
});
await t('maxBytes aborta stream e não deixa objeto', async () => {
  let err; try { await st.put('datasets/big.bin', Readable.from([Buffer.alloc(600), Buffer.alloc(600)]), { maxBytes: 1000 }); } catch (e) { err = e; }
  if (!err) throw new Error('deveria falhar'); eq(await st.exists('datasets/big.bin'), false);
});
await t('putFile maxBytes', async () => {
  const f = path.join(os.tmpdir(), `big-${Date.now()}`); fs.writeFileSync(f, Buffer.alloc(2000));
  let err; try { await st.putFile('datasets/big2.bin', f, { maxBytes: 1000 }); } catch (e) { err = e; } fs.rmSync(f);
  eq(err && err.code, 'STORAGE_TOO_LARGE');
});
await t('inexistente', async () => {
  eq(await st.stat('x/nao.txt'), null);
  let err; try { await st.getStream('x/nao.txt'); } catch (e) { err = e; } eq(err && err.code, 'STORAGE_NOT_FOUND');
});
await t('copy', async () => {
  const r = await st.copy('communities/a.txt', 'datasets/a-copia.txt'); eq(r.size, 10);
  eq((await read(await st.getStream('datasets/a-copia.txt'))).toString(), 'olá mundo');
});
await t('list por prefixo', async () => {
  const l = await st.list('datasets/'); const keys = l.map((x) => x.key).sort();
  eq(keys.join(','), 'datasets/a-copia.txt,datasets/b.bin');
  eq(l.reduce((s, x) => s + x.size, 0), 1510);
});
await t('chave inválida', async () => {
  for (const k of ['../x', 'a/../../b', '', '/']) { let e1; try { await st.put(k, Buffer.from('x')); } catch (e) { e1 = e; } if (!e1) throw new Error(`aceitou "${k}"`); }
});
await t('remove e removePrefix', async () => {
  await st.remove('communities/a.txt'); eq(await st.exists('communities/a.txt'), false);
  await st.remove('communities/a.txt'); // idempotente
  const n = await st.removePrefix('datasets/'); eq(n, 2); eq((await st.list('datasets/')).length, 0);
});
await t('presign', async () => {
  await st.put('communities/p.txt', Buffer.from('p'));
  const u = await st.presignGet('communities/p.txt', { filename: 'p.txt' });
  if (st.driver === 's3') { if (!/^https?:\/\//.test(u)) throw new Error('url inválida'); } else eq(u, null);
});
await st.removePrefix('');
console.log(`[${st.driver}] ${ok} ok, ${fail} falhas`);
process.exit(fail ? 1 : 0);
