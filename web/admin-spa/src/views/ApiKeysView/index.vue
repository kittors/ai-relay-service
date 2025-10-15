<template>
  <div class="api-keys-view">
    <div class="card p-4 sm:p-6">
      <div class="mb-4 sm:mb-6">
        <h3 class="mb-1 text-lg font-bold text-gray-900 dark:text-gray-100 sm:mb-2 sm:text-xl">
          API Keys 管理
        </h3>
        <p class="text-sm text-gray-600 dark:text-gray-400 sm:text-base">管理和监控您的 API 密钥</p>
      </div>

      <el-tabs v-model="activeTab" class="mb-4">
        <el-tab-pane name="active">
          <template #label>
            <span>活跃 API Keys</span>
            <el-badge v-if="totalEstimated" :value="totalEstimated" class="ml-2" />
          </template>
        </el-tab-pane>
        <el-tab-pane name="deleted">
          <template #label>
            <span>已删除 API Keys</span>
            <el-badge v-if="deletedTotal" :value="deletedTotal" class="ml-2" />
          </template>
        </el-tab-pane>
      </el-tabs>

      <template v-if="activeTab === 'active'">
        <ActiveKeysToolbar
          :api-keys-loading="apiKeysLoading"
          :tag-options="tagOptions"
          v-model:selected-tag="selectedTagFilter"
          v-model:search-keyword="searchKeyword"
          v-model:search-mode="searchMode"
          v-model:activation-filter="activationFilter"
          :global-date-filter="globalDateFilter"
          :default-time="defaultTime"
          :show-checkboxes="showCheckboxes"
          :selected-count="selectedApiKeys.length"
          @change-date-range="(v) => { handleTimeRangeChange(v); loadApiKeys(globalDateFilter, { reset: true }) }"
          @refresh="async () => { await refreshKeysAndAccounts(globalDateFilter, { reset: true, forceAccounts: true }) }"
          @toggle-selection="toggleSelectionMode"
          @export="exportToExcel"
          @open-create="openCreateApiKeyModal"
          @open-batch-edit="openBatchEditModal"
          @open-packages="async () => { await ensureAccountsLoaded(); showPackagesModal = true }"
          @open-email-search="showEmailSearch = true"
          @batch-delete="batchDeleteApiKeys"
          @update-custom-range="(v) => { onGlobalCustomDateRangeChange(v); loadApiKeys(globalDateFilter, { reset: true }) }"
        />

        <div v-if="sortedApiKeys.length === 0 && !pageLoading" class="py-12 text-center">
          <div class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-700">
            <i class="fas fa-key text-xl text-gray-400" />
          </div>
          <p class="text-lg text-gray-500 dark:text-gray-400">暂无 API Keys</p>
          <p class="mt-2 text-sm text-gray-400">点击上方按钮创建您的第一个 API Key</p>
        </div>

        <div v-else>
          <ActiveKeysTable
            :data="paginatedApiKeys"
            :is-ldap-enabled="isLdapEnabled"
            :show-checkboxes="showCheckboxes"
            v-model:selected="selectedApiKeys"
            :get-binding-strings="getBindingDisplayStrings"
            :date-filter="globalDateFilter"
            :loading="pageLoading"
            :table-height="TABLE_HEIGHT"
            @sort-change="sortApiKeys"
            @edit="openEditApiKeyModal"
            @renew="openRenewApiKeyModal"
            @delete="deleteApiKey"
            @detail="showUsageDetails"
            @edit-expiry="startEditExpiry"
          />

          <div class="mt-4 flex items-center justify-between">
            <div class="text-xs text-gray-500 dark:text-gray-400">
              约 {{ totalEstimated }} 条，当前第 {{ currentPage }} / {{ totalPages }} 页
            </div>
            <el-pagination
              background
              layout="prev, pager, next, sizes"
              :page-size="pageSize"
              :page-sizes="pageSizeOptions"
              :total="totalEstimated"
              v-model:current-page="currentPage"
              @size-change="onPageSizeChange"
            />
          </div>
        </div>
      </template>

      <template v-else>
    <DeletedKeysTable
      :data="deletedApiKeys"
      :total="deletedTotal"
      :loading="deletedApiKeysLoading"
      :table-height="TABLE_HEIGHT"
      @restore="restoreApiKey"
      @purge="purgeDeletedApiKey"
      @clear-all="clearAllDeletedApiKeys"
      @refresh="loadDeletedApiKeys"
    />
    <div class="mt-4 flex items-center justify-between">
      <div class="text-xs text-gray-500 dark:text-gray-400">
        共 {{ deletedTotal }} 条，当前第 {{ deletedCurrentPage }} / {{ Math.max(1, Math.ceil(deletedTotal / deletedPageSize)) }} 页
      </div>
      <el-pagination
        background
        layout="prev, pager, next, sizes"
        :page-size="deletedPageSize"
        :page-sizes="deletedPageSizeOptions"
        :total="deletedTotal"
        v-model:current-page="deletedCurrentPage"
        @size-change="onDeletedPageSizeChange"
      />
    </div>
      </template>
    </div>

    <!-- 模态框组件（沿用现有逻辑，逐步改造为 Element Plus） -->
    <CreateApiKeyModal
      v-if="showCreateApiKeyModal"
      :accounts="accounts"
      @batch-success="handleBatchCreateSuccess"
      @close="showCreateApiKeyModal = false"
      @success="handleCreateSuccess"
    />
    <EditApiKeyModal
      v-if="showEditApiKeyModal"
      :accounts="accounts"
      :available-tags="availableTags"
      :api-key="editingApiKey"
      @close="showEditApiKeyModal = false"
      @success="onEditSuccess"
    />
    <RenewApiKeyModal
      v-if="showRenewApiKeyModal"
      :api-key="renewingApiKey"
      @close="showRenewApiKeyModal = false"
      @success="handleRenewSuccess"
    />
    <NewApiKeyModal v-if="showNewApiKeyModal" :api-key="newApiKeyData" @close="showNewApiKeyModal = false" />
    <BatchApiKeyModal v-if="showBatchApiKeyModal" :api-keys="batchApiKeyData" @close="showBatchApiKeyModal = false" />
    <BatchEditApiKeyModal
      v-if="showBatchEditModal"
      :accounts="accounts"
      :selected-keys="selectedApiKeys"
      @close="showBatchEditModal = false"
      @success="handleBatchEditSuccess"
    />
    <PackagesManagerModal
      v-if="showPackagesModal"
      :show="showPackagesModal"
      :accounts="accounts"
      :tag-options="tagOptions"
      @close="showPackagesModal = false"
      @created="() => { showPackagesModal = false; loadApiKeys(globalDateFilter, { reset: true }) }"
    />
    <ExpiryEditModal
      ref="expiryEditModalRef"
      :api-key="editingExpiryKey || { id: null, expiresAt: null, name: '' }"
      :show="!!editingExpiryKey"
      @close="closeExpiryEdit"
      @save="handleSaveExpiry"
    />
    <UsageDetailModal :api-key="selectedApiKeyForDetail || {}" :show="showUsageDetailModal" @close="showUsageDetailModal = false" />
    <EmailKeySearchDialog v-if="showEmailSearch" :show="showEmailSearch" @close="showEmailSearch = false" />
  </div>
  
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import ActiveKeysToolbar from './components/ActiveKeysToolbar.vue'
import ActiveKeysTable from './components/ActiveKeysTable.vue'
import DeletedKeysTable from './components/DeletedKeysTable.vue'
import PackagesManagerModal from './components/PackagesManagerModal.vue'
import EmailKeySearchDialog from './components/EmailKeySearchDialog.vue'

