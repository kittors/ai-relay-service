#!/usr/bin/env node
/*
 * Backup provider accounts from Redis into PostgreSQL `accounts` table.
 * This is a conservative migration storing raw account hashes/objects as JSON.
 */
const logger = require('../src/utils/logger')
const redis = require('../src/models/redis')
const pg = require('../src/models/postgres')

function toBoolStr(v) {
  if (typeof v === 'boolean') {
    return v
  }
  return String(v) === 'true'
}

// note: helper removed to satisfy lint (unused)

function safeJSON(v) {
  try {
    return JSON.stringify(v ?? {})
  } catch (e) {
    return '{}'
  }
}

function toTS(v) {
  if (!v) {
    return null
  }
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

async function upsertAccount(client, row) {
  const sql = `
    insert into accounts (id, provider, external_id, name, enc_credentials, iv, tag, is_active, schedulable, created_at, updated_at)
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
    on conflict (id) do update set
      provider = excluded.provider,
      external_id = excluded.external_id,
      name = excluded.name,
      enc_credentials = excluded.enc_credentials,
      iv = excluded.iv,
      tag = excluded.tag,
      is_active = excluded.is_active,
      schedulable = excluded.schedulable,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at
  `
  const params = [
    row.id,
    row.provider,
    row.external_id || '',
    row.name || '',
    row.enc_credentials || '{}',
    row.iv || '',
    row.tag || '',
    row.is_active === undefined ? true : !!row.is_active,
    row.schedulable === undefined ? true : !!row.schedulable,
    row.created_at || new Date().toISOString(),
    row.updated_at || row.created_at || new Date().toISOString()
  ]
  await client.query(sql, params)
}

async function migrateProviderHashes(client, prefix, provider) {
  const r = redis.getClientSafe()
  const keys = await r.keys(`${prefix}*`)
  logger.info(`🔎 ${provider}: found ${keys.length} keys with prefix ${prefix}`)
  for (const k of keys) {
    const data = await r.hgetall(k)
    const id = data.id || k.replace(prefix, '')
    await upsertAccount(client, {
      id,
      provider,
      external_id: '',
      name: data.name || data.email || '',
      enc_credentials: safeJSON(data),
      iv: '',
      tag: '',
      is_active: toBoolStr(data.isActive),
      schedulable: data.schedulable ? String(data.schedulable) !== 'false' : true,
      created_at: toTS(data.createdAt),
      updated_at: toTS(data.updatedAt || data.lastUsedAt || data.lastRefreshAt)
    })
  }
  return keys.length
}

async function migrateProviderJSON(client, prefix, provider) {
  const r = redis.getClientSafe()
  const keys = await r.keys(`${prefix}*`)
  logger.info(`🔎 ${provider}: found ${keys.length} keys with prefix ${prefix}`)
  for (const k of keys) {
    const raw = await r.get(k)
    let obj = {}
    try {
      obj = raw ? JSON.parse(raw) : {}
    } catch (e) {
      logger.debug(`Skip invalid JSON for key ${k}: ${e.message}`)
      obj = {}
    }
    const id = obj.id || k.replace(prefix, '')
    await upsertAccount(client, {
      id,
      provider,
      external_id: '',
      name: obj.name || '',
      enc_credentials: safeJSON(obj),
      iv: '',
      tag: '',
      is_active: obj.isActive !== false,
      schedulable: obj.schedulable !== false,
      created_at: toTS(obj.createdAt),
      updated_at: toTS(obj.updatedAt)
    })
  }
  return keys.length
}

async function main() {
  try {
    await redis.connect()
    const client = pg.getPool()

    let total = 0
    await client.query('begin')
    try {
      // Account groups (if any)
      try {
        const r = redis.getClientSafe()
        const groupIds = await r.smembers('account_groups')
        for (const gid of groupIds) {
          const g = await r.hgetall(`account_group:${gid}`)
          await client.query(
            `insert into account_groups(id, name, platform, description, created_at, updated_at)
             values ($1,$2,$3,$4,$5,$6)
             on conflict (id) do update set name=excluded.name, platform=excluded.platform, description=excluded.description, updated_at=excluded.updated_at`,
            [
              gid,
              g.name || '',
              g.platform || '',
              g.description || '',
              toTS(g.createdAt) || new Date().toISOString(),
              toTS(g.updatedAt)
            ]
          )
          const members = await r.smembers(`account_group_members:${gid}`)
          for (const mid of members) {
            await client.query(
              `insert into account_group_members(group_id, account_id) values ($1,$2)
               on conflict (group_id, account_id) do nothing`,
              [gid, mid]
            )
          }
        }
        logger.info(`✅ Migrated account groups: ${groupIds.length}`)
      } catch (e) {
        logger.warn('⚠️ Account groups migration skipped/failed:', e.message)
      }

      total += await migrateProviderHashes(client, 'claude:account:', 'claude')
      total += await migrateProviderHashes(client, 'claude_console_account:', 'claude_console')
      total += await migrateProviderHashes(client, 'gemini_account:', 'gemini')
      total += await migrateProviderHashes(client, 'openai:account:', 'openai')
      total += await migrateProviderHashes(client, 'openai_responses_account:', 'openai_responses')
      total += await migrateProviderHashes(client, 'droid:account:', 'droid')
      total += await migrateProviderJSON(client, 'bedrock_account:', 'bedrock')
      await client.query('commit')
    } catch (e) {
      await client.query('rollback')
      throw e
    }

    logger.success(`✅ Accounts migrated/archived to Postgres: ${total}`)
    await pg.end()
    await redis.disconnect()
  } catch (err) {
    logger.error('❌ Accounts migration failed', err)
    process.exit(1)
  }
}

main()
