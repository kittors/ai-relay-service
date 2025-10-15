const redis = require('../models/redis')

function getDatesInRange(start, end) {
  const dates = []
  const current = new Date(start)
  while (current <= end) {
    const tz = redis.getDateInTimezone(current)
    const str = `${tz.getUTCFullYear()}-${String(tz.getUTCMonth() + 1).padStart(2, '0')}-${String(
      tz.getUTCDate()
    ).padStart(2, '0')}`
    dates.push(str)
    current.setDate(current.getDate() + 1)
  }
  return dates
}

function normalizeUsageHash(data = {}) {
  const inputTokens = parseInt(data.totalInputTokens) || parseInt(data.inputTokens) || 0
  const outputTokens = parseInt(data.totalOutputTokens) || parseInt(data.outputTokens) || 0
  const cacheCreateTokens =
    parseInt(data.totalCacheCreateTokens) || parseInt(data.cacheCreateTokens) || 0
  const cacheReadTokens = parseInt(data.totalCacheReadTokens) || parseInt(data.cacheReadTokens) || 0
  const allTokens =
    parseInt(data.totalAllTokens) ||
    parseInt(data.allTokens) ||
    inputTokens + outputTokens + cacheCreateTokens + cacheReadTokens
  const requests = parseInt(data.totalRequests) || parseInt(data.requests) || 0
  return {
    requests,
    tokens: allTokens,
    allTokens,
    inputTokens,
    outputTokens,
    cacheCreateTokens,
    cacheReadTokens
  }
}

async function getUsageForKey(keyId, timeRange = 'all', startDate, endDate) {
  const client = redis.getClientSafe()
  const now = new Date()
  const todayStr = redis.getDateStringInTimezone(now)
  const tzDate = redis.getDateInTimezone(now)
  const monthStr = `${tzDate.getUTCFullYear()}-${String(tzDate.getUTCMonth() + 1).padStart(2, '0')}`

  // all -> use top-level aggregated hash via redis.getUsageStats
  if (timeRange === 'all') {
    const stats = await redis.getUsageStats(keyId)
    return stats.total || normalizeUsageHash({})
  }

  // today
  if (timeRange === 'today') {
    const dailyKey = `usage:daily:${keyId}:${todayStr}`
    const data = await client.hgetall(dailyKey)
    return normalizeUsageHash(data)
  }

  // 7days: sum of last 7 daily keys
  if (timeRange === '7days') {
    const pipeline = client.pipeline()
    for (let i = 0; i < 7; i++) {
      const d = new Date(now)
      d.setDate(d.getDate() - i)
      const str = redis.getDateStringInTimezone(d)
      pipeline.hgetall(`usage:daily:${keyId}:${str}`)
    }
    const results = await pipeline.exec()
    const acc = {
      requests: 0,
      tokens: 0,
      allTokens: 0,
      inputTokens: 0,
      outputTokens: 0,
      cacheCreateTokens: 0,
      cacheReadTokens: 0
    }
    for (const [, data] of results) {
      const n = normalizeUsageHash(data || {})
      acc.requests += n.requests
      acc.tokens += n.tokens
      acc.allTokens += n.allTokens
      acc.inputTokens += n.inputTokens
      acc.outputTokens += n.outputTokens
      acc.cacheCreateTokens += n.cacheCreateTokens
      acc.cacheReadTokens += n.cacheReadTokens
    }
    return acc
  }

  // monthly / 30days (use monthly aggregator)
  if (timeRange === '30days' || timeRange === 'monthly') {
    const monthlyKey = `usage:monthly:${keyId}:${monthStr}`
    const data = await client.hgetall(monthlyKey)
    return normalizeUsageHash(data)
  }

  // custom
  if (timeRange === 'custom' && startDate && endDate) {
    const start = new Date(startDate)
    const end = new Date(endDate)
    if (start > end) {
      throw new Error('Start date must be before or equal to end date')
    }
    const diffDays = Math.ceil((end - start) / 86400000) + 1
    if (diffDays > 365) {
      throw new Error('Date range cannot exceed 365 days')
    }

    const pipeline = client.pipeline()
    const dateStrs = getDatesInRange(start, end)
    for (const ds of dateStrs) {
      pipeline.hgetall(`usage:daily:${keyId}:${ds}`)
    }
    const results = await pipeline.exec()
    const acc = {
      requests: 0,
      tokens: 0,
      allTokens: 0,
      inputTokens: 0,
      outputTokens: 0,
      cacheCreateTokens: 0,
      cacheReadTokens: 0
    }
    for (const [, data] of results) {
      const n = normalizeUsageHash(data || {})
      acc.requests += n.requests
      acc.tokens += n.tokens
      acc.allTokens += n.allTokens
      acc.inputTokens += n.inputTokens
      acc.outputTokens += n.outputTokens
      acc.cacheCreateTokens += n.cacheCreateTokens
      acc.cacheReadTokens += n.cacheReadTokens
    }
    return acc
  }

  // fallback
  const stats = await redis.getUsageStats(keyId)
  return stats.total || normalizeUsageHash({})
}

