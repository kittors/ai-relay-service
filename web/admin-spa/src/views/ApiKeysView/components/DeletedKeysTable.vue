<template>
  <div>
    <div class="mb-3 flex items-center justify-between">
      <div class="text-sm text-gray-600 dark:text-gray-400">
        已删除 API Keys 共 {{ total }} 个
      </div>
      <div class="flex items-center gap-8">
        <el-button :loading="loading" @click="$emit('refresh')">
          <el-icon class="mr-1"><Refresh /></el-icon>刷新
        </el-button>
        <el-popconfirm title="确定清空全部已删除的 Keys？此操作不可恢复。" confirm-button-text="清空" cancel-button-text="取消" @confirm="$emit('clear-all')">
          <template #reference>
            <el-button type="danger" plain>清空所有已删除</el-button>
          </template>
        </el-popconfirm>
      </div>
    </div>

    <el-table
      :data="data"
      border
      style="width: 100%"
      :height="tableHeight"
      v-loading="loading"
      element-loading-text="加载中..."
      element-loading-background="transparent"
    >
      <el-table-column label="名称" min-width="200">
        <template #default="{ row }">
          <div class="font-semibold">{{ row.name }}</div>
        </template>
      </el-table-column>
      <el-table-column label="删除时间" min-width="160">
        <template #default="{ row }">{{ formatDate(row.deletedAt) }}</template>
      </el-table-column>
      <el-table-column label="删除来源" min-width="140">
        <template #default="{ row }">
          <el-tag v-if="row.deletedByType === 'admin'" type="info" size="small">管理员</el-tag>
          <el-tag v-else-if="row.deletedByType === 'user'" type="success" size="small">用户</el-tag>
          <el-tag v-else type="warning" size="small">系统</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作者" min-width="160">
        <template #default="{ row }">{{ row.deletedBy || '-' }}</template>
      </el-table-column>
      <el-table-column fixed="right" label="操作" min-width="160">
        <template #default="{ row }">
          <el-button link type="primary" @click="$emit('restore', row.id)">恢复</el-button>
          <el-popconfirm title="确定彻底删除？此操作不可恢复。" confirm-button-text="删除" cancel-button-text="取消" @confirm="$emit('purge', row.id)">
            <template #reference>
              <el-button link type="danger">彻底删除</el-button>
            </template>
          </el-popconfirm>
        </template>
      </el-table-column>
    </el-table>
  </div>
  
</template>

<script setup>
import { Refresh } from '@element-plus/icons-vue'

defineProps({
  data: { type: Array, default: () => [] },
  total: { type: Number, default: 0 },
  loading: { type: Boolean, default: false },
  tableHeight: { type: [Number, String], default: 560 }
})
defineEmits(['restore', 'purge', 'clear-all', 'refresh'])

const formatDate = (str) => {
  if (!str) return '-'
  try {
    return new Date(str).toLocaleString('zh-CN')
  } catch {
    return String(str)
  }
}
</script>

<style scoped>
</style>
