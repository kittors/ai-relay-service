const express = require('express')
const router = express.Router()

const { authenticateAdmin } = require('../../middleware/auth')
const logger = require('../../utils/logger')
const redis = require('../../models/redis')
const CostCalculator = require('../../utils/costCalculator')
const pricingService = require('../../services/pricingService')

// 获取所有账户的使用统计（摘要）
router.get('/accounts/usage-stats', authenticateAdmin, async (req, res) => {
  try {
    const accountsStats = await redis.getAllAccountsUsageStats()
    return res.json({
      success: true,
      data: accountsStats,
      summary: {
        totalAccounts: accountsStats.length,
        activeToday: accountsStats.filter((account) => account.daily.requests > 0).length,
        totalDailyTokens: accountsStats.reduce(
          (sum, account) => sum + (account.daily.allTokens || 0),
          0
        ),
        totalDailyRequests: accountsStats.reduce(
          (sum, account) => sum + (account.daily.requests || 0),
          0
        )
      },
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    logger.error('❌ Failed to get accounts usage stats:', error)
    return res
      .status(500)
      .json({ success: false, error: 'Failed to get accounts usage stats', message: error.message })
  }
})

// 获取单个账户的使用统计
router.get('/accounts/:accountId/usage-stats', authenticateAdmin, async (req, res) => {
  try {
    const { accountId } = req.params
    const accountStats = await redis.getAccountUsageStats(accountId)
    const claudeAccountService = require('../../services/claudeAccountService')
    const accountData = await claudeAccountService.getAccount(accountId)
    if (!accountData) {
      return res.status(404).json({ success: false, error: 'Account not found' })
    }
    return res.json({
      success: true,
      data: {
        ...accountStats,
        accountInfo: {
          name: accountData.name,
          email: accountData.email,
          status: accountData.status,
          isActive: accountData.isActive,
          createdAt: accountData.createdAt
        }
      },
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    logger.error('❌ Failed to get account usage stats:', error)
    return res
      .status(500)
      .json({ success: false, error: 'Failed to get account usage stats', message: error.message })
  }
})

// 获取账号近30天使用历史
router.get('/accounts/:accountId/usage-history', authenticateAdmin, async (req, res) => {
  try {
    const { accountId } = req.params
    const { platform = 'claude', days = 30 } = req.query
    const allowedPlatforms = [
      'claude',
      'claude-console',
      'openai',
      'openai-responses',
      'gemini',
      'droid'
    ]
    if (!allowedPlatforms.includes(platform)) {
      return res.status(400).json({ success: false, error: 'Unsupported account platform' })
    }
    const claudeAccountService = require('../../services/claudeAccountService')
    const claudeConsoleAccountService = require('../../services/claudeConsoleAccountService')
    const geminiAccountService = require('../../services/geminiAccountService')
    const openaiAccountService = require('../../services/openaiAccountService')
    const openaiResponsesAccountService = require('../../services/openaiResponsesAccountService')
    const droidAccountService = require('../../services/droidAccountService')

    const accountTypeMap = {
      openai: 'openai',
      'openai-responses': 'openai-responses',
      droid: 'droid'
    }
    const fallbackModelMap = {
      claude: 'claude-3-5-sonnet-20241022',
      'claude-console': 'claude-3-5-sonnet-20241022',
      openai: 'gpt-4o-mini-2024-07-18',
      'openai-responses': 'gpt-4o-mini-2024-07-18',
      gemini: 'gemini-1.5-flash',
      droid: 'unknown'
    }

    let accountData = null
    let accountCreatedAt = null
    try {
      switch (platform) {
        case 'claude':
          accountData = await claudeAccountService.getAccount(accountId)
          break
        case 'claude-console':
          accountData = await claudeConsoleAccountService.getAccount(accountId)
          break
        case 'openai':
          accountData = await openaiAccountService.getAccount(accountId)
          break
        case 'openai-responses':
          accountData = await openaiResponsesAccountService.getAccount(accountId)
          break
        case 'gemini':
          accountData = await geminiAccountService.getAccount(accountId)
          break
        case 'droid':
          accountData = await droidAccountService.getAccount(accountId)
          break
      }
      if (accountData && accountData.createdAt) {
        accountCreatedAt = new Date(accountData.createdAt)
      }
    } catch (error) {
      logger.warn(`Failed to get account data for avgDailyCost calculation: ${error.message}`)
    }

    const client = redis.getClientSafe()
    const fallbackModel = fallbackModelMap[platform] || 'unknown'
    const daysCount = Math.min(Math.max(parseInt(days, 10) || 30, 1), 60)
    const accountUsageStats = await redis.getAccountUsageStats(
      accountId,
      accountTypeMap[platform] || null
    )

    const history = []
    let totalCost = 0
    let totalRequests = 0
    let totalTokens = 0
    let highestCostDay = null
    let highestRequestDay = null

    const scanKeys = async (pattern, count = 1000) => {
      let cursor = '0'
      const keys = []
      do {
        const scanRes = await client.scan(cursor, 'MATCH', pattern, 'COUNT', String(count))
        cursor = scanRes[0]
        keys.push(...scanRes[1])
      } while (cursor !== '0')
      return keys
    }

    const dateKeysNeeded = []
    {
      const today = new Date()
      for (let offset = daysCount - 1; offset >= 0; offset--) {
        const d = new Date(today)
        d.setDate(d.getDate() - offset)
        const dk = redis.getDateStringInTimezone(d)
        dateKeysNeeded.push(dk)
      }
    }
    const dateKeySet = new Set(dateKeysNeeded)
    const allModelKeys = await scanKeys(`account_usage:model:daily:${accountId}:*:*`)
    const modelKeysByDate = new Map()
    for (const k of allModelKeys) {
      const parts = k.split(':')
      const dk = parts[5]
      if (!dateKeySet.has(dk)) {
        continue
      }
      if (!modelKeysByDate.has(dk)) {
        modelKeysByDate.set(dk, [])
      }
      modelKeysByDate.get(dk).push(k)
    }

    const sumModelCostsForDay = async (dateKey) => {
      const modelKeys = modelKeysByDate.get(dateKey) || []
      if (modelKeys.length === 0) {
        return 0
      }
      const pipeline = client.pipeline()
      modelKeys.forEach((key) => pipeline.hgetall(key))
      const results = await pipeline.exec()
      let summedCost = 0
      for (let i = 0; i < results.length; i++) {
        const [, modelData] = results[i]
        if (!modelData || Object.keys(modelData).length === 0) {
          continue
        }
        const key = modelKeys[i]
        const parts = key.split(':')
        const modelName = parts[4] || 'unknown'
        const usage = {
          input_tokens: parseInt(modelData.inputTokens) || 0,
          output_tokens: parseInt(modelData.outputTokens) || 0,
          cache_creation_input_tokens: parseInt(modelData.cacheCreateTokens) || 0,
          cache_read_input_tokens: parseInt(modelData.cacheReadTokens) || 0
        }
        const costResult = CostCalculator.calculateCost(usage, modelName)
        summedCost += costResult.costs.total
      }
      return summedCost
    }

    for (let offset = daysCount - 1; offset >= 0; offset--) {
      const date = new Date()
      date.setDate(date.getDate() - offset)
      const tzDate = redis.getDateInTimezone(date)
      const dateKey = redis.getDateStringInTimezone(date)
      const monthLabel = String(tzDate.getUTCMonth() + 1).padStart(2, '0')
      const dayLabel = String(tzDate.getUTCDate()).padStart(2, '0')
      const label = `${monthLabel}/${dayLabel}`
      const dailyKey = `account_usage:daily:${accountId}:${dateKey}`
      const dailyData = await client.hgetall(dailyKey)
      const inputTokens = parseInt(dailyData?.inputTokens) || 0
      const outputTokens = parseInt(dailyData?.outputTokens) || 0
      const cacheCreateTokens = parseInt(dailyData?.cacheCreateTokens) || 0
      const cacheReadTokens = parseInt(dailyData?.cacheReadTokens) || 0
      const allTokens =
        parseInt(dailyData?.allTokens) ||
        inputTokens + outputTokens + cacheCreateTokens + cacheReadTokens
      const requests = parseInt(dailyData?.requests) || 0
      let cost = await sumModelCostsForDay(dateKey)
      if (cost === 0 && allTokens > 0) {
        const fallbackUsage = {
          input_tokens: inputTokens,
          output_tokens: outputTokens,
          cache_creation_input_tokens: cacheCreateTokens,
          cache_read_input_tokens: cacheReadTokens
        }
        const fallbackResult = CostCalculator.calculateCost(fallbackUsage, fallbackModel)
        cost = fallbackResult.costs.total
      }
      const normalizedCost = Math.round(cost * 1_000_000) / 1_000_000
      totalCost += normalizedCost
      totalRequests += requests
      totalTokens += allTokens
      if (!highestCostDay || normalizedCost > highestCostDay.cost) {
        highestCostDay = {
          date: dateKey,
          label,
          cost: normalizedCost,
          formattedCost: CostCalculator.formatCost(normalizedCost)
        }
      }
      if (!highestRequestDay || requests > highestRequestDay.requests) {
        highestRequestDay = { date: dateKey, label, requests }
      }
      history.push({
        date: dateKey,
        label,
        cost: normalizedCost,
        formattedCost: CostCalculator.formatCost(normalizedCost),
        requests,
        tokens: allTokens
      })
    }

    let actualDaysForAvg = daysCount
    if (accountCreatedAt) {
      const now = new Date()
      const diffTime = Math.abs(now - accountCreatedAt)
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
      actualDaysForAvg = Math.min(diffDays, daysCount)
      actualDaysForAvg = Math.max(actualDaysForAvg, 1)
    }

    const avgDailyCost = actualDaysForAvg > 0 ? totalCost / actualDaysForAvg : 0
    const avgDailyRequests = actualDaysForAvg > 0 ? totalRequests / actualDaysForAvg : 0
    const avgDailyTokens = actualDaysForAvg > 0 ? totalTokens / actualDaysForAvg : 0
    const todayData = history.length > 0 ? history[history.length - 1] : null

    return res.json({
      success: true,
      data: {
        history,
        summary: {
          days: daysCount,
          actualDaysUsed: actualDaysForAvg,
          accountCreatedAt: accountCreatedAt ? accountCreatedAt.toISOString() : null,
          totalCost,
          totalCostFormatted: CostCalculator.formatCost(totalCost),
          totalRequests,
          totalTokens,
          avgDailyCost,
          avgDailyCostFormatted: CostCalculator.formatCost(avgDailyCost),
          avgDailyRequests,
          avgDailyTokens,
          today: todayData
            ? {
                date: todayData.date,
                cost: todayData.cost,
                costFormatted: todayData.formattedCost,
                requests: todayData.requests,
                tokens: todayData.tokens
              }
            : null,
          highestCostDay,
          highestRequestDay
        },
        overview: accountUsageStats,
        generatedAt: new Date().toISOString()
      }
    })
  } catch (error) {
    logger.error('❌ Failed to get account usage history:', error)
    return res.status(500).json({
      success: false,
      error: 'Failed to get account usage history',
      message: error.message
    })
  }
})

// 获取使用统计（按API Key汇总）
router.get('/usage-stats', authenticateAdmin, async (req, res) => {
  try {
    const { period = 'daily' } = req.query
    const apiKeyService = require('../../services/apiKeyService')
    const apiKeys = await apiKeyService.getAllApiKeys()
    const stats = apiKeys.map((key) => ({ keyId: key.id, keyName: key.name, usage: key.usage }))
    return res.json({ success: true, data: { period, stats } })
  } catch (error) {
    logger.error('❌ Failed to get usage stats:', error)
    return res.status(500).json({ error: 'Failed to get usage stats', message: error.message })
  }
})

// 获取按模型的使用统计和费用（全局）
router.get('/model-stats', authenticateAdmin, async (req, res) => {
  try {
    const { period = 'daily', startDate, endDate } = req.query
    const today = redis.getDateStringInTimezone()
    const tzDate = redis.getDateInTimezone()
    const currentMonth = `${tzDate.getUTCFullYear()}-${String(tzDate.getUTCMonth() + 1).padStart(2, '0')}`
    const client = redis.getClientSafe()
    let searchPatterns = []
    if (startDate && endDate) {
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
        const dateStr = redis.getDateStringInTimezone(currentDate)
        searchPatterns.push(`usage:model:daily:*:${dateStr}`)
        currentDate.setDate(currentDate.getDate() + 1)
      }
    } else {
      const pattern =
        period === 'daily'
          ? `usage:model:daily:*:${today}`
          : `usage:model:monthly:*:${currentMonth}`
      searchPatterns = [pattern]
    }
    const allKeys = []
    for (const pattern of searchPatterns) {
      const keys = await client.keys(pattern)
      allKeys.push(...keys)
    }
    const normalizeModelName = (model) => {
      if (!model || model === 'unknown') {
        return model
      }
      if (model.includes('.anthropic.') || model.includes('.claude')) {
        let normalized = model.replace(/^[a-z0-9-]+\./, '')
        normalized = normalized.replace('anthropic.', '')
        normalized = normalized.replace(/-v\d+:\d+$/, '')
        return normalized
      }
      return model.replace(/-v\d+:\d+$|:latest$/, '')
    }
    const modelStatsMap = new Map()
    for (const key of allKeys) {
      const match = key.match(/usage:model:daily:(.+):\d{4}-\d{2}-\d{2}$/)
      if (!match) {
        continue
      }
      const rawModel = match[1]
      const normalizedModel = normalizeModelName(rawModel)
      const data = await client.hgetall(key)
      if (data && Object.keys(data).length > 0) {
        const stats = modelStatsMap.get(normalizedModel) || {
          requests: 0,
          inputTokens: 0,
          outputTokens: 0,
          cacheCreateTokens: 0,
          cacheReadTokens: 0,
          allTokens: 0
        }
        stats.requests += parseInt(data.requests) || 0
        stats.inputTokens += parseInt(data.inputTokens) || 0
        stats.outputTokens += parseInt(data.outputTokens) || 0
        stats.cacheCreateTokens += parseInt(data.cacheCreateTokens) || 0
        stats.cacheReadTokens += parseInt(data.cacheReadTokens) || 0
        stats.allTokens += parseInt(data.allTokens) || 0
        modelStatsMap.set(normalizedModel, stats)
      }
    }
    const modelStats = []
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
        period: startDate && endDate ? 'custom' : period,
        requests: stats.requests,
        inputTokens: usage.input_tokens,
        outputTokens: usage.output_tokens,
        cacheCreateTokens: usage.cache_creation_input_tokens,
        cacheReadTokens: usage.cache_read_input_tokens,
        allTokens: stats.allTokens,
        usage: {
          requests: stats.requests,
          inputTokens: usage.input_tokens,
          outputTokens: usage.output_tokens,
          cacheCreateTokens: usage.cache_creation_input_tokens,
          cacheReadTokens: usage.cache_read_input_tokens,
          totalTokens:
            usage.input_tokens +
            usage.output_tokens +
            usage.cache_creation_input_tokens +
            usage.cache_read_input_tokens
        },
        costs: costData.costs,
        formatted: costData.formatted,
        pricing: costData.pricing
      })
    }
    modelStats.sort((a, b) => b.costs.total - a.costs.total)
    return res.json({ success: true, data: modelStats })
  } catch (error) {
    logger.error('❌ Failed to get model stats:', error)
    return res.status(500).json({ error: 'Failed to get model stats', message: error.message })
  }
})

