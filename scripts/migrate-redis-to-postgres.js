#!/usr/bin/env node
/*
 * Migrate important Redis data to PostgreSQL:
 * - API Keys -> api_keys
 * - System settings -> system_settings
 */
const logger = require('../src/utils/logger')
const redis = require('../src/models/redis')
const pg = require('../src/models/postgres')

function toBool(v) {
  if (v === true || v === false) {
    return v
  }
  return String(v) === 'true'
}

function toInt(v, def = 0) {
  const n = parseInt(v, 10)
  return Number.isFinite(n) ? n : def
}

function toFloat(v, def = 0) {
  const n = parseFloat(v)
  return Number.isFinite(n) ? n : def
}

function normalizeJsonArray(value) {
  try {
    if (Array.isArray(value)) {
      return value
    }
    if (value === null || value === undefined) {
      return []
    }
    if (typeof value === 'object') {
      return [value]
    }
    const s = String(value).trim()
    if (!s) {
      return []
    }
    // strict JSON first
    let parsed = null
    try {
      parsed = JSON.parse(s)
    } catch (e) {
      parsed = null
    }
    if (Array.isArray(parsed)) {
      return parsed
    }
    if (parsed && typeof parsed === 'object') {
      return [parsed]
    }
    if (parsed !== null && parsed !== undefined) {
      return [String(parsed)]
    }

    // fallback: drop outer brackets/braces and quotes without regex charclass escapes
    let raw = s
    // trim leading spaces/quotes/brackets/braces
    raw = raw.trim()
    while (raw.startsWith('[') || raw.startsWith('{')) {
      raw = raw.slice(1)
    }
    while (raw.endsWith(']') || raw.endsWith('}')) {
      raw = raw.slice(0, -1)
    }
    if (raw.startsWith('"') || raw.startsWith("'")) {
      raw = raw.slice(1)
    }
    if (raw.endsWith('"') || raw.endsWith("'")) {
      raw = raw.slice(0, -1)
    }
    raw = raw.trim()
    if (!raw) {
      return []
    }
    if (raw.includes(',')) {
      return raw
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
    }
    return [raw]
  } catch (e) {
    return []
  }
}

