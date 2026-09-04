'use strict';

const XLSX = require('xlsx');
const { pool } = require('../config/db');

// ─── Constantes ───────────────────────────────────────────────────────────────

const VALID_TECHNIQUES = ['NIR', 'Raman', 'FTIR', 'UV-Vis', 'NMR', 'Fluorescence', 'Other'];
const VALID_X_UNITS = ['nm', 'cm-1', 'eV', 'ppm', 'THz'];
const VALID_Y_UNITS = ['Absorbance', 'Transmittance', 'Reflectance', 'Intensity', 'Kubelka-Munk', 'Other'];

// ─── Padrões de detecção de colunas de metadados ─────────────────────────────

const META_PATTERNS = {
  name: /^(sample[_\-\s]?id|sample[_\-\s]?name|sampleid|samplename|name|nome|id|amostra|sample|specimen|obs|observation)$/i,
  class: /^(class|classe|label|grupo|group|category|cat|target|y|response|resposta|type|tipo|cultivar|variety|variedade)$/i,
  set: /^(set|split|subset|partition|fold|train|test|training|validation|val|holdout|grupo_set)$/i,
  xAxis: /^(wavenumber|wavenumbers|wavelength|wavelengths|comprimento[_\s]?de[_\s]?onda|numero[_\s]?de[_\s]?onda|nm|cm-1|ev|ppm|thz|x|axis|eixo|freq|frequency|frequencia|shift|raman[_\s]?shift)$/i,
};

// ─── Helpers gerais ───────────────────────────────────────────────────────────

function parseJson(v) {
  if (!v) return null;
  return typeof v === 'string' ? JSON.parse(v) : v;
}

function normalizeSpectrum(row) {
  if (!row) return null;
  return {
    ...row,
    x_values: parseJson(row.x_values),
    y_values: parseJson(row.y_values),
    reference_values: parseJson(row.reference_values),
    metadata: parseJson(row.metadata),
  };
}

function validateRequired(body, fields) {
  for (const f of fields) {
    if (!body[f]) return `Campo "${f}" é obrigatório.`;
  }
  return null;
}

/** Tenta converter um valor para número, retornando NaN se não for possível. */
function toNum(v) {
  if (v == null) return NaN;
  const s = String(v).trim().replace(',', '.');
  return parseFloat(s);
}

/** Verifica se um valor de célula é numérico válido. */
function isNumeric(v) {
  return !isNaN(toNum(v));
}

/**
 * Analisa uma amostra das linhas do arquivo (até 15 linhas × todas as colunas)
 * e retorna um LayoutInfo descrevendo como ler o arquivo completo.
 *
 * Layouts suportados:
 *
 *  A) samples-as-rows  (linhas = amostras, colunas = variáveis)
 *     Exemplo — OLIVES_NIR.csv:
 *       header: [Sample-id, set, Class, 4204.057, 4207.914, ...]
 *       dados:  [1, training, 1, -1.085, -1.085, ...]
 *
 *  B) samples-as-cols  (colunas = amostras, linhas = variáveis — "transposto")
 *     Exemplo — formato TcheLab clássico:
 *       header: [Wavenumber, Amostra1, Amostra2, ...]
 *       dados:  [240.16, 139, 147, ...]
 *
 *  C) x-only-rows  (linhas = amostras, sem coluna de X explícita no header)
 *     Exemplo — header já é numérico, primeira coluna também é dado:
 *       header: [4204.057, 4207.914, ...]
 *       dados:  [-1.085, -1.085, ...]
 *     Nesse caso os X vêm do próprio header.
 *
 * @param {Array<Array<any>>} rows  Todas as linhas lidas pelo XLSX
 * @returns {LayoutInfo}
 */
