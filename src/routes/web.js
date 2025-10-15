const express = require('express')
const bcrypt = require('bcryptjs')
const crypto = require('crypto')
const path = require('path')
const fs = require('fs')
const redis = require('../models/redis')
const logger = require('../utils/logger')
const config = require('../../config/config')

const router = express.Router()

// 🏠 服务静态文件
router.use('/assets', express.static(path.join(__dirname, '../../web/assets')))

// 🌐 页面路由重定向到新版 admin-spa
router.get('/', (req, res) => {
  // 首页展示产品（集成在 /admin-next/api-stats 的“产品”页签）
  res.redirect(301, '/admin-next/api-stats')
})

// 💳 购买跳转页（前端点击订购后跳转到此处）
router.get('/purchase', async (req, res) => {
  try {
    const planId = String(req.query.plan || '').trim()
    const base = (config.payment && config.payment.redirectBaseUrl) || ''

    // 如果配置了外部跳转地址，优先跳转
    if (base) {
      let target = base
      if (target.includes('{plan}')) {
        target = target.replace('{plan}', encodeURIComponent(planId))
      } else {
        const sep = target.includes('?') ? '&' : '?'
        target = `${target}${sep}plan=${encodeURIComponent(planId)}`
      }
      return res.redirect(302, target)
    }

    // 如果配置了虎皮椒支付，生成自动提交的表单
    const xh = config.payment?.xunhu || {}
    if (xh.appId && xh.appSecret && xh.doUrl) {
      const productService = require('../services/productSettingsService')
      const orderService = require('../services/orderService')
      const xhService = require('../services/xunhuPayService')

      const plan = planId ? await productService.findPlanById(planId) : null
      const price = plan?.price || '0.01'
      const title = plan?.name || 'AI Relay 订购'

      // 生成订单号
      const outTradeOrder = `xh_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

      // 保存订单（初始状态）
      await orderService.createOrder({
        id: outTradeOrder,
        planId: planId || '',
        price,
        title,
        status: 'INIT'
      })

      // 生成通知与返回URL（绝对地址）
      const origin = `${req.protocol}://${req.get('host')}`
      const notify_url = new URL(xh.notifyPath || '/webhook/xunhu', origin).toString()
      const returnTo = new URL(xh.returnPath || '/admin-next/api-stats', origin)
      returnTo.searchParams.set('order', outTradeOrder)
      if (planId) {
        returnTo.searchParams.set('plan', planId)
      }
      const return_url = returnTo.toString()

      // 构造表单字段
      const payload = xhService.buildCreatePayload({
        out_trade_order: outTradeOrder,
        total_fee: price,
        title,
        notify_url,
        return_url
      })

      // 生成自动提交表单
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      const inputs = Object.entries(payload)
        .map(
          ([k, v]) =>
            `<input type="hidden" name="${k}" value="${String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;')}">`
        )
        .join('\n')

      return res.send(`<!DOCTYPE html>
      <html lang="zh-CN">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>正在跳转微信支付...</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'PingFang SC', 'Noto Sans SC', 'Microsoft Yahei', Arial, sans-serif; background: #0f172a; color: #e5e7eb; margin: 0; }
            .wrap { min-height: 100vh; display: grid; place-items: center; padding: 24px; }
            .card { max-width: 560px; width: 100%; background: rgba(15,23,42,0.6); border: 1px solid rgba(148,163,184,0.2); border-radius: 16px; padding: 24px; box-shadow: 0 10px 30px rgba(0,0,0,0.4); text-align: center; }
            .title { font-size: 20px; font-weight: 800; margin: 0 0 8px; background: linear-gradient(135deg,#60a5fa,#10b981); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
            .desc { font-size: 14px; color: #cbd5e1; margin: 0 0 16px; }
          </style>
        </head>
        <body>
          <div class="wrap">
            <div class="card">
              <h1 class="title">正在跳转微信支付...</h1>
              <p class="desc">订单：${title} / 金额：¥${price}</p>
              <form id="xhpay" action="${xh.doUrl}" method="post">
                ${inputs}
              </form>
              <script>document.getElementById('xhpay').submit()</script>
            </div>
          </div>
        </body>
      </html>`)
    }

    // 默认占位页面
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    return res.send(`<!DOCTYPE html>
      <html lang="zh-CN">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>正在跳转支付...</title>
        </head>
        <body>
          <p>暂未配置支付，请联系管理员。</p>
        </body>
      </html>`)
  } catch (error) {
    logger.error('❌ Purchase redirect error:', error)
    return res.status(500).json({ error: 'Purchase redirect failed' })
  }
})

