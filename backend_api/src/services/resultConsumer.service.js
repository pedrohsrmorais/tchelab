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
 *
 * ── Por que isto sozinho não é suficiente (reconciliação abaixo) ───────────
 * Redis Pub/Sub é "fire-and-forget": uma mensagem publicada enquanto este
 * processo está reiniciando (deploy, crash, `pm2 restart`) ou mesmo só
 * reconectando a assinatura é perdida para sempre — Redis não guarda
 * histórico de canais Pub/Sub. Em produção sob pm2, tanto o backend quanto
 * o worker Python reiniciam de vez em quando (deploy, OOM, watch, etc.), e
 * a lacuna de alguns milissegundos entre "SIGTERM recebido" e "assinatura
 * recriada" é o suficiente para um resultado se perder — o job terminou de
 * verdade no worker, mas `execution_nodes`/`jobs` nunca saem de
 * pending/queued, e o editor mostra "SAÍDA (PENDENTE)" para sempre, mesmo
 * com o worker saudável e processando normalmente.
 *
 * O worker já guarda cada resultado também como chave Redis expirável
 * (`tchelab:result:{job_id}`, 1h de TTL — ver worker_api/redis_queue.py,
 * `publish_result`), mas antes nada aqui a lia de volta — ela só existia
 * "para o futuro", nunca consultada. `reconcile()` consulta essa chave para
 * todo job ainda "queued" no banco e, se achar, processa o resultado como
 * se tivesse chegado por Pub/Sub — fechando exatamente essa lacuna.
 *
 * Isso cobre resultado perdido. Para o caso em que o job nem chegou a
 * publicar nada (ex: o worker caiu no meio do processamento, antes de
 * publish_result), `reconcile()` também marca como "failed" qualquer
 * execution_node pending/running mais velho que JOB_TIMEOUT_SECONDS sem
 * nenhum resultado em lugar nenhum — assim o usuário vê um erro explicável
 * em vez de um spinner infinito.
 */

const { v4: uuidv4 } = require('uuid');
const db = require('../config/db.config');
const redis = require('../config/redis.config');

const RESULT_CHANNEL = process.env.RESULT_CHANNEL || 'tchelab_resultados';
// Tem que ser compatível com worker_api/config.py (mesma env var nos dois
// lados). Some uma margem de segurança sobre o timeout real do worker antes
// de desistir de um job — ele pode estar genuinamente demorado, não travado.
const JOB_TIMEOUT_SECONDS = parseInt(process.env.JOB_TIMEOUT_SECONDS || '300', 10);
const STALE_GRACE_SECONDS = 30;
const RECONCILE_INTERVAL_MS = 15000;

let subscriber = null;
let reconcileTimer = null;

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

/**
 * Fecha a `executions` pai quando não sobra nenhum `execution_node`
 * pending/running — extraído de handleResultMessage para ser reaproveitado
 * pelo sweep de reconciliação (reconcile(), abaixo), que também pode ser
 * quem faz o último nó de uma execução sair de pending/running (seja
 * aplicando um resultado atrasado, seja desistindo por timeout).
 */
async function finalizeExecutionIfDone(executionId) {
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
    `UPDATE executions SET status = ?, finished_at = NOW(), updated_at = NOW() WHERE id = ? AND status NOT IN ('completed','failed','cancelled')`,
    [executionStatus, executionId],
  );

  await finalizeDatasetOperation(executionId, executionStatus);
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
    // Idempotente por design: reconcile() pode reaplicar uma mensagem cujo
    // job já foi marcado 'done'/'failed' por este mesmo handler via Pub/Sub
    // (ex: a mensagem chegou pelos dois caminhos). A condição
    // `status = 'queued'` faz o segundo UPDATE virar um no-op.
    const [jobUpdateResult] = await db.query(
      `UPDATE jobs SET status = ?, result = ?, error_message = ?, finished_at = NOW() WHERE uuid = ? AND status = 'queued'`,
      [isSuccess ? 'done' : 'failed', outputs ? JSON.stringify(outputs) : null, error || null, jobUuid],
    );
    if (jobUpdateResult.affectedRows === 0) {
      // Já processado antes (Pub/Sub + reconcile competindo, ou reconcile
      // rodando duas vezes) — não reprocessa execution_nodes/executions de
      // novo, para não sobrescrever started_at/finished_at à toa.
      return;
    }

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

    await finalizeExecutionIfDone(executionId);
  } catch (err) {
    console.error('[ResultConsumer] erro ao processar resultado:', err);
  }
}

