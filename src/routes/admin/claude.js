const express = require('express')
const router = express.Router()

const { authenticateAdmin } = require('../../middleware/auth')
const logger = require('../../utils/logger')
const redis = require('../../models/redis')
const oauthHelper = require('../../utils/oauthHelper')
const CostCalculator = require('../../utils/costCalculator')
const webhookNotifier = require('../../utils/webhookNotifier')

const claudeAccountService = require('../../services/claudeAccountService')
const accountGroupService = require('../../services/accountGroupService')

// 生成OAuth授权URL
router.post('/claude-accounts/generate-auth-url', authenticateAdmin, async (req, res) => {
  try {
    const { proxy } = req.body
    const oauthParams = await oauthHelper.generateOAuthParams()
    const sessionId = require('crypto').randomUUID()
    await redis.setOAuthSession(sessionId, {
      codeVerifier: oauthParams.codeVerifier,
      state: oauthParams.state,
      codeChallenge: oauthParams.codeChallenge,
      proxy: proxy || null,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString()
    })
    logger.success('🔗 Generated OAuth authorization URL with proxy support')
    return res.json({
      success: true,
      data: {
        authUrl: oauthParams.authUrl,
        sessionId,
        instructions: [
          '1. 复制上面的链接到浏览器中打开',
          '2. 登录您的 Anthropic 账户',
          '3. 同意应用权限',
          '4. 复制浏览器地址栏中的完整 URL',
          '5. 在添加账户表单中粘贴完整的回调 URL 和授权码'
        ]
      }
    })
  } catch (error) {
    logger.error('❌ Failed to generate OAuth URL:', error)
    return res.status(500).json({ error: 'Failed to generate OAuth URL', message: error.message })
  }
})

// 验证授权码并获取token
router.post('/claude-accounts/exchange-code', authenticateAdmin, async (req, res) => {
  try {
    const { sessionId, authorizationCode, callbackUrl } = req.body
    if (!sessionId || (!authorizationCode && !callbackUrl)) {
      return res
        .status(400)
        .json({ error: 'Session ID and authorization code (or callback URL) are required' })
    }
    const oauthSession = await redis.getOAuthSession(sessionId)
    if (!oauthSession) {
      return res.status(400).json({ error: 'Invalid or expired OAuth session' })
    }
    if (new Date() > new Date(oauthSession.expiresAt)) {
      await redis.deleteOAuthSession(sessionId)
      return res
        .status(400)
        .json({ error: 'OAuth session has expired, please generate a new authorization URL' })
    }
    let finalAuthCode
    const inputValue = callbackUrl || authorizationCode
    try {
      finalAuthCode = oauthHelper.parseCallbackUrl(inputValue)
    } catch (parseError) {
      return res
        .status(400)
        .json({ error: 'Failed to parse authorization input', message: parseError.message })
    }
    const tokenData = await oauthHelper.exchangeCodeForTokens(
      finalAuthCode,
      oauthSession.codeVerifier,
      oauthSession.state,
      oauthSession.proxy
    )
    await redis.deleteOAuthSession(sessionId)
    logger.success('🎉 Successfully exchanged authorization code for tokens')
    return res.json({ success: true, data: { claudeAiOauth: tokenData } })
  } catch (error) {
    logger.error('❌ Failed to exchange authorization code:', {
      error: error.message,
      sessionId: req.body.sessionId,
      codeLength: req.body.callbackUrl
        ? req.body.callbackUrl.length
        : req.body.authorizationCode
          ? req.body.authorizationCode.length
          : 0,
      codePrefix: req.body.callbackUrl
        ? `${req.body.callbackUrl.substring(0, 10)}...`
        : req.body.authorizationCode
          ? `${req.body.authorizationCode.substring(0, 10)}...`
          : 'N/A'
    })
    return res
      .status(500)
      .json({ error: 'Failed to exchange authorization code', message: error.message })
  }
})

// 生成Claude setup-token授权URL
router.post('/claude-accounts/generate-setup-token-url', authenticateAdmin, async (req, res) => {
  try {
    const { proxy } = req.body
    const setupTokenParams = await oauthHelper.generateSetupTokenParams()
    const sessionId = require('crypto').randomUUID()
    await redis.setOAuthSession(sessionId, {
      type: 'setup-token',
      codeVerifier: setupTokenParams.codeVerifier,
      state: setupTokenParams.state,
      codeChallenge: setupTokenParams.codeChallenge,
      proxy: proxy || null,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString()
    })
    logger.success('🔗 Generated Setup Token authorization URL with proxy support')
    return res.json({
      success: true,
      data: {
        authUrl: setupTokenParams.authUrl,
        sessionId,
        instructions: [
          '1. 复制上面的链接到浏览器中打开',
          '2. 登录您的 Claude 账户并授权 Claude Code',
          '3. 完成授权后，从返回页面复制 Authorization Code',
          '4. 在添加账户表单中粘贴 Authorization Code'
        ]
      }
    })
  } catch (error) {
    logger.error('❌ Failed to generate Setup Token URL:', error)
    return res
      .status(500)
      .json({ error: 'Failed to generate Setup Token URL', message: error.message })
  }
})