// 🔐 管理员登录
router.post('/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body

    if (!username || !password) {
      return res.status(400).json({
        error: 'Missing credentials',
        message: 'Username and password are required'
      })
    }

    // 从Redis获取管理员信息
    let adminData = await redis.getSession('admin_credentials')

    // 如果Redis中没有管理员凭据，尝试从init.json重新加载
    if (!adminData || Object.keys(adminData).length === 0) {
      const initFilePath = path.join(__dirname, '../../data/init.json')

      if (fs.existsSync(initFilePath)) {
        try {
          const initData = JSON.parse(fs.readFileSync(initFilePath, 'utf8'))
          const saltRounds = 10
          const passwordHash = await bcrypt.hash(initData.adminPassword, saltRounds)

          adminData = {
            username: initData.adminUsername,
            passwordHash,
            createdAt: initData.initializedAt || new Date().toISOString(),
            lastLogin: null,
            updatedAt: initData.updatedAt || null
          }

          // 重新存储到Redis，不设置过期时间
          await redis.getClient().hset('session:admin_credentials', adminData)

          logger.info('✅ Admin credentials reloaded from init.json')
        } catch (error) {
          logger.error('❌ Failed to reload admin credentials:', error)
          return res.status(401).json({
            error: 'Invalid credentials',
            message: 'Invalid username or password'
          })
        }
      } else {
        return res.status(401).json({
          error: 'Invalid credentials',
          message: 'Invalid username or password'
        })
      }
    }

    // 验证用户名和密码
    const isValidUsername = adminData.username === username
    const isValidPassword = await bcrypt.compare(password, adminData.passwordHash)

    if (!isValidUsername || !isValidPassword) {
      logger.security(`🔒 Failed login attempt for username: ${username}`)
      return res.status(401).json({
        error: 'Invalid credentials',
        message: 'Invalid username or password'
      })
    }

    // 生成会话token
    const sessionId = crypto.randomBytes(32).toString('hex')

    // 存储会话
    const sessionData = {
      username: adminData.username,
      loginTime: new Date().toISOString(),
      lastActivity: new Date().toISOString()
    }

    await redis.setSession(sessionId, sessionData, config.security.adminSessionTimeout)

    // 不再更新 Redis 中的最后登录时间，因为 Redis 只是缓存
    // init.json 是唯一真实数据源

    logger.success(`🔐 Admin login successful: ${username}`)

    return res.json({
      success: true,
      token: sessionId,
      expiresIn: config.security.adminSessionTimeout,
      username: adminData.username // 返回真实用户名
    })
  } catch (error) {
    logger.error('❌ Login error:', error)
    return res.status(500).json({
      error: 'Login failed',
      message: 'Internal server error'
    })
  }
})

// 🚪 管理员登出
router.post('/auth/logout', async (req, res) => {
  try {
    const token = req.headers['authorization']?.replace('Bearer ', '') || req.cookies?.adminToken

    if (token) {
      await redis.deleteSession(token)
      logger.success('🚪 Admin logout successful')
    }

    return res.json({ success: true, message: 'Logout successful' })
  } catch (error) {
    logger.error('❌ Logout error:', error)
    return res.status(500).json({
      error: 'Logout failed',
      message: 'Internal server error'
    })
  }
})

