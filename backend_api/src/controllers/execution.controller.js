'use strict';

const { v4: uuidv4 } = require('uuid');
const db = require('../config/db.config');
const jobService = require('../services/job.service');
const R = require('../utils/response');

async function resolveWorkflow(uuid) {
  const [rows] = await db.query('SELECT * FROM workflows WHERE uuid = ? AND deleted_at IS NULL', [uuid]);
  return rows[0] || null;
}

async function resolveExecution(uuid) {
  const [rows] = await db.query('SELECT * FROM executions WHERE uuid = ?', [uuid]);
  return rows[0] || null;
}

function inferShape(arr) {
  const dims = [];
  let cur = arr;
  while (Array.isArray(cur)) { dims.push(cur.length); cur = cur[0]; }
  return dims;
}

// GET /workflows/:wid/executions
async function listExecutions(req, res) {
  try {
    const workflow = await resolveWorkflow(req.params.wid);
    if (!workflow) return R.notFound(res, 'Workflow');

    const { status } = req.query;
    const conditions = ['e.workflow_id = ?'];
    const params = [workflow.id];
    if (status) { conditions.push('e.status = ?'); params.push(status); }

    const where = conditions.join(' AND ');
    const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total FROM executions e WHERE ${where}`, params);
    const { offset, limit, meta } = R.paginate(req, total);

    const [rows] = await db.query(
      `SELECT e.uuid, e.status, e.started_at, e.finished_at, e.triggered_by,
              e.parameters_override, e.created_at
       FROM executions e WHERE ${where} ORDER BY e.created_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    );
    return R.ok(res, rows, { ...meta, total });
  } catch (err) { return R.serverError(res, err); }
}

// Núcleo de dispatch de um workflow — decompõe os nós em jobs (um por nó, na
// ordem topológica) e enfileira no worker Python. Extraído de dispatchExecution
// para ser reaproveitado por quem precisa disparar um workflow programaticamente
// (ex: a "operação rápida" de dataset em datasetOperation.controller.js, que
// monta um workflow de 1 nó só e dispara pelo mesmíssimo caminho do editor
// visual — nenhuma operação sobre dataset foge de virar um workflow real).
//
// O worker Python processa um job por vez com o schema JobPayload:
//   { job_id, execution_id, node_id, slug, inputs, params }
// Por isso o backend decompõe o workflow em N jobs — um por nó —
// na ordem topológica (nós sem arestas de entrada primeiro).
// O worker executa cada job independentemente; a orquestração de
// dependências é resolvida aqui no momento do dispatch.
async function dispatchExecutionCore(workflow, user, { parameters_override = {}, dataset_bindings = {} } = {}) {
  // Carrega nós e arestas
  const [nodes] = await db.query(
    `SELECT wn.id, wn.node_key, wn.parameters, t.slug AS technique_slug
     FROM workflow_nodes wn
     JOIN techniques t ON t.id = wn.technique_id
     WHERE wn.workflow_id = ?`,
    [workflow.id],
  );
  if (nodes.length === 0) {
    const err = new Error('O workflow não possui nós.');
    err.validation = [{ field: 'workflow', message: err.message }];
    throw err;
  }
  const [edges] = await db.query(
    'SELECT source_node_key, target_node_key FROM workflow_edges WHERE workflow_id = ?',
    [workflow.id],
  );

  // Ordena topologicamente (Kahn)
  const inDegree = Object.fromEntries(nodes.map((n) => [n.node_key, 0]));
  for (const e of edges) { inDegree[e.target_node_key] = (inDegree[e.target_node_key] || 0) + 1; }
  const queue = nodes.filter((n) => inDegree[n.node_key] === 0).map((n) => n.node_key);
  const sorted = [];
  while (queue.length) {
    const key = queue.shift();
    sorted.push(key);
    for (const e of edges) {
      if (e.source_node_key === key) {
        inDegree[e.target_node_key] -= 1;
        if (inDegree[e.target_node_key] === 0) queue.push(e.target_node_key);
      }
    }
  }
  if (sorted.length !== nodes.length) {
    const err = new Error('Ciclo detectado no workflow.');
    err.validation = [{ field: 'workflow', message: err.message }];
    throw err;
  }

  const execUuid = uuidv4();
  const [execResult] = await db.query(
    `INSERT INTO executions
       (uuid, workflow_id, user_id, status, parameters_override, triggered_by, created_at, updated_at)
     VALUES (?, ?, ?, 'queued', ?, 'user', NOW(), NOW())`,
    [execUuid, workflow.id, user.id, JSON.stringify(parameters_override)],
  );
  const executionId = execResult.insertId;

  // Cria execution_nodes e enfileira um job por nó na ordem topológica
  const nodeMap = Object.fromEntries(nodes.map((n) => [n.node_key, n]));
  const jobUuids = [];
  for (const nodeKey of sorted) {
    const node = nodeMap[nodeKey];
    // node.parameters é uma coluna JSON: o mysql2 já entrega um objeto JS
    // (não uma string) na maioria dos casos, mas tratamos ambos por segurança.
    let storedParams = {};
    if (node.parameters) {
      storedParams = typeof node.parameters === 'string' ? JSON.parse(node.parameters) : node.parameters;
    }
    const nodeParams = {
      ...storedParams,
      ...(parameters_override[nodeKey] || {}),
    };
    const inputs = dataset_bindings[nodeKey] || {};

    // Registra nó de execução com status pending
    const [enResult] = await db.query(
      `INSERT INTO execution_nodes (execution_id, workflow_node_id, status, created_at, updated_at)
       VALUES (?, ?, 'pending', NOW(), NOW())`,
      [executionId, node.id],
    );

    const { uuid: jobUuid } = await jobService.createJob({
      job_type: 'execute_node',
      user_id: user.id,
      execution_id: executionId,
      workflow_id: workflow.id,
      payload: {
        // Campos obrigatórios do JobPayload do worker Python
        execution_id: execUuid,
        node_id: nodeKey,
        slug: node.technique_slug,
        inputs,
        params: nodeParams,
        // Metadados extras para rastreabilidade
        execution_node_id: enResult.insertId,
        workflow_uuid: workflow.uuid,
      },
    });
    jobUuids.push(jobUuid);
  }

  return { execution_id: execUuid, execution_db_id: executionId, job_ids: jobUuids };
}

