const { Pool } = require('pg')
const config = require('../../config/config')
const logger = require('../utils/logger')

let pool = null

function getPool() {
  if (!pool) {
    pool = new Pool({
      host: config.postgres.host,
      port: config.postgres.port,
      database: config.postgres.database,
      user: config.postgres.user,
      password: config.postgres.password,
      ssl: config.postgres.ssl || false,
      max: config.postgres.max,
      idleTimeoutMillis: config.postgres.idleTimeoutMillis
    })

    pool.on('error', (err) => {
      logger.error('❌ Unexpected PG client error', err)
    })
  }
  return pool
}

async function query(text, params) {
  const p = getPool()
  return p.query(text, params)
}

async function end() {
  if (pool) {
    await pool.end()
    pool = null
    logger.info('👋 PG pool ended')
  }
}

module.exports = { getPool, query, end }
