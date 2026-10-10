'use strict';

const { Router } = require('express');
const { authenticate, authorize } = require('../middlewares/auth.middleware');
const { datasetUpload, pdfUpload, avatarUpload } = require('../utils/multer');

// Controllers
const authCtrl            = require('../controllers/auth.controller');
const userCtrl            = require('../controllers/user.controller');
const communityCtrl       = require('../controllers/community.controller');
const projectCtrl         = require('../controllers/project.controller');
const spectrumCtrl        = require('../controllers/spectrum.controller');
const collectionCtrl      = require('../controllers/collection.controller');
const datasetCtrl         = require('../controllers/dataset.controller');
const datasetOperationCtrl = require('../controllers/datasetOperation.controller');
const articleCtrl         = require('../controllers/article.controller');
const articleAnalysisCtrl = require('../controllers/articleAnalysis.controller');
const techniqueCtrl       = require('../controllers/technique.controller');
const workflowCtrl        = require('../controllers/workflow.controller');
const workflowNodeCtrl    = require('../controllers/workflowNode.controller');
const workflowEdgeCtrl    = require('../controllers/workflowEdge.controller');
const executionCtrl       = require('../controllers/execution.controller');
const modelCtrl           = require('../controllers/model.controller');
const predictionCtrl      = require('../controllers/prediction.controller');
const metricCtrl          = require('../controllers/metric.controller');
const comparisonCtrl      = require('../controllers/executionComparison.controller');
const syntheticCtrl       = require('../controllers/synthetic.controller');
const jobCtrl             = require('../controllers/job.controller');
const aiCtrl              = require('../controllers/aiInteraction.controller');
const auditCtrl           = require('../controllers/audit.controller');

const router = Router();

// ─── AUTH ──────────────────────────────────────────────────────────────────────
router.post('/auth/register',           authCtrl.register);
router.post('/auth/login',              authCtrl.login);
router.post('/auth/logout',             authenticate, authCtrl.logout);
router.post('/auth/refresh',            authCtrl.refresh);
router.post('/auth/forgot-password',    authCtrl.forgotPassword);
router.post('/auth/reset-password',     authCtrl.resetPassword);
router.get ('/auth/me',                 authenticate, authCtrl.me);

// ─── USERS ─────────────────────────────────────────────────────────────────────
router.get   ('/users/:id',             authenticate, userCtrl.getUser);
router.put   ('/users/:id',             authenticate, userCtrl.updateUser);
router.post  ('/users/:id/avatar',      authenticate, avatarUpload.single('avatar'), userCtrl.uploadAvatar);
router.get   ('/users/:id/stats',       authenticate, userCtrl.getStats);
router.delete('/users/:id',             authenticate, userCtrl.deleteUser);

// ─── COMMUNITIES ───────────────────────────────────────────────────────────────
router.get   ('/communities',                                   authenticate, communityCtrl.listMyCommunities);
router.get   ('/communities/public',                            authenticate, communityCtrl.listPublicCommunities);
router.post  ('/communities',                                   authenticate, communityCtrl.createCommunity);
router.get   ('/communities/:id',                               authenticate, communityCtrl.getCommunity);
router.put   ('/communities/:id',                               authenticate, communityCtrl.updateCommunity);
router.delete('/communities/:id',                               authenticate, communityCtrl.deleteCommunity);
// Members
router.get   ('/communities/:id/members',                       authenticate, communityCtrl.listMembers);
router.post  ('/communities/:id/members',                       authenticate, communityCtrl.addMember);
router.put   ('/communities/:id/members/:uid',                  authenticate, communityCtrl.updateMemberRole);
router.delete('/communities/:id/members/:uid',                  authenticate, communityCtrl.removeMember);
// Projects
router.get   ('/communities/:id/projects',                      authenticate, communityCtrl.listCommunityProjects);
router.post  ('/communities/:id/projects',                      authenticate, communityCtrl.linkProject);
router.delete('/communities/:id/projects/:pid',                 authenticate, communityCtrl.unlinkProject);
// Datasets
router.get   ('/communities/:id/datasets',                      authenticate, communityCtrl.listCommunityDatasets);
router.post  ('/communities/:id/datasets',                      authenticate, communityCtrl.shareDataset);
router.delete('/communities/:id/datasets/:did',                 authenticate, communityCtrl.removeDatasetShare);
// Workflows
router.get   ('/communities/:id/workflows',                     authenticate, communityCtrl.listCommunityWorkflows);
router.post  ('/communities/:id/workflows',                     authenticate, communityCtrl.shareWorkflow);
router.delete('/communities/:id/workflows/:wid',                authenticate, communityCtrl.removeWorkflowShare);
// Messages
router.get   ('/communities/:id/messages',                      authenticate, communityCtrl.listMessages);
router.post  ('/communities/:id/messages',                      authenticate, communityCtrl.sendMessage);
router.delete('/communities/:id/messages/:mid',                 authenticate, communityCtrl.deleteMessage);

