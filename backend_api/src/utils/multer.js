'use strict';

const multer = require('multer');
const path = require('path');
const storage = require('../config/storage.config');

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
  limits: { fileSize: 2 * 1024 * 1024 * 1024 }, // 2 GB
});

// Upload de PDF (artigos)
const pdfUpload = multer({
  storage: tmpStorage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
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
    destination: (_req, _file, cb) => cb(null, storage.avatars),
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
    destination: (_req, _file, cb) => cb(null, storage.communities),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase().replace(/[^.a-z0-9]/g, '').slice(0, 8);
      cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${ext}`);
    },
  }),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB
  fileFilter(_req, file, cb) {
    if (!COMMUNITY_MIME.has(file.mimetype)) {
      return cb(new Error('Tipo de arquivo não permitido (use PDF, imagem, documento Office, CSV, TXT ou ZIP).'));
    }
    return cb(null, true);
  },
});

module.exports = { datasetUpload, pdfUpload, avatarUpload, communityUpload };