function detectLayout(rows) {
  const header = rows[0] || [];
  const dataRows = rows.slice(1, 16); // amostra de até 15 linhas de dados
  const numCols = header.length;

  // ── Passo 1: classifica cada coluna do header ─────────────────────────────

  const colRoles = header.map((cell, colIdx) => {
    const label = cell != null ? String(cell).trim() : '';

    // Testa padrões de metadados por nome
    if (META_PATTERNS.name.test(label)) return { idx: colIdx, role: 'name', label };
    if (META_PATTERNS.class.test(label)) return { idx: colIdx, role: 'class', label };
    if (META_PATTERNS.set.test(label)) return { idx: colIdx, role: 'set', label };
    if (META_PATTERNS.xAxis.test(label)) return { idx: colIdx, role: 'x', label };

    // Se a célula é numérica, provavelmente é um wavenumber/wavelength no header
    if (isNumeric(label)) return { idx: colIdx, role: 'data-header-num', label };

    // String não reconhecida — pode ser nome de amostra (layout transposto)
    return { idx: colIdx, role: 'unknown-string', label };
  });

  const byRole = (role) => colRoles.filter((c) => c.role === role);

  // ── Passo 2: conta colunas numéricas consecutivas no header ───────────────
  // Identifica onde começam os dados espectrais (após metadados)

  let firstDataCol = -1;
  let dataHeaderCount = 0;

  for (let i = 0; i < colRoles.length; i++) {
    const r = colRoles[i].role;
    if (r === 'data-header-num') {
      if (firstDataCol === -1) firstDataCol = i;
      dataHeaderCount++;
    } else if (firstDataCol !== -1) {
      // Parou de ser numérico após ter começado — ignora o resto
      break;
    }
  }

  // ── Passo 3: verifica se a coluna 0 dos dados é eixo-X (transposto) ───────

  const col0IsXAxis = (() => {
    if (byRole('x').length > 0 && byRole('x')[0].idx === 0) return true;
    // Heurística: se a col 0 do header é string não-numérica E os valores
    // da col 0 nas linhas de dados são todos numéricos e monotônicos
    if (isNumeric(header[0])) return false;
    const col0Values = dataRows.map((r) => toNum(r[0])).filter((v) => !isNaN(v));
    if (col0Values.length < 2) return false;
    const isMonotonic =
      col0Values.every((v, i) => i === 0 || v > col0Values[i - 1]) ||
      col0Values.every((v, i) => i === 0 || v < col0Values[i - 1]);
    // No layout transposto a col 0 tende a ser monotônica (eixo espectral)
    // No layout samples-as-rows a col 0 seria índice de amostra (1,2,3...) ou string
    // — também pode ser monotônica. Então verificamos adicionalmente se o
    // header linha 0 tem strings não-numéricas após a col 0 (nomes de amostras)
    const hasStringHeadersAfterCol0 = colRoles.slice(1).some(
      (c) => c.role === 'unknown-string' || c.role === 'name' || c.role === 'class'
    );
    return isMonotonic && !hasStringHeadersAfterCol0;
  })();

  // ── Passo 4: decide a orientação ─────────────────────────────────────────

  // Caso B — transposto: col 0 é X, restantes são amostras
  if (col0IsXAxis) {
    const nameCol = byRole('name')[0]?.idx ?? null;
    const classCol = byRole('class')[0]?.idx ?? null;
    const setCol = byRole('set')[0]?.idx ?? null;

    return {
      orientation: 'samples-as-cols',
      xCol: 0,
      nameCol,
      classCol,
      setCol,
      firstDataCol: 1,
      xValues: null, // será lido da col 0 das linhas
      metaCols: [nameCol, classCol, setCol].filter((c) => c != null),
      confidence: 'high',
      warnings: [],
    };
  }

  // Caso A — amostras em linhas, wavenumbers no header (com possíveis metadados)
  if (dataHeaderCount >= 3) {
    const nameCol = byRole('name')[0]?.idx ?? (firstDataCol > 0 ? 0 : null);
    const classCol = byRole('class')[0]?.idx ?? null;
    const setCol = byRole('set')[0]?.idx ?? null;

    // Extrai os X do próprio header
    const xValues = colRoles
      .filter((c) => c.role === 'data-header-num')
      .map((c) => toNum(c.label));

    // Monta lista de colunas de metadados (tudo antes de firstDataCol + explícitas)
    const metaIdxSet = new Set([
      ...Array.from({ length: firstDataCol }, (_, i) => i),
      ...[nameCol, classCol, setCol].filter((c) => c != null),
    ]);

    const warnings = [];
    if (firstDataCol === -1) {
      warnings.push('Nenhuma coluna numérica de wavenumber detectada no cabeçalho.');
    }

    return {
      orientation: 'samples-as-rows',
      xCol: null,
      nameCol,
      classCol,
      setCol,
      firstDataCol,
      xValues,
      metaCols: [...metaIdxSet],
      confidence: firstDataCol > 0 ? 'high' : 'medium',
      warnings,
    };
  }

  // Caso C — header já é todo numérico (sem coluna de nome/metadados)
  if (colRoles.every((c) => c.role === 'data-header-num')) {
    const xValues = header.map((v) => toNum(v));
    return {
      orientation: 'samples-as-rows',
      xCol: null,
      nameCol: null,
      classCol: null,
      setCol: null,
      firstDataCol: 0,
      xValues,
      metaCols: [],
      confidence: 'medium',
      warnings: ['Header totalmente numérico — amostras não terão nomes individuais.'],
    };
  }

  // Fallback: tenta transposto assumindo col 0 como X
  return {
    orientation: 'samples-as-cols',
    xCol: 0,
    nameCol: null,
    classCol: null,
    setCol: null,
    firstDataCol: 1,
    xValues: null,
    metaCols: [],
    confidence: 'low',
    warnings: ['Layout ambíguo — assumindo formato transposto (col 0 = X).'],
  };
}

