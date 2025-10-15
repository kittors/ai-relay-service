const express = require('express')
const router = express.Router()

const { authenticateAdmin } = require('../../middleware/auth')
const logger = require('../../utils/logger')
const redis = require('../../models/redis')
const apiKeyService = require('../../services/apiKeyService')
const CostCalculator = require('../../utils/costCalculator')

// 调试：获取API Key费用详情
router.get('/api-keys/:keyId/cost-debug', authenticateAdmin, async (req, res) => {
  try {
    const { keyId } = req.params
    const costStats = await redis.getCostStats(keyId)
    const dailyCost = await redis.getDailyCost(keyId)
    const today = redis.getDateStringInTimezone()
    const client = redis.getClientSafe()

    const costKeys = await client.keys(`usage:cost:*:${keyId}:*`)
    const keyValues = {}
    for (const key of costKeys) {
      keyValues[key] = await client.get(key)
    }

    return res.json({
      keyId,
      today,
      dailyCost,
      costStats,
      redisKeys: keyValues,
      timezone: require('../../../config/config').system.timezoneOffset || 8
    })
  } catch (error) {
    logger.error('❌ Failed to get cost debug info:', error)
    return res.status(500).json({ error: 'Failed to get cost debug info', message: error.message })
  }
})

// 获取单个 API Key 详情（轻量，用于编辑回显）
router.get('/api-keys/:keyId', authenticateAdmin, async (req, res, next) => {
  try {
    const { keyId } = req.params

    const uuidLike = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidLike.test(String(keyId))) {
      return next()
    }

    // 优先从 Postgres 获取，失败回退 Redis
    let keyData = null
    if (process.env.PG_LIST_API_KEYS === 'true') {
      try {
        const apiKeyStore = require('../../models/apiKeyStore')
        keyData = await apiKeyStore.getById(keyId)
      } catch (e) {
        logger.debug('PG getById failed, fallback to Redis:', e.message)
      }
    }
    if (!keyData || Object.keys(keyData).length === 0) {
      keyData = await redis.getApiKey(keyId)
    }
    if (!keyData || Object.keys(keyData).length === 0) {
      return res.status(404).json({ error: 'API key not found' })
    }

    const toInt = (v, d = 0) => parseInt(v ?? d) || 0
    const toFloat = (v, d = 0) => {
      const n = Number(v)
      return Number.isFinite(n) ? n : d
    }
    const toBool = (v) => v === true || v === 'true'
    const toJson = (v, fallback) => {
      try {
        return v ? JSON.parse(v) : fallback
      } catch {
        return fallback
      }
    }

    const detail = {
      id: keyId,
      name: keyData.name,
      description: keyData.description,
      createdAt: keyData.createdAt,
      updatedAt: keyData.updatedAt,
      lastUsedAt: keyData.lastUsedAt,
      expiresAt: keyData.expiresAt || null,
      isActive: toBool(keyData.isActive),
      isDeleted: toBool(keyData.isDeleted),
      tokenLimit: toInt(keyData.tokenLimit),
      concurrencyLimit: toInt(keyData.concurrencyLimit),
      rateLimitWindow: toInt(keyData.rateLimitWindow),
      rateLimitRequests: toInt(keyData.rateLimitRequests),
      rateLimitCost: toFloat(keyData.rateLimitCost),
      dailyRequestsLimit: toInt(keyData.dailyRequestsLimit),
      dailyCostLimit: toFloat(keyData.dailyCostLimit),
      totalCostLimit: toFloat(keyData.totalCostLimit),
      weeklyOpusCostLimit: toFloat(keyData.weeklyOpusCostLimit),
      permissions: keyData.permissions || 'all',
      enableModelRestriction: toBool(keyData.enableModelRestriction),
      restrictedModels: toJson(keyData.restrictedModels, []),
      enableClientRestriction: toBool(keyData.enableClientRestriction),
      allowedClients: toJson(keyData.allowedClients, []),
      claudeAccountId: keyData.claudeAccountId || '',
      claudeConsoleAccountId: keyData.claudeConsoleAccountId || '',
      geminiAccountId: keyData.geminiAccountId || '',
      openaiAccountId: keyData.openaiAccountId || '',
      azureOpenaiAccountId: keyData.azureOpenaiAccountId || '',
      bedrockAccountId: keyData.bedrockAccountId || '',
      droidAccountId: keyData.droidAccountId || '',
      userId: keyData.userId || '',
      userUsername: keyData.userUsername || '',
      createdBy: keyData.createdBy || 'admin',
      tags: toJson(keyData.tags, []),
      expirationMode: keyData.expirationMode || 'fixed',
      isActivated: toBool(keyData.isActivated),
      activationDays: toInt(keyData.activationDays),
      activationUnit: keyData.activationUnit || 'days',
      activatedAt: keyData.activatedAt || null
    }

    return res.json({ success: true, data: detail })
  } catch (error) {
    logger.error('❌ Failed to get API key detail:', error)
    return res.status(500).json({ error: 'Failed to get API key detail', message: error.message })
  }
})

