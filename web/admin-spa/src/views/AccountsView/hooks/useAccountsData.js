import { apiClient } from '@/config/api'

export function useAccountsData(ctx) {
  const { apiKeys, accounts, accountsLoading, platformFilter, groupFilter, searchKeyword, pageSize, currentPage, totalAccounts, serverPaging } = ctx

  const apiKeysLoaded = { current: true } // 不再需要单独加载 API Keys
  const groupsLoaded = { current: false }

  const loadAccountGroups = async (force = false) => {
    if (!force && groupsLoaded.current) return
    try {
      const resp = await apiClient.get('/admin/account-groups')
      if (resp.success) {
        ctx.accountGroups.value = resp.data || []
        groupsLoaded.current = true
      }
    } catch (e) {
      void e
    }
  }

  // 从聚合接口拼装账户清单
  const combineAggregated = (data) => {
    const all = []
    const add = (arr, platform) => {
      ;(arr || []).forEach((acc) => {
        all.push({
          ...acc,
          platform,
          boundApiKeysCount: Number(acc.boundApiKeysCount || 0)
        })
      })
    }
    add(data?.claudeAccounts, 'claude')
    add(data?.claudeConsoleAccounts, 'claude-console')
    add(data?.bedrockAccounts, 'bedrock')
    add(data?.geminiAccounts, 'gemini')
    add(data?.openaiAccounts, 'openai')
    add(data?.azureOpenaiAccounts, 'azure_openai')
    add(data?.openaiResponsesAccounts, 'openai-responses')
    add(data?.droidAccounts, 'droid')
    add(data?.ccrAccounts, 'ccr')
    return all
  }

  const loadClaudeUsage = async () => {
    try {
      const resp = await apiClient.get('/admin/claude-accounts/usage')
      if (resp.success && resp.data) {
        const usageMap = resp.data
        accounts.value = accounts.value.map((acc) =>
          acc.platform === 'claude' && usageMap[acc.id] ? { ...acc, claudeUsage: usageMap[acc.id] } : acc
        )
      }
    } catch (e) {
      void e
    }
  }

  const loadAccounts = async (forceReload = false) => {
    accountsLoading.value = true
    try {
      // 发起 Aggregated 请求（不再单独请求 API Keys）
      const params = {}
      if (platformFilter.value && platformFilter.value !== 'all') params.platform = platformFilter.value
      if (groupFilter.value && groupFilter.value !== 'all') params.groupId = groupFilter.value
      const kw = (searchKeyword?.value || '').trim()
      if (kw) params.keyword = kw
      // 将分页参数传递给后端（当前前端仍做分页，后端仅用于减载）
      if (currentPage && pageSize) {
        params.page = currentPage.value
        params.pageSize = pageSize.value
      }
      const resp = await apiClient.get('/admin/accounts/aggregated', { params })
      const aggregated = resp?.data || {}

      // 用聚合结果更新分组，避免重复调用 /admin/account-groups
      if (Array.isArray(aggregated.accountGroups)) {
        ctx.accountGroups.value = aggregated.accountGroups
      }

      // 如果后端返回了分页，则直接使用分页数据
      if (aggregated.pagination && Array.isArray(aggregated.items)) {
        accounts.value = aggregated.items
        totalAccounts.value = Number(aggregated.pagination.total || aggregated.items.length)
        serverPaging.value = true
      } else {
        // 保持原有前端合并逻辑（兼容后端未分页的情况）
        let all = combineAggregated(aggregated)
        if (platformFilter.value !== 'all') {
          all = all.filter((a) => a.platform === platformFilter.value)
        }
        let filtered = all
        if (groupFilter.value !== 'all') {
          if (groupFilter.value === 'ungrouped') filtered = all.filter((a) => !a.groupInfos || a.groupInfos.length === 0)
          else filtered = all.filter((a) => Array.isArray(a.groupInfos) && a.groupInfos.some((g) => g.id === groupFilter.value))
        }
        accounts.value = filtered
        totalAccounts.value = filtered.length
        serverPaging.value = false
      }
      if (accounts.value.some((a) => a.platform === 'claude')) void loadClaudeUsage()
    } finally {
      accountsLoading.value = false
    }
  }

  return {
    loadAccountGroups,
    loadAccounts,
    loadClaudeUsage
  }
}
