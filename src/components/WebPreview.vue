<template>
  <!-- 浮动打开按钮（仅在已有可预览页面且面板隐藏时显示） -->
  <button v-if="!visible && hasPreviewUrl" @click="$emit('open')"
          class="w-7 h-16 rounded-l-lg bg-accent text-white flex items-center justify-center text-xs shadow-lg hover:opacity-90 transition fixed right-0 top-1/2 -translate-y-1/2 z-40"
          title="打开预览面板">◀</button>

  <div v-if="visible" class="border-l border-slate-200/30 dark:border-slate-700/50 flex flex-col bg-white dark:bg-slate-900 shrink-0" :style="{ width: panelWidth + 'px' }">
    <div class="flex items-center gap-1 px-2 py-1.5 border-b border-slate-200/30 dark:border-slate-700/50 bg-slate-50 dark:bg-slate-800/50">
      <button @click="goBack" :disabled="!hasPreviewUrl" class="w-6 h-6 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-xs disabled:opacity-40">◀</button>
      <button @click="goForward" :disabled="!hasPreviewUrl" class="w-6 h-6 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-xs disabled:opacity-40">▶</button>
      <button @click="reload" :disabled="!hasPreviewUrl" class="w-6 h-6 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-xs disabled:opacity-40">↻</button>
      <span class="flex-1 text-[11px] text-slate-500 truncate px-1">{{ currentTitle || currentUrl || '未选择预览页面' }}</span>
      <button @click="openExternal" :disabled="!hasPreviewUrl" class="w-6 h-6 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-xs disabled:opacity-40">↗</button>
      <button @click="$emit('close')" class="w-6 h-6 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-xs text-red-400" title="关闭预览">×</button>
    </div>
    <div class="flex-1 relative bg-white dark:bg-slate-900 min-h-0">
      <div v-if="!hasPreviewUrl" class="absolute inset-0 flex flex-col items-center justify-center gap-3 text-slate-400">
        <span class="text-sm">请选择书签后打开预览</span>
        <button @click="$emit('close')" class="btn-ghost text-xs">关闭预览</button>
      </div>
      <template v-else>
        <div v-if="loading" class="absolute inset-0 flex items-center justify-center bg-white dark:bg-slate-900 z-10">
          <div class="flex flex-col items-center gap-2 text-slate-400">
            <div class="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin"></div>
            <span class="text-xs">加载中…</span>
          </div>
        </div>
        <div v-if="loadError" class="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-white dark:bg-slate-900 p-6 text-center">
          <span class="text-sm text-slate-500">页面无法在预览中加载</span>
          <span class="text-xs text-slate-400 break-all">{{ loadError }}</span>
          <div class="flex gap-2">
            <button @click="reload" class="btn-ghost text-xs">重试</button>
            <button @click="openExternal" class="btn-accent text-xs">在浏览器打开</button>
            <button @click="$emit('close')" class="btn-ghost text-xs">关闭</button>
          </div>
        </div>
        <webview ref="webviewRef" :key="currentUrl" :src="currentUrl"
                 class="w-full h-full"
                 sandbox="allow-scripts allow-forms allow-popups"
                 @did-start-loading="onStartLoading"
                 @did-stop-loading="onStopLoading"
                 @did-fail-load="onFailLoad"
                 @page-title-updated="onTitleUpdated"
                 style="display: inline-flex;"></webview>
      </template>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'

const props = defineProps({ visible: Boolean, currentUrl: String, currentTitle: String, panelWidth: Number })
const emit = defineEmits(['close', 'open', 'update:currentTitle'])

const webviewRef = ref(null)
const loading = ref(false)
const loadError = ref('')
const hasPreviewUrl = computed(() => {
  try {
    const url = new URL(props.currentUrl || '')
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
})

watch(() => props.currentUrl, () => {
  loadError.value = ''
  loading.value = hasPreviewUrl.value
})

function onStartLoading() {
  loadError.value = ''
  loading.value = true
}

function onStopLoading() {
  loading.value = false
}

function onFailLoad(event) {
  if (event.errorCode === -3) return
  loading.value = false
  loadError.value = event.errorDescription || '加载失败'
}

function onTitleUpdated(e) { emit('update:currentTitle', e.title || '') }

function goBack() {
  try { const wv = webviewRef.value; if (wv?.canGoBack()) wv.goBack() } catch {}
}
function goForward() {
  try { const wv = webviewRef.value; if (wv?.canGoForward()) wv.goForward() } catch {}
}
function reload() {
  if (!hasPreviewUrl.value) return
  loadError.value = ''
  loading.value = true
  try { webviewRef.value?.reload() } catch { loadError.value = '预览组件不可用' }
}
function openExternal() {
  if (hasPreviewUrl.value && window.api?.invoke) window.api.invoke('browser:open', props.currentUrl)
}
</script>

<style scoped>
@keyframes spin { to { transform: rotate(360deg); } }
.animate-spin { animation: spin 0.8s linear infinite; }
</style>