// ─── Parsers orientados por layout ────────────────────────────────────────────

/**
 * Layout A/C: cada linha é uma amostra.
 * Os wavenumbers vêm do header (layout.xValues já extraídos).
 */
function parseRowOriented(rows, layout) {
  const { xValues, firstDataCol, nameCol, classCol, setCol } = layout;
  const spectra = [];

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.every((v) => v == null)) continue;

    // Nome da amostra
    let name = `Espectro_${r}`;
    if (nameCol != null && row[nameCol] != null) {
      name = String(row[nameCol]).trim() || name;
    }

    // Classe e set
    const sampleClass = classCol != null && row[classCol] != null
      ? String(row[classCol]).trim()
      : null;
    const sampleSet = setCol != null && row[setCol] != null
      ? String(row[setCol]).trim()
      : null;

    // Valores Y — apenas as colunas de dados espectrais
    const yValues = [];
    for (let c = firstDataCol; c < row.length && c < firstDataCol + xValues.length; c++) {
      const y = toNum(row[c]);
      if (isNaN(y)) {
        // Valor faltante — usa 0 e emite aviso implícito (poderia ser NaN)
        yValues.push(0);
      } else {
        yValues.push(y);
      }
    }

    // Descarta linhas sem nenhum dado numérico
    if (yValues.length === 0) continue;

    // Garante alinhamento com xValues
    const alignedX = xValues.slice(0, yValues.length);
    const alignedY = yValues.slice(0, alignedX.length);

    spectra.push({ name, xValues: alignedX, yValues: alignedY, sampleClass, sampleSet });
  }

  return spectra;
}

/**
 * Layout B: cada coluna é uma amostra.
 * Os nomes ficam no header[1..], o eixo X fica na col 0 de cada linha.
 */
function parseColOriented(rows, layout) {
  const header = rows[0] || [];
  const { firstDataCol } = layout;

  const names = header.slice(firstDataCol).map((v, i) =>
    v != null && String(v).trim() !== '' ? String(v).trim() : `Espectro_${i + 1}`
  );

  const spectra = names.map((name) => ({ name, xValues: [], yValues: [], sampleClass: null, sampleSet: null }));

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row) continue;
    const x = toNum(row[0]);
    if (isNaN(x)) continue; // linha de metadados ou cabeçalho extra

    row.slice(firstDataCol).forEach((v, i) => {
      if (i >= spectra.length) return;
      const y = toNum(v);
      if (!isNaN(y)) {
        spectra[i].xValues.push(x);
        spectra[i].yValues.push(y);
      }
    });
  }

  return spectra.filter((s) => s.xValues.length > 0);
}

// ─── Função principal de parsing de arquivo ───────────────────────────────────

/**
 * Lê um buffer de arquivo xlsx/xls/csv, detecta automaticamente o layout
 * e retorna um array de espectros com metadados individuais por amostra.
 *
 * @returns {{ spectra: Array, layout: LayoutInfo }}
 */
