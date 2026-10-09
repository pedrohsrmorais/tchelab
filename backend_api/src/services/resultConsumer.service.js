'use strict';

/**
 * Consumidor de resultados do worker Python.
 *
 * O worker publica cada `JobResult` (worker_api/schemas.py) num canal
 * Redis Pub/Sub (`RESULT_CHANNEL`, default "tchelab_resultados") depois de
 * rodar um job. Antes deste arquivo existir, nada no backend_api ouvia esse
 * canal — então `jobs`/`execution_nodes`/`executions` nunca saíam de
 * "queued"/"pending", mesmo quando o worker executava tudo com sucesso.
 *
 * Este serviço assina o canal, atualiza as três tabelas, e — quando a
 * execução pertence a uma "operação rápida" de dataset (dataset_operations)
 * — grava o resultado como novo dataset ou aplica no dataset existente.
 */

const { v4: uuidv4 } = require('uuid');
const db = require('../config/db.config');
const redis = require('../config/redis.config');

const RESULT_CHANNEL = process.env.RESULT_CHANNEL || 'tchelab_resultados';

let subscriber = null;

function inferShape(arr) {
  const dims = [];
  let cur = arr;
  while (Array.isArray(cur)) { dims.push(cur.length); cur = cur[0]; }
  return dims;
}

/** Escolhe a saída "principal" (array aninhado) de um dict de outputs do script. */
function pickPrimaryOutput(outputs) {
  if (!outputs || typeof outputs !== 'object') return null;
  const keys = Object.keys(outputs);
  if (!keys.length) return null;
  const arrayKey = keys.find((k) => Array.isArray(outputs[k]));
  return outputs[arrayKey ?? keys[0]];
}

async function handleResultMessage(raw) {
  let result;
  try { result = JSON.parse(raw); } catch (err) {
    console.error('[ResultConsumer] mensagem inválida no canal de resultados:', err.message);
    return;
  }

  const { job_id: jobUuid, execution_id: execUuid, node_id: nodeKey, status, outputs, error, duration_ms } = result;
  if (!jobUuid || !execUuid || !nodeKey) return;

  const isSuccess = status === 'success';

  try {
    await db.query(
      `UPDATE jobs SET status = ?, result = ?, error_message = ?, finished_at = NOW() WHERE uuid = ?`,
      [isSuccess ? 'done' : 'failed', outputs ? JSON.stringify(outputs) : null, error || null, jobUuid],
    );

    const [exRows] = await db.query('SELECT id FROM executions WHERE uuid = ?', [execUuid]);
    if (!exRows.length) return;
    const executionId = exRows[0].id;

    const [enRows] = await db.query(
      `SELECT en.id FROM execution_nodes en
       JOIN workflow_nodes wn ON wn.id = en.workflow_node_id
       WHERE en.execution_id = ? AND wn.node_key = ?`,
      [executionId, nodeKey],
    );
    if (!enRows.length) return;

    await db.query(
      `UPDATE execution_nodes
         SET status = ?, output_data = ?, runtime_ms = ?, error_message = ?,
             started_at = COALESCE(started_at, NOW()), finished_at = NOW(), updated_at = NOW()
       WHERE id = ?`,
      [
        isSuccess ? 'completed' : 'failed',
        outputs ? JSON.stringify(outputs) : null,
        duration_ms != null ? Math.round(duration_ms) : null,
        error || null,
        enRows[0].id,
      ],
    );

    // Só fecha a execução quando não sobra nenhum nó pending/running.
    const [[{ n: pending }]] = await db.query(
      `SELECT COUNT(*) AS n FROM execution_nodes WHERE execution_id = ? AND status IN ('pending','running')`,
      [executionId],
    );
    if (pending > 0) return;

    const [[{ n: failedCount }]] = await db.query(
      `SELECT COUNT(*) AS n FROM execution_nodes WHERE execution_id = ? AND status = 'failed'`,
      [executionId],
    );
    const executionStatus = failedCount > 0 ? 'failed' : 'completed';
    await db.query(
      `UPDATE executions SET status = ?, finished_at = NOW(), updated_at = NOW() WHERE id = ?`,
      [executionStatus, executionId],
    );

    await finalizeDatasetOperation(executionId, executionStatus);
  } catch (err) {
    console.error('[ResultConsumer] erro ao processar resultado:', err);
  }
}

/**
 * Se a execução que acabou de fechar pertence a uma dataset_operations
 * pendente (criada por datasetOperation.controller.js), grava o resultado
 * no dataset certo — novo dataset (padrão) ou sobrescrevendo o original.
 */
