<template>
  <div>
    <!-- 桌面端表格视图 -->
    <div class="table-container hidden sm:block">
      <table class="min-w-full">
        <tbody class="divide-y divide-gray-200/50 dark:divide-gray-600/50">
          <!-- 网站名称 -->
          <tr class="table-row">
            <td class="w-48 whitespace-nowrap px-6 py-4">
              <div class="flex items-center">
                <div
                  class="mr-3 flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-blue-600"
                >
                  <i class="fas fa-font text-xs text-white" />
                </div>
                <div>
                  <div class="text-sm font-semibold text-gray-900 dark:text-gray-100">网站名称</div>
                  <div class="text-xs text-gray-500 dark:text-gray-400">品牌标识</div>
                </div>
              </div>
            </td>
            <td class="px-6 py-4">
              <el-input
                v-model="oemSettings.siteName"
                maxlength="100"
                show-word-limit
                placeholder="AI Relay Service"
                clearable
                class="max-w-md"
              />
              <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                将显示在浏览器标题和页面头部
              </p>
            </td>
          </tr>

          <!-- 网站图标 -->
          <tr class="table-row">
            <td class="w-48 whitespace-nowrap px-6 py-4">
              <div class="flex items-center">
                <div
                  class="mr-3 flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-purple-500 to-purple-600"
                >
                  <i class="fas fa-image text-xs text-white" />
                </div>
                <div>
                  <div class="text-sm font-semibold text-gray-900 dark:text-gray-100">网站图标</div>
                  <div class="text-xs text-gray-500 dark:text-gray-400">Favicon</div>
                </div>
              </div>
            </td>
            <td class="px-6 py-4">
              <div class="space-y-3">
                <div
                  v-if="oemSettings.siteIconData || oemSettings.siteIcon"
                  class="inline-flex items-center gap-3 rounded-lg bg-gray-50 p-3 dark:bg-gray-700"
                >
                  <img
                    alt="图标预览"
                    class="h-8 w-8"
                    :src="oemSettings.siteIconData || oemSettings.siteIcon"
                    @error="handleIconError"
                  />
                  <span class="text-sm text-gray-600 dark:text-gray-400">当前图标</span>
                  <el-button type="danger" link @click="removeIcon"
                    ><i class="fas fa-trash mr-1" />删除</el-button
                  >
                </div>

                <el-upload
                  :auto-upload="false"
                  :show-file-list="false"
                  accept=".ico,.png,.jpg,.jpeg,.svg"
                  :on-change="onIconFileChange"
                >
                  <el-button type="success"><i class="fas fa-upload mr-2" /> 上传图标</el-button>
                  <template #tip>
                    <div class="ml-3 text-xs text-gray-500 dark:text-gray-400">
                      支持 .ico, .png, .jpg, .svg 格式，最大 350KB
                    </div>
                  </template>
                </el-upload>
              </div>
            </td>
          </tr>

          <!-- 教程链接 -->
          <tr class="table-row">
            <td class="w-48 whitespace-nowrap px-6 py-4">
              <div class="flex items-center">
                <div
                  class="mr-3 flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-green-600"
                >
                  <i class="fas fa-book-open text-xs text-white" />
                </div>
                <div>
                  <div class="text-sm font-semibold text-gray-900 dark:text-gray-100">教程链接</div>
                  <div class="text-xs text-gray-500 dark:text-gray-400">
                    用于引导用户查看使用教程
                  </div>
                </div>
              </div>
            </td>
            <td class="px-6 py-4">
              <el-input
                v-model="oemSettings.tutorialUrl"
                maxlength="1000"
                placeholder="例如：https://your-domain.com"
                clearable
                class="max-w-md"
              />
              <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                留空则默认使用当前站点地址
              </p>
            </td>
          </tr>

          <!-- 复制内容模板 -->
          <tr class="table-row">
            <td class="w-48 whitespace-nowrap px-6 py-4 align-top">
              <div class="flex items-start">
                <div
                  class="mr-3 mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600"
                >
                  <i class="fas fa-copy text-xs text-white" />
                </div>
                <div>
                  <div class="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    复制内容模板
                  </div>
                  <div class="text-xs text-gray-500 dark:text-gray-400">
                    支持占位符 {siteUrl}、{apiKey}
                  </div>
                </div>
              </div>
            </td>
            <td class="px-6 py-4">
              <el-input
                v-model="oemSettings.copyInfoTemplate"
                type="textarea"
                :rows="5"
                maxlength="2000"
                show-word-limit
                placeholder="例如：您可以通过访问 {siteUrl} 查看使用教程和查看您的使用情况。\n您的API Key是：{apiKey}"
                class="max-w-2xl"
              />
              <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                留空将使用默认文案；将 {siteUrl} 替换为教程链接（或当前站点地址），{apiKey}
                替换为用户的 API Key
              </p>
            </td>
          </tr>

          <!-- 管理后台按钮显示控制 -->
          <tr class="table-row">
            <td class="w-48 whitespace-nowrap px-6 py-4">
              <div class="flex items-center">
                <div
                  class="mr-3 flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600"
                >
                  <i class="fas fa-eye-slash text-xs text-white" />
                </div>
                <div>
                  <div class="text-sm font-semibold text-gray-900 dark:text-gray-100">管理入口</div>
                  <div class="text-xs text-gray-500 dark:text-gray-400">登录按钮显示</div>
                </div>
              </div>
            </td>
            <td class="px-6 py-4">
              <div class="flex items-center">
                <el-switch
                  v-model="hideAdminButton"
                  active-text="隐藏登录按钮"
                  inactive-text="显示登录按钮"
                />
              </div>
              <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                隐藏后，用户需要直接访问 /admin/login 页面登录
              </p>
            </td>
          </tr>

          <!-- 操作按钮 -->
          <tr>
            <td class="px-6 py-6" colspan="2">
              <div class="flex items-center justify-between">
                <div class="flex gap-3">
                  <el-button type="primary" :loading="saving" @click="save">
                    <i class="fas fa-save mr-2" /> {{ saving ? '保存中...' : '保存设置' }}
                  </el-button>
                  <el-button :disabled="saving" @click="reset">
                    <i class="fas fa-undo mr-2" /> 重置为默认
                  </el-button>
                </div>

                <div v-if="oemSettings.updatedAt" class="text-sm text-gray-500 dark:text-gray-400">
                  <i class="fas fa-clock mr-1" /> 最后更新：{{
                    formatDateTime(oemSettings.updatedAt)
                  }}
                </div>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- 移动端简化视图（保留核心项） -->
    <div class="space-y-4 sm:hidden">
      <div class="glass-card p-4">
        <div class="mb-3 flex items-center gap-3">
          <div
            class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-cyan-600 text-white shadow-md"
          >
            <i class="fas fa-tag"></i>
          </div>
          <div>
            <h3 class="text-base font-semibold text-gray-900 dark:text-gray-100">站点名称</h3>
            <p class="text-sm text-gray-500 dark:text-gray-400">自定义您的站点品牌名称</p>
          </div>
        </div>
        <input
          v-model="oemSettings.siteName"
          class="form-input w-full dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
          maxlength="100"
          placeholder="AI Relay Service"
          type="text"
        />
      </div>

      <div class="glass-card p-4">
        <div class="mb-3 flex items-center gap-3">
          <div
            class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500 to-pink-600 text-white shadow-md"
          >
            <i class="fas fa-image"></i>
          </div>
          <div>
            <h3 class="text-base font-semibold text-gray-900 dark:text-gray-100">站点图标</h3>
            <p class="text-sm text-gray-500 dark:text-gray-400">Favicon</p>
          </div>
        </div>
        <div class="space-y-3">
          <div
            v-if="oemSettings.siteIconData || oemSettings.siteIcon"
            class="inline-flex items-center gap-3 rounded-lg bg-gray-50 p-3 dark:bg-gray-700"
          >
            <img
              alt="图标预览"
              class="h-8 w-8"
              :src="oemSettings.siteIconData || oemSettings.siteIcon"
              @error="handleIconError"
            />
            <button
              class="rounded-lg px-3 py-1 font-medium text-red-600 transition-colors hover:bg-red-50 hover:text-red-900"
              @click="removeIcon"
            >
              <i class="fas fa-trash mr-1" />删除
            </button>
          </div>
          <div>
            <input
              ref="iconFileInput"
              accept=".ico,.png,.jpg,.jpeg,.svg"
              class="hidden"
              type="file"
              @change="handleIconUpload"
            />
            <button class="btn btn-success px-4 py-2" @click="iconFileInput?.click()">
              <i class="fas fa-upload mr-2" /> 上传图标
            </button>
          </div>
        </div>
      </div>

      <div class="glass-card p-4">
        <div class="flex flex-col gap-3">
          <button
            class="btn btn-primary w-full px-6 py-3"
            :class="{ 'cursor-not-allowed opacity-50': saving }"
            :disabled="saving"
            @click="save"
          >
            <div v-if="saving" class="loading-spinner mr-2"></div>
            <i v-else class="fas fa-save mr-2" /> {{ saving ? '保存中...' : '保存设置' }}
          </button>
          <button
            class="btn w-full bg-gray-100 px-6 py-3 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
            :disabled="saving"
            @click="reset"
          >
            <i class="fas fa-undo mr-2" /> 重置为默认
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useSettingsStore } from '@/stores/settings'
import { showToast } from '@/utils/toast'

