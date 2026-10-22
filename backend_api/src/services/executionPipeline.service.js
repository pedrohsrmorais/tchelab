'use strict';

/**
 * Encadeamento de nós de um workflow (técnica → técnica).
 *
 * Antes deste serviço, `dispatchExecutionCore` enfileirava TODOS os nós de
 * uma vez, cada um só com os `dataset_bindings` como entrada — as arestas
 * (`workflow_edges`) serviam apenas para ordenar a fila. Resultado: qualquer
 * nó alimentado por outro nó (ex: Dataset → SNV → PCA) rodava sem a entrada
 * vinda do nó anterior e falhava com "Campo obrigatório ausente: input['X']".
 *
 * Agora:
 *  - o dispatch enfileira só os nós raiz (sem aresta de entrada);
 *  - cada resultado recebido (resultConsumer → advanceExecution) libera os
 *    nós seguintes cujas dependências terminaram, montando a entrada deles
 *    a partir das saídas do nó anterior (`source_port` → `target_port`) +
 *    quaisquer bindings de dataset do próprio nó;
 *  - se um nó anterior falhou, os seguintes são marcados `skipped`
 *    (transitivamente) em vez de rodar sem dados.
 */

const db = require('../config/db.config');
const jobService = require('./job.service');
const usage = require('./usage.service');

function parseJson(v, fallback = null) {
  if (v == null) return fallback;
  if (typeof v === 'string') { try { return JSON.parse(v); } catch { return fallback; } }
  return v;
}

function inferShape(value) {
  const dims = [];
  let cur = value;
  while (Array.isArray(cur)) { dims.push(cur.length); cur = cur[0]; }
  return dims;
}

function inputShapesOf(inputs) {
  const shapes = {};
  for (const [port, value] of Object.entries(inputs || {})) shapes[port] = inferShape(value);
  return shapes;
}

/** Cria o job (tabela `jobs` + fila Redis) de um execution_node. */
async function enqueueNode({ executionUuid, workflow, userId, executionId, executionNodeId, nodeKey, slug, inputs, params }) {
  return jobService.createJob({
    job_type: 'execute_node',
    user_id: userId,
    execution_id: executionId,
    workflow_id: workflow.id,
    payload: {
      // Campos obrigatórios do JobPayload do worker Python
      execution_id: executionUuid,
      node_id: nodeKey,
      slug,
      inputs,
      params,
      // Metadados extras para rastreabilidade
      execution_node_id: executionNodeId,
      workflow_uuid: workflow.uuid,
    },
  });
}

/**
 * Libera os nós pendentes cujas dependências já terminaram e marca como
 * `skipped` os que dependem de um nó que falhou/foi pulado. Idempotente e
 * seguro contra chamadas concorrentes: o "claim" de um nó é o UPDATE
 * atômico de `started_at` (só uma chamada consegue NULL → NOW()).
 */
