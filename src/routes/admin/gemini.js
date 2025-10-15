const express = require('express')
const router = express.Router()

const { authenticateAdmin } = require('../../middleware/auth')
const logger = require('../../utils/logger')
const redis = require('../../models/redis')
const accountGroupService = require('../../services/accountGroupService')
const geminiAccountService = require('../../services/geminiAccountService')
const webhookNotifier = require('../../utils/webhookNotifier')

// 生成 Gemini OAuth 授权 URL
router.post('/gemini-accounts/generate-auth-url', authenticateAdmin, async (req, res) => {
  try {
    const { state, proxy } = req.body
    const redirectUri = 'https://codeassist.google.com/authcode'
    logger.info(`Generating Gemini OAuth URL with redirect_uri: ${redirectUri}`)
    const {
      authUrl,
      state: authState,
      codeVerifier,
      redirectUri: finalRedirectUri
    } = await geminiAccountService.generateAuthUrl(state, redirectUri, proxy)
    const sessionId = authState
    await redis.setOAuthSession(sessionId, {
      state: authState,
      type: 'gemini',
      redirectUri: finalRedirectUri,
      codeVerifier,
      proxy: proxy || null,
      createdAt: new Date().toISOString()
    })
    logger.info(`Generated Gemini OAuth URL with session: ${sessionId}`)
    return res.json({ success: true, data: { authUrl, sessionId } })
  } catch (error) {
    logger.error('❌ Failed to generate Gemini auth URL:', error)
    return res.status(500).json({ error: 'Failed to generate auth URL', message: error.message })
  }
})

// 轮询 Gemini OAuth 授权状态
router.post('/gemini-accounts/poll-auth-status', authenticateAdmin, async (req, res) => {
  try {
    const { sessionId } = req.body
    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID is required' })
    }
    const result = await geminiAccountService.pollAuthorizationStatus(sessionId)
    if (result.success) {
      logger.success(`✅ Gemini OAuth authorization successful for session: ${sessionId}`)
      return res.json({ success: true, data: { tokens: result.tokens } })
    } else {
      return res.json({ success: false, error: result.error })
    }
  } catch (error) {
    logger.error('❌ Failed to poll Gemini auth status:', error)
    return res.status(500).json({ error: 'Failed to poll auth status', message: error.message })
  }
})

// 交换 Gemini 授权码
router.post('/gemini-accounts/exchange-code', authenticateAdmin, async (req, res) => {
  try {
    const { code, sessionId, proxy: requestProxy } = req.body
    if (!code) {
      return res.status(400).json({ error: 'Authorization code is required' })
    }
    let redirectUri = 'https://codeassist.google.com/authcode'
    let codeVerifier = null
    let proxyConfig = null
    if (sessionId) {
      const sessionData = await redis.getOAuthSession(sessionId)
      if (sessionData) {
        const {
          redirectUri: sessionRedirectUri,
          codeVerifier: sessionCodeVerifier,
          proxy
        } = sessionData
        redirectUri = sessionRedirectUri || redirectUri
        codeVerifier = sessionCodeVerifier
        proxyConfig = proxy
        logger.info(
          `Using session redirect_uri: ${redirectUri}, has codeVerifier: ${!!codeVerifier}, has proxy from session: ${!!proxyConfig}`
        )
      }
    }
    if (requestProxy) {
      proxyConfig = requestProxy
      logger.info(
        `Using proxy from request body: ${proxyConfig ? JSON.stringify(proxyConfig) : 'none'}`
      )
    }
    const tokens = await geminiAccountService.exchangeCodeForTokens(
      code,
      redirectUri,
      codeVerifier,
      proxyConfig
    )
    if (sessionId) {
      await redis.deleteOAuthSession(sessionId)
    }
    logger.success('✅ Successfully exchanged Gemini authorization code')
    return res.json({ success: true, data: { tokens } })
  } catch (error) {
    logger.error('❌ Failed to exchange Gemini authorization code:', error)
    return res.status(500).json({ error: 'Failed to exchange code', message: error.message })
  }
})