// 获取所有API Keys（可选时间范围聚合）
router.get('/api-keys', authenticateAdmin, async (req, res) => {
  try {
    const { timeRange = 'all', startDate, endDate } = req.query
    const apiKeys = await apiKeyService.getAllApiKeys()
    const userService = require('../../services/userService')

    const now = new Date()
    const searchPatterns = []
    if (timeRange === 'custom' && startDate && endDate) {
      const redisClient = require('../../models/redis')
      const start = new Date(startDate)
      const end = new Date(endDate)
      if (start > end) {
        return res.status(400).json({ error: 'Start date must be before or equal to end date' })
      }
      const daysDiff = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1
      if (daysDiff > 365) {
        return res.status(400).json({ error: 'Date range cannot exceed 365 days' })
      }
      const currentDate = new Date(start)
      while (currentDate <= end) {
        const tzDate = redisClient.getDateInTimezone(currentDate)
        const dateStr = `${tzDate.getUTCFullYear()}-${String(tzDate.getUTCMonth() + 1).padStart(2, '0')}-${String(tzDate.getUTCDate()).padStart(2, '0')}`
        searchPatterns.push(`usage:daily:*:${dateStr}`)
        currentDate.setDate(currentDate.getDate() + 1)
      }
    } else if (timeRange === 'today') {
      const redisClient = require('../../models/redis')
      const tzDate = redisClient.getDateInTimezone(now)
      const dateStr = `${tzDate.getUTCFullYear()}-${String(tzDate.getUTCMonth() + 1).padStart(2, '0')}-${String(tzDate.getUTCDate()).padStart(2, '0')}`
      searchPatterns.push(`usage:daily:*:${dateStr}`)
    } else if (timeRange === '7days') {
      const redisClient = require('../../models/redis')
      for (let i = 0; i < 7; i++) {
        const date = new Date(now)
        date.setDate(date.getDate() - i)
        const tzDate = redisClient.getDateInTimezone(date)
        const dateStr = `${tzDate.getUTCFullYear()}-${String(tzDate.getUTCMonth() + 1).padStart(2, '0')}-${String(tzDate.getUTCDate()).padStart(2, '0')}`
        searchPatterns.push(`usage:daily:*:${dateStr}`)
      }
    } else if (timeRange === 'monthly') {
      const redisClient = require('../../models/redis')
      const tzDate = redisClient.getDateInTimezone(now)
      const currentMonth = `${tzDate.getUTCFullYear()}-${String(tzDate.getUTCMonth() + 1).padStart(2, '0')}`
      searchPatterns.push(`usage:monthly:*:${currentMonth}`)
    }

    for (const apiKey of apiKeys) {
      const client = redis.getClientSafe()
      if (timeRange === 'all') {
        if (apiKey.usage && apiKey.usage.total) {
          const monthlyKeys = await client.keys(`usage:${apiKey.id}:model:monthly:*:*`)
          const modelStatsMap = new Map()
          for (const key of monthlyKeys) {
            const match = key.match(/usage:.+:model:monthly:(.+):\d{4}-\d{2}$/)
            if (!match) {
              continue
            }
            const model = match[1]
            const data = await client.hgetall(key)
            if (data && Object.keys(data).length > 0) {
              if (!modelStatsMap.has(model)) {
                modelStatsMap.set(model, {
                  inputTokens: 0,
                  outputTokens: 0,
                  cacheCreateTokens: 0,
                  cacheReadTokens: 0
                })
              }
              const stats = modelStatsMap.get(model)
              stats.inputTokens +=
                parseInt(data.totalInputTokens) || parseInt(data.inputTokens) || 0
              stats.outputTokens +=
                parseInt(data.totalOutputTokens) || parseInt(data.outputTokens) || 0
              stats.cacheCreateTokens +=
                parseInt(data.totalCacheCreateTokens) || parseInt(data.cacheCreateTokens) || 0
              stats.cacheReadTokens +=
                parseInt(data.totalCacheReadTokens) || parseInt(data.cacheReadTokens) || 0
            }
          }
          let totalCost = 0
          for (const [model, stats] of modelStatsMap) {
            const usage = {
              input_tokens: stats.inputTokens,
              output_tokens: stats.outputTokens,
              cache_creation_input_tokens: stats.cacheCreateTokens,
              cache_read_input_tokens: stats.cacheReadTokens
            }
            const costResult = CostCalculator.calculateCost(usage, model)
            totalCost += costResult.costs.total
          }
          if (modelStatsMap.size === 0) {
            const usage = {
              input_tokens: apiKey.usage.total.inputTokens || 0,
              output_tokens: apiKey.usage.total.outputTokens || 0,
              cache_creation_input_tokens: apiKey.usage.total.cacheCreateTokens || 0,
              cache_read_input_tokens: apiKey.usage.total.cacheReadTokens || 0
            }
            const costResult = CostCalculator.calculateCost(usage, 'claude-3-5-haiku-20241022')
            totalCost = costResult.costs.total
          }
          apiKey.usage.total.cost = totalCost
          apiKey.usage.total.formattedCost = CostCalculator.formatCost(totalCost)
        }
      } else {
        const tempUsage = {
          requests: 0,
          tokens: 0,
          allTokens: 0,
          inputTokens: 0,
          outputTokens: 0,
          cacheCreateTokens: 0,
          cacheReadTokens: 0
        }
        for (const pattern of searchPatterns) {
          const keys = await client.keys(pattern.replace('*', apiKey.id))
          for (const key of keys) {
            const data = await client.hgetall(key)
            if (data && Object.keys(data).length > 0) {
              tempUsage.requests += parseInt(data.totalRequests) || parseInt(data.requests) || 0
              tempUsage.tokens += parseInt(data.totalTokens) || parseInt(data.tokens) || 0
              tempUsage.allTokens += parseInt(data.totalAllTokens) || parseInt(data.allTokens) || 0
              tempUsage.inputTokens +=
                parseInt(data.totalInputTokens) || parseInt(data.inputTokens) || 0
              tempUsage.outputTokens +=
                parseInt(data.totalOutputTokens) || parseInt(data.outputTokens) || 0
              tempUsage.cacheCreateTokens +=
                parseInt(data.totalCacheCreateTokens) || parseInt(data.cacheCreateTokens) || 0
              tempUsage.cacheReadTokens +=
                parseInt(data.totalCacheReadTokens) || parseInt(data.cacheReadTokens) || 0
            }
          }
        }

        let totalCost = 0
        const redisClient = require('../../models/redis')
        const tzToday = redisClient.getDateStringInTimezone(now)
        const tzDate = redisClient.getDateInTimezone(now)
        const tzMonth = `${tzDate.getUTCFullYear()}-${String(tzDate.getUTCMonth() + 1).padStart(2, '0')}`
        let modelKeys = []
        if (timeRange === 'custom' && startDate && endDate) {
          const start = new Date(startDate)
          const end = new Date(endDate)
          const currentDate = new Date(start)
          while (currentDate <= end) {
            const tzDateForKey = redisClient.getDateInTimezone(currentDate)
            const dateStr = `${tzDateForKey.getUTCFullYear()}-${String(tzDateForKey.getUTCMonth() + 1).padStart(2, '0')}-${String(tzDateForKey.getUTCDate()).padStart(2, '0')}`
            const dayKeys = await client.keys(`usage:${apiKey.id}:model:daily:*:${dateStr}`)
            modelKeys = modelKeys.concat(dayKeys)
            currentDate.setDate(currentDate.getDate() + 1)
          }
        } else {
          modelKeys =
            timeRange === 'today'
              ? await client.keys(`usage:${apiKey.id}:model:daily:*:${tzToday}`)
              : timeRange === '7days'
                ? await client.keys(`usage:${apiKey.id}:model:daily:*:*`)
                : await client.keys(`usage:${apiKey.id}:model:monthly:*:${tzMonth}`)
        }

        const modelStatsMap = new Map()
        for (const key of modelKeys) {
          if (timeRange === '7days') {
            const dateMatch = key.match(/\d{4}-\d{2}-\d{2}$/)
            if (dateMatch) {
              const keyDate = new Date(dateMatch[0])
              const daysDiff = Math.floor((now - keyDate) / (1000 * 60 * 60 * 24))
              if (daysDiff > 6) {
                continue
              }
            }
          }
          const modelMatch = key.match(
            /usage:.+:model:(?:daily|monthly):(.+):\d{4}-\d{2}(?:-\d{2})?$/
          )
          if (!modelMatch) {
            continue
          }
          const model = modelMatch[1]
          const data = await client.hgetall(key)
          if (data && Object.keys(data).length > 0) {
            if (!modelStatsMap.has(model)) {
              modelStatsMap.set(model, {
                inputTokens: 0,
                outputTokens: 0,
                cacheCreateTokens: 0,
                cacheReadTokens: 0
              })
            }
            const stats = modelStatsMap.get(model)
            stats.inputTokens += parseInt(data.totalInputTokens) || parseInt(data.inputTokens) || 0
            stats.outputTokens +=
              parseInt(data.totalOutputTokens) || parseInt(data.outputTokens) || 0
            stats.cacheCreateTokens +=
              parseInt(data.totalCacheCreateTokens) || parseInt(data.cacheCreateTokens) || 0
            stats.cacheReadTokens +=
              parseInt(data.totalCacheReadTokens) || parseInt(data.cacheReadTokens) || 0
          }
        }
        for (const [model, stats] of modelStatsMap) {
          const usage = {
            input_tokens: stats.inputTokens,
            output_tokens: stats.outputTokens,
            cache_creation_input_tokens: stats.cacheCreateTokens,
            cache_read_input_tokens: stats.cacheReadTokens
          }
          const costResult = CostCalculator.calculateCost(usage, model)
          totalCost += costResult.costs.total
        }
        if (modelStatsMap.size === 0 && tempUsage.tokens > 0) {
          const usage = {
            input_tokens: tempUsage.inputTokens,
            output_tokens: tempUsage.outputTokens,
            cache_creation_input_tokens: tempUsage.cacheCreateTokens,
            cache_read_input_tokens: tempUsage.cacheReadTokens
          }
          const costResult = CostCalculator.calculateCost(usage, 'claude-3-5-haiku-20241022')
          totalCost = costResult.costs.total
        }
        const allTokens =
          tempUsage.allTokens ||
          tempUsage.inputTokens +
            tempUsage.outputTokens +
            tempUsage.cacheCreateTokens +
            tempUsage.cacheReadTokens
        apiKey.usage[timeRange] = {
          ...tempUsage,
          tokens: allTokens,
          allTokens,
          cost: totalCost,
          formattedCost: CostCalculator.formatCost(totalCost)
        }
        apiKey.usage.total = apiKey.usage[timeRange]
      }
    }

    for (const apiKey of apiKeys) {
      if (apiKey.userId) {
        try {
          const user = await userService.getUserById(apiKey.userId, false)
          apiKey.ownerDisplayName = user
            ? user.displayName || user.username || 'Unknown User'
            : 'Unknown User'
        } catch (error) {
          logger.debug(`无法获取用户 ${apiKey.userId} 的信息:`, error)
          apiKey.ownerDisplayName = 'Unknown User'
        }
      } else {
        apiKey.ownerDisplayName =
          apiKey.createdBy === 'admin' ? 'Admin' : apiKey.createdBy || 'Admin'
      }
    }

    return res.json({ success: true, data: apiKeys })
  } catch (error) {
    logger.error('❌ Failed to get API keys:', error)
    return res.status(500).json({ error: 'Failed to get API keys', message: error.message })
  }
})

// 轻量列表：基于游标/页码的分页（不附带使用统计）
router.get('/api-keys/list', authenticateAdmin, async (req, res) => {
  try {
    const {
      cursor = '0',
      count = '20',
      includeDeleted = 'false',
      search = '',
      tag = '',
      includeUsage = 'false',
      timeRange = 'today',
      startDate,
      endDate,
      activated,
      page,
      pageNum,
      limit,
      pageSize,
      withTotal
    } = req.query

    const toInt = (v, d) => {
      const n = parseInt(String(v ?? '').trim() || String(d), 10)
      return Number.isFinite(n) && n > 0 ? n : d
    }
    const usePageNum = toInt(pageNum || page, 0)
    const size = Math.max(1, Math.min(200, toInt(pageSize || limit || count, 20)))
    const filters = { includeDeleted: includeDeleted === 'true', search, tag, activated }

    let result
    if (usePageNum > 0) {
      let next = '0'
      let lastPage = null
      for (let i = 1; i <= usePageNum; i++) {
        const r = await apiKeyService.listApiKeysCursor({ cursor: next, count: size, ...filters })
        lastPage = r
        next = r.cursor || '0'
        if (next === '0' && i < usePageNum) {
          break
        }
      }
      result = {
        cursor: lastPage?.cursor || next || '0',
        finished: lastPage?.finished || next === '0',
        items: lastPage?.items || [],
        page: usePageNum,
        pageSize: size
      }
      if (String(withTotal).toLowerCase() === 'true') {
        let total = 0
        let walkCursor = '0'
        do {
          const r = await apiKeyService.listApiKeysCursor({
            cursor: walkCursor,
            count: 500,
            ...filters
          })
          total += (r.items || []).length
          walkCursor = r.cursor || '0'
        } while (walkCursor !== '0')
        result.total = total
      }
    } else {
      result = await apiKeyService.listApiKeysCursor({
        cursor: String(cursor),
        count: size,
        ...filters
      })
    }

    if (includeUsage === 'true') {
      const items = result.items || []
      const ids = items.map((i) => i.id)
      if (ids.length > 0) {
        const { getUsageForKeysBatch } = require('../../services/apiKeyQueryService')
        const usageMap = await getUsageForKeysBatch(ids, timeRange, startDate, endDate)
        for (const it of items) {
          const u = usageMap[it.id] || {}
          it.usage = it.usage || {}
          if (timeRange === 'today') {
            it.usage.today = u
          } else if (timeRange === '7days') {
            it.usage.weekly = u
          } else if (timeRange === '30days' || timeRange === 'monthly') {
            it.usage.monthly = u
          } else {
            it.usage.total = u
          }
        }
      }
    }

    return res.json({ success: true, data: result })
  } catch (error) {
    logger.error('❌ Failed to list API keys (cursor/page):', error)
    return res.status(500).json({ error: 'Failed to list API keys', message: error.message })
  }
})

