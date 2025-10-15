const express = require('express')
const router = express.Router()

const { authenticateAdmin } = require('../../middleware/auth')
const logger = require('../../utils/logger')
const redis = require('../../models/redis')
const ProxyHelper = require('../../utils/proxyHelper')
const axios = require('axios')
const crypto = require('crypto')
const webhookNotifier = require('../../utils/webhookNotifier')

const accountGroupService = require('../../services/accountGroupService')
const openaiAccountService = require('../../services/openaiAccountService')
const apiKeyService = require('../../services/apiKeyService')

const OPENAI_CONFIG = {
  BASE_URL: 'https://auth.openai.com',
  CLIENT_ID: 'app_EMoamEEZ73f0CkXaXp7hrann',
  REDIRECT_URI: 'http://localhost:1455/auth/callback',
  SCOPE: 'openid profile email offline_access'
}

function generateOpenAIPKCE() {
  const codeVerifier = crypto.randomBytes(64).toString('hex')
  const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url')
  return { codeVerifier, codeChallenge }
}

router.post('/openai-accounts/generate-auth-url', authenticateAdmin, async (req, res) => {
  try {
    const { proxy } = req.body
    const pkce = generateOpenAIPKCE()
    const state = crypto.randomBytes(32).toString('hex')
    const sessionId = crypto.randomUUID()
    await redis.setOAuthSession(sessionId, {
      codeVerifier: pkce.codeVerifier,
      codeChallenge: pkce.codeChallenge,
      state,
      proxy: proxy || null,
      platform: 'openai',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString()
    })
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: OPENAI_CONFIG.CLIENT_ID,
      redirect_uri: OPENAI_CONFIG.REDIRECT_URI,
      scope: OPENAI_CONFIG.SCOPE,
      code_challenge: pkce.codeChallenge,
      code_challenge_method: 'S256',
      state,
      id_token_add_organizations: 'true',
      codex_cli_simplified_flow: 'true'
    })
    const authUrl = `${OPENAI_CONFIG.BASE_URL}/oauth/authorize?${params.toString()}`
    logger.success('🔗 Generated OpenAI OAuth authorization URL')
    return res.json({
      success: true,
      data: {
        authUrl,
        sessionId,
        instructions: [
          '1. 复制上面的链接到浏览器中打开',
          '2. 登录您的 OpenAI 账户',
          '3. 同意应用权限',
          '4. 复制浏览器地址栏中的完整 URL（包含 code 参数）',
          '5. 在添加账户表单中粘贴完整的回调 URL'
        ]
      }
    })
  } catch (error) {
    logger.error('生成 OpenAI OAuth URL 失败:', error)
    return res
      .status(500)
      .json({ success: false, message: '生成授权链接失败', error: error.message })
  }
})

