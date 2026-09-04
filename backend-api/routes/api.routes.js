'use strict';

const { Router } = require('express');
const { authenticate, optionalAuth, requireRole } = require('../middlewares/auth.middleware');
const { ownResource } = require('../middlewares/user.middleware');

// ── Controllers ────────────────────────────────────────────────────────────
const authController        = require('../controllers/auth.controller');
const userController        = require('../controllers/user.controller');
const spectraController     = require('../controllers/spectra.controller');
const datasetController     = require('../controllers/dataset.controller');
const collectionController  = require('../controllers/collection.controller');
const modelController       = require('../controllers/model.controller');
const jobController         = require('../controllers/job.controller');
const predictionController  = require('../controllers/prediction.controller');

// ── Upload (espectros) ─────────────────────────────────────────────────────
const multer = require('multer');
const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 50 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    const allowed = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/csv',
      'text/plain',
    ];
    if (allowed.includes(file.mimetype) || file.originalname.match(/\.(xlsx|xls|csv)$/i)) {
      cb(null, true);
    } else {
      cb(new Error('Formato inválido. Envie xlsx, xls ou csv.'));
    }
  },
});

const router = Router();

// ══════════════════════════════════════════════════════════════════════════
// AUTH
// ══════════════════════════════════════════════════════════════════════════
router.post('/auth/register', authController.register);
router.post('/auth/login',    authController.login);
router.post('/auth/refresh',  authController.refresh);
router.post('/auth/logout',   authenticate, authController.logout);

// ══════════════════════════════════════════════════════════════════════════
// USERS
// ══════════════════════════════════════════════════════════════════════════
router.get   ('/users/me',          authenticate, userController.getMe);
router.patch ('/users/me',          authenticate, userController.updateMe);
router.patch ('/users/me/password', authenticate, userController.updatePassword);
router.delete('/users/me',          authenticate, userController.deleteMe);
router.get   ('/users/:id',                       userController.getUser);

// Admin
router.get   ('/admin/users',     authenticate, requireRole('admin'), userController.listUsers);
router.delete('/admin/users/:id', authenticate, requireRole('admin'), userController.deleteUser);

// ══════════════════════════════════════════════════════════════════════════
// SPECTRA
// Rotas estáticas (/mine, /scan, /import, /paste) antes de /:id
// ══════════════════════════════════════════════════════════════════════════
router.post('/spectra/scan',   authenticate, upload.single('file'), spectraController.scanFile);
router.post('/spectra/import', authenticate, upload.single('file'), spectraController.importFromFile);
router.post('/spectra/paste',  authenticate, spectraController.importFromPaste);

router.get ('/spectra/mine',   authenticate, spectraController.listMySpectra);
router.get ('/spectra',        optionalAuth, spectraController.listSpectra);
router.get ('/spectra/:id',    optionalAuth, spectraController.getSpectrum);

router.patch ('/spectra/:id',  authenticate, spectraController.updateSpectrum);
router.delete('/spectra/:id',  authenticate, spectraController.deleteSpectrum);

// ══════════════════════════════════════════════════════════════════════════
// COLLECTIONS
// Rotas estáticas (/mine) antes de /:id
// ══════════════════════════════════════════════════════════════════════════
router.post  ('/collections',                                authenticate,                             collectionController.createCollection);
router.get   ('/collections/mine',                           authenticate,                             collectionController.listMyCollections);
router.get   ('/collections',                                optionalAuth,                             collectionController.listCollections);
router.get   ('/collections/:id',                            optionalAuth,                             collectionController.getCollection);
router.get   ('/collections/:id/spectra',                    optionalAuth,                             collectionController.getCollectionSpectra);
router.post  ('/collections/:id/spectra',                    authenticate,                             collectionController.addSpectrumToCollection);
router.delete('/collections/:id/spectra/:spectrumId',        authenticate,                             collectionController.removeSpectrumFromCollection);
router.post  ('/collections/:id/export-dataset',             authenticate,                             collectionController.exportToDataset);
router.patch ('/collections/:id',                            authenticate, ownResource('collections'), collectionController.updateCollection);
router.delete('/collections/:id',                            authenticate, ownResource('collections'), collectionController.deleteCollection);

// ══════════════════════════════════════════════════════════════════════════
// DATASETS
// ══════════════════════════════════════════════════════════════════════════
router.post  ('/datasets',                         authenticate,                          datasetController.createDataset);
router.get   ('/datasets',                         optionalAuth,                          datasetController.listDatasets);
router.get   ('/datasets/:id',                     optionalAuth,                          datasetController.getDataset);
router.get   ('/datasets/:id/spectra',             optionalAuth,                          datasetController.getDatasetSpectra);
router.get   ('/datasets/:id/export',              optionalAuth,                          datasetController.exportDataset);
router.patch ('/datasets/:id',                     authenticate, ownResource('datasets'), datasetController.updateDataset);
router.delete('/datasets/:id',                     authenticate, ownResource('datasets'), datasetController.deleteDataset);

router.post  ('/datasets/:id/spectra',             authenticate, datasetController.addSpectrumToDataset);
router.delete('/datasets/:id/spectra/:spectrumId', authenticate, datasetController.removeSpectrumFromDataset);
router.patch ('/datasets/:id/spectra/roles',       authenticate, ownResource('datasets'), datasetController.updateSpectraRoles);

// ══════════════════════════════════════════════════════════════════════════
// MODELS
// ══════════════════════════════════════════════════════════════════════════
router.get   ('/models/mine',        authenticate,                        modelController.listMyModels);
router.get   ('/models/algorithms',                                        modelController.listAlgorithms);
router.post  ('/models/train',       authenticate,                        modelController.trainModel);
router.get   ('/models',             optionalAuth,                         modelController.listModels);
router.get   ('/models/:id',         optionalAuth,                         modelController.getModel);
router.post  ('/models/:id/retrain', authenticate, ownResource('models'), modelController.retrainModel);
router.patch ('/models/:id',         authenticate, ownResource('models'), modelController.updateModel);
router.delete('/models/:id',         authenticate, ownResource('models'), modelController.deleteModel);

// ══════════════════════════════════════════════════════════════════════════
// JOBS
// ══════════════════════════════════════════════════════════════════════════
router.get ('/jobs',             authenticate, jobController.listJobs);
router.get ('/jobs/:id',         authenticate, jobController.getJob);
router.get ('/jobs/:id/logs',    authenticate, jobController.getJobLogs);
router.post('/jobs/:id/cancel',  authenticate, jobController.cancelJob);
router.post('/jobs/:id/update',               jobController.workerUpdate);

// Admin
router.get('/admin/jobs', authenticate, requireRole('admin'), jobController.listAllJobs);

// ══════════════════════════════════════════════════════════════════════════
// PREDICTIONS
// ══════════════════════════════════════════════════════════════════════════
router.post  ('/predictions',     authenticate, predictionController.createPrediction);
router.get   ('/predictions',     authenticate, predictionController.listPredictions);
router.get   ('/predictions/:id', authenticate, predictionController.getPrediction);
router.delete('/predictions/:id', authenticate, predictionController.deletePrediction);

module.exports = router;