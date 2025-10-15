<template>
  <teleport to="body">
    <div
      v-if="modelValue"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm transition-all duration-300 ease-out"
      @click="close"
      @touchmove.prevent
      @wheel.prevent
    >
      <div
        class="relative mx-4 w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl transition-all duration-300 ease-out dark:bg-gray-800"
        @click.stop
      >
        <div
          class="relative border-b border-gray-200 bg-gradient-to-r from-blue-50 to-indigo-50 px-6 py-5 dark:border-gray-700 dark:from-gray-800"
        >
          <div class="flex items-center justify-between">
            <div class="flex items-center space-x-3">
              <div
                class="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-lg"
              >
                <i class="fas fa-bell"></i>
              </div>
              <div>
                <h3 class="text-xl font-semibold text-gray-900 dark:text-white">
                  {{ editing ? '编辑' : '添加' }}通知平台
                </h3>
                <p class="mt-0.5 text-sm text-gray-600 dark:text-gray-400">
                  配置{{ editing ? '并更新' : '新的' }}Webhook通知渠道
                </p>
              </div>
            </div>
            <button
              class="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
              @click="close"
            >
              <i class="fas fa-times text-lg"></i>
            </button>
          </div>
        </div>

        <div class="p-6">
          <div class="space-y-5">
            <!-- 平台类型选择 -->
            <div>
              <label
                class="mb-2 flex items-center text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                <i class="fas fa-layer-group mr-2 text-gray-400"></i>
                平台类型
              </label>
              <div class="relative">
                <select
                  v-model="form.type"
                  class="w-full appearance-none rounded-xl border border-gray-300 bg-white px-4 py-3 pr-10 text-gray-900 shadow-sm transition-all focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                  :disabled="editing"
                >
                  <option value="wechat_work">🟢 企业微信</option>
                  <option value="dingtalk">🔵 钉钉</option>
                  <option value="feishu">🟦 飞书</option>
                  <option value="slack">🟣 Slack</option>
                  <option value="discord">🟪 Discord</option>
                  <option value="telegram">✈️ Telegram</option>
                  <option value="bark">🔔 Bark</option>
                  <option value="smtp">📧 邮件通知</option>
                  <option value="custom">⚙️ 自定义</option>
                </select>
                <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
                  <i class="fas fa-chevron-down text-gray-400"></i>
                </div>
              </div>
              <p v-if="editing" class="mt-1 text-xs text-amber-600 dark:text-amber-400">
                <i class="fas fa-info-circle mr-1"></i>
                编辑模式下不能更改平台类型
              </p>
            </div>

            <!-- 平台名称 -->
            <div>
              <label
                class="mb-2 flex items-center text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                <i class="fas fa-tag mr-2 text-gray-400"></i>
                名称
                <span class="ml-2 text-xs text-gray-500">(可选)</span>
              </label>
              <input
                v-model="form.name"
                class="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-gray-900 shadow-sm transition-all placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder:text-gray-500"
                placeholder="例如：运维群通知、开发测试群"
                type="text"
              />
            </div>

            <!-- Webhook URL (非Bark/SMTP/Telegram) -->
            <div v-if="form.type !== 'bark' && form.type !== 'smtp' && form.type !== 'telegram'">
              <label
                class="mb-2 flex items-center text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                <i class="fas fa-link mr-2 text-gray-400"></i>
                Webhook URL
                <span class="ml-1 text-xs text-red-500">*</span>
              </label>
              <div class="relative">
                <input
                  v-model="form.url"
                  class="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 pr-10 font-mono text-sm text-gray-900 shadow-sm transition-all placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder:text-gray-500"
                  placeholder="https://..."
                  type="url"
                />
                <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
                  <i class="fas fa-info-circle text-gray-300"></i>
                </div>
              </div>
              <p v-if="hint" class="mt-1 text-xs text-gray-500 dark:text-gray-400">{{ hint }}</p>
            </div>

            <!-- Telegram 字段 -->
            <div v-if="form.type === 'telegram'" class="space-y-5">
              <div>
                <label
                  class="mb-2 flex items-center text-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  <i class="fas fa-robot mr-2 text-gray-400"></i>
                  Bot Token
                  <span class="ml-1 text-xs text-red-500">*</span>
                </label>
                <input
                  v-model="form.botToken"
                  class="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 font-mono text-sm text-gray-900 shadow-sm transition-all placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder:text-gray-500"
                  placeholder="123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
                  type="text"
                />
              </div>
              <div>
                <label
                  class="mb-2 flex items-center text-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  <i class="fas fa-hashtag mr-2 text-gray-400"></i>
                  Chat ID
                  <span class="ml-1 text-xs text-red-500">*</span>
                </label>
                <input
                  v-model="form.chatId"
                  class="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 font-mono text-sm text-gray-900 shadow-sm transition-all placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder:text-gray-500"
                  placeholder="例如：-1001234567890"
                  type="text"
                />
              </div>
              <div>
                <label
                  class="mb-2 flex items-center text-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  <i class="fas fa-globe mr-2 text-gray-400"></i>
                  API 基础地址
                  <span class="ml-2 text-xs text-gray-500">(可选)</span>
                </label>
                <input
                  v-model="form.apiBaseUrl"
                  class="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 font-mono text-sm text-gray-900 shadow-sm transition-all placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder:text-gray-500"
                  placeholder="默认: https://api.telegram.org"
                  type="url"
                />
              </div>
              <div>
                <label
                  class="mb-2 flex items-center text-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  <i class="fas fa-route mr-2 text-gray-400"></i>
                  代理地址
                  <span class="ml-2 text-xs text-gray-500">(可选)</span>
                </label>
                <input
                  v-model="form.proxyUrl"
                  class="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 font-mono text-sm text-gray-900 shadow-sm transition-all placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder:text-gray-500"
                  placeholder="例如：socks5://user:pass@127.0.0.1:1080"
                  type="text"
                />
              </div>
            </div>

            <!-- Bark 字段 -->
            <div v-if="form.type === 'bark'" class="space-y-5">
              <div>
                <label
                  class="mb-2 flex items-center text-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  <i class="fas fa-key mr-2 text-gray-400"></i>
                  设备密钥 (Device Key)
                  <span class="ml-1 text-xs text-red-500">*</span>
                </label>
                <input
                  v-model="form.deviceKey"
                  class="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 font-mono text-sm text-gray-900 shadow-sm transition-all placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder:text-gray-500"
                  placeholder="aBcDeFgHiJk..."
                  type="text"
                />
              </div>
              <div>
                <label
                  class="mb-2 flex items-center text-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  <i class="fas fa-server mr-2 text-gray-400"></i>
                  服务器地址
                  <span class="ml-2 text-xs text-gray-500">(可选)</span>
                </label>
                <input
                  v-model="form.serverUrl"
                  class="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 font-mono text-sm text-gray-900 shadow-sm transition-all placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder:text-gray-500"
                  placeholder="默认: https://api.day.app/push"
                  type="url"
                />
              </div>
              <div>
                <label
                  class="mb-2 flex items-center text-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  <i class="fas fa-flag mr-2 text-gray-400"></i>
                  通知级别
                </label>
                <select
                  v-model="form.level"
                  class="bg白色 w-full appearance-none rounded-xl border border-gray-300 px-4 py-3 pr-10 text-gray-900 shadow-sm transition-all focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                >
                  <option value="">自动（根据通知类型）</option>
                  <option value="passive">被动</option>
                  <option value="active">默认</option>
                  <option value="timeSensitive">时效性</option>
                  <option value="critical">紧急</option>
                </select>
              </div>
              <div>
                <label
                  class="mb-2 flex items-center text-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  <i class="fas fa-music mr-2 text-gray-400"></i>
                  铃声
                  <span class="ml-2 text-xs text-gray-500">(可选)</span>
                </label>
                <input
                  v-model="form.sound"
                  class="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 font-mono text-sm text-gray-900 shadow-sm transition-all placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder:text-gray-500"
                  placeholder="默认系统提示音"
                  type="text"
                />
              </div>
              <div>
                <label
                  class="mb-2 flex items-center text-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  <i class="fas fa-layer-group mr-2 text-gray-400"></i>
                  分组
                  <span class="ml-2 text-xs text-gray-500">(可选)</span>
                </label>
                <input
                  v-model="form.group"
                  class="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 font-mono text-sm text-gray-900 shadow-sm transition-all placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder:text-gray-500"
                  placeholder="自定义分组名称"
                  type="text"
                />
              </div>
            </div>

            <!-- SMTP 字段 -->
            <div v-if="form.type === 'smtp'" class="space-y-5">
              <div>
                <label
                  class="mb-2 flex items-center text-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  <i class="fas fa-server mr-2 text-gray-400"></i>
                  SMTP 主机
                </label>
                <input
                  v-model="form.host"
                  class="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 font-mono text-sm text-gray-900 shadow-sm transition-all placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder:text-gray-500"
                  placeholder="smtp.example.com"
                  type="text"
                />
              </div>
              <div>
                <label
                  class="mb-2 flex items-center text-sm font-medium text-gray-700 dark:text-gray-300"
                  >端口</label
                >
                <input
                  v-model.number="form.port"
                  class="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 font-mono text-sm text-gray-900 shadow-sm transition-all placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder:text-gray-500"
                  placeholder="465/587"
                  type="number"
                />
              </div>
              <div class="flex items-center justify-between">
                <label class="flex cursor-pointer items-center">
                  <input
                    v-model="form.secure"
                    class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500 focus:ring-offset-0"
                    type="checkbox"
                  />
                  <span
                    class="ml-3 flex items-center text-sm font-medium text-gray-700 dark:text-gray-300"
                    >SSL/TLS</span
                  >
                </label>
              </div>
              <div>
                <label
                  class="mb-2 flex items-center text-sm font-medium text-gray-700 dark:text-gray-300"
                  >用户名</label
                >
                <input
                  v-model="form.user"
                  class="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 font-mono text-sm text-gray-900 shadow-sm transition-all placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder:text-gray-500"
                  type="text"
                />
              </div>
              <div>
                <label
                  class="mb-2 flex items-center text-sm font-medium text-gray-700 dark:text-gray-300"
                  >密码/授权码</label
                >
                <input
                  v-model="form.pass"
                  class="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 font-mono text-sm text-gray-900 shadow-sm transition-all placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder:text-gray-500"
                  type="password"
                />
              </div>
              <div>
                <label
                  class="mb-2 flex items-center text-sm font-medium text-gray-700 dark:text-gray-300"
                  >发件人</label
                >
                <input
                  v-model="form.from"
                  class="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 font-mono text-sm text-gray-900 shadow-sm transition-all placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder:text-gray-500"
                  placeholder="sender@example.com"
                  type="email"
                />
              </div>
              <div>
                <label
                  class="mb-2 flex items-center text-sm font-medium text-gray-700 dark:text-gray-300"
                  >收件人</label
                >
                <input
                  v-model="form.to"
                  class="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 font-mono text-sm text-gray-900 shadow-sm transition-all placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder:text-gray-500"
                  placeholder="多个用逗号分隔"
                  type="text"
                />
              </div>
              <div class="flex items-center justify-between">
                <label class="flex cursor-pointer items-center">
                  <input
                    v-model="form.ignoreTLS"
                    class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500 focus:ring-offset-0"
                    type="checkbox"
                  />
                  <span
                    class="ml-3 flex items-center text-sm font-medium text-gray-700 dark:text-gray-300"
                    >忽略TLS校验</span
                  >
                </label>
              </div>
            </div>

            <!-- DingTalk/Feishu签名 -->
            <div
              v-if="form.type === 'dingtalk' || form.type === 'feishu'"
              class="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900/50"
            >
              <div class="space-y-4">
                <div class="flex items-center justify-between">
                  <label class="flex cursor-pointer items-center">
                    <input
                      v-model="form.enableSign"
                      class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500 focus:ring-offset-0"
                      type="checkbox"
                    />
                    <span
                      class="ml-3 flex items-center text-sm font-medium text-gray-700 dark:text-gray-300"
                    >
                      <i class="fas fa-shield-alt mr-2 text-gray-400"></i>
                      启用签名验证
                    </span>
                  </label>
                  <span
                    v-if="form.enableSign"
                    class="rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-700 dark:bg-green-900/50 dark:text-green-400"
                    >已启用</span
                  >
                </div>
                <div v-if="form.enableSign">
                  <label class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
                    >签名密钥</label
                  >
                  <input
                    v-model="form.secret"
                    class="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 font-mono text-sm text-gray-900 shadow-sm transition-all placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-white dark:placeholder:text-gray-500"
                    placeholder="SEC..."
                    type="text"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div
          class="border-t border-gray-200 bg-gray-50 px-6 py-4 dark:border-gray-700 dark:bg-gray-900/50"
        >
          <div class="flex items-center justify-between">
            <button
              class="bg白色 group flex items-center rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm transition-all hover:bg-gray-50 hover:shadow-md dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
              @click="close"
            >
              <i class="fas fa-times mr-2 transition-transform group-hover:scale-110"></i>
              取消
            </button>
            <div class="space-x-3">
              <button
                class="group rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-medium text-blue-700 shadow-sm transition-all hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-900/50 dark:text-blue-300 dark:hover:bg-blue-900/70"
                :disabled="testing"
                @click="$emit('test', normalizedForm())"
              >
                <i :class="testing ? 'fas fa-spinner fa-spin mr-2' : 'fas fa-vial mr-2'" />
                {{ testing ? '测试中...' : '测试连接' }}
              </button>
              <button
                class="group rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-5 py-2.5 text-sm font-medium text-white shadow-md transition-all hover:from-blue-700 hover:to-indigo-700 hover:shadow-lg"
                @click="$emit('save', normalizedForm())"
              >
                <i class="fas fa-save mr-2"></i>
                保存
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </teleport>
</template>

<script setup>
import { computed, ref, watch, onBeforeUnmount } from 'vue'
import { getWebhookHint } from '@/views/SettingsView/config/webhookConfig'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  platform: { type: Object, default: () => ({}) },
  editing: { type: Boolean, default: false },
  testing: { type: Boolean, default: false }
})
const emit = defineEmits(['update:modelValue', 'save', 'test'])

const form = ref({})

watch(
  () => props.platform,
  (v) => {
    form.value = { ...(v || {}) }
  },
  { immediate: true }
)

const hint = computed(() => getWebhookHint(form.value.type))

function close() {
  emit('update:modelValue', false)
}

function normalizedForm() {
  const f = { ...(form.value || {}) }
  if (f.type === 'smtp' && typeof f.to === 'string') {
    f.to = f.to
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  }
  return f
}

const lockScroll = (locked) => {
  try {
    document.documentElement.style.overflow = locked ? 'hidden' : ''
    document.body.style.overflow = locked ? 'hidden' : ''
  } catch (e) {
    // ignore
  }
}

watch(
  () => props.modelValue,
  (v) => lockScroll(v),
  { immediate: true }
)

onBeforeUnmount(() => lockScroll(false))
</script>

<style scoped></style>
