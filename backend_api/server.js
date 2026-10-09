'use strict';

require('dotenv').config();

const express    = require('express');
const path       = require('path');
const fs         = require('fs');
const helmet     = require('helmet');
const morgan     = require('morgan');
const rateLimit  = require('express-rate-limit');
const redis      = require('./src/config/redis.config');
const storageConfig = require('./src/config/storage.config');

const apiRouter  = require('./src/routes/api.routes');

// ─── Ensure storage directories exist ────────────────────────────────────────
Object.values(storageConfig).forEach((dir) => {
  if (typeof dir === 'string') {
    fs.mkdirSync(dir, { recursive: true });
  }
});

const app  = express();
const PORT = process.env.PORT || 3003;
const ENV  = process.env.NODE_ENV || 'development';

// ─── Security headers ────────────────────────────────────────────────────────
app.use(helmet());

// ─── HTTP logging ────────────────────────────────────────────────────────────
if (ENV !== 'test') {
  app.use(morgan(ENV === 'production' ? 'combined' : 'dev'));
}

// ─── Body parsers ────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ─── Rate limiting ───────────────────────────────────────────────────────────
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,   // 15 min
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { data: null, meta: null, error: { code: 'RATE_LIMIT', message: 'Muitas requisições. Tente novamente em alguns minutos.' } },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,   // 15 min
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { data: null, meta: null, error: { code: 'RATE_LIMIT', message: 'Muitas tentativas de autenticação. Aguarde 15 minutos.' } },
});

app.use('/api/', globalLimiter);
app.use('/api/v1/auth/login',           authLimiter);
app.use('/api/v1/auth/register',        authLimiter);
app.use('/api/v1/auth/forgot-password', authLimiter);

// ─── API routes ──────────────────────────────────────────────────────────────
app.use('/api/v1', apiRouter);

// ─── Health check ────────────────────────────────────────────────────────────
app.get('/health', async (req, res) => {
  const redisOk = redis.status === 'ready';
  res.status(200).json({
    status: 'ok',
    env: ENV,
    redis: redisOk ? 'connected' : 'degraded',
    timestamp: new Date().toISOString(),
  });
});

// ─── SPA static serving (frontend dist) ─────────────────────────────────────
const distPath = process.env.FRONTEND_DIST
  ? path.resolve(process.env.FRONTEND_DIST)
  : path.resolve(__dirname, '..', 'frontend', 'dist');

app.use(express.static(distPath, { index: false }));

// Fallback: SPA client-side routing (não captura /api/*)
app.get(/^(?!\/api).*/, (req, res) => {
  const indexPath = path.join(distPath, 'index.html');
  res.sendFile(indexPath, { root: '/' }, (err) => {
    if (err) {
      // dist ainda não gerado — resposta amigável em desenvolvimento
      if (ENV !== 'production') {
        return res.status(200).json({ message: 'TcheLab API running. Frontend not built yet.' });
      }
      return res.status(404).json({ error: 'Not found' });
    }
  });
});

// ─── Global error handler ────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[Unhandled error]', err);
  res.status(500).json({
    data: null,
    meta: null,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: ENV === 'production' ? 'Erro interno do servidor.' : err.message,
    },
  });
});

// ─── Startup ─────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[TcheLab API] Listening on port ${PORT} (${ENV})`);
  console.log(`[TcheLab API] Serving frontend from: ${distPath}`);
});

module.exports = app; // facilita testes