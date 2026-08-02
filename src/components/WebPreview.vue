<template>
  <!-- 浮动打开按钮（面板隐藏时） -->
  <button v-if="!visible" @click="$emit('open')" 
          class="w-7 h-16 rounded-l-lg bg-accent text-white flex items-center justify-center text-xs shadow-lg hover:opacity-90 transition fixed right-0 top-1/2 -translate-y-1/2 z-40"
          title="打开预览面板">◀</button>

  <!-- 面板：用 v-show 保持webview存活，避免反复创建销毁导致卡顿 -->
  <div v-show="visible" class="border-l border-slate-200/30 dark:border-slate-700/50 flex flex-col bg-white dark:bg-slate-900 shrink-0" :style="{ width: panelWidth + 'px' }">
    <div class="flex items-center gap-1 px-2 py-1.5 border-b border-slate-200/30 dark:border-slate-700/50 bg-slate-50 dark:bg-slate-800/50">
      <button @click="goBack" class="w-6 h-6 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-xs">◀</button>
      <button @click="goForward" class="w-6 h-6 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-xs">▶</button>
      <button @click="reload" class="w-6 h-6 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-xs">↻</button>
      <span class="flex-1 text-[11px] text-slate-500 truncate px-1">{{ currentTitle || currentUrl || '未加载页面' }}</span>
      <button @click="openExternal" class="w-6 h-6 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-xs">↗</button>
      <button @click="$emit('close')" class="w-6 h-6 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-xs text-red-400">×</button>
    </div>
    <div class="flex-1 relative bg-white">
      <div v-if="loading" class="absolute inset-0 flex items-center justify-center bg-white dark:bg-slate-900 z-10">
        <div class="flex flex-col items-center gap-2 text-slate-400">
          <div class="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin"></div>
          <span class="text-xs">加载中…</span>
        </div>
      </div>
      <webview ref="webviewRef" :src="initialUrl"
               class="w-full h-full"
               sandbox="allow-scripts allow-forms allow-popups"
               @did-start-loading="loading = true"
               @did-stop-loading="loading = false"
               @page-title-updated="onTitleUpdated"
               style="display: inline-flex;"></webview>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'

const props = defineProps({ visible: Boolean, currentUrl: String, currentTitle: String, panelWidth: Number })
const emit = defineEmits(['close', 'open', 'update:currentTitle'])

const webviewRef = ref(null)
const loading = ref(false)
const initialUrl = ref('about:blank')

// 首次加载后，后续用 loadURL 切换页面（不重建webview）
watch(() => props.currentUrl, (newUrl) => {
  if (newUrl && webviewRef.value) {
    loading.value = true
    try { webviewRef.value.loadURL(newUrl) } catch {}
  } else if (newUrl && !webviewRef.value) {
    // webview 还未创建，设置初始URL
    initialUrl.value = newUrl
  }
})

function onTitleUpdated(e) { emit('update:currentTitle', e.title || '') }

function goBack() {
  try { const wv = webviewRef.value; if (wv?.canGoBack()) wv.goBack() } catch {}
}
function goForward() {
  try { const wv = webviewRef.value; if (wv?.canGoForward()) wv.goForward() } catch {}
}
function reload() {
  try { webviewRef.value?.reload() } catch {}
}
function openExternal() {
  if (props.currentUrl) window.api.invoke('browser:open', props.currentUrl)
}
</script>

<style scoped>
@keyframes spin { to { transform: rotate(360deg); } }
.animate-spin { animation: spin 0.8s linear infinite; }
</style>
