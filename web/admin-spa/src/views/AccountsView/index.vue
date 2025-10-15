<template>
  <div class="accounts-view">
    <div class="card p-4 sm:p-6">
      <div class="mb-4 sm:mb-6">
        <h3 class="mb-1 text-lg font-bold text-gray-900 dark:text-gray-100 sm:mb-2 sm:text-xl">
          账户管理
        </h3>
        <p class="text-sm text-gray-600 dark:text-gray-400 sm:text-base">
          管理 Claude、Gemini、OpenAI 等账户与代理配置
        </p>
      </div>

      <AccountsToolbar
        :loading="accountsLoading"
        :sort-options="sortOptions"
        :platform-options="platformOptions"
        :group-options="groupOptions"
        :show-checkboxes="showCheckboxes"
        :selected-count="selectedAccounts.length"
        v-model:search-keyword="searchKeyword"
        v-model:sort-by="accountSortBy"
        v-model:platform="platformFilter"
        v-model:group="groupFilter"
        @refresh="(force) => loadAccounts(!!force)"
        @toggle-selection="toggleSelectionMode"
        @batch-delete="batchDeleteAccounts"
        @create="openCreateAccountModal"
      />

      <div v-if="accountsLoading" class="py-12 text-center">
        <div class="loading-spinner mx-auto mb-4" />
        <p class="text-gray-500 dark:text-gray-400">正在加载账户...</p>
      </div>

      <div v-else-if="sortedAccounts.length === 0" class="py-12 text-center">
        <div class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-700">
          <i class="fas fa-user-circle text-xl text-gray-400" />
        </div>
        <p class="text-lg text-gray-500 dark:text-gray-400">暂无账户</p>
        <p class="mt-2 text-sm text-gray-400 dark:text-gray-500">点击上方按钮添加您的第一个账户</p>
      </div>

      <template v-else>
        <AccountsTable
          class="hidden md:block"
          :data="paginatedAccounts"
          :show-checkboxes="showCheckboxes"
          v-model:selected="selectedAccounts"
          :sort-by="accountsSortBy"
          :sort-order="accountsSortOrder"
          :table-height="TABLE_HEIGHT"
          @sort-change="sortAccounts"
          @toggle-schedulable="toggleSchedulable"
          @reset-status="resetAccountStatus"
          @edit="editAccount"
          @delete="deleteAccount"
          @view-usage="openAccountUsageModal"
        />

        <AccountsMobileList
          class="md:hidden"
          :data="paginatedAccounts"
          :show-checkboxes="showCheckboxes"
          v-model:selected="selectedAccounts"
          @toggle-schedulable="toggleSchedulable"
          @reset-status="resetAccountStatus"
          @edit="editAccount"
          @delete="deleteAccount"
          @view-usage="openAccountUsageModal"
        />

        <div class="mt-4 flex items-center justify-between">
          <div class="text-xs text-gray-500 dark:text-gray-400">
            共 {{ totalAccounts }} 条记录
          </div>
          <el-pagination
            background
            layout="prev, pager, next, sizes"
            :page-sizes="pageSizeOptions"
            :total="totalAccounts"
            v-model:page-size="pageSize"
            v-model:current-page="currentPage"
          />
        </div>
      </template>
    </div>

    <!-- 添加/编辑账户模态框 -->
    <AccountForm
      v-if="showCreateAccountModal && (!newAccountPlatform || newAccountPlatform !== 'ccr')"
      @close="closeCreateAccountModal"
      @platform-changed="newAccountPlatform = $event"
      @success="handleCreateSuccess"
    />
    <CcrAccountForm
      v-else-if="showCreateAccountModal && newAccountPlatform === 'ccr'"
      @close="closeCreateAccountModal"
      @success="handleCreateSuccess"
    />
    <CcrAccountForm
      v-if="showEditAccountModal && editingAccount && editingAccount.platform === 'ccr'"
      :account="editingAccount"
      @close="showEditAccountModal = false"
      @success="handleEditSuccess"
    />
    <AccountForm
      v-else-if="showEditAccountModal"
      :account="editingAccount"
      @close="showEditAccountModal = false"
      @success="handleEditSuccess"
    />

    <!-- 确认弹窗 -->
    <ConfirmModal
      :cancel-text="confirmOptions.cancelText"
      :confirm-text="confirmOptions.confirmText"
      :message="confirmOptions.message"
      :show="showConfirmModal"
      :title="confirmOptions.title"
      @cancel="handleCancel"
      @confirm="handleConfirm"
    />

    <!-- 使用详情 -->
    <AccountUsageDetailModal
      v-if="showAccountUsageModal"
      :account="selectedAccountForUsage || {}"
      :generated-at="accountUsageGeneratedAt"
      :history="accountUsageHistory"
      :loading="accountUsageLoading"
      :overview="accountUsageOverview"
      :show="showAccountUsageModal"
      :summary="accountUsageSummary"
      @close="closeAccountUsageModal"
    />
  </div>
  
</template>

<script setup>
import AccountsToolbar from './components/AccountsToolbar.vue'
import AccountsTable from './components/AccountsTable.vue'
import AccountsMobileList from './components/AccountsMobileList.vue'
import AccountForm from '@/components/accounts/AccountForm.vue'
import CcrAccountForm from '@/components/accounts/CcrAccountForm.vue'
import AccountUsageDetailModal from '@/components/accounts/AccountUsageDetailModal.vue'
import ConfirmModal from '@/components/common/ConfirmModal.vue'
import { useAccounts } from './hooks/useAccounts'

  const {
  // state
  accountsLoading,
  accountsSortBy,
  accountsSortOrder,
  accountSortBy,
  platformFilter,
  groupFilter,
  searchKeyword,
  sortOptions,
  platformOptions,
  groupOptions,
  pageSizeOptions,
  pageSize,
  currentPage,
  totalAccounts,
  showCheckboxes,
  selectedAccounts,
  // data
  sortedAccounts,
  paginatedAccounts,
  // actions
  loadAccounts,
  sortAccounts,
  toggleSelectionMode,
  batchDeleteAccounts,
  // modals
  showCreateAccountModal,
  newAccountPlatform,
  closeCreateAccountModal,
  openCreateAccountModal,
  handleCreateSuccess,
  showEditAccountModal,
  editingAccount,
  editAccount,
  handleEditSuccess,
  deleteAccount,
  // status actions
  toggleSchedulable,
  resetAccountStatus,
  // usage modal
  showAccountUsageModal,
  accountUsageLoading,
  selectedAccountForUsage,
  accountUsageHistory,
  accountUsageSummary,
  accountUsageOverview,
  accountUsageGeneratedAt,
  openAccountUsageModal,
  closeAccountUsageModal,
  // confirm
  showConfirmModal,
  confirmOptions,
  handleConfirm,
  handleCancel
} = useAccounts()

const TABLE_HEIGHT = 560
</script>

<style scoped>
.loading-spinner {
  width: 24px;
  height: 24px;
  border: 2px solid #e5e7eb;
  border-top: 2px solid #3b82f6;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}
</style>
