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
export const ARRAY_TYPES = {
  MATRIX_2D:    '2D',       // Matriz amostras × variáveis
  ARRAY_3D:     '3D',       // Cubo amostras × variáveis × tempo (ex: EEM, NIR-2D)
  ARRAY_ND:     'ND',       // N-way genérico
  VECTOR:       'vetor',    // Vetor de referência y
  SCALAR:       'escalar',  // Valor único
  FIGURES:      'figuras',  // Conjunto de figuras/plots
  MODEL:        'modelo',   // Objeto modelo treinado
  LOADINGS:     'loadings', // Matriz de loadings/scores
  PREDICTION:   'pred',     // Vetor de predições
  LABELS:       'labels',   // Rótulos de classe
  DATASET:      'dataset',  // Dataset bruto (nó de entrada)
  ANY:          '*',        // Aceita qualquer tipo
};

// ── Famílias e seus metadados visuais ────────────────────────────────────────
// Chave = slug da família no banco (techniques.family)
export const FAMILIES = {
  '01_dados': {
    label:    { pt: 'Dados & I/O',            en: 'Data & I/O' },
    color:    '#64748b',
    bg:       'rgba(100,116,139,0.15)',
    border:   'rgba(100,116,139,0.4)',
    category: 'entrada',
    order:    1,
  },
  '02_pre_processamento': {
    label:    { pt: 'Pré-processamento',       en: 'Pre-processing' },
    color:    '#0ea5e9',
    bg:       'rgba(14,165,233,0.12)',
    border:   'rgba(14,165,233,0.4)',
    category: 'transformacao',
    order:    2,
  },
  '03_decomposicao': {
    label:    { pt: 'Decomposição',            en: 'Decomposition' },
    color:    '#8b5cf6',
    bg:       'rgba(139,92,246,0.12)',
    border:   'rgba(139,92,246,0.4)',
    category: 'analise',
    order:    3,
  },
  '04_regressao': {
    label:    { pt: 'Regressão',               en: 'Regression' },
    color:    '#10b981',
    bg:       'rgba(16,185,129,0.12)',
    border:   'rgba(16,185,129,0.4)',
    category: 'modelagem',
    order:    4,
  },
  '05_classificacao': {
    label:    { pt: 'Classificação',           en: 'Classification' },
    color:    '#f59e0b',
    bg:       'rgba(245,158,11,0.12)',
    border:   'rgba(245,158,11,0.4)',
    category: 'modelagem',
    order:    5,
  },
  '06_clustering': {
    label:    { pt: 'Clustering',              en: 'Clustering' },
    color:    '#ec4899',
    bg:       'rgba(236,72,153,0.12)',
    border:   'rgba(236,72,153,0.4)',
    category: 'analise',
    order:    6,
  },
  '07_calibracao': {
    label:    { pt: 'Calibração',              en: 'Calibration' },
    color:    '#06b6d4',
    bg:       'rgba(6,182,212,0.12)',
    border:   'rgba(6,182,212,0.4)',
    category: 'modelagem',
    order:    7,
  },
  '08_validacao': {
    label:    { pt: 'Validação',               en: 'Validation' },
    color:    '#84cc16',
    bg:       'rgba(132,204,22,0.12)',
    border:   'rgba(132,204,22,0.4)',
    category: 'avaliacao',
    order:    8,
  },
  '09_selecao_variaveis': {
    label:    { pt: 'Seleção de Variáveis',    en: 'Variable Selection' },
    color:    '#f97316',
    bg:       'rgba(249,115,22,0.12)',
    border:   'rgba(249,115,22,0.4)',
    category: 'transformacao',
    order:    9,
  },
  '10_fusao': {
    label:    { pt: 'Fusão de Dados',          en: 'Data Fusion' },
    color:    '#6366f1',
    bg:       'rgba(99,102,241,0.12)',
    border:   'rgba(99,102,241,0.4)',
    category: 'transformacao',
    order:    10,
  },
  '11_n_way': {
    label:    { pt: 'N-way (3D+)',             en: 'N-way (3D+)' },
    color:    '#a855f7',
    bg:       'rgba(168,85,247,0.12)',
    border:   'rgba(168,85,247,0.4)',
    category: 'analise',
    order:    11,
  },
  '12_multibloco': {
    label:    { pt: 'Multi-Bloco',             en: 'Multi-Block' },
    color:    '#14b8a6',
    bg:       'rgba(20,184,166,0.12)',
    border:   'rgba(20,184,166,0.4)',
    category: 'analise',
    order:    12,
  },
  '13_augmented': {
    label:    { pt: 'Augmented',               en: 'Augmented' },
    color:    '#ef4444',
    bg:       'rgba(239,68,68,0.12)',
    border:   'rgba(239,68,68,0.4)',
    category: 'transformacao',
    order:    13,
  },
  '14_transferencia': {
    label:    { pt: 'Transferência',           en: 'Transfer' },
    color:    '#22c55e',
    bg:       'rgba(34,197,94,0.12)',
    border:   'rgba(34,197,94,0.4)',
    category: 'modelagem',
    order:    14,
  },
  '15_sensorial': {
    label:    { pt: 'Análise Sensorial',       en: 'Sensory Analysis' },
    color:    '#fb923c',
    bg:       'rgba(251,146,60,0.12)',
    border:   'rgba(251,146,60,0.4)',
    category: 'analise',
    order:    15,
  },
  '16_quimiometria_imagem': {
    label:    { pt: 'Quimiometria de Imagem',  en: 'Chemometric Imaging' },
    color:    '#38bdf8',
    bg:       'rgba(56,189,248,0.12)',
    border:   'rgba(56,189,248,0.4)',
    category: 'analise',
    order:    16,
  },
  '17_eletroquimica': {
    label:    { pt: 'Eletroquímica',           en: 'Electrochemistry' },
    color:    '#facc15',
    bg:       'rgba(250,204,21,0.12)',
    border:   'rgba(250,204,21,0.4)',
    category: 'analise',
    order:    17,
  },
  '18_espectrometria_massa': {
    label:    { pt: 'Espectrometria de Massa', en: 'Mass Spectrometry' },
    color:    '#c084fc',
    bg:       'rgba(192,132,252,0.12)',
    border:   'rgba(192,132,252,0.4)',
    category: 'analise',
    order:    18,
  },
  '19_temporais': {
    label:    { pt: 'Séries Temporais',        en: 'Time Series' },
    color:    '#34d399',
    bg:       'rgba(52,211,153,0.12)',
    border:   'rgba(52,211,153,0.4)',
    category: 'analise',
    order:    19,
  },
  '20_utilitarios': {
    label:    { pt: 'Utilitários',             en: 'Utilities' },
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
// COMPAT_MATRIX[sourceType][targetType] = true → conexão válida
const ANY = ARRAY_TYPES.ANY;
const M2D = ARRAY_TYPES.MATRIX_2D;
const A3D = ARRAY_TYPES.ARRAY_3D;
const AND = ARRAY_TYPES.ARRAY_ND;
const VEC = ARRAY_TYPES.VECTOR;
const MOD = ARRAY_TYPES.MODEL;
const LOA = ARRAY_TYPES.LOADINGS;
const PRE = ARRAY_TYPES.PREDICTION;
const LAB = ARRAY_TYPES.LABELS;
const FIG = ARRAY_TYPES.FIGURES;
const DST = ARRAY_TYPES.DATASET;

// Dataset de entrada pode se conectar a qualquer técnica
// Tipos 3D/ND não podem se conectar diretamente a técnicas 2D-only
export const COMPAT_MATRIX = {
  [DST]:  { [M2D]: true, [A3D]: true, [AND]: true, [VEC]: true, [ANY]: true },
  [M2D]:  { [M2D]: true, [VEC]: true, [MOD]: false, [LOA]: false, [ANY]: true },
  [A3D]:  { [A3D]: true, [AND]: true, [ANY]: true },
  [AND]:  { [AND]: true, [A3D]: true, [ANY]: true },
  [VEC]:  { [VEC]: true, [M2D]: true, [ANY]: true },
  [MOD]:  { [MOD]: true, [PRE]: true, [LOA]: true, [ANY]: true },
  [LOA]:  { [LOA]: true, [M2D]: true, [FIG]: true, [ANY]: true },
  [PRE]:  { [PRE]: true, [VEC]: true, [FIG]: true, [ANY]: true },
  [LAB]:  { [LAB]: true, [VEC]: true, [FIG]: true, [ANY]: true },
  [FIG]:  {},
  [ANY]:  { [M2D]: true, [A3D]: true, [AND]: true, [VEC]: true, [MOD]: true, [LOA]: true, [PRE]: true, [LAB]: true, [FIG]: true, [ANY]: true },
};

/**
 * Verifica se uma conexão entre dois nós é válida.
 * @param {object} sourceNode  — nó de origem (data.outputType)
 * @param {object} targetNode  — nó de destino (data.inputType)
 * @returns {{ valid: boolean, reason: string }}
 */
export function isValidConnection(sourceNode, targetNode) {
  const srcType = sourceNode?.data?.outputType || ANY;
  const tgtType = targetNode?.data?.inputType  || ANY;

  // ANY aceita tudo
  if (srcType === ANY || tgtType === ANY) return { valid: true, reason: '' };

  const row = COMPAT_MATRIX[srcType] || {};
  if (row[tgtType] || row[ANY]) return { valid: true, reason: '' };

  return {
    valid: false,
    reason: `Tipo de saída "${srcType}" não é compatível com entrada "${tgtType}"`,
  };
}

/**
 * Parseia o input_schema / output_schema vindo do banco (JSON string ou objeto).
 * Retorna { type, description } para exibição.
 */
export function parseSchema(schema) {
  if (!schema) return { type: ARRAY_TYPES.ANY, description: '' };
  const obj = typeof schema === 'string' ? (() => { try { return JSON.parse(schema); } catch { return {}; } })() : schema;
  return {
    type:        obj.type        || ARRAY_TYPES.ANY,
    description: obj.description || '',
    shape:       obj.shape       || null,
    dtype:       obj.dtype       || null,
  };
}