router.post('/openai-accounts/exchange-code', authenticateAdmin, async (req, res) => {
  try {
    const { code, sessionId } = req.body
    if (!code || !sessionId) {
      return res.status(400).json({ success: false, message: '缺少必要参数' })
    }
    const sessionData = await redis.getOAuthSession(sessionId)
    if (!sessionData) {
      return res.status(400).json({ success: false, message: '会话已过期或无效' })
    }
    const tokenData = {
      grant_type: 'authorization_code',
      code: code.trim(),
      redirect_uri: OPENAI_CONFIG.REDIRECT_URI,
      client_id: OPENAI_CONFIG.CLIENT_ID,
      code_verifier: sessionData.codeVerifier
    }
    logger.info('Exchanging OpenAI authorization code:', {
      sessionId,
      codeLength: code.length,
      hasCodeVerifier: !!sessionData.codeVerifier
    })
    const axiosConfig = { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    const proxyAgent = ProxyHelper.createProxyAgent(sessionData.proxy)
    if (proxyAgent) {
      axiosConfig.httpsAgent = proxyAgent
      axiosConfig.proxy = false
    }
    const tokenResponse = await axios.post(
      `${OPENAI_CONFIG.BASE_URL}/oauth/token`,
      new URLSearchParams(tokenData).toString(),
      axiosConfig
    )
    const { id_token, access_token, refresh_token, expires_in } = tokenResponse.data
    const idTokenParts = id_token.split('.')
    if (idTokenParts.length !== 3) {
      throw new Error('Invalid ID token format')
    }
    const payload = JSON.parse(Buffer.from(idTokenParts[1], 'base64url').toString())
    const authClaims = payload['https://api.openai.com/auth'] || {}
    const accountId = authClaims.chatgpt_account_id || ''
    const chatgptUserId = authClaims.chatgpt_user_id || authClaims.user_id || ''
    const planType = authClaims.chatgpt_plan_type || ''
    const organizations = authClaims.organizations || []
    const defaultOrg = organizations.find((org) => org.is_default) || organizations[0] || {}
    const organizationId = defaultOrg.id || ''
    const organizationRole = defaultOrg.role || ''
    const organizationTitle = defaultOrg.title || ''
    await redis.deleteOAuthSession(sessionId)
    logger.success('✅ OpenAI OAuth token exchange successful')
    return res.json({
      success: true,
      data: {
        tokens: {
          idToken: id_token,
          accessToken: access_token,
          refreshToken: refresh_token,
          expires_in
        },
        accountInfo: {
          accountId,
          chatgptUserId,
          organizationId,
          organizationRole,
          organizationTitle,
          planType,
          email: payload.email || '',
          name: payload.name || '',
          emailVerified: payload.email_verified || false,
          organizations
        }
      }
    })
  } catch (error) {
    logger.error('OpenAI OAuth token exchange failed:', error)
    return res.status(500).json({ success: false, message: '交换授权码失败', error: error.message })
  }
})

// 获取所有 OpenAI 账户
router.get('/openai-accounts', authenticateAdmin, async (req, res) => {
  try {
    const { platform, groupId } = req.query
    let accounts = await openaiAccountService.getAllAccounts()
    const accountGroupCache = new Map()
    const fetchAccountGroups = async (accountId) => {
      if (!accountGroupCache.has(accountId)) {
        const groups = await accountGroupService.getAccountGroups(accountId)
        accountGroupCache.set(accountId, groups || [])
      }
      return accountGroupCache.get(accountId)
    }
    if (platform && platform !== 'all' && platform !== 'openai') {
      accounts = []
    }
    if (groupId && groupId !== 'all') {
      if (groupId === 'ungrouped') {
        const filteredAccounts = []
        for (const account of accounts) {
          const groups = await fetchAccountGroups(account.id)
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
          const groupInfos = await fetchAccountGroups(account.id)
          return {
            ...account,
            groupInfos,
            usage: { daily: usageStats.daily, total: usageStats.total, monthly: usageStats.monthly }
          }
        } catch (error) {
          logger.debug(`Failed to get usage stats for OpenAI account ${account.id}:`, error)
          const groupInfos = await fetchAccountGroups(account.id)
          return {
            ...account,
            groupInfos,
            usage: {
              daily: { requests: 0, tokens: 0, allTokens: 0 },
              total: { requests: 0, tokens: 0, allTokens: 0 },
              monthly: { requests: 0, tokens: 0, allTokens: 0 }
            }
          }
        }
      })
    )
    logger.info(`获取 OpenAI 账户列表: ${accountsWithStats.length} 个账户`)
    return res.json({ success: true, data: accountsWithStats })
  } catch (error) {
    logger.error('获取 OpenAI 账户列表失败:', error)
    return res
      .status(500)
      .json({ success: false, message: '获取账户列表失败', error: error.message })
  }
})

