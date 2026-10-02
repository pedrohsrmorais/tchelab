module.exports = {
  apps: [
    // ─── Backend API (Node.js / Express) ────────────────────────────────────
    {
      name: 'tchelab-api',
      cwd: '/root/tchelab/backend_api',
      script: 'server.js',
      instances: 1,
      autorestart: true,
      watch: false,
      exec_mode: 'fork', 
      env: {
        NODE_ENV: 'production',
      },
    },

    // ─── Worker API (Python — consumidor de fila Redis) ─────────────────────
    // NÃO é um servidor HTTP: roda worker.py diretamente (BLPOP + threads).
    {
      name: 'tchelab-worker',
      cwd: '/root/tchelab/worker_api',
      interpreter: '/root/tchelab/worker_api/.venv/bin/python',
      script: 'worker.py',
      instances: 1,
      autorestart: true,
      watch: false,
      env: {
        // Ajuste conforme seu .env / config.py
        // REDIS_URL: 'redis://localhost:6379/0',
        // WORKER_CONCURRENCY: '4',
      },
    },
  ],
};