// API Stats 专用 API 客户端
// 与管理员 API 隔离，不需要认证

class ApiStatsClient {
  constructor() {
    this.baseURL = window.location.origin
    // 开发环境需要为 admin 路径添加 /webapi 前缀
    this.isDev = import.meta.env.DEV
  }

  async request(url, options = {}) {
    try {
      const needsPrefix = url.startsWith('/admin')
      const buildUrl = (usePrefix) =>
        `${this.baseURL}${usePrefix ? '/webapi' : ''}${url}`

      // 首次尝试：在开发环境为 /admin 加前缀
      const firstUrl = this.isDev && needsPrefix ? buildUrl(true) : buildUrl(false)
      let response = await fetch(firstUrl, {
        headers: {
          'Content-Type': 'application/json',
          ...options.headers
        },
        ...options
      })

      // 如果 404 且是 /admin 路径，尝试切换前缀重试一次（兼容未挂载 /webapi 别名的情况）
      if (response.status === 404 && needsPrefix) {
        const secondUrl = firstUrl.includes('/webapi/') ? buildUrl(false) : buildUrl(true)
        response = await fetch(secondUrl, {
          headers: {
            'Content-Type': 'application/json',
            ...options.headers
          },
          ...options
        })
      }

      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(data.message || `请求失败: ${response.status}`)
      }

      return data
    } catch (error) {
      console.error('API Stats request error:', error)
      throw error
    }
  }

  // 获取 API Key ID
  async getKeyId(apiKey) {
    return this.request('/apiStats/api/get-key-id', {
      method: 'POST',
      body: JSON.stringify({ apiKey })
    })
  }

  // 获取用户统计数据
  async getUserStats(apiId) {
    return this.request('/apiStats/api/user-stats', {
      method: 'POST',
      body: JSON.stringify({ apiId })
    })
  }

  // 获取模型使用统计
  async getUserModelStats(apiId, period = 'daily') {
    return this.request('/apiStats/api/user-model-stats', {
      method: 'POST',
      body: JSON.stringify({ apiId, period })
    })
  }

  // 获取 OEM 设置（用于网站名称和图标）
  async getOemSettings() {
    try {
      return await this.request('/admin/oem-settings')
    } catch (error) {
      console.error('Failed to load OEM settings:', error)
      return {
        success: true,
        data: {
          siteName: 'AI Relay Service',
          siteIcon: '',
          siteIconData: ''
        }
      }
    }
  }

  // 批量查询统计数据
  async getBatchStats(apiIds) {
    return this.request('/apiStats/api/batch-stats', {
      method: 'POST',
      body: JSON.stringify({ apiIds })
    })
  }

  // 批量查询模型统计
  async getBatchModelStats(apiIds, period = 'daily') {
    return this.request('/apiStats/api/batch-model-stats', {
      method: 'POST',
      body: JSON.stringify({ apiIds, period })
    })
  }

  // 获取产品套餐（公开）
  async getProductSettings() {
    return this.request('/admin/product-settings')
  }

  // 虎皮椒 - 订单查询
  async queryXunhu(payload) {
    return this.request('/admin/xunhu/query', {
      method: 'POST',
      body: JSON.stringify(payload)
    })
  }

  // 获取订单状态
  async getOrder(id) {
    return this.request(`/admin/orders/${encodeURIComponent(id)}`)
  }
}

export const apiStatsClient = new ApiStatsClient()
