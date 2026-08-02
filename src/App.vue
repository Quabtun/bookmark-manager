<template>
  <div class="h-screen flex flex-col bg-theme text-slate-800 dark:text-slate-100">
    <!-- 校验/预览进度条（可折叠） -->
    <div v-if="ui.batchProgress.active && !progressCollapsed" class="fixed top-12 left-64 right-0 z-[100] px-4 py-1.5 bg-white/95 dark:bg-slate-800/95 border-b border-slate-200/50 dark:border-slate-700/50 backdrop-blur shadow-sm">
      <div class="flex items-center gap-3">
        <span class="text-sm">{{ ui.batchProgress.kind === 'validate' ? '🩺' : '🖼️' }}</span>
        <span class="text-xs text-slate-600 dark:text-slate-300 font-medium">
          {{ ui.batchProgress.kind === 'validate' ? '校验书签' : '加载预览' }}
        </span>
        <span class="text-xs text-slate-400">{{ ui.batchProgress.done }}/{{ ui.batchProgress.total }}</span>
        <div class="flex-1 h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
          <div class="h-full rounded-full transition-all duration-300" 
               style="background: var(--accent-500)"
               :style="{ width: progressPercent + '%' }"></div>
        </div>
        <span class="text-xs text-slate-400">{{ progressPercent }}%</span>
        <button @click="progressCollapsed = true" class="text-xs text-slate-400 hover:text-slate-600 px-1" title="折叠">▲</button>
      </div>
    </div>
    <!-- 折叠后的迷你进度条 -->
    <div v-if="ui.batchProgress.active && progressCollapsed" @click="progressCollapsed = false"
         class="fixed top-12 left-64 z-[100] cursor-pointer px-3 py-0.5 bg-white/90 dark:bg-slate-800/90 border-b border-slate-200/50 dark:border-slate-700/50 text-xs text-slate-400 hover:text-accent">
      {{ ui.batchProgress.kind === 'validate' ? '🩺' : '🖼️' }} {{ progressPercent }}% ▼
    </div>

    <router-view />

    <!-- 全局通知 -->
    <div class="fixed bottom-5 right-5 z-50 flex flex-col gap-2">
      <transition-group name="toast">
        <div v-for="t in toasts" :key="t.id"
             class="glass shadow-glass rounded-xl px-4 py-2.5 text-sm flex items-center gap-2 min-w-[200px]">
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
    progressCollapsed.value = false  // 新校验自动展开
    if (p.done >= p.total) setTimeout(() => { ui.batchProgress.active = false }, 600)
  }))
  offs.push(window.api.on('preview:progress', (p) => {
    ui.batchProgress = { active: true, kind: 'preview', ...p }
    progressCollapsed.value = false  // 新预览自动展开
    if (p.done >= p.total) setTimeout(() => { ui.batchProgress.active = false }, 600)
  }))
})
onUnmounted(() => offs.forEach((f) => f && f()))
</script>

<style>
.toast-enter-active, .toast-leave-active { transition: all 0.3s ease; }
.toast-enter-from { opacity: 0; transform: translateX(20px); }
.toast-leave-to { opacity: 0; transform: translateX(20px); }
</style>
