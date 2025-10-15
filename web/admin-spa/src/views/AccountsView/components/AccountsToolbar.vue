<template>
  <div class="mb-4 sm:mb-6">
    <!-- 顶部：筛选器（使用 flex + gap） -->
    <div class="mb-3 flex flex-wrap gap-2">
      <div class="w-full sm:w-1/2 md:w-1/4">
        <el-select
          v-model="innerSortBy"
          placeholder="选择排序"
          filterable
          clearable
          @change="$emit('update:sortBy', innerSortBy)"
        >
          <el-option
            v-for="opt in sortOptions"
            :key="opt.value"
            :label="opt.label"
            :value="opt.value"
          />
        </el-select>
      </div>

      <div class="w-full sm:w-1/2 md:w-1/4">
        <el-select
          v-model="innerPlatform"
          placeholder="选择平台"
          filterable
          clearable
          @change="$emit('update:platform', innerPlatform)"
        >
          <el-option
            v-for="opt in platformOptions"
            :key="opt.value"
            :label="opt.label"
            :value="opt.value"
          />
        </el-select>
      </div>

      <div class="w-full sm:w-1/2 md:w-1/4">
        <el-select
          v-model="innerGroup"
          placeholder="选择分组"
          filterable
          clearable
          @change="$emit('update:group', innerGroup)"
        >
          <el-option
            v-for="opt in groupOptions"
            :key="opt.value"
            :label="opt.label"
            :value="opt.value"
          />
        </el-select>
      </div>

      <div class="w-full sm:w-1/2 md:w-1/4">
        <el-input
          v-model="innerKeyword"
          placeholder="搜索账户名称..."
          clearable
          @input="$emit('update:searchKeyword', innerKeyword)"
        >
          <template #prefix>
            <el-icon><Search /></el-icon>
          </template>
        </el-input>
      </div>
    </div>

    <!-- 底部：操作按钮（使用 flex + gap） -->
    <div class="flex flex-wrap gap-2 md:justify-start">
      <el-tooltip content="刷新数据 (Ctrl/⌘+点击强制刷新)" placement="bottom">
        <el-button class="w-full md:w-auto" :loading="loading" @click="onRefresh">
          <el-icon class="mr-1"><Refresh /></el-icon>刷新
        </el-button>
      </el-tooltip>

      <el-button class="w-full md:w-auto" @click="$emit('toggle-selection')">
        <el-icon class="mr-1"><Finished /></el-icon>{{ showCheckboxes ? '取消选择' : '选择' }}
      </el-button>

      <el-button
        v-if="selectedCount > 0"
        class="w-full md:w-auto"
        type="danger"
        plain
        @click="$emit('batch-delete')"
      >
        <el-icon class="mr-1"><Delete /></el-icon>删除选中 ({{ selectedCount }})
      </el-button>

      <el-button class="w-full md:w-auto" type="primary" @click="$emit('create')">
        <el-icon class="mr-1"><Plus /></el-icon>添加账户
      </el-button>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import { Refresh, Plus, Delete, Finished, Search } from '@element-plus/icons-vue'

const props = defineProps({
  loading: Boolean,
  sortOptions: { type: Array, default: () => [] },
  platformOptions: { type: Array, default: () => [] },
  groupOptions: { type: Array, default: () => [] },
  showCheckboxes: Boolean,
  selectedCount: { type: Number, default: 0 },
  searchKeyword: { type: String, default: '' },
  sortBy: { type: String, default: '' },
  platform: { type: String, default: 'all' },
  group: { type: String, default: 'all' }
})

const emit = defineEmits([
  'refresh',
  'toggle-selection',
  'batch-delete',
  'create',
  'update:searchKeyword',
  'update:sortBy',
  'update:platform',
  'update:group'
])

const innerKeyword = ref(props.searchKeyword)
const innerSortBy = ref(props.sortBy)
const innerPlatform = ref(props.platform)
const innerGroup = ref(props.group)

watch(
  () => props.searchKeyword,
  (v) => (innerKeyword.value = v)
)
watch(
  () => props.sortBy,
  (v) => (innerSortBy.value = v)
)
watch(
  () => props.platform,
  (v) => (innerPlatform.value = v)
)
watch(
  () => props.group,
  (v) => (innerGroup.value = v)
)

const onRefresh = (e) => {
  const force = !!(e && (e.ctrlKey || e.metaKey))
  emit('refresh', force)
}
</script>
