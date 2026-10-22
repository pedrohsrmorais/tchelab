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
const storageCfg = require('../config/storage.config');
const storage = require('./storage');
const quota = require('./quota.service');

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

/**
 * Enfileira a conversão de um item (arquivo já gravado no storage em `communities/<storedName>`).
 * O LibreOffice precisa de arquivos locais: baixa o original para uma pasta temporária, converte e envia o PDF
 * de volta. O PDF conta na cota de quem enviou o arquivo (`payerId`); se não couber, a prévia é descartada
 * (o arquivo original continua disponível para download).
 */
function enqueuePreview(itemId, storedName, payerId) {
  chain = chain.then(async () => {
    const work = fs.mkdtempSync(path.join(storageCfg.tmp, 'prev-'));
    const src = path.join(work, storedName);
    const pdfName = `${path.parse(storedName).name}.pdf`;
    const pdfLocal = path.join(work, pdfName);
    const pdfKey = `communities/${pdfName}`;
    try {
      await storage.downloadTo(`communities/${storedName}`, src);
      await convert(src, work);
      if (!fs.existsSync(pdfLocal)) throw new Error('PDF não gerado');
      const size = fs.statSync(pdfLocal).size;
      await quota.guard(payerId, size, async () => {
        await storage.putFile(pdfKey, pdfLocal, { contentType: 'application/pdf' });
        await db.query("UPDATE community_items SET preview_path = ?, preview_status = 'ready' WHERE id = ?", [pdfName, itemId]);
        return { kind: 'community_preview', refType: 'community_item', refId: itemId, key: pdfKey, size };
      });
    } catch (err) {
      console.warn(`[preview] item ${itemId}: ${err.message}`);
      await storage.remove(pdfKey).catch(() => {});
      await db.query("UPDATE community_items SET preview_status = 'failed' WHERE id = ?", [itemId]).catch(() => {});
    } finally { fs.rm(work, { recursive: true, force: true }, () => {}); }
  }).catch(() => {});
}

module.exports = { isOfficeFile, enqueuePreview };
