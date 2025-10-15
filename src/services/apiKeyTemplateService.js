const { v4: uuidv4 } = require('uuid')
const redis = require('../models/redis')

const TEMPLATE_KEY_PREFIX = 'apikey_template:'

function _key(id) {
  return `${TEMPLATE_KEY_PREFIX}${id}`
}

function _serialize(template) {
  const t = { ...template }
  // Normalize booleans to string for Redis hash storage
  const boolFields = ['enableModelRestriction', 'enableClientRestriction', 'isActive']
  boolFields.forEach((f) => {
    if (t[f] !== undefined) {
      t[f] = t[f] ? 'true' : 'false'
    }
  })

  // Arrays -> JSON
  const jsonFields = ['restrictedModels', 'allowedClients', 'tags']
  jsonFields.forEach((f) => {
    if (t[f] !== undefined) {
      t[f] = JSON.stringify(t[f] || [])
    }
  })
  return t
}

function _deserialize(data) {
  if (!data || Object.keys(data).length === 0) {
    return null
  }
  const t = { ...data }
  // Strings to booleans
  t.enableModelRestriction = t.enableModelRestriction === 'true'
  t.enableClientRestriction = t.enableClientRestriction === 'true'
  t.isActive = t.isActive === 'true'
  // JSON arrays
  try {
    t.restrictedModels = t.restrictedModels ? JSON.parse(t.restrictedModels) : []
  } catch {
    t.restrictedModels = []
  }
  try {
    t.allowedClients = t.allowedClients ? JSON.parse(t.allowedClients) : []
  } catch {
    t.allowedClients = []
  }
  try {
    t.tags = t.tags ? JSON.parse(t.tags) : []
  } catch {
    t.tags = []
  }
  // Numeric fields
  const numFields = [
    'tokenLimit',
    'concurrencyLimit',
    'rateLimitWindow',
    'rateLimitRequests',
    'rateLimitCost',
    'dailyCostLimit',
    'totalCostLimit',
    'weeklyOpusCostLimit',
    'activationDays',
    'dailyRequestsLimit'
  ]
  numFields.forEach((f) => {
    if (t[f] !== undefined && t[f] !== null && t[f] !== '') {
      t[f] = Number(t[f])
    }
  })
  return t
}

async function listTemplates() {
  const client = redis.getClientSafe()
  const keys = await client.keys(`${TEMPLATE_KEY_PREFIX}*`)
  if (!keys || keys.length === 0) {
    return []
  }
  const pipeline = client.pipeline()
  keys.forEach((k) => pipeline.hgetall(k))
  const results = await pipeline.exec()
  return results
    .map(([, data], idx) => ({ id: keys[idx].replace(TEMPLATE_KEY_PREFIX, ''), ...data }))
    .map(_deserialize)
    .filter(Boolean)
    .sort((a, b) =>
      (a.updatedAt || a.createdAt || '').localeCompare(b.updatedAt || b.createdAt || '')
    )
}

async function getTemplate(id) {
  const client = redis.getClientSafe()
  const data = await client.hgetall(_key(id))
  return _deserialize({ id, ...data })
}

async function createTemplate(input) {
  const client = redis.getClientSafe()
  const id = uuidv4()
  const now = new Date().toISOString()
  const t = {
    id,
    name: input.name,
    description: input.description || '',
    permissions: input.permissions || 'all',
    tokenLimit: input.tokenLimit || 0,
    concurrencyLimit: input.concurrencyLimit || 0,
    rateLimitWindow: input.rateLimitWindow || 0,
    rateLimitRequests: input.rateLimitRequests || 0,
    rateLimitCost: input.rateLimitCost || 0,
    dailyRequestsLimit: input.dailyRequestsLimit || 0,
    dailyCostLimit: input.dailyCostLimit || 0,
    totalCostLimit: input.totalCostLimit || 0,
    weeklyOpusCostLimit: input.weeklyOpusCostLimit || 0,
    enableModelRestriction: !!input.enableModelRestriction,
    restrictedModels: input.restrictedModels || [],
    enableClientRestriction: !!input.enableClientRestriction,
    allowedClients: input.allowedClients || [],
    isActive: input.isActive !== false,
    activationDays: input.activationDays || 0,
    activationUnit: input.activationUnit || 'days',
    expirationMode: input.expirationMode || 'fixed',
    expiresAt: input.expiresAt || '',
    icon: input.icon || '',
    claudeAccountId: input.claudeAccountId || '',
    claudeConsoleAccountId: input.claudeConsoleAccountId || '',
    geminiAccountId: input.geminiAccountId || '',
    openaiAccountId: input.openaiAccountId || '',
    azureOpenaiAccountId: input.azureOpenaiAccountId || '',
    bedrockAccountId: input.bedrockAccountId || '',
    droidAccountId: input.droidAccountId || '',
    tags: input.tags || [],
    createdAt: now,
    updatedAt: now
  }
  await client.hset(_key(id), _serialize(t))
  return t
}

async function updateTemplate(id, updates) {
  const client = redis.getClientSafe()
  const existing = await client.hgetall(_key(id))
  if (!existing || Object.keys(existing).length === 0) {
    throw new Error('Template not found')
  }
  const ex = _deserialize({ id, ...existing })
  const merged = { ...ex, ...updates, id, updatedAt: new Date().toISOString() }
  await client.hset(_key(id), _serialize(merged))
  return merged
}

async function deleteTemplate(id) {
  const client = redis.getClientSafe()
  await client.del(_key(id))
  return { success: true }
}

module.exports = {
  listTemplates,
  getTemplate,
  createTemplate,
  updateTemplate,
  deleteTemplate
}
