<template>
  <div>
    <div class="mb-3 flex items-center justify-between">
      <div class="text-sm text-gray-600">定义可复用的 API Key 模版，快速创建</div>
      <div>
        <el-button type="primary" @click="$emit('create')">新建模版</el-button>
      </div>
    </div>

    <el-table :data="templates" border style="width: 100%" v-loading="loading">
      <el-table-column label="名称" min-width="200">
        <template #default="{ row }">
          <div class="font-semibold">{{ row.name }}</div>
          <div class="text-xs text-gray-500">{{ row.description }}</div>
        </template>
      </el-table-column>
      <el-table-column label="权限" width="100">
        <template #default>OpenAI</template>
      </el-table-column>
      <el-table-column label="速率" width="160">
        <template #default="{ row }">
          <span v-if="row.rateLimitWindow > 0 && row.rateLimitRequests > 0">
            {{ row.rateLimitRequests }}次/{{ row.rateLimitWindow }}min
          </span>
          <span v-else>不限</span>
        </template>
      </el-table-column>
      <el-table-column label="每日请求上限" width="140">
        <template #default="{ row }">{{ Number(row.dailyRequestsLimit || 0) || '不限' }}</template>
      </el-table-column>
      <el-table-column label="绑定" min-width="140">
        <template #default="{ row }">
          <div class="text-xs text-gray-700">
            <span v-if="row.openaiAccountId">OpenAI</span>
            <span v-else>共享池</span>
          </div>
        </template>
      </el-table-column>
      <el-table-column fixed="right" label="操作" width="220">
        <template #default="{ row }">
          <el-button link type="primary" @click="$emit('quick-create', row)">快速创建</el-button>
          <el-button link type="primary" @click="$emit('edit', row)">编辑</el-button>
          <el-popconfirm title="删除该模版？" @confirm="$emit('delete', row)">
            <template #reference>
              <el-button link type="danger">删除</el-button>
            </template>
          </el-popconfirm>
        </template>
      </el-table-column>
    </el-table>

    <el-empty v-if="!loading && (!templates || templates.length === 0)" description="暂无模版" class="mt-6" />
  </div>
</template>

<script setup>
defineProps({
  templates: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false }
})
defineEmits(['create', 'edit', 'delete', 'quick-create'])
</script>

<style scoped>
</style>