// 导出 API Keys（CSV）
router.get('/api-keys/export', authenticateAdmin, async (req, res) => {
  try {
    const { search = '', tag = '', activated } = req.query
    let cursor = '0'
    const all = []
    const MAX_PAGES = 1000
    let pages = 0
    do {
      const { cursor: next, items } = await apiKeyService.listApiKeysCursor({
        cursor,
        count: 200,
        includeDeleted: false,
        search,
        tag,
        activated
      })
      if (Array.isArray(items)) {
        all.push(...items)
      }
      cursor = next
      pages++
      if (pages >= MAX_PAGES) {
        break
      }
    } while (cursor !== '0')

    const [
      claudeAccountsRaw,
      claudeConsoleAccountsRaw,
      geminiAccountsRaw,
      openaiAccountsRaw,
      openaiResponsesAccountsRaw,
      bedrockResult,
      droidAccountsRaw,
      accountGroups
    ] = await Promise.all([
      require('../../services/claudeAccountService')
        .getAllAccounts()
        .catch(() => []),
      require('../../services/claudeConsoleAccountService')
        .getAllAccounts()
        .catch(() => []),
      require('../../services/geminiAccountService')
        .getAllAccounts()
        .catch(() => []),
      require('../../services/openaiAccountService')
        .getAllAccounts()
        .catch(() => []),
      require('../../services/openaiResponsesAccountService')
        .getAllAccounts()
        .catch(() => []),
      require('../../services/bedrockAccountService')
        .getAllAccounts()
        .catch(() => ({ success: true, data: [] })),
      require('../../services/droidAccountService')
        .getAllAccounts()
        .catch(() => []),
      require('../../services/accountGroupService')
        .getAllGroups()
        .catch(() => [])
    ])

    const mapById = (arr) => {
      const m = new Map()
      ;(arr || []).forEach((a) => m.set(a.id, a))
      return m
    }
    const claudeMap = mapById(claudeAccountsRaw)
    const claudeConsoleMap = mapById(claudeConsoleAccountsRaw)
    const geminiMap = mapById(geminiAccountsRaw)
    const openaiMap = mapById(openaiAccountsRaw)
    const openaiRespMap = mapById(openaiResponsesAccountsRaw)
    const bedrockMap = mapById(bedrockResult?.data || [])
    const droidMap = mapById(droidAccountsRaw)
    const groupMap = new Map()
    ;(accountGroups || []).forEach((g) => groupMap.set(g.id, g))

    const getNameByBinding = (platform, id) => {
      if (!id) {
        return ''
      }
      if (id.startsWith && id.startsWith('group:')) {
        const gid = id.substring(6)
        const g = groupMap.get(gid)
        return g ? `分组-${g.name}` : `分组-${gid.substring(0, 8)}`
      }
      let name = ''
      if (platform === 'claude-oauth') {
        name = claudeMap.get(id)?.name || ''
      } else if (platform === 'claude-console') {
        name = claudeConsoleMap.get(id)?.name || ''
      } else if (platform === 'gemini') {
        name = geminiMap.get(id)?.name || ''
      } else if (platform === 'openai') {
        name = openaiMap.get(id)?.name || openaiRespMap.get(id)?.name || ''
      } else if (platform === 'bedrock') {
        name = bedrockMap.get(id)?.name || ''
      } else if (platform === 'droid') {
        name = droidMap.get(id)?.name || ''
      }
      return name || `${id.substring(0, 8)}...`
    }

    const getBindingsString = (k) => {
      const parts = []
      if (k.claudeAccountId || k.claudeConsoleAccountId) {
        const id = k.claudeAccountId || k.claudeConsoleAccountId
        parts.push(
          `Claude ${getNameByBinding(k.claudeAccountId ? 'claude-oauth' : 'claude-console', id)}`
        )
      }
      if (k.geminiAccountId) {
        parts.push(`Gemini ${getNameByBinding('gemini', k.geminiAccountId)}`)
      }
      if (k.openaiAccountId) {
        parts.push(`OpenAI ${getNameByBinding('openai', k.openaiAccountId)}`)
      }
      if (k.bedrockAccountId) {
        parts.push(`Bedrock ${getNameByBinding('bedrock', k.bedrockAccountId)}`)
      }
      if (k.droidAccountId) {
        parts.push(`Droid ${getNameByBinding('droid', k.droidAccountId)}`)
      }
      if (parts.length === 0) {
        parts.push('共享池')
      }
      return parts.join(' | ')
    }

    const pad2 = (n) => String(n).padStart(2, '0')
    const formatDateTime = (iso) => {
      if (!iso) {
        return ''
      }
      const d = new Date(iso)
      return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`
    }

    const tokens = await Promise.all(
      all.map((k) => apiKeyService.getPlaintextToken(k.id).catch(() => null))
    )
    const headers = [
      '名称',
      '所属账号',
      '每日请求上限 (次)',
      '速率限制',
      'API Token',
      '创建时间',
      '是否激活',
      '过期时间',
      '过期周期'
    ]
    const toCsvValue = (v) => {
      if (v === null || v === undefined) {
        return ''
      }
      const s = String(v)
      if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return `"${s.replace(/"/g, '""')}"`
      }
      return s
    }
    const unitZh = (u) => (u === 'hours' ? '小时' : u === 'months' || u === 'month' ? '月' : '天')
    const cycleStr = (k) => {
      if (k.expirationMode === 'activation') {
        const days = Number(k.activationDays || 0)
        const unit = k.activationUnit || 'days'
        if (days > 0) {
          return `（${days}${unitZh(unit)}）`
        }
      }
      return ''
    }
    const rows = all.map((k, i) => {
      const dailyLimit = Number(k.dailyRequestsLimit || 0)
      const r = Number(k.rateLimitRequests || 0)
      const w = Number(k.rateLimitWindow || 0)
      const rateStr = r > 0 && w > 0 ? `${r} 次 / ${w} 分钟` : '无限'
      const isAct = k.isActivated ? '是' : '否'
      return [
        k.name || '',
        getBindingsString(k),
        dailyLimit > 0 ? dailyLimit : '无限',
        rateStr,
        tokens[i] || '',
        formatDateTime(k.createdAt),
        isAct,
        formatDateTime(k.expiresAt),
        cycleStr(k)
      ]
    })

    const BOM = '\ufeff'
    const csv = [
      headers.map(toCsvValue).join(','),
      ...rows.map((r) => r.map(toCsvValue).join(','))
    ].join('\n')
    const out = BOM + csv
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', 'attachment; filename="api-keys.csv"')
    return res.status(200).send(out)
  } catch (error) {
    logger.error('❌ Failed to export API keys:', error)
    return res.status(500).json({ error: 'Failed to export API keys', message: error.message })
  }
})

// 批量获取使用统计（按时间范围）
router.get('/api-keys/usage-batch', authenticateAdmin, async (req, res) => {
  try {
    const { ids, timeRange = 'all', startDate, endDate } = req.query
    if (!ids) {
      return res.status(400).json({ error: 'ids is required (comma separated key ids)' })
    }
    const keyIds = String(ids)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    if (keyIds.length === 0) {
      return res.json({ success: true, data: {} })
    }
    const { getUsageForKeysBatch } = require('../../services/apiKeyQueryService')
    const usageMap = await getUsageForKeysBatch(keyIds, timeRange, startDate, endDate)
    return res.json({ success: true, data: usageMap })
  } catch (error) {
    logger.error('❌ Failed to get usage batch:', error)
    return res.status(500).json({ error: 'Failed to get usage batch', message: error.message })
  }
})

// 获取单个 API Key 详情用量（total/daily/monthly/averages + 费用）
router.get('/api-keys/:keyId/usage', authenticateAdmin, async (req, res) => {
  try {
    const { keyId } = req.params
    const [usage, costStats, dailyCost, weeklyOpusCost] = await Promise.all([
      redis.getUsageStats(keyId),
      redis.getCostStats(keyId),
      redis.getDailyCost(keyId),
      redis.getWeeklyOpusCost(keyId)
    ])
    if (usage && usage.total) {
      usage.total.cost = costStats?.total || 0
    }
    return res.json({
      success: true,
      data: { usage, dailyCost: dailyCost || 0, weeklyOpusCost: weeklyOpusCost || 0 }
    })
  } catch (error) {
    logger.error('❌ Failed to get API key usage:', error)
    return res.status(500).json({ error: 'Failed to get API key usage', message: error.message })
  }
})

