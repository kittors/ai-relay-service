import { ref } from 'vue'
import { apiClient } from '@/config/api'
import { showToast } from '@/utils/toast'
import {
  DEFAULT_NOTIFICATION_TYPES,
  getNotificationTypeName,
  getNotificationTypeDescription,
  getPlatformIcon,
  getPlatformName,
  getWebhookHint
} from '../config/webhookConfig'

export function useWebhookSettings() {
  const webhookConfig = ref({
    enabled: false,
    platforms: [],
    notificationTypes: { ...DEFAULT_NOTIFICATION_TYPES },
    retrySettings: { maxRetries: 3, retryDelay: 1000, timeout: 10000 }
  })

  const showPlatformModal = ref(false)
  const editingPlatform = ref(null)
  const platformForm = ref(getEmptyPlatform())
  const testingConnection = ref(false)
  const savingPlatform = ref(false)

  function getEmptyPlatform() {
    return {
      type: 'wechat_work',
      name: '',
      url: '',
      enableSign: false,
      secret: '',
      // Telegram
      botToken: '',
      chatId: '',
      apiBaseUrl: '',
      proxyUrl: '',
      // Bark
      deviceKey: '',
      serverUrl: '',
      level: '',
      sound: '',
      group: '',
      // SMTP
      host: '',
      port: null,
      secure: false,
      user: '',
      pass: '',
      from: '',
      to: '',
      timeout: null,
      ignoreTLS: false
    }
  }

  async function loadWebhookConfig() {
    const res = await apiClient.get('/admin/webhook/config')
    if (res && res.success) {
      const data = res.data || {}
      webhookConfig.value = {
        enabled: !!data.enabled,
        platforms: Array.isArray(data.platforms) ? data.platforms : [],
        notificationTypes: { ...DEFAULT_NOTIFICATION_TYPES, ...(data.notificationTypes || {}) },
        retrySettings: {
          maxRetries: data.retrySettings?.maxRetries ?? 3,
          retryDelay: data.retrySettings?.retryDelay ?? 1000,
          timeout: data.retrySettings?.timeout ?? 10000
        }
      }
    }
    return res
  }

  async function saveWebhookConfig() {
    const payload = { ...webhookConfig.value }
    const res = await apiClient.post('/admin/webhook/config', payload)
    if (res && res.success) showToast('通知设置已保存', 'success')
    return res
  }

  function openAddPlatform() {
    editingPlatform.value = null
    platformForm.value = getEmptyPlatform()
    showPlatformModal.value = true
  }

  function editPlatform(platform) {
    editingPlatform.value = platform
    platformForm.value = {
      type: platform.type,
      name: platform.name || '',
      url: platform.url || '',
      enableSign: platform.enableSign || false,
      secret: platform.secret || '',
      botToken: platform.botToken || '',
      chatId: platform.chatId || '',
      apiBaseUrl: platform.apiBaseUrl || '',
      proxyUrl: platform.proxyUrl || '',
      deviceKey: platform.deviceKey || '',
      serverUrl: platform.serverUrl || '',
      level: platform.level || '',
      sound: platform.sound || '',
      group: platform.group || '',
      host: platform.host || '',
      port: platform.port ?? null,
      secure: platform.secure || false,
      user: platform.user || '',
      pass: platform.pass || '',
      from: platform.from || '',
      to: Array.isArray(platform.to) ? platform.to.join(', ') : platform.to || '',
      timeout: platform.timeout ?? null,
      ignoreTLS: platform.ignoreTLS || false
    }
    showPlatformModal.value = true
  }

  async function deletePlatform(id) {
    if (!confirm('确定要删除这个平台吗？')) return
    const res = await apiClient.delete(`/admin/webhook/platforms/${id}`)
    if (res && res.success) {
      showToast('平台已删除', 'success')
      await loadWebhookConfig()
    }
  }

  async function togglePlatform(id) {
    const res = await apiClient.post(`/admin/webhook/platforms/${id}/toggle`)
    if (res && res.success) {
      showToast(res.message || '已切换平台状态', 'success')
      await loadWebhookConfig()
    }
  }

  function validatePlatformForm() {
    const f = platformForm.value
    if (
      f.type === 'custom' ||
      f.type === 'wechat_work' ||
      f.type === 'dingtalk' ||
      f.type === 'feishu' ||
      f.type === 'slack' ||
      f.type === 'discord'
    ) {
      if (!f.url || f.url.length < 5) {
        showToast('请填写有效的 Webhook URL', 'error')
        return false
      }
    } else if (f.type === 'telegram') {
      if (!f.botToken || !f.chatId) {
        showToast('请填写 Telegram BotToken 与 Chat ID', 'error')
        return false
      }
    } else if (f.type === 'bark') {
      if (!f.deviceKey) {
        showToast('请填写 Bark 设备密钥', 'error')
        return false
      }
    } else if (f.type === 'smtp') {
      if (!f.host || !f.user || !f.pass || !f.to) {
        showToast('请完善 SMTP 主机/账号/密码/收件人', 'error')
        return false
      }
    }
    return true
  }

  async function testPlatformForm() {
    if (!validatePlatformForm()) return
    try {
      testingConnection.value = true
      const payload = normalizePlatform(platformForm.value)
      const res = await apiClient.post('/admin/webhook/test', payload)
      if (res && res.success) showToast('测试成功', 'success')
    } catch (e) {
      showToast('测试失败', 'error')
    } finally {
      testingConnection.value = false
    }
  }

  async function savePlatform() {
    if (!validatePlatformForm()) return
    try {
      savingPlatform.value = true
      const payload = normalizePlatform(platformForm.value)
      let res
      if (editingPlatform.value && editingPlatform.value.id) {
        res = await apiClient.put(`/admin/webhook/platforms/${editingPlatform.value.id}`, payload)
      } else {
        res = await apiClient.post('/admin/webhook/platforms', payload)
      }
      if (res && res.success) {
        showToast('平台已保存', 'success')
        showPlatformModal.value = false
        await loadWebhookConfig()
      }
    } catch (e) {
      showToast('保存失败', 'error')
    } finally {
      savingPlatform.value = false
    }
  }

  async function sendTestNotification() {
    try {
      const res = await apiClient.post('/admin/webhook/test-notification')
      if (res && res.success) showToast('测试通知已发送', 'success')
    } catch (e) {
      showToast('发送失败', 'error')
    }
  }

  function normalizePlatform(src) {
    const obj = { ...src }
    if (obj.type === 'smtp') {
      if (typeof obj.to === 'string') {
        obj.to = obj.to
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      }
    }
    return obj
  }

  return {
    // state
    webhookConfig,
    showPlatformModal,
    editingPlatform,
    platformForm,
    testingConnection,
    savingPlatform,
    // actions
    loadWebhookConfig,
    saveWebhookConfig,
    openAddPlatform,
    editPlatform,
    deletePlatform,
    togglePlatform,
    testPlatformForm,
    savePlatform,
    sendTestNotification,
    // helpers
    getNotificationTypeName,
    getNotificationTypeDescription,
    getPlatformIcon,
    getPlatformName,
    getWebhookHint
  }
}