// 验证setup-token授权码并获取token
router.post('/claude-accounts/exchange-setup-token-code', authenticateAdmin, async (req, res) => {
  try {
    const { sessionId, authorizationCode, callbackUrl } = req.body
    if (!sessionId || (!authorizationCode && !callbackUrl)) {
      return res
        .status(400)
        .json({ error: 'Session ID and authorization code (or callback URL) are required' })
    }
    const oauthSession = await redis.getOAuthSession(sessionId)
    if (!oauthSession) {
      return res.status(400).json({ error: 'Invalid or expired OAuth session' })
    }
    if (oauthSession.type !== 'setup-token') {
      return res.status(400).json({ error: 'Invalid session type for setup token exchange' })
    }
    if (new Date() > new Date(oauthSession.expiresAt)) {
      await redis.deleteOAuthSession(sessionId)
      return res
        .status(400)
        .json({ error: 'OAuth session has expired, please generate a new authorization URL' })
    }
    let finalAuthCode
    const inputValue = callbackUrl || authorizationCode
    try {
      finalAuthCode = oauthHelper.parseCallbackUrl(inputValue)
    } catch (parseError) {
      return res
        .status(400)
        .json({ error: 'Failed to parse authorization input', message: parseError.message })
    }
    const tokenData = await oauthHelper.exchangeSetupTokenCode(
      finalAuthCode,
      oauthSession.codeVerifier,
      oauthSession.state,
      oauthSession.proxy
    )
    await redis.deleteOAuthSession(sessionId)
    logger.success('🎉 Successfully exchanged setup token authorization code for tokens')
    return res.json({ success: true, data: { claudeAiOauth: tokenData } })
  } catch (error) {
    logger.error('❌ Failed to exchange setup token authorization code:', {
      error: error.message,
      sessionId: req.body.sessionId,
      codeLength: req.body.callbackUrl
        ? req.body.callbackUrl.length
        : req.body.authorizationCode
          ? req.body.authorizationCode.length
          : 0,
      codePrefix: req.body.callbackUrl
        ? `${req.body.callbackUrl.substring(0, 10)}...`
        : req.body.authorizationCode
          ? `${req.body.authorizationCode.substring(0, 10)}...`
          : 'N/A'
    })
    return res
      .status(500)
      .json({ error: 'Failed to exchange setup token authorization code', message: error.message })
  }
})

