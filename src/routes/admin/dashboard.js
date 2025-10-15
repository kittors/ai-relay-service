const express = require('express')
const router = express.Router()

const { authenticateAdmin } = require('../../middleware/auth')
const logger = require('../../utils/logger')
const redis = require('../../models/redis')
const config = require('../../../config/config')

const claudeAccountService = require('../../services/claudeAccountService')
const claudeConsoleAccountService = require('../../services/claudeConsoleAccountService')
const geminiAccountService = require('../../services/geminiAccountService')
const bedrockAccountService = require('../../services/bedrockAccountService')
const ccrAccountService = require('../../services/ccrAccountService')
const openaiResponsesAccountService = require('../../services/openaiResponsesAccountService')
const droidAccountService = require('../../services/droidAccountService')
const accountGroupService = require('../../services/accountGroupService')

const apiKeyService = require('../../services/apiKeyService')

// 获取系统概览
router.get('/dashboard', authenticateAdmin, async (req, res) => {
  try {
    const [
      ,
      apiKeys,
      claudeAccounts,
      claudeConsoleAccounts,
      geminiAccounts,
      bedrockAccountsResult,
      openaiAccounts,
      ccrAccounts,
      openaiResponsesAccounts,
      droidAccounts,
      todayStats,
      systemAverages,
      realtimeMetrics
    ] = await Promise.all([
      redis.getSystemStats(),
      apiKeyService.getAllApiKeys(),
      claudeAccountService.getAllAccounts(),
      claudeConsoleAccountService.getAllAccounts(),
      geminiAccountService.getAllAccounts(),
      bedrockAccountService.getAllAccounts(),
      redis.getAllOpenAIAccounts(),
      ccrAccountService.getAllAccounts(),
      openaiResponsesAccountService.getAllAccounts(true),
      droidAccountService.getAllAccounts(),
      redis.getTodayStats(),
      redis.getSystemAverages(),
      redis.getRealtimeSystemMetrics()
    ])

    const bedrockAccounts = bedrockAccountsResult.success ? bedrockAccountsResult.data : []
    const normalizeBoolean = (value) => value === true || value === 'true'
    const isRateLimitedFlag = (status) => {
      if (!status) {
        return false
      }
      if (typeof status === 'string') {
        return status === 'limited'
      }
      if (typeof status === 'object') {
        return status.isRateLimited === true
      }
      return false
    }

    const normalDroidAccounts = droidAccounts.filter(
      (acc) =>
        normalizeBoolean(acc.isActive) &&
        acc.status !== 'blocked' &&
        acc.status !== 'unauthorized' &&
        normalizeBoolean(acc.schedulable) &&
        !isRateLimitedFlag(acc.rateLimitStatus)
    ).length
    const abnormalDroidAccounts = droidAccounts.filter(
      (acc) =>
        !normalizeBoolean(acc.isActive) || acc.status === 'blocked' || acc.status === 'unauthorized'
    ).length
    const pausedDroidAccounts = droidAccounts.filter(
      (acc) =>
        !normalizeBoolean(acc.schedulable) &&
        normalizeBoolean(acc.isActive) &&
        acc.status !== 'blocked' &&
        acc.status !== 'unauthorized'
    ).length
    const rateLimitedDroidAccounts = droidAccounts.filter((acc) =>
      isRateLimitedFlag(acc.rateLimitStatus)
    ).length

    const totalTokensUsed = apiKeys.reduce(
      (sum, key) => sum + (key.usage?.total?.allTokens || 0),
      0
    )
    const totalRequestsUsed = apiKeys.reduce(
      (sum, key) => sum + (key.usage?.total?.requests || 0),
      0
    )
    const totalInputTokensUsed = apiKeys.reduce(
      (sum, key) => sum + (key.usage?.total?.inputTokens || 0),
      0
    )
    const totalOutputTokensUsed = apiKeys.reduce(
      (sum, key) => sum + (key.usage?.total?.outputTokens || 0),
      0
    )
    const totalCacheCreateTokensUsed = apiKeys.reduce(
      (sum, key) => sum + (key.usage?.total?.cacheCreateTokens || 0),
      0
    )
    const totalCacheReadTokensUsed = apiKeys.reduce(
      (sum, key) => sum + (key.usage?.total?.cacheReadTokens || 0),
      0
    )
    const totalAllTokensUsed = apiKeys.reduce(
      (sum, key) => sum + (key.usage?.total?.allTokens || 0),
      0
    )

    const activeApiKeys = apiKeys.filter((key) => key.isActive).length

    const normalClaudeAccounts = claudeAccounts.filter(
      (acc) =>
        acc.isActive &&
        acc.status !== 'blocked' &&
        acc.status !== 'unauthorized' &&
        acc.schedulable !== false &&
        !(acc.rateLimitStatus && acc.rateLimitStatus.isRateLimited)
    ).length
    const abnormalClaudeAccounts = claudeAccounts.filter(
      (acc) => !acc.isActive || acc.status === 'blocked' || acc.status === 'unauthorized'
    ).length
    const pausedClaudeAccounts = claudeAccounts.filter(
      (acc) =>
        acc.schedulable === false &&
        acc.isActive &&
        acc.status !== 'blocked' &&
        acc.status !== 'unauthorized'
    ).length
    const rateLimitedClaudeAccounts = claudeAccounts.filter(
      (acc) => acc.rateLimitStatus && acc.rateLimitStatus.isRateLimited
    ).length

    const normalClaudeConsoleAccounts = claudeConsoleAccounts.filter(
      (acc) =>
        acc.isActive &&
        acc.status !== 'blocked' &&
        acc.status !== 'unauthorized' &&
        acc.schedulable !== false &&
        !(acc.rateLimitStatus && acc.rateLimitStatus.isRateLimited)
    ).length
    const abnormalClaudeConsoleAccounts = claudeConsoleAccounts.filter(
      (acc) => !acc.isActive || acc.status === 'blocked' || acc.status === 'unauthorized'
    ).length
    const pausedClaudeConsoleAccounts = claudeConsoleAccounts.filter(
      (acc) =>
        acc.schedulable === false &&
        acc.isActive &&
        acc.status !== 'blocked' &&
        acc.status !== 'unauthorized'
    ).length
    const rateLimitedClaudeConsoleAccounts = claudeConsoleAccounts.filter(
      (acc) => acc.rateLimitStatus && acc.rateLimitStatus.isRateLimited
    ).length

    const normalGeminiAccounts = geminiAccounts.filter(
      (acc) =>
        acc.isActive &&
        acc.status !== 'blocked' &&
        acc.status !== 'unauthorized' &&
        acc.schedulable !== false &&
        !(
          acc.rateLimitStatus === 'limited' ||
          (acc.rateLimitStatus && acc.rateLimitStatus.isRateLimited)
        )
    ).length
    const abnormalGeminiAccounts = geminiAccounts.filter(
      (acc) => !acc.isActive || acc.status === 'blocked' || acc.status === 'unauthorized'
    ).length
    const pausedGeminiAccounts = geminiAccounts.filter(
      (acc) =>
        acc.schedulable === false &&
        acc.isActive &&
        acc.status !== 'blocked' &&
        acc.status !== 'unauthorized'
    ).length
    const rateLimitedGeminiAccounts = geminiAccounts.filter(
      (acc) =>
        acc.rateLimitStatus === 'limited' ||
        (acc.rateLimitStatus && acc.rateLimitStatus.isRateLimited)
    ).length

    const normalBedrockAccounts = bedrockAccounts.filter(
      (acc) =>
        acc.isActive &&
        acc.status !== 'blocked' &&
        acc.status !== 'unauthorized' &&
        acc.schedulable !== false &&
        !(acc.rateLimitStatus && acc.rateLimitStatus.isRateLimited)
    ).length
    const abnormalBedrockAccounts = bedrockAccounts.filter(
      (acc) => !acc.isActive || acc.status === 'blocked' || acc.status === 'unauthorized'
    ).length
    const pausedBedrockAccounts = bedrockAccounts.filter(
      (acc) =>
        acc.schedulable === false &&
        acc.isActive &&
        acc.status !== 'blocked' &&
        acc.status !== 'unauthorized'
    ).length
    const rateLimitedBedrockAccounts = bedrockAccounts.filter(
      (acc) => acc.rateLimitStatus && acc.rateLimitStatus.isRateLimited
    ).length

    const normalOpenAIAccounts = openaiAccounts.filter(
      (acc) =>
        (acc.isActive === 'true' ||
          acc.isActive === true ||
          (!acc.isActive && acc.isActive !== 'false' && acc.isActive !== false)) &&
        acc.status !== 'blocked' &&
        acc.status !== 'unauthorized' &&
        acc.schedulable !== 'false' &&
        acc.schedulable !== false &&
        !(acc.rateLimitStatus && acc.rateLimitStatus.isRateLimited)
    ).length
    const abnormalOpenAIAccounts = openaiAccounts.filter(
      (acc) =>
        acc.isActive === 'false' ||
        acc.isActive === false ||
        acc.status === 'blocked' ||
        acc.status === 'unauthorized'
    ).length
    const pausedOpenAIAccounts = openaiAccounts.filter(
      (acc) =>
        (acc.schedulable === 'false' || acc.schedulable === false) &&
        (acc.isActive === 'true' ||
          acc.isActive === true ||
          (!acc.isActive && acc.isActive !== 'false' && acc.isActive !== false)) &&
        acc.status !== 'blocked' &&
        acc.status !== 'unauthorized'
    ).length
    const rateLimitedOpenAIAccounts = openaiAccounts.filter(
      (acc) => acc.rateLimitStatus && acc.rateLimitStatus.isRateLimited
    ).length

    const normalCcrAccounts = ccrAccounts.filter(
      (acc) =>
        acc.isActive &&
        acc.status !== 'blocked' &&
        acc.status !== 'unauthorized' &&
        acc.schedulable !== false &&
        !(acc.rateLimitStatus && acc.rateLimitStatus.isRateLimited)
    ).length
    const abnormalCcrAccounts = ccrAccounts.filter(
      (acc) => !acc.isActive || acc.status === 'blocked' || acc.status === 'unauthorized'
    ).length
    const pausedCcrAccounts = ccrAccounts.filter(
      (acc) =>
        acc.schedulable === false &&
        acc.isActive &&
        acc.status !== 'blocked' &&
        acc.status !== 'unauthorized'
    ).length
    const rateLimitedCcrAccounts = ccrAccounts.filter(
      (acc) => acc.rateLimitStatus && acc.rateLimitStatus.isRateLimited
    ).length

    const normalOpenAIResponsesAccounts = openaiResponsesAccounts.filter(
      (acc) =>
        (acc.isActive === 'true' ||
          acc.isActive === true ||
          (!acc.isActive && acc.isActive !== 'false' && acc.isActive !== false)) &&
        acc.status !== 'blocked' &&
        acc.status !== 'unauthorized' &&
        acc.schedulable !== 'false' &&
        acc.schedulable !== false &&
        !(acc.rateLimitStatus && acc.rateLimitStatus.isRateLimited)
    ).length
    const abnormalOpenAIResponsesAccounts = openaiResponsesAccounts.filter(
      (acc) =>
        acc.isActive === 'false' ||
        acc.isActive === false ||
        acc.status === 'blocked' ||
        acc.status === 'unauthorized'
    ).length
    const pausedOpenAIResponsesAccounts = openaiResponsesAccounts.filter(
      (acc) =>
        (acc.schedulable === 'false' || acc.schedulable === false) &&
        (acc.isActive === 'true' ||
          acc.isActive === true ||
          (!acc.isActive && acc.isActive !== 'false' && acc.isActive !== false)) &&
        acc.status !== 'blocked' &&
        acc.status !== 'unauthorized'
    ).length
    const rateLimitedOpenAIResponsesAccounts = openaiResponsesAccounts.filter(
      (acc) => acc.rateLimitStatus && acc.rateLimitStatus.isRateLimited
    ).length

    const dashboard = {
      overview: {
        totalApiKeys: apiKeys.length,
        activeApiKeys,
        totalAccounts:
          claudeAccounts.length +
          claudeConsoleAccounts.length +
          geminiAccounts.length +
          bedrockAccounts.length +
          openaiAccounts.length +
          openaiResponsesAccounts.length +
          ccrAccounts.length,
        normalAccounts:
          normalClaudeAccounts +
          normalClaudeConsoleAccounts +
          normalGeminiAccounts +
          normalBedrockAccounts +
          normalOpenAIAccounts +
          normalOpenAIResponsesAccounts +
          normalCcrAccounts,
        abnormalAccounts:
          abnormalClaudeAccounts +
          abnormalClaudeConsoleAccounts +
          abnormalGeminiAccounts +
          abnormalBedrockAccounts +
          abnormalOpenAIAccounts +
          abnormalOpenAIResponsesAccounts +
          abnormalCcrAccounts +
          abnormalDroidAccounts,
        pausedAccounts:
          pausedClaudeAccounts +
          pausedClaudeConsoleAccounts +
          pausedGeminiAccounts +
          pausedBedrockAccounts +
          pausedOpenAIAccounts +
          pausedOpenAIResponsesAccounts +
          pausedCcrAccounts +
          pausedDroidAccounts,
        rateLimitedAccounts:
          rateLimitedClaudeAccounts +
          rateLimitedClaudeConsoleAccounts +
          rateLimitedGeminiAccounts +
          rateLimitedBedrockAccounts +
          rateLimitedOpenAIAccounts +
          rateLimitedOpenAIResponsesAccounts +
          rateLimitedCcrAccounts +
          rateLimitedDroidAccounts,
        accountsByPlatform: {
          claude: {
            total: claudeAccounts.length,
            normal: normalClaudeAccounts,
            abnormal: abnormalClaudeAccounts,
            paused: pausedClaudeAccounts,
            rateLimited: rateLimitedClaudeAccounts
          },
          'claude-console': {
            total: claudeConsoleAccounts.length,
            normal: normalClaudeConsoleAccounts,
            abnormal: abnormalClaudeConsoleAccounts,
            paused: pausedClaudeConsoleAccounts,
            rateLimited: rateLimitedClaudeConsoleAccounts
          },
          gemini: {
            total: geminiAccounts.length,
            normal: normalGeminiAccounts,
            abnormal: abnormalGeminiAccounts,
            paused: pausedGeminiAccounts,
            rateLimited: rateLimitedGeminiAccounts
          },
          bedrock: {
            total: bedrockAccounts.length,
            normal: normalBedrockAccounts,
            abnormal: abnormalBedrockAccounts,
            paused: pausedBedrockAccounts,
            rateLimited: rateLimitedBedrockAccounts
          },
          openai: {
            total: openaiAccounts.length,
            normal: normalOpenAIAccounts,
            abnormal: abnormalOpenAIAccounts,
            paused: pausedOpenAIAccounts,
            rateLimited: rateLimitedOpenAIAccounts
          },
          ccr: {
            total: ccrAccounts.length,
            normal: normalCcrAccounts,
            abnormal: abnormalCcrAccounts,
            paused: pausedCcrAccounts,
            rateLimited: rateLimitedCcrAccounts
          },
          'openai-responses': {
            total: openaiResponsesAccounts.length,
            normal: normalOpenAIResponsesAccounts,
            abnormal: abnormalOpenAIResponsesAccounts,
            paused: pausedOpenAIResponsesAccounts,
            rateLimited: rateLimitedOpenAIResponsesAccounts
          },
          droid: {
            total: droidAccounts.length,
            normal: normalDroidAccounts,
            abnormal: abnormalDroidAccounts,
            paused: pausedDroidAccounts,
            rateLimited: rateLimitedDroidAccounts
          }
        },
        activeAccounts:
          normalClaudeAccounts +
          normalClaudeConsoleAccounts +
          normalGeminiAccounts +
          normalBedrockAccounts +
          normalOpenAIAccounts +
          normalOpenAIResponsesAccounts +
          normalCcrAccounts +
          normalDroidAccounts,
        totalClaudeAccounts: claudeAccounts.length + claudeConsoleAccounts.length,
        activeClaudeAccounts: normalClaudeAccounts + normalClaudeConsoleAccounts,
        rateLimitedClaudeAccounts: rateLimitedClaudeAccounts + rateLimitedClaudeConsoleAccounts,
        totalGeminiAccounts: geminiAccounts.length,
        activeGeminiAccounts: normalGeminiAccounts,
        rateLimitedGeminiAccounts,
        totalTokensUsed,
        totalRequestsUsed,
        totalInputTokensUsed,
        totalOutputTokensUsed,
        totalCacheCreateTokensUsed,
        totalCacheReadTokensUsed,
        totalAllTokensUsed
      },
      recentActivity: {
        apiKeysCreatedToday: todayStats.apiKeysCreatedToday,
        requestsToday: todayStats.requestsToday,
        tokensToday: todayStats.tokensToday,
        inputTokensToday: todayStats.inputTokensToday,
        outputTokensToday: todayStats.outputTokensToday,
        cacheCreateTokensToday: todayStats.cacheCreateTokensToday || 0,
        cacheReadTokensToday: todayStats.cacheReadTokensToday || 0
      },
      systemAverages: {
        rpm: systemAverages.systemRPM,
        tpm: systemAverages.systemTPM
      },
      realtimeMetrics: {
        rpm: realtimeMetrics.realtimeRPM,
        tpm: realtimeMetrics.realtimeTPM,
        windowMinutes: realtimeMetrics.windowMinutes,
        isHistorical: realtimeMetrics.windowMinutes === 0
      },
      systemHealth: {
        redisConnected: redis.isConnected,
        claudeAccountsHealthy: normalClaudeAccounts + normalClaudeConsoleAccounts > 0,
        geminiAccountsHealthy: normalGeminiAccounts > 0,
        droidAccountsHealthy: normalDroidAccounts > 0,
        uptime: process.uptime()
      },
      systemTimezone: config.system.timezoneOffset || 8
    }

    return res.json({ success: true, data: dashboard })
  } catch (error) {
    logger.error('❌ Failed to get dashboard data:', error)
    return res.status(500).json({ error: 'Failed to get dashboard data', message: error.message })
  }
})

