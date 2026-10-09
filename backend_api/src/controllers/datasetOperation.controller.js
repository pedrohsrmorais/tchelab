'use strict';

/**
 * "Operação rápida" sobre um dataset — o botão "Realizar operação matricial"
 * no DatasetDetailPage.
 *
 * Importante: isto NÃO é um atalho que ignora a infraestrutura de workflows.
 * Toda operação, por mais rápida que pareça na tela, instancia um
 * `workflows` de verdade (com 1 `workflow_nodes`) e dispara exatamente pelo
 * mesmo caminho (`execution.controller.js::dispatchExecutionCore`) que o
 * editor visual de workflows usa — então ela aparece na lista de workflows
 * do usuário, pode ser reaberta no editor, tem execução/jobs rastreáveis
 * etc. A única coisa "rápida" é a tela: o usuário escolhe uma técnica, dá um
 * nome pro workflow e manda executar, sem precisar abrir o editor de nós.
 */

const { v4: uuidv4 } = require('uuid');
const db = require('../config/db.config');
const R = require('../utils/response');
const executionCtrl = require('./execution.controller');

async function resolveDatasetRow(uuid) {
  const [rows] = await db.query('SELECT * FROM datasets WHERE uuid = ? AND deleted_at IS NULL', [uuid]);
  return rows[0] || null;
}