// 获取所有Claude账户
router.get('/claude-accounts', authenticateAdmin, async (req, res) => {
  try {
    const { platform, groupId } = req.query
    let accounts = await claudeAccountService.getAllAccounts()
    if (platform && platform !== 'all' && platform !== 'claude') {
      accounts = []
    }
    if (groupId && groupId !== 'all') {
      if (groupId === 'ungrouped') {
        const filteredAccounts = []
        for (const account of accounts) {
          const groups = await accountGroupService.getAccountGroups(account.id)
          if (!groups || groups.length === 0) {
            filteredAccounts.push(account)
          }
        }
        accounts = filteredAccounts
      } else {
        const groupMembers = await accountGroupService.getGroupMembers(groupId)
        accounts = accounts.filter((account) => groupMembers.includes(account.id))
      }
    }
    const accountsWithStats = await Promise.all(
      accounts.map(async (account) => {
        try {
          const usageStats = await redis.getAccountUsageStats(account.id, 'openai')
          const groupInfos = await accountGroupService.getAccountGroups(account.id)
          let sessionWindowUsage = null
          if (account.sessionWindow && account.sessionWindow.hasActiveWindow) {
            const windowUsage = await redis.getAccountSessionWindowUsage(
              account.id,
              account.sessionWindow.windowStart,
              account.sessionWindow.windowEnd
            )
            let totalCost = 0
            const modelCosts = {}
            for (const [modelName, usage] of Object.entries(windowUsage.modelUsage)) {
              const usageData = {
                input_tokens: usage.inputTokens,
                output_tokens: usage.outputTokens,
                cache_creation_input_tokens: usage.cacheCreateTokens,
                cache_read_input_tokens: usage.cacheReadTokens
              }
              logger.debug(`💰 Calculating cost for model ${modelName}:`, JSON.stringify(usageData))
              const costResult = CostCalculator.calculateCost(usageData, modelName)
              logger.debug(`💰 Cost result for ${modelName}: total=${costResult.costs.total}`)
              modelCosts[modelName] = { ...usage, cost: costResult.costs.total }
              totalCost += costResult.costs.total
            }
            sessionWindowUsage = {
              totalTokens: windowUsage.totalAllTokens,
              totalRequests: windowUsage.totalRequests,
              totalCost,
              modelUsage: modelCosts
            }
          }
          return {
            ...account,
            schedulable: account.schedulable === 'true' || account.schedulable === true,
            groupInfos,
            usage: {
              daily: usageStats.daily,
              total: usageStats.total,
              averages: usageStats.averages,
              sessionWindow: sessionWindowUsage
            }
          }
        } catch (statsError) {
          logger.warn(`⚠️ Failed to get usage stats for account ${account.id}:`, statsError.message)
          try {
            const groupInfos = await accountGroupService.getAccountGroups(account.id)
            return {
              ...account,
              groupInfos,
              usage: {
                daily: { tokens: 0, requests: 0, allTokens: 0 },
                total: { tokens: 0, requests: 0, allTokens: 0 },
                averages: { rpm: 0, tpm: 0 },
                sessionWindow: null
              }
            }
          } catch (groupError) {
            logger.warn(
              `⚠️ Failed to get group info for account ${account.id}:`,
              groupError.message
            )
            return {
              ...account,
              groupInfos: [],
              usage: {
                daily: { tokens: 0, requests: 0, allTokens: 0 },
                total: { tokens: 0, requests: 0, allTokens: 0 },
                averages: { rpm: 0, tpm: 0 },
                sessionWindow: null
              }
            }
          }
        }
      })
    )
    return res.json({ success: true, data: accountsWithStats })
  } catch (error) {
    logger.error('❌ Failed to get Claude accounts:', error)
    return res.status(500).json({ error: 'Failed to get Claude accounts', message: error.message })
  }
})

// 批量获取 Claude 账户的 OAuth Usage 数据
router.get('/claude-accounts/usage', authenticateAdmin, async (req, res) => {
  try {
    const accounts = await redis.getAllClaudeAccounts()
    const now = Date.now()
    const usageCacheTtlMs = 300 * 1000
    const usagePromises = accounts.map(async (account) => {
      const scopes = account.scopes && account.scopes.trim() ? account.scopes.split(' ') : []
      const isOAuth = scopes.includes('user:profile') && scopes.includes('user:inference')
      if (
        isOAuth &&
        account.isActive === 'true' &&
        account.accessToken &&
        account.status === 'active'
      ) {
        const cachedUsage = claudeAccountService.buildClaudeUsageSnapshot(account)
        const lastUpdatedAt = account.claudeUsageUpdatedAt
          ? new Date(account.claudeUsageUpdatedAt).getTime()
          : 0
        const isCacheFresh = cachedUsage && lastUpdatedAt && now - lastUpdatedAt < usageCacheTtlMs
        if (isCacheFresh) {
          return { accountId: account.id, claudeUsage: cachedUsage }
        }
        try {
          const usageData = await claudeAccountService.fetchOAuthUsage(account.id)
          if (usageData) {
            await claudeAccountService.updateClaudeUsageSnapshot(account.id, usageData)
          }
          const updatedAccount = await redis.getClaudeAccount(account.id)
          return {
            accountId: account.id,
            claudeUsage: claudeAccountService.buildClaudeUsageSnapshot(updatedAccount)
          }
        } catch (error) {
          logger.debug(`Failed to fetch OAuth usage for ${account.id}:`, error.message)
          return { accountId: account.id, claudeUsage: null }
        }
      }
      return { accountId: account.id, claudeUsage: null }
    })
    const results = await Promise.allSettled(usagePromises)
    const usageMap = {}
    results.forEach((result) => {
      if (result.status === 'fulfilled' && result.value) {
        usageMap[result.value.accountId] = result.value.claudeUsage
      }
    })
    res.json({ success: true, data: usageMap })
  } catch (error) {
    logger.error('❌ Failed to fetch Claude accounts usage:', error)
    res.status(500).json({ error: 'Failed to fetch usage data', message: error.message })
  }
})

