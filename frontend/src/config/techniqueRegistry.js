/**
 * techniqueRegistry.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Fonte única da verdade para familias e validação de compatibilidade de nós.
 * A lista real vem do backend via API (GET /techniques?limit=500).
 * Este arquivo define:
 *   1. FAMILIES — metadados de cada família (cor, ícone, categoria)
 *   2. ARRAY_TYPES — os tipos de array que os nós produzem/consomem
 *   3. isValidConnection(sourceNode, targetNode) — regra de compatibilidade
 *
 * Para adicionar uma nova família: edite apenas FAMILIES.
 * Para alterar compatibilidade de tipos: edite COMPAT_MATRIX.
 */

// ── Tipos de array possíveis ──────────────────────────────────────────────────
// IMPORTANTE: os valores aqui são os mesmos tokens de `type` usados em
// `techniques.input_schema`/`output_schema` no banco e verificados pelo
// ShapeValidatorService no backend (ver docs/workflow.md — "matrix", "tensor",
// "vector", "scalar", "model", "figures", "labels" aparecem lá como palavras
// por extenso, nunca como "2D"/"ND"/"vetor"/"modelo"). Os valores antigos
// deste arquivo (curtos, em português) nunca bateram com o que o backend
// realmente compara em `srcPort.type !== tgtPort.type` — ou seja, a
// validação de tipo no editor provavelmente nunca reconheceu um match
// correto. A dimensionalidade (2D/3D/N-way) NÃO faz parte do tipo: ela é
// validada à parte via `min_order`/`max_order`/`data_order` — por isso não
// existe mais um tipo "3D" ou "ND" separado de "tensor".
export const ARRAY_TYPES = {
  MATRIX:       'matrix',     // Matriz amostras × variáveis
  TENSOR:       'tensor',     // Array N-way (qualquer ordem ≥ 2) — ex: EEM, PARAFAC
  VECTOR:       'vector',     // Vetor (referência y, índices, autovalores reais…)
  SCALAR:       'scalar',     // Valor único
  FIGURES:      'figures',    // Conjunto de figuras/plots
  MODEL:        'model',      // Objeto modelo treinado
  LOADINGS:     'loadings',   // Matriz de loadings/scores
  PREDICTION:   'prediction', // Vetor de predições
  LABELS:       'labels',     // Rótulos de classe
  DATASET:      'dataset',    // Dataset bruto (nó de entrada)
  ANY:          '*',          // Aceita qualquer tipo
};