// 创建 OpenAI 账户
router.post('/openai-accounts', authenticateAdmin, async (req, res) => {
  try {
    const {
      name,
      description,
      openaiOauth,
      accountInfo,
      proxy,
      accountType,
      groupId,
      rateLimitDuration,
      priority,
      needsImmediateRefresh,
      requireRefreshSuccess
    } = req.body
    if (!name) {
      return res.status(400).json({ success: false, message: '账户名称不能为空' })
    }
    const accountData = {
      name,
      description: description || '',
      accountType: accountType || 'shared',
      priority: priority || 50,
      rateLimitDuration:
        rateLimitDuration !== undefined && rateLimitDuration !== null ? rateLimitDuration : 60,
      openaiOauth: openaiOauth || {},
      accountInfo: accountInfo || {},
      proxy: proxy || null,
      isActive: true,
      schedulable: true
    }
    if (needsImmediateRefresh && requireRefreshSuccess) {
      const tempAccount = await openaiAccountService.createAccount(accountData)
      try {
        logger.info('🔄 测试刷新 OpenAI 账户以获取完整 token 信息')
        await openaiAccountService.refreshAccountToken(tempAccount.id)
        const refreshedAccount = await openaiAccountService.getAccount(tempAccount.id)
        if (!refreshedAccount.idToken || refreshedAccount.idToken === '') {
          await openaiAccountService.deleteAccount(tempAccount.id)
          throw new Error('无法获取 ID Token，请检查 Refresh Token 是否有效')
        }
        if (accountType === 'group' && groupId) {
          await accountGroupService.addAccountToGroup(tempAccount.id, groupId, 'openai')
        }
        delete refreshedAccount.idToken
        delete refreshedAccount.accessToken
        delete refreshedAccount.refreshToken
        logger.success(`✅ 创建并验证 OpenAI 账户成功: ${name} (ID: ${tempAccount.id})`)
        return res.json({
          success: true,
          data: refreshedAccount,
          message: '账户创建成功，并已获取完整 token 信息'
        })
      } catch (refreshError) {
        logger.warn(`❌ 刷新失败，删除临时账户: ${refreshError.message}`)
        await openaiAccountService.deleteAccount(tempAccount.id)
        const errorResponse = {
          success: false,
          message: '账户创建失败',
          error: refreshError.message
        }
        if (refreshError.status) {
          errorResponse.errorCode = refreshError.status
        }
        if (refreshError.details) {
          errorResponse.errorDetails = refreshError.details
        }
        if (refreshError.code) {
          errorResponse.networkError = refreshError.code
        }
        if (refreshError.message.includes('Refresh Token 无效')) {
          errorResponse.suggestion = '请检查 Refresh Token 是否正确，或重新通过 OAuth 授权获取'
        } else if (refreshError.message.includes('代理')) {
          errorResponse.suggestion = '请检查代理配置是否正确，包括地址、端口和认证信息'
        } else if (refreshError.message.includes('过于频繁')) {
          errorResponse.suggestion = '请稍后再试，或更换代理 IP'
        } else if (refreshError.message.includes('连接')) {
          errorResponse.suggestion = '请检查网络连接和代理设置'
        }
        return res.status(400).json(errorResponse)
      }
    }
    const createdAccount = await openaiAccountService.createAccount(accountData)
    if (accountType === 'group' && groupId) {
      await accountGroupService.addAccountToGroup(createdAccount.id, groupId, 'openai')
    }
    if (needsImmediateRefresh && !requireRefreshSuccess) {
      try {
        logger.info(`🔄 尝试刷新 OpenAI 账户 ${createdAccount.id}`)
        await openaiAccountService.refreshAccountToken(createdAccount.id)
        logger.info('✅ 刷新成功')
      } catch (refreshError) {
        logger.warn(`⚠️ 刷新失败，但账户已创建: ${refreshError.message}`)
      }
    }
    logger.success(`✅ 创建 OpenAI 账户成功: ${name} (ID: ${createdAccount.id})`)
    return res.json({ success: true, data: createdAccount })
  } catch (error) {
    logger.error('创建 OpenAI 账户失败:', error)
    return res.status(500).json({ success: false, message: '创建账户失败', error: error.message })
  }
})

