const express = require('express')
const router = express.Router()

const { authenticateAdmin } = require('../../middleware/auth')
const logger = require('../../utils/logger')
const redis = require('../../models/redis')
const accountGroupService = require('../../services/accountGroupService')
const claudeConsoleAccountService = require('../../services/claudeConsoleAccountService')
const apiKeyService = require('../../services/apiKeyService')
const webhookNotifier = require('../../utils/webhookNotifier')

// 获取所有Claude Console账户
router.get('/claude-console-accounts', authenticateAdmin, async (req, res) => {
  try {
    const { platform, groupId } = req.query
    let accounts = await claudeConsoleAccountService.getAllAccounts()
    if (platform && platform !== 'all' && platform !== 'claude-console') {
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
            schedulable: account.schedulable === 'true' || account.schedulable === true,
            groupInfos,
            usage: {
              daily: usageStats.daily,
              total: usageStats.total,
              averages: usageStats.averages
            }
          }
        } catch (statsError) {
          logger.warn(
            `⚠️ Failed to get usage stats for Claude Console account ${account.id}:`,
            statsError.message
          )
          try {
            const groupInfos = await accountGroupService.getAccountGroups(account.id)
            return {
              ...account,
              schedulable: account.schedulable === 'true' || account.schedulable === true,
              groupInfos,
              usage: {
                daily: { tokens: 0, requests: 0, allTokens: 0 },
                total: { tokens: 0, requests: 0, allTokens: 0 },
                averages: { rpm: 0, tpm: 0 }
              }
            }
          } catch (groupError) {
            logger.warn(
              `⚠️ Failed to get group info for Claude Console account ${account.id}:`,
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
    logger.error('❌ Failed to get Claude Console accounts:', error)
    return res
      .status(500)
      .json({ error: 'Failed to get Claude Console accounts', message: error.message })
  }
})

// 创建新的Claude Console账户
router.post('/claude-console-accounts', authenticateAdmin, async (req, res) => {
  try {
    const {
      name,
      description,
      apiUrl,
      apiKey,
      priority,
      supportedModels,
      userAgent,
      rateLimitDuration,
      proxy,
      accountType,
      groupId,
      dailyQuota,
      quotaResetTime
    } = req.body
    if (!name || !apiUrl || !apiKey) {
      return res.status(400).json({ error: 'Name, API URL and API Key are required' })
    }
    if (priority !== undefined && (priority < 1 || priority > 100)) {
      return res.status(400).json({ error: 'Priority must be between 1 and 100' })
    }
    if (accountType && !['shared', 'dedicated', 'group'].includes(accountType)) {
      return res
        .status(400)
        .json({ error: 'Invalid account type. Must be "shared", "dedicated" or "group"' })
    }
    if (accountType === 'group' && !groupId) {
      return res.status(400).json({ error: 'Group ID is required for group type accounts' })
    }
    const newAccount = await claudeConsoleAccountService.createAccount({
      name,
      description,
      apiUrl,
      apiKey,
      priority: priority || 50,
      supportedModels: supportedModels || [],
      userAgent,
      rateLimitDuration:
        rateLimitDuration !== undefined && rateLimitDuration !== null ? rateLimitDuration : 60,
      proxy,
      accountType: accountType || 'shared',
      dailyQuota: dailyQuota || 0,
      quotaResetTime: quotaResetTime || '00:00'
    })
    if (accountType === 'group' && groupId) {
      await accountGroupService.addAccountToGroup(newAccount.id, groupId, 'claude')
    }
    logger.success(`🎮 Admin created Claude Console account: ${name}`)
    return res.json({ success: true, data: newAccount })
  } catch (error) {
    logger.error('❌ Failed to create Claude Console account:', error)
    return res
      .status(500)
      .json({ error: 'Failed to create Claude Console account', message: error.message })
  }
})

// 更新Claude Console账户
router.put('/claude-console-accounts/:accountId', authenticateAdmin, async (req, res) => {
  try {
    const { accountId } = req.params
    const updates = req.body
    if (updates.priority !== undefined && (updates.priority < 1 || updates.priority > 100)) {
      return res.status(400).json({ error: 'Priority must be between 1 and 100' })
    }
    if (updates.accountType && !['shared', 'dedicated', 'group'].includes(updates.accountType)) {
      return res
        .status(400)
        .json({ error: 'Invalid account type. Must be "shared", "dedicated" or "group"' })
    }
    if (updates.accountType === 'group' && !updates.groupId) {
      return res.status(400).json({ error: 'Group ID is required for group type accounts' })
    }
    const currentAccount = await claudeConsoleAccountService.getAccount(accountId)
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
            await accountGroupService.setAccountGroups(accountId, updates.groupIds, 'claude')
          } else {
            await accountGroupService.removeAccountFromAllGroups(accountId)
          }
        } else if (updates.groupId) {
          await accountGroupService.addAccountToGroup(accountId, updates.groupId, 'claude')
        }
      }
    }
    await claudeConsoleAccountService.updateAccount(accountId, updates)
    logger.success(`📝 Admin updated Claude Console account: ${accountId}`)
    return res.json({ success: true, message: 'Claude Console account updated successfully' })
  } catch (error) {
    logger.error('❌ Failed to update Claude Console account:', error)
    return res
      .status(500)
      .json({ error: 'Failed to update Claude Console account', message: error.message })
  }
})

