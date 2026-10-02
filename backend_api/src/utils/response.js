'use strict';

/**
 * Resposta de sucesso padronizada.
 * { data, meta, error: null }
 */
function ok(res, data, meta = null, status = 200) {
  return res.status(status).json({ data, meta, error: null });
}

/**
 * Resposta de criação (201).
 */
function created(res, data, meta = null) {
  return ok(res, data, meta, 201);
}

/**
 * 202 Accepted — job enfileirado.
 */
function accepted(res, data) {
  return ok(res, data, null, 202);
}

/**
 * 204 No Content — soft delete, sem corpo.
 */
function noContent(res) {
  return res.status(204).end();
}

/**
 * Erro padronizado.
 * { data: null, meta: null, error: { code, message, details? } }
 */
function error(res, status, code, message, details = null) {
  const payload = { code, message };
  if (details) payload.details = details;
  return res.status(status).json({ data: null, meta: null, error: payload });
}

function badRequest(res, message, details) {
  return error(res, 400, 'BAD_REQUEST', message, details);
}

function notFound(res, entity = 'Recurso') {
  return error(res, 404, 'NOT_FOUND', `${entity} não encontrado.`);
}

function forbidden(res, message = 'Você não tem permissão para esta ação.') {
  return error(res, 403, 'FORBIDDEN', message);
}

function unprocessable(res, details) {
  return error(res, 422, 'VALIDATION_ERROR', 'Dados inválidos.', details);
}

function serverError(res, err) {
  console.error('[Server Error]', err);
  return error(res, 500, 'INTERNAL_ERROR', 'Erro interno do servidor.');
}

/**
 * Helper de paginação: calcula offset e monta meta.
 */
function paginate(req, total) {
  const page = Math.max(1, parseInt(req.query.page || '1', 10));
  const per_page = Math.max(1, Math.min(100, parseInt(req.query.per_page || '20', 10)));
  const offset = (page - 1) * per_page;
  const total_pages = Math.ceil(total / per_page);
  return {
    offset,
    limit: per_page,
    meta: { page, per_page, total, total_pages },
  };
}

module.exports = {
  ok, created, accepted, noContent, error,
  badRequest, notFound, forbidden, unprocessable, serverError,
  paginate,
};
