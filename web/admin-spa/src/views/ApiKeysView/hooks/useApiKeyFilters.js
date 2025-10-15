import { reactive, ref } from 'vue'

export function useApiKeyFilters() {
  const activeTab = ref('active')
  const defaultTime = ref([
    new Date(2000, 1, 1, 0, 0, 0),
    new Date(2000, 2, 1, 23, 59, 59)
  ])

  const globalDateFilter = reactive({
    type: 'preset',
    preset: 'today',
    customStart: '',
    customEnd: '',
    customRange: null
  })

  const onGlobalCustomDateRangeChange = (value) => {
    globalDateFilter.customRange = value
    if (Array.isArray(value) && value.length === 2) {
      globalDateFilter.customStart = value[0]
      globalDateFilter.customEnd = value[1]
      globalDateFilter.type = 'custom'
    } else {
      globalDateFilter.customStart = ''
      globalDateFilter.customEnd = ''
      globalDateFilter.type = 'preset'
      globalDateFilter.preset = 'today'
    }
  }

  const handleTimeRangeChange = (val) => {
    if (val === 'custom') {
      globalDateFilter.type = 'custom'
    } else {
      globalDateFilter.type = 'preset'
      globalDateFilter.preset = val
      globalDateFilter.customStart = ''
      globalDateFilter.customEnd = ''
      globalDateFilter.customRange = null
    }
  }

  return {
    activeTab,
    defaultTime,
    globalDateFilter,
    onGlobalCustomDateRangeChange,
    handleTimeRangeChange
  }
}

