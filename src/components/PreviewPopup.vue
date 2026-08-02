<template>
  <teleport to="body">
    <transition name="pop">
      <div v-if="visible && bookmark"
           class="fixed z-[90] w-80 pointer-events-none"
           :style="{ left: pos.x + 'px', top: pos.y + 'px' }">
        <div class="glass rounded-2xl shadow-glass overflow-hidden border border-white/40 dark:border-slate-700/50">
          <!-- 预览大图 -->
          <div class="h-36 bg-slate-100 dark:bg-slate-700 relative overflow-hidden">
            <img v-if="imageDataUrl" :src="imageDataUrl" class="w-full h-full object-cover" @error="imageDataUrl = null" />
            <div v-else class="w-full h-full flex items-center justify-center text-slate-300 text-4xl">
              {{ loading ? '⏳' : '🖼️' }}
            </div>
            <span :class="['absolute top-2 right-2 w-2.5 h-2.5 rounded-full ring-2 ring-white', statusColor]"></span>
          </div>

          <div class="p-3.5">
            <div class="font-semibold text-sm line-clamp-1">{{ preview?.title || bookmark.title }}</div>
            <div class="text-xs text-slate-400 mt-0.5 line-clamp-1">{{ host }}</div>
            <p v-if="preview?.description" class="text-xs text-slate-600 dark:text-slate-300 mt-2 line-clamp-3">{{ preview.description }}</p>

            <div class="flex items-center gap-2 mt-2.5 text-[11px] text-slate-400">
              <span v-if="preview?.siteName" class="chip">{{ preview.siteName }}</span>
              <span v-if="geoText">📍 {{ geoText }}</span>
              <span class="ml-auto">{{ statusText }}</span>
            </div>
          </div>
        </div>
      </div>
    </transition>
  </teleport>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { useUiStore } from '../stores/ui.js'

const props = defineProps({
  visible: Boolean,
  bookmark: Object,
  pos: { type: Object, default: () => ({ x: 0, y: 0 }) }
})

const ui = useUiStore()
const loading = ref(false)
const preview = ref(null)
const imageDataUrl = ref(null)

const host = computed(() => {
  if (!props.bookmark) return ''
  try { return new URL(props.bookmark.url).hostname } catch { return props.bookmark.url }
})
const statusColor = computed(() => ({
  ok: 'bg-green-500', redirect: 'bg-blue-400', warn: 'bg-amber-400',
  dead: 'bg-red-500', unknown: 'bg-slate-300'
}[props.bookmark?.status || 'unknown']))
const statusText = computed(() => ({
  ok: '✅ 正常', redirect: '🔁 跳转', warn: '⚠️ 异常', dead: '💀 失效', unknown: '❓ 未检查'
}[props.bookmark?.status || 'unknown']))
const geoText = computed(() => {
  const g = props.bookmark?.geo
  if (!g || g.error) return ''
  return [g.country, g.city].filter(Boolean).join(' ')
})

watch(() => [props.visible, props.bookmark?.id], async ([vis]) => {
  if (vis && props.bookmark) {
    loading.value = true
    preview.value = null
    imageDataUrl.value = null
    // 立即尝试从缓存读取
    try {
      const entry = await ui.getPreview(props.bookmark.url)
      preview.value = entry.preview
      imageDataUrl.value = entry.imageDataUrl
      if (!entry.preview) loading.value = true  // 无缓存，显示加载中
    } catch { /* keep loading */ }
    loading.value = false
  }
}, { immediate: true })
</script>

<style scoped>
.pop-enter-active, .pop-leave-active { transition: all 0.18s ease; }
.pop-enter-from, .pop-leave-to { opacity: 0; transform: scale(0.95) translateY(4px); }
.line-clamp-1, .line-clamp-3 {
  display: -webkit-box; -webkit-box-orient: vertical; overflow: hidden;
}
.line-clamp-1 { -webkit-line-clamp: 1; }
.line-clamp-3 { -webkit-line-clamp: 3; }
</style>
