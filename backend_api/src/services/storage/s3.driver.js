'use strict';

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { pipeline } = require('stream/promises');
const {
  S3Client, HeadObjectCommand, GetObjectCommand, DeleteObjectCommand, DeleteObjectsCommand, ListObjectsV2Command,
  CopyObjectCommand, CreateBucketCommand, HeadBucketCommand, PutBucketLifecycleConfigurationCommand,
} = require('@aws-sdk/client-s3');
const { Upload } = require('@aws-sdk/lib-storage');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const BUCKET = process.env.S3_BUCKET || 'tchelab';
const client = new S3Client({
  region: process.env.S3_REGION || 'us-east-1',
  endpoint: process.env.S3_ENDPOINT || undefined,
  // MinIO exige endereçamento por caminho (http://host/bucket/chave); na AWS use S3_FORCE_PATH_STYLE=false
  forcePathStyle: String(process.env.S3_FORCE_PATH_STYLE ?? 'true') !== 'false',
  credentials: process.env.S3_ACCESS_KEY ? { accessKeyId: process.env.S3_ACCESS_KEY, secretAccessKey: process.env.S3_SECRET_KEY || '' } : undefined,
});

const notFound = (key) => { const E = require('./index').StorageNotFound; return new E(key); };
const isMissing = (e) => e && (e.name === 'NoSuchKey' || e.name === 'NotFound' || e.$metadata?.httpStatusCode === 404);

module.exports = {
  client, BUCKET,
  async init() {
    try { await client.send(new HeadBucketCommand({ Bucket: BUCKET })); }
    catch { await client.send(new CreateBucketCommand({ Bucket: BUCKET })); }
    // Arquivos temporários de upload: expiram em 1 dia, mesmo que o backend caia no meio do processo.
    try {
      await client.send(new PutBucketLifecycleConfigurationCommand({
        Bucket: BUCKET,
        LifecycleConfiguration: { Rules: [{ ID: 'expire-tmp', Status: 'Enabled', Filter: { Prefix: 'tmp/' }, Expiration: { Days: 1 } }] },
      }));
    } catch (e) { console.warn(`[storage] não foi possível aplicar o ciclo de vida de tmp/: ${e.name}`); }
  },
  async put(key, body, opts = {}) {
    let size = 0;
    const src = Buffer.isBuffer(body) || typeof body === 'string' ? Buffer.from(body) : body;
    if (!Buffer.isBuffer(src)) {
      src.on('data', (c) => {
        size += c.length;
        if (opts.maxBytes && size > opts.maxBytes) src.destroy(Object.assign(new Error('Arquivo maior que o permitido.'), { code: 'STORAGE_TOO_LARGE' }));
      });
    } else size = src.length;
    const up = new Upload({ client, params: { Bucket: BUCKET, Key: key, Body: src, ContentType: opts.contentType || 'application/octet-stream' }, queueSize: 2, partSize: 8 * 1024 * 1024 });
    try { await up.done(); } catch (e) { if (src.destroyed && src.errored) throw src.errored; throw e; }
    return { key, size };
  },
  async putFile(key, filePath, opts = {}) {
    const st = await fsp.stat(filePath);
    if (opts.maxBytes && st.size > opts.maxBytes) throw Object.assign(new Error('Arquivo maior que o permitido.'), { code: 'STORAGE_TOO_LARGE' });
    return module.exports.put(key, fs.createReadStream(filePath), opts);
  },
  async getStream(key, opts = {}) {
    try {
      const r = await client.send(new GetObjectCommand({ Bucket: BUCKET, Key: key, Range: opts.range ? `bytes=${opts.range.start}-${opts.range.end}` : undefined }));
      return r.Body;
    } catch (e) { if (isMissing(e)) throw notFound(key); throw e; }
  },
  async downloadTo(key, destPath) {
    const src = await module.exports.getStream(key);
    await fsp.mkdir(path.dirname(destPath), { recursive: true });
    await pipeline(src, fs.createWriteStream(destPath));
  },
  async stat(key) {
    try { const r = await client.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key })); return { size: Number(r.ContentLength) }; }
    catch (e) { if (isMissing(e)) return null; throw e; }
  },
  async remove(key) { await client.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key })); },
  async removePrefix(prefix) {
    let n = 0;
    for (const batch of await module.exports._batches(prefix)) {
      await client.send(new DeleteObjectsCommand({ Bucket: BUCKET, Delete: { Objects: batch.map((o) => ({ Key: o.key })), Quiet: true } }));
      n += batch.length;
    }
    return n;
  },
  async _batches(prefix) {
    const all = await module.exports.list(prefix); const out = [];
    for (let i = 0; i < all.length; i += 1000) out.push(all.slice(i, i + 1000));
    return out;
  },
  async list(prefix) {
    const out = []; let token;
    do {
      const r = await client.send(new ListObjectsV2Command({ Bucket: BUCKET, Prefix: prefix, ContinuationToken: token }));
      (r.Contents || []).forEach((o) => out.push({ key: o.Key, size: Number(o.Size), lastModified: o.LastModified }));
      token = r.IsTruncated ? r.NextContinuationToken : undefined;
    } while (token);
    return out;
  },
  async copy(fromKey, toKey) {
    try {
      await client.send(new CopyObjectCommand({ Bucket: BUCKET, Key: toKey, CopySource: `${BUCKET}/${encodeURI(fromKey)}` }));
    } catch (e) { if (isMissing(e)) throw notFound(fromKey); throw e; }
    const st = await module.exports.stat(toKey);
    return { key: toKey, size: st ? st.size : 0 };
  },
  async presignGet(key, opts = {}) {
    const cmd = new GetObjectCommand({
      Bucket: BUCKET, Key: key,
      ResponseContentDisposition: opts.filename ? `attachment; filename*=UTF-8''${encodeURIComponent(opts.filename)}` : undefined,
    });
    return getSignedUrl(client, cmd, { expiresIn: opts.expiresIn || 300 });
  },
  async capacity() {
    // S3/MinIO não informa o espaço livre: o admin declara a capacidade contratada/provisionada.
    const total = Number(process.env.S3_CAPACITY_BYTES || 0);
    return total ? { total, free: null } : null;
  },
};