// ─── PROJECTS ──────────────────────────────────────────────────────────────────
router.get   ('/projects',                                      authenticate, projectCtrl.listProjects);
router.post  ('/projects',                                      authenticate, projectCtrl.createProject);
router.get   ('/projects/:id',                                  authenticate, projectCtrl.getProject);
router.put   ('/projects/:id',                                  authenticate, projectCtrl.updateProject);
router.delete('/projects/:id',                                  authenticate, projectCtrl.deleteProject);
// Members
router.get   ('/projects/:id/members',                          authenticate, projectCtrl.listProjectMembers);
router.post  ('/projects/:id/members',                          authenticate, projectCtrl.addProjectMember);
router.put   ('/projects/:id/members/:uid',                     authenticate, projectCtrl.updateProjectMemberRole);
router.delete('/projects/:id/members/:uid',                     authenticate, projectCtrl.removeProjectMember);
// Datasets
router.get   ('/projects/:id/datasets',                         authenticate, projectCtrl.listProjectDatasets);
router.post  ('/projects/:id/datasets',                         authenticate, projectCtrl.addDatasetToProject);
router.put   ('/projects/:id/datasets/:did',                    authenticate, projectCtrl.updateDatasetPurpose);
router.delete('/projects/:id/datasets/:did',                    authenticate, projectCtrl.removeDatasetFromProject);
// Workflows
router.get   ('/projects/:id/workflows',                        authenticate, projectCtrl.listProjectWorkflows);
router.post  ('/projects/:id/workflows',                        authenticate, projectCtrl.addWorkflowToProject);
router.delete('/projects/:id/workflows/:wid',                   authenticate, projectCtrl.removeWorkflowFromProject);
// Articles
router.get   ('/projects/:id/articles',                         authenticate, projectCtrl.listProjectArticles);
router.post  ('/projects/:id/articles',                         authenticate, projectCtrl.addArticleToProject);
router.delete('/projects/:id/articles/:aid',                    authenticate, projectCtrl.removeArticleFromProject);
// History
router.get   ('/projects/:id/history',                          authenticate, projectCtrl.getProjectHistory);

// ─── SPECTRA ───────────────────────────────────────────────────────────────────
router.get   ('/spectra',                                       authenticate, spectrumCtrl.listSpectra);
router.post  ('/spectra',                                       authenticate, spectrumCtrl.createSpectrum);
router.post  ('/spectra/batch',                                 authenticate, spectrumCtrl.batchImport);
router.get   ('/spectra/:id',                                   authenticate, spectrumCtrl.getSpectrum);
router.put   ('/spectra/:id',                                   authenticate, spectrumCtrl.updateSpectrum);
router.delete('/spectra/:id',                                   authenticate, spectrumCtrl.deleteSpectrum);
router.get   ('/spectra/:id/plot',                              authenticate, spectrumCtrl.getPlotData);

