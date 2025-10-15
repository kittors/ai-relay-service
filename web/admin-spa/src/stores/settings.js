import { defineStore } from 'pinia'
import { ref } from 'vue'
import { apiClient } from '@/config/api'

export const useSettingsStore = defineStore('settings', () => {
  // 状态
  const oemSettings = ref({
    siteName: 'AI Relay Service',
    siteIcon: '',
    siteIconData: '',
    showAdminButton: true, // 控制管理后台按钮的显示
    // 自定义：复制配置信息的模板与教程链接
    // 模板可用占位符：{siteUrl}, {apiKey}
    copyInfoTemplate: '',
    tutorialUrl: '',
    updatedAt: null
  })

  const loading = ref(false)
  const saving = ref(false)

  // 产品配置
  const productSettings = ref({
    plans: [],
    updatedAt: null
  })

  // 移除自定义API请求方法，使用统一的apiClient

  // Actions
  const loadOemSettings = async () => {
    loading.value = true
    try {
      const result = await apiClient.get('/admin/oem-settings')

      if (result && result.success) {
        oemSettings.value = { ...oemSettings.value, ...result.data }

        // 应用设置到页面
        applyOemSettings()
      }

      return result
    } catch (error) {
      console.error('Failed to load OEM settings:', error)
      throw error
    } finally {
      loading.value = false
    }
  }

  const saveOemSettings = async (settings) => {
    saving.value = true
    try {
      const result = await apiClient.put('/admin/oem-settings', settings)

      if (result && result.success) {
        oemSettings.value = { ...oemSettings.value, ...result.data }

        // 应用设置到页面
        applyOemSettings()
      }

      return result
    } catch (error) {
      console.error('Failed to save OEM settings:', error)
      throw error
    } finally {
      saving.value = false
    }
  }

  const resetOemSettings = async () => {
    const defaultSettings = {
      siteName: 'AI Relay Service',
      siteIcon: '',
      siteIconData: '',
      showAdminButton: true,
      copyInfoTemplate: '',
      tutorialUrl: '',
      updatedAt: null
    }

    oemSettings.value = { ...defaultSettings }
    return await saveOemSettings(defaultSettings)
  }

  // 加载产品设置
  const loadProductSettings = async () => {
    loading.value = true
    try {
      const result = await apiClient.get('/admin/product-settings')
      if (result && result.success) {
        productSettings.value = {
          plans: Array.isArray(result.data?.plans) ? result.data.plans : [],
          updatedAt: result.data?.updatedAt || null
        }
      }
      return result
    } catch (error) {
      console.error('Failed to load product settings:', error)
      throw error
    } finally {
      loading.value = false
    }
  }

  // 保存产品设置
  const saveProductSettings = async (settings) => {
    saving.value = true
    try {
      const payload = {
        plans: Array.isArray(settings?.plans) ? settings.plans : productSettings.value.plans
      }
      const result = await apiClient.put('/admin/product-settings', payload)
      if (result && result.success) {
        productSettings.value = {
          plans: result.data?.plans || [],
          updatedAt: result.data?.updatedAt || new Date().toISOString()
        }
      }
      return result
    } catch (error) {
      console.error('Failed to save product settings:', error)
      throw error
    } finally {
      saving.value = false
    }
  }

  // 应用OEM设置到页面
  const applyOemSettings = () => {
    // 更新页面标题
    if (oemSettings.value.siteName) {
      document.title = `${oemSettings.value.siteName} - 管理后台`
    }

    // 更新favicon
    if (oemSettings.value.siteIconData || oemSettings.value.siteIcon) {
      const favicon = document.querySelector('link[rel="icon"]') || document.createElement('link')
      favicon.rel = 'icon'
      favicon.href = oemSettings.value.siteIconData || oemSettings.value.siteIcon
      if (!document.querySelector('link[rel="icon"]')) {
        document.head.appendChild(favicon)
      }
    }
  }

  // 格式化日期时间
  const formatDateTime = (dateString) => {
    if (!dateString) return ''
    return new Date(dateString).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
  }

  // 验证文件上传
  const validateIconFile = (file) => {
    const errors = []

    // 检查文件大小 (350KB)
    if (file.size > 350 * 1024) {
      errors.push('图标文件大小不能超过 350KB')
    }

    // 检查文件类型
    const allowedTypes = ['image/x-icon', 'image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml']
    if (!allowedTypes.includes(file.type)) {
      errors.push('不支持的文件类型，请选择 .ico, .png, .jpg 或 .svg 文件')
    }

    return {
      isValid: errors.length === 0,
      errors
    }
  }

  // 将文件转换为Base64
  const fileToBase64 = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (e) => resolve(e.target.result)
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  return {
    // State
    oemSettings,
    loading,
    saving,
    productSettings,

    // Actions
    loadOemSettings,
    saveOemSettings,
    resetOemSettings,
    loadProductSettings,
    saveProductSettings,
    applyOemSettings,
    formatDateTime,
    validateIconFile,
    fileToBase64
  }
})