/**
 * Reconciliação — ver o comentário grande no topo do arquivo para o porquê.
 * Roda em duas situações: uma vez ao assinar o canal (pega o que se perdeu
 * enquanto o backend estava fora do ar) e periodicamente depois
 * (RECONCILE_INTERVAL_MS — pega o que se perder numa reconexão breve do
 * assinante Pub/Sub enquanto o backend está no ar).
 */
async function reconcile() {
  try {
    // 1) Jobs ainda "queued" no banco, mas cujo worker já publicou — a
    //    chave `tchelab:result:{uuid}` (SETEX 1h) é a cópia de segurança
    //    desse resultado. Reaplica como se tivesse chegado agora pelo
    //    Pub/Sub.
    const [queuedJobs] = await db.query(
      `SELECT uuid FROM jobs WHERE status = 'queued' AND job_type = 'execute_node'
       AND queued_at < (NOW() - INTERVAL 3 SECOND)`,
    );
    for (const { uuid } of queuedJobs) {
      try {
        const raw = await redis.get(`tchelab:result:${uuid}`);
        if (raw) {
          console.log(`[ResultConsumer] reconcile: resultado perdido recuperado para job ${uuid}`);
          await handleResultMessage(raw);
        }
      } catch (err) {
        console.error(`[ResultConsumer] reconcile: erro ao checar job ${uuid}:`, err.message);
      }
    }

    // 2) execution_nodes pending/running há mais tempo do que o worker
    //    jamais deveria levar (JOB_TIMEOUT_SECONDS + margem) e que (1) não
    //    resolveu — ou o job nunca chegou a ser processado (fila sem
    //    consumidor, ex: worker.py não está rodando — ver worker_api/
    //    README.md) ou o worker morreu no meio do job sem publicar nada.
    //    Marca como falha com uma mensagem acionável em vez de deixar o
    //    spinner girando pra sempre.
    const staleCutoffSeconds = JOB_TIMEOUT_SECONDS + STALE_GRACE_SECONDS;
    const [staleNodes] = await db.query(
      `SELECT en.id, en.execution_id
       FROM execution_nodes en
       WHERE en.status IN ('pending','running')
         AND en.created_at < (NOW() - INTERVAL ? SECOND)`,
      [staleCutoffSeconds],
    );
    const touchedExecutions = new Set();
    for (const node of staleNodes) {
      // CONCAT(), não `||` — MySQL trata `||` como OR lógico por padrão
      // (sql_mode sem PIPES_AS_CONCAT), não como concatenação de string.
      await db.query(
        `UPDATE execution_nodes
           SET status = 'failed',
               error_message = CONCAT('Tempo esgotado: nenhum resultado recebido do worker Python em mais de ', ?, 's. Verifique se o processo worker.py está rodando (ver worker_api/README.md).'),
               finished_at = NOW(), updated_at = NOW()
         WHERE id = ? AND status IN ('pending','running')`,
        [staleCutoffSeconds, node.id],
      );
      // Reflete o mesmo diagnóstico no job correspondente (casado pelo
      // execution_node_id embutido no payload no momento do dispatch —
      // ver dispatchExecutionCore em execution.controller.js).
      await db.query(
        `UPDATE jobs
           SET status = 'failed',
               error_message = 'Tempo esgotado: sem resposta do worker Python.',
               finished_at = NOW()
         WHERE status = 'queued'
           AND JSON_UNQUOTE(JSON_EXTRACT(payload, '$.execution_node_id')) = ?`,
        [String(node.id)],
      );
      touchedExecutions.add(node.execution_id);
    }
    for (const executionId of touchedExecutions) {
      await finalizeExecutionIfDone(executionId);
    }
  } catch (err) {
    console.error('[ResultConsumer] erro na reconciliação:', err.message);
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

  // Reconciliação: uma vez já no start (pega o que se perdeu enquanto este
  // processo estava fora do ar) e depois periodicamente (pega mensagens
  // perdidas em reconexões breves do assinante enquanto o processo está no
  // ar, e detecta jobs genuinamente travados por falta de worker).
  reconcile();
  if (reconcileTimer) clearInterval(reconcileTimer);
  reconcileTimer = setInterval(reconcile, RECONCILE_INTERVAL_MS);

  return subscriber;
}

function stop() {
  if (subscriber) { subscriber.disconnect(); subscriber = null; }
  if (reconcileTimer) { clearInterval(reconcileTimer); reconcileTimer = null; }
}

module.exports = { start, stop, handleResultMessage, reconcile };
