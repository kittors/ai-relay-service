const express = require('express')
const router = express.Router()

const { authenticateAdmin } = require('../../middleware/auth')
const logger = require('../../utils/logger')
const redis = require('../../models/redis')
const {
  startDeviceAuthorization,
  pollDeviceAuthorization,
  WorkOSDeviceAuthError
} = require('../../utils/workosOAuthHelper')
const accountGroupService = require('../../services/accountGroupService')
const droidAccountService = require('../../services/droidAccountService')

// 生成 Droid OAuth 授权链接（设备码）
router.post('/droid-accounts/generate-auth-url', authenticateAdmin, async (req, res) => {
  try {
    const { proxy } = req.body || {}
    const deviceAuth = await startDeviceAuthorization(proxy || null)
    const sessionId = require('crypto').randomUUID()
    const expiresAt = new Date(Date.now() + deviceAuth.expiresIn * 1000).toISOString()
    await redis.setOAuthSession(sessionId, {
      deviceCode: deviceAuth.deviceCode,
      userCode: deviceAuth.userCode,
      verificationUri: deviceAuth.verificationUri,
      verificationUriComplete: deviceAuth.verificationUriComplete,
      interval: deviceAuth.interval,
      proxy: proxy || null,
      createdAt: new Date().toISOString(),
      expiresAt
    })
    logger.success('🤖 生成 Droid 设备码授权信息成功', { sessionId })
    return res.json({
      success: true,
      data: {
        sessionId,
        userCode: deviceAuth.userCode,
        verificationUri: deviceAuth.verificationUri,
        verificationUriComplete: deviceAuth.verificationUriComplete,
        expiresIn: deviceAuth.expiresIn,
        interval: deviceAuth.interval,
        instructions: [
          '1. 使用下方验证码进入授权页面并确认访问权限。',
          '2. 在授权页面登录 Factory / Droid 账户并点击允许。',
          '3. 回到此处点击“完成授权”完成凭证获取。'
        ]
      }
    })
  } catch (error) {
    const message =
      error instanceof WorkOSDeviceAuthError ? error.message : error.message || '未知错误'
    logger.error('❌ 生成 Droid 设备码授权失败:', message)
    return res.status(500).json({ error: 'Failed to start Droid device authorization', message })
  }
})

// 交换 Droid 授权码
router.post('/droid-accounts/exchange-code', authenticateAdmin, async (req, res) => {
  const { sessionId, proxy } = req.body || {}
  try {
    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID is required' })
    }
    const oauthSession = await redis.getOAuthSession(sessionId)
    if (!oauthSession) {
      return res.status(400).json({ error: 'Invalid or expired OAuth session' })
    }
    if (oauthSession.expiresAt && new Date() > new Date(oauthSession.expiresAt)) {
      await redis.deleteOAuthSession(sessionId)
      return res
        .status(400)
        .json({ error: 'OAuth session has expired, please generate a new authorization URL' })
    }
    if (!oauthSession.deviceCode) {
      await redis.deleteOAuthSession(sessionId)
      return res.status(400).json({ error: 'OAuth session missing device code, please retry' })
    }
    const proxyConfig = proxy || oauthSession.proxy || null
    const tokens = await pollDeviceAuthorization(oauthSession.deviceCode, proxyConfig)
    await redis.deleteOAuthSession(sessionId)
    logger.success('🤖 成功获取 Droid 访问令牌', { sessionId })
    return res.json({ success: true, data: { tokens } })
  } catch (error) {
    if (error instanceof WorkOSDeviceAuthError) {
      if (error.code === 'authorization_pending' || error.code === 'slow_down') {
        const oauthSession = await redis.getOAuthSession(sessionId)
        const expiresAt = oauthSession?.expiresAt ? new Date(oauthSession.expiresAt) : null
        const remainingSeconds =
          expiresAt instanceof Date && !Number.isNaN(expiresAt.getTime())
            ? Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000))
            : null
        return res.json({
          success: false,
          pending: true,
          error: error.code,
          message: error.message,
          retryAfter: error.retryAfter || Number(oauthSession?.interval) || 5,
          expiresIn: remainingSeconds
        })
      }
      if (error.code === 'expired_token') {
        await redis.deleteOAuthSession(sessionId)
        return res
          .status(400)
          .json({ error: 'Device code expired', message: '授权已过期，请重新生成设备码并再次授权' })
      }
      logger.error('❌ Droid 授权失败:', error.message)
      return res.status(500).json({
        error: 'Failed to exchange Droid authorization code',
        message: error.message,
        errorCode: error.code
      })
    }
    logger.error('❌ 交换 Droid 授权码失败:', error)
    return res
      .status(500)
      .json({ error: 'Failed to exchange Droid authorization code', message: error.message })
  }
})