// ─── COLLECTIONS ───────────────────────────────────────────────────────────────
router.get   ('/collections',                                   authenticate, collectionCtrl.listCollections);
router.post  ('/collections',                                   authenticate, collectionCtrl.createCollection);
router.get   ('/collections/:id',                               authenticate, collectionCtrl.getCollection);
router.put   ('/collections/:id',                               authenticate, collectionCtrl.updateCollection);
router.delete('/collections/:id',                               authenticate, collectionCtrl.deleteCollection);
router.get   ('/collections/:id/spectra',                       authenticate, collectionCtrl.listCollectionSpectra);
router.post  ('/collections/:id/spectra',                       authenticate, collectionCtrl.addSpectraToCollection);
router.delete('/collections/:id/spectra/:sid',                  authenticate, collectionCtrl.removeSpectrumFromCollection);

// ─── DATASETS ──────────────────────────────────────────────────────────────────
router.get   ('/datasets',                                      authenticate, datasetCtrl.listDatasets);
router.post  ('/datasets',                                      authenticate, datasetCtrl.createDataset);
router.post  ('/datasets/import',                               authenticate, datasetUpload.single('file'), datasetCtrl.smartImport);
router.get   ('/datasets/:id',                                  authenticate, datasetCtrl.getDataset);
router.put   ('/datasets/:id',                                  authenticate, datasetCtrl.updateDataset);
router.delete('/datasets/:id',                                  authenticate, datasetCtrl.deleteDataset);
router.get   ('/datasets/:id/lineage',                          authenticate, datasetCtrl.getLineage);
router.get   ('/datasets/:id/slice',                            authenticate, datasetCtrl.getSlice);
router.get   ('/datasets/:id/preview',                          authenticate, datasetCtrl.getPreview);
router.post  ('/datasets/:id/spectra',                          authenticate, datasetCtrl.addSpectraToDataset);
router.get   ('/datasets/:id/spectra',                          authenticate, datasetCtrl.listDatasetSpectra);

// Operação rápida sobre um dataset — instancia e dispara um workflow de 1 nó
router.post  ('/datasets/:id/operations',                       authenticate, datasetOperationCtrl.createQuickOperation);
router.get   ('/datasets/:id/operations',                       authenticate, datasetOperationCtrl.listOperations);
router.get   ('/operations/:id',                                authenticate, datasetOperationCtrl.getOperation);

// ─── ARTICLES ──────────────────────────────────────────────────────────────────
router.get   ('/articles',                                      authenticate, articleCtrl.listArticles);
router.post  ('/articles',                                      authenticate, articleCtrl.createArticle);
router.post  ('/articles/upload',                               authenticate, pdfUpload.single('pdf'), articleCtrl.uploadPDF);
router.get   ('/articles/:id',                                  authenticate, articleCtrl.getArticle);
router.put   ('/articles/:id',                                  authenticate, articleCtrl.updateArticle);
router.delete('/articles/:id',                                  authenticate, articleCtrl.deleteArticle);
router.post  ('/articles/:id/analyze',                          authenticate, articleCtrl.analyzeArticle);

// ─── ARTICLE ANALYSES ──────────────────────────────────────────────────────────
router.get   ('/article-analyses',                              authenticate, articleAnalysisCtrl.listAnalyses);
router.get   ('/article-analyses/:id',                          authenticate, articleAnalysisCtrl.getAnalysis);
router.get   ('/article-analyses/:id/techniques',               authenticate, articleAnalysisCtrl.getTechniques);
router.post  ('/article-analyses/:id/generate-workflow',        authenticate, articleAnalysisCtrl.generateWorkflow);
router.delete('/article-analyses/:id',                          authenticate, articleAnalysisCtrl.deleteAnalysis);