// 获取使用趋势数据（系统级）
router.get('/usage-trend', authenticateAdmin, async (req, res) => {
  try {
    const { days = 7, granularity = 'day', startDate, endDate } = req.query
    const client = redis.getClientSafe()
    const trendData = []
    const config = require('../../../config/config')
    if (granularity === 'hour') {
      let startTime, endTime
      if (startDate && endDate) {
        startTime = new Date(startDate)
        endTime = new Date(endDate)
        logger.info('📊 Usage trend hour granularity - received times:')
        logger.info(`  startDate (raw): ${startDate}`)
        logger.info(`  endDate (raw): ${endDate}`)
        logger.info(`  startTime (parsed): ${startTime.toISOString()}`)
        logger.info(`  endTime (parsed): ${endTime.toISOString()}`)
        logger.info(`  System timezone offset: ${config.system.timezoneOffset || 8}`)
      } else {
        endTime = new Date()
        startTime = new Date(endTime.getTime() - 24 * 60 * 60 * 1000)
      }
      const timeDiff = endTime - startTime
      if (timeDiff > 24 * 60 * 60 * 1000) {
        return res.status(400).json({ error: '小时粒度查询时间范围不能超过24小时' })
      }
      const currentHour = new Date(startTime)
      currentHour.setMinutes(0, 0, 0)
      while (currentHour <= endTime) {
        const tzCurrentHour = redis.getDateInTimezone(currentHour)
        const dateStr = redis.getDateStringInTimezone(currentHour)
        const hour = String(tzCurrentHour.getUTCHours()).padStart(2, '0')
        const hourKey = `${dateStr}:${hour}`
        const modelPattern = `usage:model:hourly:*:${hourKey}`
        const modelKeys = await client.keys(modelPattern)
        let hourInputTokens = 0,
          hourOutputTokens = 0,
          hourRequests = 0,
          hourCacheCreateTokens = 0,
          hourCacheReadTokens = 0,
          hourCost = 0
        for (const modelKey of modelKeys) {
          const modelMatch = modelKey.match(/usage:model:hourly:(.+):\d{4}-\d{2}-\d{2}:\d{2}$/)
          if (!modelMatch) {
            continue
          }
          const model = modelMatch[1]
          const data = await client.hgetall(modelKey)
          if (data && Object.keys(data).length > 0) {
            const modelInputTokens = parseInt(data.inputTokens) || 0
            const modelOutputTokens = parseInt(data.outputTokens) || 0
            const modelCacheCreateTokens = parseInt(data.cacheCreateTokens) || 0
            const modelCacheReadTokens = parseInt(data.cacheReadTokens) || 0
            const modelRequests = parseInt(data.requests) || 0
            hourInputTokens += modelInputTokens
            hourOutputTokens += modelOutputTokens
            hourCacheCreateTokens += modelCacheCreateTokens
            hourCacheReadTokens += modelCacheReadTokens
            hourRequests += modelRequests
            const modelUsage = {
              input_tokens: modelInputTokens,
              output_tokens: modelOutputTokens,
              cache_creation_input_tokens: modelCacheCreateTokens,
              cache_read_input_tokens: modelCacheReadTokens
            }
            const modelCostResult = CostCalculator.calculateCost(modelUsage, model)
            hourCost += modelCostResult.costs.total
          }
        }
        if (modelKeys.length === 0) {
          const pattern = `usage:hourly:*:${hourKey}`
          const keys = await client.keys(pattern)
          for (const key of keys) {
            const data = await client.hgetall(key)
            if (data) {
              hourInputTokens += parseInt(data.inputTokens) || 0
              hourOutputTokens += parseInt(data.outputTokens) || 0
              hourRequests += parseInt(data.requests) || 0
              hourCacheCreateTokens += parseInt(data.cacheCreateTokens) || 0
              hourCacheReadTokens += parseInt(data.cacheReadTokens) || 0
            }
          }
          const usage = {
            input_tokens: hourInputTokens,
            output_tokens: hourOutputTokens,
            cache_creation_input_tokens: hourCacheCreateTokens,
            cache_read_input_tokens: hourCacheReadTokens
          }
          const costResult = CostCalculator.calculateCost(usage, 'unknown')
          hourCost = costResult.costs.total
        }
        const tzDateForLabel = redis.getDateInTimezone(currentHour)
        const month = String(tzDateForLabel.getUTCMonth() + 1).padStart(2, '0')
        const day = String(tzDateForLabel.getUTCDate()).padStart(2, '0')
        const hourStr = String(tzDateForLabel.getUTCHours()).padStart(2, '0')
        trendData.push({
          hour: currentHour.toISOString(),
          label: `${month}/${day} ${hourStr}:00`,
          inputTokens: hourInputTokens,
          outputTokens: hourOutputTokens,
          requests: hourRequests,
          cacheCreateTokens: hourCacheCreateTokens,
          cacheReadTokens: hourCacheReadTokens,
          totalTokens:
            hourInputTokens + hourOutputTokens + hourCacheCreateTokens + hourCacheReadTokens,
          cost: hourCost
        })
        currentHour.setHours(currentHour.getHours() + 1)
      }
    } else {
      const daysCount = parseInt(days) || 7
      const today = new Date()
      for (let i = 0; i < daysCount; i++) {
        const date = new Date(today)
        date.setDate(date.getDate() - i)
        const dateStr = redis.getDateStringInTimezone(date)
        const pattern = `usage:daily:*:${dateStr}`
        const keys = await client.keys(pattern)
        let dayInputTokens = 0,
          dayOutputTokens = 0,
          dayRequests = 0,
          dayCacheCreateTokens = 0,
          dayCacheReadTokens = 0,
          dayCost = 0
        const modelPattern = `usage:model:daily:*:${dateStr}`
        const modelKeys = await client.keys(modelPattern)
        for (const modelKey of modelKeys) {
          const modelMatch = modelKey.match(/usage:model:daily:(.+):\d{4}-\d{2}-\d{2}$/)
          if (!modelMatch) {
            continue
          }
          const model = modelMatch[1]
          const data = await client.hgetall(modelKey)
          if (data && Object.keys(data).length > 0) {
            const modelInputTokens = parseInt(data.inputTokens) || 0
            const modelOutputTokens = parseInt(data.outputTokens) || 0
            const modelCacheCreateTokens = parseInt(data.cacheCreateTokens) || 0
            const modelCacheReadTokens = parseInt(data.cacheReadTokens) || 0
            const modelRequests = parseInt(data.requests) || 0
            dayInputTokens += modelInputTokens
            dayOutputTokens += modelOutputTokens
            dayCacheCreateTokens += modelCacheCreateTokens
            dayCacheReadTokens += modelCacheReadTokens
            dayRequests += modelRequests
            const modelUsage = {
              input_tokens: modelInputTokens,
              output_tokens: modelOutputTokens,
              cache_creation_input_tokens: modelCacheCreateTokens,
              cache_read_input_tokens: modelCacheReadTokens
            }
            const modelCostResult = CostCalculator.calculateCost(modelUsage, model)
            dayCost += modelCostResult.costs.total
          }
        }
        if (modelKeys.length === 0 && keys.length > 0) {
          for (const key of keys) {
            const data = await client.hgetall(key)
            if (data) {
              dayInputTokens += parseInt(data.inputTokens) || 0
              dayOutputTokens += parseInt(data.outputTokens) || 0
              dayRequests += parseInt(data.requests) || 0
              dayCacheCreateTokens += parseInt(data.cacheCreateTokens) || 0
              dayCacheReadTokens += parseInt(data.cacheReadTokens) || 0
            }
          }
          const usage = {
            input_tokens: dayInputTokens,
            output_tokens: dayOutputTokens,
            cache_creation_input_tokens: dayCacheCreateTokens,
            cache_read_input_tokens: dayCacheReadTokens
          }
          const costResult = CostCalculator.calculateCost(usage, 'unknown')
          dayCost = costResult.costs.total
        }
        trendData.push({
          date: dateStr,
          inputTokens: dayInputTokens,
          outputTokens: dayOutputTokens,
          requests: dayRequests,
          cacheCreateTokens: dayCacheCreateTokens,
          cacheReadTokens: dayCacheReadTokens,
          totalTokens: dayInputTokens + dayOutputTokens + dayCacheCreateTokens + dayCacheReadTokens,
          cost: dayCost,
          formattedCost: CostCalculator.formatCost(dayCost)
        })
      }
    }
    if (granularity === 'hour') {
      trendData.sort((a, b) => new Date(a.hour) - new Date(b.hour))
    } else {
      trendData.sort((a, b) => new Date(a.date) - new Date(b.date))
    }
    return res.json({ success: true, data: trendData, granularity })
  } catch (error) {
    logger.error('❌ Failed to get usage trend:', error)
    return res.status(500).json({ error: 'Failed to get usage trend', message: error.message })
  }
})