// 获取所有 Gemini 账户
router.get('/gemini-accounts', authenticateAdmin, async (req, res) => {
  try {
    const { platform, groupId } = req.query
    let accounts = await geminiAccountService.getAllAccounts()
    if (platform && platform !== 'all' && platform !== 'gemini') {
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
          return {
            ...account,
            groupInfos,
            usage: {
              daily: usageStats.daily,
              total: usageStats.total,
              averages: usageStats.averages
            }
          }
        } catch (statsError) {
          logger.warn(
            `⚠️ Failed to get usage stats for Gemini account ${account.id}:`,
            statsError.message
          )
          try {
            const groupInfos = await accountGroupService.getAccountGroups(account.id)
            return {
              ...account,
              groupInfos,
              usage: {
                daily: { tokens: 0, requests: 0, allTokens: 0 },
                total: { tokens: 0, requests: 0, allTokens: 0 },
                averages: { rpm: 0, tpm: 0 }
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
                averages: { rpm: 0, tpm: 0 }
              }
            }
          }
        }
      })
    )
    return res.json({ success: true, data: accountsWithStats })
  } catch (error) {
    logger.error('❌ Failed to get Gemini accounts:', error)
    return res.status(500).json({ error: 'Failed to get accounts', message: error.message })
  }
})

// 创建新的 Gemini 账户
router.post('/gemini-accounts', authenticateAdmin, async (req, res) => {
  try {
    const accountData = req.body
    if (!accountData.name) {
      return res.status(400).json({ error: 'Account name is required' })
    }
    if (
      accountData.accountType &&
      !['shared', 'dedicated', 'group'].includes(accountData.accountType)
    ) {
      return res
        .status(400)
        .json({ error: 'Invalid account type. Must be "shared", "dedicated" or "group"' })
    }
    if (accountData.accountType === 'group' && !accountData.groupId) {
      return res.status(400).json({ error: 'Group ID is required for group type accounts' })
    }
    const newAccount = await geminiAccountService.createAccount(accountData)
    if (accountData.accountType === 'group' && accountData.groupId) {
      await accountGroupService.addAccountToGroup(newAccount.id, accountData.groupId, 'gemini')
    }
    logger.success(`🏢 Admin created new Gemini account: ${accountData.name}`)
    return res.json({ success: true, data: newAccount })
  } catch (error) {
    logger.error('❌ Failed to create Gemini account:', error)
    return res.status(500).json({ error: 'Failed to create account', message: error.message })
  }
})

// 更新 Gemini 账户
router.put('/gemini-accounts/:accountId', authenticateAdmin, async (req, res) => {
  try {
    const { accountId } = req.params
    const updates = req.body
    if (updates.accountType && !['shared', 'dedicated', 'group'].includes(updates.accountType)) {
      return res
        .status(400)
        .json({ error: 'Invalid account type. Must be "shared", "dedicated" or "group"' })
    }
    if (updates.accountType === 'group' && !updates.groupId) {
      return res.status(400).json({ error: 'Group ID is required for group type accounts' })
    }
    const currentAccount = await geminiAccountService.getAccount(accountId)
    if (!currentAccount) {
      return res.status(404).json({ error: 'Account not found' })
    }
    if (updates.accountType !== undefined) {
      if (currentAccount.accountType === 'group') {
        const oldGroups = await accountGroupService.getAccountGroups(accountId)
        for (const oldGroup of oldGroups) {
          await accountGroupService.removeAccountFromGroup(accountId, oldGroup.id)
        }
      }
      if (updates.accountType === 'group') {
        if (Object.prototype.hasOwnProperty.call(updates, 'groupIds')) {
          if (updates.groupIds && updates.groupIds.length > 0) {
            await accountGroupService.setAccountGroups(accountId, updates.groupIds, 'gemini')
          } else {
            await accountGroupService.removeAccountFromAllGroups(accountId)
          }
        } else if (updates.groupId) {
          await accountGroupService.addAccountToGroup(accountId, updates.groupId, 'gemini')
        }
      }
    }
    const updatedAccount = await geminiAccountService.updateAccount(accountId, updates)
    logger.success(`📝 Admin updated Gemini account: ${accountId}`)
    return res.json({ success: true, data: updatedAccount })
  } catch (error) {
    logger.error('❌ Failed to update Gemini account:', error)
    return res.status(500).json({ error: 'Failed to update account', message: error.message })
  }
})