// POST /workflows/:wid/executions
async function dispatchExecution(req, res) {
  try {
    const workflow = await resolveWorkflow(req.params.wid);
    if (!workflow) return R.notFound(res, 'Workflow');
    if (workflow.user_id !== req.user.id && req.user.role !== 'admin') return R.forbidden(res);

    const { parameters_override = {}, dataset_bindings = {} } = req.body;
    const result = await dispatchExecutionCore(workflow, req.user, { parameters_override, dataset_bindings });
    return R.accepted(res, { execution_id: result.execution_id, job_ids: result.job_ids });
  } catch (err) {
    if (err.validation) return R.unprocessable(res, err.validation);
    return R.serverError(res, err);
  }
}

// GET /executions/:id
async function getExecution(req, res) {
  try {
    const execution = await resolveExecution(req.params.id);
    if (!execution) return R.notFound(res, 'Execução');
    if (execution.user_id !== req.user.id && req.user.role !== 'admin') return R.forbidden(res);

    // Inclui nós de execução
    const [nodes] = await db.query(
      `SELECT en.*, wn.node_key, wn.name AS node_name, t.slug AS technique_slug
       FROM execution_nodes en
       JOIN workflow_nodes wn ON wn.id = en.workflow_node_id
       JOIN techniques t ON t.id = wn.technique_id
       WHERE en.execution_id = ?
       ORDER BY en.started_at ASC`,
      [execution.id],
    );

    return R.ok(res, { ...execution, nodes });
  } catch (err) { return R.serverError(res, err); }
}

