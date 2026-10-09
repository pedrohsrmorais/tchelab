/**
 * api/index.js — ponto único de chamadas HTTP do TcheLab
 * Todas as rotas da aplicação passam por este arquivo.
 * NÃO criar um index.js separado por rota.
 */
import client from './client';

const get   = (url, params) => client.get(url, { params });
const post  = (url, data)   => client.post(url, data);
const put   = (url, data)   => client.put(url, data);
const patch = (url, data)   => client.patch(url, data);
const del   = (url)         => client.delete(url);

export const api = {

  // ── Auth ──────────────────────────────────────────────────────────────────
  auth: {
    login:           (d)       => post('/auth/login', d),
    register:        (d)       => post('/auth/register', d),
    logout:          ()        => post('/auth/logout'),
    me:              ()        => get('/auth/me'),
    forgotPassword:  (d)       => post('/auth/forgot-password', d),
  },

  // ── User ──────────────────────────────────────────────────────────────────
  user: {
    update:          (d)       => put('/users/me', d),
    changePassword:  (d)       => patch('/users/me/password', d),
  },

  // ── Projects ──────────────────────────────────────────────────────────────
  projects: {
    list:            (p)       => get('/projects', p),
    create:          (d)       => post('/projects', d),
    get:             (id)      => get(`/projects/${id}`),
    update:          (id, d)   => put(`/projects/${id}`, d),
    delete:          (id)      => del(`/projects/${id}`),

    listMembers:     (id)      => get(`/projects/${id}/members`),
    addMember:       (id, d)   => post(`/projects/${id}/members`, d),
    updateMember:    (id, uid, d) => put(`/projects/${id}/members/${uid}`, d),
    removeMember:    (id, uid) => del(`/projects/${id}/members/${uid}`),

    listDatasets:    (id)      => get(`/projects/${id}/datasets`),
    // Body: { dataset_id, purpose }
    addDataset:      (id, dsId, purpose) => post(`/projects/${id}/datasets`, { dataset_id: dsId, purpose: purpose || 'other' }),
    updateDataset:   (id, dsId, d) => put(`/projects/${id}/datasets/${dsId}`, d),
    removeDataset:   (id, dsId) => del(`/projects/${id}/datasets/${dsId}`),

    listWorkflows:   (id)      => get(`/projects/${id}/workflows`),
    // Body: { workflow_id }
    addWorkflow:     (id, wId) => post(`/projects/${id}/workflows`, { workflow_id: wId }),
    removeWorkflow:  (id, wId) => del(`/projects/${id}/workflows/${wId}`),

    listArticles:    (id)      => get(`/projects/${id}/articles`),
    // Body: { article_id }
    addArticle:      (id, aId) => post(`/projects/${id}/articles`, { article_id: aId }),
    removeArticle:   (id, aId) => del(`/projects/${id}/articles/${aId}`),

    history:         (id, p)   => get(`/projects/${id}/history`, p),
  },

  // ── Communities ──────────────────────────────────────────────────────────
  communities: {
    list:            (p)       => get('/communities', p),
    listMine:        (p)       => get('/communities/mine', p),
    create:          (d)       => post('/communities', d),
    get:             (id)      => get(`/communities/${id}`),
    update:          (id, d)   => put(`/communities/${id}`, d),
    delete:          (id)      => del(`/communities/${id}`),

    listMembers:     (id)      => get(`/communities/${id}/members`),
    addMember:       (id, d)   => post(`/communities/${id}/members`, d),
    removeMember:    (id, uid) => del(`/communities/${id}/members/${uid}`),

    // Body: { project_id }
    linkProject:     (id, pId) => post(`/communities/${id}/projects`, { project_id: pId }),
    listProjects:    (id)      => get(`/communities/${id}/projects`),
    // Body: { dataset_id }
    shareDataset:    (id, dsId) => post(`/communities/${id}/datasets`, { dataset_id: dsId }),
    // Body: { workflow_id }
    shareWorkflow:   (id, wId) => post(`/communities/${id}/workflows`, { workflow_id: wId }),

    listMessages:    (id, p)   => get(`/communities/${id}/messages`, p),
    sendMessage:     (id, d)   => post(`/communities/${id}/messages`, d),
  },

  // ── Datasets ─────────────────────────────────────────────────────────────
  datasets: {
    list:            (p)       => get('/datasets', p),
    create:          (d)       => post('/datasets', d),
    import:          (fd)      => client.post('/datasets/import', fd, { headers: { 'Content-Type': 'multipart/form-data' } }),
    get:             (id)      => get(`/datasets/${id}`),
    update:          (id, d)   => put(`/datasets/${id}`, d),
    delete:          (id)      => del(`/datasets/${id}`),
    lineage:         (id)      => get(`/datasets/${id}/lineage`),
    preview:         (id)      => get(`/datasets/${id}/preview`),
  },

  // ── Workflows ─────────────────────────────────────────────────────────────
  workflows: {
    list:            (p)       => get('/workflows', p),
    templates:       ()        => get('/workflows/templates'),
    create:          (d)       => post('/workflows', d),
    get:             (id)      => get(`/workflows/${id}`),
    update:          (id, d)   => put(`/workflows/${id}`, d),
    delete:          (id)      => del(`/workflows/${id}`),
    fork:            (id)      => post(`/workflows/${id}/fork`),
    snapshot:        (id)      => post(`/workflows/${id}/snapshots`),
    versions:        (id)      => get(`/workflows/${id}/versions`),

    nodes:           (id)      => get(`/workflows/${id}/nodes`),
    addNode:         (id, d)   => post(`/workflows/${id}/nodes`, d),
    updateNode:      (id, nid, d) => put(`/workflows/${id}/nodes/${nid}`, d),
    deleteNode:      (id, nid) => del(`/workflows/${id}/nodes/${nid}`),

    edges:           (id)      => get(`/workflows/${id}/edges`),
    addEdge:         (id, d)   => post(`/workflows/${id}/edges`, d),
    deleteEdge:      (id, eid) => del(`/workflows/${id}/edges/${eid}`),

    validate:        (id)      => get(`/workflows/${id}/validate`),
    executions:      (id, p)   => get(`/workflows/${id}/executions`, p),
    dispatch:        (id, d)   => post(`/workflows/${id}/executions`, d),
  },

  // ── Articles ──────────────────────────────────────────────────────────────
  articles: {
    list:            (p)       => get('/articles', p),
    create:          (d)       => post('/articles', d),
    upload:          (fd)      => client.post('/articles/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } }),
    get:             (id)      => get(`/articles/${id}`),
    analyze:         (id)      => post(`/articles/${id}/analyze`),
    delete:          (id)      => del(`/articles/${id}`),
  },

  // ── Article Analyses ──────────────────────────────────────────────────────
  analyses: {
    list:            (p)       => get('/analyses', p),
    create:          (d)       => post('/analyses', d),
    get:             (id)      => get(`/analyses/${id}`),
    delete:          (id)      => del(`/analyses/${id}`),
  },

  // ── Techniques ───────────────────────────────────────────────────────────
  techniques: {
    list:            (p)       => get('/techniques', p),
    categories:      ()        => get('/techniques/categories'),
    get:             (id)      => get(`/techniques/${id}`),
    compatibilities: (id)      => get(`/techniques/${id}/compatibilities`),
    create:          (d)       => post('/techniques', d),
    update:          (id, d)   => put(`/techniques/${id}`, d),
    delete:          (id)      => del(`/techniques/${id}`),
  },

  // ── Executions ────────────────────────────────────────────────────────────
  executions: {
    get:             (id)      => get(`/executions/${id}`),
    cancel:          (id)      => post(`/executions/${id}/cancel`),
    nodes:           (id)      => get(`/executions/${id}/nodes`),
    getNode:         (id, nid) => get(`/executions/${id}/nodes/${nid}`),
    logs:            (id)      => get(`/executions/${id}/logs`),
  },

  // ── Models ────────────────────────────────────────────────────────────────
  models: {
    list:            (p)       => get('/models', p),
    get:             (id)      => get(`/models/${id}`),
    delete:          (id)      => del(`/models/${id}`),
    metrics:         (id)      => get(`/models/${id}/metrics`),
  },

  // ── Predictions ───────────────────────────────────────────────────────────
  predictions: {
    list:            (p)       => get('/predictions', p),
    create:          (d)       => post('/predictions', d),
    get:             (id)      => get(`/predictions/${id}`),
  },

  // ── Jobs ─────────────────────────────────────────────────────────────────
  jobs: {
    list:            (p)       => get('/jobs', p),
    get:             (id)      => get(`/jobs/${id}`),
    cancel:          (id)      => post(`/jobs/${id}/cancel`),
    retry:           (id)      => post(`/jobs/${id}/retry`),
    adminList:       (p)       => get('/jobs/admin', p),
  },

  // ── AI ────────────────────────────────────────────────────────────────────
  ai: {
    ask:             (d)       => post('/ai/ask', d),
    recommend:       (d)       => post('/ai/recommend', d),
    explain:         (d)       => post('/ai/explain', d),
    interpret:       (d)       => post('/ai/interpret', d),
  },

  // ── Synthetic datasets ────────────────────────────────────────────────────
  synthetic: {
    list:            ()        => get('/synthetic'),
    generate:        (d)       => post('/synthetic/generate', d),
  },

  // ── Audit ─────────────────────────────────────────────────────────────────
  audit: {
    list:            (p)       => get('/audit-logs', p),
    get:             (id)      => get(`/audit-logs/${id}`),
  },

  // ── Admin ─────────────────────────────────────────────────────────────────
  admin: {
    stats:           ()        => get('/admin/stats'),
  },

  // ── Metrics ───────────────────────────────────────────────────────────────
  metrics: {
    list:            (p)       => get('/metrics', p),
    get:             (id)      => get(`/metrics/${id}`),
  },

  // ── Execution comparisons ─────────────────────────────────────────────────
  comparisons: {
    list:            (p)       => get('/comparisons', p),
    create:          (d)       => post('/comparisons', d),
    get:             (id)      => get(`/comparisons/${id}`),
    delete:          (id)      => del(`/comparisons/${id}`),
  },
};