async function getUsageForKeysBatch(keyIds = [], timeRange = 'all', startDate, endDate) {
  const client = redis.getClientSafe()
  const result = {}
  if (!keyIds || keyIds.length === 0) {
    return result
  }

  const now = new Date()
  const todayStr = redis.getDateStringInTimezone(now)
  const tzDate = redis.getDateInTimezone(now)
  const monthStr = `${tzDate.getUTCFullYear()}-${String(tzDate.getUTCMonth() + 1).padStart(2, '0')}`

  // Helper to sum normalized usage into an accumulator
  const addTo = (acc, n) => {
    acc.requests = (acc.requests || 0) + (n.requests || 0)
    acc.tokens = (acc.tokens || 0) + (n.tokens || 0)
    acc.allTokens = (acc.allTokens || 0) + (n.allTokens || 0)
    acc.inputTokens = (acc.inputTokens || 0) + (n.inputTokens || 0)
    acc.outputTokens = (acc.outputTokens || 0) + (n.outputTokens || 0)
    acc.cacheCreateTokens = (acc.cacheCreateTokens || 0) + (n.cacheCreateTokens || 0)
    acc.cacheReadTokens = (acc.cacheReadTokens || 0) + (n.cacheReadTokens || 0)
  }

  // Batch by timeRange using a single pipeline
  if (timeRange === 'today') {
    const pipeline = client.pipeline()
    for (const id of keyIds) {
      pipeline.hgetall(`usage:daily:${id}:${todayStr}`)
    }
    const rows = await pipeline.exec()
    keyIds.forEach((id, idx) => {
      const data = rows[idx]?.[1] || {}
      result[id] = normalizeUsageHash(data)
    })
    return result
  }

  if (timeRange === '7days') {
    const dates = []
    for (let i = 0; i < 7; i++) {
      const d = new Date(now)
      d.setDate(d.getDate() - i)
      dates.push(redis.getDateStringInTimezone(d))
    }
    const pipeline = client.pipeline()
    // order: for each date, for each id -> hgetall
    for (const ds of dates) {
      for (const id of keyIds) {
        pipeline.hgetall(`usage:daily:${id}:${ds}`)
      }
    }
    const rows = await pipeline.exec()
    // accumulate per id
    keyIds.forEach((id) => (result[id] = normalizeUsageHash({})))
    let idx = 0
    for (let dIdx = 0; dIdx < dates.length; dIdx++) {
      for (const id of keyIds) {
        const data = rows[idx++]?.[1] || {}
        addTo(result[id], normalizeUsageHash(data))
      }
    }
    return result
  }

  if (timeRange === '30days' || timeRange === 'monthly') {
    const pipeline = client.pipeline()
    for (const id of keyIds) {
      pipeline.hgetall(`usage:monthly:${id}:${monthStr}`)
    }
    const rows = await pipeline.exec()
    keyIds.forEach((id, idx) => {
      const data = rows[idx]?.[1] || {}
      result[id] = normalizeUsageHash(data)
    })
    return result
  }

  if (timeRange === 'custom' && startDate && endDate) {
    const start = new Date(startDate)
    const end = new Date(endDate)
    if (start > end) {
      throw new Error('Start date must be before or equal to end date')
    }
    const diffDays = Math.ceil((end - start) / 86400000) + 1
    if (diffDays > 365) {
      throw new Error('Date range cannot exceed 365 days')
    }

    const dateStrs = getDatesInRange(start, end)
    const pipeline = client.pipeline()
    for (const ds of dateStrs) {
      for (const id of keyIds) {
        pipeline.hgetall(`usage:daily:${id}:${ds}`)
      }
    }
    const rows = await pipeline.exec()
    keyIds.forEach((id) => (result[id] = normalizeUsageHash({})))
    let idx = 0
    for (let dIdx = 0; dIdx < dateStrs.length; dIdx++) {
      for (const id of keyIds) {
        const data = rows[idx++]?.[1] || {}
        addTo(result[id], normalizeUsageHash(data))
      }
    }
    return result
  }

  // default: 'all' -> use top-level aggregated hash
  {
    const pipeline = client.pipeline()
    for (const id of keyIds) {
      pipeline.hgetall(`usage:${id}`)
    }
    const rows = await pipeline.exec()
    keyIds.forEach((id, idx) => {
      const data = rows[idx]?.[1] || {}
      result[id] = normalizeUsageHash(data)
    })
    return result
  }
}

module.exports = {
  getUsageForKey,
  getUsageForKeysBatch
}