const settingsStore = useSettingsStore()
const { oemSettings, saving } = storeToRefs(settingsStore)

const iconFileInput = ref()

const hideAdminButton = computed({
  get() {
    return !oemSettings.value.showAdminButton
  },
  set(value) {
    oemSettings.value.showAdminButton = !value
  }
})

const formatDateTime = settingsStore.formatDateTime

const handleIconUpload = async (file) => {
  if (!file) return
  const validation = settingsStore.validateIconFile(file)
  if (!validation.isValid) {
    validation.errors.forEach((e) => showToast(e, 'error'))
    return
  }
  try {
    const base64Data = await settingsStore.fileToBase64(file)
    oemSettings.value.siteIconData = base64Data
  } catch (error) {
    showToast('文件读取失败', 'error')
  }
}

// el-upload change 事件文件参数兼容
function onIconFileChange(uploadFile) {
  const file = uploadFile?.raw || uploadFile
  handleIconUpload(file)
}

const removeIcon = () => {
  oemSettings.value.siteIcon = ''
  oemSettings.value.siteIconData = ''
}
const handleIconError = () => {}

const save = async () => {
  try {
    const settings = {
      siteName: oemSettings.value.siteName,
      siteIcon: oemSettings.value.siteIcon,
      siteIconData: oemSettings.value.siteIconData,
      showAdminButton: oemSettings.value.showAdminButton,
      tutorialUrl: oemSettings.value.tutorialUrl,
      copyInfoTemplate: oemSettings.value.copyInfoTemplate
    }
    const result = await settingsStore.saveOemSettings(settings)
    if (result && result.success) showToast('OEM设置保存成功', 'success')
  } catch (e) {
    showToast('保存OEM设置失败', 'error')
  }
}

const reset = async () => {
  if (!confirm('确定要重置为默认设置吗？\n\n这将清除所有自定义的网站名称和图标设置。')) return
  try {
    const result = await settingsStore.resetOemSettings()
    if (result && result.success) showToast('已重置为默认设置', 'success')
  } catch (e) {
    showToast('重置失败', 'error')
  }
}

onMounted(() => {
  // 初次加载一次，避免父级处理复杂逻辑
  if (!oemSettings.value.siteName) {
    settingsStore.loadOemSettings().catch(() => {})
  }
})
</script>

<style scoped></style>