// 获取当日请求数（批量）与剩余额度
router.get('/api-keys/daily-requests', authenticateAdmin, async (req, res) => {
  try {
    const { ids } = req.query
    if (!ids) {
      return res.status(400).json({ error: 'ids is required (comma separated key ids)' })
    }
    const keyIds = String(ids)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    if (keyIds.length === 0) {
      return res.json({ success: true, data: {} })
    }
    const todayStr = redis.getDateStringInTimezone(new Date())
    const client = redis.getClientSafe()
    const pipeline = client.pipeline()
    for (const id of keyIds) {
      pipeline.get(`rate_limit:daily_requests:${id}:${todayStr}`)
    }
    for (const id of keyIds) {
      pipeline.hget(`apikey:${id}`, 'dailyRequestsLimit')
    }
    const results = await pipeline.exec()
    const data = {}
    for (let i = 0; i < keyIds.length; i++) {
      const id = keyIds[i]
      const reqVal = results[i]?.[1]
      const limVal = results[keyIds.length + i]?.[1]
      const used = parseInt(reqVal || '0') || 0
      const limit = parseInt(limVal || '0') || 0
      const remaining = limit > 0 ? Math.max(0, limit - used) : null
      data[id] = { used, limit, remaining, date: todayStr }
    }
    return res.json({ success: true, data })
  } catch (error) {
    logger.error('❌ Failed to get daily requests (batch):', error)
    return res.status(500).json({ error: 'Failed to get daily requests', message: error.message })
  }
})

// 获取当日请求数（单个）与剩余额度
router.get('/api-keys/:keyId/daily-requests', authenticateAdmin, async (req, res) => {
  try {
    const { keyId } = req.params
    const todayStr = redis.getDateStringInTimezone(new Date())
    const client = redis.getClientSafe()
    const dailyKey = `rate_limit:daily_requests:${keyId}:${todayStr}`
    const [usedStr, limitStr] = await Promise.all([
      client.get(dailyKey),
      client.hget(`apikey:${keyId}`, 'dailyRequestsLimit')
    ])
    const used = parseInt(usedStr || '0') || 0
    const limit = parseInt(limitStr || '0') || 0
    const remaining = limit > 0 ? Math.max(0, limit - used) : null
    return res.json({ success: true, data: { used, limit, remaining, date: todayStr } })
  } catch (error) {
    logger.error('❌ Failed to get daily requests (single):', error)
    return res.status(500).json({ error: 'Failed to get daily requests', message: error.message })
  }
})

// 获取已存在的标签列表
router.get('/api-keys/tags', authenticateAdmin, async (req, res) => {
  try {
    const includeDeleted = req.query.includeDeleted === 'true'
    // 优先 PG：更快更准确
    if (process.env.PG_LIST_API_KEYS === 'true') {
      const apiKeyStore = require('../../models/apiKeyStore')
      const tags = await apiKeyStore.getDistinctTags(includeDeleted)
      return res.json({ success: true, data: tags })
    }

    // 回退 Redis SCAN
    const client = redis.getClientSafe()
    const tagSet = new Set()
    let cursor = '0'
    const SCAN_COUNT = 1000
    do {
      const [next, keys] = await client.scan(cursor, 'MATCH', 'apikey:*', 'COUNT', String(SCAN_COUNT))
      cursor = next
      const filtered = keys.filter((k) => k !== 'apikey:hash_map')
      if (filtered.length === 0) continue
      const pipeline = client.pipeline()
      filtered.forEach((k) => pipeline.hmget(k, 'tags', 'isDeleted'))
      const results = await pipeline.exec()
      for (const [err, vals] of results) {
        if (err || !Array.isArray(vals)) continue
        const [tagsStr, isDeleted] = vals
        if (!includeDeleted && isDeleted === 'true') continue
        if (!tagsStr) continue
        try {
          const arr = JSON.parse(tagsStr)
          if (Array.isArray(arr)) {
            arr.forEach((t) => {
              if (typeof t === 'string') {
                const v = t.trim()
                if (v) tagSet.add(v)
              }
            })
          }
        } catch (_) {
          logger.debug('api-keys/tags: ignore invalid tags JSON string')
        }
      }
    } while (cursor !== '0')
    const tags = Array.from(tagSet).sort()
    return res.json({ success: true, data: tags })
  } catch (error) {
    logger.error('❌ Failed to get API key tags:', error)
    return res.status(500).json({ error: 'Failed to get API key tags', message: error.message })
  }
})

// 创建新的API Key
router.post('/api-keys', authenticateAdmin, async (req, res) => {
  try {
    const {
      name,
      description,
      tokenLimit,
      expiresAt,
      claudeAccountId,
      claudeConsoleAccountId,
      geminiAccountId,
      openaiAccountId,
      bedrockAccountId,
      droidAccountId,
      permissions,
      concurrencyLimit,
      rateLimitWindow,
      rateLimitRequests,
      rateLimitCost,
      dailyRequestsLimit,
      enableModelRestriction,
      restrictedModels,
      enableClientRestriction,
      allowedClients,
      dailyCostLimit,
      totalCostLimit,
      weeklyOpusCostLimit,
      tags,
      activationDays,
      activationUnit,
      expirationMode,
      icon
    } = req.body

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ error: 'Name is required and must be a non-empty string' })
    }
    if (name.length > 100) {
      return res.status(400).json({ error: 'Name must be less than 100 characters' })
    }
    if (description && (typeof description !== 'string' || description.length > 500)) {
      return res
        .status(400)
        .json({ error: 'Description must be a string with less than 500 characters' })
    }
    if (tokenLimit && (!Number.isInteger(Number(tokenLimit)) || Number(tokenLimit) < 0)) {
      return res.status(400).json({ error: 'Token limit must be a non-negative integer' })
    }
    if (
      concurrencyLimit !== undefined &&
      concurrencyLimit !== null &&
      concurrencyLimit !== '' &&
      (!Number.isInteger(Number(concurrencyLimit)) || Number(concurrencyLimit) < 0)
    ) {
      return res.status(400).json({ error: 'Concurrency limit must be a non-negative integer' })
    }
    if (
      rateLimitWindow !== undefined &&
      rateLimitWindow !== null &&
      rateLimitWindow !== '' &&
      (!Number.isInteger(Number(rateLimitWindow)) || Number(rateLimitWindow) < 1)
    ) {
      return res
        .status(400)
        .json({ error: 'Rate limit window must be a positive integer (minutes)' })
    }
    if (
      rateLimitRequests !== undefined &&
      rateLimitRequests !== null &&
      rateLimitRequests !== '' &&
      (!Number.isInteger(Number(rateLimitRequests)) || Number(rateLimitRequests) < 1)
    ) {
      return res.status(400).json({ error: 'Rate limit requests must be a positive integer' })
    }
    if (
      dailyRequestsLimit !== undefined &&
      dailyRequestsLimit !== null &&
      dailyRequestsLimit !== '' &&
      (!Number.isInteger(Number(dailyRequestsLimit)) || Number(dailyRequestsLimit) < 0)
    ) {
      return res.status(400).json({ error: 'Daily requests limit must be a non-negative integer' })
    }
    if (enableModelRestriction !== undefined && typeof enableModelRestriction !== 'boolean') {
      return res.status(400).json({ error: 'Enable model restriction must be a boolean' })
    }
    if (restrictedModels !== undefined && !Array.isArray(restrictedModels)) {
      return res.status(400).json({ error: 'Restricted models must be an array' })
    }
    if (enableClientRestriction !== undefined && typeof enableClientRestriction !== 'boolean') {
      return res.status(400).json({ error: 'Enable client restriction must be a boolean' })
    }
    if (allowedClients !== undefined && !Array.isArray(allowedClients)) {
      return res.status(400).json({ error: 'Allowed clients must be an array' })
    }
    if (tags !== undefined && !Array.isArray(tags)) {
      return res.status(400).json({ error: 'Tags must be an array' })
    }
    if (tags && tags.some((tag) => typeof tag !== 'string' || tag.trim().length === 0)) {
      return res.status(400).json({ error: 'All tags must be non-empty strings' })
    }
    if (
      totalCostLimit !== undefined &&
      totalCostLimit !== null &&
      totalCostLimit !== '' &&
      (Number.isNaN(Number(totalCostLimit)) || Number(totalCostLimit) < 0)
    ) {
      return res.status(400).json({ error: 'Total cost limit must be a non-negative number' })
    }
    if (expirationMode && !['fixed', 'activation'].includes(expirationMode)) {
      return res
        .status(400)
        .json({ error: 'Expiration mode must be either "fixed" or "activation"' })
    }
    if (expirationMode === 'activation') {
      if (!activationUnit || !['hours', 'days', 'months'].includes(activationUnit)) {
        return res.status(400).json({
          error:
            'Activation unit must be one of "hours", "days" or "months" when using activation mode'
        })
      }
      if (
        !activationDays ||
        !Number.isInteger(Number(activationDays)) ||
        Number(activationDays) < 1
      ) {
        const unitText = activationUnit === 'hours' ? 'hours' : 'days'
        return res.status(400).json({
          error: `Activation ${unitText} must be a positive integer when using activation mode`
        })
      }
      if (expiresAt) {
        return res
          .status(400)
          .json({ error: 'Cannot set fixed expiration date when using activation mode' })
      }
    }
    if (
      permissions !== undefined &&
      permissions !== null &&
      permissions !== '' &&
      !['claude', 'gemini', 'openai', 'droid', 'all'].includes(permissions)
    ) {
      return res
        .status(400)
        .json({ error: 'Invalid permissions value. Must be claude, gemini, openai, droid, or all' })
    }

    const newKey = await apiKeyService.generateApiKey({
      name,
      description,
      tokenLimit,
      expiresAt,
      claudeAccountId,
      claudeConsoleAccountId,
      geminiAccountId,
      openaiAccountId,
      bedrockAccountId,
      droidAccountId,
      permissions,
      concurrencyLimit,
      rateLimitWindow,
      rateLimitRequests,
      rateLimitCost,
      dailyRequestsLimit,
      enableModelRestriction,
      restrictedModels,
      enableClientRestriction,
      allowedClients,
      dailyCostLimit,
      totalCostLimit,
      weeklyOpusCostLimit,
      tags,
      activationDays,
      activationUnit,
      expirationMode,
      icon
    })
    logger.success(`🔑 Admin created new API key: ${name}`)
    return res.json({ success: true, data: newKey })
  } catch (error) {
    logger.error('❌ Failed to create API key:', error)
    return res.status(500).json({ error: 'Failed to create API key', message: error.message })
  }
})