// 账户分组的窗口/限额使用汇总
router.get('/account-limits/summary', authenticateAdmin, async (req, res) => {
  try {
    const { platform, refresh } = req.query
    const allGroups = await accountGroupService.getAllGroups()
    const claudeAccountServiceLocal = require('../../services/claudeAccountService')
    const result = { platforms: {}, overall: null }
    const toPercent = (v) => {
      if (v === null || v === undefined) {
        return null
      }
      let n = Number(v)
      if (!Number.isFinite(n)) {
        return null
      }
      if (n > 0 && n <= 1) {
        n = n * 100
      }
      if (n < 0) {
        n = 0
      }
      if (n > 100) {
        n = 100
      }
      return n
    }
    const avg = (arr) => {
      const vals = arr.filter((x) => x !== null && x !== undefined && Number.isFinite(x))
      if (vals.length === 0) {
        return { value: 0, sampleCount: 0 }
      }
      const s = vals.reduce((a, b) => a + b, 0)
      return { value: s / vals.length, sampleCount: vals.length }
    }
    const nowIso = new Date().toISOString()

    if (!platform || platform === 'claude') {
      const claudeAccounts = await claudeAccountServiceLocal.getAllAccounts()
      if (refresh === 'true') {
        const now = Date.now()
        const ttlMs = 300 * 1000
        const tasks = claudeAccounts.map(async (acc) => {
          const scopes = acc.scopes && acc.scopes.trim() ? acc.scopes.split(' ') : []
          const isOAuth = scopes.includes('user:profile') && scopes.includes('user:inference')
          if (isOAuth && acc.isActive === 'true' && acc.accessToken && acc.status === 'active') {
            const cached = claudeAccountServiceLocal.buildClaudeUsageSnapshot(acc)
            const lastUpdatedAt = acc.claudeUsageUpdatedAt
              ? new Date(acc.claudeUsageUpdatedAt).getTime()
              : 0
            const isFresh = cached && lastUpdatedAt && now - lastUpdatedAt < ttlMs
            if (!isFresh) {
              try {
                const usageData = await claudeAccountServiceLocal.fetchOAuthUsage(acc.id)
                if (usageData) {
                  await claudeAccountServiceLocal.updateClaudeUsageSnapshot(acc.id, usageData)
                }
              } catch (e) {
                logger.debug(
                  `Limits summary refresh: failed to fetch usage for ${acc.id}: ${e.message}`
                )
              }
            }
          }
        })
        await Promise.allSettled(tasks)
      }

      const claudeGroupIds = (allGroups || [])
        .filter((g) => g.platform === 'claude')
        .map((g) => g.id)
      const claudeGroupsMap = {}
      for (const g of allGroups || []) {
        if (g.platform !== 'claude') {
          continue
        }
        claudeGroupsMap[g.id] = { id: g.id, name: g.name, members: [] }
      }
      for (const gid of claudeGroupIds) {
        try {
          const members = await accountGroupService.getGroupMembers(gid)
          claudeGroupsMap[gid].members = members || []
        } catch (e) {
          logger.debug('Limits summary: failed to get claude group members', {
            groupId: gid,
            error: e?.message || String(e)
          })
        }
      }
      const accountUsage = {}
      for (const acc of claudeAccounts) {
        const snapshot = claudeAccountServiceLocal.buildClaudeUsageSnapshot(acc)
        accountUsage[acc.id] = snapshot
      }
      const allFive = []
      const allSeven = []
      for (const acc of claudeAccounts) {
        const snap = accountUsage[acc.id]
        if (snap && snap.fiveHour) {
          allFive.push(toPercent(snap.fiveHour.utilization))
        }
        if (snap && snap.sevenDay) {
          allSeven.push(toPercent(snap.sevenDay.utilization))
        }
      }
      const fiveAvg = avg(allFive)
      const sevenAvg = avg(allSeven)
      const groups = []
      for (const gid of Object.keys(claudeGroupsMap)) {
        const grp = claudeGroupsMap[gid]
        const fiveVals = []
        const sevenVals = []
        for (const accId of grp.members) {
          const snap = accountUsage[accId]
          if (snap && snap.fiveHour) {
            fiveVals.push(toPercent(snap.fiveHour.utilization))
          }
          if (snap && snap.sevenDay) {
            sevenVals.push(toPercent(snap.sevenDay.utilization))
          }
        }
        const f = avg(fiveVals)
        const s = avg(sevenVals)
        groups.push({
          id: gid,
          name: grp.name,
          fiveHourPercent: Math.round(f.value),
          weekPercent: Math.round(s.value),
          sampleCount: Math.max(f.sampleCount, s.sampleCount),
          memberCount: grp.members.length
        })
      }
      result.platforms.claude = {
        updatedAt: nowIso,
        overall: {
          fiveHourPercent: Math.round(fiveAvg.value),
          weekPercent: Math.round(sevenAvg.value),
          sampleCount: Math.max(fiveAvg.sampleCount, sevenAvg.sampleCount),
          accountCount: claudeAccounts.length
        },
        groups
      }
    }

    if (!platform || platform === 'openai') {
      const openaiAccounts = await redis.getAllOpenAIAccounts()
      const openaiGroupIds = (allGroups || [])
        .filter((g) => g.platform === 'openai')
        .map((g) => g.id)
      const openaiGroupsMap = {}
      for (const g of allGroups || []) {
        if (g.platform !== 'openai') {
          continue
        }
        openaiGroupsMap[g.id] = { id: g.id, name: g.name, members: [] }
      }
      for (const gid of openaiGroupIds) {
        try {
          const members = await accountGroupService.getGroupMembers(gid)
          openaiGroupsMap[gid].members = members || []
        } catch (e) {
          logger.debug('Aggregator: failed to get openai group members', {
            groupId: gid,
            error: e?.message || String(e)
          })
        }
      }
      const accountUsage = {}
      for (const acc of openaiAccounts) {
        accountUsage[acc.id] = {
          primary: {
            usedPercent:
              acc.codexPrimaryUsedPercent !== undefined && acc.codexPrimaryUsedPercent !== ''
                ? Number(acc.codexPrimaryUsedPercent)
                : null
          },
          secondary: {
            usedPercent:
              acc.codexSecondaryUsedPercent !== undefined && acc.codexSecondaryUsedPercent !== ''
                ? Number(acc.codexSecondaryUsedPercent)
                : null
          }
        }
      }
      const allPrimary = []
      const allSecondary = []
      for (const acc of openaiAccounts) {
        const snap = accountUsage[acc.id]
        if (snap && snap.primary) {
          allPrimary.push(toPercent(snap.primary.usedPercent))
        }
        if (snap && snap.secondary) {
          allSecondary.push(toPercent(snap.secondary.usedPercent))
        }
      }
      const pAvg = avg(allPrimary)
      const sAvg = avg(allSecondary)
      const groups = []
      for (const gid of Object.keys(openaiGroupsMap)) {
        const grp = openaiGroupsMap[gid]
        const primaryVals = []
        const secondaryVals = []
        for (const accId of grp.members) {
          const snap = accountUsage[accId]
          if (snap && snap.primary) {
            primaryVals.push(toPercent(snap.primary.usedPercent))
          }
          if (snap && snap.secondary) {
            secondaryVals.push(toPercent(snap.secondary.usedPercent))
          }
        }
        const pa = avg(primaryVals)
        const sa = avg(secondaryVals)
        groups.push({
          id: gid,
          name: grp.name,
          fiveHourPercent: Math.round(pa.value),
          weekPercent: Math.round(sa.value),
          sampleCount: Math.max(pa.sampleCount, sa.sampleCount),
          memberCount: grp.members.length
        })
      }
      result.platforms.openai = {
        updatedAt: nowIso,
        overall: {
          fiveHourPercent: Math.round(pAvg.value),
          weekPercent: Math.round(sAvg.value),
          sampleCount: Math.max(pAvg.sampleCount, sAvg.sampleCount),
          accountCount: openaiAccounts.length
        },
        groups
      }
    }

    try {
      const overallFive = []
      const overallWeek = []
      if (!platform || platform === 'claude') {
        const claudeAccountsForOverall = await claudeAccountService.getAllAccounts()
        for (const acc of claudeAccountsForOverall) {
          const snap = claudeAccountService.buildClaudeUsageSnapshot(acc)
          if (snap && snap.fiveHour) {
            overallFive.push(toPercent(snap.fiveHour.utilization))
          }
          if (snap && snap.sevenDay) {
            overallWeek.push(toPercent(snap.sevenDay.utilization))
          }
        }
      }
      if (!platform || platform === 'openai') {
        const openaiAccountsForOverall = await redis.getAllOpenAIAccounts()
        for (const acc of openaiAccountsForOverall) {
          overallFive.push(toPercent(acc.codexPrimaryUsedPercent))
          overallWeek.push(toPercent(acc.codexSecondaryUsedPercent))
        }
      }
      const ov5 = avg(overallFive)
      const ovw = avg(overallWeek)
      result.overall = {
        fiveHourPercent: Math.round(ov5.value),
        weekPercent: Math.round(ovw.value),
        sampleCount: Math.max(ov5.sampleCount, ovw.sampleCount)
      }
    } catch (e) {
      logger.debug('Overall limits summary calculation failed:', e?.message || e)
    }

    return res.json({ success: true, data: result })
  } catch (error) {
    logger.error('❌ Failed to get account group limits summary:', error)
    return res.status(500).json({ error: 'Failed to get limits summary', message: error.message })
  }
})

module.exports = router