// 创建新的Claude账户
router.post('/claude-accounts', authenticateAdmin, async (req, res) => {
  try {
    const {
      name,
      description,
      email,
      password,
      refreshToken,
      claudeAiOauth,
      proxy,
      accountType,
      platform = 'claude',
      priority,
      groupId,
      groupIds,
      autoStopOnWarning,
      useUnifiedUserAgent,
      useUnifiedClientId,
      unifiedClientId
    } = req.body
    if (!name) {
      return res.status(400).json({ error: 'Name is required' })
    }
    if (accountType && !['shared', 'dedicated', 'group'].includes(accountType)) {
      return res
        .status(400)
        .json({ error: 'Invalid account type. Must be "shared", "dedicated" or "group"' })
    }
    if (accountType === 'group' && !groupId && (!groupIds || groupIds.length === 0)) {
      return res
        .status(400)
        .json({ error: 'Group ID or Group IDs are required for group type accounts' })
    }
    if (
      priority !== undefined &&
      (typeof priority !== 'number' || priority < 1 || priority > 100)
    ) {
      return res.status(400).json({ error: 'Priority must be a number between 1 and 100' })
    }
    const newAccount = await claudeAccountService.createAccount({
      name,
      description,
      email,
      password,
      refreshToken,
      claudeAiOauth,
      proxy,
      accountType: accountType || 'shared',
      platform,
      priority: priority || 50,
      autoStopOnWarning: autoStopOnWarning === true,
      useUnifiedUserAgent: useUnifiedUserAgent === true,
      useUnifiedClientId: useUnifiedClientId === true,
      unifiedClientId: unifiedClientId || ''
    })
    if (accountType === 'group') {
      if (groupIds && groupIds.length > 0) {
        await accountGroupService.setAccountGroups(newAccount.id, groupIds, newAccount.platform)
      } else if (groupId) {
        await accountGroupService.addAccountToGroup(newAccount.id, groupId, newAccount.platform)
      }
    }
    logger.success(`🏢 Admin created new Claude account: ${name} (${accountType || 'shared'})`)
    return res.json({ success: true, data: newAccount })
  } catch (error) {
    logger.error('❌ Failed to create Claude account:', error)
    return res
      .status(500)
      .json({ error: 'Failed to create Claude account', message: error.message })
  }
})

// 更新Claude账户
router.put('/claude-accounts/:accountId', authenticateAdmin, async (req, res) => {
  try {
    const { accountId } = req.params
    const updates = req.body
    if (
      updates.priority !== undefined &&
      (typeof updates.priority !== 'number' || updates.priority < 1 || updates.priority > 100)
    ) {
      return res.status(400).json({ error: 'Priority must be a number between 1 and 100' })
    }
    if (updates.accountType && !['shared', 'dedicated', 'group'].includes(updates.accountType)) {
      return res
        .status(400)
        .json({ error: 'Invalid account type. Must be "shared", "dedicated" or "group"' })
    }
    if (
      updates.accountType === 'group' &&
      !updates.groupId &&
      (!updates.groupIds || updates.groupIds.length === 0)
    ) {
      return res
        .status(400)
        .json({ error: 'Group ID or Group IDs are required for group type accounts' })
    }
    const currentAccount = await claudeAccountService.getAccount(accountId)
    if (!currentAccount) {
      return res.status(404).json({ error: 'Account not found' })
    }
    if (updates.accountType !== undefined) {
      if (currentAccount.accountType === 'group') {
        await accountGroupService.removeAccountFromAllGroups(accountId)
      }
      if (updates.accountType === 'group') {
        if (Object.prototype.hasOwnProperty.call(updates, 'groupIds')) {
          if (updates.groupIds && updates.groupIds.length > 0) {
            await accountGroupService.setAccountGroups(accountId, updates.groupIds, 'claude')
          } else {
            await accountGroupService.removeAccountFromAllGroups(accountId)
          }
        } else if (updates.groupId) {
          await accountGroupService.addAccountToGroup(accountId, updates.groupId, 'claude')
        }
      }
    }
    await claudeAccountService.updateAccount(accountId, updates)
    logger.success(`📝 Admin updated Claude account: ${accountId}`)
    return res.json({ success: true, message: 'Claude account updated successfully' })
  } catch (error) {
    logger.error('❌ Failed to update Claude account:', error)
    return res
      .status(500)
      .json({ error: 'Failed to update Claude account', message: error.message })
  }
})