function parseJson(value, fallback = null) {
  if (value == null) return fallback;
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

// POST /datasets/:id/operations
async function createQuickOperation(req, res) {
  try {
    const dataset = await resolveDatasetRow(req.params.id);
    if (!dataset) return R.notFound(res, 'Dataset');
    if (dataset.user_id !== req.user.id && req.user.role !== 'admin') return R.forbidden(res);

    const {
      technique_id: techniqueUuid,
      params = {},
      workflow_name,
      save_mode = 'new_dataset',
      new_dataset_name,
      // Para técnicas de 2 entradas (soma, subtração, produto matricial...):
      // { B: { type: 'dataset', dataset_id: '<uuid>' } | { type: 'literal', value: <json> } }
      extra_inputs = {},
    } = req.body;

    const errors = [];
    if (!techniqueUuid) errors.push({ field: 'technique_id', message: 'Técnica é obrigatória.' });
    if (!workflow_name || !String(workflow_name).trim()) {
      errors.push({ field: 'workflow_name', message: 'Dê um nome ao workflow desta operação (ex: "Transformação teste 1").' });
    }
    if (!['new_dataset', 'in_place'].includes(save_mode)) {
      errors.push({ field: 'save_mode', message: 'save_mode deve ser "new_dataset" ou "in_place".' });
    }
    if (errors.length) return R.unprocessable(res, errors);

    const [techRows] = await db.query('SELECT * FROM techniques WHERE uuid = ? AND active = 1', [techniqueUuid]);
    if (!techRows.length) return R.notFound(res, 'Técnica');
    const technique = techRows[0];

    const meta = parseJson(dataset.metadata, {});
    const tensor = meta?.data?.tensor ?? meta?.data?.matrix ?? null;
    if (!tensor) {
      return R.unprocessable(res, [{ field: 'dataset', message: 'Este dataset não tem dados numéricos carregados para operar.' }]);
    }

    const dims = parseJson(dataset.dimensions, []);
    const ndim = Array.isArray(dims) ? dims.length : null;
    if (ndim != null) {
      if (technique.min_order != null && ndim < technique.min_order) {
        return R.unprocessable(res, [{ field: 'technique_id', message: `"${technique.name}" exige pelo menos ${technique.min_order} dimensão(ões); este dataset tem ${ndim}.` }]);
      }
      if (technique.max_order != null && ndim > technique.max_order) {
        return R.unprocessable(res, [{ field: 'technique_id', message: `"${technique.name}" aceita no máximo ${technique.max_order} dimensão(ões); este dataset tem ${ndim}.` }]);
      }
    }

    const inputSchema = parseJson(technique.input_schema, {});
    const inputKeys = Object.keys(inputSchema || {});
    const primaryKey = inputKeys.length ? inputKeys[0] : 'X';
    const extraKeys = inputKeys.slice(1); // ex: "B" em soma/subtração/produto_matricial

    // Resolve as entradas extras (quando a técnica precisa de mais de um
    // array, ex: A + B). Cada uma vem de outro dataset do usuário ou de um
    // valor literal (número ou array já pronto — ex: "somar 1 em tudo").
    const resolvedExtraInputs = {};
    if (extraKeys.length) {
      const missing = extraKeys.filter((k) => !extra_inputs[k]);
      if (missing.length) {
        return R.unprocessable(res, missing.map((k) => ({
          field: `extra_inputs.${k}`,
          message: `"${technique.name}" precisa de uma segunda entrada ("${k}") — escolha outro dataset ou informe um valor.`,
        })));
      }
      for (const key of extraKeys) {
        const spec = extra_inputs[key];
        if (spec.type === 'literal') {
          if (spec.value === undefined) {
            return R.unprocessable(res, [{ field: `extra_inputs.${key}`, message: 'Valor literal ausente.' }]);
          }
          resolvedExtraInputs[key] = spec.value;
        } else if (spec.type === 'dataset') {
          const otherDs = await resolveDatasetRow(spec.dataset_id);
          if (!otherDs) return R.notFound(res, `Dataset para "${key}"`);
          if (otherDs.user_id !== req.user.id && req.user.role !== 'admin') return R.forbidden(res);
          const otherMeta = parseJson(otherDs.metadata, {});
          const otherTensor = otherMeta?.data?.tensor ?? otherMeta?.data?.matrix ?? null;
          if (!otherTensor) {
            return R.unprocessable(res, [{ field: `extra_inputs.${key}`, message: `O dataset escolhido para "${key}" não tem dados numéricos.` }]);
          }
          resolvedExtraInputs[key] = otherTensor;
        } else {
          return R.unprocessable(res, [{ field: `extra_inputs.${key}`, message: 'type deve ser "dataset" ou "literal".' }]);
        }
      }
    }

    // 1) Workflow real (aparece em /workflows, pode ser reaberto no editor)
    const workflowUuid = uuidv4();
    const [wfResult] = await db.query(
      `INSERT INTO workflows (uuid, user_id, name, description, visibility, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'private', 'ready', NOW(), NOW())`,
      [
        workflowUuid,
        req.user.id,
        String(workflow_name).trim(),
        `Operação rápida: ${technique.name} sobre "${dataset.name}".`,
      ],
    );
    const workflowId = wfResult.insertId;

    // 2) Um único nó com a técnica escolhida
    await db.query(
      `INSERT INTO workflow_nodes (workflow_id, node_key, technique_id, name, parameters, position_x, position_y, created_at, updated_at)
       VALUES (?, 'op', ?, ?, ?, 0, 0, NOW(), NOW())`,
      [workflowId, technique.id, technique.name, JSON.stringify(params || {})],
    );

    // 3) Dispara exatamente como o editor visual dispararia, só que com o
    // dataset já "amarrado" como entrada do único nó (não tem edges a montar).
    const workflow = await executionCtrl.resolveWorkflow(workflowUuid);
    let dispatch;
    try {
      dispatch = await executionCtrl.dispatchExecutionCore(workflow, req.user, {
        dataset_bindings: { op: { [primaryKey]: tensor, ...resolvedExtraInputs } },
      });
    } catch (err) {
      if (err.validation) return R.unprocessable(res, err.validation);
      throw err;
    }

    // 4) Lembrete do que fazer com o dataset quando a execução terminar
    // (consumido por resultConsumer.service.js quando o resultado chegar).
    const opUuid = uuidv4();
    await db.query(
      `INSERT INTO dataset_operations
         (uuid, user_id, source_dataset_id, technique_id, workflow_id, execution_id,
          params, save_mode, new_dataset_name, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', NOW(), NOW())`,
      [
        opUuid, req.user.id, dataset.id, technique.id, workflowId, dispatch.execution_db_id,
        JSON.stringify(params || {}), save_mode, new_dataset_name || null,
      ],
    );

    return R.accepted(res, {
      operation_id: opUuid,
      workflow: { uuid: workflowUuid, name: String(workflow_name).trim() },
      execution_id: dispatch.execution_id,
    });
  } catch (err) { return R.serverError(res, err); }
}

// GET /datasets/:id/operations
async function listOperations(req, res) {
  try {
    const dataset = await resolveDatasetRow(req.params.id);
    if (!dataset) return R.notFound(res, 'Dataset');
    if (dataset.user_id !== req.user.id && req.user.role !== 'admin') return R.forbidden(res);

    const [rows] = await db.query(
      `SELECT do.uuid, do.save_mode, do.new_dataset_name, do.status, do.error_message, do.params,
              do.created_at, do.updated_at,
              t.slug AS technique_slug, t.name AS technique_name,
              w.uuid AS workflow_uuid, w.name AS workflow_name,
              e.uuid AS execution_uuid, e.status AS execution_status,
              od.uuid AS output_dataset_uuid, od.name AS output_dataset_name
       FROM dataset_operations do
       JOIN techniques t ON t.id = do.technique_id
       JOIN workflows w ON w.id = do.workflow_id
       JOIN executions e ON e.id = do.execution_id
       LEFT JOIN datasets od ON od.id = do.output_dataset_id
       WHERE do.source_dataset_id = ?
       ORDER BY do.created_at DESC`,
      [dataset.id],
    );
    return R.ok(res, rows);
  } catch (err) { return R.serverError(res, err); }
}

// GET /operations/:id  (uuid de dataset_operations) — usado pelo frontend pra fazer polling
async function getOperation(req, res) {
  try {
    const [rows] = await db.query(
      `SELECT do.uuid, do.save_mode, do.new_dataset_name, do.status, do.error_message, do.params,
              do.created_at, do.updated_at, do.user_id,
              t.slug AS technique_slug, t.name AS technique_name,
              w.uuid AS workflow_uuid, w.name AS workflow_name,
              e.uuid AS execution_uuid, e.status AS execution_status,
              sd.uuid AS source_dataset_uuid, sd.name AS source_dataset_name,
              od.uuid AS output_dataset_uuid, od.name AS output_dataset_name
       FROM dataset_operations do
       JOIN techniques t ON t.id = do.technique_id
       JOIN workflows w ON w.id = do.workflow_id
       JOIN executions e ON e.id = do.execution_id
       JOIN datasets sd ON sd.id = do.source_dataset_id
       LEFT JOIN datasets od ON od.id = do.output_dataset_id
       WHERE do.uuid = ?`,
      [req.params.id],
    );
    if (!rows.length) return R.notFound(res, 'Operação');
    if (rows[0].user_id !== req.user.id && req.user.role !== 'admin') return R.forbidden(res);
    const { user_id, ...op } = rows[0];
    return R.ok(res, op);
  } catch (err) { return R.serverError(res, err); }
}

module.exports = { createQuickOperation, listOperations, getOperation };
