'use strict';

const db = require('../config/db.config');

/**
 * LineageService
 *
 * Registra linhagem de datasets derivados em `dataset_lineage`.
 * Usado por DatasetController (operação avulsa) e pelo worker de execução
 * quando um nó produz um dataset derivado.
 */
class LineageService {
  /**
   * Registra uma operação de derivação.
   *
   * @param {object} params
   * @param {number} params.source_dataset_id    Dataset original
   * @param {number} params.target_dataset_id    Dataset derivado
   * @param {string} params.operation            Slug da operação (ex: 'transpose')
   * @param {object} [params.parameters]         Parâmetros usados
   * @param {number} [params.workflow_node_id]   ID do nó do workflow (se via execução)
   * @param {number} [params.execution_id]       ID da execução
   */
  async record({ source_dataset_id, target_dataset_id, operation, parameters = {}, workflow_node_id = null, execution_id = null }) {
    await db.query(
      `INSERT INTO dataset_lineage
         (source_dataset_id, target_dataset_id, operation, parameters, workflow_node_id, execution_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        source_dataset_id,
        target_dataset_id,
        operation,
        JSON.stringify(parameters),
        workflow_node_id,
        execution_id,
      ],
    );
  }

  /**
   * Retorna o grafo de linhagem completo (upstream + downstream) de um dataset.
   *
   * @param {number} datasetId
   * @returns {{ upstream: Array, downstream: Array }}
   */
  async getLineage(datasetId) {
    const upstream = await this._collectUpstream(datasetId, new Set());
    const downstream = await this._collectDownstream(datasetId, new Set());
    return { upstream, downstream };
  }

  async _collectUpstream(datasetId, visited) {
    if (visited.has(datasetId)) return [];
    visited.add(datasetId);

    const [rows] = await db.query(
      `SELECT dl.*, d.name AS source_name
       FROM dataset_lineage dl
       JOIN datasets d ON d.id = dl.source_dataset_id
       WHERE dl.target_dataset_id = ?`,
      [datasetId],
    );

    const results = [];
    for (const row of rows) {
      results.push(row);
      const parents = await this._collectUpstream(row.source_dataset_id, visited);
      results.push(...parents);
    }
    return results;
  }

  async _collectDownstream(datasetId, visited) {
    if (visited.has(datasetId)) return [];
    visited.add(datasetId);

    const [rows] = await db.query(
      `SELECT dl.*, d.name AS target_name
       FROM dataset_lineage dl
       JOIN datasets d ON d.id = dl.target_dataset_id
       WHERE dl.source_dataset_id = ?`,
      [datasetId],
    );

    const results = [];
    for (const row of rows) {
      results.push(row);
      const children = await this._collectDownstream(row.target_dataset_id, visited);
      results.push(...children);
    }
    return results;
  }
}

module.exports = new LineageService();
