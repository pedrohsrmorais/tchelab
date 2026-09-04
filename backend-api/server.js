const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
require('dotenv').config();

const { testConnection } = require('./config/db');
const apiRoutes = require('./routes/api.routes');

const app = express();
const PORT = process.env.PORT || 3003;

// ── Segurança e utilitários ───────────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(morgan('dev'));

// ── Body parsing ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Estático (frontend buildado) ──────────────────────────────────────────────
app.use(express.static(path.join(__dirname, '../frontend/dist')));

// ── Rotas da API ──────────────────────────────────────────────────────────────
app.use('/api', apiRoutes);

// ── Fallback SPA (deve vir depois das rotas de API) ───────────────────────────
//app.get('*', (_req, res) => {
//  res.sendFile(path.join(__dirname, '../frontend/dist', 'index.html'));
//});

// ── Tratamento de erros global ────────────────────────────────────────────────
// Captura erros assíncronos: use asyncHandler nos controllers, ou chame next(err)
app.use((err, _req, res, _next) => {
  const status = err.status || 500;
  console.error(`[${new Date().toISOString()}] ${err.stack || err.message}`);
  res.status(status).json({
    error: {
      message: err.message || 'Internal Server Error',
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    },
  });
});

// ── Boot ──────────────────────────────────────────────────────────────────────
async function start() {
  await testConnection(); // Falha rápido se o banco não responder
  app.listen(PORT, () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
    console.log(`Ambiente: ${process.env.NODE_ENV || 'development'}`);
  });
}

start().catch((err) => {
  console.error(err.message);
  process.exit(1);
});

module.exports = app;