// 批量创建API Keys
router.post('/api-keys/batch', authenticateAdmin, async (req, res) => {
  try {
    const {
      baseName,
      count,
      description,
      tokenLimit,
      expiresAt,
      claudeAccountId,
      claudeConsoleAccountId,
      geminiAccountId,
      openaiAccountId,
      bedrockAccountId,
      droidAccountId,
      permissions,
      concurrencyLimit,
      rateLimitWindow,
      rateLimitRequests,
      rateLimitCost,
      dailyRequestsLimit,
      enableModelRestriction,
      restrictedModels,
      enableClientRestriction,
      allowedClients,
      dailyCostLimit,
      totalCostLimit,
      weeklyOpusCostLimit,
      tags,
      activationDays,
      activationUnit,
      expirationMode,
      icon
    } = req.body
    if (!baseName || typeof baseName !== 'string' || baseName.trim().length === 0) {
      return res.status(400).json({ error: 'Base name is required and must be a non-empty string' })
    }
    if (!count || !Number.isInteger(count) || count < 2 || count > 500) {
      return res.status(400).json({ error: 'Count must be an integer between 2 and 500' })
    }
    if (baseName.length > 90) {
      return res
        .status(400)
        .json({ error: 'Base name must be less than 90 characters to allow for numbering' })
    }
    if (
      permissions !== undefined &&
      permissions !== null &&
      permissions !== '' &&
      !['claude', 'gemini', 'openai', 'droid', 'all'].includes(permissions)
    ) {
      return res
        .status(400)
        .json({ error: 'Invalid permissions value. Must be claude, gemini, openai, droid, or all' })
    }

    const createdKeys = []
    const errors = []
    for (let i = 1; i <= count; i++) {
      try {
        const name = `${baseName}_${i}`
        const newKey = await apiKeyService.generateApiKey({
          name,
          description,
          tokenLimit,
          expiresAt,
          claudeAccountId,
          claudeConsoleAccountId,
          geminiAccountId,
          openaiAccountId,
          bedrockAccountId,
          droidAccountId,
          permissions,
          concurrencyLimit,
          rateLimitWindow,
          rateLimitRequests,
          rateLimitCost,
          dailyRequestsLimit,
          enableModelRestriction,
          restrictedModels,
          enableClientRestriction,
          allowedClients,
          dailyCostLimit,
          totalCostLimit,
          weeklyOpusCostLimit,
          tags,
          activationDays,
          activationUnit,
          expirationMode,
          icon
        })
        createdKeys.push({ ...newKey, apiKey: newKey.apiKey })
      } catch (error) {
        errors.push({ index: i, name: `${baseName}_${i}`, error: error.message })
      }
    }
    if (errors.length > 0 && createdKeys.length === 0) {
      return res
        .status(400)
        .json({ success: false, error: 'Failed to create any API keys', errors })
    }
    return res.json({
      success: true,
      data: createdKeys,
      errors: errors.length > 0 ? errors : undefined,
      summary: { requested: count, created: createdKeys.length, failed: errors.length }
    })
  } catch (error) {
    logger.error('Failed to batch create API keys:', error)
    return res
      .status(500)
      .json({ success: false, error: 'Failed to batch create API keys', message: error.message })
  }
})

// 批量编辑API Keys
router.put('/api-keys/batch', authenticateAdmin, async (req, res) => {
  try {
    const { keyIds, updates } = req.body
    if (!keyIds || !Array.isArray(keyIds) || keyIds.length === 0) {
      return res
        .status(400)
        .json({ error: 'Invalid input', message: 'keyIds must be a non-empty array' })
    }
    if (!updates || typeof updates !== 'object') {
      return res.status(400).json({ error: 'Invalid input', message: 'updates must be an object' })
    }
    if (
      updates.permissions !== undefined &&
      !['claude', 'gemini', 'openai', 'droid', 'all'].includes(updates.permissions)
    ) {
      return res
        .status(400)
        .json({ error: 'Invalid permissions value. Must be claude, gemini, openai, droid, or all' })
    }

    logger.info(
      `🔄 Admin batch editing ${keyIds.length} API keys with updates: ${JSON.stringify(updates)}`
    )
    logger.info(`🔍 Debug: keyIds received: ${JSON.stringify(keyIds)}`)

    const results = { successCount: 0, failedCount: 0, errors: [] }
    for (const keyId of keyIds) {
      try {
        const currentKey = await redis.getApiKey(keyId)
        if (!currentKey || Object.keys(currentKey).length === 0) {
          results.failedCount++
          results.errors.push(`API key ${keyId} not found`)
          continue
        }
        const finalUpdates = {}
        if (updates.name) {
          finalUpdates.name = updates.name
        }
        if (updates.tokenLimit !== undefined) {
          finalUpdates.tokenLimit = updates.tokenLimit
        }
        if (updates.rateLimitCost !== undefined) {
          finalUpdates.rateLimitCost = updates.rateLimitCost
        }
        if (updates.concurrencyLimit !== undefined) {
          finalUpdates.concurrencyLimit = updates.concurrencyLimit
        }
        if (updates.rateLimitWindow !== undefined) {
          finalUpdates.rateLimitWindow = updates.rateLimitWindow
        }
        if (updates.rateLimitRequests !== undefined) {
          finalUpdates.rateLimitRequests = updates.rateLimitRequests
        }
        if (updates.dailyCostLimit !== undefined) {
          finalUpdates.dailyCostLimit = updates.dailyCostLimit
        }
        if (updates.totalCostLimit !== undefined) {
          finalUpdates.totalCostLimit = updates.totalCostLimit
        }
        if (updates.weeklyOpusCostLimit !== undefined) {
          finalUpdates.weeklyOpusCostLimit = updates.weeklyOpusCostLimit
        }
        if (updates.permissions !== undefined) {
          finalUpdates.permissions = updates.permissions
        }
        if (updates.isActive !== undefined) {
          finalUpdates.isActive = updates.isActive
        }
        if (updates.monthlyLimit !== undefined) {
          finalUpdates.monthlyLimit = updates.monthlyLimit
        }
        if (updates.priority !== undefined) {
          finalUpdates.priority = updates.priority
        }
        if (updates.enabled !== undefined) {
          finalUpdates.enabled = updates.enabled
        }
        if (updates.claudeAccountId !== undefined) {
          finalUpdates.claudeAccountId = updates.claudeAccountId
        }
        if (updates.claudeConsoleAccountId !== undefined) {
          finalUpdates.claudeConsoleAccountId = updates.claudeConsoleAccountId
        }
        if (updates.geminiAccountId !== undefined) {
          finalUpdates.geminiAccountId = updates.geminiAccountId
        }
        if (updates.openaiAccountId !== undefined) {
          finalUpdates.openaiAccountId = updates.openaiAccountId
        }
        if (updates.bedrockAccountId !== undefined) {
          finalUpdates.bedrockAccountId = updates.bedrockAccountId
        }
        if (updates.droidAccountId !== undefined) {
          finalUpdates.droidAccountId = updates.droidAccountId || ''
        }
        if (updates.tags !== undefined) {
          if (updates.tagOperation) {
            const currentTags = currentKey.tags ? JSON.parse(currentKey.tags) : []
            const operationTags = updates.tags
            switch (updates.tagOperation) {
              case 'replace':
                finalUpdates.tags = operationTags
                break
              case 'add': {
                const newTags = [...currentTags]
                operationTags.forEach((tag) => {
                  if (!newTags.includes(tag)) {
                    newTags.push(tag)
                  }
                })
                finalUpdates.tags = newTags
                break
              }
              case 'remove':
                finalUpdates.tags = currentTags.filter((tag) => !operationTags.includes(tag))
                break
              default:
                finalUpdates.tags = updates.tags
            }
          } else {
            finalUpdates.tags = updates.tags
          }
        }
        await apiKeyService.updateApiKey(keyId, finalUpdates)
        results.successCount++
        logger.success(`✅ Batch edit: API key ${keyId} updated successfully`)
      } catch (error) {
        results.failedCount++
        results.errors.push(`Failed to update key ${keyId}: ${error.message}`)
        logger.error(`❌ Batch edit failed for key ${keyId}:`, error)
      }
    }
    if (results.successCount > 0) {
      logger.success(
        `🎉 Batch edit completed: ${results.successCount} successful, ${results.failedCount} failed`
      )
    } else {
      logger.warn(
        `⚠️ Batch edit completed with no successful updates: ${results.failedCount} failed`
      )
    }
    return res.json({ success: true, message: '批量编辑完成', data: results })
  } catch (error) {
    logger.error('❌ Failed to batch edit API keys:', error)
    return res.status(500).json({ error: 'Batch edit failed', message: error.message })
  }
})