function parseFileSpectra(buffer, originalName) {
  const workbook = XLSX.read(buffer, { type: 'buffer', raw: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error('Arquivo sem planilhas.');

  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
    header: 1,
    defval: null,
    blankrows: false,
  });

  if (rows.length < 2)
    throw new Error('Arquivo deve ter ao menos um cabeçalho e uma linha de dados.');

  const layout = detectLayout(rows);

  let spectra;
  if (layout.orientation === 'samples-as-rows') {
    if (!layout.xValues || layout.xValues.length === 0)
      throw new Error('Não foi possível identificar os valores de X (wavenumber/wavelength) no cabeçalho.');
    spectra = parseRowOriented(rows, layout);
  } else {
    spectra = parseColOriented(rows, layout);
  }

  if (spectra.length === 0)
    throw new Error('Nenhum espectro encontrado no arquivo. Verifique o formato dos dados.');

  spectra.forEach((s) => {
    if (s.xValues.length === 0)
      throw new Error(`Espectro "${s.name}" não tem pontos espectrais.`);
  });

  return { spectra, layout };
}

// ─── Parseia texto colado pelo usuário ────────────────────────────────────────

/**
 * Parseia texto colado pelo usuário (copy-paste de Excel).
 * Aceita separadores: vírgula, ponto-e-vírgula, tab, pipe.
 * Ignora linhas de cabeçalho não-numéricas e linhas em branco.
 *
 * Retorna { xValues, yValues } ou lança erro.
 */
function parsePasteText(text) {
  const SEP = /[\t,;|]+/;
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) throw new Error('Texto vazio.');

  const xValues = [];
  const yValues = [];

  for (const line of lines) {
    const parts = line.split(SEP).map((p) => p.trim());
    if (parts.length < 2) continue;

    const x = Number(parts[0].replace(',', '.'));
    const y = Number(parts[1].replace(',', '.'));

    if (isNaN(x) || isNaN(y)) continue; // linha de cabeçalho — ignora

    xValues.push(x);
    yValues.push(y);
  }

  if (xValues.length === 0)
    throw new Error('Nenhum par numérico (x, y) encontrado. Verifique o formato do texto.');

  return { xValues, yValues };
}

// ─── POST /spectra/import — upload de arquivo ─────────────────────────────────

async function importFromFile(req, res) {
  if (!req.file)
    return res.status(400).json({ message: 'Arquivo não enviado.' });

  const { technique, x_unit, y_unit, visibility = 'private', sample_class } = req.body;

  const err = validateRequired(req.body, ['technique', 'x_unit', 'y_unit']);
  if (err) return res.status(400).json({ message: err });

  if (!VALID_TECHNIQUES.includes(technique))
    return res.status(400).json({ message: `technique inválido. Aceitos: ${VALID_TECHNIQUES.join(', ')}` });
  if (!VALID_X_UNITS.includes(x_unit))
    return res.status(400).json({ message: `x_unit inválido. Aceitos: ${VALID_X_UNITS.join(', ')}` });
  if (!VALID_Y_UNITS.includes(y_unit))
    return res.status(400).json({ message: `y_unit inválido. Aceitos: ${VALID_Y_UNITS.join(', ')}` });
  if (!['public', 'private'].includes(visibility))
    return res.status(400).json({ message: 'visibility deve ser "public" ou "private".' });

  let fileSpectra, layout;
  try {
    ({ spectra: fileSpectra, layout } = parseFileSpectra(req.file.buffer, req.file.originalname));
  } catch (e) {
    return res.status(422).json({ message: `Erro ao ler arquivo: ${e.message}` });
  }

  const classesFound = [...new Set(fileSpectra.map((s) => s.sampleClass).filter(Boolean))];
  const setsFound    = [...new Set(fileSpectra.map((s) => s.sampleSet).filter(Boolean))];

  // Pré-computa os dados de cada espectro uma única vez
  const rows = fileSpectra.map((s) => ({
    name:          s.name,
    sampleClass:   s.sampleClass ?? sample_class ?? null,
    metadata:      s.sampleSet ? JSON.stringify({ set: s.sampleSet }) : null,
    xValuesJson:   JSON.stringify(s.xValues),
    yValuesJson:   JSON.stringify(s.yValues),
    xPoints:       s.xValues.length,
    xMin:          Math.min(...s.xValues),
    xMax:          Math.max(...s.xValues),
  }));

  const CHUNK_SIZE = 50;
  const inserted   = [];

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
      const chunk       = rows.slice(i, i + CHUNK_SIZE);
      const placeholders = chunk.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
      const values       = [];

      for (const r of chunk) {
        values.push(
          req.user.sub, r.name, technique, x_unit, y_unit,
          r.xValuesJson, r.yValuesJson,
          r.xPoints, r.xMin, r.xMax,
          r.sampleClass, r.metadata,
          'file', req.file.originalname, visibility
        );
      }

      const [result] = await conn.query(
        `INSERT INTO spectra
           (user_id, name, technique, x_unit, y_unit,
            x_values, y_values, x_points, x_min, x_max,
            sample_class, metadata, source, source_filename, visibility)
         VALUES ${placeholders}`,
        values
      );

      // MySQL garante que IDs de um bulk INSERT são contíguos:
      // insertId = primeiro ID do chunk, affectedRows = quantos foram inseridos
      const firstId = result.insertId;
      chunk.forEach((r, idx) => {
        inserted.push({
          id:           firstId + idx,
          name:         r.name,
          sample_class: r.sampleClass,
        });
      });
    }

    await conn.commit();

    return res.status(201).json({
      message:         `${inserted.length} espectro(s) importado(s).`,
      spectra_count:   inserted.length,
      spectra:         inserted,
      detected_layout: {
        orientation:           layout.orientation,
        confidence:            layout.confidence,
        x_points:              fileSpectra[0]?.xValues?.length ?? 0,
        meta_columns_detected: buildMetaColumnsSummary(layout),
        classes_found:         classesFound,
        sets_found:            setsFound,
        warnings:              layout.warnings,
      },
    });
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

