<template>
  <div class="h-screen flex flex-col bg-theme text-[var(--text-primary)]">
    <!-- 校验/预览进度条（右下角浮动卡片，可折叠） -->
    <Transition name="progress-fade">
      <!-- 展开状态 -->
      <div v-if="ui.batchProgress.active && !progressCollapsed"
           key="expanded"
           class="fixed bottom-20 right-5 z-50 w-72 glass shadow-glass rounded-xl px-4 py-3">
        <div class="flex items-center gap-2 mb-2">
          <span class="text-base">{{ ui.batchProgress.kind === 'validate' ? '🩺' : '🖼️' }}</span>
          <span class="text-sm font-medium flex-1">
            {{ ui.batchProgress.kind === 'validate' ? '校验书签' : '加载预览' }}
          </span>
          <span class="text-xs text-slate-400 tabular-nums">{{ ui.batchProgress.done }}/{{ ui.batchProgress.total }}</span>
          <button @click="progressCollapsed = true"
                  class="ml-1 w-5 h-5 flex items-center justify-center rounded text-slate-400 hover:text-slate-600 hover:bg-slate-200/50 dark:hover:bg-slate-700/50 transition-colors"
                  title="折叠">
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 6L5 3L8 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
          </button>
        </div>
        <div class="flex items-center gap-2">
          <div class="flex-1 h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
            <div class="h-full rounded-full transition-all duration-300 relative overflow-hidden"
                 style="background: var(--accent-500)"
                 :style="{ width: progressPercent + '%' }">
              <span class="absolute inset-0 shimmer-bar"></span>
            </div>
          </div>
          <span class="text-xs font-medium text-slate-500 dark:text-slate-400 tabular-nums w-8 text-right">{{ progressPercent }}%</span>
        </div>
      </div>
      <!-- 折叠状态：迷你药丸 -->
      <div v-else-if="ui.batchProgress.active && progressCollapsed"
           key="collapsed"
           @click="progressCollapsed = false"
           class="fixed bottom-20 right-5 z-50 cursor-pointer glass shadow-glass rounded-full px-3 py-1.5 flex items-center gap-1.5 hover:scale-105 transition-transform">
        <span class="text-sm">{{ ui.batchProgress.kind === 'validate' ? '🩺' : '🖼️' }}</span>
        <span class="text-xs font-medium text-slate-500 dark:text-slate-400 tabular-nums">{{ progressPercent }}%</span>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" class="text-slate-400"><path d="M2 4L5 7L8 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
      </div>
    </Transition>

    <router-view />

    <!-- 全局通知 -->
    <div class="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 flex w-[min(92vw,420px)] flex-col gap-2 md:left-auto md:right-5 md:translate-x-0 md:w-auto">
      <transition-group name="toast">
        <div v-for="t in toasts" :key="t.id"
             class="glass shadow-glass rounded-xl px-4 py-2.5 text-sm flex items-center gap-2 w-full md:min-w-[200px] md:w-auto">
          <span :class="toastIconClass(t.type)">{{ toastIcon(t.type) }}</span>
          <span>{{ t.msg }}</span>
        </div>
      </transition-group>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useSettingsStore } from './stores/settings.js'
import { useUiStore } from './stores/ui.js'

const settings = useSettingsStore()
const ui = useUiStore()
const toasts = ref([])
let toastId = 0
const progressCollapsed = ref(false)

const progressPercent = computed(() => {
  const p = ui.batchProgress
  if (!p.total) return 0
  return Math.round((p.done / p.total) * 100)
})

function toast(msg, type = 'info') {
  const id = ++toastId
  toasts.value.push({ id, msg, type })
  setTimeout(() => {
    toasts.value = toasts.value.filter((t) => t.id !== id)
  }, 2800)
}
// 在 Vue 挂载前就暴露 toast，防竞态
window.$toast = toast

function toastIcon(type) {
  return { info: 'ℹ️', success: '✅', error: '❌', warn: '⚠️' }[type] || 'ℹ️'
}
function toastIconClass(type) {
  return ''
}

let offs = []
onMounted(async () => {
  await settings.load()
  offs.push(window.api.on('bm:favicon-updated', ({ id, favicon }) => {
    // 触发 store 中对应书签 favicon 更新
    window.dispatchEvent(new CustomEvent('favicon-updated', { detail: { id, favicon } }))
  }))
  offs.push(window.api.on('validate:progress', (p) => {
    ui.batchProgress = { active: true, kind: 'validate', ...p }
    if (p.done >= p.total) setTimeout(() => { ui.batchProgress.active = false }, 600)
  }))
  offs.push(window.api.on('preview:progress', (p) => {
    ui.batchProgress = { active: true, kind: 'preview', ...p }
    if (p.done >= p.total) setTimeout(() => { ui.batchProgress.active = false }, 600)
  }))
})
onUnmounted(() => offs.forEach((f) => f && f()))
</script>

<style>
.toast-enter-active, .toast-leave-active { transition: all 0.3s ease; }
.toast-enter-from { opacity: 0; transform: translateX(20px); }
.toast-leave-to { opacity: 0; transform: translateX(20px); }

/* 进度卡片淡入淡出 */
.progress-fade-enter-active, .progress-fade-leave-active {
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}
.progress-fade-enter-from {
  opacity: 0;
  transform: translateY(10px) scale(0.95);
}
.progress-fade-leave-to {
  opacity: 0;
  transform: translateY(10px) scale(0.95);
}

/* 进度条流光效果 */
.shimmer-bar {
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent);
  animation: shimmer 1.5s infinite;
}
@keyframes shimmer {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}
</style>