// 更新API Key
router.put('/api-keys/:keyId', authenticateAdmin, async (req, res) => {
  try {
    const { keyId } = req.params
    const {
      name,
      tokenLimit,
      concurrencyLimit,
      rateLimitWindow,
      rateLimitRequests,
      rateLimitCost,
      dailyRequestsLimit,
      isActive,
      claudeAccountId,
      claudeConsoleAccountId,
      geminiAccountId,
      openaiAccountId,
      bedrockAccountId,
      droidAccountId,
      permissions,
      enableModelRestriction,
      restrictedModels,
      enableClientRestriction,
      allowedClients,
      expiresAt,
      dailyCostLimit,
      totalCostLimit,
      weeklyOpusCostLimit,
      tags,
      ownerId
    } = req.body
    const updates = {}
    if (name !== undefined && name !== null && name !== '') {
      const trimmedName = name.toString().trim()
      if (trimmedName.length === 0) {
        return res.status(400).json({ error: 'API Key name cannot be empty' })
      }
      if (trimmedName.length > 100) {
        return res.status(400).json({ error: 'API Key name must be less than 100 characters' })
      }
      updates.name = trimmedName
    }
    if (tokenLimit !== undefined && tokenLimit !== null && tokenLimit !== '') {
      if (!Number.isInteger(Number(tokenLimit)) || Number(tokenLimit) < 0) {
        return res.status(400).json({ error: 'Token limit must be a non-negative integer' })
      }
      updates.tokenLimit = Number(tokenLimit)
    }
    if (concurrencyLimit !== undefined && concurrencyLimit !== null && concurrencyLimit !== '') {
      if (!Number.isInteger(Number(concurrencyLimit)) || Number(concurrencyLimit) < 0) {
        return res.status(400).json({ error: 'Concurrency limit must be a non-negative integer' })
      }
      updates.concurrencyLimit = Number(concurrencyLimit)
    }
    if (rateLimitWindow !== undefined && rateLimitWindow !== null && rateLimitWindow !== '') {
      if (!Number.isInteger(Number(rateLimitWindow)) || Number(rateLimitWindow) < 0) {
        return res
          .status(400)
          .json({ error: 'Rate limit window must be a non-negative integer (minutes)' })
      }
      updates.rateLimitWindow = Number(rateLimitWindow)
    }
    if (rateLimitRequests !== undefined && rateLimitRequests !== null && rateLimitRequests !== '') {
      if (!Number.isInteger(Number(rateLimitRequests)) || Number(rateLimitRequests) < 0) {
        return res.status(400).json({ error: 'Rate limit requests must be a non-negative integer' })
      }
      updates.rateLimitRequests = Number(rateLimitRequests)
    }
    if (rateLimitCost !== undefined && rateLimitCost !== null && rateLimitCost !== '') {
      const cost = Number(rateLimitCost)
      if (isNaN(cost) || cost < 0) {
        return res.status(400).json({ error: 'Rate limit cost must be a non-negative number' })
      }
      updates.rateLimitCost = cost
    }
    if (
      dailyRequestsLimit !== undefined &&
      dailyRequestsLimit !== null &&
      dailyRequestsLimit !== ''
    ) {
      if (!Number.isInteger(Number(dailyRequestsLimit)) || Number(dailyRequestsLimit) < 0) {
        return res
          .status(400)
          .json({ error: 'Daily requests limit must be a non-negative integer' })
      }
      updates.dailyRequestsLimit = Number(dailyRequestsLimit)
    }
    if (claudeAccountId !== undefined) {
      updates.claudeAccountId = claudeAccountId || ''
    }
    if (claudeConsoleAccountId !== undefined) {
      updates.claudeConsoleAccountId = claudeConsoleAccountId || ''
    }
    if (geminiAccountId !== undefined) {
      updates.geminiAccountId = geminiAccountId || ''
    }
    if (openaiAccountId !== undefined) {
      updates.openaiAccountId = openaiAccountId || ''
    }
    if (bedrockAccountId !== undefined) {
      updates.bedrockAccountId = bedrockAccountId || ''
    }
    if (droidAccountId !== undefined) {
      updates.droidAccountId = droidAccountId || ''
    }
    if (permissions !== undefined) {
      if (!['claude', 'gemini', 'openai', 'droid', 'all'].includes(permissions)) {
        return res.status(400).json({
          error: 'Invalid permissions value. Must be claude, gemini, openai, droid, or all'
        })
      }
      updates.permissions = permissions
    }
    if (enableModelRestriction !== undefined) {
      if (typeof enableModelRestriction !== 'boolean') {
        return res.status(400).json({ error: 'Enable model restriction must be a boolean' })
      }
      updates.enableModelRestriction = enableModelRestriction
    }
    if (restrictedModels !== undefined) {
      if (!Array.isArray(restrictedModels)) {
        return res.status(400).json({ error: 'Restricted models must be an array' })
      }
      updates.restrictedModels = restrictedModels
    }
    if (enableClientRestriction !== undefined) {
      if (typeof enableClientRestriction !== 'boolean') {
        return res.status(400).json({ error: 'Enable client restriction must be a boolean' })
      }
      updates.enableClientRestriction = enableClientRestriction
    }
    if (allowedClients !== undefined) {
      if (!Array.isArray(allowedClients)) {
        return res.status(400).json({ error: 'Allowed clients must be an array' })
      }
      updates.allowedClients = allowedClients
    }
    if (expiresAt !== undefined) {
      if (expiresAt === null) {
        updates.expiresAt = null
        updates.isActive = true
      } else {
        const expireDate = new Date(expiresAt)
        if (isNaN(expireDate.getTime())) {
          return res.status(400).json({ error: 'Invalid expiration date format' })
        }
        updates.expiresAt = expiresAt
        updates.isActive = expireDate > new Date()
      }
    }
    if (dailyCostLimit !== undefined && dailyCostLimit !== null && dailyCostLimit !== '') {
      const costLimit = Number(dailyCostLimit)
      if (isNaN(costLimit) || costLimit < 0) {
        return res.status(400).json({ error: 'Daily cost limit must be a non-negative number' })
      }
      updates.dailyCostLimit = costLimit
    }
    if (totalCostLimit !== undefined && totalCostLimit !== null && totalCostLimit !== '') {
      const costLimit = Number(totalCostLimit)
      if (isNaN(costLimit) || costLimit < 0) {
        return res.status(400).json({ error: 'Total cost limit must be a non-negative number' })
      }
      updates.totalCostLimit = costLimit
    }
    if (
      weeklyOpusCostLimit !== undefined &&
      weeklyOpusCostLimit !== null &&
      weeklyOpusCostLimit !== ''
    ) {
      const costLimit = Number(weeklyOpusCostLimit)
      if (isNaN(costLimit) || costLimit < 0) {
        return res
          .status(400)
          .json({ error: 'Weekly Opus cost limit must be a non-negative number' })
      }
      updates.weeklyOpusCostLimit = costLimit
    }
    if (tags !== undefined) {
      if (!Array.isArray(tags)) {
        return res.status(400).json({ error: 'Tags must be an array' })
      }
      if (tags.some((tag) => typeof tag !== 'string' || tag.trim().length === 0)) {
        return res.status(400).json({ error: 'All tags must be non-empty strings' })
      }
      updates.tags = tags
    }
    if (isActive !== undefined) {
      if (typeof isActive !== 'boolean') {
        return res.status(400).json({ error: 'isActive must be a boolean' })
      }
      updates.isActive = isActive
    }
    if (ownerId !== undefined) {
      const userService = require('../../services/userService')
      if (ownerId === 'admin') {
        updates.userId = ''
        updates.userUsername = ''
        updates.createdBy = 'admin'
      } else if (ownerId) {
        try {
          const user = await userService.getUserById(ownerId, false)
          if (!user) {
            return res.status(400).json({ error: 'Invalid owner: User not found' })
          }
          if (!user.isActive) {
            return res.status(400).json({ error: 'Cannot assign to inactive user' })
          }
          updates.userId = ownerId
          updates.userUsername = user.username
          updates.createdBy = user.username
          logger.info(`🔄 Admin reassigning API key ${keyId} to user ${user.username}`)
        } catch (error) {
          logger.error('Error fetching user for owner reassignment:', error)
          return res.status(400).json({ error: 'Invalid owner ID' })
        }
      } else {
        updates.userId = ''
        updates.userUsername = ''
        updates.createdBy = 'admin'
      }
    }
    await apiKeyService.updateApiKey(keyId, updates)
    logger.success(`📝 Admin updated API key: ${keyId}`)
    return res.json({ success: true, message: 'API key updated successfully' })
  } catch (error) {
    logger.error('❌ Failed to update API key:', error)
    return res.status(500).json({ error: 'Failed to update API key', message: error.message })
  }
})