/** Monta um resumo legível das colunas de metadados detectadas. */
function buildMetaColumnsSummary(layout) {
  const summary = [];
  if (layout.nameCol != null) summary.push(`coluna ${layout.nameCol} → nome`);
  if (layout.classCol != null) summary.push(`coluna ${layout.classCol} → classe`);
  if (layout.setCol != null) summary.push(`coluna ${layout.setCol} → set/split`);
  return summary;
}

// ─── POST /spectra/scan — endpoint de pré-visualização de layout ──────────────

/**
 * Recebe um arquivo e retorna o layout detectado + primeiras amostras,
 * SEM persistir nada. Usado pelo frontend para mostrar um preview antes
 * de confirmar a importação.
 *
 * Resposta:
 * {
 *   layout: { orientation, confidence, x_points, meta_columns_detected,
 *              classes_found, sets_found, warnings },
 *   preview: [ { name, sample_class, sample_set, x_first, x_last, y_points } ]
 * }
 */
async function scanFile(req, res) {
  if (!req.file)
    return res.status(400).json({ message: 'Arquivo não enviado.' });

  let fileSpectra, layout;
  try {
    ({ spectra: fileSpectra, layout } = parseFileSpectra(req.file.buffer, req.file.originalname));
  } catch (e) {
    return res.status(422).json({ message: `Erro ao analisar arquivo: ${e.message}` });
  }

  const classesFound = [...new Set(fileSpectra.map((s) => s.sampleClass).filter(Boolean))];
  const setsFound = [...new Set(fileSpectra.map((s) => s.sampleSet).filter(Boolean))];

  // Preview com no máximo 10 amostras
  const preview = fileSpectra.slice(0, 10).map((s) => ({
    name: s.name,
    sample_class: s.sampleClass,
    sample_set: s.sampleSet,
    x_first: s.xValues[0],
    x_last: s.xValues[s.xValues.length - 1],
    y_points: s.yValues.length,
  }));

  return res.json({
    total_spectra: fileSpectra.length,
    layout: {
      orientation: layout.orientation,
      confidence: layout.confidence,
      x_points: fileSpectra[0]?.xValues?.length ?? 0,
      meta_columns_detected: buildMetaColumnsSummary(layout),
      classes_found: classesFound,
      sets_found: setsFound,
      warnings: layout.warnings,
    },
    preview,
  });
}

// ─── POST /spectra/paste — importação via copy-paste ─────────────────────────