// 获取按账号分组的使用趋势
router.get('/account-usage-trend', authenticateAdmin, async (req, res) => {
  try {
    const { granularity = 'day', group = 'claude', days = 7, startDate, endDate } = req.query
    const allowedGroups = ['claude', 'openai', 'gemini']
    if (!allowedGroups.includes(group)) {
      return res.status(400).json({ success: false, error: 'Invalid account group' })
    }
    const groupLabels = { claude: 'Claude账户', openai: 'OpenAI账户', gemini: 'Gemini账户' }
    const claudeAccountService = require('../../services/claudeAccountService')
    const claudeConsoleAccountService = require('../../services/claudeConsoleAccountService')
    const geminiAccountService = require('../../services/geminiAccountService')
    const openaiAccountService = require('../../services/openaiAccountService')
    const openaiResponsesAccountService = require('../../services/openaiResponsesAccountService')
    let accounts = []
    if (group === 'claude') {
      const [claudeAccounts, claudeConsoleAccounts] = await Promise.all([
        claudeAccountService.getAllAccounts(),
        claudeConsoleAccountService.getAllAccounts()
      ])
      accounts = [
        ...claudeAccounts.map((a) => ({
          id: String(a.id || ''),
          name: a.name || a.email || `Claude账号 ${String(a.id || '').slice(0, 8)}`,
          platform: 'claude'
        })),
        ...claudeConsoleAccounts.map((a) => ({
          id: String(a.id || ''),
          name: a.name || `Console账号 ${String(a.id || '').slice(0, 8)}`,
          platform: 'claude-console'
        }))
      ]
    } else if (group === 'openai') {
      const [openaiAccounts, openaiResponsesAccounts] = await Promise.all([
        openaiAccountService.getAllAccounts(),
        openaiResponsesAccountService.getAllAccounts(true)
      ])
      accounts = [
        ...openaiAccounts.map((a) => ({
          id: String(a.id || ''),
          name: a.name || a.email || `OpenAI账号 ${String(a.id || '').slice(0, 8)}`,
          platform: 'openai'
        })),
        ...openaiResponsesAccounts.map((a) => ({
          id: String(a.id || ''),
          name: a.name || `Responses账号 ${String(a.id || '').slice(0, 8)}`,
          platform: 'openai-responses'
        }))
      ]
    } else if (group === 'gemini') {
      const gAccounts = await geminiAccountService.getAllAccounts()
      accounts = gAccounts.map((a) => ({
        id: String(a.id || ''),
        name: a.name || a.email || `Gemini账号 ${String(a.id || '').slice(0, 8)}`,
        platform: 'gemini'
      }))
    }
    if (!accounts || accounts.length === 0) {
      return res.json({
        success: true,
        data: [],
        granularity,
        group,
        groupLabel: groupLabels[group],
        topAccounts: [],
        totalAccounts: 0
      })
    }
    const accountMap = new Map()
    const accountIdSet = new Set()
    for (const account of accounts) {
      accountMap.set(account.id, { name: account.name, platform: account.platform })
      accountIdSet.add(account.id)
    }
    const fallbackModelByGroup = {
      claude: 'claude-3-5-sonnet-20241022',
      openai: 'gpt-4o-mini-2024-07-18',
      gemini: 'gemini-1.5-flash'
    }
    const fallbackModel = fallbackModelByGroup[group] || 'unknown'
    const client = redis.getClientSafe()
    const trendData = []
    const accountCostTotals = new Map()
    const sumModelCosts = async (accountId, period, timeKey) => {
      const modelPattern = `account_usage:model:${period}:${accountId}:*:${timeKey}`
      const modelKeys = await client.keys(modelPattern)
      let totalCost = 0
      for (const modelKey of modelKeys) {
        const modelData = await client.hgetall(modelKey)
        if (!modelData) {
          continue
        }
        const parts = modelKey.split(':')
        if (parts.length < 5) {
          continue
        }
        const modelName = parts[4]
        const usage = {
          input_tokens: parseInt(modelData.inputTokens) || 0,
          output_tokens: parseInt(modelData.outputTokens) || 0,
          cache_creation_input_tokens: parseInt(modelData.cacheCreateTokens) || 0,
          cache_read_input_tokens: parseInt(modelData.cacheReadTokens) || 0
        }
        const costResult = CostCalculator.calculateCost(usage, modelName)
        totalCost += costResult.costs.total
      }
      return totalCost
    }
    if (granularity === 'hour') {
      let startTime, endTime
      if (startDate && endDate) {
        startTime = new Date(startDate)
        endTime = new Date(endDate)
      } else {
        endTime = new Date()
        startTime = new Date(endTime.getTime() - 24 * 60 * 60 * 1000)
      }
      const currentHour = new Date(startTime)
      currentHour.setMinutes(0, 0, 0)
      while (currentHour <= endTime) {
        const tzCurrentHour = redis.getDateInTimezone(currentHour)
        const dateStr = redis.getDateStringInTimezone(currentHour)
        const hour = String(tzCurrentHour.getUTCHours()).padStart(2, '0')
        const hourKey = `${dateStr}:${hour}`
        const tzDateForLabel = redis.getDateInTimezone(currentHour)
        const monthLabel = String(tzDateForLabel.getUTCMonth() + 1).padStart(2, '0')
        const dayLabel = String(tzDateForLabel.getUTCDate()).padStart(2, '0')
        const hourLabel = String(tzDateForLabel.getUTCHours()).padStart(2, '0')
        const hourData = {
          hour: currentHour.toISOString(),
          label: `${monthLabel}/${dayLabel} ${hourLabel}:00`,
          accounts: {}
        }
        const pattern = `account_usage:hourly:*:${hourKey}`
        const keys = await client.keys(pattern)
        for (const key of keys) {
          const match = key.match(/account_usage:hourly:(.+?):\d{4}-\d{2}-\d{2}:\d{2}/)
          if (!match) {
            continue
          }
          const accountIdMatch = match[1]
          if (!accountIdSet.has(accountIdMatch)) {
            continue
          }
          const data = await client.hgetall(key)
          if (!data) {
            continue
          }
          const inputTokens = parseInt(data.inputTokens) || 0
          const outputTokens = parseInt(data.outputTokens) || 0
          const cacheCreateTokens = parseInt(data.cacheCreateTokens) || 0
          const cacheReadTokens = parseInt(data.cacheReadTokens) || 0
          const allTokens =
            parseInt(data.allTokens) ||
            inputTokens + outputTokens + cacheCreateTokens + cacheReadTokens
          const requests = parseInt(data.requests) || 0
          let cost = await sumModelCosts(accountIdMatch, 'hourly', hourKey)
          if (cost === 0 && allTokens > 0) {
            const fallbackUsage = {
              input_tokens: inputTokens,
              output_tokens: outputTokens,
              cache_creation_input_tokens: cacheCreateTokens,
              cache_read_input_tokens: cacheReadTokens
            }
            const fallbackResult = CostCalculator.calculateCost(fallbackUsage, fallbackModel)
            cost = fallbackResult.costs.total
          }
          const formattedCost = CostCalculator.formatCost(cost)
          const accountInfo = accountMap.get(accountIdMatch)
          hourData.accounts[accountIdMatch] = {
            name: accountInfo ? accountInfo.name : `账号 ${accountIdMatch.slice(0, 8)}`,
            cost,
            formattedCost,
            requests
          }
          accountCostTotals.set(accountIdMatch, (accountCostTotals.get(accountIdMatch) || 0) + cost)
        }
        trendData.push(hourData)
        currentHour.setHours(currentHour.getHours() + 1)
      }
    } else {
      const daysCount = parseInt(days) || 7
      const today = new Date()
      for (let i = 0; i < daysCount; i++) {
        const date = new Date(today)
        date.setDate(date.getDate() - i)
        const dateStr = redis.getDateStringInTimezone(date)
        const dayData = { date: dateStr, accounts: {} }
        const pattern = `account_usage:daily:*:${dateStr}`
        const keys = await client.keys(pattern)
        for (const key of keys) {
          const match = key.match(/account_usage:daily:(.+?):\d{4}-\d{2}-\d{2}/)
          if (!match) {
            continue
          }
          const accountIdMatch = match[1]
          if (!accountIdSet.has(accountIdMatch)) {
            continue
          }
          const data = await client.hgetall(key)
          if (!data) {
            continue
          }
          const inputTokens = parseInt(data.inputTokens) || 0
          const outputTokens = parseInt(data.outputTokens) || 0
          const cacheCreateTokens = parseInt(data.cacheCreateTokens) || 0
          const cacheReadTokens = parseInt(data.cacheReadTokens) || 0
          const allTokens =
            parseInt(data.allTokens) ||
            inputTokens + outputTokens + cacheCreateTokens + cacheReadTokens
          const requests = parseInt(data.requests) || 0
          let cost = await sumModelCosts(accountIdMatch, 'daily', dateStr)
          if (cost === 0 && allTokens > 0) {
            const fallbackUsage = {
              input_tokens: inputTokens,
              output_tokens: outputTokens,
              cache_creation_input_tokens: cacheCreateTokens,
              cache_read_input_tokens: cacheReadTokens
            }
            const fallbackResult = CostCalculator.calculateCost(fallbackUsage, fallbackModel)
            cost = fallbackResult.costs.total
          }
          const formattedCost = CostCalculator.formatCost(cost)
          const accountInfo = accountMap.get(accountIdMatch)
          dayData.accounts[accountIdMatch] = {
            name: accountInfo ? accountInfo.name : `账号 ${accountIdMatch.slice(0, 8)}`,
            cost,
            formattedCost,
            requests
          }
          accountCostTotals.set(accountIdMatch, (accountCostTotals.get(accountIdMatch) || 0) + cost)
        }
        trendData.push(dayData)
      }
    }
    if (granularity === 'hour') {
      trendData.sort((a, b) => new Date(a.hour) - new Date(b.hour))
    } else {
      trendData.sort((a, b) => new Date(a.date) - new Date(b.date))
    }
    const topAccounts = Array.from(accountCostTotals.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([accountId]) => accountId)
    return res.json({
      success: true,
      data: trendData,
      granularity,
      group,
      groupLabel: groupLabels[group],
      topAccounts,
      totalAccounts: accountCostTotals.size
    })
  } catch (error) {
    logger.error('❌ Failed to get account usage trend:', error)
    return res
      .status(500)
      .json({ error: 'Failed to get account usage trend', message: error.message })
  }
})