// ─── TECHNIQUES ────────────────────────────────────────────────────────────────
router.get   ('/techniques',                                    authenticate, techniqueCtrl.listTechniques);
router.get   ('/techniques/categories',                         authenticate, techniqueCtrl.listCategories);
router.get   ('/techniques/:id',                                authenticate, techniqueCtrl.getTechnique);
router.get   ('/techniques/:id/compatibilities',                authenticate, techniqueCtrl.getCompatibilities);
router.post  ('/techniques',                                    authenticate, techniqueCtrl.createCustomTechnique);
router.put   ('/techniques/:id',                                authenticate, techniqueCtrl.updateCustomTechnique);
router.delete('/techniques/:id',                                authenticate, techniqueCtrl.deleteCustomTechnique);

// ─── WORKFLOWS ─────────────────────────────────────────────────────────────────
router.get   ('/workflows',                                     authenticate, workflowCtrl.listWorkflows);
router.get   ('/workflows/templates',                           authenticate, workflowCtrl.listTemplates);
router.post  ('/workflows',                                     authenticate, workflowCtrl.createWorkflow);
router.get   ('/workflows/:id',                                 authenticate, workflowCtrl.getWorkflow);
router.put   ('/workflows/:id',                                 authenticate, workflowCtrl.updateWorkflow);
router.delete('/workflows/:id',                                 authenticate, workflowCtrl.deleteWorkflow);
router.post  ('/workflows/:id/fork',                            authenticate, workflowCtrl.forkWorkflow);
router.post  ('/workflows/:id/snapshot',                        authenticate, workflowCtrl.saveSnapshot);
router.get   ('/workflows/:id/versions',                        authenticate, workflowCtrl.listVersions);
router.get   ('/workflows/:id/versions/:vid',                   authenticate, workflowCtrl.getVersion);
router.post  ('/workflows/:id/versions/:vid/restore',           authenticate, workflowCtrl.restoreVersion);
router.put   ('/workflows/:id/template',                        authenticate, workflowCtrl.setTemplate);
// Nodes
router.get   ('/workflows/:wid/nodes',                          authenticate, workflowNodeCtrl.listNodes);
router.post  ('/workflows/:wid/nodes',                          authenticate, workflowNodeCtrl.addNode);
router.get   ('/workflows/:wid/nodes/:nid',                     authenticate, workflowNodeCtrl.getNode);
router.put   ('/workflows/:wid/nodes/:nid',                     authenticate, workflowNodeCtrl.updateNode);
router.delete('/workflows/:wid/nodes/:nid',                     authenticate, workflowNodeCtrl.deleteNode);
// Edges
router.get   ('/workflows/:wid/edges',                          authenticate, workflowEdgeCtrl.listEdges);
router.post  ('/workflows/:wid/edges',                          authenticate, workflowEdgeCtrl.createEdge);
router.delete('/workflows/:wid/edges/:eid',                     authenticate, workflowEdgeCtrl.deleteEdge);
router.post  ('/workflows/:wid/validate',                       authenticate, workflowEdgeCtrl.validateWorkflow);
// Executions (scoped to workflow)
router.get   ('/workflows/:wid/executions',                     authenticate, executionCtrl.listExecutions);
router.post  ('/workflows/:wid/executions',                     authenticate, executionCtrl.dispatchExecution);

// ─── EXECUTIONS ────────────────────────────────────────────────────────────────
router.get   ('/executions/:id',                                authenticate, executionCtrl.getExecution);
router.post  ('/executions/:id/cancel',                         authenticate, executionCtrl.cancelExecution);
router.get   ('/executions/:id/nodes',                          authenticate, executionCtrl.listExecutionNodes);
router.get   ('/executions/:id/nodes/:nid',                     authenticate, executionCtrl.getExecutionNode);
router.post  ('/executions/:id/nodes/:nid/outputs/:port',       authenticate, executionCtrl.saveNodeOutputAsDataset);
router.get   ('/executions/:id/logs',                           authenticate, executionCtrl.getExecutionLogs);
router.get   ('/executions/:id/metrics',                        authenticate, metricCtrl.getExecutionMetrics);
router.get   ('/executions/:id/nodes/:nid/metrics',             authenticate, metricCtrl.getNodeMetrics);

