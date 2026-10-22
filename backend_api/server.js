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

const storage = require('./src/services/storage');

const app  = express();
const PORT = process.env.PORT || 3003;
const ENV  = process.env.NODE_ENV || 'development';

// ─── Confia no proxy reverso (nginx) na frente deste container ──────────────
// Sem isto, Express ignora o header X-Forwarded-For que o nginx envia e usa
// o IP do socket TCP cru como `req.ip` — que, atrás do Docker, é sempre o
// gateway da rede bridge (ex: 172.18.0.1), o MESMO para qualquer visitante.
// express-rate-limit usa `req.ip` como chave por padrão: com todo mundo
// colapsando no mesmo IP, o limite de 500 req/15min deixa de ser por
// visitante e vira um orçamento ÚNICO compartilhado por todo o site —
// esgotado em minutos só com o tráfego normal de poucas páginas (é
// exatamente o "429 Too Many Requests" em tudo que apareceu em produção
// logo após a migração pra Docker: antes, com pm2, o Node media o próprio
// host, então essa distinção nunca ficou visível da mesma forma).
// `1` = confia em exatamente um hop de proxy na frente (o nginx do host),
// e nada além disso — não abre brecha pra um cliente forjar X-Forwarded-For
// e se passar por outro IP, porque só o hop mais próximo é confiado.
app.set('trust proxy', 1);

// ─── Security headers ────────────────────────────────────────────────────────
// CSP padrão do helmet + blob: em frames/imagens (pré-visualização de PDF/imagem de comunidade,
// baixados com autenticação e exibidos via URL de blob).
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      'frame-src': ["'self'", 'blob:'],
      'img-src': ["'self'", 'data:', 'blob:'],
    },
  },
}));

// ─── HTTP logging ────────────────────────────────────────────────────────────
if (ENV !== 'test') {
  app.use(morgan(ENV === 'production' ? 'combined' : 'dev'));
}

// ─── Body parsers ────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ─── Rate limiting ───────────────────────────────────────────────────────────
// `max: 500` foi calibrado baixo demais pra essa SPA: ela dispara várias
// chamadas /api/ em paralelo a cada navegação (auth/me, admin/stats,
// projects, datasets, workflows/templates, ...), e isso é por visitante
// desde o fix do `trust proxy` acima — então um único usuário navegando
// ativamente por alguns minutos já esgotava o orçamento de 15min inteiro.
// Subindo bastante (3000/15min ≈ 200 req/min) pra acomodar uso normal e
// ainda assim conter abuso de verdade; `authLimiter` abaixo continua
// restrito, pois é a proteção contra brute-force de login/registro.
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,   // 15 min
  max: 3000,
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
app.use('/api/v1/auth/change-password', authLimiter);

// Códigos de convite: limite próprio contra tentativa de adivinhação.
const inviteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { data: null, meta: null, error: { code: 'RATE_LIMIT', message: 'Muitas tentativas. Aguarde alguns minutos.' } },
});
app.use('/api/v1/communities/join', inviteLimiter);
app.use('/api/v1/communities/invite', inviteLimiter);

// Páginas públicas (sem login): leitura moderada e criação de reservas bem restrita, por IP.
const publicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 300, standardHeaders: true, legacyHeaders: false,
  message: { data: null, meta: null, error: { code: 'RATE_LIMIT', message: 'Muitas requisições. Tente novamente em alguns minutos.' } },
});
const publicBookingLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, max: 12, standardHeaders: true, legacyHeaders: false, skipFailedRequests: false,
  message: { data: null, meta: null, error: { code: 'RATE_LIMIT', message: 'Muitos pedidos de reserva a partir desta rede. Tente mais tarde.' } },
});
app.use('/api/v1/public/', publicLimiter);
app.post('/api/v1/public/equipment/:token/bookings', publicBookingLimiter);
app.use('/api/v1/public/bookings/', rateLimit({ windowMs: 15 * 60 * 1000, max: 60, standardHeaders: true, legacyHeaders: false, message: { data: null, meta: null, error: { code: 'RATE_LIMIT', message: 'Muitas tentativas.' } } }));

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

// Avatares são públicos (aparecem em perfis/listas); demais arquivos do
// storage (datasets, PDFs de comunidades…) passam por rotas autenticadas.
app.get('/storage/avatars/:name', async (req, res) => {
  try {
    const name = path.basename(req.params.name);
    const ext = path.extname(name).toLowerCase();
    const type = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' }[ext];
    if (!type) return res.status(404).end();
    const stream = await storage.getStream(`avatars/${name}`);
    res.set({ 'Content-Type': type, 'Cache-Control': 'public, max-age=3600', 'X-Content-Type-Options': 'nosniff' });
    stream.on('error', () => res.destroy());
    return stream.pipe(res);
  } catch { return res.status(404).end(); }
});

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
// Migrações idempotentes antes de aceitar tráfego (ver src/config/migrate.js).
// Uma falha aqui é logada mas não impede a API de subir.
storage.init()
  .then(() => console.log(`[storage] driver ${storage.driver}`))
  .catch((err) => console.error('[storage] falha ao inicializar:', err.message))
  .then(() => require('./src/config/migrate').migrate())
  .then(() => require('./src/services/usage.service').startStorageMeter())
  .catch((err) => console.error('[migrate] falhou:', err.message))
  .finally(() => {
    app.listen(PORT, () => {
      console.log(`[TcheLab API] Listening on port ${PORT} (${ENV})`);
      console.log(`[TcheLab API] Serving frontend from: ${distPath}`);
    });
  });

// Assina os resultados que o worker Python publica no Redis (jobs, execuções
// de workflow e as operações rápidas de dataset só saem de "queued"/"pending"
// por causa disso — ver src/services/resultConsumer.service.js).
try {
  require('./src/services/resultConsumer.service').start();
} catch (err) {
  console.error('[TcheLab API] Não foi possível iniciar o ResultConsumer:', err.message);
}

module.exports = app; // facilita testes