// 获取按API Key分组的使用趋势
router.get('/api-keys-usage-trend', authenticateAdmin, async (req, res) => {
  try {
    const { granularity = 'day', days = 7, startDate, endDate } = req.query
    const client = redis.getClientSafe()
    const trendData = []
    const apiKeyService = require('../../services/apiKeyService')
    const apiKeys = await apiKeyService.getAllApiKeys()
    const apiKeyMap = new Map(apiKeys.map((key) => [key.id, key]))
    if (granularity === 'hour') {
      let endTime, startTime
      if (startDate && endDate) {
        startTime = new Date(startDate)
        endTime = new Date(endDate)
      } else {
        endTime = new Date()
        startTime = new Date(endTime.getTime() - 24 * 60 * 60 * 1000)
      }
      const currentHour = new Date(startTime)
      currentHour.setMinutes(0, 0, 0)
      while (currentHour <= endTime) {
        const tzCurrentHour = redis.getDateInTimezone(currentHour)
        const dateStr = redis.getDateStringInTimezone(currentHour)
        const hour = String(tzCurrentHour.getUTCHours()).padStart(2, '0')
        const hourKey = `${dateStr}:${hour}`
        const pattern = `usage:hourly:*:${hourKey}`
        const keys = await client.keys(pattern)
        const tzDateForLabel = redis.getDateInTimezone(currentHour)
        const monthLabel = String(tzDateForLabel.getUTCMonth() + 1).padStart(2, '0')
        const dayLabel = String(tzDateForLabel.getUTCDate()).padStart(2, '0')
        const hourLabel = String(tzDateForLabel.getUTCHours()).padStart(2, '0')
        const hourData = {
          hour: currentHour.toISOString(),
          label: `${monthLabel}/${dayLabel} ${hourLabel}:00`,
          apiKeys: {}
        }
        const apiKeyDataMap = new Map()
        for (const key of keys) {
          const match = key.match(/usage:hourly:(.+?):\d{4}-\d{2}-\d{2}:\d{2}/)
          if (!match) {
            continue
          }
          const apiKeyId = match[1]
          const data = await client.hgetall(key)
          if (data && apiKeyMap.has(apiKeyId)) {
            const inputTokens = parseInt(data.inputTokens) || 0
            const outputTokens = parseInt(data.outputTokens) || 0
            const cacheCreateTokens = parseInt(data.cacheCreateTokens) || 0
            const cacheReadTokens = parseInt(data.cacheReadTokens) || 0
            const totalTokens = inputTokens + outputTokens + cacheCreateTokens + cacheReadTokens
            apiKeyDataMap.set(apiKeyId, {
              name: apiKeyMap.get(apiKeyId).name,
              tokens: totalTokens,
              requests: parseInt(data.requests) || 0,
              inputTokens,
              outputTokens,
              cacheCreateTokens,
              cacheReadTokens
            })
          }
        }
        const modelPattern = `usage:*:model:hourly:*:${hourKey}`
        const modelKeys = await client.keys(modelPattern)
        const apiKeyCostMap = new Map()
        for (const modelKey of modelKeys) {
          const match = modelKey.match(/usage:(.+?):model:hourly:(.+?):\d{4}-\d{2}-\d{2}:\d{2}/)
          if (!match) {
            continue
          }
          const apiKeyId = match[1]
          const model = match[2]
          const modelData = await client.hgetall(modelKey)
          if (modelData && apiKeyDataMap.has(apiKeyId)) {
            const usage = {
              input_tokens: parseInt(modelData.inputTokens) || 0,
              output_tokens: parseInt(modelData.outputTokens) || 0,
              cache_creation_input_tokens: parseInt(modelData.cacheCreateTokens) || 0,
              cache_read_input_tokens: parseInt(modelData.cacheReadTokens) || 0
            }
            const costResult = CostCalculator.calculateCost(usage, model)
            const currentCost = apiKeyCostMap.get(apiKeyId) || 0
            apiKeyCostMap.set(apiKeyId, currentCost + costResult.costs.total)
          }
        }
        for (const [apiKeyId, data] of apiKeyDataMap) {
          const cost = apiKeyCostMap.get(apiKeyId) || 0
          let finalCost = cost
          let formattedCost = CostCalculator.formatCost(cost)
          if (cost === 0 && data.tokens > 0) {
            const usage = {
              input_tokens: data.inputTokens,
              output_tokens: data.outputTokens,
              cache_creation_input_tokens: data.cacheCreateTokens,
              cache_read_input_tokens: data.cacheReadTokens
            }
            const fallbackResult = CostCalculator.calculateCost(usage, 'claude-3-5-sonnet-20241022')
            finalCost = fallbackResult.costs.total
            formattedCost = fallbackResult.formatted.total
          }
          hourData.apiKeys[apiKeyId] = {
            name: data.name,
            tokens: data.tokens,
            requests: data.requests,
            cost: finalCost,
            formattedCost
          }
        }
        trendData.push(hourData)
        currentHour.setHours(currentHour.getHours() + 1)
      }
    } else {
      const daysCount = parseInt(days) || 7
      const today = new Date()
      for (let i = 0; i < daysCount; i++) {
        const date = new Date(today)
        date.setDate(date.getDate() - i)
        const dateStr = redis.getDateStringInTimezone(date)
        const pattern = `usage:daily:*:${dateStr}`
        const keys = await client.keys(pattern)
        const dayData = { date: dateStr, apiKeys: {} }
        const apiKeyDataMap = new Map()
        for (const key of keys) {
          const match = key.match(/usage:daily:(.+?):\d{4}-\d{2}-\d{2}/)
          if (!match) {
            continue
          }
          const apiKeyId = match[1]
          const data = await client.hgetall(key)
          if (data && apiKeyMap.has(apiKeyId)) {
            const inputTokens = parseInt(data.inputTokens) || 0
            const outputTokens = parseInt(data.outputTokens) || 0
            const cacheCreateTokens = parseInt(data.cacheCreateTokens) || 0
            const cacheReadTokens = parseInt(data.cacheReadTokens) || 0
            const totalTokens = inputTokens + outputTokens + cacheCreateTokens + cacheReadTokens
            apiKeyDataMap.set(apiKeyId, {
              name: apiKeyMap.get(apiKeyId).name,
              tokens: totalTokens,
              requests: parseInt(data.requests) || 0,
              inputTokens,
              outputTokens,
              cacheCreateTokens,
              cacheReadTokens
            })
          }
        }
        const modelPattern = `usage:*:model:daily:*:${dateStr}`
        const modelKeys = await client.keys(modelPattern)
        const apiKeyCostMap = new Map()
        for (const modelKey of modelKeys) {
          const match = modelKey.match(/usage:(.+?):model:daily:(.+?):\d{4}-\d{2}-\d{2}/)
          if (!match) {
            continue
          }
          const apiKeyId = match[1]
          const model = match[2]
          const modelData = await client.hgetall(modelKey)
          if (modelData && apiKeyDataMap.has(apiKeyId)) {
            const usage = {
              input_tokens: parseInt(modelData.inputTokens) || 0,
              output_tokens: parseInt(modelData.outputTokens) || 0,
              cache_creation_input_tokens: parseInt(modelData.cacheCreateTokens) || 0,
              cache_read_input_tokens: parseInt(modelData.cacheReadTokens) || 0
            }
            const costResult = CostCalculator.calculateCost(usage, model)
            const currentCost = apiKeyCostMap.get(apiKeyId) || 0
            apiKeyCostMap.set(apiKeyId, currentCost + costResult.costs.total)
          }
        }
        for (const [apiKeyId, data] of apiKeyDataMap) {
          const cost = apiKeyCostMap.get(apiKeyId) || 0
          let finalCost = cost
          let formattedCost = CostCalculator.formatCost(cost)
          if (cost === 0 && data.tokens > 0) {
            const usage = {
              input_tokens: data.inputTokens,
              output_tokens: data.outputTokens,
              cache_creation_input_tokens: data.cacheCreateTokens,
              cache_read_input_tokens: data.cacheReadTokens
            }
            const fallbackResult = CostCalculator.calculateCost(usage, 'claude-3-5-sonnet-20241022')
            finalCost = fallbackResult.costs.total
            formattedCost = fallbackResult.formatted.total
          }
          dayData.apiKeys[apiKeyId] = {
            name: data.name,
            tokens: data.tokens,
            requests: data.requests,
            cost: finalCost,
            formattedCost
          }
        }
        trendData.push(dayData)
      }
    }
    if (granularity === 'hour') {
      trendData.sort((a, b) => new Date(a.hour) - new Date(b.hour))
    } else {
      trendData.sort((a, b) => new Date(a.date) - new Date(b.date))
    }
    const apiKeyTotals = new Map()
    for (const point of trendData) {
      for (const [apiKeyId, data] of Object.entries(point.apiKeys)) {
        apiKeyTotals.set(apiKeyId, (apiKeyTotals.get(apiKeyId) || 0) + data.tokens)
      }
    }
    const topApiKeys = Array.from(apiKeyTotals.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([apiKeyId]) => apiKeyId)
    return res.json({
      success: true,
      data: trendData,
      granularity,
      topApiKeys,
      totalApiKeys: apiKeyTotals.size
    })
  } catch (error) {
    logger.error('❌ Failed to get API keys usage trend:', error)
    return res
      .status(500)
      .json({ error: 'Failed to get API keys usage trend', message: error.message })
  }
})