// ── Famílias e seus metadados visuais ────────────────────────────────────────
// Chave = slug da família no banco (techniques.family). ATENÇÃO: isto tem que
// bater EXATAMENTE com os valores reais gravados em `techniques.family` pelo
// seed (backend_api/src/config/init.mysql) — que por sua vez espelham os
// nomes das 20 pastas do catálogo Python (worker_api/catalog/familia_NN_*).
// Até esta correção, as chaves aqui eram uma taxonomia inventada à parte
// (ex: '02_pre_processamento', '06_clustering', '09_selecao_variaveis' na
// posição 9) que nunca bateu com os valores reais do banco para as famílias
// 02–19 (ex: o banco usa '02_preprocessamento' sem underscore extra, a
// família 9 real é 'multiway_classif' e não tem nada a ver com "seleção de
// variáveis", que é a família 11). Resultado: `groupedByFamily` no editor de
// workflow (que filtra por `t.family === fam.slug`) descartava silenciosamente
// as técnicas de 18 das 20 famílias — a causa raiz do catálogo aparecendo
// quase vazio no painel lateral, mesmo com a API retornando as técnicas.
export const FAMILIES = {
  '01_dados': {
    label:    { pt: 'Dados & I/O',              en: 'Data & I/O' },
    color:    '#64748b',
    bg:       'rgba(100,116,139,0.15)',
    border:   'rgba(100,116,139,0.4)',
    category: 'entrada',
    order:    1,
  },
  '02_preprocessamento': {
    label:    { pt: 'Pré-processamento',        en: 'Pre-processing' },
    color:    '#0ea5e9',
    bg:       'rgba(14,165,233,0.12)',
    border:   'rgba(14,165,233,0.4)',
    category: 'transformacao',
    order:    2,
  },
  '03_exploratoria': {
    label:    { pt: 'Análise Exploratória',     en: 'Exploratory Analysis' },
    color:    '#8b5cf6',
    bg:       'rgba(139,92,246,0.12)',
    border:   'rgba(139,92,246,0.4)',
    category: 'analise',
    order:    3,
  },
  '04_regressao_1d': {
    label:    { pt: 'Regressão',                en: 'Regression' },
    color:    '#10b981',
    bg:       'rgba(16,185,129,0.12)',
    border:   'rgba(16,185,129,0.4)',
    category: 'modelagem',
    order:    4,
  },
  '05_classificacao_1d': {
    label:    { pt: 'Classificação',            en: 'Classification' },
    color:    '#f59e0b',
    bg:       'rgba(245,158,11,0.12)',
    border:   'rgba(245,158,11,0.4)',
    category: 'modelagem',
    order:    5,
  },
  '06_deep_learning': {
    label:    { pt: 'Deep Learning',            en: 'Deep Learning' },
    color:    '#ec4899',
    bg:       'rgba(236,72,153,0.12)',
    border:   'rgba(236,72,153,0.4)',
    category: 'modelagem',
    order:    6,
  },
  '07_multiway_decomp': {
    label:    { pt: 'Decomposição Multiway',    en: 'Multiway Decomposition' },
    color:    '#06b6d4',
    bg:       'rgba(6,182,212,0.12)',
    border:   'rgba(6,182,212,0.4)',
    category: 'analise',
    order:    7,
  },
  '08_multiway_regression': {
    label:    { pt: 'Regressão Multiway',       en: 'Multiway Regression' },
    color:    '#84cc16',
    bg:       'rgba(132,204,22,0.12)',
    border:   'rgba(132,204,22,0.4)',
    category: 'modelagem',
    order:    8,
  },
  '09_multiway_classif': {
    label:    { pt: 'Classificação Multiway',   en: 'Multiway Classification' },
    color:    '#f97316',
    bg:       'rgba(249,115,22,0.12)',
    border:   'rgba(249,115,22,0.4)',
    category: 'modelagem',
    order:    9,
  },
  '10_calibracao_ordem_superior': {
    label:    { pt: 'Calibração de Ordem Superior', en: 'Higher-Order Calibration' },
    color:    '#6366f1',
    bg:       'rgba(99,102,241,0.12)',
    border:   'rgba(99,102,241,0.4)',
    category: 'modelagem',
    order:    10,
  },
  '11_selecao_variaveis': {
    label:    { pt: 'Seleção de Variáveis',     en: 'Variable Selection' },
    color:    '#a855f7',
    bg:       'rgba(168,85,247,0.12)',
    border:   'rgba(168,85,247,0.4)',
    category: 'transformacao',
    order:    11,
  },
  '12_validacao_modelos': {
    label:    { pt: 'Validação de Modelos',     en: 'Model Validation' },
    color:    '#14b8a6',
    bg:       'rgba(20,184,166,0.12)',
    border:   'rgba(20,184,166,0.4)',
    category: 'avaliacao',
    order:    12,
  },
  '13_transferencia_aprendizado': {
    label:    { pt: 'Transferência de Aprendizado', en: 'Transfer Learning' },
    color:    '#ef4444',
    bg:       'rgba(239,68,68,0.12)',
    border:   'rgba(239,68,68,0.4)',
    category: 'modelagem',
    order:    13,
  },
  '14_sinais_espectrais': {
    label:    { pt: 'Sinais Espectrais',        en: 'Spectral Signals' },
    color:    '#22c55e',
    bg:       'rgba(34,197,94,0.12)',
    border:   'rgba(34,197,94,0.4)',
    category: 'transformacao',
    order:    14,
  },
  '15_imagens_hiperespectrais': {
    label:    { pt: 'Imagens Hiperespectrais',  en: 'Hyperspectral Imaging' },
    color:    '#fb923c',
    bg:       'rgba(251,146,60,0.12)',
    border:   'rgba(251,146,60,0.4)',
    category: 'analise',
    order:    15,
  },
  '16_dados_faltantes': {
    label:    { pt: 'Dados Faltantes',          en: 'Missing Data' },
    color:    '#38bdf8',
    bg:       'rgba(56,189,248,0.12)',
    border:   'rgba(56,189,248,0.4)',
    category: 'transformacao',
    order:    16,
  },
  '17_fusao_dados': {
    label:    { pt: 'Fusão de Dados',           en: 'Data Fusion' },
    color:    '#facc15',
    bg:       'rgba(250,204,21,0.12)',
    border:   'rgba(250,204,21,0.4)',
    category: 'transformacao',
    order:    17,
  },
  '18_quimiometria_processo': {
    label:    { pt: 'Quimiometria de Processo', en: 'Process Chemometrics (SPC)' },
    color:    '#c084fc',
    bg:       'rgba(192,132,252,0.12)',
    border:   'rgba(192,132,252,0.4)',
    category: 'analise',
    order:    18,
  },
  '19_interpretabilidade': {
    label:    { pt: 'Interpretabilidade',       en: 'Interpretability' },
    color:    '#34d399',
    bg:       'rgba(52,211,153,0.12)',
    border:   'rgba(52,211,153,0.4)',
    category: 'analise',
    order:    19,
  },
  '20_utilitarios': {
    label:    { pt: 'Utilitários',              en: 'Utilities' },
    color:    '#94a3b8',
    bg:       'rgba(148,163,184,0.12)',
    border:   'rgba(148,163,184,0.4)',
    category: 'utilitario',
    order:    20,
  },
};

