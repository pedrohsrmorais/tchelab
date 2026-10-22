'use strict';
/**
 * Pré-visualização de documentos Office (PPT/PPTX, DOC/DOCX, XLS/XLSX, ODP…):
 * converte para PDF com o LibreOffice (`soffice --headless`) em segundo plano.
 *
 * - Fila SERIAL: o LibreOffice não gosta de várias instâncias ao mesmo tempo.
 * - Se o `soffice` não existir (ou a conversão falhar/estourar o tempo), o item fica com
 *   preview_status = 'failed' e a interface cai de volta para "baixar o arquivo" — nada quebra.
 */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const db = require('../config/db.config');
const storage = require('../config/storage.config');

const OFFICE_EXT = new Set(['.ppt', '.pptx', '.pps', '.ppsx', '.odp', '.doc', '.docx', '.odt', '.rtf', '.xls', '.xlsx', '.ods']);
const TIMEOUT_MS = Number(process.env.OFFICE_PREVIEW_TIMEOUT_MS || 120000);
const SOFFICE = process.env.SOFFICE_BIN || 'soffice';

const isOfficeFile = (fileName) => OFFICE_EXT.has(path.extname(String(fileName || '')).toLowerCase());

let chain = Promise.resolve();

function convert(srcPath, outDir) {
  return new Promise((resolve, reject) => {
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'tl-soffice-'));
    const child = spawn(SOFFICE, [
      `-env:UserInstallation=file://${profile}`, '--headless', '--norestore', '--convert-to', 'pdf', '--outdir', outDir, srcPath,
    ], { stdio: 'ignore' });
    const done = (err) => {
      clearTimeout(timer);
      fs.rm(profile, { recursive: true, force: true }, () => {});
      return err ? reject(err) : resolve();
    };
    const timer = setTimeout(() => { child.kill('SIGKILL'); done(new Error('timeout')); }, TIMEOUT_MS);
    child.on('error', done);
    child.on('exit', (code) => done(code === 0 ? null : new Error(`soffice saiu com código ${code}`)));
  });
}

/** Enfileira a conversão de um item (arquivo já gravado em storage.communities). */
function enqueuePreview(itemId, storedName) {
  chain = chain.then(async () => {
    const src = path.join(storage.communities, storedName);
    const pdf = path.join(storage.communities, `${path.parse(storedName).name}.pdf`);
    try {
      await convert(src, storage.communities);
      if (!fs.existsSync(pdf)) throw new Error('PDF não gerado');
      await db.query("UPDATE community_items SET preview_path = ?, preview_status = 'ready' WHERE id = ?", [path.basename(pdf), itemId]);
    } catch (err) {
      console.warn(`[preview] item ${itemId}: ${err.message}`);
      await db.query("UPDATE community_items SET preview_status = 'failed' WHERE id = ?", [itemId]).catch(() => {});
    }
  }).catch(() => {});
}

module.exports = { isOfficeFile, enqueuePreview };