async function importFromPaste(req, res) {
  const { name, text, technique, x_unit, y_unit,
    visibility = 'private', sample_class, description } = req.body;

  const err = validateRequired(req.body, ['name', 'text', 'technique', 'x_unit', 'y_unit']);
  if (err) return res.status(400).json({ message: err });

  if (!VALID_TECHNIQUES.includes(technique))
    return res.status(400).json({ message: `technique inválido. Aceitos: ${VALID_TECHNIQUES.join(', ')}` });
  if (!VALID_X_UNITS.includes(x_unit))
    return res.status(400).json({ message: `x_unit inválido. Aceitos: ${VALID_X_UNITS.join(', ')}` });
  if (!VALID_Y_UNITS.includes(y_unit))
    return res.status(400).json({ message: `y_unit inválido. Aceitos: ${VALID_Y_UNITS.join(', ')}` });

  let xValues, yValues;
  try {
    ({ xValues, yValues } = parsePasteText(text));
  } catch (e) {
    return res.status(422).json({ message: `Erro ao processar texto: ${e.message}` });
  }

  const xMin = Math.min(...xValues);
  const xMax = Math.max(...xValues);

  const [result] = await pool.query(
    `INSERT INTO spectra
       (user_id, name, description, technique, x_unit, y_unit,
        x_values, y_values, x_points, x_min, x_max,
        sample_class, source, visibility)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'paste', ?)`,
    [
      req.user.sub, name, description ?? null,
      technique, x_unit, y_unit,
      JSON.stringify(xValues), JSON.stringify(yValues),
      xValues.length, xMin, xMax,
      sample_class ?? null,
      visibility,
    ]
  );

  const [[spectrum]] = await pool.query(
    'SELECT * FROM spectra WHERE id = ?', [result.insertId]
  );

  return res.status(201).json({
    message: 'Espectro importado via paste.',
    spectrum: normalizeSpectrum(spectrum),
  });
}

// ─── GET /spectra ─────────────────────────────────────────────────────────────

async function listSpectra(req, res) {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, parseInt(req.query.limit) || 20);
  const offset = (page - 1) * limit;

  let where = 's.deleted_at IS NULL';
  const params = [];

  if (req.user) {
    where += ' AND (s.visibility = "public" OR s.user_id = ?)';
    params.push(req.user.sub);
  } else {
    where += ' AND s.visibility = "public"';
  }

  if (req.query.technique) { where += ' AND s.technique = ?'; params.push(req.query.technique); }
  if (req.query.sample_class) { where += ' AND s.sample_class = ?'; params.push(req.query.sample_class); }

  const [rows] = await pool.query(
    `SELECT s.id, s.uuid, s.name, s.description, s.technique,
            s.x_unit, s.y_unit, s.x_points, s.x_min, s.x_max,
            s.sample_class, s.source, s.visibility,
            s.reference_value, s.reference_values,
            s.created_at, s.updated_at,
            u.name AS owner_name, u.initials AS owner_initials
     FROM spectra s
     JOIN users u ON u.id = s.user_id
     WHERE ${where}
     ORDER BY s.created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total FROM spectra s WHERE ${where}`, params
  );

  return res.json({
    data: rows.map((r) => ({ ...r, reference_values: parseJson(r.reference_values) })),
    total, page, limit,
  });
}

// ─── GET /spectra/:id ─────────────────────────────────────────────────────────

async function getSpectrum(req, res) {
  const [rows] = await pool.query(
    `SELECT s.*, u.name AS owner_name, u.initials AS owner_initials
     FROM spectra s
     JOIN users u ON u.id = s.user_id
     WHERE s.id = ? AND s.deleted_at IS NULL LIMIT 1`,
    [req.params.id]
  );

  const spectrum = rows[0];
  if (!spectrum)
    return res.status(404).json({ message: 'Espectro não encontrado.' });

  if (spectrum.visibility === 'private' && (!req.user || req.user.sub !== spectrum.user_id))
    return res.status(403).json({ message: 'Acesso negado.' });

  return res.json(normalizeSpectrum(spectrum));
}

// ─── PATCH /spectra/:id ───────────────────────────────────────────────────────