// 复用现有的业务弹窗组件（后续可逐步切换到 Element Plus）
import CreateApiKeyModal from '@/components/apikeys/CreateApiKeyModal.vue'
import EditApiKeyModal from '@/components/apikeys/EditApiKeyModal.vue'
import RenewApiKeyModal from '@/components/apikeys/RenewApiKeyModal.vue'
import NewApiKeyModal from '@/components/apikeys/NewApiKeyModal.vue'
import BatchApiKeyModal from '@/components/apikeys/BatchApiKeyModal.vue'
import BatchEditApiKeyModal from '@/components/apikeys/BatchEditApiKeyModal.vue'
import ExpiryEditModal from '@/components/apikeys/ExpiryEditModal.vue'
import UsageDetailModal from '@/components/apikeys/UsageDetailModal.vue'

import { useApiKeys } from './hooks/useApiKeys'
import { useApiKeyFilters } from './hooks/useApiKeyFilters'

  const {
  // 数据与状态
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

  // 过滤与搜索
  selectedTagFilter,
  availableTags,
  searchKeyword,
  searchMode,
  activationFilter,
  tagOptions,

  // 排序分页
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

  // 多选与操作
  showCheckboxes,
  selectedApiKeys,
  toggleSelectionMode,

  // 绑定信息
  getBindingDisplayStrings,

  // 模态框与操作
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

  // 过期时间编辑与详情
  editingExpiryKey,
  expiryEditModalRef,
  startEditExpiry,
  closeExpiryEdit,
  handleSaveExpiry,
  showUsageDetailModal,
  selectedApiKeyForDetail,
  showUsageDetails,

  // API 操作
  loadApiKeys,
  loadDeletedApiKeys,
  deleteApiKey,
  restoreApiKey,
  purgeDeletedApiKey,
  clearAllDeletedApiKeys,
  exportToExcel,
  sortApiKeys,
  batchDeleteApiKeys,
  ensureAccountsLoaded,
  refreshKeysAndAccounts,
  onDeletedPageSizeChange
} = useApiKeys()

  const { activeTab, globalDateFilter, defaultTime, onGlobalCustomDateRangeChange, handleTimeRangeChange } = useApiKeyFilters()
  const TABLE_HEIGHT = 560
  const pageLoading = computed(() => apiKeysLoading.value)
  const showPackagesModal = ref(false)
  const showEmailSearch = ref(false)

  const onEditSuccess = async () => {
    // 委托 hooks 内逻辑（重置分页 + 列表刷新）
    await handleEditSuccess()
  }

// 使用 useApiKeys 提供的 isLdapEnabled

onMounted(async () => {
  // 页面加载时：同步（并发）拉取账户摘要与 Keys 列表，等待两者完成
  await refreshKeysAndAccounts(globalDateFilter, { reset: false, forceAccounts: true })
})

// 根据 Tab 切换懒加载已删除列表
watch(
  () => activeTab.value,
  async (v) => {
    if (v === 'deleted') {
      await loadDeletedApiKeys()
    }
  }
)
</script>

<style scoped>
.card {
  background: white;
  border-radius: 12px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
  border: 1px solid #e5e7eb;
}
:root.dark .card {
  background: #1f2937;
  border: 1px solid #374151;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.3);
}

</style>
