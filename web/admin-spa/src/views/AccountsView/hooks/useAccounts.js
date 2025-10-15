import { onMounted, watch } from 'vue'
import { useConfirm } from '@/composables/useConfirm'
import { useAccountsState } from './useAccountsState'
import { useAccountsData } from './useAccountsData'
import { useAccountsActions } from './useAccountsActions'
import { useAccountsUsage } from './useAccountsUsage'
import { showToast } from '@/utils/toast'

export function useAccounts() {
  const confirmApi = useConfirm()
  const state = useAccountsState()
  const dataApi = useAccountsData(state)
  const usageApi = useAccountsUsage()
  const actions = useAccountsActions(state, confirmApi)

  const sortAccounts = (field) => {
    if (!field) return
    if (state.accountsSortBy.value === field)
      state.accountsSortOrder.value = state.accountsSortOrder.value === 'asc' ? 'desc' : 'asc'
    else {
      state.accountsSortBy.value = field
      state.accountsSortOrder.value = 'asc'
    }
  }

  const openCreateAccountModal = () => {
    state.newAccountPlatform.value = null
    state.showCreateAccountModal.value = true
  }
  const closeCreateAccountModal = () => {
    state.showCreateAccountModal.value = false
    state.newAccountPlatform.value = null
  }
  const editAccount = (account) => {
    state.editingAccount.value = account
    state.showEditAccountModal.value = true
  }
  const handleCreateSuccess = () => {
    state.showCreateAccountModal.value = false
    showToast('账户创建成功', 'success')
    void dataApi.loadAccounts(true)
  }
  const handleEditSuccess = () => {
    state.showEditAccountModal.value = false
    showToast('账户更新成功', 'success')
    void dataApi.loadAccounts()
  }

  onMounted(() => {
    void dataApi.loadAccounts(true)
  })

  // 监听筛选条件变化，触发服务端过滤
  watch([state.platformFilter, state.groupFilter], () => {
    state.currentPage.value = 1
    void dataApi.loadAccounts(true)
  })

  // 关键字查询：简单防抖
  let keywordTimer = null
  watch(
    () => state.searchKeyword.value,
    (v) => {
      state.currentPage.value = 1
      if (keywordTimer) clearTimeout(keywordTimer)
      keywordTimer = setTimeout(() => void dataApi.loadAccounts(true), 300)
    }
  )

  // 服务端分页：页码与每页数量变化时刷新
  watch(state.pageSize, () => {
    state.currentPage.value = 1
    void dataApi.loadAccounts(false)
  })
  watch(state.currentPage, () => void dataApi.loadAccounts(false))

  return {
    // state + computed lists
    ...state,
    // data operations
    loadAccounts: dataApi.loadAccounts,
    // sorting
    sortAccounts,
    // batch/select actions
    toggleSelectionMode: actions.toggleSelectionMode,
    batchDeleteAccounts: () => actions.batchDeleteAccounts(dataApi.loadAccounts),
    deleteAccount: (acc) => actions.deleteAccount(acc, dataApi.loadAccounts),
    resetAccountStatus: (acc) => actions.resetAccountStatus(acc, dataApi.loadAccounts),
    toggleSchedulable: actions.toggleSchedulable,
    // usage modal
    ...usageApi,
    // create/edit modals
    showCreateAccountModal: state.showCreateAccountModal,
    newAccountPlatform: state.newAccountPlatform,
    openCreateAccountModal,
    closeCreateAccountModal,
    handleCreateSuccess,
    showEditAccountModal: state.showEditAccountModal,
    editingAccount: state.editingAccount,
    editAccount,
    handleEditSuccess,
    // confirm
    showConfirmModal: confirmApi.showConfirmModal,
    confirmOptions: confirmApi.confirmOptions,
    handleConfirm: confirmApi.handleConfirm,
    handleCancel: confirmApi.handleCancel
  }
}
