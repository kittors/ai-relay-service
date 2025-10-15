import { defineStore } from 'pinia'
import axios from 'axios'
import { showToast } from '@/utils/toast'
import { API_PREFIX } from '@/config/api'

const API_BASE = `${API_PREFIX}/users`

export const useUserStore = defineStore('user', {
  state: () => ({
    user: null,
    isAuthenticated: false,
    sessionToken: null,
    loading: false,
    config: null
  }),

  getters: {
    isLoggedIn: (state) => state.isAuthenticated && state.user,
    userName: (state) => state.user?.displayName || state.user?.username,
    userRole: (state) => state.user?.role
  },

  actions: {
    // 🔐 用户登录
    async login(credentials, options = {}) {
      const { remember = false } = options
      this.loading = true
      try {
        // 仅发送必要字段
        const { username, password } = credentials || {}
        const response = await axios.post(`${API_BASE}/login`, { username, password })

        if (response.data.success) {
          this.user = response.data.user
          this.sessionToken = response.data.sessionToken
          this.isAuthenticated = true

          // 清理旧存储
          try {
            localStorage.removeItem('userToken')
            localStorage.removeItem('userData')
            localStorage.removeItem('userConfig')
            sessionStorage.removeItem('userToken')
            sessionStorage.removeItem('userData')
            sessionStorage.removeItem('userConfig')
          } catch (e) {
            // 忽略无痕模式等导致的存储清理失败
            console.debug('User storage cleanup skipped:', e)
          }

          // 选择存储位置：remember 使用 localStorage，否则使用 sessionStorage
          try {
            const storage = remember ? localStorage : sessionStorage
            storage.setItem('userToken', this.sessionToken)
            storage.setItem('userData', JSON.stringify(this.user))
          } catch (e) {
            // 忽略存储写入失败（继续使用内存中的状态）
            console.debug('User storage write skipped:', e)
          }

          // 设置 axios 默认头部
          this.setAuthHeader()

          return response.data
        } else {
          throw new Error(response.data.message || 'Login failed')
        }
      } catch (error) {
        this.clearAuth()
        throw error
      } finally {
        this.loading = false
      }
    },

    // 🚪 用户登出
    async logout() {
      try {
        if (this.sessionToken) {
          await axios.post(
            `${API_BASE}/logout`,
            {},
            {
              headers: { 'x-user-token': this.sessionToken }
            }
          )
        }
      } catch (error) {
        console.error('Logout request failed:', error)
      } finally {
        this.clearAuth()
      }
    },

    // 🔄 检查认证状态
    async checkAuth() {
      // 优先从 sessionStorage 读取，其次从 localStorage 读取
      const token = sessionStorage.getItem('userToken') || localStorage.getItem('userToken')
      const userData = sessionStorage.getItem('userData') || localStorage.getItem('userData')
      const userConfig = sessionStorage.getItem('userConfig') || localStorage.getItem('userConfig')

      if (!token || !userData) {
        this.clearAuth()
        return false
      }

      try {
        this.sessionToken = token
        this.user = JSON.parse(userData)
        this.config = userConfig ? JSON.parse(userConfig) : null
        this.isAuthenticated = true
        this.setAuthHeader()

        // 验证 token 是否仍然有效
        await this.getUserProfile()
        return true
      } catch (error) {
        console.error('Auth check failed:', error)
        this.clearAuth()
        return false
      }
    },

    // 👤 获取用户资料
    async getUserProfile() {
      try {
        const response = await axios.get(`${API_BASE}/profile`)

        if (response.data.success) {
          this.user = response.data.user
          this.config = response.data.config
          // 根据现有 token 所在存储选择写入位置
          const storage = sessionStorage.getItem('userToken') ? sessionStorage : localStorage
          storage.setItem('userData', JSON.stringify(this.user))
          storage.setItem('userConfig', JSON.stringify(this.config))
          return response.data.user
        }
      } catch (error) {
        if (error.response?.status === 401 || error.response?.status === 403) {
          // 401: Invalid/expired session, 403: Account disabled
          this.clearAuth()
          // If it's a disabled account error, throw a specific error
          if (error.response?.status === 403) {
            throw new Error(error.response.data?.message || 'Your account has been disabled')
          }
        }
        throw error
      }
    },

    // 🔑 获取用户API Keys
    async getUserApiKeys(includeDeleted = false) {
      try {
        const params = {}
        if (includeDeleted) {
          params.includeDeleted = 'true'
        }
        const response = await axios.get(`${API_BASE}/api-keys`, { params })
        return response.data.success ? response.data.apiKeys : []
      } catch (error) {
        console.error('Failed to fetch API keys:', error)
        throw error
      }
    },

    // 🔑 创建API Key
    async createApiKey(keyData) {
      try {
        const response = await axios.post(`${API_BASE}/api-keys`, keyData)
        return response.data
      } catch (error) {
        console.error('Failed to create API key:', error)
        throw error
      }
    },

    // 🗑️ 删除API Key
    async deleteApiKey(keyId) {
      try {
        const response = await axios.delete(`${API_BASE}/api-keys/${keyId}`)
        return response.data
      } catch (error) {
        console.error('Failed to delete API key:', error)
        throw error
      }
    },

    // 📊 获取使用统计
    async getUserUsageStats(params = {}) {
      try {
        const response = await axios.get(`${API_BASE}/usage-stats`, { params })
        return response.data.success ? response.data.stats : null
      } catch (error) {
        console.error('Failed to fetch usage stats:', error)
        throw error
      }
    },

    // 🧹 清除认证信息
    clearAuth() {
      this.user = null
      this.sessionToken = null
      this.isAuthenticated = false
      this.config = null

      try {
        localStorage.removeItem('userToken')
        localStorage.removeItem('userData')
        localStorage.removeItem('userConfig')
        sessionStorage.removeItem('userToken')
        sessionStorage.removeItem('userData')
        sessionStorage.removeItem('userConfig')
      } catch (e) {
        // 忽略存储清理失败
        console.debug('User storage remove failed:', e)
      }

      // 清除 axios 默认头部
      delete axios.defaults.headers.common['x-user-token']
    },

    // 🔧 设置认证头部
    setAuthHeader() {
      if (this.sessionToken) {
        axios.defaults.headers.common['x-user-token'] = this.sessionToken
      }
    },

    // 🔧 设置axios拦截器
    setupAxiosInterceptors() {
      // Response interceptor to handle disabled user responses globally
      axios.interceptors.response.use(
        (response) => response,
        (error) => {
          if (error.response?.status === 403) {
            const message = error.response.data?.message
            if (message && (message.includes('disabled') || message.includes('Account disabled'))) {
              this.clearAuth()
              showToast(message, 'error')
              // Redirect to login page
              if (window.location.pathname !== '/user-login') {
                window.location.href = '/user-login'
              }
            }
          }
          return Promise.reject(error)
        }
      )
    }
  }
})
