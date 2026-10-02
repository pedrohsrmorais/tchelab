import client from './client';

const get  = (url, params) => client.get(url, { params });
const post = (url, data)   => client.post(url, data);
const put  = (url, data)   => client.put(url, data);
const patch= (url, data)   => client.patch(url, data);
const del  = (url)         => client.delete(url);

export const api = {
  auth: {
    login:          (d)    => post('/auth/login', d),
    register:       (d)    => post('/auth/register', d),
    logout:         ()     => post('/auth/logout'),
    me:             ()     => get('/auth/me'),
    forgotPassword: (d)    => post('/auth/forgot-password', d),
  },

  user: {
    update:         (d)    => put('/users/me', d),
    changePassword: (d)    => patch('/users/me/password', d),
  },

  projects: {
    list:           (p)    => get('/projects', p),
    create:         (d)    => post('/projects', d),
    get:            (id)   => get(`/projects/${id}`),
    update:         (id,d) => put(`/projects/${id}`, d),
    delete:         (id)   => del(`/projects/${id}`),
    listDatasets:   (id)   => get(`/projects/${id}/datasets`),
    addDataset:     (id,dsId) => post(`/projects/${id}/datasets`, { dataset_uuid: dsId }),
    removeDataset:  (id,dsId) => del(`/projects/${id}/datasets/${dsId}`),
    listWorkflows:  (id)   => get(`/projects/${id}/workflows`),
    addWorkflow:    (id,wId)  => post(`/projects/${id}/workflows`, { workflow_uuid: wId }),
    listMembers:    (id)   => get(`/projects/${id}/members`),
    addMember:      (id,d) => post(`/projects/${id}/members`, d),
    history:        (id)   => get(`/projects/${id}/history`),
  },

  communities: {
    listMine:       (p)    => get('/communities/mine', p),
    listPublic:     (p)    => get('/communities', p),
    create:         (d)    => post('/communities', d),
    get:            (id)   => get(`/communities/${id}`),
    update:         (id,d) => put(`/communities/${id}`, d),
    delete:         (id)   => del(`/communities/${id}`),
    listMembers:    (id)   => get(`/communities/${id}/members`),
    addMember:      (id,d) => post(`/communities/${id}/members`, d),
    removeMember:   (id,uid) => del(`/communities/${id}/members/${uid}`),
    linkProject:    (id,pId) => post(`/communities/${id}/projects`, { project_uuid: pId }),
    listMessages:   (id,p) => get(`/communities/${id}/messages`, p),
    sendMessage:    (id,d) => post(`/communities/${id}/messages`, d),
  },

  datasets: {
    list:           (p)    => get('/datasets', p),
    create:         (d)    => post('/datasets', d),
    import:         (fd)   => client.post('/datasets/import', fd, { headers: { 'Content-Type': 'multipart/form-data' } }),
    get:            (id)   => get(`/datasets/${id}`),
    update:         (id,d) => put(`/datasets/${id}`, d),
    delete:         (id)   => del(`/datasets/${id}`),
    lineage:        (id)   => get(`/datasets/${id}/lineage`),
    preview:        (id)   => get(`/datasets/${id}/preview`),
  },

  workflows: {
    list:           (p)    => get('/workflows', p),
    templates:      ()     => get('/workflows/templates'),
    create:         (d)    => post('/workflows', d),
    get:            (id)   => get(`/workflows/${id}`),
    update:         (id,d) => put(`/workflows/${id}`, d),
    delete:         (id)   => del(`/workflows/${id}`),
    fork:           (id)   => post(`/workflows/${id}/fork`),
    snapshot:       (id)   => post(`/workflows/${id}/snapshots`),
    versions:       (id)   => get(`/workflows/${id}/versions`),
    nodes:          (id)   => get(`/workflows/${id}/nodes`),
    addNode:        (id,d) => post(`/workflows/${id}/nodes`, d),
    edges:          (id)   => get(`/workflows/${id}/edges`),
    addEdge:        (id,d) => post(`/workflows/${id}/edges`, d),
    validate:       (id)   => get(`/workflows/${id}/validate`),
    executions:     (id)   => get(`/workflows/${id}/executions`),
    dispatch:       (id,d) => post(`/workflows/${id}/execute`, d),
  },

  articles: {
    list:           (p)    => get('/articles', p),
    create:         (d)    => post('/articles', d),
    upload:         (fd)   => client.post('/articles/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } }),
    get:            (id)   => get(`/articles/${id}`),
    analyze:        (id)   => post(`/articles/${id}/analyze`),
    delete:         (id)   => del(`/articles/${id}`),
  },

  analyses: {
    list:           (p)    => get('/analyses', p),
    create:         (d)    => post('/analyses', d),
    get:            (id)   => get(`/analyses/${id}`),
    delete:         (id)   => del(`/analyses/${id}`),
  },

  techniques: {
    list:           ()     => get('/techniques'),
    get:            (id)   => get(`/techniques/${id}`),
  },

  executions: {
    list:           (p)    => get('/executions', p),
    get:            (id)   => get(`/executions/${id}`),
    logs:           (id)   => get(`/executions/${id}/logs`),
    cancel:         (id)   => post(`/executions/${id}/cancel`),
  },

  models: {
    list:           (p)    => get('/models', p),
    get:            (id)   => get(`/models/${id}`),
    delete:         (id)   => del(`/models/${id}`),
  },

  predictions: {
    list:           (p)    => get('/predictions', p),
    create:         (d)    => post('/predictions', d),
    get:            (id)   => get(`/predictions/${id}`),
  },

  jobs: {
    list:           (p)    => get('/jobs', p),
    get:            (id)   => get(`/jobs/${id}`),
    cancel:         (id)   => post(`/jobs/${id}/cancel`),
    retry:          (id)   => post(`/jobs/${id}/retry`),
  },

  ai: {
    ask:            (d)    => post('/ai/ask', d),
    recommend:      (d)    => post('/ai/recommend', d),
    explain:        (d)    => post('/ai/explain', d),
    interpret:      (d)    => post('/ai/interpret', d),
  },

  synthetic: {
    generate:       (d)    => post('/synthetic/generate', d),
    list:           ()     => get('/synthetic'),
  },

  audit: {
    list:           (p)    => get('/audit-logs', p),
    get:            (id)   => get(`/audit-logs/${id}`),
  },

  admin: {
    stats:          ()     => get('/admin/stats'),
  },
};
