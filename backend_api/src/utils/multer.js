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

// Upload de avatar (imagem)
const avatarUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, storage.avatars),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname);
      cb(null, `avatar-${req.user.id}${ext}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter(_req, file, cb) {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Apenas imagens são aceitas para avatar.'));
    }
    return cb(null, true);
  },
});

module.exports = { datasetUpload, pdfUpload, avatarUpload };