// 更新 OpenAI 账户
router.put('/openai-accounts/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const updates = req.body
    const { needsImmediateRefresh, requireRefreshSuccess } = updates
    if (updates.accountType && !['shared', 'dedicated', 'group'].includes(updates.accountType)) {
      return res
        .status(400)
        .json({ error: 'Invalid account type. Must be "shared", "dedicated" or "group"' })
    }
    if (updates.accountType === 'group' && !updates.groupId) {
      return res.status(400).json({ error: 'Group ID is required for group type accounts' })
    }
    const currentAccount = await openaiAccountService.getAccount(id)
    if (!currentAccount) {
      return res.status(404).json({ error: 'Account not found' })
    }
    if (updates.openaiOauth?.refreshToken && needsImmediateRefresh && requireRefreshSuccess) {
      const tempUpdateData = {}
      if (updates.openaiOauth.refreshToken) {
        tempUpdateData.refreshToken = updates.openaiOauth.refreshToken
      }
      if (updates.openaiOauth.accessToken) {
        tempUpdateData.accessToken = updates.openaiOauth.accessToken
      }
      if (updates.proxy !== undefined) {
        tempUpdateData.proxy = updates.proxy
      }
      await openaiAccountService.updateAccount(id, tempUpdateData)
      try {
        logger.info(`🔄 验证更新的 OpenAI token (账户: ${id})`)
        await openaiAccountService.refreshAccountToken(id)
        const refreshedAccount = await openaiAccountService.getAccount(id)
        if (!refreshedAccount.idToken || refreshedAccount.idToken === '') {
          await openaiAccountService.updateAccount(id, {
            refreshToken: currentAccount.refreshToken,
            accessToken: currentAccount.accessToken,
            idToken: currentAccount.idToken
          })
          return res.status(400).json({
            success: false,
            message: '无法获取 ID Token，请检查 Refresh Token 是否有效',
            error: 'Invalid refresh token'
          })
        }
        logger.success('✅ Token 验证成功，继续更新账户信息')
      } catch (refreshError) {
        logger.warn(`❌ Token 验证失败，恢复原始配置: ${refreshError.message}`)
        await openaiAccountService.updateAccount(id, {
          refreshToken: currentAccount.refreshToken,
          accessToken: currentAccount.accessToken,
          idToken: currentAccount.idToken,
          proxy: currentAccount.proxy
        })
        const errorResponse = { success: false, message: '更新失败', error: refreshError.message }
        if (refreshError.status) {
          errorResponse.errorCode = refreshError.status
        }
        if (refreshError.details) {
          errorResponse.errorDetails = refreshError.details
        }
        if (refreshError.code) {
          errorResponse.networkError = refreshError.code
        }
        if (refreshError.message.includes('Refresh Token 无效')) {
          errorResponse.suggestion = '请检查 Refresh Token 是否正确，或重新通过 OAuth 授权获取'
        } else if (refreshError.message.includes('代理')) {
          errorResponse.suggestion = '请检查代理配置是否正确，包括地址、端口和认证信息'
        } else if (refreshError.message.includes('过于频繁')) {
          errorResponse.suggestion = '请稍后再试，或更换代理 IP'
        } else if (refreshError.message.includes('连接')) {
          errorResponse.suggestion = '请检查网络连接和代理设置'
        }
        return res.status(400).json(errorResponse)
      }
    }
    if (updates.accountType !== undefined) {
      if (currentAccount.accountType === 'group') {
        const oldGroup = await accountGroupService.getAccountGroup(id)
        if (oldGroup) {
          await accountGroupService.removeAccountFromGroup(id, oldGroup.id)
        }
      }
      if (updates.accountType === 'group' && updates.groupId) {
        await accountGroupService.addAccountToGroup(id, updates.groupId, 'openai')
      }
    }
    const updateData = { ...updates }
    if (updates.openaiOauth) {
      updateData.openaiOauth = updates.openaiOauth
      if (updates.openaiOauth.accessToken) {
        updateData.accessToken = updates.openaiOauth.accessToken
      }
      if (updates.openaiOauth.refreshToken) {
        updateData.refreshToken = updates.openaiOauth.refreshToken
      }
      if (updates.openaiOauth.expires_in) {
        updateData.expiresAt = new Date(
          Date.now() + updates.openaiOauth.expires_in * 1000
        ).toISOString()
      }
    }
    if (updates.accountInfo) {
      updateData.accountId = updates.accountInfo.accountId || currentAccount.accountId
      updateData.chatgptUserId = updates.accountInfo.chatgptUserId || currentAccount.chatgptUserId
      updateData.organizationId =
        updates.accountInfo.organizationId || currentAccount.organizationId
      updateData.organizationRole =
        updates.accountInfo.organizationRole || currentAccount.organizationRole
      updateData.organizationTitle =
        updates.accountInfo.organizationTitle || currentAccount.organizationTitle
      updateData.planType = updates.accountInfo.planType || currentAccount.planType
      updateData.email = updates.accountInfo.email || currentAccount.email
      updateData.emailVerified =
        updates.accountInfo.emailVerified !== undefined
          ? updates.accountInfo.emailVerified
          : currentAccount.emailVerified
    }
    const updatedAccount = await openaiAccountService.updateAccount(id, updateData)
    if (needsImmediateRefresh && !requireRefreshSuccess) {
      try {
        logger.info(`🔄 尝试刷新 OpenAI 账户 ${id}`)
        await openaiAccountService.refreshAccountToken(id)
        logger.info('✅ 刷新成功')
      } catch (refreshError) {
        logger.warn(`⚠️ 刷新失败，但账户信息已更新: ${refreshError.message}`)
      }
    }
    logger.success(`📝 Admin updated OpenAI account: ${id}`)
    return res.json({ success: true, data: updatedAccount })
  } catch (error) {
    logger.error('❌ Failed to update OpenAI account:', error)
    return res.status(500).json({ error: 'Failed to update account', message: error.message })
  }
})