async function updateSpectrum(req, res) {
  const ALLOWED = [
    'name', 'description', 'visibility',
    'sample_class', 'reference_value', 'metadata',
  ];
  const fields = {};
  for (const key of ALLOWED) {
    if (key in req.body) {
      fields[key] = key === 'metadata' || key === 'reference_values'
        ? JSON.stringify(req.body[key])
        : req.body[key];
    }
  }

  if ('reference_values' in req.body) {
    fields.reference_values = JSON.stringify(req.body.reference_values);
  }

  if (!Object.keys(fields).length)
    return res.status(400).json({ message: 'Nenhum campo válido para atualizar.' });

  const setClause = Object.keys(fields).map((k) => `${k} = ?`).join(', ');
  const [result] = await pool.query(
    `UPDATE spectra SET ${setClause}
     WHERE id = ? AND user_id = ? AND deleted_at IS NULL`,
    [...Object.values(fields), req.params.id, req.user.sub]
  );

  if (!result.affectedRows)
    return res.status(404).json({ message: 'Espectro não encontrado.' });

  const [[spectrum]] = await pool.query(
    'SELECT * FROM spectra WHERE id = ?', [req.params.id]
  );
  return res.json(normalizeSpectrum(spectrum));
}

// ─── DELETE /spectra/:id ──────────────────────────────────────────────────────

async function deleteSpectrum(req, res) {
  const [result] = await pool.query(
    `UPDATE spectra SET deleted_at = NOW()
     WHERE id = ? AND user_id = ? AND deleted_at IS NULL`,
    [req.params.id, req.user.sub]
  );

  if (!result.affectedRows)
    return res.status(404).json({ message: 'Espectro não encontrado.' });

  return res.json({ message: 'Espectro removido.' });
}

// ─── GET /spectra/mine ────────────────────────────────────────────────────────

// ─── GET /spectra/mine — versão com filtros estendidos ───────────────────────
// Substitui a função listMySpectra no spectra.controller.js
//
// Novos query params suportados:
//   no_collection  = "true"  → apenas espectros que não estão em nenhuma coleção
//   collection_id  = <id>    → apenas espectros que pertencem a essa coleção
//   date_from      = "YYYY-MM-DD"
//   date_to        = "YYYY-MM-DD"
//   technique      = já existia
//   sample_class   = já existia

async function listMySpectra(req, res) {
  const page   = Math.max(1, parseInt(req.query.page)  || 1);
  const limit  = Math.min(100, parseInt(req.query.limit) || 20);
  const offset = (page - 1) * limit;

  let where  = 's.user_id = ? AND s.deleted_at IS NULL';
  const params = [req.user.sub];

  // Filtro de técnica
  if (req.query.technique) {
    where += ' AND s.technique = ?';
    params.push(req.query.technique);
  }

  // Filtro de classe
  if (req.query.sample_class) {
    where += ' AND s.sample_class = ?';
    params.push(req.query.sample_class);
  }

  // Filtro de data
  if (req.query.date_from) {
    where += ' AND DATE(s.created_at) >= ?';
    params.push(req.query.date_from);
  }
  if (req.query.date_to) {
    where += ' AND DATE(s.created_at) <= ?';
    params.push(req.query.date_to);
  }

  // Filtro: apenas espectros SEM nenhuma coleção
  if (req.query.no_collection === 'true') {
    where += ` AND NOT EXISTS (
      SELECT 1 FROM collection_spectra cs
      WHERE cs.spectrum_id = s.id
    )`;
  }

  // Filtro: apenas espectros DE uma coleção específica
  if (req.query.collection_id) {
    where += ` AND EXISTS (
      SELECT 1 FROM collection_spectra cs
      WHERE cs.spectrum_id = s.id AND cs.collection_id = ?
    )`;
    params.push(req.query.collection_id);
  }

  const [rows] = await pool.query(
    `SELECT s.id, s.uuid, s.name, s.description, s.technique, s.x_unit, s.y_unit,
            s.x_points, s.x_min, s.x_max, s.sample_class, s.source,
            s.visibility, s.reference_value, s.reference_values,
            s.created_at, s.updated_at
     FROM spectra s
     WHERE ${where}
     ORDER BY s.created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total FROM spectra s WHERE ${where}`,
    params
  );

  return res.json({
    data: rows.map((r) => ({ ...r, reference_values: parseJson(r.reference_values) })),
    total, page, limit,
  });
}

module.exports = {
  importFromFile,
  importFromPaste,
  scanFile,
  listSpectra,
  listMySpectra,
  getSpectrum,
  updateSpectrum,
  deleteSpectrum,
  // Exporta as funções de parsing para uso em testes unitários
  _detectLayout: detectLayout,
  _parseFileSpectra: parseFileSpectra,
};