// 删除Claude账户
router.delete('/claude-accounts/:accountId', authenticateAdmin, async (req, res) => {
  try {
    const { accountId } = req.params
    const apiKeyService = require('../../services/apiKeyService')
    const unboundCount = await apiKeyService.unbindAccountFromAllKeys(accountId, 'claude')
    const account = await claudeAccountService.getAccount(accountId)
    if (account && account.accountType === 'group') {
      const groups = await accountGroupService.getAccountGroups(accountId)
      for (const group of groups) {
        await accountGroupService.removeAccountFromGroup(accountId, group.id)
      }
    }
    await claudeAccountService.deleteAccount(accountId)
    let message = 'Claude账号已成功删除'
    if (unboundCount > 0) {
      message += `，${unboundCount} 个 API Key 已切换为共享池模式`
    }
    logger.success(`🗑️ Admin deleted Claude account: ${accountId}, unbound ${unboundCount} keys`)
    return res.json({ success: true, message, unboundKeys: unboundCount })
  } catch (error) {
    logger.error('❌ Failed to delete Claude account:', error)
    return res
      .status(500)
      .json({ error: 'Failed to delete Claude account', message: error.message })
  }
})

// 更新单个Claude账户的Profile信息
router.post('/claude-accounts/:accountId/update-profile', authenticateAdmin, async (req, res) => {
  try {
    const { accountId } = req.params
    const profileInfo = await claudeAccountService.fetchAndUpdateAccountProfile(accountId)
    logger.success(`✅ Updated profile for Claude account: ${accountId}`)
    return res.json({
      success: true,
      message: 'Account profile updated successfully',
      data: profileInfo
    })
  } catch (error) {
    logger.error('❌ Failed to update account profile:', error)
    return res
      .status(500)
      .json({ error: 'Failed to update account profile', message: error.message })
  }
})

// 批量更新所有Claude账户的Profile信息
router.post('/claude-accounts/update-all-profiles', authenticateAdmin, async (req, res) => {
  try {
    const result = await claudeAccountService.updateAllAccountProfiles()
    logger.success('✅ Batch profile update completed')
    return res.json({ success: true, message: 'Batch profile update completed', data: result })
  } catch (error) {
    logger.error('❌ Failed to update all account profiles:', error)
    return res
      .status(500)
      .json({ error: 'Failed to update all account profiles', message: error.message })
  }
})

// 刷新Claude账户token
router.post('/claude-accounts/:accountId/refresh', authenticateAdmin, async (req, res) => {
  try {
    const { accountId } = req.params
    const result = await claudeAccountService.refreshAccountToken(accountId)
    logger.success(`🔄 Admin refreshed token for Claude account: ${accountId}`)
    return res.json({ success: true, data: result })
  } catch (error) {
    logger.error('❌ Failed to refresh Claude account token:', error)
    return res.status(500).json({ error: 'Failed to refresh token', message: error.message })
  }
})

// 重置Claude账户状态（清除所有异常状态）
router.post('/claude-accounts/:accountId/reset-status', authenticateAdmin, async (req, res) => {
  try {
    const { accountId } = req.params
    const result = await claudeAccountService.resetAccountStatus(accountId)
    logger.success(`✅ Admin reset status for Claude account: ${accountId}`)
    return res.json({ success: true, data: result })
  } catch (error) {
    logger.error('❌ Failed to reset Claude account status:', error)
    return res.status(500).json({ error: 'Failed to reset status', message: error.message })
  }
})

// 切换Claude账户调度状态
router.put(
  '/claude-accounts/:accountId/toggle-schedulable',
  authenticateAdmin,
  async (req, res) => {
    try {
      const { accountId } = req.params
      const accounts = await claudeAccountService.getAllAccounts()
      const account = accounts.find((acc) => acc.id === accountId)
      if (!account) {
        return res.status(404).json({ error: 'Account not found' })
      }
      const newSchedulable = !account.schedulable
      await claudeAccountService.updateAccount(accountId, { schedulable: newSchedulable })
      if (!newSchedulable) {
        await webhookNotifier.sendAccountAnomalyNotification({
          accountId: account.id,
          accountName: account.name || account.claudeAiOauth?.email || 'Claude Account',
          platform: 'claude-oauth',
          status: 'disabled',
          errorCode: 'CLAUDE_OAUTH_MANUALLY_DISABLED',
          reason: '账号已被管理员手动禁用调度',
          timestamp: new Date().toISOString()
        })
      }
      logger.success(
        `🔄 Admin toggled Claude account schedulable status: ${accountId} -> ${newSchedulable ? 'schedulable' : 'not schedulable'}`
      )
      return res.json({ success: true, schedulable: newSchedulable })
    } catch (error) {
      logger.error('❌ Failed to toggle Claude account schedulable status:', error)
      return res
        .status(500)
        .json({ error: 'Failed to toggle schedulable status', message: error.message })
    }
  }
)

module.exports = router