function toTS(v) {
  if (!v) {
    return null
  }
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

async function migrateApiKeys(client) {
  logger.info('🔎 Reading API keys from Redis...')
  const keys = await redis.getAllApiKeys()
  logger.info(`📦 Found ${keys.length} API keys in Redis`)

  if (keys.length === 0) {
    return { total: 0, inserted: 0, updated: 0 }
  }

  const inserted = 0
  let updated = 0

  const text = `
    insert into api_keys (
      id, name, description, digest,
      token_limit, concurrency_limit,
      rate_limit_window, rate_limit_requests, rate_limit_cost, daily_requests_limit,
      is_active,
      claude_account_id, claude_console_account_id, gemini_account_id, openai_account_id,
      azure_openai_account_id, bedrock_account_id, droid_account_id,
      permissions,
      enable_model_restriction, restricted_models,
      enable_client_restriction, allowed_clients,
      daily_cost_limit, total_cost_limit, weekly_opus_cost_limit, tags,
      activation_days, activation_unit, expiration_mode, is_activated, activated_at,
      created_at, updated_at, last_used_at, expires_at,
      is_deleted, deleted_at, deleted_by, deleted_by_type,
      user_id, user_username, created_by, icon
    ) values (
      $1,$2,$3,$4,
      $5,$6,
      $7,$8,$9,$10,
      $11,
      $12,$13,$14,$15,
      $16,$17,$18,
      $19,
      $20,$21,
      $22,$23,
      $24,$25,$26,$27,
      $28,$29,$30,$31,$32,
      $33,$34,$35,$36,
      $37,$38,$39,$40,
      $41,$42,$43,$44
    ) on conflict (id) do update set
      name = excluded.name,
      description = excluded.description,
      digest = excluded.digest,
      token_limit = excluded.token_limit,
      concurrency_limit = excluded.concurrency_limit,
      rate_limit_window = excluded.rate_limit_window,
      rate_limit_requests = excluded.rate_limit_requests,
      rate_limit_cost = excluded.rate_limit_cost,
      daily_requests_limit = excluded.daily_requests_limit,
      is_active = excluded.is_active,
      claude_account_id = excluded.claude_account_id,
      claude_console_account_id = excluded.claude_console_account_id,
      gemini_account_id = excluded.gemini_account_id,
      openai_account_id = excluded.openai_account_id,
      azure_openai_account_id = excluded.azure_openai_account_id,
      bedrock_account_id = excluded.bedrock_account_id,
      droid_account_id = excluded.droid_account_id,
      permissions = excluded.permissions,
      enable_model_restriction = excluded.enable_model_restriction,
      restricted_models = excluded.restricted_models,
      enable_client_restriction = excluded.enable_client_restriction,
      allowed_clients = excluded.allowed_clients,
      daily_cost_limit = excluded.daily_cost_limit,
      total_cost_limit = excluded.total_cost_limit,
      weekly_opus_cost_limit = excluded.weekly_opus_cost_limit,
      tags = excluded.tags,
      activation_days = excluded.activation_days,
      activation_unit = excluded.activation_unit,
      expiration_mode = excluded.expiration_mode,
      is_activated = excluded.is_activated,
      activated_at = excluded.activated_at,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at,
      last_used_at = excluded.last_used_at,
      expires_at = excluded.expires_at,
      is_deleted = excluded.is_deleted,
      deleted_at = excluded.deleted_at,
      deleted_by = excluded.deleted_by,
      deleted_by_type = excluded.deleted_by_type,
      user_id = excluded.user_id,
      user_username = excluded.user_username,
      created_by = excluded.created_by,
      icon = excluded.icon
  `

  await client.query('begin')
  try {
    for (const k of keys) {
      const params = [
        k.id,
        k.name || '',
        k.description || '',
        k.apiKey || '', // hashed digest
        toInt(k.tokenLimit),
        toInt(k.concurrencyLimit),
        toInt(k.rateLimitWindow),
        toInt(k.rateLimitRequests),
        toFloat(k.rateLimitCost),
        toInt(k.dailyRequestsLimit || 0),
        toBool(k.isActive),
        k.claudeAccountId || '',
        k.claudeConsoleAccountId || '',
        k.geminiAccountId || '',
        k.openaiAccountId || '',
        k.azureOpenaiAccountId || '',
        k.bedrockAccountId || '',
        k.droidAccountId || '',
        k.permissions || 'all',
        toBool(k.enableModelRestriction),
        JSON.stringify(normalizeJsonArray(k.restrictedModels)),
        toBool(k.enableClientRestriction),
        JSON.stringify(normalizeJsonArray(k.allowedClients)),
        toFloat(k.dailyCostLimit),
        toFloat(k.totalCostLimit),
        toFloat(k.weeklyOpusCostLimit),
        JSON.stringify(normalizeJsonArray(k.tags)),
        toInt(k.activationDays),
        (k.activationUnit || 'days').toString(),
        (k.expirationMode || 'fixed').toString(),
        toBool(k.isActivated !== undefined ? k.isActivated : true),
        toTS(k.activatedAt),
        toTS(k.createdAt) || new Date().toISOString(),
        toTS(k.updatedAt),
        toTS(k.lastUsedAt),
        toTS(k.expiresAt),
        toBool(k.isDeleted),
        toTS(k.deletedAt),
        k.deletedBy || null,
        k.deletedByType || null,
        k.userId || '',
        k.userUsername || '',
        k.createdBy || 'admin',
        k.icon || ''
      ]
      try {
        const res = await client.query(text, params)
        if (res.rowCount === 1) {
          updated++
        }
      } catch (e) {
        logger.error(`❌ Failed to upsert API key ${k.id} (${k.name || ''})`, {
          tags: params[25],
          restrictedModels: params[19],
          allowedClients: params[21],
          error: e.message
        })
        throw e
      }
    }
    await client.query('commit')
  } catch (e) {
    await client.query('rollback')
    throw e
  }

  return { total: keys.length, inserted, updated }
}

async function migrateSettings(client) {
  const results = []
  const redisClient = redis.getClientSafe()
  const targets = [
    { key: 'oem:settings', targetKey: 'oem_settings' },
    { key: 'product:settings', targetKey: 'product_settings' },
    { key: 'webhook_config:default', targetKey: 'webhook_config_default' }
  ]

  await client.query('begin')
  try {
    for (const t of targets) {
      let val = null
      try {
        const raw = await redisClient.get(t.key)
        val = raw ? JSON.parse(raw) : {}
      } catch (e) {
        val = {}
      }

      await client.query(
        `insert into system_settings(key, value, updated_at) values ($1,$2,now())
         on conflict(key) do update set value = excluded.value, updated_at = now()`,
        [t.targetKey, val]
      )
      results.push({ key: t.targetKey, ok: true })
    }
    await client.query('commit')
  } catch (e) {
    await client.query('rollback')
    throw e
  }
  return results
}

async function main() {
  try {
    logger.info('🔌 Connecting to Redis...')
    await redis.connect()
    logger.success('✅ Redis connected')

    const client = pg.getPool()
    logger.info('🐘 Connected to PostgreSQL')

    const keysStats = await migrateApiKeys(client)
    logger.success(`✅ API Keys migrated: total=${keysStats.total}`)

    const settings = await migrateSettings(client)
    logger.success(`✅ System settings migrated: ${settings.map((s) => s.key).join(', ')}`)

    await pg.end()
    await redis.disconnect()
  } catch (err) {
    logger.error('Migration failed', err)
    process.exit(1)
  }
}

main()
