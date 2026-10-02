'use strict';

const db = require('../config/db.config');

/**
 * ShapeValidatorService
 *
 * Valida compatibilidade de uma aresta de workflow antes de persistir.
 * Retorna { valid: true } ou { valid: false, error: string }.
 *
 * As 8 camadas de validação definidas em workflow.md:
 *  1. Existência dos nós
 *  2. Porta de saída existe no output_schema
 *  3. Porta de entrada existe no input_schema
 *  4. Tipos compatíveis
 *  5. Ordem analítica (data_order vs min_order / max_order)
 *  6. Eixo de amostras (requires_sample_axis)
 *  7. Compatibilidade matemática de shape (produto_matricial, inversa…)
 *  8. Ausência de ciclo (DAG)
 */

class ShapeValidatorService {
  /**
   * Ponto de entrada principal.
   * @param {number} workflowId
   * @param {object} edge  { source_node_key, source_port, target_node_key, target_port }
   * @param {object} [datasetMeta]  metadata do dataset conectado ao nó raiz (opcional)
   */
  async validateEdge(workflowId, edge, datasetMeta = null) {
    const { source_node_key, source_port, target_node_key, target_port } = edge;

    // 1. Existência dos nós
    const [nodes] = await db.query(
      'SELECT node_key, technique_id FROM workflow_nodes WHERE workflow_id = ?',
      [workflowId],
    );
    const nodeMap = Object.fromEntries(nodes.map((n) => [n.node_key, n]));

    if (!nodeMap[source_node_key]) {
      return this._fail(`Nó de origem "${source_node_key}" não existe no workflow.`);
    }
    if (!nodeMap[target_node_key]) {
      return this._fail(`Nó de destino "${target_node_key}" não existe no workflow.`);
    }

    // Busca schemas das técnicas
    const [sourceTechRows] = await db.query(
      'SELECT output_schema, input_schema FROM techniques WHERE id = ?',
      [nodeMap[source_node_key].technique_id],
    );
    const [targetTechRows] = await db.query(
      'SELECT output_schema, input_schema, min_order, max_order, requires_sample_axis FROM techniques WHERE id = ?',
      [nodeMap[target_node_key].technique_id],
    );

    if (!sourceTechRows.length || !targetTechRows.length) {
      return this._fail('Técnica de um dos nós não encontrada no catálogo.');
    }

    const sourceTech = sourceTechRows[0];
    const targetTech = targetTechRows[0];

    const outputSchema = typeof sourceTech.output_schema === 'string'
      ? JSON.parse(sourceTech.output_schema)
      : sourceTech.output_schema;
    const inputSchema = typeof targetTech.input_schema === 'string'
      ? JSON.parse(targetTech.input_schema)
      : targetTech.input_schema;

    // 2. Porta de saída existe
    if (!outputSchema || !outputSchema[source_port]) {
      return this._fail(
        `Porta de saída "${source_port}" não existe na técnica do nó "${source_node_key}". ` +
        `Portas disponíveis: ${Object.keys(outputSchema || {}).join(', ') || 'nenhuma'}.`,
      );
    }

    // 3. Porta de entrada existe
    if (!inputSchema || !inputSchema[target_port]) {
      return this._fail(
        `Porta de entrada "${target_port}" não existe na técnica do nó "${target_node_key}". ` +
        `Portas disponíveis: ${Object.keys(inputSchema || {}).join(', ') || 'nenhuma'}.`,
      );
    }

    const srcPort = outputSchema[source_port];
    const tgtPort = inputSchema[target_port];

    // 4. Tipos compatíveis
    if (srcPort.type && tgtPort.type && srcPort.type !== tgtPort.type) {
      return this._fail(
        `Tipos incompatíveis: a porta "${source_port}" produz "${srcPort.type}", ` +
        `mas a porta "${target_port}" espera "${tgtPort.type}".`,
      );
    }

    // 5. Ordem analítica (quando o dataset de origem é conhecido)
    if (datasetMeta) {
      const order = datasetMeta.data_order;
      if (targetTech.min_order !== null && order < targetTech.min_order) {
        return this._fail(
          `A técnica do nó "${target_node_key}" exige arrays de ordem mínima ${targetTech.min_order} ` +
          `(min_order = ${targetTech.min_order}). O dataset conectado tem data_order = ${order}.`,
        );
      }
      if (targetTech.max_order !== null && order > targetTech.max_order) {
        return this._fail(
          `A técnica do nó "${target_node_key}" aceita arrays de ordem máxima ${targetTech.max_order} ` +
          `(max_order = ${targetTech.max_order}). O dataset conectado tem data_order = ${order}.`,
        );
      }

      // 6. Eixo de amostras
      const reqSampleAxis = targetTech.requires_sample_axis;
      if (reqSampleAxis === 1 && datasetMeta.sample_axis === null) {
        return this._fail(
          `A técnica do nó "${target_node_key}" requer que o dataset tenha sample_axis declarado, ` +
          `mas o dataset atual não tem (sample_axis = NULL).`,
        );
      }
      if (reqSampleAxis === 0 && datasetMeta.sample_axis !== null) {
        return this._fail(
          `A técnica do nó "${target_node_key}" exige dataset sem sample_axis, ` +
          `mas o dataset atual tem sample_axis = ${datasetMeta.sample_axis}.`,
        );
      }
    }

    // 8. Ciclo (DAG check)
    const cycleResult = await this._checkNoCycle(workflowId, source_node_key, target_node_key);
    if (!cycleResult.valid) return cycleResult;

    return { valid: true };
  }

  /**
   * Verifica se adicionar a aresta source→target criaria um ciclo via BFS.
   */
  async _checkNoCycle(workflowId, source_node_key, target_node_key) {
    if (source_node_key === target_node_key) {
      return this._fail('Uma aresta não pode conectar um nó a si mesmo.');
    }

    const [edges] = await db.query(
      'SELECT source_node_key, target_node_key FROM workflow_edges WHERE workflow_id = ?',
      [workflowId],
    );

    // Grafo de adjacência (apenas arestas existentes)
    const adj = {};
    for (const e of edges) {
      if (!adj[e.source_node_key]) adj[e.source_node_key] = [];
      adj[e.source_node_key].push(e.target_node_key);
    }

    // Adiciona a aresta proposta temporariamente
    if (!adj[source_node_key]) adj[source_node_key] = [];
    adj[source_node_key].push(target_node_key);

    // BFS a partir de target_node_key — se chegarmos em source_node_key, há ciclo
    const visited = new Set();
    const queue = [target_node_key];
    while (queue.length) {
      const cur = queue.shift();
      if (cur === source_node_key) {
        return this._fail(
          `A aresta "${source_node_key}" → "${target_node_key}" criaria um ciclo no grafo. ` +
          'O workflow deve ser um grafo acíclico dirigido (DAG).',
        );
      }
      if (visited.has(cur)) continue;
      visited.add(cur);
      for (const neighbor of adj[cur] || []) {
        queue.push(neighbor);
      }
    }

    return { valid: true };
  }

  _fail(message) {
    return { valid: false, error: message };
  }
}

module.exports = new ShapeValidatorService();
