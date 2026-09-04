'use strict';

const { pool } = require('../config/db');

// Tabelas que não têm soft-delete (deleted_at).
// ownResource pula a cláusula deleted_at para essas tabelas.
const TABLES_WITHOUT_SOFT_DELETE = new Set(['predictions', 'jobs']);

/**
 * Garante que o usuário autenticado só acessa/modifica seus próprios recursos.
 *
 * Uso: router.patch('/models/:id', authenticate, ownResource('models'), ...)
 *
 * - Tabelas com soft-delete: exige deleted_at IS NULL.
 * - Tabelas sem soft-delete (predictions, jobs): omite a cláusula.
 * - Admins passam direto.
 * - Suporta lookup por UUID (char-36) ou bigint.
 */
function ownResource(table) {
  return async (req, res, next) => {
    const resourceId = req.params.id;
    const userId     = req.user.sub;

    const isUuid      = /^[0-9a-f-]{36}$/i.test(resourceId);
    const idClause    = isUuid ? 'uuid = ?' : 'id = ?';
    const idValue     = isUuid ? resourceId : Number(resourceId);
    const softDelete  = TABLES_WITHOUT_SOFT_DELETE.has(table)
      ? ''
      : 'AND deleted_at IS NULL';

    const [rows] = await pool.query(
      `SELECT user_id FROM \`${table}\` WHERE ${idClause} ${softDelete} LIMIT 1`,
      [idValue]
    );

    if (!rows.length) {
      return res.status(404).json({ message: 'Recurso não encontrado.' });
    }

    // Admins passam direto
    if (req.user.role === 'admin') return next();

    if (rows[0].user_id !== userId) {
      return res.status(403).json({ message: 'Acesso negado.' });
    }

    return next();
  };
}

/**
 * Carrega o perfil completo do usuário autenticado e anexa em req.profile.
 * Útil para rotas que precisam de dados além do payload do JWT.
 */
async function loadProfile(req, res, next) {
  const [rows] = await pool.query(
    `SELECT id, uuid, name, initials, email, research_area, institution,
            stat_models, stat_analyses, stat_datasets,
            stat_public_analyses, stat_private_analyses,
            role, is_active
     FROM users
     WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
    [req.user.sub]
  );

  if (!rows.length || !rows[0].is_active) {
    return res.status(401).json({ message: 'Usuário inativo ou não encontrado.' });
  }

  req.profile = rows[0];
  return next();
}

/**
 * Bloqueia rotas para usuários com conta desativada.
 * Use APÓS authenticate quando loadProfile não for necessário.
 */
async function requireActive(req, res, next) {
  const [rows] = await pool.query(
    'SELECT is_active FROM users WHERE id = ? AND deleted_at IS NULL LIMIT 1',
    [req.user.sub]
  );

  if (!rows.length || !rows[0].is_active) {
    return res.status(403).json({ message: 'Conta desativada.' });
  }

  return next();
}

module.exports = { ownResource, loadProfile, requireActive };