// 重新生成 API Key
router.post('/api-keys/:keyId/regenerate', authenticateAdmin, async (req, res) => {
  try {
    const { keyId } = req.params
    const result = await apiKeyService.regenerateApiKey(keyId)
    return res.json({ success: true, data: result })
  } catch (error) {
    logger.error('❌ Failed to regenerate API key:', error)
    return res.status(500).json({ error: 'Failed to regenerate API key', message: error.message })
  }
})

// 获取明文 token
router.get('/api-keys/:keyId/token', authenticateAdmin, async (req, res) => {
  try {
    const { keyId } = req.params
    const exists = await redis.getApiKey(keyId)
    if (!exists || Object.keys(exists).length === 0) {
      return res.status(404).json({ error: 'API key not found' })
    }
    const token = await apiKeyService.getPlaintextToken(keyId)
    if (!token) {
      return res.status(404).json({ error: 'Plaintext token not available for this key' })
    }
    return res.json({ success: true, data: { key: token } })
  } catch (error) {
    logger.error('❌ Failed to get plaintext token:', error)
    return res.status(500).json({ error: 'Failed to get token', message: error.message })
  }
})

// 修改过期时间（包括手动激活）
router.patch('/api-keys/:keyId/expiration', authenticateAdmin, async (req, res) => {
  try {
    const { keyId } = req.params
    const { expiresAt, activateNow } = req.body
    const keyData = await redis.getApiKey(keyId)
    if (!keyData || Object.keys(keyData).length === 0) {
      return res.status(404).json({ error: 'API key not found' })
    }
    const updates = {}
    if (activateNow === true) {
      if (keyData.expirationMode === 'activation' && keyData.isActivated !== 'true') {
        const now = new Date()
        const activationDays = parseInt(keyData.activationDays || 30)
        const newExpiresAt = new Date(now.getTime() + activationDays * 24 * 60 * 60 * 1000)
        updates.isActivated = 'true'
        updates.activatedAt = now.toISOString()
        updates.expiresAt = newExpiresAt.toISOString()
        logger.success(
          `🔓 API key manually activated by admin: ${keyId} (${keyData.name}), expires at ${newExpiresAt.toISOString()}`
        )
      } else {
        return res.status(400).json({
          error: 'Cannot activate',
          message: 'Key is either already activated or not in activation mode'
        })
      }
    }
    if (expiresAt !== undefined && activateNow !== true) {
      if (expiresAt && isNaN(Date.parse(expiresAt))) {
        return res.status(400).json({ error: 'Invalid expiration date format' })
      }
      if (expiresAt) {
        updates.expiresAt = new Date(expiresAt).toISOString()
        if (keyData.isActivated !== 'true') {
          updates.isActivated = 'true'
          updates.activatedAt = new Date().toISOString()
        }
      } else {
        updates.expiresAt = ''
      }
    }
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid updates provided' })
    }
    await apiKeyService.updateApiKey(keyId, updates)
    logger.success(`📝 Updated API key expiration: ${keyId} (${keyData.name})`)
    return res.json({ success: true, message: 'API key expiration updated successfully', updates })
  } catch (error) {
    logger.error('❌ Failed to update API key expiration:', error)
    return res
      .status(500)
      .json({ error: 'Failed to update API key expiration', message: error.message })
  }
})

// 批量删除API Keys（必须在 :keyId 路由之前定义）
router.delete('/api-keys/batch', authenticateAdmin, async (req, res) => {
  try {
    const { keyIds } = req.body
    logger.info(`🐛 Batch delete request body: ${JSON.stringify(req.body)}`)
    logger.info(`🐛 keyIds type: ${typeof keyIds}, value: ${JSON.stringify(keyIds)}`)
    if (!keyIds || !Array.isArray(keyIds) || keyIds.length === 0) {
      logger.warn(
        `🚨 Invalid keyIds: ${JSON.stringify({ keyIds, type: typeof keyIds, isArray: Array.isArray(keyIds) })}`
      )
      return res
        .status(400)
        .json({ error: 'Invalid request', message: 'keyIds 必须是一个非空数组' })
    }
    if (keyIds.length > 100) {
      return res
        .status(400)
        .json({ error: 'Too many keys', message: '每次最多只能删除100个API Keys' })
    }
    const invalidKeys = keyIds.filter((id) => !id || typeof id !== 'string')
    if (invalidKeys.length > 0) {
      return res.status(400).json({ error: 'Invalid key IDs', message: '包含无效的API Key ID' })
    }
    logger.info(
      `🗑️ Admin attempting batch delete of ${keyIds.length} API keys: ${JSON.stringify(keyIds)}`
    )
    const results = { successCount: 0, failedCount: 0, errors: [] }
    for (const keyId of keyIds) {
      try {
        const apiKey = await redis.getApiKey(keyId)
        if (!apiKey || Object.keys(apiKey).length === 0) {
          results.failedCount++
          results.errors.push({ keyId, error: 'API Key 不存在' })
          continue
        }
        await apiKeyService.deleteApiKey(keyId)
        results.successCount++
        logger.success(`✅ Batch delete: API key ${keyId} deleted successfully`)
      } catch (error) {
        results.failedCount++
        results.errors.push({ keyId, error: error.message || '删除失败' })
        logger.error(`❌ Batch delete failed for key ${keyId}:`, error)
      }
    }
    if (results.successCount > 0) {
      logger.success(
        `🎉 Batch delete completed: ${results.successCount} successful, ${results.failedCount} failed`
      )
    } else {
      logger.warn(
        `⚠️ Batch delete completed with no successful deletions: ${results.failedCount} failed`
      )
    }
    return res.json({ success: true, message: '批量删除完成', data: results })
  } catch (error) {
    logger.error('❌ Failed to batch delete API keys:', error)
    return res.status(500).json({ error: 'Batch delete failed', message: error.message })
  }
})

// 删除单个API Key
router.delete('/api-keys/:keyId', authenticateAdmin, async (req, res) => {
  try {
    const { keyId } = req.params
    await apiKeyService.deleteApiKey(keyId, req.admin?.username, 'admin')
    logger.success(`🗑️ Admin deleted API key: ${keyId}`)
    return res.json({ success: true, message: 'API key deleted successfully' })
  } catch (error) {
    logger.error('❌ Failed to delete API key:', error)
    return res.status(500).json({ error: 'Failed to delete API key', message: error.message })
  }
})

// 📋 获取已删除的API Keys
router.get('/api-keys/deleted', authenticateAdmin, async (req, res) => {
  try {
    const client = redis.getClientSafe()
    const toInt = (v, d) => {
      const n = parseInt(String(v ?? '').trim() || String(d), 10)
      return Number.isFinite(n) && n > 0 ? n : d
    }
    const pageNum = toInt(req.query.pageNum || req.query.page, 0)
    const pageSize = Math.max(1, Math.min(500, toInt(req.query.pageSize || req.query.limit, 50)))

    let cursor = '0'
    const deleted = []
    const SCAN_BATCH = 500
    do {
      const [next, keys] = await client.scan(
        cursor,
        'MATCH',
        'apikey:*',
        'COUNT',
        String(SCAN_BATCH)
      )
      cursor = next
      const filtered = keys.filter((k) => k !== 'apikey:hash_map')
      if (filtered.length > 0) {
        const pipeline = client.pipeline()
        filtered.forEach((k) => pipeline.hgetall(k))
        const rows = await pipeline.exec()
        for (let i = 0; i < filtered.length; i++) {
          const [err, data] = rows[i]
          if (err || !data || Object.keys(data).length === 0) {
            continue
          }
          if (data.isDeleted === 'true') {
            const id = filtered[i].replace('apikey:', '')
            deleted.push({
              id,
              name: data.name,
              deletedAt: data.deletedAt,
              deletedBy: data.deletedBy,
              deletedByType: data.deletedByType,
              canRestore: true
            })
          }
        }
      }
    } while (cursor !== '0')

    deleted.sort((a, b) => {
      const ta = a.deletedAt ? Date.parse(a.deletedAt) : 0
      const tb = b.deletedAt ? Date.parse(b.deletedAt) : 0
      return tb - ta
    })
    const total = deleted.length
    if (pageNum > 0) {
      const start = (pageNum - 1) * pageSize
      const end = start + pageSize
      const pageItems = start < total ? deleted.slice(start, end) : []
      logger.success(
        `📋 Admin retrieved deleted API keys page ${pageNum} (size=${pageSize}) total=${total}`
      )
      return res.json({ success: true, apiKeys: pageItems, page: pageNum, pageSize, total })
    }
    logger.success(`📋 Admin retrieved ${total} deleted API keys (lightweight)`)
    return res.json({ success: true, apiKeys: deleted, total })
  } catch (error) {
    logger.error('❌ Failed to get deleted API keys (lightweight):', error)
    return res
      .status(500)
      .json({ error: 'Failed to retrieve deleted API keys', message: error.message })
  }
})

