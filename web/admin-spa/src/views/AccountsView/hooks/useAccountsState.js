import { ref, computed, watch } from 'vue'

export function useAccountsState() {
  // basic lists
  const accounts = ref([])
  const accountsLoading = ref(false)

  // sorting
  const accountSortBy = ref('name')
  const accountsSortBy = ref('')
  const accountsSortOrder = ref('asc')

  // filters
  const apiKeys = ref([])
  const accountGroups = ref([])
  const groupFilter = ref('all')
  const platformFilter = ref('all')
  const searchKeyword = ref('')

  // pagination
  const PAGE_SIZE_STORAGE_KEY = 'accountsPageSize'
  const pageSizeOptions = [10, 20, 50, 100]
  const pageSize = ref(Number(localStorage.getItem(PAGE_SIZE_STORAGE_KEY) || 10))
  const currentPage = ref(1)
  const totalAccounts = ref(0)

  // selection
  const selectedAccounts = ref([])
  const showCheckboxes = ref(false)

  // create/edit modals
  const showCreateAccountModal = ref(false)
  const newAccountPlatform = ref(null)
  const showEditAccountModal = ref(false)
  const editingAccount = ref(null)

  // options
  const sortOptions = ref([
    { value: 'name', label: '按名称排序' },
    { value: 'dailyTokens', label: '按今日Token排序' },
    { value: 'dailyRequests', label: '按今日请求数排序' },
    { value: 'totalTokens', label: '按总Token排序' },
    { value: 'lastUsed', label: '按最后使用排序' }
  ])
  const platformOptions = ref([
    { value: 'all', label: '所有平台' },
    { value: 'claude', label: 'Claude' },
    { value: 'claude-console', label: 'Claude Console' },
    { value: 'gemini', label: 'Gemini' },
    { value: 'openai', label: 'OpenAI' },
    { value: 'azure_openai', label: 'Azure OpenAI' },
    { value: 'bedrock', label: 'Bedrock' },
    { value: 'openai-responses', label: 'OpenAI-Responses' },
    { value: 'ccr', label: 'CCR' },
    { value: 'droid', label: 'Droid' }
  ])
  const groupOptions = computed(() => {
    const options = [
      { value: 'all', label: '所有账户' },
      { value: 'ungrouped', label: '未分组账户' }
    ]
    accountGroups.value.forEach((group) => {
      const plat = group.platform === 'claude' ? 'Claude' : group.platform === 'gemini' ? 'Gemini' : group.platform === 'openai' ? 'OpenAI' : 'Droid'
      options.push({ value: group.id, label: `${group.name} (${plat})` })
    })
    return options
  })

  // utils
  const collectAccountSearchableStrings = (account) => {
    const values = new Set()
    const baseFields = [
      account?.name,
      account?.email,
      account?.accountName,
      account?.owner,
      account?.displayName,
      account?.username,
      account?.identifier,
      account?.alias,
      account?.title,
      account?.label
    ]
    baseFields.forEach((f) => {
      if (typeof f === 'string' && f.trim()) values.add(f.trim())
    })
    if (Array.isArray(account?.groupInfos)) {
      account.groupInfos.forEach((g) => {
        if (g && typeof g.name === 'string' && g.name.trim()) values.add(g.name.trim())
      })
    }
    Object.entries(account || {}).forEach(([k, v]) => {
      if (typeof v === 'string') {
        const lk = k.toLowerCase()
        if (lk.includes('name') || lk.includes('email')) {
          const t = v.trim()
          if (t) values.add(t)
        }
      }
    })
    return Array.from(values)
  }
  const accountMatchesKeyword = (account, normalizedKeyword) =>
    collectAccountSearchableStrings(account).some((v) => v.toLowerCase().includes(normalizedKeyword))

  // computed lists
  const sortedAccounts = computed(() => {
    let source = accounts.value
    const keyword = searchKeyword.value.trim().toLowerCase()
    if (keyword) source = source.filter((a) => accountMatchesKeyword(a, keyword))
    if (!accountsSortBy.value) return source
    const sorted = [...source].sort((a, b) => {
      let aVal = a[accountsSortBy.value]
      let bVal = b[accountsSortBy.value]
      if (accountsSortBy.value === 'dailyTokens') {
        aVal = a.usage?.daily?.allTokens || 0
        bVal = b.usage?.daily?.allTokens || 0
      } else if (accountsSortBy.value === 'dailyRequests') {
        aVal = a.usage?.daily?.requests || 0
        bVal = b.usage?.daily?.requests || 0
      } else if (accountsSortBy.value === 'totalTokens') {
        aVal = a.usage?.total?.allTokens || 0
        bVal = b.usage?.total?.allTokens || 0
      } else if (accountsSortBy.value === 'lastUsed') {
        aVal = a.lastUsedAt ? new Date(a.lastUsedAt).getTime() : 0
        bVal = b.lastUsedAt ? new Date(b.lastUsedAt).getTime() : 0
      } else if (accountsSortBy.value === 'status') {
        aVal = a.isActive ? 1 : 0
        bVal = b.isActive ? 1 : 0
      }
      if (aVal < bVal) return accountsSortOrder.value === 'asc' ? -1 : 1
      if (aVal > bVal) return accountsSortOrder.value === 'asc' ? 1 : -1
      return 0
    })
    return sorted
  })
  // 是否使用服务端分页（由数据层设置）
  const serverPaging = ref(false)

  const paginatedAccounts = computed(() => {
    if (serverPaging.value) return accounts.value
    const start = (currentPage.value - 1) * pageSize.value
    const end = start + pageSize.value
    return sortedAccounts.value.slice(start, end)
  })

  // watchers
  watch(searchKeyword, () => {
    currentPage.value = 1
  })
  watch(pageSize, (v) => localStorage.setItem(PAGE_SIZE_STORAGE_KEY, String(v)))
  watch(accountSortBy, (newVal) => {
    const map = { name: 'name', dailyTokens: 'dailyTokens', dailyRequests: 'dailyRequests', totalTokens: 'totalTokens', lastUsed: 'lastUsed' }
    if (map[newVal]) {
      if (accountsSortBy.value === map[newVal]) accountsSortOrder.value = accountsSortOrder.value === 'asc' ? 'desc' : 'asc'
      else {
        accountsSortBy.value = map[newVal]
        accountsSortOrder.value = 'asc'
      }
    }
  })

  return {
    // lists
    accounts,
    accountsLoading,
    // sort
    accountSortBy,
    accountsSortBy,
    accountsSortOrder,
    // filters
    apiKeys,
    accountGroups,
    groupFilter,
    platformFilter,
    searchKeyword,
    // pagination
    pageSizeOptions,
    pageSize,
    currentPage,
    totalAccounts,
    // selection
    selectedAccounts,
    showCheckboxes,
    // options
    sortOptions,
    platformOptions,
    groupOptions,
    // computed
    sortedAccounts,
    paginatedAccounts,
    serverPaging,
    // modals
    showCreateAccountModal,
    newAccountPlatform,
    showEditAccountModal,
    editingAccount
  }
}