// 🔑 修改账户信息
router.post('/auth/change-password', async (req, res) => {
  try {
    const token = req.headers['authorization']?.replace('Bearer ', '') || req.cookies?.adminToken

    if (!token) {
      return res.status(401).json({
        error: 'No token provided',
        message: 'Authentication required'
      })
    }

    const { newUsername, currentPassword, newPassword } = req.body

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        error: 'Missing required fields',
        message: 'Current password and new password are required'
      })
    }

    // 验证新密码长度
    if (newPassword.length < 8) {
      return res.status(400).json({
        error: 'Password too short',
        message: 'New password must be at least 8 characters long'
      })
    }

    // 获取当前会话
    const sessionData = await redis.getSession(token)
    if (!sessionData) {
      return res.status(401).json({
        error: 'Invalid token',
        message: 'Session expired or invalid'
      })
    }

    // 获取当前管理员信息
    const adminData = await redis.getSession('admin_credentials')
    if (!adminData) {
      return res.status(500).json({
        error: 'Admin data not found',
        message: 'Administrator credentials not found'
      })
    }

    // 验证当前密码
    const isValidPassword = await bcrypt.compare(currentPassword, adminData.passwordHash)
    if (!isValidPassword) {
      logger.security(`🔒 Invalid current password attempt for user: ${sessionData.username}`)
      return res.status(401).json({
        error: 'Invalid current password',
        message: 'Current password is incorrect'
      })
    }

    // 准备更新的数据
    const updatedUsername =
      newUsername && newUsername.trim() ? newUsername.trim() : adminData.username

    // 先更新 init.json（唯一真实数据源）
    const initFilePath = path.join(__dirname, '../../data/init.json')
    if (!fs.existsSync(initFilePath)) {
      return res.status(500).json({
        error: 'Configuration file not found',
        message: 'init.json file is missing'
      })
    }

    try {
      const initData = JSON.parse(fs.readFileSync(initFilePath, 'utf8'))
      // const oldData = { ...initData }; // 备份旧数据

      // 更新 init.json
      initData.adminUsername = updatedUsername
      initData.adminPassword = newPassword // 保存明文密码到init.json
      initData.updatedAt = new Date().toISOString()

      // 先写入文件（如果失败则不会影响 Redis）
      fs.writeFileSync(initFilePath, JSON.stringify(initData, null, 2))

      // 文件写入成功后，更新 Redis 缓存
      const saltRounds = 10
      const newPasswordHash = await bcrypt.hash(newPassword, saltRounds)

      const updatedAdminData = {
        username: updatedUsername,
        passwordHash: newPasswordHash,
        createdAt: adminData.createdAt,
        lastLogin: adminData.lastLogin,
        updatedAt: new Date().toISOString()
      }

      await redis.setSession('admin_credentials', updatedAdminData)
    } catch (fileError) {
      logger.error('❌ Failed to update init.json:', fileError)
      return res.status(500).json({
        error: 'Update failed',
        message: 'Failed to update configuration file'
      })
    }

    // 清除当前会话（强制用户重新登录）
    await redis.deleteSession(token)

    logger.success(`🔐 Admin password changed successfully for user: ${updatedUsername}`)

    return res.json({
      success: true,
      message: 'Password changed successfully. Please login again.',
      newUsername: updatedUsername
    })
  } catch (error) {
    logger.error('❌ Change password error:', error)
    return res.status(500).json({
      error: 'Change password failed',
      message: 'Internal server error'
    })
  }
})

// 👤 获取当前用户信息
router.get('/auth/user', async (req, res) => {
  try {
    const token = req.headers['authorization']?.replace('Bearer ', '') || req.cookies?.adminToken

    if (!token) {
      return res.status(401).json({
        error: 'No token provided',
        message: 'Authentication required'
      })
    }

    // 获取当前会话
    const sessionData = await redis.getSession(token)
    if (!sessionData) {
      return res.status(401).json({
        error: 'Invalid token',
        message: 'Session expired or invalid'
      })
    }

    // 获取管理员信息
    const adminData = await redis.getSession('admin_credentials')
    if (!adminData) {
      return res.status(500).json({
        error: 'Admin data not found',
        message: 'Administrator credentials not found'
      })
    }

    return res.json({
      success: true,
      user: {
        username: adminData.username,
        loginTime: sessionData.loginTime,
        lastActivity: sessionData.lastActivity
      }
    })
  } catch (error) {
    logger.error('❌ Get user info error:', error)
    return res.status(500).json({
      error: 'Get user info failed',
      message: 'Internal server error'
    })
  }
})

// 🔄 刷新token
router.post('/auth/refresh', async (req, res) => {
  try {
    const token = req.headers['authorization']?.replace('Bearer ', '') || req.cookies?.adminToken

    if (!token) {
      return res.status(401).json({
        error: 'No token provided',
        message: 'Authentication required'
      })
    }

    const sessionData = await redis.getSession(token)

    if (!sessionData) {
      return res.status(401).json({
        error: 'Invalid token',
        message: 'Session expired or invalid'
      })
    }

    // 更新最后活动时间
    sessionData.lastActivity = new Date().toISOString()
    await redis.setSession(token, sessionData, config.security.adminSessionTimeout)

    return res.json({
      success: true,
      token,
      expiresIn: config.security.adminSessionTimeout
    })
  } catch (error) {
    logger.error('❌ Token refresh error:', error)
    return res.status(500).json({
      error: 'Token refresh failed',
      message: 'Internal server error'
    })
  }
})

module.exports = router
