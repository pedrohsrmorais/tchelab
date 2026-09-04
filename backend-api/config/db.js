const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host:     process.env.DB_HOST,
  port:     Number(process.env.DB_PORT) || 3306,
  user:     process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'alfaiate_db',
  database: process.env.DB_NAME || 'tchelab',

  waitForConnections: true,
  connectionLimit:    Number(process.env.DB_CONNECTION_LIMIT) || 10,
  charset:            'UTF8MB4_UNICODE_CI',
  timezone:           '-03:00',
  dateStrings:        ['DATE', 'DATETIME'],
  enableKeepAlive:    true,
  keepAliveInitialDelay: 30_000,
  idleTimeout:        60_000,
});

async function testConnection() {
  const conn = await pool.getConnection();
  try {
    await conn.ping();
    console.log('[db] MySQL conectado com sucesso');
  } finally {
    conn.release();
  }
}

module.exports = { pool, testConnection };