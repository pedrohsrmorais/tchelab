'use strict';

const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  user: process.env.DB_USER || 'tchelab',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'tchelab',
  charset: 'utf8mb4',
  timezone: '+00:00',
  waitForConnections: true,
  connectionLimit: parseInt(process.env.DB_POOL_MAX || '20', 10),
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
});

pool.on('connection', () => {
  console.log('[DB] Nova conexão adicionada ao pool');
});

module.exports = pool;
