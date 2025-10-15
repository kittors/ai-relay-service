#!/usr/bin/env node
const logger = require('../src/utils/logger')
const redis = require('../src/models/redis')
const pg = require('../src/models/postgres')

async function run() {
  await redis.connect()
  const client = pg.getPool()
  const r = redis.getClientSafe()

  const pairs = [
    { redis: 'oem:settings', key: 'oem_settings' },
    { redis: 'product:settings', key: 'product_settings' },
    { redis: 'webhook_config:default', key: 'webhook_config_default' }
  ]

  await client.query('begin')
  try {
    for (const p of pairs) {
      let obj = {}
      try {
        const raw = await r.get(p.redis)
        obj = raw ? JSON.parse(raw) : {}
      } catch (e) {
        logger.debug(`Skip invalid JSON settings for ${p.redis}: ${e.message}`)
        obj = {}
      }
      await client.query(
        `insert into system_settings(key, value, updated_at) values ($1,$2,now())
         on conflict(key) do update set value = excluded.value, updated_at = now()`,
        [p.key, obj]
      )
      logger.info(`✅ Migrated setting: ${p.redis} -> ${p.key}`)
    }
    await client.query('commit')
  } catch (e) {
    await client.query('rollback')
    throw e
  }

  await pg.end()
  await redis.disconnect()
}

run().catch((e) => {
  logger.error('❌ Settings migration failed', e)
  process.exit(1)
})
