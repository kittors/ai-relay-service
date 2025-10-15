const express = require('express')
const router = express.Router()

const { authenticateAdmin } = require('../../middleware/auth')
const logger = require('../../utils/logger')
const redis = require('../../models/redis')

const claudeAccountService = require('../../services/claudeAccountService')
const claudeConsoleAccountService = require('../../services/claudeConsoleAccountService')
const geminiAccountService = require('../../services/geminiAccountService')
const openaiAccountService = require('../../services/openaiAccountService')
const openaiResponsesAccountService = require('../../services/openaiResponsesAccountService')
const azureOpenaiAccountService = require('../../services/azureOpenaiAccountService')
const bedrockAccountService = require('../../services/bedrockAccountService')
const droidAccountService = require('../../services/droidAccountService')
const ccrAccountService = require('../../services/ccrAccountService')
const accountGroupService = require('../../services/accountGroupService')

// 📦 账户聚合查询（用于前端减少并发请求）
router.get('/accounts/aggregated', authenticateAdmin, async (req, res) => {
  try {
    const platformFilter = (req.query.platform || '').trim()
    const groupFilter = (req.query.groupId || '').trim()
    const keyword = (req.query.keyword || req.query.search || '').trim().toLowerCase()
    const compact = req.query.compact === 'true' || req.query.fields === 'compact'
    const summary = req.query.summary === 'true' || req.query.fields === 'summary'

    const [
      claudeAccountsRaw,
      claudeConsoleAccountsRaw,
      geminiAccountsRaw,
      openaiAccountsRaw,
      openaiResponsesAccountsRaw,
      azureOpenaiAccountsRaw,
      bedrockResult,
      droidAccountsRaw,
      ccrAccountsRaw,
      accountGroups
    ] = await Promise.all([
      claudeAccountService.getAllAccounts().catch((e) => {
        logger.warn('⚠️ Aggregator: failed to fetch claude accounts:', e.message)
        return []
      }),
      claudeConsoleAccountService.getAllAccounts().catch((e) => {
        logger.warn('⚠️ Aggregator: failed to fetch claude-console accounts:', e.message)
        return []
      }),
      geminiAccountService.getAllAccounts().catch((e) => {
        logger.warn('⚠️ Aggregator: failed to fetch gemini accounts:', e.message)
        return []
      }),
      openaiAccountService.getAllAccounts().catch((e) => {
        logger.warn('⚠️ Aggregator: failed to fetch openai accounts:', e.message)
        return []
      }),
      openaiResponsesAccountService.getAllAccounts().catch((e) => {
        logger.warn('⚠️ Aggregator: failed to fetch openai-responses accounts:', e.message)
        return []
      }),
      azureOpenaiAccountService.getAllAccounts().catch((e) => {
        logger.warn('⚠️ Aggregator: failed to fetch azure-openai accounts:', e.message)
        return []
      }),
      bedrockAccountService.getAllAccounts().catch((e) => {
        logger.warn('⚠️ Aggregator: failed to fetch bedrock accounts:', e.message)
        return { success: true, data: [] }
      }),
      droidAccountService.getAllAccounts().catch((e) => {
        logger.warn('⚠️ Aggregator: failed to fetch droid accounts:', e.message)
        return []
      }),
      ccrAccountService.getAllAccounts().catch((e) => {
        logger.warn('⚠️ Aggregator: failed to fetch ccr accounts:', e.message)
        return []
      }),
      accountGroupService.getAllGroups().catch((e) => {
        logger.warn('⚠️ Aggregator: failed to fetch account groups:', e.message)
        return []
      })
    ])

    let allApiKeys = []
    if (!summary) {
      try {
        allApiKeys = await redis.getAllApiKeys()
      } catch (e) {
        logger.warn('⚠️ Aggregator: failed to fetch all API keys for bound-count:', e.message)
      }
    }

    const buildCountMaps = (field) => {
      const direct = new Map()
      const group = new Map()
      for (const k of allApiKeys) {
        const v = k[field]
        if (!v || typeof v !== 'string') {
          continue
        }
        if (v.startsWith('group:')) {
          const gid = v.substring(6)
          group.set(gid, (group.get(gid) || 0) + 1)
        } else {
          direct.set(v, (direct.get(v) || 0) + 1)
        }
      }
      return { direct, group }
    }
    const countsClaude = buildCountMaps('claudeAccountId')
    const countsClaudeConsole = buildCountMaps('claudeConsoleAccountId')
    const countsGemini = buildCountMaps('geminiAccountId')
    const countsAzureOpenai = buildCountMaps('azureOpenaiAccountId')
    const countsBedrock = buildCountMaps('bedrockAccountId')
    const countsDroid = buildCountMaps('droidAccountId')

    const openaiDirect = new Map()
    const openaiResponses = new Map()
    const openaiGroup = new Map()
    const openaiResponsesGroup = new Map()
    for (const k of allApiKeys) {
      const v = k.openaiAccountId
      if (!v || typeof v !== 'string') {
        continue
      }
      if (v.startsWith('responses:')) {
        const idOrGroup = v.substring('responses:'.length)
        if (idOrGroup.startsWith('group:')) {
          const gid = idOrGroup.substring(6)
          openaiResponsesGroup.set(gid, (openaiResponsesGroup.get(gid) || 0) + 1)
        } else {
          openaiResponses.set(idOrGroup, (openaiResponses.get(idOrGroup) || 0) + 1)
        }
      } else if (v.startsWith('group:')) {
        const gid = v.substring(6)
        openaiGroup.set(gid, (openaiGroup.get(gid) || 0) + 1)
      } else {
        openaiDirect.set(v, (openaiDirect.get(v) || 0) + 1)
      }
    }

    const bedrockAccountsRaw = Array.isArray(bedrockResult)
      ? bedrockResult
      : bedrockResult?.data || []

    const page = parseInt(req.query.page, 10)
    const pageSize = parseInt(req.query.pageSize, 10)
    const useServerPaging =
      Number.isFinite(page) && Number.isFinite(pageSize) && page > 0 && pageSize > 0

    if (useServerPaging) {
      const normalizeBase = (acc) => ({
        ...acc,
        schedulable: acc.schedulable === 'true' || acc.schedulable === true,
        isActive:
          acc.isActive === 'true' || acc.isActive === true || acc.isActive === undefined
            ? acc.isActive
            : Boolean(acc.isActive)
      })
      const flatAll = []
      const pushAll = (arr, platform) => {
        ;(arr || []).forEach((acc) => flatAll.push({ ...normalizeBase(acc), platform }))
      }
      pushAll(claudeAccountsRaw, 'claude')
      pushAll(claudeConsoleAccountsRaw, 'claude-console')
      pushAll(geminiAccountsRaw, 'gemini')
      pushAll(openaiAccountsRaw, 'openai')
      pushAll(openaiResponsesAccountsRaw, 'openai-responses')
      pushAll(azureOpenaiAccountsRaw, 'azure_openai')
      pushAll(bedrockAccountsRaw, 'bedrock')
      pushAll(droidAccountsRaw, 'droid')
      pushAll(ccrAccountsRaw, 'ccr')

      const matchKeywordBase = (acc) => {
        if (!keyword) {
          return true
        }
        const fields = [
          acc.name,
          acc.email,
          acc.accountName,
          acc.owner,
          acc.ownerName,
          acc.ownerDisplayName,
          acc.displayName,
          acc.username,
          acc.identifier,
          acc.alias,
          acc.title,
          acc.label,
          acc.id
        ]
        return fields
          .filter((v) => typeof v === 'string')
          .map((v) => v.toLowerCase())
          .some((v) => v.includes(keyword))
      }
      let candidates = flatAll.filter((a) =>
        platformFilter ? a.platform === platformFilter : true
      )
      candidates = candidates.filter(matchKeywordBase)
      if (groupFilter) {
        if (groupFilter === 'ungrouped') {
          const groupsOfPlatform = (accountGroups || []).filter(
            (g) => !platformFilter || g.platform === platformFilter
          )
          const memberSet = new Set()
          for (const g of groupsOfPlatform) {
            try {
              const members = await accountGroupService.getGroupMembers(g.id)
              members.forEach((m) => memberSet.add(m.id || m))
            } catch (_e) {
              logger.debug('accounts/aggregated: failed to get group members (fast path)', {
                groupId: g && g.id
              })
            }
          }
          candidates = candidates.filter((a) => !memberSet.has(a.id))
        } else {
          try {
            const members = await accountGroupService.getGroupMembers(groupFilter)
            const memberSet = new Set(members.map((m) => m.id || m))
            candidates = candidates.filter((a) => memberSet.has(a.id))
          } catch (_e) {
            candidates = []
          }
        }
      }
      const total = candidates.length
      const start = (page - 1) * pageSize
      const end = Math.min(start + pageSize, total)
      const pageItems = start >= 0 && start < end ? candidates.slice(start, end) : []
      const items = await Promise.all(
        pageItems.map(async (acc) => {
          let usage = {
            daily: { requests: 0, tokens: 0, allTokens: 0, cost: 0 },
            total: { requests: 0, tokens: 0, allTokens: 0 },
            monthly: { requests: 0, tokens: 0, allTokens: 0 },
            averages: { rpm: 0, tpm: 0, dailyRequests: 0, dailyTokens: 0 }
          }
          try {
            const type = acc.platform === 'droid' ? 'droid' : 'openai'
            const stats = await redis.getAccountUsageStats(acc.id, type)
            usage = {
              daily: stats.daily || usage.daily,
              total: stats.total || usage.total,
              monthly: stats.monthly || usage.monthly,
              averages: stats.averages || usage.averages
            }
          } catch (_e) {
            logger.debug('accounts/aggregated: failed to get usage stats (fast path)', {
              accountId: acc && acc.id,
              platform: acc && acc.platform
            })
          }
          let groupInfos = []
          try {
            groupInfos = (await accountGroupService.getAccountGroups(acc.id)) || []
          } catch (_e) {
            groupInfos = []
          }
          const groupIds = Array.isArray(groupInfos)
            ? groupInfos.map((g) => g && g.id).filter(Boolean)
            : []
          let boundApiKeysCount = 0
          switch (acc.platform) {
            case 'claude': {
              const direct = countsClaude.direct.get(acc.id) || 0
              const via = groupIds.reduce((s, gid) => s + (countsClaude.group.get(gid) || 0), 0)
              boundApiKeysCount = direct + via
              break
            }
            case 'claude-console': {
              const direct = countsClaudeConsole.direct.get(acc.id) || 0
              const via = groupIds.reduce(
                (s, gid) => s + (countsClaudeConsole.group.get(gid) || 0),
                0
              )
              boundApiKeysCount = direct + via
              break
            }
            case 'gemini': {
              const direct = countsGemini.direct.get(acc.id) || 0
              const via = groupIds.reduce((s, gid) => s + (countsGemini.group.get(gid) || 0), 0)
              boundApiKeysCount = direct + via
              break
            }
            case 'openai': {
              const direct = openaiDirect.get(acc.id) || 0
              const via = groupIds.reduce((s, gid) => s + (openaiGroup.get(gid) || 0), 0)
              boundApiKeysCount = direct + via
              break
            }
            case 'openai-responses': {
              const direct = openaiResponses.get(acc.id) || 0
              const via = groupIds.reduce((s, gid) => s + (openaiResponsesGroup.get(gid) || 0), 0)
              boundApiKeysCount = direct + via
              break
            }
            case 'azure_openai': {
              const direct = countsAzureOpenai.direct.get(acc.id) || 0
              const via = groupIds.reduce(
                (s, gid) => s + (countsAzureOpenai.group.get(gid) || 0),
                0
              )
              boundApiKeysCount = direct + via
              break
            }
            case 'bedrock': {
              const direct = countsBedrock.direct.get(acc.id) || 0
              const via = groupIds.reduce((s, gid) => s + (countsBedrock.group.get(gid) || 0), 0)
              boundApiKeysCount = direct + via
              break
            }
            case 'droid': {
              const direct = countsDroid.direct.get(acc.id) || 0
              const via = groupIds.reduce((s, gid) => s + (countsDroid.group.get(gid) || 0), 0)
              boundApiKeysCount = direct + via
              break
            }
            default:
              boundApiKeysCount = 0
          }
          return { ...acc, usage, groupInfos, boundApiKeysCount }
        })
      )
      return res.json({
        success: true,
        data: { accountGroups, pagination: { page, pageSize, total }, items }
      })
    }

    const enrich = compact
      ? async (list, platformName = '') =>
          Promise.all(
            (list || []).map(async (acc) => {
              const boundCount = (() => {
                switch (platformName) {
                  case 'claude':
                    return countsClaude.direct.get(acc.id) || 0
                  case 'claude-console':
                    return countsClaudeConsole.direct.get(acc.id) || 0
                  case 'gemini':
                    return countsGemini.direct.get(acc.id) || 0
                  case 'openai':
                    return openaiDirect.get(acc.id) || 0
                  case 'openai-responses':
                    return openaiResponses.get(acc.id) || 0
                  case 'azure_openai':
                    return countsAzureOpenai.direct.get(acc.id) || 0
                  case 'bedrock':
                    return countsBedrock.direct.get(acc.id) || 0
                  case 'droid':
                    return countsDroid.direct.get(acc.id) || 0
                  default:
                    return 0
                }
              })()
              return {
                ...acc,
                schedulable: acc.schedulable === 'true' || acc.schedulable === true,
                isActive:
                  acc.isActive === 'true' || acc.isActive === true || acc.isActive === undefined
                    ? acc.isActive
                    : Boolean(acc.isActive),
                boundApiKeysCount: boundCount
              }
            })
          )
      : async (list, usageType = null, platformName = '') =>
          Promise.all(
            (list || []).map(async (acc) => {
              const groupInfos = []
              try {
                const infos = (await accountGroupService.getAccountGroups(acc.id)) || []
                if (Array.isArray(infos)) {
                  infos.forEach((g) => g && groupInfos.push(g))
                }
              } catch (e) {
                logger.debug('Aggregator enrich groupInfos failed', {
                  accountId: acc.id,
                  error: e?.message || String(e)
                })
              }
              let usage = {
                daily: { requests: 0, tokens: 0, allTokens: 0, cost: 0 },
                total: { requests: 0, tokens: 0, allTokens: 0 },
                monthly: { requests: 0, tokens: 0, allTokens: 0 },
                averages: { rpm: 0, tpm: 0, dailyRequests: 0, dailyTokens: 0 }
              }
              try {
                const stats = await redis.getAccountUsageStats(acc.id, usageType)
                usage = {
                  daily: stats.daily || usage.daily,
                  total: stats.total || usage.total,
                  monthly: stats.monthly || usage.monthly,
                  averages: stats.averages || usage.averages
                }
              } catch (e) {
                logger.debug('Aggregator enrich usage failed', {
                  accountId: acc.id,
                  error: e?.message || String(e)
                })
              }
              const groupIds = Array.isArray(groupInfos)
                ? groupInfos.map((g) => g && g.id).filter(Boolean)
                : []
              const boundCount = (() => {
                switch (platformName) {
                  case 'claude': {
                    const direct = countsClaude.direct.get(acc.id) || 0
                    const viaGroups = groupIds.reduce(
                      (s, gid) => s + (countsClaude.group.get(gid) || 0),
                      0
                    )
                    return direct + viaGroups
                  }
                  case 'claude-console': {
                    const direct = countsClaudeConsole.direct.get(acc.id) || 0
                    const viaGroups = groupIds.reduce(
                      (s, gid) => s + (countsClaudeConsole.group.get(gid) || 0),
                      0
                    )
                    return direct + viaGroups
                  }
                  case 'gemini': {
                    const direct = countsGemini.direct.get(acc.id) || 0
                    const viaGroups = groupIds.reduce(
                      (s, gid) => s + (countsGemini.group.get(gid) || 0),
                      0
                    )
                    return direct + viaGroups
                  }
                  case 'openai': {
                    const direct = openaiDirect.get(acc.id) || 0
                    const viaGroups = groupIds.reduce(
                      (s, gid) => s + (openaiGroup.get(gid) || 0),
                      0
                    )
                    return direct + viaGroups
                  }
                  case 'openai-responses': {
                    const direct = openaiResponses.get(acc.id) || 0
                    const viaGroups = groupIds.reduce(
                      (s, gid) => s + (openaiResponsesGroup.get(gid) || 0),
                      0
                    )
                    return direct + viaGroups
                  }
                  case 'azure_openai': {
                    const direct = countsAzureOpenai.direct.get(acc.id) || 0
                    const viaGroups = groupIds.reduce(
                      (s, gid) => s + (countsAzureOpenai.group.get(gid) || 0),
                      0
                    )
                    return direct + viaGroups
                  }
                  case 'bedrock': {
                    const direct = countsBedrock.direct.get(acc.id) || 0
                    const viaGroups = groupIds.reduce(
                      (s, gid) => s + (countsBedrock.group.get(gid) || 0),
                      0
                    )
                    return direct + viaGroups
                  }
                  case 'droid': {
                    const direct = countsDroid.direct.get(acc.id) || 0
                    const viaGroups = groupIds.reduce(
                      (s, gid) => s + (countsDroid.group.get(gid) || 0),
                      0
                    )
                    return direct + viaGroups
                  }
                  default:
                    return 0
                }
              })()
              return {
                ...acc,
                schedulable: acc.schedulable === 'true' || acc.schedulable === true,
                isActive:
                  acc.isActive === 'true' || acc.isActive === true || acc.isActive === undefined
                    ? acc.isActive
                    : Boolean(acc.isActive),
                groupInfos,
                usage,
                boundApiKeysCount: boundCount
              }
            })
          )

    const bedrockAccountsRawNorm = Array.isArray(bedrockAccountsRaw) ? bedrockAccountsRaw : []
    const [
      claudeAccounts,
      claudeConsoleAccounts,
      geminiAccounts,
      openaiAccounts,
      openaiResponsesAccounts,
      azureOpenaiAccounts,
      bedrockAccounts,
      droidAccounts,
      ccrAccounts
    ] = await Promise.all([
      enrich(claudeAccountsRaw, compact ? 'claude' : 'openai', 'claude'),
      enrich(claudeConsoleAccountsRaw, compact ? 'claude-console' : 'openai', 'claude-console'),
      enrich(geminiAccountsRaw, compact ? 'gemini' : 'openai', 'gemini'),
      enrich(openaiAccountsRaw, 'openai', 'openai'),
      enrich(openaiResponsesAccountsRaw, 'openai-responses', 'openai-responses'),
      enrich(azureOpenaiAccountsRaw, compact ? 'azure_openai' : 'openai', 'azure_openai'),
      enrich(bedrockAccountsRawNorm, compact ? 'bedrock' : 'openai', 'bedrock'),
      enrich(droidAccountsRaw, 'droid', 'droid'),
      enrich(ccrAccountsRaw, null, 'ccr')
    ])

    const matchesKeyword = (acc) => {
      if (!keyword) {
        return true
      }
      try {
        const values = new Set()
        const push = (v) => {
          if (typeof v === 'string') {
            const t = v.trim()
            if (t) {
              values.add(t.toLowerCase())
            }
          }
        }
        const base = [
          acc.name,
          acc.email,
          acc.accountName,
          acc.owner,
          acc.ownerName,
          acc.ownerDisplayName,
          acc.displayName,
          acc.username,
          acc.identifier,
          acc.alias,
          acc.title,
          acc.label,
          acc.id
        ]
        base.forEach(push)
        if (Array.isArray(acc.groupInfos)) {
          acc.groupInfos.forEach((g) => push(g && g.name))
        }
        Object.entries(acc || {}).forEach(([k, v]) => {
          if (typeof v === 'string') {
            const lk = k.toLowerCase()
            if (lk.includes('name') || lk.includes('email')) {
              push(v)
            }
          }
        })
        for (const v of values) {
          if (v.includes(keyword)) {
            return true
          }
        }
        return false
      } catch {
        return false
      }
    }
    const matchesGroup = (acc) => {
      if (compact) {
        return true
      }
      if (!groupFilter) {
        return true
      }
      if (groupFilter === 'ungrouped') {
        return !acc.groupInfos || acc.groupInfos.length === 0
      }
      return Array.isArray(acc.groupInfos) && acc.groupInfos.some((g) => g && g.id === groupFilter)
    }
    const applyFilters = (list) =>
      (list || []).filter((acc) => matchesGroup(acc) && matchesKeyword(acc))

    let out = {
      claudeAccounts,
      claudeConsoleAccounts,
      geminiAccounts,
      openaiAccounts,
      openaiResponsesAccounts,
      azureOpenaiAccounts,
      bedrockAccounts,
      droidAccounts,
      ccrAccounts,
      accountGroups
    }
    out.claudeAccounts = applyFilters(out.claudeAccounts)
    out.claudeConsoleAccounts = applyFilters(out.claudeConsoleAccounts)
    out.geminiAccounts = applyFilters(out.geminiAccounts)
    out.openaiAccounts = applyFilters(out.openaiAccounts)
    out.openaiResponsesAccounts = applyFilters(out.openaiResponsesAccounts)
    out.azureOpenaiAccounts = applyFilters(out.azureOpenaiAccounts)
    out.bedrockAccounts = applyFilters(out.bedrockAccounts)
    out.droidAccounts = applyFilters(out.droidAccounts)
    out.ccrAccounts = applyFilters(out.ccrAccounts)

    if (platformFilter && platformFilter !== 'all') {
      const keep = platformFilter
      const empty = []
      out = {
        claudeAccounts: keep === 'claude' ? out.claudeAccounts : empty,
        claudeConsoleAccounts: keep === 'claude-console' ? out.claudeConsoleAccounts : empty,
        geminiAccounts: keep === 'gemini' ? out.geminiAccounts : empty,
        openaiAccounts: keep === 'openai' ? out.openaiAccounts : empty,
        openaiResponsesAccounts: keep === 'openai-responses' ? out.openaiResponsesAccounts : empty,
        azureOpenaiAccounts: keep === 'azure_openai' ? out.azureOpenaiAccounts : empty,
        bedrockAccounts: keep === 'bedrock' ? out.bedrockAccounts : empty,
        droidAccounts: keep === 'droid' ? out.droidAccounts : empty,
        ccrAccounts: keep === 'ccr' ? out.ccrAccounts : empty,
        accountGroups: out.accountGroups
      }
    }

    if (summary) {
      const pick = (o) => ({
        id: o.id,
        name: o.name,
        email: o.email,
        status: o.status,
        isActive:
          o.isActive === 'true' || o.isActive === true || o.isActive === undefined
            ? o.isActive
            : Boolean(o.isActive),
        accountType: o.accountType || 'shared',
        createdAt: o.createdAt,
        updatedAt: o.updatedAt,
        schedulable: o.schedulable === 'true' || o.schedulable === true,
        priority:
          typeof o.priority === 'number'
            ? o.priority
            : Number.isFinite(parseInt(o.priority))
              ? parseInt(o.priority)
              : undefined
      })
      out.claudeAccounts = (out.claudeAccounts || []).map(pick)
      out.claudeConsoleAccounts = (out.claudeConsoleAccounts || []).map(pick)
      out.geminiAccounts = (out.geminiAccounts || []).map(pick)
      out.openaiAccounts = (out.openaiAccounts || []).map(pick)
      out.openaiResponsesAccounts = (out.openaiResponsesAccounts || []).map(pick)
      out.azureOpenaiAccounts = (out.azureOpenaiAccounts || []).map(pick)
      out.bedrockAccounts = (out.bedrockAccounts || []).map(pick)
      out.droidAccounts = (out.droidAccounts || []).map(pick)
      out.ccrAccounts = (out.ccrAccounts || []).map(pick)
      if (Array.isArray(out.accountGroups)) {
        out.accountGroups = out.accountGroups.map((g) => ({
          id: g.id,
          name: g.name,
          platform: g.platform,
          memberCount: g.memberCount
        }))
      }
    }

    const pageLegacy = parseInt(req.query.page, 10)
    const pageSizeLegacy = parseInt(req.query.pageSize, 10)
    let extra = {}
    if (
      Number.isFinite(pageLegacy) &&
      Number.isFinite(pageSizeLegacy) &&
      pageLegacy > 0 &&
      pageSizeLegacy > 0
    ) {
      const all = []
      const pushAll = (arr, platform) =>
        (arr || []).forEach((acc) => all.push({ ...acc, platform }))
      pushAll(out.claudeAccounts, 'claude')
      pushAll(out.claudeConsoleAccounts, 'claude-console')
      pushAll(out.geminiAccounts, 'gemini')
      pushAll(out.openaiAccounts, 'openai')
      pushAll(out.openaiResponsesAccounts, 'openai-responses')
      pushAll(out.azureOpenaiAccounts, 'azure_openai')
      pushAll(out.bedrockAccounts, 'bedrock')
      pushAll(out.droidAccounts, 'droid')
      pushAll(out.ccrAccounts, 'ccr')
      const total = all.length
      const start = (pageLegacy - 1) * pageSizeLegacy
      const end = Math.min(start + pageSizeLegacy, total)
      const items = start >= 0 && start < end ? all.slice(start, end) : []
      extra = { pagination: { page: pageLegacy, pageSize: pageSizeLegacy, total }, items }
    }

    return res.json({ success: true, data: { ...out, ...extra } })
  } catch (error) {
    logger.error('❌ Failed to get aggregated accounts:', error)
    return res
      .status(500)
      .json({ error: 'Failed to get aggregated accounts', message: error.message })
  }
})

module.exports = router
