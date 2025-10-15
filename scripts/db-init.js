#!/usr/bin/env node
/*
 * Initialize PostgreSQL schema by running all SQL files in db/migrations in filename order.
 * Idempotent migrations are expected (CREATE IF NOT EXISTS, etc.).
 */
const fs = require('fs')
const path = require('path')
const logger = require('../src/utils/logger')
const pg = require('../src/models/postgres')

async function run() {
  const migrationsDir = path.join(__dirname, '..', 'db', 'migrations')
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort()

  logger.info(`📦 Found ${files.length} migration files`)

  for (const file of files) {
    const full = path.join(migrationsDir, file)
    const sql = fs.readFileSync(full, 'utf8')
    logger.info(`🚀 Applying migration: ${file}`)
    try {
      await pg.query(sql)
      logger.success(`✅ Migration applied: ${file}`)
    } catch (err) {
      logger.error(`❌ Migration failed: ${file}`, err)
      throw err
    }
  }

  await pg.end()
}

run().catch((e) => {
  logger.error('Database initialization failed', e)
  process.exit(1)
})