// 🔄 恢复已删除的API Key
router.post('/api-keys/:keyId/restore', authenticateAdmin, async (req, res) => {
  try {
    const { keyId } = req.params
    const adminUsername = req.session?.admin?.username || 'unknown'
    const result = await apiKeyService.restoreApiKey(keyId, adminUsername, 'admin')
    if (result.success) {
      logger.success(`✅ Admin ${adminUsername} restored API key: ${keyId}`)
      return res.json({ success: true, message: 'API Key 已成功恢复', apiKey: result.apiKey })
    } else {
      return res.status(400).json({ success: false, error: 'Failed to restore API key' })
    }
  } catch (error) {
    logger.error('❌ Failed to restore API key:', error)
    if (error.message === 'API key not found') {
      return res.status(404).json({ success: false, error: 'API Key 不存在' })
    } else if (error.message === 'API key is not deleted') {
      return res.status(400).json({ success: false, error: '该 API Key 未被删除，无需恢复' })
    }
    return res
      .status(500)
      .json({ success: false, error: '恢复 API Key 失败', message: error.message })
  }
})

// 🗑️ 彻底删除API Key（物理删除）
router.delete('/api-keys/:keyId/permanent', authenticateAdmin, async (req, res) => {
  try {
    const { keyId } = req.params
    const adminUsername = req.session?.admin?.username || 'unknown'
    const result = await apiKeyService.permanentDeleteApiKey(keyId)
    if (result.success) {
      logger.success(`🗑️ Admin ${adminUsername} permanently deleted API key: ${keyId}`)
      return res.json({ success: true, message: 'API Key 已彻底删除' })
    }
  } catch (error) {
    logger.error('❌ Failed to permanently delete API key:', error)
    if (error.message === 'API key not found') {
      return res.status(404).json({ success: false, error: 'API Key 不存在' })
    } else if (error.message === '只能彻底删除已经删除的API Key') {
      return res.status(400).json({ success: false, error: '只能彻底删除已经删除的API Key' })
    }
    return res
      .status(500)
      .json({ success: false, error: '彻底删除 API Key 失败', message: error.message })
  }
})

// Alias: purge
router.delete('/api-keys/:keyId/purge', authenticateAdmin, async (req, res) => {
  try {
    const { keyId } = req.params
    const adminUsername = req.session?.admin?.username || 'unknown'
    const result = await apiKeyService.permanentDeleteApiKey(keyId)
    if (result.success) {
      logger.success(`🗑️ (alias) Admin ${adminUsername} permanently deleted API key: ${keyId}`)
      return res.json({ success: true, message: 'API Key 已彻底删除' })
    }
  } catch (error) {
    logger.error('❌ (alias) Failed to permanently delete API key:', error)
    if (error.message === 'API key not found') {
      return res.status(404).json({ success: false, error: 'API Key 不存在' })
    } else if (error.message === '只能彻底删除已经删除的API Key') {
      return res.status(400).json({ success: false, error: '只能彻底删除已经删除的API Key' })
    }
    return res
      .status(500)
      .json({ success: false, error: '彻底删除 API Key 失败', message: error.message })
  }
})

// 🧹 清空所有已删除的API Keys
router.delete('/api-keys/deleted/clear-all', authenticateAdmin, async (req, res) => {
  try {
    const adminUsername = req.session?.admin?.username || 'unknown'
    const result = await apiKeyService.clearAllDeletedApiKeys()
    logger.success(
      `🧹 Admin ${adminUsername} cleared deleted API keys: ${result.successCount}/${result.total}`
    )
    return res.json({
      success: true,
      message: `成功清空 ${result.successCount} 个已删除的 API Keys`,
      details: {
        total: result.total,
        successCount: result.successCount,
        failedCount: result.failedCount,
        errors: result.errors
      }
    })
  } catch (error) {
    logger.error('❌ Failed to clear all deleted API keys:', error)
    return res
      .status(500)
      .json({ success: false, error: '清空已删除的 API Keys 失败', message: error.message })
  }
})

// 获取单个API Key的模型统计（附费用）
router.get('/api-keys/:keyId/model-stats', authenticateAdmin, async (req, res) => {
  try {
    const { keyId } = req.params
    const { period = 'monthly', startDate, endDate } = req.query
    const client = redis.getClientSafe()
    const today = redis.getDateStringInTimezone()
    const tzDate = redis.getDateInTimezone()
    const currentMonth = `${tzDate.getUTCFullYear()}-${String(tzDate.getUTCMonth() + 1).padStart(2, '0')}`
    let searchPatterns = []
    if (period === 'custom' && startDate && endDate) {
      const start = new Date(startDate)
      const end = new Date(endDate)
      if (start > end) {
        return res.status(400).json({ error: 'Start date must be before or equal to end date' })
      }
      const daysDiff = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1
      if (daysDiff > 365) {
        return res.status(400).json({ error: 'Date range cannot exceed 365 days' })
      }
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dateStr = redis.getDateStringInTimezone(d)
        searchPatterns.push(`usage:${keyId}:model:daily:*:${dateStr}`)
      }
    } else {
      const pattern =
        period === 'daily'
          ? `usage:${keyId}:model:daily:*:${today}`
          : `usage:${keyId}:model:monthly:*:${currentMonth}`
      searchPatterns = [pattern]
    }
    const modelStatsMap = new Map()
    const modelStats = []
    for (const pattern of searchPatterns) {
      const keys = await client.keys(pattern)
      for (const key of keys) {
        const match =
          key.match(/usage:.+:model:daily:(.+):\d{4}-\d{2}-\d{2}$/) ||
          key.match(/usage:.+:model:monthly:(.+):\d{4}-\d{2}$/)
        if (!match) {
          continue
        }
        const model = match[1]
        const data = await client.hgetall(key)
        if (data && Object.keys(data).length > 0) {
          if (!modelStatsMap.has(model)) {
            modelStatsMap.set(model, {
              requests: 0,
              inputTokens: 0,
              outputTokens: 0,
              cacheCreateTokens: 0,
              cacheReadTokens: 0,
              allTokens: 0
            })
          }
          const stats = modelStatsMap.get(model)
          stats.requests += parseInt(data.requests) || 0
          stats.inputTokens += parseInt(data.inputTokens) || 0
          stats.outputTokens += parseInt(data.outputTokens) || 0
          stats.cacheCreateTokens += parseInt(data.cacheCreateTokens) || 0
          stats.cacheReadTokens += parseInt(data.cacheReadTokens) || 0
          stats.allTokens += parseInt(data.allTokens) || 0
        }
      }
    }
    for (const [model, stats] of modelStatsMap) {
      const usage = {
        input_tokens: stats.inputTokens,
        output_tokens: stats.outputTokens,
        cache_creation_input_tokens: stats.cacheCreateTokens,
        cache_read_input_tokens: stats.cacheReadTokens
      }
      const costData = CostCalculator.calculateCost(usage, model)
      modelStats.push({
        model,
        requests: stats.requests,
        inputTokens: stats.inputTokens,
        outputTokens: stats.outputTokens,
        cacheCreateTokens: stats.cacheCreateTokens,
        cacheReadTokens: stats.cacheReadTokens,
        allTokens: stats.allTokens,
        costs: costData.costs,
        formatted: costData.formatted,
        pricing: costData.pricing,
        usingDynamicPricing: costData.usingDynamicPricing
      })
    }
    if (modelStats.length === 0) {
      try {
        const apiKeys = await apiKeyService.getAllApiKeys()
        const targetApiKey = apiKeys.find((key) => key.id === keyId)
        if (targetApiKey && targetApiKey.usage) {
          const usageData =
            period === 'custom' || period === 'daily'
              ? targetApiKey.usage.daily || targetApiKey.usage.total
              : targetApiKey.usage.monthly || targetApiKey.usage.total
          if (usageData && usageData.allTokens > 0) {
            const usage = {
              input_tokens: usageData.inputTokens || 0,
              output_tokens: usageData.outputTokens || 0,
              cache_creation_input_tokens: usageData.cacheCreateTokens || 0,
              cache_read_input_tokens: usageData.cacheReadTokens || 0
            }
            const costData = CostCalculator.calculateCost(usage, 'claude-3-5-sonnet-20241022')
            modelStats.push({
              model: '总体使用 (历史数据)',
              requests: usageData.requests || 0,
              inputTokens: usageData.inputTokens || 0,
              outputTokens: usageData.outputTokens || 0,
              cacheCreateTokens: usageData.cacheCreateTokens || 0,
              cacheReadTokens: usageData.cacheReadTokens || 0,
              allTokens: usageData.allTokens || 0,
              costs: costData.costs,
              formatted: costData.formatted,
              pricing: costData.pricing,
              usingDynamicPricing: costData.usingDynamicPricing
            })
          }
        }
      } catch (error) {
        logger.error('❌ Error fetching API key usage data:', error)
      }
    }
    modelStats.sort((a, b) => b.allTokens - a.allTokens)
    return res.json({ success: true, data: modelStats })
  } catch (error) {
    logger.error('❌ Failed to get API key model stats:', error)
    return res
      .status(500)
      .json({ error: 'Failed to get API key model stats', message: error.message })
  }
})

module.exports = router
