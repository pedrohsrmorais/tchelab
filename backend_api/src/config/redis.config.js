'use strict';

const Redis = require('ioredis');

const client = new Redis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD || undefined,
  // DB=1 para não colidir com outros serviços — deve coincidir com REDIS_URL do worker_api/config.py
  db: parseInt(process.env.REDIS_DB || '1', 10),
  lazyConnect: true,
  enableReadyCheck: true,
  retryStrategy(times) {
    if (times > 10) return null; // para de tentar
    return Math.min(times * 200, 3000);
  },
});

client.on('connect', () => console.log('[Redis] Conectado'));
client.on('error', (err) => console.error('[Redis] Erro:', err.message));

// Conecta no startup; falhas não derrubam a app
client.connect().catch((err) => {
  console.error('[Redis] Não foi possível conectar:', err.message);
});

module.exports = client;
