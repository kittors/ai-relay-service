const express = require('express')
const router = express.Router()

const { authenticateAdmin } = require('../../middleware/auth')
const logger = require('../../utils/logger')
const redis = require('../../models/redis')
const settingsStore = require('../../models/systemSettingsStore')
const config = require('../../../config/config')

// 获取OEM设置（公开接口，用于显示）
router.get('/oem-settings', async (req, res) => {
  try {
    const client = redis.getClient()
    // 优先从 Postgres 获取
    let settingsFromDb = null
    try {
      settingsFromDb = await settingsStore.get('oem_settings')
    } catch (e) {
      logger.debug('oem-settings PG get failed, fallback to Redis:', e.message)
    }
    const oemSettings = settingsFromDb || (await client.get('oem:settings'))
    const defaultSettings = {
      siteName: 'AI Relay Service',
      siteIcon: '',
      siteIconData: '',
      showAdminButton: true,
      copyInfoTemplate: '',
      tutorialUrl: '',
      updatedAt: new Date().toISOString()
    }
    let settings = defaultSettings
    if (oemSettings) {
      try {
        settings = { ...defaultSettings, ...JSON.parse(oemSettings) }
      } catch (err) {
        logger.warn('⚠️ Failed to parse OEM settings, using defaults:', err.message)
      }
    }
    // 如从 PG 获取且 Redis 无值，则写回 Redis 保持兼容
    if (settingsFromDb && !oemSettings) {
      try {
        await client.set('oem:settings', JSON.stringify(settingsFromDb))
      } catch {}
    }
    return res.json({ success: true, data: { ...settings, ldapEnabled: config.ldap && config.ldap.enabled === true } })
  } catch (error) {
    logger.error('❌ Failed to get OEM settings:', error)
    return res.status(500).json({ error: 'Failed to get OEM settings', message: error.message })
  }
})

// 更新OEM设置
router.put('/oem-settings', authenticateAdmin, async (req, res) => {
  try {
    const { siteName, siteIcon, siteIconData, showAdminButton, copyInfoTemplate, tutorialUrl } =
      req.body
    if (!siteName || typeof siteName !== 'string' || siteName.trim().length === 0) {
      return res.status(400).json({ error: 'Site name is required' })
    }
    if (siteName.length > 100) {
      return res.status(400).json({ error: 'Site name must be less than 100 characters' })
    }
    if (siteIconData && siteIconData.length > 500000) {
      return res.status(400).json({ error: 'Icon file must be less than 350KB' })
    }
    if (siteIcon && !siteIconData) {
      try {
        new URL(siteIcon)
      } catch (err) {
        return res.status(400).json({ error: 'Invalid icon URL format' })
      }
    }
    if (copyInfoTemplate && typeof copyInfoTemplate !== 'string') {
      return res.status(400).json({ error: 'Invalid copyInfoTemplate' })
    }
    if (tutorialUrl && typeof tutorialUrl !== 'string') {
      return res.status(400).json({ error: 'Invalid tutorialUrl' })
    }
    const settings = {
      siteName: siteName.trim(),
      siteIcon: (siteIcon || '').trim(),
      siteIconData: (siteIconData || '').trim(),
      showAdminButton: showAdminButton !== false,
      copyInfoTemplate: (copyInfoTemplate || '').toString().slice(0, 2000),
      tutorialUrl: (tutorialUrl || '').toString().slice(0, 1024),
      updatedAt: new Date().toISOString()
    }
    const client = redis.getClient()
    // 写入 PG
    try {
      await settingsStore.set('oem_settings', settings)
    } catch (e) {
      logger.warn('⚠️ Failed to save OEM settings to Postgres:', e.message)
    }
    // 同步写入 Redis 以兼容旧读取路径
    try {
      await client.set('oem:settings', JSON.stringify(settings))
    } catch (e) {
      logger.warn('⚠️ Failed to save OEM settings to Redis:', e.message)
    }
    logger.info(`✅ OEM settings updated: ${siteName}`)
    return res.json({ success: true, message: 'OEM settings updated successfully', data: settings })
  } catch (error) {
    logger.error('❌ Failed to update OEM settings:', error)
    return res.status(500).json({ error: 'Failed to update OEM settings', message: error.message })
  }
})

module.exports = router