/**
 * Retorna o config da família a partir do slug da técnica ou da família.
 * Aceita tanto o slug exato (ex: "02_pre_processamento") quanto
 * o campo `family` do banco (ex: "pre_processamento").
 */
export function getFamilyConfig(familySlug, lang = 'pt') {
  if (!familySlug) return null;
  // Tenta match direto
  if (FAMILIES[familySlug]) {
    return { ...FAMILIES[familySlug], slug: familySlug, labelStr: FAMILIES[familySlug].label[lang] || FAMILIES[familySlug].label.pt };
  }
  // Tenta match com prefixo numérico
  const found = Object.entries(FAMILIES).find(([k]) => k.endsWith(`_${familySlug}`) || k === familySlug);
  if (found) {
    return { ...found[1], slug: found[0], labelStr: found[1].label[lang] || found[1].label.pt };
  }
  return { label: { pt: familySlug, en: familySlug }, color: '#64748b', bg: 'rgba(100,116,139,0.1)', border: 'rgba(100,116,139,0.3)', labelStr: familySlug, slug: familySlug };
}

/**
 * Retorna lista de famílias ordenada para exibição.
 */
export function getFamiliesList(lang = 'pt') {
  return Object.entries(FAMILIES)
    .sort(([, a], [, b]) => a.order - b.order)
    .map(([slug, cfg]) => ({ slug, ...cfg, labelStr: cfg.label[lang] || cfg.label.pt }));
}

// ── Matriz de compatibilidade de tipos ───────────────────────────────────────
// COMPAT_MATRIX[sourceType][targetType] = true → conexão válida.
// Observação: isto é uma pré-validação só pra dar feedback imediato no
// canvas. A validação que realmente decide é o ShapeValidatorService no
// backend (POST /workflows/:id/edges) — se o backend rejeitar algo que
// passou aqui, o editor deve desfazer a aresta e mostrar o erro real dele
// (não confiar só nesta matriz do frontend).
const ANY = ARRAY_TYPES.ANY;
const MAT = ARRAY_TYPES.MATRIX;
const TEN = ARRAY_TYPES.TENSOR;
const VEC = ARRAY_TYPES.VECTOR;
const SCL = ARRAY_TYPES.SCALAR;
const MOD = ARRAY_TYPES.MODEL;
const LOA = ARRAY_TYPES.LOADINGS;
const PRE = ARRAY_TYPES.PREDICTION;
const LAB = ARRAY_TYPES.LABELS;
const FIG = ARRAY_TYPES.FIGURES;
const DST = ARRAY_TYPES.DATASET;

