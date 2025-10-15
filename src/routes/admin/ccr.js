const express = require('express')
const router = express.Router()

const { authenticateAdmin } = require('../../middleware/auth')
const logger = require('../../utils/logger')
const redis = require('../../models/redis')
const accountGroupService = require('../../services/accountGroupService')
const ccrAccountService = require('../../services/ccrAccountService')
const apiKeyService = require('../../services/apiKeyService')
const webhookNotifier = require('../../utils/webhookNotifier')

// 获取所有CCR账户
router.get('/ccr-accounts', authenticateAdmin, async (req, res) => {
  try {
    const { platform, groupId } = req.query
    let accounts = await ccrAccountService.getAllAccounts()
    if (platform && platform !== 'all' && platform !== 'ccr') {
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
          const usageStats = await redis.getAccountUsageStats(account.id)
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
            `⚠️ Failed to get usage stats for CCR account ${account.id}:`,
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
              `⚠️ Failed to get group info for CCR account ${account.id}:`,
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
    logger.error('❌ Failed to get CCR accounts:', error)
    return res.status(500).json({ error: 'Failed to get CCR accounts', message: error.message })
  }
})

// 创建新的CCR账户
router.post('/ccr-accounts', authenticateAdmin, async (req, res) => {
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
    const newAccount = await ccrAccountService.createAccount({
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
      await accountGroupService.addAccountToGroup(newAccount.id, groupId)
    }
    logger.success(`🔧 Admin created CCR account: ${name}`)
    return res.json({ success: true, data: newAccount })
  } catch (error) {
    logger.error('❌ Failed to create CCR account:', error)
    return res.status(500).json({ error: 'Failed to create CCR account', message: error.message })
  }
})

// 更新CCR账户
router.put('/ccr-accounts/:accountId', authenticateAdmin, async (req, res) => {
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
    const currentAccount = await ccrAccountService.getAccount(accountId)
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
    await ccrAccountService.updateAccount(accountId, updates)
    logger.success(`📝 Admin updated CCR account: ${accountId}`)
    return res.json({ success: true, message: 'CCR account updated successfully' })
  } catch (error) {
    logger.error('❌ Failed to update CCR account:', error)
    return res.status(500).json({ error: 'Failed to update CCR account', message: error.message })
  }
})

// 删除CCR账户
router.delete('/ccr-accounts/:accountId', authenticateAdmin, async (req, res) => {
  try {
    const { accountId } = req.params
    const unboundCount = await apiKeyService.unbindAccountFromAllKeys(accountId, 'ccr')
    const account = await ccrAccountService.getAccount(accountId)
    if (account && account.accountType === 'group') {
      const groups = await accountGroupService.getAccountGroups(accountId)
      for (const group of groups) {
        await accountGroupService.removeAccountFromGroup(accountId, group.id)
      }
    }
    await ccrAccountService.deleteAccount(accountId)
    let message = 'CCR账号已成功删除'
    if (unboundCount > 0) {
      message += `，${unboundCount} 个 API Key 已切换为共享池模式`
    }
    logger.success(`🗑️ Admin deleted CCR account: ${accountId}`)
    return res.json({ success: true, message, unboundKeys: unboundCount })
  } catch (error) {
    logger.error('❌ Failed to delete CCR account:', error)
    return res.status(500).json({ error: 'Failed to delete CCR account', message: error.message })
  }
})

// 切换CCR账户状态
router.put('/ccr-accounts/:accountId/toggle', authenticateAdmin, async (req, res) => {
  try {
    const { accountId } = req.params
    const account = await ccrAccountService.getAccount(accountId)
    if (!account) {
      return res.status(404).json({ error: 'Account not found' })
    }
    const newStatus = !account.isActive
    await ccrAccountService.updateAccount(accountId, { isActive: newStatus })
    logger.success(
      `🔄 Admin toggled CCR account status: ${accountId} -> ${newStatus ? 'active' : 'inactive'}`
    )
    return res.json({ success: true, isActive: newStatus })
  } catch (error) {
    logger.error('❌ Failed to toggle CCR account status:', error)
    return res
      .status(500)
      .json({ error: 'Failed to toggle account status', message: error.message })
  }
})