// ─── MODELS ────────────────────────────────────────────────────────────────────
router.get   ('/models',                                        authenticate, modelCtrl.listModels);
router.get   ('/models/:id',                                    authenticate, modelCtrl.getModel);
router.put   ('/models/:id',                                    authenticate, modelCtrl.updateModel);
router.delete('/models/:id',                                    authenticate, modelCtrl.deleteModel);
router.get   ('/models/:id/metrics',                            authenticate, modelCtrl.getModelMetrics);
router.post  ('/models/:id/export',                             authenticate, modelCtrl.exportModel);

// ─── PREDICTIONS ───────────────────────────────────────────────────────────────
router.get   ('/predictions',                                   authenticate, predictionCtrl.listPredictions);
router.post  ('/predictions',                                   authenticate, predictionCtrl.createPrediction);
router.get   ('/predictions/:id',                               authenticate, predictionCtrl.getPrediction);
router.get   ('/predictions/:id/results',                       authenticate, predictionCtrl.getPredictionResults);
router.delete('/predictions/:id',                               authenticate, predictionCtrl.deletePrediction);

// ─── METRICS (comparação cruzada) ──────────────────────────────────────────────
router.post  ('/metrics/compare',                               authenticate, metricCtrl.compareMetrics);

// ─── EXECUTION COMPARISONS ─────────────────────────────────────────────────────
router.get   ('/execution-comparisons',                         authenticate, comparisonCtrl.listComparisons);
router.post  ('/execution-comparisons',                         authenticate, comparisonCtrl.createComparison);
router.get   ('/execution-comparisons/:id',                     authenticate, comparisonCtrl.getComparison);
router.delete('/execution-comparisons/:id',                     authenticate, comparisonCtrl.deleteComparison);

// ─── SYNTHETIC DATASETS ────────────────────────────────────────────────────────
router.get   ('/synthetic-datasets',                            authenticate, syntheticCtrl.listSyntheticDatasets);
router.post  ('/synthetic-datasets',                            authenticate, syntheticCtrl.createSyntheticDataset);
router.get   ('/synthetic-datasets/:id',                        authenticate, syntheticCtrl.getSyntheticDataset);
router.delete('/synthetic-datasets/:id',                        authenticate, syntheticCtrl.deleteSyntheticDataset);

// ─── JOBS ──────────────────────────────────────────────────────────────────────
router.get   ('/jobs',                                          authenticate, jobCtrl.listJobs);
router.get   ('/jobs/admin',                                    authenticate, jobCtrl.listAllJobs);
router.get   ('/jobs/:id',                                      authenticate, jobCtrl.getJob);
router.post  ('/jobs/:id/cancel',                               authenticate, jobCtrl.cancelJob);
router.post  ('/jobs/:id/retry',                                authenticate, jobCtrl.retryJob);

// ─── AI INTERACTIONS ───────────────────────────────────────────────────────────
router.get   ('/ai-interactions',                               authenticate, aiCtrl.listInteractions);
router.post  ('/ai-interactions',                               authenticate, aiCtrl.createInteraction);
router.get   ('/ai-interactions/:id',                           authenticate, aiCtrl.getInteraction);
router.post  ('/ai-interactions/:id/feedback',                  authenticate, aiCtrl.submitFeedback);
router.delete('/ai-interactions/:id',                           authenticate, aiCtrl.deleteInteraction);

// ─── AUDIT & ADMIN ─────────────────────────────────────────────────────────────
router.get   ('/audit-logs',                                    authenticate, auditCtrl.listAuditLogs);
router.get   ('/audit-logs/:id',                                authenticate, auditCtrl.getAuditLog);
router.get   ('/audit-logs/resource/:type/:uuid',               authenticate, auditCtrl.getResourceAuditLogs);
router.get   ('/admin/stats',                                   authenticate, auditCtrl.getAdminStats);

module.exports = router;
