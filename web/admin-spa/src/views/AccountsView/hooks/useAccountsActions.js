import { apiClient } from '@/config/api'
import { showToast } from '@/utils/toast'

export function useAccountsActions(ctx, confirmApi) {
  const { accounts, apiKeys, selectedAccounts, showCheckboxes } = ctx
  const { showConfirm } = confirmApi

  const toggleSelectionMode = () => {
    showCheckboxes.value = !showCheckboxes.value
    if (!showCheckboxes.value) selectedAccounts.value = []
  }

  const getBoundApiKeysForAccount = (account) => {
    if (!account || !account.id) return []
    const id = account.id
    return apiKeys.value.filter(
      (k) =>
        k.claudeAccountId === id ||
        k.claudeConsoleAccountId === id ||
        k.geminiAccountId === id ||
        k.openaiAccountId === id ||
        k.azureOpenaiAccountId === id ||
        k.openaiAccountId === `responses:${id}`
    )
  }

  const resolveAccountDeleteEndpoint = (account) => {
    switch (account.platform) {
      case 'claude':
        return `/admin/claude-accounts/${account.id}`
      case 'claude-console':
        return `/admin/claude-console-accounts/${account.id}`
      case 'bedrock':
        return `/admin/bedrock-accounts/${account.id}`
      case 'openai':
        return `/admin/openai-accounts/${account.id}`
      case 'azure_openai':
        return `/admin/azure-openai-accounts/${account.id}`
      case 'openai-responses':
        return `/admin/openai-responses-accounts/${account.id}`
      case 'ccr':
        return `/admin/ccr-accounts/${account.id}`
      case 'gemini':
        return `/admin/gemini-accounts/${account.id}`
      case 'droid':
        return `/admin/droid-accounts/${account.id}`
      default:
        return null
    }
  }

  const performAccountDeletion = async (account) => {
    const endpoint = resolveAccountDeleteEndpoint(account)
    if (!endpoint) return { success: false, message: '不支持的账户类型' }
    try {
      const data = await apiClient.delete(endpoint)
      return data.success ? { success: true, data } : { success: false, message: data.message || '删除失败' }
    } catch (error) {
      const message = error.response?.data?.message || error.message || '删除失败'
      return { success: false, message }
    }
  }

  const deleteAccount = async (account, reload) => {
    const boundCount = getBoundApiKeysForAccount(account).length
    let msg = `确定要删除账户 "${account.name}" 吗？`
    if (boundCount > 0) msg += `\n\n⚠️ 此账号有 ${boundCount} 个 API Key 绑定，删除后将切换为共享池。`
    msg += '\n\n此操作不可恢复。'
    const confirmed = await showConfirm('删除账户', msg, '删除', '取消')
    if (!confirmed) return
    const result = await performAccountDeletion(account)
    if (result.success) {
      const data = result.data
      let toastMessage = '账户已成功删除'
      if (data?.unboundKeys > 0) toastMessage += `，${data.unboundKeys} 个 API Key 已切换为共享池模式`
      showToast(toastMessage, 'success')
      selectedAccounts.value = selectedAccounts.value.filter((id) => id !== account.id)
      await reload(true)
    } else {
      showToast(result.message || '删除失败', 'error')
    }
  }

  const batchDeleteAccounts = async (reload) => {
    if (selectedAccounts.value.length === 0) return showToast('请先选择要删除的账户', 'warning')
    const map = new Map(accounts.value.map((a) => [a.id, a]))
    const targets = selectedAccounts.value.map((id) => map.get(id)).filter(Boolean)
    if (targets.length === 0) {
      showToast('选中的账户已不存在', 'warning')
      selectedAccounts.value = []
      return
    }
    let msg = `确定要删除选中的 ${targets.length} 个账户吗？此操作不可恢复。`
    const boundInfo = targets
      .map((a) => ({ a, c: getBoundApiKeysForAccount(a).length }))
      .filter((x) => x.c > 0)
    if (boundInfo.length > 0) {
      msg += '\n\n⚠️ 以下账户存在绑定的 API Key，将自动解绑：'
      boundInfo.forEach(({ a, c }) => {
        const n = a.name || a.email || a.accountName || a.id
        msg += `\n- ${n}: ${c} 个`
      })
      msg += '\n删除后，这些 API Key 将切换为共享池模式。'
    }
    msg += '\n\n请再次确认是否继续。'
    const confirmed = await showConfirm('批量删除账户', msg, '删除', '取消')
    if (!confirmed) return
    let success = 0
    let failed = 0
    const fails = []
    for (const a of targets) {
      const r = await performAccountDeletion(a)
      if (r.success) success += 1
      else {
        failed += 1
        fails.push({ name: a.name || a.email || a.accountName || a.id, message: r.message || '删除失败' })
      }
    }
    if (success > 0) {
      showToast(`成功删除 ${success} 个账户${failed ? `，${failed} 个失败` : ''}`, failed ? 'warning' : 'success')
      selectedAccounts.value = []
      await reload(true)
    }
    if (failed > 0) {
      const detail = fails.map((x) => `${x.name}: ${x.message}`).join('\n')
      showToast(`有 ${failed} 个账户删除失败:\n${detail}`, success > 0 ? 'warning' : 'error')
    }
  }

  const resetAccountStatus = async (account, reload) => {
    if (account.isResetting) return
    const ok = await (window.showConfirm
      ? window.showConfirm('重置账户状态', '确定要重置此账户的所有异常状态吗？', '确定重置', '取消')
      : Promise.resolve(confirm('确定要重置此账户的所有异常状态吗？')))
    if (!ok) return
    try {
      account.isResetting = true
      let endpoint = ''
      if (account.platform === 'openai') endpoint = `/admin/openai-accounts/${account.id}/reset-status`
      else if (account.platform === 'openai-responses') endpoint = `/admin/openai-responses-accounts/${account.id}/reset-status`
      else if (account.platform === 'claude') endpoint = `/admin/claude-accounts/${account.id}/reset-status`
      else if (account.platform === 'claude-console') endpoint = `/admin/claude-console-accounts/${account.id}/reset-status`
      else if (account.platform === 'ccr') endpoint = `/admin/ccr-accounts/${account.id}/reset-status`
      else if (account.platform === 'droid') endpoint = `/admin/droid-accounts/${account.id}/reset-status`
      else return showToast('不支持的账户类型', 'error')
      const data = await apiClient.post(endpoint)
      if (data.success) {
        showToast('账户状态已重置', 'success')
        await reload(true)
      } else showToast(data.message || '状态重置失败', 'error')
    } catch {
      showToast('状态重置失败', 'error')
    } finally {
      account.isResetting = false
    }
  }

  const toggleSchedulable = async (account) => {
    if (account.isTogglingSchedulable) return
    try {
      account.isTogglingSchedulable = true
      let endpoint
      if (account.platform === 'claude') endpoint = `/admin/claude-accounts/${account.id}/toggle-schedulable`
      else if (account.platform === 'claude-console') endpoint = `/admin/claude-console-accounts/${account.id}/toggle-schedulable`
      else if (account.platform === 'bedrock') endpoint = `/admin/bedrock-accounts/${account.id}/toggle-schedulable`
      else if (account.platform === 'gemini') endpoint = `/admin/gemini-accounts/${account.id}/toggle-schedulable`
      else if (account.platform === 'openai') endpoint = `/admin/openai-accounts/${account.id}/toggle-schedulable`
      else if (account.platform === 'azure_openai') endpoint = `/admin/azure-openai-accounts/${account.id}/toggle-schedulable`
      else if (account.platform === 'openai-responses') endpoint = `/admin/openai-responses-accounts/${account.id}/toggle-schedulable`
      else if (account.platform === 'ccr') endpoint = `/admin/ccr-accounts/${account.id}/toggle-schedulable`
      else if (account.platform === 'droid') endpoint = `/admin/droid-accounts/${account.id}/toggle-schedulable`
      else return showToast('该账户类型暂不支持调度控制', 'warning')
      const data = await apiClient.put(endpoint)
      if (data.success) {
        account.schedulable = data.schedulable
        showToast(data.schedulable ? '已启用调度' : '已禁用调度', 'success')
      } else showToast(data.message || '操作失败', 'error')
    } catch {
      showToast('切换调度状态失败', 'error')
    } finally {
      account.isTogglingSchedulable = false
    }
  }

  return {
    toggleSelectionMode,
    deleteAccount,
    batchDeleteAccounts,
    resetAccountStatus,
    toggleSchedulable
  }
}

