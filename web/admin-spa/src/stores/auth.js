import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import router from '@/router'
import { apiClient } from '@/config/api'

export const useAuthStore = defineStore('auth', () => {
  // 状态
  const isLoggedIn = ref(false)
  // 优先从 sessionStorage 读取，其次从 localStorage 读取
  const authToken = ref(
    (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('authToken')) ||
      (typeof localStorage !== 'undefined' && localStorage.getItem('authToken')) ||
      ''
  )
  const username = ref('')
  const loginError = ref('')
  const loginLoading = ref(false)
  const oemSettings = ref({
    siteName: 'AI Relay Service',
    siteIcon: '',
    siteIconData: '',
    faviconData: '',
    // 自定义复制模板与教程链接
    copyInfoTemplate: '',
    tutorialUrl: ''
  })
  const oemLoading = ref(true)

  // 计算属性
  const isAuthenticated = computed(() => !!authToken.value && isLoggedIn.value)
  const token = computed(() => authToken.value)
  const user = computed(() => ({ username: username.value }))

  // 方法
  async function login(credentials, options = {}) {
    const { remember = false } = options
    loginLoading.value = true
    loginError.value = ''

    try {
      // 仅向后端发送必需字段，避免发送 remember 等客户端参数
      const { username: u, password: p } = credentials || {}
      const result = await apiClient.post('/web/auth/login', { username: u, password: p })

      if (result.success) {
        authToken.value = result.token
        username.value = result.username || credentials.username
        isLoggedIn.value = true
        // 清理旧存储，避免同时存在
        try {
          localStorage.removeItem('authToken')
          sessionStorage.removeItem('authToken')
        } catch (e) {
          // 忽略存储清理失败（如无痕模式限制）
          console.debug('Auth storage cleanup skipped:', e)
        }
        // remember=true 使用 localStorage，默认使用 sessionStorage
        try {
          const storage = remember ? localStorage : sessionStorage
          storage.setItem('authToken', result.token)
        } catch (_) {
          // 回退到内存状态（authToken ref），即使存储失败也允许继续使用当前会话
        }

        await router.push('/dashboard')
      } else {
        loginError.value = result.message || '登录失败'
      }
    } catch (error) {
      loginError.value = error.message || '登录失败，请检查用户名和密码'
    } finally {
      loginLoading.value = false
    }
  }

  function logout() {
    isLoggedIn.value = false
    authToken.value = ''
    username.value = ''
    try {
      localStorage.removeItem('authToken')
      sessionStorage.removeItem('authToken')
    } catch (e) {
      // 忽略存储清理失败
      console.debug('Auth storage remove failed:', e)
    }
    router.push('/login')
  }

  function checkAuth() {
    if (authToken.value) {
      isLoggedIn.value = true
      // 验证token有效性
      verifyToken()
    }
  }

  async function verifyToken() {
    try {
      // 仅通过用户信息端点验证 token（避免无意义的 /admin/dashboard 调用）
      const userResult = await apiClient.get('/web/auth/user')
      if (userResult.success && userResult.user) {
        username.value = userResult.user.username
      } else {
        logout()
      }
    } catch (error) {
      // token 无效，需要重新登录
      logout()
    }
  }

  async function loadOemSettings() {
    oemLoading.value = true
    try {
      const result = await apiClient.get('/admin/oem-settings')
      if (result.success && result.data) {
        oemSettings.value = { ...oemSettings.value, ...result.data }

        // 设置favicon
        if (result.data.siteIconData || result.data.siteIcon) {
          const link = document.querySelector("link[rel*='icon']") || document.createElement('link')
          link.type = 'image/x-icon'
          link.rel = 'shortcut icon'
          link.href = result.data.siteIconData || result.data.siteIcon
          document.getElementsByTagName('head')[0].appendChild(link)
        }

        // 设置页面标题
        if (result.data.siteName) {
          document.title = `${result.data.siteName} - 管理后台`
        }
      }
    } catch (error) {
      console.error('加载OEM设置失败:', error)
    } finally {
      oemLoading.value = false
    }
  }

  return {
    // 状态
    isLoggedIn,
    authToken,
    username,
    loginError,
    loginLoading,
    oemSettings,
    oemLoading,

    // 计算属性
    isAuthenticated,
    token,
    user,

    // 方法
    login,
    logout,
    checkAuth,
    loadOemSettings
  }
})
