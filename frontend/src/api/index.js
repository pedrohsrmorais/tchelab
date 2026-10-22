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
const delb  = (url, data)   => client.delete(url, { data });

export const api = {

  // ── Quadro (gestão do lab) ────────────────────────────────────────────────
  boards: {
    list:        (cid, today)            => get(`/communities/${cid}/boards`, { today }),
    create:      (cid, d)                => post(`/communities/${cid}/boards`, d),
    mine:        (cid, today)            => get(`/communities/${cid}/boards/my-items`, { today }),
    get:         (cid, bid, rev)         => get(`/communities/${cid}/boards/${bid}`, rev ? { rev } : undefined),
    update:      (cid, bid, d)           => put(`/communities/${cid}/boards/${bid}`, d),
    remove:      (cid, bid)              => del(`/communities/${cid}/boards/${bid}`),
    createGroup: (cid, bid, d)           => post(`/communities/${cid}/boards/${bid}/groups`, d),
    updateGroup: (cid, bid, gid, d)      => put(`/communities/${cid}/boards/${bid}/groups/${gid}`, d),
    removeGroup: (cid, bid, gid, confirm) => delb(`/communities/${cid}/boards/${bid}/groups/${gid}`, { confirm }),
    reorderGroups:  (cid, bid, order)    => post(`/communities/${cid}/boards/${bid}/groups/reorder`, { order }),
    createColumn:   (cid, bid, d)        => post(`/communities/${cid}/boards/${bid}/columns`, d),
    updateColumn:   (cid, bid, col, d)   => put(`/communities/${cid}/boards/${bid}/columns/${col}`, d),
    removeColumn:   (cid, bid, col, confirm) => delb(`/communities/${cid}/boards/${bid}/columns/${col}`, { confirm }),
    reorderColumns: (cid, bid, order)    => post(`/communities/${cid}/boards/${bid}/columns/reorder`, { order }),
    createItem:  (cid, bid, d)           => post(`/communities/${cid}/boards/${bid}/items`, d),
    getItem:     (cid, bid, iid)         => get(`/communities/${cid}/boards/${bid}/items/${iid}`),
    updateItem:  (cid, bid, iid, d)      => put(`/communities/${cid}/boards/${bid}/items/${iid}`, d),
    removeItem:  (cid, bid, iid)         => del(`/communities/${cid}/boards/${bid}/items/${iid}`),
    moveItem:    (cid, bid, iid, d)      => post(`/communities/${cid}/boards/${bid}/items/${iid}/move`, d),
    duplicateItem: (cid, bid, iid)       => post(`/communities/${cid}/boards/${bid}/items/${iid}/duplicate`, {}),
    bulkItems:   (cid, bid, d)           => post(`/communities/${cid}/boards/${bid}/items/bulk`, d),
    setCell:     (cid, bid, iid, col, value) => put(`/communities/${cid}/boards/${bid}/items/${iid}/cells/${col}`, { value }),
    addComment:  (cid, bid, iid, body)   => post(`/communities/${cid}/boards/${bid}/items/${iid}/comments`, { body }),
    removeComment: (cid, bid, iid, cmid) => del(`/communities/${cid}/boards/${bid}/items/${iid}/comments/${cmid}`),
  },

  // ── Equipamentos (agendador) ──────────────────────────────────────────────
  equipment: {
    list:            (cid)            => get(`/communities/${cid}/equipment`),
    create:          (cid, d)         => post(`/communities/${cid}/equipment`, d),
    get:             (cid, eid)       => get(`/communities/${cid}/equipment/${eid}`),
    update:          (cid, eid, d)    => put(`/communities/${cid}/equipment/${eid}`, d),
    remove:          (cid, eid)       => del(`/communities/${cid}/equipment/${eid}`),
    rotateToken:     (cid, eid)       => post(`/communities/${cid}/equipment/${eid}/public-token`, {}),
    imageBlob:       (cid, eid)       => client.get(`/communities/${cid}/equipment/${eid}/image`, { responseType: 'blob' }),
    uploadImage:     (cid, eid, fd)   => client.post(`/communities/${cid}/equipment/${eid}/image`, fd, { headers: { 'Content-Type': 'multipart/form-data' } }),
    deleteImage:     (cid, eid)       => del(`/communities/${cid}/equipment/${eid}/image`),
    saveWindows:     (cid, eid, w)    => put(`/communities/${cid}/equipment/${eid}/windows`, { windows: w }),
    blocks:          (cid, eid)       => get(`/communities/${cid}/equipment/${eid}/blocks`),
    createBlock:     (cid, eid, d)    => post(`/communities/${cid}/equipment/${eid}/blocks`, d),
    deleteBlock:     (cid, eid, bid)  => del(`/communities/${cid}/equipment/${eid}/blocks/${bid}`),
    availability:    (cid, eid, from, to) => get(`/communities/${cid}/equipment/${eid}/availability`, { from, to }),
    bookings:        (cid, eid, p)    => get(`/communities/${cid}/equipment/${eid}/bookings`, p),
    mine:            (cid)            => get(`/communities/${cid}/equipment/bookings/mine`),
    book:            (cid, eid, d)    => post(`/communities/${cid}/equipment/${eid}/bookings`, d),
    act:             (cid, eid, bid, action, note) => post(`/communities/${cid}/equipment/${eid}/bookings/${bid}/${action}`, { note }),
  },

  // ── Página pública de equipamento (sem login) ─────────────────────────────
  publicEquipment: {
    get:             (token)          => get(`/public/equipment/${token}`),
    imageUrl:        (token, v)       => `${client.defaults.baseURL}/public/equipment/${token}/image${v ? `?v=${v}` : ''}`,
    availability:    (token, from, to) => get(`/public/equipment/${token}/availability`, { from, to }),
    book:            (token, d)       => post(`/public/equipment/${token}/bookings`, d),
    booking:         (mt)             => get(`/public/bookings/${mt}`),
    confirm:         (mt)             => post(`/public/bookings/${mt}/confirm`),
    cancel:          (mt)             => post(`/public/bookings/${mt}/cancel`),
  },

  // ── Auth ──────────────────────────────────────────────────────────────────
  auth: {
    login:           (d)       => post('/auth/login', d),
    register:        (d)       => post('/auth/register', d),
    logout:          ()        => post('/auth/logout'),
    me:              ()        => get('/auth/me'),
    forgotPassword:  (d)       => post('/auth/forgot-password', d),
    changePassword:  (d)       => post('/auth/change-password', d),
  },

  // ── User ──────────────────────────────────────────────────────────────────
  user: {
    // id = UUID do usuário (useAuthStore().user.uuid) ou 'me'
    get:             (id)      => get(`/users/${id}`),
    update:          (id, d)   => put(`/users/${id}`, d),
    uploadAvatar:    (id, fd)  => client.post(`/users/${id}/avatar`, fd, { headers: { 'Content-Type': 'multipart/form-data' } }),
    deleteAvatar:    (id)      => del(`/users/${id}/avatar`),
    stats:           (id)      => get(`/users/${id}/stats`),
    projects:        (id)      => get(`/users/${id}/projects`),
    communities:     (id)      => get(`/users/${id}/communities`),
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

    listDatasets:    (id, p)   => get(`/projects/${id}/datasets`, p),
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

    // Técnicas favoritas / próprias do projeto
    listTechniques:  (id)      => get(`/projects/${id}/techniques`),
    addTechnique:    (id, tId) => post(`/projects/${id}/techniques`, { technique_id: tId }),
    removeTechnique: (id, tId) => del(`/projects/${id}/techniques/${tId}`),
    // Comunidades onde o projeto está vinculado
    listCommunities: (id)      => get(`/projects/${id}/communities`),
  },

  // ── Communities ──────────────────────────────────────────────────────────
  // Papéis: owner > admin > moderator > member. Detalhes em community.controller.js
  communities: {
    list:            (p)       => get('/communities', p),           // as minhas
    listMine:        (p)       => get('/communities', p),           // alias
    listPublic:      (p)       => get('/communities/public', p),
    create:          (d)       => post('/communities', d),
    get:             (id)      => get(`/communities/${id}`),
    update:          (id, d)   => put(`/communities/${id}`, d),
    delete:          (id)      => del(`/communities/${id}`),
    join:            (id)      => post(`/communities/${id}/join`),  // comunidade pública
    leave:           (id)      => post(`/communities/${id}/leave`),
    transfer:        (id, uid) => post(`/communities/${id}/transfer`, { user_uuid: uid }),

    // Convites por código/link
    previewInvite:   (code)    => get(`/communities/invite/${code}`),
    joinWithCode:    (code)    => post('/communities/join', { code }),
    listInvites:     (id)      => get(`/communities/${id}/invites`),
    createInvite:    (id, d)   => post(`/communities/${id}/invites`, d),
    revokeInvite:    (id, iid) => del(`/communities/${id}/invites/${iid}`),

    // Membros
    listMembers:     (id)      => get(`/communities/${id}/members`),
    updateMember:    (id, uid, d) => put(`/communities/${id}/members/${uid}`, d),
    removeMember:    (id, uid, ban = false) => del(`/communities/${id}/members/${uid}${ban ? '?ban=1' : ''}`),
    listBans:        (id)      => get(`/communities/${id}/bans`),
    removeBan:       (id, uid) => del(`/communities/${id}/bans/${uid}`),

    // Projetos vinculados (access: 'read' | 'edit')
    listProjects:    (id)      => get(`/communities/${id}/projects`),
    linkProject:     (id, pId, access = 'read', sectionId = null) => post(`/communities/${id}/projects`, { project_id: pId, access, section_id: sectionId }),
    updateProjectLink: (id, pId, d) => put(`/communities/${id}/projects/${pId}`, d),
    unlinkProject:   (id, pId) => del(`/communities/${id}/projects/${pId}`),

    // Conteúdo estilo Moodle (tópicos, links, textos, PDFs)
    content:         (id)      => get(`/communities/${id}/content`),
    createSection:   (id, d)   => post(`/communities/${id}/sections`, d),
    updateSection:   (id, sid, d) => put(`/communities/${id}/sections/${sid}`, d),
    reorderSections: (id, order) => put(`/communities/${id}/sections-order`, { order }),
    deleteSection:   (id, sid) => del(`/communities/${id}/sections/${sid}`),
    createItem:      (id, d)   => d instanceof FormData
      ? client.post(`/communities/${id}/items`, d, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 0 })
      : post(`/communities/${id}/items`, d),
    updateItem:      (id, iid, d) => put(`/communities/${id}/items/${iid}`, d),
    reorderItems:    (id, sectionId, order) => put(`/communities/${id}/items-order`, { section_id: sectionId || null, order }),
    deleteItem:      (id, iid) => del(`/communities/${id}/items/${iid}`),
    // Arquivo protegido por login: baixa como blob (o <a href> direto não leva o token).
    // opts: { download: true } = original como anexo · { preview: true } = PDF convertido de PPT/DOC/XLS
    fileBlob:        (id, iid, opts = {}) => {
      const o = typeof opts === 'boolean' ? { download: opts } : opts;
      const qs = o.preview ? '?preview=1' : (o.download ? '?download=1' : '');
      return client.get(`/communities/${id}/items/${iid}/file${qs}`, { responseType: 'blob' });
    },

    // Datasets / workflows compartilhados (legado)
    shareDataset:    (id, dsId) => post(`/communities/${id}/datasets`, { dataset_id: dsId }),
    shareWorkflow:   (id, wId) => post(`/communities/${id}/workflows`, { workflow_id: wId }),

    // Chat
    listMessages:    (id, p)   => get(`/communities/${id}/messages`, p),
    sendMessage:     (id, d)   => post(`/communities/${id}/messages`, d),
    deleteMessage:   (id, mid) => del(`/communities/${id}/messages/${mid}`),
  },

  // ── Datasets ─────────────────────────────────────────────────────────────
  // ── Quizzes da comunidade ─────────────────────────────────────────────────
  quizzes: {
    list:            (cid)            => get(`/communities/${cid}/quizzes`),
    create:          (cid, d)         => post(`/communities/${cid}/quizzes`, d),
    get:             (cid, qid)       => get(`/communities/${cid}/quizzes/${qid}`),
    update:          (cid, qid, d)    => put(`/communities/${cid}/quizzes/${qid}`, d),
    remove:          (cid, qid)       => del(`/communities/${cid}/quizzes/${qid}`),
    saveQuestions:   (cid, qid, list, confirm) => put(`/communities/${cid}/quizzes/${qid}/questions`, { questions: list, ...(confirm ? { confirm: true } : {}) }),
    start:           (cid, qid, d)    => post(`/communities/${cid}/quizzes/${qid}/start`, d),
    answer:          (cid, qid, qn, d) => put(`/communities/${cid}/quizzes/${qid}/answers/${qn}`, d),
    submit:          (cid, qid)       => post(`/communities/${cid}/quizzes/${qid}/submit`),
    submissions:     (cid, qid)       => get(`/communities/${cid}/quizzes/${qid}/submissions`),
    submission:      (cid, qid, sid)  => get(`/communities/${cid}/quizzes/${qid}/submissions/${sid}`),
    grade:           (cid, qid, sid, d) => put(`/communities/${cid}/quizzes/${qid}/submissions/${sid}/grade`, d),
    reopen:          (cid, qid, sid)  => post(`/communities/${cid}/quizzes/${qid}/submissions/${sid}/reopen`),
  },

  datasets: {
    list:            (p)       => get('/datasets', p),
    create:          (d)       => post('/datasets', d),
    import:          (fd)      => client.post('/datasets/import', fd, { headers: { 'Content-Type': 'multipart/form-data' } }),
    // JSON path for pasted 3D/4D+ tensors (block-delimited paste): sends the
    // already-assembled nested-array tensor instead of a CSV file.
    importTensor:    (d)       => post('/datasets/import', d),
    get:             (id)      => get(`/datasets/${id}`),
    copy:            (id, d)   => post(`/datasets/${id}/copy`, d || {}),
    update:          (id, d)   => put(`/datasets/${id}`, d),
    delete:          (id)      => del(`/datasets/${id}`),
    lineage:         (id)      => get(`/datasets/${id}/lineage`),
    preview:         (id)      => get(`/datasets/${id}/preview`),

    // "Operação rápida" — instancia um workflow de 1 nó e dispara exatamente
    // pelo mesmo caminho que o editor visual, sem precisar abrir o editor.
    createOperation: (id, d)   => post(`/datasets/${id}/operations`, d),
    listOperations:  (id)      => get(`/datasets/${id}/operations`),
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
    snapshot:        (id, d)   => post(`/workflows/${id}/snapshot`, d),
    versions:        (id)      => get(`/workflows/${id}/versions`),

    nodes:           (id)      => get(`/workflows/${id}/nodes`),
    addNode:         (id, d)   => post(`/workflows/${id}/nodes`, d),
    updateNode:      (id, nid, d) => put(`/workflows/${id}/nodes/${nid}`, d),
    deleteNode:      (id, nid) => del(`/workflows/${id}/nodes/${nid}`),

    edges:           (id)      => get(`/workflows/${id}/edges`),
    addEdge:         (id, d)   => post(`/workflows/${id}/edges`, d),
    deleteEdge:      (id, eid) => del(`/workflows/${id}/edges/${eid}`),

    // Backend registra como POST (confirmado em workflowEdge.controller.js) — GET dava 404.
    validate:        (id)      => post(`/workflows/${id}/validate`),
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
    list:            (p)       => get('/article-analyses', p),
    get:             (id)      => get(`/article-analyses/${id}`),
    techniques:      (id)      => get(`/article-analyses/${id}/techniques`),
    generateWorkflow: (id)     => post(`/article-analyses/${id}/generate-workflow`),
    delete:          (id)      => del(`/article-analyses/${id}`),
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
    // "Promove" a porta de saída de um nó já executado para um dataset
    // nomeado de verdade. Body: { name, description?, source_dataset_id? }
    saveNodeOutput:  (id, nodeKey, port, d) => post(`/executions/${id}/nodes/${nodeKey}/outputs/${port}`, d),
  },

  // ── Dataset Operations (operação rápida) ───────────────────────────────────
  operations: {
    get:             (id)      => get(`/operations/${id}`),
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
    list:            (p)       => get('/synthetic-datasets', p),
    create:          (d)       => post('/synthetic-datasets', d),
    get:             (id)      => get(`/synthetic-datasets/${id}`),
    delete:          (id)      => del(`/synthetic-datasets/${id}`),
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
    list:            (p)       => get('/execution-comparisons', p),
    create:          (d)       => post('/execution-comparisons', d),
    get:             (id)      => get(`/execution-comparisons/${id}`),
    delete:          (id)      => del(`/execution-comparisons/${id}`),
  },
};