// POST /executions/:id/cancel
async function cancelExecution(req, res) {
  try {
    const execution = await resolveExecution(req.params.id);
    if (!execution) return R.notFound(res, 'Execução');
    if (execution.user_id !== req.user.id && req.user.role !== 'admin') return R.forbidden(res);

    if (!['queued', 'running'].includes(execution.status)) {
      return R.unprocessable(res, [{ field: 'status', message: `Não é possível cancelar uma execução com status "${execution.status}".` }]);
    }

    await db.query(
      "UPDATE executions SET status = 'cancelled', finished_at = NOW(), updated_at = NOW() WHERE id = ?",
      [execution.id],
    );

    // Publica cancelamento via Redis para o worker Python
    await jobService.createJob({
      job_type: 'cancel_execution',
      user_id: req.user.id,
      execution_id: execution.id,
      payload: { execution_uuid: execution.uuid },
    });

    const [rows] = await db.query('SELECT * FROM executions WHERE id = ?', [execution.id]);
    return R.ok(res, rows[0]);
  } catch (err) { return R.serverError(res, err); }
}

// GET /executions/:id/nodes
async function listExecutionNodes(req, res) {
  try {
    const execution = await resolveExecution(req.params.id);
    if (!execution) return R.notFound(res, 'Execução');
    if (execution.user_id !== req.user.id && req.user.role !== 'admin') return R.forbidden(res);

    const [rows] = await db.query(
      `SELECT en.*, wn.node_key, wn.name AS node_name, t.slug AS technique_slug,
              t.name AS technique_name
       FROM execution_nodes en
       JOIN workflow_nodes wn ON wn.id = en.workflow_node_id
       JOIN techniques t ON t.id = wn.technique_id
       WHERE en.execution_id = ?
       ORDER BY en.started_at ASC`,
      [execution.id],
    );
    return R.ok(res, rows);
  } catch (err) { return R.serverError(res, err); }
}

// GET /executions/:id/nodes/:nid
async function getExecutionNode(req, res) {
  try {
    const execution = await resolveExecution(req.params.id);
    if (!execution) return R.notFound(res, 'Execução');
    if (execution.user_id !== req.user.id && req.user.role !== 'admin') return R.forbidden(res);

    const [rows] = await db.query(
      `SELECT en.*, wn.node_key, wn.name AS node_name, t.slug AS technique_slug,
              t.name AS technique_name, t.output_schema
       FROM execution_nodes en
       JOIN workflow_nodes wn ON wn.id = en.workflow_node_id
       JOIN techniques t ON t.id = wn.technique_id
       WHERE en.id = ? AND en.execution_id = ?`,
      [req.params.nid, execution.id],
    );
    if (!rows.length) return R.notFound(res, 'Nó de execução');
    return R.ok(res, rows[0]);
  } catch (err) { return R.serverError(res, err); }
}

