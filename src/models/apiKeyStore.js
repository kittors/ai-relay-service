const pg = require('./postgres')
const logger = require('../utils/logger')

function toInt(v, d = 0) {
  const n = parseInt(v, 10)
  return Number.isFinite(n) ? n : d
}
function toFloat(v, d = 0) {
  const n = parseFloat(v)
  return Number.isFinite(n) ? n : d
}
function toBool(v) {
  if (typeof v === 'boolean') {
    return v
  }
  return String(v) === 'true'
}
function toJSONValue(v, fallback = []) {
  if (v === null || v === undefined) {
    return fallback
  }
  if (typeof v === 'string') {
    try {
      return JSON.parse(v)
    } catch {
      return fallback
    }
  }
  return v
}
function toTS(v) {
  if (!v) {
    return null
  }
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

function rowToRedisLike(row) {
  if (!row) {
    return null
  }
  return {
    id: row.id,
    name: row.name || '',
    description: row.description || '',
    apiKey: row.digest || '',
    tokenLimit: String(row.token_limit ?? 0),
    concurrencyLimit: String(row.concurrency_limit ?? 0),
    rateLimitWindow: String(row.rate_limit_window ?? 0),
    rateLimitRequests: String(row.rate_limit_requests ?? 0),
    rateLimitCost: String(row.rate_limit_cost ?? 0),
    dailyRequestsLimit: String(row.daily_requests_limit ?? 0),
    isActive: String(!!row.is_active),
    claudeAccountId: row.claude_account_id || '',
    claudeConsoleAccountId: row.claude_console_account_id || '',
    geminiAccountId: row.gemini_account_id || '',
    openaiAccountId: row.openai_account_id || '',
    azureOpenaiAccountId: row.azure_openai_account_id || '',
    bedrockAccountId: row.bedrock_account_id || '',
    droidAccountId: row.droid_account_id || '',
    permissions: row.permissions || 'all',
    enableModelRestriction: String(!!row.enable_model_restriction),
    restrictedModels: JSON.stringify(row.restricted_models || []),
    enableClientRestriction: String(!!row.enable_client_restriction),
    allowedClients: JSON.stringify(row.allowed_clients || []),
    dailyCostLimit: String(row.daily_cost_limit ?? 0),
    totalCostLimit: String(row.total_cost_limit ?? 0),
    weeklyOpusCostLimit: String(row.weekly_opus_cost_limit ?? 0),
    tags: JSON.stringify(row.tags || []),
    activationDays: String(row.activation_days ?? 0),
    activationUnit: row.activation_unit || 'days',
    expirationMode: row.expiration_mode || 'fixed',
    isActivated: String(!!row.is_activated),
    activatedAt: row.activated_at ? new Date(row.activated_at).toISOString() : '',
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : '',
    lastUsedAt: row.last_used_at ? new Date(row.last_used_at).toISOString() : '',
    expiresAt: row.expires_at ? new Date(row.expires_at).toISOString() : '',
    isDeleted: String(!!row.is_deleted),
    deletedAt: row.deleted_at ? new Date(row.deleted_at).toISOString() : '',
    deletedBy: row.deleted_by || '',
    deletedByType: row.deleted_by_type || '',
    userId: row.user_id || '',
    userUsername: row.user_username || '',
    createdBy: row.created_by || 'admin',
    icon: row.icon || ''
  }
}

function redisLikeToParams(k) {
  return [
    k.id,
    k.name || '',
    k.description || '',
    k.apiKey || '', // digest
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
    toJSONValue(k.restrictedModels, []),
    toBool(k.enableClientRestriction),
    toJSONValue(k.allowedClients, []),
    toFloat(k.dailyCostLimit),
    toFloat(k.totalCostLimit),
    toFloat(k.weeklyOpusCostLimit),
    toJSONValue(k.tags, []),
    toInt(k.activationDays),
    (k.activationUnit || 'days').toString(),
    (k.expirationMode || 'fixed').toString(),
    toBool(k.isActivated !== undefined ? k.isActivated : true),
    toTS(k.activatedAt),
    toTS(k.createdAt) || new Date().toISOString(),
    toTS(k.updatedAt) || new Date().toISOString(),
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
}

async function upsertFromRedisLike(k) {
  const sql = `
    insert into api_keys (
      id, name, description, digest,
      token_limit, concurrency_limit, rate_limit_window, rate_limit_requests, rate_limit_cost, daily_requests_limit,
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
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,
      $12,$13,$14,$15,$16,$17,$18,$19,$20,$21,
      $22,$23,$24,$25,$26,$27,$28,$29,$30,$31,
      $32,$33,$34,$35,$36,$37,$38,$39,$40,$41,
      $42,$43,$44,$45
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
  // Build params including daily_requests_limit after rate_limit_cost
  const params = redisLikeToParams(k)
  await pg.query(sql, params)
}

async function softDelete(id, deletedBy = 'system', deletedByType = 'system') {
  const sql = `update api_keys set is_deleted=true, is_active=false, deleted_at=now(), deleted_by=$2, deleted_by_type=$3, updated_at=now() where id=$1`
  await pg.query(sql, [id, deletedBy, deletedByType])
}

async function restore(id, _restoredBy = 'system', _restoredByType = 'system') {
  const sql = `update api_keys set is_deleted=false, is_active=true, deleted_at=null, deleted_by=null, deleted_by_type=null, updated_at=now() where id=$1`
  await pg.query(sql, [id])
}

async function permanentDelete(id) {
  const sql = `delete from api_keys where id=$1`
  await pg.query(sql, [id])
}

async function findByDigest(digest) {
  try {
    const { rows } = await pg.query('select * from api_keys where digest=$1 and is_deleted=false', [
      digest
    ])
    if (!rows || rows.length === 0) {
      return null
    }
    return rowToRedisLike(rows[0])
  } catch (e) {
    logger.warn('PG findByDigest failed, fallback to Redis path:', e.message)
    return null
  }
}

async function getById(id) {
  try {
    const { rows } = await pg.query('select * from api_keys where id=$1', [id])
    if (!rows || rows.length === 0) {
      return null
    }
    return rowToRedisLike(rows[0])
  } catch (e) {
    logger.warn('PG getById failed, fallback:', e.message)
    return null
  }
}

module.exports = {
  upsertFromRedisLike,
  softDelete,
  restore,
  permanentDelete,
  findByDigest,
  getById,
  async getDistinctTags(includeDeleted = false) {
    const where = includeDeleted ? '' : 'where is_deleted = false'
    const sql = `select distinct jsonb_array_elements_text(tags) as tag from api_keys ${where} order by 1`
    const { rows } = await pg.query(sql)
    return rows.map((r) => r.tag).filter((t) => typeof t === 'string' && t.trim().length > 0)
  },
  async listCursor({
    cursor = '0',
    count = 20,
    includeDeleted = false,
    search = '',
    tag = '',
    activated
  } = {}) {
    const params = []
    const where = []
    if (!includeDeleted) {
      where.push('is_deleted = false')
    }
    if (search && String(search).trim()) {
      params.push(`%${String(search).trim().toLowerCase()}%`)
      where.push(
        `(lower(name) like $${params.length} or lower(user_username) like $${params.length})`
      )
    }
    if (tag && String(tag).trim()) {
      params.push(JSON.stringify([String(tag).trim()]))
      where.push(`tags @> $${params.length}::jsonb`)
    }
    if (activated === 'true') {
      where.push('is_activated = true')
    } else if (activated === 'false') {
      where.push('is_activated = false')
    }

    const whereSql = where.length ? `where ${where.join(' and ')}` : ''

    // cursor as numeric offset
    const offset = /^\d+$/.test(String(cursor)) ? parseInt(String(cursor), 10) : 0
    const limit = Math.max(1, Math.min(500, parseInt(count, 10) || 20))

    params.push(limit + 1)
    const limitParam = `$${params.length}`
    params.push(offset)
    const offsetParam = `$${params.length}`

    const sql = `select * from api_keys ${whereSql} order by created_at desc limit ${limitParam} offset ${offsetParam}`
    const { rows } = await pg.query(sql, params)
    const items = rows.slice(0, limit).map((r) => rowToRedisLike(r))
    const finished = rows.length <= limit
    const nextCursor = finished ? '0' : String(offset + limit)
    return { items, cursor: nextCursor, finished }
  }
}
