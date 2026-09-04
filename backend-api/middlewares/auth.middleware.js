'use strict';

const jwt = require('jsonwebtoken');

/**
 * Verifica o access token JWT enviado no header Authorization.
 *
 * Popula req.user com o payload completo do token:
 *   { sub, email, role, iat, exp }
 *
 * IMPORTANTE: o auth.controller deve incluir `role` ao gerar o token:
 *   jwt.sign({ sub: user.id, email: user.email, role: user.role }, secret, { expiresIn })
 */
function authenticate(req, res, next) {
  const header = req.headers.authorization;

  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Token não fornecido.' });
  }

  const token = header.slice(7);

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    return next();
  } catch (err) {
    const message = err.name === 'TokenExpiredError'
      ? 'Token expirado.'
      : 'Token inválido.';
    return res.status(401).json({ message });
  }
}

/**
 * Middleware opcional: tenta autenticar mas não bloqueia se não houver token.
 * Útil para rotas públicas que exibem conteúdo diferente para usuários logados
 * (ex: GET /datasets lista públicos para todos, mas mostra privados para o dono).
 *
 * Se o token existir e for válido, popula req.user normalmente.
 * Se não houver token ou for inválido, req.user fica undefined e segue adiante.
 */
function optionalAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return next();

  try {
    req.user = jwt.verify(header.slice(7), process.env.JWT_SECRET);
  } catch {
    // token inválido/expirado — trata como anônimo
  }
  return next();
}

/**
 * Restringe a rota a usuários com role específica.
 * Deve ser usado APÓS authenticate.
 *
 * Uso: router.get('/admin/users', authenticate, requireRole('admin'), listUsers)
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user?.role)) {
      return res.status(403).json({ message: 'Acesso negado.' });
    }
    return next();
  };
}

module.exports = { authenticate, optionalAuth, requireRole };