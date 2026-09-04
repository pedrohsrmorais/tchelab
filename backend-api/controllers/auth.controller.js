'use strict';

const bcrypt = require('bcrypt');
const jwt    = require('jsonwebtoken');
const { pool } = require('../config/db');

const SALT_ROUNDS = 12;
const ACCESS_TTL  = '15m';
const REFRESH_TTL = '7d';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeInitials(name) {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function signAccess(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: ACCESS_TTL });
}

function signRefresh(payload) {
  return jwt.sign(payload, process.env.JWT_REFRESH_SECRET, { expiresIn: REFRESH_TTL });
}

// ─── POST /auth/register ──────────────────────────────────────────────────────

async function register(req, res) {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ message: 'name, email e password são obrigatórios.' });
  }

  const [existing] = await pool.query(
    'SELECT id FROM users WHERE email = ? LIMIT 1',
    [email]
  );
  if (existing.length) {
    return res.status(409).json({ message: 'E-mail já cadastrado.' });
  }

  const password_hash = await bcrypt.hash(password, SALT_ROUNDS);
  const initials      = makeInitials(name);

  const [result] = await pool.query(
    `INSERT INTO users (name, initials, email, password_hash) VALUES (?, ?, ?, ?)`,
    [name, initials, email, password_hash]
  );

  // Busca o usuário recém-criado para pegar role e demais campos
  const [[user]] = await pool.query(
    'SELECT id, email, role FROM users WHERE id = ? LIMIT 1',
    [result.insertId]
  );

  const tokenPayload = { sub: user.id, email: user.email, role: user.role };

  return res.status(201).json({
    message:       'Usuário criado com sucesso.',
    access_token:  signAccess(tokenPayload),
    refresh_token: signRefresh(tokenPayload),
  });
}

// ─── POST /auth/login ─────────────────────────────────────────────────────────

async function login(req, res) {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'email e password são obrigatórios.' });
  }

  const [[user]] = await pool.query(
    `SELECT id, email, password_hash, role, is_active
       FROM users
      WHERE email = ? AND deleted_at IS NULL LIMIT 1`,
    [email]
  );

  // Resposta genérica deliberada — não revela se o e-mail existe
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ message: 'Credenciais inválidas.' });
  }

  if (!user.is_active) {
    return res.status(403).json({ message: 'Conta desativada.' });
  }

  const tokenPayload = { sub: user.id, email: user.email, role: user.role };

  return res.json({
    access_token:  signAccess(tokenPayload),
    refresh_token: signRefresh(tokenPayload),
  });
}

// ─── POST /auth/refresh ───────────────────────────────────────────────────────

async function refresh(req, res) {
  const { refresh_token } = req.body;

  if (!refresh_token) {
    return res.status(400).json({ message: 'refresh_token é obrigatório.' });
  }

  let payload;
  try {
    payload = jwt.verify(refresh_token, process.env.JWT_REFRESH_SECRET);
  } catch {
    return res.status(401).json({ message: 'Refresh token inválido ou expirado.' });
  }

  // Confirma que o usuário ainda existe, está ativo e pega a role atual
  // (role pode ter mudado desde que o token anterior foi emitido)
  const [[user]] = await pool.query(
    `SELECT id, email, role, is_active
       FROM users
      WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
    [payload.sub]
  );

  if (!user || !user.is_active) {
    return res.status(401).json({ message: 'Usuário não encontrado ou inativo.' });
  }

  const tokenPayload = { sub: user.id, email: user.email, role: user.role };

  return res.json({
    access_token:  signAccess(tokenPayload),
    refresh_token: signRefresh(tokenPayload),  // rotaciona o refresh token
  });
}

// ─── POST /auth/logout ────────────────────────────────────────────────────────
// Sem estado no servidor — o cliente descarta os tokens.
// Para implementar blacklist, adicione o jti do token numa tabela revoked_tokens.

async function logout(_req, res) {
  return res.json({ message: 'Logout realizado.' });
}

module.exports = { register, login, refresh, logout };