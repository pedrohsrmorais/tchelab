'use strict';

/**
 * `workflows.definition` guarda duas coisas independentes:
 *   - `canvas`: estado que só existe no frontend (nós de dataset, dataset
 *     escolhido e ligações dataset→porta) — gravado pelo autosave do editor;
 *   - `nodes`/`edges`: snapshot do grafo (workflow_nodes/workflow_edges),
 *     regravado a cada mudança de nó/aresta.
 *
 * Antes, cada escritor substituía a coluna inteira, então qualquer
 * criação/movimento de nó ou criação de aresta apagava o `canvas` — e, ao
 * sair e voltar para o workflow, o dataset selecionado e as ligações
 * dataset→porta sumiam ("tinha que conectar tudo de novo"). Agora todos
 * fazem merge raso por chave de primeiro nível: só as chaves informadas no
 * `patch` são substituídas (por inteiro), as demais são preservadas.
 */

const db = require('../config/db.config');

function parseDefinition(raw) {
  if (raw == null) return {};
  if (typeof raw === 'object') return raw;
  try { const v = JSON.parse(raw); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; } catch { return {}; }
}

async function patchDefinition(workflowId, patch) {
  const [rows] = await db.query('SELECT definition FROM workflows WHERE id = ?', [workflowId]);
  if (!rows.length) return;
  const merged = { ...parseDefinition(rows[0].definition), ...patch };
  await db.query(
    'UPDATE workflows SET definition = ?, updated_at = NOW() WHERE id = ?',
    [JSON.stringify(merged), workflowId],
  );
}

module.exports = { patchDefinition, parseDefinition };