// 计算总体使用费用
router.get('/usage-costs', authenticateAdmin, async (req, res) => {
  try {
    const { period = 'all' } = req.query
    const apiKeyService = require('../../services/apiKeyService')
    const normalizeModelName = (model) => {
      if (!model || model === 'unknown') {
        return model
      }
      if (model.includes('.anthropic.') || model.includes('.claude')) {
        let normalized = model.replace(/^[a-z0-9-]+\./, '')
        normalized = normalized.replace('anthropic.', '')
        normalized = normalized.replace(/-v\d+:\d+$/, '')
        return normalized
      }
      return model.replace(/-v\d+:\d+$|:latest$/, '')
    }
    const apiKeys = await apiKeyService.getAllApiKeys()
    const totalCosts = {
      inputCost: 0,
      outputCost: 0,
      cacheCreateCost: 0,
      cacheReadCost: 0,
      totalCost: 0
    }
    const modelCosts = {}
    const client = redis.getClientSafe()
    const today = redis.getDateStringInTimezone()
    const tzDate = redis.getDateInTimezone()
    const currentMonth = `${tzDate.getUTCFullYear()}-${String(tzDate.getUTCMonth() + 1).padStart(2, '0')}`
    let pattern
    if (period === 'today') {
      pattern = `usage:model:daily:*:${today}`
    } else if (period === 'monthly') {
      pattern = `usage:model:monthly:*:${currentMonth}`
    } else if (period === '7days') {
      const modelUsageMap = new Map()
      for (let i = 0; i < 7; i++) {
        const date = new Date()
        date.setDate(date.getDate() - i)
        const currentTzDate = redis.getDateInTimezone(date)
        const dateStr = `${currentTzDate.getUTCFullYear()}-${String(currentTzDate.getUTCMonth() + 1).padStart(2, '0')}-${String(currentTzDate.getUTCDate()).padStart(2, '0')}`
        const dayKeys = await client.keys(`usage:model:daily:*:${dateStr}`)
        for (const key of dayKeys) {
          const mm = key.match(/usage:model:daily:(.+):\d{4}-\d{2}-\d{2}$/)
          if (!mm) {
            continue
          }
          const rawModel = mm[1]
          const normalizedModel = normalizeModelName(rawModel)
          const data = await client.hgetall(key)
          if (data && Object.keys(data).length > 0) {
            if (!modelUsageMap.has(normalizedModel)) {
              modelUsageMap.set(normalizedModel, {
                inputTokens: 0,
                outputTokens: 0,
                cacheCreateTokens: 0,
                cacheReadTokens: 0
              })
            }
            const mu = modelUsageMap.get(normalizedModel)
            mu.inputTokens += parseInt(data.inputTokens) || 0
            mu.outputTokens += parseInt(data.outputTokens) || 0
            mu.cacheCreateTokens += parseInt(data.cacheCreateTokens) || 0
            mu.cacheReadTokens += parseInt(data.cacheReadTokens) || 0
          }
        }
      }
      for (const [model, usage] of modelUsageMap) {
        const usageData = {
          input_tokens: usage.inputTokens,
          output_tokens: usage.outputTokens,
          cache_creation_input_tokens: usage.cacheCreateTokens,
          cache_read_input_tokens: usage.cacheReadTokens
        }
        const costResult = CostCalculator.calculateCost(usageData, model)
        totalCosts.inputCost += costResult.costs.input
        totalCosts.outputCost += costResult.costs.output
        totalCosts.cacheCreateCost += costResult.costs.cacheWrite
        totalCosts.cacheReadCost += costResult.costs.cacheRead
        totalCosts.totalCost += costResult.costs.total
        modelCosts[model] = {
          model,
          requests: 0,
          usage: usageData,
          costs: costResult.costs,
          formatted: costResult.formatted,
          usingDynamicPricing: costResult.usingDynamicPricing
        }
      }
      return res.json({
        success: true,
        data: {
          period,
          totalCosts: {
            ...totalCosts,
            formatted: {
              inputCost: CostCalculator.formatCost(totalCosts.inputCost),
              outputCost: CostCalculator.formatCost(totalCosts.outputCost),
              cacheCreateCost: CostCalculator.formatCost(totalCosts.cacheCreateCost),
              cacheReadCost: CostCalculator.formatCost(totalCosts.cacheReadCost),
              totalCost: CostCalculator.formatCost(totalCosts.totalCost)
            }
          },
          modelCosts: Object.values(modelCosts)
        }
      })
    } else {
      const allModelKeys = await client.keys('usage:model:monthly:*:*')
      if (allModelKeys.length > 0) {
        const modelUsageMap = new Map()
        for (const key of allModelKeys) {
          const mm = key.match(/usage:model:monthly:(.+):(\d{4}-\d{2})$/)
          if (!mm) {
            continue
          }
          const model = mm[1]
          const data = await client.hgetall(key)
          if (data && Object.keys(data).length > 0) {
            if (!modelUsageMap.has(model)) {
              modelUsageMap.set(model, {
                inputTokens: 0,
                outputTokens: 0,
                cacheCreateTokens: 0,
                cacheReadTokens: 0
              })
            }
            const mu = modelUsageMap.get(model)
            mu.inputTokens += parseInt(data.inputTokens) || 0
            mu.outputTokens += parseInt(data.outputTokens) || 0
            mu.cacheCreateTokens += parseInt(data.cacheCreateTokens) || 0
            mu.cacheReadTokens += parseInt(data.cacheReadTokens) || 0
          }
        }
        for (const [model, usage] of modelUsageMap) {
          const usageData = {
            input_tokens: usage.inputTokens,
            output_tokens: usage.outputTokens,
            cache_creation_input_tokens: usage.cacheCreateTokens,
            cache_read_input_tokens: usage.cacheReadTokens
          }
          const costResult = CostCalculator.calculateCost(usageData, model)
          totalCosts.inputCost += costResult.costs.input
          totalCosts.outputCost += costResult.costs.output
          totalCosts.cacheCreateCost += costResult.costs.cacheWrite
          totalCosts.cacheReadCost += costResult.costs.cacheRead
          totalCosts.totalCost += costResult.costs.total
          modelCosts[model] = {
            model,
            requests: 0,
            usage: usageData,
            costs: costResult.costs,
            formatted: costResult.formatted,
            usingDynamicPricing: costResult.usingDynamicPricing
          }
        }
      } else {
        for (const apiKey of apiKeys) {
          if (apiKey.usage && apiKey.usage.total) {
            const usage = {
              input_tokens: apiKey.usage.total.inputTokens || 0,
              output_tokens: apiKey.usage.total.outputTokens || 0,
              cache_creation_input_tokens: apiKey.usage.total.cacheCreateTokens || 0,
              cache_read_input_tokens: apiKey.usage.total.cacheReadTokens || 0
            }
            const costResult = CostCalculator.calculateCost(usage, 'claude-3-5-haiku-20241022')
            totalCosts.inputCost += costResult.costs.input
            totalCosts.outputCost += costResult.costs.output
            totalCosts.cacheCreateCost += costResult.costs.cacheWrite
            totalCosts.cacheReadCost += costResult.costs.cacheRead
            totalCosts.totalCost += costResult.costs.total
          }
        }
      }
      return res.json({
        success: true,
        data: {
          period,
          totalCosts: {
            ...totalCosts,
            formatted: {
              inputCost: CostCalculator.formatCost(totalCosts.inputCost),
              outputCost: CostCalculator.formatCost(totalCosts.outputCost),
              cacheCreateCost: CostCalculator.formatCost(totalCosts.cacheCreateCost),
              cacheReadCost: CostCalculator.formatCost(totalCosts.cacheReadCost),
              totalCost: CostCalculator.formatCost(totalCosts.totalCost)
            }
          },
          modelCosts: Object.values(modelCosts).sort((a, b) => b.costs.total - a.costs.total),
          pricingServiceStatus: pricingService.getStatus()
        }
      })
    }

    const keys = await client.keys(pattern)
    for (const key of keys) {
      const match = key.match(
        period === 'today'
          ? /usage:model:daily:(.+):\d{4}-\d{2}-\d{2}$/
          : /usage:model:monthly:(.+):\d{4}-\d{2}$/
      )
      if (!match) {
        continue
      }
      const model = match[1]
      const data = await client.hgetall(key)
      if (data && Object.keys(data).length > 0) {
        const usage = {
          input_tokens: parseInt(data.inputTokens) || 0,
          output_tokens: parseInt(data.outputTokens) || 0,
          cache_creation_input_tokens: parseInt(data.cacheCreateTokens) || 0,
          cache_read_input_tokens: parseInt(data.cacheReadTokens) || 0
        }
        const costResult = CostCalculator.calculateCost(usage, model)
        totalCosts.inputCost += costResult.costs.input
        totalCosts.outputCost += costResult.costs.output
        totalCosts.cacheCreateCost += costResult.costs.cacheWrite
        totalCosts.cacheReadCost += costResult.costs.cacheRead
        totalCosts.totalCost += costResult.costs.total
        modelCosts[model] = {
          model,
          requests: parseInt(data.requests) || 0,
          usage,
          costs: costResult.costs,
          formatted: costResult.formatted,
          usingDynamicPricing: costResult.usingDynamicPricing
        }
      }
    }
    return res.json({
      success: true,
      data: {
        period,
        totalCosts: {
          ...totalCosts,
          formatted: {
            inputCost: CostCalculator.formatCost(totalCosts.inputCost),
            outputCost: CostCalculator.formatCost(totalCosts.outputCost),
            cacheCreateCost: CostCalculator.formatCost(totalCosts.cacheCreateCost),
            cacheReadCost: CostCalculator.formatCost(totalCosts.cacheReadCost),
            totalCost: CostCalculator.formatCost(totalCosts.totalCost)
          }
        },
        modelCosts: Object.values(modelCosts).sort((a, b) => b.costs.total - a.costs.total),
        pricingServiceStatus: pricingService.getStatus()
      }
    })
  } catch (error) {
    logger.error('❌ Failed to calculate usage costs:', error)
    return res
      .status(500)
      .json({ error: 'Failed to calculate usage costs', message: error.message })
  }
})

module.exports = router
