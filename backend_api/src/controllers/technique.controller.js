'use strict';

const { v4: uuidv4 } = require('uuid');
const db = require('../config/db.config');
const R = require('../utils/response');

// GET /techniques
async function listTechniques(req, res) {
  try {
    const { category, family, min_order, max_order, requires_sample_axis, is_beta, is_custom, include_inactive } = req.query;
    const conditions = ['(is_custom = 0 OR user_id = ?)'];
    const params = [req.user.id];

    // Versão beta: só técnicas marcadas active=1 aparecem pro usuário comum
    // (editor de workflow, etc). A página de Catálogo passa include_inactive=true
    // pra listar tudo (ativas + "em desenvolvimento"), já que ali é documentação,
    // não execução. Técnicas customizadas do próprio usuário sempre aparecem.
    if (include_inactive !== 'true') {
      conditions.push('(active = 1 OR (is_custom = 1 AND user_id = ?))');
      params.push(req.user.id);
    }

    if (category) { conditions.push('category = ?'); params.push(category); }
    if (family) { conditions.push('family = ?'); params.push(family); }
    if (min_order !== undefined) { conditions.push('min_order >= ?'); params.push(min_order); }
    if (max_order !== undefined) { conditions.push('(max_order IS NULL OR max_order <= ?)'); params.push(max_order); }
    if (requires_sample_axis !== undefined) { conditions.push('requires_sample_axis = ?'); params.push(requires_sample_axis); }
    if (is_beta !== undefined) { conditions.push('is_beta = ?'); params.push(is_beta === 'true' ? 1 : 0); }
    if (is_custom !== undefined) { conditions.push('is_custom = ?'); params.push(is_custom === 'true' ? 1 : 0); }

    const where = conditions.join(' AND ');
    const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total FROM techniques WHERE ${where}`, params);
    const { offset, limit, meta } = R.paginate(req, total);

    const [rows] = await db.query(
      // `active` entra aqui pra página de Catálogo (que sempre passa
      // include_inactive=true) mostrar o badge "ativo"/"em desenvolvimento"
      // sem precisar de um GET /techniques/:id por linha.
      `SELECT id, uuid, slug, name, category, family, description, min_order, max_order,
              requires_sample_axis, input_schema, output_schema, parameter_schema, tags,
              is_beta, is_custom, active
       FROM techniques WHERE ${where} ORDER BY category, family, name LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    );
    return R.ok(res, rows, { ...meta, total });
  } catch (err) { return R.serverError(res, err); }
}

// GET /techniques/categories
async function listCategories(req, res) {
  try {
    const [rows] = await db.query(
      'SELECT DISTINCT category, family FROM techniques WHERE is_custom = 0 ORDER BY category, family',
    );
    const grouped = {};
    for (const row of rows) {
      if (!grouped[row.category]) grouped[row.category] = [];
      if (!grouped[row.category].includes(row.family)) grouped[row.category].push(row.family);
    }
    return R.ok(res, grouped);
  } catch (err) { return R.serverError(res, err); }
}

// GET /techniques/:id
async function getTechnique(req, res) {
  try {
    const [rows] = await db.query(
      'SELECT * FROM techniques WHERE uuid = ?',
      [req.params.id],
    );
    if (!rows.length) return R.notFound(res, 'Técnica');
    return R.ok(res, rows[0]);
  } catch (err) { return R.serverError(res, err); }
}

// GET /techniques/:id/compatibilities
async function getCompatibilities(req, res) {
  try {
    const [tech] = await db.query('SELECT id FROM techniques WHERE uuid = ?', [req.params.id]);
    if (!tech.length) return R.notFound(res, 'Técnica');
    const [rows] = await db.query(
      `SELECT tc.*, t.slug AS target_slug, t.name AS target_name
       FROM technique_compatibilities tc
       JOIN techniques t ON t.id = tc.target_technique_id
       WHERE tc.source_technique_id = ?`,
      [tech[0].id],
    );
    return R.ok(res, rows);
  } catch (err) { return R.serverError(res, err); }
}

// POST /techniques  (customizada)
async function createCustomTechnique(req, res) {
  try {
    const {
      name, slug, description, custom_definition, tags,
      category, family,
    } = req.body;

    if (!name || !custom_definition) {
      return R.unprocessable(res, [
        { field: 'name', message: 'Obrigatório.' },
        { field: 'custom_definition', message: 'Obrigatório.' },
      ].filter((f) => !req.body[f.field]));
    }

    // Valida que todos os slugs existem no catálogo
    const ops = Array.isArray(custom_definition) ? custom_definition : JSON.parse(custom_definition);
    for (const op of ops) {
      const [tech] = await db.query('SELECT id FROM techniques WHERE slug = ? AND is_custom = 0', [op.slug]);
      if (!tech.length) {
        return R.unprocessable(res, [{ field: 'custom_definition', message: `Slug "${op.slug}" não encontrado no catálogo.` }]);
      }
    }

    const uuid = uuidv4();
    const techSlug = slug || `custom_${req.user.id}_${Date.now()}`;
    const [result] = await db.query(
      `INSERT INTO techniques
         (uuid, slug, name, description, category, family, tags, is_custom, user_id, custom_definition, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, NOW(), NOW())`,
      [
        uuid, techSlug, name, description || null,
        category || 'custom', family || 'custom',
        JSON.stringify(tags || []),
        req.user.id,
        JSON.stringify(ops),
      ],
    );
    const [rows] = await db.query('SELECT * FROM techniques WHERE id = ?', [result.insertId]);
    return R.created(res, rows[0]);
  } catch (err) { return R.serverError(res, err); }
}

// PUT /techniques/:id
async function updateCustomTechnique(req, res) {
  try {
    const [rows] = await db.query('SELECT * FROM techniques WHERE uuid = ?', [req.params.id]);
    if (!rows.length) return R.notFound(res, 'Técnica');
    const tech = rows[0];
    if (!tech.is_custom) return R.forbidden(res, 'Técnicas nativas não podem ser alteradas.');
    if (tech.user_id !== req.user.id) return R.forbidden(res);

    const { name, description, custom_definition, tags } = req.body;
    await db.query(
      `UPDATE techniques SET
         name = COALESCE(?, name), description = COALESCE(?, description),
         custom_definition = COALESCE(?, custom_definition),
         tags = COALESCE(?, tags), updated_at = NOW()
       WHERE id = ?`,
      [name || null, description || null,
        custom_definition ? JSON.stringify(custom_definition) : null,
        tags ? JSON.stringify(tags) : null,
        tech.id],
    );
    const [updated] = await db.query('SELECT * FROM techniques WHERE id = ?', [tech.id]);
    return R.ok(res, updated[0]);
  } catch (err) { return R.serverError(res, err); }
}

// DELETE /techniques/:id
async function deleteCustomTechnique(req, res) {
  try {
    const [rows] = await db.query('SELECT * FROM techniques WHERE uuid = ?', [req.params.id]);
    if (!rows.length) return R.notFound(res, 'Técnica');
    const tech = rows[0];
    if (!tech.is_custom) return R.forbidden(res, 'Técnicas nativas não podem ser removidas.');
    if (tech.user_id !== req.user.id && req.user.role !== 'admin') return R.forbidden(res);
    await db.query('DELETE FROM techniques WHERE id = ?', [tech.id]);
    return R.noContent(res);
  } catch (err) { return R.serverError(res, err); }
}

module.exports = {
  listTechniques, listCategories, getTechnique, getCompatibilities,
  createCustomTechnique, updateCustomTechnique, deleteCustomTechnique,
};