// 切换CCR账户调度状态
router.put('/ccr-accounts/:accountId/toggle-schedulable', authenticateAdmin, async (req, res) => {
  try {
    const { accountId } = req.params
    const account = await ccrAccountService.getAccount(accountId)
    if (!account) {
      return res.status(404).json({ error: 'Account not found' })
    }
    const newSchedulable = !account.schedulable
    await ccrAccountService.updateAccount(accountId, { schedulable: newSchedulable })
    if (!newSchedulable) {
      await webhookNotifier.sendAccountAnomalyNotification({
        accountId: account.id,
        accountName: account.name || 'CCR Account',
        platform: 'ccr',
        status: 'disabled',
        errorCode: 'CCR_MANUALLY_DISABLED',
        reason: '账号已被管理员手动禁用调度',
        timestamp: new Date().toISOString()
      })
    }
    logger.success(
      `🔄 Admin toggled CCR account schedulable status: ${accountId} -> ${newSchedulable ? 'schedulable' : 'not schedulable'}`
    )
    return res.json({ success: true, schedulable: newSchedulable })
  } catch (error) {
    logger.error('❌ Failed to toggle CCR account schedulable status:', error)
    return res
      .status(500)
      .json({ error: 'Failed to toggle schedulable status', message: error.message })
  }
})

// 获取CCR账户的使用统计
router.get('/ccr-accounts/:accountId/usage', authenticateAdmin, async (req, res) => {
  try {
    const { accountId } = req.params
    const usageStats = await ccrAccountService.getAccountUsageStats(accountId)
    if (!usageStats) {
      return res.status(404).json({ error: 'Account not found' })
    }
    return res.json(usageStats)
  } catch (error) {
    logger.error('❌ Failed to get CCR account usage stats:', error)
    return res.status(500).json({ error: 'Failed to get usage stats', message: error.message })
  }
})

// 手动重置CCR账户的每日使用量
router.post('/ccr-accounts/:accountId/reset-usage', authenticateAdmin, async (req, res) => {
  try {
    const { accountId } = req.params
    await ccrAccountService.resetDailyUsage(accountId)
    logger.success(`✅ Admin manually reset daily usage for CCR account: ${accountId}`)
    return res.json({ success: true, message: 'Daily usage reset successfully' })
  } catch (error) {
    logger.error('❌ Failed to reset CCR account daily usage:', error)
    return res.status(500).json({ error: 'Failed to reset daily usage', message: error.message })
  }
})

// 重置CCR账户状态
router.post('/ccr-accounts/:accountId/reset-status', authenticateAdmin, async (req, res) => {
  try {
    const { accountId } = req.params
    const result = await ccrAccountService.resetAccountStatus(accountId)
    logger.success(`✅ Admin reset status for CCR account: ${accountId}`)
    return res.json({ success: true, data: result })
  } catch (error) {
    logger.error('❌ Failed to reset CCR account status:', error)
    return res.status(500).json({ error: 'Failed to reset status', message: error.message })
  }
})

// 手动重置所有CCR账户的每日使用量
router.post('/ccr-accounts/reset-all-usage', authenticateAdmin, async (req, res) => {
  try {
    await ccrAccountService.resetAllDailyUsage()
    logger.success('✅ Admin manually reset daily usage for all CCR accounts')
    return res.json({ success: true, message: 'All daily usage reset successfully' })
  } catch (error) {
    logger.error('❌ Failed to reset all CCR accounts daily usage:', error)
    return res
      .status(500)
      .json({ error: 'Failed to reset all daily usage', message: error.message })
  }
})

module.exports = router
