import { ref, computed, watch } from 'vue'
import { showToast } from '@/utils/toast'
import { apiClient } from '@/config/api'
import { useAuthStore } from '@/stores/auth'
// 前端不再生成表格，改由后端导出

export function useApiKeys() {
  // Stores
  const authStore = useAuthStore()

  // Data
  const apiKeys = ref([]) // 当前页数据
  const apiKeysLoading = ref(false)
  const deletedApiKeys = ref([])
  const deletedApiKeysLoading = ref(false)
  const deletedTotal = ref(0)
  const deletedCurrentPage = ref(1)
  const deletedPageSize = ref(Number(localStorage.getItem('deletedApiKeysPageSize') || 10))
  const deletedPageSizeOptions = [10, 20, 50, 100]
  // 游标/页号分页与筛选缓存
  const pages = ref([]) // 1-based: pages[1] = { cursor, nextCursor, finished, items, page, pageSize, total? }
  const serverTotal = ref(0)
  const currentCursor = ref('0')
  const nextCursor = ref('0')
  const finishedCurrent = ref(false)
  const currentDateFilter = ref({ type: 'preset', preset: 'today', customStart: '', customEnd: '' })

  // Accounts for binding display
  const accounts = ref({
    claude: [],
    gemini: [],
    openai: [],
    openaiResponses: [],
    azureOpenai: [],
    bedrock: [],
    droid: [],
    claudeGroups: [],
    geminiGroups: [],
    openaiGroups: [],
    droidGroups: []
  })
  const accountsLoaded = ref(false)

  const isLdapEnabled = computed(() => authStore.oemSettings?.ldapEnabled || false)

  // Filters
  const selectedTagFilter = ref('')
  const availableTags = ref([])
  const searchKeyword = ref('')
  const searchMode = ref('apiKey') // apiKey | bindingAccount（后端统一使用 search 关键字）
  const activationFilter = ref('') // '' | 'true' | 'false'

  const tagOptions = computed(() => {
    const options = [{ value: '', label: '所有标签' }]
    availableTags.value.forEach((tag) => options.push({ value: tag, label: tag }))
    return options
  })

  // Sort and pagination
  const apiKeysSortBy = ref('periodTokens')
  const apiKeysSortOrder = ref('desc')
  const currentPage = ref(1)
  const pageSize = ref(Number(localStorage.getItem('apiKeysPageSize') || 10))
  const pageSizeOptions = [10, 20, 50, 100]
  const onPageSizeChange = (val) => {
    pageSize.value = val
    localStorage.setItem('apiKeysPageSize', String(val))
    resetPagination()
    void loadApiKeys(currentDateFilter.value, { reset: true })
  }

  const onDeletedPageSizeChange = (val) => {
    deletedPageSize.value = val
    localStorage.setItem('deletedApiKeysPageSize', String(val))
    deletedCurrentPage.value = 1
    void loadDeletedApiKeys()
  }

  // Selection
  const showCheckboxes = ref(false)
  const selectedApiKeys = ref([])
  const toggleSelectionMode = () => {
    showCheckboxes.value = !showCheckboxes.value
    if (!showCheckboxes.value) {
      selectedApiKeys.value = []
    }
  }

  // Utils: bindings
  const getBoundAccountName = (accountId) => {
    if (!accountId) return '未知账户'
    if (accountId.startsWith('group:')) {
      const groupId = accountId.substring(6)
      const findByPlatform = (list) => list.find((g) => g.id === groupId)
      const c = findByPlatform(accounts.value.claudeGroups)
      if (c) return `分组-${c.name}`
      const g = findByPlatform(accounts.value.geminiGroups)
      if (g) return `分组-${g.name}`
      const o = findByPlatform(accounts.value.openaiGroups)
      if (o) return `分组-${o.name}`
      const d = findByPlatform(accounts.value.droidGroups)
      if (d) return `分组-${d.name}`
      return `分组-${groupId.substring(0, 8)}`
    }
    const findById = (arr) => arr.find((acc) => acc.id === accountId)
    const c = findById(accounts.value.claude)
    if (c) return `${c.name}`
    const g = findById(accounts.value.gemini)
    if (g) return `${g.name}`
    const o = findById(accounts.value.openai)
    if (o) return `${o.name}`
    const r = findById(accounts.value.openaiResponses)
    if (r) return `${r.name}`
    const b = findById(accounts.value.bedrock)
    if (b) return `${b.name}`
    const d = findById(accounts.value.droid)
    if (d) return `${d.name}`
    return `${accountId.substring(0, 8)}...`
  }

  const getClaudeBindingInfo = (key) => {
    if (key.claudeAccountId || key.claudeConsoleAccountId) {
      const id = key.claudeAccountId || key.claudeConsoleAccountId
      const info = getBoundAccountName(id)
      if (id.startsWith('group:')) return info
      const account = accounts.value.claude.find((acc) => acc.id === id)
      if (!account) return `⚠️ ${info} (账户不存在)`
      if (account.accountType === 'dedicated') return `🔒 专属-${info}`
      return info
    }
    return ''
  }

  const getGeminiBindingInfo = (key) => {
    if (key.geminiAccountId) {
      const info = getBoundAccountName(key.geminiAccountId)
      if (key.geminiAccountId.startsWith('group:')) return info
      const account = accounts.value.gemini.find((acc) => acc.id === key.geminiAccountId)
      if (!account) return `⚠️ ${info} (账户不存在)`
      if (account.accountType === 'dedicated') return `🔒 专属-${info}`
      return info
    }
    return ''
  }

  const getOpenAIBindingInfo = (key) => {
    if (key.openaiAccountId) {
      const info = getBoundAccountName(key.openaiAccountId)
      if (key.openaiAccountId.startsWith('group:')) return info
      let account = accounts.value.openai.find((acc) => acc.id === key.openaiAccountId)
      if (!account) account = accounts.value.openaiResponses.find((acc) => acc.id === key.openaiAccountId)
      if (!account) return `⚠️ ${info} (账户不存在)`
      if (account.accountType === 'dedicated') return `🔒 专属-${info}`
      return info
    }
    return ''
  }

  const getBedrockBindingInfo = (key) => {
    if (key.bedrockAccountId) {
      const info = getBoundAccountName(key.bedrockAccountId)
      if (key.bedrockAccountId.startsWith('group:')) return info
      const account = accounts.value.bedrock.find((acc) => acc.id === key.bedrockAccountId)
      if (!account) return `⚠️ ${info} (账户不存在)`
      if (account.accountType === 'dedicated') return `🔒 专属-${info}`
      return info
    }
    return ''
  }

  const getDroidBindingInfo = (key) => {
    if (key.droidAccountId) {
      const info = getBoundAccountName(key.droidAccountId)
      if (key.droidAccountId.startsWith('group:')) return info
      const account = accounts.value.droid.find((acc) => acc.id === key.droidAccountId)
      if (!account) return `⚠️ ${info} (账户不存在)`
      if (account.accountType === 'dedicated') return `🔒 专属-${info}`
      return info
    }
    return ''
  }

  const getBindingDisplayStrings = (key) => {
    // 仅用于展示：每个平台输出一条合成标签，如："OpenAI 分组-codeX1"
    const sanitize = (text) =>
      typeof text === 'string' ? text.replace(/^⚠️\s*/, '').replace(/^🔒\s*/, '').trim() : ''
    const out = []

    if (key.claudeAccountId || key.claudeConsoleAccountId) {
      const info = sanitize(getClaudeBindingInfo(key))
      out.push(info ? `Claude ${info}` : 'Claude')
    }
    if (key.geminiAccountId) {
      const info = sanitize(getGeminiBindingInfo(key))
      out.push(info ? `Gemini ${info}` : 'Gemini')
    }
    if (key.openaiAccountId) {
      const info = sanitize(getOpenAIBindingInfo(key))
      out.push(info ? `OpenAI ${info}` : 'OpenAI')
    }
    if (key.bedrockAccountId) {
      const info = sanitize(getBedrockBindingInfo(key))
      out.push(info ? `Bedrock ${info}` : 'Bedrock')
    }
    if (key.droidAccountId) {
      const info = sanitize(getDroidBindingInfo(key))
      out.push(info ? `Droid ${info}` : 'Droid')
    }

    if (
      !key.claudeAccountId &&
      !key.claudeConsoleAccountId &&
      !key.geminiAccountId &&
      !key.openaiAccountId &&
      !key.bedrockAccountId &&
      !key.droidAccountId
    ) {
      out.push('共享池')
    }

    return out
  }

  // 列表的 search/tag 由后端处理，这里仅对当前页做排序

  const sortedApiKeys = computed(() => {
    const list = [...apiKeys.value]
    const by = apiKeysSortBy.value
    const order = apiKeysSortOrder.value === 'asc' ? 1 : -1
    const getVal = (k) => {
      switch (by) {
        case 'name':
          return k.name || ''
        case 'periodTokens':
          return getUsageForSort(k).tokens || getUsageForSort(k).allTokens || 0
        case 'periodRequests':
          return getUsageForSort(k).requests || 0
        case 'lastUsedAt':
          return k.lastUsedAt ? new Date(k.lastUsedAt).getTime() : 0
        case 'createdAt':
          return k.createdAt ? new Date(k.createdAt).getTime() : 0
        case 'expiresAt':
          return k.expiresAt ? new Date(k.expiresAt).getTime() : 0
        default:
          return getUsageForSort(k).tokens || 0
      }
    }
    list.sort((a, b) => {
      const va = getVal(a)
      const vb = getVal(b)
      if (va === vb) return 0
      return va > vb ? order : -order
    })
    return list
  })
  // 估算/返回总数：优先使用后端提供的 total
  const totalEstimated = computed(() => {
    if (serverTotal.value && serverTotal.value > 0) return serverTotal.value
    const pageInfo = pages.value[currentPage.value]
    if (!pageInfo) return 0
    if (pageInfo.finished) {
      return (currentPage.value - 1) * pageSize.value + (pageInfo.items?.length || 0)
    }
    return currentPage.value * pageSize.value + 1
  })
  const totalPages = computed(() => Math.max(1, Math.ceil(totalEstimated.value / pageSize.value)))
  const paginatedApiKeys = computed(() => sortedApiKeys.value)

  const sortApiKeys = (field) => {
    if (apiKeysSortBy.value === field) {
      apiKeysSortOrder.value = apiKeysSortOrder.value === 'asc' ? 'desc' : 'asc'
    } else {
      apiKeysSortBy.value = field
      apiKeysSortOrder.value = 'asc'
    }
  }

  // Loaders
  const loadAccounts = async () => {
    try {
      const resp = await apiClient.get('/admin/accounts/aggregated', {
        params: { fields: 'summary', compact: 'true' }
      })
      if (!resp?.success) return

      const data = resp.data || {}
      const claudeAccounts = []

      // 合并 Claude OAuth 与 Console 账户，并标注平台与专属标记
      ;(data.claudeAccounts || []).forEach((account) => {
        claudeAccounts.push({
          ...account,
          platform: 'claude-oauth',
          isDedicated: account.accountType === 'dedicated'
        })
      })
      ;(data.claudeConsoleAccounts || []).forEach((account) => {
        claudeAccounts.push({
          ...account,
          platform: 'claude-console',
          isDedicated: account.accountType === 'dedicated'
        })
      })
      accounts.value.claude = claudeAccounts

      accounts.value.gemini = (data.geminiAccounts || []).map((a) => ({
        ...a,
        isDedicated: a.accountType === 'dedicated'
      }))
      accounts.value.openai = (data.openaiAccounts || []).map((a) => ({
        ...a,
        isDedicated: a.accountType === 'dedicated'
      }))
      accounts.value.openaiResponses = (data.openaiResponsesAccounts || []).map((a) => ({
        ...a,
        isDedicated: a.accountType === 'dedicated'
      }))
      accounts.value.azureOpenai = (data.azureOpenaiAccounts || []).map((a) => ({
        ...a,
        isDedicated: a.accountType === 'dedicated'
      }))
      accounts.value.bedrock = (data.bedrockAccounts || []).map((a) => ({
        ...a,
        isDedicated: a.accountType === 'dedicated'
      }))
      accounts.value.droid = (data.droidAccounts || []).map((a) => ({
        ...a,
        platform: 'droid',
        isDedicated: a.accountType === 'dedicated'
      }))

      const allGroups = data.accountGroups || []
      accounts.value.claudeGroups = allGroups.filter((g) => g.platform === 'claude')
      accounts.value.geminiGroups = allGroups.filter((g) => g.platform === 'gemini')
      accounts.value.openaiGroups = allGroups.filter((g) => g.platform === 'openai')
      accounts.value.droidGroups = allGroups.filter((g) => g.platform === 'droid')

      accountsLoaded.value = true
    } catch (e) {
      // 即使拉取失败，也不阻塞页面其它功能
      accountsLoaded.value = true
    }
  }

  const ensureAccountsLoaded = async (force = false) => {
    if (force || !accountsLoaded.value) {
      await loadAccounts()
    }
  }

  // 同步刷新：并发请求账户摘要与 Key 列表，等待两者全部完成
  const refreshKeysAndAccounts = async (filter, opts = {}) => {
    const forceAccounts = opts.forceAccounts || opts.reset || !accountsLoaded.value
    const tasks = []
    if (forceAccounts) {
      tasks.push(loadAccounts())
    }
    tasks.push(loadApiKeys(filter, opts))
    await Promise.all(tasks)
  }

  // 加载标签（后端聚合）
  const loadAvailableTags = async () => {
    try {
      const resp = await apiClient.get('/admin/api-keys/tags')
      if (resp.success) {
        availableTags.value = (resp.data || []).sort()
      }
    } catch (e) {
      // ignore
    }
  }

  function resetPagination() {
    pages.value = []
    currentCursor.value = '0'
    nextCursor.value = '0'
    finishedCurrent.value = false
    apiKeys.value = []
    currentPage.value = 1
    serverTotal.value = 0
  }

  const fetchListPage = async (pageNo, size, filterForUsage, { wantTotal = false } = {}) => {
    const params = {
      pageNum: pageNo,
      pageSize: size,
      includeDeleted: 'false',
      search: searchKeyword.value || '',
      tag: selectedTagFilter.value || '',
      activated: activationFilter.value || '',
      includeUsage: 'true',
      withTotal: wantTotal ? 'true' : 'false'
    }
    // 携带时间范围以便后端聚合 usage
    if (filterForUsage) {
      if (filterForUsage.type === 'custom') {
        params.timeRange = 'custom'
        params.startDate = filterForUsage.customStart
        params.endDate = filterForUsage.customEnd
      } else if (filterForUsage.preset) {
        params.timeRange = filterForUsage.preset === '30days' ? '30days' : filterForUsage.preset
      } else {
        params.timeRange = 'today'
      }
    }
    const resp = await apiClient.get('/admin/api-keys/list', { params })
    if (!resp.success) {
      throw new Error(resp.error || 'Failed to list API keys')
    }
    return resp.data
  }

  const fetchUsageForItems = async (items, filter) => {
    if (!items || items.length === 0) return {}
    const ids = items.map((i) => i.id).join(',')
    const params = { ids }
    if (filter && filter.type === 'custom') {
      params.timeRange = 'custom'
      params.startDate = filter.customStart
      params.endDate = filter.customEnd
    } else if (filter && filter.preset) {
      params.timeRange = filter.preset === '30days' ? '30days' : filter.preset
    } else {
      params.timeRange = 'today'
    }
    const resp = await apiClient.get('/admin/api-keys/usage-batch', { params })
    if (!resp.success) {
      throw new Error(resp.error || 'Failed to get usage batch')
    }
    return resp.data || {}
  }

  const getUsageForSort = (row) => {
    const f = currentDateFilter.value || { type: 'preset', preset: 'today' }
    const usage = row.usage || {}
    const preset = f.type === 'custom' ? 'custom' : f.preset || 'today'
    switch (preset) {
      case 'today':
        return usage.today || usage.daily || usage.total || {}
      case '7days':
        return usage.weekly || usage.daily || usage.total || {}
      case '30days':
      case 'monthly':
        return usage.monthly || usage.total || {}
      case 'all':
      case 'custom':
      default:
        return usage.total || {}
    }
  }

  // 主入口：加载列表页 + 批量用量
  const loadApiKeys = async (filter, opts = {}) => {
    apiKeysLoading.value = true
    try {
      if (filter) {
        currentDateFilter.value = {
          type: filter.type,
          preset: filter.preset,
          customStart: filter.customStart,
          customEnd: filter.customEnd
        }
      }

      if (opts.reset) {
        resetPagination()
      }

      if (pages.value[currentPage.value]) {
        const pageInfo = pages.value[currentPage.value]
        apiKeys.value = [...pageInfo.items]
        currentCursor.value = pageInfo.cursor || '0'
        nextCursor.value = pageInfo.nextCursor || '0'
        finishedCurrent.value = Boolean(pageInfo.finished)
      } else {
        const wantTotal = currentPage.value === 1
        const data = await fetchListPage(
          currentPage.value,
          pageSize.value,
          currentDateFilter.value,
          { wantTotal }
        )
        const items = data.items || []
        if (wantTotal && typeof data.total === 'number') {
          serverTotal.value = data.total
        }
        const pageInfo = {
          cursor: data.cursor || '0',
          nextCursor: data.cursor || '0',
          finished: Boolean(
            typeof data.total === 'number'
              ? currentPage.value * pageSize.value >= data.total
              : data.finished
          ),
          items,
          page: data.page || currentPage.value,
          pageSize: data.pageSize || pageSize.value,
          total: typeof data.total === 'number' ? data.total : undefined
        }
        pages.value[currentPage.value] = pageInfo
        apiKeys.value = [...items]
        currentCursor.value = pageInfo.cursor
        nextCursor.value = pageInfo.nextCursor
        finishedCurrent.value = pageInfo.finished
      }
      // usage 已由后端聚合并注入 items
    } catch (e) {
      showToast('加载 API Keys 失败', 'error')
    } finally {
      apiKeysLoading.value = false
    }
  }

  const loadDeletedApiKeys = async () => {
    deletedApiKeysLoading.value = true
    try {
      const resp = await apiClient.get('/admin/api-keys/deleted', {
        params: { pageNum: deletedCurrentPage.value, pageSize: deletedPageSize.value }
      })
      if (resp.success) {
        deletedApiKeys.value = resp.apiKeys || []
        deletedTotal.value = resp.total || 0
      }
    } catch (e) {
      showToast('加载已删除的 API Keys 失败', 'error')
    } finally {
      deletedApiKeysLoading.value = false
    }
  }

  // Actions
  const openCreateApiKeyModal = async () => {
    await ensureAccountsLoaded()
    showCreateApiKeyModal.value = true
  }
  const openEditApiKeyModal = async (apiKey) => {
    // 立即打开弹窗；内部自行拉取账户/标签/用户并显示加载遮罩
    editingApiKey.value = apiKey
    showEditApiKeyModal.value = true
  }
  const openRenewApiKeyModal = (apiKey) => {
    renewingApiKey.value = apiKey
    showRenewApiKeyModal.value = true
  }
  const openBatchEditModal = async () => {
    await ensureAccountsLoaded()
    showBatchEditModal.value = true
  }

  const handleCreateSuccess = async () => {
    showToast('创建成功', 'success')
  }
  const handleEditSuccess = async () => {
    showToast('保存成功', 'success')
    // 保存成功后刷新当前列表（保持现有筛选与分页语义：重置到第一页）
    resetPagination()
    await loadApiKeys(currentDateFilter.value, { reset: true })
  }
  const handleRenewSuccess = async () => {
    showToast('续期成功', 'success')
  }
  const handleBatchCreateSuccess = async () => {
    showToast('批量创建成功', 'success')
  }
  const handleBatchEditSuccess = async () => {
    showToast('批量编辑成功', 'success')
  }

  // Expiry edit & details
  const editingExpiryKey = ref(null)
  const expiryEditModalRef = ref(null)
  const startEditExpiry = (apiKey) => {
    editingExpiryKey.value = { ...apiKey }
  }
  const closeExpiryEdit = () => {
    editingExpiryKey.value = null
  }
  const handleSaveExpiry = async () => {
    showToast('已保存过期时间', 'success')
    closeExpiryEdit()
  }
  const showUsageDetailModal = ref(false)
  const selectedApiKeyForDetail = ref(null)
  const showUsageDetails = async (apiKey) => {
    // 先显示基础信息
    selectedApiKeyForDetail.value = { ...apiKey }
    showUsageDetailModal.value = true
    try {
      const resp = await apiClient.get(`/admin/api-keys/${apiKey.id}/usage`)
      if (resp.success) {
        const data = resp.data || {}
        selectedApiKeyForDetail.value = {
          ...apiKey,
          usage: data.usage || apiKey.usage || {},
          dailyCost: data.dailyCost ?? apiKey.dailyCost,
          weeklyOpusCost: data.weeklyOpusCost ?? apiKey.weeklyOpusCost
        }
      }
    } catch (e) {
      // 保持弹窗打开，仅提示
      showToast('加载使用详情失败', 'error')
    }
  }

  const deleteApiKey = async (apiKey) => {
    try {
      let confirmed = false
      if (window && typeof window.confirm === 'function') {
        confirmed = window.confirm('确定要删除这个 API Key 吗？此操作不可恢复。')
      }
      if (!confirmed) return
      const data = await apiClient.delete(`/admin/api-keys/${apiKey.id}`)
      if (data.success) {
        showToast('API Key 已删除', 'success')
        // 立即从列表中移除
        apiKeys.value = apiKeys.value.filter((k) => k.id !== apiKey.id)
      } else {
        showToast(data.error || '删除失败', 'error')
      }
    } catch (e) {
      showToast(e.response?.data?.error || '删除失败', 'error')
    }
  }

  const batchDeleteApiKeys = async () => {
    const ids = [...selectedApiKeys.value]
    if (ids.length === 0) return
    let confirmed = false
    if (window && typeof window.confirm === 'function') {
      confirmed = window.confirm(`确定要删除选中的 ${ids.length} 个 API Key 吗？此操作不可恢复。`)
    }
    if (!confirmed) return
    let successCount = 0
    for (const id of ids) {
      try {
        const data = await apiClient.delete(`/admin/api-keys/${id}`)
        if (data.success) {
          successCount += 1
          apiKeys.value = apiKeys.value.filter((k) => k.id !== id)
        }
      } catch (e) {
        // ignore individual failures but mark as used for lint
        const _ = e
      }
    }
    if (successCount > 0) showToast(`已删除 ${successCount} 个 API Key`, 'success')
    selectedApiKeys.value = []
  }

  const purgeDeletedApiKey = async (apiKeyId) => {
    try {
      let confirmed = false
      if (window && typeof window.confirm === 'function') {
        confirmed = window.confirm('确定要彻底删除这个 API Key 吗？此操作不可恢复。')
      }
      if (!confirmed) return
      deletedApiKeysLoading.value = true
      const data = await apiClient.delete(`/admin/api-keys/${apiKeyId}/purge`)
      if (data.success) {
        showToast('已彻底删除', 'success')
        // 更新总数并根据需要调整页码，然后刷新当前页
        deletedTotal.value = Math.max(0, (deletedTotal.value || 0) - 1)
        const maxPage = Math.max(1, Math.ceil(deletedTotal.value / deletedPageSize.value))
        if (deletedCurrentPage.value > maxPage) {
          deletedCurrentPage.value = maxPage
        }
        await loadDeletedApiKeys()
      } else {
        showToast(data.error || '删除失败', 'error')
      }
    } catch (e) {
      showToast(e.response?.data?.error || '删除失败', 'error')
    } finally {
      deletedApiKeysLoading.value = false
    }
  }

  const clearAllDeletedApiKeys = async () => {
    try {
      const count = deletedApiKeys.value.length
      let confirmed = false
      if (window && typeof window.confirm === 'function') {
        confirmed = window.confirm(`确定要彻底删除全部 ${count} 个已删除的 API Keys 吗？此操作不可恢复。`)
      }
      if (!confirmed) return
      deletedApiKeysLoading.value = true
      const data = await apiClient.delete('/admin/api-keys/deleted/clear-all')
      if (data.success) {
        showToast('已清空所有已删除的 API Keys', 'success')
        deletedApiKeys.value = []
        deletedTotal.value = 0
        deletedCurrentPage.value = 1
        await loadDeletedApiKeys()
      } else {
        showToast(data.error || '清空失败', 'error')
      }
    } catch (e) {
      showToast(e.response?.data?.error || '清空失败', 'error')
    } finally {
      deletedApiKeysLoading.value = false
    }
  }

  const restoreApiKey = async (apiKeyId) => {
    try {
      let confirmed = false
      if (window && typeof window.confirm === 'function') {
        confirmed = window.confirm('确定要恢复这个 API Key 吗？恢复后可以重新使用。')
      }
      if (!confirmed) return
      deletedApiKeysLoading.value = true
      const data = await apiClient.post(`/admin/api-keys/${apiKeyId}/restore`)
      if (data.success) {
        showToast('API Key 已成功恢复', 'success')
        // 更新总数并根据需要调整页码，然后刷新当前页
        deletedTotal.value = Math.max(0, (deletedTotal.value || 0) - 1)
        const maxPage = Math.max(1, Math.ceil(deletedTotal.value / deletedPageSize.value))
        if (deletedCurrentPage.value > maxPage) {
          deletedCurrentPage.value = maxPage
        }
        await loadDeletedApiKeys()
      } else {
        showToast(data.error || '恢复失败', 'error')
      }
    } catch (e) {
      showToast(e.response?.data?.error || '恢复失败', 'error')
    } finally {
      deletedApiKeysLoading.value = false
    }
  }

  const exportToExcel = async () => {
    try {
      const params = {
        search: searchKeyword.value || '',
        tag: selectedTagFilter.value || '',
        activated: activationFilter.value || ''
      }
      const resp = await apiClient.get('/admin/api-keys/export', { params })
      // handleResponse 返回的是 Response 对象（非 JSON），需要手动转 blob
      if (!resp || typeof resp.blob !== 'function') {
        throw new Error('Invalid export response')
      }
      const blob = await resp.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'api-keys.csv'
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)
    } catch (e) {
      showToast('导出失败', 'error')
    }
  }

  // Modals state
  const showCreateApiKeyModal = ref(false)
  const showEditApiKeyModal = ref(false)
  const showRenewApiKeyModal = ref(false)
  const showNewApiKeyModal = ref(false)
  const showBatchApiKeyModal = ref(false)
  const showBatchEditModal = ref(false)
  const editingApiKey = ref(null)
  const renewingApiKey = ref(null)
  const newApiKeyData = ref(null)
  const batchApiKeyData = ref([])

  // 初始仅加载标签；账号信息按需加载
  loadAvailableTags()

  // 监听筛选变化（后端过滤），重置并加载第一页
  watch([selectedTagFilter, searchKeyword, searchMode, activationFilter], () => {
    resetPagination()
    void loadApiKeys(currentDateFilter.value, { reset: true })
  })

  // 监听页码变化，按需加载
  watch(currentPage, async (newPage, oldPage) => {
    if (newPage === oldPage) return
    apiKeysLoading.value = true
    try {
      await loadApiKeys(currentDateFilter.value)
    } finally {
      apiKeysLoading.value = false
    }
  })

  // 监听已删除分页变化
  watch(deletedCurrentPage, async (newPage, oldPage) => {
    if (newPage === oldPage) return
    deletedApiKeysLoading.value = true
    try {
      await loadDeletedApiKeys()
    } finally {
      deletedApiKeysLoading.value = false
    }
  })

  return {
    // Data
    apiKeys,
    apiKeysLoading,
    deletedApiKeys,
    deletedApiKeysLoading,
    deletedTotal,
    deletedCurrentPage,
    deletedPageSize,
    deletedPageSizeOptions,
    accounts,
    isLdapEnabled,

    // Filters
    selectedTagFilter,
    availableTags,
    searchKeyword,
    searchMode,
    activationFilter,
    tagOptions,

    // Sort & page
    apiKeysSortBy,
    apiKeysSortOrder,
    currentPage,
    pageSize,
    pageSizeOptions,
    sortedApiKeys,
    paginatedApiKeys,
    totalPages,
    totalEstimated,
    onPageSizeChange,
    onDeletedPageSizeChange,
    sortApiKeys,

    // Selection
    showCheckboxes,
    selectedApiKeys,
    toggleSelectionMode,

    // Bindings
    getBindingDisplayStrings,

    // Modals
    showCreateApiKeyModal,
    showEditApiKeyModal,
    showRenewApiKeyModal,
    showNewApiKeyModal,
    showBatchApiKeyModal,
    showBatchEditModal,
    editingApiKey,
    renewingApiKey,
    newApiKeyData,
    batchApiKeyData,
    openCreateApiKeyModal,
    openEditApiKeyModal,
    openRenewApiKeyModal,
    openBatchEditModal,
    handleCreateSuccess,
    handleEditSuccess,
    handleRenewSuccess,
    handleBatchCreateSuccess,
    handleBatchEditSuccess,

    // Expiry & detail
    editingExpiryKey,
    expiryEditModalRef,
    startEditExpiry,
    closeExpiryEdit,
    handleSaveExpiry,
    showUsageDetailModal,
    selectedApiKeyForDetail,
    showUsageDetails,

    // API actions
    loadApiKeys,
    loadDeletedApiKeys,
    deleteApiKey,
    batchDeleteApiKeys,
    restoreApiKey,
    purgeDeletedApiKey,
    clearAllDeletedApiKeys,
    exportToExcel,
    ensureAccountsLoaded,
    refreshKeysAndAccounts,
    accountsLoaded
  }
}
