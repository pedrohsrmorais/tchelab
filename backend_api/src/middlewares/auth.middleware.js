'use strict';

const jwt = require('jsonwebtoken');
const redis = require('../config/redis.config');

/**
 * Extrai o Bearer token do header Authorization.
 */
function extractToken(req) {
  const header = req.headers['authorization'] || '';
  if (!header.startsWith('Bearer ')) return null;
  return header.slice(7);
}

/**
 * Middleware principal: valida JWT e verifica blacklist no Redis.
 */
async function authenticate(req, res, next) {
  const token = extractToken(req);
  if (!token) {
    return res.status(401).json({
      data: null,
      meta: null,
      error: { code: 'MISSING_TOKEN', message: 'Token de autenticação não informado.' },
    });
  }

  // Verifica blacklist
  try {
    const isBlacklisted = await redis.get(`blacklist:${token}`);
    if (isBlacklisted) {
      return res.status(401).json({
        data: null,
        meta: null,
        error: { code: 'TOKEN_REVOKED', message: 'Token revogado. Faça login novamente.' },
      });
    }
  } catch (redisErr) {
    // Se Redis estiver indisponível, continua sem blacklist (graceful degradation)
    console.error('[Auth] Redis indisponível para blacklist check:', redisErr.message);
  }

  // Verifica assinatura e expiração
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload; // { id, uuid, email, role, iat, exp }
    req.token = token;
    return next();
  } catch (err) {
    const code = err.name === 'TokenExpiredError' ? 'TOKEN_EXPIRED' : 'TOKEN_INVALID';
    return res.status(401).json({
      data: null,
      meta: null,
      error: { code, message: 'Token inválido ou expirado.' },
    });
  }
}

/**
 * Middleware de autorização por role.
 * Uso: authorize('admin') ou authorize('admin', 'moderator')
 */
function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        data: null,
        meta: null,
        error: { code: 'UNAUTHENTICATED', message: 'Não autenticado.' },
      });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        data: null,
        meta: null,
        error: { code: 'FORBIDDEN', message: 'Você não tem permissão para esta ação.' },
      });
    }
    return next();
  };
}

module.exports = { authenticate, authorize };
