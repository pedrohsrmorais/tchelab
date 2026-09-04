module.exports = {
  apps: [
    {
      name: 'tchelab-api',
      cwd: '/root/tchelab/backend-api',
      script: 'server.js',
      instances: 1,
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: 'production',
      },
    },
    {
      name: 'tchelab-worker',
      cwd: '/root/tchelab/backend-worker',
      interpreter: '/root/tchelab/backend-worker/.venv/bin/python',
      script: 'worker.py',
      instances: 1,
      autorestart: true,
      watch: false,
    },
    {
      name: 'tchelab-worker-api',
      cwd: '/root/tchelab/backend-worker',
      interpreter: '/root/tchelab/backend-worker/.venv/bin/python',
      script: '/root/tchelab/backend-worker/.venv/bin/uvicorn',
      args: 'main:app --host 0.0.0.0 --port 8001',
      instances: 1,
      autorestart: true,
      watch: false,
    },
  ],
};