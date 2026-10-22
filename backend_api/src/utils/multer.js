'use strict';

const multer = require('multer');
const path = require('path');
const storage = require('../config/storage.config');
const quota = require('../services/quota.service');
const R = require('./response');

// Todo upload chega primeiro numa pasta de trabalho LOCAL (storage.tmp): o controller então reserva a cota e só
// depois envia o arquivo ao storage (MinIO/S3 ou disco). O tamanho máximo REAL por arquivo vem do plano do usuário
// (ver uploadGuard e quota.guard); este teto só protege o disco local do backend.
const HARD_CAP = Number(process.env.UPLOAD_MAX_BYTES || 200 * 1024 * 1024);

/**
 * Antes de ler o corpo do upload: se o Content-Length já não cabe no plano/cota do usuário, recusa na hora (413),
 * sem gastar banda nem disco. É só uma checagem barata; a definitiva é a reserva atômica depois do upload.
 * Uso: router.post('/x', authenticate, uploadGuard, upload.single('f'), handler)
 */
async function uploadGuard(req, res, next) {
  try {
    const len = Number(req.headers['content-length'] || 0);
    // o corpo multipart tem algumas centenas de bytes de cabeçalhos além do arquivo
    if (len > 2048) await quota.precheck(req.user.id, len - 2048);
    return next();
  } catch (err) {
    if (quota.handleError(res, err)) return undefined;
    return R.serverError(res, err);
  }
}

const tmpStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, storage.tmp),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    cb(null, unique + path.extname(file.originalname));
  },
});

// Upload genérico (datasets, XLSX, CSV, NumPy, HDF5…)
const datasetUpload = multer({
  storage: tmpStorage,
  limits: { fileSize: HARD_CAP },
});

// Upload de PDF (artigos)
const pdfUpload = multer({
  storage: tmpStorage,
  limits: { fileSize: HARD_CAP },
  fileFilter(_req, file, cb) {
    if (file.mimetype !== 'application/pdf') {
      return cb(new Error('Apenas arquivos PDF são aceitos.'));
    }
    return cb(null, true);
  },
});

// Upload de avatar (imagem). Extensão derivada do MIME (nunca do nome enviado)
// e nome com uuid do usuário + timestamp (evita cache e path traversal).
const AVATAR_EXT = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/gif': '.gif' };
const avatarUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, storage.tmp),
    filename: (req, file, cb) => {
      const ext = AVATAR_EXT[file.mimetype] || '.png';
      cb(null, `avatar-${String(req.params.id).replace(/[^a-zA-Z0-9-]/g, '')}-${Date.now()}${ext}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter(_req, file, cb) {
    if (!AVATAR_EXT[file.mimetype]) {
      return cb(new Error('Use uma imagem PNG, JPG, WEBP ou GIF.'));
    }
    return cb(null, true);
  },
});

// Upload de materiais de comunidade (PDF, imagens, documentos, planilhas, zip)
const COMMUNITY_MIME = new Set([
  'application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/gif', 'text/plain', 'text/csv',
  'application/zip', 'application/x-zip-compressed',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
]);
const communityUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, storage.tmp),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase().replace(/[^.a-z0-9]/g, '').slice(0, 8);
      cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${ext}`);
    },
  }),
  limits: { fileSize: HARD_CAP },
  fileFilter(_req, file, cb) {
    if (!COMMUNITY_MIME.has(file.mimetype)) {
      return cb(new Error('Tipo de arquivo não permitido (use PDF, imagem, documento Office, CSV, TXT ou ZIP).'));
    }
    return cb(null, true);
  },
});

// Foto de equipamento: só JPEG/PNG/WebP (sem SVG, que poderia carregar script), até 5 MB.
const EQUIPMENT_EXT = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp' };
const equipmentImageUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, storage.tmp),
    filename: (_req, file, cb) => cb(null, `eq-${Date.now()}-${Math.random().toString(36).slice(2, 10)}${EQUIPMENT_EXT[file.mimetype] || '.bin'}`),
  }),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter(_req, file, cb) {
    if (!EQUIPMENT_EXT[file.mimetype]) return cb(new Error('Use uma imagem JPEG, PNG ou WebP.'));
    return cb(null, true);
  },
});

module.exports = { uploadGuard, datasetUpload, pdfUpload, avatarUpload, communityUpload, equipmentImageUpload };