// 删除 OpenAI 账户
router.delete('/openai-accounts/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const account = await openaiAccountService.getAccount(id)
    if (!account) {
      return res.status(404).json({ success: false, message: '账户不存在' })
    }
    const unboundCount = await apiKeyService.unbindAccountFromAllKeys(id, 'openai')
    if (account.accountType === 'group') {
      const group = await accountGroupService.getAccountGroup(id)
      if (group) {
        await accountGroupService.removeAccountFromGroup(id, group.id)
      }
    }
    await openaiAccountService.deleteAccount(id)
    let message = 'OpenAI账号已成功删除'
    if (unboundCount > 0) {
      message += `，${unboundCount} 个 API Key 已切换为共享池模式`
    }
    logger.success(
      `✅ 删除 OpenAI 账户成功: ${account.name} (ID: ${id}), unbound ${unboundCount} keys`
    )
    return res.json({ success: true, message, unboundKeys: unboundCount })
  } catch (error) {
    logger.error('删除 OpenAI 账户失败:', error)
    return res.status(500).json({ success: false, message: '删除账户失败', error: error.message })
  }
})

// 切换 OpenAI 账户状态（本地缓存）
router.put('/openai-accounts/:id/toggle', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const account = await redis.getOpenAiAccount(id)
    if (!account) {
      return res.status(404).json({ success: false, message: '账户不存在' })
    }
    account.enabled = !account.enabled
    account.updatedAt = new Date().toISOString()
    // TODO: 持久化更新（取决于现有模型）
    logger.success(
      `✅ ${account.enabled ? '启用' : '禁用'} OpenAI 账户: ${account.name} (ID: ${id})`
    )
    return res.json({ success: true, data: account })
  } catch (error) {
    logger.error('切换 OpenAI 账户状态失败:', error)
    return res
      .status(500)
      .json({ success: false, message: '切换账户状态失败', error: error.message })
  }
})

// 重置 OpenAI 账户状态
router.post('/openai-accounts/:accountId/reset-status', authenticateAdmin, async (req, res) => {
  try {
    const { accountId } = req.params
    const result = await openaiAccountService.resetAccountStatus(accountId)
    logger.success(`✅ Admin reset status for OpenAI account: ${accountId}`)
    return res.json({ success: true, data: result })
  } catch (error) {
    logger.error('❌ Failed to reset OpenAI account status:', error)
    return res.status(500).json({ error: 'Failed to reset status', message: error.message })
  }
})

// 切换 OpenAI 账户调度状态
router.put(
  '/openai-accounts/:accountId/toggle-schedulable',
  authenticateAdmin,
  async (req, res) => {
    try {
      const { accountId } = req.params
      const result = await openaiAccountService.toggleSchedulable(accountId)
      if (!result.schedulable) {
        const account = await redis.getOpenAiAccount(accountId)
        if (account) {
          await webhookNotifier.sendAccountAnomalyNotification({
            accountId: account.id,
            accountName: account.name || 'OpenAI Account',
            platform: 'openai',
            status: 'disabled',
            errorCode: 'OPENAI_MANUALLY_DISABLED',
            reason: '账号已被管理员手动禁用调度',
            timestamp: new Date().toISOString()
          })
        }
      }
      return res.json({
        success: result.success,
        schedulable: result.schedulable,
        message: result.schedulable ? '已启用调度' : '已禁用调度'
      })
    } catch (error) {
      logger.error('切换 OpenAI 账户调度状态失败:', error)
      return res
        .status(500)
        .json({ success: false, message: '切换调度状态失败', error: error.message })
    }
  }
)

module.exports = router