// Dataset de entrada pode alimentar matrix/tensor/vector diretamente
// (a ordem/dimensionalidade é validada à parte via min_order/max_order, não
// pelo tipo). Tipos "terminais" como figures não aceitam saída.
export const COMPAT_MATRIX = {
  [DST]:  { [MAT]: true, [TEN]: true, [VEC]: true, [ANY]: true },
  [MAT]:  { [MAT]: true, [VEC]: true, [ANY]: true },
  [TEN]:  { [TEN]: true, [MAT]: true, [ANY]: true }, // unfolding/slice de tensor pode virar matrix
  [VEC]:  { [VEC]: true, [MAT]: true, [ANY]: true },
  [SCL]:  { [SCL]: true, [FIG]: true, [ANY]: true },
  [MOD]:  { [MOD]: true, [PRE]: true, [LOA]: true, [ANY]: true },
  [LOA]:  { [LOA]: true, [MAT]: true, [FIG]: true, [ANY]: true },
  [PRE]:  { [PRE]: true, [VEC]: true, [FIG]: true, [ANY]: true },
  [LAB]:  { [LAB]: true, [VEC]: true, [FIG]: true, [ANY]: true },
  [FIG]:  {},
  [ANY]:  { [MAT]: true, [TEN]: true, [VEC]: true, [SCL]: true, [MOD]: true, [LOA]: true, [PRE]: true, [LAB]: true, [FIG]: true, [ANY]: true },
};

/**
 * Verifica se uma conexão entre duas PORTAS específicas é válida (pré-check
 * local, espelhando a camada 4 — "tipo compatível" — do ShapeValidatorService).
 * @param {string} srcType  — tipo declarado na porta de saída (output_schema[port].type)
 * @param {string} tgtType  — tipo declarado na porta de entrada (input_schema[port].type)
 * @returns {{ valid: boolean, reason: string }}
 */
export function isValidConnection(srcType, tgtType) {
  const s = srcType || ANY;
  const t = tgtType || ANY;

  if (s === ANY || t === ANY) return { valid: true, reason: '' };
  if (s === t) return { valid: true, reason: '' };

  const row = COMPAT_MATRIX[s] || {};
  if (row[t]) return { valid: true, reason: '' };

  return {
    valid: false,
    reason: `Tipo de saída "${s}" não é compatível com a entrada "${t}"`,
  };
}

/**
 * Lê um input_schema/output_schema vindo do banco e retorna a lista de
 * portas nomeadas: [{ name, type, description, shape, dtype }].
 *
 * O formato real gravado pelo backend é um dicionário por porta — ex:
 * `{"X": {"type":"matrix"}, "y": {"type":"vector"}}` para uma técnica com 2
 * entradas, ou `{"train": {...}, "test": {...}, "validation": {...}}` para
 * uma técnica como kennard_stone com 3 saídas nomeadas (confirmado em
 * shapeValidator.service.js, que faz `outputSchema[source_port]`, e no uso
 * pré-existente em QuickOperationModal, que já trata input_schema como um
 * dict e pula a primeira chave via `Object.keys(inputSchema).slice(1)`).
 *
 * Mantém um fallback para o formato legado de porta única
 * `{"type": "...", "description": "..."}` sem chave de porta, caso alguma
 * técnica antiga ainda esteja cadastrada assim — nesse caso a porta recebe
 * o nome genérico "value".
 */
export function getPorts(schema) {
  if (!schema) return [];
  const obj = typeof schema === 'string' ? (() => { try { return JSON.parse(schema); } catch { return null; } })() : schema;
  if (!obj || typeof obj !== 'object') return [];

  // Formato legado: {type, description, ...} direto, sem porta nomeada.
  if (typeof obj.type === 'string') {
    return [{ name: 'value', type: obj.type, description: obj.description || '', shape: obj.shape || null, dtype: obj.dtype || null }];
  }

  return Object.entries(obj).map(([name, portSchema]) => {
    const p = portSchema || {};
    return {
      name,
      type: p.type || ARRAY_TYPES.ANY,
      description: p.description || '',
      shape: p.shape || null,
      dtype: p.dtype || null,
    };
  });
}

/**
 * Compat: retorna só a PRIMEIRA porta de um schema, no formato antigo
 * { type, description, shape, dtype } — usado onde só um resumo/badge é
 * necessário (ex: card de técnica na lista), não a conexão real do grafo.
 * Para conectar nós, use `getPorts()` + `isValidConnection(srcType, tgtType)`.
 */
export function parseSchema(schema) {
  const ports = getPorts(schema);
  if (!ports.length) return { type: ARRAY_TYPES.ANY, description: '' };
  const { name, ...rest } = ports[0];
  return rest;
}