async function advanceExecution(executionId) {
  const [[ex]] = await db.query(
    'SELECT id, uuid, workflow_id, user_id FROM executions WHERE id = ?', [executionId],
  );
  if (!ex) return;
  const [[workflow]] = await db.query('SELECT id, uuid FROM workflows WHERE id = ?', [ex.workflow_id]);
  if (!workflow) return;

  const [edges] = await db.query(
    'SELECT source_node_key, source_port, target_node_key, target_port FROM workflow_edges WHERE workflow_id = ?',
    [ex.workflow_id],
  );
  if (!edges.length) return;

  const [rows] = await db.query(
    `SELECT en.id, en.status, en.started_at, en.parameters, en.input_data, en.output_data,
            wn.node_key, wn.name, t.slug
     FROM execution_nodes en
     JOIN workflow_nodes wn ON wn.id = en.workflow_node_id
     JOIN techniques t ON t.id = wn.technique_id
     WHERE en.execution_id = ?`,
    [executionId],
  );
  const byKey = Object.fromEntries(rows.map((r) => [r.node_key, r]));
  const incoming = {};
  for (const e of edges) (incoming[e.target_node_key] = incoming[e.target_node_key] || []).push(e);

  const terminalBad = (s) => s === 'failed' || s === 'skipped';
  const label = (r) => r.name || r.node_key;

  const closeNode = async (r, status, message) => {
    const [res] = await db.query(
      `UPDATE execution_nodes
          SET status = ?, error_message = ?, started_at = COALESCE(started_at, NOW()),
              finished_at = NOW(), updated_at = NOW()
        WHERE id = ? AND status = 'pending' AND started_at IS NULL`,
      [status, message, r.id],
    );
    if (res.affectedRows > 0) r.status = status;
    return res.affectedRows > 0;
  };

  // Orçamento de CPU do mês: se acabou no meio da execução, os nós ainda não iniciados falham com o motivo (os em andamento terminam).
  let cpuBlocked = null;
  try { const st = await usage.cpuBudgetStatus(ex.user_id); if (st.exceeded) cpuBlocked = st; } catch { /* sem a checagem, segue */ }

  let changed = true;
  while (changed) {
    changed = false;
    for (const r of rows) {
      const ins = incoming[r.node_key];
      if (!ins || r.status !== 'pending' || r.started_at) continue;
      const ups = ins.map((e) => byKey[e.source_node_key]).filter(Boolean);

      const badUp = ups.find((u) => terminalBad(u.status));
      if (badUp) {
        if (await closeNode(r, 'skipped', `Não executado: o nó anterior "${label(badUp)}" não foi concluído.`)) changed = true;
        continue;
      }
      if (!ups.every((u) => u.status === 'completed')) continue; // ainda esperando

      // Todas as dependências concluídas → monta a entrada.
      const inputs = { ...(parseJson(r.input_data, {}) || {}) };
      let problem = null;
      for (const e of ins) {
        const src = byKey[e.source_node_key];
        if (!src) continue;
        const outs = parseJson(src.output_data, {}) || {};
        const srcPort = e.source_port || Object.keys(outs).find((k) => Array.isArray(outs[k])) || Object.keys(outs)[0];
        if (!e.target_port) { problem = `Conexão sem porta de destino em "${label(r)}".`; break; }
        if (!srcPort || !(srcPort in outs)) {
          problem = `O nó anterior "${label(src)}" não produziu a saída "${e.source_port || '?'}" esperada por "${label(r)}.${e.target_port}".`;
          break;
        }
        inputs[e.target_port] = outs[srcPort];
      }
      if (problem) {
        if (await closeNode(r, 'failed', problem)) changed = true;
        continue;
      }

      if (cpuBlocked) {
        const m = (sec) => (sec < 60 ? `${Math.round(sec)} s` : sec < 3600 ? `${Math.round(sec / 60)} min` : `${Math.round((sec / 3600) * 10) / 10} h`);
        if (await closeNode(r, 'failed', `CPU_BUDGET_EXCEEDED: o tempo de processamento do mês acabou (${m(cpuBlocked.used)} de ${m(cpuBlocked.budget)}); este nó não foi executado.`)) changed = true;
        continue;
      }

      // Claim atômico (evita enfileirar duas vezes se dois resultados chegarem juntos).
      const [claim] = await db.query(
        `UPDATE execution_nodes
            SET started_at = NOW(), created_at = NOW(), input_data = ?, input_metadata = ?, updated_at = NOW()
          WHERE id = ? AND status = 'pending' AND started_at IS NULL`,
        [JSON.stringify(inputs), JSON.stringify(inputShapesOf(inputs)), r.id],
      );
      if (claim.affectedRows === 0) continue;
      r.started_at = new Date();

      try {
        await enqueueNode({
          executionUuid: ex.uuid,
          workflow,
          userId: ex.user_id,
          executionId: ex.id,
          executionNodeId: r.id,
          nodeKey: r.node_key,
          slug: r.slug,
          inputs,
          params: parseJson(r.parameters, {}) || {},
        });
      } catch (err) {
        await db.query(
          `UPDATE execution_nodes SET status = 'failed', error_message = ?, finished_at = NOW(), updated_at = NOW() WHERE id = ?`,
          [`Falha ao enfileirar o nó: ${err.message}`, r.id],
        );
        r.status = 'failed';
        changed = true;
      }
    }
  }
}

module.exports = { enqueueNode, advanceExecution, inputShapesOf, parseJson };
