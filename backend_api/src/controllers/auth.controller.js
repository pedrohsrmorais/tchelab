'use strict';

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/db.config');
const redis = require('../config/redis.config');
const jobService = require('../services/job.service');
const R = require('../utils/response');

const ACCESS_EXPIRES = process.env.JWT_EXPIRES_IN || '24h';
const REFRESH_EXPIRES = process.env.JWT_REFRESH_EXPIRES_IN || '30d';

function signAccess(user) {
  return jwt.sign(
    { id: user.id, uuid: user.uuid, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: ACCESS_EXPIRES },
  );
}

function signRefresh(user) {
  return jwt.sign(
    { id: user.id, uuid: user.uuid },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: REFRESH_EXPIRES },
  );
}

function safeUser(u) {
  const { password_hash, deleted_at, ...safe } = u;
  return safe;
}

// POST /auth/register
async function register(req, res) {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return R.unprocessable(res, [
        { field: 'name', message: 'Obrigatório.' },
        { field: 'email', message: 'Obrigatório.' },
        { field: 'password', message: 'Obrigatório.' },
      ].filter((f) => !req.body[f.field]));
    }
    if (password.length < 8) {
      return R.unprocessable(res, [{ field: 'password', message: 'Mínimo 8 caracteres.' }]);
    }

    const [existing] = await db.query('SELECT id FROM users WHERE email = ?', [email.toLowerCase()]);
    if (existing.length) {
      return R.unprocessable(res, [{ field: 'email', message: 'E-mail já cadastrado.' }]);
    }

    const password_hash = await bcrypt.hash(password, 12);
    const uuid = uuidv4();
    const [result] = await db.query(
      `INSERT INTO users (uuid, name, email, password_hash, created_at, updated_at)
       VALUES (?, ?, ?, ?, NOW(), NOW())`,
      [uuid, name.trim(), email.toLowerCase().trim(), password_hash],
    );

    const [rows] = await db.query('SELECT * FROM users WHERE id = ?', [result.insertId]);
    return R.created(res, safeUser(rows[0]));
  } catch (err) {
    return R.serverError(res, err);
  }
}

// POST /auth/login
async function login(req, res) {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return R.unprocessable(res, []);
    }

    const [rows] = await db.query(
      'SELECT * FROM users WHERE email = ? AND deleted_at IS NULL',
      [email.toLowerCase().trim()],
    );
    const user = rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return R.error(res, 401, 'INVALID_CREDENTIALS', 'E-mail ou senha incorretos.');
    }
    if (!user.is_active) {
      return R.error(res, 403, 'ACCOUNT_INACTIVE', 'Conta inativa.');
    }

    const access_token = signAccess(user);
    const refresh_token = signRefresh(user);

    return R.ok(res, { access_token, refresh_token, user: safeUser(user) });
  } catch (err) {
    return R.serverError(res, err);
  }
}

// POST /auth/logout
async function logout(req, res) {
  try {
    const token = req.token;
    if (token) {
      const decoded = jwt.decode(token);
      const ttl = decoded && decoded.exp ? decoded.exp - Math.floor(Date.now() / 1000) : 86400;
      if (ttl > 0) {
        await redis.set(`blacklist:${token}`, '1', 'EX', ttl);
      }
    }
    return R.ok(res, { message: 'Logout realizado com sucesso.' });
  } catch (err) {
    return R.serverError(res, err);
  }
}

// POST /auth/refresh
async function refresh(req, res) {
  try {
    const { refresh_token } = req.body;
    if (!refresh_token) {
      return R.unprocessable(res, [{ field: 'refresh_token', message: 'Obrigatório.' }]);
    }

    let payload;
    try {
      payload = jwt.verify(refresh_token, process.env.JWT_REFRESH_SECRET);
    } catch {
      return R.error(res, 401, 'TOKEN_INVALID', 'Refresh token inválido ou expirado.');
    }

    const [rows] = await db.query(
      'SELECT * FROM users WHERE id = ? AND deleted_at IS NULL AND is_active = 1',
      [payload.id],
    );
    if (!rows.length) return R.error(res, 401, 'USER_NOT_FOUND', 'Usuário não encontrado.');

    const user = rows[0];
    const access_token = signAccess(user);
    return R.ok(res, { access_token });
  } catch (err) {
    return R.serverError(res, err);
  }
}

// POST /auth/forgot-password
async function forgotPassword(req, res) {
  try {
    const { email } = req.body;
    if (!email) {
      return R.unprocessable(res, [{ field: 'email', message: 'Obrigatório.' }]);
    }

    const [rows] = await db.query(
      'SELECT id FROM users WHERE email = ? AND deleted_at IS NULL',
      [email.toLowerCase().trim()],
    );
    if (rows.length) {
      const resetToken = uuidv4();
      await redis.set(`reset:${resetToken}`, rows[0].id, 'EX', 3600); // 1h
      await jobService.createJob({
        job_type: 'send_email',
        user_id: rows[0].id,
        payload: { type: 'password_reset', email, reset_token: resetToken },
      });
    }
    // Sempre retorna ok para não vazar existência do e-mail
    return R.ok(res, { message: 'Se o e-mail existir, um link de redefinição será enviado.' });
  } catch (err) {
    return R.serverError(res, err);
  }
}

// POST /auth/reset-password
async function resetPassword(req, res) {
  try {
    const { token, password } = req.body;
    if (!token || !password) {
      return R.unprocessable(res, []);
    }
    if (password.length < 8) {
      return R.unprocessable(res, [{ field: 'password', message: 'Mínimo 8 caracteres.' }]);
    }

    const userId = await redis.get(`reset:${token}`);
    if (!userId) {
      return R.error(res, 400, 'TOKEN_INVALID', 'Token inválido ou expirado.');
    }

    const hash = await bcrypt.hash(password, 12);
    await db.query('UPDATE users SET password_hash = ?, updated_at = NOW() WHERE id = ?', [hash, userId]);
    await redis.del(`reset:${token}`);

    return R.ok(res, { message: 'Senha redefinida com sucesso.' });
  } catch (err) {
    return R.serverError(res, err);
  }
}

// GET /auth/me
async function me(req, res) {
  try {
    const [rows] = await db.query(
      'SELECT * FROM users WHERE id = ? AND deleted_at IS NULL',
      [req.user.id],
    );
    if (!rows.length) return R.notFound(res, 'Usuário');
    return R.ok(res, safeUser(rows[0]));
  } catch (err) {
    return R.serverError(res, err);
  }
}

module.exports = { register, login, logout, refresh, forgotPassword, resetPassword, me };