// 删除Claude Console账户
router.delete('/claude-console-accounts/:accountId', authenticateAdmin, async (req, res) => {
  try {
    const { accountId } = req.params
    const unboundCount = await apiKeyService.unbindAccountFromAllKeys(accountId, 'claude-console')
    const account = await claudeConsoleAccountService.getAccount(accountId)
    if (account && account.accountType === 'group') {
      const groups = await accountGroupService.getAccountGroups(accountId)
      for (const group of groups) {
        await accountGroupService.removeAccountFromGroup(accountId, group.id)
      }
    }
    await claudeConsoleAccountService.deleteAccount(accountId)
    let message = 'Claude Console账号已成功删除'
    if (unboundCount > 0) {
      message += `，${unboundCount} 个 API Key 已切换为共享池模式`
    }
    logger.success(
      `🗑️ Admin deleted Claude Console account: ${accountId}, unbound ${unboundCount} keys`
    )
    return res.json({ success: true, message, unboundKeys: unboundCount })
  } catch (error) {
    logger.error('❌ Failed to delete Claude Console account:', error)
    return res
      .status(500)
      .json({ error: 'Failed to delete Claude Console account', message: error.message })
  }
})

// 切换Claude Console账户状态
router.put('/claude-console-accounts/:accountId/toggle', authenticateAdmin, async (req, res) => {
  try {
    const { accountId } = req.params
    const account = await claudeConsoleAccountService.getAccount(accountId)
    if (!account) {
      return res.status(404).json({ error: 'Account not found' })
    }
    const newStatus = !account.isActive
    await claudeConsoleAccountService.updateAccount(accountId, { isActive: newStatus })
    logger.success(
      `🔄 Admin toggled Claude Console account status: ${accountId} -> ${newStatus ? 'active' : 'inactive'}`
    )
    return res.json({ success: true, isActive: newStatus })
  } catch (error) {
    logger.error('❌ Failed to toggle Claude Console account status:', error)
    return res
      .status(500)
      .json({ error: 'Failed to toggle account status', message: error.message })
  }
})

// 切换Claude Console账户调度状态
router.put(
  '/claude-console-accounts/:accountId/toggle-schedulable',
  authenticateAdmin,
  async (req, res) => {
    try {
      const { accountId } = req.params
      const account = await claudeConsoleAccountService.getAccount(accountId)
      if (!account) {
        return res.status(404).json({ error: 'Account not found' })
      }
      const newSchedulable = !account.schedulable
      await claudeConsoleAccountService.updateAccount(accountId, { schedulable: newSchedulable })
      if (!newSchedulable) {
        await webhookNotifier.sendAccountAnomalyNotification({
          accountId: account.id,
          accountName: account.name || 'Claude Console Account',
          platform: 'claude-console',
          status: 'disabled',
          errorCode: 'CLAUDE_CONSOLE_MANUALLY_DISABLED',
          reason: '账号已被管理员手动禁用调度',
          timestamp: new Date().toISOString()
        })
      }
      logger.success(
        `🔄 Admin toggled Claude Console account schedulable status: ${accountId} -> ${newSchedulable ? 'schedulable' : 'not schedulable'}`
      )
      return res.json({ success: true, schedulable: newSchedulable })
    } catch (error) {
      logger.error('❌ Failed to toggle Claude Console account schedulable status:', error)
      return res
        .status(500)
        .json({ error: 'Failed to toggle schedulable status', message: error.message })
    }
  }
)

// 获取Claude Console账户的使用统计
router.get('/claude-console-accounts/:accountId/usage', authenticateAdmin, async (req, res) => {
  try {
    const { accountId } = req.params
    const usageStats = await claudeConsoleAccountService.getAccountUsageStats(accountId)
    if (!usageStats) {
      return res.status(404).json({ error: 'Account not found' })
    }
    return res.json(usageStats)
  } catch (error) {
    logger.error('❌ Failed to get Claude Console account usage stats:', error)
    return res.status(500).json({ error: 'Failed to get usage stats', message: error.message })
  }
})

// 手动重置Claude Console账户的每日使用量
router.post(
  '/claude-console-accounts/:accountId/reset-usage',
  authenticateAdmin,
  async (req, res) => {
    try {
      const { accountId } = req.params
      await claudeConsoleAccountService.resetDailyUsage(accountId)
      logger.success(`✅ Admin manually reset daily usage for Claude Console account: ${accountId}`)
      return res.json({ success: true, message: 'Daily usage reset successfully' })
    } catch (error) {
      logger.error('❌ Failed to reset Claude Console account daily usage:', error)
      return res.status(500).json({ error: 'Failed to reset daily usage', message: error.message })
    }
  }
)

// 重置Claude Console账户状态
router.post(
  '/claude-console-accounts/:accountId/reset-status',
  authenticateAdmin,
  async (req, res) => {
    try {
      const { accountId } = req.params
      const result = await claudeConsoleAccountService.resetAccountStatus(accountId)
      logger.success(`✅ Admin reset status for Claude Console account: ${accountId}`)
      return res.json({ success: true, data: result })
    } catch (error) {
      logger.error('❌ Failed to reset Claude Console account status:', error)
      return res.status(500).json({ error: 'Failed to reset status', message: error.message })
    }
  }
)

// 手动重置所有Claude Console账户的每日使用量
router.post('/claude-console-accounts/reset-all-usage', authenticateAdmin, async (req, res) => {
  try {
    await claudeConsoleAccountService.resetAllDailyUsage()
    logger.success('✅ Admin manually reset daily usage for all Claude Console accounts')
    return res.json({ success: true, message: 'All daily usage reset successfully' })
  } catch (error) {
    logger.error('❌ Failed to reset all Claude Console accounts daily usage:', error)
    return res
      .status(500)
      .json({ error: 'Failed to reset all daily usage', message: error.message })
  }
})

module.exports = router
