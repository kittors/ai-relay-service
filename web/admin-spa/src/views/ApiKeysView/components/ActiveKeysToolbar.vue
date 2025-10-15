<template>
  <div class="mb-4 flex flex-col gap-3 lg:flex-col lg:items-start lg:justify-between">
    <div class="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
      <!-- 时间范围 -->
      <el-select
        v-model="localPreset"
        placeholder="选择时间范围"
        style="width: 160px"
        @change="onPresetChange"
      >
        <el-option label="今日" value="today" />
        <el-option label="最近7天" value="7days" />
        <el-option label="最近30天" value="30days" />
        <el-option label="全部时间" value="all" />
        <el-option label="自定义范围" value="custom" />
      </el-select>

      <el-date-picker
        v-if="globalDateFilter.type === 'custom'"
        class="api-key-date-picker"
        :clearable="true"
        :default-time="defaultTime"
        end-placeholder="结束日期"
        format="YYYY-MM-DD HH:mm:ss"
        :model-value="globalDateFilter.customRange"
        range-separator="至"
        start-placeholder="开始日期"
        style="width: 320px"
        type="datetimerange"
        :unlink-panels="false"
        value-format="YYYY-MM-DD HH:mm:ss"
        @update:model-value="(v) => $emit('update-custom-range', v)"
      />

      <!-- 标签筛选 -->
      <el-select
        v-model="innerSelectedTag"
        clearable
        filterable
        placeholder="所有标签"
        style="width: 160px"
        @change="$emit('update:selectedTag', innerSelectedTag)"
      >
        <el-option
          v-for="opt in tagOptions"
          :key="opt.value"
          :label="opt.label"
          :value="opt.value"
        />
      </el-select>

      <!-- 是否激活 筛选 -->
      <el-select
        v-model="innerActivationFilter"
        placeholder="是否激活"
        clearable
        style="width: 140px"
        @change="$emit('update:activationFilter', innerActivationFilter)"
      >
        <el-option label="全部" value="" />
        <el-option label="已激活" value="true" />
        <el-option label="未激活" value="false" />
      </el-select>

      <!-- 搜索 -->
      <el-input
        v-model="innerKeyword"
        placeholder="搜索名称或所属账号..."
        clearable
        style="width: 260px"
        @input="$emit('update:searchKeyword', innerKeyword)"
      >
        <template #prefix>
          <el-icon><Search /></el-icon>
        </template>
      </el-input>

      <el-select
        v-model="innerSearchMode"
        placeholder="搜索模式"
        style="width: 140px"
        @change="$emit('update:searchMode', innerSearchMode)"
      >
        <el-option label="按Key名称" value="apiKey" />
        <el-option label="按所属账号" value="bindingAccount" />
      </el-select>
      <el-button :loading="apiKeysLoading" @click="$emit('refresh')">
        <el-icon class="mr-1"><Refresh /></el-icon>刷新
      </el-button>

      <el-button @click="$emit('toggle-selection')">
        <el-icon class="mr-1"><Finished /></el-icon>{{ showCheckboxes ? '取消选择' : '选择' }}
      </el-button>
    </div>

    <!-- 操作按钮组 -->
    <div class="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
      <el-button type="success" @click="$emit('export')">
        <el-icon class="mr-1"><Document /></el-icon>导出数据
      </el-button>

      <el-button v-if="selectedCount > 0" type="primary" plain @click="$emit('open-batch-edit')">
        <el-icon class="mr-1"><Edit /></el-icon>编辑选中 ({{ selectedCount }})
      </el-button>

      <el-button v-if="selectedCount > 0" type="danger" plain @click="$emit('batch-delete')">
        <el-icon class="mr-1"><Delete /></el-icon>删除选中 ({{ selectedCount }})
      </el-button>
      <el-button type="warning" @click="$emit('open-packages')">
        <el-icon class="mr-1"><Collection /></el-icon>API Key 模版
      </el-button>
      <el-button type="primary" @click="$emit('open-create')">
        <el-icon class="mr-1"><Plus /></el-icon>创建新 Key
      </el-button>
      <el-button type="info" plain @click="$emit('open-email-search')">
        <el-icon class="mr-1"><Search /></el-icon>邮箱查 Key
      </el-button>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import {
  Refresh,
  Plus,
  Edit,
  Delete,
  Document,
  Search,
  Finished,
  Collection
} from '@element-plus/icons-vue'

const props = defineProps({
  apiKeysLoading: Boolean,
  tagOptions: { type: Array, default: () => [] },
  showCheckboxes: Boolean,
  selectedCount: { type: Number, default: 0 },
  globalDateFilter: { type: Object, required: true },
  defaultTime: { type: Array, default: () => [] },
  selectedTag: { type: String, default: '' },
  searchKeyword: { type: String, default: '' },
  searchMode: { type: String, default: 'apiKey' },
  activationFilter: { type: String, default: '' }
})

const emit = defineEmits([
  'refresh',
  'toggle-selection',
  'export',
  'open-create',
  'open-email-search',
  'open-batch-edit',
  'open-packages',
  'batch-delete',
  'change-date-range',
  'update:selectedTag',
  'update:searchKeyword',
  'update:searchMode',
  'update-custom-range',
  'update:activationFilter'
])

const innerSelectedTag = ref(props.selectedTag || '')
const innerKeyword = ref(props.searchKeyword || '')
const innerSearchMode = ref(props.searchMode || 'apiKey')
const innerActivationFilter = ref(props.activationFilter || '')

const localPreset = ref(props.globalDateFilter.preset || 'today')

watch(
  () => props.selectedTag,
  (v) => (innerSelectedTag.value = v || '')
)
watch(
  () => props.searchKeyword,
  (v) => (innerKeyword.value = v || '')
)
watch(
  () => props.searchMode,
  (v) => (innerSearchMode.value = v || 'apiKey')
)
watch(
  () => props.activationFilter,
  (v) => (innerActivationFilter.value = v || '')
)
watch(
  () => props.globalDateFilter.preset,
  (v) => (localPreset.value = v || 'today')
)

const onPresetChange = (val) => {
  // 通知外部更新时间范围，并触发刷新
  // 外部应调用 handleTimeRangeChange 并随后调用 loadApiKeys
  emit('change-date-range', val)
}
</script>

<style scoped>
.api-key-date-picker :deep(.el-range-editor.el-input__inner) {
  height: 32px;
}
</style>