// 获取所有 Droid 账户
router.get('/droid-accounts', authenticateAdmin, async (req, res) => {
  try {
    const accounts = await droidAccountService.getAllAccounts()
    const allApiKeys = await redis.getAllApiKeys()
    const accountsWithStats = await Promise.all(
      accounts.map(async (account) => {
        try {
          const usageStats = await redis.getAccountUsageStats(account.id, 'droid')
          let groupInfos = []
          try {
            groupInfos = await accountGroupService.getAccountGroups(account.id)
          } catch (groupError) {
            logger.debug(`Failed to get group infos for Droid account ${account.id}:`, groupError)
            groupInfos = []
          }
          const groupIds = groupInfos.map((group) => group.id)
          const boundApiKeysCount = allApiKeys.reduce((count, key) => {
            const binding = key.droidAccountId
            if (!binding) {
              return count
            }
            if (binding === account.id) {
              return count + 1
            }
            if (binding.startsWith('group:')) {
              const groupId = binding.substring('group:'.length)
              if (groupIds.includes(groupId)) {
                return count + 1
              }
            }
            return count
          }, 0)
          return {
            ...account,
            schedulable: account.schedulable === 'true',
            boundApiKeysCount,
            groupInfos,
            usage: {
              daily: usageStats.daily,
              total: usageStats.total,
              averages: usageStats.averages
            }
          }
        } catch (error) {
          logger.warn(`Failed to get stats for Droid account ${account.id}:`, error.message)
          return {
            ...account,
            boundApiKeysCount: 0,
            groupInfos: [],
            usage: {
              daily: { tokens: 0, requests: 0 },
              total: { tokens: 0, requests: 0 },
              averages: { rpm: 0, tpm: 0 }
            }
          }
        }
      })
    )
    return res.json({ success: true, data: accountsWithStats })
  } catch (error) {
    logger.error('Failed to get Droid accounts:', error)
    return res.status(500).json({ error: 'Failed to get Droid accounts', message: error.message })
  }
})

// 创建 Droid 账户
router.post('/droid-accounts', authenticateAdmin, async (req, res) => {
  try {
    const account = await droidAccountService.createAccount(req.body)
    logger.success(`Created Droid account: ${account.name} (${account.id})`)
    return res.json({ success: true, data: account })
  } catch (error) {
    logger.error('Failed to create Droid account:', error)
    return res.status(500).json({ error: 'Failed to create Droid account', message: error.message })
  }
})

// 更新 Droid 账户
router.put('/droid-accounts/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const account = await droidAccountService.updateAccount(id, req.body)
    return res.json({ success: true, data: account })
  } catch (error) {
    logger.error(`Failed to update Droid account ${req.params.id}:`, error)
    return res.status(500).json({ error: 'Failed to update Droid account', message: error.message })
  }
})

// 删除 Droid 账户
router.delete('/droid-accounts/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params
    await droidAccountService.deleteAccount(id)
    return res.json({ success: true, message: 'Droid account deleted successfully' })
  } catch (error) {
    logger.error(`Failed to delete Droid account ${req.params.id}:`, error)
    return res.status(500).json({ error: 'Failed to delete Droid account', message: error.message })
  }
})

// 刷新 Droid 账户 token
router.post('/droid-accounts/:id/refresh-token', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const result = await droidAccountService.refreshAccessToken(id)
    return res.json({ success: true, data: result })
  } catch (error) {
    logger.error(`Failed to refresh Droid account token ${req.params.id}:`, error)
    return res.status(500).json({ error: 'Failed to refresh token', message: error.message })
  }
})

module.exports = router
