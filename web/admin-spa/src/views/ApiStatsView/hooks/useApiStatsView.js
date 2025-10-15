import { ref, onMounted, onUnmounted, watch, computed } from 'vue'
import { useRoute } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useApiStatsStore } from '@/stores/apistats'
import { useThemeStore } from '@/stores/theme'
import { apiStatsClient } from '@/config/apiStats'

export function useApiStatsView() {
  const route = useRoute()
  const apiStatsStore = useApiStatsStore()
  const themeStore = useThemeStore()

  // tabs
  const currentTab = ref('products')

  // products
  const plans = computed(() => apiStatsStore.productPlans || [])
  const showPurchase = ref(false)
  const selectedPlan = ref(null)
  const showKeyDialog = ref(false)
  const issuedApiKey = ref('')

  const goPurchase = (planId) => {
    selectedPlan.value = plans.value.find((p) => p.id === planId) || { id: planId }
    showPurchase.value = true
  }

  const onKeyIssued = (key) => {
    issuedApiKey.value = key || ''
    showPurchase.value = false
    showKeyDialog.value = true
  }

  // theme
  const isDarkMode = computed(() => themeStore.isDarkMode)

  // store refs
  const {
    apiKey,
    apiId,
    loading,
    modelStatsLoading,
    oemLoading,
    error,
    statsPeriod,
    statsData,
    oemSettings,
    multiKeyMode
  } = storeToRefs(apiStatsStore)

  const { queryStats, switchPeriod, loadStatsWithApiId, loadOemSettings, loadProductSettings, reset } =
    apiStatsStore

  // keyboard
  const handleKeyDown = (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      if (!loading.value && apiKey.value.trim()) {
        queryStats()
      }
      event.preventDefault()
    }
    if (event.key === 'Escape') {
      reset()
    }
  }

  onMounted(() => {
    // theme init (outside MainLayout)
    themeStore.initTheme()

    // OEM and products
    loadOemSettings()
    loadProductSettings()

    // URL params
    const urlApiId = route.query.apiId
    const urlApiKey = route.query.apiKey
    const urlOrder = route.query.order

    if (urlApiId || urlApiKey) {
      currentTab.value = 'stats'
    }

    if (urlApiId && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(urlApiId)) {
      apiId.value = urlApiId
      loadStatsWithApiId()
    } else if (urlApiKey && urlApiKey.length > 10) {
      apiKey.value = urlApiKey
    }

    if (urlOrder) {
      currentTab.value = 'products'
      let attempts = 0
      const poll = async () => {
        attempts++
        try {
          const orderResp = await apiStatsClient.getOrder(urlOrder)
          const order = orderResp?.data
          if (order && order.status === 'OD') {
            if (order.apiKeyPlain) {
              // eslint-disable-next-line no-alert
              alert(`支付成功！\n您的 API Key：\n${order.apiKeyPlain}`)
            }
            return
          }
        } catch (e) {
          void e
        }
        if (attempts < 10) {
          try {
            await apiStatsClient.queryXunhu({ out_trade_order: urlOrder })
          } catch (e) {
            void e
          }
          setTimeout(poll, 3000)
        }
      }
      poll()
    }

    document.addEventListener('keydown', handleKeyDown)
  })

  onUnmounted(() => {
    document.removeEventListener('keydown', handleKeyDown)
  })

  // clear when key emptied
  watch(apiKey, (newValue) => {
    if (!newValue) {
      apiStatsStore.clearData()
    }
  })

  return {
    // tabs
    currentTab,
    // products
    plans,
    showPurchase,
    selectedPlan,
    showKeyDialog,
    issuedApiKey,
    goPurchase,
    onKeyIssued,
    // theme
    isDarkMode,
    // store state
    apiKey,
    apiId,
    loading,
    modelStatsLoading,
    oemLoading,
    error,
    statsPeriod,
    statsData,
    oemSettings,
    multiKeyMode,
    // actions
    queryStats,
    switchPeriod,
    loadStatsWithApiId,
    loadOemSettings,
    loadProductSettings,
    reset
  }
}