async function finalizeDatasetOperation(executionId, executionStatus) {
  const [opRows] = await db.query(
    `SELECT * FROM dataset_operations WHERE execution_id = ? AND status = 'pending'`,
    [executionId],
  );
  if (!opRows.length) return;
  const op = opRows[0];

  if (executionStatus === 'failed') {
    const [failedNodes] = await db.query(
      `SELECT error_message FROM execution_nodes WHERE execution_id = ? AND status = 'failed'`,
      [executionId],
    );
    const message = failedNodes.map((n) => n.error_message).filter(Boolean).join(' | ') || 'Falha na execução.';
    await db.query(
      `UPDATE dataset_operations SET status = 'failed', error_message = ?, updated_at = NOW() WHERE id = ?`,
      [message, op.id],
    );
    return;
  }

  const [nodes] = await db.query(
    `SELECT output_data FROM execution_nodes WHERE execution_id = ? ORDER BY id ASC`,
    [executionId],
  );
  const outputsRaw = nodes[0]?.output_data;
  const outputs = typeof outputsRaw === 'string' ? JSON.parse(outputsRaw) : outputsRaw;
  const tensor = pickPrimaryOutput(outputs);

  if (!tensor || !Array.isArray(tensor)) {
    await db.query(
      `UPDATE dataset_operations
         SET status = 'failed', error_message = 'A operação não retornou dados numéricos (array).', updated_at = NOW()
       WHERE id = ?`,
      [op.id],
    );
    return;
  }

  const dims = inferShape(tensor);
  const params = typeof op.params === 'string' ? JSON.parse(op.params) : (op.params || {});

  const [[sourceDs]] = await db.query('SELECT * FROM datasets WHERE id = ?', [op.source_dataset_id]);
  const [[technique]] = await db.query('SELECT slug, name FROM techniques WHERE id = ?', [op.technique_id]);
  const techName = technique?.name || 'Operação';
  const techSlug = technique?.slug || 'operation';

  if (op.save_mode === 'in_place') {
    const sourceMeta = typeof sourceDs.metadata === 'string' ? JSON.parse(sourceDs.metadata || '{}') : (sourceDs.metadata || {});
    const newMeta = {
      ...sourceMeta,
      data: { ...(sourceMeta.data || {}), tensor },
      last_operation: { technique: techSlug, params },
    };
    await db.query(
      `UPDATE datasets SET dimensions = ?, metadata = ?, data_type = 'tensor', updated_at = NOW() WHERE id = ?`,
      [JSON.stringify(dims), JSON.stringify(newMeta), op.source_dataset_id],
    );
    await db.query(
      `UPDATE dataset_operations SET status = 'completed', output_dataset_id = ?, updated_at = NOW() WHERE id = ?`,
      [op.source_dataset_id, op.id],
    );
    return;
  }

  // save_mode = 'new_dataset' (padrão)
  const name = op.new_dataset_name || `${sourceDs.name} — ${techName}`;
  const newUuid = uuidv4();
  const newMetadata = {
    import_method: 'operation',
    source_technique: techSlug,
    source_params: params,
    data: { tensor },
  };
  const [insertResult] = await db.query(
    `INSERT INTO datasets
       (uuid, user_id, name, description, visibility, data_type, dimensions,
        x_points, x_min, x_max, file_format, storage_path,
        metadata, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'private', 'tensor', ?, NULL, NULL, NULL, 'json', NULL, ?, NOW(), NOW())`,
    [
      newUuid,
      op.user_id,
      name,
      `Gerado a partir de "${sourceDs.name}" via ${techName}.`,
      JSON.stringify(dims),
      JSON.stringify(newMetadata),
    ],
  );
  const newDatasetId = insertResult.insertId;

  await db.query('UPDATE users SET stat_datasets = stat_datasets + 1 WHERE id = ?', [op.user_id]);

  await db.query(
    `INSERT INTO dataset_lineage
       (source_dataset_id, target_dataset_id, operation, parameters, workflow_id, workflow_node_id, execution_id, created_at)
     VALUES (?, ?, ?, ?, ?, NULL, ?, NOW())`,
    [op.source_dataset_id, newDatasetId, techSlug, JSON.stringify(params), op.workflow_id, executionId],
  );

  await db.query(
    `UPDATE dataset_operations SET status = 'completed', output_dataset_id = ?, updated_at = NOW() WHERE id = ?`,
    [newDatasetId, op.id],
  );
}

/** Assina o canal de resultados. Idempotente — chamar mais de uma vez não duplica a assinatura. */
function start() {
  if (subscriber) return subscriber;

  subscriber = redis.duplicate();
  subscriber.on('error', (err) => console.error('[ResultConsumer] erro de conexão Redis:', err.message));
  subscriber.on('connect', () => console.log('[ResultConsumer] conectado ao Redis (assinante)'));

  subscriber.subscribe(RESULT_CHANNEL, (err) => {
    if (err) console.error('[ResultConsumer] falha ao assinar canal:', err.message);
    else console.log(`[ResultConsumer] assinando "${RESULT_CHANNEL}"`);
  });

  subscriber.on('message', (channel, message) => {
    if (channel !== RESULT_CHANNEL) return;
    handleResultMessage(message);
  });

  return subscriber;
}

function stop() {
  if (subscriber) { subscriber.disconnect(); subscriber = null; }
}

module.exports = { start, stop, handleResultMessage };