// POST /executions/:id/nodes/:nid/outputs/:port
//
// "Promove" uma porta de saída de um nó já executado para um dataset
// nomeado de verdade — o fluxo que permite, por exemplo, pegar os 3 outputs
// de um kennard_stone (train/validation/test) e salvar cada um com o nome
// que o usuário escolher, em vez de um dataset derivado automático com nome
// genérico (ver docs/workflow.md "Dataset derivado" — isto é a variante
// explícita/nomeada desse mesmo conceito, usada pelo editor de workflow).
//
// Linhagem (dataset_lineage): só é gravada quando o chamador informa
// `source_dataset_id` explicitamente no body, porque rastrear automaticamente
// "qual dataset alimentou este nó" exigiria caminhar o grafo de
// workflow_edges + dataset_bindings da execução (que não ficam persistidos
// hoje) — não é feito de forma confiável aqui ainda. Sem source_dataset_id,
// o dataset é criado normalmente, só sem o registro de linhagem.
async function saveNodeOutputAsDataset(req, res) {
  try {
    const execution = await resolveExecution(req.params.id);
    if (!execution) return R.notFound(res, 'Execução');
    if (execution.user_id !== req.user.id && req.user.role !== 'admin') return R.forbidden(res);

    const { nid: nodeKey, port } = req.params;
    const { name, description, source_dataset_id } = req.body;
    if (!name || !String(name).trim()) {
      return R.unprocessable(res, [{ field: 'name', message: 'Dê um nome ao dataset.' }]);
    }

    const [enRows] = await db.query(
      `SELECT en.*, wn.id AS workflow_node_id, wn.workflow_id, wn.parameters AS node_parameters,
              t.slug AS technique_slug, t.name AS technique_name
       FROM execution_nodes en
       JOIN workflow_nodes wn ON wn.id = en.workflow_node_id
       JOIN techniques t ON t.id = wn.technique_id
       WHERE en.execution_id = ? AND wn.node_key = ?`,
      [execution.id, nodeKey],
    );
    if (!enRows.length) return R.notFound(res, 'Nó de execução');
    const en = enRows[0];

    if (en.status !== 'completed') {
      return R.unprocessable(res, [
        { field: 'status', message: `O nó "${nodeKey}" ainda não concluiu com sucesso (status atual: "${en.status}").` },
      ]);
    }

    const outputData = typeof en.output_data === 'string' ? JSON.parse(en.output_data || '{}') : (en.output_data || {});
    if (!(port in outputData)) {
      return R.notFound(res, `Porta de saída "${port}" (portas disponíveis: ${Object.keys(outputData).join(', ') || 'nenhuma'})`);
    }
    const value = outputData[port];
    if (!Array.isArray(value)) {
      return R.unprocessable(res, [
        { field: 'port', message: `A porta "${port}" não é um array numérico (tipo recebido: ${typeof value}) — não pode virar um dataset.` },
      ]);
    }

    const dims = inferShape(value);
    const nodeParams = typeof en.node_parameters === 'string' ? JSON.parse(en.node_parameters || '{}') : (en.node_parameters || {});
    const newUuid = uuidv4();
    const metadata = {
      import_method: 'workflow_output',
      source_technique: en.technique_slug,
      source_node_key: nodeKey,
      source_port: port,
      source_params: nodeParams,
      data: { tensor: value },
    };

    const [insertResult] = await db.query(
      `INSERT INTO datasets
         (uuid, user_id, name, description, visibility, data_type, dimensions,
          storage_path, metadata, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'private', 'tensor', ?, NULL, ?, NOW(), NOW())`,
      [
        newUuid, req.user.id, name.trim(),
        description || `Gerado por "${en.technique_name}" (porta "${port}") na execução ${execution.uuid}.`,
        JSON.stringify(dims), JSON.stringify(metadata),
      ],
    );
    const newDatasetId = insertResult.insertId;
    await db.query('UPDATE users SET stat_datasets = stat_datasets + 1 WHERE id = ?', [req.user.id]);

    if (source_dataset_id) {
      const [srcRows] = await db.query('SELECT id FROM datasets WHERE uuid = ? AND deleted_at IS NULL', [source_dataset_id]);
      if (srcRows.length) {
        await db.query(
          `INSERT INTO dataset_lineage
             (source_dataset_id, target_dataset_id, operation, parameters, workflow_id, workflow_node_id, execution_id, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
          [srcRows[0].id, newDatasetId, en.technique_slug, JSON.stringify(nodeParams), en.workflow_id, en.workflow_node_id, execution.id],
        );
      }
    }

    const [rows] = await db.query('SELECT * FROM datasets WHERE id = ?', [newDatasetId]);
    return R.created(res, rows[0]);
  } catch (err) { return R.serverError(res, err); }
}

// GET /executions/:id/logs
async function getExecutionLogs(req, res) {
  try {
    const execution = await resolveExecution(req.params.id);
    if (!execution) return R.notFound(res, 'Execução');
    if (execution.user_id !== req.user.id && req.user.role !== 'admin') return R.forbidden(res);

    const [rows] = await db.query(
      `SELECT en.id, en.status, en.logs, en.error_message, en.started_at, en.finished_at,
              wn.node_key, wn.name AS node_name
       FROM execution_nodes en
       JOIN workflow_nodes wn ON wn.id = en.workflow_node_id
       WHERE en.execution_id = ?
       ORDER BY en.started_at ASC`,
      [execution.id],
    );
    return R.ok(res, rows);
  } catch (err) { return R.serverError(res, err); }
}

module.exports = {
  listExecutions, dispatchExecution, getExecution, cancelExecution,
  listExecutionNodes, getExecutionNode, getExecutionLogs, saveNodeOutputAsDataset,
  dispatchExecutionCore, resolveWorkflow,
};
