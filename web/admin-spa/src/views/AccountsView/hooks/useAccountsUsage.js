import { ref } from 'vue'
import { apiClient } from '@/config/api'
import { showToast } from '@/utils/toast'

export function useAccountsUsage() {
  const showAccountUsageModal = ref(false)
  const accountUsageLoading = ref(false)
  const selectedAccountForUsage = ref(null)
  const accountUsageHistory = ref([])
  const accountUsageSummary = ref({})
  const accountUsageOverview = ref({})
  const accountUsageGeneratedAt = ref('')
  const supportedUsagePlatforms = ['claude', 'claude-console', 'openai', 'openai-responses', 'gemini', 'droid']

  const canViewUsage = (account) => !!account && supportedUsagePlatforms.includes(account.platform)

  const openAccountUsageModal = async (account) => {
    if (!canViewUsage(account)) return showToast('该账户类型暂不支持查看详情', 'warning')
    selectedAccountForUsage.value = account
    showAccountUsageModal.value = true
    accountUsageLoading.value = true
    accountUsageHistory.value = []
    accountUsageSummary.value = {}
    accountUsageOverview.value = {}
    accountUsageGeneratedAt.value = ''
    try {
      const resp = await apiClient.get(`/admin/accounts/${account.id}/usage-history?platform=${account.platform}&days=30`)
      if (resp.success) {
        const data = resp.data || {}
        accountUsageHistory.value = data.history || []
        accountUsageSummary.value = data.summary || {}
        accountUsageOverview.value = data.overview || {}
        accountUsageGeneratedAt.value = data.generatedAt || ''
      } else showToast(resp.error || '加载账号使用详情失败', 'error')
    } catch {
      showToast('加载账号使用详情失败', 'error')
    } finally {
      accountUsageLoading.value = false
    }
  }

  const closeAccountUsageModal = () => {
    showAccountUsageModal.value = false
    accountUsageLoading.value = false
    selectedAccountForUsage.value = null
  }

  return {
    showAccountUsageModal,
    accountUsageLoading,
    selectedAccountForUsage,
    accountUsageHistory,
    accountUsageSummary,
    accountUsageOverview,
    accountUsageGeneratedAt,
    openAccountUsageModal,
    closeAccountUsageModal
  }
}