// 删除 Gemini 账户
router.delete('/gemini-accounts/:accountId', authenticateAdmin, async (req, res) => {
  try {
    const { accountId } = req.params
    const apiKeyService = require('../../services/apiKeyService')
    const unboundCount = await apiKeyService.unbindAccountFromAllKeys(accountId, 'gemini')
    const account = await geminiAccountService.getAccount(accountId)
    if (account && account.accountType === 'group') {
      const groups = await accountGroupService.getAccountGroups(accountId)
      for (const group of groups) {
        await accountGroupService.removeAccountFromGroup(accountId, group.id)
      }
    }
    await geminiAccountService.deleteAccount(accountId)
    let message = 'Gemini账号已成功删除'
    if (unboundCount > 0) {
      message += `，${unboundCount} 个 API Key 已切换为共享池模式`
    }
    logger.success(`🗑️ Admin deleted Gemini account: ${accountId}, unbound ${unboundCount} keys`)
    return res.json({ success: true, message, unboundKeys: unboundCount })
  } catch (error) {
    logger.error('❌ Failed to delete Gemini account:', error)
    return res.status(500).json({ error: 'Failed to delete account', message: error.message })
  }
})

// 刷新 Gemini 账户 token
router.post('/gemini-accounts/:accountId/refresh', authenticateAdmin, async (req, res) => {
  try {
    const { accountId } = req.params
    const result = await geminiAccountService.refreshAccountToken(accountId)
    logger.success(`🔄 Admin refreshed token for Gemini account: ${accountId}`)
    return res.json({ success: true, data: result })
  } catch (error) {
    logger.error('❌ Failed to refresh Gemini account token:', error)
    return res.status(500).json({ error: 'Failed to refresh token', message: error.message })
  }
})

// 切换 Gemini 账户调度状态
router.put(
  '/gemini-accounts/:accountId/toggle-schedulable',
  authenticateAdmin,
  async (req, res) => {
    try {
      const { accountId } = req.params
      const account = await geminiAccountService.getAccount(accountId)
      if (!account) {
        return res.status(404).json({ error: 'Account not found' })
      }
      const newSchedulable = !account.schedulable
      await geminiAccountService.updateAccount(accountId, { schedulable: String(newSchedulable) })
      const updatedAccount = await geminiAccountService.getAccount(accountId)
      const actualSchedulable = updatedAccount ? updatedAccount.schedulable : newSchedulable
      if (!actualSchedulable) {
        await webhookNotifier.sendAccountAnomalyNotification({
          accountId: account.id,
          accountName: account.accountName || 'Gemini Account',
          platform: 'gemini',
          status: 'disabled',
          errorCode: 'GEMINI_MANUALLY_DISABLED',
          reason: '账号已被管理员手动禁用调度',
          timestamp: new Date().toISOString()
        })
      }
      logger.success(
        `🔄 Admin toggled Gemini account schedulable status: ${accountId} -> ${actualSchedulable ? 'schedulable' : 'not schedulable'}`
      )
      return res.json({ success: true, schedulable: actualSchedulable })
    } catch (error) {
      logger.error('❌ Failed to toggle Gemini account schedulable status:', error)
      return res
        .status(500)
        .json({ error: 'Failed to toggle schedulable status', message: error.message })
    }
  }
)

module.exports = router
